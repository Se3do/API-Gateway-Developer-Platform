import { authorize, hasRole, hasAnyRole, hasAllRoles } from '../src/middleware/authorize.js';
import { UserRole, ROLES, ForbiddenError, UnauthorizedError } from '@api-gateway/shared';
import { Request, Response, NextFunction } from 'express';

describe('RBAC Authorization Middleware Unit Tests', () => {
  let mockReq: Partial<any>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock<void>;

  beforeEach(() => {
    mockReq = {};
    mockRes = {};
    mockNext = jest.fn();
  });

  describe('Role Hierarchy', () => {
    it('ADMIN has highest level (3)', () => {
      expect(ROLES[UserRole.ADMIN]).toBe(3);
    });

    it('DEVELOPER has middle level (2)', () => {
      expect(ROLES[UserRole.DEVELOPER]).toBe(2);
    });

    it('VIEWER has lowest level (1)', () => {
      expect(ROLES[UserRole.VIEWER]).toBe(1);
    });

    it('maintains correct hierarchy: ADMIN > DEVELOPER > VIEWER', () => {
      expect(ROLES[UserRole.ADMIN]).toBeGreaterThan(ROLES[UserRole.DEVELOPER]);
      expect(ROLES[UserRole.DEVELOPER]).toBeGreaterThan(ROLES[UserRole.VIEWER]);
    });
  });

  describe('hasRole', () => {
    it('ADMIN has ADMIN role', () => {
      expect(hasRole(UserRole.ADMIN, UserRole.ADMIN)).toBe(true);
    });

    it('ADMIN has DEVELOPER role (higher can satisfy lower)', () => {
      expect(hasRole(UserRole.ADMIN, UserRole.DEVELOPER)).toBe(true);
    });

    it('ADMIN has VIEWER role', () => {
      expect(hasRole(UserRole.ADMIN, UserRole.VIEWER)).toBe(true);
    });

    it('DEVELOPER does NOT have ADMIN role', () => {
      expect(hasRole(UserRole.DEVELOPER, UserRole.ADMIN)).toBe(false);
    });

    it('DEVELOPER has DEVELOPER role', () => {
      expect(hasRole(UserRole.DEVELOPER, UserRole.DEVELOPER)).toBe(true);
    });

    it('DEVELOPER has VIEWER role', () => {
      expect(hasRole(UserRole.DEVELOPER, UserRole.VIEWER)).toBe(true);
    });

    it('VIEWER does NOT have ADMIN role', () => {
      expect(hasRole(UserRole.VIEWER, UserRole.ADMIN)).toBe(false);
    });

    it('VIEWER does NOT have DEVELOPER role', () => {
      expect(hasRole(UserRole.VIEWER, UserRole.DEVELOPER)).toBe(false);
    });

    it('VIEWER has VIEWER role', () => {
      expect(hasRole(UserRole.VIEWER, UserRole.VIEWER)).toBe(true);
    });
  });

  describe('hasAnyRole', () => {
    it('matches any role in list', () => {
      expect(hasAnyRole(UserRole.DEVELOPER, [UserRole.VIEWER, UserRole.DEVELOPER])).toBe(true);
    });

    it('fails if no roles match', () => {
      expect(hasAnyRole(UserRole.VIEWER, [UserRole.ADMIN, UserRole.DEVELOPER])).toBe(false);
    });

    it('ADMIN matches any role', () => {
      expect(hasAnyRole(UserRole.ADMIN, [UserRole.VIEWER, UserRole.DEVELOPER])).toBe(true);
    });
  });

  describe('hasAllRoles (not typical for hierarchical)', () => {
    it('requires all roles to be satisfied', () => {
      // ADMIN satisfies both DEVELOPER and VIEWER
      expect(hasAllRoles(UserRole.ADMIN, [UserRole.DEVELOPER, UserRole.VIEWER])).toBe(true);
    });

    it('fails if any role is not satisfied', () => {
      // DEVELOPER cannot satisfy ADMIN
      expect(hasAllRoles(UserRole.DEVELOPER, [UserRole.ADMIN, UserRole.VIEWER])).toBe(false);
    });
  });

  describe('authorize Middleware', () => {
    it('allows ADMIN for ADMIN required endpoint', (done) => {
      mockReq.context = {
        user: {
          userId: 'user-1',
          email: 'admin@example.com',
          role: UserRole.ADMIN,
        },
      };

      const middleware = authorize(UserRole.ADMIN);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith();
      done();
    });

    it('allows ADMIN for DEVELOPER required endpoint', (done) => {
      mockReq.context = {
        user: {
          userId: 'user-1',
          email: 'admin@example.com',
          role: UserRole.ADMIN,
        },
      };

      const middleware = authorize(UserRole.DEVELOPER);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith();
      done();
    });

    it('denies DEVELOPER for ADMIN required endpoint', (done) => {
      mockReq.context = {
        user: {
          userId: 'user-2',
          email: 'dev@example.com',
          role: UserRole.DEVELOPER,
        },
      };

      const middleware = authorize(UserRole.ADMIN);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
      done();
    });

    it('allows DEVELOPER for DEVELOPER required endpoint', (done) => {
      mockReq.context = {
        user: {
          userId: 'user-2',
          email: 'dev@example.com',
          role: UserRole.DEVELOPER,
        },
      };

      const middleware = authorize(UserRole.DEVELOPER);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith();
      done();
    });

    it('denies VIEWER for DEVELOPER required endpoint', (done) => {
      mockReq.context = {
        user: {
          userId: 'user-3',
          email: 'viewer@example.com',
          role: UserRole.VIEWER,
        },
      };

      const middleware = authorize(UserRole.DEVELOPER);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
      done();
    });

    it('allows VIEWER for VIEWER required endpoint', (done) => {
      mockReq.context = {
        user: {
          userId: 'user-3',
          email: 'viewer@example.com',
          role: UserRole.VIEWER,
        },
      };

      const middleware = authorize(UserRole.VIEWER);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith();
      done();
    });

    it('handles array of allowed roles', (done) => {
      mockReq.context = {
        user: {
          userId: 'user-2',
          email: 'dev@example.com',
          role: UserRole.DEVELOPER,
        },
      };

      const middleware = authorize([UserRole.ADMIN, UserRole.DEVELOPER]);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith();
      done();
    });

    it('denies if not in allowed roles array', (done) => {
      mockReq.context = {
        user: {
          userId: 'user-3',
          email: 'viewer@example.com',
          role: UserRole.VIEWER,
        },
      };

      const middleware = authorize([UserRole.ADMIN, UserRole.DEVELOPER]);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenError));
      done();
    });

    it('rejects if no user context', (done) => {
      mockReq.context = {};

      const middleware = authorize(UserRole.ADMIN);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      done();
    });

    it('rejects if no context at all', (done) => {
      // mockReq has no context

      const middleware = authorize(UserRole.ADMIN);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      expect(mockNext).toHaveBeenCalledWith(expect.any(UnauthorizedError));
      done();
    });

    it('error message indicates insufficient permissions', (done) => {
      mockReq.context = {
        user: {
          userId: 'user-3',
          email: 'viewer@example.com',
          role: UserRole.VIEWER,
        },
      };

      const middleware = authorize(UserRole.ADMIN);
      middleware(mockReq as Request, mockRes as Response, mockNext as NextFunction);

      const error = mockNext.mock.calls[0][0];
      expect(error.message).toContain('Insufficient permissions');
      done();
    });
  });
});
