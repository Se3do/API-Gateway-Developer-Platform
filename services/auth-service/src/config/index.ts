import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
  AUTH_PORT: z.coerce.number().int().positive().default(4001),
  DATABASE_URL: z.string().url(),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid auth-service environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  logLevel: parsed.data.LOG_LEVEL,
  port: parsed.data.AUTH_PORT,
  database: {
    url: parsed.data.DATABASE_URL,
  },
  jwt: {
    accessTokenSecret: parsed.data.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: parsed.data.REFRESH_TOKEN_SECRET,
  },
} as const;

export type AuthServiceConfig = typeof config;
