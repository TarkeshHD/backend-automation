import { Router } from 'express';
import {
  editClient,
  getClient,
  registerClient,
} from '../controllers/clientController.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import {
  reqErrorValidator,
  verifyName,
} from '../utils/validators/validationMiddleware.js';
const router = Router();

// router.post(
//   "/register",
//   reqErrorValidator,
//   verifyName(["name"]),
//   controllerTryCatch(registerClient)
// );

// router.get("/", controllerTryCatch(getClient));

// router.put("/", controllerTryCatch(editClient));

export default router;
