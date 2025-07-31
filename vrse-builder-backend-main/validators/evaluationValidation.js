import Joi from 'joi';

export const createEvaluationSchema = Joi.object({
  mode: Joi.string()
    .valid('mcq', 'time', 'questionAction', 'jsonLifeCycle')
    .required(),
  devMode: Joi.boolean().optional(),
});

export const submitQuestionSchema = Joi.object({
  answer: Joi.string().valid('a', 'b', 'c', 'd').required(),
  isLast: Joi.boolean().optional(),
  endTime: Joi.when('isLast', {
    is: true,
    then: Joi.number().required(),
    otherwise: Joi.optional(),
  }),
  question: Joi.object({
    options: Joi.object().pattern(Joi.string(), Joi.string()).required(),
    title: Joi.string().required(),
    answer: Joi.string().required(),
  }).required(),
});

export const submitTimeSchema = Joi.object({
  time: Joi.object({
    goldTimeLimit: Joi.number().required(),
    silverTimeLimit: Joi.number()
      .required()
      .when('goldTimeLimit', {
        is: Joi.number().required(),
        then: Joi.number().greater(Joi.ref('goldTimeLimit')).required(),
      }),
    bronzeTimeLimit: Joi.number()
      .required()
      .when('silverTimeLimit', {
        is: Joi.number().required(),
        then: Joi.number().greater(Joi.ref('silverTimeLimit')).required(),
      }),
    mistakesAllowed: Joi.number().required(),
    note: Joi.string().optional(),
  }).required(),
  mistakes: Joi.array()
    .items(
      Joi.object({
        description: Joi.string().required(),
        timeOfMistake: Joi.number().required(),
      }),
    )
    .required(),
  endTime: Joi.number().required(),
});

export const submitQuestionActionSchema = Joi.object({
  questionAction: Joi.object({
    type: Joi.string().required().valid('question', 'action'),
    title: Joi.string().required(),
    timeRequired: Joi.number().default(0),
    timeTaken: Joi.number().default(0),
    options: Joi.when('type', {
      is: 'question',
      then: Joi.object({
        a: Joi.string().required(),
        b: Joi.string().required(),
        c: Joi.string().required(),
        d: Joi.string().required(),
      }).required(),
      otherwise: Joi.forbidden(),
    }),
    answer: Joi.when('type', {
      is: 'question',
      then: Joi.string().required().valid('a', 'b', 'c', 'd'),
      otherwise: Joi.string().required().valid('success', 'failure'),
    }),
    infoImage: Joi.any(),
    note: Joi.string().optional(),
    descriptionSuccess: Joi.when('type', {
      is: 'action',
      then: Joi.string().required(),
      otherwise: Joi.forbidden(),
    }),
    descriptionFailure: Joi.when('type', {
      is: 'action',
      then: Joi.string().required(),
      otherwise: Joi.forbidden(),
    }),
    weightage: Joi.number().default(1),
  }).required(),
  answer: Joi.string()
    .required()
    .valid('a', 'b', 'c', 'd', 'success', 'failure'),
  isLast: Joi.boolean().optional(),
  endTime: Joi.when('isLast', {
    is: true,
    then: Joi.number().required(),
    otherwise: Joi.number().optional(),
  }),
});

export const submitJsonLifeCycleSchema = Joi.object({
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

export const submitEndJsonLifeCycleSchema = Joi.object({
  endTime: Joi.number().required(),
});
