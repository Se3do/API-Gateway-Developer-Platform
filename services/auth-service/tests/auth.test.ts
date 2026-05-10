process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-at-least-32-chars!!';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-at-least-32-chars!';
process.env.AUTH_PORT = '4001';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: '$2b$10$hashedpassword',
  role: 'DEVELOPER',
  active: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock('bcrypt');

const mockedBcrypt = jest.mocked(bcrypt);

describe('Auth Service', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp(mockPrisma as any);
  });

  describe('POST /api/v1/auth/register', () => {
    const validBody = { email: 'test@example.com', password: 'Password1', name: 'Test User' };

    it('registers a new user and returns tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockedBcrypt.hash.mockResolvedValue('$2b$10$hashed' as never);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const res = await request(app).post('/api/v1/auth/register').send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe('test@example.com');
    });

    it('returns 409 if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(app).post('/api/v1/auth/register').send(validBody);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('CONFLICT');
    });

    it('returns 400 on invalid email', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({ ...validBody, email: 'notanemail' });

      expect(res.status).toBe(400);
    });

    it('returns 400 on weak password', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({ ...validBody, password: 'short' });

      expect(res.status).toBe(400);
    });

    it('returns 400 on missing name', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({ email: 'a@b.com', password: 'Password1' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const validBody = { email: 'test@example.com', password: 'Password1' };

    it('logs in with valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const res = await request(app).post('/api/v1/auth/login').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('returns 401 on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      const res = await request(app).post('/api/v1/auth/login').send(validBody);

      expect(res.status).toBe(401);
    });

    it('returns 401 on non-existent user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const res = await request(app).post('/api/v1/auth/login').send(validBody);

      expect(res.status).toBe(401);
    });

    it('returns 403 on deactivated account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, active: false });
      mockedBcrypt.compare.mockResolvedValue(true as never);

      const res = await request(app).post('/api/v1/auth/login').send(validBody);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    const validBody = { refreshToken: 'raw-refresh-token' };
    const hashedToken = 'hashed-refresh-token';

    it('returns new tokens with valid refresh token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        token: hashedToken,
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 86400000),
        revoked: false,
      });
      mockPrisma.refreshToken.update.mockResolvedValue({});
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const res = await request(app).post('/api/v1/auth/refresh').send(validBody);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('returns 401 on revoked token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1', token: hashedToken, userId: 'user-1',
        expiresAt: new Date(Date.now() + 86400000), revoked: true,
      });

      const res = await request(app).post('/api/v1/auth/refresh').send(validBody);

      expect(res.status).toBe(401);
    });

    it('returns 401 on expired token', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1', token: hashedToken, userId: 'user-1',
        expiresAt: new Date(Date.now() - 86400000), revoked: false,
      });

      const res = await request(app).post('/api/v1/auth/refresh').send(validBody);

      expect(res.status).toBe(401);
    });

    it('returns 401 on missing token', async () => {
      const res = await request(app).post('/api/v1/auth/refresh').send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    const token = jwt.sign({ userId: 'user-1', email: 'test@example.com', role: 'DEVELOPER' }, process.env.ACCESS_TOKEN_SECRET!);

    it('logs out successfully', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .send({ refreshToken: 'raw-refresh-token' });

      expect(res.status).toBe(200);
    });

    it('returns 401 without auth header', async () => {
      const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken: 'raw-refresh-token' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/profile', () => {
    const token = jwt.sign({ userId: 'user-1', email: 'test@example.com', role: 'DEVELOPER' }, process.env.ACCESS_TOKEN_SECRET!);

    it('returns user profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const res = await request(app)
        .get('/api/v1/auth/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('test@example.com');
    });

    it('returns 401 without auth header', async () => {
      const res = await request(app).get('/api/v1/auth/profile');

      expect(res.status).toBe(401);
    });
  });
});
