import { Router } from 'express';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { authenticateToken } from '../middlewares/auth.js';
import { createOrUpdateProject } from '../controllers/projectController.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';
import { ROLES } from '../constants.js';

const router = Router();

// Apply authentication middleware to all following routes
router.use(authenticateToken);

// Create or update a project
router.post(
  '/:projectId',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN, ROLES.ADMIN]),
  controllerTryCatch(createOrUpdateProject),
);

export default router;
