import { z } from 'zod';

export const ingestLogSchema = {
  body: z.object({
    requestId: z.string().uuid(),
    timestamp: z.string().datetime().optional(),
    method: z.string().max(10),
    path: z.string().max(2000),
    statusCode: z.number().int(),
    latency: z.number().min(0),
    ip: z.string().max(45),
    userId: z.string().nullable().optional(),
    apiKeyId: z.string().nullable().optional(),
    userAgent: z.string().max(500).optional().default(''),
    contentLength: z.number().int().min(0).optional().default(0),
    error: z.object({
      code: z.string(),
      message: z.string(),
      stack: z.string().nullable().optional(),
    }).nullable().optional(),
  }),
};

export const queryLogsSchema = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    userId: z.string().optional(),
    statusCode: z.coerce.number().int().optional(),
    method: z.string().max(10).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),
};
