import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { httpRequest } from '../utils/http-client.js';
import { config } from '../config/index.js';

interface ServiceHealth {
  name: string;
  status: 'ok' | 'error';
  error?: string;
  latency?: number;
}

export async function getHealth(_req: Request, res: Response, next: NextFunction) {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'ok' : 'error';

    const services = await checkDownstreamServices();

    res.json({
      status: dbStatus === 'ok' && services.every((s) => s.status === 'ok') ? 'ok' : 'degraded',
      service: 'analytics-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      mongodb: dbStatus,
      downstream: services,
    });
  } catch (err) { next(err); }
}

async function checkDownstreamServices(): Promise<ServiceHealth[]> {
  const targets = [
    { name: 'gateway', url: `${config.gatewayUrl}/health` },
    { name: 'auth-service', url: `${config.authServiceUrl}/health` },
    { name: 'project-service', url: `${config.projectServiceUrl}/health` },
    { name: 'logging-service', url: `${config.loggingServiceUrl}/health` },
  ];

  const results = await Promise.allSettled(
    targets.map(async (t) => {
      const start = Date.now();
      const res = await httpRequest(t.url, 'GET');
      return { name: t.name, status: res.statusCode < 500 ? 'ok' as const : 'error' as const, latency: Date.now() - start };
    }),
  );

  return results.map((r) => {
    if (r.status === 'fulfilled') return r.value;
    return { name: 'unknown', status: 'error' as const, error: r.reason?.message || 'Unreachable' };
  });
}
