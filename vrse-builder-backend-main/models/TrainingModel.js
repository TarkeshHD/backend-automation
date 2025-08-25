import moment from 'moment-timezone';
import mongoose from 'mongoose';

import { JsonLifeCycleTrainingSchema } from './JsonLifeCycleTrainingModel.js';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

export const TrainingStatus = { ongoing: 'ongoing', completed: 'completed' };

// Define the JsonLifeCycleAnswerSub schema for Training model
const JsonLifeCycleAnswerSub = new mongoose.Schema(
  {
    chapterIndex: {
      type: Number,
      required: true,
    },
    momentIndex: {
      type: Number,
      required: true,
    },
    startTime: {
      type: Number,
      required: true,
    },
    endTime: {
      type: Number,
    },
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
            enum: [
              'onRightTrigger',
              'onWrongTrigger',
              'onAdminChange',
              'onMomentComplete',
              'onRight',
              'onWrong',
              'joined',
              'exited',
            ],
          },
          userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'user',
          },
          triggerName: {
            type: String,
          },
        },
      ],
      default: [],
    },
  },
  { _id: false }, // Exclude _id field for sub-schema
);

const Model = new mongoose.Schema(
  {
    name: { type: String, index: true },
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
      index: true,
    },
    // Multiplayer fields
    isMultiplayer: {
      type: Boolean,
      default: false,
    },
    participants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'user',
      default: [],
    },
    completedParticipants: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'user',
      default: [],
    },
    trainingType: {
      type: String,
      required: true,
      enum: ['time', 'question', 'questionAction', 'jsonLifeCycle'],
    },
    trainingDumpJson: {
      type: JsonLifeCycleTrainingSchema,
    },
    // New answers field similar to Report model but only with jsonLifeCycleBased
    answers: {
      jsonLifeCycleBased: {
        type: [JsonLifeCycleAnswerSub],
        default: [],
      },
    },
    status: {
      type: String,
      default: TrainingStatus.ongoing,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
    },
    startTime: { type: Number, default: () => moment().unix() },
    storyStartTime: { type: Number },
    endTime: { type: Number },
  },
  { timestamps: true },
);

Model.index({ userId: 1, archived: 1 });

Model.plugin(mongooseAggregatePaginate);

export const Training =
  mongoose.models.Training || mongoose.model('training', Model);
