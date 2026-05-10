import { Request, Response, NextFunction } from 'express';
import { getRouteConfig } from '../services/route-config.service.js';

export async function routeConfigResolver(req: Request, _res: Response, next: NextFunction) {
  const rc = getRouteConfig(req.method, req.path);
  if (rc) {
    req.context.routeConfig = {
      rateLimit: rc.rateLimit,
      cacheTTL: rc.cacheTTL,
    };
  }
  next();
}
