import bcrypt from 'bcryptjs';
import _ from 'lodash';
import { ROLES, AUTOVRSE_USER } from '../constants.js';
import { User } from '../models/UserModel.js';
import logger from '../utils/logger.js';
import { Domain } from '../models/DomainModel.js';
import { Department } from '../models/DepartmentModel.js';
import { ModuleAccess } from '../models/ModuleAccessModel.js';
import performanceTracker from '../utils/performanceLogger.js';

export const createAutovrseTrainee = async () => {
  try {
    const { id: logId, time: logStart } = performanceTracker.log(
      'createTrainee',
      'start',
    );
    const [autovrseDomain, autovrseDepartment] = await Promise.all([
      Domain.findOne({
        name: AUTOVRSE_USER?.DOMAIN_USERNAME,
        archived: { $ne: true },
      }),
      Department.findOne({
        name: AUTOVRSE_USER?.DEPARTMENT_NAME,
        archived: { $ne: true },
      }),
    ]);

    if (!_.isEmpty(autovrseDomain) && !_.isEmpty(autovrseDepartment)) {
      logger.info('Autovrse domain and department are available');
      const autovrseTrainee = await User.findOne({
        domainId: autovrseDomain._id,
        departmentId: autovrseDepartment._id,
        role: ROLES.USER,
        archived: { $ne: true },
      });

      if (!_.isEmpty(autovrseTrainee)) {
        performanceTracker.log('createTrainee', 'end', logId, logStart);
        logger.info('Autovrse trainee is available');
        return;
      }
    }

    // Create autovrse Domain and Department
    const hashedPassword = await bcrypt.hash(
      AUTOVRSE_USER?.DOMAIN_PASSWORD,
      await bcrypt.genSalt(10),
    );

    const newAutovrseDomain = await Domain.findOneAndUpdate(
      { name: AUTOVRSE_USER?.DOMAIN_USERNAME, archived: { $ne: true } },
      { name: AUTOVRSE_USER?.DOMAIN_USERNAME, domainPassword: hashedPassword },
      { new: true, upsert: true },
    );
    const newAutovrseDepartment = await Department.findOneAndUpdate(
      { name: AUTOVRSE_USER?.DEPARTMENT_NAME, archived: { $ne: true } },
      { name: AUTOVRSE_USER?.DEPARTMENT_NAME, domainId: newAutovrseDomain._id },
      { new: true, upsert: true },
    );

    // Create autovrse trainee
    const hashedTraineePassword = await bcrypt.hash(
      AUTOVRSE_USER?.TRAINEE_PASSWORD,
      await bcrypt.genSalt(10),
    );
    const autovrseTrainee = await User.createUser({
      name: AUTOVRSE_USER?.TRAINEE_NAME,
      username: AUTOVRSE_USER?.TRAINEE_USERNAME,
      email: AUTOVRSE_USER?.TRAINEE_EMAIL,
      password: hashedTraineePassword,
      role: ROLES.USER,
      isActivated: true,
      domainId: newAutovrseDomain._id,
      departmentId: newAutovrseDepartment._id,
    });

    logger.info('Autovrse trainee created successfully');

    // Update all modulesaccess documents with autovrse trainee id
    await ModuleAccess.updateMany(
      {},
      { $addToSet: { users: autovrseTrainee._id } },
    );
    logger.info('All modulesaccess documents updated with autovrse trainee id');
    performanceTracker.log('createTrainee', 'end', logId, logStart);
  } catch (err) {
    logger.error('Error creating autovrse trainee', err);
  }
};
