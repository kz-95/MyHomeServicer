import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { redis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

const TTL_SECONDS = 24 * 60 * 60;

/**
 * Idempotency middleware for money operations (security-notes.md §6).
 *
 * Reads the `Idempotency-Key` header. If the key was seen before within 24h
 * the cached response is replayed without re-processing. Storage is Redis
 * (`idempotency:{ownerId}:{key}`); if Redis is unavailable the request is
 * allowed through ("fail open cautiously") and a fallback row is written to
 * Postgres so duplicates can still be reconciled.
 */
export async function idempotency(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.header('idempotency-key');
  if (!key || !req.user) {
    next();
    return;
  }
  req.idempotencyKey = key;
  const ownerId = req.user.id;
  const cacheKey = `idempotency:${ownerId}:${key}`;
  let redisAvailable = true;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const { status, body } = JSON.parse(cached) as { status: number; body: unknown };
      logger.info('Idempotency hit — replaying cached response', { route: req.path });
      res.status(status).json(body);
      return;
    }
  } catch (err) {
    redisAvailable = false;
    logger.error('Idempotency Redis read failed — failing open', {
      error: (err as Error).message,
    });
  }

  // Capture the response so a successful result can be cached for replay.
  const originalJson = res.json.bind(res);
  res.json = (body?: unknown): Response => {
    const status = res.statusCode;
    if (status < 400) {
      const payload = JSON.stringify({ status, body });
      if (redisAvailable) {
        redis.set(cacheKey, payload, 'EX', TTL_SECONDS).catch((err) => {
          logger.error('Idempotency Redis write failed', { error: (err as Error).message });
          writeFallback(ownerId, key, req.path, status, body);
        });
      } else {
        writeFallback(ownerId, key, req.path, status, body);
      }
    }
    return originalJson(body);
  };

  next();
}

function writeFallback(
  ownerId: string,
  key: string,
  route: string,
  status: number,
  body: unknown,
): void {
  prisma.idempotencyFallback
    .upsert({
      where: { ownerId_idempotencyKey: { ownerId, idempotencyKey: key } },
      update: { responseStatus: status, responseBody: body as Prisma.InputJsonValue },
      create: {
        ownerId,
        idempotencyKey: key,
        route,
        responseStatus: status,
        responseBody: body as Prisma.InputJsonValue,
      },
    })
    .catch((err) => logger.error('Idempotency fallback write failed', { error: err.message }));
}
