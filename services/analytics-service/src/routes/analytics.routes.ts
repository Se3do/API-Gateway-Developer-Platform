import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller.js';
import { authorize, UserRole } from '@api-gateway/shared';

export function createAnalyticsRouter(): Router {
  const router = Router();

  // All analytics endpoints require VIEWER+ (read-only)
  router.get('/analytics/summary', authorize(UserRole.VIEWER), analyticsController.getSummary);
  router.get('/analytics/requests-over-time', authorize(UserRole.VIEWER), analyticsController.getRequestsOverTime);
  router.get('/analytics/error-rate', authorize(UserRole.VIEWER), analyticsController.getErrorRate);
  router.get('/analytics/latency', authorize(UserRole.VIEWER), analyticsController.getLatency);
  router.get('/analytics/top-endpoints', authorize(UserRole.VIEWER), analyticsController.getTopEndpoints);
  router.get('/analytics/top-users', authorize(UserRole.VIEWER), analyticsController.getTopUsers);
  router.get('/analytics/api-key-usage', authorize(UserRole.VIEWER), analyticsController.getApiKeyUsage);

  return router;
}
