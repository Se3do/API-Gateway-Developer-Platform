import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { getRedis } from '../redis.js';

const PREFIX = 'cache:';

export async function responseCacher(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'GET') return next();

  const routeCfg = req.context?.routeConfig;
  const ttl = routeCfg?.cacheTTL;
  if (!ttl || ttl <= 0) return next();

  const queryHash = crypto.createHash('md5').update(JSON.stringify(req.query || {})).digest('hex');
  const cacheKey = `${PREFIX}${req.method}:${req.path}:${queryHash}`;
  req.context.cacheKey = cacheKey;

  try {
    const redis = getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.json(JSON.parse(cached));
    }

    res.setHeader('X-Cache', 'MISS');

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      redis.setex(cacheKey, ttl, JSON.stringify(body)).catch(() => {});
      return originalJson(body);
    };

    next();
  } catch {
    next();
  }
}
