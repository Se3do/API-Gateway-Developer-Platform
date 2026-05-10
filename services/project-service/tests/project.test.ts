process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-at-least-32-chars!!';
process.env.PROJECT_PORT = '4002';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const mockProject = {
  id: 'proj-1',
  name: 'Test Project',
  description: 'A test project',
  userId: 'user-1',
  active: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockApiKey = {
  id: 'key-1',
  keyHash: 'abcdef123456',
  prefix: 'gw_abc...',
  name: 'Test Key',
  projectId: 'proj-1',
  userId: 'user-1',
  active: true,
  lastUsedAt: null,
  expiresAt: null,
  createdAt: new Date('2025-01-01'),
  revokedAt: null,
};

const mockRouteConfig = {
  id: 'rc-1',
  path: '/api/v1/test',
  method: 'GET',
  service: 'auth-service',
  projectId: 'proj-1',
  rateLimit: 100,
  cacheTTL: 60,
  authRequired: true,
  active: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockPrisma = {
  project: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  apiKey: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  routeConfig: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const token = jwt.sign({ userId: 'user-1', email: 'test@example.com', role: 'DEVELOPER' }, process.env.ACCESS_TOKEN_SECRET!);

describe('Project Service', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp(mockPrisma as any);
  });

  describe('Project CRUD', () => {
    it('creates a project', async () => {
      mockPrisma.project.create.mockResolvedValue(mockProject);

      const res = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Project', description: 'A test project' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Project');
    });

    it('lists projects', async () => {
      mockPrisma.project.findMany.mockResolvedValue([mockProject]);
      mockPrisma.project.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.projects).toHaveLength(1);
    });

    it('gets a project by id', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);

      const res = await request(app)
        .get('/api/v1/projects/proj-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('proj-1');
    });

    it('returns 404 for non-existent project', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/v1/projects/nonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('updates a project', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.project.update.mockResolvedValue({ ...mockProject, name: 'Updated' });

      const res = await request(app)
        .patch('/api/v1/projects/proj-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(200);
    });

    it('deletes a project', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.project.delete.mockResolvedValue(mockProject);

      const res = await request(app)
        .delete('/api/v1/projects/proj-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });
  });

  describe('API Key management', () => {
    it('creates an API key', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.apiKey.create.mockResolvedValue(mockApiKey);

      const res = await request(app)
        .post('/api/v1/projects/proj-1/keys')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Key' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('rawKey');
      expect(res.body).toHaveProperty('prefix');
    });

    it('lists API keys for a project', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.apiKey.findMany.mockResolvedValue([mockApiKey]);

      const res = await request(app)
        .get('/api/v1/projects/proj-1/keys')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('revokes an API key', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(mockApiKey);
      mockPrisma.apiKey.update.mockResolvedValue({ ...mockApiKey, active: false, revokedAt: new Date() });

      const res = await request(app)
        .delete('/api/v1/keys/key-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it('verifies a valid API key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey);
      mockPrisma.apiKey.update.mockResolvedValue(mockApiKey);

      const res = await request(app).get('/api/v1/keys/verify?hash=abcdef123456');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
    });

    it('rejects an unknown API key', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);

      const res = await request(app).get('/api/v1/keys/verify?hash=unknown');

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });
  });

  describe('Route Config management', () => {
    it('creates a route config', async () => {
      mockPrisma.routeConfig.findUnique.mockResolvedValue(null);
      mockPrisma.routeConfig.create.mockResolvedValue(mockRouteConfig);

      const res = await request(app)
        .post('/api/v1/projects/proj-1/routes')
        .set('Authorization', `Bearer ${token}`)
        .send({ path: '/api/v1/test', method: 'GET', service: 'auth-service' });

      expect(res.status).toBe(201);
    });

    it('lists route configs for a project', async () => {
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.routeConfig.findMany.mockResolvedValue([mockRouteConfig]);

      const res = await request(app)
        .get('/api/v1/projects/proj-1/routes')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('returns all active route configs (unauthenticated)', async () => {
      mockPrisma.routeConfig.findMany.mockResolvedValue([mockRouteConfig]);

      const res = await request(app).get('/api/v1/routes');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });
});
