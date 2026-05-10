import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createProjectRouter } from './project.routes.js';
import { createRouteConfigRouter } from './route-config.routes.js';

export function createRoutes(prisma: PrismaClient): Router {
  const router = Router();

  router.use('/api/v1', createProjectRouter(prisma));
  router.use('/api/v1', createRouteConfigRouter(prisma));

  return router;
}
