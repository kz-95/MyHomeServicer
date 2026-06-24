import { prisma } from '../lib/prisma';

/**
 * Platform settings accessor with sensible V1 defaults. Settings live in the
 * PLATFORM_SETTINGS key-value table; this service reads them with a fallback
 * so the platform works before an admin has configured anything.
 */
const DEFAULTS: Record<string, unknown> = {
  // 5% platform fee per booking until 50 servicers (schema-notes.md).
  platform_fee_rate: { current_rate: 0.05, scheduled_changes: [] },
  // Malaysian SST.
  sst_rate: { rate: 0.06 },
  no_response_discount: { discount_type: 'fixed', value: 15, expires_in_days: 14 },
  noshow_grace_minutes: { minutes: 30 },
  servicer_credit_withdrawal_minimum: { amount: 50 },
  servicer_deposit_minimum: { amount: 100 },
  // Budget brackets the customer picks from — admin-configurable.
  // Dispatch rotation prompt timer (seconds) per servicer in rotation.
  dispatch_prompt_timeout_seconds: { seconds: 10 },
  budget_ranges: {
    ranges: [
      { min: 50, max: 150 },
      { min: 150, max: 250 },
      { min: 250, max: 350 },
      { min: 350, max: null },
    ],
  },
  // PIN security settings — used by pin-cooldown middleware and admin settings.
  pin_max_attempts: { attempts: 3 },
  pin_lockout_duration_seconds: { seconds: 60 },
  pin_min_length: { length: 6 },
  // Password policy settings.
  password_min_length: { length: 8 },
};

export async function getSetting<T = unknown>(key: string): Promise<T> {
  const row = await prisma.platformSettings.findUnique({ where: { key } });
  return (row?.value ?? DEFAULTS[key]) as T;
}

/** Resolve the platform fee rate effective at a given time (scheduled changes). */
export async function getPlatformFeeRate(at: Date = new Date()): Promise<number> {
  const setting = await getSetting<{
    current_rate: number;
    scheduled_changes: { starts_at: string; ends_at: string; new_rate: number }[];
  }>('platform_fee_rate');
  for (const change of setting.scheduled_changes ?? []) {
    if (at >= new Date(change.starts_at) && at <= new Date(change.ends_at)) {
      return change.new_rate;
    }
  }
  return setting.current_rate;
}

export async function getSstRate(): Promise<number> {
  const s = await getSetting<{ rate: number }>('sst_rate');
  return s.rate;
}

export const settingsDefaults = DEFAULTS;

type RangeRow = { min: number; max: number | null };

/**
 * Resolve budget ranges for a given category, handling both the legacy
 * flat-array format and the per-category object format.
 */
export function resolveBudgetRanges(
  setting: { ranges: RangeRow[] | Record<string, RangeRow[]> } | undefined,
  categoryId: string,
): RangeRow[] {
  if (!setting) {
    return (DEFAULTS.budget_ranges as { ranges: RangeRow[] }).ranges;
  }
  const { ranges } = setting;
  if (Array.isArray(ranges)) {
    return ranges;
  }
  // Per-category format — use specific ranges or fall back to first available
  return ranges[categoryId] ?? Object.values(ranges)[0] ?? [];
}
