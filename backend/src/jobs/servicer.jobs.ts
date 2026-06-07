import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { JOB_NAMES } from '../lib/queue';
import { registerJob } from './index';

interface OperatingHourEntry {
  day: number;   // 0=Sun … 6=Sat
  open: string;  // "HH:MM" in 24h
  close: string; // "HH:MM" in 24h
}

/**
 * Parse a "HH:MM" string into total minutes since midnight.
 */
function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Check whether the current time falls within any of the servicer's
 * operating hour entries for today. Empty operating hours = always-on.
 */
function isWithinOperatingHours(operatingHours: unknown): boolean {
  if (!Array.isArray(operatingHours) || operatingHours.length === 0) return true;

  const now = new Date();
  const today = now.getDay(); // 0=Sun … 6=Sat
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todayHours = operatingHours.filter(
    (entry: unknown) =>
      typeof entry === 'object' &&
      entry !== null &&
      (entry as OperatingHourEntry).day === today,
  ) as OperatingHourEntry[];

  if (todayHours.length === 0) return false;

  return todayHours.some((h) => {
    const open = parseTime(h.open);
    const close = parseTime(h.close);
    return nowMinutes >= open && nowMinutes < close;
  });
}

/**
 * servicer.online_sync — runs every 5 minutes. For every servicer that has
 * operatingHours set (non-empty array), checks if the current time falls
 * within today's operating hours and sets isOnline accordingly.
 *
 * Servicers with empty operatingHours are left untouched (always-on mode).
 * Manual isOnline toggles are overwritten on the next cron cycle — the
 * servicer can manually go offline but will be brought back online at the
 * start of their next operating window.
 */
async function handleServicerOnlineSync(): Promise<void> {
  const servicers = await prisma.servicer.findMany({
    where: { deletedAt: null },
    select: { id: true, isOnline: true, operatingHours: true },
  });

  let turnedOn = 0;
  let turnedOff = 0;

  for (const s of servicers) {
    const hours = s.operatingHours as unknown;
    const within = isWithinOperatingHours(hours);
    const shouldBeOnline = within;

    if (s.isOnline !== shouldBeOnline) {
      await prisma.servicer.update({
        where: { id: s.id },
        data: { isOnline: shouldBeOnline },
      });
      if (shouldBeOnline) turnedOn++;
      else turnedOff++;
    }
  }

  if (turnedOn > 0 || turnedOff > 0) {
    logger.info('servicer.online_sync — statuses updated', { turnedOn, turnedOff });
  }
}

/** Registers the servicer online sync job. */
export function register(): void {
  registerJob(JOB_NAMES.SERVICER_ONLINE_SYNC, handleServicerOnlineSync);
}
