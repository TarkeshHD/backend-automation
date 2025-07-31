import { User } from '../models/UserModel.js';
import logger from '../utils/logger.js';

const fixCreatedAtField = async () => {
  try {
    const usersWithoutCreatedAt = await User.collection
      .find({
        createdAt: { $exists: false },
      })
      .toArray();

    let modifiedCount = 0;
    for (const user of usersWithoutCreatedAt) {
      const timestamp = user._id.getTimestamp();

      const result = await User.collection.updateOne(
        { _id: user._id },
        {
          $set: {
            createdAt: timestamp,
          },
        },
      );

      if (result.modifiedCount > 0) {
        modifiedCount++;
      }
    }

    logger.info(`Added createdAt to ${modifiedCount} users`);
  } catch (error) {
    logger.error('Error fixing createdAt fields:', error);
  }
};

const fixIsActivatedField = async () => {
  try {
    const result = await User.updateMany(
      { isActivated: { $exists: false } },
      { $set: { isActivated: true } },
    );
    logger.info(`Added isActivated to ${result.modifiedCount} users`);
  } catch (error) {
    logger.error('Error fixing isActivated fields:', error);
  }
};

const fixStringFields = async () => {
  try {
    // Use MongoDB native driver to get all docs
    const users = await User.collection.find({}).toArray();

    let updatedCount = 0;
    for (const user of users) {
      const updates = {};
      if (user.name && typeof user.name !== 'string') {
        updates.name = String(user.name);
      }
      if (user.username && typeof user.username !== 'string') {
        updates.username = String(user.username);
      }
      if (Object.keys(updates).length > 0) {
        await User.collection.updateOne({ _id: user._id }, { $set: updates });
        updatedCount++;
      }
    }
    logger.info(`Fixed string fields for ${updatedCount} users`);
  } catch (error) {
    logger.error('Error fixing string fields:', error);
  }
};

export const fixUserDocuments = async () => {
  logger.info('Starting user document fixes...');

  await fixCreatedAtField();
  await fixIsActivatedField();
  await fixStringFields();

  logger.info('Completed user document fixes');
};
