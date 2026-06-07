import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async route handler so rejected promises are forwarded to the
 * Express error-handling middleware instead of crashing the process.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
