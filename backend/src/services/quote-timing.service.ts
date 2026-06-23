import { TimeSlotValue, slotStartHour } from '../lib/time-slots';
import { getSetting } from './settings.service';

/** MYT is UTC+8. */
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Concrete job start instant (real UTC) for a quote's preferred date + slot.
 * Mirrors booking.service.ts slotEndTime: take the MYT calendar day of `date`,
 * place the slot start hour on it in MYT, convert to UTC.
 */
export function jobDatetime(preferredDate: Date, slot: TimeSlotValue): Date {
  const myt = new Date(preferredDate.getTime() + MYT_OFFSET_MS);
  return new Date(
    Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate(), slotStartHour(slot), 0, 0, 0) -
      MYT_OFFSET_MS,
  );
}

/** True when the job instant is already in the past. */
export function isPastJob(job: Date, now: Date = new Date()): boolean {
  return job.getTime() <= now.getTime();
}

/** True when two instants land on the same MYT calendar day. */
export function isSameDayMYT(a: Date, b: Date): boolean {
  const am = new Date(a.getTime() + MYT_OFFSET_MS);
  const bm = new Date(b.getTime() + MYT_OFFSET_MS);
  return (
    am.getUTCFullYear() === bm.getUTCFullYear() &&
    am.getUTCMonth() === bm.getUTCMonth() &&
    am.getUTCDate() === bm.getUTCDate()
  );
}

export interface UrgentFeeConfig { amount: number; platform_share: number; }

/** Reads the admin-configurable urgent fee. Returns null if unset/zero. */
export async function resolveUrgentFee(): Promise<UrgentFeeConfig | null> {
  const cfg = await getSetting<UrgentFeeConfig>('urgent_same_day_fee').catch(() => null);
  if (!cfg || !cfg.amount || cfg.amount <= 0) return null;
  return cfg;
}

/** Split a fee into platform + servicer shares, rounded to cents. */
export function splitUrgentFee(amount: number, platformShare: number): { platform: number; servicer: number } {
  const platform = Math.round(amount * platformShare * 100) / 100;
  return { platform, servicer: Math.round((amount - platform) * 100) / 100 };
}
