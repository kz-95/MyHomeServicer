import { Router } from 'express';
import { body, param, query } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { writeFile, mkdir } from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { chatLimiter, chatDailyLimiter } from '../middleware/rate-limit';
import { notFound, forbidden } from '../lib/errors';
import { sendToAi } from '../services/chat.service';
import { checkInjection } from '../services/chatGuard';
import { recordAudit } from '../services/ledger.service';
import { createBugReport } from '../services/booking.service';
import { validateAddress, reverseGeocode } from '../lib/geocoding';
import { verifyPin } from '../middleware/pin';
import { badRequest } from '../lib/errors';
import { updateMerchantProfile } from '../services/servicer-account.service';

/** In-memory IP-based strike tracking for injection detection (guest + auth). */
const ipStrikes = new Map<string, { count: number; bannedUntil: number | null }>();
const STRIKE_LIMIT = 3;
const BAN_DURATION_MS = 24 * 60 * 60_000; // 24h

/** AI chatbot endpoints (Gemini → DeepSeek → local fallback). */
export const chatRouter = Router();

/** GET /chat/faq — public FAQ list. */
chatRouter.get(
  '/faq',
  asyncHandler(async (_req, res) => {
    const data = await prisma.faq.findMany({
      where: { isPublished: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ data });
  }),
);

/** 10 / min / IP — guest chat rate limit. */
const guestChatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down and try again later.' },
    });
  },
});

/**
 * POST /chat/guest — guest chat (no auth). Stateless: client sends history,
 * server responds via AI and does not persist anything. Rate limited by IP
 * and protected against prompt injection with a 3-strike temporary ban.
 */
chatRouter.post(
  '/guest',
  guestChatLimiter,
  validate([
    body('message').isString().trim().isLength({ min: 1, max: 2000 }),
    body('history').optional().isArray(),
    body('role').optional().isIn(['guest', 'customer', 'servicer', 'admin']),
    body('categoryLocked').optional().isBoolean(),
    body('collected').optional().isArray(),
    body('formAssist').optional().isBoolean(),
    body('formContext').optional().isObject(),
  ]),
  asyncHandler(async (req, res) => {
    const ip = req.ip ?? 'unknown';

    const ipBan = ipStrikes.get(ip);
    if (ipBan?.bannedUntil && Date.now() < ipBan.bannedUntil) {
      throw forbidden('Your chat access has been temporarily suspended due to repeated policy violations.');
    }
    if (ipBan?.bannedUntil && Date.now() >= ipBan.bannedUntil) {
      ipStrikes.delete(ip);
    }

    const message = req.body.message as string;

    const injection = checkInjection(message);
    if (injection.flagged) {
      const entry = ipStrikes.get(ip) ?? { count: 0, bannedUntil: null };
      entry.count += 1;
      if (entry.count >= STRIKE_LIMIT) {
        entry.bannedUntil = Date.now() + BAN_DURATION_MS;
        ipStrikes.set(ip, entry);
        throw forbidden('Your chat access has been temporarily suspended due to repeated policy violations.');
      }
      ipStrikes.set(ip, entry);
      const left = STRIKE_LIMIT - entry.count;
      throw forbidden(
        `We have detected an attempt to interfere with the assistant. ` +
        `This is warning ${entry.count} of ${STRIKE_LIMIT}. ${left} more will result in a temporary ban.`,
      );
    }

    const raw = (req.body.history ?? []) as Array<{ role: string; content: string }>;
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = raw
      .filter((h): h is { role: 'user' | 'assistant'; content: string } => h.role === 'user' || h.role === 'assistant')
      .slice(-20);

    const role = (req.body.role as string) || 'guest';
    const reply = await sendToAi(message, history, role, undefined, {
      suppressCategorySuggest: req.body.categoryLocked === true,
      collected: Array.isArray(req.body.collected) ? (req.body.collected as string[]) : [],
      categoryId: typeof req.body.categoryId === 'string' ? req.body.categoryId : undefined,
      answeredQuestions: Array.isArray(req.body.answeredQuestions) ? (req.body.answeredQuestions as string[]) : [],
      formAssist: req.body.formAssist === true,
      formContext: sanitizeFormContext(req.body.formContext),
    });
    res.json({
      reply: reply.answer,
      createdAt: new Date().toISOString(),
      ...(reply.actionBlocks ? { actionBlocks: reply.actionBlocks } : {}),
    });
  }),
);

/**
 * POST /chat/qa-log — persist an automated-QA transcript to <repo-root>/logs/.
 *
 * DEV/QA ONLY: registered exclusively when NODE_ENV !== 'production', so it never
 * exists on the live server (the chat QA button is likewise dev-build only). The
 * client-side QA PIN is a UX gate, NOT auth — the real protection is this env guard.
 * The name is hard-sanitised to a filename token and the extension is forced to .log,
 * so the write stays inside logs/; writes are exclusive ('wx') with a random suffix on
 * collision, so a client-supplied name can never overwrite an existing log.
 */
if (process.env.NODE_ENV !== 'production') {
  chatRouter.post(
    '/qa-log',
    guestChatLimiter,
    validate([
      body('name').isString().matches(/^[A-Za-z0-9_-]{1,64}$/),
      body('content').isString().isLength({ min: 1, max: 5_000_000 }),
    ]),
    asyncHandler(async (req, res) => {
      const name = (req.body.name as string).replace(/[^A-Za-z0-9_-]/g, '');
      const content = req.body.content as string;
      // The server runs from backend/; logs/ lives at the repo root one level up. If
      // launched from the repo root instead, use that directly.
      const cwd = process.cwd();
      const repoRoot = cwd.endsWith(`${path.sep}backend`) ? path.resolve(cwd, '..') : cwd;
      const logsDir = path.join(repoRoot, 'logs');
      await mkdir(logsDir, { recursive: true });
      // Exclusive write — never truncate an existing log; add a random suffix on collision.
      let file = path.join(logsDir, `${name}.log`);
      try {
        await writeFile(file, content, { encoding: 'utf8', flag: 'wx' });
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'EEXIST') {
          file = path.join(logsDir, `${name}_${randomUUID().slice(0, 8)}.log`);
          await writeFile(file, content, { encoding: 'utf8', flag: 'wx' });
        } else {
          throw e;
        }
      }
      res.json({ ok: true, file: path.relative(repoRoot, file).split(path.sep).join('/') });
    }),
  );
}

/**
 * POST /chat/validate-address — validate an address using Google Geocoding API.
 * Returns whether the address is recognised and the canonical formatted version.
 */
chatRouter.post(
  '/validate-address',
  validate([
    body('address').isString().trim().isLength({ min: 3, max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    const address = req.body.address as string;
    const result = await validateAddress(address);
    res.json(result);
  }),
);

/**
 * POST /chat/reverse-geocode — resolve a browser GPS lat/lng to a formatted
 * address. Lets the chat widget's "use my current location" button fill the
 * address for users who don't know their exact address. Public (pre-auth),
 * same as validate-address.
 */
chatRouter.post(
  '/reverse-geocode',
  validate([
    body('lat').isFloat({ min: -90, max: 90 }),
    body('lng').isFloat({ min: -180, max: 180 }),
  ]),
  asyncHandler(async (req, res) => {
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const result = await reverseGeocode(lat, lng);
    res.json(result);
  }),
);

// Everything below requires an authenticated user (customer, admin, or servicer).
chatRouter.use(requireAuth);

/** Rate limiter: 5 requests/15 min for PIN and profile ops. */
const chatPinLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many PIN attempts. Please slow down.' },
    });
  },
});

/**
 * POST /chat/verify-pin — verify an action PIN (admin or servicer).
 * Returns `{ ok: true }` on success. Used by the PinService dialog.
 */
chatRouter.post(
  '/verify-pin',
  chatPinLimiter,
  validate([body('pin').isString().isLength({ min: 4, max: 10 })]),
  asyncHandler(async (req, res) => {
    const { pin } = req.body as { pin: string };
    let ok = false;

    if (req.user!.role === 'admin' || req.user!.role === 'customer') {
      // Admin and customer are both User rows; the action PIN lives on
      // User.actionPinHash. (Customer PIN gate is used for the demo.)
      const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (user?.actionPinHash) {
        const bcrypt = await import('bcryptjs');
        ok = await bcrypt.compare(pin, user.actionPinHash);
      }
    } else if (req.user!.role === 'servicer') {
      const servicer = await prisma.servicer.findUnique({ where: { id: req.user!.id } });
      if (servicer) {
        ok = await verifyPin(servicer, pin);
      }
    }

    if (!ok) throw badRequest('Incorrect PIN');
    res.json({ ok: true });
  }),
);

/**
 * POST /chat/apply-profile — apply a profile field change.
 * PIN-authenticated: verifies the raw PIN against the user's stored hash.
 * Works for admins (User.actionPinHash) and servicers (Servicer.pinHash).
 * Currently supports servicer profile fields (bio, serviceAreas, etc.).
 */
chatRouter.post(
  '/apply-profile',
  chatPinLimiter,
  validate([
    body('pin').isString().notEmpty(),
    body('field').isString().notEmpty(),
    body('value').optional(),
  ]),
  asyncHandler(async (req, res) => {
    const { pin, field, value } = req.body as { pin: string; field: string; value: unknown };

    if (req.user!.role === 'servicer') {
      const servicer = await prisma.servicer.findUnique({ where: { id: req.user!.id } });
      if (!servicer) throw notFound('Servicer not found');
      const ok = await verifyPin(servicer, pin);
      if (!ok) throw badRequest('Incorrect PIN');

      if (field === 'serviceAreas' && !Array.isArray(value)) {
        throw badRequest('serviceAreas must be an array');
      }

      await updateMerchantProfile(req.user!.id, { [field]: value });
      res.json({ ok: true, message: `${field} updated` });
    } else if (req.user!.role === 'admin') {
      const admin = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!admin?.actionPinHash) throw badRequest('No action PIN configured');
      const bcrypt = await import('bcryptjs');
      const ok = await bcrypt.compare(pin, admin.actionPinHash);
      if (!ok) throw badRequest('Incorrect PIN');

      if (!req.body.merchantId) throw badRequest('merchantId required for admin');

      if (field === 'serviceAreas' && !Array.isArray(value)) {
        throw badRequest('serviceAreas must be an array');
      }

      await updateMerchantProfile(req.body.merchantId, { [field]: value });
      res.json({ ok: true, message: `${field} updated` });
    } else {
      throw forbidden('PIN-gated profile editing requires servicer or admin role');
    }
  }),
);

/** GET /chat/sessions — the customer's chat sessions (latest 50). */
chatRouter.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const data = await prisma.chatSession.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    res.json({ data });
  }),
);

/** POST /chat/session — start a chat session. */
chatRouter.post(
  '/session',
  validate([
    body('contextType').isIn(['general', 'booking_support', 'quote_help']),
    body('contextId').optional({ nullable: true }).isUUID(),
  ]),
  asyncHandler(async (req, res) => {
    const session = await prisma.chatSession.create({
      data: {
        userId: req.user!.id,
        contextType: req.body.contextType,
        contextId: req.body.contextId ?? null,
      },
    });
    res.status(201).json({ sessionId: session.id });
  }),
);

/** GET /chat/session/:id/messages — conversation history (cursor-paginated). */
chatRouter.get(
  '/session/:id/messages',
  validate([
    param('id').isUUID(),
    query('before').optional().isUUID(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ]),
  asyncHandler(async (req, res) => {
    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!session) throw notFound('Chat session not found');

    const limit = parseInt(req.query.limit as string, 10) || 20;
    const where: Record<string, unknown> = { sessionId: session.id };

    if (req.query.before) {
      const cursor = await prisma.chatMessage.findUnique({
        where: { id: req.query.before as string },
        select: { sessionId: true, createdAt: true },
      });
      if (cursor) {
        if (cursor.sessionId !== session.id) {
          where.createdAt = { lt: session.updatedAt };
        } else {
          where.createdAt = { lt: cursor.createdAt };
        }
      }
    }

    const data = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: { id: true, role: true, content: true, createdAt: true },
    });

    const hasMore = data.length > limit;
    if (hasMore) data.pop();
    data.reverse();

    // Count unread assistant messages since last read
    let unreadCount = 0;
    if (session.lastReadAt) {
      unreadCount = await prisma.chatMessage.count({
        where: {
          sessionId: session.id,
          role: 'assistant',
          createdAt: { gt: session.lastReadAt },
        },
      });
    } else {
      unreadCount = await prisma.chatMessage.count({
        where: { sessionId: session.id, role: 'assistant' },
      });
    }

    // Mark session as read
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { lastReadAt: new Date() },
    });

    res.json({ data, hasMore, unreadCount: Math.min(unreadCount, 99) });
  }),
);

/** DELETE /chat/session/:id/messages — clear all messages in a session. */
chatRouter.delete(
  '/session/:id/messages',
  validate([param('id').isUUID()]),
  asyncHandler(async (req, res) => {
    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!session) throw notFound('Chat session not found');
    await prisma.chatMessage.deleteMany({ where: { sessionId: session.id } });
    res.status(204).send();
  }),
);

/**
 * POST /chat/session/:id/message — send a message to the AI.
 * Heavily rate limited (security-notes.md §3 Layer 6): 20/10min + 100/day.
 */
chatRouter.post(
  '/session/:id/message',
  chatLimiter,
  chatDailyLimiter,
  validate([
    param('id').isUUID(),
    body('message').isString().trim().isLength({ min: 1, max: 2000 }),
    body('categoryLocked').optional().isBoolean(),
    body('collected').optional().isArray(),
  ]),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { chatBanned: true, chatStrikeCount: true },
    });
    if (!user) throw notFound('User not found');

    const ip = req.ip ?? 'unknown';

    const ipBan = ipStrikes.get(ip);
    if (ipBan?.bannedUntil && Date.now() < ipBan.bannedUntil) {
      throw forbidden('Your chat access has been temporarily suspended due to repeated policy violations.');
    }
    if (ipBan?.bannedUntil && Date.now() >= ipBan.bannedUntil) {
      ipStrikes.delete(ip);
    }

    if (user.chatBanned) {
      throw forbidden(
        'Your chat access has been suspended due to repeated policy violations. ' +
        'You may request a review by sending a message explaining why you believe the suspension should be lifted.',
      );
    }

    const session = await prisma.chatSession.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
    });
    if (!session) throw notFound('Chat session not found');

    const message = req.body.message as string;

    const injection = checkInjection(message);
    if (injection.flagged) {
      const ipEntry = ipStrikes.get(ip) ?? { count: 0, bannedUntil: null };
      ipEntry.count += 1;
      if (ipEntry.count >= STRIKE_LIMIT) {
        ipEntry.bannedUntil = Date.now() + BAN_DURATION_MS;
        ipStrikes.set(ip, ipEntry);
      } else {
        ipStrikes.set(ip, ipEntry);
      }

      const newCount = user.chatStrikeCount + 1;
      if (newCount >= 3) {
        await prisma.user.update({
          where: { id: req.user!.id },
          data: { chatBanned: true, chatStrikeCount: newCount },
        });
        const msg = ipEntry.bannedUntil
          ? 'Your chat access has been suspended due to repeated policy violations.'
          : 'Your chat access has been suspended due to repeated policy violations. ' +
            'You may request a review by sending a message explaining why you believe the suspension should be lifted.';
        throw forbidden(msg);
      }
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { chatStrikeCount: newCount },
      });
      const left = 3 - newCount;
      throw forbidden(
        `We have detected an attempt to interfere with the assistant. ` +
        `This is warning ${newCount} of 3. ${left} more will result in a chat suspension.`,
      );
    }

    await prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: message },
    });

    // Keep only the latest 50 messages per session.
    const excess = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      skip: 50,
      select: { id: true },
    });
    if (excess.length > 0) {
      await prisma.chatMessage.deleteMany({
        where: { id: { in: excess.map((m) => m.id) } },
      });
    }

    const lastMessages = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { role: true, content: true },
    });

    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const m of lastMessages.slice(0, -1)) {
      if (m.role === 'user' || m.role === 'assistant') {
        history.push({ role: m.role, content: m.content });
      }
    }

    const reply = await sendToAi(message, history, req.user!.role, req.user!.id, {
      suppressCategorySuggest: req.body.categoryLocked === true,
      collected: Array.isArray(req.body.collected) ? (req.body.collected as string[]) : [],
      categoryId: typeof req.body.categoryId === 'string' ? req.body.categoryId : undefined,
      answeredQuestions: Array.isArray(req.body.answeredQuestions) ? (req.body.answeredQuestions as string[]) : [],
      formAssist: req.body.formAssist === true,
      formContext: sanitizeFormContext(req.body.formContext),
    });

    const assistantMsg = await prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'assistant',
        content: reply.answer,
        tokensUsed: reply.tokensUsed,
      },
    });

    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'customer',
      action: 'chat.message',
      entityType: 'ChatSession',
      entityId: session.id,
      newValue: { tokensUsed: reply.tokensUsed },
    });

    const actions = detectActions(reply.answer);
    res.json({
      reply: reply.answer,
      messageId: assistantMsg.id,
      createdAt: assistantMsg.createdAt.toISOString(),
      actions: actions.length ? actions : undefined,
      ...(reply.actionBlocks ? { actionBlocks: reply.actionBlocks } : undefined),
    });
  }),
);

/** POST /chat/report-bug — file a bug report from the chat. */
chatRouter.post(
  '/report-bug',
  validate([
    body('subject').isString().trim().isLength({ min: 1, max: 200 }),
    body('description').isString().trim().isLength({ min: 1, max: 2000 }),
  ]),
  asyncHandler(async (req, res) => {
    const report = await createBugReport(
      req.user!.id,
      req.body.subject,
      req.body.description,
    );
    res.status(201).json(report);
  }),
);

/** POST /chat/unban-request — banned user requests review. */
chatRouter.post(
  '/unban-request',
  validate([body('reason').isString().trim().isLength({ min: 10, max: 2000 })]),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { chatBanned: true, name: true, email: true },
    });
    if (!user) throw notFound('User not found');

    if (!user.chatBanned) {
      res.json({ message: 'Your chat access is not suspended.' });
      return;
    }

    await recordAudit({
      actorUserId: req.user!.id,
      actorType: 'customer',
      action: 'chat.unban_request',
      entityType: 'User',
      entityId: req.user!.id,
      newValue: { reason: req.body.reason },
    });

    res.json({
      message:
        'Your request has been logged for admin review. The support team will review it and restore your access if appropriate. This may take up to 48 hours.',
    });
  }),
);

/** Scan the AI reply for keywords and surface relevant action buttons. */
/** Coerce an untrusted formContext body into the shape sendToAi expects. */
function sanitizeFormContext(
  raw: unknown,
): { step: number; stepName: string; categoryName?: string; filled: string[]; missing: string[] } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const toStrArr = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  return {
    step: typeof o.step === 'number' ? o.step : 0,
    stepName: typeof o.stepName === 'string' ? o.stepName.slice(0, 40) : '',
    categoryName: typeof o.categoryName === 'string' ? o.categoryName.slice(0, 120) : undefined,
    filled: toStrArr(o.filled),
    missing: toStrArr(o.missing),
  };
}

function detectActions(reply: string): Array<{ action: string; label: string }> {
  const lower = reply.toLowerCase();
  const actions: Array<{ action: string; label: string }> = [];

  if (lower.includes('report') && (lower.includes('booking') || lower.includes('problem'))) {
    actions.push({ action: 'report_booking', label: 'Report a Booking Problem' });
  }
  if (lower.includes('report') && lower.includes('bug')) {
    actions.push({ action: 'report_bug', label: 'Report a Bug' });
  }

  return actions;
}
