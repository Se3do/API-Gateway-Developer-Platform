import { Router } from 'express';
import { createLogsRouter } from './logs.routes.js';

export function createRoutes(): Router {
  const router = Router();

  router.use('/api/v1', createLogsRouter());

  return router;
}
