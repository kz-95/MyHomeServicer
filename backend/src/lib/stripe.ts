import StripeConstructor from 'stripe';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * Stripe client — initialised from STRIPE_SECRET_KEY env var.
 * If the key is not set the client is null and all operations
 * gracefully report that Stripe is not configured.
 */
let stripeClient: ReturnType<typeof StripeConstructor> | null = null;

export function getStripeClient(): ReturnType<typeof StripeConstructor> | null {
  if (!stripeClient && env.STRIPE_SECRET_KEY) {
    try {
      stripeClient = new StripeConstructor(env.STRIPE_SECRET_KEY, {
        apiVersion: '2026-04-22.dahlia',
        typescript: true,
      });
      logger.info('Stripe client initialised (version 2026-04-22.dahlia)');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('Failed to initialise Stripe client', { error: msg });
      return null;
    }
  }
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!env.STRIPE_SECRET_KEY;
}

/**
 * Create a PaymentIntent for a pay-now escrow charge.
 *
 * @param amountMYR  Amount in Malaysian Ringgit (e.g. 150.00).
 * @param metadata   Arbitrary key-value pairs attached to the PaymentIntent
 *                   (must include bookingId for webhook reconciliation).
 * @returns          The client secret needed to confirm the payment on the frontend.
 */
export async function createPaymentIntent(
  amountMYR: number,
  metadata: Record<string, string>,
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env');
  }

  const amountSen = Math.round(amountMYR * 100);

  const pi = await stripe.paymentIntents.create({
    amount: amountSen,
    currency: 'myr',
    metadata,
    statement_descriptor_suffix: 'MyHomeServicer',
  });

  logger.info('Stripe PaymentIntent created', {
    paymentIntentId: pi.id,
    amountSen,
    bookingId: metadata.bookingId,
  });

  return { clientSecret: pi.client_secret!, paymentIntentId: pi.id };
}

/**
 * Create a Stripe Checkout Session for wallet top-up.
 *
 * @param userId     The user funding their wallet.
 * @param amountMYR  Top-up amount in Malaysian Ringgit.
 * @param successUrl Redirect URL on successful payment.
 * @param cancelUrl  Redirect URL if the customer cancels.
 * @returns          The Checkout Session URL (Stripe-hosted payment page).
 */
export async function createTopUpSession(
  userId: string,
  amountMYR: number,
  successUrl: string,
  cancelUrl: string,
  userType?: 'user' | 'servicer',
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env');
  }

  const amountSen = Math.round(amountMYR * 100);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card', 'grabpay', 'link'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'myr',
          product_data: {
            name: 'Wallet Top-Up',
            description: `Credit wallet top-up of RM ${amountMYR.toFixed(2)}`,
          },
          unit_amount: amountSen,
        },
        quantity: 1,
      },
    ],
    metadata: {
      userId,
      amountMYR: amountMYR.toFixed(2),
      ...(userType ? { userType } : {}),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 1800,
  });

  if (!session.url) {
    throw new Error('Stripe Checkout Session returned no URL');
  }

  logger.info('Stripe Checkout Session created', {
    sessionId: session.id,
    userId,
    amountMYR,
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Create a Stripe Checkout Session to pay an outstanding booking invoice by card.
 *
 * Mirrors createTopUpSession (Stripe-hosted page → no publishable key, minimal PCI
 * scope). The CALLER must derive amountMYR server-side from the booking's invoice
 * total — never from client input — and verify booking ownership before calling.
 *
 * @param bookingId  The booking whose invoice is being paid (for webhook reconciliation).
 * @param amountMYR  Server-derived invoice total in Malaysian Ringgit.
 * @param successUrl Redirect URL on successful payment.
 * @param cancelUrl  Redirect URL if the customer cancels.
 */
export async function createBookingPaymentSession(
  bookingId: string,
  amountMYR: number,
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env');
  }

  const amountSen = Math.round(amountMYR * 100);

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card', 'grabpay', 'link'],
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'myr',
          product_data: {
            name: 'Service Payment',
            description: `Booking payment of RM ${amountMYR.toFixed(2)}`,
          },
          unit_amount: amountSen,
        },
        quantity: 1,
      },
    ],
    metadata: {
      bookingId,
      amountMYR: amountMYR.toFixed(2),
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
    expires_at: Math.floor(Date.now() / 1000) + 1800,
  });

  if (!session.url) {
    throw new Error('Stripe Checkout Session returned no URL');
  }

  logger.info('Stripe booking payment session created', {
    sessionId: session.id,
    bookingId,
    amountMYR,
  });

  return { url: session.url, sessionId: session.id };
}

/**
 * Retrieve a Checkout Session from Stripe API and return its
 * payment status and metadata. Used to verify a top-up after
 * the user is redirected back from Stripe (bypasses webhook).
 */
export async function retrieveCheckoutSession(
  sessionId: string,
): Promise<{ payment_status: string; metadata: Record<string, string> } | null> {
  const stripe = getStripeClient();
  if (!stripe) return null;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      payment_status: session.payment_status ?? 'unpaid',
      metadata: (session.metadata ?? {}) as Record<string, string>,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Failed to retrieve Stripe Checkout Session', { sessionId, error: msg });
    return null;
  }
}

// ── Webhook types (minimal shape; avoids Stripe SDK namespace quirks) ─────────

export interface StripeWebhookPaymentIntent {
  id: string;
  amount: number;
  metadata?: Record<string, string>;
  payment_method?: unknown;
}

export interface StripeWebhookCheckoutSession {
  id: string;
  metadata?: Record<string, string>;
  payment_status?: string;
}

export interface StripeWebhookEvent {
  type: string;
  id: string;
  data: {
    object: StripeWebhookPaymentIntent | StripeWebhookCheckoutSession;
  };
}

/**
 * Verify a Stripe webhook signature using the configured webhook secret.
 *
 * @param payload    The raw request body (Buffer or string).
 * @param signature  The `stripe-signature` header value.
 * @returns          The verified Stripe event or null if verification fails.
 */
export function verifyWebhookSignature(
  payload: Buffer | string,
  signature: string,
): StripeWebhookEvent | null {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    logger.warn('Stripe webhook secret not configured — cannot verify signature');
    return null;
  }

  const stripe = getStripeClient();
  if (!stripe) return null;

  try {
    const rawBody = typeof payload === 'string' ? payload : payload.toString('utf-8');
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    ) as unknown as StripeWebhookEvent;
    return event;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Stripe webhook signature verification failed', { error: msg });
    return null;
  }
}
