import { Router } from 'express';
import { ROLES } from '../constants.js';
import {
  getAnalyticUsers,
  getTotalModulesTime,
  getUserTotalModulesTime,
  getTotalEvaluationTime,
  getUserTotalEvaluationTime,
  getTotalUserVRTime,
  getEvaluationRank,
  getUsersRankEvaluation,
  getEvaluationAnalytics,
  getModuleDetails,
  getModuleAnalytics,
  getDomainAnalytics,
  getDepartmentAnalytics,
} from '../controllers/analyticController.js';
import { authenticateToken } from '../middlewares/auth.js';
import { controllerTryCatch } from '../middlewares/controllerTryCatch.js';
import { roleAuthorizer } from '../middlewares/roleAuthorizer.js';

const router = Router();

router.use(authenticateToken);

router.get('/all', controllerTryCatch(getAnalyticUsers));

router.get(
  '/modules-time',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getTotalModulesTime),
);

router.get(
  '/modules-time/:userId',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getUserTotalModulesTime),
);

router.get(
  '/evaluation-time',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getTotalEvaluationTime),
);

router.get(
  '/evaluation-time/:userId',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getUserTotalEvaluationTime),
);

router.get(
  '/vr-time/:userId',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getTotalUserVRTime),
);

router.get(
  '/rank-evaluation',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getEvaluationRank),
);

router.get(
  '/rank-users-evaluation',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getUsersRankEvaluation),
);

router.get(
  '/evaluation/all',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getEvaluationAnalytics),
);

router.get(
  '/modules',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getModuleAnalytics),
);

router.get(
  '/domains',
  roleAuthorizer([ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getDomainAnalytics),
);

router.get(
  '/departments',
  roleAuthorizer([ROLES.ADMIN, ROLES.PRODUCT_ADMIN, ROLES.SUPER_ADMIN]),
  controllerTryCatch(getDepartmentAnalytics),
);

export default router;
