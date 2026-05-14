import { Router } from 'express';
import { alertController } from '../controllers/alert.controller.js';
import { authorize, UserRole } from '@api-gateway/shared';

export function createAlertRouter(): Router {
  const router = Router();

  // Alert rules - writes require DEVELOPER+, reads require VIEWER+
  router.post('/alerts/rules', authorize(UserRole.DEVELOPER), alertController.createRule);
  router.get('/alerts/rules', authorize(UserRole.VIEWER), alertController.listRules);
  router.get('/alerts/rules/:id', authorize(UserRole.VIEWER), alertController.getRule);
  router.put('/alerts/rules/:id', authorize(UserRole.DEVELOPER), alertController.updateRule);
  router.delete('/alerts/rules/:id', authorize(UserRole.DEVELOPER), alertController.deleteRule);

  // Alert events - reads require VIEWER+, acknowledge requires DEVELOPER+
  router.get('/alerts/events', authorize(UserRole.VIEWER), alertController.listEvents);
  router.put('/alerts/events/:id/acknowledge', authorize(UserRole.DEVELOPER), alertController.acknowledgeEvent);

  return router;
}
