import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
  ANALYTICS_PORT: z.coerce.number().int().positive().default(4003),
  MONGO_URI: z.string().url().default('mongodb://localhost:27017/logging'),
  GATEWAY_URL: z.string().url().default('http://gateway:3000'),
  ALERT_SECRET: z.string().default('dev-alert-secret-change-in-production'),
  ALERT_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  AUTH_SERVICE_URL: z.string().url().default('http://auth-service:4001'),
  PROJECT_SERVICE_URL: z.string().url().default('http://project-service:4002'),
  LOGGING_SERVICE_URL: z.string().url().default('http://logging-service:4004'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid analytics-service environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  logLevel: parsed.data.LOG_LEVEL,
  port: parsed.data.ANALYTICS_PORT,
  mongo: {
    uri: parsed.data.MONGO_URI,
  },
  gatewayUrl: parsed.data.GATEWAY_URL,
  alertSecret: parsed.data.ALERT_SECRET,
  alertIntervalMs: parsed.data.ALERT_INTERVAL_MS,
  authServiceUrl: parsed.data.AUTH_SERVICE_URL,
  projectServiceUrl: parsed.data.PROJECT_SERVICE_URL,
  loggingServiceUrl: parsed.data.LOGGING_SERVICE_URL,
} as const;
