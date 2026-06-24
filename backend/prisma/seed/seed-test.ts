/**
 * Test Seed - lean, repeatable test data for dev iteration.
 *
 * 36-servicer structure (1 per child category, 6x 3D Modeling) with 9 lifecycle
 * test scenarios covering all booking statuses and payment modes.
 *
 * Usage: npm run seed:test
 */

import { createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';
import { clearAll } from './clear';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Demo@2026';
const ADMIN_PIN = '1234';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fixedUuid(seed: string): string {
  const h = createHash('md5').update(`homeservices:${seed}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

const minutes = (n: number) => new Date(Date.now() + n * 60_000);
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

// ── 7 parent categories ─────────────────────────────────────────────────────

const parentCategories = [
  { slug: 'cleaning-service', name: 'Cleaning Service', icon: 'sparkles' },
  { slug: 'events-weddings', name: 'Events', icon: 'party-popper' },
  { slug: 'home-improvement', name: 'Home Improvement', icon: 'hammer' },
  { slug: 'home-maintenance', name: 'Home Maintenance', icon: 'wrench' },
  { slug: 'appliance-repair', name: 'Electrical Appliance Repair', icon: 'zap' },
  { slug: 'training-classes', name: 'Training and Classes', icon: 'book' },
  { slug: 'tech-it', name: 'Tech & IT', icon: 'monitor' },
];

const airconQuestions: Prisma.InputJsonValue = [
  {
    key: 'aircon_service',
    label: 'Select type of aircon and type of cleaning',
    type: 'checkbox', required: true, priced: true,
    description: 'You can select more than one type of cleaning.',
    options: [
      { value: 'wall_chemical', label: 'Wall Unit - Chemical Cleaning (Recommended)' },
      { value: 'wall_general', label: 'Wall Unit - General Cleaning' },
      { value: 'wall_overhaul', label: 'Wall Unit - Overhaul Cleaning' },
      { value: 'cassette_general', label: 'Cassette / Ceiling Unit - General Cleaning' },
      { value: 'cassette_chemical', label: 'Cassette / Ceiling Unit - Chemical Cleaning' },
      { value: 'cassette_overhaul', label: 'Cassette / Ceiling Unit - Overhaul Cleaning' },
      { value: 'faulty_check', label: 'Check faulty aircon (please give details below)' },
    ],
  },
];

const childCategoryDefs: {
  parentSlug: string; slug: string; name: string; icon: string;
  price: number; duration: number; questions?: Prisma.InputJsonValue;
}[] = [
  // cleaning-service
  { parentSlug: 'cleaning-service', slug: 'home-cleaning', name: 'Home Cleaning',
    icon: 'sparkles', price: 60, duration: 120,
    questions: [{
      key: 'cleaning_option', label: 'Choose cleaning option', type: 'radio', required: true, priced: true,
      options: [
        { value: '1h_2c', label: '1 hour × 2 cleaners' },
        { value: '2h_2c', label: '2 hours × 2 cleaners' },
        { value: '3h_2c', label: '3 hours × 2 cleaners' },
        { value: '4h_2c', label: '4 hours × 2 cleaners' },
      ],
    }] as Prisma.InputJsonValue },
  { parentSlug: 'cleaning-service', slug: 'sofa-mattress-cleaning', name: 'Sofa / Mattress Cleaning', icon: 'sofa', price: 80, duration: 90 },
  { parentSlug: 'cleaning-service', slug: 'carpet-cleaning', name: 'Carpet Cleaning', icon: 'bubbles', price: 70, duration: 90 },
  { parentSlug: 'cleaning-service', slug: 'curtain-cleaning', name: 'Curtain Cleaning', icon: 'sun', price: 50, duration: 60 },
  // events-weddings
  { parentSlug: 'events-weddings', slug: 'event-planner', name: 'Event Planner',
    icon: 'party-popper', price: 1000, duration: 300,
    questions: [{
      key: 'event_for', label: 'What event is this for?', type: 'checkbox', required: true, priced: false,
      options: [
        { value: 'marriage_ceremony', label: 'Marriage ceremony' },
        { value: 'wedding_reception', label: 'Wedding reception' },
        { value: 'corporate_event', label: 'Corporate event' },
        { value: 'private_event', label: 'Private party' },
      ],
    }] as Prisma.InputJsonValue },
  { parentSlug: 'events-weddings', slug: 'catering', name: 'Catering Service',
    icon: 'chef-hat', price: 50, duration: 180,
    questions: [{
      key: 'halal', label: 'Halal or Non-Halal?', type: 'radio', required: true, priced: false,
      options: [{ value: 'halal', label: 'Halal' }, { value: 'non_halal', label: 'Non-Halal' }],
    }] as Prisma.InputJsonValue },
  // home-improvement
  { parentSlug: 'home-improvement', slug: 'professional-organizer', name: 'Professional Organizer', icon: 'layout', price: 80, duration: 120 },
  { parentSlug: 'home-improvement', slug: 'aircond-installer', name: 'Aircond Installer', icon: 'wind', price: 400, duration: 180 },
  { parentSlug: 'home-improvement', slug: 'carpenter', name: 'Carpenter', icon: 'hammer', price: 150, duration: 120 },
  { parentSlug: 'home-improvement', slug: 'renovation', name: 'Renovation', icon: 'hard-hat', price: 500, duration: 240 },
  { parentSlug: 'home-improvement', slug: 'interior-design', name: 'Interior Design', icon: 'paintbrush', price: 300, duration: 180 },
  { parentSlug: 'home-improvement', slug: 'door-gate', name: 'Door Gate', icon: 'door-open', price: 100, duration: 90 },
  { parentSlug: 'home-improvement', slug: 'roof', name: 'Roof', icon: 'home', price: 200, duration: 120 },
  // home-maintenance
  { parentSlug: 'home-maintenance', slug: 'aircond-servicer', name: 'Aircond Servicer', icon: 'snowflake', price: 100, duration: 60, questions: airconQuestions },
  { parentSlug: 'home-maintenance', slug: 'plumber', name: 'Plumber', icon: 'wrench', price: 80, duration: 90 },
  { parentSlug: 'home-maintenance', slug: 'electrical-wiring', name: 'Electrical & Wiring', icon: 'zap', price: 80, duration: 60 },
  // appliance-repair
  { parentSlug: 'appliance-repair', slug: 'washing-machine-repair', name: 'Washing Machine & Dryer Repair', icon: 'washing-machine', price: 80, duration: 60 },
  { parentSlug: 'appliance-repair', slug: 'refrigerator-repair', name: 'Refrigerator Repair', icon: 'thermometer', price: 80, duration: 60 },
  { parentSlug: 'appliance-repair', slug: 'tv-repair', name: 'TV Repair', icon: 'tv', price: 60, duration: 45 },
  { parentSlug: 'appliance-repair', slug: 'oven-repair', name: 'Oven Repair', icon: 'zap', price: 70, duration: 60 },
  { parentSlug: 'appliance-repair', slug: 'water-heater-repair', name: 'Water Heater Repair', icon: 'thermometer', price: 80, duration: 60 },
  { parentSlug: 'appliance-repair', slug: 'ceiling-fan-repair', name: 'Ceiling Fan Repair', icon: 'zap', price: 60, duration: 45 },
  { parentSlug: 'appliance-repair', slug: 'aircond-repair', name: 'Aircond Repair', icon: 'wrench', price: 80, duration: 60 },
  // training-classes
  { parentSlug: 'training-classes', slug: 'art-class', name: 'Art Class', icon: 'palette', price: 60, duration: 60 },
  { parentSlug: 'training-classes', slug: 'language-class', name: 'Language Class', icon: 'book', price: 60, duration: 60 },
  { parentSlug: 'training-classes', slug: 'music-class', name: 'Music Class', icon: 'music', price: 70, duration: 60 },
  { parentSlug: 'training-classes', slug: 'home-tutoring', name: 'Home Tutoring', icon: 'book', price: 60, duration: 60 },
  { parentSlug: 'training-classes', slug: 'cooking-class', name: 'Cooking Class', icon: 'chef-hat', price: 80, duration: 90 },
  { parentSlug: 'training-classes', slug: 'gym-trainer', name: 'Private Gym Trainer', icon: 'zap', price: 80, duration: 60 },
  { parentSlug: 'training-classes', slug: '3d-modeling-class', name: '3D Modeling Class', icon: 'monitor', price: 120, duration: 90 },
  // tech-it
  { parentSlug: 'tech-it', slug: 'alarm-cctv', name: 'Alarm & CCTV Services', icon: 'camera', price: 150, duration: 120 },
];

const platformSettings: { key: string; value: unknown }[] = [
  { key: 'minimum_servicer_charge', value: { amount: 30.0 } },
  { key: 'no_show_consecutive_threshold', value: { count: 3 } },
  { key: 'no_show_weekly_threshold', value: { count: 5 } },
  { key: 'servicer_deposit_minimum', value: { amount: 100.0 } },
  { key: 'servicer_credit_withdrawal_minimum', value: { amount: 50.0 } },
  { key: 'urgent_same_day_fee', value: { amount: 150, platform_share: 0.20 } },
  { key: 'quote_buffer_minutes', value: { minutes: 15 } },
  { key: 'sst_rate', value: { rate: 0.06 } },
  { key: 'noshow_grace_minutes', value: { minutes: 30 } },
  { key: 'no_response_discount', value: { discount_type: 'fixed', value: 10.0, expires_in_days: 14 } },
  { key: 'platform_fee_rate', value: { current_rate: 0.05 } },
  { key: 'servicer_proposal_preset_limit', value: { limit: 3 } },
];

const penaltyRules: { type: 'noshow' | 'cancel'; amount: number }[] = [
  { type: 'noshow', amount: 50.0 },
  { type: 'cancel', amount: 25.0 },
];

const featureFlags = [
  { key: 'bid_mode', name: 'Bid mode', enabled: false },
  { key: 'ai_chatbot', name: 'AI chatbot', enabled: true },
  { key: 'payment_gateway', name: 'Payment gateway', enabled: false },
  { key: 'reviews', name: 'Customer reviews', enabled: false },
  { key: 'servicer_kyc', name: 'Servicer KYC', enabled: false },
  { key: 'servicer_schedule', name: 'Servicer schedule', enabled: false },
];

const faqs: { category: string; question: string; answer: string; sortOrder: number; tier?: string }[] = [
  {
    category: 'general', sortOrder: 1,
    question: 'How does My Home Servicer work?',
    answer: 'My Home Servicer connects you with verified home-service professionals. (1) Browse services - pick a category and service type, describe your job, pick a date/time slot, set a budget, and answer any custom questions. (2) Receive proposals - nearby servicers review your request and send their price and message. (3) Choose a proposal - compare servicers by price, rating, and message, then tap to book. (4) Job done - the servicer arrives, completes the work, and you confirm.',
  },
  {
    category: 'general', sortOrder: 2,
    question: 'What areas does My Home Servicer cover?',
    answer: 'My Home Servicer currently covers Malaysia. Servicers specify the areas they serve. When you submit a quote request, only servicers who cover your address receive it.',
  },
  {
    category: 'bookings', sortOrder: 30,
    question: 'What do the booking statuses mean?',
    answer: 'pending_confirmation: not yet confirmed by servicer. confirmed: accepted and scheduled. in_progress: servicer has arrived and work is underway. completed: job done and invoice issued. cancelled: cancelled by you, servicer, or system.',
  },
  {
    category: 'payments', sortOrder: 40,
    question: 'What payment methods are supported?',
    answer: 'Two modes: Pay Later (pay servicer directly in cash after job done) and Pay Now (use prepaid credit wallet, funds held in escrow until completion, then released minus 5% platform fee).',
  },
  {
    category: 'servicer', sortOrder: 70,
    question: 'How do I register as a service provider?',
    answer: 'Tap "Join as Servicer" from the home page. Fill in your details (name, email, phone, service category). A security deposit (minimum RM100) is required.',
  },
  {
    category: 'servicer', sortOrder: 71,
    question: 'How do proposals work for servicers?',
    answer: 'When a customer submits a matching quote, it appears in your Incoming Quotes. Tap to see details (job description, area, budget, date, time slot). Submit a proposal with your price, duration, and message.',
  },
];

// ── Servicer definitions ─────────────────────────────────────────────────────

interface TestServicerData {
  ref: string; email: string; name: string; businessName: string;
  phone: string; categorySlug: string; area: string; serviceAreas: string[];
  rating: number; isCompany: boolean;
  lat?: number; lng?: number;
  services: { sku: string | null; title: string; basePrice: number; priceType: string; duration: number }[];
}

const testServicers: TestServicerData[] = [
  {
    ref: 'M1', email: 'ahmad.bin.ismail@demo.local',
    name: 'Ahmad Bin Ismail', businessName: 'Ahmad Plumbing Services',
    phone: '+60 12-300 0001',
    categorySlug: 'plumber',
    area: 'SS2, Petaling Jaya', serviceAreas: ['SS2', 'PJ', 'Petaling Jaya'],
    rating: 4.6, isCompany: false, lat: 3.08, lng: 101.65,
    services: [
      { sku: 'PLB-001', title: 'Leaking pipe repair', basePrice: 80, priceType: 'fixed', duration: 60 },
      { sku: 'PLB-002', title: 'Bathroom plumbing service', basePrice: 150, priceType: 'hourly', duration: 120 },
    ],
  },
  {
    ref: 'M2', email: 'kumar.selvam@demo.local',
    name: 'Kumar Selvam', businessName: 'CoolBreeze AC Service',
    phone: '+60 12-300 0002',
    categorySlug: 'aircond-servicer',
    area: 'Cheras, KL', serviceAreas: ['Cheras', 'KL'],
    rating: 4.4, isCompany: true, lat: 3.10, lng: 101.72,
    services: [
      { sku: 'CB-CLEAN', title: 'Aircon chemical wash', basePrice: 110, priceType: 'fixed', duration: 75 },
      { sku: 'CB-GAS', title: 'Gas top-up & leak check', basePrice: 160, priceType: 'fixed', duration: 90 },
    ],
  },
  {
    ref: 'M3', email: 'ravi.chandran@demo.local',
    name: 'Ravi Chandran', businessName: 'Volt Masters Electrical',
    phone: '+60 12-300 0003',
    categorySlug: 'electrical-wiring',
    area: 'Cheras, KL', serviceAreas: ['Cheras', 'KL'],
    rating: 4.5, isCompany: false, lat: 3.11, lng: 101.73,
    services: [
      { sku: 'EL-WIRE', title: 'Wiring & socket repair', basePrice: 80, priceType: 'fixed', duration: 60 },
      { sku: 'EL-LIGHT', title: 'Light & fan installation', basePrice: 65, priceType: 'fixed', duration: 45 },
    ],
  },
  {
    ref: 'M4', email: 'nurul.aini@demo.local',
    name: 'Nurul Aini', businessName: 'Sparkle Home Cleaning',
    phone: '+60 12-300 0004',
    categorySlug: 'home-cleaning',
    area: 'Bukit Bintang, KL', serviceAreas: ['Bukit Bintang', 'KLCC', 'KL'],
    rating: 4.5, isCompany: false, lat: 3.15, lng: 101.70,
    services: [
      { sku: 'CLN-STD', title: 'Standard home cleaning', basePrice: 60, priceType: 'hourly', duration: 120 },
      { sku: 'CLN-DEEP', title: 'Deep cleaning', basePrice: 140, priceType: 'fixed', duration: 240 },
    ],
  },
  {
    ref: 'M9', email: 'mei.ling2@demo.local',
    name: 'Mei Ling', businessName: 'Auntie Mei Catering',
    phone: '+60 12-300 0009',
    categorySlug: 'catering',
    area: 'Cyberjaya', serviceAreas: ['Cyberjaya', 'MMU', 'KL'],
    rating: 4.8, isCompany: false, lat: 2.99, lng: 101.65,
    services: [
      { sku: 'AM-DAILY', title: 'Daily meal set delivery', basePrice: 50, priceType: 'fixed', duration: 180 },
      { sku: 'AM-PARTY', title: 'Event catering service', basePrice: 200, priceType: 'quote', duration: 240 },
    ],
  },
  {
    ref: 'M27', email: 'aminah.yusof@demo.local',
    name: 'Aminah Yusof', businessName: 'BrightMinds Tutoring',
    phone: '+60 12-300 0027',
    categorySlug: 'home-tutoring',
    area: 'SS2, Petaling Jaya', serviceAreas: ['SS2', 'PJ', 'Petaling Jaya'],
    rating: 4.9, isCompany: false, lat: 3.07, lng: 101.64,
    services: [
      { sku: 'TU-HOME', title: 'Home tuition (all subjects)', basePrice: 60, priceType: 'hourly', duration: 60 },
    ],
  },
  {
    ref: 'M30', email: 'arvind.nair@demo.local',
    name: 'Arvind Nair', businessName: 'FusionCraft Studio (Fusion 360)',
    phone: '+60 12-300 0030',
    categorySlug: '3d-modeling-class',
    area: 'Cyberjaya', serviceAreas: ['Cyberjaya', 'Putrajaya', 'KL'],
    rating: 4.7, isCompany: false, lat: 3.00, lng: 101.66,
    services: [
      { sku: '3D-FUSION-PROD', title: 'Product design with Fusion 360', basePrice: 150, priceType: 'hourly', duration: 90 },
      { sku: '3D-FUSION-PRINT', title: '3D printing prep with Fusion 360', basePrice: 120, priceType: 'hourly', duration: 90 },
    ],
  },
  {
    ref: 'M8', email: 'grace.wong@demo.local',
    name: 'Grace Wong', businessName: 'Bliss Wedding & Events',
    phone: '+60 12-300 0008',
    categorySlug: 'event-planner',
    area: 'KLCC, KL', serviceAreas: ['KLCC', 'Bukit Bintang', 'KL'],
    rating: 4.8, isCompany: true, lat: 3.16, lng: 101.71,
    services: [
      { sku: 'WD-FULL', title: 'Full wedding planning', basePrice: 1000, priceType: 'quote', duration: 300 },
    ],
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n============================================');
  console.log('  Test Seed - 9 lifecycle scenarios');
  console.log('============================================\n');

  await clearAll(prisma);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const pinHash = await bcrypt.hash(ADMIN_PIN, 12);

  // ── Categories ──
  const parentIdBySlug: Record<string, string> = {};
  for (const p of parentCategories) {
    const cat = await prisma.category.upsert({
      where: { slug: p.slug },
      update: { name: p.name, icon: p.icon, defaultPriceSuggestion: 0, defaultEstimatedDurationMinutes: 60, published: true },
      create: { name: p.name, slug: p.slug, icon: p.icon, defaultPriceSuggestion: 0, defaultEstimatedDurationMinutes: 60, published: true },
    });
    parentIdBySlug[p.slug] = cat.id;
  }

  const childIdBySlug: Record<string, string> = {};
  for (const c of childCategoryDefs) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: {
        name: c.name, icon: c.icon, parentCategoryId: parentIdBySlug[c.parentSlug],
        defaultPriceSuggestion: c.price, defaultEstimatedDurationMinutes: c.duration,
        ...(c.questions ? { questionSchema: c.questions } : {}),
        published: true,
      },
      create: {
        name: c.name, slug: c.slug, icon: c.icon, parentCategoryId: parentIdBySlug[c.parentSlug],
        defaultPriceSuggestion: c.price, defaultEstimatedDurationMinutes: c.duration,
        ...(c.questions ? { questionSchema: c.questions } : {}),
        published: true,
      },
    });
    childIdBySlug[c.slug] = cat.id;
  }
  console.log(`  ✓ ${parentCategories.length} parent + ${childCategoryDefs.length} child categories`);

  // ── Budget ranges ──
  const budgetRanges: Record<string, { min: number; max: number | null }[]> = {};
  for (const slug of Object.keys(childIdBySlug)) {
    budgetRanges[childIdBySlug[slug]] = [
      { min: 50, max: 150 }, { min: 150, max: 300 }, { min: 300, max: 500 }, { min: 500, max: null },
    ];
  }
  await prisma.platformSettings.create({
    data: { key: 'budget_ranges', value: { ranges: budgetRanges } },
  });

  for (const s of platformSettings) {
    await prisma.platformSettings.create({ data: { key: s.key, value: s.value as object } });
  }
  for (const r of penaltyRules) {
    await prisma.penaltyRule.create({ data: { type: r.type, calcMode: 'fixed', amount: r.amount } });
  }
  for (const f of featureFlags) {
    await prisma.featureFlag.create({ data: { key: f.key, name: f.name, isEnabled: f.enabled } });
  }
  for (const k of faqs) {
    await prisma.faq.create({
      data: { question: k.question, answer: k.answer, category: k.category, tier: k.tier ?? 'guest', sortOrder: k.sortOrder },
    });
  }
  await prisma.platformMarketingBudget.create({
    data: { totalBudget: 5000, spentAmount: 0, periodStart: new Date('2026-01-01'), periodEnd: new Date('2026-12-31') },
  });
  console.log('  ✓ settings, penalties, flags, FAQs, marketing budget');

  // ── Admin ──
  await prisma.user.create({
    data: {
      id: fixedUuid('admin@demo.local'), role: 'admin',
      name: 'Amirah Syakirah', email: 'admin@demo.local', phone: '+60 3-0000 0000',
      passwordHash, actionPinHash: pinHash, isDemo: true,
    },
  });

  // ── Customer ──
  const customerId = fixedUuid('david.tan@demo.local');
  await prisma.user.create({
    data: {
      id: customerId, role: 'customer',
      name: 'David Tan', email: 'david.tan@demo.local', phone: '+60 11-234 5678',
      passwordHash, actionPinHash: pinHash, contactName: 'David Tan', contactNumber: '+60 11-234 5678', isDemo: true,
    },
  });
  const addressId = fixedUuid('addr:david.tan@demo.local:0');
  await prisma.userAddress.create({
    data: {
      id: addressId, userId: customerId, label: 'Home',
      address: 'Suite 8, KLCC Residences, KLCC, KL', propertyType: 'condo',
      isDefault: true, postcode: '50088', district: 'KLCC', state: 'Kuala Lumpur',
    },
  });
  await prisma.quotePreset.create({
    data: {
      userId: customerId, label: 'Home - myself',
      contactName: 'David Tan', contactNumber: '+60 11-234 5678',
      addressId, preferredTimeSlot: 'morning',
    },
  });
  console.log('  ✓ admin + customer (david.tan@demo.local / Demo@2026)');

  // ── Create all 8 servicers ──
  const servicerIds: Record<string, string> = {};
  for (const m of testServicers) {
    const id = fixedUuid(m.email);
    servicerIds[m.ref] = id;
    await prisma.servicer.create({
      data: {
        id, name: m.name, email: m.email, phone: m.phone, passwordHash, pinHash,
        businessName: m.businessName, bio: `${m.businessName} - based in ${m.area}.`,
        logoUrl: `https://picsum.photos/seed/servicer${m.ref}/200/200`,
        categoryId: childIdBySlug[m.categorySlug], isCompany: m.isCompany,
        serviceAreas: m.serviceAreas, lat: m.lat, lng: m.lng, rating: m.rating, isDemo: true,
      },
    });
    await prisma.servicerDeposit.create({
      data: { servicerId: id, totalDeposited: 500, currentBalance: 500, minimumRequired: 100 },
    });
    await prisma.servicerProposalPreset.create({
      data: {
        servicerId: id, name: 'Standard quote',
        message: `Thanks for considering ${m.businessName}. Happy to help with your job.`,
        priceOffset: 0, isDefault: true,
      },
    });
    for (const s of m.services) {
      await prisma.servicerService.create({
        data: {
          servicerId: id, categoryId: childIdBySlug[m.categorySlug],
          title: s.title, description: s.title, servicerSku: s.sku,
          basePrice: s.basePrice, priceType: s.priceType as 'fixed' | 'hourly' | 'quote',
          taxMode: 'none', estimatedDurationMinutes: s.duration,
        },
      });
    }
  }
  console.log(`  ✓ ${testServicers.length} servicers with services + deposits`);

  // ════════════════════════════════════════════════════════════════════════════
  //  9 Lifecycle Test Scenarios
  // ════════════════════════════════════════════════════════════════════════════

  let seqCounter = 1;

  // ── Scenario 1: Open plumber quote (pay_later) with 1 proposal ──
  {
    const quoteId = fixedUuid('scenario:1-open-plumber');
    await prisma.quoteRequest.create({
      data: {
        id: quoteId, userId: customerId, categoryId: childIdBySlug.plumber,
        addressId, contactName: 'David Tan', contactNumber: '+60 11-234 5678',
        timeSlot: 'morning', preferredDate: days(1),
        propertyType: 'condo', budgetMin: 80, budgetMax: 200,
        paymentMode: 'pay_later', deadlineMode: 'fixed_time',
        proposalDeadline: minutes(120), servicerDeadline: minutes(105), status: 'open',
      },
    });
    await prisma.quoteBroadcast.create({ data: { quoteRequestId: quoteId, servicerId: servicerIds.M1 } });
    await prisma.quoteProposal.create({
      data: {
        quoteRequestId: quoteId, servicerId: servicerIds.M1,
        proposedPrice: 100, message: 'Ahmad Plumbing can handle this - fast response guaranteed.', etaMinutes: 60,
      },
    });
    console.log('  [1/9] Open plumber quote (pay_later) + proposal');
  }

  // ── Scenario 2: Open aircond-servicer quote (pay_now) with auto-proposal ──
  {
    const quoteId = fixedUuid('scenario:2-open-aircond');
    await prisma.quoteRequest.create({
      data: {
        id: quoteId, userId: customerId, categoryId: childIdBySlug['aircond-servicer'],
        addressId, contactName: 'David Tan', contactNumber: '+60 11-234 5678',
        timeSlot: 'afternoon', preferredDate: days(2),
        propertyType: 'condo', budgetMin: 100, budgetMax: 300,
        paymentMode: 'pay_now', deadlineMode: 'fixed_time',
        proposalDeadline: minutes(120), servicerDeadline: minutes(105), status: 'open',
      },
    });
    await prisma.quoteBroadcast.create({ data: { quoteRequestId: quoteId, servicerId: servicerIds.M2 } });
    await prisma.quoteProposal.create({
      data: {
        quoteRequestId: quoteId, servicerId: servicerIds.M2,
        proposedPrice: 150, message: 'CoolBreeze - best AC chemical wash in Cheras.', etaMinutes: 90, isAuto: true,
      },
    });
    console.log('  [2/9] Open aircond quote (pay_now) + auto-proposal');
  }


  // ── Scenario 3: Booking confirmed (pay_now) - electrical-wiring M3 ──
  {
    const quoteId = fixedUuid('scenario:4-confirmed-electrical-quote');
    await prisma.quoteRequest.create({
      data: {
        id: quoteId, userId: customerId, categoryId: childIdBySlug['electrical-wiring'],
        addressId, contactName: 'David Tan', contactNumber: '+60 11-234 5678',
        timeSlot: 'afternoon', preferredDate: days(2),
        propertyType: 'condo', budgetMin: 60, budgetMax: 200,
        paymentMode: 'pay_now', deadlineMode: 'fixed_time',
        proposalDeadline: minutes(120), servicerDeadline: minutes(105), status: 'matched',
      },
    });
    const proposalId = fixedUuid('scenario:4-confirmed-electrical-proposal');
    await prisma.quoteProposal.create({
      data: {
        id: proposalId, quoteRequestId: quoteId, servicerId: servicerIds.M3,
        proposedPrice: 80, message: 'Volt Masters - safe and reliable.', etaMinutes: 60, status: 'selected',
      },
    });
    // confirmed booking - servicer confirmed but not yet arrived
    await prisma.booking.create({
      data: {
        id: fixedUuid('scenario:4-confirmed-electrical-booking'),
        quoteRequestId: quoteId, proposalId,
        userId: customerId, servicerId: servicerIds.M3,
        status: 'confirmed', price: 80, paymentMode: 'pay_now',
        scheduledDate: days(2), timeSlot: 'afternoon',
        confirmedAt: days(-1),
      },
    });
    console.log('  [3/8] Booking confirmed (electrical-wiring, pay_now)');
  }

  // ── Scenario 4: Booking in_progress (cash) - plumber M1 with arrive photo ──
  {
    const quoteId = fixedUuid('scenario:5-inprogress-plumber-quote');
    await prisma.quoteRequest.create({
      data: {
        id: quoteId, userId: customerId, categoryId: childIdBySlug.plumber,
        addressId, contactName: 'David Tan', contactNumber: '+60 11-234 5678',
        timeSlot: 'morning', preferredDate: days(-1),
        propertyType: 'condo', budgetMin: 80, budgetMax: 250,
        paymentMode: 'cash', deadlineMode: 'fixed_time',
        proposalDeadline: new Date(Date.now() - 2 * 86_400_000),
        servicerDeadline: new Date(Date.now() - 2 * 86_400_000 - 15 * 60_000),
        status: 'matched',
      },
    });
    const proposalId = fixedUuid('scenario:5-inprogress-plumber-proposal');
    await prisma.quoteProposal.create({
      data: {
        id: proposalId, quoteRequestId: quoteId, servicerId: servicerIds.M1,
        proposedPrice: 120, message: 'Ahmad Plumbing - on the way!', etaMinutes: 60, status: 'selected',
      },
    });
    await prisma.booking.create({
      data: {
        id: fixedUuid('scenario:5-inprogress-plumber-booking'),
        quoteRequestId: quoteId, proposalId,
        userId: customerId, servicerId: servicerIds.M1,
        status: 'in_progress', price: 120, paymentMode: 'cash',
        scheduledDate: days(-1), timeSlot: 'morning',
        confirmedAt: days(-2), arrivedAt: days(-1),
        arrivePhotoUrl: 'https://picsum.photos/seed/arriveM1/800/600',
      },
    });
    console.log('  [4/8] Booking in_progress (plumber, cash, arrived w/ photo)');
  }

  // ── Scenario 5: Booking completed (pay_later) + invoice + transaction - catering M9 ──
  {
    const quoteId = fixedUuid('scenario:6-completed-catering-quote');
    await prisma.quoteRequest.create({
      data: {
        id: quoteId, userId: customerId, categoryId: childIdBySlug.catering,
        addressId, contactName: 'David Tan', contactNumber: '+60 11-234 5678',
        timeSlot: 'noon', preferredDate: days(-3),
        propertyType: 'condo', budgetMin: 100, budgetMax: 400,
        paymentMode: 'pay_later', deadlineMode: 'fixed_time',
        proposalDeadline: new Date(Date.now() - 5 * 86_400_000),
        servicerDeadline: new Date(Date.now() - 5 * 86_400_000 - 15 * 60_000),
        status: 'matched',
      },
    });
    const proposalId = fixedUuid('scenario:6-completed-catering-proposal');
    await prisma.quoteProposal.create({
      data: {
        id: proposalId, quoteRequestId: quoteId, servicerId: servicerIds.M9,
        proposedPrice: 200, message: 'Auntie Mei Catering - homestyle goodness.', etaMinutes: 180, status: 'selected',
      },
    });
    const bookingId = fixedUuid('scenario:6-completed-catering-booking');
    await prisma.booking.create({
      data: {
        id: bookingId, quoteRequestId: quoteId, proposalId,
        userId: customerId, servicerId: servicerIds.M9,
        status: 'completed', price: 200, paymentMode: 'pay_later',
        scheduledDate: days(-3), timeSlot: 'noon',
        confirmedAt: days(-4), arrivedAt: days(-3),
        arrivePhotoUrl: 'https://picsum.photos/seed/arriveM9/800/600',
        doneAt: days(-3), donePhotoUrl: 'https://picsum.photos/seed/doneM9/800/600',
      },
    });
    const platFee1 = Math.round(200 * 0.08 * 100) / 100;
    await prisma.invoice.create({
      data: {
        id: fixedUuid('scenario:6-completed-catering-invoice'),
        bookingId, servicerId: servicerIds.M9,
        invoiceNumber: 'INV-TEST-0001', sequenceNumber: seqCounter++,
        subtotal: 200, promoDiscount: 0, taxRate: 0, taxAmount: 0, tipAmount: 0,
        platformFee: platFee1, total: 200,
        paidAt: days(-3), issuedAt: days(-3), createdAt: days(-3),
      },
    });
    await prisma.transaction.create({
      data: {
        type: 'escrow_release', amount: 200,
        servicerId: servicerIds.M9, bookingId,
        reference: 'Scenario 6 - completed catering (pay_later)',
        createdAt: days(-3),
      },
    });
    console.log('  [5/8] Booking completed (catering, pay_later, invoice + txn)');
  }

  // ── Scenario 6: Booking completed (pay_now) + invoice + escrow - home-tutoring M27 ──
  {
    const quoteId = fixedUuid('scenario:7-completed-tutoring-quote');
    await prisma.quoteRequest.create({
      data: {
        id: quoteId, userId: customerId, categoryId: childIdBySlug['home-tutoring'],
        addressId, contactName: 'David Tan', contactNumber: '+60 11-234 5678',
        timeSlot: 'evening', preferredDate: days(-4),
        propertyType: 'condo', budgetMin: 60, budgetMax: 150,
        paymentMode: 'pay_now', deadlineMode: 'fixed_time',
        proposalDeadline: new Date(Date.now() - 6 * 86_400_000),
        servicerDeadline: new Date(Date.now() - 6 * 86_400_000 - 15 * 60_000),
        status: 'matched',
      },
    });
    const proposalId = fixedUuid('scenario:7-completed-tutoring-proposal');
    await prisma.quoteProposal.create({
      data: {
        id: proposalId, quoteRequestId: quoteId, servicerId: servicerIds.M27,
        proposedPrice: 80, message: 'BrightMinds - making learning fun!', etaMinutes: 60, status: 'selected',
      },
    });
    const bookingId = fixedUuid('scenario:7-completed-tutoring-booking');
    await prisma.booking.create({
      data: {
        id: bookingId, quoteRequestId: quoteId, proposalId,
        userId: customerId, servicerId: servicerIds.M27,
        status: 'completed', price: 80, paymentMode: 'pay_now',
        scheduledDate: days(-4), timeSlot: 'evening',
        confirmedAt: days(-5), arrivedAt: days(-4),
        arrivePhotoUrl: 'https://picsum.photos/seed/arriveM27/800/600',
        doneAt: days(-4), donePhotoUrl: 'https://picsum.photos/seed/doneM27/800/600',
      },
    });
    // Escrow for pay_now booking
    await prisma.escrow.create({
      data: { bookingId, amount: 80, status: 'released', heldAt: days(-5), releasedAt: days(-4) },
    });
    const platFee2 = Math.round(80 * 0.08 * 100) / 100;
    await prisma.invoice.create({
      data: {
        id: fixedUuid('scenario:7-completed-tutoring-invoice'),
        bookingId, servicerId: servicerIds.M27,
        invoiceNumber: 'INV-TEST-0002', sequenceNumber: seqCounter++,
        subtotal: 80, promoDiscount: 0, taxRate: 0, taxAmount: 0, tipAmount: 0,
        platformFee: platFee2, total: 80,
        paidAt: days(-4), issuedAt: days(-4), createdAt: days(-4),
      },
    });
    await prisma.transaction.create({
      data: {
        type: 'escrow_release', amount: 80,
        servicerId: servicerIds.M27, bookingId,
        reference: 'Scenario 7 - completed tutoring (pay_now, escrow)',
        createdAt: days(-4),
      },
    });
    console.log('  [6/8] Booking completed (home-tutoring, pay_now, escrow release + invoice)');
  }

  // ── Scenario 7: Booking cancelled (pay_later) - 3d-modeling M30 ──
  {
    const quoteId = fixedUuid('scenario:8-cancelled-3d-quote');
    await prisma.quoteRequest.create({
      data: {
        id: quoteId, userId: customerId, categoryId: childIdBySlug['3d-modeling-class'],
        addressId, contactName: 'David Tan', contactNumber: '+60 11-234 5678',
        timeSlot: 'morning', preferredDate: days(-2),
        propertyType: 'condo', budgetMin: 100, budgetMax: 300,
        paymentMode: 'pay_later', deadlineMode: 'fixed_time',
        proposalDeadline: new Date(Date.now() - 4 * 86_400_000),
        servicerDeadline: new Date(Date.now() - 4 * 86_400_000 - 15 * 60_000),
        status: 'matched',
      },
    });
    const proposalId = fixedUuid('scenario:8-cancelled-3d-proposal');
    await prisma.quoteProposal.create({
      data: {
        id: proposalId, quoteRequestId: quoteId, servicerId: servicerIds.M30,
        proposedPrice: 150, message: 'FusionCraft - learn 3D modeling.', etaMinutes: 90, status: 'selected',
      },
    });
    await prisma.booking.create({
      data: {
        id: fixedUuid('scenario:8-cancelled-3d-booking'),
        quoteRequestId: quoteId, proposalId,
        userId: customerId, servicerId: servicerIds.M30,
        status: 'cancelled', price: 150, paymentMode: 'pay_later',
        scheduledDate: days(-2), timeSlot: 'morning',
        confirmedAt: days(-3),
        cancelledBy: 'customer', cancelReason: 'Change of plans - no longer needed.',
      },
    });
    console.log('  [7/8] Booking cancelled (3d-modeling, pay_later, customer cancel)');
  }

  // ── Scenario 8: Booking completed + cash_confirmed + cash payment - home-cleaning M4 ──
  {
    const quoteId = fixedUuid('scenario:9-cash-completed-cleaning-quote');
    await prisma.quoteRequest.create({
      data: {
        id: quoteId, userId: customerId, categoryId: childIdBySlug['home-cleaning'],
        addressId, contactName: 'David Tan', contactNumber: '+60 11-234 5678',
        timeSlot: 'morning', preferredDate: days(-5),
        propertyType: 'condo', budgetMin: 60, budgetMax: 200,
        paymentMode: 'cash', deadlineMode: 'fixed_time',
        proposalDeadline: new Date(Date.now() - 7 * 86_400_000),
        servicerDeadline: new Date(Date.now() - 7 * 86_400_000 - 15 * 60_000),
        status: 'matched',
      },
    });
    const proposalId = fixedUuid('scenario:9-cash-completed-cleaning-proposal');
    await prisma.quoteProposal.create({
      data: {
        id: proposalId, quoteRequestId: quoteId, servicerId: servicerIds.M4,
        proposedPrice: 140, message: 'Sparkle - deep cleaning expert.', etaMinutes: 240, status: 'selected',
      },
    });
    const bookingId = fixedUuid('scenario:9-cash-completed-cleaning-booking');
    await prisma.booking.create({
      data: {
        id: bookingId, quoteRequestId: quoteId, proposalId,
        userId: customerId, servicerId: servicerIds.M4,
        status: 'completed', price: 140, paymentMode: 'cash',
        scheduledDate: days(-5), timeSlot: 'morning',
        confirmedAt: days(-6), arrivedAt: days(-5),
        arrivePhotoUrl: 'https://picsum.photos/seed/arriveM4-cash/800/600',
        doneAt: days(-5), donePhotoUrl: 'https://picsum.photos/seed/doneM4-cash/800/600',
        cashConfirmed: true, cashConfirmedAt: days(-5),
      },
    });
    const platFee3 = Math.round(140 * 0.08 * 100) / 100;
    await prisma.invoice.create({
      data: {
        id: fixedUuid('scenario:9-cash-completed-cleaning-invoice'),
        bookingId, servicerId: servicerIds.M4,
        invoiceNumber: 'INV-TEST-0003', sequenceNumber: seqCounter++,
        subtotal: 140, promoDiscount: 0, taxRate: 0, taxAmount: 0, tipAmount: 0,
        platformFee: platFee3, total: 140,
        paidAt: days(-5), issuedAt: days(-5), createdAt: days(-5),
      },
    });
    await prisma.transaction.create({
      data: {
        type: 'escrow_release', amount: 140,
        servicerId: servicerIds.M4, bookingId,
        reference: 'Scenario 9 - completed cash cleaning (cash_confirmed)',
        createdAt: days(-5),
      },
    });
    console.log('  [8/8] Booking completed + cash_confirmed (home-cleaning, cash)');
  }

  console.log('\n============================================');
  console.log('  9/9 lifecycle scenarios seeded.');
  console.log('');
  console.log('  Accounts (password: Demo@2026):');
  console.log('    Admin:           admin@demo.local');
  console.log('    Customer:        david.tan@demo.local');
  console.log('    Plumber:         ahmad.bin.ismail@demo.local (M1)');
  console.log('    Aircond Servicer: kumar.selvam@demo.local (M2)');
  console.log('    Electrical Wiring: ravi.chandran@demo.local (M3)');
  console.log('    Home Cleaning:    nurul.aini@demo.local (M4)');
  console.log('    Event Planner:    grace.wong@demo.local (M8)');
  console.log('    Catering:        mei.ling2@demo.local (M9)');
  console.log('    Home Tutoring:   aminah.yusof@demo.local (M27)');
  console.log('    3D Modeling:     arvind.nair@demo.local (M30)');
  console.log('');
  console.log('  Scenarios:');
  console.log('    1. Open plumber quote (pay_later) + proposal');
  console.log('    2. Open aircond quote (pay_now) + auto-proposal');
  console.log('    3. Booking pending_confirm (home-cleaning, pay_later)');
  console.log('    4. Booking confirmed (electrical-wiring, pay_now)');
  console.log('    5. Booking in_progress (plumber, cash, arrived)');
  console.log('    6. Booking completed (catering, pay_later, invoice + txn)');
  console.log('    7. Booking completed (home-tutoring, pay_now, escrow + invoice)');
  console.log('    8. Booking cancelled (3d-modeling, pay_later, customer cancel)');
  console.log('    9. Booking completed cash_confirmed (home-cleaning, cash)');
  console.log('============================================\n');
}

main()
  .catch((e) => {
    console.error('Test seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
