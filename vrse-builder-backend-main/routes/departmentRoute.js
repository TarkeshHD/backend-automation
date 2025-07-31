import { Router } from 'express';
import { ROLES } from '../constants.js';
import {
  archiveDepartment,
  deleteDepartment,
  getAllDepartments,
  getDepartmentById,
  registerDepartment,
  updateDepartment,
  usersOfDepartment,
  registerBulkDepartment,
} from '../controllers/departmentController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';
const router = Router();

router.use(authenticateToken);

router.post(
  '/register',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  // validateSchema(registerDepartmentSchema),
  controllerTryCatch(registerDepartment),
);

router.get(
  '/all',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getAllDepartments),
);

router.get('/:departmentId', controllerTryCatch(getDepartmentById));

router.get('/userlist/:departmentId', controllerTryCatch(usersOfDepartment));

router.post(
  '/update/:id',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN, ROLES.ADMIN]),
  controllerTryCatch(updateDepartment),
);

router.delete('/', controllerTryCatch(deleteDepartment));

router.post('/bulk', controllerTryCatch(registerBulkDepartment));

router.delete(
  '/:departmentId',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN, ROLES.ADMIN]),
  controllerTryCatch(archiveDepartment),
);

export default router;
