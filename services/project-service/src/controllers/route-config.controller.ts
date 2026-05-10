import { PrismaClient } from '@prisma/client';
import { createRouteConfigService } from '../services/route-config.service.js';

export function createRouteConfigController(prisma: PrismaClient) {
  const svc = createRouteConfigService(prisma);

  return {
    create: async (req: any, res: any, next: any) => {
      try {
        const result = await svc.create({ ...req.body, projectId: req.params.projectId });
        res.status(201).json(result);
      } catch (err) { next(err); }
    },
    list: async (req: any, res: any, next: any) => {
      try {
        const result = await svc.listByProject(req.params.projectId, req.context.user!.userId);
        res.json(result);
      } catch (err) { next(err); }
    },
    getById: async (req: any, res: any, next: any) => {
      try {
        const result = await svc.getById(req.params.id, req.context.user!.userId);
        res.json(result);
      } catch (err) { next(err); }
    },
    update: async (req: any, res: any, next: any) => {
      try {
        const result = await svc.update(req.params.id, req.context.user!.userId, req.body);
        res.json(result);
      } catch (err) { next(err); }
    },
    remove: async (req: any, res: any, next: any) => {
      try {
        await svc.remove(req.params.id, req.context.user!.userId);
        res.json({ message: 'Route config deleted' });
      } catch (err) { next(err); }
    },
    getAllActive: async (_req: any, res: any, next: any) => {
      try {
        const result = await svc.getAllActive();
        res.json(result);
      } catch (err) { next(err); }
    },
  };
}
