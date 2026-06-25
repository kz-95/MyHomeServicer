import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export interface AppliedPromotion {
  promotionId: string;
  label: string;
  discountAmount: number;
  discountType: 'percent' | 'fixed';
}

export interface PromotionContext {
  userId: string;
  role?: 'customer' | 'servicer';
  amount?: number;
  categoryId?: string;
  bookingCount?: number;  // completed bookings before this one (0 = first booking)
  topupCount?: number;    // prior topups (0 = first topup)
}

/**
 * Evaluate all active promotions for a given trigger type and context.
 *
 * Trigger types (14):
 *   topup_any, topup_min_amount, first_topup
 *   order_percent, order_fixed_discount
 *   first_booking, nth_booking, booking_min_amount, category_booking
 *   signup_bonus
 *   referral_giver, referral_receiver
 *   seasonal_percent, seasonal_fixed
 */
export async function evaluatePromotions(
  triggerType: string,
  context: PromotionContext,
): Promise<AppliedPromotion[]> {
  const now = new Date();
  const role = context.role ?? 'customer';

  const promotions = await prisma.promotion.findMany({
    where: {
      triggerType,
      active: true,
      targetRole: { in: [role, 'all'] },
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
    },
  });

  const results: AppliedPromotion[] = [];

  for (const promo of promotions) {
    // Global usage cap
    if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) continue;

    // Per-user usage cap (checked via PromotionRedemption count)
    if (promo.maxPerUser !== null) {
      const userUses = await prisma.promotionRedemption.count({
        where: { promotionId: promo.id, userId: context.userId },
      });
      if (userUses >= promo.maxPerUser) continue;
    }

    const conditions = (promo.conditions ?? {}) as Record<string, unknown>;

    if (!checkTriggerConditions(triggerType, conditions, context)) continue;

    const amount = context.amount ?? 0;
    let discountAmount: number;

    if (promo.valueType === 'percent') {
      // Percent only makes sense when there's an amount to discount
      if (amount <= 0) continue;
      discountAmount = Math.round((amount * Number(promo.value)) / 100 * 100) / 100;
    } else {
      // Fixed discount: not capped by amount (bonus credit for topup/signup scenarios)
      discountAmount = Number(promo.value);
    }

    if (discountAmount <= 0) continue;

    results.push({
      promotionId: promo.id,
      label: promo.label,
      discountAmount,
      discountType: promo.valueType as 'percent' | 'fixed',
    });
  }

  return results;
}

function checkTriggerConditions(
  triggerType: string,
  conditions: Record<string, unknown>,
  ctx: PromotionContext,
): boolean {
  switch (triggerType) {
    case 'topup_any':
      // Fires on every top-up - no extra conditions
      return true;

    case 'topup_min_amount':
      // conditions.minAmount: top-up must meet the threshold
      if (conditions.minAmount != null) {
        if (ctx.amount == null || ctx.amount < Number(conditions.minAmount)) return false;
      }
      return true;

    case 'first_topup':
      // topupCount = number of prior completed topups; 0 = this is their first
      if (ctx.topupCount !== undefined && ctx.topupCount > 0) return false;
      return true;

    case 'order_percent':
    case 'order_fixed_discount':
      // Optional minimum order amount gate
      if (conditions.minOrderAmount != null) {
        if (ctx.amount == null || ctx.amount < Number(conditions.minOrderAmount)) return false;
      }
      return true;

    case 'first_booking':
      // bookingCount = completed bookings before this one; 0 = first job ever
      if (ctx.bookingCount !== undefined && ctx.bookingCount > 0) return false;
      return true;

    case 'nth_booking':
      // conditions.nthNumber: bookingCount must equal this value (1-indexed post-completion)
      if (conditions.nthNumber != null) {
        if (ctx.bookingCount == null || ctx.bookingCount !== Number(conditions.nthNumber)) return false;
      }
      return true;

    case 'booking_min_amount':
      // conditions.minAmount: booking total must meet threshold
      if (conditions.minAmount != null) {
        if (ctx.amount == null || ctx.amount < Number(conditions.minAmount)) return false;
      }
      return true;

    case 'category_booking':
      // conditions.categoryId: booking must be for this category
      if (conditions.categoryId != null) {
        if (ctx.categoryId !== conditions.categoryId) return false;
      }
      return true;

    case 'signup_bonus':
      // One-time welcome bonus - maxPerUser: 1 enforces "once only"
      // No additional conditions beyond period and per-user limit
      return true;

    case 'referral_giver':
    case 'referral_receiver':
      // Referral rewards - period + maxPerUser enforced at the outer level
      // conditions.referredUserId can narrow it further if needed
      if (conditions.referredUserId != null) {
        // Caller must pass context.userId matching the referred party - skip for now
        // (full referral flow is post-V1; this is the evaluation hook)
      }
      return true;

    case 'seasonal_percent':
    case 'seasonal_fixed':
      // Date window enforced at DB query (startDate/endDate)
      // Optional minimum order gate
      if (conditions.minOrderAmount != null) {
        if (ctx.amount == null || ctx.amount < Number(conditions.minOrderAmount)) return false;
      }
      return true;

    default:
      return true;
  }
}

/**
 * Record a promotion redemption and increment usedCount atomically.
 * Call after the discount has been applied and the operation committed.
 */
export async function recordPromotionRedemption(
  promotionId: string,
  userId: string,
  amountDiscounted: number,
  bookingId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.promotionRedemption.create({
      data: {
        promotionId,
        userId,
        bookingId: bookingId ?? null,
        amountDiscounted,
      },
    });
    await tx.promotion.update({
      where: { id: promotionId },
      data: { usedCount: { increment: 1 } },
    });
  });

  logger.info('Promotion redemption recorded', { promotionId, userId, amountDiscounted, bookingId });
}

/** Alias matching the plan's B1.2 naming convention. */
export const recordPromotionUsage = recordPromotionRedemption;
