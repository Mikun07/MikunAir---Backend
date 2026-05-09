import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { DomainError, ValidationError, InternalError } from './domain-errors.js';
import { logger } from '../logger/index.js';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
    correlationId?: string;
  };
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = req.headers['x-correlation-id'] as string | undefined;

  if (err instanceof ZodError) {
    const fields: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.');
      if (!fields[key]) fields[key] = [];
      fields[key].push(issue.message);
    }

    const domainErr = new ValidationError(fields);
    logger.warn('Validation error', { correlationId, fields });

    const body: ErrorResponse = {
      error: { code: domainErr.code, message: domainErr.message, fields },
    };
    res.status(422).json(body);
    return;
  }

  if (err instanceof DomainError) {
    if (err.statusCode >= 500) {
      logger.error('Domain error', { correlationId, code: err.code, message: err.message });
    } else {
      logger.warn('Domain error', { correlationId, code: err.code, message: err.message });
    }

    const body: ErrorResponse = { error: { code: err.code, message: err.message } };

    if (err instanceof ValidationError) {
      body.error.fields = err.fieldErrors;
    }

    if (err.statusCode >= 500 && correlationId) {
      body.error.correlationId = correlationId;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Unexpected error — never expose stack trace (Security Rule)
  logger.error('Unexpected error', {
    correlationId,
    error: err instanceof Error ? err.message : String(err),
  });

  const internalErr = new InternalError(correlationId);
  res.status(500).json({
    error: {
      code: internalErr.code,
      message: internalErr.message,
      correlationId,
    },
  });
}
