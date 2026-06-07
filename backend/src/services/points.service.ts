import { prisma } from '../lib/prisma';
import { badRequest, businessRule, notFound } from '../lib/errors';
import type { LoyaltyTier, CustomerPoints, PointsTransaction, Redemption } from '@prisma/client';

export interface TierInfo {
  name: string;
  bonusPercent: number;
  progress: number;
  next: string | null;
}

let _cachedTiers: LoyaltyTier[] = [];

async function loadTiers(): Promise<LoyaltyTier[]> {
  if (_cachedTiers.length === 0) {
    _cachedTiers = await prisma.loyaltyTier.findMany({
      where: { active: true },
      orderBy: { minPoints: 'asc' },
    });
  }
  return _cachedTiers;
}

export function invalidateTierCache(): void {
  _cachedTiers = [];
}

export function computeTier(lifetimeEarned: number, tiers?: LoyaltyTier[]): TierInfo {
  const sorted = tiers ? [...tiers].sort((a, b) => b.minPoints - a.minPoints) : [];
  const current = sorted.find((t) => lifetimeEarned >= t.minPoints);
  const next = tiers
    ? [...tiers].sort((a, b) => a.minPoints - b.minPoints).find((t) => t.minPoints > lifetimeEarned)
    : null;
  return {
    name: current?.name ?? 'Bronze',
    bonusPercent: current?.bonusPercent ?? 0,
    progress: next && current
      ? ((lifetimeEarned - current.minPoints) / (next.minPoints - current.minPoints)) * 100
      : 100,
    next: next?.name ?? null,
  };
}

/**
 * Award 50 review points for a completed booking.
 * Reference can be the review ID once the review system exists;
 * falls back to booking ID when called from doneJob() before review creation.
 */
const REVIEW_POINTS = 50;

export async function awardReviewPoints(
  userId: string,
  bookingId: string,
  reviewId?: string,
): Promise<CustomerPoints> {
  return awardPoints(
    userId,
    REVIEW_POINTS,
    'earn_review',
    reviewId ?? bookingId,
    `Review bonus for booking #${bookingId.slice(-8)}`,
  );
}

export async function awardPoints(
  userId: string,
  amount: number,
  type: string,
  reference?: string,
  note?: string,
  tx?: Omit<typeof prisma, 'symbol' | 'frozen'>,
): Promise<CustomerPoints> {
  const client = tx ?? prisma;
  const prev = await client.customerPoints.findUnique({ where: { userId } });
  const newBalance = (prev?.balance ?? 0) + amount;
  const newLifetime = (prev?.lifetimeEarned ?? 0) + amount;

  const points = await client.customerPoints.upsert({
    where: { userId },
    update: {
      balance: newBalance,
      lifetimeEarned: newLifetime,
    },
    create: {
      userId,
      balance: amount,
      lifetimeEarned: amount,
    },
  });

  await client.pointsTransaction.create({
    data: {
      userId,
      type,
      amount,
      balance: points.balance,
      reference,
      note,
    },
  });

  return points;
}

export async function redeemPoints(
  userId: string,
  rewardId: string,
): Promise<{ voucherCode: string; redemption: Redemption }> {
  const [points, reward] = await Promise.all([
    prisma.customerPoints.findUnique({ where: { userId } }),
    prisma.reward.findUnique({ where: { id: rewardId } }),
  ]);

  if (!reward || !reward.active) throw notFound('Reward not found or inactive');
  if (!points) throw badRequest('No points balance found');
  if (points.balance < reward.pointCost) {
    throw businessRule(`Insufficient points. Need ${reward.pointCost}, have ${points.balance}`);
  }

  const voucherCode = `RWD-${randomCode(5)}`;

  const redemption = await prisma.$transaction(async (tx) => {
    const updated = await tx.customerPoints.update({
      where: { userId },
      data: {
        balance: { decrement: reward.pointCost },
        lifetimeSpent: { increment: reward.pointCost },
      },
    });

    const expiresAt = new Date(Date.now() + 30 * 86_400_000);

    await tx.pointsTransaction.create({
      data: {
        userId,
        type: 'redeem',
        amount: -reward.pointCost,
        balance: updated.balance,
        reference: rewardId,
        note: `Redeemed "${reward.name}"`,
      },
    });

    return tx.redemption.create({
      data: {
        userId,
        rewardId,
        voucherCode,
        expiresAt,
      },
    });
  });

  return { voucherCode, redemption };
}

export async function getUserPoints(userId: string): Promise<{
  balance: number;
  lifetimeEarned: number;
  tier: TierInfo;
  recentTransactions: PointsTransaction[];
}> {
  const [points, transactions, tiers] = await Promise.all([
    prisma.customerPoints.findUnique({ where: { userId } }),
    prisma.pointsTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    loadTiers(),
  ]);

  const balance = points?.balance ?? 0;
  const lifetimeEarned = points?.lifetimeEarned ?? 0;
  const tier = computeTier(lifetimeEarned, tiers);

  return { balance, lifetimeEarned, tier, recentTransactions: transactions };
}

function randomCode(length: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}
