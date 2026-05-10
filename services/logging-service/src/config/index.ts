import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
  LOGGING_PORT: z.coerce.number().int().positive().default(4004),
  MONGO_URI: z.string().url().default('mongodb://localhost:27017/logging'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid logging-service environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  logLevel: parsed.data.LOG_LEVEL,
  port: parsed.data.LOGGING_PORT,
  mongo: {
    uri: parsed.data.MONGO_URI,
  },
} as const;
