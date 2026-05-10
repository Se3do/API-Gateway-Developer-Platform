import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { UnauthorizedError, ForbiddenError, ROLES } from '@api-gateway/shared';
import type { ITokenPayload } from '@api-gateway/shared';

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.accessTokenSecret) as ITokenPayload;

    req.context = req.context || { requestId: '', startTime: Date.now() };
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

export function requireRole(minRole: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.context?.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userLevel = ROLES[req.context.user.role as keyof typeof ROLES] ?? 0;
    const requiredLevel = ROLES[minRole as keyof typeof ROLES] ?? 0;

    if (userLevel < requiredLevel) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}
