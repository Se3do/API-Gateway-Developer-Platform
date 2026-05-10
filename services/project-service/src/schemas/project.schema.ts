import { z } from 'zod';

export const createProjectSchema = {
  body: z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
    description: z.string().max(500).trim().optional(),
  }),
};

export const updateProjectSchema = {
  body: z.object({
    name: z.string().min(2).max(100).trim().optional(),
    description: z.string().max(500).trim().optional(),
  }),
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const projectParamsSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const listProjectsSchema = {
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.enum(['name', 'createdAt', 'updatedAt']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),
};
