import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createEmailController } from '../controllers/email.controller.js';
import { EmailService, createEmailService } from '../services/email.service.js';

export function createEmailRouter(prisma: PrismaClient, emailService?: EmailService): Router {
  const router = Router();
  const svc = emailService ?? createEmailService();
  const controller = createEmailController(prisma, svc);

  /**
   * @openapi
   * /api/v1/auth/send-verification-email:
   *   post:
   *     tags: [Email]
   *     summary: Send verification email
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *     responses:
   *       200:
   *         description: Verification email sent
   */
  router.post('/send-verification-email', controller.sendVerificationEmail);

  /**
   * @openapi
   * /api/v1/auth/verify-email:
   *   get:
   *     tags: [Email]
   *     summary: Verify email with token
   *     parameters:
   *       - in: query
   *         name: token
   *         schema:
   *           type: string
   *         required: true
   *     responses:
   *       200:
   *         description: Email verified successfully
   */
  router.get('/verify-email', controller.verifyEmail);

  /**
   * @openapi
   * /api/v1/auth/forgot-password:
   *   post:
   *     tags: [Email]
   *     summary: Request password reset email
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *     responses:
   *       200:
   *         description: Password reset email sent
   */
  router.post('/forgot-password', controller.forgotPassword);

  /**
   * @openapi
   * /api/v1/auth/reset-password:
   *   post:
   *     tags: [Email]
   *     summary: Reset password with token
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               token:
   *                 type: string
   *               newPassword:
   *                 type: string
   *                 format: password
   *     responses:
   *       200:
   *         description: Password reset successfully
   */
  router.post('/reset-password', controller.resetPassword);

  return router;
}
