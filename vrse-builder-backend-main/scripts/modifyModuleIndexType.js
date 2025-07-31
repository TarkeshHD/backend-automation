import { Module } from '../models/ModuleModel.js';

export const modifyModuleIndexType = async () => {
  const modules = await Module.find({});
  for (const module of modules) {
    const convertedValue = parseInt(module.index);

    await Module.updateOne(
      { _id: module._id },
      { $set: { index: convertedValue } },
    );

    console.log('Updated module', module.name);
  }
};
