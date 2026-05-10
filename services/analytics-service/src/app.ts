import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use((_req: any, _res: any, next: any) => {
    next();
  });

  app.use(createRoutes());
  app.use(errorHandler);

  return app;
}
