/**
 * One-time migration: fixes invalid category icon names in the database.
 * Run via: npx ts-node backend/prisma/seed/fix-icons.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ICON_FIXES: Record<string, string> = {
  'washing-machine': 'wrench',
};

async function main() {
  const categories = await prisma.category.findMany({
    where: { icon: { in: Object.keys(ICON_FIXES) } },
    select: { id: true, slug: true, icon: true },
  });

  if (categories.length === 0) {
    console.log('No invalid icons found.');
    return;
  }

  for (const cat of categories) {
    const newIcon = ICON_FIXES[cat.icon!];
    await prisma.category.update({
      where: { id: cat.id },
      data: { icon: newIcon },
    });
    console.log(`  ✓ ${cat.slug}: "${cat.icon}" → "${newIcon}"`);
  }

  console.log(`\nFixed ${categories.length} category icon(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
