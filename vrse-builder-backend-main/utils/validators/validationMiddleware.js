import { validationResult } from 'express-validator';
import { HttpStatusCode } from '../../constants.js';
import BaseError from '../classes/BaseError.js';

// Middleware to check if the form data is not empty
export const reqErrorValidator = (req, res, next) => {
  let errors = validationResult(req);
  if (!Object.keys(req.body).length) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Form is empty',
    );
  }
  if (!errors.isEmpty()) {
    return res.json({
      errors: errors.array(),
    });
  }

  next();
};

// Middleware to check if given param's length is less than 128 and do not special characters
export const verifyName = (paramNames) => {
  return (req, res, next) => {
    for (let name of paramNames) {
      if (req.body[name].length > 128) {
        throw new BaseError(
          'InputError',
          HttpStatusCode.BAD_REQUEST,
          `Invalid params provided. Input '${name}' should be less than 128 in length.`,
        );
      }

      const specialChars = /[`!#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;

      if (specialChars.test(req.body[name])) {
        throw new BaseError(
          'InputError',
          HttpStatusCode.BAD_REQUEST,
          `Invalid params provided. Input '${name}' should not contain special character.`,
        );
      }
      return next();
    }
  };
};
