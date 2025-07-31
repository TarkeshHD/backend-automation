import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { authenticateToken } from '../middlewares/auth.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';
import { ROLES } from '../constants.js';
import { sendTicketMock } from '../controllers/supportController.js';

import { createTicketDataScheme } from '../validators/supportValidation.js';
import { validateSchema } from '../middlewares/validate.js';

import { Router } from 'express';
const router = Router();

router.use(authenticateToken);

router.post(
  '/send-ticket',
  roleAuthorizer([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCT_ADMIN]),
  validateSchema(createTicketDataScheme),
  controllerTryCatch(sendTicketMock),
);

export default router;
