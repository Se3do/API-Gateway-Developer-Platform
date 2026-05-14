import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { EmailService, EmailTemplates } from '../services/email.service.js';
import { BadRequestError } from '@api-gateway/shared';
import { z } from 'zod';
import {
  generateEmailToken,
  generateEmailTokenExpiry,
  validateEmailToken,
  EMAIL_VERIFICATION_TOKEN_EXPIRY_MS,
  PASSWORD_RESET_TOKEN_EXPIRY_MS,
} from '../utils/email-token.js';

// Validation schemas
const sendVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
});

export function createEmailController(prisma: PrismaClient, emailService: EmailService) {
  async function sendVerificationEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = sendVerificationSchema.parse(req.body);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        // Security: don't reveal if email exists
        return res.status(200).json({ message: 'If email exists, verification email sent' });
      }

      if (user.emailVerifiedAt) {
        return next(new BadRequestError('Email already verified'));
      }

      // Generate verification token
      const verificationToken = generateEmailToken();
      const verificationTokenExpiresAt = generateEmailTokenExpiry(EMAIL_VERIFICATION_TOKEN_EXPIRY_MS);

      // Update user with token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken,
          verificationTokenExpiresAt,
        },
      });

      // Send verification email
      const verificationUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/v1/auth/verify-email?token=${verificationToken}`;
      const { subject, html } = EmailTemplates.verificationEmail(user.name, verificationUrl);

      await emailService.send(user.email, subject, html);

      res.status(200).json({ message: 'Verification email sent' });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return next(new BadRequestError(`Validation error: ${err.errors[0].message}`));
      }
      next(err);
    }
  }

  async function verifyEmail(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = verifyEmailSchema.parse(req.query);

      const user = await prisma.user.findUnique({
        where: { verificationToken: token },
      });

      if (!user) {
        return next(new BadRequestError('Invalid verification token'));
      }

      if (user.emailVerifiedAt) {
        return next(new BadRequestError('Email already verified'));
      }

      // Validate token
      if (!validateEmailToken(token, user.verificationToken, user.verificationTokenExpiresAt)) {
        return next(new BadRequestError('Verification token expired or invalid'));
      }

      // Update user: mark email as verified and clear token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerifiedAt: new Date(),
          verificationToken: null,
          verificationTokenExpiresAt: null,
        },
      });

      res.status(200).json({ message: 'Email verified successfully' });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return next(new BadRequestError(`Validation error: ${err.errors[0].message}`));
      }
      next(err);
    }
  }

  async function forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = forgotPasswordSchema.parse(req.body);

      const user = await prisma.user.findUnique({ where: { email } });

      // Security: always return success (don't reveal if email exists)
      if (!user) {
        return res.status(200).json({ message: 'If email exists, reset link has been sent' });
      }

      // Generate reset token
      const resetToken = generateEmailToken();
      const resetTokenExpiresAt = generateEmailTokenExpiry(PASSWORD_RESET_TOKEN_EXPIRY_MS);

      // Update user with reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiresAt,
        },
      });

      // Send reset email
      const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/v1/auth/reset-password?token=${resetToken}`;
      const { subject, html } = EmailTemplates.passwordResetEmail(user.name, resetUrl);

      await emailService.send(user.email, subject, html);

      res.status(200).json({ message: 'If email exists, reset link has been sent' });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return next(new BadRequestError(`Validation error: ${err.errors[0].message}`));
      }
      next(err);
    }
  }

  async function resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(req.body);

      const user = await prisma.user.findUnique({
        where: { resetToken: token },
      });

      if (!user) {
        return next(new BadRequestError('Invalid reset token'));
      }

      // Validate token
      if (!validateEmailToken(token, user.resetToken, user.resetTokenExpiresAt)) {
        return next(new BadRequestError('Reset token expired or invalid'));
      }

      // Hash new password
      const bcrypt = await import('bcrypt');
      const { BCrypt_CONSTANTS } = await import('@api-gateway/shared');
      const passwordHash = await bcrypt.default.hash(newPassword, BCrypt_CONSTANTS.SALT_ROUNDS);

      // Update user: set new password and clear reset token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          resetToken: null,
          resetTokenExpiresAt: null,
        },
      });

      res.status(200).json({ message: 'Password reset successfully' });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return next(new BadRequestError(`Validation error: ${err.errors[0].message}`));
      }
      next(err);
    }
  }

  return {
    sendVerificationEmail,
    verifyEmail,
    forgotPassword,
    resetPassword,
  };
}
