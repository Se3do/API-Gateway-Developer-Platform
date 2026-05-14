process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-at-least-32-chars!!';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-token-secret-at-least-32-chars!';
process.env.AUTH_PORT = '4001';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.EMAIL_DRIVER = 'mock';

import { MockEmailService, EmailTemplates } from '../src/services/email.service.js';
import {
  generateEmailToken,
  generateEmailTokenExpiry,
  validateEmailToken,
  EMAIL_VERIFICATION_TOKEN_EXPIRY_MS,
} from '../src/utils/email-token.js';

describe('Email Service Unit Tests', () => {
  describe('MockEmailService', () => {
    let emailService: MockEmailService;

    beforeEach(() => {
      emailService = new MockEmailService();
    });

    it('sends email and stores in memory', async () => {
      await emailService.send('user@example.com', 'Test Subject', '<h1>Test</h1>');

      const sent = emailService.getSentEmails();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual({
        to: 'user@example.com',
        subject: 'Test Subject',
        html: '<h1>Test</h1>',
        timestamp: expect.any(Date),
      });
    });

    it('stores multiple emails', async () => {
      await emailService.send('user1@example.com', 'Subject 1', '<h1>Body 1</h1>');
      await emailService.send('user2@example.com', 'Subject 2', '<h1>Body 2</h1>');

      expect(emailService.getSentEmails()).toHaveLength(2);
    });

    it('finds email by recipient and subject', async () => {
      await emailService.send('user@example.com', 'Verify Email', '<h1>Verify</h1>');
      await emailService.send('user@example.com', 'Reset Password', '<h1>Reset</h1>');

      const found = emailService.findEmail('user@example.com', 'Verify');
      expect(found?.subject).toBe('Verify Email');
    });

    it('returns undefined for non-existent email', async () => {
      const found = emailService.findEmail('user@example.com', 'Verify');
      expect(found).toBeUndefined();
    });

    it('clears sent emails', async () => {
      await emailService.send('user@example.com', 'Test', '<h1>Test</h1>');
      expect(emailService.getSentEmails()).toHaveLength(1);

      emailService.clearSentEmails();
      expect(emailService.getSentEmails()).toHaveLength(0);
    });
  });

  describe('Email Token Generation', () => {
    it('generates token of correct format', () => {
      const token = generateEmailToken();

      expect(typeof token).toBe('string');
      expect(token.length).toBe(32); // 16 bytes * 2 hex chars
      expect(/^[a-f0-9]{32}$/.test(token)).toBe(true);
    });

    it('generates unique tokens', () => {
      const token1 = generateEmailToken();
      const token2 = generateEmailToken();

      expect(token1).not.toEqual(token2);
    });

    it('generates expiry date in future', () => {
      const expiry = generateEmailTokenExpiry();
      const now = new Date();

      expect(expiry.getTime()).toBeGreaterThan(now.getTime());
    });

    it('respects custom expiry time', () => {
      const customExpiry = 5 * 60 * 1000; // 5 minutes
      const expiry = generateEmailTokenExpiry(customExpiry);
      const now = Date.now();

      expect(expiry.getTime() - now).toBeCloseTo(customExpiry, -2); // ±100ms tolerance
    });

    it('uses default expiry of 1 hour', () => {
      const expiry = generateEmailTokenExpiry();
      const now = Date.now();

      expect(expiry.getTime() - now).toBeCloseTo(EMAIL_VERIFICATION_TOKEN_EXPIRY_MS, -2);
    });
  });

  describe('Email Token Validation', () => {
    it('validates matching non-expired token', () => {
      const token = generateEmailToken();
      const expiry = generateEmailTokenExpiry();

      const valid = validateEmailToken(token, token, expiry);
      expect(valid).toBe(true);
    });

    it('rejects mismatched tokens', () => {
      const token1 = generateEmailToken();
      const token2 = generateEmailToken();
      const expiry = generateEmailTokenExpiry();

      const valid = validateEmailToken(token1, token2, expiry);
      expect(valid).toBe(false);
    });

    it('rejects expired token', () => {
      const token = generateEmailToken();
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago

      const valid = validateEmailToken(token, token, expiredDate);
      expect(valid).toBe(false);
    });

    it('rejects null stored token', () => {
      const token = generateEmailToken();
      const expiry = generateEmailTokenExpiry();

      const valid = validateEmailToken(token, null, expiry);
      expect(valid).toBe(false);
    });

    it('rejects null expiry date', () => {
      const token = generateEmailToken();

      const valid = validateEmailToken(token, token, null);
      expect(valid).toBe(false);
    });
  });

  describe('Email Templates', () => {
    it('generates verification email template', () => {
      const { subject, html } = EmailTemplates.verificationEmail('John', 'http://example.com/verify?token=xyz');

      expect(subject).toContain('Verify');
      expect(html).toContain('John');
      expect(html).toContain('http://example.com/verify?token=xyz');
      expect(html).toContain('1 hour');
    });

    it('generates password reset email template', () => {
      const { subject, html } = EmailTemplates.passwordResetEmail('Jane', 'http://example.com/reset?token=abc');

      expect(subject).toContain('Reset');
      expect(html).toContain('Jane');
      expect(html).toContain('http://example.com/reset?token=abc');
      expect(html).toContain('1 hour');
    });

    it('generates welcome email template', () => {
      const { subject, html } = EmailTemplates.welcomeEmail('Bob');

      expect(subject).toContain('Welcome');
      expect(html).toContain('Bob');
    });
  });
});
