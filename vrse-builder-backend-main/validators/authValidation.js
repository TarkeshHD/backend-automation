import Joi from 'joi';
import { PASSWORD_SCHEMA } from '../middlewares/validate.js';

export const loginBasicSchema = Joi.object()
  .keys({
    username: Joi.string().required(),
    password: PASSWORD_SCHEMA,
  })
  .unknown(false);

export const loginDeviceSchema = Joi.object().keys({
  username: Joi.string().required(),
  password: PASSWORD_SCHEMA,
  deviceID: Joi.string().required(),
});

export const loginDomainSchema = Joi.object().keys({
  name: Joi.string().required(),
  domainPassword: PASSWORD_SCHEMA,
  deviceId: Joi.string().optional(),
  macAddr: Joi.string().optional(),
});

export const loginTraineeDomainTokenSchema = Joi.object().keys({
  username: Joi.string().required(),
  deviceId: Joi.string().optional(),
  deviceId: Joi.string().optional(),
  macAddr: Joi.string().optional(),
});

export const sendOtp2FASchema = loginBasicSchema;
