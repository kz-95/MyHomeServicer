/**
 * Unseed script. Removes all seeded data in foreign-key-safe order and
 * deletes the seeded-ids.json manifest.
 *
 *   npm run unseed
 *
 * Production-safe: refuses to run when NODE_ENV=production.
 */
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { clearAll } from './clear';

const prisma = new PrismaClient();
const MANIFEST = join(__dirname, 'seeded-ids.json');

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Unseed refuses to run with NODE_ENV=production');
  }

  console.log('Removing all data…');
  await clearAll(prisma);
  if (existsSync(MANIFEST)) unlinkSync(MANIFEST);
  console.log('✓ Unseed complete.');
}

main()
  .catch((err) => {
    console.error('Unseed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
