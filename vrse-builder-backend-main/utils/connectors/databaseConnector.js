import mongoose from 'mongoose';
import path from 'path';
import logger from '../logger.js';

export const connectToDB = async (DB) => {
  try {
    mongoose.set('strictQuery', true);
    if (process.env.NODE_ENV === 'production') {
      await mongoose.connect(DB.url, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        ssl: true,
        sslValidate: false,
        sslCA: path.join(`${process.env.DB_SSL_CA_FILE}`),
      });
    } else {
      await mongoose.connect(DB.url, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    logger.info('Database connected');
  } catch (error) {
    logger.error('MongoError: ' + error.message);
  }
};
