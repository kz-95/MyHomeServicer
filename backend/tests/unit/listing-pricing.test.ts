/**
 * Unit tests — SP-3 listing pricing (§8), duration scaling (§9), and the
 * auto-accept 4-gate engine (§11). All pure functions, no DB / no LLM.
 */
import {
  buildListingLineItems,
  computeListingPrice,
  computeListingDurationMin,
  ModuleLite,
  ListingForPricing,
} from '../../src/services/listing-pricing.service';
import { evaluateAutoAcceptGates } from '../../src/services/sp3-auto-accept.service';
import { ServicerTaxConfig } from '../../src/lib/money';

const NO_TAX: ServicerTaxConfig = {
  serviceChargeRate: 0,
  sstRegistered: false,
  sstRate: 0.06,
  taxInclusive: false,
};

const modules = (rows: ModuleLite[]) => new Map(rows.map((m) => [m.id, m]));

const weekdayOf = (d: Date) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getUTCDay()];

describe('listing pricing (§8)', () => {
  it('base only → subtotal == base', () => {
    const listing: ListingForPricing = { basePrice: 80, estimatedDurationMinutes: 60 };
    const r = computeListingPrice(listing, modules([]), {}, NO_TAX);
    expect(r.subtotal).toBe(80);
    expect(r.total).toBe(80);
  });

  it('base + included module', () => {
    const listing: ListingForPricing = {
      basePrice: 80,
      estimatedDurationMinutes: 60,
      moduleRefs: [{ moduleId: 'm1', kind: 'included' }],
    };
    const r = computeListingPrice(listing, modules([{ id: 'm1', name: 'Wash', price: 30 }]), {}, NO_TAX);
    expect(r.subtotal).toBe(110);
  });

  it('radio question-option upcharge added; quantity option × count', () => {
    const listing: ListingForPricing = {
      basePrice: 50,
      estimatedDurationMinutes: 60,
      modifiers: {
        type: { wall: { price: 20, notOffered: false }, cassette: { price: 40, notOffered: false } },
        units: { unit: { price: 15, durationMin: 30, notOffered: false } },
      },
    };
    const r = computeListingPrice(listing, modules([]), { type: 'cassette', units: { unit: 3 } }, NO_TAX);
    // 50 base + 40 cassette + 15*3 units = 135
    expect(r.subtotal).toBe(135);
  });

  it('add-on excluded by default, included when ticked', () => {
    const listing: ListingForPricing = {
      basePrice: 100,
      estimatedDurationMinutes: 60,
      moduleRefs: [{ moduleId: 'a1', kind: 'addon' }],
    };
    const mods = modules([{ id: 'a1', name: 'Gas', price: 25 }]);
    expect(computeListingPrice(listing, mods, {}, NO_TAX).subtotal).toBe(100);
    expect(computeListingPrice(listing, mods, {}, NO_TAX, ['a1']).subtotal).toBe(125);
  });

  it('overridePrice wins over module price', () => {
    const listing: ListingForPricing = {
      basePrice: 0,
      estimatedDurationMinutes: 60,
      moduleRefs: [{ moduleId: 'm1', kind: 'included', overridePrice: 12 }],
    };
    const r = buildListingLineItems(listing, modules([{ id: 'm1', name: 'X', price: 99 }]), {});
    expect(r.find((li) => li.label === 'X')?.amount).toBe(12);
  });

  it('exclusive tax: total = subtotal + serviceCharge + sst', () => {
    const cfg: ServicerTaxConfig = { serviceChargeRate: 0.1, sstRegistered: true, sstRate: 0.06, taxInclusive: false };
    const listing: ListingForPricing = { basePrice: 100, estimatedDurationMinutes: 60 };
    const r = computeListingPrice(listing, modules([]), {}, cfg);
    // sc = 100*0.1 = 10; sst = (100 + 10)*0.06 = 6.6; total = 116.6
    expect(r.serviceCharge).toBe(10);
    expect(r.sst).toBeCloseTo(6.6, 2);
    expect(r.total).toBeCloseTo(116.6, 2);
  });

  it('tax-inclusive: total stays at subtotal, sst extracted for display', () => {
    const cfg: ServicerTaxConfig = { serviceChargeRate: 0, sstRegistered: true, sstRate: 0.06, taxInclusive: true };
    const listing: ListingForPricing = { basePrice: 106, estimatedDurationMinutes: 60 };
    const r = computeListingPrice(listing, modules([]), {}, cfg);
    expect(r.total).toBe(106);
    expect(r.sst).toBeGreaterThan(0); // extracted, informational
  });
});

describe('duration scaling (§9)', () => {
  it('base + option per-unit×count + module delta', () => {
    const listing: ListingForPricing = {
      basePrice: 0,
      estimatedDurationMinutes: 60,
      moduleRefs: [
        { moduleId: 'm1', kind: 'included', durationDeltaMin: 20 },
        { moduleId: 'a1', kind: 'addon', durationDeltaMin: 15 },
      ],
      modifiers: { units: { unit: { price: 0, durationMin: 30, notOffered: false } } },
    };
    // base 60 + included module 20 + units 30*2 = 140 (add-on not ticked)
    expect(computeListingDurationMin(listing, { units: { unit: 2 } })).toBe(140);
    // + add-on 15 when ticked = 155
    expect(computeListingDurationMin(listing, { units: { unit: 2 } }, ['a1'])).toBe(155);
  });
});

describe('auto-accept gates (§11)', () => {
  const date = new Date('2026-06-15T00:00:00Z');
  const baseQuote = {
    budgetMax: 200 as number | null,
    lat: 3.139 as number | null,
    lng: 101.6869 as number | null,
    preferredDate: date,
    timeSlot: 'morning',
    answers: { type: 'wall' } as Record<string, unknown>,
  };
  const baseServicer = {
    isOnline: true,
    serviceAreas: ['3.140,101.690'],
    serviceRadiusKm: 10,
    serviceChargeRate: 0,
    sstRegistered: false,
    taxInclusive: false,
  };
  const baseListing = {
    basePrice: 100,
    estimatedDurationMinutes: 60,
    modifiers: { type: { wall: { price: 20, notOffered: false }, cassette: { price: 40, notOffered: true } } },
    moduleRefs: [],
    autoAccept: true,
    priceType: 'fixed',
  };
  const sched = [{ weekday: weekdayOf(date), timeSlot: 'morning', isAvailable: true }];

  it('all gates pass', () => {
    const r = evaluateAutoAcceptGates(baseQuote, baseListing, baseServicer, modules([]), 0.06, sched);
    expect(r.pass).toBe(true);
    expect(r.total).toBe(120); // 100 + 20 wall
  });

  it('budget fail when total exceeds budgetMax', () => {
    const r = evaluateAutoAcceptGates({ ...baseQuote, budgetMax: 100 }, baseListing, baseServicer, modules([]), 0.06, sched);
    expect(r.pass).toBe(false);
    expect(r.reasons.join()).toMatch(/exceeds budget/);
  });

  it('hourly price type never auto-accepts', () => {
    const r = evaluateAutoAcceptGates(baseQuote, { ...baseListing, priceType: 'hourly' }, baseServicer, modules([]), 0.06, sched);
    expect(r.pass).toBe(false);
  });

  it('availability: offline fails; empty schedule passes; unavailable slot fails', () => {
    expect(evaluateAutoAcceptGates(baseQuote, baseListing, { ...baseServicer, isOnline: false }, modules([]), 0.06, sched).pass).toBe(false);
    expect(evaluateAutoAcceptGates(baseQuote, baseListing, baseServicer, modules([]), 0.06, []).pass).toBe(true);
    const off = [{ weekday: weekdayOf(date), timeSlot: 'morning', isAvailable: false }];
    expect(evaluateAutoAcceptGates(baseQuote, baseListing, baseServicer, modules([]), 0.06, off).pass).toBe(false);
  });

  it('coverage: outside radius fails; no quote coords passes', () => {
    const far = { ...baseServicer, serviceAreas: ['1.0,103.0'], serviceRadiusKm: 5 };
    expect(evaluateAutoAcceptGates(baseQuote, baseListing, far, modules([]), 0.06, sched).pass).toBe(false);
    const noCoords = { ...baseQuote, lat: null, lng: null };
    expect(evaluateAutoAcceptGates(noCoords, baseListing, far, modules([]), 0.06, sched).pass).toBe(true);
  });

  it('q-match: requesting a not-offered option fails', () => {
    const r = evaluateAutoAcceptGates({ ...baseQuote, answers: { type: 'cassette' } }, baseListing, baseServicer, modules([]), 0.06, sched);
    expect(r.pass).toBe(false);
    expect(r.reasons.join()).toMatch(/not offered/);
  });
});
