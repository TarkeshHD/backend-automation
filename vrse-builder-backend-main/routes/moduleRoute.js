import { Router } from 'express';
import multer from 'multer';
import { ROLES } from '../constants.js';
import {
  assignModuleDomainsUpdate,
  assignModuleSpecialUpdate,
  assignModules,
  createModule,
  createModuleStep,
  // deleteModule,
  deleteModuleAssignment,
  editModule,
  editModuleFilesQuestions,
  editModuleQuestions,
  editModuleTimeBased,
  getAllModules,
  getAllModulesVR,
  joinModulesAndEvaluations,
  queryModuleAssignment,
  queryModuleStep,
  queryModules,
  archiveModule,
  editModuleQuestionsActions,
  editModuleJsonBased,
  getModuleTrainingValues,
  getAccessibleModules,
  createOrUpdateModuleStudio,
} from '../controllers/moduleController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';
import { validateSchema } from '../middlewares/validate.js';
import {
  assignModuleDomainUpdateSchema,
  assignModuleSpecialUpdateSchema,
  assignModulesSchema,
  createModuleSchema,
  createModuleStudioSchema,
  editModuleQuestionSchema,
  editModuleTimeSchema,
} from '../validators/moduleValidation.js';
import { verifyOtp } from '../controllers/otpController.js';

const upload = multer();
const router = Router();

router.post('/otp/login', controllerTryCatch(verifyOtp));

router.get(
  '/trainingValues/:moduleId',
  controllerTryCatch(getModuleTrainingValues),
);

router.use(authenticateToken); // This middleware makes sure the incoming request is authenticated

router.get('/vr/all', controllerTryCatch(getAllModulesVR)); // Use this route for trainees
router.get('/all', controllerTryCatch(getAllModules));
router.get('/access-modules', controllerTryCatch(getAccessibleModules));
router.post(
  '/create',
  roleAuthorizer([ROLES.PRODUCT_ADMIN]),
  validateSchema(createModuleSchema),
  controllerTryCatch(createModule),
);

router.put(
  '/studio/:id',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN, ROLES.ADMIN]),
  controllerTryCatch(createOrUpdateModuleStudio),
);

router.post(
  '/archive/:id',
  roleAuthorizer([ROLES.PRODUCT_ADMIN]),
  controllerTryCatch(archiveModule),
);
router.post(
  '/assign/update/domain/:id',
  validateSchema(assignModuleDomainUpdateSchema),
  controllerTryCatch(assignModuleDomainsUpdate),
);

router.post(
  '/assign/update/special/:id',
  validateSchema(assignModuleSpecialUpdateSchema),
  controllerTryCatch(assignModuleSpecialUpdate),
);

router.post(
  '/questions/update/:id',
  validateSchema(editModuleQuestionSchema),
  controllerTryCatch(editModuleQuestions),
);

router.post(
  '/time/update/:id',
  validateSchema(editModuleTimeSchema),
  controllerTryCatch(editModuleTimeBased),
);

router.post('/json/update/:id', controllerTryCatch(editModuleJsonBased));

router.post(
  '/questions/files/update/:id',
  controllerTryCatch(editModuleFilesQuestions),
);

router.post(
  '/questionsAction/update/:id',
  controllerTryCatch(editModuleQuestionsActions),
);

router.post('/update/:id', controllerTryCatch(editModule));

// -------------------------- OLD ROUTES -----------------

router.post(
  '/assign',
  validateSchema(assignModulesSchema),
  controllerTryCatch(assignModules),
);

router.get('/', controllerTryCatch(queryModules));
router.get(
  '/moduleswithevaluations/:userId/:modId',
  controllerTryCatch(joinModulesAndEvaluations),
);

// Not allowing deletion of modules for now
// router.delete('/:id', controllerTryCatch(deleteModule));

router.get('/module-assignment/', controllerTryCatch(queryModuleAssignment));
router.delete(
  '/module-assignment/:moduleId',
  controllerTryCatch(deleteModuleAssignment),
);
router.post('/module-step/:moduleId', controllerTryCatch(createModuleStep));
router.get('/module-step/', controllerTryCatch(queryModuleStep));

export default router;
