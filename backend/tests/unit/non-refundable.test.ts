/**
 * Unit tests — SPEC-2 non-refundable fee logic: computeNonRefundableAmount().
 *
 * computeNonRefundableAmount is a pure function exported from
 * booking.service.ts. It decides which portion of a held escrow is NOT
 * refunded on cancellation:
 *  - the travel fee becomes non-refundable once the servicer has arrived
 *  - the inspection fee becomes non-refundable once an inspection booking is
 *    completed (done)
 *
 * No mocks, no DB calls — the function takes a plain booking-shaped object.
 */

import { computeNonRefundableAmount } from '../../src/services/booking.service';
import { Prisma } from '@prisma/client';

// ── Helpers ──────────────────────────────────────────────────────────────────

function decimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

type BookingArg = Parameters<typeof computeNonRefundableAmount>[0];

/** Build a minimal booking stub with sensible defaults. */
function booking(overrides: Partial<BookingArg> = {}): BookingArg {
  return {
    arrivedAt: null,
    isInspection: false,
    doneAt: null,
    travelFee: null,
    inspectionFee: null,
    ...overrides,
  };
}

// The escrow amount used to derive expected refunds in the assertions below.
const ESCROW_AMOUNT = 100;

// ── Travel fee (post-arrive) ─────────────────────────────────────────────────

describe('computeNonRefundableAmount — travel fee', () => {
  it('nothing is non-refundable when the servicer has not arrived', () => {
    const nonRefundable = computeNonRefundableAmount(
      booking({ travelFee: decimal(20) }),
    );
    expect(nonRefundable).toBe(0);
    // Full escrow is refunded.
    expect(ESCROW_AMOUNT - nonRefundable).toBe(100);
  });

  it('travel fee is non-refundable once the servicer has arrived', () => {
    const nonRefundable = computeNonRefundableAmount(
      booking({ arrivedAt: new Date(), travelFee: decimal(20) }),
    );
    expect(nonRefundable).toBe(20);
    // refund = escrow.amount - travelFee
    expect(ESCROW_AMOUNT - nonRefundable).toBe(80);
  });

  it('arrived but no travel fee set → nothing non-refundable', () => {
    const nonRefundable = computeNonRefundableAmount(
      booking({ arrivedAt: new Date(), travelFee: null }),
    );
    expect(nonRefundable).toBe(0);
  });
});

// ── Inspection fee (inspection booking + post-done) ──────────────────────────

describe('computeNonRefundableAmount — inspection fee', () => {
  it('inspection fee is non-refundable once an inspection booking is done', () => {
    const nonRefundable = computeNonRefundableAmount(
      booking({ isInspection: true, doneAt: new Date(), inspectionFee: decimal(30) }),
    );
    expect(nonRefundable).toBe(30);
    // refund = escrow.amount - inspectionFee
    expect(ESCROW_AMOUNT - nonRefundable).toBe(70);
  });

  it('inspection fee stays refundable when the inspection is not yet done', () => {
    const nonRefundable = computeNonRefundableAmount(
      booking({ isInspection: true, doneAt: null, inspectionFee: decimal(30) }),
    );
    expect(nonRefundable).toBe(0);
  });

  it('inspection fee is ignored on a non-inspection booking even when done', () => {
    const nonRefundable = computeNonRefundableAmount(
      booking({ isInspection: false, doneAt: new Date(), inspectionFee: decimal(30) }),
    );
    expect(nonRefundable).toBe(0);
  });
});

// ── Combined travel + inspection ─────────────────────────────────────────────

describe('computeNonRefundableAmount — combined', () => {
  it('deducts both travel (arrived) and inspection (done) fees', () => {
    const travelFee = 20;
    const inspectionFee = 30;
    const nonRefundable = computeNonRefundableAmount(
      booking({
        arrivedAt: new Date(),
        isInspection: true,
        doneAt: new Date(),
        travelFee: decimal(travelFee),
        inspectionFee: decimal(inspectionFee),
      }),
    );
    expect(nonRefundable).toBe(travelFee + inspectionFee);
    // refund = escrow.amount - travelFee - inspectionFee
    expect(ESCROW_AMOUNT - nonRefundable).toBe(50);
  });

  it('returns 0 for a fresh booking with no fees and no progress', () => {
    expect(computeNonRefundableAmount(booking())).toBe(0);
  });
});
