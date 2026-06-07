/**
 * Unit tests — Phase 6 modifier pricing: computePrefill() and
 * optionPriceMapSchema round-trip validation.
 *
 * computePrefill is a pure function exported from merchant-quote.service.ts
 * for this purpose. No mocks, no DB calls.
 *
 * Coverage:
 *  1. computePrefill — core pre-fill calculation
 *  2. optionPriceMapSchema — save/load validation round-trip
 */

import { computePrefill } from '../../src/services/servicer-quote.service';
import { optionPriceMapSchema, OptionPriceMap } from '../../src/lib/json-schemas';
import { Prisma } from '@prisma/client';

// ── Helpers ──────────────────────────────────────────────────────────────────

function decimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

/** Minimal question-schema item with priced options. */
function pricedQuestion(key: string, optionValues: string[]) {
  return {
    key,
    label: `Label for ${key}`,
    type: 'checkbox',
    priced: true,
    options: optionValues.map((v) => ({ value: v, label: `Option ${v}` })),
  };
}

/** Minimal informational (non-priced) question. */
function infoQuestion(key: string) {
  return { key, label: `Info for ${key}`, type: 'radio', priced: false };
}

/** Build a minimal MerchantService stub. */
function service(
  basePrice: number,
  modifiers: OptionPriceMap | null,
): { basePrice: Prisma.Decimal; modifiers: Prisma.JsonValue | null } {
  return { basePrice: decimal(basePrice), modifiers: modifiers as Prisma.JsonValue };
}

// ── computePrefill — core scenarios ─────────────────────────────────────────

describe('computePrefill — null / empty inputs', () => {
  it('returns null when service is null', () => {
    expect(computePrefill({}, [], null)).toBeNull();
  });

  it('returns base-only when questionSchema is null', () => {
    const result = computePrefill({}, null, service(100, null));
    expect(result).not.toBeNull();
    expect(result!.defaultTotal).toBe(100);
    expect(result!.basePrice).toBe(100);
    expect(result!.breakdown).toHaveLength(0);
  });

  it('returns base-only when questionSchema is empty', () => {
    const result = computePrefill({}, [], service(80, null));
    expect(result!.defaultTotal).toBe(80);
    expect(result!.breakdown).toHaveLength(0);
  });

  it('returns base-only when there are no priced questions', () => {
    const schema = [infoQuestion('property_type')];
    const result = computePrefill({ property_type: 'condo' }, schema, service(120, null));
    expect(result!.defaultTotal).toBe(120);
    expect(result!.breakdown).toHaveLength(0);
  });

  it('returns base-only when service has no modifiers', () => {
    const schema = [pricedQuestion('aircon_service', ['wall_chemical', 'wall_general'])];
    const result = computePrefill(
      { aircon_service: 'wall_chemical' },
      schema,
      service(100, null),
    );
    expect(result!.defaultTotal).toBe(100);
    expect(result!.breakdown).toHaveLength(0);
  });

  it('returns base-only when serviceDetails is null', () => {
    const schema = [pricedQuestion('aircon_service', ['wall_chemical'])];
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_chemical: { price: 110, notOffered: false } },
    };
    const result = computePrefill(null, schema, service(80, modifiers));
    // no answers → no breakdown; total = base
    expect(result!.defaultTotal).toBe(80);
    expect(result!.breakdown).toHaveLength(0);
  });
});

describe('computePrefill — single option selected', () => {
  const schema = [pricedQuestion('aircon_service', ['wall_chemical', 'wall_general'])];

  it('returns the option price when it exceeds base', () => {
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_chemical: { price: 150, notOffered: false } },
    };
    const result = computePrefill(
      { aircon_service: 'wall_chemical' },
      schema,
      service(100, modifiers),
    );
    expect(result!.defaultTotal).toBe(150);
    expect(result!.breakdown).toHaveLength(1);
    expect(result!.breakdown[0]).toMatchObject({
      questionKey: 'aircon_service',
      optionValue: 'wall_chemical',
      price: 150,
    });
  });

  it('falls back to base when option price is below base (max semantics)', () => {
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_chemical: { price: 50, notOffered: false } },
    };
    const result = computePrefill(
      { aircon_service: 'wall_chemical' },
      schema,
      service(100, modifiers),
    );
    // optionTotal(50) < base(100) → defaultTotal = base
    expect(result!.defaultTotal).toBe(100);
    expect(result!.breakdown).toHaveLength(1);
  });

  it('skips options marked notOffered', () => {
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_chemical: { price: 200, notOffered: true } },
    };
    const result = computePrefill(
      { aircon_service: 'wall_chemical' },
      schema,
      service(100, modifiers),
    );
    expect(result!.defaultTotal).toBe(100);
    expect(result!.breakdown).toHaveLength(0);
  });

  it('skips options with null price (merchant defers to base)', () => {
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_chemical: { price: null, notOffered: false } },
    };
    const result = computePrefill(
      { aircon_service: 'wall_chemical' },
      schema,
      service(100, modifiers),
    );
    expect(result!.defaultTotal).toBe(100);
    expect(result!.breakdown).toHaveLength(0);
  });

  it('skips options whose key is absent from the modifier map', () => {
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_general: { price: 80, notOffered: false } },
    };
    // customer picked wall_chemical, merchant only priced wall_general
    const result = computePrefill(
      { aircon_service: 'wall_chemical' },
      schema,
      service(100, modifiers),
    );
    expect(result!.defaultTotal).toBe(100);
    expect(result!.breakdown).toHaveLength(0);
  });
});

describe('computePrefill — multi-select (checkbox / array answers)', () => {
  const schema = [pricedQuestion('aircon_service', ['wall_chemical', 'wall_general', 'cassette'])];

  it('sums prices across multiple selected options', () => {
    const modifiers: OptionPriceMap = {
      aircon_service: {
        wall_chemical: { price: 110, notOffered: false },
        wall_general: { price: 80, notOffered: false },
      },
    };
    const result = computePrefill(
      { aircon_service: ['wall_chemical', 'wall_general'] },
      schema,
      service(60, modifiers),
    );
    // 110 + 80 = 190; base = 60; max(190, 60) = 190
    expect(result!.defaultTotal).toBe(190);
    expect(result!.breakdown).toHaveLength(2);
  });

  it('handles mix of priced and null/notOffered in multi-select', () => {
    const modifiers: OptionPriceMap = {
      aircon_service: {
        wall_chemical: { price: 110, notOffered: false },
        wall_general: { price: null, notOffered: false }, // deferred
        cassette: { price: 200, notOffered: true }, // not offered
      },
    };
    const result = computePrefill(
      { aircon_service: ['wall_chemical', 'wall_general', 'cassette'] },
      schema,
      service(60, modifiers),
    );
    // only wall_chemical(110) contributes; max(110, 60) = 110
    expect(result!.defaultTotal).toBe(110);
    expect(result!.breakdown).toHaveLength(1);
    expect(result!.breakdown[0].optionValue).toBe('wall_chemical');
  });

  it('base wins when all multi-select option prices are below base', () => {
    const modifiers: OptionPriceMap = {
      aircon_service: {
        wall_chemical: { price: 30, notOffered: false },
        wall_general: { price: 20, notOffered: false },
      },
    };
    const result = computePrefill(
      { aircon_service: ['wall_chemical', 'wall_general'] },
      schema,
      service(100, modifiers),
    );
    // optionTotal = 50; max(50, 100) = 100
    expect(result!.defaultTotal).toBe(100);
    // breakdown still lists the matched items
    expect(result!.breakdown).toHaveLength(2);
  });
});

describe('computePrefill — multiple question keys', () => {
  it('sums across two priced questions', () => {
    const schema = [
      pricedQuestion('aircon_service', ['wall_chemical']),
      pricedQuestion('add_on', ['filter_wash']),
    ];
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_chemical: { price: 110, notOffered: false } },
      add_on: { filter_wash: { price: 20, notOffered: false } },
    };
    const result = computePrefill(
      { aircon_service: 'wall_chemical', add_on: 'filter_wash' },
      schema,
      service(80, modifiers),
    );
    // 110 + 20 = 130; max(130, 80) = 130
    expect(result!.defaultTotal).toBe(130);
    expect(result!.breakdown).toHaveLength(2);
  });

  it('ignores informational questions even when present in serviceDetails', () => {
    const schema = [
      infoQuestion('property_type'),
      pricedQuestion('aircon_service', ['wall_chemical']),
    ];
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_chemical: { price: 110, notOffered: false } },
    };
    const result = computePrefill(
      { property_type: 'condo', aircon_service: 'wall_chemical' },
      schema,
      service(80, modifiers),
    );
    expect(result!.defaultTotal).toBe(110);
    // property_type never in breakdown
    expect(result!.breakdown.every((b) => b.questionKey !== 'property_type')).toBe(true);
  });
});

describe('computePrefill — option labels', () => {
  it('resolves option label from question schema options array', () => {
    const schema = [
      {
        key: 'aircon_service',
        label: 'Service type',
        type: 'radio',
        priced: true,
        options: [
          { value: 'wall_chemical', label: 'Wall Unit — Chemical Cleaning (Recommended)' },
        ],
      },
    ];
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_chemical: { price: 110, notOffered: false } },
    };
    const result = computePrefill(
      { aircon_service: 'wall_chemical' },
      schema,
      service(80, modifiers),
    );
    expect(result!.breakdown[0].label).toBe('Wall Unit — Chemical Cleaning (Recommended)');
  });

  it('falls back to optionValue string when options array is absent', () => {
    const schema = [{ key: 'svc', label: 'Svc', type: 'radio', priced: true }]; // no options
    const modifiers: OptionPriceMap = {
      svc: { basic: { price: 90, notOffered: false } },
    };
    const result = computePrefill({ svc: 'basic' }, schema, service(50, modifiers));
    expect(result!.breakdown[0].label).toBe('basic');
  });
});

// ── optionPriceMapSchema — save/load round-trip ──────────────────────────────

describe('optionPriceMapSchema — validation round-trip', () => {
  it('accepts a valid map with price and notOffered fields', () => {
    const raw = {
      aircon_service: {
        wall_chemical: { price: 110, notOffered: false },
        wall_general: { price: 80, notOffered: false },
        cassette: { price: null, notOffered: false },
        ceiling: { price: 0, notOffered: true },
      },
    };
    const result = optionPriceMapSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aircon_service.wall_chemical.price).toBe(110);
      expect(result.data.aircon_service.cassette.price).toBeNull();
      expect(result.data.aircon_service.ceiling.notOffered).toBe(true);
    }
  });

  it('accepts a map with multiple question keys', () => {
    const raw = {
      aircon_service: { wall_chemical: { price: 110, notOffered: false } },
      add_on: { filter_wash: { price: 20, notOffered: false } },
    };
    expect(optionPriceMapSchema.safeParse(raw).success).toBe(true);
  });

  it('rejects when price is negative', () => {
    const raw = { svc: { opt: { price: -1, notOffered: false } } };
    expect(optionPriceMapSchema.safeParse(raw).success).toBe(false);
  });

  it('rejects when notOffered is missing', () => {
    const raw = { svc: { opt: { price: 100 } } };
    expect(optionPriceMapSchema.safeParse(raw).success).toBe(false);
  });

  it('rejects when price is a string instead of number', () => {
    const raw = { svc: { opt: { price: '100', notOffered: false } } };
    expect(optionPriceMapSchema.safeParse(raw).success).toBe(false);
  });

  it('accepts an empty map (merchant has no modifiers set yet)', () => {
    expect(optionPriceMapSchema.safeParse({}).success).toBe(true);
  });

  it('rejects empty-string question keys', () => {
    const raw = { '': { opt: { price: 100, notOffered: false } } };
    expect(optionPriceMapSchema.safeParse(raw).success).toBe(false);
  });

  it('rejects empty-string option value keys', () => {
    const raw = { svc: { '': { price: 100, notOffered: false } } };
    expect(optionPriceMapSchema.safeParse(raw).success).toBe(false);
  });

  it('round-trips through JSON serialisation unchanged', () => {
    const original: OptionPriceMap = {
      aircon_service: {
        wall_chemical: { price: 110, notOffered: false },
        cassette: { price: null, notOffered: false },
        ceiling: { price: 0, notOffered: true },
      },
    };
    // Simulate saving to JSONB and reading back (JSON.stringify → JSON.parse).
    const serialised = JSON.parse(JSON.stringify(original));
    const parsed = optionPriceMapSchema.safeParse(serialised);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(original);
    }
  });
});
