/**
 * Demo seed script. Populates a development database with 36 servicers (1 per
 * service category, 6 for 3D Modeling), 3 customers, 1 admin, in-flight
 * quotes/bookings, penalty scenarios, promotions and AI chat history.
 *
 *   npm run seed
 *   npm run seed -- --deadline-offset=1440  (custom quote deadline, minutes)
 *
 * Production-safe: refuses to run when NODE_ENV=production, and aborts if
 * data has already been seeded (seeded-ids.json present).
 */
import { writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { clearAll } from './clear';
import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma, Weekday, TimeSlot } from '@prisma/client';
import { categories, children, platformSettings, penaltyRules, featureFlags, chatKnowledge } from './data/static';
import { localizeQuestions } from './data/question-i18n';
import { servicers, customers, DEMO_PASSWORD, ADMIN_PIN } from './data/accounts';
import { BUDGET_RANGE_PRESETS } from './data/budget-ranges';

const prisma = new PrismaClient();
const MANIFEST = join(__dirname, 'seeded-ids.json');

/**
 * Deterministic UUID derived from a seed string. Demo accounts use these so
 * `reseed` recreates them with identical IDs - an in-flight admin/customer
 * session (whose JWT carries the account ID) keeps working after a reseed.
 */
function fixedUuid(seed: string): string {
  const h = createHash('md5').update(`homeservices:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function deadlineOffsetMinutes(): number {
  const arg = process.argv.find((a) => a.startsWith('--deadline-offset='));
  return arg ? parseInt(arg.split('=')[1], 10) || 1440 : 1440;
}

const minutes = (n: number) => new Date(Date.now() + n * 60_000);
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed refuses to run with NODE_ENV=production');
  }

  // Always start from a clean slate - this makes the seed fully idempotent,
  // so a reseed works even if a previous run failed part-way through.
  console.log('Clearing existing data…');
  await clearAll(prisma);

  console.log('Seeding demo data…');
  const offset = deadlineOffsetMinutes();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const pinHash = await bcrypt.hash(ADMIN_PIN, 12);

  // ── Categories ──
  // categoryBySlug covers both parents and children - servicers/quotes key off child slugs.
  const categoryBySlug: Record<string, string> = {};

  // Step 1: create the 7 parent categories (grouping only - no price/questions).
  for (const p of categories) {
    const cat = await prisma.category.create({
      data: {
        name: p.name,
        slug: p.slug,
        icon: p.icon,
        published: true,
      },
    });
    categoryBySlug[p.slug] = cat.id;
  }

  // Step 2: create the 28 child categories (actual services - carry price/questions).
  for (const c of children) {
    const cat = await prisma.category.create({
      data: {
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        parentCategoryId: categoryBySlug[c.parentSlug],
        defaultPriceSuggestion: c.price,
        defaultEstimatedDurationMinutes: c.duration,
        published: true,
        photosEnabled: c.photosEnabled ?? false,
        requiresInspection: c.requiresInspection ?? false,
        ...(c.description ? { description: c.description } : {}),
        ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
        ...(c.questions
          ? {
              // Attach ms/zh/ta label translations so quote-flow cards render in the
              // customer's language instead of falling back to English.
              questionSchema: localizeQuestions(
                c.questions,
              ) as unknown as Prisma.InputJsonValue,
            }
          : {}),
      },
    });
    categoryBySlug[c.slug] = cat.id;
  }
  console.log(`  ✓ ${categories.length} parent categories + ${children.length} child categories`);

  // ── Per-category budget range presets (shared with seed-settings.ts) ──
  const budgetRangeByCategoryId: Record<string, { min: number; max: number | null }[]> = {};
  for (const slug of Object.keys(BUDGET_RANGE_PRESETS)) {
    const catId = categoryBySlug[slug];
    if (catId) budgetRangeByCategoryId[catId] = BUDGET_RANGE_PRESETS[slug];
  }
  await prisma.platformSettings.create({
    data: {
      key: 'budget_ranges',
      value: { ranges: budgetRangeByCategoryId },
    },
  });

  // ── Rest of platform settings, penalty rules, feature flags ──
  for (const s of platformSettings) {
    await prisma.platformSettings.create({ data: { key: s.key, value: s.value as object } });
  }
  const penaltyRuleByType: Record<string, string> = {};
  for (const r of penaltyRules) {
    const rule = await prisma.penaltyRule.create({
      data: { type: r.type, calcMode: 'fixed', amount: r.amount },
    });
    penaltyRuleByType[r.type] = rule.id;
  }
  for (const f of featureFlags) {
    await prisma.featureFlag.create({
      data: { key: f.key, name: f.name, isEnabled: f.enabled },
    });
  }
  for (const k of chatKnowledge) {
    await prisma.faq.create({
      data: {
        question: k.question,
        answer: k.answer,
        category: k.category,
        tier: k.tier ?? 'guest',
        sortOrder: k.sortOrder,
      },
    });
  }
  await prisma.platformMarketingBudget.create({
    data: {
      totalBudget: 5000,
      spentAmount: 320,
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-12-31T23:59:59Z'),
    },
  });
  // ── Loyalty Tiers ──
  const tierData = [
    { name: 'Bronze', minPoints: 0, bonusPercent: 0, badgeColor: '#cd7f32', sortOrder: 1 },
    { name: 'Silver', minPoints: 500, bonusPercent: 10, badgeColor: '#c0c0c0', sortOrder: 2 },
    { name: 'Gold', minPoints: 2000, bonusPercent: 25, badgeColor: '#ffd700', sortOrder: 3 },
    { name: 'Platinum', minPoints: 5000, bonusPercent: 50, badgeColor: '#e5e4e2', sortOrder: 4 },
  ];
  for (const t of tierData) {
    await prisma.loyaltyTier.create({ data: t });
  }
  console.log('  ✓ 4 loyalty tiers (Bronze → Platinum)');

  // ── Reward Catalog ──
  const rewardSeedData = [
    { name: 'RM 5 top-up discount', description: 'Get RM 5 off your top-up', pointCost: 100, discountType: 'topup_fixed', discountValue: 5, minTopup: 20, sortOrder: 1 },
    { name: 'RM 10 top-up discount', description: 'Get RM 10 off your top-up', pointCost: 200, discountType: 'topup_fixed', discountValue: 10, minTopup: 25, sortOrder: 2 },
    { name: 'RM 20 bonus credit', description: 'Get RM 20 extra credits when you top up RM 100 or more', pointCost: 500, discountType: 'topup_bonus', discountValue: 20, minTopup: 100, sortOrder: 3 },
    { name: '10% off next booking', description: 'Get 10% off your next booking (max RM 30)', pointCost: 600, discountType: 'booking_percent', discountValue: 10, maxDiscount: 30, sortOrder: 4 },
    { name: 'Free call-out waiver', description: 'Waive call-out fee (up to RM 30)', pointCost: 800, discountType: 'waiver', discountValue: 30, sortOrder: 5 },
    { name: 'RM 50 top-up discount', description: 'Get RM 50 off your top-up', pointCost: 1000, discountType: 'topup_fixed', discountValue: 50, minTopup: 150, sortOrder: 6 },
  ];
  for (const r of rewardSeedData) {
    await prisma.reward.create({ data: r });
  }
  console.log('  ✓ 6 reward catalog items');

  // ── Postcodes (KL area seed) ──
  const postcodeData = [
    { postcode: '50000', district: 'Kuala Lumpur City Centre', state: 'Wilayah Persekutuan Kuala Lumpur' },
    { postcode: '50450', district: 'Chow Kit', state: 'Wilayah Persekutuan Kuala Lumpur' },
    { postcode: '47500', district: 'Subang Jaya', state: 'Selangor' },
    { postcode: '47810', district: 'Petaling Jaya', state: 'Selangor' },
    { postcode: '68000', district: 'Ampang', state: 'Selangor' },
  ];
  for (const p of postcodeData) {
    await prisma.postcode.create({ data: p });
  }
  console.log(`  ✓ ${postcodeData.length} postcodes seeded (KL area)`);

  console.log('  ✓ settings, penalty rules, feature flags, marketing budget');

  // ── Admin ── (fixed ID so a reseed keeps the admin session valid)
  const admin = await prisma.user.create({
    data: {
      id: fixedUuid('admin@demo.local'),
      role: 'admin',
      name: 'Amirah Syakirah',
      email: 'admin@demo.local',
      phone: '+60 3-0000 0000',
      passwordHash,
      actionPinHash: pinHash,
      isDemo: true,
    },
  });

  // ── Customers ──
  const customerByRef: Record<string, string> = {};
  const addressByRef: Record<string, string> = {};
  for (const c of customers) {
    const user = await prisma.user.create({
      data: {
        id: fixedUuid(c.email),
        role: 'customer',
        name: c.name,
        email: c.email,
        phone: c.phone,
        passwordHash,
        actionPinHash: pinHash,
        contactName: c.name,
        contactNumber: c.phone,
        preferredTimeSlot: c.preferredTimeSlot ?? null,
        isDemo: true,
      },
    });
    customerByRef[c.ref] = user.id;
    let idx = 0;
    for (const a of c.addresses) {
      const addr = await prisma.userAddress.create({
        data: {
          userId: user.id,
          label: a.label,
          address: a.address,
          propertyType: a.propertyType,
          isDefault: a.isDefault,
          postcode: a.postcode ?? null,
          district: a.district ?? null,
          state: a.state ?? null,
        },
      });
      addressByRef[`${c.ref}:${idx++}`] = addr.id;
    }
  }
  // Quote presets for the demo customers (the quote form picks from these).
  // isDefault is NOT set - the form starts empty and the user picks a preset manually.
  await prisma.quotePreset.createMany({
    data: [
      {
        userId: customerByRef['C_LOYAL'],
        label: 'Home - myself',
        contactName: 'Priya Subramaniam',
        contactNumber: '+60 19-876 5432',
        addressId: addressByRef['C_LOYAL:0'],
        instruction: 'Gate code 1234. Please call on arrival.',
        preferredTimeSlot: 'noon',
      },
      {
        userId: customerByRef['C_LOYAL'],
        label: "Parents' place",
        contactName: 'Arun Subramaniam',
        contactNumber: '+60 12-555 0199',
        addressId: addressByRef['C_LOYAL:1'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_ACTIVE'],
        label: 'Home - myself',
        contactName: 'David Tan',
        contactNumber: '+60 11-234 5678',
        addressId: addressByRef['C_ACTIVE:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_FRESH'],
        label: 'Home - myself',
        contactName: 'Sarah Lim',
        contactNumber: '+60 12-345 6789',
        addressId: addressByRef['C_FRESH:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_FRESH2'],
        label: 'Home - myself',
        contactName: 'Nurul Hafizah',
        contactNumber: '+60 17-111 2233',
        addressId: addressByRef['C_FRESH2:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_FRESH3'],
        label: 'Home - myself',
        contactName: 'Michael Lim',
        contactNumber: '+60 16-222 3344',
        addressId: addressByRef['C_FRESH3:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_ACTIVE2'],
        label: 'Home - myself',
        contactName: 'Rashida Kamila',
        contactNumber: '+60 18-333 4455',
        addressId: addressByRef['C_ACTIVE2:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_ACTIVE3'],
        label: 'Home - myself',
        contactName: 'Jason Yeoh',
        contactNumber: '+60 14-444 5566',
        addressId: addressByRef['C_ACTIVE3:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_LOYAL2'],
        label: 'Home - myself',
        contactName: 'Tan Mei Ling',
        contactNumber: '+60 13-555 6677',
        addressId: addressByRef['C_LOYAL2:0'],
        preferredTimeSlot: 'morning',
      },
      {
        userId: customerByRef['C_LOYAL3'],
        label: 'Home - myself',
        contactName: 'Rajan Krishnan',
        contactNumber: '+60 11-666 7788',
        addressId: addressByRef['C_LOYAL3:0'],
        preferredTimeSlot: 'afternoon',
      },
    ],
  });
  console.log(`  ✓ admin + ${customers.length} customers + quote presets`);

  // ── Customer wallet history ──
  // Give each demo customer a RM 200 top-up plus a couple of booking-payment
  // deductions so the wallet / transaction history page is populated. The
  // remaining creditBalance reflects the transaction trail.
  const customerBookingDeductions = [
    { amount: 60, reference: 'Home Cleaning booking payment' },
    { amount: 80, reference: 'Aircond Servicer booking payment' },
  ];
  for (const c of customers) {
    const uid = customerByRef[c.ref];
    const topup = 200;
    const totalDeducted = customerBookingDeductions.reduce((s, d) => s + d.amount, 0);
    await prisma.transaction.create({
      data: { type: 'deposit_topup', amount: topup, userId: uid, reference: 'Demo top-up' },
    });
    for (const d of customerBookingDeductions) {
      await prisma.transaction.create({
        data: { type: 'escrow_hold', amount: d.amount, userId: uid, reference: d.reference },
      });
    }
    await prisma.user.update({
      where: { id: uid },
      data: { creditBalance: topup - totalDeducted },
    });
  }
  console.log(`  ✓ customer wallet history (RM 200 top-up + ${customerBookingDeductions.length} payments each)`);

  // ── Customer Points & Rewards Profiles ──
  // Customer.fresh (new) - 500 balance, 500 lifetime (Bronze)
  await prisma.customerPoints.create({
    data: { userId: customerByRef['C_FRESH'], balance: 500, lifetimeEarned: 500 },
  });
  await prisma.pointsTransaction.create({
    data: { userId: customerByRef['C_FRESH'], type: 'earn_welcome', amount: 500, balance: 500, note: '🎉 Welcome! Here are 500 free points to get started.' },
  });

  // Customer.active (returning) - 950 balance, 950 lifetime (Silver)
  await prisma.customerPoints.create({
    data: { userId: customerByRef['C_ACTIVE'], balance: 950, lifetimeEarned: 950 },
  });
  await prisma.pointsTransaction.create({
    data: { userId: customerByRef['C_ACTIVE'], type: 'earn_welcome', amount: 500, balance: 950, note: '🎉 Welcome! Here are 500 free points to get started.' },
  });
  for (const [amount, note] of [[150, 'Bathroom cleaning'], [50, 'Review for bathroom cleaning'], [200, 'Aircon servicing'], [50, 'Review for aircon servicing']] as [number, string][]) {
    await prisma.pointsTransaction.create({
      data: { userId: customerByRef['C_ACTIVE'], type: amount <= 100 ? 'earn_review' : 'earn_booking', amount, balance: 0, note, createdAt: new Date(Date.now() - (30 - note.length) * 86_400_000) },
    });
  }

  // Customer.loyal (regular) - 2100 balance, 2600 lifetime (Gold)
  await prisma.customerPoints.create({
    data: { userId: customerByRef['C_LOYAL'], balance: 2100, lifetimeEarned: 2600, lifetimeSpent: 500 },
  });
  const loyalTx = [
    { type: 'earn_welcome', amount: 500, note: '🎉 Welcome! Here are 500 free points to get started.' },
    { type: 'earn_booking', amount: 150, note: 'Earned from booking #BATH001 - Bathroom cleaning' },
    { type: 'earn_review', amount: 50, note: 'Review for bathroom cleaning' },
    { type: 'earn_booking', amount: 200, note: 'Earned from booking #AC001 - Aircon servicing' },
    { type: 'earn_review', amount: 50, note: 'Review for aircon servicing' },
    { type: 'earn_booking', amount: 180, note: 'Earned from booking #KPLUMB - Kitchen plumbing' },
    { type: 'earn_review', amount: 50, note: 'Review for kitchen plumbing' },
    { type: 'earn_booking', amount: 300, note: 'Earned from booking #FULLCLN - Full house cleaning' },
    { type: 'earn_review', amount: 50, note: 'Review for full house cleaning' },
    { type: 'earn_booking', amount: 120, note: 'Earned from booking #ELEC1 - Electrical repair' },
    { type: 'earn_review', amount: 50, note: 'Review for electrical repair' },
    { type: 'earn_referral', amount: 200, note: 'Referred a friend who booked' },
    { type: 'earn_booking', amount: 250, note: 'Earned from booking #DOOR01 - Door gate installation' },
    { type: 'earn_review', amount: 50, note: 'Review for door gate installation' },
    { type: 'earn_booking', amount: 220, note: 'Earned from booking #ROOF01 - Roof repair' },
    { type: 'earn_review', amount: 50, note: 'Review for roof repair' },
    { type: 'earn_booking', amount: 180, note: 'Earned from booking #RENO01 - Renovation consultation' },
    { type: 'earn_review', amount: 50, note: 'Review for renovation consultation' },
    { type: 'earn_booking', amount: 160, note: 'Earned from booking #INTER01 - Interior design consult' },
    { type: 'earn_review', amount: 50, note: 'Review for interior design consult' },
    { type: 'earn_booking', amount: 140, note: 'Earned from booking #WEDD01 - Wedding planning session' },
    { type: 'earn_review', amount: 50, note: 'Review for wedding planning session' },
  ];
  let runningBalance = 0;
  for (let i = 0; i < loyalTx.length; i++) {
    const tx = loyalTx[i];
    runningBalance += tx.amount;
    await prisma.pointsTransaction.create({
      data: {
        userId: customerByRef['C_LOYAL'],
        type: tx.type,
        amount: tx.amount,
        balance: runningBalance,
        note: tx.note,
        createdAt: new Date(Date.now() - (loyalTx.length - i) * 86_400_000),
      },
    });
  }
  // Loyal's redemption (500 pts spent)
  const loyalReward = await prisma.reward.findFirst({ where: { pointCost: 500 } });
  if (loyalReward) {
    await prisma.pointsTransaction.create({
      data: {
        userId: customerByRef['C_LOYAL'],
        type: 'redeem',
        amount: -500,
        balance: runningBalance - 500,
        reference: loyalReward.id,
        note: 'Redeemed "RM 25 top-up discount"',
        createdAt: new Date(Date.now() - 2 * 86_400_000),
      },
    });
    await prisma.redemption.create({
      data: {
        userId: customerByRef['C_LOYAL'],
        rewardId: loyalReward.id,
        voucherCode: 'RWD-SEED01',
        status: 'used',
        usedAt: new Date(Date.now() - 1 * 86_400_000),
        expiresAt: new Date(Date.now() + 28 * 86_400_000),
      },
    });
  }
  console.log('  ✓ customer points profiles (Fresh: 500, Active: 950, Loyal: 2100)');

  // New customers - minimal welcome points (500 each)
  for (const ref of ['C_FRESH2', 'C_FRESH3', 'C_ACTIVE2', 'C_ACTIVE3', 'C_LOYAL2', 'C_LOYAL3']) {
    const uid = customerByRef[ref];
    if (!uid) continue;
    await prisma.customerPoints.create({ data: { userId: uid, balance: 500, lifetimeEarned: 500 } });
    await prisma.pointsTransaction.create({
      data: { userId: uid, type: 'earn_welcome', amount: 500, balance: 500, note: '🎉 Welcome! Here are 500 free points to get started.' },
    });
  }

  // ── Servicers, deposits, services, presets ──
  // Map each servicer ref → its local demo profile picture (M#_ShortName.png).
  // Files live in backend/uploads/profiles/demo and are served at /api/files/local.
  const demoLogoDir = join(__dirname, '../../uploads/profiles/demo');
  const demoLogoByRef: Record<string, string> = {};
  if (existsSync(demoLogoDir)) {
    for (const f of readdirSync(demoLogoDir)) {
      const match = f.match(/^(M\d+)_.*\.png$/);
      if (match) demoLogoByRef[match[1]] = `/api/files/local/profiles/demo/${f}`;
    }
  }

  const servicerByRef: Record<string, string> = {};
  const serviceBySku: Record<string, string> = {};
  for (const m of servicers) {
    const servicer = await prisma.servicer.create({
      data: {
        id: fixedUuid(m.email),
        name: m.name,
        email: m.email,
        phone: m.phone,
        passwordHash,
        pinHash,
        businessName: m.businessName,
        bio: `${m.businessName} - based in ${m.area}.`,
        logoUrl: demoLogoByRef[m.ref] ?? `https://picsum.photos/seed/servicer${m.ref}/200/200`,
        categoryId: categoryBySlug[m.categorySlug],
        isCompany: m.isCompany,
        entityType: m.entityType,
        taxNumber: m.taxNumber,
        businessRegistrationNumber: m.brn,
        sstRegistered: m.sstRegistered,
        sstNumber: m.sstNumber,
        serviceChargeRate: m.serviceChargeRate,
        taxInclusive: m.taxInclusive,
        bankName: m.bankName,
        bankAccount: m.bankAccount,
        showEmailPublic: m.showEmailPublic,
        showPhonePublic: m.showPhonePublic,
        invoicePrefix: m.invoicePrefix,
        invoiceYearFormat: m.invoiceYearFormat,
        invoiceSeparator: m.invoiceSeparator,
        invoicePadding: m.invoicePadding,
        invoiceContent: m.invoiceContent,
        invoiceSuffix: m.invoiceSuffix,
        serviceAreas: m.serviceAreas,
        rating: m.rating,
        onboarded: true,
        isDemo: true,
      },
    });
    servicerByRef[m.ref] = servicer.id;

    await prisma.servicerDeposit.create({
      data: {
        servicerId: servicer.id,
        totalDeposited: 500,
        currentBalance: 500,
        minimumRequired: 100,
      },
    });
    // Credit log showing initial deposit + bonus.
    await prisma.servicerCreditLog.create({
      data: {
        servicerId: servicer.id,
        type: 'manual_adjustment',
        amount: 500,
        balanceAfter: 500,
        note: 'Initial security deposit',
      },
    });
    await prisma.servicerCreditLog.create({
      data: {
        servicerId: servicer.id,
        type: 'manual_adjustment',
        amount: 100,
        balanceAfter: 600,
        note: 'Welcome bonus credit',
        createdAt: new Date(Date.now() - 25 * 86_400_000),
      },
    });
    await prisma.servicerProposalPreset.create({
      data: {
        servicerId: servicer.id,
        name: 'Standard quote',
        message: `Thanks for considering ${m.businessName}. Happy to help with your job.`,
        priceOffset: 0,
        isDefault: true,
      },
    });
    for (const s of m.services) {
      const svc = await prisma.servicerService.create({
        data: {
          servicerId: servicer.id,
          categoryId: categoryBySlug[m.categorySlug],
          title: s.title,
          description: s.title,
          servicerSku: s.sku,
          basePrice: s.basePrice,
          priceType: s.priceType,
          taxMode: m.taxMode,
          estimatedDurationMinutes: s.duration,
          autoAccept: s.autoAccept ?? false,
          autoAcceptConditions: (s.autoAcceptConditions as object) ?? undefined,
          travelFee: s.travelFee,
          suppliesFee: s.suppliesFee,
          procedure: s.procedure,
          // Phase 6: option-price map modifiers for priced-question categories.
          ...(s.modifiers ? { modifiers: s.modifiers as object } : {}),
        },
      });
      if (s.sku) serviceBySku[s.sku] = svc.id;
    }
  }
  // ── In-flight scenario helper ──────────────────────────────────────────────
  async function makeQuote(
    customerRef: string,
    addressKey: string,
    categorySlug: string,
    opts: { timeSlot?: 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'; status?: 'open' | 'matched'; budget?: [number, number]; payment?: 'pay_now' | 'pay_later' | 'cash'; deadline?: Date } = {},
  ) {
    return prisma.quoteRequest.create({
      data: {
        userId: customerByRef[customerRef],
        categoryId: categoryBySlug[categorySlug],
        addressId: addressByRef[addressKey],
        contactName: 'Demo Customer',
        contactNumber: '+60 12-000 0000',
        timeSlot: opts.timeSlot ?? 'morning',
        preferredDate: days(1),
        propertyType: 'condo',
        budgetMin: opts.budget?.[0] ?? 60,
        budgetMax: opts.budget?.[1] ?? 200,
        paymentMode: opts.payment ?? 'pay_later',
        deadlineMode: 'fixed_time',
        proposalDeadline: opts.deadline ?? minutes(offset),
        servicerDeadline: opts.deadline
          ? new Date(opts.deadline.getTime() - 15 * 60_000)
          : minutes(offset - 15),
        status: opts.status ?? 'open',
      },
    });
  }

  // ── Open quotes (give M1, M2, M9 each a live quote + proposal) ──

  // Customer.active - open aircond servicing quote → M2 broadcasts + auto proposal.
  const activeQuote = await prisma.quoteRequest.create({
    data: {
      userId: customerByRef['C_ACTIVE'],
      categoryId: categoryBySlug['aircond-servicer'],
      addressId: addressByRef['C_ACTIVE:0'],
      contactName: 'Demo Customer',
      contactNumber: '+60 12-000 0000',
      timeSlot: 'morning',
      preferredDate: days(1),
      propertyType: 'condo',
      budgetMin: 80,
      budgetMax: 200,
      paymentMode: 'pay_later',
      deadlineMode: 'fixed_time',
      proposalDeadline: minutes(offset),
      servicerDeadline: minutes(offset - 15),
      status: 'open',
      serviceDetails: { aircon_service: ['wall_chemical', 'wall_general'], property_type: 'condo' },
    },
  });
  await prisma.quoteBroadcast.create({ data: { quoteRequestId: activeQuote.id, servicerId: servicerByRef['M2'] } });
  await prisma.quoteProposal.create({
    data: { quoteRequestId: activeQuote.id, servicerId: servicerByRef['M2'], proposedPrice: 110, message: 'CoolBreeze AC can handle this job.', etaMinutes: 60, isAuto: true },
  });

  // Open plumbing quote (C_FRESH) → M1 broadcast + proposal.
  const plumbingOpenQuote = await prisma.quoteRequest.create({
    data: {
      userId: customerByRef['C_FRESH'],
      categoryId: categoryBySlug['plumber'],
      addressId: addressByRef['C_FRESH:0'],
      contactName: 'Sarah Lim', contactNumber: '+60 12-345 6789',
      timeSlot: 'morning', preferredDate: days(2),
      propertyType: 'condo', budgetMin: 80, budgetMax: 250,
      paymentMode: 'pay_later', deadlineMode: 'fixed_time',
      proposalDeadline: minutes(offset), servicerDeadline: minutes(offset - 15),
      status: 'open',
    },
  });
  await prisma.quoteBroadcast.create({ data: { quoteRequestId: plumbingOpenQuote.id, servicerId: servicerByRef['M1'] } });
  await prisma.quoteProposal.create({
    data: { quoteRequestId: plumbingOpenQuote.id, servicerId: servicerByRef['M1'], proposedPrice: 100, message: 'Ahmad Plumbing can fix this - fast and reliable.', etaMinutes: 60 },
  });

  // Open catering quote (C_LOYAL) → M9 broadcast + proposal.
  const cateringOpenQuote = await prisma.quoteRequest.create({
    data: {
      userId: customerByRef['C_LOYAL'],
      categoryId: categoryBySlug['catering'],
      addressId: addressByRef['C_LOYAL:0'],
      contactName: 'Priya Subramaniam', contactNumber: '+60 19-876 5432',
      timeSlot: 'noon', preferredDate: days(3),
      propertyType: 'landed', budgetMin: 150, budgetMax: 500,
      paymentMode: 'pay_later', deadlineMode: 'fixed_time',
      proposalDeadline: minutes(offset + 60), servicerDeadline: minutes(offset + 45),
      status: 'open',
    },
  });
  await prisma.quoteBroadcast.create({ data: { quoteRequestId: cateringOpenQuote.id, servicerId: servicerByRef['M9'] } });
  await prisma.quoteProposal.create({
    data: { quoteRequestId: cateringOpenQuote.id, servicerId: servicerByRef['M9'], proposedPrice: 200, message: 'Auntie Mei Catering - homestyle Malaysian menu.', etaMinutes: 180, isAuto: true },
  });

  // Extra broadcasts (no proposal yet) - servicers see pending incoming quotes.
  const extraBroadcasts: { customerRef: string; addressKey: string; categorySlug: string; servicerRef: string }[] = [
    { customerRef: 'C_FRESH', addressKey: 'C_FRESH:0', categorySlug: 'tv-repair',          servicerRef: 'M19' },
    { customerRef: 'C_FRESH', addressKey: 'C_FRESH:0', categorySlug: 'ceiling-fan-repair',  servicerRef: 'M22' },
    { customerRef: 'C_ACTIVE', addressKey: 'C_ACTIVE:0', categorySlug: 'art-class',         servicerRef: 'M24' },
    { customerRef: 'C_LOYAL', addressKey: 'C_LOYAL:0', categorySlug: 'roof',               servicerRef: 'M16' },
    { customerRef: 'C_LOYAL', addressKey: 'C_LOYAL:1', categorySlug: 'carpet-cleaning',     servicerRef: 'M6' },
  ];
  for (const eb of extraBroadcasts) {
    const q = await makeQuote(eb.customerRef, eb.addressKey, eb.categorySlug, { status: 'open', deadline: minutes(offset) });
    await prisma.quoteBroadcast.create({ data: { quoteRequestId: q.id, servicerId: servicerByRef[eb.servicerRef] } });
  }
  console.log('  ✓ 3 open quotes with proposals + 5 extra broadcasts (pending)');

  // Booking-chain helper.
  async function makeBooking(
    customerRef: string,
    addressKey: string,
    servicerRef: string,
    categorySlug: string,
    status: 'pending_confirm' | 'in_progress' | 'completed' | 'cancelled',
    payment: 'pay_now' | 'pay_later' | 'cash',
    price: number,
    opts?: { scheduledDate?: Date },
  ) {
    const q = await makeQuote(customerRef, addressKey, categorySlug, {
      status: 'matched',
      payment,
      deadline: new Date(Date.now() - 60 * 60_000),
    });
    const proposal = await prisma.quoteProposal.create({
      data: {
        quoteRequestId: q.id,
        servicerId: servicerByRef[servicerRef],
        proposedPrice: price,
        message: 'Proposal accepted by customer.',
        etaMinutes: 60,
        status: 'selected',
      },
    });
    const sched = opts?.scheduledDate ?? days(status === 'completed' || status === 'cancelled' ? -2 : 1);
    const booking = await prisma.booking.create({
      data: {
        quoteRequestId: q.id,
        proposalId: proposal.id,
        userId: customerByRef[customerRef],
        servicerId: servicerByRef[servicerRef],
        status,
        price,
        paymentMode: payment,
        scheduledDate: sched,
        timeSlot: 'morning',
        confirmedAt: opts?.scheduledDate ?? (status !== 'pending_confirm' ? days(-2) : null),
        arrivedAt: ['in_progress', 'completed'].includes(status) ? (opts?.scheduledDate ?? days(-2)) : null,
        arrivePhotoUrl: ['in_progress', 'completed'].includes(status)
          ? `https://picsum.photos/seed/arrive${servicerRef}/800/600`
          : null,
        doneAt: status === 'completed' ? (opts?.scheduledDate ?? days(-2)) : null,
        donePhotoUrl: status === 'completed'
          ? `https://picsum.photos/seed/done${servicerRef}/800/600`
          : null,
        cashConfirmed: false,
        cancelledBy: status === 'cancelled' ? 'servicer' : null,
        cancelReason: status === 'cancelled' ? 'No-show - servicer did not arrive' : null,
      },
    });
    return booking;
  }

  // M2 - in_progress aircond servicing booking.
  await makeBooking('C_LOYAL', 'C_LOYAL:0', 'M2', 'aircond-servicer', 'in_progress', 'pay_now', 130);
  // M4 - completed cash booking awaiting cash-confirm.
  await makeBooking('C_LOYAL', 'C_LOYAL:1', 'M4', 'home-cleaning', 'completed', 'cash', 110);
  // Customer.loyal - 3 completed bookings for history + reorder.
  const compM1 = await makeBooking('C_LOYAL', 'C_LOYAL:0', 'M1', 'plumber', 'completed', 'pay_later', 80);
  await makeBooking('C_LOYAL', 'C_LOYAL:0', 'M4', 'home-cleaning', 'completed', 'pay_later', 140);
  await makeBooking('C_LOYAL', 'C_LOYAL:1', 'M9', 'catering', 'completed', 'pay_later', 120);

  // ── Bulk completed bookings for ALL servicers ──
  // Each servicer gets 8-15 completed jobs (50 for AC Doctor) evenly spaced
  // across the last 30 days so every dashboard shows real 30-day revenue data.
  const servicerSlugs: { ref: string; slug: string; prices: number[]; count: number }[] = [
    { ref: 'M1',  slug: 'plumber',                prices: [80, 120, 160, 200, 250], count: 15 },
    { ref: 'M2',  slug: 'aircond-servicer',       prices: [80, 110, 140, 180],       count: 15 },
    { ref: 'M3',  slug: 'electrical-wiring',      prices: [60, 100, 150, 200],       count: 15 },
    { ref: 'M4',  slug: 'home-cleaning',          prices: [60, 100, 150, 200],       count: 15 },
    { ref: 'M5',  slug: 'sofa-mattress-cleaning', prices: [50, 70, 90, 120],         count: 12 },
    { ref: 'M6',  slug: 'carpet-cleaning',        prices: [40, 80, 140, 200],        count: 12 },
    { ref: 'M7',  slug: 'curtain-cleaning',       prices: [30, 50, 80, 120],         count: 12 },
    { ref: 'M8',  slug: 'event-planner',          prices: [500, 1000, 2000, 5000],   count: 10 },
    { ref: 'M9',  slug: 'catering',               prices: [50, 120, 200, 350],       count: 15 },
    { ref: 'M10', slug: 'professional-organizer', prices: [60, 100, 150, 200],       count: 12 },
    { ref: 'M11', slug: 'aircond-installer',      prices: [250, 400, 600, 900],      count: 12 },
    { ref: 'M12', slug: 'carpenter',              prices: [100, 200, 300, 500],      count: 12 },
    { ref: 'M13', slug: 'renovation',             prices: [500, 1000, 2000, 5000],   count: 10 },
    { ref: 'M14', slug: 'interior-design',        prices: [300, 800, 1500, 3000],    count: 10 },
    { ref: 'M15', slug: 'door-gate',              prices: [80, 120, 180, 250],       count: 12 },
    { ref: 'M16', slug: 'roof',                   prices: [200, 400, 600, 1000],     count: 10 },
    { ref: 'M17', slug: 'washing-machine-repair', prices: [50, 80, 120, 160],        count: 12 },
    { ref: 'M18', slug: 'refrigerator-repair',    prices: [60, 80, 120, 180],        count: 12 },
    { ref: 'M19', slug: 'tv-repair',              prices: [40, 60, 100, 150],        count: 12 },
    { ref: 'M20', slug: 'oven-repair',            prices: [50, 70, 110, 160],        count: 12 },
    { ref: 'M21', slug: 'water-heater-repair',    prices: [60, 80, 130, 180],        count: 12 },
    { ref: 'M22', slug: 'ceiling-fan-repair',     prices: [40, 60, 90, 130],         count: 12 },
    { ref: 'M23', slug: 'aircond-repair',         prices: [60, 100, 150, 200],       count: 12 },
    { ref: 'M24', slug: 'art-class',              prices: [40, 60, 80, 120],         count: 12 },
    { ref: 'M25', slug: 'language-class',         prices: [40, 60, 80, 120],         count: 12 },
    { ref: 'M26', slug: 'music-class',            prices: [50, 70, 100, 150],        count: 12 },
    { ref: 'M27', slug: 'home-tutoring',          prices: [40, 60, 80, 120],         count: 12 },
    { ref: 'M28', slug: 'cooking-class',          prices: [60, 100, 150, 200],       count: 12 },
    { ref: 'M29', slug: 'gym-trainer',            prices: [60, 80, 120, 180],        count: 12 },
    { ref: 'M30', slug: '3d-modeling-class',      prices: [100, 150, 200, 300],      count: 12 },
    { ref: 'M31', slug: '3d-modeling-class',      prices: [80, 120, 180, 250],       count: 12 },
    { ref: 'M32', slug: '3d-modeling-class',      prices: [100, 150, 200, 300],      count: 50 },
    { ref: 'M33', slug: '3d-modeling-class',      prices: [120, 180, 250, 350],      count: 12 },
    { ref: 'M34', slug: '3d-modeling-class',      prices: [100, 150, 200, 300],      count: 12 },
    { ref: 'M35', slug: '3d-modeling-class',      prices: [120, 180, 250, 350],      count: 12 },
    { ref: 'M36', slug: 'alarm-cctv',             prices: [100, 200, 400, 800],      count: 12 },
    // ── Set B (M37–M66) ──
    { ref: 'M37',  slug: 'plumber',                prices: [80, 120, 160, 200],        count: 12 },
    { ref: 'M38',  slug: 'aircond-servicer',       prices: [90, 120, 150, 180],        count: 12 },
    { ref: 'M39',  slug: 'electrical-wiring',      prices: [55, 90, 140, 190],         count: 12 },
    { ref: 'M40',  slug: 'home-cleaning',          prices: [65, 100, 140, 200],        count: 12 },
    { ref: 'M41',  slug: 'sofa-mattress-cleaning', prices: [60, 80, 110, 150],         count: 10 },
    { ref: 'M42',  slug: 'carpet-cleaning',        prices: [55, 85, 130, 190],         count: 10 },
    { ref: 'M43',  slug: 'curtain-cleaning',       prices: [35, 55, 85, 120],          count: 10 },
    { ref: 'M44',  slug: 'event-planner',          prices: [350, 800, 1500, 3000],     count: 8  },
    { ref: 'M45',  slug: 'catering',               prices: [60, 120, 200, 350],        count: 12 },
    { ref: 'M46',  slug: 'professional-organizer', prices: [70, 100, 150, 200],        count: 10 },
    { ref: 'M47',  slug: 'aircond-installer',      prices: [300, 450, 600, 900],       count: 10 },
    { ref: 'M48',  slug: 'carpenter',              prices: [100, 180, 280, 450],       count: 10 },
    { ref: 'M49',  slug: 'renovation',             prices: [400, 900, 2000, 5000],     count: 8  },
    { ref: 'M50',  slug: 'interior-design',        prices: [500, 1000, 2000, 4000],    count: 8  },
    { ref: 'M51',  slug: 'door-gate',              prices: [80, 130, 200, 320],        count: 10 },
    { ref: 'M52',  slug: 'roof',                   prices: [200, 380, 600, 1000],      count: 8  },
    { ref: 'M53',  slug: 'washing-machine-repair', prices: [55, 85, 120, 160],         count: 10 },
    { ref: 'M54',  slug: 'refrigerator-repair',    prices: [60, 90, 120, 170],         count: 10 },
    { ref: 'M55',  slug: 'tv-repair',              prices: [45, 70, 100, 150],         count: 10 },
    { ref: 'M56',  slug: 'oven-repair',            prices: [50, 75, 110, 160],         count: 10 },
    { ref: 'M57',  slug: 'water-heater-repair',    prices: [60, 85, 130, 180],         count: 10 },
    { ref: 'M58',  slug: 'ceiling-fan-repair',     prices: [45, 65, 90, 130],          count: 10 },
    { ref: 'M59',  slug: 'aircond-repair',         prices: [65, 100, 150, 200],        count: 10 },
    { ref: 'M60',  slug: 'art-class',              prices: [45, 65, 85, 120],          count: 10 },
    { ref: 'M61',  slug: 'language-class',         prices: [45, 65, 85, 120],          count: 10 },
    { ref: 'M62',  slug: 'music-class',            prices: [55, 75, 100, 150],         count: 10 },
    { ref: 'M63',  slug: 'home-tutoring',          prices: [45, 65, 80, 120],          count: 10 },
    { ref: 'M64',  slug: 'cooking-class',          prices: [60, 90, 140, 200],         count: 10 },
    { ref: 'M65',  slug: 'gym-trainer',            prices: [60, 80, 120, 180],         count: 10 },
    { ref: 'M66',  slug: 'alarm-cctv',             prices: [120, 220, 450, 900],       count: 10 },
    // ── Set C (M67–M96) ──
    { ref: 'M67',  slug: 'plumber',                prices: [70, 110, 150, 200],        count: 10 },
    { ref: 'M68',  slug: 'aircond-servicer',       prices: [80, 110, 140, 180],        count: 10 },
    { ref: 'M69',  slug: 'electrical-wiring',      prices: [80, 120, 160, 220],        count: 10 },
    { ref: 'M70',  slug: 'home-cleaning',          prices: [60, 90, 130, 180],         count: 10 },
    { ref: 'M71',  slug: 'sofa-mattress-cleaning', prices: [55, 75, 100, 140],         count: 8  },
    { ref: 'M72',  slug: 'carpet-cleaning',        prices: [50, 80, 120, 180],         count: 8  },
    { ref: 'M73',  slug: 'curtain-cleaning',       prices: [30, 50, 75, 110],          count: 8  },
    { ref: 'M74',  slug: 'event-planner',          prices: [400, 900, 2000, 4000],     count: 8  },
    { ref: 'M75',  slug: 'catering',               prices: [70, 130, 220, 380],        count: 10 },
    { ref: 'M76',  slug: 'professional-organizer', prices: [65, 95, 140, 190],         count: 8  },
    { ref: 'M77',  slug: 'aircond-installer',      prices: [280, 420, 580, 850],       count: 8  },
    { ref: 'M78',  slug: 'carpenter',              prices: [90, 160, 260, 420],        count: 8  },
    { ref: 'M79',  slug: 'renovation',             prices: [450, 950, 2500, 6000],     count: 8  },
    { ref: 'M80',  slug: 'interior-design',        prices: [400, 900, 1800, 3500],     count: 8  },
    { ref: 'M81',  slug: 'door-gate',              prices: [90, 140, 220, 350],        count: 8  },
    { ref: 'M82',  slug: 'roof',                   prices: [220, 400, 650, 1100],      count: 8  },
    { ref: 'M83',  slug: 'washing-machine-repair', prices: [50, 80, 115, 155],         count: 8  },
    { ref: 'M84',  slug: 'refrigerator-repair',    prices: [55, 85, 115, 165],         count: 8  },
    { ref: 'M85',  slug: 'tv-repair',              prices: [40, 65, 95, 145],          count: 8  },
    { ref: 'M86',  slug: 'oven-repair',            prices: [45, 70, 105, 155],         count: 8  },
    { ref: 'M87',  slug: 'water-heater-repair',    prices: [55, 80, 125, 175],         count: 8  },
    { ref: 'M88',  slug: 'ceiling-fan-repair',     prices: [40, 60, 85, 125],          count: 8  },
    { ref: 'M89',  slug: 'aircond-repair',         prices: [60, 95, 145, 195],         count: 8  },
    { ref: 'M90',  slug: 'art-class',              prices: [40, 60, 80, 115],          count: 8  },
    { ref: 'M91',  slug: 'language-class',         prices: [40, 60, 80, 115],          count: 8  },
    { ref: 'M92',  slug: 'music-class',            prices: [50, 70, 95, 145],          count: 8  },
    { ref: 'M93',  slug: 'home-tutoring',          prices: [40, 60, 75, 115],          count: 8  },
    { ref: 'M94',  slug: 'cooking-class',          prices: [55, 85, 130, 190],         count: 8  },
    { ref: 'M95',  slug: 'gym-trainer',            prices: [55, 75, 110, 170],         count: 8  },
    { ref: 'M96',  slug: 'alarm-cctv',             prices: [130, 240, 480, 950],       count: 8  },
    // ── New categories (M97–M105) — Painting, Moving, Gardening ──
    { ref: 'M97',  slug: 'painting',               prices: [120, 180, 240, 320],       count: 10 },
    { ref: 'M98',  slug: 'moving',                 prices: [200, 350, 500, 800],       count: 10 },
    { ref: 'M99',  slug: 'gardening',              prices: [80,  120, 180, 250],       count: 10 },
    { ref: 'M100', slug: 'painting',               prices: [110, 170, 230, 300],       count: 8  },
    { ref: 'M101', slug: 'moving',                 prices: [180, 320, 480, 750],       count: 8  },
    { ref: 'M102', slug: 'gardening',              prices: [70,  110, 160, 220],       count: 8  },
    { ref: 'M103', slug: 'painting',               prices: [100, 160, 220, 290],       count: 8  },
    { ref: 'M104', slug: 'moving',                 prices: [160, 300, 450, 700],       count: 8  },
    { ref: 'M105', slug: 'gardening',              prices: [65,  100, 150, 210],       count: 8  },
  ];
  const allBulkCompleted: { booking: Awaited<ReturnType<typeof makeBooking>>; servicerRef: string; price: number }[] = [];
  for (const m of servicerSlugs) {
    const count = m.count;
    // Build a set of working days: ~80% chance per day (takes 1-2 days off per week).
    const workingDays: number[] = [];
    for (let d = -1; d >= -30; d--) {
      if (Math.random() < 0.8) workingDays.push(d);
    }
    // If for some reason we have fewer working days than bookings, pad with the last available day.
    const days = workingDays.length > 0 ? workingDays : [-1];
    for (let i = 0; i < count; i++) {
      const dayOffset = days[i % days.length];
      const sched = new Date(Date.now() + dayOffset * 86_400_000);
      const price = m.prices[i % m.prices.length];
      const pay = i % 7 === 0 ? 'cash' : 'pay_later';
      const b = await makeBooking(
        i % 2 === 0 ? 'C_ACTIVE' : 'C_LOYAL',
        i % 2 === 0 ? 'C_ACTIVE:0' : 'C_LOYAL:0',
        m.ref, m.slug, 'completed', pay, price,
        { scheduledDate: sched },
      );
      allBulkCompleted.push({ booking: b, servicerRef: m.ref, price });
    }
  }
  console.log(`  ✓ ${allBulkCompleted.length} bulk completed bookings across all servicers`);
  console.log('  ✓ in-flight bookings (pending, in-progress, cash, 3 completed)');

  // ── Per-servicer scenario bookings (all 105 servicers) ──
  // Each servicer account gets one of each state so every dashboard has real data.
  const allCustomerRefs = ['C_FRESH', 'C_FRESH2', 'C_FRESH3', 'C_ACTIVE', 'C_ACTIVE2', 'C_ACTIVE3', 'C_LOYAL', 'C_LOYAL2', 'C_LOYAL3'];
  const allCustomerAddrs = ['C_FRESH:0', 'C_FRESH2:0', 'C_FRESH3:0', 'C_ACTIVE:0', 'C_ACTIVE2:0', 'C_ACTIVE3:0', 'C_LOYAL:0', 'C_LOYAL2:0', 'C_LOYAL3:0'];
  let scenarioIdx = 0;
  for (const m of servicerSlugs) {
    const custRef = allCustomerRefs[scenarioIdx % allCustomerRefs.length];
    const addrKey = allCustomerAddrs[scenarioIdx % allCustomerAddrs.length];
    // in_progress
    await makeBooking(custRef, addrKey, m.ref, m.slug, 'in_progress', 'pay_now', m.prices[1 % m.prices.length], { scheduledDate: new Date() });
    // cancelled
    await makeBooking(custRef, addrKey, m.ref, m.slug, 'cancelled', 'pay_later', m.prices[2 % m.prices.length], { scheduledDate: days(-1) });
    scenarioIdx++;
  }
  console.log(`  ✓ per-servicer scenario bookings (in-progress, cancelled) for all ${servicerSlugs.length} servicers`);

  // ── Invoices + escrow_release for completed bookings ──
  // So that servicer dashboards show actual earnings on first boot.
  const completedBookings: { booking: typeof compM1; servicerRef: string; price: number }[] = [
    ...allBulkCompleted,
  ];
  let seqCounter = 1;
  for (const cb of completedBookings) {
    const servicerId = servicerByRef[cb.servicerRef];
    const doneAt = cb.booking.doneAt ?? new Date();
    // Apply a promo discount to roughly every 5th completed booking so the
    // earnings data reflects promotion usage.
    const promoDiscount = seqCounter % 5 === 0 ? Math.round(cb.price * 0.1 * 100) / 100 : 0;
    const total = cb.price - promoDiscount;
    await prisma.invoice.create({
      data: {
        bookingId: cb.booking.id,
        servicerId,
        invoiceNumber: `INV-SEED-${String(seqCounter).padStart(4, '0')}`,
        sequenceNumber: seqCounter++,
        subtotal: cb.price,
        promoDiscount,
        taxRate: 0,
        taxAmount: 0,
        tipAmount: 0,
        platformFee: Math.round(total * 0.08 * 100) / 100,
        total,
        paidAt: doneAt,
        issuedAt: doneAt,
        createdAt: doneAt,
      },
    });
    await prisma.transaction.create({
      data: {
        type: 'escrow_release',
        amount: total,
        servicerId,
        bookingId: cb.booking.id,
        reference: `Seed - completed booking`,
        createdAt: doneAt,
      },
    });
  }
  console.log('  ✓ invoices + escrow_release for completed bookings');

  // ── Penalty scenarios ──
  // M3 (electrical-wiring) - active noshow penalty, deposit deducted.
  const m3Cancelled = await makeBooking('C_FRESH', 'C_FRESH:0', 'M3', 'electrical-wiring', 'cancelled', 'pay_later', 100);
  await prisma.penaltyLog.create({
    data: {
      bookingId: m3Cancelled.id,
      servicerId: servicerByRef['M3'],
      ruleId: penaltyRuleByType['noshow'],
      type: 'noshow',
      amountDeducted: 50,
    },
  });
  await prisma.servicerDeposit.update({
    where: { servicerId: servicerByRef['M3'] },
    data: { currentBalance: 450 },
  });
  await prisma.servicerCreditLog.create({
    data: {
      servicerId: servicerByRef['M3'],
      type: 'manual_adjustment',
      amount: -50,
      balanceAfter: 450,
      referenceId: m3Cancelled.id,
      note: 'No-show penalty deducted',
    },
  });

  // M23 (aircond-repair) - pending penalty appeal.
  const m23Cancelled = await makeBooking('C_FRESH', 'C_FRESH:0', 'M23', 'aircond-repair', 'cancelled', 'pay_later', 80);
  const m23Penalty = await prisma.penaltyLog.create({
    data: {
      bookingId: m23Cancelled.id,
      servicerId: servicerByRef['M23'],
      ruleId: penaltyRuleByType['noshow'],
      type: 'noshow',
      amountDeducted: 50,
    },
  });
  await prisma.penaltyAppeal.create({
    data: {
      penaltyLogId: m23Penalty.id,
      servicerId: servicerByRef['M23'],
      reason: 'Customer gave the wrong unit number; I waited 30 minutes outside.',
      status: 'pending',
    },
  });

  // M9 (catering) - approved appeal, penalty reversed.
  const m9Cancelled = await makeBooking('C_FRESH', 'C_FRESH:0', 'M9', 'catering', 'cancelled', 'pay_later', 90);
  const m9Penalty = await prisma.penaltyLog.create({
    data: {
      bookingId: m9Cancelled.id,
      servicerId: servicerByRef['M9'],
      ruleId: penaltyRuleByType['cancel'],
      type: 'cancel',
      amountDeducted: 30,
      status: 'reversed',
    },
  });
  await prisma.penaltyAppeal.create({
    data: {
      penaltyLogId: m9Penalty.id,
      servicerId: servicerByRef['M9'],
      reason: 'Family emergency - provided hospital documentation.',
      status: 'approved',
      adminNote: 'Appeal approved, RM30 reversed to deposit.',
      reviewedAt: days(-1),
    },
  });
  console.log('  ✓ penalty scenarios (M3 active, M23 appeal pending, M9 reversed)');

  // ── Promotions ──
  await prisma.promotion.createMany({
    data: [
      {
        label: 'Ahmad Plumbing 10% Off',
        description: 'Exclusive 10% discount on plumbing bookings.',
        triggerType: 'manual',
        valueType: 'percent',
        value: 10,
        conditions: { minOrderAmount: 50 },
        targetRole: 'customer',
        maxUses: 100,
        endDate: days(30),
      },
      {
        label: 'Maid Day First Booking',
        description: 'RM15 off your first maid service booking.',
        triggerType: 'manual',
        valueType: 'fixed',
        value: 15,
        conditions: { minOrderAmount: 80 },
        targetRole: 'customer',
        maxUses: 50,
      },
      {
        label: 'Welcome RM20 Off',
        description: 'Welcome offer - RM20 off your first booking.',
        triggerType: 'welcome',
        valueType: 'fixed',
        value: 20,
        conditions: { minOrderAmount: 100 },
        targetRole: 'customer',
        maxUses: 500,
        endDate: new Date('2026-12-31T23:59:59Z'),
      },
      {
        label: 'MMU Student 10% Off',
        description: '10% discount for MMU students.',
        triggerType: 'manual',
        valueType: 'percent',
        value: 10,
        targetRole: 'customer',
        maxUses: 200,
      },
    ],
  });
  console.log('  ✓ promotions (Ahmad 10%, Maid First, Welcome RM20, MMU 10%)');

  // ── Servicer schedules (all 36) ──
  const weekdaySlots: Array<{ weekday: Weekday; timeSlot: TimeSlot }> = [
    { weekday: Weekday.mon, timeSlot: TimeSlot.morning }, { weekday: Weekday.mon, timeSlot: TimeSlot.noon },
    { weekday: Weekday.tue, timeSlot: TimeSlot.morning }, { weekday: Weekday.tue, timeSlot: TimeSlot.noon },
    { weekday: Weekday.wed, timeSlot: TimeSlot.morning }, { weekday: Weekday.wed, timeSlot: TimeSlot.noon },
    { weekday: Weekday.thu, timeSlot: TimeSlot.morning }, { weekday: Weekday.thu, timeSlot: TimeSlot.noon },
    { weekday: Weekday.fri, timeSlot: TimeSlot.morning }, { weekday: Weekday.fri, timeSlot: TimeSlot.noon },
    { weekday: Weekday.sat, timeSlot: TimeSlot.morning },
    { weekday: Weekday.sun, timeSlot: TimeSlot.morning },
  ];
  const allRefs = Array.from({ length: 96 }, (_, i) => `M${i + 1}`);
  const scheduleRows = allRefs.flatMap(ref =>
    weekdaySlots.map(slot => ({ servicerId: servicerByRef[ref], ...slot }))
  );
  await prisma.servicerSchedule.createMany({ data: scheduleRows });
  console.log('  ✓ servicer schedules (all 36: weekday morning+noon, weekend morning)');

  // ── Admin queue items ──
  // Several pending category requests so the review queue is realistic.
  const categoryRequestSeed = [
    { ref: 'M1', name: 'gardening & landscaping', desc: 'Lawn mowing, hedge trimming and garden upkeep.' },
    { ref: 'M4', name: 'pet grooming', desc: 'Mobile pet grooming - washing, trimming, nail clipping.' },
    { ref: 'M24', name: 'photography class', desc: 'Photography lessons - beginner to advanced.' },
    { ref: 'M32', name: 'game development', desc: 'Unity, Unreal Engine, and game design tutoring.' },
    { ref: 'M28', name: 'bartending class', desc: 'Mixology and bartending skills workshop.' },
    { ref: 'M29', name: 'yoga instruction', desc: 'Yoga and pilates private sessions.' },
  ];
  for (const cr of categoryRequestSeed) {
    await prisma.categoryRequest.create({
      data: {
        servicerId: servicerByRef[cr.ref],
        name: cr.name,
        description: cr.desc,
        status: 'pending',
      },
    });
  }

  // Several pending withdrawal requests.
  const withdrawalSeed = [
    { ref: 'M1', amount: 120, bank: 'CIMB', acct: '7022 8841 0099' },
    { ref: 'M2', amount: 350, bank: 'Maybank', acct: '5141 2233 4455' },
    { ref: 'M13', amount: 500, bank: 'CIMB', acct: '7022 8841 0222' },
    { ref: 'M14', amount: 200, bank: 'Hong Leong', acct: '1900 4422 7888' },
    { ref: 'M15', amount: 175, bank: 'Maybank', acct: '5141 2233 4488' },
    { ref: 'M32', amount: 300, bank: 'Public Bank', acct: '3162 5577 8832' },
  ];
  for (const w of withdrawalSeed) {
    await prisma.servicerWithdrawal.create({
      data: {
        servicerId: servicerByRef[w.ref],
        amount: w.amount,
        bankName: w.bank,
        bankAccount: w.acct,
        status: 'pending',
      },
    });
  }

  // Extra pending penalty appeals.
  const appealSeed = [
    { ref: 'M1', slug: 'plumber',             reason: 'Customer rescheduled by phone but the app was never updated.' },
    { ref: 'M17', slug: 'washing-machine-repair', reason: 'Severe flooding blocked the only access road that morning.' },
    { ref: 'M22', slug: 'ceiling-fan-repair', reason: 'Wrong address given; I waited 40 minutes at the listed unit.' },
  ];
  for (const ap of appealSeed) {
    const b = await makeBooking('C_FRESH', 'C_FRESH:0', ap.ref, ap.slug, 'cancelled', 'pay_later', 100);
    const pl = await prisma.penaltyLog.create({
      data: {
        bookingId: b.id,
        servicerId: servicerByRef[ap.ref],
        ruleId: penaltyRuleByType['noshow'],
        type: 'noshow',
        amountDeducted: 50,
      },
    });
    await prisma.penaltyAppeal.create({
      data: {
        penaltyLogId: pl.id,
        servicerId: servicerByRef[ap.ref],
        reason: ap.reason,
        status: 'pending',
      },
    });
  }

  await prisma.report.create({
    data: {
      bookingId: compM1.id,
      userId: customerByRef['C_LOYAL'],
      subject: 'Minor leftover mess after the job',
      description: 'The job was done but there was some debris left behind.',
      status: 'open',
    },
  });
  console.log(
    `  ✓ admin queue (${categoryRequestSeed.length} category requests, ` +
      `${withdrawalSeed.length} withdrawals, ${appealSeed.length + 1} pending appeals, 1 report)`,
  );

  // ── Chat session for Customer.loyal ──
  const chat = await prisma.chatSession.create({
    data: {
      userId: customerByRef['C_LOYAL'],
      contextType: 'general',
      difyConversationId: 'demo-convo-loyal-001',
    },
  });
  // Stagger timestamps so the conversation renders in order (GET /messages sorts by createdAt).
  const chatBase = Date.now() - 5 * 60_000;
  const at = (i: number) => new Date(chatBase + i * 1000);
  await prisma.chatMessage.createMany({
    data: [
      {
        sessionId: chat.id,
        role: 'user',
        content: 'How do I reorder the same cleaning service I used last time?',
        createdAt: at(0),
      },
      {
        sessionId: chat.id,
        role: 'assistant',
        content:
          "You can find your past bookings under Order History. Tap 'Rebook same servicer' to submit a new quote pre-filled with the same service details.",
        createdAt: at(1),
      },
      { sessionId: chat.id, role: 'user', content: 'Can I change the date when I rebook?', createdAt: at(2) },
      {
        sessionId: chat.id,
        role: 'assistant',
        content:
          'Yes - the form is pre-filled but fully editable. You can change the date, time slot, or any other detail before submitting.',
        createdAt: at(3),
      },
    ],
  });
  console.log('  ✓ AI chat history for Customer.loyal');

  // ── Historical platform revenue (last 30 days, for the admin revenue chart) ──
  // Simulate realistic daily platform-fee income so the chart is populated on
  // first boot. Amounts vary with a weekday/weekend pattern + some noise.
  const revenuePattern = [
    // day offset from today (-29 = oldest, 0 = today)
    // [dayOffset, ...amountsRM]
    [-29, 42.5, 28.0],
    [-28, 55.0],
    [-27, 18.0, 32.0, 22.5],
    [-26, 0],
    [-25, 0],
    [-24, 63.0, 45.0],
    [-23, 38.0, 29.5, 51.0],
    [-22, 72.0, 38.5],
    [-21, 55.0, 48.0, 33.0],
    [-20, 44.0, 62.5],
    [-19, 0],
    [-18, 0],
    [-17, 88.0, 54.0],
    [-16, 67.5, 41.0, 29.0],
    [-15, 95.0, 52.5],
    [-14, 78.0, 63.0, 44.5],
    [-13, 112.0, 67.0],
    [-12, 0],
    [-11, 14.0],
    [-10, 103.5, 88.0, 55.0],
    [-9, 92.0, 71.5, 48.0],
    [-8, 118.0, 84.5],
    [-7, 135.0, 96.0, 62.5],
    [-6, 149.0, 107.0],
    [-5, 0],
    [-4, 22.5],
    [-3, 158.0, 112.0, 74.5],
    [-2, 167.5, 128.0, 91.0],
    [-1, 143.0, 119.5, 85.0, 62.0],
    [0, 88.0, 54.5],
  ] as [number, ...number[]][];

  for (const [offset, ...amounts] of revenuePattern) {
    for (const amount of amounts) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(9 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
      await prisma.transaction.create({
        data: {
          type: 'platform_fee',
          amount,
          reference: 'Platform commission (seed)',
          createdAt: d,
        },
      });
    }
  }
  console.log('  ✓ 30-day historical platform revenue (chart seed data)');

  // ── Manifest ──
  const counts = {
    seededAt: new Date().toISOString(),
    deadlineOffsetMinutes: offset,
    categories: categories.length,
    servicers: servicers.length,
    customers: customers.length,
    adminId: admin.id,
  };
  writeFileSync(MANIFEST, JSON.stringify(counts, null, 2));
  console.log('\n✓ Seed complete. Demo password: ' + DEMO_PASSWORD + '  Admin PIN: ' + ADMIN_PIN);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
