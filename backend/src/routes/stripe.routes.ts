import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth, requireCustomer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { notFound, badRequest } from '../lib/errors';
import { logger } from '../lib/logger';
import { adjustCredit } from '../services/credit.service';
import { notify } from '../services/notification.service';
import { completeGatewaySettlement } from '../services/booking.service';
import { settleAndBroadcastGuestQuote } from '../services/quote.service';
import {
  createPaymentIntent,
  createTopUpSession,
  createBookingPaymentSession,
  retrieveCheckoutSession,
  verifyWebhookSignature,
  StripeWebhookPaymentIntent,
  StripeWebhookCheckoutSession,
} from '../lib/stripe';

export const stripeRouter = Router();

// ── Customer payment intent (pay-now escrow charge) ──────────────────────────
// Only customers can create a payment intent for their own booking.

stripeRouter.post(
  '/create-payment-intent',
  requireAuth,
  requireCustomer,
  validate([
    body('amount').isFloat({ min: 0.01 }).withMessage('amount must be a positive number'),
    body('bookingId').optional().isUUID().withMessage('bookingId must be a valid UUID'),
  ]),
  asyncHandler(async (req, res) => {
    const { amount, bookingId } = req.body as { amount: number; bookingId?: string };
    const userId = req.user!.id;

    if (bookingId) {
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, userId },
      });
      if (!booking) throw notFound('Booking not found or does not belong to you');
    }

    const { clientSecret, paymentIntentId } = await createPaymentIntent(amount, {
      userId,
      ...(bookingId ? { bookingId } : {}),
    });

    res.json({ clientSecret, paymentIntentId });
  }),
);

// ── Pay an outstanding booking invoice by card (Stripe Checkout) ─────────────
// The client sends ONLY bookingId. The charge amount is derived server-side from
// the invoice total (never trusted from the client). Ownership-checked (no IDOR)
// and state-guarded (only an unpaid invoice with a positive total can be paid).

stripeRouter.post(
  '/create-booking-payment-session',
  requireAuth,
  requireCustomer,
  validate([
    body('bookingId').isUUID().withMessage('bookingId must be a valid UUID'),
  ]),
  asyncHandler(async (req, res) => {
    const { bookingId } = req.body as { bookingId: string };
    const userId = req.user!.id;

    // Ownership: the booking must belong to the requesting customer (no IDOR).
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });
    if (!booking) throw notFound('Booking not found or does not belong to you');

    // Settle-state guard: card settlement applies to a completed pay_later booking
    // (mirrors settleBooking's contract).
    if (booking.paymentTiming !== 'pay_later') {
      throw badRequest('Card payment is only available for pay_later bookings');
    }
    if (booking.status !== 'completed') {
      throw badRequest('Card payment is only available after the job is marked done');
    }

    // State guard + server-derived amount: an unpaid invoice with a positive total.
    const invoice = await prisma.invoice.findUnique({ where: { bookingId } });
    if (!invoice) throw notFound('No invoice exists for this booking');
    if (invoice.paidAt) throw badRequest('This booking invoice is already paid');
    if (invoice.total == null) throw badRequest('Invoice total is not set');
    const amountMYR = Number(invoice.total);
    if (!(amountMYR > 0)) throw badRequest('Invoice total must be greater than zero');

    const appUrl = req.get('origin') ?? process.env.APP_URL ?? 'http://localhost:4200';
    const successUrl = `${appUrl}/customer/bookings?pay=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/customer/bookings?pay=cancelled`;

    const { url, sessionId } = await createBookingPaymentSession(
      bookingId,
      amountMYR,
      successUrl,
      cancelUrl,
    );

    res.json({ url, sessionId });
  }),
);

// ── Verify a booking payment after Stripe redirect (webhook fallback) ────────

stripeRouter.post(
  '/verify-booking-payment',
  requireAuth,
  requireCustomer,
  validate([
    body('sessionId').isString().notEmpty().withMessage('sessionId is required'),
  ]),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body as { sessionId: string };
    const userId = req.user!.id;

    const session = await retrieveCheckoutSession(sessionId);
    if (!session) {
      res.status(400).json({ error: 'Could not retrieve Stripe session' });
      return;
    }
    if (session.payment_status !== 'paid' && session.payment_status !== 'complete') {
      res.status(400).json({ error: `Payment not completed (status: ${session.payment_status})` });
      return;
    }

    const bookingId = session.metadata?.bookingId ?? session.metadata?.booking_id;
    if (!bookingId) {
      res.status(400).json({ error: 'Session metadata missing bookingId' });
      return;
    }

    // Ownership: the session's booking must belong to this customer (no IDOR).
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });
    if (!booking) {
      res.status(403).json({ error: 'Session does not belong to this user' });
      return;
    }

    const paid = await completeBookingPayment(sessionId, bookingId);
    res.json({ paid: true, alreadyProcessed: paid.alreadyProcessed });
  }),
);

// ── Wallet top-up via Stripe Checkout ────────────────────────────────────────

stripeRouter.post(
  '/create-topup-session',
  requireAuth,
  requireCustomer,
  validate([
    body('amount').isFloat({ min: 10 }).withMessage('amount must be at least RM 10'),
  ]),
  asyncHandler(async (req, res) => {
    const { amount } = req.body as { amount: number };
    const userId = req.user!.id;
    const appUrl = req.get('origin') ?? process.env.APP_URL ?? 'http://localhost:4200';

    const successUrl = `${appUrl}/customer/account?topup=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appUrl}/customer/account?topup=cancelled`;

    const { url, sessionId } = await createTopUpSession(userId, amount, successUrl, cancelUrl);

    // Record a pending top-up transaction for the webhook to complete.
    await prisma.transaction.create({
      data: {
        type: 'deposit_topup',
        status: 'pending',
        amount,
        userId,
        reference: `Stripe Checkout Session ${sessionId}`,
        metadata: { stripeSessionId: sessionId, stage: 'checkout_created' },
      },
    });

    res.json({ url, sessionId });
  }),
);

// ── Verify a top-up after Stripe redirect (bypasses webhook) ─────────────────

stripeRouter.post(
  '/verify-topup',
  requireAuth,
  validate([
    body('sessionId').isString().notEmpty().withMessage('sessionId is required'),
  ]),
  asyncHandler(async (req, res) => {
    const { sessionId } = req.body as { sessionId: string };
    const userId = req.user!.id;

    const session = await retrieveCheckoutSession(sessionId);
    if (!session) {
      res.status(400).json({ error: 'Could not retrieve Stripe session' });
      return;
    }

    if (session.payment_status !== 'paid' && session.payment_status !== 'complete') {
      res.status(400).json({ error: `Payment not completed (status: ${session.payment_status})` });
      return;
    }

    const meta = session.metadata ?? {};
    const sessionUserId = meta.userId ?? meta.user_id;
    if (sessionUserId !== userId) {
      res.status(403).json({ error: 'Session does not belong to this user' });
      return;
    }

    // Redis lock: share key with webhook handler so both can't process the same session.
    const lockKey = `stripe:session:${sessionId}`;
    const locked = await redis.set(lockKey, '1', 'EX', WEBHOOK_LOCK_TTL, 'NX');
    if (!locked) {
      res.status(409).json({ error: 'Session is being processed' });
      return;
    }

    // DB-level idempotency check.
    const existing = await prisma.transaction.findUnique({
      where: { stripeSessionId: sessionId },
    });
    if (existing) {
      await redis.del(lockKey);
      const isServicer = meta.userType === 'servicer';
      const user = isServicer
        ? await prisma.servicer.findUnique({ where: { id: userId } })
        : await prisma.user.findUnique({ where: { id: userId } });
      const bal = Number(user?.creditBalance ?? 0);
      res.json({ balance: bal, alreadyProcessed: true });
      return;
    }

    const amountStr = meta.amountMYR ?? meta.amount_myr;
    if (!amountStr) {
      res.status(400).json({ error: 'Session metadata missing amountMYR' });
      return;
    }

    const amountMYR = parseFloat(amountStr);
    const isServicer = meta.userType === 'servicer';

    // Look up pending transaction for bonus credit info (stripeSessionId
    // is only in metadata at this stage, so query by reference instead).
    const pendingTxn = await prisma.transaction.findFirst({
      where: {
        userId,
        type: 'deposit_topup',
        status: 'pending',
        reference: `Stripe Checkout Session ${sessionId}`,
      },
    });
    const creditAmount = pendingTxn?.amount ? Number(pendingTxn.amount) : amountMYR;

    await prisma.$transaction(async (tx) => {
      if (isServicer) {
        await tx.servicer.update({
          where: { id: userId },
          data: { creditBalance: { increment: creditAmount } },
        });
      } else {
        await adjustCredit('user', userId, creditAmount, tx);
      }

      await tx.transaction.create({
        data: {
          type: 'deposit_topup',
          status: 'completed',
          amount: creditAmount,
          userId,
          servicerId: isServicer ? userId : undefined,
          stripeSessionId: sessionId,
          reference: `Stripe Checkout Session ${sessionId}`,
          metadata: {
            stripeSessionId: sessionId,
            paymentStatus: session.payment_status,
            verifiedVia: 'redirect',
            ...(isServicer ? { userType: 'servicer' } : {}),
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'system',
          action: 'transaction.deposit_topup',
          entityType: 'Transaction',
          newValue: { type: 'deposit_topup', amount: amountMYR, userId, stripeSessionId: sessionId, verifiedVia: 'redirect', ...(isServicer ? { userType: 'servicer' } : {}) },
        },
      });
    });

    const user = isServicer
      ? await prisma.servicer.findUnique({ where: { id: userId } })
      : await prisma.user.findUnique({ where: { id: userId } });
    const balance = Number(user?.creditBalance ?? 0);
    notify({
      type: 'payments',
      userId: isServicer ? undefined : userId,
      servicerId: isServicer ? userId : undefined,
      message: `Wallet top-up of RM ${amountMYR.toFixed(2)} confirmed.`,
      linkUrl: '/customer/transactions',
    });
    logger.info('Top-up verified via redirect', { sessionId, userId, amountMYR, isServicer });
    res.json({ balance });
  }),
);

// ── Stripe webhook (raw body, signature verification) ────────────────────────
//
// IMPORTANT: This route receives the raw body buffer via express.raw() which
// is mounted in app.ts BEFORE the global JSON parser for this exact path.

const WEBHOOK_LOCK_TTL = 30; // seconds - prevents concurrent processing

stripeRouter.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    // req.body is a Buffer when express.raw() is used.
    const rawBody = req.body as Buffer;
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      logger.warn('Stripe webhook received without stripe-signature header');
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    const event = verifyWebhookSignature(rawBody, signature);
    if (!event) {
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    logger.info('Stripe webhook received', { type: event.type, id: event.id });

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentIntentSucceeded(event.data.object as StripeWebhookPaymentIntent);
          break;
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(
            event.data.object as StripeWebhookCheckoutSession,
          );
          break;
        default:
          logger.info('Unhandled Stripe webhook event type', { type: event.type });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Stripe webhook handler error - returning 500 for retry', {
        type: event.type, error: msg,
      });
      res.status(500).json({ error: 'Webhook handler failed' });
      return;
    }

    res.status(200).json({ received: true });
  }),
);

// ── Webhook event handlers ───────────────────────────────────────────────────

async function handlePaymentIntentSucceeded(pi: StripeWebhookPaymentIntent) {
  const meta = pi.metadata ?? {};
  const bookingId = meta.bookingId ?? meta.booking_id;
  if (!bookingId) {
    logger.warn('Stripe payment_intent.succeeded without bookingId in metadata', { piId: pi.id });
    return;
  }

  // Idempotency: prevent double-crediting if Stripe retries the event.
  const lockKey = `stripe:pi:${pi.id}`;
  const locked = await redis.set(lockKey, '1', 'EX', WEBHOOK_LOCK_TTL, 'NX');
  if (!locked) {
    logger.info('Duplicate Stripe payment_intent.succeeded - skipped', { piId: pi.id });
    return;
  }

  // DB-level idempotency check.
  const existing = await prisma.transaction.findUnique({
    where: { stripePaymentIntentId: pi.id },
  });
  if (existing) {
    logger.info('Duplicate Stripe payment_intent.succeeded (DB check) - skipped', { piId: pi.id });
    return;
  }

  // ── PaymentIntent integrity verification ──────────────────────────────
  // 1. PI must be in succeeded state
  if (pi.status && pi.status !== 'succeeded') {
    logger.warn('Stripe PI webhook received with non-succeeded status - ignoring', {
      piId: pi.id, status: pi.status,
    });
    return;
  }

  // 2. Currency must be MYR
  if (pi.currency && pi.currency !== 'myr') {
    logger.warn('Stripe PI webhook received in non-MYR currency - ignoring', {
      piId: pi.id, currency: pi.currency,
    });
    return;
  }

  const amountMYR = pi.amount / 100; // Convert sen → MYR

  // 3. Cross-check amount against booking's escrow (server-side truth).
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { escrow: { select: { amount: true } } },
  });
  if (booking) {
    const escrowAmount = Number(booking.escrow?.amount ?? 0);
    if (escrowAmount > 0 && Math.abs(amountMYR - escrowAmount) > 0.5) {
      logger.error('Stripe PI amount mismatch with booking escrow', {
        piId: pi.id,
        bookingId,
        piAmount: amountMYR,
        escrowAmount,
        diff: amountMYR - escrowAmount,
      });
      // Do NOT silently accept mismatched amounts - return 200 so Stripe
      // doesn't retry, but log the discrepancy for manual reconciliation.
      return;
    }
  }

  await prisma.$transaction(async (tx) => {
    // Directly create the transaction with Stripe idempotency fields.
    await tx.transaction.create({
      data: {
        type: 'gateway_payment',
        status: 'completed',
        amount: amountMYR,
        bookingId,
        stripePaymentIntentId: pi.id,
        reference: `Stripe PaymentIntent ${pi.id}`,
        metadata: {
          stripePaymentIntentId: pi.id,
          paymentMethod: pi.payment_method as string | undefined,
        },
      },
    });

    // Write paired audit-log entry.
    await tx.auditLog.create({
      data: {
        actorType: 'system',
        action: 'transaction.gateway_payment',
        entityType: 'Transaction',
        newValue: {
          type: 'gateway_payment',
          amount: amountMYR,
          bookingId,
          stripePaymentIntentId: pi.id,
        },
      },
    });

    // Mark the invoice as paid if it exists.
    const invoice = await tx.invoice.findUnique({ where: { bookingId } });
    if (invoice && !invoice.paidAt) {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paidAt: new Date() },
      });
      logger.info('Invoice marked paid via Stripe webhook', { bookingId, invoiceId: invoice.id });
    }

    // Record escrow_hold for pay_now bookings alongside the gateway_payment.
    // The escrow record was already created by selectProposal; the webhook
    // confirms the funds arrived and records the hold transaction.
    const escrow = await tx.escrow.findUnique({ where: { bookingId } });
    if (escrow && escrow.status === 'held') {
      // Load booking for userId/servicerId needed on the escrow_hold row.
      const bk = await tx.booking.findUnique({
        where: { id: bookingId },
        select: { userId: true, servicerId: true },
      });
      if (bk) {
        await tx.transaction.create({
          data: {
            type: 'escrow_hold',
            amount: amountMYR,
            bookingId,
            userId: bk.userId,
            servicerId: bk.servicerId,
            escrowId: escrow.id,
            reference: `Escrow hold via Stripe webhook (PI ${pi.id})`,
          },
        });
      }
      logger.info('Escrow held for booking; Stripe payment confirmed via webhook', {
        bookingId,
        escrowId: escrow.id,
      });
    }
  });

  logger.info('Stripe payment_intent.succeeded processed', { piId: pi.id, bookingId, amountMYR });
}

async function handleCheckoutSessionCompleted(session: StripeWebhookCheckoutSession) {
  const meta = session.metadata ?? {};

  // Booking invoice payment (distinct from wallet top-up): metadata carries a
  // bookingId rather than a userId. Route it to the booking completion path.
  const bookingId = meta.bookingId ?? meta.booking_id;
  if (bookingId) {
    await completeBookingPayment(session.id, bookingId);
    return;
  }

  const userId = meta.userId ?? meta.user_id;
  const amountStr = meta.amountMYR ?? meta.amount_myr;
  if (!userId || !amountStr) {
    logger.warn('Stripe checkout.session.completed without userId/amountMYR in metadata', {
      sessionId: session.id,
    });
    return;
  }

  // Idempotency: prevent double-crediting.
  const lockKey = `stripe:session:${session.id}`;
  const locked = await redis.set(lockKey, '1', 'EX', WEBHOOK_LOCK_TTL, 'NX');
  if (!locked) {
    logger.info('Duplicate Stripe checkout.session.completed - skipped', { sessionId: session.id });
    return;
  }

  // DB-level idempotency check.
  const existing = await prisma.transaction.findUnique({
    where: { stripeSessionId: session.id },
  });
  if (existing) {
    logger.info('Duplicate Stripe checkout.session.completed (DB check) - skipped', {
      sessionId: session.id,
    });
    return;
  }

  const amountMYR = parseFloat(amountStr);

  // Look up pending transaction for bonus credit info (e.g. topup_bonus
  // vouchers store the full credit amount in the pending transaction).
  const pendingTxn = await prisma.transaction.findFirst({
    where: {
      userId,
      type: 'deposit_topup',
      status: 'pending',
      reference: `Stripe Checkout Session ${session.id}`,
    },
  });
  const creditAmount = pendingTxn?.amount ? Number(pendingTxn.amount) : amountMYR;

  // Check if this is a servicer top-up
  const isServicer = meta.userType === 'servicer';
  if (isServicer) {
    const servicer = await prisma.servicer.findUnique({ where: { id: userId } });
    if (!servicer) {
      logger.warn('Stripe checkout.session.completed - servicer not found', { userId, sessionId: session.id });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.servicer.update({
        where: { id: userId },
        data: { creditBalance: { increment: amountMYR } },
      });
      await tx.transaction.create({
        data: {
          type: 'deposit_topup',
          status: 'completed',
          amount: amountMYR,
          servicerId: userId,
          stripeSessionId: session.id,
          reference: `Stripe Checkout Session ${session.id}`,
          metadata: { stripeSessionId: session.id, paymentStatus: session.payment_status, userType: 'servicer' },
        },
      });
      await tx.auditLog.create({
        data: {
          actorType: 'system',
          action: 'transaction.deposit_topup',
          entityType: 'Transaction',
          newValue: { type: 'deposit_topup', amount: amountMYR, servicerId: userId, stripeSessionId: session.id, userType: 'servicer' },
        },
      });
    });
    notify({
      type: 'payments',
      servicerId: userId,
      message: `Wallet top-up of RM ${amountMYR.toFixed(2)} confirmed.`,
      linkUrl: '/servicer/deposit',
    });
    logger.info('Stripe checkout.session.completed processed - servicer credit credited', { sessionId: session.id, userId, amountMYR });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Credit the user's wallet (use creditAmount to include promos).
    await adjustCredit('user', userId, creditAmount, tx);

    // Create the completed top-up transaction with Stripe idempotency field.
    await tx.transaction.create({
      data: {
        type: 'deposit_topup',
        status: 'completed',
        amount: creditAmount,
        userId,
        stripeSessionId: session.id,
        reference: `Stripe Checkout Session ${session.id}`,
        metadata: {
          stripeSessionId: session.id,
          paymentStatus: session.payment_status,
        },
      },
    });

    // Write paired audit-log entry.
    await tx.auditLog.create({
      data: {
        actorType: 'system',
        action: 'transaction.deposit_topup',
        entityType: 'Transaction',
        newValue: {
          type: 'deposit_topup',
          amount: creditAmount,
          userId,
          stripeSessionId: session.id,
        },
      },
    });

    // Also update any pending "checkout_created" record to completed.
    await tx.transaction.updateMany({
      where: {
        userId,
        type: 'deposit_topup',
        status: 'pending',
        reference: `Stripe Checkout Session ${session.id}`,
      },
      data: { stripeSessionId: session.id, status: 'completed' },
    });
  });

  // Guest pay_now (gateway): the wallet is now funded, so the payment gate is
  // satisfied. Take the budget hold, broadcast the quote, and flip it
  // pending_payment → open. The pending top-up transaction carries the quoteId
  // (set when the guest checkout session was created in quotes.routes.ts). The
  // call is idempotent, so a webhook redelivery never double-broadcasts.
  const guestMeta = (pendingTxn?.metadata ?? {}) as { quoteId?: string; guestPayment?: boolean };
  if (guestMeta.guestPayment && guestMeta.quoteId) {
    try {
      await settleAndBroadcastGuestQuote(guestMeta.quoteId);
    } catch (err) {
      logger.error('Guest quote broadcast after payment failed', {
        sessionId: session.id,
        quoteId: guestMeta.quoteId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  notify({
    type: 'payments',
    userId,
    message: `Wallet top-up of RM ${creditAmount.toFixed(2)} confirmed.`,
    linkUrl: '/customer/transactions',
  });
  logger.info('Stripe checkout.session.completed processed - wallet credited', {
    sessionId: session.id,
    userId,
    amountMYR,
    creditAmount,
  });
}

// ── Booking invoice payment completion (shared by webhook + redirect verify) ─
// Idempotent: Redis lock (shared key) + DB-unique stripeSessionId. The charge
// amount is re-read from the invoice total server-side (never from client or
// session metadata). Safe to call multiple times (webhook retry + redirect
// verify race) - only the first call records the payment.

async function completeBookingPayment(
  sessionId: string,
  bookingId: string,
): Promise<{ alreadyProcessed: boolean }> {
  // Idempotency guard 1 - short Redis lock to serialise concurrent deliveries
  // (webhook + redirect-verify racing on the same session).
  const lockKey = `stripe:session:${sessionId}`;
  const locked = await redis.set(lockKey, '1', 'EX', WEBHOOK_LOCK_TTL, 'NX');
  if (!locked) {
    logger.info('Booking payment already being processed - skipped', { sessionId, bookingId });
    return { alreadyProcessed: true };
  }

  // Idempotency guard 2 - a completed gateway_payment for this session already exists.
  const existing = await prisma.transaction.findUnique({ where: { stripeSessionId: sessionId } });
  if (existing) {
    await redis.del(lockKey);
    logger.info('Booking payment already recorded - skipped', { sessionId, bookingId });
    return { alreadyProcessed: true };
  }

  // Run the full gateway settlement (customer inflow + platform fee + servicer
  // payout + invoice paid). Idempotency guard 3 (hard backstop): the unique
  // stripeSessionId on the gateway_payment row rolls the whole tx back on a retry.
  const result = await completeGatewaySettlement({ bookingId, sessionId });

  if (!result.alreadyPaid && result.customerUserId) {
    notify({
      type: 'payments',
      userId: result.customerUserId,
      message: `Payment of RM ${result.total.toFixed(2)} received for your booking.`,
      linkUrl: '/customer/bookings',
    });
  }
  return { alreadyProcessed: result.alreadyPaid };
}
