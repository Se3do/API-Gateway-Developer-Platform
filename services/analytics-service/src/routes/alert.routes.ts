import { Router } from 'express';
import { alertController } from '../controllers/alert.controller.js';

export function createAlertRouter(): Router {
  const router = Router();

  router.post('/alerts/rules', alertController.createRule);
  router.get('/alerts/rules', alertController.listRules);
  router.get('/alerts/rules/:id', alertController.getRule);
  router.put('/alerts/rules/:id', alertController.updateRule);
  router.delete('/alerts/rules/:id', alertController.deleteRule);
  router.get('/alerts/events', alertController.listEvents);
  router.put('/alerts/events/:id/acknowledge', alertController.acknowledgeEvent);

  return router;
}
