import { Router } from 'express';
import {
  createMultiplayerSession,
  exitMultiplayerSession,
  joinMultiplayerSession,
  startMultiplayerStory,
  submitTrigger,
} from '../controllers/multiplayerController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { validateSchema } from '../middlewares/validate.js';
import {
  createMultiplayerSessionSchema,
  joinMultiplayerSessionSchema,
} from '../validators/multiplayerValidation.js';

const router = Router();

router.use(authenticateToken);

// Create multiplayer session (unified endpoint for report and training)
router.post(
  '/create/:moduleId',
  validateSchema(createMultiplayerSessionSchema),
  controllerTryCatch(createMultiplayerSession),
);

// Join an existing multiplayer session
router.post(
  '/join',
  validateSchema(joinMultiplayerSessionSchema),
  controllerTryCatch(joinMultiplayerSession),
);

// Start multiplayer story session
router.post(
  '/start-story',
  // validateSchema(startMultiplayerStorySchema), // Create before final commit
  controllerTryCatch(startMultiplayerStory),
);

// Exit multiplayer session
router.post(
  '/exit',
  // validateSchema(exitMultiplayerSessionSchema), // Create before final commit
  controllerTryCatch(exitMultiplayerSession),
);

export default router;
