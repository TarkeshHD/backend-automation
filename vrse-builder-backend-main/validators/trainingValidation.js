import Joi from 'joi';
import { start } from 'repl';

export const createTrainingSchema = Joi.object({
  trainingType: Joi.string()
    .valid('mcq', 'time', 'questionAction', 'jsonLifeCycle')
    .required(),
  devMode: Joi.boolean().optional(),
});

export const submitTrainingJsonLifeCycleSchema = Joi.object({
  chapterIndex: Joi.number().required(),
  momentIndex: Joi.number().required(),
  startTime: Joi.number().required(),
  endTime: Joi.number().optional(),
  events: Joi.array()
    .items(
      Joi.object({
        verb: Joi.string().required(),
        object: Joi.string().required(),
        time: Joi.number().required(),
        eventType: Joi.string()
          .required()
          .valid('onRight', 'onWrong', 'onMomentComplete'),
      }),
    )
    .required(),
});

export const endTrainingJsonLifeCycleSchema = Joi.object({
  endTime: Joi.number().required(),
});
