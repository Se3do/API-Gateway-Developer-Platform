process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-at-least-32-chars!!';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-at-least-32-chars!';
process.env.AUTH_PORT = '4001';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.EMAIL_DRIVER = 'mock';

import request from 'supertest';
import { createApp } from '../src/app.js';
import { MockEmailService } from '../src/services/email.service.js';

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

describe('Email Integration Tests', () => {
  let app: ReturnType<typeof createApp>;
  let emailService: MockEmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    emailService = new MockEmailService();
    app = createApp(mockPrisma as any, emailService);
  });

  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Test User',
    password: 'hashedPassword123',
    role: 'DEVELOPER',
    active: true,
    emailVerifiedAt: null,
    verificationToken: null,
    verificationTokenExpiresAt: null,
    resetToken: null,
    resetTokenExpiresAt: null,
    createdAt: new Date(),
  };

  describe('POST /api/v1/auth/send-verification-email', () => {
    it('sends verification email with valid token', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        verificationToken: expect.any(String),
        verificationTokenExpiresAt: expect.any(Date),
      });

      const res = await request(app).post('/api/v1/auth/send-verification-email').send({
        email: 'user@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Verification email sent');

      const sentEmails = emailService.getSentEmails();
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].to).toBe('user@example.com');
      expect(sentEmails[0].subject).toContain('Verify');
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app).post('/api/v1/auth/send-verification-email').send({
        email: 'not-an-email',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
    });

    it('returns 200 for non-existent user (security, no email enumeration)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const res = await request(app).post('/api/v1/auth/send-verification-email').send({
        email: 'nonexistent@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('If email exists, verification email sent');
    });

    it('returns 400 if email already verified', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        emailVerifiedAt: new Date(),
      });

      const res = await request(app).post('/api/v1/auth/send-verification-email').send({
        email: 'user@example.com',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
    });
  });

  describe('GET /api/v1/auth/verify-email', () => {
    it('verifies email with valid token', async () => {
      const verificationToken = 'valid-token-xyz123abc456def789';
      const expiryDate = new Date(Date.now() + 3600000);

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        verificationToken,
        verificationTokenExpiresAt: expiryDate,
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        emailVerifiedAt: new Date(),
        verificationToken: null,
        verificationTokenExpiresAt: null,
      });

      const res = await request(app).get('/api/v1/auth/verify-email').query({
        token: verificationToken,
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Email verified');
    });

    it('returns 400 for missing token', async () => {
      const res = await request(app).get('/api/v1/auth/verify-email');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
    });

    it('returns 400 for invalid token', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const res = await request(app).get('/api/v1/auth/verify-email').query({
        token: 'invalid-token',
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for expired token', async () => {
      const expiredToken = 'expired-token-xyz';
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        verificationToken: expiredToken,
        verificationTokenExpiresAt: expiredDate,
      });

      const res = await request(app).get('/api/v1/auth/verify-email').query({
        token: expiredToken,
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('expired');
    });

    it('returns 400 if already verified', async () => {
      const verificationToken = 'token-123';
      const expiryDate = new Date(Date.now() + 3600000);

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        emailVerifiedAt: new Date('2025-01-01'),
        verificationToken,
        verificationTokenExpiresAt: expiryDate,
      });

      const res = await request(app).get('/api/v1/auth/verify-email').query({
        token: verificationToken,
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('sends password reset email without disclosing user existence', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        resetToken: expect.any(String),
        resetTokenExpiresAt: expect.any(Date),
      });

      const res = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'user@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('If email exists, reset link has been sent');

      // Verify email was sent to correct user
      const sentEmails = emailService.getSentEmails();
      expect(sentEmails).toHaveLength(1);
      expect(sentEmails[0].subject).toContain('Reset');
    });

    it('still returns 200 for non-existent email (security)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const res = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'nonexistent@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('If email exists, reset link has been sent');

      // No email should be sent
      const sentEmails = emailService.getSentEmails();
      expect(sentEmails).toHaveLength(0);
    });

    it('returns 400 for invalid email format', async () => {
      const res = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'not-an-email',
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
    });
  });

  describe('POST /api/v1/auth/reset-password', () => {
    it('resets password with valid token', async () => {
      const resetToken = 'valid-reset-token-123';
      const expiryDate = new Date(Date.now() + 3600000);
      const newPassword = 'NewSecurePass123!';

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        resetToken,
        resetTokenExpiresAt: expiryDate,
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        password: expect.stringMatching(/^\$2[aby]\$/),
        resetToken: null,
        resetTokenExpiresAt: null,
      });

      const res = await request(app).post('/api/v1/auth/reset-password').send({
        token: resetToken,
        newPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Password reset');
    });

    it('returns 400 for weak password', async () => {
      const res = await request(app).post('/api/v1/auth/reset-password').send({
        token: 'token-123',
        newPassword: 'weak', // less than 8 chars
      });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('BAD_REQUEST');
    });

    it('returns 400 for password without uppercase', async () => {
      const res = await request(app).post('/api/v1/auth/reset-password').send({
        token: 'token-123',
        newPassword: 'nouppercase123',
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for password without digit', async () => {
      const res = await request(app).post('/api/v1/auth/reset-password').send({
        token: 'token-123',
        newPassword: 'NoDigitsHere',
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid/expired token', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const res = await request(app).post('/api/v1/auth/reset-password').send({
        token: 'invalid-token',
        newPassword: 'NewSecurePass123!',
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 for expired reset token', async () => {
      const expiredToken = 'expired-reset-token';
      const expiredDate = new Date(Date.now() - 1000);

      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        resetToken: expiredToken,
        resetTokenExpiresAt: expiredDate,
      });

      const res = await request(app).post('/api/v1/auth/reset-password').send({
        token: expiredToken,
        newPassword: 'NewSecurePass123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('expired');
    });

    it('returns 400 for missing token', async () => {
      const res = await request(app).post('/api/v1/auth/reset-password').send({
        newPassword: 'NewSecurePass123!',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Email Flow Scenarios', () => {
    it('full registration to verification flow', async () => {
      let verificationToken = '';

      // Step 1: User sends verification request
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        verificationToken: (verificationToken = 'token-from-step-1'),
        verificationTokenExpiresAt: new Date(Date.now() + 3600000),
      });

      const sendRes = await request(app).post('/api/v1/auth/send-verification-email').send({
        email: 'user@example.com',
      });

      expect(sendRes.status).toBe(200);

      // Step 2: Email sent
      expect(emailService.getSentEmails()).toHaveLength(1);
      const verifyEmail = emailService.getSentEmails()[0];
      expect(verifyEmail.to).toBe('user@example.com');
      expect(verifyEmail.subject).toContain('Verify');

      // Step 3: User clicks verification link
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        verificationToken,
        verificationTokenExpiresAt: new Date(Date.now() + 3600000),
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        emailVerifiedAt: new Date(),
        verificationToken: null,
        verificationTokenExpiresAt: null,
      });

      const verifyRes = await request(app).get('/api/v1/auth/verify-email').query({
        token: verificationToken,
      });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.message).toContain('verified');
    });

    it('full forgot password to reset flow', async () => {
      let resetToken = '';

      // Step 1: User requests password reset
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        resetToken: (resetToken = 'reset-token-xyz'),
        resetTokenExpiresAt: new Date(Date.now() + 3600000),
      });

      const forgotRes = await request(app).post('/api/v1/auth/forgot-password').send({
        email: 'user@example.com',
      });

      expect(forgotRes.status).toBe(200);

      // Step 2: Email sent
      expect(emailService.getSentEmails()).toHaveLength(1);

      // Step 3: User clicks reset link and provides new password
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        ...mockUser,
        resetToken,
        resetTokenExpiresAt: new Date(Date.now() + 3600000),
      });

      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockUser,
        password: expect.any(String),
        resetToken: null,
        resetTokenExpiresAt: null,
      });

      const resetRes = await request(app).post('/api/v1/auth/reset-password').send({
        token: resetToken,
        newPassword: 'NewSecurePass123!',
      });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toContain('Password reset');
    });
  });
});
