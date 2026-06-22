/**
 * Unit tests — payment gate before broadcast (2026-06-17)
 *
 * createQuote / settleAndBroadcastGuestQuote deduct a credit "hold" BEFORE the
 * quote is broadcast to servicers. The exact amount held is computeHoldAmount()
 * — the same function GET /quotes/estimate shows on the Bill step, so the figure
 * the gate moves can never drift from what the customer saw. These tests pin
 * that contract (the money the gate deducts), independent of the DB.
 */
import { computeHoldAmount } from '../../src/lib/money';

describe('payment gate — hold amount deducted before broadcast', () => {
  it('holds exactly budgetMax for a bounded pay_now budget', () => {
    expect(computeHoldAmount(200, 0)).toBe(200);
  });

  it('adds the tip to the hold (pay_now captures the tip upfront)', () => {
    expect(computeHoldAmount(200, 15)).toBe(215);
  });

  it('holds nothing for an open-ended budget (no gate deduction)', () => {
    // budgetMax === null → no bounded amount to hold; the gate deducts 0 and the
    // hold is taken later at proposal-selection time.
    expect(computeHoldAmount(null, 0)).toBe(0);
    expect(computeHoldAmount(null, 50)).toBe(0);
  });

  it('rounds the held amount to 2 decimal places', () => {
    expect(computeHoldAmount(99.999, 0)).toBe(100);
    expect(computeHoldAmount(10.005, 0.001)).toBe(10.01);
  });

  it('treats a non-finite tip as zero', () => {
    expect(computeHoldAmount(120, Number.NaN)).toBe(120);
  });
});
