import { Router } from 'express';
import { ROLES } from '../constants.js';
import {
  createEvaluation,
  getAllEvaluation,
  getEvaluation,
  migratePassing,
  submitQuestion,
  submitTime,
  archiveEvaluation,
  getEvaluationForUser,
  submitQuestionAction,
  submitJsonLifecycle,
  endJsonLifeCycle,
} from '../controllers/evaluationController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';
import { validateSchema } from '../middlewares/validate.js';
import {
  createEvaluationSchema,
  submitEndJsonLifeCycleSchema,
  submitJsonLifeCycleSchema,
  submitQuestionActionSchema,
  submitQuestionSchema,
  submitTimeSchema,
} from '../validators/evaluationValidation.js';

const router = Router();

router.use(authenticateToken);
// Below API's Are supposed to be accessed from VR
// Add ROLE AUTHORIZERS
router.post(
  '/create/:moduleId',
  validateSchema(createEvaluationSchema),
  controllerTryCatch(createEvaluation),
);
router.post(
  '/submit/question/:id',
  validateSchema(submitQuestionSchema),
  controllerTryCatch(submitQuestion),
);
router.post(
  '/submit/time/:id',
  validateSchema(submitTimeSchema),
  controllerTryCatch(submitTime),
);

router.post(
  '/submit/questionAction/:id',
  validateSchema(submitQuestionActionSchema),
  controllerTryCatch(submitQuestionAction),
);

router.post(
  '/submit/jsonLifecycle/:id',
  validateSchema(submitJsonLifeCycleSchema),
  controllerTryCatch(submitJsonLifecycle),
);

router.post(
  '/end/jsonLifecycle/:id',
  validateSchema(submitEndJsonLifeCycleSchema),
  controllerTryCatch(endJsonLifeCycle),
);

// Dashboard use
router.get(
  '/all',
  roleAuthorizer([
    ROLES.ADMIN,
    ROLES.PRODUCT_ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.USER,
  ]),
  controllerTryCatch(getAllEvaluation),
);

router.get(
  '/:id',
  roleAuthorizer([
    ROLES.ADMIN,
    ROLES.PRODUCT_ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.USER,
  ]),
  controllerTryCatch(getEvaluation),
);

router.get(
  '/user/:userId',

  controllerTryCatch(getEvaluationForUser),
);

router.post(
  '/archive/:id',
  roleAuthorizer([ROLES.PRODUCT_ADMIN]),
  controllerTryCatch(archiveEvaluation),
);

router.get('/all/migrate/passing', controllerTryCatch(migratePassing));

export default router;
