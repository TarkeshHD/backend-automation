import bcrypt from 'bcryptjs';
import _ from 'lodash';
// Constants import
import { HttpStatusCode, ROLES } from '../constants.js';

import { Department } from '../models/DepartmentModel.js';
import { Domain } from '../models/DomainModel.js';
// Utils import
import BaseError from '../utils/classes/BaseError.js';
import logger from '../utils/logger.js';
import { buildDomainTree, getAdminDomainsIDs } from '../utils/utils.js';
import { createFilterQuery } from '../utils/helpers.js';
import { isValidId } from '../utils/validators/validIdCheck.js';
import { User } from '../models/UserModel.js';
import moment from 'moment-timezone';

/**
 * Registers a new domain.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the status and message.
 * @throws {BaseError} If the parent domain does not exist or there is an error in registering the new domain.
 */
export const registerDomain = async (req, res) => {
  // For now only superadmin and productadmin can add domains

  const { parentId } = req.body;

  if (parentId) {
    const parentIdExist = await Domain.findById(parentId);
    if (!parentIdExist) {
      throw new BaseError(
        'InputError',
        HttpStatusCode.BAD_REQUEST,
        'Parent domain does not exist',
      );
    }
  }

  let newDomainEntry = { name: req.body.name, parentId };

  const domainPassword = req.body.domainPassword;
  if (domainPassword) {
    const hashedPassword = await bcrypt.hash(
      domainPassword,
      await bcrypt.genSalt(10),
    );
    newDomainEntry.domainPassword = hashedPassword;
  }

  const newDomain = await Domain.createDomain(newDomainEntry);
  if (!newDomain) {
    throw new BaseError(
      'MongoError',
      HttpStatusCode.INTERNAL_SERVER,
      'Some error in registering new domain',
    );
  }

  logger.record('New domain created', {
    action: 'register',
    type: 'domain',
    domainId: newDomain._id.toString(),
    name: newDomain.name,
  });

  return res.status(HttpStatusCode.OK).json({
    message: 'Domain Created',
    details: newDomain,
  });
};

/**
 * Retrieves a domain by its ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the retrieved domain details.
 */
export const getDomain = async (req, res) => {
  const response = await Domain.findById({
    _id: req.params.id,
    archived: { $ne: true },
  });

  return res.status(HttpStatusCode.OK).json({ message: '', details: response });
};

/**
 * Retrieves the domain tree.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the retrieved domain tree.
 */
export const getDomainTree = async (req, res) => {
  let { page, limit, sort, filters } = req.query;

  const parsedFilters = createFilterQuery(filters);

  const baseQuery = {
    parentId: null,
    archived: { $ne: true },
    ...parsedFilters,
  };

  const options = {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 10,
    sort: sort ? JSON.parse(sort) : {},
    lean: true,
  };

  if (!page) {
    options.pagination = false;
  }

  let finalQuery = baseQuery;
  if (
    req?.user?.role === ROLES.SUPER_ADMIN ||
    req?.user?.role === ROLES.PRODUCT_ADMIN
  ) {
    finalQuery = baseQuery;
  } else if (req?.user?.role === ROLES.ADMIN) {
    const allAdminDomainsIDs = await getAdminDomainsIDs(req.user.domainId);
    finalQuery = {
      _id: { $in: allAdminDomainsIDs },
      ...baseQuery,
    };
  }

  const rootDomains = await Domain.paginate(finalQuery, options);
  let domainTree = await Promise.all(
    rootDomains?.docs.map((rootDomain) => buildDomainTree(rootDomain._id)),
  );

  const domains = domainTree.filter((domain) => domain !== null);
  rootDomains.docs = domains;
  return res.status(HttpStatusCode.OK).json({
    message: '',
    rootDomains,
  });
};

/**
 * Retrieves the departments of a domain.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the retrieved departments.
 * @throws {BaseError} If the domain ID does not exist.
 */
export const getDepartmentsOfDomain = async (req, res) => {
  const { domainId } = req.params;
  isValidId(domainId);

  const domainExist = await Domain.findOne({ _id: domainId });
  if (!domainExist) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Domain id does not exist',
    );
  }

  const departments = await Department.find({ domainId: domainId });
  return res.status(HttpStatusCode.OK).json({ success: true, departments });
};

/**
 * Updates a domain.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the updated domain details.
 * @throws {BaseError} If the domain ID does not exist.
 */
export const updateDomain = async (req, res) => {
  const { id: domainId } = req.params;
  isValidId(domainId);

  const domainExist = await Domain.findById(domainId);
  if (!domainExist) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Domain does not exist',
    );
  }

  const { password: domainPassword } = req.body;

  if (domainPassword) {
    const hashedPassword = await bcrypt.hash(
      domainPassword,
      await bcrypt.genSalt(10),
    );
    await Domain.updateOne(
      { _id: domainId },
      { $set: { domainPassword: hashedPassword } },
    );
  } else {
    await Domain.updateOne({ _id: domainId }, { $set: req.body });
  }

  logger.record('Domain updated', {
    action: 'update',
    type: 'domain',
    domainId: domainId,
  });
  return res
    .status(HttpStatusCode.OK)
    .json({ success: true, message: 'Domain updated' });
};

/**
 * Archives a domain.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the success status and message.
 * @throws {BaseError} If the domain ID does not exist or if the domain has departments or if the domain is already archived.
 */
export const archiveDomain = async (req, res) => {
  const { domainId } = req.params;
  isValidId(domainId);

  const domainExist = await Domain.findById(domainId);
  if (!domainExist) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Domain does not exist',
    );
  }

  // Check if any department exists in the domain
  const department = await Department.findOne({
    domainId,
    archived: { $ne: true },
  });
  if (department) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Domain has departments. Please delete them first',
    );
  }

  if (domainExist.archived) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Domain already archived',
    );
  }

  // Archive the domain
  domainExist.archived = true;

  domainExist.archivedAt = moment().toDate();
  await domainExist.save();

  logger.record('Domain deleted', {
    action: 'delete',
    type: 'department',
    domainName: domainExist.name,
  });
  return res
    .status(HttpStatusCode.OK)
    .json({ success: true, message: 'Domain archived' });
};

/**
 * Retrieves all domains based on user role and device.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @param {Function} next - The next middleware function.
 * @returns {Object} The response object with the retrieved domains.
 */
export const getAllDomain = async (req, res, next) => {
  let { page, limit, sort, filters, device } = req.query;

  const parsedFilters = createFilterQuery(filters);

  const baseQuery = {
    archived: { $ne: true },
    ...parsedFilters,
  };

  let finalQuery = baseQuery;
  // Positive check as this API is exposed to WEB for now
  if (
    req?.user?.role === ROLES.SUPER_ADMIN ||
    device ||
    req?.user?.role === ROLES.PRODUCT_ADMIN
  ) {
    finalQuery = baseQuery;
  } else if (req?.user?.role === ROLES.ADMIN) {
    const allAdminDomainsIDs = await getAdminDomainsIDs(req.user.domainId);
    finalQuery = {
      _id: { $in: allAdminDomainsIDs },
      ...baseQuery,
    };
  }

  const options = {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 10,
    sort: sort ? JSON.parse(sort) : {},
    lean: true,
  };

  if (!page) {
    options.pagination = false;
  }

  const domains = await Domain.paginate(finalQuery, options);
  const { docs, ...pageData } = domains;

  return res.status(HttpStatusCode.OK).json({
    message: '',
    details: docs,
    ...pageData,
  });
};

export const constructDomainNameIdMap = async (req) => {
  let domains = [];
  //  Find all domains according to user role
  if (
    req?.user?.role === ROLES.SUPER_ADMIN ||
    req?.user?.role === ROLES.PRODUCT_ADMIN
  ) {
    domains = await Domain.find({ archived: { $ne: true } });
  } else if (req?.user?.role === ROLES.ADMIN) {
    const allAdminDomainsIDs = await getAdminDomainsIDs(req.user.domainId);
    domains = await Domain.find({ _id: { $in: allAdminDomainsIDs } });
  }

  const domainNameIdMap = {};

  // Construct domainNameIdMap by mapping domain name to domain id
  domains.forEach((domain) => {
    domainNameIdMap[domain.name] = domain._id;
  });
  return domainNameIdMap;
};

export const getAllDomainUsers = async (req, res) => {
  const domainObj = req.user;
  const users = await User.find({
    domainId: domainObj._id,
    role: ROLES.USER,
    archived: { $ne: true },
  });

  return res.status(HttpStatusCode.OK).json({
    message: '',
    details: users,
  });
};

/**
 * Registers multiple domains.
 * @param {Object} req - The request object. -> example:
 * { domainData: [{ name: 'domain1', password: 'password1' }, { name: 'domain2',       password: 'password2' }] }
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the success status and message.
 * @throws {BaseError} If any of the domain names already exist in the database.
 */

export const registerDomainBulk = async (req, res) => {
  const { domainData } = req.body;
  // Check if any of  the domainName exist already in the database
  const domainNames = domainData.map((domain) => domain.Name);
  const existingDomains = await Domain.find({
    name: { $in: domainNames },
    archived: { $ne: true },
  });
  if (existingDomains.length > 0) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Some domains already exist',
    );
  }

  const domains = domainData.map((domain) => {
    return {
      name: domain.Name,
      domainPassword: domain.Password,
    };
  });

  const newDomains = await Domain.insertMany(domains);

  return res.status(HttpStatusCode.OK).json({
    message: 'Domains Created',
    details: newDomains,
  });
};
