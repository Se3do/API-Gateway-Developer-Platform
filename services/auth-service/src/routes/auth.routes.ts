import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/guards.js';

export function createAuthRouter(prisma: PrismaClient): Router {
  const router = Router();
  const controller = createAuthController(prisma);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', authenticate, controller.logout);
  router.get('/profile', authenticate, controller.getProfile);

  return router;
}
