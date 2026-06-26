/**
 * Unit tests - booking background jobs:
 *   noshow.detect  - threshold-based auto-ban, counter reset on arrival
 *   penalty.deduct - idempotency guard, percentage vs flat calculation
 *   escrow.release - open-report hold, fee math, merchant payout
 *
 * All infrastructure (Prisma, Redis/queue, socket, notification, ledger,
 * settings) is mocked. Handlers are accessed by calling register() and then
 * getHandler() from the jobs registry.
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPrisma = {
  booking: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  servicer: {
    update: jest.fn(),
  },
  user: {
    update: jest.fn().mockResolvedValue({ creditBalance: 110 }),
  },
  escrow: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  penaltyLog: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  penaltyRule: {
    findFirst: jest.fn(),
  },
  servicerDeposit: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  report: {
    findFirst: jest.fn(),
  },
  dispute: {
    findFirst: jest.fn(),
  },
  feeRule: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  $transaction: jest.fn(),
};

jest.mock('../../src/lib/prisma', () => ({ prisma: mockPrisma }));

const mockEnqueue = jest.fn();
jest.mock('../../src/lib/queue', () => ({
  enqueue: mockEnqueue,
  JOB_NAMES: {
    NOSHOW_DETECT: 'noshow.detect',
    PENALTY_DEDUCT: 'penalty.deduct',
    ESCROW_RELEASE: 'escrow.release',
    PROMO_CREDIT_PAYBACK: 'promo.credit_payback',
    INVOICE_GENERATE: 'invoice.generate',
    NOTIFICATION_PUSH: 'notification.push',
    QUOTE_EXPIRY: 'quote.expiry',
    QUOTE_NO_RESPONSE: 'quote.no_response',
    NOSHOW_WEEKLY_RESET: 'noshow.weekly_reset',
    WITHDRAWAL_NOTIFY: 'withdrawal.notify',
  },
}));

const mockEmitToUser = jest.fn();
jest.mock('../../src/socket', () => ({ emitToUser: mockEmitToUser, emitToMerchant: jest.fn() }));
jest.mock('../../src/services/notification.service', () => ({ notify: jest.fn() }));
jest.mock('../../src/services/ledger.service', () => ({
  recordTransaction: jest.fn().mockResolvedValue('txn-id'),
}));
jest.mock('../../src/services/settings.service', () => ({
  getPlatformFeeRate: jest.fn().mockResolvedValue(0.05),
  getSetting: jest.fn().mockImplementation((key: string) => {
    const defaults: Record<string, number> = {
      points_per_rm: 1,
      points_per_review: 50,
      redemption_rate: 100,
    };
    return Promise.resolve(defaults[key] ?? null);
  }),
}));

// ── Job registry + handler retrieval ─────────────────────────────────────────

import { register } from '../../src/jobs/booking.jobs';
import { getHandler } from '../../src/jobs/index';

// Register all handlers once before any test runs.
beforeAll(() => {
  register();
});

/** Build a minimal mock BullMQ Job. */
function makeJob(data: Record<string, unknown>) {
  return { data, id: 'test-job', name: 'test', opts: {} } as unknown as import('bullmq').Job;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    userId: '00000000-0000-0000-0000-000000000003',
    servicerId: '00000000-0000-0000-0000-000000000002',
    quoteRequestId: '00000000-0000-0000-0000-000000000004',
    status: 'confirmed',
    paymentMode: 'pay_now',
    price: 100,
    scheduledDate: new Date(),
    timeSlot: 'morning',
    cashConfirmed: false,
    ...overrides,
  };
}

function makeEscrow(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000005',
    bookingId: '00000000-0000-0000-0000-000000000001',
    status: 'held',
    amount: 100,
    tipAmount: 0,
    ...overrides,
  };
}

// ── noshow.detect ─────────────────────────────────────────────────────────────

describe('noshow.detect handler', () => {
  const JOB = { bookingId: '00000000-0000-0000-0000-000000000001', servicerId: '00000000-0000-0000-0000-000000000002' };

  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    mockPrisma.escrow.findUnique.mockResolvedValue(null);
    mockEnqueue.mockResolvedValue(undefined);
  });

  it('resets consecutive counter and returns when merchant already arrived (in_progress)', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ status: 'in_progress' }));
    mockPrisma.servicer.update.mockResolvedValue({ consecutiveNoshow: 0, weeklyNoshow: 1 });

    const handler = getHandler('noshow.detect');
    await handler(makeJob(JOB));

    expect(mockPrisma.servicer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { consecutiveNoshow: 0 } }),
    );
    // Booking should NOT be cancelled.
    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('resets consecutive counter and returns when merchant completed the job', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ status: 'completed' }));
    mockPrisma.servicer.update.mockResolvedValue({ consecutiveNoshow: 0, weeklyNoshow: 0 });

    const handler = getHandler('noshow.detect');
    await handler(makeJob(JOB));

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
  });

  it('is a no-op when booking is already cancelled', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ status: 'cancelled' }));

    const handler = getHandler('noshow.detect');
    await handler(makeJob(JOB));

    expect(mockPrisma.booking.update).not.toHaveBeenCalled();
    expect(mockPrisma.servicer.update).not.toHaveBeenCalled();
  });

  it('cancels booking and increments no-show counters when merchant never arrived', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    mockPrisma.booking.update.mockResolvedValue(makeBooking({ status: 'cancelled' }));
    mockPrisma.servicer.update.mockResolvedValue({ consecutiveNoshow: 1, weeklyNoshow: 1 });

    const handler = getHandler('noshow.detect');
    await handler(makeJob(JOB));

    expect(mockPrisma.booking.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'cancelled' }) }),
    );
    expect(mockPrisma.servicer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { consecutiveNoshow: { increment: 1 }, weeklyNoshow: { increment: 1 } },
      }),
    );
    expect(mockEnqueue).toHaveBeenCalledWith(
      'penalty.deduct',
      expect.objectContaining({ penaltyType: 'noshow' }),
      expect.any(Object),
    );
  });

  it('auto-bans merchant when consecutiveNoshow reaches threshold (3)', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    mockPrisma.booking.update.mockResolvedValue(makeBooking({ status: 'cancelled' }));
    // Merchant reaches the 3-consecutive threshold.
    mockPrisma.servicer.update
      .mockResolvedValueOnce({ consecutiveNoshow: 3, weeklyNoshow: 1 }) // increment call
      .mockResolvedValueOnce({ isBanned: true }); // ban call

    const handler = getHandler('noshow.detect');
    await handler(makeJob(JOB));

    // Second update should set isBanned: true.
    expect(mockPrisma.servicer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isBanned: true } }),
    );
  });

  it('auto-bans merchant when weeklyNoshow reaches threshold (5)', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    mockPrisma.booking.update.mockResolvedValue(makeBooking({ status: 'cancelled' }));
    // Weekly threshold hit (consecutive < 3, but weekly = 5).
    mockPrisma.servicer.update
      .mockResolvedValueOnce({ consecutiveNoshow: 1, weeklyNoshow: 5 })
      .mockResolvedValueOnce({ isBanned: true });

    const handler = getHandler('noshow.detect');
    await handler(makeJob(JOB));

    expect(mockPrisma.servicer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isBanned: true } }),
    );
  });

  it('does NOT auto-ban below threshold (consecutive=2, weekly=4)', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    mockPrisma.booking.update.mockResolvedValue(makeBooking({ status: 'cancelled' }));
    mockPrisma.servicer.update.mockResolvedValue({ consecutiveNoshow: 2, weeklyNoshow: 4 });

    const handler = getHandler('noshow.detect');
    await handler(makeJob(JOB));

    // Should only be called once (the increment), not a second time to ban.
    const banCall = mockPrisma.servicer.update.mock.calls.find(
      (args: unknown[]) =>
        (args[0] as Record<string, unknown>)?.data &&
        ((args[0] as { data: { isBanned?: boolean } }).data.isBanned === true),
    );
    expect(banCall).toBeUndefined();
  });

  it('refunds held escrow on a no-show', async () => {
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    mockPrisma.booking.update.mockResolvedValue(makeBooking({ status: 'cancelled' }));
    mockPrisma.escrow.findUnique.mockResolvedValue(makeEscrow({ status: 'held' }));
    mockPrisma.servicer.update.mockResolvedValue({ consecutiveNoshow: 1, weeklyNoshow: 1 });

    const handler = getHandler('noshow.detect');
    await handler(makeJob(JOB));

    expect(mockPrisma.escrow.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'refunded' }) }),
    );
  });
});

// ── penalty.deduct ────────────────────────────────────────────────────────────

describe('penalty.deduct handler', () => {
  const JOB_NOSHOW = { bookingId: '00000000-0000-0000-0000-000000000001', servicerId: '00000000-0000-0000-0000-000000000002', penaltyType: 'noshow' };
  const JOB_CANCEL = { bookingId: '00000000-0000-0000-0000-000000000001', servicerId: '00000000-0000-0000-0000-000000000002', penaltyType: 'cancel' };

  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    mockPrisma.servicerDeposit.findUnique.mockResolvedValue({
      id: 'dep-1',
      servicerId: '00000000-0000-0000-0000-000000000002',
      currentBalance: 500,
    });
    mockPrisma.penaltyLog.create.mockResolvedValue({});
  });

  it('is idempotent - skips if a penalty log already exists for the booking', async () => {
    mockPrisma.penaltyLog.findFirst.mockResolvedValue({ id: 'existing-penalty' });

    const handler = getHandler('penalty.deduct');
    await handler(makeJob(JOB_NOSHOW));

    expect(mockPrisma.servicerDeposit.update).not.toHaveBeenCalled();
    expect(mockPrisma.penaltyLog.create).not.toHaveBeenCalled();
  });

  it('is a no-op when no active penalty rule exists for the type', async () => {
    mockPrisma.penaltyLog.findFirst.mockResolvedValue(null);
    mockPrisma.penaltyRule.findFirst.mockResolvedValue(null);

    const handler = getHandler('penalty.deduct');
    await handler(makeJob(JOB_NOSHOW));

    expect(mockPrisma.servicerDeposit.update).not.toHaveBeenCalled();
  });

  it('deducts a flat amount for calcMode="flat"', async () => {
    mockPrisma.penaltyLog.findFirst.mockResolvedValue(null);
    mockPrisma.penaltyRule.findFirst.mockResolvedValue({
      id: 'rule-1',
      type: 'noshow',
      calcMode: 'flat',
      amount: 50,
      isActive: true,
    });
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ price: 120 }));

    const handler = getHandler('penalty.deduct');
    await handler(makeJob(JOB_NOSHOW));

    expect(mockPrisma.servicerDeposit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { currentBalance: { decrement: 50 } },
      }),
    );
  });

  it('deducts a percentage amount for calcMode="percentage" (10% of RM 120 = RM 12)', async () => {
    mockPrisma.penaltyLog.findFirst.mockResolvedValue(null);
    mockPrisma.penaltyRule.findFirst.mockResolvedValue({
      id: 'rule-2',
      type: 'cancel',
      calcMode: 'percentage',
      amount: 10, // 10%
      isActive: true,
    });
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking({ price: 120 }));

    const handler = getHandler('penalty.deduct');
    await handler(makeJob(JOB_CANCEL));

    // Math.round(120 * 10) / 100 = 12
    expect(mockPrisma.servicerDeposit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { currentBalance: { decrement: 12 } },
      }),
    );
  });

  it('creates a PenaltyLog row after deducting', async () => {
    mockPrisma.penaltyLog.findFirst.mockResolvedValue(null);
    mockPrisma.penaltyRule.findFirst.mockResolvedValue({
      id: 'rule-1',
      type: 'noshow',
      calcMode: 'flat',
      amount: 30,
      isActive: true,
    });
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());

    const handler = getHandler('penalty.deduct');
    await handler(makeJob(JOB_NOSHOW));

    expect(mockPrisma.penaltyLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bookingId: '00000000-0000-0000-0000-000000000001',
          servicerId: '00000000-0000-0000-0000-000000000002',
          type: 'noshow',
          amountDeducted: 30,
        }),
      }),
    );
  });
});

// ── escrow.release ────────────────────────────────────────────────────────────

describe('escrow.release handler', () => {
  const JOB = { bookingId: '00000000-0000-0000-0000-000000000001', escrowId: '00000000-0000-0000-0000-000000000005' };
  const { getPlatformFeeRate } = require('../../src/services/settings.service');

  beforeEach(() => {
    mockPrisma.$transaction.mockImplementation(
      async (cb: (tx: typeof mockPrisma) => Promise<unknown>) => cb(mockPrisma),
    );
    mockPrisma.booking.findUnique.mockResolvedValue(makeBooking());
    mockPrisma.report.findFirst.mockResolvedValue(null);
    mockEnqueue.mockResolvedValue(undefined);
  });

  it('is a no-op when escrow does not exist', async () => {
    mockPrisma.escrow.findUnique.mockResolvedValue(null);

    const handler = getHandler('escrow.release');
    await handler(makeJob(JOB));

    expect(mockPrisma.escrow.update).not.toHaveBeenCalled();
  });

  it('is a no-op when escrow is already released', async () => {
    mockPrisma.escrow.findUnique.mockResolvedValue(makeEscrow({ status: 'released' }));

    const handler = getHandler('escrow.release');
    await handler(makeJob(JOB));

    expect(mockPrisma.escrow.update).not.toHaveBeenCalled();
  });

  it('re-enqueues with a 1h delay when there is an open report', async () => {
    mockPrisma.escrow.findUnique.mockResolvedValue(makeEscrow({ status: 'held' }));
    mockPrisma.report.findFirst.mockResolvedValue({ id: 'report-1', status: 'open' });

    const handler = getHandler('escrow.release');
    await handler(makeJob(JOB));

    expect(mockEnqueue).toHaveBeenCalledWith(
      'escrow.release',
      expect.objectContaining({ bookingId: '00000000-0000-0000-0000-000000000001', escrowId: '00000000-0000-0000-0000-000000000005' }),
      expect.objectContaining({ delay: 60 * 60_000 }),
    );
    expect(mockPrisma.escrow.update).not.toHaveBeenCalled();
  });

  it('calculates merchant payout correctly: amount − fee + tip (5% fee, no tip)', async () => {
    mockPrisma.escrow.findUnique.mockResolvedValue(makeEscrow({ amount: 100, tipAmount: 0 }));
    (getPlatformFeeRate as jest.Mock).mockResolvedValue(0.05);

    const handler = getHandler('escrow.release');
    await handler(makeJob(JOB));

    // fee = Math.round(100 * 0.05 * 100) / 100 = 5.00; payout = 100 - 5 + 0 = 95
    const { recordTransaction } = require('../../src/services/ledger.service');
    const releaseCalls = (recordTransaction as jest.Mock).mock.calls.filter(
      (args: unknown[]) => (args[0] as { type: string }).type === 'escrow_release',
    );
    expect(releaseCalls).toHaveLength(1);
    expect(releaseCalls[0][0].amount).toBe(95);
  });

  it('includes tip in the merchant payout', async () => {
    // amount includes tip; platformFeeBase is the pre-tip base for fee calc
    mockPrisma.escrow.findUnique.mockResolvedValue(makeEscrow({ amount: 120, tipAmount: 20, platformFeeBase: 100 }));
    (getPlatformFeeRate as jest.Mock).mockResolvedValue(0.05);

    const handler = getHandler('escrow.release');
    await handler(makeJob(JOB));

    // fee = 100 * 0.05 = 5; payout = 120 - 5 = 115
    const { recordTransaction } = require('../../src/services/ledger.service');
    const releaseCalls = (recordTransaction as jest.Mock).mock.calls.filter(
      (args: unknown[]) => (args[0] as { type: string }).type === 'escrow_release',
    );
    expect(releaseCalls[releaseCalls.length - 1][0].amount).toBe(115);
  });

  it('splits off the platform fee as a separate transaction', async () => {
    mockPrisma.escrow.findUnique.mockResolvedValue(makeEscrow({ amount: 200, tipAmount: 0 }));
    (getPlatformFeeRate as jest.Mock).mockResolvedValue(0.1); // 10%

    const handler = getHandler('escrow.release');
    await handler(makeJob(JOB));

    // fee = 20; payout = 180
    const { recordTransaction } = require('../../src/services/ledger.service');
    const feeCalls = (recordTransaction as jest.Mock).mock.calls.filter(
      (args: unknown[]) => (args[0] as { type: string }).type === 'platform_fee',
    );
    expect(feeCalls.length).toBeGreaterThan(0);
    expect(feeCalls[feeCalls.length - 1][0].amount).toBe(20);
  });

  it('marks escrow as released', async () => {
    mockPrisma.escrow.findUnique.mockResolvedValue(makeEscrow({ status: 'held' }));

    const handler = getHandler('escrow.release');
    await handler(makeJob(JOB));

    expect(mockPrisma.escrow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'released' }),
      }),
    );
  });

  it('enqueues promo_credit_payback after release', async () => {
    mockPrisma.escrow.findUnique.mockResolvedValue(makeEscrow({ status: 'held' }));

    const handler = getHandler('escrow.release');
    await handler(makeJob(JOB));

    expect(mockEnqueue).toHaveBeenCalledWith(
      'promo.credit_payback',
      expect.objectContaining({ bookingId: '00000000-0000-0000-0000-000000000001' }),
      expect.any(Object),
    );
  });
});
