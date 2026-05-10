import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '@api-gateway/shared';
import { getRedis } from '../redis.js';
import { config } from '../config/index.js';
import { httpRequest } from '../services/http-client.js';

const CACHE_TTL = 300;
const CACHE_PREFIX = 'apikey:';

export async function apiKeyValidator(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (!apiKey) {
    return next();
  }

  try {
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const redis = getRedis();
    const cached = await redis.get(CACHE_PREFIX + hash);

    let keyData: { valid: boolean; key?: { id: string; projectId: string; userId: string }; reason?: string };

    if (cached) {
      keyData = JSON.parse(cached);
    } else {
      const response = await httpRequest(
        `${config.services.project}/api/v1/keys/verify?hash=${encodeURIComponent(hash)}`
      );
      keyData = response.body;
      await redis.setex(CACHE_PREFIX + hash, CACHE_TTL, JSON.stringify(keyData));
    }

    if (!keyData.valid) {
      return next(new ForbiddenError(keyData.reason || 'Invalid API key'));
    }

    req.context.apiKey = keyData.key;
    next();
  } catch (err) {
    next(err);
  }
}
