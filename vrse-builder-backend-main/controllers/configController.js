import { CONF, HttpStatusCode, ROLES } from '../constants.js';
import performanceTracker from '../utils/performanceLogger.js';

/**
 * Retrieves the configurations.
 *
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise} A promise that resolves with the configurations.
 */
export const getConfigs = async (req, res) => {
  const { id: logId, time: logStart } = performanceTracker.log(
    'fetching config',
    'start',
  );
  performanceTracker.log('fetching config', 'end', logId, logStart);

  return res.status(HttpStatusCode.OK).json({
    message: '',
    details: { ...CONF, roles: Object.values(ROLES) },
  });
};
