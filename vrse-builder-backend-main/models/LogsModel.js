import mongoose from 'mongoose';

const Model = new mongoose.Schema(
  {
    level: {
      type: String,
      required: true,
    },
    message: {
      type: String,
    },
    meta: {
      type: Object,
    },
  },
  {
    timestamps: true,
  },
);

export const Log = mongoose.model('log', Model);
