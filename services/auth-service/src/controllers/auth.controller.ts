import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAuthService } from '../services/auth.service.js';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from '../schemas/auth.schema.js';
import { EmailService, EmailTemplates } from '../services/email.service.js';
import { generateEmailToken, generateEmailTokenExpiry } from '../utils/email-token.js';

export function createAuthController(prisma: PrismaClient, emailService?: EmailService) {
  const authService = createAuthService(prisma);

  async function register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name } = registerSchema.body.parse(req.body);
      const result = await authService.register(email, password, name);

      // Generate and send verification email
      if (emailService) {
        const verificationToken = generateEmailToken();
        const expiresAt = generateEmailTokenExpiry();

        // Update user with verification token
        await prisma.user.update({
          where: { id: result.user.id },
          data: {
            verificationToken,
            verificationTokenExpiresAt: expiresAt,
          },
        });

        // Send verification email
        const verificationLink = `${process.env.APP_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
        const { subject, html } = EmailTemplates.verificationEmail(name, verificationLink);
        await emailService.send(email, subject, html);
      }

      res.status(201).json({
        ...result,
        message: emailService
          ? 'Registration successful. Verification email sent.'
          : 'Registration successful',
      });
    } catch (err) {
      next(err);
    }
  }

  async function login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = loginSchema.body.parse(req.body);
      const result = await authService.login(email, password);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = refreshSchema.body.parse(req.body);
      const result = await authService.refresh(refreshToken);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = logoutSchema.body.parse(req.body);
      const result = await authService.logout(req.context.user!.userId, refreshToken);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await authService.getProfile(req.context.user!.userId);
      res.status(200).json(profile);
    } catch (err) {
      next(err);
    }
  }

  return { register, login, refresh, logout, getProfile };
}
