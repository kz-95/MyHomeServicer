/**
 * Jest configuration. Unit tests run with no external dependencies; the
 * end-to-end suite (tests/e2e) is gated behind RUN_E2E=1 and needs a live
 * Postgres + Redis stack with seeded data.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
  clearMocks: true,
  testTimeout: 30000,
  setupFiles: ['<rootDir>/tests/jest.setup.ts'],
};
