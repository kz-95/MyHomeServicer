import { Prisma } from '@prisma/client';

/**
 * Pass-through fee split calculator.
 *
 * Per spec §4 / §4b: both travel fee and supplies fee follow the same rule,
 * but are intentionally coded separately (not a generalized type).
 *
 * Split rule:
 *   - Baseline portion (up to effectiveBaseline)  → 0% platform, 100% servicer
 *   - Extra above baseline                         → platformFeeRate applied; servicer keeps the rest
 *
 * All money is Decimal(10,2). Results are rounded to 2 decimal places.
 */

export interface FeeSplitResult {
  /** Total fee the customer pays (= servicerFee). */
  totalFee: Prisma.Decimal;
  /** Amount servicer earns (baseline + extra-after-platform-cut). */
  servicerAmount: Prisma.Decimal;
  /** Platform commission on the extra-above-baseline portion only. */
  platformAmount: Prisma.Decimal;
  /** The effective baseline used for the split. */
  effectiveBaseline: Prisma.Decimal;
}

/**
 * Calculate travel fee platform/servicer split.
 *
 * @param servicerTravelFee  - The servicer's stated travel fee (>= effectiveBaseline).
 * @param categoryBaseline   - Per-category travel baseline (null = 0).
 * @param overallBaseline    - Platform-wide overall baseline (default 20.00).
 * @param platformFeeRate    - Platform fee rate (0–1, e.g. 0.20 for 20%).
 */
export function calcTravelFeeSplit(
  servicerTravelFee: Prisma.Decimal,
  categoryBaseline: Prisma.Decimal | null,
  overallBaseline: Prisma.Decimal,
  platformFeeRate: Prisma.Decimal,
): FeeSplitResult {
  return calcPassThroughFeeSplit(servicerTravelFee, categoryBaseline, overallBaseline, platformFeeRate);
}

/**
 * Calculate cleaning supplies fee platform/servicer split.
 *
 * @param servicerSuppliesFee - The servicer's stated supplies fee (>= effectiveBaseline).
 * @param categoryBaseline    - Per-category supplies baseline (null = 0).
 * @param overallBaseline     - Platform-wide overall supplies baseline.
 * @param platformFeeRate     - Platform fee rate (0–1).
 */
export function calcSuppliesFeeSplit(
  servicerSuppliesFee: Prisma.Decimal,
  categoryBaseline: Prisma.Decimal | null,
  overallBaseline: Prisma.Decimal,
  platformFeeRate: Prisma.Decimal,
): FeeSplitResult {
  return calcPassThroughFeeSplit(servicerSuppliesFee, categoryBaseline, overallBaseline, platformFeeRate);
}

/**
 * Core pass-through fee split (shared logic, not exported as a public API —
 * callers use the named functions above so the two fee types stay distinct).
 *
 * effectiveBaseline = max(categoryBaseline ?? 0, overallBaseline)
 * baselinePortion   = min(servicerFee, effectiveBaseline)
 * extraPortion      = max(servicerFee - effectiveBaseline, 0)
 * platformAmount    = extraPortion * platformFeeRate   (rounded to 2dp)
 * servicerAmount    = servicerFee - platformAmount     (rounded to 2dp)
 */
function calcPassThroughFeeSplit(
  servicerFee: Prisma.Decimal,
  categoryBaseline: Prisma.Decimal | null,
  overallBaseline: Prisma.Decimal,
  platformFeeRate: Prisma.Decimal,
): FeeSplitResult {
  const ZERO = new Prisma.Decimal(0);
  const catBase = categoryBaseline ?? ZERO;

  // effectiveBaseline = max(category, overall) — overall acts as a floor
  const effectiveBaseline = catBase.greaterThan(overallBaseline) ? catBase : overallBaseline;

  // extra above baseline (servicer set more than the minimum)
  const extraPortion = servicerFee.minus(effectiveBaseline);
  const extraAboveBaseline = extraPortion.greaterThan(ZERO) ? extraPortion : ZERO;

  // platform takes its % only on the extra portion
  const platformAmount = extraAboveBaseline.mul(platformFeeRate).toDecimalPlaces(2);

  // servicer keeps: full fee minus what platform takes
  const servicerAmount = servicerFee.minus(platformAmount).toDecimalPlaces(2);

  return {
    totalFee: servicerFee,
    servicerAmount,
    platformAmount,
    effectiveBaseline,
  };
}
