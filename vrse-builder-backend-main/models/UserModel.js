import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import _ from 'lodash';
import mongoosePaginate from 'mongoose-paginate-v2';

import { HttpStatusCode, ROLES } from '../constants.js';
import BaseError from '../utils/classes/BaseError.js';
import Email from '../utils/classes/Email.js';
import { otpUtils } from '../utils/classes/OTP.js';
import { generateToken } from '../utils/generateToken.js';
import { send2FAMail } from '../utils/mailTemplates/userAccountMails.js';

const Model = new mongoose.Schema(
  {
    name: { type: String },
    username: { type: String, required: true },
    password: { type: String },
    email: { type: String, index: true },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'department' },
    domainId: { type: mongoose.Schema.Types.ObjectId, ref: 'domain' },
    invitedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
    },
    traineeType: {
      type: String,
      enum: ['Employee', 'GAT', 'DAT', 'Trainee', 'Contract', null], // Cross check with the config file
    },
    pincode: { type: String },
    role: { type: String, enum: Object.values(ROLES), required: true },
    isActivated: {
      default: true,
      required: true,
      type: Boolean,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    deviceIds: [{ type: mongoose.Schema.Types.ObjectId }],
    metaIds: [{ type: String }],
    archivedAt: {
      type: Date,
    },
    hasRequestedAccountUpgrade: Boolean,
    isDemoUser: Boolean,
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      getters: true,
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  },
);

Object.assign(Model.statics, { ROLES });

Model.statics.checkUsernameAvailable = async function (username) {
  let document = await this.findOne({
    username,
    archived: { $ne: true },
  }).lean();
  if (_.isEmpty(document)) {
    return true;
  }
  return false;
};

Model.statics.createUser = async function (data) {
  let isAvailable = await this.checkUsernameAvailable(data.username);
  if (!isAvailable) {
    throw new Error('Employee code already exists');
  }
  return await this.create(data);
};

Model.methods.matchPassword = async function (password) {
  console.log('this.password', this.password);
  if (!this.password)
    throw new BaseError(
      'MongoError',
      HttpStatusCode.INTERNAL_SERVER,
      'Password not provided',
    );
  return await bcrypt.compare(password, this.password);
};

Model.methods.generateJWT = async function () {
  let payload = {
    username: this.username,
    role: this.role,
    id: this._id,
    deviceIds: this.deviceIds,
    metaIds: this.metaIds,
    email: this.email,
  };
  return await generateToken(payload);
};

Model.methods.send2FA = async function () {
  const otp = await otpUtils.generate(
    {
      username: this.username,
      role: this.role,
    },
    1,
  );

  await Email.send(send2FAMail(this.email, this.username, otp));

  return otp;
};

Model.index({ archived: 1 });
Model.index({ role: 1, archived: 1 });

Model.plugin(mongoosePaginate);

export const User = mongoose.model('user', Model);
