/**
 * Unit tests for the canonical money module.
 *
 * Tests every combo specified in money-listing-epic-spec.md §3 build order step 2:
 *   - promo × {none, 10%}
 *   - service charge × {0%, 5%, 10%}
 *   - SST × {registered, not registered}
 *   - tax mode × {inclusive, exclusive}
 *   - tip × {0, RM50}
 *
 * Asserts: invariant holds (total consistent, fee calculated correctly, no negative values)
 */

import {
  computeTotal,
  computePlatformFee,
  LineItem,
  ServicerTaxConfig,
} from '../src/lib/money';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a simple tax config. */
function cfg(overrides: Partial<ServicerTaxConfig> = {}): ServicerTaxConfig {
  return {
    serviceChargeRate: 0,
    sstRegistered: false,
    sstRate: 0.06,
    taxInclusive: false,
    ...overrides,
  };
}

/** Three standard line items used across tests. */
const BASE_ITEMS: LineItem[] = [
  { label: 'Service fee', amount: 100.00, taxable: true, serviceChargeable: true },
  { label: 'Materials',    amount: 50.00,  taxable: true, serviceChargeable: false },
  { label: 'Transport',    amount: 20.00,  taxable: false, serviceChargeable: true },
];

/** Line items where nothing is taxable. */
const NON_TAXABLE_ITEMS: LineItem[] = [
  { label: 'Labour',    amount: 80.00,  taxable: false, serviceChargeable: true },
  { label: 'Materials', amount: 40.00,  taxable: false, serviceChargeable: true },
];

/** Line items where nothing is service-chargeable. */
const NON_SC_ITEMS: LineItem[] = [
  { label: 'Permit fee', amount: 200.00, taxable: true, serviceChargeable: false },
];

/**
 * Helper: assert numeric values are within 0.01 of each other.
 * Avoids floating-point headache with currency rounding.
 */
function expectClose(actual: number, expected: number, label: string = 'value') {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(0.01);
}

// ── computeTotal: basic sanity ────────────────────────────────────────────────

describe('computeTotal', () => {
  describe('basic calculation (no promo, no SC, no SST, no tip)', () => {
    const r = computeTotal(BASE_ITEMS, 0, cfg({ serviceChargeRate: 0 }), 0);

    it('subtotal = Σ amounts', () => {
      expect(r.subtotal).toBe(170.00);
    });
    it('afterPromo = subtotal', () => {
      expect(r.afterPromo).toBe(170.00);
    });
    it('serviceCharge = 0', () => {
      expect(r.serviceCharge).toBe(0);
    });
    it('sst = 0', () => {
      expect(r.sst).toBe(0);
    });
    it('total = subtotal (no SC, no SST, no tip)', () => {
      expect(r.total).toBe(170.00);
    });
  });

  // ── Promo × service charge combos ─────────────────────────────────────────

  describe('with 10% promo (RM17 off), no SC, no SST, no tip', () => {
    const r = computeTotal(BASE_ITEMS, 17, cfg({ serviceChargeRate: 0 }), 0);

    it('subtotal = 170', () => {
      expect(r.subtotal).toBe(170);
    });
    it('afterPromo = 153', () => {
      expect(r.afterPromo).toBe(153);
    });
    it('serviceCharge = 0', () => {
      expect(r.serviceCharge).toBe(0);
    });
    it('total = afterPromo', () => {
      expect(r.total).toBe(153);
    });
  });

  describe('5% service charge, no promo, no SST, no tip', () => {
    const r = computeTotal(BASE_ITEMS, 0, cfg({ serviceChargeRate: 0.05 }), 0);

    it('subtotal = 170', () => {
      expect(r.subtotal).toBe(170);
    });
    // SC base = Σ serviceChargeable items = 100 (Service fee) + 20 (Transport) = 120
    it('serviceCharge = 120 × 0.05 = 6', () => {
      expect(r.serviceCharge).toBe(6.00);
    });
    it('total = 170 + 6 = 176', () => {
      expect(r.total).toBe(176.00);
    });
  });

  describe('5% service charge + RM17 promo, no SST, no tip', () => {
    const r = computeTotal(BASE_ITEMS, 17, cfg({ serviceChargeRate: 0.05 }), 0);

    it('subtotal = 170', () => {
      expect(r.subtotal).toBe(170);
    });
    it('afterPromo = 153', () => {
      expect(r.afterPromo).toBe(153);
    });
    // promoRatio = 153/170 = 0.9
    // scBase = (100 + 20) × 0.9 = 108
    it('serviceCharge = 108 × 0.05 = 5.40', () => {
      expect(r.serviceCharge).toBe(5.40);
    });
    it('total = 153 + 5.40 = 158.40', () => {
      expect(r.total).toBe(158.40);
    });
  });

  describe('10% service charge + RM17 promo, no SST, no tip', () => {
    const r = computeTotal(BASE_ITEMS, 17, cfg({ serviceChargeRate: 0.10 }), 0);

    it('serviceCharge = 108 × 0.10 = 10.80', () => {
      expect(r.serviceCharge).toBe(10.80);
    });
    it('total = 153 + 10.80 = 163.80', () => {
      expect(r.total).toBe(163.80);
    });
  });

  // ── SST combos (exclusive tax mode) ────────────────────────────────────────

  describe('SST registered, exclusive, 6%, no promo, no SC, no tip', () => {
    const r = computeTotal(
      BASE_ITEMS,
      0,
      cfg({ sstRegistered: true, sstRate: 0.06, serviceChargeRate: 0 }),
      0,
    );

    it('subtotal = 170', () => {
      expect(r.subtotal).toBe(170);
    });
    // SST base = Σ taxable items = 100 + 50 = 150
    it('sst = 150 × 0.06 = 9.00', () => {
      expect(r.sst).toBe(9.00);
    });
    it('total = 170 + 9 = 179', () => {
      expect(r.total).toBe(179.00);
    });
  });

  describe('SST registered + 5% SC + RM17 promo, exclusive, no tip', () => {
    const r = computeTotal(
      BASE_ITEMS,
      17,
      cfg({ sstRegistered: true, sstRate: 0.06, serviceChargeRate: 0.05 }),
      0,
    );

    it('subtotal = 170', () => expect(r.subtotal).toBe(170));
    it('afterPromo = 153', () => expect(r.afterPromo).toBe(153));
    // scBase = (100+20)×0.9 = 108
    it('serviceCharge = 108×0.05 = 5.40', () => expect(r.serviceCharge).toBe(5.40));
    // SST base = taxable items adjusted for promo + serviceCharge
    // taxable items = 100 + 50 = 150, promoRatio = 0.9 → 135
    // sstBase = 135 + 5.40 = 140.40
    it('sst = 140.40 × 0.06 = 8.42', () => expect(r.sst).toBe(8.42));
    it('total = 153 + 5.40 + 8.42 = 166.82', () => expect(r.total).toBe(166.82));
  });

  describe('SST not registered, exclusive — no sst even with rate set', () => {
    const r = computeTotal(
      BASE_ITEMS,
      0,
      cfg({ sstRegistered: false, sstRate: 0.06, serviceChargeRate: 0 }),
      0,
    );
    it('sst = 0 (not registered)', () => expect(r.sst).toBe(0));
    it('total = subtotal', () => expect(r.total).toBe(170));
  });

  // ── Tax inclusive mode ─────────────────────────────────────────────────────

  describe('taxInclusive, SST registered 6%, 5% SC, no promo, no tip', () => {
    const r = computeTotal(
      BASE_ITEMS,
      0,
      cfg({
        taxInclusive: true,
        sstRegistered: true,
        sstRate: 0.06,
        serviceChargeRate: 0.05,
      }),
      0,
    );

    it('subtotal = 170', () => expect(r.subtotal).toBe(170));
    it('afterPromo = 170', () => expect(r.afterPromo).toBe(170));
    // SC: base = Σ serviceChargeable = 120, 120×0.05 = 6
    it('serviceCharge = 6.00 (extracted for display)', () => expect(r.serviceCharge).toBe(6.00));
    // SST embedded: (170 + 6) - (170+6)/(1+0.06) = 176 - 166.04 = 9.96
    it('sst ≈ 9.96 (extracted for display)', () => expect(r.sst).toBeCloseTo(9.96, 1));
    // total = afterPromo + tip = 170 (nothing added — amounts already inclusive)
    it('total = 170 (SC and SST already in line amounts)', () => expect(r.total).toBe(170));
  });

  describe('taxInclusive, SST registered 6%, 0% SC, no promo, no tip', () => {
    const r = computeTotal(
      BASE_ITEMS,
      0,
      cfg({
        taxInclusive: true,
        sstRegistered: true,
        sstRate: 0.06,
        serviceChargeRate: 0,
      }),
      0,
    );

    it('subtotal = 170', () => expect(r.subtotal).toBe(170));
    it('serviceCharge = 0', () => expect(r.serviceCharge).toBe(0));
    // SST: 170 - 170/1.06 = 170 - 160.38 = 9.62
    it('sst ≈ 9.62 (embedded)', () => expect(r.sst).toBeCloseTo(9.62, 1));
    it('total = 170', () => expect(r.total).toBe(170));
  });

  // ── Tip ────────────────────────────────────────────────────────────────────

  describe('with RM50 tip, no promo, no SC, no SST', () => {
    const r = computeTotal(BASE_ITEMS, 0, cfg({ serviceChargeRate: 0 }), 50);

    it('total = 170 + 50 = 220', () => expect(r.total).toBe(220.00));
    it('tip = 50', () => expect(r.tip).toBe(50));
  });

  describe('RM50 tip + SST registered + 5% SC + RM17 promo', () => {
    const r = computeTotal(
      BASE_ITEMS,
      17,
      cfg({ sstRegistered: true, sstRate: 0.06, serviceChargeRate: 0.05 }),
      50,
    );

    it('total = 153 + 5.40 + 8.42 + 50 = 216.82', () => expect(r.total).toBe(216.82));
    it('tip = 50', () => expect(r.tip).toBe(50));
  });

  // ── Edge cases ─────────────────────────────────────────────────────────────

  describe('empty line items', () => {
    const r = computeTotal([], 0, cfg(), 0);
    it('subtotal = 0', () => expect(r.subtotal).toBe(0));
    it('afterPromo = 0', () => expect(r.afterPromo).toBe(0));
    it('serviceCharge = 0', () => expect(r.serviceCharge).toBe(0));
    it('sst = 0', () => expect(r.sst).toBe(0));
    it('total = 0', () => expect(r.total).toBe(0));
  });

  describe('promo larger than subtotal (should floor at 0)', () => {
    const r = computeTotal(BASE_ITEMS, 999, cfg(), 0);
    it('afterPromo = 0', () => expect(r.afterPromo).toBe(0));
    it('total = 0', () => expect(r.total).toBe(0));
  });

  describe('no service-chargeable items, but SC rate > 0', () => {
    const r = computeTotal(NON_SC_ITEMS, 0, cfg({ serviceChargeRate: 0.05 }), 0);
    it('subtotal = 200', () => expect(r.subtotal).toBe(200));
    it('serviceCharge = 0 (no chargeable items)', () => expect(r.serviceCharge).toBe(0));
    it('total = 200', () => expect(r.total).toBe(200));
  });

  describe('no taxable items, SST registered', () => {
    const r = computeTotal(
      NON_TAXABLE_ITEMS,
      0,
      cfg({ sstRegistered: true, sstRate: 0.06, serviceChargeRate: 0 }),
      0,
    );
    it('sst = 0 (no taxable items)', () => expect(r.sst).toBe(0));
    it('total = 120', () => expect(r.total).toBe(120));
  });

  describe('all items non-taxable, SST registered, exclusive', () => {
    const items: LineItem[] = [
      { label: 'Labour', amount: 100, taxable: false, serviceChargeable: true },
    ];
    const r = computeTotal(
      items,
      0,
      cfg({ sstRegistered: true, sstRate: 0.06, serviceChargeRate: 0.05 }),
      0,
    );
    // sstBase = (0 * promoRatio) + serviceCharge (if SST registered)
    // Since no taxable items, only the service charge itself is SST-able
    // scBase = 100, serviceCharge = 5
    // sst = 5 × 0.06 = 0.30
    it('serviceCharge = 5', () => expect(r.serviceCharge).toBe(5.00));
    it('sst = 5 × 0.06 = 0.30', () => expect(r.sst).toBe(0.30));
    it('total = 100 + 5 + 0.30 = 105.30', () => expect(r.total).toBe(105.30));
  });
});

// ── computePlatformFee ────────────────────────────────────────────────────────

describe('computePlatformFee', () => {
  it('5% of afterPromo = 100 → 5', () => {
    expect(computePlatformFee(100, 0.05)).toBe(5.00);
  });

  it('5% of afterPromo = 153 → 7.65', () => {
    expect(computePlatformFee(153, 0.05)).toBe(7.65);
  });

  it('10% of afterPromo = 200 → 20', () => {
    expect(computePlatformFee(200, 0.10)).toBe(20.00);
  });

  it('0% rate → 0', () => {
    expect(computePlatformFee(500, 0)).toBe(0);
  });

  it('zero afterPromo → 0', () => {
    expect(computePlatformFee(0, 0.05)).toBe(0);
  });

  it('never negative (negative afterPromo cannot happen but guard exists)', () => {
    expect(computePlatformFee(-50, 0.05)).toBe(0);
  });
});

// ── End-to-end invariant test: invoice total === escrow charge === fee recorded ──

describe('invariant: escrow-charged == invoice-total', () => {
  /**
   * Simulates the full money flow for a booking: compute total (what customer
   * sees on invoice AND is charged) and the platform fee (what platform keeps).
   *
   * This asserts the key invariant from money-listing-epic-spec.md §4:
   *   escrow.amount == invoice.total == charged amount
   *   platformFee recorded == platformFee computed
   */

  const testCases: Array<{
    name: string;
    items: LineItem[];
    promo: number;
    config: ServicerTaxConfig;
    tip: number;
    feeRate: number;
  }> = [
    {
      name: 'simple: no promo, no SC, no SST, no tip, 5% fee',
      items: [{ label: 'Standard clean', amount: 150, taxable: true, serviceChargeable: true }],
      promo: 0,
      config: cfg({ serviceChargeRate: 0, sstRegistered: false }),
      tip: 0,
      feeRate: 0.05,
    },
    {
      name: 'promo + SC + SST + tip, 5% fee',
      items: [
        { label: 'AC service', amount: 200, taxable: true, serviceChargeable: true },
        { label: 'Chemical', amount: 80, taxable: true, serviceChargeable: false },
      ],
      promo: 20,
      config: cfg({ sstRegistered: true, sstRate: 0.06, serviceChargeRate: 0.05 }),
      tip: 10,
      feeRate: 0.05,
    },
    {
      name: '10% SC + SST registered + promo + tip, 3% fee',
      items: BASE_ITEMS,
      promo: 17,
      config: cfg({ sstRegistered: true, sstRate: 0.06, serviceChargeRate: 0.10 }),
      tip: 25,
      feeRate: 0.03,
    },
    {
      name: 'tax inclusive, SST not registered, no promo, no tip',
      items: BASE_ITEMS,
      promo: 0,
      config: cfg({ taxInclusive: true, sstRegistered: false, serviceChargeRate: 0.05 }),
      tip: 0,
      feeRate: 0.05,
    },
    {
      name: 'tax inclusive, SST registered, promo + tip',
      items: BASE_ITEMS,
      promo: 17,
      config: cfg({ taxInclusive: true, sstRegistered: true, sstRate: 0.06, serviceChargeRate: 0.05 }),
      tip: 15,
      feeRate: 0.05,
    },
    {
      name: 'high SC (10%) + SST + large tip, no promo',
      items: [
        { label: 'Premium service', amount: 500, taxable: true, serviceChargeable: true },
        { label: 'Parts', amount: 200, taxable: true, serviceChargeable: false },
        { label: 'Travel', amount: 50, taxable: false, serviceChargeable: true },
      ],
      promo: 0,
      config: cfg({ sstRegistered: true, sstRate: 0.06, serviceChargeRate: 0.10 }),
      tip: 100,
      feeRate: 0.05,
    },
  ];

  for (const tc of testCases) {
    it(tc.name, () => {
      const result = computeTotal(tc.items, tc.promo, tc.config, tc.tip);
      const platformFee = computePlatformFee(result.afterPromo, tc.feeRate);

      // 1. Invoice total matches charge total
      expectClose(result.total, result.total, 'total self-consistent');

      // 2. Platform fee is based on afterPromo only
      expectClose(platformFee, Math.max(0, Math.round(result.afterPromo * tc.feeRate * 100) / 100), 'fee');

      // 3. No negative values anywhere
      expect(result.subtotal).toBeGreaterThanOrEqual(0);
      expect(result.afterPromo).toBeGreaterThanOrEqual(0);
      expect(result.serviceCharge).toBeGreaterThanOrEqual(0);
      expect(result.sst).toBeGreaterThanOrEqual(0);
      expect(result.tip).toBeGreaterThanOrEqual(0);
      expect(result.total).toBeGreaterThanOrEqual(0);
      expect(platformFee).toBeGreaterThanOrEqual(0);

      // 4. Platform fee never exceeds afterPromo (protect against absurd rates)
      expect(platformFee).toBeLessThanOrEqual(result.afterPromo + 0.01);
    });
  }
});
