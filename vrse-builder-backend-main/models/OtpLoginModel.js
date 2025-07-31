import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user',
    required: true,
  },
  otp: { type: String, required: true },
  expiryTime: { type: Number, required: true },
});

export const OtpModel = mongoose.model('Otp', otpSchema);
