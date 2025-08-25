import mongoose from 'mongoose';

const Model = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
      index: true,
    },
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'module',
      required: true,
    },
    startTime: {
      type: Number, // Unix Timestamp
      required: true,
      default: () => moment().unix(),
    },
    endTime: { type: Number },
  },
  { timestamps: true },
);

export const ModuleSession = mongoose.model('moduleSession', Model);
