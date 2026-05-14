import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createOAuthController } from '../controllers/oauth.controller.js';
import { createOAuthService, OAuthConfig } from '../services/oauth.service.js';

export function createOAuthRouter(
  prisma: PrismaClient,
  oauthConfigs: Record<'google' | 'github', OAuthConfig>,
): Router {
  const router = Router();
  const oauthService = createOAuthService(oauthConfigs);
  const controller = createOAuthController(prisma, oauthService);

  /**
   * @openapi
   * /api/v1/oauth/initiate/{provider}:
   *   get:
   *     tags: [OAuth]
   *     summary: Initiate OAuth login
   *     parameters:
   *       - in: path
   *         name: provider
   *         schema:
   *           type: string
   *           enum: [google, github]
   *         required: true
   *     responses:
   *       200:
   *         description: Authorization URL and state token
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 authorizationUrl:
   *                   type: string
   *                 state:
   *                   type: string
   */
  router.get('/initiate/:provider', controller.initiateOAuth);

  /**
   * @openapi
   * /api/v1/oauth/{provider}/callback:
   *   get:
   *     tags: [OAuth]
   *     summary: OAuth provider callback
   *     parameters:
   *       - in: path
   *         name: provider
   *         schema:
   *           type: string
   *           enum: [google, github]
   *         required: true
   *       - in: query
   *         name: code
   *         schema:
   *           type: string
   *         required: true
   *       - in: query
   *         name: state
   *         schema:
   *           type: string
   *         required: true
   *     responses:
   *       200:
   *         description: User authenticated, JWT and refresh token returned
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/AuthResponse'
   */
  router.get('/:provider/callback', controller.handleCallback);

  return router;
}
