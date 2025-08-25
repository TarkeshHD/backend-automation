import { Router } from 'express';
import {
  createTraining,
  endJsonTraining,
  endTraining,
  getAllTraining,
  submitJsonLifecycle,
  getUserTrainings,
  getTrainingById,
  archiveTraining,
} from '../controllers/trainingController.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { authenticateToken } from '../middlewares/auth.js';
import { validateSchema } from '../middlewares/validate.js';
import {
  createTrainingSchema,
  endTrainingJsonLifeCycleSchema,
  submitTrainingJsonLifeCycleSchema,
} from '../validators/trainingValidation.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';
import { ROLES } from '../constants.js';

const router = Router();

router.use(authenticateToken);

router.get('/', controllerTryCatch(getAllTraining));

router.post(
  '/create/:moduleId',
  validateSchema(createTrainingSchema),
  controllerTryCatch(createTraining),
);
router.post(
  '/submit/jsonLifecycle/:id',
  validateSchema(submitTrainingJsonLifeCycleSchema),
  controllerTryCatch(submitJsonLifecycle),
);

router.post(
  '/end/jsonLifeCycle/:id',
  validateSchema(endTrainingJsonLifeCycleSchema),
  controllerTryCatch(endJsonTraining),
);
router.post('/end-training/:id', controllerTryCatch(endTraining));

router.get('/user/:userId', controllerTryCatch(getUserTrainings));
router.get('/:trainingId', controllerTryCatch(getTrainingById));

router.post(
  '/archive/:id',
  roleAuthorizer([ROLES.PRODUCT_ADMIN]),
  controllerTryCatch(archiveTraining),
);

export default router;
