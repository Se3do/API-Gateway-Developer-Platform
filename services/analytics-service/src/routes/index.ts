import { Router } from 'express';
import { createAnalyticsRouter } from './analytics.routes.js';
import { createAlertRouter } from './alert.routes.js';
import { createHealthRouter } from './health.routes.js';

export function createRoutes(): Router {
  const router = Router();
  router.use(createHealthRouter());
  router.use('/api/v1', createAnalyticsRouter());
  router.use('/api/v1', createAlertRouter());
  return router;
}
