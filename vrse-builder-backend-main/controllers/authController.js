// Constants import
import moment from 'moment-timezone';
import {
  CONF,
  HttpStatusCode,
  LOG_ACTIONS,
  ROLES,
  WEB_DOMAIN,
  PERMISSIONS,
  AUTOVRSE_GUEST_USER,
  DEMO_USER,
} from '../constants.js';
import { Department } from '../models/DepartmentModel.js';
// Models import
import { Device } from '../models/DeviceModel.js';
import { Domain } from '../models/DomainModel.js';
import { JwtBlackListModel } from '../models/JWTBlacklistModel.js';
import { Log } from '../models/LogsModel.js';
import { User } from '../models/UserModel.js';
// Utils import
import BaseError from '../utils/classes/BaseError.js';
import { otpUtils } from '../utils/classes/OTP.js';
import {
  decodeInviteToken,
  generateTokenForInvite,
} from '../utils/generateToken.js';
import logger from '../utils/logger.js';
import {
  assignModuleAccessToUser,
  getClientIp,
  searchLDAP,
} from '../utils/utils.js';
import { addDomainToDevice, addUserToDevice } from './deviceController.js';
import { verifyOtp } from './otpController.js';
import { Module } from '../models/ModuleModel.js';
import { ModuleAccess } from '../models/ModuleAccessModel.js';
import _ from 'lodash';
import { getAccessibleModulesAndProjectIds } from './moduleController.js';
import performanceTracker from '../utils/performanceLogger.js';

const validateInviteData = async (data) => {
  const expectedKeys = [
    'departmentId',
    'domainId',
    'traineeType',
    'role',
    'invitedUser',
    // While verifying jwt token invite link
    'iat',
    'exp',
  ];
  const dataKeys = Object.keys(data);

  // Check for unexpected properties
  const hasUnexpectedProps = dataKeys.some(
    (key) => !expectedKeys.includes(key),
  );
  if (hasUnexpectedProps) {
    throw new Error('Unexpected properties found in data');
  }

  const validations = [];

  // Optional validation for traineeType
  if (data.traineeType) {
    if (
      CONF.features?.traineeType?.state === 'on' &&
      !CONF.features?.traineeType?.values.includes(data.traineeType)
    ) {
      throw new Error('Invalid traineeType');
    }
  }
  // Optional validation for role, including specific logic for inviting users based on the inviter's role
  if (data.role && !Object.values(ROLES).includes(data.role)) {
    throw new Error('Invalid role');
  }

  // Validate invitedBy ( this field is mandatory and represents the user ID of the person sending the invite)
  if (!data.invitedUser) {
    throw new Error('invited User is required');
  } else {
    const inviter = data.invitedUser;
    if (!inviter) {
      throw new Error('Invalid invited user');
    }
    // Define the roles that an inviter can assign to an invited user based on the inviter's role
    const allowedRolesForInvitedUser = {
      [ROLES.PRODUCT_ADMIN]: [
        ROLES.ADMIN,
        ROLES.SUPER_ADMIN,
        ROLES.PRODUCT_ADMIN,
        ROLES.USER,
      ], // ProductAdmin can invite anyone
      [ROLES.SUPER_ADMIN]: [ROLES.ADMIN, ROLES.USER], // SuperAdmin can invite Admins and Users
      [ROLES.ADMIN]: [ROLES.USER], // Admin can only invite Users
    };

    // Determine the allowed roles for the invited user based on the role of the inviter
    const allowedRoles = allowedRolesForInvitedUser[inviter.role];

    if (!allowedRoles) {
      throw new Error(`Invalid inviter role: ${inviter.role}`);
    }

    if (data.role && !allowedRoles.includes(data.role)) {
      throw new Error(
        `Inviter with role ${inviter.role} cannot invite users with role ${data.role}`,
      );
    }
  }

  // Optional validation for departmentId
  if (data.departmentId) {
    validations.push(
      Department.findById(data.departmentId).then((department) => {
        if (!department) throw new Error('Invalid departmentId');
      }),
    );
  }

  // Optional validation for domainId
  if (data.domainId) {
    validations.push(
      Domain.findById(data.domainId).then((domain) => {
        if (!domain) throw new Error('Invalid domainId');
      }),
    );
  }

  // Execute all validations
  await Promise.all(validations);
};

const generateInviteToken = (data) => {
  const payload = {
    invitedUser: data.invitedUser._id, // invitedUser should always be included
    // conditionally add other properties if they exist
    ...(data.departmentId && { departmentId: data.departmentId }),
    ...(data.domainId && { domainId: data.domainId }),
    ...(data.traineeType && { traineeType: data.traineeType }),
    ...(data.role && { role: data.role }),
  };

  // Assuming you're using JWT for token generation
  return generateTokenForInvite(payload);
};

const createInviteLink = async (data) => {
  // Deconstruct your data object to extract needed properties
  const { departmentId, domainId, traineeType, role, invitedUser } = data;

  // Validate the incoming data for correctness and existence in the DB
  await validateInviteData({
    departmentId,
    domainId,
    traineeType,
    role,
    invitedUser,
  });

  // Generate the invite link here (Assuming JWT or some mechanism)
  const inviteToken = generateInviteToken({
    departmentId,
    domainId,
    traineeType,
    role,
    invitedUser,
  });

  return `${WEB_DOMAIN}/auth/login?invite=${inviteToken}`;
};

/**
 * Sends an invite link to a user.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the invite link.
 *
 * @throws {Error} If there are unexpected properties in the request body.
 * @throws {Error} If the traineeType is invalid.
 * @throws {Error} If the role is invalid.
 * @throws {Error} If the invitedUser is missing or invalid.
 * @throws {Error} If the departmentId is invalid.
 * @throws {Error} If the domainId is invalid.
 */
export const sendInviteLink = async (req, res) => {
  const { departmentId, domainId, traineeType, role } = req.body;

  const { user } = req;

  const inviteLink = await createInviteLink({
    departmentId,
    domainId,
    traineeType,
    role,
    invitedUser: user,
  });

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Invite Link', details: { inviteLink } });
};

/*
  method: 'POST',
  path: '/auth/generate-2fa-otp',
  description: 'sends otp to the mail of user',
  response: {
    success: 'sends message that otp has been sent to user email'
    fail: ['username does not exists', 'invalid credentials', 'password expired']
  },
  request: {
    body: { username, password }
  }
*/
export const sendOtp2FA = async (req, res) => {
  const { username, password } = req.body;

  // check if the user with the given username exists
  let user = await User.findOne({ username, archived: { $ne: true } });
  if (!user) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      message: `Username '${username}' does not exist.`,
      details: {},
    });
  }

  // check  if the given password is correct or not
  const isPasswordCorrect = await user.matchPassword(password);
  if (!isPasswordCorrect) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: `Invalid credentials`, details: {} });
  }

  // check if the user password is expired
  // if (await isPasswordExpired(user._id.toString())) {
  //   // if password is expired then send mail to reset the password.
  //   await user.resetPasswordViaEmail(resetPasswordEmailEnum.resetPassword);
  //   return res.status(HttpStatusCode.UNAUTHORISED).json({
  //     success: false,
  //     message: 'Password expired, please check registered email for guidelines',
  //   });
  // }

  // create payload to attach with otp and send otp to user mail
  const payload = { username: user.username };

  const otp = await user.send2FA(payload);

  return res.status(HttpStatusCode.OK).json({
    details: {},
    message:
      'Login using OTP sent to email... , to be removed later otp: ' + otp,
  });
};

/*
  method: 'POST',
  path: '/auth/login-2fa',
  description: 'login user using otp',
  response: {
    success: 'sends user info and token'
    fail: ['wrong otp']
  },
  request: {
    body: { username, otp }
  }
*/
export const login2FA = async (req, res) => {
  const { otp, username } = req.body;

  // verfiy if the otp is valid
  const { payload } = await otpUtils.verify(otp, 1);
  if (payload?.username !== username) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: `Wrong OTP.`, details: {} });
  }

  // get user details and generate token.
  const user = await User.findOne({ username, archived: { $ne: true } });

  const token = await user.generateJWT();

  // log action of user login using two factor auth
  logger.record('User login', {
    action: LOG_ACTIONS.LOGIN.name,
    type: LOG_ACTIONS.LOGIN.types.TWO_FACTOR,
    id: user._id,
  });

  return res.status(HttpStatusCode.OK).json({
    message: 'User logged in',
    details: {
      user: user.getUserInfo(),
      token,
    },
  });
};

/*
  method: 'POST',
  path: '/auth/login-device',
  description: 'auth used in devices that uses deviceId and user credentials to login',
  response: {
    success: 'sends user info, token and whether it is first login or not.'
    fail: ['Incorrect credentials', 
            'Invalid endpoint for the role of user', 
            'device is not registered', 
            'account is not activated', 
            'password expired']
  },
  request: {
    body: { username, password, deviceId }
  }
*/
export const loginDevice = async (req, res) => {
  const { username, password, deviceId } = req.body;
  // find the user with the received username and password
  let user = await User.findOne({ username, archived: { $ne: true } }).select(
    '+password',
  );
  // return response if no user found with the given username
  if (!user) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: `Incorrect credentials`, details: {} });
  }

  // this end point is only for User role. Other roles cann't use this.
  if (user.role !== ROLES.USER) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.FORBIDDEN,
      'Invalid endpoint for the role of user',
    );
  }

  // check if the deviceId exists or not
  const response = await Device.findOne({ deviceId });
  if (!response) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      message: `Device is not registered`,
      details: {},
    });
  }

  // check if user is activated
  if (!user.isActivated) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      details: {},
      message: `Account not activated, please check registered email id for instructions to activate this account...`,
    });
  }

  // check if given password is correct or not
  const isPasswordCorrect = await user.matchPassword(password);
  if (!isPasswordCorrect) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: `Incorrect crdentials`, details: {} });
  }

  // check if password has expired
  // if (await isPasswordExpired(user._id)) {
  //   await user.resetPasswordViaEmail(resetPasswordEmailEnum.resetPassword);
  //   return res.status(HttpStatusCode.FORBIDDEN).json({
  //     success: false,
  //     message: `Password expired, please check registered email for guidelines`,
  //   });
  // }

  // generate jwt token
  let token = await user.generateJWT();

  // check if user has logged for first time or not
  const hasLogs = await Log.findOne({
    level: 'record',
    'meta.action': LOG_ACTIONS.LOGIN.name,
    'meta.type': LOG_ACTIONS.LOGIN.types.DEVICE,
    'meta.userId': user._id.toString(),
  });

  // log the record of authentication via device
  logger.record('Device Login', {
    action: LOG_ACTIONS.LOGIN.name,
    type: LOG_ACTIONS.LOGIN.types.DEVICE,
    userId: user._id.toString(),
    deviceId: deviceId,
  });

  return res.status(200).json({
    message: 'User logged in',
    details: {
      // user: user.getUserInfo(),// what's getUserInfo()?
      user: user,
      token: token,
      firstTimeLogin: hasLogs ? false : true,
    },
  });
};

/*
  method: 'POST',
  path: '/auth/login/basic',
  description: 'auth used in for web with username and password basic',
  response: {
    success: 'sends user info, token and whether it is first login or not.'
    fail: ['Incorrect credentials', 
            'Invalid endpoint for the role of user', 
            'account is not activated', 
            'password expired']
  },
  request: {
    body: { username, password }
  }
*/
export const loginBasic = async (req, res) => {
  const { username, password } = req.body;
  console.log('username', username);
  console.log('password', password);
  // find the user with the received username and password
  let user = await User.findOne({ username, archived: { $ne: true } }).select(
    '+password',
  );
  // return response if no user found with the given username
  if (!user) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: `Incorrect credentials` });
  }

  // check if user is activated
  if (!user.isActivated) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      details: {},
      message: `Account not activated, please check registered email id for instructions to activate this account...`,
    });
  }

  // check if given password is correct or not
  const isPasswordCorrect = await user.matchPassword(password);
  if (!isPasswordCorrect) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: `Incorrect crdentials` });
  }

  // check if password has expired
  // if (await isPasswordExpired(user._id)) {
  //   await user.resetPasswordViaEmail(resetPasswordEmailEnum.resetPassword);
  //   return res.status(HttpStatusCode.FORBIDDEN).json({
  //     success: false,
  //     message: `Password expired, please check registered email for guidelines`,
  //   });
  // }

  // generate jwt token
  let token = await user.generateJWT();

  // check if user has logged for first time or not
  const hasLogs = await Log.findOne({
    level: 'record',
    'meta.action': LOG_ACTIONS.LOGIN.name,
    'meta.type': LOG_ACTIONS.LOGIN.types.BASIC,
    'meta.userId': user._id.toString(),
  });

  // log the record of authentication via device
  logger.record('Basic Login', {
    action: LOG_ACTIONS.LOGIN.name,
    type: LOG_ACTIONS.LOGIN.types.BASIC,
    userId: user._id.toString(),
  });

  return res.status(200).json({
    message: 'User logged in',
    details: {
      user: user,
      token: token,
      firstTimeLogin: hasLogs ? false : true,
      permissions: PERMISSIONS[user?.role],
    },
  });
};

// ... existing code ...

export const loginCreator = async (req, res) => {
  const { username, password } = req.body;

  // find the user with the received username and password
  let user = await User.findOne({ username, archived: { $ne: true } }).select(
    '+password',
  );

  // return response if no user found with the given username
  if (!user) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: `Incorrect credentials` });
  }

  // check if user is activated
  if (!user.isActivated) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      details: {},
      message: `Account not activated, please check registered email id for instructions to activate this account...`,
    });
  }

  // check if given password is correct or not
  const isPasswordCorrect = await user.matchPassword(password);
  if (!isPasswordCorrect) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: `Incorrect credentials` });
  }

  // generate jwt token
  let token = await user.generateJWT();

  // check if user has logged for first time or not
  const hasLogs = await Log.findOne({
    level: 'record',
    'meta.action': LOG_ACTIONS.LOGIN.name,
    'meta.type': LOG_ACTIONS.LOGIN.types.BASIC,
    'meta.userId': user._id.toString(),
  });

  // log the record of authentication
  logger.record('Creator Login', {
    action: LOG_ACTIONS.LOGIN.name,
    type: LOG_ACTIONS.LOGIN.types.BASIC,
    userId: user._id.toString(),
  });

  // Get accessible module IDs
  const { accessibleModuleIds, accessibleProjectIds } =
    await getAccessibleModulesAndProjectIds(user._id);

  return res.status(200).json({
    message: 'User logged in',
    details: {
      user: user,
      token: token,
      firstTimeLogin: hasLogs ? false : true,
      permissions: PERMISSIONS[user?.role],
      accessibleModuleIds: accessibleModuleIds,
      accessibleProjectIds,
    },
  });
};

export const loginGuest = async (req, res) => {
  const username = `guest${moment().unix()}`;
  let user = await User({
    username,
    role: ROLES.USER,
  });

  let domain = await Domain.findOne({
    name: AUTOVRSE_GUEST_USER.DOMAIN,
    archived: { $ne: true },
  });
  if (!domain) {
    const password = 'AutoVRseGuestDomainPassword';
    const newDomain = await Domain.createDomain({
      name: AUTOVRSE_GUEST_USER.DOMAIN,
      domainPassword: AUTOVRSE_GUEST_USER.DOMAIN,
    });
    domain = newDomain;
  }

  let department = await Department.findOne({
    name: AUTOVRSE_GUEST_USER.DEPARTMENT,
    domainId: domain._id,
    archived: { $ne: true },
  });
  if (!department) {
    // parent domain should be the domain created above
    const newDepartment = await Department.create({
      name: AUTOVRSE_GUEST_USER.DEPARTMENT,
      domainId: domain._id,
    });
    department = newDepartment;
  }

  user.domainId = domain._id;
  user.departmentId = department._id;

  // Give module access  MODULE_ACCESS
  const indexOfFreeModules = AUTOVRSE_GUEST_USER.MODULE_ACCESS;

  const modules = await Module.find({
    index: { $in: indexOfFreeModules },
  }).populate('moduleAccessId');

  // Assign the guest user to the selected modules
  await Promise.all(
    modules.map(async (module) => {
      const moduleAccess = module.moduleAccessId;

      if (!moduleAccess) {
        throw new Error(
          `Module access data missing for module ID ${module._id}`,
        );
      }

      const currentUsers = moduleAccess.users.map((userId) =>
        userId.toString(),
      );
      moduleAccess.users = _.union(currentUsers, [user._id.toString()]); // Add the guest user ID

      await moduleAccess.save();
    }),
  );

  await user.save();

  // generate jwt token
  let token = await user.generateJWT();

  // log the record of authentication via device
  logger.record('Guest Login', {
    action: LOG_ACTIONS.LOGIN.name,
    type: LOG_ACTIONS.LOGIN.types.GUEST,
    userId: user._id.toString(),
  });

  return res.status(200).json({
    message: 'Guest logged in',
    details: {
      user: user,
      token: token,
    },
  });
};

export const loginDemo = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'guestLogin',
    'start',
  );

  if (CONF.features.demoAccess?.state !== 'on') {
    performanceTracker.log('guestLogin', 'end', logId, logStart);
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      message: `Demo access is disabled`,
      details: {},
    });
  }

  let username = req.body.username;
  username = `${username}${moment().unix()}`;

  let domain = await Domain.findOne({
    name: DEMO_USER.DOMAIN,
    archived: { $ne: true },
  });

  if (!domain) {
    const newDomain = await Domain.createDomain({
      name: DEMO_USER.DOMAIN,
      domainPassword: DEMO_USER.DOMAIN_PASSWORD,
    });
    domain = newDomain;
    await ModuleAccess.updateMany({}, { $addToSet: { domains: domain._id } });
  }

  let department = await Department.findOne({
    name: DEMO_USER.DEPARTMENT,
    domainId: domain._id,
    archived: { $ne: true },
  });
  if (!department) {
    // parent domain should be the domain created above
    const newDepartment = await Department.create({
      name: DEMO_USER.DEPARTMENT,
      domainId: domain._id,
    });
    department = newDepartment;
  }

  const user = await User.createUser({
    username: username,
    name: username,
    role: ROLES.USER,
    domainId: domain._id,
    isDemoUser: true,
    departmentId: department._id,
  });

  // generate jwt token
  let token = await user.generateJWT();

  // log the record of authentication via device
  logger.record('Demo Login', {
    action: LOG_ACTIONS.LOGIN.name,
    type: LOG_ACTIONS.LOGIN.types.DEMO,
    userId: user._id.toString(),
  });

  performanceTracker.log('guestLogin', 'end', logId, logStart);

  return res.status(200).json({
    message: 'Demo User logged in',
    details: {
      user: user,
      token: token,
    },
  });
};

/**
 * Authenticate user via Single Sign-On (SSO).
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object containing the authentication status and user details.
 *
 * @throws {Error} - If the invite link is expired or incorrect.
 * @throws {Error} - If the invite data is invalid.
 * @throws {Error} - If the username is not found in the database.
 *
 * @example
 * // Request
 * {
 *   "email": "john@example.com",
 *   "name": "John Doe",
 *   "inviteLink": "jwt tokens here"
 * }
 *
 */
export const authSso = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'loginSso',
    'start',
  );
  let token;
  const { email: username, name, inviteLink } = req.body;

  console.log('✅ [Backend] Received Request:');
  console.log({ username, name, inviteLink });
  // find the user with the received username
  let user = await User.findOne({ username, archived: { $ne: true } });

  console.log('✅ [Backend] Found User:', user);

  const alreadySignedUp = user ? true : false;

  if (user) {
    token = await user.generateJWT();
  } else {
    if (!inviteLink && CONF?.clientName !== 'gsk') {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        success: false,
        message: `Invite Link expired/incorrect`,
        details: {},
      });
    }

    if (CONF?.clientName === 'gsk') {
      // Remove this for GSK and sign him up as Super Admin
      user = new User({
        username,
        name,
        role: ROLES.SUPER_ADMIN,
      });
      await user.save();
      token = await user.generateJWT();
    } else {
      // create user with invite link
      const values = await decodeInviteToken(inviteLink);

      const invitedUser = await User.findById(values.invitedUser);
      // Check if values are valid.
      await validateInviteData({
        ...values,
        invitedUser,
      });

      user = new User({
        username,
        name,
        ...values,
      });
      await user.save();
      token = await user.generateJWT();
    }
  }
  // check if user has logged for first time or not
  const hasLogs = await Log.findOne({
    level: 'record',
    'meta.action': LOG_ACTIONS.LOGIN.name,
    'meta.type': LOG_ACTIONS.LOGIN.types.BASIC, // change to SSO
    'meta.userId': user._id.toString(),
  });

  // log the record of authentication via device
  logger.record('Basic Login', {
    action: LOG_ACTIONS.LOGIN.name,
    type: LOG_ACTIONS.LOGIN.types.BASIC, // change to SSO
    userId: user._id.toString(),
  });

  performanceTracker.log('loginSso', 'end', logId, logStart);

  console.log('✅ [Backend] Sending Response:');
  console.log({
    message: `User successfully ${alreadySignedUp ? 'logged' : 'signed up'} in`,
    details: {
      user: user,
      token: token,
      firstTimeLogin: hasLogs ? false : true,

      permissions: PERMISSIONS[user?.role],
    },
  });

  return res.status(200).json({
    message: `User successfully ${alreadySignedUp ? 'logged' : 'signed up'} in`,
    details: {
      user: user,
      token: token,
      firstTimeLogin: hasLogs ? false : true,
      permissions: PERMISSIONS[user?.role],
    },
  });
};

/*
  method: 'POST',
  path: '/auth/loginDomain',
  description: 'log in user using user email and password of domain they belong to',
  response: {
    success: 'sends user info and token'
    fail: ['Invalid credentials', 'Domain password not set or expired']
  },
  request: {
    body: { email, domainPassword }
  }
*/
export const loginDomain = async (req, res) => {
  // need domain password, domain
  const { name, domainPassword, deviceId, macAddr } = req.body;

  const domain = await Domain.findOne({ name, archived: { $ne: true } });
  if (!domain) {
    return res.status(HttpStatusCode.FORBIDDEN).json({
      success: false,
      message: `Invalid credentials`,
      details: {},
    });
  }

  if (!domain.domainPassword) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.INTERNAL_SERVER,
      'Domain password not set or expired. Please update domain password',
    );
  }
  const isPasswordCorrect = await domain.matchPassword(domainPassword);
  if (!isPasswordCorrect) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid password',
    );
  }
  // check if device login is enabled
  if (CONF.features?.deviceLogin?.state === 'on' && deviceId) {
    const ip = getClientIp(req);

    await addDomainToDevice(deviceId, domain._id, ip, macAddr);
  }
  const token = await domain.generateJWT();

  logger.record('Domain login', {
    action: LOG_ACTIONS.LOGIN.name,
    type: LOG_ACTIONS.LOGIN.types.DOMAIN,
    domainId: domain._id.toString(),
  });

  return res.status(HttpStatusCode.OK).json({
    message: 'Domain logged in',
    details: { domain, token },
  });
};

/*
  method: 'POST',
  path: '/auth/logout',
  description: 'logs out user and mark token as blacklisted',
  response: {
    success: 'user logged out'
    fail: ['token not found']
  },
  request: {
    body: { token }
  }
*/
export const logout = async (req, res) => {
  const token = req.headers.authorization.split(' ')[1];

  if (!token) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: 'Token not found', details: {} });
  }

  await JwtBlackListModel.create({ token });

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'User logged out', details: {} });
};

/*
  method: 'POST',
  path: '/auth/login/token',
  description: 'auth used in for web with token basic',
  response: {
    success: ' and user info token and whether it is first login or not.'
    fail: ['Incorrect credentials', 
            'Invalid endpoint for the role of user', 
            'account is not activated', 
            'password expired']
  },
  request: {
    body: { username, password }
  }
*/

export const loginToken = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'loginToke',
    'start',
  );
  performanceTracker.log('loginToken', 'end', logId, logStart);
  return res.status(HttpStatusCode.OK).json({
    message: 'User logged in',
    details: {
      user: req.user,
      permissions: PERMISSIONS[req.user?.role],
    },
  });
};

/*
  method: 'POST',
  path: '/auth/login/token',
  description: 'auth used in for web with token basic',
  response: {
    success: ' and user info token and whether it is first login or not.'
    fail: ['Incorrect credentials', 
            'Invalid endpoint for the role of user', 
            'account is not activated', 
            'password expired']
  },
  request: {
    body: { username, password }
  }
*/

export const loginDomainToken = async (req, res) => {
  return res.status(HttpStatusCode.OK).json({
    message: 'Domain logged in',
    details: {
      domain: req.user,
    },
  });
};

/*
  method: 'POST',
  path: '/auth/login/token',
  description: 'auth used in for web with token basic',
  response: {
    success: ' and user info token and whether it is first login or not.'
    fail: ['Incorrect credentials', 
            'Invalid endpoint for the role of user', 
            'account is not activated', 
            'password expired']
  },
  request: {
    body: { username, password }
  }
*/

export const loginTraineeDomainToken = async (req, res) => {
  const domainObj = req.user;
  const { username, deviceId, macAddr } = req.body;

  // find the user with the received username
  let user = await User.findOne({
    username,
    domainId: domainObj._id,
    archived: { $ne: true },
  });
  // return response if no user found with the given username
  if (!user) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: `Incorrect credentials` });
  }

  // // Check if user role is trainee
  // if (user.role !== ROLES.USER) {
  //   return res.status(HttpStatusCode.BAD_REQUEST).logijson({
  //     success: false,
  //     message: `The user is not a trainee`,
  //   });
  // }

  // check if user is activated
  if (!user.isActivated) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      details: {},
      message: `Account not activated, please check registered email id for instructions to activate this account...`,
    });
  }

  // BY PASS User Password check as we have valid  domain token now!
  // check if device login is enabled
  if (CONF.features?.deviceLogin?.state === 'on' && deviceId) {
    const ip = getClientIp(req);
    await addUserToDevice(deviceId, user._id, ip, macAddr);
  }

  // generate jwt token
  let token = await user.generateJWT();

  // check if user has logged for first time or not
  const hasLogs = await Log.findOne({
    level: 'record',
    'meta.action': LOG_ACTIONS.LOGIN.name,
    'meta.type': LOG_ACTIONS.LOGIN.types.DOMAIN_TOKEN,
    'meta.userId': user._id.toString(),
  });

  // log the record of authentication via device
  logger.record('Trainee Login Domain Token', {
    action: LOG_ACTIONS.LOGIN.name,
    type: LOG_ACTIONS.LOGIN.types.DOMAIN_TOKEN,
    userId: user._id.toString(),
  });

  return res.status(200).json({
    message: 'User logged in',
    details: {
      user: user,
      token: token,
      firstTimeLogin: hasLogs ? false : true,
    },
  });
};

export const loginOtpUser = async (req, res) => {
  const { username, otp } = req.body;
  const user = await User.findOne({ username, archived: { $ne: true } });
  if (!user) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      message: `Username '${username}' does not exist.`,
    });
  }
  const isOtpValid = await verifyOtp(user, otp);
  if (!isOtpValid) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      message: `Invalid OTP`,
    });
  }

  const token = await user.generateJWT();

  return res.status(HttpStatusCode.OK).json({
    message: 'User logged in',
    details: {
      user: user,
      token: token,
    },
  });
};

// Login from external directories like Azure AD or LDAP or any other external directory
export const loginFromExternalDirectories = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'prid login',
    'start',
  );

  if (CONF?.features?.externalDirectory?.state !== 'on') {
    performanceTracker.log('prid login', 'end', logId, logStart);

    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      message: `External Directory login is not enabled`,
    });
  }
  // Check if the username is in database and exclude password
  const { username } = req.body;
  console.log('Username:', username);
  let user = await User.findOne({
    username: `${username}@astrazeneca.net`,
    archived: { $ne: true },
  }).select('-password');

  if (!user) {
    const isUsernameInLDAP = await searchLDAP(username);
    // if (isUsernameInLDAP === 'No user found') {
    //   return res.status(HttpStatusCode.BAD_REQUEST).json({
    //     success: false,
    //     message: `Username '${username}' does not exist.`,
    //   });
    // }

    if (!isUsernameInLDAP || isUsernameInLDAP.length === 0) {
      performanceTracker.log('pridLogin', 'end', logId, logStart);
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        success: false,
        message: `Username '${username}' does not exist.`,
      });
    }
    // Create user in database if not exists
    const newUser = new User({
      username: `${username}@astrazeneca.net`,
      role: ROLES.USER,
    });

    // Also check the domain from that ldaap value and check if the domain exist, if not add the department
    // Extract domain and department from LDAP attributes
    const ldapEntry = isUsernameInLDAP[0]; // Assuming the response is an array
    const dn = ldapEntry.dn || '';
    const domain = dn.match(/DC=([^,]+)/)?.[1]; // Extract the first DC value
    const department = ldapEntry.department || '';

    // Check if domain exists
    let domainDb = await Domain.findOne({
      name: domain,
      archived: { $ne: true },
    });
    if (!domainDb) {
      domainDb = new Domain({
        name: isUsernameInLDAP.domain,
        domainPassword: 'defaultPassword',
      });
      await domainDb.save();
    }

    // Check if department exists
    let departmentDb = await Department.findOne({
      name: department,
      domainId: domainDb._id,
      archived: { $ne: true },
    });

    if (!departmentDb) {
      departmentDb = new Department({
        name: department,
        domainId: domainDb._id,
      });
      await departmentDb.save();
    }

    // Assign the user to the department
    newUser.departmentId = departmentDb._id;
    newUser.domainId = domainDb._id;

    await newUser.save();
    user = newUser;
  }
  //  Assign all modules to the user
  const allModules = await Module.find({ archived: { $ne: true } }).populate(
    'moduleAccessId',
  );
  await assignModuleAccessToUser(user._id, allModules);

  const token = await user.generateJWT();
  // LDAP Format for login currently

  performanceTracker.log('pridLogin', 'end', logId, logStart);
  return res.status(HttpStatusCode.OK).json({
    message: 'User logged in',
    details: {
      user: {
        username: user.username,
        role: user.role,
        departmentId: user.departmentId,
        domainId: user.domainId,
        _id: user._id,
      },
      token,
    },
  });
};
