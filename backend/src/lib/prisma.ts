import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

/**
 * Shared Prisma client. A single instance is reused across the API and the
 * worker process so the connection pool is not exhausted by hot reloads.
 */
export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
