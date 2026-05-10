import { authenticator } from './authenticator.js';
import { createRequestLogger } from './logger.js';
import { errorHandler } from './error-handler.js';
import { apiKeyValidator } from './api-key.js';
import { rateLimiter } from './rate-limiter.js';
import { requestValidator } from './validator.js';
import { responseCacher } from './cache.js';
import { routeConfigResolver } from './route-config.js';

export const middleware = {
  requestLogger: createRequestLogger(),
  authenticator,
  apiKeyValidator,
  routeConfigResolver,
  rateLimiter,
  requestValidator,
  responseCacher,
  errorHandler,
};
