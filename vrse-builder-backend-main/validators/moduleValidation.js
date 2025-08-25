import Joi from 'joi';
import { CONF as configData } from '../constants.js';
import { createFileSchema } from '../middlewares/validate.js';

export const createModuleSchema = Joi.object({
  name: Joi.string().required(),
  index: Joi.number().integer().required(),
  description: Joi.string().required(),
  evaluationType: Joi.string()
    .valid('question', 'time', 'questionAction', 'jsonLifeCycle')
    .required(),
  // files: Joi.array()
  //   .items(
  //     createFileSchema('thumbnail', ['image/jpeg', 'image/png'], 10485760),
  //     createFileSchema('SOP', ['application/pdf'], 10485760),
  //   )
  //   .required(),
  gameMode: Joi.string()
    .valid('singleplayer', 'multiplayer', 'hybridplayer')
    .optional(),
});

export const createModuleStudioSchema = Joi.object({
  _id: Joi.string().required(),
  name: Joi.string().required(),
  description: Joi.string().required(),
  evaluationJsonUrl: Joi.string().uri().optional(),
  trainingJsonUrl: Joi.string().uri().optional(),
  gameMode: Joi.string()
    .valid('singleplayer', 'multiplayer', 'hybridplayer')
    .optional(),
}).custom((value, helpers) => {
  // Ensure at least one of evaluationJsonUrl or trainingJsonUrl is provided
  if (!value.evaluationJsonUrl && !value.trainingJsonUrl) {
    return helpers.error('object.base', {
      message: 'Either evaluationJsonUrl or trainingJsonUrl must be provided',
    });
  }
  return value;
});

export const assignModuleDomainUpdateSchema = Joi.object({
  domainsAccess: Joi.array().items(
    Joi.object({
      id: Joi.string().required(),
      name: Joi.string().required(),
      type: Joi.string().valid('domain').required(),
    }),
  ),
});

export const assignModuleSpecialUpdateSchema = Joi.object({
  departmentsAccess: Joi.array()
    .items(
      Joi.object({
        domainId: Joi.string().required(),
        domainName: Joi.string().required(),
        id: Joi.string().required(),
        name: Joi.string().required(),
        type: Joi.string().valid('department').required(),
      }),
    )
    .default([]),
  usersAccess: Joi.array()
    .items(
      Joi.object({
        domainId: Joi.string().required(),
        domainName: Joi.string().required(),
        id: Joi.string().required(),
        name: Joi.string().required(),
        role: Joi.string().valid('user').required(),
        type: Joi.string().valid('user').required(),
        username: Joi.string().required(),
      }),
    )
    .default([]),
}).or('departmentsAccess', 'usersAccess');

export const assignModulesSchema = Joi.object({
  modules: Joi.array().items(Joi.string()).required(),
  departmentsAccess: Joi.array()
    .items(
      Joi.object({
        domainId: Joi.string().required(),
        domainName: Joi.string().required(),
        id: Joi.string().required(),
        name: Joi.string().required(),
        type: Joi.string().valid('department').required(),
      }),
    )
    .default([]),
  domainsAccess: Joi.array()
    .items(
      Joi.object({
        id: Joi.string().required(),
        name: Joi.string().required(),
        type: Joi.string().valid('domain').required(),
      }),
    )
    .default([]),
  usersAccess: Joi.array()
    .items(
      Joi.object({
        domainId: Joi.string().required(),
        domainName: Joi.string().required(),
        id: Joi.string().required(),
        name: Joi.string().required(),
        role: Joi.string().required(),
        type: Joi.string().valid('user').required(),
        username: Joi.string().required(),
      }),
    )
    .default([]),
});

export const editModuleQuestionSchema = Joi.object({
  evaluation: Joi.array()
    .items(
      Joi.object({
        title: Joi.string().required(),
        answer: Joi.string().required(),
        note: Joi.string().optional(),
        options: Joi.object({
          a: Joi.string().required(),
          b: Joi.string().required(),
          c: Joi.string().required(),
          d: Joi.string().required(),
        }),
        weightage: Joi.number().integer().min(1).required(),
      }),
    )
    .required()
    .min(configData.minQuestions || 10),
  passPercentage: Joi.number().integer().min(1).max(100).required(),
  noOfQuestion: Joi.number()
    .integer()
    .max(Joi.ref('evaluation.length'))
    .required(),
  description: Joi.string().required(),
});

export const editModuleTimeSchema = Joi.object({
  goldTimeLimit: Joi.number().integer().min(0).required(),
  silverTimeLimit: Joi.number()
    .integer()
    .min(Joi.ref('goldTimeLimit')) // Silver must be greater than or equal to gold
    .required(),
  bronzeTimeLimit: Joi.number()
    .integer()
    .min(Joi.ref('silverTimeLimit')) // Bronze must be greater than or equal to silver
    .required(),
  mistakesAllowed: Joi.number().integer().min(0).required(),
  note: Joi.string().optional(),
  name: Joi.string().optional(),
  description: Joi.string().optional(),
  index: Joi.number().integer().optional(),
});
