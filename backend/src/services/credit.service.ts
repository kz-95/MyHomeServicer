import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getPlatformFeeRate } from './settings.service';
import { computePlatformFee } from '../lib/money';

/**
 * Credit wallet helpers — simple add/deduct on a user's or merchant's
 * `creditBalance`, plus the unified platform fee (backed by money.ts).
 *
 * The legacy `PlatformCharge` / `platform_charge` / `computeCharge` duality
 * is removed. ONE platform-fee setting (`platform_fee_rate`), ONE function
 * (`computePlatformFee` from money.ts), called through the bridge below.
 */

/**
 * Computes the platform fee on a given amount using the single `platform_fee_rate`
 * setting. This is a thin bridge: resolves the rate from settings then delegates
 * to the canonical `computePlatformFee()`.
 */
export async function computeFee(amount: number): Promise<number> {
  const feeRate = await getPlatformFeeRate();
  return computePlatformFee(amount, feeRate);
}

/**
 * Adds (positive delta) or deducts (negative delta) credit on a user or
 * merchant account. Pass `tx` to run inside an existing Prisma transaction.
 * Returns the new balance.
 */
export async function adjustCredit(
  kind: 'user' | 'servicer',
  id: string,
  delta: number,
  tx?: Prisma.TransactionClient,
): Promise<number> {
  const db = tx ?? prisma;
  if (kind === 'user') {
    const u = await db.user.update({
      where: { id },
      data: { creditBalance: { increment: delta } },
    });
    return Number(u.creditBalance);
  }
  const m = await db.servicer.update({
    where: { id },
    data: { creditBalance: { increment: delta } },
  });
  return Number(m.creditBalance);
}
