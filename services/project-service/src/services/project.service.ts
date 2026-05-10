import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '@api-gateway/shared';

const KEY_PREFIX = 'gw_';
const KEY_BYTES = 32;

export function createProjectService(prisma: PrismaClient) {
  async function create(data: { name: string; description?: string; userId: string }) {
    return prisma.project.create({
      data,
      select: { id: true, name: true, description: true, userId: true, active: true, createdAt: true, updatedAt: true },
    });
  }

  async function list(userId: string, page: number, limit: number, sort: string, order: string) {
    const skip = (page - 1) * limit;
    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where: { userId },
        select: { id: true, name: true, description: true, userId: true, active: true, createdAt: true, updatedAt: true },
        skip,
        take: limit,
        orderBy: { [sort]: order },
      }),
      prisma.project.count({ where: { userId } }),
    ]);

    return { projects, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async function getById(id: string, userId: string) {
    const project = await prisma.project.findFirst({
      where: { id, userId },
      select: { id: true, name: true, description: true, userId: true, active: true, createdAt: true, updatedAt: true },
    });

    if (!project) throw new NotFoundError('Project not found');
    return project;
  }

  async function update(id: string, userId: string, data: { name?: string; description?: string }) {
    await getById(id, userId);
    return prisma.project.update({
      where: { id },
      data,
      select: { id: true, name: true, description: true, userId: true, active: true, createdAt: true, updatedAt: true },
    });
  }

  async function remove(id: string, userId: string) {
    await getById(id, userId);
    await prisma.project.delete({ where: { id } });
    return { message: 'Project deleted' };
  }

  return { create, list, getById, update, remove };
}

export function createApiKeyService(prisma: PrismaClient) {
  function generateRawKey(): { raw: string; prefix: string; hash: string } {
    const raw = KEY_PREFIX + crypto.randomBytes(KEY_BYTES).toString('hex');
    const prefix = raw.substring(0, 10) + '...';
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return { raw, prefix, hash };
  }

  async function create(data: { name: string; projectId: string; userId: string; expiresInDays?: number }) {
    const project = await prisma.project.findFirst({
      where: { id: data.projectId, userId: data.userId },
    });
    if (!project) throw new NotFoundError('Project not found');

    const { raw, prefix, hash } = generateRawKey();
    const expiresAt = data.expiresInDays
      ? new Date(Date.now() + data.expiresInDays * 86400000)
      : null;

    await prisma.apiKey.create({
      data: {
        keyHash: hash,
        prefix,
        name: data.name,
        projectId: data.projectId,
        userId: data.userId,
        expiresAt,
      },
    });

    return { prefix, rawKey: raw, name: data.name };
  }

  async function listByProject(projectId: string, userId: string) {
    await ensureProjectAccess(prisma, projectId, userId);
    return prisma.apiKey.findMany({
      where: { projectId },
      select: { id: true, prefix: true, name: true, active: true, lastUsedAt: true, expiresAt: true, createdAt: true, revokedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async function revoke(id: string, userId: string) {
    const key = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!key) throw new NotFoundError('API key not found');

    return prisma.apiKey.update({
      where: { id },
      data: { active: false, revokedAt: new Date() },
    });
  }

  async function verify(keyHash: string) {
    const key = await prisma.apiKey.findUnique({ where: { keyHash } });
    if (!key) return { valid: false, reason: 'Key not found' };
    if (!key.active) return { valid: false, reason: 'Key revoked' };
    if (key.expiresAt && key.expiresAt < new Date()) return { valid: false, reason: 'Key expired' };

    await prisma.apiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return { valid: true, key: { id: key.id, projectId: key.projectId, userId: key.userId } };
  }

  return { create, listByProject, revoke, verify };
}

async function ensureProjectAccess(prisma: PrismaClient, projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
  if (!project) throw new NotFoundError('Project not found');
}
