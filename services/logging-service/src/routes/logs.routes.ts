import { Router } from 'express';
import { logsController } from '../controllers/logs.controller.js';

export function createLogsRouter(): Router {
  const router = Router();

  router.post('/logs', logsController.ingest);
  router.post('/logs/batch', logsController.ingestBatch);
  router.get('/logs', logsController.query);
  router.get('/logs/errors', logsController.getErrors);
  router.get('/logs/:requestId', logsController.getByRequestId);

  return router;
}
