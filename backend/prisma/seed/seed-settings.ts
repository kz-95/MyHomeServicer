/**
 * Non-destructive settings refresh. Upserts platform settings ONLY - budget
 * brackets + chat config (greeting tiers, prompts, etc.) - without touching
 * servicers, users, quotes, or any other data.
 *
 *   npm run seed:settings
 *
 * Use this when a settings default changed (e.g. new Event Planner budget ranges
 * or new greeting tiers) but you don't want to wipe + reseed the whole database.
 * Safe to run repeatedly.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { platformSettings } from './data/static';
import { BUDGET_RANGE_PRESETS } from './data/budget-ranges';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Refreshing platform settings (non-destructive)…');

  // 1. Rebuild budget_ranges per-category from the slug presets.
  const cats = await prisma.category.findMany({ select: { id: true, slug: true } });
  const idBySlug: Record<string, string> = {};
  for (const c of cats) idBySlug[c.slug] = c.id;

  const byCategoryId: Record<string, { min: number; max: number | null }[]> = {};
  for (const slug of Object.keys(BUDGET_RANGE_PRESETS)) {
    const id = idBySlug[slug];
    if (id) byCategoryId[id] = BUDGET_RANGE_PRESETS[slug];
  }
  await prisma.platformSettings.upsert({
    where: { key: 'budget_ranges' },
    create: { key: 'budget_ranges', value: { ranges: byCategoryId } as Prisma.InputJsonValue },
    update: { value: { ranges: byCategoryId } as Prisma.InputJsonValue },
  });
  console.log(`  ✓ budget_ranges refreshed for ${Object.keys(byCategoryId).length} categories`);

  // 2. Upsert every static platform setting (chat config + greeting tiers, etc.).
  let n = 0;
  for (const s of platformSettings) {
    const value = (s.value ?? Prisma.JsonNull) as Prisma.InputJsonValue;
    await prisma.platformSettings.upsert({
      where: { key: s.key },
      create: { key: s.key, value },
      update: { value },
    });
    n++;
  }
  console.log(`  ✓ ${n} platform settings upserted (incl. greeting tiers)`);
  console.log('Done. Restart the backend if it was running.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
