import mongoose from 'mongoose';
import { HttpStatusCode } from '../../constants.js';
import BaseError from '../classes/BaseError.js';

export function isValidId(id) {
  if (id.length === 0 || !mongoose.Types.ObjectId.isValid(id)) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      'Not a valid id',
    );
  }
}
