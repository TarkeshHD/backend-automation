import { FEATURES, HttpStatusCode } from '../constants.js';

export const featureAccess = (feature, options) => {
  return (req, res, next) => {
    if (!FEATURES[feature] || FEATURES[feature].state === 'off') {
      return res
        .status(HttpStatusCode.UNAUTHORISED)
        .json({ success: false, message: 'Feature not accessible' });
    }

    if (feature === 'auth' && !FEATURES.auth.types.includes(options.authType)) {
      return res
        .status(HttpStatusCode.UNAUTHORISED)
        .json({ success: false, message: 'Feature not accessible' });
    }

    next();
  };
};
