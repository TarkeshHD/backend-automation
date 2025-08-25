import { Domain } from '../models/DomainModel.js';
import fs from 'fs';
import fsPromises from 'fs/promises';
import moment from 'moment-timezone';
import path from 'path';
import {
  AWS_S3_CRED,
  CONF,
  LDAP_CONFIG,
  STORAGE_CONFIG,
} from '../constants.js';
import nodemailer from 'nodemailer';
import { Module } from '../models/ModuleModel.js';
import { Report } from '../models/ReportModel.js';
import _ from 'lodash';
import AWS from 'aws-sdk';
import ldap from 'ldapjs';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logoPath = path.join(__dirname, `../public/api/${CONF?.clientLogo}`);
console.log('logoPath', logoPath);
const logoBuffer = fs.readFileSync(logoPath);

// Helper function to recursively build the domain tree structure
export const buildDomainTree = async (domainId) => {
  const domain = await Domain.findById(domainId).exec();
  if (!domain) return null;

  const nestedDomains = await Domain.find({
    parentId: domainId,
    archived: { $ne: true },
  }).exec();
  const nestedDomainTrees = await Promise.all(
    nestedDomains.map((nestedDomain) => buildDomainTree(nestedDomain._id)),
  );

  if (domain.archived === true) return null;
  return {
    name: domain.name,
    nestedDomains: nestedDomainTrees.filter(
      (nestedDomain) => nestedDomain !== null,
    ),
    _id: domain._id,
  };
};

export const getAdminDomainsIDs = async (domainId) => {
  try {
    // Experimental Code - TEST this
    const adminsDomains = await buildDomainTree(domainId);
    // Using stack logic to get all the domain ID's
    const domainIds = [];
    let stack = [adminsDomains];
    // check if adminDomain is an array or not: if its array destructure it and reassign to stack
    if (Array.isArray(adminsDomains)) {
      stack = [...adminsDomains];
    }

    // Should we avoid while loop?
    while (stack.length > 0) {
      const current = stack.pop();
      domainIds.push(current._id);

      if (current.nestedDomains) {
        current.nestedDomains.forEach((nestedDomain) => {
          stack.push(nestedDomain);
        });
      }
    }
    return domainIds;
  } catch (error) {
    throw error;
  }
};

export const createDirectoryIfNotExists = (fileDir) => {
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
};

// A function that calculates the new score for questionAction and question evaluations
export const calculateScore = (
  currentScore,
  isCorrect,
  timeTaken = 0,
  timeRequired = 0,
  weightage = 1,
) => {
  let newScore = currentScore;

  if (isCorrect) {
    newScore += weightage;
  }

  if (isCorrect && timeRequired && timeTaken > timeRequired) {
    newScore = Math.max(newScore - weightage, 0); // Avoid negative scores
  }

  return newScore;
};

// A function that prepends the current unix timestamp to the given arguments and returns them
export const prependUnixTimestamps = (...args) => {
  return args.map((v) => `${moment().unix()}-${v}`);
};

export const getClientIp = (req) => {
  const xForwardedFor = req.headers['x-forwarded-for'];
  if (xForwardedFor) {
    // X-Forwarded-For can contain multiple IPs if the request has passed through multiple proxies
    // The client's IP is the first one in the list
    const ips = xForwardedFor.split(',');
    return ips[0].trim();
  }
  return (
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null)
  );
};

// Set up AWS S3 credentials
// const s3 = new AWS.S3({
//   accessKeyId: AWS_S3_CRED.ACCESS_KEY_ID,
//   secretAccessKey: AWS_S3_CRED.SECRET_ACCESS_KEY,
//   region: AWS_S3_CRED.REGION,
// });

// Configure S3 client
let s3;

// Initialize S3 client
if (STORAGE_CONFIG.s3.connectUsingIAM) {
  // Automatically use IAM role credentials
  s3 = new AWS.S3({
    region: STORAGE_CONFIG.s3.region,
  });
  console.log('S3 client initialized with IAM role');
} else {
  // Use manual credentials
  s3 = new AWS.S3({
    accessKeyId: STORAGE_CONFIG.s3.accessKeyId,
    secretAccessKey: STORAGE_CONFIG.s3.secretAccessKey,
    region: STORAGE_CONFIG.s3.region,
  });
  console.log('S3 client initialized with explicit credentials');
}

export const uploadToS3 = async (bucketName, key, data, contentType) => {
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: data,
    ContentType: contentType,
  };

  return new Promise((resolve, reject) => {
    s3.upload(params, (err, data) => {
      if (err) reject(err);
      else resolve(data.Location);
    });
  });
};

// Save Locally
const saveToLocal = async (directory, fileName, data) => {
  const dirPath = path.join(STORAGE_CONFIG.local.baseUploadPath, directory);

  // Create directory if it doesn't exist
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const filePath = path.join(dirPath, fileName);

  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    writeStream.write(data);
    writeStream.end();
    writeStream.on('finish', () => resolve(filePath));
    writeStream.on('error', reject);
  });
};

export const saveToS3 = async (bucket, key, data, contentType) => {
  const params = {
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
  };

  return new Promise((resolve, reject) => {
    s3.upload(params, (err, data) => {
      if (err) {
        console.error('Error uploading to S3:', err);
        reject(err);
      } else {
        console.log('File uploaded successfully to S3:', data.Location);
        resolve(data.Location); // Return S3 URL
      }
    });
  });
};

/**
 * Store JSON data in S3 bucket
 * @param {String} bucketName - The name of the S3 bucket
 * @param {String} key - The key (filename) for the JSON file in S3
 * @param {Object} jsonData - The JSON data to store
 * @returns {Promise<String>} - The S3 URL of the stored JSON file
 */
export const storeJsonInS3 = async (bucketName, key, jsonData, contentType) => {
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: jsonData,
    ContentType: contentType,
  };

  return new Promise((resolve, reject) => {
    s3.upload(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.Location);
      }
    });
  });
};

const parseS3Url = (url) => {
  const match = url.match(/^https:\/\/([^\.]+)\.s3\.[^\/]+\/(.+)$/);
  if (!match) {
    throw new Error('Invalid S3 URL');
  }
  return {
    bucket: match[1],
    key: match[2],
  };
};

export const getJsonFromS3 = async (url) => {
  const { bucket, key } = parseS3Url(url);
  const params = {
    Bucket: bucket,
    Key: key,
  };

  const data = await s3.getObject(params).promise();
  return JSON.parse(data.Body.toString('utf-8'));
};

export const uploadImageToS3 = async (
  bucketName,
  key,
  imageData,
  contentType,
) => {
  const params = {
    Bucket: bucketName,
    Key: key,
    Body: imageData,
    ContentType: contentType,
  };

  return new Promise((resolve, reject) => {
    s3.upload(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.Location);
      }
    });
  });
};

export const getPresignedUrl = async (bucketName, key, expiresIn = 60 * 5) => {
  const params = {
    Bucket: bucketName,
    Key: key,
    Expires: expiresIn,
  };

  return s3.getSignedUrl('getObject', params);
};

export const convertJsonToMomentCount = (data) => {
  const momentCount = [];
  data.chapters.forEach((chapter) => {
    chapter.moments.forEach((moment) => {
      momentCount.push({
        chapterIndex: chapter.chapterIndex,
        momentIndex: moment.momentIndex,
        users: [],
      });
    });
  });
  return momentCount;
};

export const convertBasicReportFromJson = (data) => {
  let totalMark = 0;
  let totalScored = 0;
  const passPercentage =
    data?.passPercentage ||
    CONF?.features?.jsonLifecycleEvaluation?.passPercentage ||
    0.5;

  const result = {
    moduleName: data.name,
    totalMark: 0,
    totalScored: 0,
    passMark: 0,
    chapters: [],
  };

  data.chapters.forEach((chapter) => {
    // ChapterIndex is there or not, should be check
    const chapterInfo = {
      chapterName: chapter?.name,
      chapterIndex: chapter.chapterIndex,
      totalMark: 0,
      totalScored: 0,
      moments: [],
    };

    chapter.moments.forEach((moment) => {
      // moment index is there or not should be check
      let defaults;
      if (moment?.defaults === '') {
        defaults = {
          weightage: 1,
          timerReduction: 0,
          timerLimit: 0,
          wrongReduction: 0,
        };
      } else {
        defaults = JSON.parse(moment.defaults);
      }

      // the defaults can be zero under the optional check

      const momentInfo = {
        momentIndex: moment.momentIndex,
        momentName: moment.name,
        weightage: parseFloat(defaults?.weightage || 1), // Ensure weightage is a number
        totalScored: 0,
        timerReduction: {
          state: 'timerLimit' in defaults && 'timerReduction' in defaults,
          reduction: parseFloat(defaults.timerReduction || 0),
          maxTime: parseInt(defaults.timerLimit || 0),
        },
        wrongReduction: {
          state: true,
          reduction: parseFloat(
            defaults.wrongReduction ||
              CONF.features.jsonLifecycleEvaluation.wrongReduction,
          ),
        },
      };

      chapterInfo.moments.push(momentInfo);
      chapterInfo.totalMark += momentInfo.weightage;
    });

    result.chapters.push(chapterInfo);
    totalMark += chapterInfo.totalMark;
    totalScored += chapterInfo.totalScored;
  });

  result.totalMark = totalMark;
  // Sometimes decimals so make it to .toFixed(2)
  result.passMark = parseFloat((totalMark * passPercentage).toFixed(2));
  result.totalScored = totalScored;
  return result;
};

export const convertBasicTrainingFromJson = (data) => {
  const result = {
    moduleName: data.name,
    chapters: [],
  };

  data.chapters.forEach((chapter) => {
    const chapterInfo = {
      chapterName: chapter.name,
      chapterIndex: chapter.chapterIndex,
      moments: [],
    };

    chapter.moments.forEach((moment) => {
      const momentInfo = {
        momentIndex: moment.momentIndex,
        momentName: moment.name,
      };

      chapterInfo.moments.push(momentInfo);
    });

    result.chapters.push(chapterInfo);
  });

  return result;
};

const calculateTotalScored = async (moment, onWrong) => {
  let { weightage } = moment;

  // Handle timer reduction
  // if (moment.timerReduction.state) {
  //   onWrong.forEach((wrong) => {
  //     if (wrong.time > moment.timerReduction.maxTime) {
  //       weightage -= moment.timerReduction.reduction;
  //     }
  //   });
  // }

  // Filter out the onWrong actions that are over time limit
  // const filteredOnWrong = onWrong.filter(
  //   (wrong) => wrong.time <= moment.timerReduction.maxTime,
  // );

  // Handle wrong reduction
  if (moment.wrongReduction.state) {
    weightage -= moment.wrongReduction.reduction * onWrong.length;
  }
  // Ensure weightage is not less than zero
  weightage = Math.max(weightage, 0);
  weightage = parseFloat(weightage).toFixed(2); // Ensure weightage is a number

  return +weightage;
};

const calculateTotalTimeTaken = async (
  startTime,
  onRight,
  onWrong,
  onMomentComplete,
) => {
  // If onMomentComplete is provided, use that time for calculation
  if (onMomentComplete && onMomentComplete.length > 0) {
    return onMomentComplete[0].time - startTime;
  }
  // const totalOnRightTime = onRight.reduce((sum, right) => sum + right.time, 0);
  // const totalOnWrongTime = onWrong.reduce((sum, wrong) => sum + wrong.time, 0);
  // return totalOnRightTime + totalOnWrongTime;

  // Get a sorted array of onRight on the basis of time descending, and get the largest time and return it - startTime as totalTimeTaken

  // last onRight time - startTime gives the total time taken
  const sortedOnRight = onRight.sort((a, b) => b.time - a.time);
  const largestTime = sortedOnRight[0].time;
  return largestTime - startTime;
};

export const evaluateMoments = async (
  jsonLifeCycleBased,
  momentAnswers,
  report,
) => {
  if (jsonLifeCycleBased.endTime) {
    throw new Error('Evaluation already completed');
  }

  if (!jsonLifeCycleBased.startTime) {
    jsonLifeCycleBased.startTime = momentAnswers.startTime;
  }
  const jsonCopy = JSON.parse(JSON.stringify(jsonLifeCycleBased)); // Create a deep copy of the input JSON
  const {
    chapterIndex,
    momentIndex,
    startTime,
    onRight,
    onWrong,
    onMomentComplete,
  } = momentAnswers;

  const chapter = jsonCopy.chapters.find(
    (ch) => ch.chapterIndex === chapterIndex,
  );
  if (!chapter) {
    throw new Error('Chapter not found');
  }

  const moment = chapter.moments.find((mo) => mo.momentIndex === momentIndex);
  if (!moment) {
    throw new Error('Moment not found');
  }

  if (moment.endTime) {
    if (!report.isMultiplayer) {
      throw new Error('Moment already evaluated');
    } else {
      return {
        alreadySubmitted: true,
        message:
          'This moment has already been submitted in this multiplayer session',
        data: jsonCopy,
      };
    }
  }

  if (chapter.endTime) {
    if (!report.isMultiplayer) {
      throw new Error('Chapter already evaluated');
    } else {
      return {
        alreadySubmitted: true,
        message:
          'This chapter has already been submitted in this multiplayer session',
        data: jsonCopy,
      };
    }
  }

  // For timing calculation, we still use the full calculation
  const totalTimeTaken = await calculateTotalTimeTaken(
    startTime,
    onRight,
    onWrong,
    onMomentComplete,
  );

  // For scoring, we need to check if there is an existing score from triggers
  let totalScored;
  // Find the corresponding answer for this moment in the report
  const answerRecord = report.answers.jsonLifeCycleBased.find(
    (answer) =>
      answer.chapterIndex === chapterIndex &&
      answer.momentIndex === momentIndex,
  );

  // Check if there are any previous trigger or answer events
  const hasPreviousEvents =
    answerRecord &&
    answerRecord.events &&
    answerRecord.events.some((event) =>
      ['onWrongTrigger'].includes(event.eventType),
    );

  if (hasPreviousEvents) {
    // If we already have a score (from triggers), apply the additional reduction for onWrong
    totalScored = moment.totalScored;

    // Apply additional reductions for onWrong in this submission
    if (
      onWrong &&
      onWrong.length > 0 &&
      moment.wrongReduction &&
      moment.wrongReduction.state
    ) {
      const additionalReduction =
        moment.wrongReduction.reduction * onWrong.length;
      totalScored = Math.max(0, totalScored - additionalReduction);
      totalScored = parseFloat(totalScored).toFixed(2);
    }
  } else {
    // If no existing score, calculate it fresh
    totalScored = await calculateTotalScored(moment, onWrong);
  }

  const endTime = startTime + totalTimeTaken;
  moment.startTime = startTime;

  if (endTime < moment.startTime) {
    throw new Error('Invalid end time for the correct moment');
  }

  // Update with the preserved or newly calculated score
  moment.totalScored = +totalScored;
  moment.totalTimeTaken = totalTimeTaken;
  moment.endTime = endTime;

  chapter.totalScored = parseFloat(
    (chapter.totalScored + moment.totalScored).toFixed(2),
  );

  chapter.totalTimeTaken =
    (chapter.totalTimeTaken || 0) + moment.totalTimeTaken;

  if (chapter.startTime === 0) {
    chapter.startTime = startTime;
  }

  jsonCopy.totalScored = parseFloat(
    (jsonCopy.totalScored + moment.totalScored).toFixed(2),
  );
  jsonCopy.totalTimeTaken =
    (jsonCopy.totalTimeTaken || 0) + moment.totalTimeTaken;

  if (jsonCopy.totalScored >= jsonCopy.passMark) {
    jsonCopy.status = 'pass';
  }

  // If this is the last moment in the chapter, set the chapter endTime
  if (momentIndex === chapter.moments.length - 1) {
    chapter.endTime = startTime + chapter.totalTimeTaken;
    // Check if the chapter is also last
    if (chapterIndex === jsonCopy.chapters.length - 1) {
      jsonCopy.endTime = chapter.endTime;
      // Check if the status is still pending and the totalScored is greater than or equal to the passMark
      if (
        jsonCopy.status === 'pending' &&
        jsonCopy.totalScored >= jsonCopy.passMark
      ) {
        jsonCopy.status = 'pass';
      } else if (
        jsonCopy.status === 'pending' &&
        jsonCopy.totalScored < jsonCopy.passMark
      ) {
        jsonCopy.status = 'fail';
      }
    }
  }
  return {
    success: true,
    data: jsonCopy,
  };
};

export const handleTriggerEvent = async (
  jsonLifeCycleBased,
  triggerData,
  report,
) => {
  const { chapterIndex, momentIndex, events } = triggerData;
  const jsonCopy = JSON.parse(JSON.stringify(jsonLifeCycleBased));

  const chapter = jsonCopy.chapters.find(
    (ch) => ch.chapterIndex === chapterIndex,
  );
  if (!chapter) throw new Error('Chapter not found');

  const moment = chapter.moments.find((mo) => mo.momentIndex === momentIndex);
  if (!moment) throw new Error('Moment not found');

  // Handle wrong triggers - reduce score
  const wrongTriggers = events.filter(
    (event) => event.eventType === 'onWrongTrigger',
  );

  // Find the corresponding answer for this moment in the report
  const answerRecord = report.answers.jsonLifeCycleBased.find(
    (answer) =>
      answer.chapterIndex === chapterIndex &&
      answer.momentIndex === momentIndex,
  );

  // Check if there are any previous trigger or answer events
  const hasPreviousEvents =
    answerRecord &&
    answerRecord.events &&
    answerRecord.events.some((event) =>
      ['onWrongTrigger', 'onWrong'].includes(event.eventType),
    );

  // Initialize totalScored only if this is the first interaction
  if (!hasPreviousEvents) {
    moment.totalScored = parseFloat(moment.weightage).toFixed(2);
  }

  if (wrongTriggers.length > 0 && moment.wrongReduction?.state) {
    // Current weightage (either original or already reduced by previous triggers)
    let currentWeightage =
      moment.totalScored !== undefined ? moment.totalScored : moment.weightage;

    // Apply reduction for each wrong trigger
    const reduction = moment.wrongReduction.reduction * wrongTriggers.length;
    currentWeightage = Math.max(0, currentWeightage - reduction);

    // Update the moment's score
    moment.totalScored = parseFloat(currentWeightage).toFixed(2);
  }

  return jsonCopy;
};

export const endJsonLifeCycleBased = (jsonLifeCycleBased, endTime) => {
  if (jsonLifeCycleBased.endTime) {
    throw new Error('Evaluation already completed');
  }
  const jsonCopy = JSON.parse(JSON.stringify(jsonLifeCycleBased)); // Create a deep copy of the input JSON
  jsonCopy.endTime = endTime;
  // Go through every chapter and if endTime is not there, give this as the endTime
  jsonCopy.chapters.forEach((chapter) => {
    if (!chapter.startTime) {
      chapter.startTime = endTime;
    }
    if (!chapter.endTime) {
      chapter.endTime = endTime;
      chapter.totalTimeTaken = endTime - chapter.startTime;
    }
  });
  // Check if the status is still pending and the totalScored is greater than or equal to the passMark
  if (jsonCopy.totalScored >= jsonCopy.passMark) {
    jsonCopy.status = 'pass';
  } else {
    jsonCopy.status = 'fail';
  }

  jsonCopy.totalTimeTaken = endTime - jsonCopy.startTime;
  return jsonCopy;
};

export const verifyOnRight = (onRight) => {
  if (!Array.isArray(onRight)) {
    return false;
  }

  for (const right of onRight) {
    if (
      typeof right !== 'object' ||
      typeof right.verb !== 'string' ||
      typeof right.object !== 'string' ||
      typeof right.time !== 'number'
    ) {
      return false;
    }
  }

  return true;
};

export const evaluateTrainingMoments = async (
  jsonLifeCycleBased,
  momentAnswers,
  training,
) => {
  if (jsonLifeCycleBased.endTime) {
    throw new Error('Evaluation already completed');
  }
  if (!jsonLifeCycleBased.startTime) {
    jsonLifeCycleBased.startTime = momentAnswers.startTime;
  }
  const jsonCopy = JSON.parse(JSON.stringify(jsonLifeCycleBased)); // Create a deep copy of the input JSON
  const {
    chapterIndex,
    momentIndex,
    startTime,
    onRight,
    onWrong,
    onMomentComplete,
  } = momentAnswers;

  console.log('moment index', momentIndex);
  console.log('chapterIndex', chapterIndex);

  const chapter = jsonCopy.chapters.find(
    (ch) => ch.chapterIndex === chapterIndex,
  );
  if (!chapter) {
    throw new Error('Chapter not found');
  }

  const moment = chapter.moments.find((mo) => mo.momentIndex === momentIndex);
  if (!moment) {
    throw new Error('Moment not found');
  }

  if (moment.endTime) {
    if (!training.isMultiplayer) {
      throw new Error('Moment already evaluated');
    } else {
      // Return an object with a flag instead of HTTP response
      return {
        alreadySubmitted: true,
        message:
          'This moment has already been submitted in this multiplayer session',
        data: training,
      };
    }
  }

  if (chapter.endTime) {
    if (!training.isMultiplayer) {
      throw new Error('Chapter already evaluated');
    } else {
      // Return an object with a flag instead of HTTP response
      return {
        alreadySubmitted: true,
        message:
          'This chapter has already been submitted in this multiplayer session',
        data: training,
      };
    }
  }

  const [totalTimeTaken] = await Promise.all([
    calculateTotalTimeTaken(startTime, onRight, onWrong, onMomentComplete),
  ]);

  const endTime = startTime + totalTimeTaken;
  moment.startTime = startTime;
  if (endTime < moment.startTime) {
    throw new Error('Invalid end time for the correct moment');
  }
  moment.totalTimeTaken = totalTimeTaken;
  moment.endTime = endTime;

  const events = momentAnswers.events;
  // moment.answers = { events }; // Not getting added here from now on.

  chapter.totalTimeTaken =
    (chapter.totalTimeTaken || 0) + moment.totalTimeTaken;

  if (chapter.startTime === 0) {
    chapter.startTime = startTime;
  }

  // If this is the last moment in the chapter, set the chapter endTime
  if (momentIndex === chapter.moments.length - 1) {
    chapter.endTime = startTime + chapter.totalTimeTaken;
    // Check if the chapter is also last
    if (chapterIndex === jsonCopy.chapters.length - 1) {
      jsonCopy.endTime = chapter.endTime;
    }
  }

  jsonCopy.totalTimeTaken =
    (jsonCopy.totalTimeTaken || 0) + moment.totalTimeTaken;

  return {
    success: true,
    data: jsonCopy,
  };
};

export const endTrainingJsonLifeCycleBased = (jsonLifeCycleBased, endTime) => {
  if (jsonLifeCycleBased.endTime) {
    throw new Error('Evaluation already completed');
  }
  const jsonCopy = JSON.parse(JSON.stringify(jsonLifeCycleBased)); // Create a deep copy of the input JSON
  jsonCopy.endTime = endTime;
  // Go through every chapter and if endTime is not there, give this as the endTime
  jsonCopy.chapters.forEach((chapter) => {
    if (!chapter.startTime) {
      chapter.startTime = endTime;
    }
    if (!chapter.endTime) {
      chapter.endTime = endTime;
      chapter.totalTimeTaken = endTime - chapter.startTime;
    }
  });

  jsonCopy.totalTimeTaken = endTime - jsonCopy.startTime;
  return {
    success: true,
    data: jsonCopy,
  };
};

// Set up the transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.NODE_EMAIL_USER,
    pass: process.env.NODE_EMAIL_PASS,
  },
});

export const sendEmailForModule = async (userEmail, userName, modules) => {
  console.log('Sending email to: ', userEmail, userName);

  // Extract module names
  const moduleNames = modules.map((module) => module.name);
  console.log('For the modules', moduleNames);

  const moduleList =
    moduleNames.length > 1
      ? `${moduleNames.slice(0, -1).join(', ')} and ${moduleNames.slice(-1)}`
      : moduleNames[0];

  const mailOptions = {
    from: process.env.NODE_EMAIL_USER,
    to: userEmail,
    subject: 'Module Assignment Notification',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:autovrseLogo" alt="AutoVRse Logo" style="width: 150px; height: auto;"/>
        </div>
        <h2 style="color: #333; text-align: center;">Module Assignment Notification</h2>
        <p style="color: #555;">Dear <strong>${userName || 'User'}</strong>,</p>
        <p style="color: #555;">You have been assigned to the following module${
          modules.length > 1 ? 's' : ''
        }: <strong>${moduleList}</strong>.</p>
        <p style="margin-top: 20px; color: #555;">To generate your login OTP, please <a href="${
          process.env.DASHBOARD_URL
        }" style="color: #007bff; text-decoration: none;">access the dashboard</a>.</p>
        <p style="color: #555;">Best regards,<br/>The AutoVRse Training Team</p>
      </div>
    `,
    attachments: [
      {
        filename: 'logo.png',
        content: logoBuffer,
        cid: 'autovrseLogo',
      },
    ],
  };

  await transporter.sendMail(mailOptions);
};

export const sendEmailForVRUser = async (userEmail, userName, password) => {
  const mailOptions = {
    from: process.env.NODE_EMAIL_USER,
    to: userEmail,
    subject: 'Your VR Dashboard Credentials',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f8f9fa; border-radius: 10px; max-width: 600px; margin: auto; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);">
       <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:autovrseLogo" alt="AutoVRse Logo" style="width: 150px; height: auto;"/>
        </div>
        <h2 style="color: #333; text-align: center;">Welcome to AutoVRse Training</h2>
        <p style="color: #555;">Dear <strong>${
          userEmail || 'User'
        }</strong>,</p>
        <p style="color: #555;">We are excited to have you on board! Below are your login credentials for accessing the VR Dashboard:</p>
        <table style="width: 100%; background-color: #ffffff; border-collapse: collapse; margin-top: 20px;">
          <tr style="background-color: #f1f1f1;">
            <td style="padding: 10px; font-weight: bold; color: #333;">Username</td>
            <td style="padding: 10px; color: #333;">${userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 10px; font-weight: bold; color: #333;">Password</td>
            <td style="padding: 10px; color: #333;">${password}</td>
          </tr>
        </table>
        <p style="margin-top: 20px; color: #555;">To get started, click the button below to log in:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${
            process.env.WEB_DOMAIN
          }" style="background-color: #007bff; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Log In to Dashboard</a>
        </div>
        <p style="color: #555;">If you have any questions, feel free to reach out to our support team.</p>
        <p style="color: #555;">Best regards,<br/>The AutoVRse Training Team</p>
        <hr style="border: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #888; font-size: 12px; text-align: center;">This is an automated email. Please do not reply.</p>
      </div>
    `,
    attachments: [
      {
        filename: 'logo.png',
        content: logoBuffer,
        cid: 'autovrseLogo', // Same as the `cid` used in the `img src`
      },
    ],
  };

  await transporter.sendMail(mailOptions);
  console.log(`Email sent to ${userEmail} with VR credentials.`);
};
export const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const sendOtpForUser = async (user, otp) => {
  const expiryLocalTime = moment
    .unix(otp.expiryTime)
    .format('MMMM Do YYYY, h:mm:ss a');

  const mailOptions = {
    from: process.env.NODE_EMAIL_USER,
    to: user.username,
    subject: 'Login OTP',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:autovrseLogo" alt="AutoVRse Logo" style="width: 150px; height: auto;"/>
        </div>
        <h2 style="color: #333; text-align: center;">Login OTP</h2>
        <p style="color: #555;">Dear <strong>${user.username}</strong>,</p>
        <p style="color: #555;">Your OTP for login is: <strong>${otp.otp}</strong>.</p>
        <p style="color: #555;">This OTP is valid until: <strong>${expiryLocalTime}</strong>.</p>
        <p style="color: #555;">Best regards,<br/>The AutoVRse Training Team</p>
      </div>
    `,
    attachments: [
      {
        filename: 'logo.png',
        content: logoBuffer,
        cid: 'autovrseLogo',
      },
    ],
  };

  await transporter.sendMail(mailOptions);
};

const downloadDirectory = './uploads/';
const buckets = [
  {
    name: process.env.S3_BUCKET_EVALUATION_NAME,
    folder: 'evaluation-json',
  },
  {
    name: process.env.S3_BUCKET_TRAINING_NAME,
    folder: 'training-json',
  },
  {
    name: process.env.S3_BUCKET_IMAGE_NAME,
    folder: 'image',
  },
];

// Ensure the download directory and subdirectories exist
if (!fs.existsSync(downloadDirectory)) {
  fs.mkdirSync(downloadDirectory, { recursive: true });
}

/**
 * Download a file from S3 to a local directory
 * @param {String} bucketName - The name of the S3 bucket
 * @param {String} key - The key (filename) of the file in S3
 * @param {String} downloadPath - The local path where the file will be saved
 * @returns {Promise<void>}
 */
const downloadFileFromS3 = (bucketName, key, downloadPath) => {
  const params = {
    Bucket: bucketName,
    Key: key,
  };

  const filePath = path.join(downloadPath, key);

  return new Promise((resolve, reject) => {
    // Ensure the directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const file = fs.createWriteStream(filePath);

    s3.getObject(params)
      .createReadStream()
      .on('error', (err) => reject(err))
      .pipe(file)
      .on('close', () => {
        console.log(`Downloaded ${key} from ${bucketName} to ${filePath}`);
        resolve();
      });
  });
};

/**
 * Download all files from an S3 bucket to a local directory
 * @param {String} bucketName - The name of the S3 bucket
 * @param {String} downloadPath - The local directory to store the files
 * @returns {Promise<void>}
 */
const downloadAllFilesFromBucket = async (bucketName, folderName) => {
  const params = {
    Bucket: bucketName,
  };

  const folderPath = path.join(downloadDirectory, folderName);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const listObjects = await s3.listObjectsV2(params).promise();
  const downloadPromises = listObjects.Contents.map((item) =>
    downloadFileFromS3(bucketName, item.Key, folderPath),
  );

  await Promise.all(downloadPromises);
  console.log(
    `All files from ${bucketName} have been downloaded to ${folderPath}.`,
  );
};

// Download files from all specified buckets
export const downloadAllS3FIles = async () => {
  try {
    for (const bucket of buckets) {
      await downloadAllFilesFromBucket(bucket.name, bucket.folder);
    }
    console.log(
      'All files from all buckets have been downloaded successfully.',
    );
  } catch (err) {
    console.error('Error downloading files:', err);
  }
};

export const migrateModulesMoment = async () => {
  // Step 1: Delete all existing momentCount data from all modules
  await Module.updateMany({}, { $unset: { momentCount: '' } });

  // Step 2: Fetch all reports with mode: "jsonLifeCycle"
  const reports = await Report.find({
    mode: 'jsonLifeCycle',
    archived: { $ne: true },
  });

  // Step 3: Process each report
  for (const report of reports) {
    const { moduleId, answers, userId } = report;

    // Step 4: Check if answers and jsonLifeCycleBased exist and are non-empty
    if (
      !answers?.jsonLifeCycleBased ||
      answers.jsonLifeCycleBased.length === 0
    ) {
      console.log(
        `Skipping report ${report._id}: no jsonLifeCycleBased answers.`,
      );
      continue; // Skip this report if there are no jsonLifeCycleBased answers
    }

    // Step 5: Find the module linked to the report
    const module = await Module.findById(moduleId);

    // Step 6: Iterate over the answers.jsonLifeCycleBased array
    for (const lifeCycle of answers.jsonLifeCycleBased) {
      const { chapterIndex, momentIndex, events } = lifeCycle;

      // Step 7: Check if events exist and are non-empty
      if (!events || events.length === 0) {
        console.log(
          `Skipping moment for chapterIndex ${chapterIndex}, momentIndex ${momentIndex}: no events.`,
        );
        continue; // Skip this lifeCycle entry if no events are present
      }

      // Step 8: Check for 'onWrong' events
      for (const event of events) {
        if (event.eventType === 'onWrong') {
          // Find the momentCount for the current chapter and moment
          let existingMoment = module.momentCount.find(
            (m) =>
              m.chapterIndex === chapterIndex && m.momentIndex === momentIndex,
          );

          // Step 9: If the moment exists, update the users array, otherwise create it
          if (existingMoment) {
            // Find the user in the existing moment
            const existingUser = existingMoment.users.find(
              (u) => u.id === userId.toString(),
            );

            if (existingUser) {
              // Increment the count for this user
              existingUser.count += 1;
            } else {
              // Add a new user if not found
              existingMoment.users.push({ id: userId.toString(), count: 1 });
            }
          } else {
            // If the moment doesn't exist, create a new moment with the user
            module.momentCount.push({
              chapterIndex,
              momentIndex,
              users: [{ id: userId.toString(), count: 1 }],
            });
          }
        }
      }
    }

    // Step 10: Save the updated module
    await module.save();
  }

  // Step 11: Fetch all modules that are jsonLifeCycle-based and sort momentCount by total user failCount in descending order
  const jsonLifeCycleModules = await Module.find({
    evaluationType: 'jsonLifeCycle',
    archived: { $ne: true },
  });

  jsonLifeCycleModules.forEach(async (mod) => {
    // Step 12: Sort the momentCount array in each module by the total sum of fail counts
    mod.momentCount.sort((a, b) => {
      const aFailCount = a.users.reduce((acc, user) => acc + user.count, 0);
      const bFailCount = b.users.reduce((acc, user) => acc + user.count, 0);
      return bFailCount - aFailCount; // Sort in descending order
    });

    // Step 13: Save the module after sorting
    await mod.save();
  });

  console.log('Migration completed successfully.');
};

// Utility function for delaying batch processing
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const assignModuleAccessToUser = async (userId, modules) => {
  await Promise.all(
    modules?.map(async (module) => {
      const moduleAccess = module?.moduleAccessId;
      console.log('Module Access:', moduleAccess);

      if (moduleAccess) {
        const currentUsers = moduleAccess?.users?.map((id) => id.toString());
        console.log('Current Users:', currentUsers);
        moduleAccess.users = _.union(currentUsers, [userId.toString()]);
        await moduleAccess.save();
      }
    }),
  );

  console.log(`Assigned ${modules.length} modules to user ID ${userId}.`);
};

export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const fetchScoresAndStatuses = (item, config) => {
  let score = '-';
  let status = 'pending';

  if (item?.endTime) {
    status = getStatus(item, config);
    score = status === 'fail' && item?.mode === 'time' ? '-' : getScore(item); // If the status is fail and the mode is time, then the score should be "-"
    score = item?.mode === 'jsonLifeCycleBased' ? getScore(item) : score;
  }

  return { ...item, score, status };
};

export const getStatus = (item, config) => {
  // const response = await axios.get(`/evaluation/${item.id}`);
  if (item?.mode === 'mcq') {
    // Get the percentage and find the pass mark
    const passMark =
      item?.evaluationDump.mcqBased.length *
      (item.passingCriteria.passPercentage / 100);
    return item?.answers?.mcqBased?.score >= passMark ? 'pass' : 'fail';
  }
  if (item?.mode === 'questionAction') {
    let fullScore = 0;
    item?.evaluationDump.questionActionBased.forEach((question) => {
      fullScore += question.weightage;
    });
    const passMark = fullScore * (item.passingCriteria.passPercentage / 100);
    return item?.answers?.questionActionBased?.score >= passMark
      ? 'pass'
      : 'fail';
  }
  if (item?.mode === 'time') {
    // If time taken is less than eval dump bronze time and if mistakes are less than passing criteria mistakes allowed; then pass
    return item.answers?.timeBased.timeTaken <
      item?.evaluationDump.timeBased.bronzeTimeLimit &&
      item.answers?.timeBased?.mistakes?.length <=
        item.passingCriteria.mistakesAllowed
      ? 'pass'
      : 'fail';
  }
  if (item?.mode === 'jsonLifeCycle') {
    if (!item?.evaluationDump?.jsonLifeCycleBased?.endTime) {
      return 'pending';
    }
    return item?.evaluationDump?.jsonLifeCycleBased?.status;
  }
};

export const getScore = (item) => {
  if (item?.mode === 'mcq') {
    return `${item?.answers?.mcqBased?.score} / ${item?.answers?.mcqBased?.answerKey.length}`;
  }
  if (item?.mode === 'questionAction') {
    // Loop through thee evaluation dump and calculate the weightage to get full score
    let fullScore = 0;
    item?.evaluationDump.questionActionBased.forEach((question) => {
      fullScore += question.weightage;
    });
    return `${item?.answers?.questionActionBased?.score}/${fullScore}`;
  }
  if (item?.mode === 'time') {
    return _.startCase(item?.answers?.timeBased?.score);
  }
  if (item?.mode === 'jsonLifeCycle') {
    return `${item?.evaluationDump?.jsonLifeCycleBased?.totalScored || 0} / ${
      item?.evaluationDump?.jsonLifeCycleBased?.totalMark || 0
    }`;
  }
};
export const secondsToISO8601 = (time) => {
  const duration = moment.duration(time, 'seconds');
  const hours = Math.floor(duration.asHours());
  const minutes = Math.floor(duration.minutes());
  const seconds = duration.seconds();
  const fractionalSeconds = seconds.toFixed(2);

  return `PT${hours}H${minutes}M${fractionalSeconds}S`;
};

export const sendUpgradeRequestConfirmationToUser = async (user) => {
  if (!isValidEmail(user.username)) {
    throw new Error('Invalid email');
  }

  const mailOptions = {
    from: process.env.NODE_EMAIL_USER || 'noreply@autovrse-training.com',
    to: user.username,
    subject: 'VR Experience - Upgrade Request',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:autovrseLogo" alt="AutoVRse Logo" style="width: 150px; height: auto;"/>
        </div>
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>Thank you for your interest in upgrading to the AutoVRse Training VR Experience.</p>
        <p>Our team will get back to you as soon as possible.</p>
        <p>Best regards,<br/>The AutoVRse Training Team</p>
      </div>
    `,
    attachments: [
      {
        filename: 'logo.png',
        content: logoBuffer,
        cid: 'autovrseLogo',
      },
    ],
  };

  await transporter.sendMail(mailOptions);
};

export const sendUpgradeRequestNotificationToSupport = async (user) => {
  if (!isValidEmail(user.username)) {
    throw new Error('Invalid email');
  }

  const mailOptions = {
    from: process.env.NODE_EMAIL_USER || 'noreply@autovrse-training.com',
    to: 'support@autovrse-training.com',
    subject: 'VR Experience - Upgrade Request',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:autovrseLogo" alt="AutoVRse Logo" style="width: 150px; height: auto;"/>
        </div>
        <p>Hi Team,</p>
        <p>The user <strong>${user.name?.toUpperCase()}</strong> has requested an upgrade to the AutoVRse Training VR Experience.</p>
        <p>You can contact them at: <a href="mailto:${
          user.email
        }" style="color: #007bff;">${user.email}</a>.</p>
        <p>Best regards,<br/>The AutoVRse System</p>
      </div>
    `,
    attachments: [
      {
        filename: 'logo.png',
        content: logoBuffer,
        cid: 'autovrseLogo',
      },
    ],
  };

  await transporter.sendMail(mailOptions);
};

// Unified Save Logic
export const saveFile = async (file, fieldName, moduleId) => {
  const { storageType, s3 } = STORAGE_CONFIG;
  let bucketName;
  let filePath;

  // Determine bucket or directory based on fieldName
  if (fieldName === 'evaluationJson') {
    bucketName = s3.evaluationBucket;
    filePath = `evaluation-json/${moduleId}/evaluation.json`;
  } else if (fieldName === 'trainingJson') {
    bucketName = s3.trainingBucket;
    filePath = `training-json/${moduleId}/training.json`;
  } else if (fieldName === 'thumbnail') {
    bucketName = s3.imageBucket;
    filePath = `image/${moduleId}/thumbnail`;
  } else {
    throw new Error('Invalid fieldName');
  }

  if (storageType === 's3') {
    // Save to S3
    if (!bucketName)
      throw new Error(`S3 bucket not configured for ${fieldName}`);
    return saveToS3(bucketName, filePath, file.buffer, file.mimetype);
  } else if (storageType === 'local') {
    // Save Locally
    const dir = path.dirname(filePath);
    const baseFileName = path.basename(filePath);

    return saveToLocal(dir, baseFileName, file.buffer);
  } else {
    throw new Error('Invalid storage type in configuration');
  }
};

export const getModuleJson = async (module, type) => {
  const { storageType, s3 } = STORAGE_CONFIG;

  if (CONF?.features?.studioConnect?.state === 'on') {
    if (!module?.trainingJsonS3Url) {
      return false;
    }
    const response = await axios.get(module?.trainingJsonS3Url);
    console.log('response', response);
    return response.data;
  }
  // // File uploaded successfully to S3: https://image-for-dev-vrsebuilder.s3.amazonaws.com/image/677f776c3d609aef74c2bc28/thumbnail
  // File uploaded successfully to S3: https://training-json-for-dev-vrsebuilder.s3.amazonaws.com/training-json/677f776c3d609aef74c2bc28/training.json
  // File uploaded successfully to S3: https://evaluation-json-for-dev-vrsebuilder.s3.amazonaws.com/evaluation-json/677f776c3d609aef74c2bc28/evaluation.json

  if (storageType === 's3') {
    // Add new test for studio related s3
    // -----------------------------------------------------
    // S3 Storage: Fetch JSON using a pre-signed URL
    const bucketName =
      type === 'evaluationJson' ? s3.evaluationBucket : s3.trainingBucket;
    const preName =
      type === 'evaluationJson' ? 'evaluation-json' : 'training-json';
    const postName =
      type === 'evaluationJson' ? 'evaluation.json' : 'training.json';
    const key = `${preName}/${module._id}/${postName}`;
    console.log('key', key);
    console.log('bucketName', bucketName);

    const presignedUrl = await getPresignedUrl(bucketName, key);
    console.log('presignedUrl', presignedUrl);
    const response = await fetch(presignedUrl);
    if (!response.ok) {
      console.log('response', response);
      throw new Error(`Failed to fetch ${type} from S3`);
    }
    return await response.json();
  } else if (storageType === 'local') {
    // Local Storage: Build path dynamically
    const basePath = process.cwd();
    const prePath =
      type === 'evaluationJson' ? 'evaluation-json' : 'training-json';
    const postPath =
      type === 'evaluationJson' ? 'evaluation.json' : 'training.json';
    const moduleIdStr =
      typeof module._id === 'string' ? module._id : module._id.toString();

    const localJsonPath = path.join(
      basePath,
      'uploads',
      `${prePath}`,
      moduleIdStr,
      `${postPath}`,
    );

    if (!fs.existsSync(localJsonPath)) {
      throw new Error(`Local file ${type} not found at ${localJsonPath}`);
    }

    const jsonData = fs.readFileSync(localJsonPath, 'utf8');
    return JSON.parse(jsonData);
  } else {
    throw new Error('Invalid storage type configured');
  }

  // https://training-json-for-dev-vrsebuilder.s3.amazonaws.com/training-json/677f73d67b1b791ceafa1f04/training.json
};

export const formatModuleThumbnails = async (module) => {
  const { storageType, s3 } = STORAGE_CONFIG;

  if (CONF?.features?.studioConnect?.state === 'on') {
    return module?.imageS3Url;
  }

  let thumbnailUrl = '';

  if (storageType === 's3') {
    const key = `image/${module._id}/thumbnail`;
    thumbnailUrl = await getPresignedUrl(s3.imageBucket, key);
  } else if (storageType === 'local') {
    thumbnailUrl = `${process.env.APP_DOMAIN}/api/file/uploads/image/${module._id}/thumbnail`;
  }

  module.thumbnail = thumbnailUrl;
  return thumbnailUrl;
};

export const formatModuleTrainings = async (module) => {
  const { storageType, s3 } = STORAGE_CONFIG;

  let trainingUrl = '';

  if (storageType === 's3') {
    const key = `training-json/${module._id}/trainingJson`;
    trainingUrl = await getPresignedUrl(s3.trainingBucket, key);
  } else if (storageType === 'local') {
    trainingUrl = `${process.env.APP_DOMAIN}/api/file/uploads/training-json/${module._id}/trainingJson`;
  }

  module.trainingJson = trainingUrl;
  return trainingUrl;
};

export const searchLDAP = async function (username) {
  try {
    // Base URL
    const url = 'https://adhoc.rd.astrazeneca.net/api/people';

    // Query Parameters
    const appId = 'XRC4E';
    const filter = `(|(cn=${username})(sAMAccountName=${username}))`;
    const attrs = [
      'cn',
      'dn',
      'givenName',
      'azAXNetworkID',
      'displayName',
      'title',
      'telephoneNumber',
      'department',
      'company',
      'mail',
      'sAMAccountName',
      'msRTCSIP-PrimaryUserAddress',
      'physicalDeliveryOfficeName',
      'azEmployeeNumber',
    ].join(',');

    const sizeLimit = 5000;

    // Construct the query string dynamically
    const queryString = `?appid=${appId}&filter=${encodeURIComponent(
      filter,
    )}&attrs=${attrs}&sizeLimit=${sizeLimit}`;

    // Perform the GET request
    const response = await axios.get(url + queryString, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Return the response data
    console.log('LDAP Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error searching LDAP:', error.message);
    throw new Error('Failed to fetch data from LDAP.');
  }

  // return new Promise((resolve, reject) => {
  //   const client = ldap.createClient({
  //     url: LDAP_CONFIG.ldapServer,
  //     tlsOptions: LDAP_CONFIG.tlsOptions,
  //   });
  //   client.bind(LDAP_CONFIG.bindDN, LDAP_CONFIG.bindPassword, (err) => {
  //     if (err) {
  //       return reject(`Bind error: ${err.message}`);
  //     }
  //     const searchOptions = {
  //       filter: LDAP_CONFIG.searchOptions.filterBySAMAccountName(username),
  //       scope: LDAP_CONFIG.searchOptions.scope,
  //       attributes: LDAP_CONFIG.searchOptions.attributes,
  //     };
  //     client.search(LDAP_CONFIG.baseDN, searchOptions, (err, res) => {
  //       if (err) {
  //         return reject(`Search error: ${err.message}`);
  //       }
  //       let result = null;
  //       res.on('searchEntry', (entry) => {
  //         result = entry.object;
  //       });
  //       res.on('error', (err) => reject(`Search error: ${err.message}`));
  //       res.on('end', () => {
  //         client.unbind();
  //         resolve(result || 'No user found');
  //       });
  //     });
  //   });
  // });
};

export const getCompletedParticipants = (session) => {
  // Collect users who exited or joined
  const userEvents = session.answers.jsonLifeCycleBased.flatMap((answer) =>
    answer.events.filter(
      (event) => event.eventType === 'joined' || event.eventType === 'exited',
    ),
  );

  // Find completed participants (those who didn't exit)
  const completedParticipantIds = session.participants.filter(
    (participantId) =>
      !userEvents.some(
        (event) =>
          event.userId.toString() === participantId.toString() &&
          event.eventType === 'exited',
      ),
  );

  return completedParticipantIds;
};
