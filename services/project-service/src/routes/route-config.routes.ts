import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createRouteConfigController } from '../controllers/route-config.controller.js';
import { authenticate } from '../middleware/guards.js';

export function createRouteConfigRouter(prisma: PrismaClient): Router {
  const router = Router();
  const ctrl = createRouteConfigController(prisma);

  router.post('/projects/:projectId/routes', authenticate, ctrl.create);
  router.get('/projects/:projectId/routes', authenticate, ctrl.list);
  router.get('/routes/:id', authenticate, ctrl.getById);
  router.patch('/routes/:id', authenticate, ctrl.update);
  router.delete('/routes/:id', authenticate, ctrl.remove);
  router.get('/routes', ctrl.getAllActive);

  return router;
}
