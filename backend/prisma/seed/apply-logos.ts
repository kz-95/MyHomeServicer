/**
 * One-off: apply local demo profile pictures to already-seeded servicers.
 * Non-destructive — only updates Servicer.logoUrl, matched by email.
 *
 *   npx ts-node --transpile-only prisma/seed/apply-logos.ts
 *
 * Files live in backend/uploads/profiles/demo/M#_ShortName.png and are
 * served at /api/files/local/profiles/demo/<file>.
 */
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { merchants } from './data/accounts';

const prisma = new PrismaClient();

async function main() {
  const demoLogoDir = join(__dirname, '../../uploads/profiles/demo');
  if (!existsSync(demoLogoDir)) throw new Error(`Missing dir: ${demoLogoDir}`);

  const logoByRef: Record<string, string> = {};
  for (const f of readdirSync(demoLogoDir)) {
    const match = f.match(/^(M\d+)_.*\.png$/);
    if (match) logoByRef[match[1]] = `/api/files/local/profiles/demo/${f}`;
  }

  let updated = 0;
  const missing: string[] = [];
  for (const m of merchants) {
    const url = logoByRef[m.ref];
    if (!url) { missing.push(m.ref); continue; }
    const res = await prisma.servicer.updateMany({
      where: { email: m.email },
      data: { logoUrl: url },
    });
    if (res.count > 0) updated += res.count;
    else missing.push(`${m.ref}(no servicer row)`);
  }

  console.log(`updated ${updated}/${merchants.length} servicer logos`);
  if (missing.length) console.log('skipped:', missing.join(', '));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
