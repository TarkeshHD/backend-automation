import moment from 'moment-timezone';
import mongoose, { Schema } from 'mongoose';
import { QuestionSchema } from './QuestionModel.js';
import { TimeSchema } from './TimeModel.js';
import { QuestionActionSchema } from './QuestionActionModel.js';
import { JsonLifeCycleSchema } from './JsonLifeCycleModel.js';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';
import mongoosePaginate from 'mongoose-paginate-v2';
import { fetchScoresAndStatuses } from '../utils/utils.js';

const QuestionAnswerSub = new mongoose.Schema(
  {
    answerKey: {
      type: [{ type: String, enum: ['a', 'b', 'c', 'd'] }],
      default: [],
    },
    score: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }, // Exclude _id field for sub-schema
);

const QuestionActionAnswerSub = new mongoose.Schema(
  {
    answerKey: {
      type: [
        { type: String, enum: ['success', 'failure', 'a', 'b', 'c', 'd'] },
      ],
      default: [],
    },
    score: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }, // Exclude _id field for sub-schema
);

// Define the sub-schema for "time" mode
const TimeBasedSub = new mongoose.Schema(
  {
    mistakes: [
      {
        description: {
          type: String,
          required: true,
        },
        timeOfMistake: {
          type: Number,
          required: true,
        },
      },
    ],
    score: {
      type: String,
    },
    timeTaken: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }, // Exclude _id field for sub-schema
);

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
              'onRight',
              'onWrong',
              'onRightTrigger',
              'onWrongTrigger',
              'onAdminChange',
              'onMomentComplete',
              'joined',
              'exited',
            ],
          },
          userId: {
            type: Schema.Types.ObjectId,
            ref: 'user',
          },
          triggerName: {
            type: String,
          },
        },
      ],
    },

    default: [],
  },

  { _id: false }, // Exclude _id field for sub-schema
);

const Model = new mongoose.Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    moduleId: {
      type: Schema.Types.ObjectId,
      ref: 'module',
      required: true,
    },
    // New multiplayer fields
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
    archived: {
      type: Boolean,
      default: false,
    },
    mode: {
      type: String,
      enum: ['time', 'mcq', 'questionAction', 'jsonLifeCycle'],
      required: true,
    },
    cohortId: {
      type: Schema.Types.ObjectId,
    },
    evaluationDump: {
      timeBased: {
        type: TimeSchema,
      },
      mcqBased: {
        type: [QuestionSchema],
      },
      questionActionBased: {
        type: [QuestionActionSchema],
      },
      jsonLifeCycleBased: {
        type: JsonLifeCycleSchema,
      },
    },
    answers: {
      timeBased: {
        type: TimeBasedSub,
        default: {},
      },
      mcqBased: {
        type: QuestionAnswerSub,
        default: {},
      },
      questionActionBased: {
        type: QuestionActionAnswerSub,
        default: {},
      },
      jsonLifeCycleBased: {
        type: [JsonLifeCycleAnswerSub],
        default: [],
      },
    },
    passingCriteria: {
      passPercentage: {
        type: Number,
      },
      mistakesAllowed: {
        type: Number,
      },
      passMark: {
        type: Number,
      },
    },
    startTime: {
      type: Number, // Unix Timestamp
      required: true,
      default: () => moment().unix(), // Fixed default value, by giving it as a function.
    },
    score: {
      type: String,
    },
    status: {
      type: String,
    },
    storyStartTime: { type: Number },
    endTime: {
      type: Number, // Unix Timestamp
    },
    note: {
      type: String,
    },
    archivedAt: {
      type: Date,
    },
    score: {
      type: String,
    },
    status: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      getters: true,
    },
    toObject: {
      virtuals: true,
      getters: true,
    },
  },
);

Model.index({ userId: 1, archived: 1 });

Model.plugin(mongooseAggregatePaginate);
Model.plugin(mongoosePaginate);

Model.pre('save', function (next) {
  const data = fetchScoresAndStatuses(this);
  this.score = data.score;
  this.status = data.status;
  next();
});

export const Report = mongoose.model('report', Model);
