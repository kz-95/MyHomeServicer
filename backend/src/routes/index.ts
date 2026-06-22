import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { asyncHandler } from '../lib/async-handler';
import { badRequest, notFound } from '../lib/errors';
import { allowDemo, env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { checkPinCooldown, recordPinFailure, recordPinSuccess } from '../middleware/pin-cooldown';
import { runReseed, runClear, runClearContent } from '../services/admin.service';
import { seedDemoQuote, seedDemoProposal } from '../services/quote.service';
import { adjustCredit } from '../services/credit.service';
import { login, getCurrentPrincipal } from '../services/auth.service';
import { categoriesRouter } from './categories.routes';
import { quotesRouter } from './quotes.routes';
import { servicerRouter } from './servicer.routes';
import { userRouter } from './user.routes';
import { bookingsRouter } from './bookings.routes';
import { filesRouter } from './files.routes';
import { adminRouter } from './admin.routes';
// Admin rescue DISABLED 2026-06-03 — import preserved for re-enable
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
 * GET /config/public — public (non-sensitive) client-side configuration.
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
      'demo_unlock_phrase',
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
    });
  }),
);

/**
 * GET /config/demo-status — checks whether demo data exists in the database.
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
 * POST /config/demo-gate — verify the shared DEMO LOGIN-GATE PIN.
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
 * GET /session — validate the caller's access token and return the current
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
 * GET /postcodes/lookup?q=47300 — public postcode-to-district+state lookup.
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

// ── Phase 2 — Quote flow ─────────────────────────────────────────────────────
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

// ── Phase 3 — Booking ────────────────────────────────────────────────────────
apiRouter.use('/bookings', bookingsRouter);
apiRouter.use('/files', filesRouter);

// ── Phase 4 — Admin + Chat ───────────────────────────────────────────────────
apiRouter.use('/admin', adminRouter);
apiRouter.use('/admin/llm-keys', llmKeysRouter);
apiRouter.use('/chat', chatRouter);

// ── Admin Rescue (Tier 2 + Tier 3) — DISABLED 2026-06-03 — not needed for demo
// apiRouter.use('/auth/admin', adminRescueRouter);

// ── Phase 5 — Rewards ────────────────────────────────────────────────────────
apiRouter.use('/rewards', rewardsRouter);
apiRouter.use('/admin', adminRewardsRouter);

// ── Notifications (role-agnostic) ────────────────────────────────────────────
apiRouter.use('/notifications', notificationsRouter);

// ── Stripe (payment gateway) ─────────────────────────────────────────────────
apiRouter.use('/stripe', stripeRouter);

/**
 * POST /dev/demo-login — instant login as a demo account by role.
 * Skips the rate limiter and lockout check for the known demo accounts.
 * Hard-blocked in production.
 */
const DEMO_ACCOUNTS: Record<string, string> = {
  customer: 'customer.active@demo.local',
  servicer: 'servicer.1@demo.local',
  admin: 'admin@demo.local',
};

apiRouter.post(
  '/dev/demo-login',
  asyncHandler(async (req, res) => {
    if (!allowDemo) throw badRequest('Demo login is disabled in production');
    const { role, email: directEmail } = req.body ?? {};
    const email = directEmail || DEMO_ACCOUNTS[role as string];
    if (!email) throw notFound(`No demo account for role "${role}"`);
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
 * POST /dev/reseed — wipe + reload demo data. A demo/development convenience
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

/**
 * POST /dev/seed-quote — generates one demo open quote request (from a random
 * demo customer) so the servicer incoming-quotes feed can be shown live.
 * Development only.
 */
apiRouter.post(
  '/dev/seed-quote',
  requireAuth,
  asyncHandler(async (_req, res) => res.json(await seedDemoQuote())),
);

/**
 * POST /dev/seed-proposal — generates one demo servicer proposal for an open
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
 * POST /dev/topup — instantly credits the signed-in account's balance. A
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
 * POST /dev/points — awards 500 demo points to the signed-in customer.
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
 * GET /search?q=... — global search across the signed-in user's data.
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
          results.push({ id: j.id, label: `${cat} — RM${j.price}`, type: 'Job', icon: '🔧', route: `/servicer/jobs` });
        }
      }
      for (const s of services) {
        results.push({ id: s.id, label: s.title, type: 'Service', icon: '📋', route: `/servicer/services` });
      }
      for (const inv of invoices) {
        results.push({ id: inv.id, label: `${inv.invoiceNumber} — RM${inv.total}`, type: 'Invoice', icon: '🧾', route: `/servicer/invoices` });
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
          results.push({ id: qr.id, label: `${cat} — RM${qr.budgetMin ?? '?'}-${qr.budgetMax ?? '?'}`, type: 'Quote', icon: '📄', route: `/customer/quotes` });
        }
      }
      for (const b of bookings) {
        const cat = b.quoteRequest?.category?.name ?? '';
        if (cat.toLowerCase().includes(q)) {
          results.push({ id: b.id, label: `${cat} — RM${b.price} (${b.status})`, type: 'Booking', icon: '📅', route: `/customer/bookings` });
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
