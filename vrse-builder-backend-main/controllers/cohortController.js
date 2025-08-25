import { Cohort } from '../models/CohortModel.js';
import moment from 'moment-timezone';
import BaseError from '../utils/classes/BaseError.js';
import { HttpStatusCode } from '../constants.js';
import { Report } from '../models/ReportModel.js';
import performanceTracker from '../utils/performanceLogger.js';

/**
 * Registers a new cohort.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} - A promise that resolves with the created cohort.
 *
 * @throws {Error} - If there is an error creating the cohort.
 */
export const registerCohort = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'cohort/register',
    'start',
  );

  const { name, startDate, endDate, venue, moduleIds, userIds } = req.body;
  if (moduleIds.length === 0 || userIds.length === 0) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module or user not found',
    );
  }
  const owner = req.user._id;
  const users = userIds.map((userId) => ({
    id: userId,
    evaluation: moduleIds.map(() => null),
  }));
  const cohort = await Cohort.create({
    name,
    startDate,
    endDate,
    venue,
    owner,
    modules: moduleIds,
    users,
  });

  performanceTracker.log('cohort/register', 'end', logId, logStart);

  res.status(HttpStatusCode.OK).json({
    message: 'Cohort created',
    details: cohort,
  });
};

/**
 * Retrieves active cohorts based on the user's ID and current timestamp.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object with success status and retrieved cohorts data.
 *
 */
export const getActiveCohorts = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'cohort/active',
    'start',
  );

  const { _id: userId } = req.user;
  const currentTimestamp = moment().unix();
  // Where the requesting user is either the attendee or the owner
  const cohorts = await Cohort.find({
    $or: [
      {
        users: {
          $elemMatch: {
            id: userId,
          },
        },
      },
      {
        owner: userId,
      },
    ],
    startDate: { $lte: currentTimestamp },
    endDate: { $gte: currentTimestamp },
  })
    .populate({
      path: 'users.id',
      model: 'user',
      select: 'name ',
    })
    .populate({
      path: 'users.evaluation',
      model: 'report',
    });

  performanceTracker.log('cohort/active', 'end', logId, logStart);
  res.status(HttpStatusCode.OK).json({
    message: 'Active cohorts',
    details: cohorts,
  });
};

/**
 * Retrieves upcoming cohorts based on the user's ID and current timestamp.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object with success status and retrieved cohorts data.
 *
 */
export const getUpcomingCohorts = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'cohort/upcoming',
    'start',
  );

  const { _id: userId } = req.user;
  const currentTimestamp = moment().unix();
  // Where the requesting user is either the attendee or the owner, where the cohort is not yet started
  const cohorts = await Cohort.find({
    $or: [
      {
        owner: userId,
      },
      {
        users: {
          $elemMatch: {
            id: userId,
          },
        },
      },
    ],
    startDate: { $gte: currentTimestamp },
  })
    .populate({
      path: 'users.id',
      model: 'user',
      select: 'name username ',
    })
    .populate({
      path: 'users.evaluation',
      model: 'report',
    })
    .populate({
      path: 'modules',
      model: 'module',
      select: 'name',
    })
    .populate({
      path: 'owner',
      model: 'user',
      select: 'name',
    });

  performanceTracker.log('cohort/upcoming', 'end', logId, logStart);
  res.status(HttpStatusCode.OK).json({
    message: 'Upcoming cohorts',
    details: cohorts,
  });
};

/**
 * Retrieves past cohorts based on the user's ID and current timestamp.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object with success status and retrieved cohorts data.
 *
 */
export const getAllCohorts = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'cohort/all',
    'start',
  );

  const { _id: userId } = req.user;
  // Where the requesting user is either the attendee or the owner
  const cohorts = await Cohort.find({
    $or: [
      {
        users: {
          $elemMatch: {
            id: userId,
          },
        },
      },
      {
        owner: userId,
      },
    ],
  })
    .populate({
      path: 'users.id',
      model: 'user',
      select: 'name username',
    })
    .populate({
      path: 'users.evaluation',
      model: 'report',
    })
    .populate({
      path: 'modules',
      model: 'module',
      select: 'name',
    })
    .populate({
      path: 'owner',
      model: 'user',
      select: 'name',
    });

  performanceTracker.log('cohort/all', 'end', logId, logStart);

  res.status(HttpStatusCode.OK).json({
    message: 'All cohorts',
    details: cohorts,
  });
};

// When evaluation is populated, if the eval key has null values, it will be ignored. In order to avoid this, we need to fetch the evaluation values asynchronously and update the cohort object with the fetched values.
async function processCohort(cohort) {
  // Use Promise.all for all users in the cohort
  await Promise.all(
    cohort.users.map(async (user) => {
      // Fetch evaluation values asynchronously
      const evaluationValues = await Promise.all(
        (user.evaluation || []).map(async (evalId) => {
          // If evalId is not null, fetch the evaluation value
          if (evalId !== null) {
            return await Report.findById(evalId)
              .populate({
                path: 'userId',
                populate: [{ path: 'departmentId' }, { path: 'domainId' }],
              })
              .populate('moduleId');
            // Replace getEvaluationValue with your actual function
          } else {
            return null; // Keep null values as they are
          }
        }),
      );

      // Update the user's evaluation array with fetched values
      user.evaluation = evaluationValues;
    }),
  );

  return cohort;
}

/**
 * Retrieves the details of a cohort.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} - A promise that resolves to void.
 */
export const getCohortDetails = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'cohort/session-details/:sessionId',
    'start',
  );

  const { sessionId } = req.params;
  const cohort = await Cohort.findById(sessionId)
    .populate({
      path: 'users.id',
      model: 'user',
      select: 'name username',
    })
    .populate({
      path: 'modules',
      model: 'module',
      select: 'name thumbnail',
    })
    .populate({
      path: 'owner',
      model: 'user',
      select: 'name',
    })
    .lean();

  const modifiedCohort = await processCohort(cohort);

  performanceTracker.log(
    'cohort/session-details/:sessionId',
    'end',
    logId,
    logStart,
  );

  res.status(HttpStatusCode.OK).json({
    message: 'Cohort details',
    details: modifiedCohort,
  });
};

export const getPastCohorts = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'cohort/past',
    'start',
  );

  const { _id: userId } = req.user;
  const currentTimestamp = moment().unix();
  // Where the requesting user is either the attendee or the owner,
  //  where the cohort is over
  const cohorts = await Cohort.find({
    $or: [
      {
        users: {
          $elemMatch: {
            id: userId,
          },
        },
      },
      {
        owner: userId,
      },
    ],
    endDate: { $lte: currentTimestamp },
  })
    .populate({
      path: 'users.id',
      model: 'user',
      select: 'name username',
    })
    .populate({
      path: 'users.evaluation',
      model: 'report',
    })
    .populate({
      path: 'modules',
      model: 'module',
      select: 'name',
    })
    .populate({
      path: 'owner',
      model: 'user',
      select: 'name',
    });

  performanceTracker.log('cohort/past', 'end', logId, logStart);

  res.status(HttpStatusCode.OK).json({
    message: 'Past cohorts',
    details: cohorts,
  });
};

export const evaluationValidForCohort = async (cohortId, userId, moduleId) => {
  const cohort = await Cohort.findById(cohortId);
  if (!cohort) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Cohort not found',
    );
  }

  const user = cohort.users.find((user) => user.id.toString() == userId);
  if (!user) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'User not found in the cohort',
    );
  }

  const moduleIndex = cohort.modules.findIndex((id) => id == moduleId);
  if (moduleIndex === -1) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found in the cohort',
    );
  }
};

export const addEvaluationToCohort = async (
  cohortId,
  moduleId,
  userId,
  evaluationId,
) => {
  const cohort = await Cohort.findById(cohortId);

  const user = cohort.users.find((user) => user.id.toString() == userId);

  const moduleIndex = cohort.modules.findIndex((id) => id == moduleId);

  user.evaluation[moduleIndex] = evaluationId;
  await cohort.save();
};
