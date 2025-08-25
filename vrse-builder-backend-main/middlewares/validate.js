import Joi from 'joi';
import BaseError from '../utils/classes/BaseError.js';
import { HttpStatusCode } from '../constants.js';
import logger from '../utils/logger.js';

export const validateSchema = (schema) => async (req, res, next) => {
  try {
    // If req.body is undefined, body property wont be added to values same for files
    const values = {
      ...(req.body && Object.keys(req.body).length > 0 && req.body),
      // ...(req.files &&
      //   Object.keys(req.files).length > 0 && { files: req.files }),  // Add req.files validation later
    };

    await schema.validateAsync(values);
    next(); // Validation successful
  } catch (error) {
    if (error instanceof Joi.ValidationError) {
      logger.error(`Validation Error: ${error.message}`);
      return next(
        new BaseError(
          'ValidationError',
          HttpStatusCode.BAD_REQUEST,
          'Invalid data provided. Please check the data and try again',
        ),
      );
    }
    return next(error);
  }
};

export const PASSWORD_SCHEMA = Joi.string().required();
// .min(6)
// .max(32)
// .required()
// .pattern(
//   new RegExp(
//     '^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\\$%^&*])[a-zA-Z0-9!@#\\$%^&*]+$',
//   ), // Should have a uppercase, lowercase and a number with special symbol
// );

export const DB_OBJECT_ID_SCHEMA = Joi.string().hex().length(24).required();

export const createFileSchema = function (fieldname, mimetype, sizeInBytes) {
  return Joi.object({
    fieldname: Joi.string().valid(fieldname).required(),
    originalname: Joi.string().required(),
    encoding: Joi.string().required(),
    mimetype: Joi.string()
      .valid(...mimetype)
      .required(),
    buffer: Joi.binary().required(), // Assuming this is binary data
    size: Joi.number().max(sizeInBytes).required(),
  });
};
