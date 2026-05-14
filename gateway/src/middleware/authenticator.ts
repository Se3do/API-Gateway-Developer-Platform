import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError } from '@api-gateway/shared';
import type { ITokenPayload } from '@api-gateway/shared';

const PUBLIC_PATHS = [
  '/health',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/send-verification-email',
  '/api-docs',
  '/api/v1/alerts/emit',
  '/api/v1/keys/verify',
];

const PUBLIC_PATH_PREFIXES = [
  '/api/v1/logs',
  '/api/v1/routes',
  '/api/v1/events',
  '/api/v1/oauth', // OAuth initiate and callback are public
];

export function authenticator(req: Request, _res: Response, next: NextFunction) {
  if (PUBLIC_PATHS.includes(req.path)) {
    return next();
  }
  if (PUBLIC_PATH_PREFIXES.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.accessTokenSecret) as ITokenPayload;
    // Attach user to context, ensuring role is preserved
    req.context = req.context || { requestId: '', startTime: Date.now() };
    req.context.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorizedError('Token expired'));
    } else if (err instanceof jwt.JsonWebTokenError) {
      next(new UnauthorizedError('Invalid token'));
    } else {
      next(err);
    }
  }
}
