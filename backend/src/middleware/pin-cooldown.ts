import { redis } from '../lib/redis';
import { ApiError } from '../lib/errors';
import { getSetting } from '../services/settings.service';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_COOLDOWN_SECONDS = 60;

interface PinCooldownCache {
  maxAttempts: number;
  cooldownSeconds: number;
  lastFetched: number;
}

let cached: PinCooldownCache | null = null;
const CACHE_MS = 300_000;

async function getPinConfig(): Promise<{ maxAttempts: number; cooldownSeconds: number }> {
  const now = Date.now();
  if (cached && (now - cached.lastFetched) < CACHE_MS) {
    return { maxAttempts: cached.maxAttempts, cooldownSeconds: cached.cooldownSeconds };
  }

  let maxAttempts = DEFAULT_MAX_ATTEMPTS;
  let cooldownSeconds = DEFAULT_COOLDOWN_SECONDS;

  try {
    const [attemptsSetting, cooldownSetting] = await Promise.all([
      getSetting<{ attempts: number } | null>('pin_max_attempts').catch(() => null),
      getSetting<{ seconds: number } | null>('pin_lockout_duration_seconds').catch(() => null),
    ]);
    if (attemptsSetting?.attempts && attemptsSetting.attempts > 0) {
      maxAttempts = attemptsSetting.attempts;
    }
    if (cooldownSetting?.seconds && cooldownSetting.seconds > 0) {
      cooldownSeconds = cooldownSetting.seconds;
    }
  } catch {
    // DB unavailable — use defaults.
  }

  cached = { maxAttempts, cooldownSeconds, lastFetched: now };
  return { maxAttempts, cooldownSeconds };
}

function key(userId: string): string {
  return `pin:cooldown:${userId}`;
}

export async function checkPinCooldown(userId: string): Promise<void> {
  const { maxAttempts } = await getPinConfig();
  const count = await redis.get(key(userId));
  if (count && parseInt(count, 10) >= maxAttempts) {
    const ttl = await redis.ttl(key(userId));
    const remaining = Math.max(1, ttl);
    throw new ApiError(
      'PIN_COOLDOWN',
      `Too many wrong attempts. Please wait ${remaining} seconds.`,
    );
  }
}

export async function recordPinFailure(userId: string): Promise<void> {
  const { cooldownSeconds } = await getPinConfig();
  const k = key(userId);
  const multi = redis.multi();
  multi.incr(k);
  multi.expire(k, cooldownSeconds);
  await multi.exec();
}

export async function recordPinSuccess(userId: string): Promise<void> {
  await redis.del(key(userId));
}
