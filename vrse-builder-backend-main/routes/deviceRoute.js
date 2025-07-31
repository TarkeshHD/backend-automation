import { Router } from 'express';
import {
  getAllDevices,
  getOneDevice,
} from '../controllers/deviceController.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { authenticateToken } from '../middlewares/auth.js';
const router = Router();

router.use(authenticateToken);

// router.get('/generate-otp', controllerTryCatch(generateDeviceOtp));
// router.post('/register', controllerTryCatch(registerDevice));
// router.get('/is-registered/:deviceId', controllerTryCatch(isDeviceRegistered));
// router.get('/query', controllerTryCatch(queryDevices));
// router.delete('/:deviceId', controllerTryCatch(deleteDevice));
// router.get('/logins/:deviceId', controllerTryCatch(getLastLoggedInUsers));

router.get('/all', controllerTryCatch(getAllDevices));

router.get('/:deviceId', getOneDevice);

export default router;
