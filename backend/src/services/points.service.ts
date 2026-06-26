import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, businessRule, notFound } from '../lib/errors';
import { getSetting } from './settings.service';
import { recordTransaction } from './ledger.service';
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
 * Resolve points-config values from platform settings, falling back to defaults.
 * Cached in module scope for the lifetime of the process; admin changes require a restart
 * (or you can call invalidatePointsConfigCache() from the admin route).
 */
interface PointsConfig {
  pointsPerRm: number;
  pointsPerReview: number;
  pointsPerReferral: number;
  welcomePoints: number;
  redemptionRate: number;
}

let _pointsConfig: PointsConfig | null = null;

export function invalidatePointsConfigCache(): void {
  _pointsConfig = null;
}

export async function getPointsConfig(): Promise<PointsConfig> {
  if (_pointsConfig) return _pointsConfig;
  const keys = ['points_per_rm', 'points_per_review', 'points_per_referral', 'welcome_points', 'redemption_rate'] as const;
  const results = await Promise.all(keys.map((k) => getSetting<number>(k)));
  _pointsConfig = {
    pointsPerRm: results[0] ?? 1,
    pointsPerReview: results[1] ?? 50,
    pointsPerReferral: results[2] ?? 200,
    welcomePoints: results[3] ?? 500,
    redemptionRate: results[4] ?? 100,
  };
  return _pointsConfig;
}

/**
 * Get the tier bonus multiplier for a user (1 + bonusPercent/100), or 1 if no tier.
 */
export async function getTierBonusMultiplier(userId: string): Promise<number> {
  const points = await prisma.customerPoints.findUnique({ where: { userId } });
  if (!points) return 1;
  const tiers = await loadTiers();
  const tier = computeTier(points.lifetimeEarned, tiers);
  return 1 + tier.bonusPercent / 100;
}

/**
 * Award review points for a completed booking.
 * Reference can be the review ID once the review system exists;
 * falls back to booking ID when called from doneJob() before review creation.
 */
export async function awardReviewPoints(
  userId: string,
  bookingId: string,
  reviewId?: string,
): Promise<CustomerPoints> {
  const config = await getPointsConfig();
  return awardPoints(
    userId,
    config.pointsPerReview,
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
  tx?: Prisma.TransactionClient,
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

  // Record points_liability in the transaction ledger for financial reporting.
  // Each point awarded creates a liability equal to points / redemptionRate RM.
  // Uses the same tx client so it is atomic with the points upsert/insert.
  const config = await getPointsConfig();
  const liabilityAmount = Math.round((amount * (1 / config.redemptionRate)) * 100) / 100;
  await recordTransaction(
    {
      type: 'points_liability',
      amount: liabilityAmount,
      userId,
      reference: `Points liability: ${amount} pts awarded (${type})`,
      status: 'completed',
    },
    tx,
  );

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
