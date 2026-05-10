import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
  GATEWAY_PORT: z.coerce.number().int().positive().default(3000),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  AUTH_SERVICE_URL: z.string().url().default('http://localhost:4001'),
  PROJECT_SERVICE_URL: z.string().url().default('http://localhost:4002'),
  ANALYTICS_SERVICE_URL: z.string().url().default('http://localhost:4003'),
  LOGGING_SERVICE_URL: z.string().url().default('http://localhost:4004'),
  CORS_ORIGINS: z.string().default('*'),
  ALERT_SECRET: z.string().default('dev-alert-secret-change-in-production'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid gateway environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  logLevel: parsed.data.LOG_LEVEL,
  port: parsed.data.GATEWAY_PORT,
  redis: {
    url: parsed.data.REDIS_URL,
  },
  jwt: {
    accessTokenSecret: parsed.data.ACCESS_TOKEN_SECRET,
  },
  services: {
    auth: parsed.data.AUTH_SERVICE_URL,
    project: parsed.data.PROJECT_SERVICE_URL,
    analytics: parsed.data.ANALYTICS_SERVICE_URL,
    logging: parsed.data.LOGGING_SERVICE_URL,
  },
  cors: {
    origins: parsed.data.CORS_ORIGINS,
  },
  alertSecret: parsed.data.ALERT_SECRET,
} as const;

export type GatewayConfig = typeof config;
