import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';
import { createRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';

export function createApp(prisma: PrismaClient): express.Application {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'auth-service',
      timestamp: new Date().toISOString(),
    });
  });

  app.use(createRoutes(prisma));
  app.use(errorHandler);

  return app;
}
