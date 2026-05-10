import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createProjectController } from '../controllers/project.controller.js';
import { authenticate } from '../middleware/guards.js';

export function createProjectRouter(prisma: PrismaClient): Router {
  const router = Router();
  const ctrl = createProjectController(prisma);

  router.post('/projects', authenticate, ctrl.project.create);
  router.get('/projects', authenticate, ctrl.project.list);
  router.get('/projects/:id', authenticate, ctrl.project.getById);
  router.patch('/projects/:id', authenticate, ctrl.project.update);
  router.put('/projects/:id', authenticate, ctrl.project.update);
  router.delete('/projects/:id', authenticate, ctrl.project.remove);

  router.post('/projects/:projectId/keys', authenticate, ctrl.apiKey.create);
  router.get('/projects/:projectId/keys', authenticate, ctrl.apiKey.list);
  router.delete('/keys/:id', authenticate, ctrl.apiKey.revoke);
  router.get('/keys/verify', ctrl.apiKey.verify);

  return router;
}
