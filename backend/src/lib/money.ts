/**
 * Canonical money-calculation module.
 *
 * ONE computeTotal()  - the single source of truth for the customer-facing total.
 * ONE computePlatformFee() - the single source of truth for the platform fee.
 *
 * Invariant (tested): escrow-charged == invoice-total == fee-recorded.
 *
 * Spec: money-listing-epic-spec.md §3
 * Fixes calculation-audit.md §6.1–6.3 (two fee systems, promos-only-on-invoice, SST-only-on-invoice)
 */

/** A single line item on a proposal, booking, or invoice. */
export interface LineItem {
  label: string;
  amount: number;
  taxable: boolean;
  serviceChargeable: boolean;
}

/** Servicer-level tax configuration (resolved at proposal/booking time). */
export interface ServicerTaxConfig {
  serviceChargeRate: number;      // e.g. 0.05 = 5%, 0 = no service charge
  sstRegistered: boolean;         // whether the servicer is SST-registered
  sstRate: number;                // global SST rate, e.g. 0.06 = 6%
  taxInclusive: boolean;           // inclusive mode: line amounts already include sc + sst
}

/** The full breakdown returned by computeTotal. */
export interface TotalBreakdown {
  subtotal: number;
  afterPromo: number;
  serviceCharge: number;
  sst: number;
  tip: number;
  total: number;
  /** Human-readable breakdown for display purposes. */
  lineItems: LineItem[];
}

/** Round to 2 decimal places (currency, "banker's rounding" = Math.round). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The canonical customer total.
 *
 * ```
 * subtotal        = Σ lineItems.amount
 * afterPromo      = subtotal − promoDiscount
 * scBase          = Σ (li.amount for serviceChargeable lines), promo applied proportionally
 * serviceCharge   = serviceChargeRate > 0 ? round2(scBase × serviceChargeRate) : 0
 * sst             = sstRegistered ? round2(sstBase × sstRate) : 0
 * total           = afterPromo + serviceCharge + sst + tip
 * ```
 *
 * For **taxInclusive** mode: line amounts already contain sc+sst embedded.
 * serviceCharge and sst are EXTRACTED for display but total = afterPromo + tip
 * (sc and sst are already inside the line amounts - nothing added on top).
 *
 * @param lineItems       The itemised charges for the booking.
 * @param promoDiscount   Absolute discount amount (0 if none). Already validated ≤ subtotal.
 * @param config          Servicer's resolved tax configuration.
 * @param tip             Optional tip amount (0 if none).
 */
export function computeTotal(
  lineItems: LineItem[],
  promoDiscount: number,
  config: ServicerTaxConfig,
  tip: number = 0,
): TotalBreakdown {
  const subtotal = round2(lineItems.reduce((s, li) => s + li.amount, 0));
  const afterPromo = round2(Math.max(0, subtotal - promoDiscount));

  // Proportional ratio: how much of the subtotal survived the promo
  const promoRatio = subtotal > 0 ? afterPromo / subtotal : 0;

  // Service charge: computed on post-promo eligible lines
  const scBaseSum = lineItems
    .filter((li) => li.serviceChargeable)
    .reduce((s, li) => s + li.amount, 0);
  const scBase = round2(scBaseSum * promoRatio);
  const serviceCharge =
    config.serviceChargeRate > 0
      ? round2(scBase * config.serviceChargeRate)
      : 0;

  if (config.taxInclusive) {
    // Inclusive mode: line amounts already include sc+sst.
    // Extract for display: total = afterPromo + tip (nothing extra added).
    // The "sst" returned is an informational extraction only.
    let sst = 0;
    if (config.sstRegistered && config.sstRate > 0) {
      // Estimate embedded SST: total prices are deemed to include SST.
      // For display: extract SST from the post-promo + sc amount.
      const inclusiveBase = afterPromo + serviceCharge;
      sst = round2(inclusiveBase - inclusiveBase / (1 + config.sstRate));
    }

    const total = round2(afterPromo + tip);

    return {
      subtotal,
      afterPromo,
      serviceCharge,
      sst,
      tip,
      total,
      lineItems,
    };
  }

  // Exclusive mode: SST is added on top.
  // SST base: sum of taxable line amounts, adjusted for promo.
  const sstBaseSum = lineItems
    .filter((li) => li.taxable)
    .reduce((s, li) => s + li.amount, 0);
  const sstBase = round2(
    sstBaseSum * promoRatio + (config.sstRegistered ? serviceCharge : 0),
  );
  const sst =
    config.sstRegistered && config.sstRate > 0
      ? round2(sstBase * config.sstRate)
      : 0;

  const total = round2(afterPromo + serviceCharge + sst + tip);

  return {
    subtotal,
    afterPromo,
    serviceCharge,
    sst,
    tip,
    total,
    lineItems,
  };
}

/**
 * The unified platform fee.
 *
 * Base = afterPromo only (the discounted service value).
 * Service charge, SST, and tip are excluded from the fee base.
 *
 * This replaces the dual `platform_charge` / `platform_fee_rate` system.
 * ONE setting, ONE function.
 *
 * @deprecated Use computeFees() from fee-engine.service instead.
 * Kept as the internal fallback within computeFees when no FeeRules exist.
 */
export function computePlatformFee(afterPromo: number, feeRate: number): number {
  const raw = afterPromo * feeRate;
  return Math.max(0, round2(raw));
}

/**
 * The canonical credit hold for a pay-now quote.
 *
 * Single source of truth shared by `GET /quotes/estimate` (the `holdAmount`
 * the customer is shown on the Bill step) and `createQuote()` (the amount
 * actually deducted from the customer's wallet). Keeping both on this one
 * function guarantees the displayed hold and the charged hold can never drift
 * (BUG-4).
 *
 * Rule (spec: bill-step-redesign §6 - "budgetMax + tip"):
 *   hold = budget ceiling (budgetMax) + tip.
 * When the budget is open-ended (budgetMax = null) there is no ceiling to
 * hold against, so the upfront hold is 0 - the total is charged later at
 * proposal selection instead.
 *
 * @param budgetMax  The chosen budget ceiling (null = open-ended top bracket).
 * @param tip        Optional tip captured upfront (0 if none).
 */
export function computeHoldAmount(budgetMax: number | null, tip = 0): number {
  if (budgetMax == null || !Number.isFinite(budgetMax)) return 0;
  return round2(budgetMax + (Number.isFinite(tip) ? tip : 0));
}
