import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';

export function createHealthRouter(): Router {
  const router = Router();
  router.get('/health', getHealth);
  return router;
}
