import { Router } from 'express';
import {
  clearConsoleLogs,
  serverStatus,
} from '../controllers/generalController.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { downloadAllS3FIles, migrateModulesMoment } from '../utils/utils.js';
import mongoose from 'mongoose';
import { Department } from '../models/DepartmentModel.js';
import { ObjectId } from 'mongodb';

const router = Router();

router.get('/', controllerTryCatch(serverStatus));
router.get(
  '/migrate-s3',
  controllerTryCatch(async (req, res) => {
    await downloadAllS3FIles();
    return res.status(200).json({ message: 'Migration done' });
  }),
);

router.get(
  '/migrate-modules',
  controllerTryCatch(async (req, res) => {
    await migrateModulesMoment();
    return res.status(200).json({ message: 'Migration done' });
  }),
);

router.get('/remove-console-logs', controllerTryCatch(clearConsoleLogs));

export default router;
