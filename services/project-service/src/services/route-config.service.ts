import { PrismaClient } from '@prisma/client';
import { NotFoundError, ConflictError } from '@api-gateway/shared';

export function createRouteConfigService(prisma: PrismaClient) {
  async function create(data: {
    path: string;
    method: string;
    service: string;
    projectId: string;
    rateLimit?: number;
    cacheTTL?: number;
    authRequired?: boolean;
  }) {
    const existing = await prisma.routeConfig.findUnique({
      where: { projectId_path_method: { projectId: data.projectId, path: data.path, method: data.method } },
    });
    if (existing) throw new ConflictError('Route config already exists for this project, path, and method');

    return prisma.routeConfig.create({
      data: {
        path: data.path,
        method: data.method,
        service: data.service,
        projectId: data.projectId,
        rateLimit: data.rateLimit,
        cacheTTL: data.cacheTTL,
        authRequired: data.authRequired ?? true,
      },
    });
  }

  async function listByProject(projectId: string, userId: string) {
    await ensureProjectAccess(prisma, projectId, userId);
    return prisma.routeConfig.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async function getById(id: string, userId: string) {
    const route = await prisma.routeConfig.findUnique({ where: { id } });
    if (!route) throw new NotFoundError('Route config not found');
    await ensureProjectAccess(prisma, route.projectId, userId);
    return route;
  }

  async function update(id: string, userId: string, data: {
    path?: string;
    method?: string;
    service?: string;
    rateLimit?: number | null;
    cacheTTL?: number | null;
    authRequired?: boolean;
    active?: boolean;
  }) {
    const existing = await prisma.routeConfig.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Route config not found');
    await ensureProjectAccess(prisma, existing.projectId, userId);

    return prisma.routeConfig.update({
      where: { id },
      data,
    });
  }

  async function remove(id: string, userId: string) {
    const route = await prisma.routeConfig.findUnique({ where: { id } });
    if (!route) throw new NotFoundError('Route config not found');
    await ensureProjectAccess(prisma, route.projectId, userId);
    await prisma.routeConfig.delete({ where: { id } });
    return { message: 'Route config deleted' };
  }

  async function getAllActive() {
    return prisma.routeConfig.findMany({
      where: { active: true },
      select: {
        path: true,
        method: true,
        service: true,
        rateLimit: true,
        cacheTTL: true,
        authRequired: true,
      },
    });
  }

  return { create, listByProject, getById, update, remove, getAllActive };
}

async function ensureProjectAccess(prisma: PrismaClient, projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new NotFoundError('Project not found');
}
