import moment from 'moment-timezone';
import _ from 'lodash';

import { HttpStatusCode, ROLES } from '../constants.js';
import { Department } from '../models/DepartmentModel.js';
import { Domain } from '../models/DomainModel.js';
import { User } from '../models/UserModel.js';
import BaseError from '../utils/classes/BaseError.js';
import logger from '../utils/logger.js';
import { getAdminDomainsIDs } from '../utils/utils.js';
import { createFilterQuery } from '../utils/helpers.js';
import { isValidId } from '../utils/validators/validIdCheck.js';
import { updateDomainOfUsers } from './userController.js';
import { Module } from '../models/ModuleModel.js';

/**
 * Registers a new department.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the created department details.
 *
 * @throws {BaseError} If the domain id does not exist.
 */

export const registerDepartment = async (req, res) => {
  // Need any authorization for this?
  const { domainId } = req.body;

  if (domainId) {
    const domainExist = await Domain.findOne({ _id: domainId });
    if (!domainExist) {
      throw new BaseError(
        'InputError',
        HttpStatusCode.BAD_REQUEST,
        'Domain id does not exist',
      );
    }
  }

  const newDepartment = await Department.createDepartment(req.body);
  if (!newDepartment) {
    throw new BaseError(
      'MongoError',
      HttpStatusCode.INTERNAL_SERVER,
      'Some error in registering new department',
    );
  }

  // Find all modules assigned to the domain and add the new department to their access
  // Find all modules with access to this domain
  const modules = await Module.find({
    archived: { $ne: true },
  }).populate('moduleAccessId');

  // Filter modules that have access to the domain
  const domainModules = modules.filter((module) =>
    module.moduleAccessId?.domains?.some(
      (domain) => domain?.toString() === domainId,
    ),
  );

  // Update each module's access to include the new department
  for (const module of domainModules) {
    const moduleAccess = module.moduleAccessId;
    if (!moduleAccess.departments.includes(newDepartment._id)) {
      moduleAccess.departments.push(newDepartment._id);
      await moduleAccess.save();
    }
  }

  logger.record('Added new department to module access for domain', {
    action: 'update',
    type: 'moduleAccess',
    departmentId: newDepartment._id.toString(),
    domainId: domainId,
    moduleCount: domainModules.length,
  });

  logger.record('New department added', {
    action: 'register',
    type: 'department',
    departmentId: newDepartment._id.toString(),
    name: newDepartment.name,
    domainId: domainId,
  });
  return res.status(HttpStatusCode.OK).json({
    message: 'Department created successfully.',
    details: newDepartment,
  });
};
/**
 * Retrieves all departments based on the user's role and domain.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the list of departments.
 */
export const getAllDepartments = async (req, res) => {
  let { page, limit, sort, filters } = req.query;

  const parsedFilters = createFilterQuery(filters);

  const baseQuery = {
    archived: { $ne: true },
    ...parsedFilters,
  };

  let finalQuery = baseQuery;
  // Positive check as this API is exposed to WEB for now
  if (
    req?.user?.role === ROLES.SUPER_ADMIN ||
    req?.user?.role === ROLES.PRODUCT_ADMIN
  ) {
    finalQuery = baseQuery;
  } else if (req?.user?.role === ROLES.ADMIN) {
    const allAdminDomainsIDs = await getAdminDomainsIDs(req.user.domainId);
    finalQuery = {
      domainId: { $in: allAdminDomainsIDs },
      ...baseQuery,
    };
  }

  const options = {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 10,
    populate: 'domainId',
    sort: sort ? JSON.parse(sort) : { createdAt: -1 },
    lean: true,
  };

  if (!page) {
    options.pagination = false;
  }

  const departments = await Department.paginate(finalQuery, options);

  return res.status(HttpStatusCode.OK).json({
    message: '',
    departments,
  });
};

export const constructDeptNameIdMap = async (domainId) => {
  // Get the department for the domain ids
  const departments = await Department.find({ domainId: domainId });
  const deptNameIdMap = {};
  // Map the name to id and return an object
  for (let i = 0; i < departments.length; i++) {
    deptNameIdMap[departments[i].name] = departments[i]._id;
  }
  return deptNameIdMap;
};

export const getDepartmentById = async (req, res) => {
  const { departmentId } = req.params;
  isValidId(departmentId);
  const department = await Department.findOne({
    _id: departmentId,
    archived: { $ne: true },
  });
  if (!department) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Department id does not exist',
    );
  }

  return res.status(HttpStatusCode.OK).json({ success: true, department });
};

/**
 * Retrieves all users belonging to a specific department.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the list of users.
 */
export const usersOfDepartment = async (req, res) => {
  const { departmentId } = req.params;
  isValidId(departmentId);
  const users = await User.find({ departmentId });
  return res.status(HttpStatusCode.OK).json({ success: true, users });
};

/**
 * Updates a department with the given departmentId.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the success message.
 *
 * @throws {BaseError} If the department does not exist.
 */
export const updateDepartment = async (req, res) => {
  const { id: departmentId } = req.params;
  isValidId(departmentId);

  const departmentExist = await Department.findById(departmentId);
  if (!departmentExist) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Department does not exist',
    );
  }

  const domainIdFromBody = req.body.domainId;
  const currentDomainId = departmentExist.domainId.toString();
  if (domainIdFromBody !== currentDomainId) {
    // update all users under this department to the new domain
    await updateDomainOfUsers(domainIdFromBody, currentDomainId);
  }
  await Department.updateOne({ _id: departmentId }, { $set: req.body });

  logger.record('Department updated', {
    action: 'update',
    type: 'department',
    deaprtmentId: departmentId,
  });

  return res
    .status(HttpStatusCode.OK)
    .json({ success: true, message: 'Department updated' });
};

/**
 * Deletes a department with the given departmentId.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the success message.
 *
 * @throws {BaseError} If the department does not exist.
 */
export const deleteDepartment = async (req, res) => {
  const { departmentId } = req.body;
  isValidId(departmentId);

  const departmentExist = await Department.findById(departmentId);
  if (!departmentExist) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Department does not exist',
    );
  }

  logger.record('Department deleted', {
    action: 'delete',
    type: 'department',
    deaprtmentName: departmentExist.name,
    domainId: departmentExist.domainId,
  });
  const response = await Department.remove({ _id: departmentId });
  return res.status(HttpStatusCode.OK).json({ success: true, response });
};

/**
 * Archives a department.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the success message.
 *
 * @throws {BaseError} If the department does not exist.
 * @throws {BaseError} If the department has users.
 * @throws {BaseError} If the department is already archived.
 */
export const archiveDepartment = async (req, res) => {
  const { departmentId } = req.params;
  isValidId(departmentId);

  const departmentExist = await Department.findById(departmentId);
  if (!departmentExist) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Department does not exist',
    );
  }

  // Check if there are any users in the department and archive should be false
  const user = await User.findOne({
    departmentId: departmentId,
    archived: { $ne: true },
  });
  if (user) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Department has users. Please delete them first',
    );
  }

  if (departmentExist.archived) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Department already archived',
    );
  }

  // Archive the department
  departmentExist.archived = true;
  departmentExist.archivedAt = moment().toDate();

  await departmentExist.save();

  logger.record('Department archived', {
    action: 'archive',
    type: 'department',
    departmentName: departmentExist.name,
  });
  return res
    .status(HttpStatusCode.OK)
    .json({ success: true, message: 'Department archived' });
};

export const registerBulkDepartment = async (req, res) => {
  const { departmentData } = req.body;
  const domainSet = new Set();
  for (let i = 0; i < departmentData.length; i++) {
    domainSet.add(departmentData[i].Domain);
  }

  // Check if the domain exists in the database
  const domainNames = Array.from(domainSet);
  // Loop through one by one and when it fails throw an error
  for (let i = 0; i < domainNames.length; i++) {
    const domainExist = await Domain.findOne({
      name: domainNames[i],
      archived: { $ne: true },
    });
    if (!domainExist) {
      throw new BaseError(
        'InputError',
        HttpStatusCode.BAD_REQUEST,
        `Domain ${domainNames[i]} does not exist`,
      );
    }
  }

  // Make a object with DomainName and their corresponding ID
  const domainNameIdMap = {};
  for (let i = 0; i < domainNames.length; i++) {
    const domainExist = await Domain.findOne({
      name: domainNames[i],
      archived: { $ne: true },
    });
    domainNameIdMap[domainNames[i]] = domainExist._id;
  }

  // Check if department names are unique within each domain
  // Create a map of domain -> department names to check uniqueness within domains
  const domainDepartmentMap = {};

  // Populate map with department names by domain
  for (let i = 0; i < departmentData.length; i++) {
    const domainName = departmentData[i].Domain;
    const departmentName = departmentData[i].Name;

    if (!domainDepartmentMap[domainName]) {
      domainDepartmentMap[domainName] = new Set();
    }

    // Check for duplicate department names within the same domain in input data
    if (domainDepartmentMap[domainName].has(departmentName)) {
      throw new BaseError(
        'InputError',
        HttpStatusCode.BAD_REQUEST,
        `Department "${departmentName}" appears multiple times for domain "${domainName}"`,
      );
    }

    domainDepartmentMap[domainName].add(departmentName);
  }

  // Check for existing departments with the same name in each domain
  for (const domainName of Object.keys(domainDepartmentMap)) {
    const domainId = domainNameIdMap[domainName];

    // Get all department names for this domain
    const departmentNames = Array.from(domainDepartmentMap[domainName]);

    // Check if any department with this name already exists in this domain
    for (const departmentName of departmentNames) {
      const existingDepartment = await Department.findOne({
        name: departmentName,
        domainId: domainId,
        archived: { $ne: true },
      });

      if (existingDepartment) {
        throw new BaseError(
          'InputError',
          HttpStatusCode.BAD_REQUEST,
          `Department "${departmentName}" already exists in domain "${domainName}"`,
        );
      }
    }
  }

  // Create the departments
  const departments = [];
  for (let i = 0; i < departmentData.length; i++) {
    const department = new Department({
      name: departmentData[i].Name,
      domainId: domainNameIdMap[departmentData[i].Domain],
    });
    await department.save();
    departments.push(department);
  }

  // Update module access for all new departments
  // Get all domains that need to be processed
  const domainIds = Object.values(domainNameIdMap);

  // Find all modules with access to these domains
  const modules = await Module.find({
    archived: { $ne: true },
  }).populate('moduleAccessId');

  // Process each department
  for (const department of departments) {
    const domainId = department.domainId.toString();

    // Filter modules that have access to this department's domain
    const domainModules = modules.filter((module) =>
      module.moduleAccessId?.domains?.some(
        (domain) => domain?.toString() === domainId,
      ),
    );

    // Update each module's access to include the new department
    for (const module of domainModules) {
      const moduleAccess = module.moduleAccessId;
      if (!moduleAccess.departments.includes(department._id)) {
        moduleAccess.departments.push(department._id);
        await moduleAccess.save();
      }
    }

    logger.record('Added new department to module access for domain', {
      action: 'update',
      type: 'moduleAccess',
      departmentId: department._id.toString(),
      domainId: domainId,
      moduleCount: domainModules.length,
    });
  }

  return res.status(HttpStatusCode.OK).json({ success: true, departments });
};
