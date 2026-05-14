import { UserRole } from './user.types.js';

declare global {
  namespace Express {
    interface Request {
      context?: {
        requestId: string;
        startTime: number;
        user?: {
          userId: string;
          email: string;
          role: UserRole;
        };
      };
    }
  }
}

export {}