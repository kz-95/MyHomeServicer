import { redis } from '../lib/redis';
import { ApiError } from '../lib/errors';
import { getSetting } from '../services/settings.service';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_COOLDOWN_SECONDS = 60;

/**
 * PIN success state TTL: how long a successful verification is remembered.
 * After this window the user must re-verify their PIN.  10 minutes.
 */
const PIN_SUCCESS_TTL_SECONDS = 600;

/**
 * PIN failure tracking window: how long failed attempts are remembered
 * before they age out.  Longer than the cooldown so the audit trail
 * persists beyond the lockout period.  30 minutes.
 */
const PIN_FAILURE_TRACKING_TTL_SECONDS = 1800;

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
    // DB unavailable - use defaults.
  }

  cached = { maxAttempts, cooldownSeconds, lastFetched: now };
  return { maxAttempts, cooldownSeconds };
}

function failureKey(userId: string): string {
  return `pin:cooldown:${userId}`;
}

function successKey(userId: string): string {
  return `pin:success:${userId}`;
}

/**
 * Check whether the user is in PIN cooldown.
 *
 * If the user recently verified their PIN successfully (success key exists),
 * the cooldown check is skipped - a fresh verification window is active.
 */
export async function checkPinCooldown(userId: string): Promise<void> {
  // If a recent successful verification exists, skip the failure-cooldown gate.
  const recentSuccess = await redis.get(successKey(userId));
  if (recentSuccess) {
    return;
  }

  const { maxAttempts } = await getPinConfig();
  const count = await redis.get(failureKey(userId));
  if (count && parseInt(count, 10) >= maxAttempts) {
    const ttl = await redis.ttl(failureKey(userId));
    const remaining = Math.max(1, ttl);
    throw new ApiError(
      'PIN_COOLDOWN',
      `Too many wrong attempts. Please wait ${remaining} seconds.`,
    );
  }
}

/**
 * Record a failed PIN attempt.
 *
 * Two keys are set:
 * 1. `pin:cooldown:{userId}` - failure counter used for lockout gating,
 *    TTL = configured cooldown (default 60 s).
 * 2. `pin:failures:{userId}` - failure counter with a 30-min tracking
 *    TTL so the audit trail persists beyond the lockout window.
 */
export async function recordPinFailure(userId: string): Promise<void> {
  const { cooldownSeconds } = await getPinConfig();
  const multi = redis.multi();
  // Lockout key - short TTL so the user can retry after the cooldown.
  multi.incr(failureKey(userId));
  multi.expire(failureKey(userId), cooldownSeconds);
  // Audit / tracking key - longer TTL for failure memory.
  multi.incr(`pin:failures:${userId}`);
  multi.expire(`pin:failures:${userId}`, PIN_FAILURE_TRACKING_TTL_SECONDS);
  await multi.exec();
}

/**
 * Record a successful PIN verification.
 *
 * Clears the failure counter and sets a TTL-gated success key so the
 * verified state is NOT stored indefinitely.  The success key auto-expires
 * after PIN_SUCCESS_TTL_SECONDS (10 min), after which the user must
 * re-verify.
 */
export async function recordPinSuccess(userId: string): Promise<void> {
  // Clear the failure counter so a successful verification resets the strike count.
  await redis.del(failureKey(userId));
  // Set a success marker with TTL - prevents indefinite storage (the core fix for BE-019).
  await redis.set(successKey(userId), '1', 'EX', PIN_SUCCESS_TTL_SECONDS);
}

/**
 * Explicitly consume (delete) the PIN success state.  Call this after a
 * PIN-gated operation (e.g. apply-profile) completes so that a subsequent
 * verify-pin call requires re-verification.
 */
export async function consumePinSuccess(userId: string): Promise<void> {
  await redis.del(successKey(userId));
}
