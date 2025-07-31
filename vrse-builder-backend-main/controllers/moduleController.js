import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import moment from 'moment-timezone';

import { AUTOVRSE_USER, CONF, HttpStatusCode, ROLES } from '../constants.js';
import { Department } from '../models/DepartmentModel.js';
import { ModuleAccess } from '../models/ModuleAccessModel.js';
import { Module } from '../models/ModuleModel.js';
import { Question } from '../models/QuestionModel.js';
import { Domain } from '../models/DomainModel.js';
import { Time } from '../models/TimeModel.js';
import BaseError from '../utils/classes/BaseError.js';
import { randomizeArray } from '../utils/helpers.js';
import {
  convertBasicReportFromJson,
  convertBasicTrainingFromJson,
  convertJsonToMomentCount,
  createDirectoryIfNotExists,
  formatModuleThumbnails,
  formatModuleTrainings,
  getModuleJson,
  getPresignedUrl,
  saveFile,
  storeJsonInS3,
  uploadImageToS3,
} from '../utils/utils.js';
import { createFilterQuery } from '../utils/helpers.js';
import { User } from '../models/UserModel.js';
import { QuestionAction } from '../models/QuestionActionModel.js';
import { Training } from '../models/TrainingModel.js';
import { Report } from '../models/ReportModel.js';
import { assignModulesAndSendOtps } from './otpController.js';
import { count } from 'console';
import { JsonLifeCycle } from '../models/JsonLifeCycleModel.js';
import logger from '../utils/logger.js';
import { isValidId } from '../utils/validators/validIdCheck.js';
import axios from 'axios';
import mongoose from 'mongoose';
import { Project } from '../models/ProjectModel.js';
import performanceTracker from '../utils/performanceLogger.js';

/**
 * Retrieves a list of modules based on the user's role and access permissions.
 *
 * @param {Object} req - The request object containing user information.
 * @param {Object} res - The response object.
 * @returns {Array} An array of module objects.
 */
export const getAllModules = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'fetching all modules',
    'start',
  );

  let { page, limit, sort, filters, archived } = req.query;

  const parsedFilters = createFilterQuery(filters);

  const baseQuery = {
    archived: { $ne: true },
    ...parsedFilters,
  };

  if (archived === 'true') {
    delete baseQuery.archived;
  }

  let finalQuery = {};

  // Product Admin -> Get All
  // Super Admin -> Get All
  // Admin -> Assigned only
  switch (req?.user?.role) {
    case ROLES.ADMIN:
      // Find all ModuleAccess ID's that has domain id of admin
      const moduleAccessAdmin = await ModuleAccess.find({
        domains: req.user.domainId,
      }).lean();
      const moduleAccessIDAdmin = moduleAccessAdmin.map((v) =>
        v._id?.toString(),
      );

      finalQuery = {
        moduleAccessId: { $in: moduleAccessIDAdmin },
        ...baseQuery,
      };
      break;
    case ROLES.USER:
      // Find all ModuleAccess ID's that have either departmentId or userId matching
      const moduleAccessUser = await ModuleAccess.find({
        $or: [{ departments: req.user.departmentId }, { users: req.user.id }],
      }).lean();
      const moduleAccessIDUser = moduleAccessUser.map((v) => v._id?.toString());

      finalQuery = {
        moduleAccessId: { $in: moduleAccessIDUser },
        ...baseQuery,
      };
      break;
    default:
      // Default logic for other roles
      finalQuery = baseQuery;
      break;
  }

  const options = {
    page: parseInt(page),
    limit: parseInt(limit),
    sort: sort ? JSON.parse(sort) : { createdAt: -1 },
    populate: 'moduleAccessId evaluation',
    lean: true,
  };

  if (!page) {
    options.pagination = false;
  }

  let modules = await Module.paginate(finalQuery, options);

  const getModuleTrainingStatus = async (userId, moduleId) => {
    const trainings = await Training.find({
      userId,
      moduleId,
      archived: { $ne: true },
    });

    let status = 'notAttempted';
    if (trainings.some((training) => training.endTime > 0)) {
      status = 'done';
    } else if (trainings.some((training) => training?.startTime > 0)) {
      status = 'pending';
    }

    return status;
  };

  const getModuleEvaluationStatus = async (userId, moduleId) => {
    const trainings = await Report.find({
      userId,
      moduleId,
      archived: { $ne: true },
    });

    let status = 'notAttempted';
    if (trainings.some((training) => training?.endTime > 0)) {
      status = 'done';
    } else if (trainings.some((training) => training?.startTime > 0)) {
      status = 'pending';
    }

    return status;
  };

  const moduleStatusPromises = modules?.docs?.map(async (module) => {
    const trainingStatus = await getModuleTrainingStatus(
      req?.user?.id,
      module._id,
    );
    const evaluationStatus = await getModuleEvaluationStatus(
      req?.user?.id,
      module._id,
    );
    module.moduleTrainingStatus = trainingStatus;
    module.moduleEvaluationStatus = evaluationStatus;
    return module;
  });

  // const imageBucketName = process.env.S3_BUCKET_IMAGE_NAME;

  const moduleImageFormatPromise = modules?.docs?.map(async (module) => {
    // For AWS Storage
    // const { imageS3Url, ...rest } = module;

    // if (imageS3Url) {
    //   const key = `${module._id}/thumbnail`;
    //   const url = await getPresignedUrl(
    //     imageBucketName,
    //     key,
    //     module?.thumbnail,
    //   );

    //   module.thumbnail = url;
    // }

    module.thumbnail = await formatModuleThumbnails(module);
  });

  modules.docs = await Promise.all(
    moduleStatusPromises,
    moduleImageFormatPromise,
  );

  performanceTracker.log('fetching all modules', 'end', logId, logStart);

  return res.status(HttpStatusCode.OK).json({ message: '', modules });
};

/**
 * Retrieves a list of modules based on the user's role and access permissions. VR API. Set pass percentage, if not exist
 *
 * @param {Object} req - The request object containing user information.
 * @param {Object} res - The response object.
 * @returns {Array} An array of module objects.
 */

export const getAllModulesVR = async (req, res) => {
  // Get All Modules
  // Check Users Department if included send modules
  let modules = [];
  if (req.user.role === ROLES.USER) {
    // Find all ModuleAccess ID's that have either departmentId or userId matching
    const filter = {
      $or: [{ departments: req.user.departmentId }, { users: req.user.id }],
    };

    if (CONF?.features?.demoAccess?.state === 'on') {
      filter.$or.push({ domain: req.user.domainId });
    }
    const moduleAccess = await ModuleAccess.find(filter);
    const moduleAccessID = moduleAccess.map((v) => v._id?.toString());

    modules = await Module.find({
      moduleAccessId: { $in: moduleAccessID },
      archived: {
        $ne: true,
      },
    })
      .populate('evaluation')
      .lean();
  } else if (req.user.role === ROLES.ADMIN) {
    // Find all ModuleAccess ID's that has domain id of admin
    const moduleAccess = await ModuleAccess.find({
      domains: req.user.domainId,
    });

    const moduleAccessID = moduleAccess.map((v) => v._id?.toString());

    modules = await Module.find({
      moduleAccessId: { $in: moduleAccessID },
      archived: {
        $ne: true,
      },
    })
      .populate('evaluation')
      .lean();
  }

  // Check if passPercentage and noOfQuestions are set; if not set them to 70 and total length of evaluation respectively and save it
  const updatedModules = await Promise.all(
    modules.map(async (module) => {
      let isModified = false;
      if (module.evaluationType !== 'jsonLifeCycle') {
        if (module.evaluationType === 'time') {
          return module;
        }

        if (module.evaluationType === 'questionAction') {
          module.passPercentage = module.passPercentage || 70;
          // await module.save();
          return module;
        }
        if (!module.passPercentage) {
          module.passPercentage = 70;
          isModified = true;
        }
        if (!module.noOfQuestion && module.noOfQuestion !== 0) {
          module.noOfQuestion = module.evaluation?.length;
          isModified = true;
        }
      }
      if (isModified) {
        // await module.save();
      }
      return module;
    }),
  );

  const getModuleTrainingStatus = async (userId, moduleId) => {
    const trainings = await Training.find({
      userId,
      moduleId,
      archived: { $ne: true },
    });

    let status = 'notAttempted';
    if (trainings.some((training) => training.endTime > 0)) {
      status = 'done';
    } else if (trainings.some((training) => training?.startTime > 0)) {
      status = 'pending';
    }

    return status;
  };

  const getModuleEvaluationStatus = async (userId, moduleId) => {
    const trainings = await Report.find({
      userId,
      moduleId,
      archived: { $ne: true },
    });

    let status = 'notAttempted';
    if (trainings.some((training) => training?.endTime > 0)) {
      status = 'done';
    } else if (trainings.some((training) => training?.startTime > 0)) {
      status = 'pending';
    }

    return status;
  };

  const moduleStatusPromises = modules.map(async (module) => {
    const trainingStatus = await getModuleTrainingStatus(
      req?.user?.id,
      module._id,
    );
    const evaluationStatus = await getModuleEvaluationStatus(
      req?.user?.id,
      module._id,
    );

    module.moduleTrainingStatus = trainingStatus;
    module.moduleEvaluationStatus = evaluationStatus;
    return module;
  });

  // const imageBucketName = process.env.S3_BUCKET_IMAGE_NAME;

  const moduleImageFormatPromise = modules.map(async (module) => {
    // For AWS Storage
    // const { imageS3Url, ...rest } = module;

    // if (imageS3Url) {
    //   const key = `${module._id}/thumbnail`;
    //   const url = await getPresignedUrl(
    //     imageBucketName,
    //     key,
    //     module?.thumbnail,
    //   );

    //   module.thumbnail = url;

    module.thumbnail = await formatModuleThumbnails(module);
  });

  modules = await Promise.all(moduleStatusPromises, moduleImageFormatPromise);

  // Deep copy modules and modify evaluation in place: Deep copy is needed in order to edit mongoose object
  // const modifiedModules = JSON.parse(JSON.stringify(updatedModules)); // Deep copy

  // Randomize the modules
  modules.forEach((module) => {
    if (module.evaluationType === 'question') {
      const noOfQuestions = module.noOfQuestion;
      module.evaluation = randomizeArray(module.evaluation, noOfQuestions);
    }
  });

  return res.status(HttpStatusCode.OK).json({ message: '', details: modules });
};

/**
 * Creates a new module with the provided data and handles file uploads.
 *
 * @param {Object} req - The request object containing the request body and files.
 * @param {Object} res - The response object.
 * @returns {Object} - The response with status code 200 and a JSON object containing a message and the modified modules.
 */
export const createModule = async (req, res) => {
  const { evaluationType, gameMode = 'singlePlayer' } = req.body;
  const files = req.files;

  if (
    evaluationType === 'questionAction' &&
    CONF?.features?.questionActionEvaluation.state !== 'on'
  ) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Question Action Evaluation is not enabled',
    );
  }

  if (
    evaluationType === 'jsonLifeCycle' &&
    CONF?.features?.jsonLifecycleEvaluation.state !== 'on'
  ) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Json Lifecycle Evaluation is not enabled',
    );
  }

  const newModule = new Module({
    ...req.body,
    evaluationType,
    gameMode,
  });

  const existingModuleName = await Module.findOne({
    name: req.body?.name,
    archived: { $ne: true },
  }).lean();
  const existingModuleIndex = await Module.findOne({
    index: req.body?.index,
    archived: { $ne: true },
  }).lean();

  if (existingModuleName) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module name already exists',
    );
  }

  if (existingModuleIndex) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module index already exists',
    );
  }

  // For autovrse trainee, when a new module is created, it should be assigned to them
  const autovrseDomain = await Domain.findOne({
    name: AUTOVRSE_USER?.DOMAIN_USERNAME,
    archived: { $ne: true },
  });

  const autovrseUsers = await User.find({
    role: ROLES.USER,
    archived: { $ne: true },
    domainId: autovrseDomain?._id,
  }).lean();

  let autovrseUserIds = [];
  if (!autovrseUsers.length) {
    logger.error('No users found in Autovrse domain');
  } else {
    autovrseUserIds = autovrseUsers.map((user) => user?._id);
  }

  const newModuleId = newModule?._id;

  // Create empty Module Access also
  const moduleAccess = new ModuleAccess({
    domains: [],
    departments: [],
    users: autovrseUserIds,
  });
  newModule.moduleAccessId = moduleAccess?._id;

  // Upload the image to uploads image folder

  // Validate before moving forward so we can reduce risk of failures and saving wrong values

  const hasEvaluationOrTrainingJson = (files) => {
    return files.some(
      (file) =>
        file.fieldname === 'evaluationJson' ||
        file.fieldname === 'trainingJson',
    );
  };

  if (
    evaluationType === 'jsonLifeCycle' &&
    !hasEvaluationOrTrainingJson(files)
  ) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'JSON file is missing',
    );
  }

  // Define directories for each fieldname
  const directories = {
    thumbnail: 'image',
    evaluationJson: 'evaluation-json',
    trainingJson: 'training-json',
  };

  await newModule.validate({});

  let evaluationAdded = false;
  let convertedJsonData = '';

  // Stream the file instead of buffering it in memory
  // Process files
  await Promise.all(
    files.map(async (file) => {
      const fieldName = file.fieldname;

      // Save file using saveFile utility
      const fileUrl = await saveFile(file, fieldName, newModule?._id);

      // Handle specific field cases
      if (fieldName === 'thumbnail') {
        newModule.thumbnailUrl = fileUrl; // Save URL for thumbnail
      } else if (fieldName === 'evaluationJson') {
        const evaluationJson = JSON.parse(file.buffer.toString('utf8'));
        newModule.momentCount = convertJsonToMomentCount(evaluationJson);
        convertedJsonData = convertBasicReportFromJson(evaluationJson);
        newModule.evaluationJsonUrl = fileUrl; // Save URL for evaluation JSON
        evaluationAdded = true;
      } else if (fieldName === 'trainingJson') {
        newModule.trainingJsonUrl = fileUrl; // Save URL for training JSON
      }
    }),
  );

  // If evaluation JSON is added, process and save it
  if (evaluationAdded) {
    const jsonEvaluationData = new JsonLifeCycle(convertedJsonData);
    await jsonEvaluationData.save();
    newModule.evaluation = [jsonEvaluationData];
  }

  // We use new module ID to handle the risk of failure / saving wrong data in Databse

  // Warning : Saving and Creating new module after saving files increases the risk of Uploaded Files Redundancy.
  // We can have a point of failure while Creating Module Document!
  await moduleAccess.save();

  await newModule.save();

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'New module created', details: newModule });
};

// ... existing code ...

export const createOrUpdateModuleStudio = async (req, res) => {
  const { id } = req.params;
  const { projectId } = req.body;
  const updateData = { ...req.body };
  const { isDeleted = false } = req.body;
  const evaluationType = 'jsonLifeCycle';
  const {
    evaluationJsonUrl,
    trainingJsonUrl,
    gameMode = 'hybridplayer',
  } = req.body;

  // Check if the jsonLifeCycle feature flag is enabled
  if (CONF?.features?.jsonLifecycleEvaluation.state !== 'on') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Json Lifecycle Evaluation is not enabled',
    );
  }

  // Check if module exists
  const existingModule = await Module.findById(id);

  if (!existingModule) {
    if (!updateData.name && updateData.description) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Name and Description value is missing',
      );
    }

    // Creation flow
    // Check for existing module with same name
    const existingModuleName = await Module.findOne({
      name: updateData.name,
      archived: { $ne: true },
    }).lean();

    if (existingModuleName) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Module name already exists',
      );
    }

    const index = Math.floor(Date.now() / 1000).toString();

    // For autovrse trainee, when a new module is created, it should be assigned to them
    const autovrseDomain = await Domain.findOne({
      name: AUTOVRSE_USER?.DOMAIN_USERNAME,
      archived: { $ne: true },
    });

    const autovrseUsers = await User.find({
      role: ROLES.USER,
      archived: { $ne: true },
      domainId: autovrseDomain._id,
    }).lean();

    let autovrseUserIds = [];
    if (!autovrseUsers.length) {
      logger.error('No users found in Autovrse domain');
    } else {
      autovrseUserIds = autovrseUsers.map((user) => user._id);
    }

    // Add current user's ID to the users array if not already present and not a regular user
    if (
      req.user?._id &&
      req.user.role !== ROLES.USER &&
      !autovrseUserIds.includes(req.user._id)
    ) {
      autovrseUserIds.push(req.user._id);
    }

    // Create Module Access
    const moduleAccess = new ModuleAccess({
      domains: [],
      departments: [],
      users: autovrseUserIds,
    });

    // Clone the updateData object to avoid modifying the original
    const processedData = { ...updateData };

    // Check for URL fields and rename them to S3 equivalents
    if (processedData.imageUrl) {
      processedData.imageS3Url = processedData.imageUrl;
      delete processedData.imageUrl;
    }

    // Create new module
    const newModule = new Module({
      ...processedData,
      _id: id,
      index,
      evaluationType,
      gameMode,
      moduleAccessId: moduleAccess._id,
      projectId: projectId || null,
    });

    // Validate for JSON sources
    // if (!evaluationJsonUrl && !trainingJsonUrl) {
    //   throw new BaseError(
    //     'ServerError',
    //     HttpStatusCode.BAD_REQUEST,
    //     'Either evaluationJsonUrl or trainingJsonUrl must be provided',
    //   );
    // }

    await newModule.validate({});

    let evaluationAdded = false;
    let convertedJsonData = '';

    // Handle evaluation JSON URL
    if (evaluationJsonUrl) {
      try {
        const response = await axios.get(evaluationJsonUrl);
        const evaluationJson = response.data;
        newModule.momentCount = convertJsonToMomentCount(evaluationJson);
        convertedJsonData = convertBasicReportFromJson(evaluationJson);
        newModule.evaluationJsonS3Url = evaluationJsonUrl;
        evaluationAdded = true;
      } catch (error) {
        throw new BaseError(
          'ServerError',
          HttpStatusCode.BAD_REQUEST,
          `Error processing evaluation JSON URL: ${error.message}`,
        );
      }
    }

    if (trainingJsonUrl) {
      newModule.trainingJsonS3Url = trainingJsonUrl;
    }

    if (evaluationAdded) {
      const jsonEvaluationData = new JsonLifeCycle({
        ...convertedJsonData,
        moduleId: id,
      });
      await jsonEvaluationData.save();
      newModule.evaluation = [jsonEvaluationData];
    }

    await moduleAccess.save();
    await newModule.save();

    return res
      .status(HttpStatusCode.OK)
      .json({ message: 'New module created', details: newModule });
  } else {
    // Update flow
    // Remove _id from update data
    delete updateData._id;

    // If name is being updated, check for duplicates
    if (updateData.name) {
      const duplicateModule = await Module.findOne({
        name: updateData.name,
        _id: { $ne: id },
      });

      if (duplicateModule) {
        return res.status(400).json({
          success: false,
          message: 'Module with this name already exists',
        });
      }
    }

    // Validate game mode if it's being updated
    if (
      updateData.gameMode &&
      !['singleplayer', 'multiplayer', 'hybridplayer'].includes(
        updateData.gameMode,
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Invalid game mode. Must be singleplayer, multiplayer, or hybridplayer',
      });
    }

    if (isDeleted) {
      const updatedModule = await Module.findByIdAndUpdate(id, {
        archived: true,
        archivedAt: moment().toDate(),
      });

      return res.status(200).json({
        success: true,
        data: updatedModule,
        message: 'Module archived successfully',
      });
    }

    // If evaluation JSON URL is updated, process the new JSON
    if (evaluationJsonUrl || evaluationJsonUrl === '') {
      if (evaluationJsonUrl === '') {
        // That means url is deleted
        updateData.evaluationJsonS3Url = evaluationJsonUrl;
        updateData.evaluation = [];
      } else {
        const response = await axios.get(updateData.evaluationJsonUrl);
        const jsonData = response.data;
        const convertedJsonData = convertJsonToMomentCount(jsonData);

        updateData.momentCount = convertedJsonData;
        const updatedEvalData = convertBasicReportFromJson(jsonData);

        const jsonEvaluationData = new JsonLifeCycle({
          ...updatedEvalData,
          moduleId: id,
        });
        await jsonEvaluationData.save();
        updateData.evaluationJsonS3Url = updateData.evaluationJsonUrl;

        updateData.evaluation = [jsonEvaluationData._id];
        updateData.evaluationType = 'jsonLifeCycle';
      }
    }

    if (trainingJsonUrl || trainingJsonUrl === '') {
      updateData.trainingJsonS3Url = trainingJsonUrl;
    }

    if (updateData?.imageUrl) {
      updateData.imageS3Url = updateData?.imageUrl;
    }

    // Update module access if user is not a regular user
    if (req.user?._id && req.user.role !== ROLES.USER) {
      const moduleAccess = await ModuleAccess.findById(
        existingModule.moduleAccessId,
      );
      if (moduleAccess && !moduleAccess.users.includes(req.user._id)) {
        moduleAccess.users.push(req.user._id);
        await moduleAccess.save();
      }
    }

    const updatedModule = await Module.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true },
    );

    return res.status(200).json({
      success: true,
      data: updatedModule,
      message: 'Module updated successfully',
    });
  }
};

export const getModuleImage = async (req, res) => {
  const { moduleId } = req.params;
  const { imageUrl } = req.body;
  const module = await Module.findById(moduleId);
  if (!module) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }
  if (module.imageS3Url !== imageUrl) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Image not found',
    );
  }

  const url = await getPresignedUrl(imageBucketName, imageUrl);
  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Image URL', details: url });
};

/**
 * Edits a module in the web application.
 * Retrieves the module data from the database based on the provided ID,
 * checks if the module exists, and throws an error if it doesn't.
 * If the module exists, it updates the module data and saves it to the database.
 *
 * @param {Object} req - The request object containing information about the HTTP request.
 * @param {Object} res - The response object used to send the HTTP response.
 * @throws {BaseError} If the module is not found in the database.
 * @returns {void}
 */
export const editModule = async (req, res) => {
  const module = await Module.findById(req.params.id);
  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }

  Object.keys(req.body || {}).map((key) => {
    if (key === 'evaluation') {
      return null;
    }
    module[key] = req.body[key];
  });
  await module.save();

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Module updated', details: module });
};

/**
 * Edits the questions of a module in the web application.
 * Retrieves the module data from the database based on the provided ID,
 * checks if the module exists, and throws an error if it doesn't.
 * If the module exists, it updates the questions of the module and saves it to the database.
 *
 * @param {Object} req - The request object containing information about the HTTP request.
 * @param {Object} res - The response object used to send the HTTP response.
 * @throws {BaseError} If the module is not found in the database.
 * @returns {void}
 */
export const editModuleQuestions = async (req, res) => {
  const [module, nameModuleExist] = await Promise.all([
    Module.findById(req.params.id),
    // check if req.body.name exist and if it exist try checking if the name is unique
    req.body?.name
      ? Module.findOne({ name: req.body.name, archived: { $ne: true } })
      : null,
  ]);
  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }

  if (module.evaluationType && module.evaluationType !== 'question') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module is not of type questions',
    );
  }

  // Check if the name exist adn if it exist try checking if the name is unique
  if (req.body?.name) {
    if (nameModuleExist && nameModuleExist._id.toString() !== req.params.id) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Module name already exist',
      );
    }
    module.name = req.body.name;
  }

  if (req.body?.description) {
    module.description = req.body.description;
  }

  const oldQuestionIDs = module.evaluation;

  const arrayOfQuestions = await Promise.all(
    req.body?.evaluation?.map(async (v) => {
      const ques = new Question(v);
      await ques.save();
      return ques;
    }),
  );

  const { passPercentage, noOfQuestion } = req.body;
  module.evaluation = arrayOfQuestions;
  module.passPercentage = passPercentage;
  module.noOfQuestion = noOfQuestion;
  await module.save();

  // Delete all the old questions!
  await Question.deleteMany({ _id: { $in: oldQuestionIDs } });

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Module updated', details: module });
};

export const editModuleJsonBased = async (req, res) => {
  const [module] = await Promise.all([
    Module.findById(req.params.id),
    // check if req.body.name exist and if it exist try checking if the name is unique
  ]);
  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }

  await validateModuleUniqueness(req.body.name, req.body.index, module._id);

  if (module.evaluationType && module.evaluationType !== 'jsonLifeCycle') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module is not of type questions',
    );
  }

  console.log('req body', req?.body);
  // Check if the name exist adn if it exist try checking if the name is unique
  if (req.body?.name) {
    // if (nameModuleExist && nameModuleExist._id.toString() !== req.params.id) {
    //   throw new BaseError(
    //     'ServerError',
    //     HttpStatusCode.BAD_REQUEST,
    //     'Module name already exist',
    //   );
    // }
    module.name = req.body.name;
  }

  if (req.body?.description) {
    module.description = req.body.description;
  }
  if (req.body?.index) {
    module.index = req.body.index;
  }

  await module.save();

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Module updated', details: module });
};

/**
 * Edit module files questions.
 *
 * This function is responsible for editing the files associated with the questions in a module.
 * It takes in the request and response objects and performs the necessary operations to update the module's files.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The updated module details.
 *
 * @throws {BaseError} - If the module is not found or is archived.
 * @throws {BaseError} - If the module is not of type questions.
 *
 * @example
 * editModuleFilesQuestions(req, res);
 */
export const editModuleFilesQuestions = async (req, res) => {
  const module = await Module.findById(req.params.id).populate('evaluation');
  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }

  // const basePath = './';
  // let saveDir = `uploads/modules/${module?._id?.toString()}/questions`;
  // if (module.evaluationType === 'questionAction') {
  //   saveDir = `uploads/modules/${module?._id?.toString()}/questionAction`;
  // } else if (module.evaluationType === 'time') {
  //   saveDir = `uploads/modules/${module?._id?.toString()}/time`;
  // }
  // createDirectoryIfNotExists(basePath + saveDir);

  let evaluationAdded = false;
  let convertedJsonData = '';

  const directories = {
    thumbnail: 'image',
    evaluationJson: 'evaluation-json',
    trainingJson: 'training-json',
  };

  const fileBasePath = './uploads/';
  const files = req.files;
  // Handle files
  await Promise.all(
    files.map(async (file) => {
      const fieldName = file.fieldname;

      // Save file using saveFile utility
      const fileUrl = await saveFile(file, fieldName, module._id);

      // Handle specific field cases
      if (fieldName === 'thumbnail') {
        module.thumbnailUrl = fileUrl; // Save URL for thumbnail
      } else if (fieldName === 'evaluationJson') {
        const evaluationJson = JSON.parse(file.buffer.toString('utf8'));
        module.momentCount = convertJsonToMomentCount(evaluationJson);
        convertedJsonData = convertBasicReportFromJson(evaluationJson);
        module.evaluationJsonUrl = fileUrl; // Save URL for evaluation JSON
        evaluationAdded = true;
      } else if (fieldName === 'trainingJson') {
        module.trainingJsonUrl = fileUrl; // Save URL for training JSON
      }
    }),
  );
  if (evaluationAdded) {
    const jsonEvaluationData = new JsonLifeCycle(convertedJsonData);
    await jsonEvaluationData.save();
    module.evaluation = [jsonEvaluationData];
  }

  await module.save();
  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Module updated', details: module });
};

// Module with time based evaluation
/**
 * Edit a module with time-based evaluation.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The updated module details.
 * @throws {BaseError} - If the module is not found or is archived, or if the module is not of type time-based.
 */
export const editModuleTimeBased = async (req, res) => {
  const [module, nameModuleExist] = await Promise.all([
    Module.findById(req.params.id),
    // check if req.body.name exist and if it exist try checking if the name is unique
    req.body?.name ? Module.findOne({ name: req.body.name }) : null,
  ]);
  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }

  if (module.evaluationType && module.evaluationType !== 'time') {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module is not of type time based',
    );
  }

  // Check if the name exist adn if it exist try checking if the name is unique
  if (req.body?.name) {
    if (nameModuleExist && nameModuleExist._id.toString() !== req.params.id) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Module name already exist',
      );
    }
    module.name = req.body.name;
  }

  if (req.body?.description) {
    module.description = req.body.description;
  }

  if (req.body?.index) {
    module.index = req.body.index;
  }

  const {
    goldTimeLimit,
    silverTimeLimit,
    bronzeTimeLimit,
    mistakesAllowed,
    note = '',
  } = req.body;

  // Check if there's an existing Time document
  let timeBasedEvaluation;
  if (module.evaluation[0]) {
    // Update the existing Time document
    timeBasedEvaluation = await Time.findByIdAndUpdate(
      module.evaluation[0],
      {
        goldTimeLimit,
        silverTimeLimit,
        bronzeTimeLimit,
        mistakesAllowed,
        note,
      },
      { new: true }, // Return the updated document
    );
  } else {
    // Create a new Time document
    timeBasedEvaluation = new Time({
      goldTimeLimit,
      silverTimeLimit,
      bronzeTimeLimit,
      mistakesAllowed,
      note,
    });
    await timeBasedEvaluation.save();
  }

  module.evaluation = [timeBasedEvaluation];

  await module.save();

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Module updated', details: module });
};

/**
 * Edit the questions and actions of a module.
 *
 * This function allows the user to edit the questions and actions of a module. It first checks if the module exists and is not archived. If the module is of type 'questionAction' and the question action evaluation feature is enabled, it proceeds with the editing process. Otherwise, it throws an error indicating that question action evaluation is not allowed.
 *
 * The function takes the following parameters:
 * - req: The request object containing the module ID and the updated questions and actions.
 * - res: The response object used to send the updated module details.
 *
 * The function performs the following steps:
 * 1. Find the module by its ID.
 * 2. Check if the module exists and is not archived. If not, throw an error.
 * 3. Check if the module is of type 'questionAction' and the question action evaluation feature is enabled. If not, throw an error.
 * 4. Get the IDs of the old questions and actions.
 * 5. Create new question action objects based on the updated questions and actions.
 * 6. Save the new question action objects.
 * 7. Update the module's evaluation and pass percentage with the new question action objects and the provided pass percentage.
 * 8. Save the updated module.
 * 9. Delete the old questions and actions.
 * 10. Send a response with the message 'Module updated' and the updated module details.
 *
 * @param {Object} req - The request object.
 * @param {Object} req.params - The parameters object containing the module ID.
 * @param {string} req.params.id - The ID of the module to be edited.
 * @param {Object} req.body - The body object containing the updated questions and actions.
 * @param {Array} req.body.evaluation - The array of updated questions and actions.
 * @param {number} req.body.passPercentage - The updated pass percentage.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the message 'Module updated' and the updated module details.
 * @throws {BaseError} If the module is not found or is archived, or if question action evaluation is not allowed.
 */
export const editModuleQuestionsActions = async (req, res) => {
  const [module, nameModuleExist] = await Promise.all([
    Module.findById(req.params.id),
    // check if req.body.name exist and if it exist try checking if the name is unique
    req.body?.name ? Module.findOne({ name: req.body.name }) : null,
  ]);
  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }

  if (
    module.evaluationType &&
    module.evaluationType !== 'questionAction' &&
    CONF?.features?.questionActionEvaluation.state !== 'on'
  ) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Question Action Evaluation is not allowed',
    );
  }

  // Check if the name exist adn if it exist try checking if the name is unique
  if (req.body?.name) {
    if (nameModuleExist && nameModuleExist._id.toString() !== req.params.id) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Module name already exist',
      );
    }
    module.name = req.body.name;
  }

  if (req.body?.description) {
    module.description = req.body.description;
  }

  const oldQuestionActionIDs = module.evaluation;

  const arrayOfQuestionsActions = await Promise.all(
    req.body?.evaluation?.map(async (v) => {
      const quesAct = new QuestionAction(v);
      await quesAct.save();
      return quesAct;
    }),
  );

  const { passPercentage } = req.body;
  module.evaluation = arrayOfQuestionsActions;
  module.passPercentage = passPercentage;
  await module.save();

  // Delete all the old questions!
  await QuestionAction.deleteMany({ _id: { $in: oldQuestionActionIDs } });

  return res
    .status(HttpStatusCode.OK)
    .json({ message: 'Module updated', details: module });
};

/**
 * Archives a module.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with a JSON containing the archived module details.questions
 * @throws {BaseError} If the module is not found.
 */
export const archiveModule = async (req, res) => {
  const { id } = req.params;
  const module = await Module.findByIdAndUpdate(id, {
    archived: true,
    archivedAt: moment().toDate(),
  });
  if (!module) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module not found',
    );
  }

  // Old thumbnail are in the format of :{path and name}
  // Change it to ""
  module.thumbnail = '';

  await module.save();

  return res.status(HttpStatusCode.OK).json({
    message: 'Module archived',
    details: {
      id: module.id,
      name: module.name,
    },
  });
};

/**
 * Retrieves modules based on the provided query parameters.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object containing the query result of modules.
 *
 * @throws {BaseError} - If modules cannot be found.
 */
export const queryModules = async (req, res) => {
  const modules = await Module.find(req.query);

  if (!modules) {
    return res
      .status(HttpStatusCode.INTERNAL_SERVER)
      .json({ success: false, message: "Couldn't find modules." });
  }

  return res
    .status(HttpStatusCode.OK)
    .json({ success: true, message: 'Query result of modules', data: modules });
};

/**
 * Retrieves modules along with evaluations for a given user.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object containing modules and evaluations.
 *
 * @throws {BaseError} If the userId is invalid or missing.
 *
 * @example
 * // Request
 * GET /joinModulesAndEvaluations/userId/modId
 *
 * // Response
 * {
 *   "success": false,
 *   "message": "Modules along with evaluations",
 *   "data": [
 *     {
 *       "moduleId": "123",
 *       "moduleName": "Module 1",
 *       "evaluations": [
 *         {
 *           "evaluationId": "456",
 *           "evaluationName": "Evaluation 1"
 *         },
 *         {
 *           "evaluationId": "789",
 *           "evaluationName": "Evaluation 2"
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
export const joinModulesAndEvaluations = async (req, res) => {
  const { userId, modId } = req.params;

  if (!userId)
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: 'Invalid params' });

  const assignments = await ModuleAssignment.findById(modId);

  const modules = [];
  for (let { moduleId } of assignments) {
    const mod = await Module.findOne({ _id: moduleId });
    const evals = await Evaluation.find({ module: mod.name, userId });
    modules.push({ ...mod.getData(), evaluations: evals });
  }

  // WE ARE NOT SAVING ANY DATA!!!

  return res.status(HttpStatusCode.OK).json({
    success: false,
    message: 'Modules along with evaluations',
    data: modules,
  });
};

// export const deleteModule = async (req, res) => {
//   const { id } = req.params;

//   const response = await Module.findOneAndDelete({ _id: id });
//   if (!response) {
//     return res
//       .status(HttpStatusCode.BAD_REQUEST)
//       .json({ success: true, message: 'Module does not exist' });
//   }

//   return res
//     .status(HttpStatusCode.OK)
//     .json({ success: true, message: 'Module deleted successfully...' });
// };

/**
 * Assigns modules to domains, departments, and users.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with a success message and details.
 *
 * @throws {BaseError} If the module does not exist or is archived.
 * @throws {BaseError} If the user is not assigned as a user role.
 * @throws {InputError} If the user is assigned as an admin or superadmin.
 */
export const assignModules = async (req, res) => {
  // Modules
  // Domain Access
  // Department Access

  let {
    modules,
    domainsAccess = [],
    departmentsAccess = [],
    usersAccess = [],
  } = req.body;

  const selectedDomains = domainsAccess;
  const selectedDepartments = departmentsAccess;
  const selectedUsers = usersAccess;

  // Loop through all Modules
  const resolveArr = modules.map(async (moduleId) => {
    const module = await Module.findById(moduleId).populate(
      'moduleAccessId evaluation',
    );

    if (!module || module.archived) {
      throw new BaseError(
        'ServerError',
        HttpStatusCode.BAD_REQUEST,
        'Module does not exists',
      );
    }

    return module;
  });

  const modulesArray = await Promise.all(resolveArr);
  const selectedModules = modulesArray;

  // Data cleanup to just ID's
  const specialDomainsAccessFromDepartments = departmentsAccess.map(
    (v) => v.domainId,
  );

  // check userAccess has  only as user role
  const specialDomainAccessFromUser = usersAccess.map((user) => {
    return user.domainId._id;
  });

  domainsAccess = domainsAccess.map((v) => v.id);
  departmentsAccess = departmentsAccess.map((v) => v.id);
  usersAccess = usersAccess.map((v) => v.id);

  // Departments of the selected domains
  let departmentValues = await Department.find({
    domainId: { $in: domainsAccess },
    archived: { $ne: true },
  });

  const domainSelectedDepartments = departmentValues.map((v) => v._id);

  await Promise.all(
    modulesArray.map(async (module) => {
      const moduleAccess = module.moduleAccessId;
      let currentDoaminAccess = moduleAccess?.domains?.map((v) =>
        v?._id?.toString(),
      );
      moduleAccess.domains = _.union(currentDoaminAccess, domainsAccess);

      const currentDepartmentAccess = moduleAccess?.departments?.map((v) =>
        v?._id?.toString(),
      );
      moduleAccess.departments = _.union(
        currentDepartmentAccess,
        departmentsAccess,
        domainSelectedDepartments,
      );

      const currentUserAccess = moduleAccess?.users?.map((v) =>
        v?._id?.toString(),
      );
      moduleAccess.users = _.union(currentUserAccess, usersAccess);

      // Doing this for all 'Departments' only but auto assigning 'Domains'
      currentDoaminAccess = moduleAccess?.domains?.map((v) =>
        v?._id?.toString(),
      );
      moduleAccess.domains = _.union(
        currentDoaminAccess,
        specialDomainsAccessFromDepartments,
        specialDomainAccessFromUser,
      );

      await moduleAccess.save();
    }),
  );

  if (
    CONF?.features?.moduleOtpLogin &&
    CONF?.features?.auth?.types?.includes('SsoAuth')
  ) {
    const users = await User.find({
      role: ROLES.USER,
      $or: [
        { domainId: { $in: selectedDomains.map((dom) => dom.id) } },
        { departmentId: { $in: selectedDepartments.map((dep) => dep.id) } },
      ],
      archived: { $ne: true },
    });

    const finalUsers = users.concat(selectedUsers);
    // Make final user unique
    const uniqueUsers = _.uniqBy(finalUsers, 'id');

    assignModulesAndSendOtps(uniqueUsers, selectedModules);
  }

  return res.status(HttpStatusCode.OK).json({
    message: 'Modules assigned',
    details: [],
  });
};

/**
 * Assigns module domains and updates the module access settings.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with a success message and details of the updated module domain assignments.
 *
 * @throws {BaseError} If the module does not exist or is archived.
 *
 * @example
 * // Request
 * assignModuleDomainsUpdate(req, res);
 *
 * // Response
 * {
 *   message: 'Module Domain Assign Updated',
 *   details: [{ domainsAdded: selectedDomainAccessIds }],
 * }
 */
export const assignModuleDomainsUpdate = async (req, res) => {
  let { domainsAccess = [] } = req.body;

  // Get Module
  const module = await Module.findById(req.params.id).populate(
    'moduleAccessId',
  );

  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module does not exists',
    );
  }

  const moduleAccess = module.moduleAccessId;

  const selectedDomainAccessIds = domainsAccess.map((v) => v.id);
  moduleAccess.domains = selectedDomainAccessIds;

  // Find all departments that is inside the selected domains
  let departmentValues = await Department.find({
    domainId: { $in: selectedDomainAccessIds },
    archived: { $ne: true },
  });

  // Filter out all the department that is selected for the current module
  // departmentValues = departmentValues.filter((department) =>
  //   moduleAccess.departments.some(
  //     (moduleDepartmentId) =>
  //       moduleDepartmentId.toString() === department._id.toString(), // .toString to convert ObjectId to string
  //   ),
  // );

  // extract id from departmentsValue
  const departmentsValueId = departmentValues.map((v) => v._id);

  moduleAccess.departments = departmentsValueId;

  if (
    CONF?.features?.moduleOtpLogin &&
    CONF?.features?.auth?.types?.includes('SsoAuth')
  ) {
    const users = await User.find({
      domainId: { $in: domainsAccess.map((dom) => dom.id) }, // Ensure `departmentsAccess` is an array of objects with `id`
      role: ROLES.USER,
      archived: { $ne: true },
    });

    assignModulesAndSendOtps(users, [module]);
  }
  await moduleAccess.save();
  return res.status(HttpStatusCode.OK).json({
    message: 'Module Domain Assign Updated',
    details: [{ domainsAdded: selectedDomainAccessIds }],
  });
};

/**
 * Assigns special access to a module for departments and users.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the updated module special access details.
 *
 * @throws {BaseError} If the module does not exist or is archived.
 */
export const assignModuleSpecialUpdate = async (req, res) => {
  // Modules
  // Department Access
  // User Access

  let { departmentsAccess = [], usersAccess = [] } = req.body;
  const selectedUsers = usersAccess;
  const selectedDepartments = departmentsAccess;

  // Get Module
  const module = await Module.findById(req.params.id).populate(
    'moduleAccessId',
  );

  if (!module || module.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module does not exists',
    );
  }

  const moduleAccess = module.moduleAccessId;

  // Data cleanup to just get ID's
  const specialDomainsAccessFromDepartments = departmentsAccess.map(
    (v) => v.domainId,
  );

  // check userAccess has only as user role
  // For future: If we want the functionality; while adding user, will give access to domain admins too (Func 1)
  // const specialDomainAccessFromUser = usersAccess.map((user) => {
  //   if (user.role !== ROLES.USER) {
  //     throw new BaseError(
  //       'InputError',
  //       HttpStatusCode.BAD_REQUEST,
  //       'User cannot be a admin or superadmin',
  //     );
  //   }

  //   return user.domainId;
  // });

  departmentsAccess = departmentsAccess.map((v) => v.id);

  usersAccess = usersAccess.map((v) => v.id);
  moduleAccess.departments = departmentsAccess;
  moduleAccess.users = usersAccess;

  // Doing this for all 'Departments' only but auto assigning 'Domains'
  const currentDoaminAccess = moduleAccess?.domains?.map((v) =>
    v?._id?.toString(),
  );

  moduleAccess.domains = _.union(
    currentDoaminAccess,
    specialDomainsAccessFromDepartments,
    // specialDomainAccessFromUser, // (Func 1)
  );

  if (
    CONF?.features?.moduleOtpLogin &&
    CONF?.features?.auth?.types?.includes('SsoAuth')
  ) {
    const users = await User.find({
      departmentId: { $in: selectedDepartments.map((dept) => dept.id) }, // Ensure `departmentsAccess` is an array of objects with `id`
      role: ROLES.USER,
      archived: { $ne: true },
    });

    const finalUsers = users.concat(selectedUsers);
    const uniqueUsers = _.uniqBy(finalUsers, 'id');
    assignModulesAndSendOtps(uniqueUsers, [module]);
  }

  await moduleAccess.save();

  return res.status(HttpStatusCode.OK).json({
    message: 'Module Special Assign Updated',
    details: [
      {
        departmentsAdded: departmentsAccess,
        usersAdded: usersAccess,
        domainsInModules: [
          ...currentDoaminAccess,
          ...specialDomainsAccessFromDepartments,
        ], // Since this is a union of old domains and new domains
      },
    ],
  });
};

/**
 * Retrieves module assignments based on the provided query parameters.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response object containing the query result of module assignments.
 *
 * @throws {BaseError} - If there is an error retrieving the module assignments.
 */
export const queryModuleAssignment = async (req, res) => {
  const response = await ModuleAssignment.find(req.query);

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Query result of module assignment',
    data: response,
  });
};

/**
 * Deletes module assignments.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with success status and message.
 *
 * @throws {Object} If moduleId is missing or deletion fails.
 */
export const deleteModuleAssignment = async (req, res) => {
  const { moduleId } = req.params;

  if (!moduleId) {
    return res
      .status(HttpStatusCode.BAD_REQUEST)
      .json({ success: false, message: 'Wrong params' });
  }

  const response = await ModuleAssignment.deleteOne(req.params);

  if (!response.acknowledged) {
    return res
      .status(HttpStatusCode.INTERNAL_SERVER)
      .json({ success: false, message: 'Could not delete' });
  }

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Module assignments deleted',
  });
};

/**
 * Creates a new module step for a given module.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object containing the success status, message, and data of the created module step.
 *
 * @throws {BaseError} If the module does not exist or is archived.
 */
export const createModuleStep = async (req, res) => {
  const { moduleId } = req.params;

  const moduleExists = await Module.findById(moduleId);
  if (!moduleExists || moduleExists.archived) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ success: false, message: 'Module does not exist' });
  }

  const response = await ModuleStep.create({
    ...req.body,
    moduleId,
  });

  return res
    .status(HttpStatusCode.OK)
    .json({ success: true, message: 'Module step added', data: response });
};

/**
 * Retrieves module steps based on the provided query parameters.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} - The response containing the query result of module steps.
 *
 * @throws {BaseError} - If there is an error retrieving the module steps.
 */
export const queryModuleStep = async (req, res) => {
  const response = await ModuleStep.find({ ...req.query });
  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Query result of module step',
    data: response,
  });
};

export const isValidModuleId = async (id) => {
  const moduleExists = await Module.findById(id).lean();
  if (!moduleExists || moduleExists.archived) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module does not exist',
    );
  }
  return moduleExists;
};

export const isUserAssignedToModule = async (userId, moduleId) => {
  // Run both the module validity check and user fetch in parallel
  const [module, user] = await Promise.all([
    isValidModuleId(moduleId),
    User.findById(userId).lean(),
  ]);

  // Throw an error if the user was not found
  if (!user) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'User not found',
    );
  }

  // Fetch module access details
  const moduleAccess = await ModuleAccess.findById(
    module.moduleAccessId,
  ).lean();
  if (!moduleAccess) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module access does not exist',
    );
  }

  // Check if the user has access based on domain, department, or individual assignment
  const hasAccess =
    moduleAccess.domains.includes(user.domainId) ||
    moduleAccess.departments.includes(user.departmentId) ||
    moduleAccess.users.includes(userId);

  // Throw an error if the user does not have access to the module
  if (!hasAccess) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'The module is not assigned to the user',
    );
  }

  return true;
};

export const addFailureMomentCountInModule = (
  module,
  chapterIndex,
  momentIndex,
  onWrong,
  userId,
) => {
  let countChanged = false;
  const { momentCount } = module;

  momentCount.forEach((moment) => {
    if (
      +moment?.chapterIndex === +chapterIndex &&
      +moment?.momentIndex === +momentIndex
    ) {
      countChanged = true;

      const userIdString = userId.toString();
      // Find the user by id (using `id`, not `userId`)
      const userIndex = moment?.users?.findIndex((v) => v.id === userIdString);

      if (userIndex === -1) {
        // Add a new user if not found
        moment.users.push({ id: userIdString, count: onWrong?.length });
      } else {
        // Update the count if the user exists
        moment.users[userIndex].count += onWrong?.length;
      }
    }
  });

  if (!countChanged && onWrong?.length > 0) {
    momentCount.push({
      chapterIndex,
      momentIndex,
      users: [{ id: userId.toString(), count: onWrong?.length }],
    });
  }

  // Sort the momentCount based on the sum of each moment's users' count
  momentCount.sort((a, b) => {
    const sumA = a.users.reduce((acc, curr) => acc + curr.count, 0);
    const sumB = b.users.reduce((acc, curr) => acc + curr.count, 0);
    return sumB - sumA;
  });

  return momentCount;
};

export const validateModuleUniqueness = async (name, index, currentId) => {
  const query = { archived: { $ne: true } };
  if (currentId) query._id = { $ne: currentId };

  const [nameExists, indexExists] = await Promise.all([
    Module.findOne({ ...query, name }),
    Module.findOne({ ...query, index }),
  ]);

  if (nameExists)
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module name already exists',
    );
  if (indexExists)
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      'Module index already exists',
    );
};

export const getModuleTrainingValues = async (req, res) => {
  const { moduleId } = req.params;
  isValidId(moduleId);

  // Find the module
  const module = await Module.findById(moduleId);
  if (!module || module.archived) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ success: false, message: 'Module ID not found' });
  }

  // Check if module is JSON lifecycle type
  if (module.evaluationType !== 'jsonLifeCycle') {
    return res.status(HttpStatusCode.BAD_REQUEST).json({
      success: false,
      message: 'Module is not of type jsonLifeCycle',
    });
  }

  // // Check access permissions
  // const moduleAccess = await ModuleAccess.find({
  //   $or: [{ departments: req.user.departmentId }, { users: req.user.id }],
  //   _id: module._id,
  // });

  // if (!moduleAccess) {
  //   return res.status(HttpStatusCode.NOT_FOUND).json({
  //     success: false,
  //     message: "User doesn't have access to this module.",
  //   });
  // }

  // Get training JSON data based on storage preference
  let trainingJsonData;
  if (CONF?.features?.studioConnect?.state === 'on') {
    if (module?.evaluationJsonS3Url) {
      console.log('while calling', module?.evaluationJsonS3Url);
      const res = await axios.get(module?.evaluationJsonS3Url);
      trainingJsonData = res.data;
    } else if (module?.trainingJsonS3Url) {
      const res = await axios.get(module?.trainingJsonS3Url);
      trainingJsonData = res.data;
    }
  } else {
    trainingJsonData = await getModuleJson(module, 'trainingJson');
  }

  if (!trainingJsonData) {
    return res
      .status(HttpStatusCode.NOT_FOUND)
      .json({ success: false, message: 'Training data not found' });
  }

  // Convert the training data to the required format
  const convertedTrainingData = convertBasicTrainingFromJson(trainingJsonData);

  // Get the URL for the training data file
  // const trainingUrl = await formatModuleTrainings(module);

  return res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Training data retrieved successfully',
    trainingData: convertedTrainingData,
    // trainingUrl: trainingUrl,
  });
};

const getAccessibleModuleIds = async (userId) => {
  try {
    // Get user details
    const user = await User.findById(userId);
    if (!user) {
      return [];
    }

    // Only SUPER_ADMIN and PRODUCT_ADMIN have access to all modules
    if ([ROLES.SUPER_ADMIN, ROLES.PRODUCT_ADMIN].includes(user.role)) {
      const allModules = await Module.find({ archived: { $ne: true } }).select(
        '_id',
      );
      return allModules.map((module) => module._id);
    }

    // For other roles, check module access through ModuleAccess
    const accessibleModuleAccess = await ModuleAccess.find({
      $or: [
        { users: userId },
        { domains: user.domainId },
        { departments: user.departmentId },
      ],
    });

    const moduleAccessIds = accessibleModuleAccess.map((access) => access._id);

    // Get all modules that have these moduleAccessIds
    const accessibleModules = await Module.find({
      moduleAccessId: { $in: moduleAccessIds },
      archived: { $ne: true },
    }).select('_id');

    return accessibleModules.map((module) => module._id);
  } catch (error) {
    logger.error('Error getting accessible module IDs:', error);
    return [];
  }
};

export const getAccessibleModulesAndProjectIds = async (userId) => {
  // Fetch modules
  const accessibleModuleIds = await getAccessibleModuleIds(userId);

  // Fetch projects created by this user
  const userProjects = await Project.find({
    creator: userId,
    archived: { $ne: true },
  }).select('_id');

  const userProjectIds = userProjects.map((project) => project._id.toString());

  // Fetch projectIds from accessible modules
  const modulesWithProjectIds = await Module.find({
    _id: { $in: accessibleModuleIds },
    projectId: { $exists: true, $ne: null }, // Only if projectId exists
  }).select('projectId');

  const moduleProjectIds = modulesWithProjectIds.map((mod) =>
    mod.projectId.toString(),
  );

  // Merge project IDs (user created + from modules), remove duplicates
  const projectIdsSet = new Set([...userProjectIds, ...moduleProjectIds]);

  const accessibleProjectIds = Array.from(projectIdsSet);
  return {
    accessibleModuleIds: accessibleModuleIds.map((id) => id.toString()), // Ensure strings
    accessibleProjectIds: accessibleProjectIds,
  };
};

export const getAccessibleModules = async (req, res) => {
  const userId = req.user._id;
  const { accessibleModuleIds, accessibleProjectIds } =
    await getAccessibleModulesAndProjectIds(userId);
  return res.status(200).json({
    message: 'All Accessible Modules and Projects',
    details: {
      accessibleModuleIds: accessibleModuleIds,
      accessibleProjectIds,
    },
  });
};
