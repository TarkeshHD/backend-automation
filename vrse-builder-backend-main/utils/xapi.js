import LRSClient from '../utils/classes/xapi/LRSClient.js';
import { XAPIStatementFactory } from '../utils/classes/xapi/XAPIStatementFactory.js';
import { Report } from '../models/ReportModel.js';
import { Training } from '../models/TrainingModel.js';
import { CONF } from '../constants.js';

export const sendXAPIStatement = async (data, model) => {
  if (CONF.features?.xapi?.state !== 'on') {
    return;
  }

  const Collection = model === 'evaluation' ? Report : Training;

  const document = await Collection.findById(data._id)
    .populate('userId')
    .populate('moduleId')
    .exec();

  if (!document) return; // If the document is not found, exit the function

  const statement = createXAPIStatement(document.toObject());

  const lrsClient = new LRSClient();
  await lrsClient.sendStatement(statement);
};

const createXAPIStatement = (data) => {
  const config = {
    actor: {
      homePage:
        process.env.XAPI_HOMEPAGE ||
        'https://dashboard-dev.autovrse-training.com/users',
    },
    object: {
      baseUrl:
        process.env.XAPI_OBJECT_BASE_URL ||
        'https://dashboard-dev.autovrse-training.com/modules',
      activityType: data.trainingStatus
        ? 'http://adlnet.gov/expapi/activities/training'
        : 'http://adlnet.gov/expapi/activities/assessment',
    },
  };

  const factory = new XAPIStatementFactory(config);
  return factory.createStatement(data);
};
