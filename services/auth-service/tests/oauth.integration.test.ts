process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-at-least-32-chars!!';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-at-least-32-chars!';
process.env.AUTH_PORT = '4001';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.GOOGLE_CLIENT_ID = 'test-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/v1/oauth/google/callback';
process.env.GITHUB_CLIENT_ID = 'test-github-id';
process.env.GITHUB_CLIENT_SECRET = 'test-github-secret';
process.env.GITHUB_REDIRECT_URI = 'http://localhost:3000/api/v1/oauth/github/callback';

import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { createApp } from '../src/app.js';

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
  },
  $disconnect: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

const mockUser = {
  id: 'user-oauth-1',
  email: 'oauth@example.com',
  name: 'OAuth User',
  role: 'DEVELOPER',
  active: true,
  createdAt: new Date('2025-01-01'),
};

describe('OAuth Integration Tests', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    jest.clearAllMocks();
    app = createApp(mockPrisma as any);
  });

  describe('GET /api/v1/oauth/initiate/:provider', () => {
    it('returns Google authorization URL for Google provider', async () => {
      const res = await request(app).get('/api/v1/oauth/initiate/google');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('authorizationUrl');
      expect(res.body).toHaveProperty('state');
      expect(res.body.authorizationUrl).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(res.body.authorizationUrl).toContain('client_id=test-google-id');
      expect(res.body.state).toBeTruthy();
    });

    it('returns GitHub authorization URL for GitHub provider', async () => {
      const res = await request(app).get('/api/v1/oauth/initiate/github');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('authorizationUrl');
      expect(res.body).toHaveProperty('state');
      expect(res.body.authorizationUrl).toContain('https://github.com/login/oauth/authorize');
      expect(res.body.authorizationUrl).toContain('client_id=test-github-id');
    });

    it('returns 400 for unsupported provider', async () => {
      const res = await request(app).get('/api/v1/oauth/initiate/unsupported');

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/oauth/:provider/callback', () => {
    it('creates new Google OAuth user on first login', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'google-access-token',
          id_token: 'google-id-token',
          expires_in: 3600,
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          email: 'newuser@example.com',
          name: 'New User',
        },
      });

      // First get authorization URL to capture state
      const initRes = await request(app).get('/api/v1/oauth/initiate/google');
      const state = initRes.body.state;

      // Mock user creation
      mockPrisma.user.findFirst.mockResolvedValueOnce(null); // No existing oauth user
      mockPrisma.user.findUnique.mockResolvedValueOnce(null); // No existing email user
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'new-user-1',
        email: 'newuser@example.com',
        name: 'New User',
        role: 'DEVELOPER',
        active: true,
        createdAt: new Date(),
      });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      const res = await request(app)
        .get('/api/v1/oauth/google/callback')
        .query({ code: 'auth-code', state });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe('newuser@example.com');

      // Verify JWT is valid
      const decoded = jwt.verify(res.body.accessToken, process.env.ACCESS_TOKEN_SECRET!);
      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('email');
      expect(decoded).toHaveProperty('role');
    });

    it('logs in existing OAuth user', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'google-access-token',
          expires_in: 3600,
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          email: 'existing@example.com',
          name: 'Existing User',
        },
      });

      const initRes = await request(app).get('/api/v1/oauth/initiate/google');
      const state = initRes.body.state;

      // Mock existing user
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      const res = await request(app)
        .get('/api/v1/oauth/google/callback')
        .query({ code: 'auth-code', state });

      expect(res.status).toBe(200);
      expect(res.body.user.id).toBe(mockUser.id);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });

    it('links OAuth to existing password-based user', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'google-access-token',
          expires_in: 3600,
        },
      });

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'google-user-123',
          email: 'existing@example.com',
          name: 'Existing User',
        },
      });

      const initRes = await request(app).get('/api/v1/oauth/initiate/google');
      const state = initRes.body.state;

      // Mock: no OAuth user found, but email user exists
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-existing',
        email: 'existing@example.com',
        name: 'Existing User',
        role: 'DEVELOPER',
        active: true,
      });
      mockPrisma.user.update.mockResolvedValueOnce({
        id: 'user-existing',
        email: 'existing@example.com',
        name: 'Existing User',
        role: 'DEVELOPER',
        active: true,
      });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      const res = await request(app)
        .get('/api/v1/oauth/google/callback')
        .query({ code: 'auth-code', state });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('existing@example.com');
    });

    it('returns 400 for missing code', async () => {
      const initRes = await request(app).get('/api/v1/oauth/initiate/google');
      const state = initRes.body.state;

      const res = await request(app)
        .get('/api/v1/oauth/google/callback')
        .query({ state });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
    });

    it('returns 400 for missing state', async () => {
      const res = await request(app)
        .get('/api/v1/oauth/google/callback')
        .query({ code: 'auth-code' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid/expired state', async () => {
      const res = await request(app)
        .get('/api/v1/oauth/google/callback')
        .query({ code: 'auth-code', state: 'invalid-state' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
    });

    it('returns 401 for failed token exchange', async () => {
      const initRes = await request(app).get('/api/v1/oauth/initiate/google');
      const state = initRes.body.state;

      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 400 },
      });

      const res = await request(app)
        .get('/api/v1/oauth/google/callback')
        .query({ code: 'invalid-code', state });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('UNAUTHORIZED');
    });

    it('GitHub: fetches email when not in user info response', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          access_token: 'github-access-token',
          expires_in: 3600,
        },
      });

      // First call: user info without email
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 12345,
          login: 'githubuser',
          name: 'GitHub User',
          email: null,
        },
      });

      // Second call: fetch emails
      mockedAxios.get.mockResolvedValueOnce({
        data: [
          { email: 'old@example.com', primary: false },
          { email: 'current@example.com', primary: true },
        ],
      });

      const initRes = await request(app).get('/api/v1/oauth/initiate/github');
      const state = initRes.body.state;

      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'github-user-1',
        email: 'current@example.com',
        name: 'GitHub User',
        role: 'DEVELOPER',
        active: true,
        createdAt: new Date(),
      });
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      const res = await request(app)
        .get('/api/v1/oauth/github/callback')
        .query({ code: 'gh-code', state });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('current@example.com');
    });
  });

  describe('State Token Security', () => {
    it('rejects state token after first use', async () => {
      const initRes = await request(app).get('/api/v1/oauth/initiate/google');
      const state = initRes.body.state;

      mockedAxios.post.mockResolvedValueOnce({
        data: { access_token: 'token', expires_in: 3600 },
      });
      mockedAxios.get.mockResolvedValueOnce({
        data: { sub: 'user1', email: 'user@example.com', name: 'User' },
      });

      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValueOnce({});

      // First use succeeds
      const res1 = await request(app)
        .get('/api/v1/oauth/google/callback')
        .query({ code: 'code', state });

      expect(res1.status).toBe(200);

      // Second use with same state fails
      const res2 = await request(app)
        .get('/api/v1/oauth/google/callback')
        .query({ code: 'code', state });

      expect(res2.status).toBe(400);
    });
  });
});
