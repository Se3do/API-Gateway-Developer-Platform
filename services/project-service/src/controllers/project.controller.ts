import { PrismaClient } from '@prisma/client';
import { createProjectService, createApiKeyService } from '../services/project.service.js';

export function createProjectController(prisma: PrismaClient) {
  const projectService = createProjectService(prisma);
  const apiKeyService = createApiKeyService(prisma);

  return {
    project: {
      create: async (req: any, res: any, next: any) => {
        try {
          const data = await req.body;
          const result = await projectService.create({ ...data, userId: req.context.user!.userId });
          res.status(201).json(result);
        } catch (err) { next(err); }
      },
      list: async (req: any, res: any, next: any) => {
        try {
          const page = parseInt(req.query.page as string) || 1;
          const limit = parseInt(req.query.limit as string) || 20;
          const sort = (req.query.sort as string) || 'createdAt';
          const order = (req.query.order as string) || 'desc';
          const result = await projectService.list(req.context.user!.userId, page, limit, sort, order);
          res.json(result);
        } catch (err) { next(err); }
      },
      getById: async (req: any, res: any, next: any) => {
        try {
          const result = await projectService.getById(req.params.id, req.context.user!.userId);
          res.json(result);
        } catch (err) { next(err); }
      },
      update: async (req: any, res: any, next: any) => {
        try {
          const result = await projectService.update(req.params.id, req.context.user!.userId, req.body);
          res.json(result);
        } catch (err) { next(err); }
      },
      remove: async (req: any, res: any, next: any) => {
        try {
          const result = await projectService.remove(req.params.id, req.context.user!.userId);
          res.json(result);
        } catch (err) { next(err); }
      },
    },
    apiKey: {
      create: async (req: any, res: any, next: any) => {
        try {
          const result = await apiKeyService.create({
            ...req.body,
            projectId: req.params.projectId,
            userId: req.context.user!.userId,
          });
          res.status(201).json(result);
        } catch (err) { next(err); }
      },
      list: async (req: any, res: any, next: any) => {
        try {
          const result = await apiKeyService.listByProject(req.params.projectId, req.context.user!.userId);
          res.json(result);
        } catch (err) { next(err); }
      },
      revoke: async (req: any, res: any, next: any) => {
        try {
          await apiKeyService.revoke(req.params.id, req.context.user!.userId);
          res.json({ message: 'API key revoked' });
        } catch (err) { next(err); }
      },
      verify: async (req: any, res: any, next: any) => {
        try {
          const result = await apiKeyService.verify(req.query.hash);
          res.json(result);
        } catch (err) { next(err); }
      },
    },
  };
}
