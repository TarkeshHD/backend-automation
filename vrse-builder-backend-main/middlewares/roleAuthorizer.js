import { HttpStatusCode } from '../constants.js';
import BaseError from '../utils/classes/BaseError.js';

export const roleAuthorizer = (rolesAccess = []) => {
  return (req, res, next) => {
    try {
      if (!rolesAccess.includes(req.user.role)) {
        throw new BaseError(
          'ServerError',
          HttpStatusCode.BAD_REQUEST,
          'You are unauthorized to use this API',
        );
      }

      next();
    } catch (error) {
      return next(error);
    }
  };
};
