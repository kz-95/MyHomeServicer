import { Router } from 'express';
import { Weekday, TimeSlot } from '@prisma/client';
import { TIME_SLOTS } from '../lib/time-slots';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth, requireServicer } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { verifyPin } from '../middleware/pin';
import { proposalLimiter } from '../middleware/rate-limit';
import { idempotency } from '../middleware/idempotency';
import { badRequest, notFound } from '../lib/errors';
import {
  listIncomingQuotes,
  openQuote,
  submitProposal,
} from '../services/servicer-quote.service';
import {
  listMerchantJobs,
  getMerchantJob,
  confirmJob,
  arriveJob,
  doneJob,
  cashConfirm,
  merchantCancelJob,
  requestMutualCancel,
} from '../services/booking.service';
import {
  getMerchantProfile,
  updateMerchantProfile,
  getPersonalProfile,
  updatePersonalProfile,
  setMerchantOnline,
  getEarningsToday,
  getEarningsDaily,
  exportEarningsPdf,
  listCreditLog,
  listPenalties,
  fileAppeal,
  getPenaltyAppeal,
  submitKycDocument,
  listKycDocuments,
  submitCategoryRequest,
  listCategoryRequests,
  listMerchantPromotions,
  createMerchantPromotion,
  updateMerchantPromotion,
  deactivateMerchantPromotion,
  listMerchantWithdrawals,
  requestDepositTopup,
} from '../services/servicer-account.service';
import {
  listMerchantInvoices,
  getMerchantInvoice,
  getMerchantInvoiceByBooking,
  getInvoicePreview,
} from '../services/invoice.service';
import {
  listServices,
  listSubcategories,
  createService,
  updateService,
  deleteService,
  configureAutoAccept,
  listPresets,
  createPreset,
  updatePreset,
  deletePreset,
} from '../services/servicer-service.service';
import {
  handleDispatchAccept,
  handleDispatchDecline,
} from '../services/dispatch.service';
import { isProd } from '../config/env';
import { deactivateServicer } from '../services/deactivate.service';
import { createTopUpSession, isStripeConfigured } from '../lib/stripe';
import { getPlatformFeeRate, getSstRate } from '../services/settings.service';
import { transferBalance, requestWithdrawal as depositRequestWithdrawal } from '../services/deposit.service';
import { createIdentityChangeRequest } from '../services/identity-change.service';

/**
 * Servicer self-service router (`/merchant/*`). Quote endpoints land in
 * Phase 2; job, service, earnings and promotion endpoints are added in
 * Phases 3-4.
 */
export const servicerRouter = Router();
servicerRouter.use(requireAuth, requireServicer);

// ── Profile, earnings, deposit ───────────────────────────────────────────────

/** GET /merchant/me — merchant profile with settings. */
servicerRouter.get(
  '/me',
  asyncHandler(async (req, res) => res.json(await getMerchantProfile(req.user!.id))),
);

/** GET /merchant/me/personal — personal profile (User record linked by shared email). */
servicerRouter.get(
  '/me/personal',
  asyncHandler(async (req, res) => res.json(await getPersonalProfile(req.user!.email))),
);

/** PATCH /merchant/me/personal — update personal profile fields on the linked User record. */
servicerRouter.patch(
  '/me/personal',
  validate([
    body('name').optional().isString().trim().notEmpty(),
    body('phone').optional().isString().trim(),
    body('avatarUrl').optional({ values: 'null' }).isString(),
    body('bio').optional({ values: 'null' }).isString().isLength({ max: 1000 }),
    body('contactName').optional({ values: 'null' }).isString().trim(),
    body('contactNumber').optional({ values: 'null' }).isString().trim(),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await updatePersonalProfile(req.user!.email, req.body));
  }),
);

/** POST /merchant/me/identity-change-request — request admin review of identity fields. */
servicerRouter.post(
  '/me/identity-change-request',
  validate([body('proposed').isObject()]),
  asyncHandler(async (req, res) => {
    const result = await createIdentityChangeRequest(req.user!.id, req.body.proposed);
    res.status(201).json(result);
  }),
);


/** GET /merchant/me/deposit — deposit balances. */
servicerRouter.get(
  '/me/deposit',
  asyncHandler(async (req, res) => {
    const profile = await getMerchantProfile(req.user!.id);
    res.json({
      totalDeposited: profile.deposit?.totalDeposited ?? 0,
      currentBalance: profile.deposit?.currentBalance ?? 0,
      minimumRequired: profile.deposit?.minimumRequired ?? 100,
      creditBalance: profile.creditBalance,
    });
  }),
);

/** POST /merchant/me/deposit — record a deposit top-up request. */
servicerRouter.post(
  '/me/deposit',
  idempotency,
  validate([
    body('amount').isFloat({ gt: 0 }),
    body('paymentReference').isString().trim().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    res.status(201).json(await requestDepositTopup(req.user!.id, req.body));
  }),
);

/** PATCH /merchant/me — update editable profile fields. */
servicerRouter.patch(
  '/me',
  validate([
    body('bio').optional().isString().trim().isLength({ max: 1000 }),
    body('logoUrl').optional().isString().trim().isURL(),
    body('serviceAreas').optional().isArray({ max: 20 }),
    body('serviceAreas.*').optional().isString().trim().notEmpty(),
    body('invoicePrefix').optional().isString().trim().isLength({ max: 10 }),
    body('invoiceYearFormat').optional().isIn(['YYYY', 'YY', 'none']),
    body('invoiceSeparator').optional().isString().trim().isLength({ max: 3 }),
    body('invoicePadding').optional().isInt({ min: 1, max: 8 }),
    body('showEmailPublic').optional().isBoolean(),
    body('showPhonePublic').optional().isBoolean(),
    body('invoiceContent').optional().isString().trim().isLength({ max: 20 }),
    body('invoiceSuffix').optional().isString().trim().isLength({ max: 20 }),
    body('bankName').optional().isString().trim().notEmpty(),
    body('bankAccount').optional().isString().trim().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await updateMerchantProfile(req.user!.id, req.body));
  }),
);

/** PATCH /merchant/me/online — toggle online status (V1: no-op, endpoint for post-V1). */
servicerRouter.patch(
  '/me/online',
  validate([body('isOnline').isBoolean()]),
  asyncHandler(async (req, res) => {
    await setMerchantOnline(req.user!.id, req.body.isOnline);
    res.status(204).send();
  }),
);

/** GET /merchant/me/earnings/today */
servicerRouter.get(
  '/me/earnings/today',
  asyncHandler(async (req, res) => res.json(await getEarningsToday(req.user!.id))),
);

/** GET /merchant/me/earnings/daily?days=30 */
servicerRouter.get(
  '/me/earnings/daily',
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30));
    res.json(await getEarningsDaily(req.user!.id, days));
  }),
);

/**
 * GET /merchant/me/earnings/export?week=2026-05-18
 * Streams a PDF earnings summary for the requested week (defaults to current week).
 * The `week` param must be a Monday ISO date (YYYY-MM-DD) or is ignored.
 */
servicerRouter.get(
  '/me/earnings/export',
  asyncHandler(async (req, res) => {
    const week = typeof req.query.week === 'string' ? req.query.week : undefined;
    const pdfBytes = await exportEarningsPdf(req.user!.id, week);
    const filename = `earnings-${week ?? new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBytes);
  }),
);

/** GET /merchant/me/credit-log — credit balance movement history. */
servicerRouter.get(
  '/me/credit-log',
  asyncHandler(async (req, res) => {
    res.json({ data: await listCreditLog(req.user!.id) });
  }),
);

// ── Invoices ─────────────────────────────────────────────────────────────────

/** GET /merchant/me/invoices?status=paid|unpaid */
servicerRouter.get(
  '/me/invoices',
  asyncHandler(async (req, res) => {
    res.json({ data: await listMerchantInvoices(req.user!.id, req.query.status as string | undefined) });
  }),
);

/** GET /merchant/me/invoices/by-booking/:bookingId — invoice for a specific booking. */
servicerRouter.get(
  '/me/invoices/by-booking/:bookingId',
  asyncHandler(async (req, res) => {
    res.json(await getMerchantInvoiceByBooking(req.user!.id, req.params.bookingId));
  }),
);

/** GET /merchant/me/invoices/:id — full invoice breakdown. */
servicerRouter.get(
  '/me/invoices/:id',
  asyncHandler(async (req, res) => {
    res.json(await getMerchantInvoice(req.user!.id, req.params.id));
  }),
);

// ── Penalties & appeals ──────────────────────────────────────────────────────

/** GET /merchant/me/penalties — list penalties with appeal status. */
servicerRouter.get(
  '/me/penalties',
  asyncHandler(async (req, res) => {
    res.json({ data: await listPenalties(req.user!.id) });
  }),
);

/** POST /merchant/me/penalties/:id/appeal — file an appeal for a penalty. */
servicerRouter.post(
  '/me/penalties/:id/appeal',
  validate([body('reason').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    res.status(201).json(await fileAppeal(req.user!.id, req.params.id, req.body.reason));
  }),
);

/** GET /merchant/me/penalties/:id/appeal — get appeal status. */
servicerRouter.get(
  '/me/penalties/:id/appeal',
  asyncHandler(async (req, res) => {
    res.json(await getPenaltyAppeal(req.user!.id, req.params.id));
  }),
);

// ── KYC documents ────────────────────────────────────────────────────────────

/** POST /merchant/me/documents — submit a KYC document (upload via presign first). */
servicerRouter.post(
  '/me/documents',
  validate([
    body('docType').isIn(['ic_front', 'ic_back', 'selfie', 'supporting']),
    body('fileId').isUUID(),
  ]),
  asyncHandler(async (req, res) => {
    res.status(201).json(await submitKycDocument(req.user!.id, req.body));
  }),
);

/** GET /merchant/me/documents — list submitted KYC documents and approval status. */
servicerRouter.get(
  '/me/documents',
  asyncHandler(async (req, res) => {
    res.json({ data: await listKycDocuments(req.user!.id) });
  }),
);

// ── Category requests ────────────────────────────────────────────────────────

/** POST /merchant/me/category-requests — request a new platform category. */
servicerRouter.post(
  '/me/category-requests',
  validate([
    body('name').isString().trim().notEmpty().isLength({ max: 100 }),
    body('parentCategoryId').optional({ values: 'null' }).isUUID(),
    body('description').optional().isString().isLength({ max: 500 }),
  ]),
  asyncHandler(async (req, res) => {
    res.status(201).json(await submitCategoryRequest(req.user!.id, req.body));
  }),
);

/** GET /merchant/me/category-requests — list own requests with status. */
servicerRouter.get(
  '/me/category-requests',
  asyncHandler(async (req, res) => {
    res.json({ data: await listCategoryRequests(req.user!.id) });
  }),
);

/** GET /merchant/me/withdrawals */
servicerRouter.get(
  '/me/withdrawals',
  asyncHandler(async (req, res) => {
    res.json({ data: await listMerchantWithdrawals(req.user!.id) });
  }),
);

/** POST /merchant/me/transfer — transfer between deposit and credit balances. */
servicerRouter.post(
  '/me/transfer',
  idempotency,
  validate([
    body('direction').isIn(['deposit_to_credit', 'credit_to_deposit']),
    body('amount').isFloat({ gt: 0 }),
    body('pin').isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await transferBalance(req.user!.id, req.body.direction, req.body.amount, req.body.pin));
  }),
);

/** POST /merchant/me/topup — create a Stripe Checkout session for credit top-up. */
servicerRouter.post(
  '/me/topup',
  idempotency,
  validate([
    body('amount').isFloat({ min: 10 }),
  ]),
  asyncHandler(async (req, res) => {
    const amount = req.body.amount;
    const appUrl = req.get('origin') ?? process.env.APP_URL ?? 'http://localhost:4200';

    if (isStripeConfigured()) {
      const { url, sessionId } = await createTopUpSession(
        req.user!.id, amount,
        `${appUrl}/servicer/deposit?topup=success&session_id={CHECKOUT_SESSION_ID}`,
        `${appUrl}/servicer/deposit?topup=cancelled`,
        'servicer',
      );
      res.json({ url, sessionId });
      return;
    }

    if (isProd) {
      throw badRequest('Stripe is not configured. Set STRIPE_SECRET_KEY in backend/.env');
    }

    await prisma.servicer.update({
      where: { id: req.user!.id },
      data: { creditBalance: { increment: amount } },
    });
    res.json({ url: null, sessionId: null, message: `Dev fallback: RM ${amount} credited` });
  }),
);

/** POST /merchant/me/withdrawal — request a withdrawal of credit (PIN-gated, uses stored bank details). */
servicerRouter.post(
  '/me/withdrawal',
  idempotency,
  validate([
    body('amount').isFloat({ gt: 0 }),
    body('pin').isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await depositRequestWithdrawal(req.user!.id, req.body.amount, req.body.pin));
  }),
);

// ── Promotions ───────────────────────────────────────────────────────────────

/** GET /merchant/me/promotions */
servicerRouter.get(
  '/me/promotions',
  asyncHandler(async (req, res) => {
    res.json({ data: await listMerchantPromotions(req.user!.id) });
  }),
);

/** POST /merchant/me/promotions */
servicerRouter.post(
  '/me/promotions',
  validate([
    body('code').isString().trim().isLength({ min: 3, max: 30 }),
    body('discountType').isIn(['percent', 'fixed']),
    body('value').isFloat({ gt: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createMerchantPromotion(req.user!.id, req.body));
  }),
);

/** PATCH /merchant/me/promotions/:id */
servicerRouter.patch(
  '/me/promotions/:id',
  validate([
    body('isActive').optional().isBoolean(),
    body('maxUses').optional({ nullable: true }).isInt({ min: 1 }),
    body('expiresAt').optional({ nullable: true }).isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await updateMerchantPromotion(req.user!.id, req.params.id, req.body));
  }),
);

/** DELETE /merchant/me/promotions/:id — deactivate. */
servicerRouter.delete(
  '/me/promotions/:id',
  asyncHandler(async (req, res) => {
    await deactivateMerchantPromotion(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);

// ── Services ─────────────────────────────────────────────────────────────────

/** GET /merchant/me/services */
servicerRouter.get(
  '/me/services',
  asyncHandler(async (req, res) => {
    res.json({ data: await listServices(req.user!.id) });
  }),
);

/** GET /merchant/me/subcategories — big category + its sub-categories. */
servicerRouter.get(
  '/me/subcategories',
  asyncHandler(async (req, res) => {
    res.json(await listSubcategories(req.user!.id));
  }),
);

const serviceValidators = [
  body('title').isString().trim().notEmpty(),
  body('basePrice').isFloat({ min: 0 }),
  body('priceType').isIn(['fixed', 'hourly', 'quote']),
  body('taxMode').isIn(['inclusive', 'exclusive', 'none']),
  body('estimatedDurationMinutes').isInt({ min: 1 }),
  body('subcategoryId').optional({ values: 'null' }).isUUID(),
  body('newSubcategoryName').optional({ values: 'null' }).isString().trim().isLength({ max: 80 }),
  body('taxName').optional({ values: 'null' }).isString().trim(),
  body('taxRate').optional({ values: 'null' }).isFloat({ min: 0, max: 100 }),
  // Phase 6: modifiers is now an OptionPriceMap object, not an array.
  body('modifiers').optional({ values: 'null' }).isObject(),
];

/** Partial validators for PATCH — same rules but all fields optional. */
const servicePatchValidators = [
  body('title').optional().isString().trim().notEmpty(),
  body('basePrice').optional().isFloat({ min: 0 }),
  body('priceType').optional().isIn(['fixed', 'hourly', 'quote']),
  body('taxMode').optional().isIn(['inclusive', 'exclusive', 'none']),
  body('estimatedDurationMinutes').optional().isInt({ min: 1 }),
  body('subcategoryId').optional({ values: 'null' }).isUUID(),
  body('newSubcategoryName').optional({ values: 'null' }).isString().trim().isLength({ max: 80 }),
  body('taxName').optional({ values: 'null' }).isString().trim(),
  body('taxRate').optional({ values: 'null' }).isFloat({ min: 0, max: 100 }),
  body('modifiers').optional({ values: 'null' }).isObject(),
];

/** POST /merchant/me/services */
servicerRouter.post(
  '/me/services',
  validate(serviceValidators),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createService(req.user!.id, req.body));
  }),
);

/** PATCH /merchant/me/services/:id */
servicerRouter.patch(
  '/me/services/:id',
  validate(servicePatchValidators),
  asyncHandler(async (req, res) => {
    res.json(await updateService(req.user!.id, req.params.id, req.body));
  }),
);

/** DELETE /merchant/me/services/:id — soft delete. */
servicerRouter.delete(
  '/me/services/:id',
  asyncHandler(async (req, res) => {
    await deleteService(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);

/** PATCH /merchant/me/services/:id/auto-accept */
servicerRouter.patch(
  '/me/services/:id/auto-accept',
  validate([body('autoAccept').isBoolean()]),
  asyncHandler(async (req, res) => {
    res.json(await configureAutoAccept(req.user!.id, req.params.id, req.body));
  }),
);

// ── Proposal presets ─────────────────────────────────────────────────────────

/** GET /merchant/me/proposal-presets */
servicerRouter.get(
  '/me/proposal-presets',
  asyncHandler(async (req, res) => {
    res.json({ data: await listPresets(req.user!.id) });
  }),
);

/** POST /merchant/me/proposal-presets */
servicerRouter.post(
  '/me/proposal-presets',
  validate([
    body('name').isString().trim().notEmpty(),
    body('message').isString().trim().notEmpty(),
    body('priceOffset').optional().isFloat(),
  ]),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createPreset(req.user!.id, req.body));
  }),
);

/** PATCH /merchant/me/proposal-presets/:id */
servicerRouter.patch(
  '/me/proposal-presets/:id',
  validate([
    body('name').optional().isString().trim().notEmpty().isLength({ max: 100 }),
    body('message').optional().isString().trim().notEmpty().isLength({ max: 1000 }),
    body('priceOffset').optional().isFloat(),
    body('isDefault').optional().isBoolean(),
    body('sortOrder').optional().isInt({ min: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await updatePreset(req.user!.id, req.params.id, req.body));
  }),
);

/** DELETE /merchant/me/proposal-presets/:id */
servicerRouter.delete(
  '/me/proposal-presets/:id',
  asyncHandler(async (req, res) => {
    await deletePreset(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);

// ── Incoming quotes ──────────────────────────────────────────────────────────

/** GET /merchant/quotes — quotes broadcast to this merchant. */
servicerRouter.get(
  '/quotes',
  asyncHandler(async (req, res) => {
    const data = await listIncomingQuotes(req.user!.id, req.query.status as string | undefined);
    res.json({ data });
  }),
);

/**
 * POST /merchant/quotes/:id/open — mark a broadcast quote as opened.
 *
 * Phase 6: now returns 200 JSON with `proposalPrefill` (was 204 No Content).
 * `proposalPrefill` is null when the category has no priced questions.
 * When non-null it contains `defaultTotal`, `basePrice`, and `breakdown[]`
 * so the proposal form can pre-fill the price box.
 */
servicerRouter.post(
  '/quotes/:id/open',
  idempotency,
  asyncHandler(async (req, res) => {
    const result = await openQuote(req.user!.id, req.params.id);
    res.json(result);
  }),
);

/** POST /merchant/quotes/:id/propose — submit a proposal. */
servicerRouter.post(
  '/quotes/:id/propose',
  proposalLimiter,
  validate([
    body('proposedPrice').isFloat({ gt: 0 }).withMessage('proposedPrice must be positive'),
    body('message').optional().isString().isLength({ max: 1000 }),
    body('etaMinutes').optional().isInt({ min: 0 }),
    body('presetId').optional().isUUID(),
    body('lineItems').optional().isArray(),
    body('lineItems.*.label').if(body('lineItems').exists()).isString().trim().notEmpty().isLength({ max: 200 }),
    body('lineItems.*.amount').if(body('lineItems').exists()).isFloat({ min: 0 }),
    body('lineItems.*.taxable').optional().isBoolean(),
    body('lineItems.*.serviceChargeable').optional().isBoolean(),
    body('moduleRefs').optional().isArray(),
    body('moduleRefs.*.moduleId').if(body('moduleRefs').exists()).isUUID(),
    body('moduleRefs.*.overridePrice').optional({ values: 'null' }).isFloat({ min: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    const proposal = await submitProposal(req.user!.id, req.params.id, req.body);
    res.status(201).json(proposal);
  }),
);

// ── Jobs (bookings) ──────────────────────────────────────────────────────────

/** GET /merchant/jobs — this merchant's jobs. */
servicerRouter.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    res.json({ data: await listMerchantJobs(req.user!.id, req.query.status as string | undefined) });
  }),
);

/**
 * GET /merchant/bookings/:id/location — return customer lat/lng + address
 * for map display. Only servicers assigned to the booking can see this.
 */
servicerRouter.get(
  '/bookings/:id/location',
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, merchantId: req.user!.id },
      select: {
        id: true,
        quoteRequest: {
          select: {
            address: { select: { address: true, lat: true, lng: true } },
          },
        },
      },
    });
    if (!booking) throw notFound('Booking not found');
    res.json({
      bookingId: booking.id,
      address: booking.quoteRequest.address.address,
      lat: booking.quoteRequest.address.lat,
      lng: booking.quoteRequest.address.lng,
    });
  }),
);

/**
 * GET /merchant/bookings/:id/invoice-preview — returns a preview of what the
 * invoice WILL look like for a booking (for servicer review before marking done).
 * Calls computeTotal() with the actual line items but creates no database row.
 */
servicerRouter.get(
  '/bookings/:id/invoice-preview',
  asyncHandler(async (req, res) => {
    res.json(await getInvoicePreview(req.user!.id, req.params.id));
  }),
);

/** GET /merchant/jobs/:id — full booking detail. */
servicerRouter.get(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    res.json(await getMerchantJob(req.user!.id, req.params.id));
  }),
);

/** POST /merchant/jobs/:id/confirm — confirm a pending job. */
servicerRouter.post(
  '/jobs/:id/confirm',
  validate([body('confirm').isBoolean().toBoolean()]),
  asyncHandler(async (req, res) => {
    res.json(await confirmJob(req.user!.id, req.params.id));
  }),
);

/** POST /merchant/jobs/:id/arrive — mark arrived with an optional arrival photo. */
servicerRouter.post(
  '/jobs/:id/arrive',
  asyncHandler(async (req, res) => {
    res.json(await arriveJob(req.user!.id, req.params.id, req.body.photoUrl ?? null));
  }),
);

/** POST /merchant/jobs/:id/done — mark job done with an optional completion photo. */
servicerRouter.post(
  '/jobs/:id/done',
  asyncHandler(async (req, res) => {
    res.json(await doneJob(req.user!.id, req.params.id, req.body.photoUrl ?? null));
  }),
);

/** POST /merchant/jobs/:id/cash-confirm — confirm cash received (cash jobs only). */
servicerRouter.post(
  '/jobs/:id/cash-confirm',
  idempotency,
  asyncHandler(async (req, res) => {
    res.json(await cashConfirm(req.user!.id, req.params.id));
  }),
);

/** POST /merchant/jobs/:id/cancel — cancel after taking (triggers penalty). */
servicerRouter.post(
  '/jobs/:id/cancel',
  validate([body('reason').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    res.json(await merchantCancelJob(req.user!.id, req.params.id, req.body.reason));
  }),
);

/** POST /merchant/jobs/:id/mutual-cancel — ask customer to cancel instead (no penalty). */
servicerRouter.post(
  '/jobs/:id/mutual-cancel',
  validate([body('reason').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    res.json(await requestMutualCancel(req.user!.id, req.params.id, req.body.reason));
  }),
);

// ── Calendar ─────────────────────────────────────────────────────────────────

/**
 * GET /merchant/calendar?month=2026-05
 * Returns all bookings for the servicer in the given month, grouped by date.
 * Each booking includes: id, timeSlot, status, price, paymentMode, paid flag,
 * category, contactName, contactNumber, address fields, notes, serviceDetails.
 */
servicerRouter.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const merchantId = req.user!.id;
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7); // "2026-05"
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const mon = parseInt(monthStr, 10);
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 0, 23, 59, 59, 999);

    const bookings = await prisma.booking.findMany({
      where: {
        merchantId,
        scheduledDate: { gte: start, lte: end },
      },
      select: {
        id: true,
        scheduledDate: true,
        timeSlot: true,
        status: true,
        price: true,
        paymentMode: true,
        cashConfirmed: true,
        quoteRequest: {
          select: {
            category: { select: { name: true } },
            contactName: true,
            contactNumber: true,
            notes: true,
            serviceDetails: true,
            address: {
              select: { address: true, postcode: true, district: true, state: true },
            },
            user: { select: { name: true } },
          },
        },
      },
      orderBy: { scheduledDate: 'asc' },
    });

    // Group by date string
    const grouped: Record<string, unknown[]> = {};
    for (const b of bookings) {
      const dateKey = b.scheduledDate.toISOString().slice(0, 10);
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push({
        id: b.id,
        timeSlot: b.timeSlot,
        status: b.status,
        price: Number(b.price),
        paymentMode: b.paymentMode,
        paid: b.paymentMode === 'pay_now' ? true : b.cashConfirmed,
        category: b.quoteRequest.category.name,
        contactName: b.quoteRequest.contactName,
        contactNumber: b.quoteRequest.contactNumber,
        address: b.quoteRequest.address.address,
        postcode: b.quoteRequest.address.postcode,
        district: b.quoteRequest.address.district,
        state: b.quoteRequest.address.state,
        notes: b.quoteRequest.notes,
        serviceDetails: b.quoteRequest.serviceDetails,
        customerName: b.quoteRequest.user.name,
      });
    }

    res.json({ month, data: grouped });
  }),
);

// ── Dispatch (SP4) ──────────────────────────────────────────────────────────

/**
 * POST /merchant/dispatch/:broadcastId/accept — servicer accepts a dispatch prompt.
 * Atomic "first accept wins": on success, creates booking + notifies customer.
 */
servicerRouter.post(
  '/dispatch/:broadcastId/accept',
  idempotency,
  asyncHandler(async (req, res) => {
    const result = await handleDispatchAccept(req.user!.id, req.params.broadcastId);
    res.json(result);
  }),
);

/**
 * POST /merchant/dispatch/:broadcastId/decline — servicer declines a dispatch prompt.
 * Marks declined, rotates to next eligible merchant.
 */
servicerRouter.post(
  '/dispatch/:broadcastId/decline',
  asyncHandler(async (req, res) => {
    await handleDispatchDecline(req.user!.id, req.params.broadcastId);
    res.status(204).send();
  }),
);

// ── PIN management ────────────────────────────────────────────────────────────

/** GET /merchant/account/pin-status — check whether a PIN has been set. */
servicerRouter.get(
  '/account/pin-status',
  asyncHandler(async (req, res) => {
    const servicer = await prisma.servicer.findUnique({ where: { id: req.user!.id }, select: { pinHash: true } });
    res.json({ hasPin: !!servicer?.pinHash });
  }),
);

/** PUT /merchant/account/pin — set or change the servicer PIN. Current PIN is
 *  required only when one is already set (first-time setup needs none). */
servicerRouter.put(
  '/account/pin',
  validate([
    body('currentPin').optional({ values: 'falsy' }).isString().isLength({ min: 6, max: 6 }),
    body('newPin').isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const servicer = await prisma.servicer.findUnique({ where: { id: req.user!.id } });
    if (!servicer) throw notFound('Servicer not found');
    // First-time setup (no PIN yet) doesn't require a current PIN; once one is
    // set, the current PIN must match before it can be changed.
    if (servicer.pinHash) {
      const ok = await verifyPin(servicer, req.body.currentPin ?? '');
      if (!ok) throw badRequest('Current PIN is incorrect');
    }
    const pinHash = await bcrypt.hash(req.body.newPin, 12);
    await prisma.servicer.update({ where: { id: req.user!.id }, data: { pinHash } });
    res.json({ message: servicer.pinHash ? 'PIN updated' : 'PIN set' });
  }),
);

/** POST /merchant/account/verify-pin — verify a PIN, returns { ok: boolean }. */
servicerRouter.post(
  '/account/verify-pin',
  validate([
    body('pin').isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const servicer = await prisma.servicer.findUnique({ where: { id: req.user!.id } });
    if (!servicer) throw notFound('Servicer not found');
    const ok = await verifyPin(servicer, req.body.pin);
    res.json({ ok });
  }),
);

// ── Deactivate account ───────────────────────────────────────────────────────

/** POST /merchant/me/deactivate — permanently deactivate servicer account. */
servicerRouter.post(
  '/me/deactivate',
  requireAuth,
  requireServicer,
  validate([
    body('reason').isString().notEmpty().isLength({ max: 500 }),
    body('pin').isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const servicer = await prisma.servicer.findUnique({ where: { id: req.user!.id } });
    if (!servicer) throw notFound('Servicer not found');

    const ok = await verifyPin(servicer, req.body.pin);
    if (!ok) throw badRequest('Incorrect PIN.');

    await deactivateServicer(servicer, req.body.reason);
    res.json({ message: 'Account deactivated.' });
  }),
);

// ── Fee breakdown ─────────────────────────────────────────────────────────────

/** GET /merchant/me/fee-breakdown — platform fee transparency breakdown. */
servicerRouter.get(
  '/me/fee-breakdown',
  asyncHandler(async (req, res) => {
    const [feeRate, sstRate, servicer] = await Promise.all([
      getPlatformFeeRate(),
      getSstRate(),
      prisma.servicer.findUnique({
        where: { id: req.user!.id },
        select: { sstRegistered: true, serviceChargeRate: true },
      }),
    ]);
    const totalRate = Math.round(Number(feeRate) * 100);
    res.json({
      feeRate: Number(feeRate),
      sstRate: Number(sstRate),
      serviceChargeRate: Number(servicer?.serviceChargeRate ?? 0),
      sstRegistered: servicer?.sstRegistered ?? false,
      totalRate,
      breakdown: [
        { label: 'Rewards & promotions', percent: 8 },
        { label: 'Marketing & acquisition', percent: 5 },
        { label: 'Platform operations', percent: 4 },
        { label: 'Platform margin', percent: 3 },
      ],
    });
  }),
);

// ── Working-hours schedule ────────────────────────────────────────────────────

/** GET /merchant/me/schedule — all schedule slots for the authenticated servicer. */
servicerRouter.get(
  '/me/schedule',
  requireAuth,
  requireServicer,
  asyncHandler(async (req, res) => {
    const rows = await prisma.merchantSchedule.findMany({
      where: { merchantId: req.user!.id },
      orderBy: [{ weekday: 'asc' }, { timeSlot: 'asc' }],
    });
    res.json({ data: rows });
  }),
);

/** PATCH /merchant/me/schedule — upsert schedule slots.
 *  Body: { slots: Array<{ weekday, timeSlot, available }> }
 */
servicerRouter.patch(
  '/me/schedule',
  requireAuth,
  requireServicer,
  validate([
    body('slots').isArray({ min: 1 }),
    body('slots.*.weekday').isIn(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
    body('slots.*.timeSlot').isIn([...TIME_SLOTS]),
    body('slots.*.available').isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    const slots: { weekday: Weekday; timeSlot: TimeSlot; available: boolean }[] = req.body.slots;
    const merchantId = req.user!.id;

    await Promise.all(
      slots.map((slot) =>
        prisma.merchantSchedule.upsert({
          where: {
            merchantId_weekday_timeSlot: {
              merchantId,
              weekday: slot.weekday,
              timeSlot: slot.timeSlot,
            },
          },
          update: { isAvailable: slot.available },
          create: {
            merchantId,
            weekday: slot.weekday,
            timeSlot: slot.timeSlot,
            isAvailable: slot.available,
          },
        }),
      ),
    );

    const updated = await prisma.merchantSchedule.findMany({
      where: { merchantId },
      orderBy: [{ weekday: 'asc' }, { timeSlot: 'asc' }],
    });
    res.json({ data: updated });
  }),
);
