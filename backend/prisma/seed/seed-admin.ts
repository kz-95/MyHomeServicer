/**
 * Minimal admin seed - creates a single non-demo admin account so the admin
 * panel is usable without loading the full demo dataset.
 *
 * Usage:
 *   npx ts-node --transpile-only prisma/seed/seed-admin.ts
 *
 * Idempotent: skips if admin@demo.local already exists.
 */
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Credentials are env-driven so each environment (e.g. the demo Railway instance)
// can set its own admin via Variables / .env. Falls back to the original defaults
// for local dev when the vars are unset.
const ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL ?? 'admin@demo.local';
const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? 'Demo@2026';
const ADMIN_PIN = process.env.ADMIN_SEED_PIN ?? '1234';
const BCRYPT_COST = 12;

/** Deterministic UUID derived from a seed string. */
function fixedUuid(seed: string): string {
  const h = createHash('md5').update(`homeservices:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Admin seed refuses to run with NODE_ENV=production');
  }

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    console.log(`[SKIP] Admin account ${ADMIN_EMAIL} already exists (id=${existing.id})`);
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST);
  const pinHash = await bcrypt.hash(ADMIN_PIN, BCRYPT_COST);

  await prisma.user.create({
    data: {
      id: fixedUuid(ADMIN_EMAIL),
      role: 'admin',
      name: 'Admin',
      email: ADMIN_EMAIL,
      phone: '+60 3-0000 0000',
      passwordHash,
      actionPinHash: pinHash,
      isDemo: false,                     // ← real account, not a demo account
      creditBalance: 0,
      failedLoginCount: 0,
    },
  });

  console.log(`  ✓ Admin account created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} (non-demo, PIN: ${ADMIN_PIN})`);
}

main()
  .catch((err) => {
    console.error('Admin seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
