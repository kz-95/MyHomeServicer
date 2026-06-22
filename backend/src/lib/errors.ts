/**
 * Canonical API error. The error-handling middleware converts these into the
 * documented JSON error envelope (see api-doc.md §Error format).
 */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'TOKEN_EXPIRED'
  | 'FORBIDDEN'
  | 'PIN_REQUIRED'
  | 'PIN_INVALID'
  | 'ACCOUNT_LOCKED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'PAYMENT_REQUIRED'
  | 'RATE_LIMITED'
  | 'PIN_COOLDOWN'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  field: string;
  issue: string;
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  TOKEN_EXPIRED: 401,
  FORBIDDEN: 403,
  PIN_REQUIRED: 403,
  PIN_INVALID: 403,
  ACCOUNT_LOCKED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYMENT_REQUIRED: 402,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  PIN_COOLDOWN: 429,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

// Convenience constructors
export const badRequest = (msg: string, details?: ErrorDetail[]) =>
  new ApiError('VALIDATION_ERROR', msg, details);
export const unauthorized = (msg = 'Authentication required') =>
  new ApiError('UNAUTHORIZED', msg);
export const forbidden = (msg = 'You are not permitted to perform this action') =>
  new ApiError('FORBIDDEN', msg);
export const notFound = (msg = 'Resource not found') => new ApiError('NOT_FOUND', msg);
export const conflict = (msg: string) => new ApiError('CONFLICT', msg);
export const businessRule = (msg: string) => new ApiError('BUSINESS_RULE_VIOLATION', msg);
export const paymentRequired = (msg: string) => new ApiError('PAYMENT_REQUIRED', msg);

/** Extract a human-readable message from any caught error value. */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
