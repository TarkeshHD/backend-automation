import mongoose from 'mongoose';

const JsonLifeCycleTrainingAnswerSub = new mongoose.Schema(
  {
    events: {
      type: [
        {
          verb: {
            type: String,
            required: true,
          },
          object: {
            type: String,
            required: true,
          },
          time: {
            type: Number,
            required: true,
          },
          eventType: {
            type: String,
            required: true,
            enum: ['onRight', 'onWrong'],
          },
        },
      ],
    },
    default: {},
  },
  { _id: false }, // Exclude _id field for sub-schema
);

const momentSchema = new mongoose.Schema(
  {
    momentIndex: { type: Number, required: true },
    momentName: { type: String, required: true },
    startTime: { type: Number, default: 0 },
    endTime: { type: Number, default: 0 },
    answers: {
      type: JsonLifeCycleTrainingAnswerSub,
      default: {},
    },
  },
  { _id: false },
);

const chapterSchema = new mongoose.Schema(
  {
    chapterName: { type: String, required: true },
    chapterIndex: { type: Number, required: true },
    totalTimeTaken: { type: Number, default: 0 },
    startTime: { type: Number, default: 0 },
    endTime: { type: Number, default: 0 },
    moments: [momentSchema],
  },
  { _id: false },
);

export const JsonLifeCycleTrainingSchema = new mongoose.Schema({
  moduleName: { type: String, required: true },
  startTime: { type: Number, default: 0 },
  endTime: { type: Number, default: 0 },
  chapters: [chapterSchema],
  status: {
    type: String,
    default: 'pending',
  },
});

export const JsonLifeCycleTraining = mongoose.model(
  'jsonLifeCycleTraining',
  JsonLifeCycleTrainingSchema,
);
