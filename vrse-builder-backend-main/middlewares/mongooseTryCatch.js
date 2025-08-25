import { mongooseInstance } from '../db.js';

export const mongooseTryCatch = (fn) => async (req, res, next) => {
  const session = await mongooseInstance.startSession();

  // Sessions need replica set, so postponed the implementation
  // unitl we have a replica set

  try {
    session.startTransaction();
    await fn(req, res, session);
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    return next(error);
  }
  session.endSession();
};
