process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-at-least-32-chars!!';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-at-least-32-chars!';
process.env.LOG_LEVEL = 'error';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import express, { Express } from 'express';
import { authorize } from '../src/middleware/authorize.js';
import { UserRole } from '@api-gateway/shared';

describe('RBAC Integration Tests', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Mock context middleware
    app.use((req, res, next) => {
      // Will be set by test
      next();
    });

    // Protected routes
    app.get('/admin-only', authorize(UserRole.ADMIN), (req, res) => {
      res.json({ message: 'Admin access granted' });
    });

    app.get('/developer-or-above', authorize(UserRole.DEVELOPER), (req, res) => {
      res.json({ message: 'Developer+ access granted' });
    });

    app.get('/viewer-or-above', authorize(UserRole.VIEWER), (req, res) => {
      res.json({ message: 'Viewer+ access granted' });
    });

    app.post('/modify-resource', authorize(UserRole.DEVELOPER), (req, res) => {
      res.json({ message: 'Resource modified' });
    });

    app.get('/multi-role', authorize([UserRole.ADMIN, UserRole.VIEWER]), (req, res) => {
      res.json({ message: 'Multi-role access granted' });
    });

    // Error handler
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err.statusCode === 403) {
        return res.status(403).json({ error: 'FORBIDDEN', message: err.message });
      }
      if (err.statusCode === 401) {
        return res.status(401).json({ error: 'UNAUTHORIZED', message: err.message });
      }
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    });
  });

  describe('Admin Role Access', () => {
    it('ADMIN can access admin-only endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'admin-1',
            email: 'admin@example.com',
            role: UserRole.ADMIN,
          },
        };
        next();
      });

      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Admin access granted');
    });

    it('ADMIN can access developer-only endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'admin-1',
            email: 'admin@example.com',
            role: UserRole.ADMIN,
          },
        };
        next();
      });

      const res = await request(app).get('/developer-or-above');
      expect(res.status).toBe(200);
    });

    it('ADMIN can access viewer-only endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'admin-1',
            email: 'admin@example.com',
            role: UserRole.ADMIN,
          },
        };
        next();
      });

      const res = await request(app).get('/viewer-or-above');
      expect(res.status).toBe(200);
    });

    it('ADMIN can modify resources', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'admin-1',
            email: 'admin@example.com',
            role: UserRole.ADMIN,
          },
        };
        next();
      });

      const res = await request(app).post('/modify-resource');
      expect(res.status).toBe(200);
    });
  });

  describe('Developer Role Access', () => {
    it('DEVELOPER cannot access admin-only endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'dev-1',
            email: 'dev@example.com',
            role: UserRole.DEVELOPER,
          },
        };
        next();
      });

      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });

    it('DEVELOPER can access developer-only endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'dev-1',
            email: 'dev@example.com',
            role: UserRole.DEVELOPER,
          },
        };
        next();
      });

      const res = await request(app).get('/developer-or-above');
      expect(res.status).toBe(200);
    });

    it('DEVELOPER can access viewer-only endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'dev-1',
            email: 'dev@example.com',
            role: UserRole.DEVELOPER,
          },
        };
        next();
      });

      const res = await request(app).get('/viewer-or-above');
      expect(res.status).toBe(200);
    });

    it('DEVELOPER can modify resources', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'dev-1',
            email: 'dev@example.com',
            role: UserRole.DEVELOPER,
          },
        };
        next();
      });

      const res = await request(app).post('/modify-resource');
      expect(res.status).toBe(200);
    });
  });

  describe('Viewer Role Access', () => {
    it('VIEWER cannot access admin-only endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'viewer-1',
            email: 'viewer@example.com',
            role: UserRole.VIEWER,
          },
        };
        next();
      });

      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(403);
    });

    it('VIEWER cannot access developer-only endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'viewer-1',
            email: 'viewer@example.com',
            role: UserRole.VIEWER,
          },
        };
        next();
      });

      const res = await request(app).get('/developer-or-above');
      expect(res.status).toBe(403);
    });

    it('VIEWER can access viewer-only endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'viewer-1',
            email: 'viewer@example.com',
            role: UserRole.VIEWER,
          },
        };
        next();
      });

      const res = await request(app).get('/viewer-or-above');
      expect(res.status).toBe(200);
    });

    it('VIEWER cannot modify resources', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'viewer-1',
            email: 'viewer@example.com',
            role: UserRole.VIEWER,
          },
        };
        next();
      });

      const res = await request(app).post('/modify-resource');
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  describe('Multi-Role Authorization', () => {
    it('ADMIN can access multi-role endpoint', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'admin-1',
            email: 'admin@example.com',
            role: UserRole.ADMIN,
          },
        };
        next();
      });

      const res = await request(app).get('/multi-role');
      expect(res.status).toBe(200);
    });

    it('VIEWER can access multi-role endpoint if specified', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'viewer-1',
            email: 'viewer@example.com',
            role: UserRole.VIEWER,
          },
        };
        next();
      });

      const res = await request(app).get('/multi-role');
      expect(res.status).toBe(200);
    });

    it('DEVELOPER cannot access multi-role endpoint if not specified', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'dev-1',
            email: 'dev@example.com',
            role: UserRole.DEVELOPER,
          },
        };
        next();
      });

      const res = await request(app).get('/multi-role');
      expect(res.status).toBe(403);
    });
  });

  describe('Missing/Invalid Context', () => {
    it('returns 401 if no context', async () => {
      app.use((req, res, next) => {
        // No context set
        next();
      });

      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('returns 401 if no user in context', async () => {
      app.use((req, res, next) => {
        req.context = {}; // No user
        next();
      });

      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(401);
    });

    it('returns 401 if user has no role', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'user-1',
            email: 'user@example.com',
            // No role
          },
        };
        next();
      });

      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(401);
    });
  });

  describe('Role Hierarchy Enforcement', () => {
    it('enforces ADMIN > DEVELOPER > VIEWER hierarchy', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'user-1',
            email: 'test@example.com',
            role: UserRole.ADMIN,
          },
        };
        next();
      });

      // ADMIN passes all levels
      expect((await request(app).get('/admin-only')).status).toBe(200);
      expect((await request(app).get('/developer-or-above')).status).toBe(200);
      expect((await request(app).get('/viewer-or-above')).status).toBe(200);
    });

    it('DEVELOPER cannot elevate to ADMIN', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'dev-1',
            email: 'dev@example.com',
            role: UserRole.DEVELOPER,
          },
        };
        next();
      });

      const res = await request(app).get('/admin-only');
      expect(res.status).toBe(403);
    });

    it('VIEWER cannot elevate to DEVELOPER or ADMIN', async () => {
      app.use((req, res, next) => {
        req.context = {
          user: {
            userId: 'viewer-1',
            email: 'viewer@example.com',
            role: UserRole.VIEWER,
          },
        };
        next();
      });

      expect((await request(app).get('/admin-only')).status).toBe(403);
      expect((await request(app).get('/developer-or-above')).status).toBe(403);
      expect((await request(app).get('/viewer-or-above')).status).toBe(200);
    });
  });
});
