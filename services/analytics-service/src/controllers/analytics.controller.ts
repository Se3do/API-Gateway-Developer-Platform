import { Request, Response, NextFunction } from 'express';
import { createAnalyticsService } from '../services/analytics.service.js';
import { analyticsQuerySchema } from '../schemas/analytics.schema.js';

const analyticsService = createAnalyticsService();

export const analyticsController = {
  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to } = analyticsQuerySchema.query.parse(req.query);
      const data = await analyticsService.getSummary(from, to);
      res.json(data);
    } catch (err) { next(err); }
  },

  async getRequestsOverTime(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to, interval } = analyticsQuerySchema.query.parse(req.query);
      const data = await analyticsService.getRequestsOverTime(from, to, interval);
      res.json(data);
    } catch (err) { next(err); }
  },

  async getErrorRate(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to } = analyticsQuerySchema.query.parse(req.query);
      const data = await analyticsService.getErrorRate(from, to);
      res.json(data);
    } catch (err) { next(err); }
  },

  async getLatency(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to } = analyticsQuerySchema.query.parse(req.query);
      const data = await analyticsService.getLatencyPercentiles(from, to);
      res.json(data);
    } catch (err) { next(err); }
  },

  async getTopEndpoints(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to, limit } = analyticsQuerySchema.query.parse(req.query);
      const data = await analyticsService.getTopEndpoints(from, to, limit);
      res.json(data);
    } catch (err) { next(err); }
  },

  async getTopUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to, limit } = analyticsQuerySchema.query.parse(req.query);
      const data = await analyticsService.getTopUsers(from, to, limit);
      res.json(data);
    } catch (err) { next(err); }
  },

  async getApiKeyUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const { from, to, limit } = analyticsQuerySchema.query.parse(req.query);
      const data = await analyticsService.getApiKeyUsage(from, to, limit);
      res.json(data);
    } catch (err) { next(err); }
  },
};
