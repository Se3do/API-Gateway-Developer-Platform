import { z } from 'zod';
import { ALERT_METRICS, ALERT_OPERATORS } from '@api-gateway/shared';

export const alertRuleSchema = {
  create: z.object({
    name: z.string().min(1).max(100).trim(),
    description: z.string().max(500).optional(),
    service: z.string().min(1).max(50).trim(),
    metric: z.enum(ALERT_METRICS as [string, ...string[]]),
    windowSeconds: z.number().int().min(10).max(86400),
    threshold: z.number(),
    operator: z.enum(ALERT_OPERATORS as [string, ...string[]]),
    enabled: z.boolean().optional(),
    coolDownSeconds: z.number().int().min(0).max(86400).optional(),
  }),
  update: z.object({
    name: z.string().min(1).max(100).trim().optional(),
    description: z.string().max(500).optional(),
    service: z.string().min(1).max(50).trim().optional(),
    metric: z.enum(ALERT_METRICS as [string, ...string[]]).optional(),
    windowSeconds: z.number().int().min(10).max(86400).optional(),
    threshold: z.number().optional(),
    operator: z.enum(ALERT_OPERATORS as [string, ...string[]]).optional(),
    enabled: z.boolean().optional(),
    coolDownSeconds: z.number().int().min(0).max(86400).optional(),
  }),
  params: z.object({
    id: z.string().regex(/^[a-f\d]{24}$/i),
  }),
};

export const alertEventQuerySchema = z.object({
  acknowledged: z.coerce.boolean().optional(),
  severity: z.enum(['warning', 'critical']).optional(),
  service: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const acknowledgeSchema = z.object({
  acknowledgedBy: z.string().min(1).max(100).optional(),
});
