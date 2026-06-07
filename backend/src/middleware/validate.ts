import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationChain } from 'express-validator';
import { ApiError, ErrorDetail } from '../lib/errors';

/**
 * Runs a set of express-validator chains and converts any failures into the
 * documented VALIDATION_ERROR envelope. Use on every POST and PATCH route.
 */
export function validate(chains: ValidationChain[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    for (const chain of chains) {
      await chain.run(req);
    }
    const result = validationResult(req);
    if (result.isEmpty()) {
      next();
      return;
    }
    const details: ErrorDetail[] = result.array().map((e) => ({
      field: e.type === 'field' ? e.path : e.type,
      issue: e.msg,
    }));
    next(new ApiError('VALIDATION_ERROR', 'Request validation failed', details));
  };
}
