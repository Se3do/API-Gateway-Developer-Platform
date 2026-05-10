import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
  PROJECT_PORT: z.coerce.number().int().positive().default(4002),
  DATABASE_URL: z.string().url(),
  ACCESS_TOKEN_SECRET: z.string().min(32).default('dev-access-token-secret-min-32-chars!!'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid project-service environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  env: parsed.data.NODE_ENV,
  logLevel: parsed.data.LOG_LEVEL,
  port: parsed.data.PROJECT_PORT,
  database: {
    url: parsed.data.DATABASE_URL,
  },
  jwt: {
    accessTokenSecret: parsed.data.ACCESS_TOKEN_SECRET,
  },
} as const;
