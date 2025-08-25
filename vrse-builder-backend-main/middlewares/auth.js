import passport from 'passport';
import { JwtBlackListModel } from '../models/JWTBlacklistModel.js';
import logger from '../utils/logger.js';

export const authenticateToken = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1];
  let isBlackListed;
  if (token) {
    isBlackListed = await JwtBlackListModel.findOne({ token });
  }
  if (isBlackListed) {
    logger.info('Expired token used for login');
    return res.json({ message: 'User already logged out...' });
  }
  passport.authenticate('jwt', {
    session: false,
  })(req, res, next);
};

export const authenticateDomainToken = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(' ')[1];
  let isBlackListed;
  if (token) {
    isBlackListed = await JwtBlackListModel.findOne({ token });
  }
  if (isBlackListed) {
    logger.info('Expired token used for login');
    return res.json({ message: 'User already logged out...' });
  }
  passport.authenticate('domain-jwt', { session: false }, (err, user, info) => {
    if (err) {
      return res.status(401).json({ error: 'Session Expired' });
    }
    if (!user) {
      console.log('Info message', info);
      return res.status(401).json({ error: 'Session Expired' });
    }
    req.user = user;
    next();
  })(req, res, next);
};
