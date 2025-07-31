import { Router } from 'express';
import { submitTrigger } from '../controllers/multiplayerController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { validateSchema } from '../middlewares/validate.js';
import { submitTriggerSchema } from '../validators/triggerValidation.js';

const router = Router();

router.use(authenticateToken);

// Submit a trigger for a multiplayer session
router.post(
  '/submit',
  validateSchema(submitTriggerSchema),
  controllerTryCatch(submitTrigger),
);

export default router;
