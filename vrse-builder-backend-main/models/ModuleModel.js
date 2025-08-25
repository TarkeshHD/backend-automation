import mongoose from 'mongoose';
import uniqueValidator from 'mongoose-unique-validator';
import mongoosePaginate from 'mongoose-paginate-v2';

const FileSchema = new mongoose.Schema({
  path: {
    type: String,
    required: true,
  },
  info: {
    type: String,
  },
});

const Model = new mongoose.Schema(
  {
    name: { type: String, required: true },
    index: {
      type: Number,
      required: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'project',
    },
    evaluationJsonS3Url: {
      type: 'String',
    },
    trainingJsonS3Url: {
      type: 'String',
    },
    imageS3Url: {
      type: 'String',
    },
    thumbnail: {
      type: 'String',
    },
    archived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
    },
    description: {
      type: String,
      required: true,
    },
    evaluation: [
      {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'evaluationType',
      },
    ],
    evaluationType: {
      type: String,
      required: true,
      enum: ['time', 'question', 'questionAction', 'jsonLifeCycle'],
    },
    gameMode: {
      type: String,
      enum: ['singleplayer', 'multiplayer', 'hybridplayer'], // hybridplayer -> both sp and mp
      default: 'singleplayer',
    },
    moduleAccessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'moduleAccess',
      required: true,
    },
    SOP: {
      type: FileSchema,
    },
    noOfQuestion: {
      type: Number,
    },
    passPercentage: {
      type: Number,
    },
    momentCount: [
      {
        chapterIndex: {
          type: Number,
        },
        momentIndex: {
          type: Number,
        },
        users: [
          {
            id: {
              type: String,
            },
            count: {
              type: Number,
            },
          },
        ],
        _id: false,
      },
    ],
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
Model.plugin(uniqueValidator);
Model.plugin(mongoosePaginate);

export const Module = mongoose.model('module', Model);
