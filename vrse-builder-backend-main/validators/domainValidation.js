import Joi from 'joi';
import {
  DB_OBJECT_ID_SCHEMA,
  PASSWORD_SCHEMA,
} from '../middlewares/validate.js';

export const registerDomainSchema = Joi.object()
  .keys({
    name: Joi.string().required(),
    parentDomain: Joi.string().optional(),
    parentId: DB_OBJECT_ID_SCHEMA.optional(),
    domainPassword: PASSWORD_SCHEMA,
    domainName: Joi.optional(),
  })
  .unknown(false);
