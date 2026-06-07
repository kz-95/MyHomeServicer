import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { logger } from '../lib/logger';

/** 404 handler for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.path}` },
  });
}

/**
 * Central error handler. Converts ApiError, Prisma errors, and unexpected
 * exceptions into the documented JSON error envelope.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'A record with these values already exists' },
      });
      return;
    }
    logger.error('Prisma error', { code: err.code, path: req.path });
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid database operation' } });
    return;
  }

  logger.error('Unhandled error', {
    message: (err as Error)?.message,
    stack: (err as Error)?.stack,
    path: req.path,
  });
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
