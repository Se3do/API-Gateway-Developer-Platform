import { Request, Response, NextFunction } from 'express';
import { AppError } from '@api-gateway/shared';
import { ZodError } from 'zod';
import { randomUUID } from 'node:crypto';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).context?.requestId || randomUUID();

  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Request validation failed', statusCode: 400, timestamp: new Date().toISOString(), requestId, details });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.code, message: err.message, statusCode: err.statusCode, timestamp: new Date().toISOString(), requestId });
    return;
  }

  console.error('Unhandled error:', err.message, err.stack);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred', statusCode: 500, timestamp: new Date().toISOString(), requestId });
}
