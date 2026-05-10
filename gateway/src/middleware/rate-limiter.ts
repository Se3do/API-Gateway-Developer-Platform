import { Request, Response, NextFunction } from 'express';
import { TooManyRequestsError, DEFAULT_RATE_LIMITS } from '@api-gateway/shared';
import { getRedis } from '../redis.js';

const WINDOW = DEFAULT_RATE_LIMITS.WINDOW_SECONDS;

function getIdentifier(req: Request): string {
  if (req.context?.apiKey?.id) return `apikey:${req.context.apiKey.id}`;
  if (req.context?.user?.userId) return `user:${req.context.user.userId}`;
  return `ip:${req.ip || 'unknown'}`;
}

function getLimit(identifier: string, routeLimit?: number | null): number {
  if (routeLimit && routeLimit > 0) return routeLimit;
  if (identifier.startsWith('apikey:')) return DEFAULT_RATE_LIMITS.API_KEY;
  if (identifier.startsWith('user:')) return DEFAULT_RATE_LIMITS.USER_AUTHENTICATED;
  return DEFAULT_RATE_LIMITS.IP_UNAUTHENTICATED;
}

export async function rateLimiter(req: Request, res: Response, next: NextFunction) {
  try {
    const identifier = getIdentifier(req);
    const limit = getLimit(identifier, req.context.routeConfig?.rateLimit);
    const now = Date.now();
    const windowStart = now - WINDOW * 1000;
    const key = `ratelimit:${identifier}:${req.path}`;
    const redis = getRedis();

    const multi = redis.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zcard(key);
    multi.zadd(key, now, `${now}-${Math.random()}`);
    multi.expire(key, WINDOW * 2);

    const results = await multi.exec();
    if (!results) return next();

    const count = results[1][1] as number;

    if (count >= limit) {
      const retryAfter = Math.ceil((windowStart + WINDOW * 1000 - now) / 1000);
      return next(new TooManyRequestsError(Math.max(1, retryAfter)));
    }

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count - 1));
    res.setHeader('X-RateLimit-Reset', Math.ceil((now + WINDOW * 1000) / 1000));

    next();
  } catch (err) {
    next(err);
  }
}
