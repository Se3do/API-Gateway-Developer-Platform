import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createWebhookController } from '../controllers/webhook.controller.js';
import { authenticate } from '../middleware/guards.js';
import { authorize, UserRole, BadRequestError } from '@api-gateway/shared';
import { config } from '../config/index.js';
import { z } from 'zod';

const dispatchSchema = z.object({
  event: z.string().min(1),
  data: z.record(z.any()),
});

export function createWebhookRouter(prisma: PrismaClient): Router {
  const router = Router();
  const ctrl = createWebhookController(prisma);

  // Internal dispatch endpoint - validated by shared secret (not user auth)
  router.post('/webhooks/dispatch', (req: any, res: any, next: any) => {
    const secret = req.headers['x-dispatch-secret'];
    if (!secret || secret !== config.webhook.dispatchSecret) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid dispatch secret' });
      return;
    }
    try {
      req.body = dispatchSchema.parse(req.body);
    } catch (err: any) {
      next(new BadRequestError(`Validation error: ${err.errors?.[0]?.message || 'Invalid payload'}`));
      return;
    }
    ctrl.dispatch(req, res, next);
  });

  // CRUD endpoints - standard user auth
  router.post('/projects/:projectId/webhooks', authenticate, authorize(UserRole.DEVELOPER), ctrl.create);
  router.get('/projects/:projectId/webhooks', authenticate, authorize(UserRole.VIEWER), ctrl.list);
  router.get('/webhooks/:id', authenticate, authorize(UserRole.VIEWER), ctrl.getById);
  router.put('/webhooks/:id', authenticate, authorize(UserRole.DEVELOPER), ctrl.update);
  router.delete('/webhooks/:id', authenticate, authorize(UserRole.DEVELOPER), ctrl.remove);

  return router;
}
