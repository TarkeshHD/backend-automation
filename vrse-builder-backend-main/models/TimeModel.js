import mongoose, { Schema } from 'mongoose';

export const TimeSchema = new Schema(
  {
    goldTimeLimit: {
      type: Number,
      required: true,
    },
    silverTimeLimit: {
      type: Number,
      required: true,
    },
    bronzeTimeLimit: {
      type: Number,
      required: true,
    },
    mistakesAllowed: {
      type: Number,
      required: true,
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

export const Time = mongoose.model('time', TimeSchema);
