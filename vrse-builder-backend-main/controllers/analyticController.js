import moment from 'moment-timezone';
import _ from 'lodash';
import { CONF, HttpStatusCode, ROLES } from '../constants.js';
import { Report } from '../models/ReportModel.js';
import {
  getDepartmentUsersCount,
  getDomainUsersCount,
  getMonthlyEvals,
  getMonthlyModuleSession,
  getUsersByRole,
  getPassUsers,
  passPercentage,
} from '../utils/helpers.js';
import { Training } from '../models/TrainingModel.js';
import { Department } from '../models/DepartmentModel.js';
import { User } from '../models/UserModel.js';
import { Module } from '../models/ModuleModel.js';
import { JsonLifeCycle } from '../models/JsonLifeCycleModel.js';
import { Device } from '../models/DeviceModel.js';
import performanceTracker from '../utils/performanceLogger.js';
import { Domain } from '../models/DomainModel.js';
import { ModuleAccess } from '../models/ModuleAccessModel.js';

// Get top 3 users who attended the most modules
const getUsersRankModules = async (userIds, trainings) => {
  const rankings = await Training.aggregate([
    {
      // Filter sessions that have an endTime and userId belongs to userIds
      $match: { endTime: { $exists: true }, userId: { $in: userIds } },
    },
    {
      // Populate module field to remove all the archived moduels
      $lookup: {
        from: 'modules', // Ensure this is the correct name of your modules collection
        localField: 'moduleId',
        foreignField: '_id',
        as: 'moduleDetails',
      },
    },
    {
      // Destructure the populated moduleDetails for filtering
      $unwind: '$moduleDetails',
    },
    {
      // Filter out archived modules
      $match: { 'moduleDetails.archived': false },
    },
    {
      $project: {
        // Select fields to include in the result
        userId: 1,
        moduleId: 1,
        moduleDetails: 1,
      },
    },
    {
      // Group by userId and give arrays of moduleNames
      $group: {
        _id: '$userId',
        modulename: { $addToSet: '$moduleDetails.name' },
        count: { $sum: 1 },
      },
    },
    {
      // Sort by count descending
      $sort: { count: -1 },
    },
    {
      $lookup: {
        // Populate user details
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    {
      // Destructure the moduleDetails array
      $unwind: '$userDetails',
    },
    {
      // filter out archived users
      $match: { 'userDetails.archived': false },
    },
    {
      $limit: 3, // Limit to top 5
    },
    {
      $project: {
        // Select fields to include in the result
        userId: '$userDetails._id',
        username: '$userDetails.username',
        sessionCount: '$count',
        modulename: 1,
        _id: 0, // Exclude this field from results
      },
    },
  ]);

  return rankings;
};

// Get top 3 modules that were attended the most
const getModuleRank = async (userIds, trainings) => {
  const rankings = await Training.aggregate([
    {
      // Filter sessions that have an endTime and userId belongs to userIds
      $match: { endTime: { $exists: true }, userId: { $in: userIds } },
    },
    {
      $project: {
        // Select fields to include in the result
        moduleId: 1,
        // Calculate time spent per session
        timeSpent: { $subtract: ['$endTime', '$startTime'] },
      },
    },
    {
      // Group by module and sum time spent
      $group: {
        _id: '$moduleId',
        totalTimeSpent: { $sum: '$timeSpent' }, // Sum time spent for each module
        count: { $sum: 1 }, // Count sessions per module for additional info
      },
    },
    {
      $sort: { totalTimeSpent: -1 }, // Sort by total time spent descending
    },
    {
      $lookup: {
        // Populate module details
        from: 'modules',
        localField: '_id',
        foreignField: '_id',
        as: 'moduleDetails',
      },
    },
    {
      // Destructure the moduleDetails array
      $unwind: '$moduleDetails',
    },
    {
      // filter out archived modules
      $match: { 'moduleDetails.archived': false },
    },
    {
      $limit: 3, // Limit to top 3
    },
    {
      $project: {
        // Select fields to include in the result
        moduleId: '$_id',
        totalTimeSpent: 1,
        sessionCount: '$count',
        moduleName: '$moduleDetails.name', // Access the first element's name; lookup treat it as array
        _id: 0, // Exclude this field from results
      },
    },
  ]);

  return rankings;
};

// Get total time spent in VR, total time spent in modules, total time spent in evaluations; and last month of each, and total evaluations and modules
const getTotalVR = async (userIds, endOfLastMonthUnix, reports, trainings) => {
  const [totalEvaluationTime, lastMonthTotalEvaluationTime, totalEvaluation] =
    await calculateTotalEvaluationTime(userIds, endOfLastMonthUnix, reports);
  const [totalModulesTime, lastMonthTotalModuleTime, totalModules] =
    await calculateTotalModulesTime(userIds, endOfLastMonthUnix, trainings);

  const totalVRTime = totalEvaluationTime + totalModulesTime;

  const totalVRTimeLastMonth =
    lastMonthTotalEvaluationTime + lastMonthTotalModuleTime;

  const totalVRSessions = totalEvaluation.length + totalModules.length;

  return [
    totalVRTime,
    totalVRTimeLastMonth,
    totalEvaluationTime,
    lastMonthTotalEvaluationTime,
    totalModulesTime,
    lastMonthTotalModuleTime,
    totalEvaluation,
    totalVRSessions,
  ];
};

// Get total users (Unique Count) evaluated till now and till last month
const getTotalUsersEvaluated = async (userIds, endOfLastMonthUnix, reports) => {
  reports = reports.filter((report) => {
    if (report.endTime > 0) {
      return report;
    }
    return false;
  });

  const evaluationTillLastMonth = reports.filter((evaluation) => {
    // Get the evaluation endTime is lte endOfLastMonthUnix
    if (evaluation.endTime <= endOfLastMonthUnix) {
      return evaluation;
    }
    return false;
  });

  const uniqueLastMonthUsers = new Set();
  // Use a Set to track unique userIds that have evaluations
  const uniqueUserIds = new Set();

  // Track all unique userIds that have evaluations
  reports.forEach((evaluation) => {
    uniqueUserIds.add(evaluation.userId.toString());
  });

  // Track unique userIds for evaluations up to endOfLastMonthUnix
  evaluationTillLastMonth.forEach((evaluation) => {
    uniqueLastMonthUsers.add(evaluation.userId.toString());
  });

  const uniqueLastMonthUsersCount = uniqueLastMonthUsers.size;

  // The size of the Set gives the count of unique users evaluated
  const uniqueUserCount = uniqueUserIds.size;

  return {
    count: uniqueUserCount,
    countTillLastMonth: uniqueLastMonthUsersCount,
  };
};

// Get total users (Unique Count) attempted modules till now and till last month
const getTotalUsersAttemptedModule = async (
  userIds,
  endOfLastMonthUnix,
  trainings,
) => {
  const moduleSessionsTillLastMonth = trainings.filter((moduleSession) => {
    // Check if the moduleSession endTime is less than or equal to endOfLastMonthUnix
    if (moduleSession.endTime <= endOfLastMonthUnix) {
      return moduleSession;
    }
    return false;
  });

  const uniqueLastMonthUsers = new Set();
  const uniqueUserIds = new Set();

  trainings.forEach((moduleSession) => {
    if (moduleSession.userId) {
      uniqueUserIds.add(moduleSession.userId.toString()); // Ensure userId is treated as a string
    }
  });

  moduleSessionsTillLastMonth.forEach((moduleSession) => {
    if (moduleSession.userId) {
      uniqueLastMonthUsers.add(moduleSession.userId.toString()); // Ensure userId is treated as a string
    }
  });

  const uniqueLastMonthUsersCount = uniqueLastMonthUsers.size;
  const uniqueUserCount = uniqueUserIds.size;

  return {
    count: uniqueUserCount,
    countTillLastMonth: uniqueLastMonthUsersCount,
  };
};

// Department wise analytics
// Get toal department count and last month department count
const getDepartment = async (
  endOfLastMonthUnix,
  departments,
  users,
  trainings,
  reports,
) => {
  const lastMonthDepartments = departments.filter((department) => {
    // Get the department createdAt time is lte endOfLastMonthUnix
    if (department.createdAt <= endOfLastMonthUnix) {
      return department;
    }
    return false;
  });

  reports = reports.filter((report) => {
    if (report.endTime > 0) {
      return report;
    }
    return false;
  });

  // Calculate the time spent on modules by department; so get all the users in the department and calculate the totalTimeTaken and add it to departmentA: time, ... in descending order
  await Promise.all(
    departments.map(async (department) => {
      const departmentUsers = users.filter(
        (user) => user.departmentId?.toString() === department._id.toString(),
      );
      const userIds = departmentUsers.map((user) => user._id);

      const [totalModulesTime, lastMonthTotalModuleTime] =
        await calculateTotalModulesTime(userIds, endOfLastMonthUnix, trainings);
      const [totalEvaluationTime, lastMonthTotalEvaluationTime] =
        await calculateTotalEvaluationTime(
          userIds,
          endOfLastMonthUnix,
          reports,
        );

      department.totalModulesTime = totalModulesTime + totalEvaluationTime;
      department.lastMonthTotalModuleTime =
        lastMonthTotalModuleTime + lastMonthTotalEvaluationTime;
    }),
  );
  // Sort the array in descending order of totalModulesTime
  departments.sort((a, b) => b.totalModulesTime - a.totalModulesTime);

  // Get time array with only name of the module and time spent
  const timeArray = departments.map((department) => ({
    name: department.name,
    time: department.totalModulesTime,
  }));

  return {
    totalDeptCount: departments.length,
    totalDeptCountLastMonth: lastMonthDepartments.length,
    deptTimeSpendRank: timeArray,
  };
};

export const getModuleDetails = async (userIds) => {
  // Step 1: Fetch all modules that match the userIds
  const modules = await Module.find({
    userId: { $in: userIds },
    archived: false,
  }).lean(); // Use lean for faster queries

  let allMoments = [];

  modules?.forEach((module) => {
    module?.momentCount?.forEach((moment) => {
      allMoments.push({
        moduleId: module._id, // Include the module ID
        moduleName: module.name, // Include the module name
        chapterIndex: moment.chapterIndex, // Include the chapter index
        momentIndex: moment.momentIndex, // Include the moment index
        users: moment?.users, // Include the users array
      });
    });
  });

  // Step 3: Sort moments by users' count sum in descending order
  allMoments.sort((a, b) => {
    const aFailCount = a?.users?.reduce(
      (acc, user) => acc + (user?.count || 0),
      0,
    );
    const bFailCount = b?.users?.reduce(
      (acc, user) => acc + (user?.count || 0),
      0,
    );
    return bFailCount - aFailCount;
  });

  // Step 4: Retrieve top 5 most failed moments
  const topMoments = allMoments.slice(0, 5);

  // Calculate the failCount for each top moment
  topMoments.forEach((moment) => {
    moment.failCount = moment?.users?.reduce(
      (acc, user) => acc + (user?.count || 0),
      0,
    );
  });

  // Step 5: Use Promise.all to fetch chapter and moment names in parallel
  const momentsWithNames = await Promise.all(
    topMoments.map(async (moment) => {
      const reportData = await Report.findOne({
        moduleId: moment.moduleId,
      }).lean();

      const moduleData = reportData?.evaluationDump?.jsonLifeCycleBased;

      // Find the chapter by chapterIndex and moment by momentIndex
      const chapter = moduleData?.chapters.find(
        (chapter) => chapter.chapterIndex === moment.chapterIndex,
      );

      if (chapter) {
        const momentData = chapter.moments.find(
          (m) => m.momentIndex === moment.momentIndex,
        );

        // Add chapter and moment names to the moment object
        moment.chapterName = chapter?.chapterName || 'Unknown Chapter';
        moment.momentName = momentData?.momentName || 'Unknown Moment';
      }

      return moment;
    }),
  );

  // Step 6: Return the result with moment details
  const momentFailureList = momentsWithNames.map((moment) => ({
    moduleName: moment.moduleName,
    chapterName: moment.chapterName || 'Unknown Chapter',
    momentName: moment.momentName || 'Unknown Moment',
    failCount: moment.failCount,
  }));
  return [modules.length, momentFailureList];
};

const getDevices = async () => {
  const devices = await Device.find({}).lean().exec();
  return devices;
};

export const getIncompletionRate = async (
  userIds,
  totalEvaluation,
  reports,
) => {
  const totalEvaluationsWithPending = reports.filter((report) => {
    if (report.status === 'pending') {
      return report;
    }
    return false;
  });

  const incompletionRate =
    totalEvaluationsWithPending.length > 0
      ? (
          parseFloat(
            totalEvaluationsWithPending.length / totalEvaluation.length,
          ) * 100
        ).toFixed(2)
      : 0;
  return incompletionRate;
};

/**
 * Retrieves user analytics based on various metrics such as module rankings, time spent in VR, evaluations, and more.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The user analytics data.
 *
 * @throws {Error} - If there is an error retrieving the user analytics.
 */
export const getAnalyticUsers = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'analyticsAll',
    'start',
  );

  // Get the current date
  const currentDate = moment();
  // Calculate the end of last month
  const endOfLastMonth = currentDate
    .clone()
    .subtract(1, 'months')
    .endOf('month');

  // Get Unix timestamps
  const endOfLastMonthUnix = endOfLastMonth.unix();

  //   Get all users according to the role
  const users = await getUsersByRole(req);
  const userIds = users.map((user) => user._id);

  // Fetch all necessary data upfront
  const [reports, trainings, departments, devices] = await Promise.all([
    Report.find({ userId: { $in: userIds }, archived: false }).lean(),
    Training.find({
      userId: { $in: userIds },
      archived: false,
      endTime: { $ne: null },
    }).lean(),
    Department.find({ archived: false }).lean(),
    Device.find({}).lean(),
  ]);

  const [
    [
      totalVRTime,
      totalVRTimeLastMonth,
      totalEvaluationTime,
      lastMonthTotalEvaluationTime,
      totalModulesTime,
      lastMonthTotalModuleTime,
      totalEvaluation,
      totalVRSessions,
    ],
    uniqueUsersEvaluationCount,
    [uniqueModuleCount, momentFailureList],
    // devices, // Devices are already fetched
  ] = await Promise.all([
    getTotalVR(userIds, endOfLastMonthUnix, reports, trainings),
    getTotalUsersEvaluated(userIds, endOfLastMonthUnix, reports),
    getModuleDetails(userIds),
    // getDevices(), // Devices are already fetched
  ]);

  // Execute getMonthlyEvals in parallel with either getDepartmentUsersCount or getDomainUsersCount based on the user role
  let departmentPromise;
  let domainPromise;

  if (req.user.role === ROLES.ADMIN) {
    departmentPromise = getDepartmentUsersCount(req);
  } else {
    domainPromise = getDomainUsersCount(req);
  }

  // Use Promise.all to run parallell promises
  const [departmentOrDomainCount] = await Promise.all([
    departmentPromise || domainPromise,
  ]);

  // Get users who were created before last month
  const lastMonthUsers = users.filter((user) => {
    const userCreateTimestamp = user?.createdAt?.toISOString();
    const userCreateTimeUnix = moment(userCreateTimestamp)?.unix();
    if (userCreateTimeUnix < endOfLastMonthUnix) {
      // User created before last month
      return user;
    }
    return false;
  });
  /*
  GSK Department wise -> Analytics
  */
  let departmentValues = null;

  // Total Department count
  // Total Time for each department.
  // Top  department list
  if (CONF?.clientname === 'gsk') {
    // Get department values only if the client name is 'gsk'
    departmentValues = await getDepartment(
      endOfLastMonthUnix,
      departments,
      users,
      trainings,
      reports,
    );
  }

  // Initialize domainCount and departmentCount based on the user role
  let domainCount = [];
  let departmentCount = [];

  if (req.user.role === ROLES.ADMIN) {
    departmentCount = departmentOrDomainCount;
  } else {
    domainCount = departmentOrDomainCount;
  }

  const passPercentageValue = passPercentage(totalEvaluation);

  const incompletionPercentageValue = await getIncompletionRate(
    userIds,
    totalEvaluation,
    reports,
  );
  const lastMonthTotalEvaluation = totalEvaluation.filter((evaluation) => {
    if (evaluation?.endTime <= endOfLastMonthUnix) {
      return evaluation;
    }
    return false;
  });
  const lastMonthDeviceCount = devices.filter((device) => {
    const deviceCreateTimestamp = device?.createdAt?.toISOString();
    const deviceCreateTimeUnix = moment(deviceCreateTimestamp)?.unix();
    if (deviceCreateTimeUnix < endOfLastMonthUnix) {
      // Device created before last month
      return device;
    }
    return false;
  });

  performanceTracker.log('analyticsAll', 'end', logId, logStart);

  return res.status(HttpStatusCode.OK).json({
    message: 'User analytics.',
    details: {
      userCount: {
        total: users.length,
        tillLastMonth: lastMonthUsers.length,
      },
      timeSpentInVR: {
        total: totalVRTime,
        tillLastMonth: totalVRTimeLastMonth,
      },
      timeSpentInModules: {
        total: totalModulesTime,
        tillLastMonth: lastMonthTotalModuleTime,
      },
      timeSpentInEvaluations: {
        total: totalEvaluationTime,
        tillLastMonth: lastMonthTotalEvaluationTime,
      },
      usersEvaluated: {
        total: uniqueUsersEvaluationCount.count,
        tillLastMonth: uniqueUsersEvaluationCount.countTillLastMonth,
      },
      passPercentage: {
        value: passPercentageValue,
      },
      incompletionPercentage: {
        value: incompletionPercentageValue,
      },
      completionPercentage: {
        value: Number((100 - incompletionPercentageValue).toFixed(2)),
      },
      domainCount,
      departmentCount,
      momentFailureList: {
        value: momentFailureList,
      },
      evaluationCount: {
        total: totalEvaluation.length,
        tillLastMonth: lastMonthTotalEvaluation.length,
      },
      deviceCount: {
        total: devices.length,
        tillLastMonth: lastMonthDeviceCount.length,
      },
      totalVRSessions,
    },
    totalModules: uniqueModuleCount,
    // GSK values for department wise analytics (Only if CONF?.clientname === 'gsk'):
    totalDeptCount: departmentValues?.totalDeptCount,
    totalDeptCountLastMonth: departmentValues?.totalDeptCountLastMonth,
    deptTimeSpendRank: departmentValues?.deptTimeSpendRank,
  });
};

const calculateTotalModulesTime = async (
  userIds,
  endOfLastMonthUnix = null,
  trainings,
) => {
  // Calculate the total time spent on modules
  let totalModulesTime = 0;
  // Filter trainings to include only those that match the userIds
  userIds = userIds.map((userId) => userId.toString());

  trainings = trainings.filter((module) =>
    userIds.includes(module.userId.toString()),
  );
  trainings.forEach((module) => {
    const time = module.endTime - module.startTime;
    if (time > 0) {
      totalModulesTime += time;
    }
  });

  if (!endOfLastMonthUnix) {
    return totalModulesTime;
  }

  let lastMonthModulesTime = 0;

  // Go through each module and check if it was done till last month

  trainings.forEach((module) => {
    const moduleEndTime = module.endTime;
    if (moduleEndTime < endOfLastMonthUnix) {
      lastMonthModulesTime += moduleEndTime - module.startTime;
    }
  });

  return [totalModulesTime, lastMonthModulesTime, trainings];
};

/**
 * Calculates the total time spent on modules for a given set of users.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object with the total time spent on modules.
 *
 * @example
 * // Request
 * GET /totalModulesTime
 *
 * // Response
 * {
 *   "message": "Total time spent on modules.",
 *   "details": {
 *     "totalModulesTime": 3600
 *   }
 * }
 */
export const getTotalModulesTime = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    '/modules-time',
    'start',
  );

  const users = await getUsersByRole(req);
  const userIds = users.map((user) => user._id);
  const totalModulesTime = await calculateTotalModulesTime(userIds);

  performanceTracker.log('/modules-time', 'end', logId, logStart);

  return res.status(HttpStatusCode.OK).json({
    message: 'Total time spent on modules.',
    details: {
      totalModulesTime,
    },
  });
};

const calculateUserTotalModulesTime = async (userId) => {
  const modules = await Training.find({
    userId,
    endTime: { $ne: null },
    archived: false,
  });

  let totalModulesTime = 0;
  modules.forEach((module) => {
    totalModulesTime += module.endTime - module.startTime;
  });

  return totalModulesTime;
};

/**
 * Retrieves the total time spent on modules by a user.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} - A promise that resolves to the total time spent on modules by the user.
 *
 * @example
 * getUserTotalModulesTime(req, res);
 */
export const getUserTotalModulesTime = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    '/modules-time/:userId',
    'start',
  );

  const { userId } = req.params;

  const totalModulesTime = await calculateUserTotalModulesTime(userId);

  performanceTracker.log('/modules-time/:userId', 'end', logId, logStart);

  res.status(HttpStatusCode.OK).json({
    message: 'Total time spent on modules by user',
    details: {
      totalModulesTime,
    },
  });
};

// 1.Total Evaluation Done
const getTotalEvaluationCount = async (userIds, endOfLastMonthUnix) => {
  const totalEvaluationCOunt = await Report.find({
    userId: { $in: userIds },
    endTime: { $ne: null },
    archived: false,
  }).countDocuments();

  const lastMonthTotalEvaluationCount = await Report.find({
    userId: { $in: userIds },
    endTime: { $lte: endOfLastMonthUnix },
    archived: false,
  }).countDocuments();

  return [totalEvaluationCOunt, lastMonthTotalEvaluationCount];
};

const calculateTotalEvaluationTime = async (
  userIds,
  endOfLastMonthUnix = null,
  reports,
) => {
  let totalEvaluationTime = 0;
  userIds = userIds.map((userId) => userId.toString());
  reports = reports.filter((report) => {
    if (userIds.includes(report.userId.toString()) && report.endTime > 0) {
      return report;
    }
    return false;
  });

  reports.forEach((evaluation) => {
    const totalTime = evaluation.endTime - evaluation.startTime;
    if (totalTime > 0) {
      totalEvaluationTime += totalTime;
    }
  });

  if (!endOfLastMonthUnix) {
    return totalEvaluationTime;
  }

  let lastMonthTotalEvaluationTime = 0;

  // Go through each evaluation and check if it was done till last month
  reports.forEach((evaluation) => {
    const evaluationEndTime = evaluation.endTime;
    if (evaluationEndTime < endOfLastMonthUnix) {
      lastMonthTotalEvaluationTime += evaluationEndTime - evaluation.startTime;
    }
  });

  return [totalEvaluationTime, lastMonthTotalEvaluationTime, reports];
};

/**
 * Calculates the total evaluation time for a list of users.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object with the total evaluation time.
 *
 * @throws {Error} - If there is an error retrieving the users or calculating the total evaluation time.
 */
export const getTotalEvaluationTime = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    '/evaluation-time',
    'start',
  );
  const users = await getUsersByRole(req);
  const userIds = users.map((user) => user._id);

  const totalEvaluationTime = await calculateTotalEvaluationTime(userIds);

  performanceTracker.log('/evaluation-time', 'end', logId, logStart);
  return res.status(HttpStatusCode.OK).json({
    message: 'Total time spent on evaluations.',
    details: {
      totalEvaluationTime,
    },
  });
};

const calculateUserTotalEvaluationTime = async (userId) => {
  const evaluations = await Report.find({
    userId,
    archived: false,
    endTime: { $ne: null },
  });

  let totalEvaluationTime = 0;
  evaluations.forEach((evaluation) => {
    totalEvaluationTime += evaluation.endTime - evaluation.startTime;
  });

  return totalEvaluationTime;
};

/**
 * Calculate the total evaluation time for a user.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise} - A promise that resolves to the total evaluation time.
 *
 * @example
 * getUserTotalEvaluationTime(req, res)
 */
export const getUserTotalEvaluationTime = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    '/evaluation-time/:userId',
    'start',
  );

  const { userId } = req.params;
  const totalEvaluationTime = await calculateUserTotalEvaluationTime(userId);

  performanceTracker.log('/evalaution-time/:userId', 'end', logId, logStart);

  res.status(HttpStatusCode.OK).json({
    message: 'Total time spent on evaluations by user',
    details: {
      totalEvaluationTime,
    },
  });
};

/**
 * Calculates the total time spent on VR by a user.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The JSON response containing the total VR time.
 *
 * @example
 * // Request
 * GET /api/user/:userId/vr-time
 *
 * // Response
 * {
 *   "message": "Total time spent on VR by user",
 *   "details": {
 *     "totalVRTime": 3600
 *   }
 * }
 */
export const getTotalUserVRTime = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    '/vr-time/:userId',
    'start',
  );

  const { userId } = req.params;
  const totalEvaluationTime = await calculateUserTotalEvaluationTime(userId);
  const totalModulesTime = await calculateUserTotalModulesTime(userId);

  const totalVRTime = totalEvaluationTime + totalModulesTime;

  performanceTracker.log('/vr-time/:userId', 'end', logId, logStart);

  res.status(HttpStatusCode.OK).json({
    message: 'Total time spent on VR by user',
    details: {
      totalVRTime,
    },
  });
};

/**
 * Retrieves the top 5 modules based on evaluation count.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object containing the top 5 modules by evaluation count.
 *
 * @throws {Error} - If there is an error retrieving the data.
 */
export const getEvaluationRank = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    '/rank-evaluation',
    'start',
  );

  //   Get all users according to the role
  const users = await getUsersByRole(req);
  const userIds = users.map((user) => user._id);

  const rankings = await Report.aggregate([
    {
      // filter evaluation where the evaluation is ended and belongs to userIds
      $match: { endTime: { $exists: true }, userId: { $in: userIds } },
    },
    {
      // group by moduleId and do a count
      $group: {
        _id: '$moduleId',
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 }, // Sort by count descending
    },

    {
      $lookup: {
        // Populate module details
        from: 'modules',
        localField: '_id',
        foreignField: '_id',
        as: 'moduleDetails',
      },
    },
    {
      // Destructure the moduleDetails array
      $unwind: '$moduleDetails',
    },
    {
      // filter out archived modules
      $match: { 'moduleDetails.archived': false },
    },
    {
      $limit: 5, // Limit to top 5
    },
    {
      $project: {
        // Select fields to include in the result
        moduleId: '$_id',
        evaluationCount: '$count',
        moduleName: '$moduleDetails.name',
        _id: 0, // Exclude this field from results
      },
    },
  ]);

  performanceTracker.log('/rank-evaluation', 'end', logId, logStart);

  res.status(HttpStatusCode.OK).json({
    message: 'Top 5 modules by evaluation count',
    details: rankings,
  });
};

/**
 * Retrieves the top 5 users ranked by evaluation count.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object containing the top 5 users ranked by evaluation count.
 *
 * @throws {Error} - If there is an error retrieving the users or rankings.
 */
export const getUsersRankEvaluation = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    '/rank-users-evaluation',
    'start',
  );

  //  Get all users according to the role
  const users = await getUsersByRole(req);
  const userIds = users.map((user) => user._id);

  const rankings = await Report.aggregate([
    {
      // filter evaluation where the evaluation is ended and belongs to userId and not archived
      $match: {
        endTime: { $exists: true },
        userId: { $in: userIds },
        archived: false,
      },
    },
    {
      // group by userId and do a count
      $group: {
        _id: '$userId',
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 }, // Sort by count descending
    },
    {
      $limit: 5, // Limit to top 5
    },
    {
      $lookup: {
        // Populate module details
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userDetails',
      },
    },
    {
      $project: {
        // Select fields to include in the result
        userId: '$_id',
        evaluationCount: '$count',
        username: { $arrayElemAt: ['$userDetails.name', 0] }, // Access the first element's name; lookup treat it as array
        _id: 0, // Exclude this field from results
      },
    },
  ]);

  performanceTracker.log('/rank-users-evaluation', 'end', logId, logStart);

  res.status(HttpStatusCode.OK).json({
    message: 'Top 5 users by evaluation count',
    details: rankings,
  });
};

// Modules with the best success rate of evaluation list
// The function to calculate the success rate for each module
// Output:
// [
// {
//   moduleId: '651bf165d32c28820c7f35d5',
//   moduleName: 'mcq',
//   successRate: '0/1',
//   percentage: '0.00%'
// },
// {
//   moduleId: '66a586be9f5bd71b9be67119',
//   moduleName: 'checkModuleJson1234231',
//   successRate: '0/1',
//   percentage: '0.00%'
// }
// ]
const getModulesWithBestSuccessRate = async (userIds) => {
  // Step 1: Fetch reports that match the userIds and have an endTime, also include module details using populate
  const reports = await Report.find({
    userId: { $in: userIds },
    endTime: { $exists: true },
    archived: false,
  }).populate('moduleId', 'name'); // Populate to fetch the module name

  // Step 2: Group reports by moduleId
  const moduleGroups = reports.reduce((acc, report) => {
    const moduleId = report.moduleId._id.toString(); // Use the populated module ID
    if (!acc[moduleId]) {
      acc[moduleId] = {
        moduleName: report.moduleId.name, // Get the module name from the populated data
        evaluations: [],
      };
    }
    acc[moduleId].evaluations.push(report);
    return acc;
  }, {});

  // Step 3: Calculate success rate for each module
  const moduleSuccessRates = Object.keys(moduleGroups).map((moduleId) => {
    const evaluations = moduleGroups[moduleId].evaluations;

    // Get the total number of evaluations for this module
    const totalEvaluations = evaluations.length;

    // Use the getPassUsers function to filter passed evaluations
    const passedEvaluations = getPassUsers(evaluations);

    // Calculate the success rate
    const successRate = passedEvaluations.length / totalEvaluations;

    return {
      moduleId,
      moduleName: moduleGroups[moduleId].moduleName, // Get module name
      successRate,
      passedCount: passedEvaluations.length,
      totalCount: totalEvaluations,
    };
  });

  // Step 4: Sort modules by success rate in descending order
  moduleSuccessRates.sort((a, b) => b.successRate - a.successRate);

  // Step 5: Format the output as needed
  return moduleSuccessRates.map((module) => ({
    moduleId: module.moduleId,
    moduleName: module.moduleName,
    successRate: `${module.passedCount}/${module.totalCount}`,
    percentage: (module.successRate * 100).toFixed(2) + '%',
  }));
};

// Function to find modules with most attemoted evaluations
// Output:
// [
//   {
//     moduleId: '660fb7a5aab8dfaad6f313dc',
//     moduleName: 'qUESTION AND ACTION TRIAL 1',
//     attempts: 1
//   },
//   {
//     moduleId: '66a586be9f5bd71b9be67119',
//     moduleName: 'checkModuleJson1234231',
//     attempts: 1
//   }
// ]
const rankModulesByAttempts = async (userIds) => {
  // Step 1: Fetch reports that match the userIds, have an endTime, and are not archived
  // Use `.populate()` to automatically fetch module details (like name)
  const reports = await Report.find({
    userId: { $in: userIds },
    endTime: { $exists: true },
    archived: false, // Ensure the report is not archived
  })
    .populate('moduleId', 'name') // Populate the moduleId field with the name from the Module model
    .lean(); // Use lean() for faster read-only queries

  // Step 2: Group by moduleId and count the number of attempts
  const moduleAttemptCounts = reports.reduce((acc, report) => {
    const moduleId = report.moduleId._id.toString(); // Access the populated module ID
    const moduleName = report.moduleId.name; // Access the populated module name

    if (!acc[moduleId]) {
      acc[moduleId] = {
        moduleId: moduleId,
        moduleName: moduleName, // Store the module name
        attempts: 0,
      };
    }

    acc[moduleId].attempts += 1;

    return acc;
  }, {});

  // Step 3: Convert the grouped result into an array
  const moduleAttemptArray = Object.values(moduleAttemptCounts);

  // Step 4: Sort by number of attempts in descending order
  moduleAttemptArray.sort((a, b) => b.attempts - a.attempts);

  // Step 5: Return the result
  return moduleAttemptArray.map((module) => ({
    moduleId: module.moduleId,
    moduleName: module.moduleName,
    attempts: module.attempts,
  }));
};

export const getEvaluationAnalytics = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    '/evaluation/all',
    'start',
  );

  // Get the current date
  const currentDate = moment();
  // Calculate the end of last month
  const endOfLastMonth = currentDate
    .clone()
    .subtract(1, 'months')
    .endOf('month');

  // Get Unix timestamps
  const endOfLastMonthUnix = endOfLastMonth.unix();

  //   Get all users according to the role
  const users = await getUsersByRole(req);
  const userIds = users.map((user) => user._id);

  console.log('High Alert');
  performanceTracker.log('/evaluation/all', 'end', logId, logStart);
  // Analytic KPI
  // 1.Total Evaluation Done (Count and Time) *
  // 2.Modules with the best success rate of evaluation list *
  // 3.Modules with the worst success rate of evaluation list *
  // 4.Pass Percentage; Get from analytics all *
  // 5.Rank modules by number of attempted evaluation *
  // 6.Top Failing moments: Find the moment with the most failing moments, create a db schema to record this and migrate data also, plus while creating the evaluation, add the moment with the most failing moments -> structure also take the analytics only if the jsonLifeCyclew is turned on in configuration
};

export const getDeviceAnalytics = async (req, res) => {
  // Analytic KPI
  // 1. Total number of devices
  // 2.Active Device (Last logged in was less than 5 days)
  // 3. Top device, Device with max number of training + evaluation done
  // 4.Table Of Devices History | Line chart of Evaluations/Training Attempted on Each Mobile Device ( Weekly , Daily etc.) [3 and 4, implement change in schema as well as unity side, so upcoming change only]
};

export const getUserAnalytics = async (req, res) => {
  // Analytic KPI
  // 1. Total Users: Categorise interms of superadmin, admin and trainees
  // 2. Total Users Evaluated (DOne in anbalytics/all)
  // 3.Rank users on successful evaluations (Most number)
};

export const getModuleAnalytics = async (req, res) => {
  let { moduleId } = req.query;
  let modules = [];
  let moduleIds = [];
  let moduleAccessQuery = {};

  if (moduleId) {
    modules = await Module.find({
      _id: moduleId,
      archived: { $ne: true },
    }).lean();
    moduleIds = [moduleId];
    moduleAccessQuery = { modules: { $in: moduleIds } };
  } else {
    if (CONF?.features?.analytics?.module?.allModulesOption?.state !== 'on') {
      return res.status(HttpStatusCode.BAD_REQUEST).json({
        message: 'Module ID is required to fetch analytics.',
      });
    }
    modules = await Module.find({ archived: { $ne: true } }).lean();
    moduleIds = modules.map((m) => m._id);
    moduleAccessQuery = {};
  }

  let users = [];

  if (
    req?.user?.role === ROLES.PRODUCT_ADMIN ||
    req?.user?.role === ROLES.SUPER_ADMIN
  ) {
    users = await User.find({
      role: { $nin: [ROLES.SUPER_ADMIN, ROLES.PRODUCT_ADMIN] },
      archived: false,
    })
      .populate('domainId')
      .lean();
  } else {
    const domainId = req?.user?.domainId;

    if (domainId) {
      users = await User.find({
        domainId,
        archived: false,
      })
        .populate('domainId')
        .lean();
    }
  }

  const userIds = users.map((user) => user._id);

  const [evaluations, trainings, moduleAccesses] = await Promise.all([
    Report.find({
      userId: { $in: userIds },
      moduleId: { $in: moduleIds },
      archived: false,
    })
      .populate({
        path: 'userId',
        populate: [{ path: 'departmentId' }, { path: 'domainId' }],
      })
      .populate('moduleId')
      .lean(),
    Training.find({
      userId: { $in: userIds },
      moduleId: { $in: moduleIds },
      archived: false,
    })
      .populate({
        path: 'userId',
        populate: [{ path: 'departmentId' }, { path: 'domainId' }],
      })
      .populate('moduleId')
      .lean(),
    ModuleAccess.find(moduleAccessQuery)
      .populate({
        path: 'domains',
        match: { archived: { $ne: true } },
      })
      .lean(),
  ]);

  const domainsWithModuleAccess = new Set();
  moduleAccesses.forEach((access) => {
    access.domains?.forEach((domain) => {
      domainsWithModuleAccess.add(domain.name);
    });
  });

  const trainingAnalytics = {};
  const evaluationAnalytics = {};
  const uniqueParticipants = new Set([
    ...evaluations.map((e) => e.userId?._id.toString()),
    ...trainings.map((t) => t.userId?._id.toString()),
  ]);

  const activeModules = new Set();

  const processAnalytics = (domainName, analytics) => {
    if (!domainName) return null;

    if (!analytics[domainName]) {
      analytics[domainName] = {
        name: domainName,
        sessions: 0,
        completed: 0,
        completionPercentage: '0',
        passed: 0,
        passedPercentage: '0',
        completedUsers: new Set(),
      };
    }
    return analytics[domainName];
  };

  const updateAnalytics = (analytics, data, type) => {
    analytics.sessions += 1;
    if (data?.endTime) {
      analytics.completed += 1;
      analytics.completedUsers.add(data.userId._id.toString());
    }

    analytics.completionPercentage =
      ((analytics.completed / analytics.sessions) * 100).toFixed(2) || '0';

    if (type === 'evaluation' && ['pass', 'passed'].includes(data?.status)) {
      analytics.passed += 1;
      analytics.passedPercentage =
        ((analytics.passed / analytics.completed) * 100).toFixed(2) || '0';
    }
  };

  domainsWithModuleAccess.forEach((domainName) => {
    trainingAnalytics[domainName] =
      processAnalytics(domainName, trainingAnalytics) || {};
    evaluationAnalytics[domainName] =
      processAnalytics(domainName, evaluationAnalytics) || {};
  });

  evaluations.forEach((evaluation) => {
    const domainName = evaluation?.userId?.domainId?.name;
    const moduleName = evaluation?.moduleId?.name;
    activeModules.add(moduleName);

    const moduleAnalytics = processAnalytics(domainName, evaluationAnalytics);
    if (moduleAnalytics) {
      updateAnalytics(moduleAnalytics, evaluation, 'evaluation');
    }
  });

  trainings.forEach((training) => {
    const domainName = training?.userId?.domainId?.name;
    const moduleName = training?.moduleId?.name;
    activeModules.add(moduleName);

    const moduleAnalytics = processAnalytics(domainName, trainingAnalytics);
    if (moduleAnalytics) {
      updateAnalytics(moduleAnalytics, training, 'training');
    }
  });

  const processAnalyticsArray = (analytics, allUsers) => {
    return Object.values(analytics).map((item) => {
      const domainUsers = users.filter(
        (user) => user.domainId?.name === item.name,
      );
      const domainUserCount = domainUsers.length;
      const completedUniqueUsers = item?.completedUsers?.size || 0;
      const completionPercentage = domainUserCount
        ? ((completedUniqueUsers / domainUserCount) * 100).toFixed(2) || '0'
        : '0';

      const processedItem = {
        name: item.name,
        totalDomainUsers: domainUserCount,
        completedUniqueUsers: completedUniqueUsers,
        sessions: item.sessions,
        completed: item.completed,
        completionPercentage: completionPercentage,
      };

      if (item.passed !== undefined) {
        processedItem.passed = item.passed;
        processedItem.passedPercentage = item.passedPercentage;
      }

      return processedItem;
    });
  };

  const calculateOverallPercentages = (analyticsArray, type) => {
    if (!analyticsArray.length) return {};

    const totals = analyticsArray.reduce(
      (acc, item) => {
        acc.sessions += item.sessions;
        acc.completed += item.completed;
        if (type === 'evaluation') {
          acc.passed += item.passed || 0;
        }
        return acc;
      },
      { sessions: 0, completed: 0, passed: 0 },
    );

    const completionPercentage = totals.sessions
      ? ((totals.completed / totals.sessions) * 100).toFixed(2) || '0'
      : '0';

    const result = {
      completionPercentage: completionPercentage,
    };

    if (type === 'evaluation' && totals.completed > 0) {
      result.passPercentage =
        ((totals.passed / totals.completed) * 100).toFixed(2) || '0';
    }

    return result;
  };

  const response = {
    training: {
      data: processAnalyticsArray(trainingAnalytics),
      overall: calculateOverallPercentages(
        processAnalyticsArray(trainingAnalytics),
        'training',
      ),
    },
    evaluation: {
      data: processAnalyticsArray(evaluationAnalytics),
      overall: calculateOverallPercentages(
        processAnalyticsArray(evaluationAnalytics),
        'evaluation',
      ),
    },
    stats: {
      totalModules: modules.length,
      activeModules: activeModules.size,
      totalSessions: evaluations.length + trainings.length,
      uniqueParticipants: uniqueParticipants.size,
    },
  };

  res.json(response);
};

export const getDomainAnalytics = async (req, res) => {
  const { domainId } = req.query;
  if (!domainId) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      message: 'Domain ID is required.',
    });
  }
  const domain = await Domain.findById(domainId).lean();
  if (!domain) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      message: 'Domain not found.',
    });
  }

  const users = await User.find({ domainId, archived: false }).lean();
  const userIds = users.map((user) => user._id);
  const [domainEvaluations, domainTrainings] = await Promise.all([
    Report.find({ userId: { $in: userIds }, archived: false }).populate(
      'moduleId',
    ),
    Training.find({
      userId: { $in: userIds },
      archived: false,
    }).populate('moduleId'),
  ]);

  const reportees = await getUsersByRole(req);
  const reporteesUserId = reportees.map((user) => user._id);
  const [overallEvaluations, overallTrainings, overallTotalDomains] =
    await Promise.all([
      Report.find({
        userId: { $in: reporteesUserId },
        archived: false,
      }).lean(),
      Training.find({
        userId: { $in: reporteesUserId },
        archived: false,
      }).lean(),
      Domain.countDocuments({ archived: false }),
    ]);
  const overallSessions = overallEvaluations.length + overallTrainings.length;
  const overallUniqueParticipants = new Set([
    ...overallEvaluations.map((e) => e.userId.toString()),
    ...overallTrainings.map((t) => t.userId.toString()),
  ]).size;

  const evaluationAnalytics = {};
  const trainingAnalytics = {};
  const uniqueParticipants = new Set();
  const overallStats = {
    evaluations: {
      totalDomainUsers: users.length,
      completedSessions: 0,
      totalSessions: 0,
      completionPercentage: 0,
    },
    trainings: {
      totalDomainUsers: users.length,
      completedSessions: 0,
      totalSessions: 0,
      completionPercentage: 0,
    },
  };

  const processAnalytics = (analytics, module, userId, type, overall) => {
    const moduleName = module?.name;
    if (!moduleName) return;
    if (!analytics[moduleName]) {
      analytics[moduleName] = {
        moduleName,
        completedUsers: new Set(),
        totalSessions: 0,
      };
    }
    analytics[moduleName].totalSessions += 1;
    analytics[moduleName].completedUsers.add(userId.toString());

    if (type === 'completed') {
      overall.completedSessions += 1;
    }
  };

  domainEvaluations.forEach((evaluation) => {
    const module = evaluation?.moduleId;
    processAnalytics(
      evaluationAnalytics,
      module,
      evaluation?.userId,
      evaluation?.endTime ? 'completed' : 'incomplete',
      overallStats.evaluations,
    );
    overallStats.evaluations.totalSessions += 1;
    uniqueParticipants.add(evaluation?.userId.toString());
  });
  domainTrainings.forEach((training) => {
    const module = training?.moduleId;
    processAnalytics(
      trainingAnalytics,
      module,
      training?.userId,
      training?.endTime ? 'completed' : 'incomplete',
      overallStats.trainings,
    );
    overallStats.trainings.totalSessions += 1;
    uniqueParticipants.add(training?.userId.toString());
  });

  const evaluationAnalyticsArray = Object.values(evaluationAnalytics).map(
    (module) => ({
      moduleName: module.moduleName,
      totalDomainUsers: users.length,
      completedUniqueUsers: module.completedUsers.size, // rename later
      completionPercentage: users.length
        ? ((module.completedUsers.size / users.length) * 100).toFixed(2)
        : '0.00',
    }),
  );

  const trainingAnalyticsArray = Object.values(trainingAnalytics).map(
    (module) => ({
      moduleName: module.moduleName,
      totalDomainUsers: users.length,
      completedUniqueUsers: module.completedUsers.size, // rename later
      completionPercentage: users.length
        ? ((module.completedUsers.size / users.length) * 100).toFixed(2)
        : '0.00',
    }),
  );

  res.status(HttpStatusCode.OK).json({
    message: 'Domain analytics.',
    domain: domain.name,
    stats: {
      evaluations: {
        totalDomainUsers: users.length,
        completedSessions: overallStats.evaluations.completedSessions,
        totalSessions: overallStats.evaluations.totalSessions,
        completionPercentage: (
          (overallStats.evaluations.completedSessions /
            overallStats.evaluations.totalSessions) *
          100
        ).toFixed(2),
      },
      trainings: {
        totalDomainUsers: users.length,
        completedSessions: overallStats.trainings.completedSessions,
        totalSessions: overallStats.trainings.totalSessions,
        completionPercentage: (
          (overallStats.trainings.completedSessions /
            overallStats.trainings.totalSessions) *
          100
        ).toFixed(2),
      },
      totalDomains: overallTotalDomains,
      totalSessions: overallSessions,
      uniqueParticipants: overallUniqueParticipants,
    },
    modules: {
      evaluations: evaluationAnalyticsArray,
      trainings: trainingAnalyticsArray,
    },
  });
};

export const getDepartmentAnalytics = async (req, res) => {
  const { domainId, departmentId, getAllDept } = req.query;
  if (!domainId || !departmentId) {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      message: 'Domain ID and Department ID are required.',
    });
  }

  // Create an array of promises
  const queries = [Domain.findById(domainId).lean()];

  const shouldGetAllDepts = getAllDept === true || getAllDept === 'true';
  // Only add the department query if departmentId exists
  if (!shouldGetAllDepts && departmentId) {
    queries.push(Department.findById(departmentId).lean());
  }

  // Execute the queries
  const results = await Promise.all(queries);

  const domain = results[0];
  const department = departmentId ? results[1] : null;
  if (!domain) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      message: 'Domain  not found.',
    });
  }

  if (!getAllDept && !department) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      message: 'Domain  not found.',
    });
  }

  let users;
  if (!shouldGetAllDepts) {
    users = await User.find({
      domainId,
      departmentId,
      archived: false,
    }).lean();
  } else {
    users = await User.find({
      domainId,
      archived: false,
    }).lean();
  }

  const userIds = users.map((user) => user._id);
  const [evaluations, trainings] = await Promise.all([
    Report.find({ userId: { $in: userIds }, archived: false }).populate(
      'moduleId',
    ),
    Training.find({
      userId: { $in: userIds },
      archived: false,
    }).populate('moduleId'),
  ]);

  const evaluationAnalytics = {};
  const trainingAnalytics = {};
  const localStats = {
    evaluations: {
      totalDepartmentUsers: users.length,
      completedSessions: 0,
      totalSessions: 0,
    },
    trainings: {
      totalDepartmentUsers: users.length,
      completedSessions: 0,
      totalSessions: 0,
    },
  };

  const processAnalytics = (analytics, module, userId, type, statObj) => {
    const moduleName = module?.name;
    if (!moduleName) return;
    if (!analytics[moduleName]) {
      analytics[moduleName] = {
        moduleName,
        completedUsers: new Set(),
        totalSessions: 0,
      };
    }
    analytics[moduleName].totalSessions += 1;
    if (type === 'completed') {
      analytics[moduleName].completedUsers.add(userId);
      statObj.completedSessions += 1;
    }
  };

  evaluations.forEach((evaluation) => {
    const module = evaluation?.moduleId;
    processAnalytics(
      evaluationAnalytics,
      module,
      evaluation?.userId,
      evaluation?.endTime ? 'completed' : 'incomplete',
      localStats.evaluations,
    );
    localStats.evaluations.totalSessions += 1;
  });
  trainings.forEach((training) => {
    const module = training?.moduleId;
    processAnalytics(
      trainingAnalytics,
      module,
      training?.userId,
      training?.endTime ? 'completed' : 'incomplete',
      localStats.trainings,
    );
    localStats.trainings.totalSessions += 1;
  });

  const evaluationAnalyticsArray = Object.values(evaluationAnalytics).map(
    (module) => ({
      moduleName: module?.moduleName,
      totalDepartmentUsers: users.length,
      completedUniqueUsers: module.completedUsers.size, // rename later
      completionPercentage: users.length
        ? ((module.completedUsers.size / users.length) * 100).toFixed(2)
        : '0.00',
    }),
  );
  const trainingAnalyticsArray = Object.values(trainingAnalytics).map(
    (module) => ({
      moduleName: module.moduleName,
      totalDepartmentUsers: users.length,
      completedUniqueUsers: module.completedUsers.size, // rename later
      completionPercentage: users.length
        ? ((module.completedUsers.size / users.length) * 100).toFixed(2)
        : '0.00',
    }),
  );

  const reportees = await getUsersByRole(req);
  const reporteesUserId = reportees.map((user) => user._id);
  const [overallEvaluations, overallTrainings, overallTotalDepartments] =
    await Promise.all([
      Report.find({
        userId: { $in: reporteesUserId },
        archived: false,
      }).lean(),
      Training.find({
        userId: { $in: reporteesUserId },
        archived: false,
      }).lean(),
      Department.countDocuments({ archived: false }),
    ]);
  const overallSessions = overallEvaluations.length + overallTrainings.length;
  const overallUniqueParticipants = new Set([
    ...overallEvaluations.map((e) => e.userId.toString()),
    ...overallTrainings.map((t) => t.userId.toString()),
  ]).size;

  res.status(HttpStatusCode.OK).json({
    message: 'Department analytics.',
    domain: domain?.name,
    department: department?.name,
    stats: {
      evaluations: {
        totalDepartmentUsers: localStats.evaluations.totalDepartmentUsers,
        completedSessions: localStats.evaluations.completedSessions,
        totalSessions: localStats.evaluations.totalSessions,
        completionPercentage: users.length
          ? (
              (localStats.evaluations.completedSessions /
                localStats.evaluations.totalSessions) *
              100
            ).toFixed(2)
          : '0.00',
      },
      trainings: {
        totalDepartmentUsers: localStats.trainings.totalDepartmentUsers,
        completedSessions: localStats.trainings.completedSessions,
        totalSessions: localStats.trainings.totalSessions,
        completionPercentage: localStats.trainings.totalSessions
          ? (
              (localStats.trainings.completedSessions /
                localStats.trainings.totalSessions) *
              100
            ).toFixed(2)
          : '0.00',
      },
      totalDepartments: overallTotalDepartments,
      totalSessions: overallSessions,
      uniqueParticipants: overallUniqueParticipants,
    },
    modules: {
      evaluations: evaluationAnalyticsArray,
      trainings: trainingAnalyticsArray,
    },
  });
};
