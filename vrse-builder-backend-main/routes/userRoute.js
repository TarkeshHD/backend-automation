import { Router } from 'express';
import { ROLES } from '../constants.js';
import {
  forgotPassword,
  getAllUsers,
  getUserByID,
  registerUser,
  registerUserBulk,
  resetPassword,
  updateUser,
  archiveUser,
  generateOtpForUser,
  generateOtpForVrUser,
  accountUpgradeRequest,
} from '../controllers/userController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';
import { mongooseTryCatch } from '../middlewares/mongooseTryCatch.js';

const router = Router();
// VR
router.get(
  '/generate-otp/device/:username',
  controllerTryCatch(generateOtpForVrUser),
);

router.use(authenticateToken); // This middleware makes sure the incoming request is authenticated
router.post(
  '/register',
  roleAuthorizer([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCT_ADMIN]),
  // validateSchema(userRegisterSchema),
  controllerTryCatch(registerUser),
);

router.get('/generate-otp/web', controllerTryCatch(generateOtpForUser));

router.post(
  '/update/:id',
  // validateSchema(userUpdateSchema),
  controllerTryCatch(updateUser),
);

router.get(
  '/all',
  roleAuthorizer([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCT_ADMIN]),
  controllerTryCatch(getAllUsers),
);
router.get('/:id', controllerTryCatch(getUserByID));

router.post('/reset-password/:id', controllerTryCatch(resetPassword));
router.post('/forgot-password', controllerTryCatch(forgotPassword));

// Bulk user add
router.post('/bulk', controllerTryCatch(registerUserBulk));

router.delete(
  '/archive/:userId',
  roleAuthorizer([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.PRODUCT_ADMIN]),
  controllerTryCatch(mongooseTryCatch(archiveUser)),
);

router.post('/upgrade-account', controllerTryCatch(accountUpgradeRequest));

export default router;
