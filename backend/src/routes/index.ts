import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { asyncHandler } from '../lib/async-handler';
import { badRequest, notFound } from '../lib/errors';
import { allowDemo, env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { checkPinCooldown, recordPinFailure, recordPinSuccess } from '../middleware/pin-cooldown';
import { runReseed, runClear, runClearContent, runClearFinance } from '../services/admin.service';
import { seedDemoQuote, seedDemoProposal } from '../services/quote.service';
import { emitToServicer, emitToServicers } from '../socket';
import { notify } from '../services/notification.service';
import { adjustCredit } from '../services/credit.service';
import { login, getCurrentPrincipal } from '../services/auth.service';
import { categoriesRouter } from './categories.routes';
import { quotesRouter } from './quotes.routes';
import { servicerRouter } from './servicer.routes';
import { userRouter } from './user.routes';
import { bookingsRouter } from './bookings.routes';
import { filesRouter } from './files.routes';
import { adminRouter } from './admin.routes';
// Admin rescue DISABLED 2026-06-03 - import preserved for re-enable
// import { adminRescueRouter } from './admin-rescue.routes';
import { llmKeysRouter } from './llm-keys.routes';
import { chatRouter } from './chat.routes';
import { authRouter } from './auth.routes';
import { servicersRouter } from './servicers.routes';
import { notificationsRouter } from './notifications.routes';
import { stripeRouter } from './stripe.routes';
import { rewardsRouter, customerRewardsRouter, adminRewardsRouter } from './rewards.routes';
import { pricingModuleRouter } from './pricing-module.routes';
import { servicerModuleRouter } from './servicer-module.routes';
import { servicerWaPresetRouter } from './servicer-wa-preset.routes';

/**
 * API v1 router. Domain routers are mounted here as each build phase lands.
 * Phase 1 ships the health check; Phases 2-4 add the feature routers.
 */
export const apiRouter = Router();

apiRouter.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, string> = {};
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = 'ok';
    } catch {
      checks.database = 'down';
    }
    try {
      await redis.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'down';
    }
    const healthy = Object.values(checks).every((v) => v === 'ok');
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  }),
);

/**
 * GET /config/public - public (non-sensitive) client-side configuration.
 * No auth required. Only returns values safe for browser exposure:
 * - googleClientId: OAuth client ID (embedded in the redirect URL, public by design)
 * - googleMapsApiKey: API key (should be referrer-restricted in GCP Console)
 */
apiRouter.get(
  '/config/public',
  asyncHandler(async (_req, res) => {
    const keys = [
      'condo_entry_note', 'chat_guest_auto_open', 'chat_guest_auto_open_delay',
      'chat_greetings', 'chat_greetings_returning', 'chat_greetings_customer',
      'chat_greetings_servicer', 'chat_greetings_admin',
      'demo_unlock_phrase', 'notification_sound_enabled',
    ];
    const rows = await prisma.platformSettings.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true },
    });
    const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      googleClientId: env.GOOGLE_CLIENT_ID,
      googleMapsApiKey: env.GOOGLE_MAPS_API_KEY,
      condoEntryNote: (byKey['condo_entry_note'] as string) ?? '',
      chatGuestAutoOpen: (byKey['chat_guest_auto_open'] as boolean) ?? true,
      chatGuestAutoOpenDelay: (byKey['chat_guest_auto_open_delay'] as number) ?? 3000,
      // Tiered greeting pools. Anonymous = chat_greetings; the rest fall back to it
      // when a tier is unset so behaviour never regresses.
      chatGreetings: (byKey['chat_greetings'] as string[]) ?? [],
      chatGreetingsReturning: (byKey['chat_greetings_returning'] as string[]) ?? [],
      chatGreetingsCustomer: (byKey['chat_greetings_customer'] as string[]) ?? [],
      chatGreetingsServicer: (byKey['chat_greetings_servicer'] as string[]) ?? [],
      chatGreetingsAdmin: (byKey['chat_greetings_admin'] as string[]) ?? [],
      // DB override (admin-editable) wins; otherwise the deploy-time env default.
      demoUnlockPhrase: (byKey['demo_unlock_phrase'] as string) || env.DEMO_UNLOCK_PHRASE,
      notificationSoundEnabled: (byKey['notification_sound_enabled'] as boolean) ?? true,
    });
  }),
);

/**
 * GET /config/demo-status - checks whether demo data exists in the database.
 * No auth required. Used by the frontend to decide whether to show the demo bar.
 */
apiRouter.get(
  '/config/demo-status',
  asyncHandler(async (_req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const demoUserCount = await prisma.user.count({ where: { isDemo: true, role: { not: 'admin' } } });
    const demoServicerCount = await prisma.servicer.count();
    res.json({ hasDemoData: demoUserCount > 0 || demoServicerCount > 0 });
  }),
);

/**
 * POST /config/demo-gate - verify the shared DEMO LOGIN-GATE PIN.
 *
 * This is the demo-only portal-entry speedbump shown by the route guard when a
 * demo account enters /admin, /servicer, or /customer. It is a FIXED shared PIN
 * (`DEMO_GATE_PIN`, default `5201314`) and is DISTINCT from the per-account
 * action PIN (`1234`, verified via /admin/verify-pin and /chat/verify-pin).
 * Auth required (the demo account is already logged in); only demo accounts may
 * use it.
 */
const DEMO_GATE_PIN = process.env.DEMO_GATE_PIN ?? '5201314';
apiRouter.post(
  '/config/demo-gate',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user?.isDemo) throw badRequest('The demo gate is only for demo accounts');
    await checkPinCooldown(req.user.id);

    const pin = String((req.body ?? {}).pin ?? '');
    if (pin !== DEMO_GATE_PIN) {
      await recordPinFailure(req.user.id);
      throw badRequest('Incorrect PIN');
    }
    await recordPinSuccess(req.user.id);
    res.json({ ok: true });
  }),
);

/**
 * GET /session - validate the caller's access token and return the current
 * principal, rebuilt fresh from the database.
 *
 * The frontend calls this once at startup so logged-in UI ("My portal", portal
 * routes) is NEVER shown on the strength of a cached localStorage principal
 * alone: a stale/forged token resolves to 401 here and the client logs out.
 * Deliberately mounted OUTSIDE `/auth` so the auth interceptor attaches the
 * Bearer token and performs its silent token-refresh on expiry.
 */
apiRouter.get(
  '/session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const principal = await getCurrentPrincipal(req.user!.kind, req.user!.id);
    const u: Record<string, unknown> = {
      id: principal.id,
      email: principal.email,
      name: principal.name,
      role: principal.role,
      creditBalance: principal.creditBalance,
      isDemo: principal.isDemo,
    };
    if (principal.depositBalance !== undefined) u['depositBalance'] = principal.depositBalance;
    if (principal.isOnline !== undefined) u['isOnline'] = principal.isOnline;
    if (principal.setupRequired !== undefined) u['setupRequired'] = principal.setupRequired;
    res.json({ user: u });
  }),
);

// ── Auth ─────────────────────────────────────────────────────────────────────
apiRouter.use('/auth', authRouter);

// ── Public postcode lookup ───────────────────────────────────────────────────
/**
 * GET /postcodes/lookup?q=47300 - public postcode-to-district+state lookup.
 * No auth required. Used by the address auto-fill on the quote form.
 */
apiRouter.get(
  '/postcodes/lookup',
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string || '').trim();
    if (!q) { res.json({ data: [] }); return; }
    const data = await prisma.postcode.findMany({
      where: {
        active: true,
        OR: [
          { postcode: { startsWith: q, mode: 'insensitive' } },
          { district: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { postcode: 'asc' },
      take: 20,
      select: { postcode: true, district: true, state: true },
    });
    res.json({ data });
  }),
);

// ── Phase 2 - Quote flow ─────────────────────────────────────────────────────
apiRouter.use('/user', userRouter);
apiRouter.use('/user', customerRewardsRouter);
apiRouter.use('/categories', categoriesRouter);
apiRouter.use('/quotes', quotesRouter);
apiRouter.use('/servicers', servicersRouter);
apiRouter.use('/servicer', servicerRouter);

// ── Pricing modules (servicer-owned catalog) ─────────────────────────────────
apiRouter.use('/servicer/pricing-modules', pricingModuleRouter);

// ── Servicer modules (SP-3 reusable priced item library) ─────────────────────
apiRouter.use('/servicer/modules', servicerModuleRouter);

// ── Servicer WhatsApp message presets (SP-3 dispatch) ─────────────────────────
apiRouter.use('/servicer/wa-presets', servicerWaPresetRouter);

// ── Phase 3 - Booking ────────────────────────────────────────────────────────
apiRouter.use('/bookings', bookingsRouter);
apiRouter.use('/files', filesRouter);

// ── Phase 4 - Admin + Chat ───────────────────────────────────────────────────
apiRouter.use('/admin', adminRouter);
apiRouter.use('/admin/llm-keys', llmKeysRouter);
apiRouter.use('/chat', chatRouter);

// ── Admin Rescue (Tier 2 + Tier 3) - DISABLED 2026-06-03 - not needed for demo
// apiRouter.use('/auth/admin', adminRescueRouter);

// ── Phase 5 - Rewards ────────────────────────────────────────────────────────
apiRouter.use('/rewards', rewardsRouter);
apiRouter.use('/admin', adminRewardsRouter);

// ── Notifications (role-agnostic) ────────────────────────────────────────────
apiRouter.use('/notifications', notificationsRouter);

// ── Stripe (payment gateway) ─────────────────────────────────────────────────
apiRouter.use('/stripe', stripeRouter);

/**
 * POST /dev/demo-login - instant login as a demo account by role or email.
 * Skips the rate limiter and lockout check for the known demo accounts.
 * Hard-blocked in production.
 *
 * Accepts either:
 *   { role: 'customer' | 'servicer' | 'admin' }  - maps to 3 canonical accounts
 *   { email: '...@demo.local' }                   - any seeded demo account
 *
 * Email is guarded to @demo.local domain only (BE-013 hardening).
 */
const DEMO_ACCOUNTS: Record<string, string> = {
  customer: 'customer.active@demo.local',
  servicer: 'servicer.1@demo.local',
  admin: 'admin@demo.local',
};
const DEMO_EMAIL_SUFFIX = '@demo.local';

apiRouter.post(
  '/dev/demo-login',
  asyncHandler(async (req, res) => {
    if (!allowDemo) throw badRequest('Demo login is disabled in production');
    const { role, email: rawEmail } = req.body ?? {};
    let email: string | undefined;

    if (rawEmail) {
      // Email-based login: restrict to @demo.local domain only
      if (typeof rawEmail !== 'string' || !rawEmail.endsWith(DEMO_EMAIL_SUFFIX)) {
        throw badRequest('Only demo accounts (@demo.local) can use demo login');
      }
      email = rawEmail;
    } else if (role) {
      email = DEMO_ACCOUNTS[role as string];
      if (!email) throw notFound(`No demo account for role "${role}"`);
    } else {
      throw badRequest('Provide either "role" or "email"');
    }

    const { user, tokens } = await login(email, 'Demo@2026');
    const u: Record<string, unknown> = { id: user.id, email: user.email, role: user.role, creditBalance: user.creditBalance, isDemo: user.isDemo };
    if (user.depositBalance !== undefined) u['depositBalance'] = user.depositBalance;
    res.json({
      user: u,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  }),
);

/**
 * POST /dev/reseed - wipe + reload demo data. A demo/development convenience
 * surfaced as a top-navbar button; any signed-in user may trigger it. It is
 * hard-blocked in production (runReseed throws when NODE_ENV=production).
 */
apiRouter.post(
  '/dev/reseed',
  requireAuth,
  asyncHandler(async (_req, res) => res.json(await runReseed())),
);

apiRouter.post(
  '/dev/clear',
  requireAuth,
  asyncHandler(async (_req, res) => res.json(await runClear())),
);

apiRouter.post(
  '/dev/clear-content',
  requireAuth,
  asyncHandler(async (req, res) => res.json(await runClearContent(req.body.pin ?? ''))),
);

apiRouter.post(
  '/dev/clear-finance',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const result = await runClearFinance();
    res.json(result);
  }),
);

/**
 * POST /dev/seed-quote - generates one demo open quote request (from a random
 * demo customer) so the servicer incoming-quotes feed can be shown live.
 * Development only.
 */
apiRouter.post(
  '/dev/seed-quote',
  requireAuth,
  asyncHandler(async (_req, res) => res.json(await seedDemoQuote())),
);

/**
 * POST /dev/seed-proposal - generates one demo servicer proposal for an open
 * quote request, so the customer's proposals feed can be shown filling up
 * live. When a customer triggers it, it targets one of their own open quotes.
 * Development only.
 */
apiRouter.post(
  '/dev/seed-proposal',
  requireAuth,
  asyncHandler(async (req, res) => {
    const isCustomer = req.user!.kind === 'user' && req.user!.role === 'customer';
    res.json(await seedDemoProposal({ userId: req.user!.id, ownQuotesOnly: isCustomer }));
  }),
);

/**
 * POST /dev/topup - instantly credits the signed-in account's balance. A
 * demo convenience behind the topbar "Top-Up" panel; works for customer and
 * servicer accounts (not admin) and is hard-blocked in production.
 */
apiRouter.post(
  '/dev/topup',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!allowDemo) throw badRequest('Demo top-up is disabled in production');
    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw badRequest('A positive top-up amount is required');
    }
    const u = req.user!;
    const isCustomer = u.kind === 'user' && u.role === 'customer';
    if (!isCustomer && u.kind !== 'servicer') {
      throw badRequest('Top-up is not available for this account type');
    }
    const balance = await adjustCredit(u.kind === 'servicer' ? 'servicer' : 'user', u.id, amount);
    res.json({ balance });
  }),
);

/**
 * POST /dev/random-order - creates a demo quote request for the signed-in
 * servicer from a random customer in a random category. The servicer must
 * manually send a proposal — nothing is auto-accepted. Development only.
 */

type QuestionSchemaItem = {
  key: string; label: string; type: string;
  priced?: boolean; active?: boolean; maxSelect?: number; minSelect?: number;
  showIf?: { questionKey: string; includesAny: string[] };
  options?: { value: string; label: string; active?: boolean }[];
};

function isQuestionVisible(q: QuestionSchemaItem, answers: Record<string, unknown>): boolean {
  if (!q.showIf) return true;
  const raw = answers[q.showIf.questionKey];
  if (raw === undefined || raw === null) return false;
  const selected = Array.isArray(raw) ? raw : [raw];
  return q.showIf.includesAny.some((v) => selected.includes(v));
}

function generateRandomServiceDetails(schema: QuestionSchemaItem[]): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  // Sort: questions without showIf first, then dependents (simple topological-ish).
  const ordered = [...schema].sort((a, b) => (a.showIf ? 1 : 0) - (b.showIf ? 1 : 0));
  for (const q of ordered) {
    if (q.active === false) continue;
    if (!isQuestionVisible(q, answers)) continue;
    const opts = (q.options ?? []).filter((o) => o.active !== false);
    if (opts.length === 0) continue;

    switch (q.type) {
      case 'radio': {
        const pick = opts[Math.floor(Math.random() * opts.length)];
        answers[q.key] = pick.value;
        break;
      }
      case 'checkbox': {
        const max = q.maxSelect ?? opts.length;
        const min = q.minSelect ?? 1;
        const count = min + Math.floor(Math.random() * (max - min + 1));
        const shuffled = [...opts].sort(() => Math.random() - 0.5);
        answers[q.key] = shuffled.slice(0, Math.min(count, shuffled.length)).map((o) => o.value);
        break;
      }
      case 'quantity': {
        const count = 1 + Math.floor(Math.random() * 3);
        const picks: Record<string, number> = {};
        const shuffled = [...opts].sort(() => Math.random() - 0.5).slice(0, Math.min(count, opts.length));
        for (const o of shuffled) picks[o.value] = 1 + Math.floor(Math.random() * 3);
        answers[q.key] = picks;
        break;
      }
      default:
        break;
    }
  }
  return answers;
}

const DEMO_CUSTOMER_EMAILS = [
  'sarah.lim2@demo.local', 'nurul.hafizah@demo.local', 'michael.lim@demo.local',
  'david.tan@demo.local', 'rashida.kamila@demo.local', 'jason.yeoh@demo.local',
  'priya.subramaniam@demo.local', 'tan.mei.ling@demo.local', 'rajan.krishnan@demo.local',
];
apiRouter.post(
  '/dev/random-order',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!allowDemo) throw badRequest('Demo orders are disabled in production');
    const u = req.user!;
    if (u.kind !== 'servicer') throw badRequest('Only servicer accounts can create demo orders');
    const servicerId = u.id;

    // Pick a random demo customer.
    const email = DEMO_CUSTOMER_EMAILS[Math.floor(Math.random() * DEMO_CUSTOMER_EMAILS.length)];
    const customer = await prisma.user.findFirst({ where: { email }, select: { id: true, name: true } });
    if (!customer) throw badRequest('Demo customer not found — run reseed first');

    // Get customer address.
    const addr = await prisma.userAddress.findFirst({ where: { userId: customer.id }, orderBy: { createdAt: 'asc' } });
    if (!addr) throw badRequest('Customer has no saved address');

    // Pick a random category from the servicer's listings, with question schema.
    const services = await prisma.servicerService.findMany({
      where: { servicerId },
      select: { id: true, categoryId: true, basePrice: true, category: { select: { name: true, questionSchema: true } } },
    });
    if (services.length === 0) throw badRequest('Servicer has no service listings');
    const svc = services[Math.floor(Math.random() * services.length)];
    const price = Number(svc.basePrice) || [60, 80, 100, 120, 150][Math.floor(Math.random() * 5)];

    const now = new Date();
    const deadline = new Date(now.getTime() + 60 * 60_000); // 1h from now

    // Generate random answers based on the category's question schema.
    const schema = (svc.category.questionSchema as QuestionSchemaItem[]) ?? [];
    const serviceDetails = schema.length > 0 ? generateRandomServiceDetails(schema) : undefined;

    // 1. Create quote request.
    const quote = await prisma.quoteRequest.create({
      data: {
        userId: customer.id,
        categoryId: svc.categoryId,
        addressId: addr.id,
        contactName: customer.name,
        contactNumber: '012-3456789',
        timeSlot: 'morning',
        preferredDate: new Date(now.getTime() + 2 * 86_400_000), // 2 days ahead
        budgetMin: price - 20,
        budgetMax: price + 80,
        paymentMode: 'pay_later',
        settlementMethod: 'cash',
        deadlineMode: 'fcfs',
        proposalDeadline: deadline,
        servicerDeadline: deadline,
        lat: addr.lat,
        lng: addr.lng,
        notes: 'Demo auto-generated order',
        serviceDetails: (serviceDetails as any) ?? undefined,
      },
    });

    // 2. Broadcast to the servicer.
    await prisma.quoteBroadcast.create({ data: { quoteRequestId: quote.id, servicerId } });

    // 3. Real-time socket event so the jobs page refreshes live.
    emitToServicer(servicerId, 'quote.new', { quoteId: quote.id, category: svc.category.name });

    // 4. In-app notification so the bell badge lights up.
    await notify({
      servicerId,
      type: 'jobs',
      message: `New ${svc.category.name} request from ${customer.name}`,
      linkUrl: `/servicer/jobs/pending`,
      category: svc.categoryId,
    });

    res.json({
      customer: customer.name,
      category: svc.category.name,
      price,
      quoteId: quote.id,
    });
  }),
);

/**
 * POST /dev/seed-accept-proposal - accepts one pending proposal from the
 * signed-in servicer (simulates the customer selecting it). Creates a
 * confirmed booking and emits real-time notifications. Development only.
 */
apiRouter.post(
  '/dev/seed-accept-proposal',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!allowDemo) throw badRequest('Demo actions are disabled in production');
    const u = req.user!;
    if (u.kind !== 'servicer') throw badRequest('Only servicer accounts can accept demo proposals');

    // Find one submitted (pending) proposal from this servicer.
    const proposal = await prisma.quoteProposal.findFirst({
      where: { servicerId: u.id, status: 'submitted' },
      orderBy: { createdAt: 'desc' },
    });
    if (!proposal) throw badRequest('No pending proposals found. Send a proposal first, then accept it.');

    // Load the quote request separately.
    const quote = await prisma.quoteRequest.findUnique({
      where: { id: proposal.quoteRequestId },
      include: {
        user: { select: { id: true, name: true } },
        category: { select: { name: true } },
      },
    });
    if (!quote) throw notFound('Quote not found');
    if (quote.status !== 'open') throw badRequest('The quote is no longer open for selection.');

    const now = new Date();
    const svc = await prisma.servicerService.findFirst({
      where: { servicerId: u.id, categoryId: quote.categoryId },
      select: { basePrice: true },
    });
    const price = Number(proposal.proposedPrice) || Number(svc?.basePrice) || 100;

    // 1. Select this proposal, reject others.
    await prisma.quoteProposal.update({ where: { id: proposal.id }, data: { status: 'selected' } });
    await prisma.quoteProposal.updateMany({
      where: { quoteRequestId: quote.id, id: { not: proposal.id } },
      data: { status: 'rejected' },
    });
    await prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: 'matched' } });

    // 2. Create confirmed booking.
    const sched = new Date(now.getTime() + 2 * 86_400_000);
    const lineItems = (proposal.lineItems as any[] | undefined)?.length
      ? (proposal.lineItems as any[])
      : [{ label: quote.category.name, amount: price, taxable: true, serviceChargeable: true }];

    const booking = await prisma.booking.create({
      data: {
        quoteRequestId: quote.id,
        proposalId: proposal.id,
        userId: quote.userId,
        servicerId: u.id,
        status: 'confirmed',
        price,
        paymentMode: 'pay_later' as any,
        lineItems,
        settlementMethod: 'cash',
        paymentTiming: 'pay_later' as any,
        scheduledDate: sched,
        timeSlot: quote.timeSlot,
        notes: 'Demo accepted proposal',
        confirmedAt: now,
      },
    });

    // 3. Socket event so the jobs page refreshes.
    emitToServicer(u.id, 'job.new', { bookingId: booking.id, quoteId: quote.id });

    // 4. Notify other servicers their proposals were rejected.
    const others = await prisma.quoteBroadcast.findMany({
      where: { quoteRequestId: quote.id, servicerId: { not: u.id } },
      select: { servicerId: true },
    });
    if (others.length > 0) {
      emitToServicers(others.map((o) => o.servicerId), 'quote.matched', { quoteId: quote.id });
    }

    // 5. In-app notification for the servicer.
    await notify({
      servicerId: u.id,
      type: 'jobs',
      message: `${quote.user.name} accepted your ${quote.category.name} proposal — RM ${price}`,
      linkUrl: `/servicer/jobs/active`,
      category: quote.categoryId,
    });

    res.status(201).json({
      customer: quote.user.name,
      category: quote.category.name,
      price,
      bookingId: booking.id,
      quoteId: quote.id,
    });
  }),
);

/**
 * POST /dev/points - awards 500 demo points to the signed-in customer.
 * Hard-blocked in production. Only for customer accounts.
 */
apiRouter.post(
  '/dev/points',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!allowDemo) throw badRequest('Demo points are disabled in production');
    const u = req.user!;
    if (u.kind !== 'user' || u.role !== 'customer') {
      throw badRequest('Demo points are only available for customer accounts');
    }
    const prev = await prisma.customerPoints.findUnique({ where: { userId: u.id } });
    const balance = (prev?.balance ?? 0) + 500;
    const lifetime = (prev?.lifetimeEarned ?? 0) + 500;
    await prisma.customerPoints.upsert({
      where: { userId: u.id },
      update: { balance, lifetimeEarned: lifetime },
      create: { userId: u.id, balance: 500, lifetimeEarned: 500 },
    });
    await prisma.pointsTransaction.create({
      data: { userId: u.id, type: 'earn_welcome', amount: 500, balance, note: '🎉 Demo: +500 free points.' },
    });
    res.json({ awarded: 500 });
  }),
);

/**
 * GET /search?q=... - global search across the signed-in user's data.
 * Returns matching items with label, type, icon, and the route to navigate to.
 */
apiRouter.get(
  '/search',
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = (req.query.q as string || '').trim().toLowerCase();
    if (q.length < 2) { res.json({ data: [] }); return; }

    const userId = req.user!.id;
    const role = req.user!.role;
    const results: { id: string; label: string; type: string; icon: string; route: string }[] = [];

    if (role === 'servicer') {
      const [services, jobs, invoices] = await Promise.all([
        prisma.servicerService.findMany({
          where: { servicerId: userId, title: { contains: q, mode: 'insensitive' } },
          take: 10,
        }),
        prisma.booking.findMany({
          where: { servicerId: userId },
          include: { quoteRequest: { include: { category: true } } },
          take: 10,
        }),
        prisma.invoice.findMany({
          where: { servicerId: userId, invoiceNumber: { contains: q, mode: 'insensitive' } },
          take: 5,
        }),
      ]);

      // Filter jobs by category name match locally (Prisma can't do nested contains easily)
      for (const j of jobs) {
        const cat = j.quoteRequest?.category?.name ?? '';
        if (cat.toLowerCase().includes(q)) {
          results.push({ id: j.id, label: `${cat} - RM${j.price}`, type: 'Job', icon: '🔧', route: `/servicer/jobs` });
        }
      }
      for (const s of services) {
        results.push({ id: s.id, label: s.title, type: 'Service', icon: '📋', route: `/servicer/services` });
      }
      for (const inv of invoices) {
        results.push({ id: inv.id, label: `${inv.invoiceNumber} - RM${inv.total}`, type: 'Invoice', icon: '🧾', route: `/servicer/invoices` });
      }
    } else if (role === 'customer') {
      const [quotes, bookings] = await Promise.all([
        prisma.quoteRequest.findMany({
          where: { userId },
          include: { category: true },
          take: 10,
        }),
        prisma.booking.findMany({
          where: { userId },
          include: { quoteRequest: { include: { category: true } } },
          take: 10,
        }),
      ]);
      for (const qr of quotes) {
        const cat = qr.category?.name ?? '';
        if (cat.toLowerCase().includes(q)) {
          results.push({ id: qr.id, label: `${cat} - RM${qr.budgetMin ?? '?'}-${qr.budgetMax ?? '?'}`, type: 'Quote', icon: '📄', route: `/customer/quotes` });
        }
      }
      for (const b of bookings) {
        const cat = b.quoteRequest?.category?.name ?? '';
        if (cat.toLowerCase().includes(q)) {
          results.push({ id: b.id, label: `${cat} - RM${b.price} (${b.status})`, type: 'Booking', icon: '📅', route: `/customer/bookings` });
        }
      }
    } else if (role === 'admin') {
      const [servicers] = await Promise.all([
        prisma.servicer.findMany({
          where: { businessName: { contains: q, mode: 'insensitive' } },
          take: 10,
        }),
      ]);
      for (const m of servicers) {
        results.push({ id: m.id, label: m.businessName ?? m.name, type: 'Servicer', icon: '🏪', route: `/admin/servicers` });
      }
    }

    res.json({ data: results.slice(0, 15) });
  }),
);
