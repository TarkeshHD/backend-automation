import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { Module } from '../models/ModuleModel.js';
import { CONF, STORAGE_CONFIG } from '../constants.js';
import logger from '../utils/logger.js';
import { getJsonFromS3, getModuleJson } from '../utils/utils.js';

// Detect if value is a full URL
const isUrl = (value) => /^https?:\/\//i.test(value);

// Read JSON from either S3 or local disk based on config
const parseJsonFromModuleId = async (module, type, moduleId) => {
  try {
    if (STORAGE_CONFIG.storageType === 's3') {
      // if (!urlFallback || !isUrl(urlFallback)) return null;

      const data = await getModuleJson(module, type);

      return data;
    }

    if (STORAGE_CONFIG.storageType === 'local') {
      let localPath = '';
      if (type === 'trainingJson') {
        localPath = path.join(
          process.cwd(),
          `uploads/training-json/${moduleId}/training.json`,
        );
      } else if (type === 'evaluationJson') {
        localPath = path.join(
          process.cwd(),
          `uploads/evaluation-json/${moduleId}/evaluation.json`,
        );
      } else {
        return null;
      }

      const content = await fs.readFile(localPath, 'utf8');

      return JSON.parse(content);
    }

    return null;
  } catch (err) {
    console.warn(
      `Failed to read ${type} JSON for module ${moduleId}:`,
      err.message,
    );
    return null;
  }
};

export const migrateModulesToStudio = async () => {
  logger.info('Migrating modules to studio');
  if (CONF.features.studioConnect.state === 'on') {
    try {
      const modules = await Module.find({
        archived: { $ne: true },
        evaluationType: 'jsonLifeCycle',
      });

      // console.log("modules", modules)

      const resultPayload = await Promise.all(
        modules.map(async (module) => {
          const moduleId = module._id.toString();
          console.log('moduleId', moduleId);

          const trainingJSON = await parseJsonFromModuleId(
            module,
            'trainingJson',
            moduleId,
          );

          const evaluationJSON = await parseJsonFromModuleId(
            module,
            'evaluationJson',
            moduleId,
          );

          return {
            name: module.name,
            description: module.description,
            id: moduleId,
            image: module.thumbnailUrl || null,
            gameMode: module.gameMode || 'singlePlayer',
            trainingJSON,
            evaluationJSON,
          };
        }),
      );

      // console.log("result payload",resultPayload )

      const res = await axios.post(
        `${process.env.BASE_STUDIO_URL}/api/pulse/migration`,
        { moduleJsonData: resultPayload },
      );

      console.log('res', res);
      const { projectId } = res.data.data;

      if (!projectId) {
        throw new Error('No projectId returned from studio migration response');
      }

      // Update all modules with the new projectId
      const moduleIds = modules.map((m) => m._id);
      await Module.updateMany(
        { _id: { $in: moduleIds } },
        { $set: { projectId } },
      );

      console.log(
        `Successfully updated ${moduleIds.length} modules with projectId ${projectId}`,
      );
    } catch (err) {
      console.error('error ', err.message);
      logger.error('error ', err.message);
    }
  }
};
