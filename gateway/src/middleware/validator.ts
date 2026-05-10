import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '@api-gateway/shared';

interface ValidationSchemas {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

const registry = new Map<string, ValidationSchemas>();

export function registerSchema(method: string, path: string, schemas: ValidationSchemas) {
  registry.set(`${method}:${path}`, schemas);
}

export function requestValidator(req: Request, _res: Response, next: NextFunction) {
  const key = `${req.method}:${req.path}`;
  const schemas = registry.get(key);
  if (!schemas) return next();

  try {
    const errors: Array<{ field: string; message: string; code: string }> = [];

    if (schemas.body) {
      try {
        req.body = schemas.body.parse(req.body);
      } catch (e) {
        if (e instanceof ZodError) {
          errors.push(...e.errors.map((err) => ({
            field: `body.${err.path.join('.')}`,
            message: err.message,
            code: err.code,
          })));
        }
      }
    }

    if (schemas.params) {
      try {
        req.params = schemas.params.parse(req.params) as any;
      } catch (e) {
        if (e instanceof ZodError) {
          errors.push(...e.errors.map((err) => ({
            field: `params.${err.path.join('.')}`,
            message: err.message,
            code: err.code,
          })));
        }
      }
    }

    if (schemas.query) {
      try {
        req.query = schemas.query.parse(req.query) as any;
      } catch (e) {
        if (e instanceof ZodError) {
          errors.push(...e.errors.map((err) => ({
            field: `query.${err.path.join('.')}`,
            message: err.message,
            code: err.code,
          })));
        }
      }
    }

    if (errors.length > 0) {
      return next(new ValidationError(errors));
    }

    next();
  } catch (err) {
    next(err);
  }
}
