import * as dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import passport from 'passport';
import mongoose from 'mongoose';

import { DB, PORT, HttpStatusCode } from './constants.js';
import { connectToDB } from './db.js';
import logger from './utils/logger.js';
import BaseError from './utils/classes/BaseError.js';
import { passport as passportUtil } from './utils/passport.js';
import { errorHandler } from './middlewares/errorHandler.js';
import routes from './routes/indexApiRoute.js';

import { createAdmins } from './middlewares/createAdmins.js';
import { fixModuleFailureMoments } from './scripts/fixModuleFailureMoments.js';
import { fixArchiveFieldAcrossCollections } from './scripts/fixArchiveFieldAcrossCollections.js';
import { modifyModuleIndexType } from './scripts/modifyModuleIndexType.js';
import { migrateModulesToStudio } from './scripts/migrateModulesToStudio.js';

process.on('unhandledRejection', (reason, p) => {
  new BaseError('UnhandledRejection', HttpStatusCode.SERVICE_UNAVAILABLE, `Server is down: ${reason}`, false).handlerError();
});

process.on('uncaughtException', (error) => {
  new BaseError('UncaughtException', HttpStatusCode.SERVICE_UNAVAILABLE, 'Server is down.', false).handlerError();
});

const app = express();
const upload = multer();

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

app.set('trust proxy', 1);
app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(apiLimiter);
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(upload.any());
app.use(express.static('public'));
passportUtil(passport);
app.use(passport.initialize());

app.use(routes);

app.use((req, res, next) => {
  next(new BaseError('NotFound', HttpStatusCode.NOT_FOUND, '404 Invalid Route'));
});

app.use(errorHandler);

const main = async () => {
  try {
    mongoose.set('strictQuery', true);
    await connectToDB(DB.url);

    const server = app.listen(PORT, async () => {
      logger.info(`✅ Server running on port ${PORT}`);
      logger.info(`🌐 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🛢️ Connected to DB: ${DB.url}`);

      // Post-connection scripts
      createAdmins();
      fixModuleFailureMoments();
      fixArchiveFieldAcrossCollections();
      modifyModuleIndexType();
      migrateModulesToStudio();
    });

    server.on('error', (err) => {
      logger.error(`Server Error: ${err.message}`);
    });

  } catch (err) {
    logger.error(`Startup Error: ${err.message}`);
    process.exit(1);
  }
};

main();
