import { Department } from '../models/DepartmentModel.js';
import { Domain } from '../models/DomainModel.js';
import { Module } from '../models/ModuleModel.js';
import { Report } from '../models/ReportModel.js';
import { Training } from '../models/TrainingModel.js';
import { User } from '../models/UserModel.js';

export const fixArchiveFieldAcrossCollections = async () => {
  try {
    const users = await User.updateMany(
      { archived: { $exists: false } },
      { archived: false },
    );
    console.log(
      `Updated ${users.modifiedCount} users to set archived to false`,
    );

    const modules = await Module.updateMany(
      { archived: { $exists: false } },
      { archived: false },
    );
    console.log(
      `Updated ${modules.modifiedCount} modules to set archived to false`,
    );

    const departments = await Department.updateMany(
      { archived: { $exists: false } },
      { archived: false },
    );
    console.log(
      `Updated ${departments.modifiedCount} departments to set archived to false`,
    );

    const domains = await Domain.updateMany(
      { archived: { $exists: false } },
      { archived: false },
    );
    console.log(
      `Updated ${domains.modifiedCount} domains to set archived to false`,
    );

    const trainings = await Training.updateMany(
      { archived: { $exists: false } },
      { archived: false },
    );
    console.log(
      `Updated ${trainings.modifiedCount} trainings to set archived to false`,
    );

    const evaluations = await Report.updateMany(
      { archived: { $exists: false } },
      { archived: false },
    );
    console.log(
      `Updated ${evaluations.modifiedCount} evaluations to set archived to false`,
    );

    console.log('Migration completed');
  } catch (error) {
    console.error('Error during migration:', error);
  }
};
