import mongoose from 'mongoose';

const FileSchema = new mongoose.Schema({
  path: {
    type: String,
    required: true,
  },
  info: {
    type: String,
  },
});

export const QuestionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    options: {
      a: {
        type: String,
        required: true,
      },
      b: {
        type: String,
        required: true,
      },
      c: {
        type: String,
        required: true,
      },
      d: {
        type: String,
        required: true,
      },
    },
    answer: {
      type: String,
      required: true,
      enum: ['a', 'b', 'c', 'd'],
    },
    weightage: {
      type: Number,
      default: 1,
    },
    infoImage: {
      type: FileSchema,
    },
    note: {
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

export const Question = mongoose.model('question', QuestionSchema);
