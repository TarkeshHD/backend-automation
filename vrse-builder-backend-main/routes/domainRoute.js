import { Router } from 'express';
import { ROLES } from '../constants.js';
import {
  archiveDomain,
  getAllDomain,
  getDepartmentsOfDomain,
  getDomain,
  getDomainTree,
  registerDomain,
  updateDomain,
  getAllDomainUsers,
  registerDomainBulk,
} from '../controllers/domainController.js';
import {
  authenticateDomainToken,
  authenticateToken,
} from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';
import { validateSchema } from '../middlewares/validate.js';
import { registerDomainSchema } from '../validators/domainValidation.js';
import { featureAccess } from '../middlewares/featureMiddleware.js';

const router = Router();

router.get('/vr/all', controllerTryCatch(getAllDomain));

router.get(
  '/users',
  authenticateDomainToken,
  featureAccess('auth', { authType: 'DomainAuth' }),
  getAllDomainUsers,
);

router.use(authenticateToken); // This middleware makes sure the incoming request is authenticated

router.get('/all', controllerTryCatch(getAllDomain));

router.post(
  '/register',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  validateSchema(registerDomainSchema),
  controllerTryCatch(registerDomain),
);

router.post(
  '/update/:id',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN, ROLES.ADMIN]),
  controllerTryCatch(updateDomain),
);

router.get(
  '/tree',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN, ROLES.ADMIN]),
  controllerTryCatch(getDomainTree),
);

router.get('/:id', controllerTryCatch(getDomain));

router.get(
  '/domainDepartments/:domainId',
  controllerTryCatch(getDepartmentsOfDomain),
);

// router.put('/', controllerTryCatch(updateDomain));

router.delete(
  '/:domainId',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(archiveDomain),
);

// Bulk domain add
router.post('/bulk', controllerTryCatch(registerDomainBulk));

export default router;
