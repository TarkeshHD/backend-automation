import mongoose from 'mongoose';

export const mistakeReductionSchema = new mongoose.Schema(
  {
    state: { type: Boolean, required: true },
    reduction: { type: Number, required: true },
  },
  { _id: false },
);

// const timerReductionSchema = new mongoose.Schema(
//   {
//     state: { type: Boolean, required: true },
//     reduction: { type: Number, required: true },
//     maxTime: { type: Number, required: true },
//   },
//   { _id: false },
// );

const momentSchema = new mongoose.Schema(
  {
    momentIndex: { type: Number, required: true },
    momentName: { type: String, required: true },
    weightage: { type: Number, required: true },
    totalScored: { type: Number, default: 0 },
    // timerReduction: timerReductionSchema, // Not used
    wrongReduction: mistakeReductionSchema,
    startTime: { type: Number, default: 0 },
    endTime: { type: Number, default: 0 },
    totalTimeTaken: { type: Number, default: 0 },
  },
  { _id: false },
);

const chapterSchema = new mongoose.Schema(
  {
    chapterName: { type: String, required: true },
    chapterIndex: { type: Number, required: true },
    totalMark: { type: Number, required: true },
    totalScored: { type: Number, default: 0 },
    totalTimeTaken: { type: Number, default: 0 },
    startTime: { type: Number, default: 0 },
    endTime: { type: Number, default: 0 },
    moments: [momentSchema],
  },
  { _id: false },
);

export const JsonLifeCycleSchema = new mongoose.Schema({
  moduleName: { type: String, required: true },
  totalMark: { type: Number, required: true },
  totalScored: { type: Number, required: true },
  passMark: { type: Number },
  status: { type: String, default: 'pending' },
  startTime: { type: Number, default: 0 },
  endTime: { type: Number, default: 0 },
  chapters: [chapterSchema],
});

export const JsonLifeCycle = mongoose.model(
  'jsonLifeCycle',
  JsonLifeCycleSchema,
);
