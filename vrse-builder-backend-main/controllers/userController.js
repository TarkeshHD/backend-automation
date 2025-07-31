import bcrypt from 'bcryptjs';
import moment from 'moment-timezone';
import _ from 'lodash';

import { CONF, HttpStatusCode, ROLES } from '../constants.js';
import { User } from '../models/UserModel.js';
import BaseError from '../utils/classes/BaseError.js';
import logger from '../utils/logger.js';
import {
  assignModuleAccessToUser,
  delay,
  getAdminDomainsIDs,
  isValidEmail,
  sendEmailForVRUser,
  sendOtpForUser,
  sendUpgradeRequestConfirmationToUser,
  sendUpgradeRequestNotificationToSupport,
} from '../utils/utils.js';
import { createFilterQuery } from '../utils/helpers.js';
import { isValidId } from '../utils/validators/validIdCheck.js';
import { constructDeptNameIdMap } from './departmentController.js';
import { constructDomainNameIdMap } from './domainController.js';
import { ModuleAccess } from '../models/ModuleAccessModel.js';
import { Domain } from '../models/DomainModel.js';
import { Report } from '../models/ReportModel.js';
import { generateUniqueOTP } from './otpController.js';
import { Module } from '../models/ModuleModel.js';
import performanceTracker from '../utils/performanceLogger.js';

/**
 * Registers a new user.
 *
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object containing the status code, message, and details of the newly registered user.
 * @throws {BaseError} If the user role is not allowed to create the specified role.
 * @throws {Error} If there is an error in hashing the password.
 */
export const registerUser = async (req, res) => {
  let newEntry = req.body;
  let newUser;

  // Product Admin -> Any User
  // SuperAdmin -> Create Admin & Trainee
  // Admin -> Create Trainee

  if (
    (req?.user?.role === ROLES.ADMIN && newEntry.role !== ROLES.USER) ||
    (req?.user?.role === ROLES.SUPER_ADMIN &&
      newEntry.role === ROLES.PRODUCT_ADMIN)
  ) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      `You cannot create user with role ${newEntry.role}`,
    );
  }
  // What about password?

  if (newEntry.role === ROLES.USER) {
    req.body.password = `${req.body.username}123`;
  }
  const password = req.body.password;
  if (password) {
    const hashedPassword = await bcrypt.hash(
      password,
      await bcrypt.genSalt(10),
    );
    newEntry.password = hashedPassword;
  }

  newUser = await User.createUser(newEntry);

  return res.status(201).json({
    message: `User added - ${newUser.role}`,
    details: newUser,
  });
};

/**
 * Register multiple users in bulk.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object containing the message and details of the newly added users.
 *
 * @throws {BaseError} - If the domain or department is incorrect for any user.
 * @throws {BaseError} - If the trainee type is not found or incorrect for any user.
 */
export const registerUserBulk = async (req, res) => {
  const { userData } = req.body;
  // Step 1: Get list of all domains of the user with object id
  const allowedDomains = await constructDomainNameIdMap(req);

  const allowedDept = {};
  // Step 2: Get all allowed departments matched to the domain name
  await Promise.all(
    Object.keys(allowedDomains).map(async (domainName) => {
      const deptValues = await constructDeptNameIdMap(
        allowedDomains[domainName],
      );
      allowedDept[domainName] = deptValues;
    }),
  );

  // using native mongodb driver functions (bulk operation) to reduce the latency of this bulk upload process.
  // mongoose schema restrictions won't be applied and needs to be ensured through code for bulk upload

  let bulkOp = User.collection.initializeUnorderedBulkOp();

  const existingUsernames = new Set(
    await User.distinct('username', {
      username: {
        $in: userData.map((user) => user['Employee Code']),
      },
      archived: { $ne: true },
    }),
  );

  const usernameSet = new Set();
  const employeeCodeSet = new Set();

  const formatUser = async (row, index, domains, departments) => {
    let error = '';
    if (existingUsernames.has(row['Employee Code'])) {
      error = `User with username/Employee Code "${
        row['Employee Code']
      }" already exists at row ${index + 2}`;
    }

    if (usernameSet.has(row['Employee Code'])) {
      error = `Duplicate username/Employee Code "${
        row['Employee Code']
      }" in the uploaded data at row ${index + 2}`;
    }

    usernameSet.add(row['Employee Code']);
    employeeCodeSet.add(row['Employee Code']);

    const domainId = domains[row?.Domain];
    const deptId = departments[row?.Domain]?.[row?.Department];

    if (!domainId) {
      error = `Domain incorrect for user "${row?.Name}" at row ${index + 2}`;
    }

    if (!deptId) {
      error = `Department incorrect for user "${row?.Name}" at row ${
        index + 2
      }`;
    }

    // Validate trainee type if needed
    if (CONF.features?.traineeType?.state === 'on' && !row['Trainee Type']) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        message: `Trainee Type not found for user "${row?.Name}" at row ${
          index + 2
        }`,
      });
    }

    if (
      CONF.features?.traineeType?.state === 'on' &&
      !CONF.features?.traineeType?.values.includes(row['Trainee Type'])
    ) {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        message: `Trainee Type incorrect for user "${row?.Name}" at row ${
          index + 2
        }`,
      });
    }

    if (error) {
      return {
        isError: true,
        error,
      };
    }

    return {
      name: String(row?.Name),
      username: String(row['Employee Code']),
      password: 'temp',
      role: ROLES.USER,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActivated: true,
      domainId,
      departmentId: deptId,
      traineeType:
        CONF.features?.traineeType?.state === 'on'
          ? row['Trainee Type']
          : undefined,
    };
  };

  for (let i = 0; i < userData.length; i++) {
    const formattedUser = await formatUser(
      userData[i],
      i,
      allowedDomains,
      allowedDept,
    );

    if (formattedUser?.isError) {
      return res.status(400).json({
        message: formattedUser.error,
      });
    }

    if (formattedUser) {
      bulkOp.insert(formattedUser);
    }
  }

  // Execute remaining batch
  if (bulkOp.length > 0) {
    logger.info('Executing bulk operation');
    await bulkOp.execute();
  }

  return res.status(201).json({
    message: 'Users registered successfully',
  });
};
/**
 * Updates a user's information.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The updated user object.
 * @throws {BaseError} - If the user is not found or the requester is not allowed to update the user.
 */
export const updateUser = async (req, res) => {
  let newEntry = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.NOT_FOUND,
      `User not found`,
    );
  }

  // What about password?
  // Get the old password, if it is the user, if not then hash the new password
  console.log('hgey', req.body.password);

  const password = req.body.password;
  if (password) {
    const hashedPassword = await bcrypt.hash(
      password,
      await bcrypt.genSalt(10),
    );
    user.password = hashedPassword;
  }

  // Check if the new username is available (if it is being updated)
  if (newEntry.username && newEntry.username !== user.username) {
    const isUsernameAvailable = await User.checkUsernameAvailable(
      newEntry.username,
    );
    if (!isUsernameAvailable) {
      throw new BaseError(
        'InputError',
        HttpStatusCode.BAD_REQUEST,
        `Username '${newEntry.username}' is already taken.`,
      );
    }
  }

  // Update fields -> but not the password
  Object.keys(newEntry).map((e) => {
    if (e !== 'password' && e !== 'vr') {
      user[e] = newEntry[e];
      return e;
    }
  });

  if (newEntry?.vr) {
    // Step 1: Generate a simple password
    const username = user.username;
    if (!isValidEmail(username)) {
      throw new BaseError(
        'InputError',
        HttpStatusCode.BAD_REQUEST,
        `Invalid email address: ${username}`,
      );
    }

    let password = newEntry.password;
    if (!password) {
      const simplePassword = `${username.slice(0, 2)}${Math.floor(
        Math.random() * 90 + 10,
      )}`;
      const hashedPassword = await bcrypt.hash(
        simplePassword,
        await bcrypt.genSalt(10),
      );
      user.password = hashedPassword;
      password = simplePassword;
    }
    // Step 2: Assign all modules to the user
    const allModules = await Module.find({ archived: { $ne: true } }).populate(
      'moduleAccessId',
    );
    console.log('All modules:', allModules);
    await assignModuleAccessToUser(user._id, allModules);

    // Step 3: Send email with password
    await sendEmailForVRUser(username, user.name, password);

    console.log(
      `Assigned all modules to user ${user.username} and sent email.`,
    );
  }

  console.log('user', user);
  await user.save();
  let token = await user.generateJWT();

  return res.status(201).json({
    message: `User edited`,
    details: user,
    token,
  });
};

/**
 * Edit a user's data.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with success status and message.
 * @throws {BaseError} If the user id does not exist.
 */
export const editUser = async (req, res) => {
  const newEntry = req.body;
  delete newEntry.password;
  const { id } = req.params;
  const userExists = await User.findById(id);
  if (!userExists)
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_GATEWAY,
      'User id does not exist',
    );
  await User.findOneAndUpdate({ _id: id }, newEntry);
  return res
    .status(HttpStatusCode.OK)
    .json({ success: true, message: 'Successfully updated user data' });
};

export const getUserByID = async (req, res) => {
  const userId = req.params.id;
  isValidId(userId);

  const user = await User.find({
    _id: { $in: userId },
    archived: { $ne: true },
  }).select('-password');

  if (!user) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Unable to find user',
    );
  }

  return res.status(200).json({
    success: true,
    // user: user.getUserInfo(), // what's getUserInfo()?
    user,
  });
};

/**
 * Fetches all users based on the user's role.
 *
 * If the user is a superadmin, it returns all users including trainee admins.
 * If the user is an admin, it returns only the users within their domain.
 * If the user is a product admin, it returns all users except themselves.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object with the fetched users.
 * @throws {BaseError} - If there is an error fetching the users.
 */
export const getAllUsers = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'fetching all users',
    'start',
  );

  // 1. Based on user role fetch all users
  // If user => superadmin -> Send All users data including trainee admin everything
  // If user => admin -> Send only his domain users
  // Make sure to remove your user object
  let { page, limit, sort, filters, search } = req.query;

  const parsedFilters = createFilterQuery(filters);
  const parsedSearch = createSearchQuery(search);

  // Base query to exclude archived users
  const baseQuery = {
    archived: { $ne: true },
    ...parsedFilters,
    ...parsedSearch,
  };

  // Get users based on role
  const users = await getUsersByRole(req.user, baseQuery, {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: sort ? JSON.parse(sort) : { createdAt: -1 },
    isTraineeTypeOn: CONF.features?.traineeType?.state === 'on',
    pagination: !page ? false : true,
  });

  performanceTracker.log('fetching all users', 'end', logId, logStart);

  return res.status(200).json({
    message: 'Users fetched successfully.',
    users,
  });
};

const createSearchQuery = (search) => {
  return search ? { name: { $regex: search, $options: 'i' } } : {};
};

const getUsersByRole = async (user, baseQuery, options) => {
  const { page, limit, sort, isTraineeTypeOn, pagination } = options;
  const selectOptions = !isTraineeTypeOn
    ? '-traineeType -password'
    : '-password';
  const commonOptions = {
    populate: [
      { path: 'domainId', select: 'name' },
      { path: 'departmentId', select: 'name' },
    ],
    lean: true,
    select: selectOptions,
    sort,
    page,
    limit,
    pagination,
  };

  let finalQuery = {};

  switch (user?.role) {
    case ROLES.ADMIN:
      const allAdminDomainsIDs = await getAdminDomainsIDs(user.domainId);
      finalQuery = {
        ...baseQuery,
        $and: [{ domainId: { $in: allAdminDomainsIDs } }, { role: ROLES.USER }],
        _id: { $ne: user._id },
      };
      break;
    case ROLES.SUPER_ADMIN:
      const rolesToExclude = [ROLES.SUPER_ADMIN, ROLES.PRODUCT_ADMIN];
      finalQuery = {
        ...baseQuery,
        role: { $nin: rolesToExclude },
      };
      break;
    default:
      finalQuery = baseQuery;
  }

  return await User.paginate(finalQuery, commonOptions);
};

/**
 * Retrieves the user information from the request object and returns it as a JSON response.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The user information as a JSON response.
 * @throws {Object} - If the token is invalid, returns a JSON response with success set to false and a message indicating the invalid token.
 */
export const authToken = async (req, res) => {
  try {
    return res.status(200).json({
      user: req.user,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'invalid Token',
    });
  }
};

/**
 * Deletes a user by their ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with success message.
 * @throws {BaseError} If unable to delete the user.
 */
export const delteUserById = async (req, res) => {
  let { userId } = req.params;
  isValidId(userId);
  const response = await User.deleteOne({ _id: userId });
  if (response.deletedCount < 1) {
    throw new BaseError(
      'MongoError',
      HttpStatusCode.INTERNAL_SERVER,
      'Unable to delete',
    );
  }

  return res.status(200).json({
    success: true,
    message: 'User deleted',
  });
};

/**
 * Validates a user by their ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware function.
 * @returns {Promise<void>} - A promise that resolves when the validation is complete.
 * @throws {Error} - If the user is not found.
 */
export const validateUserByID = async (req, res, next) => {
  req.app.locals.user = await User.findById(req.params.userId);
  if (req.app.locals.user === null) {
    throw error;
  } else {
    next();
  }
};

// verified
/**
 * Resets the password for a user.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with a success message.
 * @throws {BaseError} If the user credentials are invalid.
 */
export const resetPassword = async (req, res) => {
  const { password, newPassword } = req.body;
  const { id } = req.params;
  isValidId(id);

  const user = await User.findById(id).select('+password');
  if (!user)
    throw new BaseError(
      'InpurError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid credentials',
    );

  const valid = await user.matchPassword(password);
  console.log(valid);
  if (!valid)
    throw new BaseError(
      'InpurError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid credentials',
    );

  await User.findByIdAndUpdate(id, { password: newPassword });
  logger.record('Update', {
    action: 'update',
    type: 'password_reset',
    userId: id,
  });
  return res.json({
    success: true,
    message: 'Password changed successfully',
  });
};

/**
 * Sends a password reset email to the user with the provided username.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object with a success message.
 * @throws {BaseError} - If the user with the provided username does not exist.
 */
export const forgotPassword = async (req, res) => {
  const { username } = req.body;
  const user = await User.findOne({ username, archived: { $ne: true } });

  if (!user) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      `User ${username} does not exist`,
    );
  }

  await user.resetPasswordViaEmail();

  res.json({
    success: true,
    message: 'Please check registered email for instructions',
  });
};

/**
 * Archives a user by setting the 'archived' property to true.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Object} session - The session object.
 * @returns {Object} - The response object with success message and details.
 * @throws {BaseError} - If the user is not found, or if the user is not allowed to be archived, or if the user is already archived.
 */
export const archiveUser = async (req, res, session) => {
  const { userId } = req.params;
  isValidId(userId);

  const user = await User.findById(userId);
  // .session(session);
  if (!user) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'User not found',
    );
  }

  //  SuperAdmin, ProductAdmin -> Archive Admin & Trainee
  // Admin -> Archive Trainee
  if (
    user.role === ROLES.PRODUCT_ADMIN ||
    (req.user.role === ROLES.SUPER_ADMIN && user.role === ROLES.SUPER_ADMIN) ||
    (req.user.role === ROLES.ADMIN &&
      (user.role === ROLES.ADMIN || user.role === ROLES.SUPER_ADMIN))
  ) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Not allowed to archive this user',
    );
  }

  if (user.archived) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'User already archived',
    );
  }

  user.archived = true;
  user.archivedAt = moment().toDate();
  await user.save();

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'User archived',
    details: '',
  });
};
export const updateDomainOfUsers = async (updateDomainId, currentDomainId) => {
  // Find and modify all users with domain ID to new domain ID, role is user and archived is false
  await User.updateMany(
    { domainId: currentDomainId, role: ROLES.USER, archived: false },
    { domainId: updateDomainId },
  );
};

export const generateOtpForUser = async (req, res) => {
  const user = req.user;

  const userId = user.id || user._id;
  const otp = await generateUniqueOTP(userId);

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'OTP generated successfully',
    details: {
      otp: otp.otp,
      expiryTime: otp.expiryTime,
    },
  });
};

export const generateOtpForVrUser = async (req, res) => {
  const { username } = req.params;

  const user = await User.findOne({ username, archived: { $ne: true } });
  if (!user) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'User not found',
    );
  }
  const otp = await generateUniqueOTP(user.id);
  // Send email to user with OTP
  await sendOtpForUser(user, otp);
  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'OTP generated successfully',
  });
};

export const accountUpgradeRequest = async (req, res) => {
  const user = req.user;

  console.log('Reached here');
  console.log(user);
  const userId = user.id || user._id;
  await User.findByIdAndUpdate(userId, { hasRequestedAccountUpgrade: true });
  await sendUpgradeRequestConfirmationToUser(user);
  await sendUpgradeRequestNotificationToSupport(user);

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Account upgrade requested successfully',
  });
};
