import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAuthRouter } from './auth.routes.js';

export function createRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.use('/api/v1/auth', createAuthRouter(prisma));

  return router;
}
