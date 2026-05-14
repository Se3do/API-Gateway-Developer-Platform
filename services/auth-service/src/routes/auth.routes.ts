import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAuthController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/guards.js';
import { EmailService } from '../services/email.service.js';

export function createAuthRouter(prisma: PrismaClient, emailService?: EmailService): Router {
  const router = Router();
  const controller = createAuthController(prisma, emailService);

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', authenticate, controller.logout);
  router.get('/profile', authenticate, controller.getProfile);

  return router;
}
