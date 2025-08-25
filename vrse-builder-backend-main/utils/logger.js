import pino from 'pino';
import { customLevels } from '../constants.js';

const isDevelopment = process.env.NODE_ENV === 'development';

const transport = pino.transport({
  targets: isDevelopment
    ? [
        {
          level: 'record',
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'MM-dd-yyyy HH:mm:ss',
            ignore: 'pid,hostname',
          },
        },
      ]
    : [
        {
          level: 'record',
          target: '@serdnam/pino-cloudwatch-transport',
          options: {
            logGroupName:
              process.env.CLOUDWATCH_LOG_GROUP || 'application-logs',
            logStreamName:
              process.env.CLOUDWATCH_LOG_STREAM ||
              `${process.env.NODE_ENV}-logs`,
            awsRegion: process.env.AWS_REGION || 'ap-south-1',
            interval: 1000,
          },
        },
      ],
});

const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'record',
    customLevels,
    useOnlyCustomLevels: true,
  },
  transport,
);

logger.info(`✅ Logger initialized for ${process.env.NODE_ENV} environment`);

export default logger;

// import pino from 'pino';
// import { customLevels } from '../constants.js';
// import { CloudWatchLogsClient, CreateLogGroupCommand, CreateLogStreamCommand, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';

// // === ENVIRONMENT CONFIG ===
// const APP_NAME = process.env.APP_NAME || 'AutoVRse-App';
// const ENV = process.env.NODE_ENV || 'development';
// const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
// const LOG_GROUP = process.env.CLOUDWATCH_LOG_GROUP || `${APP_NAME}-logs`;
// const LOG_STREAM = process.env.CLOUDWATCH_LOG_STREAM || `${ENV}-stream`;

// // === OPTIONAL: CREATE GROUP & STREAM IF NOT EXISTS ===
// const cloudwatchClient = new CloudWatchLogsClient({ region: AWS_REGION });

// async function ensureLogGroupAndStream() {
//   try {
//     const groups = await cloudwatchClient.send(new DescribeLogGroupsCommand({
//       logGroupNamePrefix: LOG_GROUP
//     }));

//     const groupExists = groups.logGroups?.some(group => group.logGroupName === LOG_GROUP);
//     if (!groupExists) {
//       await cloudwatchClient.send(new CreateLogGroupCommand({ logGroupName: LOG_GROUP }));
//     }

//     await cloudwatchClient.send(new CreateLogStreamCommand({
//       logGroupName: LOG_GROUP,
//       logStreamName: LOG_STREAM
//     }));
//   } catch (err) {
//     if (err.name !== 'ResourceAlreadyExistsException') {
//       console.warn('❌ Failed to ensure CloudWatch group/stream:', err);
//     }
//   }
// }

// // Kick off setup early
// ensureLogGroupAndStream();

// // === TRANSPORTS ===
// const transport = pino.transport({
//   targets: [
//     {
//       level: 'record',
//       target: '@serdnam/pino-cloudwatch-transport',
//       options: {
//         logGroupName: LOG_GROUP,
//         logStreamName: LOG_STREAM,
//         awsRegion: AWS_REGION,
//         interval: 1000,
//         // OPTIONAL: add AWS credentials here if not using IAM role
//         // accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//         // secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//       }
//     },
//     {
//       level: 'debug',
//       target: 'pino-pretty',
//       options: {
//         colorize: true,
//         translateTime: 'MM-dd-yyyy HH:mm:ss',
//         ignore: 'pid,hostname'
//       }
//     }
//   ]
// });

// // === ENHANCED LOGGER INSTANCE ===
// const logger = pino({
//   level: process.env.LOG_LEVEL || 'record',
//   customLevels,
//   useOnlyCustomLevels: true,
//   formatters: {
//     level(label) {
//       return { level: label.toUpperCase() };
//     },
//     log(obj) {
//       return {
//         ...obj,
//         environment: ENV,
//         application: APP_NAME,
//         timestamp: new Date().toISOString()
//       };
//     }
//   }
// }, transport);

// // === HANDLE UNCAUGHT ERRORS ===
// process.on('uncaughtException', (err) => {
//   logger.fatal({ err }, '❌ Uncaught Exception');
// });

// process.on('unhandledRejection', (reason) => {
//   logger.error({ reason }, '❌ Unhandled Rejection');
// });

// logger.info('🚀 Enhanced CloudWatch Logger initialized');

// export default logger;
