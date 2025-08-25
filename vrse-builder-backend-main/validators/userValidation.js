import Joi from 'joi';

export const userUpdateSchema = Joi.object({
  name: Joi.string(),
  username: Joi.string(),
  password: Joi.string(),

  // Assuming 'domain' is a string
  domain: Joi.string(),

  // Assuming 'domainId' is a string or can be left empty
  domainId: Joi.string(),
}).or('name', 'username', 'password', 'domain', 'domainId'); // Check what values can be updated

//

export const userRegisterSchema = Joi.object({
  name: Joi.string().required(),
  username: Joi.string().required(),
  password: Joi.string().when('role', {
    is: Joi.not('user'), // Password required for roles other than 'user'
    then: Joi.required(),
    otherwise: Joi.optional(),
  }),
  role: Joi.string()
    .valid('user', 'admin', 'superAdmin', 'productAdmin')
    .required(),
  domain: Joi.string().when('role', {
    is: ['admin', 'user'],
    then: Joi.optional(),
    otherwise: Joi.forbidden(),
  }),
  domainId: Joi.string().when('role', {
    is: ['admin', 'user'],
    then: Joi.optional(),
    otherwise: Joi.forbidden(),
  }),
  department: Joi.string().when('role', {
    is: 'user',
    then: Joi.optional(),
    otherwise: Joi.forbidden(),
  }),
  departmentId: Joi.string().when('role', {
    is: 'user',
    then: Joi.optional(),
    otherwise: Joi.forbidden(),
  }),
});
