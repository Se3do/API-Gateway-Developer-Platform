import { Router } from 'express';
import { logsController } from '../controllers/logs.controller.js';
import { authorize, UserRole } from '@api-gateway/shared';
import { authenticate } from '../middleware/authenticate.js';

export function createLogsRouter(): Router {
  const router = Router();

  // Log ingestion - public (called by gateway)
  router.post('/logs', logsController.ingest);
  router.post('/logs/batch', logsController.ingestBatch);

  // Log queries - require VIEWER+
  router.get('/logs', authenticate, authorize(UserRole.VIEWER), logsController.query);
  router.get('/logs/errors', authenticate, authorize(UserRole.VIEWER), logsController.getErrors);
  router.get('/logs/:requestId', authenticate, authorize(UserRole.VIEWER), logsController.getByRequestId);

  return router;
}
