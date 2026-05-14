import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createRouteConfigController } from '../controllers/route-config.controller.js';
import { authenticate } from '../middleware/guards.js';
import { authorize, UserRole } from '@api-gateway/shared';

export function createRouteConfigRouter(prisma: PrismaClient): Router {
  const router = Router();
  const ctrl = createRouteConfigController(prisma);

  // Route config endpoints - writes require DEVELOPER+, reads require VIEWER+
  router.post('/projects/:projectId/routes', authenticate, authorize(UserRole.DEVELOPER), ctrl.create);
  router.get('/projects/:projectId/routes', authenticate, authorize(UserRole.VIEWER), ctrl.list);
  router.get('/routes/:id', authenticate, authorize(UserRole.VIEWER), ctrl.getById);
  router.patch('/routes/:id', authenticate, authorize(UserRole.DEVELOPER), ctrl.update);
  router.delete('/routes/:id', authenticate, authorize(UserRole.DEVELOPER), ctrl.remove);
  router.get('/routes', ctrl.getAllActive); // Public, used by gateway on startup

  return router;
}
