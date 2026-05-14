import http from 'http';
import https from 'https';
import { URL } from 'url';
import { config } from '../config/index.js';

interface RouteEntry {
  method: string;
  pathPattern: string;
  targetUrl: string;
  authRequired: boolean;
}

const routeTable: RouteEntry[] = [
  { method: 'ALL', pathPattern: '/api/v1/auth', targetUrl: config.services.auth, authRequired: false },
  { method: 'ALL', pathPattern: '/api/v1/oauth', targetUrl: config.services.auth, authRequired: false },
  { method: 'ALL', pathPattern: '/api/v1/projects', targetUrl: config.services.project, authRequired: true },
  { method: 'ALL', pathPattern: '/api/v1/keys', targetUrl: config.services.project, authRequired: true },
  { method: 'ALL', pathPattern: '/api/v1/routes', targetUrl: config.services.project, authRequired: false },
  { method: 'ALL', pathPattern: '/api/v1/analytics', targetUrl: config.services.analytics, authRequired: true },
  { method: 'ALL', pathPattern: '/api/v1/logs', targetUrl: config.services.logging, authRequired: false },
  { method: 'ALL', pathPattern: '/api/v1/alerts', targetUrl: config.services.analytics, authRequired: true },
  { method: 'ALL', pathPattern: '/api/v1/events', targetUrl: config.services.analytics, authRequired: false },
];

function matchRoute(method: string, path: string): RouteEntry | null {
  for (const entry of routeTable) {
    if (entry.method !== 'ALL' && entry.method !== method) continue;
    if (path.startsWith(entry.pathPattern)) return entry;
  }
  return null;
}

export function createForwarder() {
  return (req: any, res: any, next: any) => {
    const route = matchRoute(req.method, req.path);
    if (!route) {
      return next();
    }

    const targetUrl = new URL(route.targetUrl);
    const path = req.originalUrl;

    const options: http.RequestOptions = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
      path,
      method: req.method,
      headers: {
        ...req.headers,
        'X-Forwarded-For': req.ip,
        'X-Forwarded-Host': req.hostname,
        'X-Request-Id': req.context?.requestId || '',
      },
    };

    if (options.headers) {
      delete (options.headers as Record<string, any>)['host'];
      delete (options.headers as Record<string, any>)['content-length'];
    }

    const proxyReq = (targetUrl.protocol === 'https:' ? https : http).request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err: Error) => {
      next(err);
    });

    if (req.body && Object.keys(req.body).length > 0) {
      proxyReq.write(JSON.stringify(req.body));
    }

    proxyReq.end();
  };
}
