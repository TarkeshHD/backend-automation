import bcrypt from 'bcryptjs';
import { ROLES } from '../constants.js';
import { User } from '../models/UserModel.js';
import logger from '../utils/logger.js';

export const createAdmins = async () => {
  try {
    const admin = await User.find({
      username: process.env.PRODUCT_ADMIN_USERNAME,
      role: ROLES.PRODUCT_ADMIN,
    });
    logger.info('Product admin is available ? ' + Boolean(admin.length));
    if (admin.length === 0) {
      logger.info('Creating product admin ');
      const hashedPassword = await bcrypt.hash(
        process.env.PRODUCT_ADMIN_PASSWORD,
        await bcrypt.genSalt(10),
      );
      const productAdmin = new User({
        name: 'Product Admin',
        username: process.env.PRODUCT_ADMIN_USERNAME,
        password: hashedPassword, // Can this be a point of breach?
        email: process.env.PRODUCT_ADMIN_EMAIL,
        role: ROLES.PRODUCT_ADMIN,
        isActivated: true,
      });
      await productAdmin.save({ validateBeforeSave: false }); // turn validation off
    } else {
      logger.info('Product admin is already available');
      // Changing password
      const hashedPassword = await bcrypt.hash(
        process.env.PRODUCT_ADMIN_PASSWORD,
        await bcrypt.genSalt(10),
      );
      await User.updateOne(
        { username: process.env.PRODUCT_ADMIN_USERNAME },
        { password: hashedPassword },
      );
    }
  } catch (err) {
    throw err;
  }
};
