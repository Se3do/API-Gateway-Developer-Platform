import { z } from 'zod';

export const registerSchema = {
  body: z.object({
    email: z.string().email('Invalid email format').max(255).transform((e) => e.toLowerCase().trim()),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().email().transform((e) => e.toLowerCase().trim()),
    password: z.string().min(1, 'Password is required'),
  }),
};

export const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
};

export const logoutSchema = {
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
};
