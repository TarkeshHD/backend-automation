import { OTPModel } from '../../models/OTPModel.js';

function generateOTP() {
  var digits = '0123456789';
  let OTP = '';
  for (let i = 0; i < 6; i++) {
    OTP += digits[Math.floor(Math.random() * 10)];
  }
  return OTP;
}

export class OTP {
  constructor() {}

  async generate(payload, minutes = 1) {
    let exists, otp;

    do {
      otp = generateOTP();
      exists = await OTPModel.findOne({ otp });
    } while (exists);

    await OTPModel.create({ otp, payload, validity: minutes * 60 * 1000 });
    return otp;
  }

  async verify(otp) {
    const response = await OTPModel.findOne({ otp });

    if (response) {
      const time = Date.now();
      const creationTime = new Date(response.createdAt).getTime();

      if (time - creationTime > response.validity) return false;

      const data = { payload: response.payload };
      response.delete();
      return data;
    }

    return false;
  }
}

export const otpUtils = new OTP();

// remove invalid otps
const time = 24 * 60 * 60 * 1000;

// CHange this to cron job !

setInterval(async () => {
  OTPModel.find().then((otps) => {
    otps.forEach(async (otp) => {
      const otpCreationTime = new Date(otp.createdAt).getTime();
      let shouldDelete = Date.now() - otpCreationTime > otp.validity;
      if (shouldDelete) {
        await otp.delete();
        console.log(
          'deleting otp',
          otp,
          Date.now() - otpCreationTime,
          otp.validity,
        );
      }
    });
  });
}, time);
