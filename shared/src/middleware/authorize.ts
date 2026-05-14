import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types/user.types.js';
import { ForbiddenError, UnauthorizedError } from '../errors/app-error.js';
import { ROLES } from '../constants/index.js';

/**
 * Middleware factory to require a minimum role level
 * @param requiredRole The minimum role level required (e.g., 'ADMIN', 'DEVELOPER', 'VIEWER')
 * @returns Express middleware
 */
export function authorize(requiredRole: UserRole | UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.context?.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const userRole = req.context.user.role;
    const userLevel = ROLES[userRole as keyof typeof ROLES];

    // Handle array of allowed roles (any of them is acceptable)
    const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    const maxRequiredLevel = Math.max(...requiredRoles.map((r) => ROLES[r as keyof typeof ROLES] ?? 0));

    if (userLevel < maxRequiredLevel) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Check if a user has a specific role (exact match or higher)
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  const userLevel = ROLES[userRole as keyof typeof ROLES];
  const requiredLevel = ROLES[requiredRole as keyof typeof ROLES];
  return userLevel >= requiredLevel;
}

/**
 * Check if a user has any of the required roles
 */
export function hasAnyRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.some((role) => hasRole(userRole, role));
}

/**
 * Check if a user has all of the required roles (not typical for hierarchical roles)
 */
export function hasAllRoles(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.every((role) => hasRole(userRole, role));
}
