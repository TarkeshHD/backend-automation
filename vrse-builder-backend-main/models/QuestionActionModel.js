import mongoose from 'mongoose';

const FileSchema = new mongoose.Schema(
  {
    path: String,
    info: String,
  },
  { _id: false },
);

export const QuestionActionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['question', 'action'],
    },
    title: {
      type: String,
      required: true,
    },
    timeRequired: {
      type: Number,
      default: 0,
    },
    timeTaken: {
      type: Number,
      default: 0,
    },
    weightage: {
      type: Number,
      default: 1,
    },
    // Conditional fields for questions
    options: {
      a: {
        type: String,
        required: function () {
          return this.type === 'question';
        },
      },
      b: {
        type: String,
        required: function () {
          return this.type === 'question';
        },
      },
      c: {
        type: String,
        required: function () {
          return this.type === 'question';
        },
      },
      d: {
        type: String,
        required: function () {
          return this.type === 'question';
        },
      },
    },
    answer: {
      type: String,
      enum: ['a', 'b', 'c', 'd', 'success', 'failure'],
      required: function () {
        return this.type === 'question';
      },
    },
    infoImage: FileSchema,
    note: String,
    // Conditional fields for actions
    descriptionSuccess: {
      type: String,
      required: function () {
        return this.type === 'action';
      },
    },
    descriptionFailure: {
      type: String,
      required: function () {
        return this.type === 'action';
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true, getters: true },
    toObject: { virtuals: true, getters: true },
  },
);

// Conditional validation for the options and answer fields
QuestionActionSchema.pre('validate', function (next) {
  if (this.type === 'question') {
    const options = this.options;
    const requiredOptions = ['a', 'b', 'c', 'd'];
    const hasAllOptions = requiredOptions.every((option) => options[option]);
    const isValidAnswer = requiredOptions.includes(this.answer);

    if (!hasAllOptions) {
      this.invalidate('options', 'Options are required for questions');
    }

    if (!isValidAnswer) {
      this.invalidate(
        'answer',
        `Answer must be one of the following values: ${requiredOptions.join(
          ', ',
        )}`,
      );
    }
  } else if (this.type === 'action') {
    const allowedAnswers = ['success', 'failure'];
    const hasValidDescriptions =
      this.descriptionSuccess || this.descriptionFailure;
    const isValidAnswer = allowedAnswers.includes(this.answer);

    if (!hasValidDescriptions) {
      this.invalidate(
        'description',
        'Either descriptionSuccess or descriptionFailure is required for actions',
      );
    }

    if (this.answer && !isValidAnswer) {
      this.invalidate(
        'answer',
        `For 'action' type, the answer must be either 'success' or 'failure'`,
      );
    }
  }

  next();
});

export const QuestionAction = mongoose.model(
  'questionAction',
  QuestionActionSchema,
);
