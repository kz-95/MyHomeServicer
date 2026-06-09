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

/** Separate duplicated connections for the Socket.io pub/sub adapter.
 *  `redis.duplicate()` returns a fresh client — event listeners do NOT inherit,
 *  so each duplicate needs its own `error` handler or ioredis warns and an
 *  unhandled error event would crash the process. */
export function createRedisAdapterPair(): { pubClient: IORedis; subClient: IORedis } {
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  pubClient.on('error', (err) => logger.error('Redis pub error', { error: err.message }));
  subClient.on('error', (err) => logger.error('Redis sub error', { error: err.message }));
  return { pubClient, subClient };
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
