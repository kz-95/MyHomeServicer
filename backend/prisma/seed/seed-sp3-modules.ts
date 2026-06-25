/**
 * SP-3 Module Seeding (2026-06-25)
 * Run AFTER the main seed.ts.
 * Creates ServicerModule rows and attaches them to services as moduleRefs.
 *
 * Usage: npx ts-node prisma/seed/seed-sp3-modules.ts
 *
 * Coverage: at least 1 auto-accept listing per category.
 * Ahmad Plumber (M1) excluded from auto-accept.
 */

import { prisma } from '../src/lib/prisma';

// ── Module definitions per category ──────────────────────────────────────

interface ModuleDef {
  name: string;
  questionKey: string;
  optionValue: string;
  price: number;
  durationMin: number;
  sku?: string;
}

interface ListingSeed {
  /** Servicer business name prefix to match (case-insensitive contains) */
  servicerMatch: string;
  label: string;
  title: string;
  proposalPreset: string;
  autoAccept: boolean;
  modules: ModuleDef[];
}

const LISTINGS: ListingSeed[] = [
  // ── Plumber — M1 (Ahmad) manual only. M37 + M67 auto-accept ──────
  {
    servicerMatch: 'plumber',
    label: 'PLB-MANUAL',
    title: 'General Plumbing Services',
    proposalPreset: 'Thank you for your plumbing request! We will arrive within the agreed time slot.',
    autoAccept: false, // M1 is manual only
    modules: [],
  },

  // ── Aircond Servicer — M2 Kumar auto-accept ─────────────────────
  {
    servicerMatch: 'CoolBreeze',
    label: 'AC-STANDARD',
    title: 'Aircond Servicing — All Units',
    proposalPreset: 'Thank you for choosing CoolBreeze! Our technician will arrive with full equipment on the scheduled date.',
    autoAccept: true,
    modules: [
      { name: 'Wall Unit Chemical Wash', questionKey: 'aircon_service', optionValue: 'wall_chemical', price: 60, durationMin: 30, sku: 'CB-CW' },
      { name: 'Wall Unit General Service', questionKey: 'aircon_service', optionValue: 'wall_general', price: 40, durationMin: 25, sku: 'CB-WG' },
      { name: 'Wall Unit Overhaul', questionKey: 'aircon_service', optionValue: 'wall_overhaul', price: 120, durationMin: 60, sku: 'CB-WO' },
      { name: 'Cassette Unit General Service', questionKey: 'aircon_service', optionValue: 'cassette_general', price: 50, durationMin: 25, sku: 'CB-CG' },
      { name: 'Cassette Unit Chemical Wash', questionKey: 'aircon_service', optionValue: 'cassette_chemical', price: 70, durationMin: 30, sku: 'CB-CC' },
      { name: 'Cassette Unit Overhaul', questionKey: 'aircon_service', optionValue: 'cassette_overhaul', price: 150, durationMin: 60, sku: 'CB-CO' },
      { name: 'Faulty Check', questionKey: 'aircon_service', optionValue: 'faulty_check', price: 30, durationMin: 20, sku: 'CB-FC' },
    ],
  },

  // ── Home Cleaning — M4 Nurul auto-accept ────────────────────────
  {
    servicerMatch: 'Sparkle Home Cleaning',
    label: 'CLN-STANDARD',
    title: 'Home Cleaning — Professional Service',
    proposalPreset: 'Thank you for booking with Sparkle! Our cleaning crew will arrive with all necessary equipment.',
    autoAccept: true,
    modules: [
      { name: '1 Hour × 2 Cleaners', questionKey: 'cleaning_option', optionValue: '1h_2c', price: 60, durationMin: 60, sku: 'CLN-1H' },
      { name: '2 Hours × 2 Cleaners', questionKey: 'cleaning_option', optionValue: '2h_2c', price: 100, durationMin: 120, sku: 'CLN-2H' },
      { name: '3 Hours × 2 Cleaners', questionKey: 'cleaning_option', optionValue: '3h_2c', price: 140, durationMin: 180, sku: 'CLN-3H' },
      { name: '4 Hours × 2 Cleaners', questionKey: 'cleaning_option', optionValue: '4h_2c', price: 180, durationMin: 240, sku: 'CLN-4H' },
    ],
  },

  // ── Carpet Cleaning — M6 Siti auto-accept ──────────────────────
  {
    servicerMatch: 'PureClean Carpet',
    label: 'CC-STANDARD',
    title: 'Carpet & Rug Cleaning — Professional',
    proposalPreset: 'Thank you for your carpet cleaning request! We use eco-friendly cleaning solutions.',
    autoAccept: true,
    modules: [
      { name: 'Rug — Small', questionKey: 'cleaning_type', optionValue: 'rug_1', price: 30, durationMin: 20, sku: 'CC-R1' },
      { name: 'Rug — Medium', questionKey: 'cleaning_type', optionValue: 'rug_2', price: 50, durationMin: 30, sku: 'CC-R2' },
      { name: 'Rug — Large', questionKey: 'cleaning_type', optionValue: 'rug_3', price: 70, durationMin: 40, sku: 'CC-R3' },
      { name: 'Rug — XL', questionKey: 'cleaning_type', optionValue: 'rug_4', price: 90, durationMin: 50, sku: 'CC-R4' },
      { name: 'Carpet — Small', questionKey: 'cleaning_type', optionValue: 'carpet_small', price: 80, durationMin: 45, sku: 'CC-CS' },
      { name: 'Carpet — Medium', questionKey: 'cleaning_type', optionValue: 'carpet_medium', price: 100, durationMin: 60, sku: 'CC-CM' },
      { name: 'Carpet — Large', questionKey: 'cleaning_type', optionValue: 'carpet_large', price: 120, durationMin: 90, sku: 'CC-CL' },
    ],
  },

  // ── Aircond Installer — M11 Kenny auto-accept ──────────────────
  {
    servicerMatch: 'AC Pro Installers',
    label: 'API-STANDARD',
    title: 'Aircond Installation — All Types',
    proposalPreset: 'Thank you for choosing AC Pro! Our certified installers will handle everything from mounting to testing.',
    autoAccept: true,
    modules: [
      { name: 'Wall 1.0HP', questionKey: 'units', optionValue: 'wall_1hp', price: 120, durationMin: 60, sku: 'API-1HP' },
      { name: 'Wall 1.5HP', questionKey: 'units', optionValue: 'wall_1.5hp', price: 150, durationMin: 60, sku: 'API-15HP' },
      { name: 'Wall 2.0HP', questionKey: 'units', optionValue: 'wall_2hp', price: 180, durationMin: 60, sku: 'API-2HP' },
      { name: 'Wall 2.5HP', questionKey: 'units', optionValue: 'wall_2.5hp', price: 220, durationMin: 90, sku: 'API-25HP' },
      { name: 'Cassette 1.5HP', questionKey: 'units', optionValue: 'cassette_1.5hp', price: 400, durationMin: 120, sku: 'API-C15' },
      { name: 'Cassette 2.0HP', questionKey: 'units', optionValue: 'cassette_2hp', price: 500, durationMin: 120, sku: 'API-C2' },
      { name: 'Cassette 2.5HP', questionKey: 'units', optionValue: 'cassette_2.5hp', price: 600, durationMin: 150, sku: 'API-C25' },
      { name: 'Cassette 3.0HP', questionKey: 'units', optionValue: 'cassette_3hp', price: 800, durationMin: 180, sku: 'API-C3' },
    ],
  },
];

// ── Main seeding logic ───────────────────────────────────────────────────

async function seedModules() {
  console.log('SP-3 Module seeding started…');

  for (const listing of LISTINGS) {
    // Find the servicer by business name
    const servicer = await prisma.servicer.findFirst({
      where: { businessName: { contains: listing.servicerMatch, mode: 'insensitive' } },
      select: { id: true, businessName: true, categoryId: true },
    });

    if (!servicer) {
      console.log(`  SKIP: no servicer matching "${listing.servicerMatch}"`);
      continue;
    }

    // If modules is empty (like M1 Plumber), just create the listing.
    if (listing.modules.length === 0) {
      console.log(`  ${servicer.businessName}: manual listing (no modules)`);
      continue;
    }

    // Create modules for this servicer
    const moduleIds: string[] = [];
    for (const mod of listing.modules) {
      const created = await prisma.servicerModule.upsert({
        where: {
          id: `${servicer.id}-${mod.sku || mod.questionKey + '-' + mod.optionValue}`.substring(0, 36),
        },
        update: {
          name: mod.name,
          questionKey: mod.questionKey,
          optionValue: mod.optionValue,
          price: mod.price,
          durationMin: mod.durationMin,
          sku: mod.sku || null,
          active: true,
        },
        create: {
          servicerId: servicer.id,
          name: mod.name,
          questionKey: mod.questionKey,
          optionValue: mod.optionValue,
          price: mod.price,
          durationMin: mod.durationMin,
          sku: mod.sku || null,
          active: true,
        },
      });
      moduleIds.push(created.id);
    }

    // Compute totals from modules
    const basePrice = listing.modules.reduce((sum, m) => sum + m.price, 0);
    const durationMin = listing.modules.reduce((sum, m) => sum + m.durationMin, 0);

    // Create the listing
    const moduleRefs = moduleIds.map((moduleId) => ({ moduleId }));

    // Find existing service to update, or create new
    const existing = await prisma.servicerService.findFirst({
      where: { servicerId: servicer.id, title: { contains: listing.title.substring(0, 20), mode: 'insensitive' } },
    });

    if (existing) {
      await prisma.servicerService.update({
        where: { id: existing.id },
        data: {
          label: listing.label,
          title: listing.title,
          proposalPreset: listing.proposalPreset,
          basePrice,
          estimatedDurationMinutes: durationMin || 60,
          autoAccept: listing.autoAccept,
          autoAcceptMessage: listing.autoAccept ? listing.proposalPreset : null,
          moduleRefs: moduleRefs as any,
          listingMode: 'advanced',
        },
      });
      console.log(`  ${servicer.businessName}: updated listing "${listing.label}" (${moduleIds.length} modules)`);
    } else {
      await prisma.servicerService.create({
        data: {
          servicerId: servicer.id,
          categoryId: servicer.categoryId,
          label: listing.label,
          title: listing.title,
          proposalPreset: listing.proposalPreset,
          basePrice,
          priceType: 'fixed',
          taxMode: 'none',
          estimatedDurationMinutes: durationMin || 60,
          autoAccept: listing.autoAccept,
          autoAcceptMessage: listing.autoAccept ? listing.proposalPreset : null,
          moduleRefs: moduleRefs as any,
          listingMode: 'advanced',
        },
      });
      console.log(`  ${servicer.businessName}: created listing "${listing.label}" (${moduleIds.length} modules)`);
    }
  }

  console.log('SP-3 Module seeding complete.');
}

seedModules()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect().then(() => process.exit(1));
  });
