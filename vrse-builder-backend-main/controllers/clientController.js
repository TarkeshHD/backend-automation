import { HttpStatusCode, LOG_ACTIONS } from '../constants.js';

import BaseError from '../utils/classes/BaseError.js';
import logger from '../utils/logger.js';
import { isValidId } from '../utils/validators/validIdCheck.js';

/**
 * Registers a new client.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the registered client information.
 * @throws {BaseError} If the client name is already taken or there is an error in registering the new client.
 */
export const registerClient = async (req, res) => {
  let { name } = req.body;

  let clientExist = await Client.findOne({ name });
  if (clientExist) {
    throw new BaseError(
      'InputError',
      HttpStatusCode.BAD_REQUEST,
      `Client name '${name}' is already taken`,
    );
  }

  let newClient = await Client.create(req.body);
  if (!newClient) {
    throw new BaseError(
      'MongoError',
      HttpStatusCode.BAD_REQUEST,
      'Some error in registering new client',
    );
  }

  logger.record('New client created', {
    action: LOG_ACTIONS.REGISTER.name,
    type: LOG_ACTIONS.REGISTER.type.CLIENT,
    name: newClient.name,
  });
  return res.status(HttpStatusCode.OK).json({
    client: newClient.getClientInfo(),
    success: true,
    message: `Welcome ${newClient.name}`,
  });
};

/**
 * Retrieves a client based on the provided query parameters.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Object} The response object with the retrieved client information.
 */
export const getClient = async (req, res) => {
  const response = await Client.find(req.query);
  return res.status(HttpStatusCode.OK).json(response);
};

export const editClient = async (req, res) => {
  let { id } = req.params;
  isValidId(id);
  delete req.body.name;
  delete req.body.data;
  delete req.body._id;

  const newEntry = { ...req.body };
  const client = await Client.findOne({ _id: id });
  if (!client)
    throw new BaseError(
      'MongoError',
      HttpStatusCode.BAD_REQUEST,
      `Client does not exist`,
    );
  const response = await Client.findOneAndUpdate({ _id: id }, newEntry, {
    runValidators: true,
    new: true,
  });

  return res.json({ message: 'Successfully saved changes', data: response });
};
