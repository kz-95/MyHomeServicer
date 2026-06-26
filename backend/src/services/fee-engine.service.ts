import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { getPlatformFeeRate } from './settings.service';
import { computePlatformFee } from '../lib/money';

/**
 * Fee Engine - replaces the hardcoded `platform_fee_rate` single-setting model
 * with a FeeRule table that supports flat, percentage, and tiered fee rules,
 * optionally scoped by appliesTo (booking|withdrawal|topup) and categoryId.
 *
 * When no FeeRule matches, the engine falls back to the legacy
 * `platform_fee_rate` platform setting for backward compatibility.
 */

// ── Query ──────────────────────────────────────────────────────────────────────

/** List all FeeRules for admin CRUD (active + inactive, sorted by priority). */
export async function listFeeRules() {
  return prisma.feeRule.findMany({
    orderBy: [
      { appliesTo: 'asc' },
      { priority: 'asc' },
    ],
    include: {
      category: { select: { id: true, name: true, icon: true } },
    },
  });
}

/**
 * Find active FeeRules applicable to a given context.
 * Returns rules sorted by priority (lowest first, stacked).
 *
 * @param appliesTo - 'booking' | 'withdrawal' | 'topup'
 * @param categoryId - optional category scope (null = global rules only)
 */
export async function getApplicableFeeRules(
  appliesTo: string,
  categoryId?: string,
) {
  const now = new Date();
  return prisma.feeRule.findMany({
    where: {
      active: true,
      appliesTo,
      // categoryId null = global rule; also match specific category
      OR: [
        { categoryId: null },
        ...(categoryId ? [{ categoryId }] : []),
      ],
      // T11: honor activeFrom/activeTo date-range so future-dated rules
      // don't apply immediately.
      AND: [
        { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
        { OR: [{ activeTo: null }, { activeTo: { gte: now } }] },
      ],
    },
    orderBy: { priority: 'asc' },
  });
}

// ── Compute ────────────────────────────────────────────────────────────────────

/**
 * Compute the total platform fee for a transaction using FeeRules.
 *
 * Falls back to the legacy `platform_fee_rate` setting if no FeeRules exist.
 *
 * @param baseAmount - the base for fee calculation (afterPromo for bookings)
 * @param appliesTo - 'booking' | 'withdrawal' | 'topup'
 * @param categoryId - optional category scope
 * @returns total fee in MYR (rounded to 2dp)
 */
export async function computeFees(
  baseAmount: number,
  appliesTo: string,
  categoryId?: string,
): Promise<number> {
  // T12: guard against NaN/Infinity inputs
  if (!Number.isFinite(baseAmount) || baseAmount < 0) return 0;

  let rules: Awaited<ReturnType<typeof getApplicableFeeRules>>;
  try {
    rules = await getApplicableFeeRules(appliesTo, categoryId);
  } catch (err) {
    // T12: on DB error, fall back to legacy platform_fee_rate
    logger.error('computeFees: FeeRule query failed, falling back to legacy rate', { error: String(err) });
    const rate = await getPlatformFeeRate();
    return computePlatformFee(baseAmount, rate);
  }

  // No FeeRules configured - fall back to legacy platform_fee_rate
  if (rules.length === 0) {
    const rate = await getPlatformFeeRate();
    return computePlatformFee(baseAmount, rate);
  }

  let totalFee = 0;

  for (const rule of rules) {
    const ruleRate = Number(rule.rate);
    let fee: number;

    switch (rule.type) {
      case 'flat':
        fee = ruleRate;
        break;
      case 'percentage':
        fee = baseAmount * ruleRate;
        break;
      case 'tiered':
        // Tiered: rate is applied as a percentage on the full baseAmount.
        // Future: can be extended with a tiers JSON field for bracket-based logic.
        fee = baseAmount * ruleRate;
        break;
      default:
        logger.warn('Unknown FeeRule type, skipping', { ruleId: rule.id, type: rule.type });
        continue;
    }

    // Apply min/max/cap per rule.
    // Uses floating-point `>` comparisons which are safe because the final
    // Math.round(totalFee * 100) / 100 eliminates any sub-cent IEEE 754
    // artifacts (e.g. 5.00000000000001 rounds back to 5.00).
    if (rule.minAmount !== null && fee < Number(rule.minAmount)) {
      fee = Number(rule.minAmount);
    }
    if (rule.maxAmount !== null && fee > Number(rule.maxAmount)) {
      fee = Number(rule.maxAmount);
    }
    if (rule.capAmount !== null && fee > Number(rule.capAmount)) {
      fee = Number(rule.capAmount);
    }

    totalFee += fee;
  }

  // Round and ensure non-negative
  return Math.max(0, Math.round(totalFee * 100) / 100);
}

// ── CRUD ───────────────────────────────────────────────────────────────────────

export interface CreateFeeRuleInput {
  name: string;
  description?: string;
  type: 'flat' | 'percentage' | 'tiered';
  rate: number;
  minAmount?: number;
  maxAmount?: number;
  capAmount?: number;
  appliesTo: 'booking' | 'withdrawal' | 'topup';
  categoryId?: string;
  priority?: number;
  active?: boolean;
}

export async function createFeeRule(input: CreateFeeRuleInput) {
  return prisma.feeRule.create({
    data: {
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      rate: input.rate,
      minAmount: input.minAmount ?? null,
      maxAmount: input.maxAmount ?? null,
      capAmount: input.capAmount ?? null,
      appliesTo: input.appliesTo,
      categoryId: input.categoryId ?? null,
      priority: input.priority ?? 0,
      active: input.active ?? true,
    },
  });
}

export interface UpdateFeeRuleInput {
  name?: string;
  description?: string;
  type?: 'flat' | 'percentage' | 'tiered';
  rate?: number;
  minAmount?: number | null;
  maxAmount?: number | null;
  capAmount?: number | null;
  appliesTo?: 'booking' | 'withdrawal' | 'topup';
  categoryId?: string | null;
  priority?: number;
  active?: boolean;
}

export async function updateFeeRule(id: string, input: UpdateFeeRuleInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.type !== undefined) data.type = input.type;
  if (input.rate !== undefined) data.rate = input.rate;
  if (input.minAmount !== undefined) data.minAmount = input.minAmount;
  if (input.maxAmount !== undefined) data.maxAmount = input.maxAmount;
  if (input.capAmount !== undefined) data.capAmount = input.capAmount;
  if (input.appliesTo !== undefined) data.appliesTo = input.appliesTo;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.active !== undefined) data.active = input.active;

  return prisma.feeRule.update({ where: { id }, data });
}

export async function deleteFeeRule(id: string) {
  return prisma.feeRule.delete({ where: { id } });
}
