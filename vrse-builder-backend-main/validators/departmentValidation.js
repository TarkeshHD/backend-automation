import Joi from 'joi';
import { DB_OBJECT_ID_SCHEMA } from '../middlewares/validate.js';

export const registerDepartmentSchema = Joi.object()
  .keys({
    domainId: DB_OBJECT_ID_SCHEMA,
  })
  .unknown(false);
