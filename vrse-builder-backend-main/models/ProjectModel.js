import mongoose from 'mongoose';
import _ from 'lodash';

const Model = new mongoose.Schema(
  {
    name: { type: String, index: true },
    description: { type: String, index: true },
    archived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
    },
  },

  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret.domainPassword;
        return ret;
      },
    },
  },
);

export const Project = mongoose.model('project', Model);
