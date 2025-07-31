import cron from 'node-cron';
import moment from 'moment-timezone';
import { OtpModel } from '../models/OtpLoginModel.js';
const deleteExpiredOtps = async () => {
  try {
    const now = moment().unix();
    const result = await OtpModel.deleteMany({ expiryTime: { $lt: now } });
    console.log(`Deleted ${result.deletedCount} expired OTPs`);
  } catch (error) {
    console.error('Error deleting expired OTPs:', error);
  }
};

// Schedule the job to run every 6 hours
cron.schedule('0 */6 * * *', () => {
  console.log('Running cron job to delete expired OTPs');
  deleteExpiredOtps();
});
