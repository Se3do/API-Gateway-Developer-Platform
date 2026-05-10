import { Request, Response, NextFunction } from 'express';
import { createLogService } from '../services/logs.service.js';
import { ingestLogSchema, queryLogsSchema } from '../schemas/logs.schema.js';
const logService = createLogService();
const zArrayIngest = ingestLogSchema.body.array();

export const logsController = {
  async ingest(req: Request, res: Response, next: NextFunction) {
    try {
      const data = ingestLogSchema.body.parse(req.body);
      await logService.ingest(data);
      res.status(201).json({ message: 'Log ingested' });
    } catch (err) { next(err); }
  },

  async ingestBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const entries = zArrayIngest.parse(req.body);
      await logService.ingestBatch(entries);
      res.status(201).json({ message: `${entries.length} logs ingested` });
    } catch (err) { next(err); }
  },

  async query(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = queryLogsSchema.query.parse(req.query);
      const result = await logService.query(filters);
      res.json(result);
    } catch (err) { next(err); }
  },

  async getByRequestId(req: Request, res: Response, next: NextFunction) {
    try {
      const entry = await logService.getByRequestId(req.params.requestId as string);
      if (!entry) { res.status(404).json({ error: 'NOT_FOUND', message: 'Log entry not found' }); return; }
      res.json(entry);
    } catch (err) { next(err); }
  },

  async getErrors(req: Request, res: Response, next: NextFunction) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const result = await logService.getErrors(page, limit);
      res.json(result);
    } catch (err) { next(err); }
  },
};
