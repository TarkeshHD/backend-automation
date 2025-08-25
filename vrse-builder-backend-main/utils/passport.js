import { ExtractJwt, Strategy } from 'passport-jwt';
import { JWT_KEY } from '../constants.js';
import { Domain } from '../models/DomainModel.js';
import { User } from '../models/UserModel.js';

const JwtStrategy = Strategy;

// At a minimum, you must pass the `jwtFromRequest` and `secretOrKey` properties
const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: JWT_KEY,
  // algorithms: ['RS256'],
};

// app.js will pass the global passport object here, and this function will configure it
export const passport = (passport) => {
  // The JWT payload is passed into the verify callback
  passport.use(
    'jwt',
    new JwtStrategy(options, async (jwtPayload, done) => {
      // We will assign the `sub` property on the JWT to the database object {id,name etc} of user
      try {
        const userObj = await User.findOne({
          _id: jwtPayload.id,
          isActivated: true,
        });

        return done(null, userObj);
      } catch (err) {
        return done(err, false);
      }
      // return done(null, false);
    }),
  );

  // Adding this specifically for VR login
  passport.use(
    'domain-jwt',
    new JwtStrategy(options, async (jwtPayload, done) => {
      // We will assign the `sub` property on the JWT to the database object {id,name etc} of user

      try {
        const domainObj = await Domain.findById(jwtPayload.id);
        if (!domainObj) {
          return done(null, false, {
            message: 'Session Expired',
          });
        }
        return done(null, domainObj);
      } catch (error) {
        return done(error, false, { message: 'Session Expired' });
      }
      // return done(null, false);
    }),
  );
};
