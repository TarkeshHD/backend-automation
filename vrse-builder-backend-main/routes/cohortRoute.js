import { Router } from 'express';
import { ROLES } from '../constants.js';
import {
  getUpcomingCohorts,
  registerCohort,
  getActiveCohorts,
  getPastCohorts,
  getAllCohorts,
  getCohortDetails,
} from '../controllers/cohortController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';
import { cohortRegisterSchema } from '../validators/cohortValidation.js';
import { validateSchema } from '../middlewares/validate.js';

const router = Router();

router.use(authenticateToken);

// API o get all cohort sessions
router.get(
  '/all',
  roleAuthorizer([ROLES.PRODUCT_ADMIN]),
  controllerTryCatch(getAllCohorts),
);

router.get('/session-details/:sessionId', controllerTryCatch(getCohortDetails));

router.get('/upcoming', controllerTryCatch(getUpcomingCohorts));
router.get('/active', controllerTryCatch(getActiveCohorts));
router.get('/past', controllerTryCatch(getPastCohorts));

router.post(
  '/register',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN, ROLES.ADMIN]),
  validateSchema(cohortRegisterSchema),
  controllerTryCatch(registerCohort),
);

export default router;
