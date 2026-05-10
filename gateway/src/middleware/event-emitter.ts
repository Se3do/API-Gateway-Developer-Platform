import type { Namespace } from 'socket.io';
import { httpRequest } from '../services/http-client.js';
import { config } from '../config/index.js';

export function createEventEmitter(monitorNamespace: Namespace) {
  return (req: any, res: any, next: any) => {
    res.on('finish', () => {
      const latency = Date.now() - (req.context?.startTime || Date.now());
      const statusCode = res.statusCode;
      const method = req.method;
      const path = req.originalUrl;

      monitorNamespace.emit('request:complete', { method, path, status: statusCode, latency, userId: req.context?.user?.userId });

      if (statusCode >= 400) {
        monitorNamespace.emit('request:error', { method, path, statusCode, error: statusCode >= 500 ? 'Internal Error' : 'Client Error', userId: req.context?.user?.userId });
      }

      const logBody = {
        requestId: req.context?.requestId,
        method,
        path,
        statusCode,
        latency,
        ip: req.ip,
        userId: req.context?.user?.userId || null,
        apiKeyId: req.context?.apiKey?.id || null,
        userAgent: (req.headers['user-agent'] as string) || '',
        contentLength: parseInt(req.headers['content-length'] || '0', 10),
        error: statusCode >= 400 ? { code: statusCode >= 500 ? 'INTERNAL' : 'CLIENT_ERROR', message: res.statusMessage || '' } : null,
      };

      httpRequest(`${config.services.logging}/api/v1/logs`, 'POST', logBody).catch((err) => {
        console.warn('Failed to publish log:', (err as Error).message);
      });
    });

    next();
  };
}
