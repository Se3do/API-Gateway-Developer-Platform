import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '@api-gateway/shared';
import { ZodError } from 'zod';
import { v4 as uuid } from 'uuid';
import { logger } from './logger.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.context?.requestId || uuid();

  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      statusCode: 400,
      timestamp: new Date().toISOString(),
      requestId,
      details,
    });
    return;
  }

  if (err instanceof AppError) {
    const body: Record<string, any> = {
      error: err.code,
      message: err.message,
      statusCode: err.statusCode,
      timestamp: new Date().toISOString(),
      requestId,
    };

    if (err instanceof ValidationError) {
      body.details = err.details;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  logger.error('Unhandled error', {
    requestId,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    statusCode: 500,
    timestamp: new Date().toISOString(),
    requestId,
  });
}
