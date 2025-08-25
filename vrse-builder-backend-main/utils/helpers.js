import moment from 'moment-timezone';
import _ from 'lodash';
import mongoose from 'mongoose';

import { CONF, HttpStatusCode, ROLES } from '../constants.js';
import { Department } from '../models/DepartmentModel.js';
import { Domain } from '../models/DomainModel.js';
import { User } from '../models/UserModel.js';
import BaseError from './classes/BaseError.js';
import e from 'cors';
import { Report } from '../models/ReportModel.js';
import { Training } from '../models/TrainingModel.js';

export const getUsersByRole = async (req) => {
  let users = [];
  // Find the user based on their role
  const user = await User.findById(req.user._id).lean();
  if (!user) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'User not found',
    );
  }

  if (req.user.role === ROLES.ADMIN) {
    // Admin role, get all users from the admin domain
    if (!user.domainId) {
      return [];
    }

    users = await User.find({
      domainId: { $in: user.domainId },
      role: ROLES.USER,
      archived: { $ne: true },
      // _id: { $ne: user._id }, // Exclude the admin user by ID
    }).lean();
  } else if (req.user.role === ROLES.PRODUCT_ADMIN || CONF?.freeTrial) {
    // Product Admin, Get all users except the product admin user
    users = await User.find({
      archived: false,
      // _id: { $ne: user._id }, // Exclude the product admin user by ID
    }).lean();
  } else if (req.user.role === ROLES.SUPER_ADMIN) {
    console.log('here');
    // Super Admin, Get all users except the super admin user
    users = await User.find({
      archived: { $ne: true },
      // _id: { $ne: user._id },
      role: { $nin: [ROLES.PRODUCT_ADMIN] },
    }).lean();
  }

  return users;
};

export const getDomainUsersCount = async () => {
  const domains = await Domain.find({
    archived: { $ne: true },
  });

  const domainAnalyticsPromises = domains.map(async (domain) => {
    // Count the number of users in each domain whose role is user return the count and name of the domain
    const userCount = await User.countDocuments({
      // role: 'user', // Count all users
      domainId: domain._id,
    });

    return {
      domainName: domain.name,
      count: userCount,
    };
  });

  const domainAnalytics = await Promise.all(domainAnalyticsPromises);
  return domainAnalytics;
};

export const getDepartmentUsersCount = async (req) => {
  // Get the current domain
  const domain = await Domain.findById(req.user.domainId);
  //   Get all the departments in the current domain
  const departments = await Department.find({
    domainId: domain._id,
    archived: { $ne: true },
  });
  const domainAnalyticsPromises = departments.map(async (department) => {
    // Count the number of users in each department whose role is user return the count and name of the department
    const userCount = await User.countDocuments({
      role: 'user',
      departmentId: department._id,
    });

    return {
      departmentName: department.name,
      count: userCount,
    };
  });

  const departmentAnalytics = await Promise.all(domainAnalyticsPromises);
  return departmentAnalytics;
};

export const getPassUsers = (totalEvaluations) => {
  return totalEvaluations.filter((evaluation) => {
    if (evaluation.mode === 'mcq') {
      const passMark =
        evaluation.evaluationDump.mcqBased.length *
        (evaluation.passingCriteria.passPercentage / 100);
      if (evaluation.answers.mcqBased.score >= passMark) {
        return true;
      }
    }
    if (evaluation.mode === 'questionAction') {
      const passMark =
        evaluation.evaluationDump.questionActionBased.length *
        (evaluation.passingCriteria.passPercentage / 100);
      if (evaluation.answers.questionActionBased.score >= passMark) {
        return true;
      }
    }
    if (evaluation.mode === 'time') {
      // Check if the user has completed the evaluation within the time limit and has not made more mistakes than allowed
      if (
        evaluation.answers.timeBased.timeTaken <
          evaluation.evaluationDump.timeBased.bronzeTimeLimit &&
        evaluation?.answers?.timeBased?.mistakes?.length <=
          evaluation.passingCriteria.mistakesAllowed
      ) {
        return true;
      }
    } else if (evaluation.mode === 'jsonLifeCycle') {
      const passMark = evaluation.evaluationDump.jsonLifeCycleBased.passMark;
      if (
        evaluation.evaluationDump.jsonLifeCycleBased.totalScored >= passMark
      ) {
        return true;
      }
    }
    return false;
  });
};

export const passPercentage = (evaluations) => {
  // Total Evaluations: All the evaluations that have been completed
  const totalEvaluations = evaluations.filter(
    (evaluation) => evaluation.endTime,
  );

  const usersPassed = getPassUsers(totalEvaluations);

  const totalEvaluationCount = totalEvaluations.length;
  const passedEvaluationCount = usersPassed.length;

  if (totalEvaluationCount === 0 || passedEvaluationCount === 0) {
    // Handle the case where there are no evaluations or no passed evaluations
    return 0.0;
  }

  return ((passedEvaluationCount / totalEvaluationCount) * 100).toFixed(1);
};

export const getMonthlyEvals = async (evaluations) => {
  const totalEvaluations = evaluations.filter((evaluation) => {
    if (evaluation.endTime) {
      return true;
    }
    return false;
  });
  const currentYear = moment().year(); // Get the current year
  const months = moment.months(); // Get an array of month names
  const monthlyCounts = {};
  const passUserCounts = {};

  // Initialize monthlyCounts with 0 for each month
  months.forEach((month) => {
    monthlyCounts[month] = 0;
    passUserCounts[month] = 0;
  });

  const passUsers = getPassUsers(totalEvaluations);
  const passUserIds = passUsers.map((user) => user.userId);
  // Loop through each evaluation
  for (const evaluation of totalEvaluations) {
    const evaluationCreateTimestamp = evaluation.createdAt;
    const evaluationYear = moment(evaluationCreateTimestamp).year();

    // Check if the evaluation belongs to the current year
    if (evaluationYear === currentYear) {
      const evaluationMonth = moment(evaluationCreateTimestamp).format('MMMM');

      // Initialize or increment the count for the evaluation's month
      if (!monthlyCounts[evaluationMonth]) {
        monthlyCounts[evaluationMonth] = 1;
      } else {
        monthlyCounts[evaluationMonth]++;
      }
      // Check if the evaluation user is in passUsers
      if (passUserIds.includes(evaluation.userId)) {
        if (!passUserCounts[evaluationMonth]) {
          passUserCounts[evaluationMonth] = 1;
        } else {
          passUserCounts[evaluationMonth]++;
        }
      }
    }
  }

  // Create an array of counts in the order of the months array
  const monthlyResults = months.map((month) => {
    return monthlyCounts[month];
  });

  // Create an array of counts in the order of the months array for passUsers
  const passUserResults = months.map((month) => {
    return passUserCounts[month];
  });

  return { monthlyResults, passUserResults };
};

export const getMonthlyModuleSession = (moduleSessions) => {};

// Calculate the total evaluation time for the sets of evaluations
export const getVrSessionTime = async (userId) => {
  //  Promise.all to get evaluations and trainings

  const [evaluations, trainings] = await Promise.all([
    Report.find({ userId: userId, archived: { $ne: true } }),
    Training.find({ userId: userId, archived: { $ne: true } }),
  ]);

  let totalEvaluationSessionTime = evaluations.reduce((acc, evaluation) => {
    if (evaluation.endTime) {
      const sessionTime = evaluation.endTime - evaluation.startTime;
      return acc + sessionTime;
    }
    return acc;
  }, 0);

  // Calculate VR time from training
  let totalTrainingSessionTime = trainings.reduce((acc, training) => {
    if (training.endTime) {
      const sessionTime = training.endTime - training.startTime;
      return acc + sessionTime;
    }
    return acc;
  }, 0);

  const totalVrSessionTime =
    totalEvaluationSessionTime + totalTrainingSessionTime;

  return totalVrSessionTime;
};

// Use for randomizing the array of questions
export const randomizeArray = (array, count) => {
  const shuffledArray = array.sort(() => Math.random() - 0.5);
  return shuffledArray.slice(0, Math.min(count, array.length));
};

export const getAllUsersInDomainDepartments = async (req) => {
  // Get the current domain
  const domain = await Domain.findById(req.user.domainId);

  // Get all the departments in the current domain
  const departments = await Department.find({
    domainId: domain._id,
    archived: { $ne: true },
  });

  // Fetch all user IDs in each department
  const departmentUsersPromises = departments.map(async (department) => {
    const users = await User.find({
      departmentId: department._id,
      archived: { $ne: true },
    })
      .select('_id')
      .lean();

    return users.map((user) => user._id);
  });

  const departmentUsersArrays = await Promise.all(departmentUsersPromises);
  const allUserIds = departmentUsersArrays.flat();

  return {
    domains: [req.user.domainId],
    users: allUserIds,
  };
};

export const getAllUsersInDomain = async () => {
  const domains = await Domain.find().select('_id').lean();

  const userIdsPromises = domains.map(async (domain) => {
    // Get all user IDs in the domain
    const users = await User.find({
      // role: 'user', // Uncomment if you want to filter by role
      domainId: domain._id,
      archived: { $ne: true },
    })
      .select('_id')
      .lean();

    return users.map((user) => user._id);
  });

  const usersArrays = await Promise.all(userIdsPromises);

  // Flatten the array of arrays and filter out empty arrays
  const allUserIds = usersArrays.flat().filter((userId) => userId);

  const domainIds = domains.map((domain) => domain._id);

  return {
    domains: domainIds,
    users: allUserIds,
  };
};

export const createFilterQuery = (filters) => {
  if (_.isEmpty(filters)) return {};

  const parsedObject = JSON.parse(filters);

  if (_.isEmpty(parsedObject)) {
    return {};
  }

  const fieldMap = {
    Domain: 'domainId',
    Department: 'departmentId',
    Module: 'moduleId',
    User: 'userId.username',
    'userId.domainId.name': 'userId.domainId',
    'userId.departmentId.name': 'userId.departmentId',
    [CONF.labels.domain.singular]: 'domainId',
    [CONF.labels.department.singular]: 'departmentId',
    [CONF.labels.module.singular]: 'moduleId',
    [CONF.labels.user.singular]: 'userId.username',
    'Player Mode': 'isMultiplayer',
  };

  return parsedObject.reduce((acc, filter) => {
    const fieldName = fieldMap[filter.id] ?? filter.id;
    if (_.isEmpty(filter.value)) {
      return acc;
    }

    let operator = '$eq';
    if (Array.isArray(filter.value)) {
      operator = '$in';

      if (
        fieldName === 'moduleId' ||
        fieldName === 'userId.departmentId' ||
        fieldName === 'userId.domainId'
      ) {
        filter.value = filter.value.map(
          (id) => new mongoose.Types.ObjectId(id),
        );
      } else if (fieldName === 'isMultiplayer') {
        // Convert string values to boolean for isMultiplayer
        filter.value = filter.value.map((value) => value === 'Multiplayer');
      }
    } else {
      // Special handling for numeric fields
      if (fieldName === 'index') {
        acc[fieldName] = { $eq: Number(filter.value) };
      } else if (typeof filter.value === 'string') {
        operator = '$regex';
        acc[fieldName] = { $regex: filter.value, $options: 'i' };
      } else {
        acc[fieldName] = { $eq: filter.value };
      }
    }

    if (operator !== '$regex' && fieldName !== 'index') {
      acc[fieldName] = { [operator]: filter.value };
    }
    if (filter.id === 'Session Time') {
      acc['startTime'] = { $gte: filter.value[0] };
      if (filter.value[1]) {
        acc['endTime'] = { $lte: filter.value[1] };
      }
      delete acc['Session Time'];
    }
    return acc;
  }, {});
};
