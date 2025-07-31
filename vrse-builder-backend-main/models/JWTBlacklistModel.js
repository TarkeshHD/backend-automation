import mongoose from 'mongoose';

const Model = new mongoose.Schema(
  {
    token: { type: String, index: true },
  },
  { timestamps: true },
);

export const JwtBlackListModel = mongoose.model('jwtblacklist', Model);
