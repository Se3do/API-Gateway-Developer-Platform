import { z } from 'zod';

export const analyticsQuerySchema = {
  query: z.object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    interval: z.enum(['hour', 'day']).default('day'),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),
};
