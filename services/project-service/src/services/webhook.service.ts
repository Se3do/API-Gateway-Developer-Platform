import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '@api-gateway/shared';

export function createWebhookService(prisma: PrismaClient) {
  async function create(data: { name: string; url: string; secret: string; events: string[]; projectId: string; userId: string }) {
    return prisma.webhook.create({
      data,
      select: { id: true, name: true, url: true, events: true, active: true, projectId: true, userId: true, createdAt: true, updatedAt: true },
    });
  }

  async function listByProject(projectId: string, userId: string) {
    return prisma.webhook.findMany({
      where: { projectId, userId },
      select: { id: true, name: true, url: true, events: true, active: true, projectId: true, userId: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async function getById(id: string, userId: string) {
    const webhook = await prisma.webhook.findFirst({
      where: { id, userId },
      select: { id: true, name: true, url: true, events: true, active: true, projectId: true, userId: true, createdAt: true, updatedAt: true },
    });
    if (!webhook) throw new NotFoundError('Webhook not found');
    return webhook;
  }

  async function update(id: string, userId: string, data: { name?: string; url?: string; secret?: string; events?: string[]; active?: boolean }) {
    await getById(id, userId);
    return prisma.webhook.update({
      where: { id },
      data,
      select: { id: true, name: true, url: true, events: true, active: true, projectId: true, userId: true, createdAt: true, updatedAt: true },
    });
  }

  async function remove(id: string, userId: string) {
    await getById(id, userId);
    await prisma.webhook.delete({ where: { id } });
    return { message: 'Webhook deleted' };
  }

  function signPayload(secret: string, payload: string): string {
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  function deliver(url: string, secret: string, body: object): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body);
      const signature = signPayload(secret, payload);
      const parsed = new URL(url);
      const client = parsed.protocol === 'https:' ? https : http;

      const options = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'X-Signature': `sha256=${signature}`,
          'User-Agent': 'API-Gateway-Webhook/1.0',
        },
        timeout: 10000,
      };

      const req = client.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Webhook returned ${res.statusCode}: ${body.substring(0, 200)}`));
          }
        });
      });

      req.on('timeout', () => { req.destroy(); reject(new Error('Webhook request timed out')); });
      req.on('error', (err) => reject(err));
      req.write(payload);
      req.end();
    });
  }

  async function dispatch(event: string, data: Record<string, any>) {
    const webhooks = await prisma.webhook.findMany({
      where: { active: true, events: { has: event } },
    });

    const results = await Promise.allSettled(
      webhooks.map((wh) =>
        deliver(wh.url, wh.secret, {
          event,
          timestamp: new Date().toISOString(),
          data,
        }).then(() => ({ webhookId: wh.id, url: wh.url, success: true }))
          .catch((err) => ({ webhookId: wh.id, url: wh.url, success: false, error: err.message }))
      ),
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled' && (r.value as any).success).length;
    const failed = results.filter((r) => r.status === 'rejected' || !((r as any).value?.success)).length;

    return { dispatched: results.length, succeeded, failed };
  }

  return { create, listByProject, getById, update, remove, dispatch };
}
