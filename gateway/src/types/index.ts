import { ITokenPayload } from '@api-gateway/shared';

export interface VerifiedApiKey {
  id: string;
  projectId: string;
  userId: string;
}

export interface RequestContext {
  requestId: string;
  startTime: number;
  user?: ITokenPayload;
  apiKey?: VerifiedApiKey;
  routeConfig?: {
    rateLimit: number | null;
    cacheTTL: number | null;
  };
  cacheKey?: string;
}

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}
