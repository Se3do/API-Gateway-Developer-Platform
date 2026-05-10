process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-at-least-32-chars!!';
process.env.GATEWAY_PORT = '3000';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.AUTH_SERVICE_URL = 'http://localhost:4001';
process.env.PROJECT_SERVICE_URL = 'http://localhost:4002';
process.env.ANALYTICS_SERVICE_URL = 'http://localhost:4003';
process.env.LOGGING_SERVICE_URL = 'http://localhost:4004';

import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  multi: jest.fn(() => ({
    zremrangebyscore: jest.fn().mockReturnThis(),
    zcard: jest.fn().mockReturnThis(),
    zadd: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([[null, 0], [null, 0], [null, 1], [null, 1]]),
  })),
  quit: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn(() => mockRedis);
});

jest.mock('../src/services/http-client.js', () => ({
  httpRequest: jest.fn().mockResolvedValue({ statusCode: 200, body: [] }),
}));

jest.mock('../src/middleware/route-config.js', () => ({
  routeConfigResolver: (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../src/services/route-config.service.js', () => ({
  loadRouteConfigs: jest.fn().mockResolvedValue(undefined),
  getRouteConfig: jest.fn().mockReturnValue(undefined),
  isLoaded: jest.fn().mockReturnValue(true),
}));

jest.mock('../src/proxy/forwarder.js', () => ({
  createForwarder: () => (_req: any, _res: any, next: any) => next(),
}));

import { createApp } from '../src/app.js';

describe('Gateway', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp();
  });

  describe('GET /health', () => {
    it('returns health status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('gateway');
    });
  });

  describe('authenticator middleware (public paths)', () => {
    it('allows unauthenticated access to /health', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    });

    it('blocks unauthenticated access to protected routes', async () => {
      mockRedis.multi = jest.fn(() => ({
        zremrangebyscore: jest.fn().mockReturnThis(),
        zcard: jest.fn().mockReturnThis(),
        zadd: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 0], [null, 0], [null, 1], [null, 1]]),
      }));

      const res = await request(app).get('/api/v1/projects');
      expect(res.status).toBe(401);
    });

    it('accepts valid JWT on protected routes', async () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'test@example.com', role: 'DEVELOPER' },
        process.env.ACCESS_TOKEN_SECRET!,
      );

      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('rejects expired JWT', async () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'test@example.com', role: 'DEVELOPER' },
        process.env.ACCESS_TOKEN_SECRET!,
        { expiresIn: '0s' },
      );

      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    it('rejects malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', 'Invalid');

      expect(res.status).toBe(401);
    });
  });

  describe('error handler', () => {
    it('returns 404 for unknown routes not caught by forwarder', async () => {
      const token = jwt.sign(
        { userId: 'user-1', email: 'test@example.com', role: 'DEVELOPER' },
        process.env.ACCESS_TOKEN_SECRET!,
      );

      const res = await request(app)
        .get('/nonexistent-route')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });
});
