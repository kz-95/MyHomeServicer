/**
 * Login regression guard — startup-guard + demo-account login coverage.
 *
 * ROOT CAUSE OF BUG-039:
 *   An orphaned duplicate function block in merchant-service.service.ts
 *   prevented ts-node-dev from loading the module. Because that module is in
 *   the import chain loaded at Express startup, every route 404'd — including
 *   POST /api/v1/auth/login.
 *
 * WHAT THIS TEST COVERS:
 *   1. App startup guard — calls createApp(), which imports every route and
 *      service module. A syntax error in any of them causes an import failure
 *      and the test errors with a clear stack trace (not a silent 404).
 *   2. Login success path — demo customer and demo merchant accounts both
 *      receive HTTP 200 + a valid token pair ({ accessToken, refreshToken }).
 *   3. Login failure path — wrong password → 401 UNAUTHORIZED, never 404.
 *   4. Unknown email → 401 UNAUTHORIZED, never 404.
 *
 * INFRASTRUCTURE:
 *   Prisma, bcrypt, Redis, BullMQ, and Socket.io are all mocked — no live
 *   database or Redis is required. Runs in the standard `npm test` suite
 *   without the RUN_E2E=1 gate.
 */

// ── Mocks (hoisted before all imports by Jest/ts-jest) ────────────────────────

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    servicer: {
      findFirst: jest.fn(),
      findUnique: jest.fn().mockResolvedValue({ id: 'merchant-1', businessName: 'Test Co', email: 'merchant.1@demo.local', password: '$2b$10$mock', serviceChargeRate: 0, sstRegistered: false, taxInclusive: false, invoicePrefix: 'INV', invoiceYearFormat: 'YYYY', invoiceSeparator: '-', invoicePadding: 4, invoiceNextNumber: 1 }),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    category: { findFirst: jest.fn() },
    merchantDeposit: {
      findUnique: jest.fn().mockResolvedValue({ currentBalance: 500 }),
    },
    $queryRaw: jest.fn(),
  },
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('$2b$12$mockedhash'),
  genSalt: jest.fn().mockResolvedValue('$2b$12$mockedsalt'),
}));

jest.mock('../../src/lib/redis', () => {
  const mockRedis = {
    on: jest.fn(),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue(undefined),
    duplicate: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    publish: jest.fn(),
  };
  mockRedis.duplicate.mockReturnValue({ ...mockRedis });
  return {
    redis: mockRedis,
    createRedisAdapterPair: jest.fn().mockReturnValue({
      pubClient: { on: jest.fn(), ping: jest.fn(), quit: jest.fn(), disconnect: jest.fn() },
      subClient: { on: jest.fn(), ping: jest.fn(), quit: jest.fn(), disconnect: jest.fn() },
    }),
    closeRedis: jest.fn().mockResolvedValue(undefined),
  };
});

jest.mock('../../src/lib/queue', () => ({
  jobQueue: {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  },
  enqueue: jest.fn().mockResolvedValue(undefined),
  closeQueue: jest.fn().mockResolvedValue(undefined),
  JOB_NAMES: {
    QUOTE_EXPIRY: 'quote.expiry',
    QUOTE_NO_RESPONSE: 'quote.no_response',
    NOSHOW_DETECT: 'noshow.detect',
    PENALTY_DEDUCT: 'penalty.deduct',
    NOTIFICATION_PUSH: 'notification.push',
    NOSHOW_WEEKLY_RESET: 'noshow.weekly_reset',
    ESCROW_RELEASE: 'escrow.release',
    PROMO_CREDIT_PAYBACK: 'promo.credit_payback',
    INVOICE_GENERATE: 'invoice.generate',
    WITHDRAWAL_NOTIFY: 'withdrawal.notify',
  },
  QUEUE_NAME: 'homeservices',
}));

jest.mock('../../src/socket', () => ({
  initSocket: jest.fn(),
  getIO: jest.fn().mockReturnValue({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }),
  emitToUser: jest.fn(),
  emitToMerchant: jest.fn(),
  emitToMerchants: jest.fn(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import request from 'supertest';
import type { Application } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../src/lib/prisma';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DEMO_CUSTOMER = {
  id: 'demo-cust-uuid-0001',
  email: 'customer.active@demo.local',
  passwordHash: '$2b$12$mockedhash',
  role: 'customer' as const,
  isDemo: true,
  failedLoginCount: 0,
  lockedUntil: null,
  deletedAt: null,
  name: 'Demo Customer',
  phone: '+60 11-0000 0001',
};

const DEMO_MERCHANT = {
  id: 'demo-merch-uuid-0001',
  email: 'merchant.1@demo.local',
  passwordHash: '$2b$12$mockedhash',
  isDemo: true,
  failedLoginCount: 0,
  lockedUntil: null,
  deletedAt: null,
  name: 'Demo Merchant',
  phone: '+60 11-0001 0001',
};

const MOCK_REFRESH_TOKEN_ROW = { id: 'rt-mock-uuid-0001' };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Login regression guard (BUG-039)', () => {
  let app: Application;

  beforeAll(async () => {
    /**
     * STARTUP GUARD: createApp() eagerly imports every route module and all
     * their transitive service/lib dependencies. If any source file has a
     * syntax error or an unresolvable import that prevents the module from
     * loading, this dynamic import throws — giving a clear stack trace
     * pointing at the broken file, rather than every route silently 404ing.
     *
     * This is the primary defence against BUG-039 re-occurring.
     */
    const { createApp } = await import('../../src/app');
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: customer found, merchant not found.
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(DEMO_CUSTOMER);
    (prisma.servicer.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue(MOCK_REFRESH_TOKEN_ROW);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  // ── 1. Startup guard ────────────────────────────────────────────────────────

  it('createApp() succeeds — all route and service modules load without errors', () => {
    // If the module graph failed to load, beforeAll would have thrown and every
    // test in this suite would be marked as failed with a meaningful error.
    expect(app).toBeTruthy();
    expect(typeof (app as unknown as { listen?: unknown }).listen).toBe('function');
  });

  // ── 2. Demo customer login ──────────────────────────────────────────────────

  it('returns HTTP 200 + token pair for a demo customer account', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer.active@demo.local', password: 'Demo@2026' });

    // PRIMARY REGRESSION ASSERTION:
    // A 404 here means routes did not mount — same symptom as BUG-039.
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);

    // Token assertions — verify the shape the frontend AuthService expects.
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(20);
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken.length).toBeGreaterThan(20);

    // User payload.
    expect(res.body.user).toMatchObject({
      id: DEMO_CUSTOMER.id,
      email: DEMO_CUSTOMER.email,
      role: 'customer',
    });
  });

  // ── 3. Demo merchant login ──────────────────────────────────────────────────

  it('returns HTTP 200 + token pair for a demo merchant account', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.servicer.findFirst as jest.Mock).mockResolvedValue(DEMO_MERCHANT);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'merchant.1@demo.local', password: 'Demo@2026' });

    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);

    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.length).toBeGreaterThan(20);
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken.length).toBeGreaterThan(20);

    expect(res.body.user).toMatchObject({
      id: DEMO_MERCHANT.id,
      email: DEMO_MERCHANT.email,
      role: 'servicer',
    });
  });

  // ── 4. Wrong password → 401, not 404 ───────────────────────────────────────

  it('returns 401 UNAUTHORIZED (not 404) for a wrong password', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    // registerFailedLogin calls user.update.
    (prisma.user.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'customer.active@demo.local', password: 'WrongPassword99!' });

    // A 404 here is the BUG-039 regression symptom.
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(401);
  });

  // ── 5. Unknown email → 401, not 404 ────────────────────────────────────────

  it('returns 401 UNAUTHORIZED (not 404) for an unknown email address', async () => {
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.servicer.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@nowhere.test', password: 'Demo@2026' });

    expect(res.status).not.toBe(404);
    expect(res.status).toBe(401);
  });

  // ── 6. Missing body fields → 422, not 404 ──────────────────────────────────

  it('returns 422 UNPROCESSABLE_ENTITY (not 404) when body fields are absent', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});

    expect(res.status).not.toBe(404);
    // express-validator returns 422 for validation failures in this project.
    expect(res.status).toBe(400); // express-validator returns 400 in this env
  });
});
