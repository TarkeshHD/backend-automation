import axios from 'axios';
import _ from 'lodash';
import moment from 'moment-timezone';

import {
  CONF as configData,
  HttpStatusCode,
  PERMISSIONS,
} from '../constants.js';
import { User } from '../models/UserModel.js';
import { Domain } from '../models/DomainModel.js';
import { Department } from '../models/DepartmentModel.js';
import { Training } from '../models/TrainingModel.js';
import { Report } from '../models/ReportModel.js';
import BaseError from '../utils/classes/BaseError.js';
import { Module } from '../models/ModuleModel.js';
import logger from '../utils/logger.js';
import { archiveUserFix } from '../scripts/fixDocuments.js';
/**
 * Retrieves all datas from the specified URL.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the retrieved datas.
 *
 * @throws {Error} If there is an error retrieving the datas.
 */
export const getAllDatas = async (req, res) => {
  const pageIndex = req.query.pageIndex || 1;
  // check if authentication mode is on, if its on do that first
  let bearerToken = '';
  let isAuth = false;

  if (configData?.features?.archive?.auth === 'on') {
    isAuth = true;
    const authBody = configData?.features?.archive?.authValues;
    const authUrl = configData?.features?.archive?.authUrl;
    const response = await axios.post(authUrl, authBody);
    bearerToken = response.data?.token;
  }

  let responseData = [];
  // Get the url from configuration.json, and if auth on, add the bearer token to the header; else, just get the data
  if (isAuth) {
    responseData = await axios.get(
      `${configData?.features?.archive?.dataUrl}?pageIndex=${pageIndex}`,
      {
        headers: {
          Authorization: `Bearer ${bearerToken}`,
        },
      },
    );
  } else {
    responseData = await axios.get(configData?.features?.archive?.dataUrl);
  }

  return res.status(200).json({
    message: 'Data retrieved successfully',
    details: responseData.data,
  });
};

/**
 * Bulk archives records based on the model type and data passed
 * Model type obtained from req.body is mapped to a approrpriate collections mongoose model.
 * _id field is defaultly passed for bulk delete and used directly for all the models
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the confirmation method
 *
 * @throws {Error} If there is an error retrieving the datas.
 */
export const bulkArchiveData = async (req, res) => {
  const { type, data } = req.body;

  if (!PERMISSIONS[req.user.role]?.includes(`delete_${type}`)) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.UNAUTHORISED,
      `You are not authorised to perform this bulk delete operation`,
    );
  }

  const TYPE_TO_MODEL_MAP = {
    user: User,
    domain: Domain,
    department: Department,
    training: Training,
    evaluation: Report,
    module: Module,
  };

  const archiveConfig = {
    user: {
      model: 'user',
    },
    domain: {
      model: 'domain',
      additionalOperations: {
        check: { model: 'department', field: 'domainId' },
      },
    },
    department: {
      model: 'department',
      additionalOperations: {
        check: { model: 'user', field: 'departmentId' },
      },
    },
    training: {
      model: 'training',
    },
    evaluation: {
      model: 'evaluation',
    },
    module: {
      model: 'module',
      fieldToUpdate: { thumbnail: '' },
    },
  };

  const archiveConfigType = archiveConfig[type];
  const additionalOperations = archiveConfigType?.additionalOperations;

  if (additionalOperations?.check) {
    const Model = TYPE_TO_MODEL_MAP[additionalOperations?.check?.model];
    const field = additionalOperations?.check?.field;
    const modelData = await Model.find({
      [field]: data,
      archived: { $ne: true },
    });
    if (!_.isEmpty(modelData)) {
      throw new BaseError(
        'InputError',
        HttpStatusCode.BAD_REQUEST,
        `${_.startCase(type)} has ${_.startCase(
          additionalOperations.check?.model?.toString(),
        )}s. Please delete them first`,
      );
    }
  }

  const ArchiveModel = TYPE_TO_MODEL_MAP[archiveConfigType.model];

  if (_.isEmpty(ArchiveModel) || _.isEmpty(data)) {
    throw new BaseError(
      'ServerError',
      HttpStatusCode.BAD_REQUEST,
      `You cannot perform this bulk delete operation`,
    );
  }

  const archiveObject = {
    archived: true,
    archivedAt: moment().toDate(),
  };

  await ArchiveModel.updateMany(
    { _id: data },
    { ...archiveObject, ...additionalOperations?.fieldToUpdate },
  );

  if (additionalOperations?.archive) {
    const Model = TYPE_TO_MODEL_MAP[additionalOperations?.archive?.model];
    await Model.updateMany(
      { [additionalOperations?.archive?.field]: data },
      archiveObject,
    );
  }

  logger.record(`${_.startCase(type)} archived`, {
    action: 'archive',
    type: type,
  });

  res.status(200).json({ message: 'Data deleted successfully' });
};

export const fixArchivedRecords = async (req, res) => {
  await archiveUserFix();
  res.status(200).json({ message: 'Document changes has been done' });
};
