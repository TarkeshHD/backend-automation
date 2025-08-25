import { User } from '../models/UserModel.js';
import { Domain } from '../models/DomainModel.js';
import { Module } from '../models/ModuleModel.js';
import { Department } from '../models/DepartmentModel.js';

import logger from '../utils/logger.js';

const changeArchivedDepartments = async () => {
  try {
    await Department.syncIndexes();
    const result = await Department.updateMany(
      { name: /^.*-.*/, archived: true },
      [
        {
          $set: {
            name: {
              $substr: [
                '$name',
                { $add: [{ $indexOfCP: ['$name', '-'] }, 1] },
                { $strLenCP: '$name' },
              ],
            },
          },
        },
      ],
    );
    logger.info(`Updated ${result.modifiedCount} documents in Departments`);
  } catch (error) {
    logger.error(`Error updating Departments:`, error);
  }
};

const changeArchivedDomains = async () => {
  try {
    await Domain.syncIndexes();
    const result = await Domain.updateMany({ name: /^.*-.*/, archived: true }, [
      {
        $set: {
          name: {
            $substr: [
              '$name',
              { $add: [{ $indexOfCP: ['$name', '-'] }, 1] },
              { $strLenCP: '$name' },
            ],
          },
        },
      },
    ]);
    logger.info(`Updated ${result.modifiedCount} documents in Domains`);
  } catch (error) {
    logger.error(`Error updating Domains:`, error);
  }
};
const changeArchivedModules = async () => {
  try {
    await Module.syncIndexes();
    const result = await Module.updateMany({ name: /^.*-.*/, archived: true }, [
      {
        $set: {
          name: {
            $substr: [
              '$name',
              { $add: [{ $indexOfCP: ['$name', '-'] }, 1] },
              { $strLenCP: '$name' },
            ],
          },
          index: {
            $substr: [
              '$index',
              { $add: [{ $indexOfCP: ['$index', '-'] }, 1] },
              { $strLenCP: '$index' },
            ],
          },
        },
      },
    ]);
    logger.info(`Updated ${result.modifiedCount} documents in Modules`);
  } catch (error) {
    logger.error(`Error updating Modules:`, error);
  }
};

const changeArchivedUserNames = async () => {
  try {
    await User.syncIndexes();
    const result = await User.updateMany(
      { username: /^.*-.*/, archived: true },
      [
        {
          $set: {
            username: {
              $substr: [
                '$username',
                { $add: [{ $indexOfCP: ['$username', '-'] }, 1] },
                { $strLenCP: '$username' },
              ],
            },
          },
        },
      ],
    );
    logger.info(`Updated ${result.modifiedCount} documents in users`);
  } catch (error) {
    logger.error(`Error updating users: `, error);
  }
};

export const archiveUserFix = async () => {
  await changeArchivedDomains();
  await changeArchivedDepartments();
  await changeArchivedModules();
  await changeArchivedUserNames();
};
