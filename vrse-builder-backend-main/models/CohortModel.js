import mongoose from 'mongoose';
import { Module } from './ModuleModel.js';
import { User } from './UserModel.js';

const Model = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // startDate, which will be unix timestamp
    startDate: { type: Number, required: true },
    endDate: { type: Number },
    venue: { type: String, required: true },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'user',
      required: true,
    },
    modules: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'module',
        required: true,
      },
    ],
    users: [
      {
        _id: false, // To prevent _id from being created
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
        evaluation: [
          { type: mongoose.Schema.Types.ObjectId, ref: 'evaluation' },
        ],
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      virtuals: true,
    },
    toObject: { getters: true, virtuals: true },
  },
);

// To check if the modules and users exists before saving
Model.pre('save', async function (next) {
  try {
    const [validModuleIds, validUserIds] = await Promise.all([
      Promise.all(
        this.modules.map(async (moduleId) => {
          const module = await Module.findById(moduleId);
          return module ? moduleId : null;
        }),
      ),
      Promise.all(
        this.users.map(async (user) => {
          const existingUser = await User.findById(user.id);
          return existingUser ? user.id : null;
        }),
      ),
    ]);

    if (validModuleIds.includes(null)) {
      throw new Error("Module doesn't exist");
    }

    if (validUserIds.includes(null)) {
      throw new Error("User doesn't exist");
    }

    next();
  } catch (error) {
    next(error);
  }
});

export const Cohort = mongoose.model('cohort', Model);
