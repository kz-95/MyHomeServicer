/**
 * Fintech unit tests — P1-P4 wallet, fee engine, saved payments, disputes.
 *
 * All Prisma calls are mocked so these tests run without a database.
 */

import { prisma } from '../../src/lib/prisma';

jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    wallet: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    balanceCheckpoint: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    feeRule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    savedPaymentMethod: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    },
    dispute: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    booking: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: any) => cb(prisma)),
  },
}));

import {
  listFeeRules,
  createFeeRule,
  updateFeeRule,
  deleteFeeRule,
  getApplicableFeeRules,
} from '../../src/services/fee-engine.service';
import {
  listPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getPaymentMethod,
} from '../../src/services/saved-payment.service';
import {
  listDisputes,
  getDispute,
  dismissDispute,
} from '../../src/services/dispute.service';
import { getOrCreateWallet, adjustWalletBalance } from '../../src/services/wallet.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Mock Prisma Decimal that works with `Number()` conversion. */
function dec(n: number) {
  return { toNumber: () => n, valueOf: () => n, toString: () => String(n), toFixed: (d: number) => n.toFixed(d) } as any;
}

// ── P1 — Wallet ──────────────────────────────────────────────────────────────

describe('P1 — Wallet service', () => {
  const walletFixture = {
    id: 'wallet-1',
    balance: dec(0),
    available: dec(0),
    pending: dec(0),
    currency: 'MYR',
    ownerId: 'u-1',
    ownerType: 'user' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getOrCreateWallet returns existing wallet', async () => {
    (mockPrisma.wallet.findUnique as jest.Mock).mockResolvedValue(walletFixture);
    const w = await getOrCreateWallet('u-1', 'user');
    expect(w).toBeDefined();
    expect(w.id).toBe('wallet-1');
    expect(w.balance).toBe(0);
  });

  test('getOrCreateWallet creates new wallet when not found', async () => {
    (mockPrisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.wallet.create as jest.Mock).mockResolvedValue(walletFixture);
    const w = await getOrCreateWallet('u-1', 'user');
    expect(mockPrisma.wallet.create).toHaveBeenCalled();
    expect(w.id).toBe('wallet-1');
  });

  test('adjustWalletBalance credits and records checkpoint', async () => {
    (mockPrisma.wallet.findUnique as jest.Mock).mockResolvedValue(walletFixture);
    (mockPrisma.wallet.update as jest.Mock).mockResolvedValue(walletFixture);
    (mockPrisma.balanceCheckpoint.create as jest.Mock).mockResolvedValue({});
    const result = await adjustWalletBalance('wallet-1', 100);
    expect(result.balanceAfter).toBe(100);
    expect(mockPrisma.balanceCheckpoint.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ delta: 100 }) }),
    );
  });

  test('adjustWalletBalance throws on negative balance', async () => {
    const negativeWallet = { ...walletFixture, balance: dec(-10) };
    (mockPrisma.wallet.findUnique as jest.Mock).mockResolvedValue(negativeWallet);
    await expect(adjustWalletBalance('wallet-1', -20)).rejects.toThrow(/Insufficient/);
  });

  test('adjustWalletBalance throws on wallet not found', async () => {
    (mockPrisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(adjustWalletBalance('bad-id', 100)).rejects.toThrow(/not found/);
  });
});

// ── P2 — Fee Engine ──────────────────────────────────────────────────────────

describe('P2 — Fee Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listFeeRules calls prisma and returns array', async () => {
    (mockPrisma.feeRule.findMany as jest.Mock).mockResolvedValue([]);
    const rules = await listFeeRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(mockPrisma.feeRule.findMany).toHaveBeenCalled();
  });

  test('createFeeRule calls prisma.create', async () => {
    const fixture = { id: 'fr-1', name: 'Test', type: 'percentage', rate: dec(0.1) };
    (mockPrisma.feeRule.create as jest.Mock).mockResolvedValue(fixture);
    const rule = await createFeeRule({
      name: 'Test',
      type: 'percentage',
      rate: 0.10,
      appliesTo: 'booking',
    });
    expect(mockPrisma.feeRule.create).toHaveBeenCalled();
    expect(rule.id).toBe('fr-1');
  });

  test('updateFeeRule calls prisma.update', async () => {
    const fixture = { id: 'fr-1', name: 'Updated', type: 'percentage', rate: dec(0.15) };
    (mockPrisma.feeRule.update as jest.Mock).mockResolvedValue(fixture);
    const rule = await updateFeeRule('fr-1', { rate: 0.15, name: 'Updated' });
    expect(mockPrisma.feeRule.update).toHaveBeenCalled();
    expect(rule.id).toBe('fr-1');
  });

  test('deleteFeeRule calls prisma.delete', async () => {
    (mockPrisma.feeRule.delete as jest.Mock).mockResolvedValue({});
    await deleteFeeRule('fr-1');
    expect(mockPrisma.feeRule.delete).toHaveBeenCalledWith({ where: { id: 'fr-1' } });
  });

  test('getApplicableFeeRules filters by appliesTo and active', async () => {
    (mockPrisma.feeRule.findMany as jest.Mock).mockResolvedValue([
      { id: 'fr-1', type: 'percentage', rate: dec(0.1), minAmount: null, maxAmount: null, capAmount: null },
    ]);
    const rules = await getApplicableFeeRules('booking');
    expect(mockPrisma.feeRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: true, appliesTo: 'booking' }),
      }),
    );
    expect(rules).toHaveLength(1);
  });
});

// ── P3 — Saved Payment Methods ───────────────────────────────────────────────

describe('P3 — Saved Payment Methods', () => {
  const userId = 'u-pm';
  const pmFixture = {
    id: 'pm-1',
    userId,
    stripePaymentMethodId: 'pm_test',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listPaymentMethods returns user methods', async () => {
    (mockPrisma.savedPaymentMethod.findMany as jest.Mock).mockResolvedValue([pmFixture]);
    const methods = await listPaymentMethods(userId);
    expect(Array.isArray(methods)).toBe(true);
    expect(methods).toHaveLength(1);
  });

  test('getPaymentMethod returns method or throws', async () => {
    (mockPrisma.savedPaymentMethod.findUnique as jest.Mock).mockResolvedValue(pmFixture);
    const pm = await getPaymentMethod(userId, 'pm-1');
    expect(pm.id).toBe('pm-1');

    (mockPrisma.savedPaymentMethod.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(getPaymentMethod(userId, 'bad-id')).rejects.toThrow(/not found/);
  });

  test('createPaymentMethod calls prisma', async () => {
    (mockPrisma.savedPaymentMethod.create as jest.Mock).mockResolvedValue(pmFixture);
    const pm = await createPaymentMethod(userId, {
      stripePaymentMethodId: 'pm_test',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
    });
    expect(pm.id).toBe('pm-1');
    expect(mockPrisma.savedPaymentMethod.create).toHaveBeenCalled();
  });

  test('updatePaymentMethod sets default and unsets others', async () => {
    (mockPrisma.savedPaymentMethod.findUnique as jest.Mock).mockResolvedValue(pmFixture);
    (mockPrisma.savedPaymentMethod.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.savedPaymentMethod.update as jest.Mock).mockResolvedValue({ ...pmFixture, isDefault: true });
    const updated = await updatePaymentMethod(userId, 'pm-1', { isDefault: true });
    expect(updated.isDefault).toBe(true);
    expect(mockPrisma.savedPaymentMethod.updateMany).toHaveBeenCalled();
  });

  test('deletePaymentMethod removes a card', async () => {
    (mockPrisma.savedPaymentMethod.findUnique as jest.Mock).mockResolvedValue(pmFixture);
    (mockPrisma.savedPaymentMethod.delete as jest.Mock).mockResolvedValue(pmFixture);
    await deletePaymentMethod(userId, 'pm-1');
    expect(mockPrisma.savedPaymentMethod.delete).toHaveBeenCalledWith({ where: { id: 'pm-1' } });
  });
});

// ── P4 — Disputes ────────────────────────────────────────────────────────────

describe('P4 — Disputes', () => {
  const disputeFixture = {
    id: 'd-1',
    bookingId: 'b-1',
    escrowId: null,
    openedById: 'u-1',
    openedBy: 'customer',
    reason: 'Test',
    status: 'open',
    resolution: null,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    booking: { id: 'b-1', price: dec(100), status: 'completed', userId: 'u-1', servicerId: 's-1' },
    escrow: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('listDisputes returns array', async () => {
    (mockPrisma.dispute.findMany as jest.Mock).mockResolvedValue([disputeFixture]);
    const disputes = await listDisputes();
    expect(Array.isArray(disputes)).toBe(true);
    expect(disputes).toHaveLength(1);
  });

  test('listDisputes filters by status', async () => {
    (mockPrisma.dispute.findMany as jest.Mock).mockResolvedValue([]);
    await listDisputes({ status: 'open' });
    expect(mockPrisma.dispute.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'open' }) }),
    );
  });

  test('getDispute returns dispute or throws', async () => {
    (mockPrisma.dispute.findUnique as jest.Mock).mockResolvedValue(disputeFixture);
    const d = await getDispute('d-1');
    expect(d.id).toBe('d-1');

    (mockPrisma.dispute.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(getDispute('bad-id')).rejects.toThrow(/not found/);
  });

  test('dismissDispute works on open dispute', async () => {
    (mockPrisma.dispute.findUnique as jest.Mock).mockResolvedValue(disputeFixture);
    const resolvedFixture = { ...disputeFixture, status: 'dismissed', resolvedAt: new Date() };
    (mockPrisma.dispute.update as jest.Mock).mockResolvedValue(resolvedFixture);
    const d = await dismissDispute('d-1');
    expect(d.status).toBe('dismissed');
  });

  test('dismissDispute rejects non-open dispute', async () => {
    const resolvedFixture = { ...disputeFixture, status: 'resolved' };
    (mockPrisma.dispute.findUnique as jest.Mock).mockResolvedValue(resolvedFixture);
    await expect(dismissDispute('d-1')).rejects.toThrow(/Cannot dismiss/);
  });
});
