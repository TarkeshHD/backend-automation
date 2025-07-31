import { Router } from 'express';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';

import {
  getAllDatas,
  bulkArchiveData,
  fixArchivedRecords,
} from '../controllers/archiveController.js';
import { authenticateToken } from '../middlewares/auth.js';

const router = Router();

router.post('/fixRecords', controllerTryCatch(fixArchivedRecords));

router.use(authenticateToken); // This middleware makes sure the incoming request is authenticated

router.get('/', controllerTryCatch(getAllDatas));

router.post('/bulkArchive', controllerTryCatch(bulkArchiveData));

export default router;
