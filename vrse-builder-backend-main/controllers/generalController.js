import { HttpStatusCode } from '../constants.js';
import { Log } from '../models/LogsModel.js';
import BaseError from '../utils/classes/BaseError.js';
import { getClientIp } from '../utils/utils.js';
import { generateUniqueOTP } from './otpController.js';

export const serverStatus = async (req, res) => {
  const ip = getClientIp(req);

  res.status(HttpStatusCode.OK).json({
    success: true,
    message: 'Server runnning and request made from IP address [' + ip + ']',
  });
};

export const clearConsoleLogs = async (req, res) => {
  const response = await Log.deleteMany({ level: { $in: ['info', 'error'] } });
  if (!response.acknowledged) {
    throw new BaseError(
      'MongoError',
      HttpStatusCode.INTERNAL_SERVER,
      'Unable to remove logs',
    );
  }

  return res
    .status(HttpStatusCode.OK)
    .json({ success: true, message: `${response.deletedCount} logs removed` });
};
