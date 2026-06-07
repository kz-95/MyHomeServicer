/**
 * Unit tests — credit service: computeFee() bridge to the canonical
 * computePlatformFee() from money.ts.
 *
 * The old computeCharge / PlatformCharge duality is removed. computeFee
 * resolves the rate from settings then delegates to computePlatformFee.
 * This test mocks the settings service to verify the bridge works.
 */

import { computeFee } from '../../src/services/credit.service';
import { getPlatformFeeRate } from '../../src/services/settings.service';

jest.mock('../../src/services/settings.service', () => ({
  getPlatformFeeRate: jest.fn(),
}));

const mockGetPlatformFeeRate = getPlatformFeeRate as jest.MockedFunction<typeof getPlatformFeeRate>;

describe('computeFee — async bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('5% of 100 = 5', async () => {
    mockGetPlatformFeeRate.mockResolvedValue(0.05);
    await expect(computeFee(100)).resolves.toBe(5);
  });

  it('10% of 200 = 20', async () => {
    mockGetPlatformFeeRate.mockResolvedValue(0.10);
    await expect(computeFee(200)).resolves.toBe(20);
  });

  it('0% rate = 0', async () => {
    mockGetPlatformFeeRate.mockResolvedValue(0);
    await expect(computeFee(500)).resolves.toBe(0);
  });

  it('zero amount = 0', async () => {
    mockGetPlatformFeeRate.mockResolvedValue(0.05);
    await expect(computeFee(0)).resolves.toBe(0);
  });

  it('rounds to 2 decimal places', async () => {
    mockGetPlatformFeeRate.mockResolvedValue(0.03);
    // 3% of 99.99 = 2.9997 → rounds to 3.00
    await expect(computeFee(99.99)).resolves.toBe(3);
  });

  it('never returns negative', async () => {
    mockGetPlatformFeeRate.mockResolvedValue(0.05);
    // computePlatformFee guards against negative afterPromo
    await expect(computeFee(-50)).resolves.toBe(0);
  });

  it('calls getPlatformFeeRate exactly once', async () => {
    mockGetPlatformFeeRate.mockResolvedValue(0.05);
    await computeFee(100);
    expect(getPlatformFeeRate).toHaveBeenCalledTimes(1);
  });
});
