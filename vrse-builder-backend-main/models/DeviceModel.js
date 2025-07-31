import mongoose, { Schema } from 'mongoose';
import mongooseAggregatePaginate from 'mongoose-aggregate-paginate-v2';

const Model = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
    },
    domains: {
      type: [
        {
          id: { type: Schema.Types.ObjectId, ref: 'domain', required: true },
          time: { type: [Number], required: true },
        },
      ],
      default: [],
    },
    macAddr: {
      type: String,
      required: true,
    },
    users: {
      type: [
        {
          id: { type: Schema.Types.ObjectId, ref: 'user', required: true },
          time: { type: [Number], required: true },
        },
      ],
      default: [],
    },
    ipAddress: {
      type: [
        {
          ip: { type: String, required: true },
          time: { type: Number, required: true },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

Model.plugin(mongooseAggregatePaginate);

export const Device = mongoose.model('device', Model);
