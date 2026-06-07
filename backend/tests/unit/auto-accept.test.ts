import { QuoteRequest, MerchantService } from '@prisma/client';
import { quoteMatchesAutoAccept, computeAutoPrice } from '../../src/services/auto-accept.service';

/** Build a minimal QuoteRequest-shaped object for matching tests. */
function quote(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    timeSlot: 'morning',
    preferredDate: new Date('2026-06-15T10:00:00Z'), // a Monday
    propertyType: 'condo',
    budgetMin: 80 as unknown as QuoteRequest['budgetMin'],
    budgetMax: 120 as unknown as QuoteRequest['budgetMax'],
    ...overrides,
  } as QuoteRequest;
}

/** Build a minimal MerchantService-shaped object. */
function service(autoAccept: boolean, conditions: unknown): MerchantService {
  return {
    autoAccept,
    autoAcceptConditions: conditions,
  } as MerchantService;
}

describe('quoteMatchesAutoAccept', () => {
  it('returns false when auto-accept is disabled', () => {
    expect(quoteMatchesAutoAccept(quote(), service(false, { budget_min: 60 }))).toBe(false);
  });

  it('returns false when auto-accept is on but has no conditions', () => {
    expect(quoteMatchesAutoAccept(quote(), service(true, null))).toBe(false);
  });

  it('matches when the budget ranges overlap', () => {
    expect(
      quoteMatchesAutoAccept(quote(), service(true, { budget_min: 60, budget_max: 150 })),
    ).toBe(true);
  });

  it('rejects when the budget ranges do not overlap', () => {
    expect(
      quoteMatchesAutoAccept(quote(), service(true, { budget_min: 200, budget_max: 400 })),
    ).toBe(false);
  });

  it('respects the time-slot filter', () => {
    expect(quoteMatchesAutoAccept(quote(), service(true, { match_time_slot: ['morning'] }))).toBe(
      true,
    );
    expect(quoteMatchesAutoAccept(quote(), service(true, { match_time_slot: ['night'] }))).toBe(
      false,
    );
  });

  it('respects the property-type filter', () => {
    expect(
      quoteMatchesAutoAccept(quote(), service(true, { match_property_type: ['condo'] })),
    ).toBe(true);
    expect(
      quoteMatchesAutoAccept(quote(), service(true, { match_property_type: ['landed'] })),
    ).toBe(false);
  });

  it('respects the weekday filter (derived from the preferred date)', () => {
    expect(quoteMatchesAutoAccept(quote(), service(true, { match_weekday: ['mon'] }))).toBe(true);
    expect(quoteMatchesAutoAccept(quote(), service(true, { match_weekday: ['sun'] }))).toBe(false);
  });

  it('ignores malformed condition JSON instead of throwing', () => {
    expect(quoteMatchesAutoAccept(quote(), service(true, { budget_min: 'not-a-number' }))).toBe(
      false,
    );
  });
});

describe('computeAutoPrice', () => {
  it('adds the preset offset to the base price', () => {
    expect(computeAutoPrice(80, 10)).toBe(90);
    expect(computeAutoPrice(80, 0)).toBe(80);
    expect(computeAutoPrice(80, null)).toBe(80);
  });

  it('never returns a negative price', () => {
    expect(computeAutoPrice(80, -200)).toBe(0);
  });

  it('rounds to two decimal places', () => {
    expect(computeAutoPrice(80, 0.555)).toBe(80.56);
  });
});
