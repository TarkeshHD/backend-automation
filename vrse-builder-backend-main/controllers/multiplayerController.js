import mongoose from 'mongoose';
import moment from 'moment-timezone';
import { Report } from '../models/ReportModel.js';
import { Training } from '../models/TrainingModel.js';
import { Module } from '../models/ModuleModel.js';
import BaseError from '../utils/classes/BaseError.js';
import { CONF, HttpStatusCode, ROLES } from '../constants.js';
import { sendXAPIStatement } from '../utils/xapi.js';
import {
  convertBasicReportFromJson,
  convertBasicTrainingFromJson,
  getModuleJson,
  handleTriggerEvent,
} from '../utils/utils.js';
import _ from 'lodash';
import { ModuleAccess } from '../models/ModuleAccessModel.js';

/**
 * Create a multiplayer session (report/evaluation or training)
 * This unified endpoint creates either a report or training based on the sessionType parameter
 */
export const createMultiplayerSession = async (req, res) => {
  const { moduleId } = req.params;
  const { sessionType, cohortId, devMode = false } = req.body;
  const userId = req.user._id;

  // Get the module
  const module = await Module.findById(moduleId)
    .where({ archived: { $ne: true } })
    ?.populate('evaluation');

  // Check if the module exists
  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }

  if (module?.gameMode === 'singleplayer') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module has only single player mode',
    );
  }

  // Verify module access (similar to your training code)
  const moduleAccess = await ModuleAccess.find({
    $or: [{ departments: req.user.departmentId }, { users: req.user.id }],
    _id: module._id,
    archived: { $ne: true },
  });
  //  or not superAdmin or productAdmin
  if (
    !moduleAccess &&
    req.user.role !== ROLES.SUPER_ADMIN &&
    req.user.role !== ROLES.PRODUCT_ADMIN
  ) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.FORBIDDEN,
      "User doesn't have access to this module.",
    );
  }

  // Only support jsonLifeCycle for multiplayer
  if (module.evaluationType !== 'jsonLifeCycle') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Multiplayer is only supported for jsonLifeCycle modules',
    );
  }

  // Process JSON data for the module
  const files = req?.files || [];
  const jsonType = sessionType === 'evaluation' ? 'evaluation' : 'training';
  const fieldName = `${jsonType}Json`;
  const convertFunction =
    sessionType === 'evaluation'
      ? convertBasicReportFromJson
      : convertBasicTrainingFromJson;

  let jsonData = undefined;

  files?.map((file) => {
    if (file?.fieldname === fieldName) {
      jsonData = JSON.parse(file?.buffer?.toString('utf8'));
      return;
    }
  });

  if (!jsonData) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      `${jsonType.charAt(0).toUpperCase() + jsonType.slice(1)} JSON not found`,
    );
  }

  // No comparison from now on, since live link will be deployed
  // const moduleJson = await getModuleJson(module, fieldName);
  const convertedJsonData = convertFunction(jsonData);
  // const isEqual = _.isEqual(jsonData, moduleJson);

  // if (!isEqual && !devMode) {
  //   throw new BaseError(
  //     'ServerError',
  //     HttpStatusCode.BAD_REQUEST,
  //     `${
  //       jsonType.charAt(0).toUpperCase() + jsonType.slice(1)
  //     } JSON does not match the module ${jsonType} JSON`,
  //   );
  // }
  // Create the multiplayer session based on mode
  if (sessionType === 'evaluation') {
    // Set the passing criteria for the report
    const passingCriteria = {
      passMark: convertedJsonData?.passMark || 0,
    };

    // Create a new report
    const newReport = new Report({
      moduleId,
      userId,
      mode: 'jsonLifeCycle',
      passingCriteria,
      isMultiplayer: true,
      participants: [userId],
      ...(cohortId && { cohortId }),
    });

    if (convertedJsonData) {
      newReport.evaluationDump.jsonLifeCycleBased = convertedJsonData;
    }

    await newReport.save();

    if (cohortId) {
      // Add to the cohort specific user evaluation field
      await addEvaluationToCohort(cohortId, module.id, userId, newReport._id);
    }

    sendXAPIStatement(newReport, 'evaluation');

    return res.status(HttpStatusCode.OK).json({
      success: true,
      message: 'New multiplayer evaluation session created',
      details: newReport,
    });
  } else {
    // Create a new training
    const newTraining = new Training({
      name: module.name,
      moduleId,
      userId,
      trainingType: 'jsonLifeCycle',
      isMultiplayer: true,
      participants: [userId],
      status: 'ongoing',
    });

    if (convertedJsonData) {
      newTraining.trainingDumpJson = convertedJsonData;
    }

    await newTraining.save();

    sendXAPIStatement(newTraining, 'training');

    return res.status(HttpStatusCode.OK).json({
      success: true,
      message: 'New multiplayer training session created',
      details: newTraining,
    });
  }
};

/**
 * Join an existing multiplayer session (works for both Training and Report)
 */
export const joinMultiplayerSession = async (req, res) => {
  const { sessionId, sessionType, chapterIndex, momentIndex } = req?.body || {};
  const userId = req?.user?._id;

  // Validate session ID
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid session ID format',
    );
  }

  // Determine which model to use based on sessionType
  let SessionModel;
  if (sessionType === 'evaluation') {
    SessionModel = Report;
  } else if (sessionType === 'training') {
    SessionModel = Training;
  } else {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid sessionType. Must be either "evaluation" or "training"',
    );
  }

  // Find the session first to check if it exists and is multiplayer
  const session = await SessionModel.findOne({
    _id: sessionId,
    archived: { $ne: true },
  });

  // Check if session exists
  if (!session) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.NOT_FOUND,
      `${sessionType} session not found`,
    );
  }

  // Check if it's a multiplayer session
  if (!session.isMultiplayer) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      `This is not a multiplayer ${sessionType} session`,
    );
  }

  // Check if user is already a participant
  const isParticipant = session.participants?.some(
    (participant) => participant?.toString() === userId?.toString(),
  );

  const currentTime = moment().unix();
  const eventType = isParticipant ? 'Rejoined' : 'New Joinee';

  // Prepare join event
  const joinEvent = {
    verb: eventType,
    object: 'session',
    time: currentTime,
    eventType: 'joined',
    userId,
  };

  // If story has started (storyStartTime !== 0), require chapterIndex and momentIndex
  if (session.storyStartTime && session.storyStartTime !== 0) {
    if (!chapterIndex || !momentIndex) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Chapter and Moment indices are required after story start',
      );
    }

    // Add join event to specific moment
    await SessionModel.updateOne(
      {
        _id: sessionId,
        'answers.jsonLifeCycleBased': {
          $elemMatch: {
            chapterIndex,
            momentIndex,
          },
        },
      },
      {
        $push: {
          'answers.jsonLifeCycleBased.$.events': joinEvent,
        },
      },
    );
  }

  // If user is not in participants, add them
  if (!isParticipant) {
    await SessionModel.updateOne(
      { _id: sessionId },
      {
        $addToSet: {
          participants: userId,
        },
      },
    );
  }

  // Get the updated session to return
  const updatedSession = await SessionModel.findById(sessionId);

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: `Successfully joined multiplayer ${sessionType} session`,
    details: updatedSession,
  });
};

/**
 *
 * Starting story session
 */

export const startMultiplayerStory = async (req, res) => {
  const { sessionId, sessionType } = req.body;

  const userId = req?.user?._id;

  let SessionModel;
  if (sessionType === 'evaluation') {
    SessionModel = Report;
  } else if (sessionType === 'training') {
    SessionModel = Training;
  } else {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid sessionType. Must be either "evaluation" or "training"',
    );
  }

  // First check if the session exists and user is a participant
  const session = await SessionModel.findOne({
    _id: sessionId,
    archived: { $ne: true },
    userId: userId,
  });

  if (!session) {
    // Check which error to throw - session not found or user not a owner
    const sessionExists = await SessionModel.exists({
      _id: sessionId,
      archived: { $ne: true },
    });

    if (!sessionExists) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.NOT_FOUND,
        `${sessionType} session not found`,
      );
    } else {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.FORBIDDEN,
        'User is not an author of this session',
      );
    }
  }

  const currentTime = moment().unix();
  session.storyStartTime = currentTime;
  await session.save();

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Story mode has started',
    details: session,
  });
};

export const exitMultiplayerSession = async (req, res) => {
  const { sessionId, sessionType, chapterIndex, momentIndex } = req.body;
  const userId = req?.user?._id;

  // Determine which model to use based on sessionType
  let SessionModel;
  if (sessionType === 'evaluation') {
    SessionModel = Report;
  } else if (sessionType === 'training') {
    SessionModel = Training;
  } else {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid sessionType. Must be either "evaluation" or "training"',
    );
  }

  // Find the session
  const session = await SessionModel.findOne({
    _id: sessionId,
    archived: { $ne: true },
  });

  if (!session) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.NOT_FOUND,
      `${sessionType} session not found`,
    );
  }

  // Check if it's a multiplayer session
  if (!session.isMultiplayer) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      `This is not a multiplayer ${sessionType} session`,
    );
  }

  // Check if user is not in participants array
  if (!session.participants.includes(userId)) {
    // Or throw an error:
    throw new BaseError(
      'AccessError',
      HttpStatusCode.FORBIDDEN,
      `User is not a participant in this ${sessionType} session`,
    );
  }

  // If story has started (storyStartTime !== 0), require chapterIndex and momentIndex
  if (session.storyStartTime && session.storyStartTime !== 0) {
    if (!chapterIndex || !momentIndex) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Chapter and Moment indices are required for exit',
      );
    }
  }

  // If story hasn't started, remove from participants
  if (!session.storyStartTime || session.storyStartTime === 0) {
    await SessionModel.updateOne(
      { _id: sessionId },
      {
        $pull: {
          participants: userId,
        },
      },
    );

    return res.status(HttpStatusCode.OK).json({
      success: true,
      message: 'User removed from session',
    });
  }

  const currentTime = moment().unix();

  // Prepare exit event
  const exitEvent = {
    verb: 'Exited',
    object: 'session',
    time: currentTime,
    eventType: 'exited',
    userId,
    chapterIndex,
    momentIndex,
  };

  console.log('exit events', exitEvent);

  // Check if the moment entry exists for this chapter/moment combination
  const momentExists = await SessionModel.exists({
    _id: sessionId,
    'answers.jsonLifeCycleBased': {
      $elemMatch: {
        chapterIndex: Number(chapterIndex),
        momentIndex: Number(momentIndex),
      },
    },
  });

  if (momentExists) {
    // If moment exists, just push the new event to its events array
    await SessionModel.updateOne(
      {
        _id: sessionId,
        'answers.jsonLifeCycleBased': {
          $elemMatch: {
            chapterIndex: Number(chapterIndex),
            momentIndex: Number(momentIndex),
          },
        },
      },
      {
        $push: {
          'answers.jsonLifeCycleBased.$.events': exitEvent,
        },
      },
    );
  } else {
    // If moment doesn't exist, create a new moment entry
    await SessionModel.updateOne(
      { _id: sessionId },
      {
        $push: {
          'answers.jsonLifeCycleBased': {
            chapterIndex: Number(chapterIndex),
            momentIndex: Number(momentIndex),
            startTime: currentTime,
            events: [exitEvent],
          },
        },
      },
    );
  }

  // Get updated session to return in response
  const updatedSession = await SessionModel.findById(sessionId);

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'User successfully exited the session',
    details: updatedSession,
  });
};

/**
 * Submit trigger for multiplayer session
 */
export const submitTrigger = async (req, res) => {
  const {
    sessionId,
    sessionType,
    chapterIndex,
    momentIndex,
    time,
    verb,
    object,
    triggerType,
  } = req?.body || {};

  const userId = req?.user?._id;
  const currentTime = time || moment().unix();

  // Get values for verb and object (either from request or generated)
  const finalVerb = verb || 'value not provided';
  const finalObject = object || 'value not provided';

  // Determine which model to use based on sessionType
  let SessionModel;
  if (sessionType === 'evaluation') {
    SessionModel = Report;
  } else if (sessionType === 'training') {
    SessionModel = Training;
  } else {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Invalid sessionType. Must be either "evaluation" or "training"',
    );
  }

  // First check if the session exists and user is a participant
  const session = await SessionModel.findOne({
    _id: sessionId,
    archived: { $ne: true },
    $or: [{ participants: userId }, { userId: userId }],
  });
  if (!session) {
    // Check which error to throw - session not found or user not a participant
    const sessionExists = await SessionModel.exists({
      _id: sessionId,
      archived: { $ne: true },
    });

    if (!sessionExists) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.NOT_FOUND,
        `${sessionType} session not found`,
      );
    } else {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.FORBIDDEN,
        'User is not a participant in this session',
      );
    }
  }
  if (
    session?.storyStartTime &&
    session.storyStartTime === 0 &&
    triggerType !== 'onAdminChange'
  ) {
    throw new BaseError(
      'SessionError',
      HttpStatusCode.BAD_REQUEST,
      `Story mode hasn't started for this session`,
    );
  }

  if (session.endTime) {
    throw new BaseError(
      'SessionError',
      HttpStatusCode.BAD_REQUEST,
      `Session has ended`,
    );
  }

  // Check if the moment has already ended
  const existingMoment = session.answers?.jsonLifeCycleBased?.find(
    (answer) =>
      answer.chapterIndex === chapterIndex &&
      answer.momentIndex === momentIndex,
  );
  const momentEnded = existingMoment?.endTime ? true : false;

  // Create the trigger event with modified object if moment has ended
  const triggerEvent = {
    verb: finalVerb,
    object: momentEnded
      ? `${finalObject} (FLOW ERROR -> MOMENT ENDED)`
      : finalObject,
    time: currentTime,
    eventType: triggerType,
    userId,
  };

  if (triggerType === 'onAdminChange') {
    if (!session.isMultiplayer) {
      throw new BaseError(
        'SessionError',
        HttpStatusCode.BAD_REQUEST,
        `Admin change can only happen in multiplayer mode`,
      );
    }
    session.userId = userId;
    await session.save();
  }

  // Handle score reduction for wrong triggers
  if (triggerType === 'onWrongTrigger' && !momentEnded) {
    // Get the appropriate JSON structure based on session type
    let jsonLifeCycleBased;
    if (sessionType === 'evaluation') {
      jsonLifeCycleBased = session.evaluationDump.jsonLifeCycleBased;
    } else {
      jsonLifeCycleBased = session.trainingDumpJson;
    }

    // Prepare the trigger data for score handling
    const triggerData = {
      chapterIndex: Number(chapterIndex),
      momentIndex: Number(momentIndex),
      events: [triggerEvent],
    };

    // Process the trigger and get updated JSON with reduced score
    const updatedJson = await handleTriggerEvent(
      jsonLifeCycleBased,
      triggerData,
      session,
    );

    // Update the session with the modified JSON
    if (sessionType === 'evaluation') {
      session.evaluationDump.jsonLifeCycleBased = updatedJson;
    } else {
      session.trainingDumpJson = updatedJson;
    }

    // Save the session to persist score changes
    await session.save();
  }

  // Check if the moment entry exists for this chapter/moment combination
  const momentExists = await SessionModel.exists({
    _id: sessionId,
    'answers.jsonLifeCycleBased': {
      $elemMatch: {
        chapterIndex: chapterIndex,
        momentIndex: momentIndex,
      },
    },
  });

  if (momentExists) {
    // If moment exists, just push the new event to its events array
    await SessionModel.updateOne(
      {
        _id: sessionId,
        'answers.jsonLifeCycleBased': {
          $elemMatch: {
            chapterIndex: chapterIndex,
            momentIndex: momentIndex,
          },
        },
      },
      {
        $push: {
          'answers.jsonLifeCycleBased.$.events': triggerEvent,
        },
      },
    );
  } else {
    // If moment doesn't exist, create a new moment entry
    await SessionModel.updateOne(
      { _id: sessionId },
      {
        $push: {
          'answers.jsonLifeCycleBased': {
            chapterIndex,
            momentIndex,
            startTime: currentTime,
            events: [triggerEvent],
          },
        },
      },
    );
  }
  // Send response
  return res.status(HttpStatusCode.OK).json({
    success: !momentEnded,
    message: momentEnded
      ? `Trigger (${triggerEvent.eventType}) recorded but moment has already ended`
      : `Trigger (${triggerEvent.eventType}) recorded successfully`,
    triggerEvent,
  });
};
