import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createProjectController } from '../controllers/project.controller.js';
import { authenticate } from '../middleware/guards.js';
import { authorize } from '@api-gateway/shared';
import { UserRole } from '@api-gateway/shared';

export function createProjectRouter(prisma: PrismaClient): Router {
  const router = Router();
  const ctrl = createProjectController(prisma);

  // Project endpoints - writes require DEVELOPER+, reads require VIEWER+
  router.post('/projects', authenticate, authorize(UserRole.DEVELOPER), ctrl.project.create);
  router.get('/projects', authenticate, authorize(UserRole.VIEWER), ctrl.project.list);
  router.get('/projects/:id', authenticate, authorize(UserRole.VIEWER), ctrl.project.getById);
  router.patch('/projects/:id', authenticate, authorize(UserRole.DEVELOPER), ctrl.project.update);
  router.put('/projects/:id', authenticate, authorize(UserRole.DEVELOPER), ctrl.project.update);
  router.delete('/projects/:id', authenticate, authorize(UserRole.DEVELOPER), ctrl.project.remove);

  // API Key endpoints - writes require DEVELOPER+, reads require VIEWER+
  router.post('/projects/:projectId/keys', authenticate, authorize(UserRole.DEVELOPER), ctrl.apiKey.create);
  router.get('/projects/:projectId/keys', authenticate, authorize(UserRole.VIEWER), ctrl.apiKey.list);
  router.delete('/keys/:id', authenticate, authorize(UserRole.DEVELOPER), ctrl.apiKey.revoke);
  router.get('/keys/verify', ctrl.apiKey.verify); // Public, no auth

  return router;
}
