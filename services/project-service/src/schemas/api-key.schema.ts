import { z } from 'zod';

export const createApiKeySchema = {
  body: z.object({
    name: z.string().min(1, 'Name is required').max(100).trim(),
    expiresInDays: z.coerce.number().int().positive().max(365).optional(),
  }),
  params: z.object({
    projectId: z.string().uuid(),
  }),
};

export const listApiKeysSchema = {
  params: z.object({
    projectId: z.string().uuid(),
  }),
};

export const revokeApiKeySchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const verifyApiKeySchema = {
  query: z.object({
    hash: z.string().min(1),
  }),
};
