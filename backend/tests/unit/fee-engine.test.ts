/**
 * Fee Engine unit tests - computeFees coverage.
 *
 * All Prisma + settings calls are mocked so these tests run without a database.
 */

import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    feeRule: { findMany: jest.fn() },
  },
}));

jest.mock('../../src/services/settings.service', () => ({
  getPlatformFeeRate: jest.fn().mockResolvedValue(0.05),
  getSstRate: jest.fn().mockResolvedValue(0.06),
}));

jest.mock('../../src/lib/money', () => ({
  computePlatformFee: jest.fn((amount: number, rate: number) => Math.max(0, Math.round(amount * rate * 100) / 100)),
  computeTotal: jest.fn(),
  computeHoldAmount: jest.fn(),
}));

import { computeFees } from '../../src/services/fee-engine.service';
import { getPlatformFeeRate } from '../../src/services/settings.service';
import { computePlatformFee } from '../../src/lib/money';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetPlatformFeeRate = getPlatformFeeRate as jest.MockedFunction<typeof getPlatformFeeRate>;
const mockComputePlatformFee = computePlatformFee as jest.MockedFunction<typeof computePlatformFee>;

function dec(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n), toFixed: (d: number) => n.toFixed(d) } as any;
}

describe('computeFees', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Test 1: Fallback — no FeeRules → uses platform_fee_rate × amount ──
  test('fallback: no FeeRules → returns platform_fee_rate * amount', async () => {
    (mockPrisma.feeRule.findMany as jest.Mock).mockResolvedValue([]);
    mockGetPlatformFeeRate.mockResolvedValue(0.05);
    mockComputePlatformFee.mockReturnValue(5.00);

    const fee = await computeFees(100, 'booking');

    expect(fee).toBe(5.00);
    expect(mockComputePlatformFee).toHaveBeenCalledWith(100, 0.05);
  });

  // ── Test 2: Single flat rule ──
  test('single flat rule: returns rule.rate directly', async () => {
    (mockPrisma.feeRule.findMany as jest.Mock).mockResolvedValue([
      { id: 'fr-1', type: 'flat', rate: dec(3.50), minAmount: null, maxAmount: null, capAmount: null },
    ]);

    const fee = await computeFees(100, 'booking');

    expect(fee).toBe(3.50);
    expect(mockGetPlatformFeeRate).not.toHaveBeenCalled();
  });

  // ── Test 3: Category scope ──
  test('category scope: rule with matching categoryId applies', async () => {
    (mockPrisma.feeRule.findMany as jest.Mock).mockImplementation((args: any) => {
      // Simulate: only return rules matching the category filter
      const catId = args.where.OR?.[1]?.categoryId;
      if (catId === 'cat-plumbing') {
        return Promise.resolve([
          { id: 'fr-plumbing', type: 'percentage', rate: dec(0.08), minAmount: null, maxAmount: null, capAmount: null },
        ]);
      }
      return Promise.resolve([
        { id: 'fr-global', type: 'percentage', rate: dec(0.05), minAmount: null, maxAmount: null, capAmount: null },
      ]);
    });

    // With category: should get 8% rule
    const feeWithCat = await computeFees(100, 'booking', 'cat-plumbing');
    expect(feeWithCat).toBe(8.00);

    // Without category: should get 5% global rule
    const feeNoCat = await computeFees(100, 'booking');
    expect(feeNoCat).toBe(5.00);
  });

  // ── Test 4: Cap/max ──
  test('cap/max: rule with maxAmount clamps the fee', async () => {
    (mockPrisma.feeRule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'fr-capped',
        type: 'percentage',
        rate: dec(0.10),
        minAmount: null,
        maxAmount: dec(5.00),
        capAmount: null,
      },
    ]);

    // 10% of 200 = 20, but maxAmount is 5
    const fee = await computeFees(200, 'booking');
    expect(fee).toBe(5.00);
  });

  // ── Test 5: Priority ──
  test('priority: multiple matching rules → all stack (lowest priority first)', async () => {
    (mockPrisma.feeRule.findMany as jest.Mock).mockResolvedValue([
      { id: 'fr-low', type: 'flat', rate: dec(2.00), minAmount: null, maxAmount: null, capAmount: null, priority: 0 },
      { id: 'fr-high', type: 'percentage', rate: dec(0.03), minAmount: null, maxAmount: null, capAmount: null, priority: 10 },
    ]);

    // flat 2.00 + 3% of 100 = 5.00
    const fee = await computeFees(100, 'booking');
    expect(fee).toBe(5.00);
  });

  // ── Test 6: NaN/Infinity guard ──
  test('NaN/Infinity guard: returns 0 for invalid inputs', async () => {
    const feeNaN = await computeFees(NaN, 'booking');
    expect(feeNaN).toBe(0);

    const feeInf = await computeFees(Infinity, 'booking');
    expect(feeInf).toBe(0);

    const feeNeg = await computeFees(-100, 'booking');
    expect(feeNeg).toBe(0);

    // Should not have called prisma at all for invalid inputs
    // (guard runs before the query)
  });

  // ── Bonus: DB error fallback ──
  test('DB error: falls back to legacy platform_fee_rate', async () => {
    (mockPrisma.feeRule.findMany as jest.Mock).mockRejectedValue(new Error('Connection refused'));
    mockGetPlatformFeeRate.mockResolvedValue(0.05);
    mockComputePlatformFee.mockReturnValue(5.00);

    const fee = await computeFees(100, 'booking');
    expect(fee).toBe(5.00);
    expect(mockGetPlatformFeeRate).toHaveBeenCalled();
    expect(mockComputePlatformFee).toHaveBeenCalledWith(100, 0.05);
  });
});
