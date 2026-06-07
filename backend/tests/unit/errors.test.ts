import { ApiError, badRequest, notFound, conflict, businessRule, forbidden } from '../../src/lib/errors';

describe('ApiError', () => {
  it('maps each error code to the documented HTTP status', () => {
    expect(new ApiError('VALIDATION_ERROR', 'x').status).toBe(400);
    expect(new ApiError('UNAUTHORIZED', 'x').status).toBe(401);
    expect(new ApiError('TOKEN_EXPIRED', 'x').status).toBe(401);
    expect(new ApiError('FORBIDDEN', 'x').status).toBe(403);
    expect(new ApiError('PIN_REQUIRED', 'x').status).toBe(403);
    expect(new ApiError('NOT_FOUND', 'x').status).toBe(404);
    expect(new ApiError('CONFLICT', 'x').status).toBe(409);
    expect(new ApiError('BUSINESS_RULE_VIOLATION', 'x').status).toBe(422);
    expect(new ApiError('RATE_LIMITED', 'x').status).toBe(429);
    expect(new ApiError('INTERNAL_ERROR', 'x').status).toBe(500);
  });

  it('carries optional validation details', () => {
    const err = new ApiError('VALIDATION_ERROR', 'bad', [{ field: 'email', issue: 'invalid' }]);
    expect(err.details).toHaveLength(1);
    expect(err.details?.[0].field).toBe('email');
  });

  it('is an instance of Error', () => {
    expect(new ApiError('NOT_FOUND', 'x')).toBeInstanceOf(Error);
  });
});

describe('error constructors', () => {
  it('produce the right code + status', () => {
    expect(badRequest('x').code).toBe('VALIDATION_ERROR');
    expect(notFound().code).toBe('NOT_FOUND');
    expect(notFound().status).toBe(404);
    expect(conflict('x').code).toBe('CONFLICT');
    expect(businessRule('x').status).toBe(422);
    expect(forbidden().status).toBe(403);
  });
});
