import { HttpStatusCode } from '../constants.js';
import BaseError from '../utils/classes/BaseError.js';
import Email from '../utils/classes/Email.js';
import logger from '../utils/logger.js';
import errorMail from '../utils/mailTemplates/errorMail.js';

export const errorHandler = async (error, req, res, next) => {
  // log error
  logger.error(error.message);

  if (error.isJoi) {
    const { details } = error;
    const message = details.map((i) => i.message).join(',');

    return res.status(HttpStatusCode.BAD_REQUEST).send({
      name: 'InputError',
      status: HttpStatusCode.BAD_REQUEST,
      message: `Validations failed : ${message}`,
      success: false,
    });
  }

  if (error instanceof BaseError) {
    if (!error.isOperational) {
      // send mail to admin
      const mailOptions = errorMail(error);
      await Email.send(mailOptions);
    }

    return res.status(error.statusCode).send({
      name: error.name,
      status: error.statusCode,
      message: error.message,
      success: false,
    });
  }

  // if error is not an instance of BaseError
  return res.status(HttpStatusCode.INTERNAL_SERVER).send({
    message: error.message,
    success: false,
    status: HttpStatusCode.INTERNAL_SERVER,
  });
};
