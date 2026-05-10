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
  '/api-docs',
  '/api/v1/alerts/emit',
  '/api/v1/keys/verify',
];

export function authenticator(req: Request, _res: Response, next: NextFunction) {
  if (PUBLIC_PATHS.includes(req.path)) {
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Missing or malformed Authorization header'));
  }

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.accessTokenSecret) as ITokenPayload;
    req.context.user = decoded;
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
