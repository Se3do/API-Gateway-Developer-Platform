import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { httpRequest } from '../services/http-client.js';

const router = Router();

interface ServiceHealth {
  name: string;
  status: 'ok' | 'error';
  latency?: number;
  error?: string;
}

router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const targets = [
      { name: 'auth-service', url: `${config.services.auth}/health` },
      { name: 'project-service', url: `${config.services.project}/health` },
      { name: 'analytics-service', url: `${config.services.analytics}/health` },
      { name: 'logging-service', url: `${config.services.logging}/health` },
    ];

    const checks = targets.map(async (t) => {
      const start = Date.now();
      try {
        const r = await httpRequest(t.url);
        return { name: t.name, status: r.statusCode < 500 ? ('ok' as const) : ('error' as const), latency: Date.now() - start };
      } catch (err: any) {
        return { name: t.name, status: 'error' as const, error: err?.message || 'Unreachable' };
      }
    });

    const services: ServiceHealth[] = await Promise.all(checks);

    const allOk = services.every((s) => s.status === 'ok');

    res.json({
      status: allOk ? 'ok' : 'degraded',
      service: 'gateway',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
