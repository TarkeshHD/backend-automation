import Joi from 'joi';

export const createMultiplayerSessionSchema = Joi.object({
  sessionType: Joi.string().valid('evaluation', 'training').required(),
  cohortId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .optional(),
  devMode: Joi.boolean().optional(),
});

export const joinMultiplayerSessionSchema = Joi.object({
  sessionId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required(),
  sessionType: Joi.string().valid('evaluation', 'training').required(),
});
