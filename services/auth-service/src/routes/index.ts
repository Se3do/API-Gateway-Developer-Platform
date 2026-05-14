import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAuthRouter } from './auth.routes.js';
import { createOAuthRouter } from './oauth.routes.js';
import { createEmailRouter } from './email.routes.js';
import { config } from '../config/index.js';
import { EmailService } from '../services/email.service.js';

export function createRoutes(prisma: PrismaClient, emailService?: EmailService): Router {
  const router = Router();

  router.use('/api/v1/auth', createAuthRouter(prisma, emailService));
  
  // Email routes use same /api/v1/auth prefix
  router.use('/api/v1/auth', createEmailRouter(prisma, emailService));
  
  // OAuth routes use same /api/v1/auth prefix
  const oauthConfigs = {
    google: {
      provider: 'google' as const,
      clientId: config.oauth.google.clientId,
      clientSecret: config.oauth.google.clientSecret,
      redirectUri: config.oauth.google.redirectUri,
      authorizationUrl: config.oauth.google.authorizationUrl,
      tokenUrl: config.oauth.google.tokenUrl,
      userInfoUrl: config.oauth.google.userInfoUrl,
    },
    github: {
      provider: 'github' as const,
      clientId: config.oauth.github.clientId,
      clientSecret: config.oauth.github.clientSecret,
      redirectUri: config.oauth.github.redirectUri,
      authorizationUrl: config.oauth.github.authorizationUrl,
      tokenUrl: config.oauth.github.tokenUrl,
      userInfoUrl: config.oauth.github.userInfoUrl,
    },
  };
  
  router.use('/api/v1/oauth', createOAuthRouter(prisma, oauthConfigs));

  return router;
}
