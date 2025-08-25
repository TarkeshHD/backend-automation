import mongoose from 'mongoose';

const Model = new mongoose.Schema(
  {
    otp: {
      type: String,
      index: true,
    },
    payload: {
      type: Object,
      required: true,
    },
    validity: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true },
);

export const OTPModel = mongoose.model('otp', Model);
