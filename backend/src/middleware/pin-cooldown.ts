import { redis } from '../lib/redis';
import { ApiError } from '../lib/errors';

const MAX_ATTEMPTS = 3;
const COOLDOWN_SECONDS = 60;

function key(userId: string): string {
  return `pin:cooldown:${userId}`;
}

export async function checkPinCooldown(userId: string): Promise<void> {
  const count = await redis.get(key(userId));
  if (count && parseInt(count, 10) >= MAX_ATTEMPTS) {
    const ttl = await redis.ttl(key(userId));
    const remaining = Math.max(1, ttl);
    throw new ApiError(
      'PIN_COOLDOWN',
      `Too many wrong attempts. Please wait ${remaining} seconds.`,
    );
  }
}

export async function recordPinFailure(userId: string): Promise<void> {
  const k = key(userId);
  const multi = redis.multi();
  multi.incr(k);
  multi.expire(k, COOLDOWN_SECONDS);
  await multi.exec();
}

export async function recordPinSuccess(userId: string): Promise<void> {
  await redis.del(key(userId));
}
