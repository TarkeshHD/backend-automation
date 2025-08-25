import { Router } from 'express';
import { getConfigs } from '../controllers/configController.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';

const router = Router();

router.get('/', controllerTryCatch(getConfigs));

export default router;
