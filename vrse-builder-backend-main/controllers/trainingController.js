import _ from 'lodash';
import moment from 'moment-timezone';
import { HttpStatusCode, ROLES } from '../constants.js';
import { ModuleAccess } from '../models/ModuleAccessModel.js';
import { Module } from '../models/ModuleModel.js';
import { Training, TrainingStatus } from '../models/TrainingModel.js';
import { User } from '../models/UserModel.js';
import BaseError from '../utils/classes/BaseError.js';
import { createFilterQuery } from '../utils/helpers.js';
import {
  convertBasicTrainingFromJson,
  endTrainingJsonLifeCycleBased,
  evaluateTrainingMoments,
  getAdminDomainsIDs,
  getCompletedParticipants,
  getModuleJson,
  verifyOnRight,
} from '../utils/utils.js';
import { isValidId } from '../utils/validators/validIdCheck.js';
import { sendXAPIStatement } from '../utils/xapi.js';
import performanceTracker from '../utils/performanceLogger.js';

/**
 * Creates a new training.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with status and message.
 *
 * @throws {Error} If the module ID is not valid.
 * @throws {Error} If the module with the given ID is not found or is archived.
 * @throws {Error} If there is an error creating the new training.
 */
export const createTraining = async (req, res) => {
  const { moduleId } = req.params;
  isValidId(moduleId);

  const module = await Module.findById(moduleId);
  if (!module || module.archived) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ success: false, message: 'Module ID not found' });
  }

  if (module?.gameMode === 'multiplayer') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module has only multi-player mode',
    );
  }

  // Check this again with internet, and if it works replicate to evaluation also
  const moduleAccess = await ModuleAccess.find({
    $or: [{ departments: req.user.departmentId }, { users: req.user.id }],
    _id: module._id,
  });

  if (!moduleAccess) {
    return res.status(HttpStatusCode.NOT_FOUND).json({
      success: false,
      message: "User doesn't have access to this module.",
    });
  }

  let convertJsonData = {};

  if (module.evaluationType === 'jsonLifeCycle') {
    const files = req.files;
    let trainingJson = undefined;
    files.map((file) => {
      // Check the file.fieldname
      if (file.fieldname === 'trainingJson') {
        trainingJson = JSON.parse(file.buffer.toString('utf8'));
        return;
      }
    });
    if (!trainingJson) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Invalid training data',
      );
    }

    // const moduleTrainingJson = await getJsonFromS3(module.trainingJsonS3Url);
    // const moduleTrainingJson = await getModuleJson(moduleId, 'trainingJson');
    convertJsonData = convertBasicTrainingFromJson(trainingJson);

    const { devMode } = req.body;
    // const isEqual = _.isEqual(trainingJson, moduleTrainingJson);
    // For this scenario, we are not checking if the training json is equal to the module training json
    // if (!isEqual && !devMode) {
    //   return res.status(HttpStatusCode.BAD_REQUEST).json({
    //     success: false,
    //     message: 'Training Json does not match with the module training json',
    //   });
    // }
  }

  const newTraining = new Training({
    ...req.body,
    moduleId,
    trainingType: module.evaluationType,
    userId: req?.user?._id,
  });

  if (module.evaluationType === 'jsonLifeCycle') {
    newTraining.trainingDumpJson = convertJsonData;
  }
  await newTraining.save();

  sendXAPIStatement(newTraining, 'training');

  if (!newTraining) {
    return res
      .status(HttpStatusCode.INTERNAL_SERVER)
      .json({ success: false, message: 'Error creating new training' });
  }

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Training created',
    training: newTraining,
  });
};

/**
 * Ends a training.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with status and message.
 *
 * @throws {Error} If the training with the given ID is not found.
 *
 * @description
 * This function updates the status of a training to 'done' based on the provided training ID.
 * If the training is successfully updated, the function returns a success message.
 * If the training is not found, the function returns an error message.
 */
export const endTraining = async (req, res) => {
  let { endTime } = req.body;
  endTime = endTime ? endTime : moment().unix();
  const updatedTraining = await Training.findOneAndUpdate(
    { _id: req.params.id },
    { status: TrainingStatus.completed, endTime: endTime },
  );
  if (!updatedTraining) {
    return res
      .status(HttpStatusCode.INTERNAL_SERVER)
      .json({ success: false, message: 'Could not end the training' });
  }

  sendXAPIStatement(updatedTraining, 'training');

  res.status(HttpStatusCode.OK).json({ message: 'Training ended' });
};

export const getAllTraining = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'fetching all trainings',
    'start',
  );

  let { page, limit, sort = { createdAt: -1 }, filters } = req.query;
  const isExport = !page;

  const parsedFilters = createFilterQuery(filters);

  const baseQuery = {
    archived: { $ne: true },
    ...parsedFilters,
  };

  let finalQuery = {};

  switch (req?.user?.role) {
    case ROLES.ADMIN:
      const allAdminDomainsIDs = await getAdminDomainsIDs(req.user.domainId);
      const users = await User.find({
        domainId: { $in: allAdminDomainsIDs },
        _id: { $ne: req.user._id },
      });
      const userIds = users.map((user) => user._id);
      finalQuery = {
        ...baseQuery,
        'userId._id': { $in: userIds },
      };
      break;
    case ROLES.USER:
      finalQuery = {
        ...baseQuery,
        'userId._id': req.user._id,
      };
      break;
    default:
      finalQuery = baseQuery;
  }

  sort = _.isString(sort) ? JSON.parse(sort) : sort;

  // First, identify which trainings are multiplayer
  const multiplayerTrainingIds = await Training.find({
    ...finalQuery,
    isMultiplayer: true,
  }).distinct('_id');

  const totalCount = await Training.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userId',
      },
    },
    { $unwind: '$userId' },
    { $match: finalQuery },
    { $count: 'total' },
  ]);

  const totalDocs = totalCount[0]?.total || 0;

  const initialPipeline = [
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userId',
      },
    },
    { $unwind: '$userId' },
    { $match: finalQuery },
  ];

  sort = _.isString(sort) ? JSON.parse(sort) : sort;
  sort = Object.keys(sort).length === 0 ? { createdAt: -1 } : sort;

  initialPipeline.push({
    $sort: sort,
  });

  if (!isExport) {
    initialPipeline.push(
      { $sort: sort },
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: Math.min(parseInt(limit), 50) },
    );
  }

  const additionalPipeline = [
    {
      $lookup: {
        from: 'modules',
        let: { moduleId: '$moduleId' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$_id', '$$moduleId'] },
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
            },
          },
        ],
        as: 'moduleId',
      },
    },
    { $unwind: { path: '$moduleId', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'domains',
        localField: 'userId.domainId',
        foreignField: '_id',
        as: 'domainId',
      },
    },
    { $unwind: { path: '$domainId', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'departments',
        localField: 'userId.departmentId',
        foreignField: '_id',
        as: 'departmentId',
      },
    },
    { $unwind: { path: '$departmentId', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        'userId.domainId': '$domainId',
        'userId.departmentId': '$departmentId',
      },
    },

    // Lookup participants names
    {
      $lookup: {
        from: 'users',
        localField: 'participants',
        foreignField: '_id',
        as: 'participants',
      },
    },
    {
      $addFields: {
        participants: {
          $map: {
            input: '$participants',
            as: 'p',
            in: '$$p.name',
          },
        },
      },
    },

    // Lookup completedParticipants names
    {
      $lookup: {
        from: 'users',
        localField: 'completedParticipants',
        foreignField: '_id',
        as: 'completedParticipants',
      },
    },
    {
      $addFields: {
        completedParticipants: {
          $map: {
            input: '$completedParticipants',
            as: 'cp',
            in: '$$cp.name',
          },
        },
      },
    },
  ];

  // Add lookup for event userIds in multiplayer sessions
  if (multiplayerTrainingIds.length > 0) {
    additionalPipeline.push(
      {
        $lookup: {
          from: 'users',
          localField: 'answers.jsonLifeCycleBased.events.userId',
          foreignField: '_id',
          as: 'eventUsers',
        },
      },
      {
        $addFields: {
          answers: {
            $cond: [
              { $in: ['$_id', multiplayerTrainingIds] },
              {
                jsonLifeCycleBased: {
                  $map: {
                    input: '$answers.jsonLifeCycleBased',
                    as: 'answer',
                    in: {
                      $mergeObjects: [
                        '$$answer',
                        {
                          events: {
                            $map: {
                              input: '$$answer.events',
                              as: 'event',
                              in: {
                                $mergeObjects: [
                                  '$$event',
                                  {
                                    userId: {
                                      $cond: [
                                        { $eq: ['$$event.userId', null] },
                                        null,
                                        {
                                          $arrayElemAt: [
                                            {
                                              $filter: {
                                                input: '$eventUsers',
                                                as: 'user',
                                                cond: {
                                                  $eq: [
                                                    '$$user._id',
                                                    '$$event.userId',
                                                  ],
                                                },
                                              },
                                            },
                                            0,
                                          ],
                                        },
                                      ],
                                    },
                                  },
                                ],
                              },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
              '$answers',
            ],
          },
        },
      },
    );
  }

  // Final project stage
  additionalPipeline.push({
    $project: {
      domainId: 0,
      departmentId: 0,
      eventUsers: 0,
    },
  });

  // Stats aggregation remains the same
  let stats = await Training.aggregate([
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'userId',
      },
    },
    { $unwind: '$userId' },
    { $match: finalQuery },
    {
      $group: {
        _id: null,
        totalTrainings: { $sum: 1 },
        pendingTrainings: {
          $sum: { $cond: [{ $in: ['$status', ['pending', 'ongoing']] }, 1, 0] },
        },
        uniqueUsers: { $addToSet: '$userId._id' },
      },
    },
    {
      $project: {
        totalTrainings: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
        pendingTrainings: 1,
        incompletionRate: {
          $multiply: [
            {
              $divide: ['$pendingTrainings', '$totalTrainings'],
            },
            100,
          ],
        },
      },
    },
  ]);

  if (isExport) {
    try {
      const batchSize = 800;
      let skip = 0;
      let allDocs = [];
      let hasMoreData = true;

      while (hasMoreData) {
        const batchPipeline = [
          ...initialPipeline,
          { $skip: skip },
          { $limit: batchSize },
          ...additionalPipeline,
        ];
        const batch = await Training.aggregate(batchPipeline).allowDiskUse(
          true,
        );

        if (batch.length === 0) {
          hasMoreData = false;
          continue;
        }

        allDocs = allDocs.concat(batch);

        skip += batchSize;

        if (batch.length < batchSize) {
          hasMoreData = false;
        }
      }

      const exportResponse = {
        message: 'All trainings',
        trainings: {
          docs: allDocs,
          totalDocs: totalDocs,
          limit: totalDocs,
          totalPages: 1,
          page: 1,
          pagingCounter: 1,
          hasPrevPage: false,
          hasNextPage: false,
          prevPage: null,
          nextPage: null,
        },
        stats: stats?.[0] || {},
      };
      performanceTracker.log('fetching all trainings', 'end', logId, logStart);

      return res.json(exportResponse);
    } catch (error) {
      performanceTracker.log('fetching all trainings', 'end', logId, logStart);

      console.error('Export error:', error);
      return res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
        message: 'Error exporting trainings',
        error: error.message,
      });
    }
  }

  const fullPipeline = [...initialPipeline, ...additionalPipeline];

  const docs = await Training.aggregate(fullPipeline).allowDiskUse(true);

  limit = Math.min(parseInt(limit), 50);
  const currentPage = parseInt(page);
  const totalPages = Math.ceil(totalDocs / limit);
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  const prevPage = hasPrevPage ? currentPage - 1 : null;
  const nextPage = hasNextPage ? currentPage + 1 : null;

  const trainings = {
    docs,
    totalDocs,
    limit,
    totalPages,
    page: currentPage,
    pagingCounter: (currentPage - 1) * limit + 1,
    hasPrevPage,
    hasNextPage,
    prevPage,
    nextPage,
  };

  return res.status(HttpStatusCode.OK).json({
    message: 'All trainings',
    trainings,
    stats: stats?.[0],
  });
};

export const submitJsonLifecycle = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const training = await Training.findById(id)
    .populate('moduleId')
    .populate('userId');
  // Check if it's multiplayer and populate event userIds if so
  if (training.isMultiplayer) {
    await training.populate({
      path: 'answers.jsonLifeCycleBased.events.userId',
      select: 'name username',
    });
  }

  if (!training) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ success: false, message: 'Training not found' });
  }

  if (training.endTime) {
    if (!training.isMultiplayer) {
      return res
        .status(HttpStatusCode.BAD_REQUEST)
        .json({ success: false, message: 'Training already ended' });
    } else {
      return res.status(HttpStatusCode.OK).json({
        message: `Session is already ended, so this submit won't affect`,
        details: training,
      });
    }
  }

  if (training.trainingType !== 'jsonLifeCycle') {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: 'Invalid training type' });
  }

  console.log('reached here');
  const {
    chapterIndex,
    momentIndex,
    events,
    startTime,
    endTime = false,
  } = req.body;

  const onRightEvents = events.filter((event) => event.eventType === 'onRight');
  const onWrongEvents = events.filter((event) => event.eventType === 'onWrong');
  const onMomentCompleteEvent = events.filter(
    (event) => event.eventType === 'onMomentComplete',
  );

  console.log('reached here 2');
  console.log('onRightEvent', onRightEvents);

  if (onRightEvents.length === 0 || verifyOnRight(onRightEvents) === false) {
    if (onMomentCompleteEvent.length === 0) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Invalid onRight object',
      );
    }
  }

  if (onWrongEvents.length > 0 && verifyOnRight(onWrongEvents) === false) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid onWrong object',
    );
  }

  const result = await evaluateTrainingMoments(
    training.trainingDumpJson,
    {
      chapterIndex,
      momentIndex,
      onRight: onRightEvents,
      onWrong: onWrongEvents,
      onMomentComplete: onMomentCompleteEvent,
      startTime,
      events,
    },
    training,
  );

  // Handle the case where a moment/chapter was already submitted
  if (result.alreadySubmitted) {
    return res.status(HttpStatusCode.OK).json({
      message: result.message,
      details: result.data,
    });
  }

  // If successful, continue with your existing logic
  training.trainingDumpJson = result.data;

  if (endTime) {
    training.endTime = endTime;
    training.trainingDumpJson.endTime = endTime;
    training.status = TrainingStatus.completed;
    if (training.isMultiplayer) {
      training.completedParticipants = getCompletedParticipants(training);
    }
  }
  // If in case the unity didnt send endTime, but it was the last moment in the last chapter
  if (training.trainingDumpJson.endTime) {
    training.endTime = training.trainingDumpJson.endTime;
    training.status = TrainingStatus.completed;
  }

  // if (training.isMultiplayer) {
  //   training.answers.jsonLifeCycleBased.push({
  //     chapterIndex,
  //     momentIndex,
  //     events,
  //     startTime,
  //     userId,
  //   });
  // }

  const userUpdatedEvents = events.map((event) => ({
    ...event,
    userId: userId,
  }));

  // Check if an entry for this chapter/moment already exists in the answers array
  const existingAnswerIndex = training.answers.jsonLifeCycleBased.findIndex(
    (answer) =>
      answer.chapterIndex === chapterIndex &&
      answer.momentIndex === momentIndex,
  );

  if (existingAnswerIndex !== -1) {
    // If an entry exists, update its events instead of creating a new one
    training.answers.jsonLifeCycleBased[existingAnswerIndex].events = [
      ...training.answers.jsonLifeCycleBased[existingAnswerIndex].events,
      ...userUpdatedEvents,
    ];
  } else {
    // If no entry exists, create a new one
    const newAnswer = {
      chapterIndex,
      momentIndex,
      events: userUpdatedEvents,
      startTime,
    };
    training.answers.jsonLifeCycleBased.push(newAnswer);
  }

  await training.save();
  if (training.endTime) {
    return res.status(HttpStatusCode.OK).json({
      message: 'Answer submitted and Training ended',
      details: training,
    });
  }
  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Training submitted',
    training,
  });

  // 66a6822d9a4106ea512d224b
};

export const endJsonTraining = async (req, res) => {
  const { id } = req.params;
  const training = await Training.findById(id)
    .populate('moduleId')
    .populate('userId');

  if (!training) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ success: false, message: 'Training not found' });
  }

  if (training.endTime) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: 'Training already ended' });
  }

  const { endTime } = req.body;

  training.endTime = endTime;
  training.status = TrainingStatus.completed;

  console.log(training.trainingDumpJson, 'training.trainingDumpJson');

  training.trainingDumpJson = endTrainingJsonLifeCycleBased(
    training.trainingDumpJson,
    endTime,
  );

  if (training.isMultiplayer) {
    training.completedParticipants = getCompletedParticipants(training);
  }

  await training.save();

  sendXAPIStatement(training, 'training');

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Training ended',
    training,
  });
};

export const getUserTrainings = async (req, res) => {
  const { userId } = req.params;
  const user = await User.findById(userId);
  if (!user) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ success: false, message: 'User not found' });
  }

  const trainings = await Training.find({
    userId: { $in: userId },
    archived: { $ne: true },
  })
    .populate('moduleId')
    .populate({
      path: 'userId',
      populate: [{ path: 'departmentId' }, { path: 'domainId' }],
    });
  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'User trainings',
    trainings,
  });
};

export const getTrainingById = async (req, res) => {
  const { trainingId } = req.params;

  // First, check if the training is multiplayer
  const isMultiplayer = await Training.exists({
    _id: trainingId,
    isMultiplayer: true,
  });

  // Create the base query
  let query = Training.findById(trainingId)
    .populate('moduleId')
    .populate({
      path: 'userId',
      populate: [{ path: 'departmentId' }, { path: 'domainId' }],
    })
    .populate({
      path: 'participants',
      select: 'name',
    })
    .populate({
      path: 'completedParticipants',
      select: 'name',
    });

  // Add population for event userIds if it's a multiplayer session
  if (isMultiplayer) {
    query = query.populate({
      path: 'answers.jsonLifeCycleBased.events.userId',
      select: 'name username',
    });
  }

  const training = await query;
  console.log(training, 'kkkkkkkkkkkkkkkkkkkkkkk');

  if (!training) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ success: false, message: 'Training not found' });
  }

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Training details',
    details: training,
  });
};
export const archiveTraining = async (req, res) => {
  const { id } = req.params;

  const training = await Training.findById(id);
  if (!training) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Evaluation not found',
    );
  }

  await Training.updateOne({ _id: id }, { archived: true });

  return res.status(HttpStatusCode.OK).json({
    message: 'Evaluation archived',
    details: {
      id: training.id,
      name: training.name,
    },
  });
};
