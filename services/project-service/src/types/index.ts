import { ITokenPayload } from '@api-gateway/shared';

export interface RequestContext {
  requestId: string;
  startTime: number;
  user?: ITokenPayload;
}

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}
