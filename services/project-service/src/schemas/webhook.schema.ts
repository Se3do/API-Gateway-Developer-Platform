import { z } from 'zod';
import { WEBHOOK_EVENTS } from '@api-gateway/shared';

export const createWebhookSchema = {
  body: z.object({
    name: z.string().min(1).max(100).trim(),
    url: z.string().url('Invalid webhook URL'),
    secret: z.string().min(8, 'Secret must be at least 8 characters'),
    events: z.array(z.enum(WEBHOOK_EVENTS as any)).min(1, 'At least one event is required'),
  }),
  params: z.object({
    projectId: z.string().uuid(),
  }),
};

export const updateWebhookSchema = {
  body: z.object({
    name: z.string().min(1).max(100).trim().optional(),
    url: z.string().url('Invalid webhook URL').optional(),
    secret: z.string().min(8, 'Secret must be at least 8 characters').optional(),
    events: z.array(z.enum(WEBHOOK_EVENTS as any)).min(1).optional(),
    active: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const webhookParamsSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const listWebhooksSchema = {
  params: z.object({
    projectId: z.string().uuid(),
  }),
};

export const dispatchWebhookSchema = {
  body: z.object({
    event: z.enum(WEBHOOK_EVENTS as any),
    data: z.record(z.any()),
  }),
};
