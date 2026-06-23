import { Router } from 'express';
import { verifyPin } from '../middleware/pin';
import { ApiError } from '../lib/errors';
import { body } from 'express-validator';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth, requireCustomer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { quoteLimiter } from '../middleware/rate-limit';
import { idempotency } from '../middleware/idempotency';
import { createTopUpSession } from '../lib/stripe';
import {
  createQuote,
  listMyQuotes,
  getQuote,
  getQuoteProposals,
  cancelQuote,
  repostQuote,
  createGuestQuote,
  updateQuote,
  resolvePromo,
} from '../services/quote.service';
import { selectProposal } from '../services/booking.service';
import { getSetting, resolveBudgetRanges, getSstRate } from '../services/settings.service';
import { computeTotal, computeHoldAmount, LineItem, ServicerTaxConfig } from '../lib/money';
import { TIME_SLOTS } from '../lib/time-slots';

/** Customer-facing quote endpoints. */
export const quotesRouter = Router();

/** GET /quotes/budget-ranges — public budget brackets for the quote form.
 *  Accepts optional ?categoryId to return category-specific ranges. */
quotesRouter.get(
  '/budget-ranges',
  asyncHandler(async (req, res) => {
    const setting = await getSetting<{ ranges: { min: number; max: number | null }[] | Record<string, { min: number; max: number | null }[]> }>(
      'budget_ranges',
    );
    const categoryId = req.query.categoryId as string | undefined;
    if (categoryId) {
      const ranges = resolveBudgetRanges(setting, categoryId);
      res.json({ ranges });
    } else {
      // Legacy: return flat array or first available category's ranges
      const ranges = Array.isArray(setting.ranges)
        ? setting.ranges
        : Object.values(setting.ranges)[0] ?? [];
      res.json({ ranges });
    }
  }),
);

/** GET /quotes/estimate — canonical budget-based estimate for the Bill step (public). */
quotesRouter.get(
  '/estimate',
  asyncHandler(async (req, res) => {
    const categoryId = (req.query.categoryId as string | undefined)?.trim();
    const budgetMin = req.query.budgetMin !== undefined ? Number(req.query.budgetMin) : null;
    const budgetMax = req.query.budgetMax !== undefined ? Number(req.query.budgetMax) : null;
    const promoCode = (req.query.promoCode as string | undefined)?.trim() || undefined;

    if (!categoryId || budgetMin === null || !Number.isFinite(budgetMin)) {
      res.status(400).json({ error: 'categoryId and budgetMin are required' });
      return;
    }

    const midpoint =
      budgetMax !== null && Number.isFinite(budgetMax)
        ? Math.round(((budgetMin + budgetMax) / 2) * 100) / 100
        : budgetMin;

    const lineItems: LineItem[] = [
      { label: 'Service (estimated)', amount: midpoint, taxable: true, serviceChargeable: true },
    ];

    const sstRate = await getSstRate();
    const config: ServicerTaxConfig = {
      serviceChargeRate: 0,
      sstRegistered: false,
      sstRate,
      taxInclusive: false,
    };

    // Resolve promo discount from redemption (booking_percent / waiver types)
    const promoDiscount = promoCode
      ? await resolvePromo(promoCode, midpoint)
      : 0;
    let promoError: string | undefined;

    // Only show error if a code was provided but we couldn't resolve any discount
    if (promoCode && promoDiscount <= 0) {
      promoError = 'Promo code could not be applied. Check the code or its conditions.';
    }

    const breakdown = computeTotal(lineItems, promoDiscount, config);

    // Fetch category baseline fees (best-effort; don't 400 if not found)
    const cat = categoryId
      ? await prisma.category.findUnique({
          where: { id: categoryId },
          select: { travelFeeBaseline: true, requiresInspection: true },
        })
      : null;

    const travelFeeAmount = Number(cat?.travelFeeBaseline ?? 0);
    // Inspection-first categories charge an upfront inspection fee equal to the
    // category travel-fee baseline (the cost of the servicer's site visit).
    const inspectionFeeAmount = (cat?.requiresInspection && travelFeeAmount > 0) ? travelFeeAmount : 0;
    // holdAmount must equal exactly what createQuote() deducts from the
    // customer's wallet for a pay-now quote (BUG-4). Both call the single
    // computeHoldAmount() so the figure shown on the Bill step can never drift
    // from the amount actually held. The estimate has no tip context, so tip
    // defaults to 0 here (the customer quote form does not capture a tip).
    // Inspection bookings hold only the inspection fee, not the full budget hold.
    const holdAmount = cat?.requiresInspection
      ? inspectionFeeAmount
      : computeHoldAmount(budgetMax !== null && Number.isFinite(budgetMax) ? budgetMax : null);
    const estimatedReturn = Math.max(0, holdAmount - breakdown.total - travelFeeAmount);

    res.json({
      subtotal: breakdown.subtotal,
      promoDiscount,
      promoError,
      serviceCharge: breakdown.serviceCharge,
      sst: breakdown.sst,
      total: breakdown.total,
      note: "Midpoint estimate. Final price is set by the servicer's proposal.",
      travelFee: { amount: travelFeeAmount, nonRefundable: true },
      inspectionFee: { amount: inspectionFeeAmount, nonRefundable: true },
      holdAmount,
      estimatedReturn,
    });
  }),
);

/** POST /quotes/guest — public guest quote submission (no auth). */
quotesRouter.post(
  '/guest',
  quoteLimiter,
  validate([
    body('categoryId').isUUID(),
    body('contactName').isString().trim().notEmpty().isLength({ min: 2, max: 100 }),
    body('contactNumber').isString().trim().notEmpty().matches(/^[0-9+\-\s()]{6,20}$/).withMessage('Enter a valid phone number'),
    body('address').isString().trim().notEmpty(),
    body('timeSlot').isIn([...TIME_SLOTS]),
    body('preferredDate').isISO8601(),
    body('budgetMin').optional().isNumeric(),
    body('budgetMax').optional().isNumeric(),
    body('paymentMode').optional().isIn(['pay_now', 'pay_later', 'cash']),
    body('settlementMethod').optional().isIn(['gateway', 'cash']),
    body('lat').optional().isFloat(),
    body('lng').optional().isFloat(),
    body('postcode').optional().isString(),
    body('district').optional().isString(),
    body('state').optional().isString(),
    body('propertyType').optional().isString(),
    body('notes').optional().isString().isLength({ max: 1000 }),
    body('serviceDetails').optional().isObject(),
  ]),
  asyncHandler(async (req, res) => {
    const result = await createGuestQuote(req.body);

    let stripeUrl: string | undefined;
    let stripeSessionId: string | undefined;

    // Guest pay_now: the quote was created in pending_payment status and was
    // NOT broadcast (payment gate before broadcast). Create a Stripe Checkout
    // Session so the guest can fund their wallet with the budget max upfront.
    // The Stripe webhook (checkout.session.completed) credits the wallet, takes
    // the budget hold, and only THEN broadcasts the quote to servicers
    // (settleAndBroadcastGuestQuote).
    if (req.body.paymentMode === 'pay_now') {
      const budgetMax = req.body.budgetMax != null ? Number(req.body.budgetMax) : null;
      const budgetMin = req.body.budgetMin != null ? Number(req.body.budgetMin) : 0;
      const amount = budgetMax ?? budgetMin;

      if (amount > 0) {
        try {
          const appUrl = req.get('origin') ?? process.env.APP_URL ?? 'http://localhost:4200';
          const successUrl = `${appUrl}/guest/quote/new?submitted=true`;
          const cancelUrl = `${appUrl}/guest/quote/new`;

          const session = await createTopUpSession(result.userId, amount, successUrl, cancelUrl);
          stripeUrl = session.url;
          stripeSessionId = session.sessionId;

          await prisma.transaction.create({
            data: {
              type: 'deposit_topup',
              status: 'pending',
              amount,
              userId: result.userId,
              reference: `Stripe Checkout Session ${session.sessionId}`,
              metadata: {
                stripeSessionId: session.sessionId,
                stage: 'checkout_created',
                quoteId: result.id,
                guestPayment: true,
              },
            },
          });
        } catch (stripeErr) {
          // Leave the quote pending_payment and un-broadcast — no payment was
          // taken, so it must not reach servicers. The guest can retry; the
          // response carries no stripeUrl so the client knows checkout failed.
          logger.warn('Failed to create Stripe session for guest pay_now — quote left pending_payment, not broadcast', {
            quoteId: result.id,
            error: stripeErr instanceof Error ? stripeErr.message : String(stripeErr),
          });
        }
      }
    }

    res.status(201).json({
      id: result.id,
      stripeUrl,
      stripeSessionId,
    });
  }),
);

quotesRouter.use(requireAuth, requireCustomer);

const createValidators = [
  body('categoryId').isUUID().withMessage('categoryId must be a UUID'),
  body('addressId').optional({ values: 'null' }).isUUID().withMessage('addressId must be a UUID'),
  body('address').optional({ values: 'null' }).isString().trim(),
  body('lat').optional({ values: 'null' }).isFloat(),
  body('lng').optional({ values: 'null' }).isFloat(),
  body('postcode').optional({ values: 'null' }).isString(),
  body('district').optional({ values: 'null' }).isString(),
  body('state').optional({ values: 'null' }).isString(),
  body('contactName').isString().trim().notEmpty().isLength({ min: 2, max: 100 }),
  body('contactNumber').isString().trim().notEmpty().matches(/^[0-9+\-\s()]{6,20}$/).withMessage('Enter a valid phone number'),
  body('timeSlot').isIn([...TIME_SLOTS]),
  body('preferredDate')
    .isISO8601()
    .custom((v: string) => {
      const d = new Date(v);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d < today) throw new Error('preferredDate must not be in the past');
      return true;
    }),
  body('propertyType').optional({ values: 'null' }).isString(),
  body('budgetMin').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('budgetMax').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('paymentMode').isIn(['pay_now', 'pay_later', 'cash']),
  body('settlementMethod').optional({ values: 'null' }).isIn(['credit', 'gateway', 'cash']),
  body('tipAmount').optional({ values: 'null' }).isFloat({ min: 0 }),
  body('deadlineMode').isIn(['fcfs', 'fixed_time']),
  body('proposalDeadline').optional().isISO8601(),
  body('notes').optional({ values: 'null' }).isString().isLength({ max: 1000 }),
  body('agreeTerms').isBoolean().custom((v) => v === true).withMessage('You must agree to the terms'),
  body('promoCode').optional({ values: 'null' }).isString().trim(),
  body('serviceDetails').optional({ values: 'null' }).isObject(),
  body('images').optional().isArray({ max: 5 }),
  body('images.*').optional().isString().isLength({ max: 500 }),
  // Locked rebook: when present, the quote goes only to this servicer.
  body('targetServicerId').optional({ values: 'null' }).isUUID(),
];

/** POST /quotes — submit a new quote request. */
quotesRouter.post(
  '/',
  quoteLimiter,
  validate(createValidators),
  asyncHandler(async (req, res) => {
    const result = await createQuote(req.user!.id, req.body);
    res.status(201).json(result);
  }),
);

/** GET /quotes — list the customer's quotes. */
quotesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const data = await listMyQuotes(req.user!.id, req.query.status as string | undefined);
    res.json({ data });
  }),
);

/** GET /quotes/:id — single quote with full detail. */
quotesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await getQuote(req.user!.id, req.params.id));
  }),
);

/** GET /quotes/:id/proposals — bundled proposals for the quote. */
quotesRouter.get(
  '/:id/proposals',
  asyncHandler(async (req, res) => {
    res.json({ data: await getQuoteProposals(req.user!.id, req.params.id) });
  }),
);

/** POST /quotes/:id/select — pick a proposal and create a booking. */
quotesRouter.post(
  '/:id/select',
  idempotency,
  validate([
    body('proposalId').isUUID().withMessage('proposalId must be a UUID'),
    body('settlementMethod').optional().isIn(['gateway', 'credit', 'cash']).withMessage('settlementMethod must be gateway, credit, or cash'),
    body('paymentIntentId').optional().isString().withMessage('paymentIntentId must be a string'),
  ]),
  asyncHandler(async (req, res) => {
    const result = await selectProposal(req.user!.id, req.params.id, req.body.proposalId, {
      settlementMethod: req.body.settlementMethod ?? undefined,
      paymentIntentId: req.body.paymentIntentId ?? undefined,
    });
    res.status(201).json(result);
  }),
);

/** POST /quotes/:id/cancel — cancel an open quote with reason + PIN. */
quotesRouter.post(
  '/:id/cancel',
  idempotency,
  validate([
    body('reason').isString().trim().notEmpty().withMessage('Cancel reason is required'),
    body('details').optional().isString().trim(),
    body('pin').isString().trim().notEmpty().withMessage('PIN is required'),
  ]),
  asyncHandler(async (req, res) => {
    // Verify PIN against user's actionPinHash.
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { actionPinHash: true },
    });
    if (!user) throw new ApiError('NOT_FOUND', 'User not found');
    const ok = await verifyPin({ pinHash: user.actionPinHash }, req.body.pin);
    if (!ok) throw new ApiError('PIN_INVALID', 'Invalid PIN.');
    await cancelQuote(req.user!.id, req.params.id, req.body.reason, req.body.details);
    res.status(204).send();
  }),
);

/** PATCH /quotes/:id — update non-pricing fields on an open quote. */
quotesRouter.patch(
  '/:id',
  validate([
    body('contactName').optional().isString().trim().notEmpty(),
    body('contactNumber').optional().isString().trim().notEmpty(),
    body('timeSlot').optional().isIn([...TIME_SLOTS]),
    body('preferredDate').optional().isISO8601(),
    body('notes').optional({ values: 'null' }).isString(),
  ]),
  asyncHandler(async (req, res) => {
    const result = await updateQuote(req.user!.id, req.params.id, req.body);
    res.json(result);
  }),
);

/** POST /quotes/:id/repost — repost an expired quote. */
quotesRouter.post(
  '/:id/repost',
  quoteLimiter,
  idempotency,
  asyncHandler(async (req, res) => {
    res.status(201).json(await repostQuote(req.user!.id, req.params.id));
  }),
);
