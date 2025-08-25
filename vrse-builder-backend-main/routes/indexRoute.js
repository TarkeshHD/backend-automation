import { Router } from 'express';

/* Routes imports */
import generalRoutes from './generalRoute.js';
import clientRoutes from './clientRoute.js';
import domainRoutes from './domainRoute.js';
import departmentRoute from './departmentRoute.js';
import userRoute from './userRoute.js';
import deviceRoute from './deviceRoute.js';
import authRoute from './authRoute.js';
import moduleRoute from './moduleRoute.js';
import trainingRoute from './trainingRoute.js';
import evaluationRoute from './evaluationRoute.js';
import fileRoute from './fileRoute.js';
import configRoute from './configRoute.js';
import analyticRoute from './analyticRoute.js';
import supportRoute from './supportRoute.js';
import archiveRoute from './archiveRoute.js';
import cohortRoute from './cohortRoute.js';
import multiplayerRoute from './multiplayerRoute.js';
import triggerRoute from './triggerRoute.js';
import projectRoute from './projectRoute.js';

const router = Router();

router.use('/', generalRoutes);
router.use('/domain', domainRoutes);
router.use('/department', departmentRoute);
router.use('/user', userRoute);
router.use('/device', deviceRoute);
router.use('/auth', authRoute);
router.use('/module', moduleRoute);
router.use('/training', trainingRoute);
router.use('/evaluation', evaluationRoute);
router.use('/file', fileRoute);
router.use('/config', configRoute);
router.use('/analytic', analyticRoute);
router.use('/support', supportRoute);
router.use('/archive', archiveRoute);
router.use('/cohort', cohortRoute);
router.use('/multiplayer', multiplayerRoute);
router.use('/trigger', triggerRoute);
router.use('/project', projectRoute);

export default router;
