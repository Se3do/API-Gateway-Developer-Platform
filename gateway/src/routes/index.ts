import { Router } from 'express';
import healthRouter from './health.js';
import { createAlertEmitRouter } from './alert-emit.js';

export function createRoutes(): Router {
  const router = Router();

  router.use(healthRouter);
  router.use(createAlertEmitRouter());

  return router;
}
