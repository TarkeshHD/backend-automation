import Joi from 'joi';

const validPriorities = ['Low', 'Medium', 'High'];
const validTypes = [
  'installation_setup',
  'hardware_issues',
  'bug_fixes',
  'demo_support',
  'server_hosting',
  'new_request',
  'misc',
];

export const createTicketDataScheme = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  subject: Joi.string().required(),
  description: Joi.string().required(),
  priority: Joi.string()
    .valid(...validPriorities)
    .required(),
  type: Joi.string()
    .valid(...validTypes)
    .required(),
  projectName: Joi.string().required(),
  attachment: Joi.string().allow(null, '').optional(),
});
