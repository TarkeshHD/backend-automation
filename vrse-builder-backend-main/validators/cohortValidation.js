import Joi from 'joi';

export const cohortRegisterSchema = Joi.object({
  name: Joi.string().required(),
  startDate: Joi.number().required(),
  endDate: Joi.number(),
  venue: Joi.string().required(),
  moduleIds: Joi.array().items(Joi.string().required()).required(),
  userIds: Joi.array().items(Joi.string().required()).required(),
});
