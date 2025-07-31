import { Router } from 'express';
import { getFile } from '../controllers/fileController.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';

const router = Router();

router.get('/uploads/*', controllerTryCatch(getFile));

export default router;
