import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('debug'),
  AUTH_PORT: z.coerce.number().int().positive().default(4001),
  DATABASE_URL: z.string().url(),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  
  // OAuth configuration
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_REDIRECT_URI: z.string().url().optional(),
  
  // Email configuration
  EMAIL_DRIVER: z.enum(['mock', 'smtp']).default('mock'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  FROM_EMAIL: z.string().email().optional(),
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
  oauth: {
    google: {
      clientId: parsed.data.GOOGLE_CLIENT_ID || '',
      clientSecret: parsed.data.GOOGLE_CLIENT_SECRET || '',
      redirectUri: parsed.data.GOOGLE_REDIRECT_URI || '',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    },
    github: {
      clientId: parsed.data.GITHUB_CLIENT_ID || '',
      clientSecret: parsed.data.GITHUB_CLIENT_SECRET || '',
      redirectUri: parsed.data.GITHUB_REDIRECT_URI || '',
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
    },
  },
  email: {
    driver: parsed.data.EMAIL_DRIVER,
    smtp: {
      host: parsed.data.SMTP_HOST || 'localhost',
      port: parsed.data.SMTP_PORT || 587,
      user: parsed.data.SMTP_USER || '',
      pass: parsed.data.SMTP_PASS || '',
      secure: parsed.data.SMTP_SECURE,
    },
    fromEmail: parsed.data.FROM_EMAIL || 'noreply@api-gateway.local',
  },
} as const;

export type AuthServiceConfig = typeof config;
