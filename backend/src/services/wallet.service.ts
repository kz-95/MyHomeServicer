import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

/**
 * Get or create a wallet for an owner (user, servicer, or platform).
 * Uses the composite unique constraint (ownerId, ownerType) - idempotent.
 */
export async function getOrCreateWallet(
  ownerId: string,
  ownerType: 'user' | 'servicer' | 'platform',
): Promise<{ id: string; balance: number; available: number; pending: number }> {
  let wallet = await prisma.wallet.findUnique({
    where: { ownerId_ownerType: { ownerId, ownerType } },
  });

  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { ownerId, ownerType, currency: 'MYR' },
    });
  }

  return {
    id: wallet.id,
    balance: Number(wallet.balance),
    available: Number(wallet.available),
    pending: Number(wallet.pending),
  };
}

/**
 * Adjust a wallet's balance atomically and record a checkpoint.
 * delta > 0 = credit, delta < 0 = debit.
 * Returns the new balance.
 */
export async function adjustWalletBalance(
  walletId: string,
  delta: number,
  opts?: {
    transactionId?: string;
    reason?: string;
  },
): Promise<{ balanceBefore: number; balanceAfter: number }> {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { id: walletId } });
    if (!wallet) throw new Error('Wallet not found');

    const balanceBefore = Number(wallet.balance);
    const balanceAfter = Math.round((balanceBefore + delta) * 100) / 100;

    if (balanceAfter < 0) {
      throw new Error('Insufficient wallet balance');
    }

    await tx.wallet.update({
      where: { id: walletId },
      data: {
        balance: balanceAfter,
        available: Math.max(0, Number(wallet.available) + delta),
      },
    });

    await tx.balanceCheckpoint.create({
      data: {
        walletId,
        delta,
        balanceBefore,
        balanceAfter,
        transactionId: opts?.transactionId ?? null,
        reason: opts?.reason ?? null,
      },
    });

    logger.debug('Wallet balance adjusted', {
      walletId,
      delta,
      balanceBefore,
      balanceAfter,
      reason: opts?.reason,
    });

    return { balanceBefore, balanceAfter };
  });
}
