import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { OAuthService } from '../services/oauth.service.js';
import { BadRequestError, UserRole } from '@api-gateway/shared';
import { generateAccessToken, generateRefreshToken } from '../services/token.service.js';

type OAuthUser = { id: string; email: string; name: string; role: string; active: boolean; createdAt: Date };

export function createOAuthController(prisma: PrismaClient, oauthService: OAuthService) {
  async function initiateOAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const provider = req.params.provider as string;

      if (!['google', 'github'].includes(provider)) {
        return next(new BadRequestError(`Unsupported OAuth provider: ${provider}`));
      }

      const { url, state } = await oauthService.generateAuthorizationUrl(provider as 'google' | 'github');

      res.status(200).json({
        authorizationUrl: url,
        state,
        message: 'Redirect user to this authorization URL',
      });
    } catch (err) {
      next(err);
    }
  }

  async function handleCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const provider = req.params.provider as string;
      const { code, state } = req.query;

      if (!['google', 'github'].includes(provider)) {
        return next(new BadRequestError(`Unsupported OAuth provider: ${provider}`));
      }

      if (!code || typeof code !== 'string') {
        return next(new BadRequestError('Missing authorization code'));
      }

      if (!state || typeof state !== 'string') {
        return next(new BadRequestError('Missing state token'));
      }

      // Validate state token
      await oauthService.validateStateToken(state);

      // Exchange code for user profile
      const profile = await oauthService.exchangeAuthCodeForProfile(provider as 'google' | 'github', code);

      // Find or create user
      const providerIdField = provider === 'google' ? 'googleId' : 'githubId';
      const existingUser = await prisma.user.findFirst({
        where: { [providerIdField]: profile.providerId },
        select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      });

      if (existingUser) {
        const accessToken = generateAccessToken({
          id: existingUser.id,
          email: existingUser.email,
          role: existingUser.role as UserRole,
        });
        const refresh = generateRefreshToken();

        await prisma.refreshToken.create({
          data: { token: refresh.hashed, userId: existingUser.id, expiresAt: refresh.expiresAt },
        });

        return res.status(200).json({
          user: existingUser,
          accessToken,
          refreshToken: refresh.raw,
        });
      }

      const existingEmail = await prisma.user.findUnique({
        where: { email: profile.email },
        select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
      });

      let user: OAuthUser;

      if (existingEmail) {
        user = await prisma.user.update({
          where: { id: existingEmail.id },
          data: {
            [providerIdField]: profile.providerId,
            emailVerifiedAt: new Date(),
          },
          select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
        }) as unknown as OAuthUser;
      } else {
        user = await prisma.user.create({
          data: {
            email: profile.email,
            name: profile.name,
            passwordHash: '',
            [providerIdField]: profile.providerId,
            emailVerifiedAt: new Date(),
            role: 'DEVELOPER',
            active: true,
          },
          select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
        }) as unknown as OAuthUser;
      }

      const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
      });
      const refresh = generateRefreshToken();

      await prisma.refreshToken.create({
        data: { token: refresh.hashed, userId: user.id, expiresAt: refresh.expiresAt },
      });

      res.status(200).json({ user, accessToken, refreshToken: refresh.raw });
    } catch (err) {
      next(err);
    }
  }

  return { initiateOAuth, handleCallback };
}
