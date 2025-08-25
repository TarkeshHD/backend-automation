import { Router } from 'express';
/* Routes imports */
import indexRoutes from './indexRoute.js';

const router = Router();

router.use('/api', indexRoutes);

export default router;
