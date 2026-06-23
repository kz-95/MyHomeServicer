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
import { checkPinCooldown, recordPinFailure, recordPinSuccess } from '../middleware/pin-cooldown';
import { proposalLimiter } from '../middleware/rate-limit';
import { idempotency } from '../middleware/idempotency';
import { badRequest, notFound } from '../lib/errors';
import {
  listIncomingQuotes,
  openQuote,
  submitProposal,
  acceptQuoteListing,
} from '../services/servicer-quote.service';
import {
  listServicerJobs,
  getServicerJob,
  confirmJob,
  arriveJob,
  doneJob,
  cashConfirm,
  servicerCancelJob,
  requestMutualCancel,
  reportBookingProblem,
} from '../services/booking.service';
import { ServicerTaxConfig } from '../lib/money';
import { OptionPriceMap, ModuleRef } from '../lib/json-schemas';
import {
  ModuleLite,
  ListingForPricing,
  Answers,
  computeListingPrice,
  computeListingDurationMin,
} from '../services/listing-pricing.service';
import {
  getServicerProfile,
  updateServicerProfile,
  getPersonalProfile,
  updatePersonalProfile,
  setServicerOnline,
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
  listServicerPromotions,
  createServicerPromotion,
  updateServicerPromotion,
  deactivateServicerPromotion,
  listServicerWithdrawals,
  requestDepositTopup,
} from '../services/servicer-account.service';
import {
  listServicerInvoices,
  getServicerInvoice,
  getServicerInvoiceByBooking,
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
import { switchToCustomer } from '../services/auth.service';
import {
  listContacts,
  createContact,
  updateContact,
  deleteContact,
} from '../services/servicer-contact.service';

/**
 * Servicer self-service router (`/servicer/*`). Quote endpoints land in
 * Phase 2; job, service, earnings and promotion endpoints are added in
 * Phases 3-4.
 */
export const servicerRouter = Router();
servicerRouter.use(requireAuth, requireServicer);

/**
 * POST /servicer/customer-session — enter "customer mode".
 * Returns (creating on first use) the servicer's paired customer-account session so
 * a servicer can operate the platform as a customer. The frontend stashes the
 * servicer session and swaps in these tokens. Mounted at /api/v1/servicer.
 */
servicerRouter.post(
  '/customer-session',
  asyncHandler(async (req, res) => {
    const { user, tokens } = await switchToCustomer(req.user!.id);
    res.json({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  }),
);

// ── Profile, earnings, deposit ───────────────────────────────────────────────

/** GET /servicer/me — servicer profile with settings. */
servicerRouter.get(
  '/me',
  asyncHandler(async (req, res) => res.json(await getServicerProfile(req.user!.id))),
);

/** GET /servicer/me/personal — personal profile (User record linked by shared email). */
servicerRouter.get(
  '/me/personal',
  asyncHandler(async (req, res) => res.json(await getPersonalProfile(req.user!.email))),
);

/** PATCH /servicer/me/personal — update personal profile fields on the linked User record. */
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

/** POST /servicer/me/identity-change-request — request admin review of identity fields. */
servicerRouter.post(
  '/me/identity-change-request',
  validate([body('proposed').isObject()]),
  asyncHandler(async (req, res) => {
    const result = await createIdentityChangeRequest(req.user!.id, req.body.proposed);
    res.status(201).json(result);
  }),
);


/** GET /servicer/me/deposit — deposit balances. */
servicerRouter.get(
  '/me/deposit',
  asyncHandler(async (req, res) => {
    const profile = await getServicerProfile(req.user!.id);
    res.json({
      totalDeposited: profile.deposit?.totalDeposited ?? 0,
      currentBalance: profile.deposit?.currentBalance ?? 0,
      minimumRequired: profile.deposit?.minimumRequired ?? 100,
      creditBalance: profile.creditBalance,
    });
  }),
);

/** POST /servicer/me/deposit — record a deposit top-up request. */
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

/** PATCH /servicer/me — update editable profile fields. */
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
    // Tax config
    body('sstRegistered').optional().isBoolean(),
    body('sstNumber').optional({ values: 'null' }).isString().trim(),
    body('serviceChargeRate').optional().isFloat({ min: 0, max: 100 }),
    body('taxInclusive').optional().isBoolean(),
    // Business identity
    body('businessName').optional().isString().trim().notEmpty(),
    body('entityType').optional({ values: 'null' }).isIn(['sole_proprietorship', 'partnership', 'enterprise', 'sdn_bhd']),
    body('businessRegistrationNumber').optional({ values: 'null' }).isString().trim(),
    body('taxNumber').optional({ values: 'null' }).isString().trim(),
    // Operating hours
    body('operatingHours').optional(),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await updateServicerProfile(req.user!.id, req.body));
  }),
);

/** PATCH /servicer/me/online — toggle online status (V1: no-op, endpoint for post-V1). */
servicerRouter.patch(
  '/me/online',
  validate([body('isOnline').isBoolean()]),
  asyncHandler(async (req, res) => {
    await setServicerOnline(req.user!.id, req.body.isOnline);
    res.status(204).send();
  }),
);

/** GET /servicer/me/earnings/today */
servicerRouter.get(
  '/me/earnings/today',
  asyncHandler(async (req, res) => res.json(await getEarningsToday(req.user!.id))),
);

/** GET /servicer/me/earnings/daily?days=30 */
servicerRouter.get(
  '/me/earnings/daily',
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '30'), 10) || 30));
    res.json(await getEarningsDaily(req.user!.id, days));
  }),
);

/**
 * GET /servicer/me/earnings/export?week=2026-05-18
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

/** GET /servicer/me/credit-log — credit balance movement history. */
servicerRouter.get(
  '/me/credit-log',
  asyncHandler(async (req, res) => {
    res.json({ data: await listCreditLog(req.user!.id) });
  }),
);

// ── Invoices ─────────────────────────────────────────────────────────────────

/** GET /servicer/me/invoices?status=paid|unpaid */
servicerRouter.get(
  '/me/invoices',
  asyncHandler(async (req, res) => {
    res.json({ data: await listServicerInvoices(req.user!.id, req.query.status as string | undefined) });
  }),
);

/** GET /servicer/me/invoices/by-booking/:bookingId — invoice for a specific booking. */
servicerRouter.get(
  '/me/invoices/by-booking/:bookingId',
  asyncHandler(async (req, res) => {
    res.json(await getServicerInvoiceByBooking(req.user!.id, req.params.bookingId));
  }),
);

/** GET /servicer/me/invoices/:id — full invoice breakdown. */
servicerRouter.get(
  '/me/invoices/:id',
  asyncHandler(async (req, res) => {
    res.json(await getServicerInvoice(req.user!.id, req.params.id));
  }),
);

// ── Penalties & appeals ──────────────────────────────────────────────────────

/** GET /servicer/me/penalties — list penalties with appeal status. */
servicerRouter.get(
  '/me/penalties',
  asyncHandler(async (req, res) => {
    res.json({ data: await listPenalties(req.user!.id) });
  }),
);

/** POST /servicer/me/penalties/:id/appeal — file an appeal for a penalty. */
servicerRouter.post(
  '/me/penalties/:id/appeal',
  validate([body('reason').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    res.status(201).json(await fileAppeal(req.user!.id, req.params.id, req.body.reason));
  }),
);

/** GET /servicer/me/penalties/:id/appeal — get appeal status. */
servicerRouter.get(
  '/me/penalties/:id/appeal',
  asyncHandler(async (req, res) => {
    res.json(await getPenaltyAppeal(req.user!.id, req.params.id));
  }),
);

// ── KYC documents ────────────────────────────────────────────────────────────

/** POST /servicer/me/documents — submit a KYC document (upload via presign first). */
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

/** GET /servicer/me/documents — list submitted KYC documents and approval status. */
servicerRouter.get(
  '/me/documents',
  asyncHandler(async (req, res) => {
    res.json({ data: await listKycDocuments(req.user!.id) });
  }),
);

// ── Category requests ────────────────────────────────────────────────────────

/** POST /servicer/me/category-requests — request a new platform category. */
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

/** GET /servicer/me/category-requests — list own requests with status. */
servicerRouter.get(
  '/me/category-requests',
  asyncHandler(async (req, res) => {
    res.json({ data: await listCategoryRequests(req.user!.id) });
  }),
);

/** GET /servicer/me/withdrawals */
servicerRouter.get(
  '/me/withdrawals',
  asyncHandler(async (req, res) => {
    res.json({ data: await listServicerWithdrawals(req.user!.id) });
  }),
);

/** POST /servicer/me/transfer — transfer between deposit and credit balances. */
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

/** POST /servicer/me/topup — create a Stripe Checkout session for credit top-up. */
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

/** POST /servicer/me/withdrawal — request a withdrawal of credit (PIN-gated, uses stored bank details). */
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

/** GET /servicer/me/promotions */
servicerRouter.get(
  '/me/promotions',
  asyncHandler(async (req, res) => {
    res.json({ data: await listServicerPromotions(req.user!.id) });
  }),
);

/** POST /servicer/me/promotions */
servicerRouter.post(
  '/me/promotions',
  validate([
    body('code').isString().trim().isLength({ min: 3, max: 30 }),
    body('discountType').isIn(['percent', 'fixed']),
    body('value').isFloat({ gt: 0 }),
  ]),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createServicerPromotion(req.user!.id, req.body));
  }),
);

/** PATCH /servicer/me/promotions/:id */
servicerRouter.patch(
  '/me/promotions/:id',
  validate([
    body('isActive').optional().isBoolean(),
    body('maxUses').optional({ nullable: true }).isInt({ min: 1 }),
    body('expiresAt').optional({ nullable: true }).isISO8601(),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await updateServicerPromotion(req.user!.id, req.params.id, req.body));
  }),
);

/** DELETE /servicer/me/promotions/:id — deactivate. */
servicerRouter.delete(
  '/me/promotions/:id',
  asyncHandler(async (req, res) => {
    await deactivateServicerPromotion(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);

// ── Services ─────────────────────────────────────────────────────────────────

/** GET /servicer/me/services */
servicerRouter.get(
  '/me/services',
  asyncHandler(async (req, res) => {
    res.json({ data: await listServices(req.user!.id) });
  }),
);

/** GET /servicer/me/subcategories — big category + its sub-categories. */
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
  // SP-3 §10.2: advanced-wizard fields (Zod-validated in the service layer).
  body('listingMode').optional().isIn(['simple', 'advanced']),
  body('moduleRefs').optional({ values: 'null' }).isArray(),
  body('autoAccept').optional().isBoolean(),
  body('autoAcceptMessage').optional({ values: 'null' }).isString().trim().isLength({ max: 200 }),
  body('imageUrl').optional({ values: 'null' }).isString().trim(),
  body('published').optional().isBoolean(),
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
  body('listingMode').optional().isIn(['simple', 'advanced']),
  body('moduleRefs').optional({ values: 'null' }).isArray(),
  body('autoAccept').optional().isBoolean(),
  body('autoAcceptMessage').optional({ values: 'null' }).isString().trim().isLength({ max: 200 }),
  body('imageUrl').optional({ values: 'null' }).isString().trim(),
  body('published').optional().isBoolean(),
];

/** POST /servicer/me/services */
servicerRouter.post(
  '/me/services',
  validate(serviceValidators),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createService(req.user!.id, req.body));
  }),
);

/** PATCH /servicer/me/services/:id */
servicerRouter.patch(
  '/me/services/:id',
  validate(servicePatchValidators),
  asyncHandler(async (req, res) => {
    res.json(await updateService(req.user!.id, req.params.id, req.body));
  }),
);

/** DELETE /servicer/me/services/:id — soft delete. */
servicerRouter.delete(
  '/me/services/:id',
  asyncHandler(async (req, res) => {
    await deleteService(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);

/** PATCH /servicer/me/services/:id/auto-accept */
servicerRouter.patch(
  '/me/services/:id/auto-accept',
  validate([body('autoAccept').isBoolean()]),
  asyncHandler(async (req, res) => {
    res.json(await configureAutoAccept(req.user!.id, req.params.id, req.body));
  }),
);

/**
 * GET /servicer/me/services/:id/preview — listing price breakdown preview.
 *
 * Query: ?answers={"type":"wall","units":{"unit":3}}  (optional JSON string)
 * Returns: lineItems[], total, subtotal, serviceCharge, sst, durationMin,
 *          autoAcceptEligible (boolean), autoAcceptReasons (why not, if any)
 */
servicerRouter.get(
  '/me/services/:id/preview',
  asyncHandler(async (req, res) => {
    const servicerId = req.user!.id;
    const serviceId = req.params.id;

    const service = await prisma.servicerService.findFirst({
      where: { id: serviceId, servicerId, deletedAt: null },
      select: {
        id: true, basePrice: true, estimatedDurationMinutes: true, priceType: true,
        autoAccept: true, modifiers: true, moduleRefs: true,
      },
    });
    if (!service) throw notFound('Listing not found');

    const [servicer, sstRate] = await Promise.all([
      prisma.servicer.findUnique({
        where: { id: servicerId },
        select: {
          isOnline: true, serviceAreas: true, serviceRadiusKm: true,
          serviceChargeRate: true, sstRegistered: true, taxInclusive: true,
        },
      }),
      getSstRate(),
    ]);

    // Parse optional answers from query string.
    let answersRaw: unknown = {};
    if (typeof req.query.answers === 'string') {
      try { answersRaw = JSON.parse(req.query.answers); } catch { /* leave empty */ }
    }

    // Resolve referenced modules.
    const moduleRefs: Array<{ moduleId: string }> = [];
    if (service.moduleRefs) {
      try {
        const parsed = JSON.parse(typeof service.moduleRefs === 'string' ? service.moduleRefs : JSON.stringify(service.moduleRefs));
        if (Array.isArray(parsed)) moduleRefs.push(...(parsed as Array<{ moduleId: string }>));
      } catch { /* leave empty */ }
    }
    const modulesById = new Map<string, ModuleLite>();
    if (moduleRefs.length > 0) {
      const rows = await prisma.servicerModule.findMany({
        where: { id: { in: moduleRefs.map((r) => r.moduleId) } },
        select: { id: true, name: true, price: true },
      });
      for (const m of rows) modulesById.set(m.id, { id: m.id, name: m.name, price: Number(m.price) });
    }

    const taxConfig: ServicerTaxConfig = {
      serviceChargeRate: Number(servicer?.serviceChargeRate ?? 0) || 0,
      sstRegistered: servicer?.sstRegistered ?? false,
      sstRate,
      taxInclusive: servicer?.taxInclusive ?? false,
    };

    const listing: ListingForPricing = {
      basePrice: Number(service.basePrice),
      estimatedDurationMinutes: service.estimatedDurationMinutes,
      modifiers: (service.modifiers ?? null) as OptionPriceMap | null,
      moduleRefs: moduleRefs.length > 0 ? moduleRefs as ModuleRef[] : null,
    };

    const breakdown = computeListingPrice(listing, modulesById, answersRaw as Answers, taxConfig, []);
    const durationMin = computeListingDurationMin(listing, answersRaw as Answers, []);

    // Auto-accept eligibility summary (without quote context — just structural check).
    const autoAcceptEligible = service.autoAccept && service.priceType === 'fixed';
    const autoAcceptReasons: string[] = [];
    if (!service.autoAccept) autoAcceptReasons.push('auto-accept is off');
    if (service.priceType !== 'fixed') autoAcceptReasons.push(`price type '${service.priceType}' does not auto-accept`);

    res.json({
      data: {
        listingId: service.id,
        basePrice: Number(service.basePrice),
        priceType: service.priceType,
        ...breakdown,
        durationMin,
        autoAccept: {
          eligible: autoAcceptEligible,
          reasons: autoAcceptReasons,
        },
      },
    });
  }),
);

// ── Proposal presets ─────────────────────────────────────────────────────────

/** GET /servicer/me/proposal-presets */
servicerRouter.get(
  '/me/proposal-presets',
  asyncHandler(async (req, res) => {
    res.json({ data: await listPresets(req.user!.id) });
  }),
);

/** POST /servicer/me/proposal-presets */
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

/** PATCH /servicer/me/proposal-presets/:id */
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

/** DELETE /servicer/me/proposal-presets/:id */
servicerRouter.delete(
  '/me/proposal-presets/:id',
  asyncHandler(async (req, res) => {
    await deletePreset(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);

// ── Incoming quotes ──────────────────────────────────────────────────────────

/** GET /servicer/quotes — quotes broadcast to this servicer. */
servicerRouter.get(
  '/quotes',
  asyncHandler(async (req, res) => {
    const data = await listIncomingQuotes(req.user!.id, req.query.status as string | undefined);
    res.json({ data });
  }),
);

/**
 * POST /servicer/quotes/:id/open — mark a broadcast quote as opened.
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

/** POST /servicer/quotes/:id/propose — submit a proposal. */
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

/**
 * POST /servicer/quotes/:id/accept-listing — one-tap accept.
 * Submits a proposal at the servicer's listing-computed price/duration/message
 * (SP-3 engine) with no manual form. The customer still picks among proposals.
 */
servicerRouter.post(
  '/quotes/:id/accept-listing',
  proposalLimiter,
  asyncHandler(async (req, res) => {
    const proposal = await acceptQuoteListing(req.user!.id, req.params.id);
    res.status(201).json(proposal);
  }),
);

// ── Jobs (bookings) ──────────────────────────────────────────────────────────

/** GET /servicer/jobs — this servicer's jobs. */
servicerRouter.get(
  '/jobs',
  asyncHandler(async (req, res) => {
    res.json({ data: await listServicerJobs(req.user!.id, req.query.status as string | undefined) });
  }),
);

/**
 * GET /servicer/bookings/:id/location — return customer lat/lng + address
 * for map display. Only servicers assigned to the booking can see this.
 */
servicerRouter.get(
  '/bookings/:id/location',
  asyncHandler(async (req, res) => {
    const booking = await prisma.booking.findFirst({
      where: { id: req.params.id, servicerId: req.user!.id },
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
 * GET /servicer/bookings/:id/invoice-preview — returns a preview of what the
 * invoice WILL look like for a booking (for servicer review before marking done).
 * Calls computeTotal() with the actual line items but creates no database row.
 */
servicerRouter.get(
  '/bookings/:id/invoice-preview',
  asyncHandler(async (req, res) => {
    res.json(await getInvoicePreview(req.user!.id, req.params.id));
  }),
);

/** GET /servicer/jobs/:id — full booking detail. */
servicerRouter.get(
  '/jobs/:id',
  asyncHandler(async (req, res) => {
    res.json(await getServicerJob(req.user!.id, req.params.id));
  }),
);

/** POST /servicer/jobs/:id/confirm — confirm a pending job. */
servicerRouter.post(
  '/jobs/:id/confirm',
  validate([body('confirm').isBoolean().toBoolean()]),
  asyncHandler(async (req, res) => {
    res.json(await confirmJob(req.user!.id, req.params.id));
  }),
);

/** POST /servicer/jobs/:id/arrive — mark arrived with an optional arrival photo. */
servicerRouter.post(
  '/jobs/:id/arrive',
  asyncHandler(async (req, res) => {
    res.json(await arriveJob(req.user!.id, req.params.id, req.body.photoUrl ?? null));
  }),
);

/** POST /servicer/jobs/:id/done — mark job done with an optional completion photo. */
servicerRouter.post(
  '/jobs/:id/done',
  asyncHandler(async (req, res) => {
    res.json(await doneJob(req.user!.id, req.params.id, req.body.photoUrl ?? null));
  }),
);

/** POST /servicer/jobs/:id/cash-confirm — confirm cash received (cash jobs only). */
servicerRouter.post(
  '/jobs/:id/cash-confirm',
  idempotency,
  asyncHandler(async (req, res) => {
    res.json(await cashConfirm(req.user!.id, req.params.id));
  }),
);

/** POST /servicer/jobs/:id/cancel — cancel after taking (triggers penalty). */
servicerRouter.post(
  '/jobs/:id/cancel',
  validate([body('reason').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    res.json(await servicerCancelJob(req.user!.id, req.params.id, req.body.reason));
  }),
);

/** POST /servicer/jobs/:id/mutual-cancel — ask customer to cancel instead (no penalty). */
servicerRouter.post(
  '/jobs/:id/mutual-cancel',
  validate([body('reason').isString().trim().notEmpty()]),
  asyncHandler(async (req, res) => {
    res.json(await requestMutualCancel(req.user!.id, req.params.id, req.body.reason));
  }),
);

/** POST /servicer/jobs/:id/report — report a problem with a job. */
servicerRouter.post(
  '/jobs/:id/report',
  validate([
    body('subject').isString().trim().notEmpty(),
    body('description').isString().trim().notEmpty(),
  ]),
  asyncHandler(async (req, res) => {
    const report = await reportBookingProblem(
      req.user!.id,
      req.params.id,
      req.body.subject,
      req.body.description,
    );
    res.status(201).json(report);
  }),
);

// ── Calendar ─────────────────────────────────────────────────────────────────

/**
 * GET /servicer/calendar?month=2026-05
 * Returns all bookings for the servicer in the given month, grouped by date.
 * Each booking includes: id, timeSlot, status, price, paymentMode, paid flag,
 * category, contactName, contactNumber, address fields, notes, serviceDetails.
 */
servicerRouter.get(
  '/calendar',
  asyncHandler(async (req, res) => {
    const servicerId = req.user!.id;
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7); // "2026-05"
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const mon = parseInt(monthStr, 10);
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 0, 23, 59, 59, 999);

    const bookings = await prisma.booking.findMany({
      where: {
        servicerId,
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
        isUrgent: true,
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
        isUrgent: b.isUrgent,
      });
    }

    res.json({ month, data: grouped });
  }),
);

// ── Dispatch (SP4) ──────────────────────────────────────────────────────────

/**
 * POST /servicer/dispatch/:broadcastId/accept — servicer accepts a dispatch prompt.
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
 * POST /servicer/dispatch/:broadcastId/decline — servicer declines a dispatch prompt.
 * Marks declined, rotates to next eligible servicer.
 */
servicerRouter.post(
  '/dispatch/:broadcastId/decline',
  asyncHandler(async (req, res) => {
    await handleDispatchDecline(req.user!.id, req.params.broadcastId);
    res.status(204).send();
  }),
);

// ── PIN management ────────────────────────────────────────────────────────────

/** GET /servicer/account/pin-status — check whether a PIN has been set. */
servicerRouter.get(
  '/account/pin-status',
  asyncHandler(async (req, res) => {
    const servicer = await prisma.servicer.findUnique({ where: { id: req.user!.id }, select: { pinHash: true } });
    res.json({ hasPin: !!servicer?.pinHash });
  }),
);

/** PUT /servicer/account/pin — set or change the servicer PIN. Current PIN is
 *  required only when one is already set (first-time setup needs none). */
servicerRouter.put(
  '/account/pin',
  validate([
    body('currentPin').optional({ values: 'falsy' }).isString().isLength({ min: 6, max: 6 }),
    body('newPin').isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const servicer = await prisma.servicer.findUnique({ where: { id: userId } });
    if (!servicer) throw notFound('Servicer not found');
    if (servicer.pinHash) {
      await checkPinCooldown(userId);
      const ok = await verifyPin(servicer, req.body.currentPin ?? '');
      if (!ok) {
        await recordPinFailure(userId);
        throw badRequest('Current PIN is incorrect');
      }
      await recordPinSuccess(userId);
    }
    const pinHash = await bcrypt.hash(req.body.newPin, 12);
    await prisma.servicer.update({ where: { id: userId }, data: { pinHash } });
    res.json({ message: servicer.pinHash ? 'PIN updated' : 'PIN set' });
  }),
);

/** POST /servicer/account/verify-pin — verify a PIN, returns { ok: boolean }. */
servicerRouter.post(
  '/account/verify-pin',
  validate([
    body('pin').isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    await checkPinCooldown(userId);
    const servicer = await prisma.servicer.findUnique({ where: { id: userId } });
    if (!servicer) throw notFound('Servicer not found');
    const ok = await verifyPin(servicer, req.body.pin);
    if (!ok) {
      await recordPinFailure(userId);
    } else {
      await recordPinSuccess(userId);
    }
    res.json({ ok });
  }),
);

// ── Business Contacts CRUD ─────────────────────────────────────────────────

/** GET /servicer/contacts — list all business contacts for the authenticated servicer. */
servicerRouter.get(
  '/contacts',
  asyncHandler(async (req, res) => {
    res.json({ data: await listContacts(req.user!.id) });
  }),
);

/** POST /servicer/contacts — create a new business contact. */
servicerRouter.post(
  '/contacts',
  validate([
    body('contactPerson').isString().trim().notEmpty(),
    body('number').optional({ values: 'null' }).isString().trim(),
    body('email').optional({ values: 'null' }).isEmail(),
    body('isPrimary').optional().isBoolean(),
    body('visibleToCustomer').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    res.status(201).json(await createContact(req.user!.id, req.body));
  }),
);

/** PATCH /servicer/contacts/:id — update a business contact. */
servicerRouter.patch(
  '/contacts/:id',
  validate([
    body('contactPerson').optional().isString().trim().notEmpty(),
    body('number').optional({ values: 'null' }).isString().trim(),
    body('email').optional({ values: 'null' }).isEmail(),
    body('isPrimary').optional().isBoolean(),
    body('visibleToCustomer').optional().isBoolean(),
  ]),
  asyncHandler(async (req, res) => {
    res.json(await updateContact(req.user!.id, req.params.id, req.body));
  }),
);

/** DELETE /servicer/contacts/:id — delete a business contact. */
servicerRouter.delete(
  '/contacts/:id',
  asyncHandler(async (req, res) => {
    await deleteContact(req.user!.id, req.params.id);
    res.status(204).send();
  }),
);

// ── Deactivate account ───────────────────────────────────────────────────────

/** POST /servicer/me/deactivate — permanently deactivate servicer account. */
servicerRouter.post(
  '/me/deactivate',
  requireAuth,
  requireServicer,
  validate([
    body('reason').isString().notEmpty().isLength({ max: 500 }),
    body('pin').isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    await checkPinCooldown(userId);
    const servicer = await prisma.servicer.findUnique({ where: { id: userId } });
    if (!servicer) throw notFound('Servicer not found');

    const ok = await verifyPin(servicer, req.body.pin);
    if (!ok) {
      await recordPinFailure(userId);
      throw badRequest('Incorrect PIN.');
    }
    await recordPinSuccess(userId);

    await deactivateServicer(servicer, req.body.reason);
    res.json({ message: 'Account deactivated.' });
  }),
);

// ── Fee breakdown ─────────────────────────────────────────────────────────────

/** GET /servicer/me/fee-breakdown — platform fee transparency breakdown. */
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

/** GET /servicer/me/schedule — all schedule slots for the authenticated servicer. */
servicerRouter.get(
  '/me/schedule',
  requireAuth,
  requireServicer,
  asyncHandler(async (req, res) => {
    const rows = await prisma.servicerSchedule.findMany({
      where: { servicerId: req.user!.id },
      orderBy: [{ weekday: 'asc' }, { timeSlot: 'asc' }],
    });
    res.json({ data: rows });
  }),
);

/** PATCH /servicer/me/schedule — upsert schedule slots.
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
    const servicerId = req.user!.id;

    await Promise.all(
      slots.map((slot) =>
        prisma.servicerSchedule.upsert({
          where: {
            servicerId_weekday_timeSlot: {
              servicerId,
              weekday: slot.weekday,
              timeSlot: slot.timeSlot,
            },
          },
          update: { isAvailable: slot.available },
          create: {
            servicerId,
            weekday: slot.weekday,
            timeSlot: slot.timeSlot,
            isAvailable: slot.available,
          },
        }),
      ),
    );

    const updated = await prisma.servicerSchedule.findMany({
      where: { servicerId },
      orderBy: [{ weekday: 'asc' }, { timeSlot: 'asc' }],
    });
    res.json({ data: updated });
  }),
);
