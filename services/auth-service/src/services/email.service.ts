import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

export interface EmailService {
  send(to: string, subject: string, html: string): Promise<void>;
}

/**
 * Mock Email Service - logs to console and stores in-memory for testing
 */
export class MockEmailService implements EmailService {
  private sentEmails: Array<{ to: string; subject: string; html: string; timestamp: Date }> = [];

  async send(to: string, subject: string, html: string): Promise<void> {
    const email = { to, subject, html, timestamp: new Date() };
    this.sentEmails.push(email);

    console.log(`[MockEmailService] Email sent to ${to}`);
    console.log(`[MockEmailService] Subject: ${subject}`);
    console.log(`[MockEmailService] Body: ${html.substring(0, 100)}...`);
  }

  /**
   * Get all sent emails (for testing)
   */
  getSentEmails() {
    return this.sentEmails;
  }

  /**
   * Clear sent emails (for testing)
   */
  clearSentEmails() {
    this.sentEmails = [];
  }

  /**
   * Find email by recipient and subject (for testing)
   */
  findEmail(to: string, subject: string) {
    return this.sentEmails.find((e) => e.to === to && e.subject.includes(subject));
  }
}

/**
 * SMTP Email Service - sends real emails via SMTP
 */
export class SMTPEmailService implements EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass,
      },
    });
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: config.email.fromEmail,
        to,
        subject,
        html,
      });
      console.log(`[SMTPEmailService] Email sent to ${to}`);
    } catch (err: any) {
      console.error(`[SMTPEmailService] Failed to send email to ${to}:`, err.message);
      throw new Error(`Failed to send email: ${err.message}`);
    }
  }
}

/**
 * Email template generators
 */
export const EmailTemplates = {
  verificationEmail: (name: string, verificationUrl: string): { subject: string; html: string } => ({
    subject: 'Verify your email address',
    html: `
      <h1>Welcome, ${name}!</h1>
      <p>Please verify your email address to complete your registration.</p>
      <p><a href="${verificationUrl}">Click here to verify your email</a></p>
      <p>Or copy and paste this link: ${verificationUrl}</p>
      <p>This link expires in 1 hour.</p>
    `,
  }),

  passwordResetEmail: (name: string, resetUrl: string): { subject: string; html: string } => ({
    subject: 'Reset your password',
    html: `
      <h1>Password Reset Request</h1>
      <p>Hi ${name},</p>
      <p>We received a request to reset your password. Click the link below to proceed:</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>Or copy and paste this link: ${resetUrl}</p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  }),

  welcomeEmail: (name: string): { subject: string; html: string } => ({
    subject: 'Welcome to our platform!',
    html: `
      <h1>Welcome, ${name}!</h1>
      <p>Your account has been created successfully.</p>
      <p>You can now log in and start using our platform.</p>
    `,
  }),
};

/**
 * Factory function to create the appropriate email service
 */
export function createEmailService(): EmailService {
  if (config.email.driver === 'mock') {
    console.log('[EmailService] Using MockEmailService');
    return new MockEmailService();
  } else if (config.email.driver === 'smtp') {
    console.log('[EmailService] Using SMTPEmailService');
    return new SMTPEmailService();
  } else {
    throw new Error(`Unknown email driver: ${config.email.driver}`);
  }
}
