import { PrismaClient } from '@prisma/client';
import { createWebhookService } from '../services/webhook.service.js';

export function createWebhookController(prisma: PrismaClient) {
  const service = createWebhookService(prisma);

  return {
    create: async (req: any, res: any, next: any) => {
      try {
        const result = await service.create({
          ...req.body,
          projectId: req.params.projectId,
          userId: req.context.user!.userId,
        });
        res.status(201).json(result);
      } catch (err) { next(err); }
    },

    list: async (req: any, res: any, next: any) => {
      try {
        const result = await service.listByProject(req.params.projectId, req.context.user!.userId);
        res.json(result);
      } catch (err) { next(err); }
    },

    getById: async (req: any, res: any, next: any) => {
      try {
        const result = await service.getById(req.params.id, req.context.user!.userId);
        res.json(result);
      } catch (err) { next(err); }
    },

    update: async (req: any, res: any, next: any) => {
      try {
        const result = await service.update(req.params.id, req.context.user!.userId, req.body);
        res.json(result);
      } catch (err) { next(err); }
    },

    remove: async (req: any, res: any, next: any) => {
      try {
        const result = await service.remove(req.params.id, req.context.user!.userId);
        res.json(result);
      } catch (err) { next(err); }
    },

    dispatch: async (req: any, res: any, next: any) => {
      try {
        const result = await service.dispatch(req.body.event, req.body.data);
        res.json(result);
      } catch (err) { next(err); }
    },
  };
}
