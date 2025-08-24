import * as dotenv from 'dotenv';
dotenv.config();
/* Dependency imports */
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import passport from 'passport';
import winston from 'winston';
import 'winston-mongodb';
/* Constants imports */
import { DB, HttpStatusCode, PORT } from './constants.js';

/* Middleware imports */
import { errorHandler } from './middlewares/errorHandler.js';

/* Utils imports */
import BaseError from './utils/classes/BaseError.js';
import logger from './utils/logger.js';
import { passport as passportUtil } from './utils/passport.js';

/* Route */

import mongoose from 'mongoose';
import { createAdmins } from './middlewares/createAdmins.js';
import { createAutovrseTrainee } from './middlewares/createAutovrseTrainee.js';
import { archiveUserFix } from './scripts/fixDocuments.js';
import { updateEvaluationDocuments } from './scripts/updateEvaluationDocuments.js';
import routes from './routes/indexApiRoute.js';
import { connectToDB, getConnectionString, mongooseInstance } from './db.js';
import { fixUserDocuments } from './scripts/fixUserDocuments.js';

/* Import and run the cron job */
// import './utils/cronJobs.js';
import { updateTrainingSchema } from './scripts/updateTrainingSchema.js';
import { fixReportScoreAndStatus } from './scripts/fixReportScoreAndStatus.js';
import { fixModuleFailureMoments } from './scripts/fixModuleFailureMoments.js';
import { fixArchiveFieldAcrossCollections } from './scripts/fixArchiveFieldAcrossCollections.js';
import { modifyModuleIndexType } from './scripts/modifyModuleIndexType.js';
import {
  getAllModules,
  getAllModulesVR,
} from './controllers/moduleController.js';
import { migrateModulesToStudio } from './scripts/migrateModulesToStudio.js';

/* Process unhandled rejection and uncaught exception handling */
process
  .on('unhandledRejection', (reason, p) => {
    const errorObj = new BaseError(
      'UnhandledRejection',
      HttpStatusCode.SERVICE_UNAVAILABLE,
      `Server is down. ${reason} at ${p}`,
      false,
    );

    errorObj.handlerError();
  })
  .on('uncaughtException', (error) => {
    const errorObj = new BaseError(
      'UncaughtException',
      HttpStatusCode.SERVICE_UNAVAILABLE,
      'Server is down.',
      false,
    );
    errorObj.handlerError();
    // process.exit(1);
  });

/* Initialize express application */
const app = express();

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
const upload = multer();

/* Middlewares */
app.set('trust proxy', 1);
app.use(cors());
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(apiLimiter);
// limit to 20mb
app.use(express.json({ limit: '20mb' }));
app.use(
  express.urlencoded({ limit: '20mb', extended: true, parameterLimit: 20000 }),
);

// NOT SAFE - VERY TEMPORARY | Only concern seems to be the size!
app.use(upload.any());
/* Initialize passport for authentication */
passportUtil(passport);
// Pass the global passport object into the configuration function
app.use(passport.initialize()); // This will initialize the passport object on every request

/* Serving static assets */
app.use(express.static('public'));

//
app.use((req, res, next) => {
  console.log(req.method, req.url);
  next();
});

/* Routes */
app.use(routes);

/* 404 Handler */
app.use((req, res, next) => {
  next(
    new BaseError('NotFound', HttpStatusCode.NOT_FOUND, '404 Invalid Route'),
  );
});

/* Error handler middleware */
app.use(errorHandler);

/* Connect to DB and start server */
const main = () => {
  try {
    // connectToDB(DB);

    const server = app.listen(PORT, '0.0.0.0', async () => {
      logger.info('Server connected to port : ' + PORT),
        logger.info('Environment ' + process.env.NODE_ENV);
      logger.info('DB URL : ' + DB.url);
      mongoose.set('strictQuery', true);

      await connectToDB();
      // const connectionString = await getConnectionString();
      // logger.add(
      //   new winston.transports.MongoDB({
      //     db: connectionString,
      //     collection: 'logs',
      //     level: 'record',
      //     format: winston.format.json(),
      //   }),
      // );


      try {
        logger.info('🛠️ Connecting to MongoDB...');
        await connectToDB();
        logger.info('✅ MongoDB connection established!');
      } catch (err) {
        logger.error('❌ Failed to connect to MongoDB: ' + err.message);
        return;
      }
      logger.info('Database connected');

      // After Connection Create Required Users
      createAdmins();
      // createAutovrseTrainee();
      // updateEvaluationDocuments();
      // fixUserDocuments();
      // updateTrainingSchema();
      // fixReportScoreAndStatus();

      fixModuleFailureMoments();
      fixArchiveFieldAcrossCollections();
      modifyModuleIndexType();
      migrateModulesToStudio();
    });

    server.on('error', (error) => {
      logger.error(`ServerError: Unable to start server -> ${error.message}`);
      app.get('*', (req, res) => {
        return res
          .status(HttpStatusCode.INTERNAL_SERVER)
          .send('Unable to start server. Please try again later.');
      });
    });
  } catch (error) {
    logger.error(`ServerError: Unable to start server : ${error.message}`);
    throw new Error(`ServerError: Unable to start server : ${error.message}`);
  }
};

main();
