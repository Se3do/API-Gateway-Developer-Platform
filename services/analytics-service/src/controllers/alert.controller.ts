import { Request, Response, NextFunction } from 'express';
import { AlertRule } from '../models/alert-rule.model.js';
import { AlertEvent } from '../models/alert-event.model.js';
import { alertRuleSchema, alertEventQuerySchema, acknowledgeSchema } from '../schemas/alert.schema.js';

export const alertController = {
  async createRule(req: Request, res: Response, next: NextFunction) {
    try {
      const data = alertRuleSchema.create.parse(req.body);
      const rule = await AlertRule.create(data);
      res.status(201).json(rule);
    } catch (err) { next(err); }
  },

  async listRules(_req: Request, res: Response, next: NextFunction) {
    try {
      const rules = await AlertRule.find().sort({ createdAt: -1 }).lean();
      res.json(rules);
    } catch (err) { next(err); }
  },

  async getRule(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = alertRuleSchema.params.parse(req.params);
      const rule = await AlertRule.findById(id).lean();
      if (!rule) { res.status(404).json({ error: 'NOT_FOUND', message: 'Alert rule not found' }); return; }
      res.json(rule);
    } catch (err) { next(err); }
  },

  async updateRule(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = alertRuleSchema.params.parse(req.params);
      const data = alertRuleSchema.update.parse(req.body);
      const rule = await AlertRule.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true }).lean();
      if (!rule) { res.status(404).json({ error: 'NOT_FOUND', message: 'Alert rule not found' }); return; }
      res.json(rule);
    } catch (err) { next(err); }
  },

  async deleteRule(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = alertRuleSchema.params.parse(req.params);
      const rule = await AlertRule.findByIdAndDelete(id).lean();
      if (!rule) { res.status(404).json({ error: 'NOT_FOUND', message: 'Alert rule not found' }); return; }
      res.status(204).send();
    } catch (err) { next(err); }
  },

  async listEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const query = alertEventQuerySchema.parse(req.query);
      const filter: Record<string, any> = {};
      if (query.acknowledged !== undefined) filter.acknowledged = query.acknowledged;
      if (query.severity) filter.severity = query.severity;
      if (query.service) filter.service = query.service;
      if (query.from || query.to) {
        filter.timestamp = {};
        if (query.from) filter.timestamp.$gte = new Date(query.from);
        if (query.to) filter.timestamp.$lte = new Date(query.to);
      }

      const [events, total] = await Promise.all([
        AlertEvent.find(filter).sort({ timestamp: -1 }).skip(query.offset).limit(query.limit).lean(),
        AlertEvent.countDocuments(filter),
      ]);

      res.json({ events, total, limit: query.limit, offset: query.offset });
    } catch (err) { next(err); }
  },

  async acknowledgeEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = alertRuleSchema.params.parse(req.params);
      const data = acknowledgeSchema.parse(req.body);
      const event = await AlertEvent.findByIdAndUpdate(
        id,
        { $set: { acknowledged: true, acknowledgedBy: data.acknowledgedBy || 'unknown', acknowledgedAt: new Date() } },
        { new: true },
      ).lean();
      if (!event) { res.status(404).json({ error: 'NOT_FOUND', message: 'Alert event not found' }); return; }
      res.json(event);
    } catch (err) { next(err); }
  },
};
