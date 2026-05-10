import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAuthService } from '../services/auth.service.js';
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from '../schemas/auth.schema.js';

export function createAuthController(prisma: PrismaClient) {
  const authService = createAuthService(prisma);

  async function register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name } = registerSchema.body.parse(req.body);
      const result = await authService.register(email, password, name);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = loginSchema.body.parse(req.body);
      const result = await authService.login(email, password);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = refreshSchema.body.parse(req.body);
      const result = await authService.refresh(refreshToken);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = logoutSchema.body.parse(req.body);
      const result = await authService.logout(req.context.user!.userId, refreshToken);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  async function getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const profile = await authService.getProfile(req.context.user!.userId);
      res.status(200).json(profile);
    } catch (err) {
      next(err);
    }
  }

  return { register, login, refresh, logout, getProfile };
}
