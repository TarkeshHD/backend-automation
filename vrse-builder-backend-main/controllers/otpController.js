import moment from 'moment-timezone';
import crypto from 'crypto';
import { sendEmailForModule, sleep } from '../utils/utils.js';
import { User } from '../models/UserModel.js';
import { CONF, HttpStatusCode } from '../constants.js';
import { OtpModel } from '../models/OtpLoginModel.js';

export const generateUniqueOTP = async (userId) => {
  let otp;

  // Remove all existing OTPs for the user
  await OtpModel.deleteMany({ userId });

  otp = crypto.randomInt(100000, 999999).toString();

  // Expiry should be 6 hours from now
  const expiryTime = moment().add(6, 'hours').unix();
  await OtpModel.create({
    userId,
    otp,
    expiryTime,
  });

  return { otp, expiryTime };
};

export const verifyOtp = async (user, otp) => {
  const userId = user.id || user._id;
  const otpEntry = await OtpModel.findOne({ userId, otp });

  if (!otpEntry) {
    throw new Error('Invalid OTP');
  }

  if (otpEntry.expiryTime < moment().unix()) {
    await OtpModel.deleteOne({ userId, otp });
    throw new Error('OTP has expired');
  }

  // Send its verified and it should use create token for the user..

  return true;
};

export const assignModulesAndSendOtps = async (users, modules) => {
  const task = async () => {
    for (const user of users) {
      const userId = user._id || user.id;
      if (CONF?.features?.auth[0] === 'SsoAuth') {
        await sendEmailForModule(user.username, user.name, modules);

        // Add a delay to avoid hitting the concurrent connections limit
        await sleep(1000); // 1 second delay between each email
      }
    }

    console.log('All  emails sent successfully.');
  };

  // Run the task in the background
  setImmediate(task);
};
