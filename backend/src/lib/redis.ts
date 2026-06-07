import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Shared ioredis connection. BullMQ requires `maxRetriesPerRequest: null`
 * on the connection it uses for blocking commands.
 */
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));

/** Separate duplicated connections for the Socket.io pub/sub adapter. */
export function createRedisAdapterPair(): { pubClient: IORedis; subClient: IORedis } {
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  return { pubClient, subClient };
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
