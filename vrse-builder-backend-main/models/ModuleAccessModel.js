import mongoose, { Schema } from 'mongoose';

const Model = new mongoose.Schema(
  {
    domains: [{ type: Schema.Types.ObjectId, ref: 'domain' }],
    departments: [{ type: Schema.Types.ObjectId, ref: 'department' }],
    users: [{ type: Schema.Types.ObjectId, ref: 'user' }],
  },
  {
    timestamps: true,
  },
);

export const ModuleAccess = mongoose.model('moduleAccess', Model);
