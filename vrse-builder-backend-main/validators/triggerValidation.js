import Joi from 'joi';

export const submitTriggerSchema = Joi.object({
  sessionId: Joi.string()
    .pattern(/^[0-9a-fA-F]{24}$/)
    .required(),
  sessionType: Joi.string().valid('evaluation', 'training').required(),
  chapterIndex: Joi.number().required(),
  momentIndex: Joi.number().required(),
  time: Joi.number(),
  verb: Joi.string(),
  object: Joi.string(),
  triggerType: Joi.string()
    .valid('onRightTrigger', 'onWrongTrigger', 'onAdminChange')
    .required(),
});
