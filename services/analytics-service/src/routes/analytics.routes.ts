import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';

export function createAnalyticsRouter(): Router {
  const router = Router();

  router.get('/analytics/summary', analyticsController.getSummary);
  router.get('/analytics/requests-over-time', analyticsController.getRequestsOverTime);
  router.get('/analytics/error-rate', analyticsController.getErrorRate);
  router.get('/analytics/latency', analyticsController.getLatency);
  router.get('/analytics/top-endpoints', analyticsController.getTopEndpoints);
  router.get('/analytics/top-users', analyticsController.getTopUsers);
  router.get('/analytics/api-key-usage', analyticsController.getApiKeyUsage);

  return router;
}
