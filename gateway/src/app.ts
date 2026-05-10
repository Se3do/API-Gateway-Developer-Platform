import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { v4 as uuid } from 'uuid';
import { middleware } from './middleware/index.js';
import { createForwarder } from './proxy/forwarder.js';
import { createRoutes } from './routes/index.js';
import { swaggerSpec } from './swagger.js';
import { config } from './config/index.js';
import type { RequestContext } from './types/index.js';
import type { Request, Response, NextFunction } from 'express';

export function createApp(eventEmitter?: (req: Request, res: Response, next: NextFunction) => void): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: config.cors.origins === '*' ? '*' : config.cors.origins.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'API Gateway Docs',
  }));

  app.use((req: any, _res: any, next: any) => {
    req.context = {
      requestId: uuid(),
      startTime: Date.now(),
    } as RequestContext;
    next();
  });

  app.use(middleware.requestLogger);
  app.use(middleware.authenticator);
  app.use(middleware.apiKeyValidator);
  app.use(middleware.routeConfigResolver);
  app.use(middleware.rateLimiter);
  app.use(middleware.requestValidator);
  app.use(middleware.responseCacher);

  app.use(createRoutes());

  const forwarder = createForwarder();
  app.use(forwarder);

  if (eventEmitter) app.use(eventEmitter);

  app.use(middleware.errorHandler);

  return app;
}
