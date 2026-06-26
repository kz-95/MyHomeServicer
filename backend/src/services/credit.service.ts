import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { computeFees } from './fee-engine.service';

/**
 * Credit wallet helpers - simple add/deduct on a user's or servicer's
 * `creditBalance`, plus the unified platform fee (backed by FeeRule engine
 * with fallback to money.ts).
 *
 * The legacy `PlatformCharge` / `platform_charge` / `computeCharge` duality
 * is removed. The FeeRule table (fee-engine.service.ts) is the new source of
 * truth; `computePlatformFee` from money.ts is the fallback when no FeeRules
 * are configured.
 */

/**
 * Computes the platform fee using the FeeRule engine (P2 fintech).
 * Falls back to the legacy `platform_fee_rate` setting if no FeeRules exist.
 *
 * @param amount - base amount for fee calculation (afterPromo)
 * @param categoryId - optional category for per-category fee rules
 */
export async function computeFee(amount: number, categoryId?: string): Promise<number> {
  return computeFees(amount, 'booking', categoryId);
}

/**
 * Adds (positive delta) or deducts (negative delta) credit on a user or
 * servicer account. Pass `tx` to run inside an existing Prisma transaction.
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
    const balance = Number(u.creditBalance);
    if (balance < 0) throw new ApiError('INSUFFICIENT_CREDIT', `Insufficient credit balance. Need RM ${Math.abs(balance).toFixed(2)} more.`);
    return balance;
  }
  const m = await db.servicer.update({
    where: { id },
    data: { creditBalance: { increment: delta } },
  });
  return Number(m.creditBalance);
}
