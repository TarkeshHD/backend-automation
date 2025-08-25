import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import _ from 'lodash';
import { generateToken } from '../utils/generateToken.js';
import mongoosePaginate from 'mongoose-paginate-v2';

const Model = new mongoose.Schema(
  {
    name: { type: String, index: true, required: true },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    domainPassword: { type: String, required: true },
    archived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
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

Model.methods.matchPassword = async function (password) {
  if (!this.domainPassword)
    throw new BaseError(
      'MongoError',
      HttpStatusCode.INTERNAL_SERVER,
      'Password not provided',
    );
  return await bcrypt.compare(password, this.domainPassword);
};

Model.methods.generateJWT = async function () {
  let payload = {
    id: this._id,
    name: this.name,
    parentId: this.parentId,
  };
  return await generateToken(payload);
};

Model.statics.createDomain = async function (data) {
  let isAvailable = await this.findOne({
    name: data.name,
    archived: { $ne: true },
  });
  if (!_.isEmpty(isAvailable)) {
    throw new Error('Domain with same name already exists');
  }
  return await this.create(data);
};

Model.plugin(mongoosePaginate);

export const Domain = mongoose.model('domain', Model);
