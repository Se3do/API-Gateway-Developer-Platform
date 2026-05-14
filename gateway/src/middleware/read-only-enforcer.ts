import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '@api-gateway/shared';

/**
 * Global middleware to enforce read-only restrictions for VIEWER role
 * Blocks POST, PUT, PATCH, DELETE for users with VIEWER role
 */
export function readOnlyEnforcer(req: Request, _res: Response, next: NextFunction) {
  // Skip for GET/HEAD/OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip if no user context (unauthenticated)
  if (!req.context?.user) {
    return next();
  }

  // Check if user is VIEWER
  if (req.context.user.role === 'VIEWER') {
    return next(
      new ForbiddenError(
        `Read-only role cannot perform ${req.method} operations. View only roles cannot modify resources.`,
      ),
    );
  }

  next();
}
