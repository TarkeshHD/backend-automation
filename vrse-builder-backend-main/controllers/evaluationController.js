import moment from 'moment-timezone';

import _ from 'lodash';
import { CONF, HttpStatusCode, ROLES } from '../constants.js';
import { Module } from '../models/ModuleModel.js';
import { Report } from '../models/ReportModel.js';
import { User } from '../models/UserModel.js';
import BaseError from '../utils/classes/BaseError.js';
import { createFilterQuery, getVrSessionTime } from '../utils/helpers.js';
import {
  calculateScore,
  convertBasicReportFromJson,
  endJsonLifeCycleBased,
  evaluateMoments,
  getAdminDomainsIDs,
  getCompletedParticipants,
  getModuleJson,
  verifyOnRight,
} from '../utils/utils.js';
import { sendXAPIStatement } from '../utils/xapi.js';
import { addEvaluationToCohort } from './cohortController.js';
import { addFailureMomentCountInModule } from './moduleController.js';
import performanceTracker from '../utils/performanceLogger.js';
/**
 * Creates a new evaluation session for a module.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the new evaluation session details.
 * @throws {BaseError} If the module is not found or is archived.
 * @throws {BaseError} If the module evaluation type does not match the mode.
 * @throws {BaseError} If the question action evaluation is not enabled.
 */
export const createEvaluation = async (req, res) => {
  const { moduleId } = req.params;

  // Get the module with evaluation
  const module = await Module.findById(moduleId).populate('evaluation');
  // Check if the module exists
  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }

  if (module?.gameMode === 'multiplayer') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module has only multi player mode',
    );
  }

  const { mode, cohortId, devMode = false } = req.body;

  // Define groups of compatible evaluation types and modes
  const compatibility = {
    time: ['mcq', 'questionAction', 'jsonLifeCycle'],
    question: ['time', 'questionAction', 'jsonLifeCycle'],
    questionAction: ['time', 'mcq', 'jsonLifeCycle'],
    jsonLifeCycle: ['time', 'mcq', 'questionAction'],
  };

  // Check if the current mode is incompatible with the module's evaluation type

  if (compatibility[module.evaluationType].includes(mode)) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module evaluation type does not match the mode',
    );
  }

  if (
    module.evaluationType === 'questionAction' &&
    CONF.features?.questionActionEvaluation?.state !== 'on'
  ) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Question Action evaluation is not enabled',
    );
  }
  if (module.evaluationType === 'jsonLifeCycle' && mode !== 'jsonLifeCycle') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module evaluation type does not match the mode',
    );
  }

  let convertedJsonData = null;

  if (module.evaluationType === 'jsonLifeCycle') {
    const files = req.files;
    let evaluationJson = undefined;
    files.map((file) => {
      // chekc the file.fieldname
      if (file.fieldname === 'evaluationJson') {
        evaluationJson = JSON.parse(file.buffer.toString('utf8'));
        return;
      }
    });

    if (!evaluationJson) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Evaluation Json not found',
      );
    }

    // const moduleEvaluationJson = await getModuleJson(
    //   moduleId,
    //   'evaluationJson',
    // );

    convertedJsonData = convertBasicReportFromJson(evaluationJson);
    // const isEqual = _.isEqual(evaluationJson, moduleEvaluationJson);
    // if (!isEqual && !devMode) {
    //   throw new BaseError(
    //     'ServerError',
    //     HttpStatusCode.BAD_REQUEST,
    //     'Evaluation Json does not match the module evaluation json',
    //   );
    // }
  }

  // Set the passing criteria according to the mode
  const generatePassingCriteria = (mode, module) => {
    let passingCriteria = {};
    if (mode === 'mcq' || mode === 'questionAction') {
      passingCriteria.passPercentage = module?.passPercentage || 60;
    } else if (mode === 'time') {
      passingCriteria.mistakesAllowed = module.evaluation[0]?.mistakesAllowed;
    } else if (mode === 'jsonLifeCycle') {
      passingCriteria.passMark = convertedJsonData?.passMark || 0;
    }
    return passingCriteria;
  };

  const passingCriteria = generatePassingCriteria(mode, module);

  // check if the cohortId exist, if it exist. Pass cohortId to cohort controller to validate cohort required fields.
  // const { _id: userId } = req.user;
  // if (cohortId) {
  //   await evaluationValidForCohort(cohortId, userId, module.id);
  // }

  const newReport = new Report({
    moduleId,
    userId: req?.user?._id,
    mode,
    passingCriteria,
    ...(cohortId && { cohortId }), // If cohortId is truthy, include { cohortId } in the object
  });

  if (module.evaluationType === 'jsonLifeCycle') {
    newReport.evaluationDump.jsonLifeCycleBased = convertedJsonData;
  }
  await newReport.save();

  if (cohortId) {
    // add to the cohort specific user evaluation field, the current evaluation field
    await addEvaluationToCohort(cohortId, module.id, userId, newReport._id);
  }

  sendXAPIStatement(newReport, 'evaluation');

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'New evaluation/session created', details: newReport });
};

/**
 * Migrates passing criteria for all reports.
 *
 * This function retrieves all reports and updates their passing criteria based on their evaluation mode.
 * For reports with mode 'time', the passing criteria is set to the mistakes allowed from the evaluation dump if the report has an end time,
 * otherwise it is set to the mistakes allowed from the first evaluation of the module.
 * For reports with mode 'mcq', the passing criteria is set to a pass percentage of 60.
 * The evaluation dump and answers for the respective modes are set to null.
 * If the report's answers for the mcq mode have an answer key of [null], it is deleted.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object with a success message.
 */
export const migratePassing = async (req, res) => {
  // Migration controls, for adding passing criteria to all reports
  const reports = await Report.find({}).populate('evaluationDump');
  reports.forEach(async (report) => {
    if (report.mode === 'time') {
      const module = await Module.findById(report.moduleId).populate(
        'evaluation',
      );
      report.passingCriteria.mistakesAllowed = report.endTime
        ? report.evaluationDump.timeBased.mistakesAllowed
        : module.evaluation[0].mistakesAllowed;
      // Make the eval dump mcqBased and answers mcqBased null
      report.evaluationDump.mcqBased = null;
      report.answers.mcqBased = null;
    } else if (report.mode === 'mcq') {
      report.passingCriteria.passPercentage = 60;
      // Make the eval dump timebased  and answers timeBased null
      report.evaluationDump.timeBased = null;
      report.answers.timeBased = null;
      // Also check if the report.answers.mcqBased.answerKey is [null], if so, delete it
      if (report.answers.mcqBased.answerKey[0] === null) {
        report.answers.mcqBased.answerKey = null;
      }
    }
    await report.save();
  });
  return res.status(HttpStatusCode.OK).json({ message: 'Migration done' });
};

/**
 * Submits a question for evaluation.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with a success message and the updated report details.
 * @throws {BaseError} If the report is not found, the session is already ended, or the session is not a question session.
 */
export const submitQuestion = async (req, res) => {
  const { id } = req.params;
  const report = await Report.findById(id);
  if (!report || report.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Report not found',
    );
  }
  if (report.endTime) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'This session was ended, contact admin!',
    );
  }

  if (report.mode !== 'mcq') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'This session is not a question session!',
    );
  }

  const { question, answer, isLast, endTime } = req.body;

  if (isLast) {
    // Check if submitted time is greater than the start time
    if (endTime < report.startTime) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Invalid time: Ending time cannot be less than start time',
      );
    }
    report.endTime = endTime; // Unix timestamp
  }

  report.evaluationDump.mcqBased.push(question);
  if (!Array.isArray(report.answers.mcqBased.answerKey)) {
    report.answers.mcqBased.answerKey = [];
  }
  ``;

  report.answers.mcqBased.answerKey.push(answer);

  report.answers.mcqBased.score = calculateScore(
    report.answers.mcqBased.score || 0,
    answer === question.answer,
  );

  // Validate before moving forward so wecan reduce risk of failures and saving wrong values
  await report.validate({});

  await report.save();

  if (isLast) {
    sendXAPIStatement(report, 'evaluation');
  }

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Answer submitted', details: report });
};

/**
 * Submits a time-based assessment for a report.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with a success message and the updated report details.
 * @throws {BaseError} If the report is not found, the session has already ended, or the session is not a time session.
 * @throws {BaseError} If the submitted time is invalid.
 */
export const submitTime = async (req, res) => {
  const { id } = req.params;
  const report = await Report.findById(id);

  if (!report || report.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Report not found',
    );
  }
  if (report.endTime) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'This session was ended, contact admin!',
    );
  }

  if (report.mode !== 'time') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'This session is not a time session!',
    );
  }

  const { mistakes, time, endTime } = req.body;

  // Check if submitted time is not greater than the current time as well as greater than the start time
  if (endTime < report.startTime) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid time: Ending time cannot be less than start time',
    );
  }

  report.endTime = endTime; // Unix timestamp
  report.answers.timeBased.mistakes = mistakes;
  report.answers.timeBased.timeTaken = endTime - report.startTime;

  report.evaluationDump.timeBased = time;

  const timeTakenToComplete = endTime - report.startTime;
  const score =
    timeTakenToComplete <= time.goldTimeLimit
      ? 'gold'
      : timeTakenToComplete <= time.silverTimeLimit
      ? 'silver'
      : 'bronze';

  report.answers.timeBased.score = score;

  // Validate before moving forward so we can reduce risk of failures and saving wrong values
  await report.validate({});

  await report.save();

  if (report.endTime) {
    sendXAPIStatement(report, 'evaluation');
  }

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Time assessment submitted', details: report });
};

/**
 * Submits a question and action based session evaluation.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with a success message and the updated report details.
 * @throws {BaseError} If the report is not found or is archived, or if the session is not a question and action based session.
 * @throws {BaseError} If the session is ended or if the answer is invalid for the question or action type.
 * @throws {BaseError} If the time required for the session is not provided or is negative.
 * @throws {BaseError} If the submitted time is invalid.
 */
export const submitQuestionAction = async (req, res) => {
  const { id } = req.params;
  const report = await Report.findById(id);
  if (!report || report.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Report not found',
    );
  }
  if (report.endTime) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'This session was ended, contact admin!',
    );
  }

  if (report.mode !== 'questionAction') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'This session is not a question and action based session!',
    );
  }

  const { questionAction, answer, isLast, endTime } = req.body;
  if (
    questionAction.type === 'question' &&
    !['a', 'b', 'c', 'd'].includes(answer)
  ) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid answer for question type',
    );
  } else if (
    questionAction.type === 'action' &&
    !['success', 'failure'].includes(answer)
  ) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid answer for action type',
    );
  }

  if (questionAction.timeRequired && !questionAction.timeTaken >= 0) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Time required for question and action based session!',
    );
  }

  if (isLast) {
    // Check if submitted time is not greater than the start time

    if (endTime < report.startTime) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Invalid time: Ending time cannot be less than start time',
      );
    }
    report.endTime = endTime; // Unix timestamp
  }

  report.evaluationDump.questionActionBased.push(questionAction);
  if (!Array.isArray(report.answers.questionActionBased.answerKey)) {
    report.answers.questionActionBased.answerKey = [];
  }
  report.answers.questionActionBased.answerKey.push(answer);

  // Usage within your code context
  report.answers.questionActionBased.score = calculateScore(
    report.answers.questionActionBased.score || 0,
    answer === questionAction.answer,
    questionAction.timeTaken,
    questionAction.timeRequired,
    questionAction.weightage || 1,
  );

  // Validate before moving forward so wecan reduce risk of failures and saving wrong values
  await report.validate({});

  await report.save();

  if (isLast) {
    sendXAPIStatement(report, 'evaluation');
  }
  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Answer submitted', details: report });
};

export const submitJsonLifecycle = async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const report = await Report.findById(id)
    .populate('moduleId')
    .populate('userId');

  // Check if it's multiplayer and populate event userIds if so
  if (report.isMultiplayer) {
    await report.populate({
      path: 'answers.jsonLifeCycleBased.events.userId',
      select: 'name username',
    });
  }
  if (!report || report.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Report not found',
    );
  }
  if (report.endTime) {
    if (!report.isMultiplayer) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'This session was ended, contact admin!',
      );
    } else {
      return res.status(HttpStatusCode.OK).json({
        message: `Session is already ended, so this submit won't affect`,
        details: report,
      });
    }
  }

  const isMultiplayer = report.isMultiplayer;

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

  const module = await Module.findById(report.moduleId);

  module.momentCount = addFailureMomentCountInModule(
    module,
    chapterIndex,
    momentIndex,
    onWrongEvents,
    report.userId?._id,
  );
  if (report.isMultiplayer) {
    if (report?.storyStartTime && report.storyStartTime === 0) {
      throw new BaseError(
        'SessionError',
        HttpStatusCode.BAD_REQUEST,
        `Story mode hasn't started for this session`,
      );
    }
  }

  const result = await evaluateMoments(
    report.evaluationDump.jsonLifeCycleBased,
    {
      chapterIndex,
      momentIndex,
      onRight: onRightEvents,
      onWrong: onWrongEvents,
      onMomentComplete: onMomentCompleteEvent,
      startTime,
    },
    report,
  );

  if (result.alreadySubmitted) {
    return res.status(HttpStatusCode.OK).json({
      message: result.message,
      details: report,
    });
  }

  report.evaluationDump.jsonLifeCycleBased = result.data;
  // If in case the unity didn't send endTime, but it was the last moment in the last chapter
  if (
    chapterIndex ===
      report?.evaluationDump?.jsonLifeCycleBased?.chapters?.length - 1 && // Last chapter
    momentIndex ===
      report?.evaluationDump?.jsonLifeCycleBased?.chapters[chapterIndex]
        ?.moments?.length -
        1 && // Last moment
    !endTime
  ) {
    report.endTime = moment().unix();
  }

  if (endTime || report.endTime) {
    if (endTime) {
      report.endTime = endTime;
      report.evaluationDump.jsonLifeCycleBased.endTime = endTime;
    }

    // Check if multiplayer and it's the final submission
    if (isMultiplayer) {
      // // Collect users who exited or joined
      // const userEvents = report.answers.jsonLifeCycleBased.flatMap((answer) =>
      //   answer.events.filter(
      //     (event) =>
      //       event.eventType === 'joined' || event.eventType === 'exited',
      //   ),
      // );

      // // Find completed participants (those who didn't exit)
      // const completedParticipantIds = report.participants.filter(
      //   (participantId) =>
      //     !userEvents.some(
      //       (event) =>
      //         event.userId.toString() === participantId.toString() &&
      //         event.eventType === 'exited',
      //     ),
      // );

      // // Update completedParticipants
      // report.completedParticipants = completedParticipantIds;

      // Update completedParticipants using the new utility function
      report.completedParticipants = getCompletedParticipants(report);
    }

    // Check if the status is still pending and the totalScored is greater than or equal to the passMark
    if (
      report.evaluationDump.jsonLifeCycleBased.status === 'pending' &&
      report.evaluationDump.jsonLifeCycleBased.totalScored >=
        report.evaluationDump.jsonLifeCycleBased.passMark
    ) {
      report.evaluationDump.jsonLifeCycleBased.status = 'pass';
    } else if (
      report.evaluationDump.jsonLifeCycleBased.status === 'pending' &&
      report.evaluationDump.jsonLifeCycleBased.totalScored <
        report.evaluationDump.jsonLifeCycleBased.passMark
    ) {
      report.evaluationDump.jsonLifeCycleBased.status = 'fail';
    }
  }

  const userUpdatedEvents = events.map((event) => ({
    ...event,
    userId: userId,
  }));

  // Check if an entry for this chapter/moment already exists in the answers array
  const existingAnswerIndex = report.answers.jsonLifeCycleBased.findIndex(
    (answer) =>
      answer.chapterIndex === chapterIndex &&
      answer.momentIndex === momentIndex,
  );
  if (existingAnswerIndex !== -1) {
    // If an entry exists, update its events instead of creating a new one
    report.answers.jsonLifeCycleBased[existingAnswerIndex].events = [
      ...report.answers.jsonLifeCycleBased[existingAnswerIndex].events,
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
    report.answers.jsonLifeCycleBased.push(newAnswer);
  }

  await report.save();
  await module.save();
  if (report.endTime) {
    return res.status(HttpStatusCode.OK).json({
      message: 'Answer submitted and Evaluation ended',
      details: report,
    });
  }
  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Answer submitted', details: report });
};

export const endJsonLifeCycle = async (req, res) => {
  const { id } = req.params;
  const report = await Report.findById(id)
    .populate('moduleId')
    .populate('userId');
  if (!report || report.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Report not found',
    );
  }
  if (report.endTime) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'This session was ended, contact admin!',
    );
  }

  const endTime = req.body.endTime;

  report.endTime = endTime;

  report.evaluationDump.jsonLifeCycleBased = await endJsonLifeCycleBased(
    report.evaluationDump.jsonLifeCycleBased,
    endTime,
  );

  if (report.isMultiplayer) {
    report.completedParticipants = getCompletedParticipants(report);
  }

  await report.save();

  if (endTime) {
    sendXAPIStatement(report, 'evaluation');
  }

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Answer submitted', details: report });
};

/**
 * Retrieves all evaluations.
 *
 * This function retrieves all evaluations based on the user's role. If the user is an admin, it retrieves evaluations for all trainees under their domain. If the user is a product admin or super admin, it retrieves all evaluations.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object containing the evaluations.
 *
 * @throws {BaseError} If the user is not authorized to access the evaluations.
 * @throws {BaseError} If there is an error retrieving the evaluations.
 *
 * @example
 * // Request
 * GET /evaluations
 *
 * // Response
 * {
 *   "message": "All evaluations",
 *   "details": [
 *     {
 *       "userId": "123",
 *       "moduleId": "456",
 *       "departmentId": "789",
 *       "domainId": "012",
 *       "archived": false,
 *       ...
 *     },
 *     ...
 *   ]
 *
 */
export const getAllEvaluation = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'fetching all evaluations',
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
      // Find all trainees of a domain and send their report
      const allAdminDomainsIDs = await getAdminDomainsIDs(req.user.domainId);
      const users = await User.find({
        domainId: { $in: allAdminDomainsIDs },
        _id: { $ne: req.user._id },
      });
      const userIds = users.map((user) => user._id);
      // Find evaluations for this trainee that are under this admin
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
      // Product Admin and Super Admin send all reports
      finalQuery = baseQuery;
  }

  // First, identify which reports are multiplayer
  const multiplayerReportIds = await Report.find({
    ...finalQuery,
    isMultiplayer: true,
  }).distinct('_id');

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
    {
      $project: {
        _id: 1,
        moduleId: 1,
        startTime: 1,
        endTime: 1,
        duration: 1,
        score: 1,
        status: 1,
        'userId._id': 1,
        'userId.name': 1,
        'userId.username': 1,
        'userId.domainId': 1,
        'userId.departmentId': 1,
        'userId.archived': 1,
        createdAt: 1,
        mode: 1,
        isMultiplayer: 1,
        answers: 1,
        archived: 1,
      },
    },
    { $match: finalQuery },
  ];

  sort = _.isString(sort) ? JSON.parse(sort) : sort;
  sort = Object.keys(sort).length === 0 ? { createdAt: -1 } : sort;

  initialPipeline.push({
    $sort: sort,
  });

  if (!isExport) {
    initialPipeline.push(
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
        as: 'domainLookup',
      },
    },
    { $unwind: { path: '$domainLookup', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'departments',
        localField: 'userId.departmentId',
        foreignField: '_id',
        as: 'departmentLookup',
      },
    },
    {
      $unwind: { path: '$departmentLookup', preserveNullAndEmptyArrays: true },
    },
    {
      $addFields: {
        'userId.domainId': {
          _id: '$domainLookup._id',
          name: '$domainLookup.name',
          archived: '$domainLookup.archived',
        },
        'userId.departmentId': {
          _id: '$departmentLookup._id',
          name: '$departmentLookup.name',
          archived: '$departmentLookup.archived',
        },
      },
    },
  ];

  // Add lookup for user IDs in answers only for multiplayer reports
  if (multiplayerReportIds.length > 0) {
    additionalPipeline.push(
      {
        $lookup: {
          from: 'users',
          let: {
            reportId: '$_id',
            jsonLifeCycleBasedEvents: {
              $reduce: {
                input: { $ifNull: ['$answers.jsonLifeCycleBased', []] },
                initialValue: [],
                in: {
                  $concatArrays: [
                    '$$value',
                    {
                      $map: {
                        input: '$$this.events',
                        as: 'event',
                        in: '$$event.userId',
                      },
                    },
                  ],
                },
              },
            },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    {
                      $in: [
                        '$_id',
                        { $ifNull: ['$$jsonLifeCycleBasedEvents', []] },
                      ],
                    },
                    { $in: ['$$reportId', multiplayerReportIds] },
                  ],
                },
              },
            },
          ],
          as: 'answerUsers',
        },
      },
      {
        $addFields: {
          answers: {
            $cond: [
              { $in: ['$_id', multiplayerReportIds] },
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
                                                input: '$answerUsers',
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
                timeBased: '$answers.timeBased',
                mcqBased: '$answers.mcqBased',
                questionActionBased: '$answers.questionActionBased',
              },
              '$answers',
            ],
          },
        },
      },
    );
  }

  additionalPipeline.push({
    $project: {
      domainLookup: 0,
      departmentLookup: 0,
      answerUsers: 0,
    },
  });

  let stats = await Report.aggregate([
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
        totalEvaluations: { $sum: 1 },
        pendingEvaluations: {
          $sum: { $cond: [{ $in: ['$status', ['pending', 'ongoing']] }, 1, 0] },
        },
        passedEvaluations: {
          $sum: { $cond: [{ $in: ['$status', ['pass', 'passed']] }, 1, 0] },
        },
        failedEvaluations: {
          $sum: { $cond: [{ $eq: ['$status', 'fail'] }, 1, 0] },
        },
        uniqueUsers: { $addToSet: '$userId._id' },
      },
    },
    {
      $project: {
        totalEvaluations: 1,
        passedEvaluations: 1,
        pendingEvaluations: 1,
        uniqueUsers: { $size: '$uniqueUsers' },
        passPercentage: {
          $cond: [
            {
              $gt: [
                { $subtract: ['$totalEvaluations', '$pendingEvaluations'] },
                0,
              ],
            },
            {
              $multiply: [
                {
                  $divide: [
                    '$passedEvaluations',
                    { $subtract: ['$totalEvaluations', '$pendingEvaluations'] },
                  ],
                },
                100,
              ],
            },
            0,
          ],
        },
        incompletionRate: {
          $cond: [
            { $gt: ['$totalEvaluations', 0] },
            {
              $multiply: [
                {
                  $divide: ['$pendingEvaluations', '$totalEvaluations'],
                },
                100,
              ],
            },
            0,
          ],
        },
      },
    },
  ]);

  if (isExport) {
    try {
      const batchSize = 800;
      let skip = 0;
      let hasMoreData = true;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Transfer-Encoding', 'chunked');

      res.write('{"message":"All evaluations","evaluations":{"docs":[');

      let isFirstChunk = true;

      while (hasMoreData) {
        const batchPipeline = [
          ...initialPipeline,
          { $skip: skip },
          { $limit: batchSize },
          ...additionalPipeline,
        ];
        const batch = await Report.aggregate(batchPipeline).allowDiskUse(true);

        if (batch.length === 0) {
          hasMoreData = false;
          continue;
        }

        // Add comma between chunks if not the first chunk
        if (!isFirstChunk) {
          res.write(',');
        }
        isFirstChunk = false;

        res.write(JSON.stringify(batch).slice(1, -1)); // Remove the outer array brackets

        skip += batchSize;

        if (batch.length < batchSize) {
          hasMoreData = false;
        }
      }

      const totalCount = await Report.countDocuments(finalQuery);

      res.write(
        `],"totalDocs":${totalCount},"limit":${totalCount},"totalPages":1,"page":1,"pagingCounter":1,"hasPrevPage":false,"hasNextPage":false,"prevPage":null,"nextPage":null},"stats":${JSON.stringify(
          stats?.[0] || {},
        )}}`,
      );

      return res.end();
    } catch (error) {
      performanceTracker.log(
        'fetching all evaluations',
        'end',
        logId,
        logStart,
      );

      console.error('Export error:', error);
      return res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json({
        message: 'Error exporting evaluations',
        error: error.message,
      });
    }
  }

  const fullPipeline = [...initialPipeline, ...additionalPipeline];

  const docs = await Report.aggregate(fullPipeline).allowDiskUse(true);

  limit = Math.min(parseInt(limit), 50);
  const currentPage = parseInt(page);
  const totalCount = await Report.aggregate([
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
  const totalPages = Math.ceil(totalDocs / limit);
  const hasPrevPage = currentPage > 1;
  const hasNextPage = currentPage < totalPages;
  const prevPage = hasPrevPage ? currentPage - 1 : null;
  const nextPage = hasNextPage ? currentPage + 1 : null;

  const evaluations = {
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
    message: 'All evaluations',
    evaluations,
    stats: stats?.[0],
  });
};

/**
 * Retrieves the evaluations for a specific user.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response containing the user evaluations, user details, and total VR session time.
 *
 * @throws {BaseError} If the evaluation is not found.
 */
export const getEvaluationForUser = async (req, res) => {
  const { userId } = req.params;

  const [evaluation, user] = await Promise.all([
    Report.find({
      userId,
      archived: { $ne: true },
    })
      .populate({
        path: 'userId',
        populate: [{ path: 'departmentId' }, { path: 'domainId' }],
      })
      .populate('moduleId'),
    User.findById(userId),
  ]);

  const totalVrSessionTime = await getVrSessionTime(userId);

  return res.status(HttpStatusCode.OK).json({
    message: 'User evaluations',
    details: evaluation,
    user,
    totalVrSessionTime,
  });
};

/**
 * Retrieves an evaluation by its ID.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The evaluation details.
 * @throws {BaseError} If the evaluation is not found or is archived.
 */
export const getEvaluation = async (req, res) => {
  const { id } = req.params;

  // First, check if the evaluation is multiplayer
  const isMultiplayer = await Report.exists({
    _id: id,
    isMultiplayer: true,
  });

  // Create the base query
  let query = Report.findById(id)
    .populate({
      path: 'userId',
      populate: [{ path: 'departmentId' }, { path: 'domainId' }],
    })
    .populate('moduleId')
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

  const evaluation = await query;

  if (!evaluation || evaluation.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Evaluation not found',
    );
  }

  return res.status(HttpStatusCode.OK).json({
    message: '',
    details: evaluation,
  });
};
/**
 * Archives an evaluation.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with a status code and a JSON message.
 * @throws {BaseError} If the evaluation is not found.
 *
 */
export const archiveEvaluation = async (req, res) => {
  const { id } = req.params;

  const evaluation = await Report.findById(id);
  if (!evaluation) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Evaluation not found',
    );
  }

  await Report.updateOne({ _id: id }, { archived: true });

  return res.status(HttpStatusCode.OK).json({
    message: 'Evaluation archived',
    details: {
      id: evaluation.id,
      name: evaluation.name,
    },
  });
};
