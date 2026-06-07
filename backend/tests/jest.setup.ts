/**
 * Jest global setup — runs before every test file via jest.config.js setupFiles.
 * Sets the minimum env vars needed to satisfy the Zod validator in config/env.ts
 * so unit tests can import service modules without the process exiting.
 * No real database or Redis connection is made in unit tests (those modules are
 * mocked in each test file individually).
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars';
process.env.REFRESH_SECRET = 'test-refresh-secret-at-least-16-chars';
process.env.APP_URL = 'http://localhost:4200';
