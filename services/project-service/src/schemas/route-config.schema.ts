import { z } from 'zod';

export const createRouteConfigSchema = {
  body: z.object({
    path: z.string().min(1).max(200).trim(),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    service: z.enum(['auth-service', 'project-service', 'analytics-service', 'logging-service']),
    rateLimit: z.coerce.number().int().positive().max(10000).optional(),
    cacheTTL: z.coerce.number().int().min(0).max(86400).optional(),
    authRequired: z.boolean().default(true),
  }),
  params: z.object({
    projectId: z.string().uuid(),
  }),
};

export const routeConfigParamsSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};
