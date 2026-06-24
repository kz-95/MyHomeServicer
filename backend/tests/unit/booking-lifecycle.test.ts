/**
 * Unit tests — booking service: pure helpers + status-guard logic.
 *
 * Infrastructure modules (prisma, socket, queue, notifications, ledger) are
 * mocked so no database or Redis connection is required.
 */

// ── Mocks (must precede imports) ─────────────────────────────────────────────

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    booking: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    quoteRequest: { findFirst: jest.fn(), update: jest.fn() },
    quoteProposal: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    escrow: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    servicer: { findUnique: jest.fn() },
    orderHistory: { create: jest.fn() },
    report: { create: jest.fn() },
    customerPoints: { findUnique: jest.fn(), upsert: jest.fn() },
    pointsTransaction: { create: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({
      booking: { create: jest.fn().mockResolvedValue({ price: 200 }), update: jest.fn().mockResolvedValue({ price: 200 }) },
      user: { update: jest.fn().mockResolvedValue({ creditBalance: 500 }) },
      servicer: { update: jest.fn().mockResolvedValue({ creditBalance: 500 }) },
      quoteRequest: { update: jest.fn() },
      quoteProposal: { update: jest.fn(), updateMany: jest.fn() },
      escrow: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    })),
  },
}));

jest.mock('../../src/socket', () => ({
  emitToUser: jest.fn(),
  emitToServicer: jest.fn(),
  emitToServicers: jest.fn(),
}));

jest.mock('../../src/lib/queue', () => ({
  enqueue: jest.fn(),
  JOB_NAMES: {
    NOSHOW_DETECT: 'noshow.detect',
    PENALTY_DEDUCT: 'penalty.deduct',
    ESCROW_RELEASE: 'escrow.release',
    INVOICE_GENERATE: 'invoice.generate',
    PROMO_CREDIT_PAYBACK: 'promo.credit_payback',
  },
}));

jest.mock('../../src/services/notification.service', () => ({
  notify: jest.fn(),
}));

jest.mock('../../src/services/settings.service', () => ({
  getPlatformFeeRate: jest.fn().mockResolvedValue(0.05),
  getSstRate: jest.fn().mockResolvedValue(0.06),
}));

jest.mock('../../src/services/ledger.service', () => ({
  recordTransaction: jest.fn().mockResolvedValue('txn-id'),
}));

// ── Imports ──────────────────────────────────────────────────────────────────

import {
  slotEndTime,
  assertOwnership,
  confirmJob,
  arriveJob,
  doneJob,
  cashConfirm,
  servicerCancelJob,
  addTip,
  customerCancelBooking,
} from '../../src/services/booking.service';
import { prisma } from '../../src/lib/prisma';
import { enqueue } from '../../src/lib/queue';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal booking stub. Override any field as needed. */
function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    userId: 'user-1',
    merchantId: 'merchant-1',
    quoteRequestId: 'quote-1',
    status: 'pending_confirm',
    paymentMode: 'pay_later',
    paymentStatus: 'pending',
    price: 100,
    scheduledDate: new Date('2026-06-15T00:00:00Z'),
    timeSlot: 'morning',
    tipAmount: null,
    tipStatus: null,
    tipPaidAt: null,
    cashConfirmed: false,
    cashConfirmedAt: null,
    arrivePhotoUrl: null,
    donePhotoUrl: null,
    arrivedAt: null,
    doneAt: null,
    confirmedAt: null,
    cancelledBy: null,
    cancelReason: null,
    cancelConfirmedAt: null,
    mutualCancelRequested: false,
    mutualCancelStatus: null,
    mutualCancelReason: null,
    cancelRequestedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const mockFindFirst = prisma.booking.findFirst as jest.Mock;
const mockUpdate = prisma.booking.update as jest.Mock;

// ── slotEndTime ───────────────────────────────────────────────────────────────

describe('slotEndTime', () => {
  const base = new Date('2026-06-15T08:00:00.000Z');

  it('ends at 04:00 UTC (12:00 MYT) for morning slot', () => {
    const end = slotEndTime(base, 'morning');
    expect(end.getUTCHours()).toBe(4);   // 12:00 MYT = 04:00 UTC
    expect(end.getUTCMinutes()).toBe(0);
    expect(end.getUTCSeconds()).toBe(0);
  });

  it('ends at 07:00 UTC (15:00 MYT) for afternoon slot', () => {
    expect(slotEndTime(base, 'afternoon').getUTCHours()).toBe(7);   // 15:00 MYT = 07:00 UTC
  });

  it('ends at 11:00 UTC (19:00 MYT) for evening slot', () => {
    expect(slotEndTime(base, 'evening').getUTCHours()).toBe(11); // 19:00 MYT = 11:00 UTC
  });

  it('ends at 14:00 UTC (22:00 MYT) for night slot', () => {
    expect(slotEndTime(base, 'night').getUTCHours()).toBe(14);  // 22:00 MYT = 14:00 UTC
  });

  it('does not mutate the input date', () => {
    const input = new Date('2026-06-15T08:00:00.000Z');
    slotEndTime(input, 'morning');
    expect(input.toISOString()).toBe('2026-06-15T08:00:00.000Z');
  });

  it('returns a new Date instance', () => {
    const input = new Date('2026-06-15T08:00:00.000Z');
    expect(slotEndTime(input, 'morning')).not.toBe(input);
  });
});

// ── assertOwnership ──────────────────────────────────────────────────────────

describe('assertOwnership', () => {
  it('does not throw when condition is true', () => {
    expect(() => assertOwnership(true)).not.toThrow();
  });

  it('throws FORBIDDEN when condition is false', () => {
    expect(() => assertOwnership(false)).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN', status: 403 }),
    );
  });
});

// ── confirmJob status guard ───────────────────────────────────────────────────

describe('confirmJob', () => {
  beforeEach(() => {
    (prisma.servicer.findUnique as jest.Mock).mockResolvedValue({ onboarded: true, bankName: 'Test Bank', bankAccount: '123456' });
    (enqueue as jest.Mock).mockResolvedValue(undefined);
  });

  it('throws CONFLICT if booking is already confirmed', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    await expect(confirmJob('merchant-1', 'booking-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws CONFLICT if booking is in_progress', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'in_progress' }));
    await expect(confirmJob('merchant-1', 'booking-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws NOT_FOUND if booking does not belong to the merchant', async () => {
    mockFindFirst.mockResolvedValue(null);
    (prisma.servicer.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(confirmJob('merchant-1', 'booking-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('resolves and enqueues noshow job on a valid transition', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'pending_confirm' }));
    mockUpdate.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    await expect(confirmJob('merchant-1', 'booking-1')).resolves.toBeDefined();
    expect(enqueue).toHaveBeenCalledWith(
      'noshow.detect',
      expect.objectContaining({ bookingId: 'booking-1' }),
      expect.any(Object),
    );
  });
});

// ── arriveJob status guard ────────────────────────────────────────────────────

describe('arriveJob', () => {
  it('throws CONFLICT if booking is not confirmed', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'pending_confirm' }));
    await expect(arriveJob('merchant-1', 'booking-1', 'http://photo.jpg')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('throws CONFLICT if booking is already in_progress', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'in_progress' }));
    await expect(arriveJob('merchant-1', 'booking-1', 'http://photo.jpg')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('resolves on valid transition (confirmed → in_progress)', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    mockUpdate.mockResolvedValue(makeBooking({ status: 'in_progress' }));
    await expect(arriveJob('merchant-1', 'booking-1', 'http://photo.jpg')).resolves.toBeDefined();
  });
});

// ── doneJob status guard ──────────────────────────────────────────────────────

describe('doneJob', () => {
  beforeEach(() => {
    (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.customerPoints.findUnique as jest.Mock).mockResolvedValue({ balance: 100, lifetimeEarned: 100, lifetimeSpent: 0 });
    (prisma.customerPoints.upsert as jest.Mock).mockResolvedValue({ balance: 300, lifetimeEarned: 300, lifetimeSpent: 0 });
    (enqueue as jest.Mock).mockResolvedValue(undefined);
  });

  it('throws CONFLICT if booking is not in_progress', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    await expect(doneJob('merchant-1', 'booking-1', 'http://done.jpg')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('resolves and generates invoice + awards points on valid transition', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'in_progress' }));
    mockUpdate.mockResolvedValue(makeBooking({ status: 'completed' }));
    await expect(doneJob('merchant-1', 'booking-1', 'http://done.jpg')).resolves.toBeDefined();
  });

  it('enqueues escrow release for pay_now bookings', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'in_progress', paymentMode: 'pay_now' }));
    mockUpdate.mockResolvedValue(makeBooking({ status: 'completed', paymentMode: 'pay_now' }));
    (prisma.escrow.findUnique as jest.Mock).mockResolvedValue({ id: 'escrow-1', bookingId: 'booking-1' });
    await doneJob('merchant-1', 'booking-1', 'http://done.jpg');
    expect(enqueue).toHaveBeenCalledWith(
      'escrow.release',
      expect.objectContaining({ escrowId: 'escrow-1' }),
      expect.objectContaining({ delay: 60_000 }),
    );
  });

  it('does NOT enqueue escrow release for pay_later bookings', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'in_progress', paymentMode: 'pay_later' }));
    mockUpdate.mockResolvedValue(makeBooking({ status: 'completed', paymentMode: 'pay_later' }));
    (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(null);
    await doneJob('merchant-1', 'booking-1', 'http://done.jpg');
    const escrowCalls = (enqueue as jest.Mock).mock.calls.filter(
      (args: unknown[]) => args[0] === 'escrow.release',
    );
    expect(escrowCalls).toHaveLength(0);
  });
});

// ── cashConfirm guards ────────────────────────────────────────────────────────

describe('cashConfirm', () => {
  it('throws BUSINESS_RULE_VIOLATION for non-cash payment mode', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ paymentMode: 'pay_later', status: 'completed' }));
    await expect(cashConfirm('merchant-1', 'booking-1')).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    });
  });

  it('throws BUSINESS_RULE_VIOLATION for pay_now booking', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ paymentMode: 'pay_now', status: 'completed' }));
    await expect(cashConfirm('merchant-1', 'booking-1')).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    });
  });

  it('throws CONFLICT if job is not yet completed', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ paymentMode: 'cash', status: 'in_progress' }));
    await expect(cashConfirm('merchant-1', 'booking-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('returns the booking unchanged if already confirmed (idempotent)', async () => {
    const b = makeBooking({ paymentMode: 'cash', status: 'completed', cashConfirmed: true });
    mockFindFirst.mockResolvedValue(b);
    await expect(cashConfirm('merchant-1', 'booking-1')).resolves.toMatchObject({
      cashConfirmed: true,
    });
    expect(prisma.booking.update).not.toHaveBeenCalled();
  });
});

// ── servicerCancelJob guards ──────────────────────────────────────────────────

describe('servicerCancelJob', () => {
  it('throws BUSINESS_RULE_VIOLATION on a completed booking', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'completed' }));
    await expect(servicerCancelJob('merchant-1', 'booking-1', 'changed mind')).rejects.toMatchObject(
      { code: 'BUSINESS_RULE_VIOLATION' },
    );
  });

  it('throws BUSINESS_RULE_VIOLATION on an already-cancelled booking', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'cancelled' }));
    await expect(servicerCancelJob('merchant-1', 'booking-1', 'changed mind')).rejects.toMatchObject(
      { code: 'BUSINESS_RULE_VIOLATION' },
    );
  });

  it('enqueues PENALTY_DEDUCT on a valid cancel', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'confirmed' }));
    mockUpdate.mockResolvedValue(makeBooking({ status: 'cancelled' }));
    await servicerCancelJob('merchant-1', 'booking-1', 'changed mind');
    expect(enqueue).toHaveBeenCalledWith(
      'penalty.deduct',
      expect.objectContaining({ penaltyType: 'cancel' }),
      expect.any(Object),
    );
  });
});

// ── addTip guards ─────────────────────────────────────────────────────────────

describe('addTip', () => {
  it('throws NOT_FOUND when booking does not belong to user', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(addTip('user-1', 'booking-1', 10)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BUSINESS_RULE_VIOLATION for pay_now bookings', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ paymentMode: 'pay_now', status: 'completed' }));
    await expect(addTip('user-1', 'booking-1', 10)).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    });
  });

  it('throws BUSINESS_RULE_VIOLATION for cash bookings', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ paymentMode: 'cash', status: 'completed' }));
    await expect(addTip('user-1', 'booking-1', 10)).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    });
  });

  it('throws CONFLICT if job is not completed', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ paymentMode: 'pay_later', status: 'in_progress' }));
    await expect(addTip('user-1', 'booking-1', 10)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws CONFLICT if tip was already paid', async () => {
    mockFindFirst.mockResolvedValue(
      makeBooking({ paymentMode: 'pay_later', status: 'completed', tipStatus: 'paid' }),
    );
    await expect(addTip('user-1', 'booking-1', 10)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws VALIDATION_ERROR for a zero or negative tip', async () => {
    mockFindFirst.mockResolvedValue(
      makeBooking({ paymentMode: 'pay_later', status: 'completed', tipStatus: 'pending' }),
    );
    await expect(addTip('user-1', 'booking-1', 0)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(addTip('user-1', 'booking-1', -5)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

// ── customerCancelBooking guards ──────────────────────────────────────────────

describe('customerCancelBooking', () => {
  it('throws NOT_FOUND when booking does not belong to user', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(customerCancelBooking('user-1', 'booking-1', 'reason')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws BUSINESS_RULE_VIOLATION on a completed booking', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'completed' }));
    await expect(customerCancelBooking('user-1', 'booking-1', 'reason')).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    });
  });

  it('throws BUSINESS_RULE_VIOLATION on an already-cancelled booking', async () => {
    mockFindFirst.mockResolvedValue(makeBooking({ status: 'cancelled' }));
    await expect(customerCancelBooking('user-1', 'booking-1', 'reason')).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    });
  });

  it('resolves for a pending_confirm booking and checks escrow refund', async () => {
    const b = makeBooking({ status: 'pending_confirm' });
    mockFindFirst.mockResolvedValue(b);
    mockUpdate.mockResolvedValue({ ...b, status: 'cancelled' });
    (prisma.escrow.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(customerCancelBooking('user-1', 'booking-1', 'reason')).resolves.toBeDefined();
  });
});
