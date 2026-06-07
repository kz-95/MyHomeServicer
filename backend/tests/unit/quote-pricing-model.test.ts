/**
 * Unit tests — Quote Question + Pricing Model (2026-05-31)
 *
 * Covers:
 *  1. Travel fee split (baseline 0% / extra platform-%'d)
 *  2. Supplies fee split (same rule, coded separately)
 *  3. showIf — hidden questions skipped in computePrefill pricing
 *  4. maxSelect / minSelect — Zod schema accepts the fields
 *  5. computePrefill with durationMin — sums estimated job time
 *  6. Reserved key 'property_type' rejected by questionItemSchema
 */

import { Prisma } from '@prisma/client';
import { calcTravelFeeSplit, calcSuppliesFeeSplit } from '../../src/lib/fee-split';
import { computePrefill } from '../../src/services/servicer-quote.service';
import { questionItemSchema, questionSchemaSchema, optionPriceMapSchema } from '../../src/lib/json-schemas';
import type { OptionPriceMap } from '../../src/lib/json-schemas';

// ── Helpers ──────────────────────────────────────────────────────────────────

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function service(
  basePrice: number,
  modifiers: OptionPriceMap | null,
): { basePrice: Prisma.Decimal; modifiers: Prisma.JsonValue | null } {
  return { basePrice: dec(basePrice), modifiers: modifiers as Prisma.JsonValue };
}

function pricedQ(key: string, optionValues: string[], opts?: { showIf?: { questionKey: string; includesAny: string[] } }) {
  return {
    key,
    label: `Label ${key}`,
    type: 'checkbox' as const,
    priced: true,
    options: optionValues.map((v) => ({ value: v, label: `Opt ${v}` })),
    ...(opts?.showIf ? { showIf: opts.showIf } : {}),
  };
}

// ── 1. Travel fee split ───────────────────────────────────────────────────────

describe('calcTravelFeeSplit — baseline 0% / extra platform-%', () => {
  const PLATFORM_RATE = dec(0.20); // 20%
  const OVERALL_BASELINE = dec(20); // RM 20

  it('servicer charges exactly the overall baseline → platform gets RM 0', () => {
    const result = calcTravelFeeSplit(dec(20), null, OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.totalFee.toNumber()).toBe(20);
    expect(result.platformAmount.toNumber()).toBe(0);
    expect(result.servicerAmount.toNumber()).toBe(20);
    expect(result.effectiveBaseline.toNumber()).toBe(20);
  });

  it('servicer charges RM 30 (extra = RM 10) → platform gets 20% of extra = RM 2', () => {
    const result = calcTravelFeeSplit(dec(30), null, OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.platformAmount.toNumber()).toBe(2); // 10 * 0.20
    expect(result.servicerAmount.toNumber()).toBe(28); // 30 - 2
    expect(result.totalFee.toNumber()).toBe(30);
  });

  it('category baseline higher than overall → category baseline used as floor', () => {
    const catBaseline = dec(35);
    // effective = max(35, 20) = 35
    // fee = 50, extra = 15, platform = 15*0.20 = 3
    const result = calcTravelFeeSplit(dec(50), catBaseline, OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.effectiveBaseline.toNumber()).toBe(35);
    expect(result.platformAmount.toNumber()).toBe(3); // 15 * 0.20
    expect(result.servicerAmount.toNumber()).toBe(47); // 50 - 3
  });

  it('overall baseline higher than category → overall acts as floor', () => {
    const catBaseline = dec(10); // lower than overall 20
    // effective = max(10, 20) = 20
    // fee = 25, extra = 5, platform = 5*0.20 = 1
    const result = calcTravelFeeSplit(dec(25), catBaseline, OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.effectiveBaseline.toNumber()).toBe(20);
    expect(result.platformAmount.toNumber()).toBe(1);
    expect(result.servicerAmount.toNumber()).toBe(24);
  });

  it('servicer charges exactly the effective (category) baseline → platform gets RM 0', () => {
    const catBaseline = dec(40);
    const result = calcTravelFeeSplit(dec(40), catBaseline, OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.platformAmount.toNumber()).toBe(0);
    expect(result.servicerAmount.toNumber()).toBe(40);
  });

  it('null category baseline → falls back to overall baseline', () => {
    const result = calcTravelFeeSplit(dec(50), null, OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.effectiveBaseline.toNumber()).toBe(20);
    expect(result.platformAmount.toNumber()).toBe(6); // (50-20)*0.20
    expect(result.servicerAmount.toNumber()).toBe(44);
  });

  it('rounds platform amount to 2 decimal places', () => {
    // fee=23, overall=20, extra=3, platform=3*0.20=0.60 (exact)
    const result = calcTravelFeeSplit(dec(23), null, OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.platformAmount.decimalPlaces()).toBeLessThanOrEqual(2);
  });
});

// ── 2. Supplies fee split ─────────────────────────────────────────────────────

describe('calcSuppliesFeeSplit — same rule as travel, coded separately', () => {
  const PLATFORM_RATE = dec(0.20);
  const OVERALL_BASELINE = dec(30); // RM 30 for supplies

  it('servicer charges exactly overall baseline → platform gets RM 0', () => {
    const result = calcSuppliesFeeSplit(dec(30), null, OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.platformAmount.toNumber()).toBe(0);
    expect(result.servicerAmount.toNumber()).toBe(30);
  });

  it('servicer charges RM 50 (extra = RM 20) → platform gets 20% = RM 4', () => {
    const result = calcSuppliesFeeSplit(dec(50), null, OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.platformAmount.toNumber()).toBe(4); // 20 * 0.20
    expect(result.servicerAmount.toNumber()).toBe(46);
    expect(result.totalFee.toNumber()).toBe(50);
  });

  it('category baseline higher than overall → category baseline used', () => {
    // cat=45, overall=30, effective=45; fee=60, extra=15, platform=3
    const result = calcSuppliesFeeSplit(dec(60), dec(45), OVERALL_BASELINE, PLATFORM_RATE);
    expect(result.effectiveBaseline.toNumber()).toBe(45);
    expect(result.platformAmount.toNumber()).toBe(3);
  });

  it('platform rate 0% → servicer keeps everything regardless of extra', () => {
    const result = calcSuppliesFeeSplit(dec(100), null, OVERALL_BASELINE, dec(0));
    expect(result.platformAmount.toNumber()).toBe(0);
    expect(result.servicerAmount.toNumber()).toBe(100);
  });
});

// ── 3. showIf — hidden questions skipped in computePrefill pricing ────────────

describe('computePrefill — showIf hidden questions are excluded from pricing', () => {
  it('question hidden by showIf is not priced even if customer had an answer', () => {
    const schema = [
      pricedQ('clean_for', ['leather_sofa', 'single_mattress']),
      // sofa_size only shows when clean_for includes a sofa option
      pricedQ('sofa_size', ['1_seater', '2_seater', '3_seater'], {
        showIf: { questionKey: 'clean_for', includesAny: ['leather_sofa', 'fabric_sofa'] },
      }),
    ];

    const modifiers: OptionPriceMap = {
      clean_for: { single_mattress: { price: 60, notOffered: false } },
      sofa_size: { '2_seater': { price: 80, notOffered: false } },
    };

    // Customer selected only mattress (no sofa) — sofa_size should be hidden
    const result = computePrefill(
      { clean_for: ['single_mattress'], sofa_size: '2_seater' },
      schema,
      service(50, modifiers),
    );

    expect(result).not.toBeNull();
    // sofa_size hidden (clean_for does not include leather_sofa/fabric_sofa)
    // only clean_for: single_mattress(60) contributes
    expect(result!.defaultTotal).toBe(60);
    expect(result!.breakdown.every((b) => b.questionKey !== 'sofa_size')).toBe(true);
    expect(result!.breakdown).toHaveLength(1);
    expect(result!.breakdown[0].questionKey).toBe('clean_for');
  });

  it('question visible by showIf is priced normally', () => {
    const schema = [
      pricedQ('clean_for', ['leather_sofa']),
      pricedQ('sofa_size', ['3_seater'], {
        showIf: { questionKey: 'clean_for', includesAny: ['leather_sofa', 'fabric_sofa'] },
      }),
    ];

    const modifiers: OptionPriceMap = {
      clean_for: { leather_sofa: { price: 80, notOffered: false } },
      sofa_size: { '3_seater': { price: 50, notOffered: false } },
    };

    // Customer selected leather sofa — sofa_size IS visible
    const result = computePrefill(
      { clean_for: ['leather_sofa'], sofa_size: '3_seater' },
      schema,
      service(40, modifiers),
    );

    expect(result).not.toBeNull();
    // both contribute: 80 + 50 = 130
    expect(result!.defaultTotal).toBe(130);
    expect(result!.breakdown).toHaveLength(2);
  });

  it('question with no showIf is always visible', () => {
    const schema = [pricedQ('action', ['install'])];
    const modifiers: OptionPriceMap = {
      action: { install: { price: 100, notOffered: false } },
    };
    const result = computePrefill({ action: 'install' }, schema, service(50, modifiers));
    expect(result!.defaultTotal).toBe(100);
    expect(result!.breakdown).toHaveLength(1);
  });
});

// ── 4. maxSelect / minSelect — Zod schema accepts these fields ────────────────

describe('questionItemSchema — maxSelect / minSelect', () => {
  it('accepts maxSelect on a checkbox question', () => {
    const item = {
      key: 'area',
      label: 'Which area?',
      type: 'checkbox',
      required: true,
      minSelect: 1,
      maxSelect: 3,
      options: [{ value: 'tap', label: 'Tap/Faucet' }],
    };
    const result = questionItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minSelect).toBe(1);
      expect(result.data.maxSelect).toBe(3);
    }
  });

  it('rejects negative minSelect', () => {
    const item = { key: 'q', label: 'Q', type: 'checkbox', minSelect: -1 };
    expect(questionItemSchema.safeParse(item).success).toBe(false);
  });

  it('rejects maxSelect of 0', () => {
    const item = { key: 'q', label: 'Q', type: 'checkbox', maxSelect: 0 };
    expect(questionItemSchema.safeParse(item).success).toBe(false);
  });

  it('accepts minSelect: 0 (not required to select any)', () => {
    const item = { key: 'q', label: 'Q', type: 'checkbox', minSelect: 0 };
    expect(questionItemSchema.safeParse(item).success).toBe(true);
  });
});

// ── 4b. showIf field in Zod schema ────────────────────────────────────────────

describe('questionItemSchema — showIf', () => {
  it('accepts a valid showIf with questionKey + includesAny', () => {
    const item = {
      key: 'sofa_size',
      label: 'Sofa size',
      type: 'radio',
      showIf: { questionKey: 'clean_for', includesAny: ['leather_sofa', 'fabric_sofa'] },
    };
    const result = questionItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showIf?.questionKey).toBe('clean_for');
      expect(result.data.showIf?.includesAny).toHaveLength(2);
    }
  });

  it('rejects showIf with empty includesAny array', () => {
    const item = {
      key: 'sofa_size',
      label: 'Sofa size',
      type: 'radio',
      showIf: { questionKey: 'clean_for', includesAny: [] },
    };
    expect(questionItemSchema.safeParse(item).success).toBe(false);
  });
});

// ── 4c. Reserved key 'property_type' rejected ────────────────────────────────

describe('questionItemSchema — reserved key rejection', () => {
  it('rejects property_type as a question key', () => {
    const item = { key: 'property_type', label: 'Property type', type: 'radio' };
    const result = questionItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  it('accepts any non-reserved key', () => {
    const item = { key: 'aircon_service', label: 'Service type', type: 'checkbox' };
    expect(questionItemSchema.safeParse(item).success).toBe(true);
  });
});

// ── 5. computePrefill with durationMin ───────────────────────────────────────

describe('computePrefill — durationMin accumulation', () => {
  it('sums durationMin across selected options', () => {
    const schema = [pricedQ('aircon_service', ['wall_chemical', 'wall_general'])];
    const modifiers: OptionPriceMap = {
      aircon_service: {
        wall_chemical: { price: 110, durationMin: 45, notOffered: false },
        wall_general: { price: 80, durationMin: 30, notOffered: false },
      },
    };
    const result = computePrefill(
      { aircon_service: ['wall_chemical', 'wall_general'] },
      schema,
      service(60, modifiers),
    );
    expect(result).not.toBeNull();
    expect(result!.estimatedDurationMin).toBe(75); // 45 + 30
  });

  it('returns undefined estimatedDurationMin when no option has durationMin', () => {
    const schema = [pricedQ('aircon_service', ['wall_chemical'])];
    const modifiers: OptionPriceMap = {
      aircon_service: { wall_chemical: { price: 110, notOffered: false } },
    };
    const result = computePrefill(
      { aircon_service: 'wall_chemical' },
      schema,
      service(60, modifiers),
    );
    expect(result!.estimatedDurationMin).toBeUndefined();
  });

  it('skips durationMin for hidden (showIf) questions', () => {
    const schema = [
      pricedQ('clean_for', ['single_mattress']),
      pricedQ('sofa_size', ['3_seater'], {
        showIf: { questionKey: 'clean_for', includesAny: ['leather_sofa'] },
      }),
    ];
    const modifiers: OptionPriceMap = {
      clean_for: { single_mattress: { price: 60, durationMin: 30, notOffered: false } },
      sofa_size: { '3_seater': { price: 80, durationMin: 20, notOffered: false } },
    };
    // sofa_size hidden — its durationMin should not be counted
    const result = computePrefill(
      { clean_for: ['single_mattress'], sofa_size: '3_seater' },
      schema,
      service(40, modifiers),
    );
    expect(result!.estimatedDurationMin).toBe(30); // only clean_for contributes
  });

  it('partial — only some options have durationMin', () => {
    const schema = [pricedQ('action', ['install', 'repair'])];
    const modifiers: OptionPriceMap = {
      action: {
        install: { price: 100, durationMin: 60, notOffered: false },
        repair: { price: 80, notOffered: false }, // no durationMin
      },
    };
    const result = computePrefill(
      { action: ['install', 'repair'] },
      schema,
      service(50, modifiers),
    );
    // hasDuration=true because at least one option has it; repair contributes 0 to total
    expect(result!.estimatedDurationMin).toBe(60);
  });
});

// ── 6b. questionItemSchema — quantity and number types ────────────────────────

describe('questionItemSchema — quantity type', () => {
  it('accepts quantity type with options', () => {
    const item = {
      key: 'curtain_sizes',
      label: 'Choose your curtain sizes',
      type: 'quantity',
      required: true,
      options: [
        { value: 'full_height_40', label: 'Full Height – Up to 40 inch' },
        { value: 'half_height_60', label: 'Half Height – Up to 60 inch' },
      ],
    };
    const result = questionItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('quantity');
    }
  });

  it('accepts quantity type without options (schema allows undefined options)', () => {
    const item = { key: 'units', label: 'Units', type: 'quantity', required: true };
    const result = questionItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });
});

describe('questionItemSchema — number type', () => {
  it('accepts number type (single numeric input)', () => {
    const item = {
      key: 'attendees',
      label: 'How many attendees?',
      type: 'number',
      required: false,
    };
    const result = questionItemSchema.safeParse(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('number');
    }
  });

  it('accepts number type with description', () => {
    const item = { key: 'students', label: 'How many students?', type: 'number', required: false, description: 'Including yourself' };
    expect(questionItemSchema.safeParse(item).success).toBe(true);
  });
});

describe('questionSchemaSchema — accepts mixed types including quantity and number', () => {
  it('validates a schema with checkbox, radio, text, quantity, and number questions', () => {
    const schema = [
      { key: 'action', label: 'Action', type: 'radio', required: true, options: [{ value: 'install', label: 'Install' }] },
      { key: 'items', label: 'Items', type: 'checkbox', required: true, minSelect: 1, options: [{ value: 'a', label: 'A' }] },
      { key: 'notes', label: 'Notes', type: 'text', required: false },
      { key: 'units', label: 'Units', type: 'quantity', required: true, options: [{ value: 'wall_1hp', label: 'Wall 1HP' }] },
      { key: 'size', label: 'Size (sqft)', type: 'number', required: false },
    ];
    const result = questionSchemaSchema.safeParse(schema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(5);
      expect(result.data[3].type).toBe('quantity');
      expect(result.data[4].type).toBe('number');
    }
  });
});

describe('computePrefill — quantity pricing (unit-price × qty)', () => {
  it('computes unit-price × quantity for each option and sums', () => {
    const schema = [
      {
        key: 'units', label: 'Units', type: 'quantity' as const,
        priced: true,
        options: [
          { value: 'wall_1hp', label: 'Wall Unit – 1HP' },
          { value: 'cassette_1hp', label: 'Cassette Unit – 1HP' },
        ],
      },
    ];
    const modifiers: OptionPriceMap = {
      units: {
        wall_1hp: { price: 150, notOffered: false },
        cassette_1hp: { price: 250, notOffered: false },
      },
    };
    const result = computePrefill(
      { units: { wall_1hp: 2, cassette_1hp: 1 } as unknown as string },
      schema,
      service(400, modifiers),
    );
    // wall_1hp × 2 = 300, cassette_1hp × 1 = 250 → total = 550
    expect(result).not.toBeNull();
    expect(result!.breakdown).toHaveLength(2);
    expect(result!.breakdown[0]).toMatchObject({ questionKey: 'units', optionValue: 'wall_1hp', price: 300 });
    expect(result!.breakdown[1]).toMatchObject({ questionKey: 'units', optionValue: 'cassette_1hp', price: 250 });
    expect(result!.defaultTotal).toBe(550);
  });

  it('skips options with zero or negative quantity', () => {
    const schema = [
      {
        key: 'sizes', label: 'Sizes', type: 'quantity' as const,
        priced: true,
        options: [{ value: 'full_40', label: 'Full 40' }, { value: 'half_60', label: 'Half 60' }],
      },
    ];
    const modifiers: OptionPriceMap = {
      sizes: {
        full_40: { price: 30, notOffered: false },
        half_60: { price: 25, notOffered: false },
      },
    };
    const result = computePrefill(
      { sizes: { full_40: 0, half_60: 3 } as unknown as string },
      schema,
      service(50, modifiers),
    );
    // only half_60 × 3 = 75 contributes
    expect(result!.breakdown).toHaveLength(1);
    expect(result!.breakdown[0].optionValue).toBe('half_60');
    expect(result!.breakdown[0].price).toBe(75);
    expect(result!.defaultTotal).toBe(75);
  });

  it('skips notOffered and null-price options in quantity', () => {
    const schema = [
      {
        key: 'units', label: 'Units', type: 'quantity' as const,
        priced: true,
        options: [{ value: 'wall_1hp', label: 'Wall 1HP' }, { value: 'cassette_1hp', label: 'Cassette 1HP' }],
      },
    ];
    const modifiers: OptionPriceMap = {
      units: {
        wall_1hp: { price: null, notOffered: false },
        cassette_1hp: { price: 200, notOffered: true },
      },
    };
    const result = computePrefill(
      { units: { wall_1hp: 2, cassette_1hp: 1 } as unknown as string },
      schema,
      service(300, modifiers),
    );
    expect(result!.breakdown).toHaveLength(0);
    expect(result!.defaultTotal).toBe(300);
  });

  it('accumulates durationMin × qty for quantity options', () => {
    const schema = [
      {
        key: 'units', label: 'Units', type: 'quantity' as const,
        priced: true,
        options: [{ value: 'wall_1hp', label: 'Wall 1HP' }, { value: 'cassette_1hp', label: 'Cassette 1HP' }],
      },
    ];
    const modifiers: OptionPriceMap = {
      units: {
        wall_1hp: { price: 150, durationMin: 45, notOffered: false },
        cassette_1hp: { price: 250, durationMin: 60, notOffered: false },
      },
    };
    const result = computePrefill(
      { units: { wall_1hp: 2, cassette_1hp: 1 } as unknown as string },
      schema,
      service(400, modifiers),
    );
    // 45 × 2 + 60 × 1 = 150
    expect(result!.estimatedDurationMin).toBe(150);
  });
});

describe('computePrefill — multi-axis additive with quantity + checkbox/radio', () => {
  it('sums quantity and checkbox/radio priced axes together', () => {
    const schema = [
      {
        key: 'curtain_sizes', label: 'Curtain sizes', type: 'quantity' as const,
        priced: true,
        options: [{ value: 'full_40', label: 'Full 40' }, { value: 'half_60', label: 'Half 60' }],
      },
      {
        key: 'cleaning_type', label: 'Cleaning type', type: 'radio' as const,
        priced: true,
        options: [{ value: 'normal', label: 'Normal' }, { value: 'dry', label: 'Dry' }],
      },
    ];
    const modifiers: OptionPriceMap = {
      curtain_sizes: { full_40: { price: 30, notOffered: false }, half_60: { price: 25, notOffered: false } },
      cleaning_type: { normal: { price: 20, notOffered: false }, dry: { price: 40, notOffered: false } },
    };
    // curtain: full_40 × 2 = 60 + cleaning: dry = 40 → total = 100
    const result = computePrefill(
      { curtain_sizes: { full_40: 2, half_60: 0 } as unknown as string, cleaning_type: 'dry' },
      schema,
      service(50, modifiers),
    );
    expect(result!.breakdown).toHaveLength(2);
    expect(result!.breakdown[0].price).toBe(60);
    expect(result!.breakdown[1].price).toBe(40);
    expect(result!.defaultTotal).toBe(100);
  });
});

describe('computePrefill — number type is always informational (no pricing)', () => {
  it('number question never contributes to pricing regardless of value', () => {
    const schema = [
      { key: 'cameras', label: 'How many cameras?', type: 'number' as const, priced: false },
    ];
    const result = computePrefill(
      { cameras: 5 as unknown as string },
      schema,
      service(150, {}),
    );
    expect(result).not.toBeNull();
    expect(result!.breakdown).toHaveLength(0);
    expect(result!.defaultTotal).toBe(150);
  });
});

// ── 6. optionPriceMapSchema accepts durationMin ───────────────────────────────

describe('optionPriceMapSchema — durationMin field (backward-compatible)', () => {
  it('accepts entry with durationMin', () => {
    const raw = {
      aircon_service: {
        wall_chemical: { price: 110, durationMin: 45, notOffered: false },
      },
    };
    const result = optionPriceMapSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aircon_service.wall_chemical.durationMin).toBe(45);
    }
  });

  it('accepts entry without durationMin (backward compatible)', () => {
    const raw = {
      aircon_service: { wall_chemical: { price: 110, notOffered: false } },
    };
    expect(optionPriceMapSchema.safeParse(raw).success).toBe(true);
  });

  it('rejects negative durationMin', () => {
    const raw = {
      aircon_service: { wall_chemical: { price: 110, durationMin: -1, notOffered: false } },
    };
    expect(optionPriceMapSchema.safeParse(raw).success).toBe(false);
  });

  it('rejects non-integer durationMin', () => {
    const raw = {
      aircon_service: { wall_chemical: { price: 110, durationMin: 30.5, notOffered: false } },
    };
    expect(optionPriceMapSchema.safeParse(raw).success).toBe(false);
  });
});
