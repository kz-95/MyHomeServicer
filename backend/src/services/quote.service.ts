import { Servicer, MerchantService, Prisma, QuoteStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { badRequest, conflict, notFound } from '../lib/errors';
import { pairedMerchantIdFromEmail } from '../lib/paired-account';
import { emitToMerchants } from '../socket';
import { enqueue, JOB_NAMES } from '../lib/queue';
import { quoteMatchesAutoAccept, computeAutoPrice } from './auto-accept.service';
import { getSetting, resolveBudgetRanges } from './settings.service';
import { submitProposal } from './servicer-quote.service';
import { requireNoUnpaidInvoice } from './booking.service';
import { notify } from './notification.service';
import { isProd } from '../config/env';
import { adjustCredit } from './credit.service';
import { recordTransaction } from './ledger.service';
import { haversineKm } from '../lib/distance';
import { computeHoldAmount } from '../lib/money';
import { TIME_SLOTS, TimeSlotValue } from '../lib/time-slots';
import { startDispatchRotation } from './dispatch.service';

/** The 15-minute gap between merchant deadline and proposal deadline. */
const MERCHANT_DEADLINE_OFFSET_MS = 15 * 60_000;

export interface CreateQuoteInput {
  categoryId: string;
  addressId?: string;
  address?: string;
  lat?: number;
  lng?: number;
  postcode?: string;
  district?: string;
  state?: string;
  contactName: string;
  contactNumber: string;
  timeSlot: TimeSlotValue;
  preferredDate: string;
  propertyType?: string;
  budgetMin?: number;
  budgetMax?: number;
  paymentMode: 'pay_now' | 'pay_later' | 'cash';
  settlementMethod?: 'credit' | 'gateway' | 'cash';
  tipAmount?: number;
  deadlineMode: 'fcfs' | 'fixed_time';
  proposalDeadline: string;
  notes?: string;
  promoCode?: string;
  serviceDetails?: Record<string, string | string[]>;
}

/**
 * Default radius in kilometres used to match a servicer's service areas
 * against the quote address when lat/lng coordinates are available.
 * A servicer who has set no service areas matches all addresses.
 */
export const DEFAULT_SERVICE_RADIUS_KM = 20;

/**
 * Finds merchants eligible to receive a quote broadcast: online, not banned,
 * registered under the quote's category, and covering the address area.
 *
 * Matching strategy:
 * 1. If the quote address has lat/lng coordinates, match by Haversine
 *    distance against every servicer who has coordinates on file (from
 *    their geocoded service areas or first address).
 * 2. Fall back to substring matching on serviceAreas when coordinates
 *    are not available.
 */
export async function findMatchingMerchants(
  categoryId: string,
  addressText: string,
  addressLat?: number | null,
  addressLng?: number | null,
): Promise<{ merchant: Servicer; services: MerchantService[] }[]> {
  const merchants = await prisma.servicer.findMany({
    where: {
      deletedAt: null,
      isBanned: false,
      isOnline: true,
      categoryId,
    },
    include: { services: { where: { deletedAt: null } } },
  });

  // When lat/lng is available, use geographic distance matching.
  // Falls back to substring matching for servicers whose areas don't parse
  // as coordinates (they haven't migrated to lat/lng yet).
  if (addressLat != null && addressLng != null) {
    return merchants.filter((m) => {
      // No service areas = serves everywhere.
      if (m.serviceAreas.length === 0) return true;

      // Check if any service area parses as coordinates
      const hasCoords = m.serviceAreas.some((a) => parseCoords(a) !== null);
      if (hasCoords) {
        // Match by distance for coordinate-based areas
        return m.serviceAreas.some((area) => {
          const coords = parseCoords(area);
          if (!coords) return false;
          const dist = haversineKm(addressLat, addressLng, coords.lat, coords.lng);
          return dist <= DEFAULT_SERVICE_RADIUS_KM;
        });
      }

      // No coordinate-based areas — substring matching against a free-text
      // address is brittle. If no area matches, serve anyway (false positive
      // is better than a missed quote).
      const haystack = addressText.toLowerCase();
      return m.serviceAreas.some((a) => haystack.includes(a.toLowerCase())) || true;
    }).map((m) => ({ merchant: m, services: m.services }));
  }

  // Fallback: without lat/lng we cannot do reliable geographic matching.
  // Substring matching against a free-text address is too brittle — the
  // address may not happen to contain the servicer's area name. Serve all
  // category-matched servicers so quotes are always visible.
  return merchants.map((m) => ({ merchant: m, services: m.services }));
}

/**
 * Attempt to parse a service area entry as "lat,lng" coordinates.
 * Returns null if the entry is not a valid coordinate pair.
 */
function parseCoords(area: string): { lat: number; lng: number } | null {
  const parts = area.split(',').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }
  return null;
}

/** Validate a promo code / voucher code and estimate the discount it would apply.
 *  Looks up a Redemption by voucherCode. Only booking_percent and waiver types
 *  are resolved here (topup vouchers are handled at top-up time, not quote time). */
export async function resolvePromo(code: string | undefined, budgetMax?: number): Promise<number> {
  if (!code) return 0;

  try {
    const redemption = await prisma.redemption.findUnique({
      where: { voucherCode: code },
      include: { reward: true },
    });
    if (!redemption) return 0;
    if (redemption.status !== 'active') return 0;
    if (redemption.expiresAt && redemption.expiresAt < new Date()) return 0;

    const discountType = redemption.reward.discountType;
    const discountValue = Number(redemption.reward.discountValue);

    if (discountType === 'booking_percent') {
      if (!budgetMax || budgetMax <= 0) return 0;
      const maxDiscount = redemption.reward.maxDiscount
        ? Number(redemption.reward.maxDiscount)
        : Infinity;
      const pctDiscount = (budgetMax * discountValue) / 100;
      return Math.min(pctDiscount, maxDiscount);
    }

    if (discountType === 'waiver') {
      // Waiver: zero out the booking total (service estimate) — return the estimated budget
      return budgetMax ?? 0;
    }

    // topup_fixed / topup_bonus are not applicable at quote time
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Creates a quote request, broadcasts it to matching merchants over Socket.io,
 * auto-submits proposals where merchant auto-accept rules match, and schedules
 * the quote.expiry / quote.no_response background jobs.
 */
export async function createQuote(
  userId: string,
  input: CreateQuoteInput,
  options?: { skipCreditCheck?: boolean },
) {
  const proposalDeadline = new Date(input.proposalDeadline);
  if (Number.isNaN(proposalDeadline.getTime()) || proposalDeadline <= new Date()) {
    throw badRequest('proposalDeadline must be a valid future timestamp');
  }
  const merchantDeadline = new Date(proposalDeadline.getTime() - MERCHANT_DEADLINE_OFFSET_MS);
  if (merchantDeadline <= new Date()) {
    throw badRequest('proposalDeadline must be at least 15 minutes in the future');
  }

  let address;
  if (input.addressId) {
    address = await prisma.userAddress.findFirst({ where: { id: input.addressId, userId } });
    if (!address) throw notFound('Address not found');
  } else if (input.address) {
    address = await prisma.userAddress.create({
      data: {
        userId,
        label: input.address,
        address: input.address,
        lat: input.lat,
        lng: input.lng,
        postcode: input.postcode,
        district: input.district,
        state: input.state,
      },
    });
  } else {
    throw badRequest('Either addressId or address must be provided');
  }

  const category = await prisma.category.findFirst({
    where: { id: input.categoryId, deletedAt: null },
  });
  if (!category) throw notFound('Category not found');

  if (input.tipAmount && input.paymentMode !== 'pay_now') {
    throw badRequest('tipAmount is only captured upfront for pay_now bookings');
  }

  // Soft enforcement: block new quotes if customer has any unpaid invoice
  // regardless of payment mode or due date (BE-1).
  await requireNoUnpaidInvoice(userId);

  // Budget must be one of the admin-configured ranges — category-aware.
  if (input.budgetMin !== undefined && input.budgetMin !== null) {
    const cfg = await getSetting<{ ranges: { min: number; max: number | null }[] | Record<string, { min: number; max: number | null }[]> }>(
      'budget_ranges',
    );
    const catRanges = resolveBudgetRanges(cfg, input.categoryId);
    const matches = catRanges.some(
      (r) => r.min === input.budgetMin && (r.max ?? null) === (input.budgetMax ?? null),
    );
    if (!matches) throw badRequest('Please choose a valid budget range');
  }

  const promoDiscount = await resolvePromo(input.promoCode, input.budgetMax);

  // Auto-discount for registered (non-guest) customers: fetch the
  // registered_customer_discount setting and apply it on top of any promo.
  let registeredDiscount = 0;
  if (!options?.skipCreditCheck && input.budgetMax != null) {
    const discountCfg = await getSetting<{ rate: number }>('registered_customer_discount').catch(() => null);
    if (discountCfg?.rate) {
      registeredDiscount = Math.round(input.budgetMax * discountCfg.rate * 100) / 100;
    }
  }
  const discountApplied = promoDiscount + registeredDiscount;

  // Pay-now: deduct budgetMax (or budgetMin if open-ended) + tip from customer
  // credit up-front and hold it until a proposal is selected or the quote
  // is cancelled/expired. Only applies when a bounded budget max is given —
  // open-ended ranges (budgetMax = null) are held at proposal selection time.
  // Gateway (Stripe card) payments do NOT need a credit hold — the customer
  // pays via card, not from their wallet balance.
  // Hold amount is the canonical computeHoldAmount() — the SAME function that
  // GET /quotes/estimate uses to compute the holdAmount shown on the Bill step,
  // so the amount held here can never drift from the figure the customer saw
  // (BUG-4). Gateway (Stripe card) payments are paid via card, not the wallet,
  // so no credit hold applies.
  const creditHold =
    input.paymentMode === 'pay_now' && input.settlementMethod !== 'gateway'
      ? computeHoldAmount(input.budgetMax ?? null, input.tipAmount ?? 0)
      : 0;
  if (creditHold > 0 && !options?.skipCreditCheck) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { creditBalance: true },
    });
    if (!user || Number(user.creditBalance) < creditHold) {
      throw badRequest(
        `Insufficient credit balance. Need RM ${creditHold.toFixed(2)} for pay-now.`,
      );
    }
  }

  const quote = await prisma.quoteRequest.create({
    data: {
      userId,
      categoryId: input.categoryId,
      addressId: address.id,
      contactName: input.contactName,
      contactNumber: input.contactNumber,
      timeSlot: input.timeSlot,
      preferredDate: new Date(input.preferredDate),
      propertyType: input.propertyType ?? address.propertyType,
      budgetMin: input.budgetMin ?? null,
      budgetMax: input.budgetMax ?? null,
      paymentMode: input.paymentMode,
      tipAmount: input.tipAmount ?? null,
      deadlineMode: input.deadlineMode,
      proposalDeadline,
      merchantDeadline,
      notes: input.notes ?? null,
      promoCode: input.promoCode ?? null,
      ...(input.serviceDetails
        ? { serviceDetails: input.serviceDetails as Prisma.InputJsonValue }
        : {}),
      lat: address.lat,
      lng: address.lng,
    },
  });

  const fullAddressText = [address.address, address.district, address.state].filter(Boolean).join(', ');
  let matches = await findMatchingMerchants(input.categoryId, fullAddressText || address.address, address.lat, address.lng);

  // BE-044: a merchant must not be broadcast a quote created by their own
  // paired customer account ("customer mode" — it is the same person). Drop
  // that merchant from the match set so the self-quote never reaches their
  // QuoteBroadcast row, the quote.new socket event, the in-app notification,
  // or auto-accept proposal submission.
  const creator = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const selfMerchantId = pairedMerchantIdFromEmail(creator?.email);
  if (selfMerchantId) {
    matches = matches.filter((m) => m.merchant.id !== selfMerchantId);
  }

  // Broadcast rows + sanitised socket event (no customer PII — security-notes §5).
  if (matches.length > 0) {
    await prisma.quoteBroadcast.createMany({
      data: matches.map((m) => ({ quoteRequestId: quote.id, merchantId: m.merchant.id })),
      skipDuplicates: true,
    });
    emitToMerchants(
      matches.map((m) => m.merchant.id),
      'quote.new',
      {
        quoteId: quote.id,
        category: category.name,
        timeSlot: quote.timeSlot,
        budgetRange: { min: input.budgetMin ?? null, max: input.budgetMax ?? null },
        propertyType: quote.propertyType,
        generalArea: deriveGeneralArea(address.address),
      },
    );
    // In-app notification per matched merchant (respects their settings —
    // category-tagged so the "followed categories" filter applies).
    for (const m of matches) {
      await notify({
        merchantId: m.merchant.id,
        type: 'jobs',
        message: `New ${category.name} quote request in your area.`,
        linkUrl: '/servicer/jobs',
        category: input.categoryId,
      });
    }
  }

  // Auto-accept: auto-submit a proposal for each merchant whose rules match.
  let autoCount = 0;
  for (const { merchant, services } of matches) {
    const service = services.find((s) => quoteMatchesAutoAccept(quote, s));
    if (!service) continue;
    try {
      const preset = service.autoAcceptPresetId
        ? await prisma.merchantProposalPreset.findUnique({ where: { id: service.autoAcceptPresetId } })
        : await prisma.merchantProposalPreset.findFirst({
            where: { merchantId: merchant.id, isDefault: true },
          });
      await prisma.quoteProposal.create({
        data: {
          quoteRequestId: quote.id,
          merchantId: merchant.id,
          proposedPrice: computeAutoPrice(
            Number(service.basePrice),
            preset?.priceOffset ? Number(preset.priceOffset) : 0,
          ),
          message: preset?.message ?? 'Auto-submitted proposal based on your saved rules.',
          etaMinutes: service.estimatedDurationMinutes,
          presetId: preset?.id ?? null,
          isAuto: true,
        },
      });
      autoCount++;
    } catch (err) {
      logger.warn('Auto-accept proposal failed', {
        merchantId: merchant.id,
        error: (err as Error).message,
      });
    }
  }

  // SP4 Dispatch rotation: for eligible non-auto-accept merchants, start the
  // real-time prompt rotation (one at a time, admin-configurable timer).
  // Only when the quote has no auto-created bookings yet.
  const anyAutoBooking = await prisma.booking.findFirst({
    where: { quoteRequestId: quote.id },
  });
  if (!anyAutoBooking) {
    // Fire-and-forget: the rotation runs via BullMQ timers.
    startDispatchRotation(quote.id).catch((err) =>
      logger.warn('Dispatch rotation startup failed', {
        quoteId: quote.id,
        error: (err as Error).message,
      }),
    );
  }

  // Schedule background jobs (idempotent jobIds prevent duplicate scheduling).
  await enqueue(
    JOB_NAMES.QUOTE_EXPIRY,
    { quoteRequestId: quote.id },
    { delay: Math.max(0, merchantDeadline.getTime() - Date.now()), jobId: `expiry:${quote.id}` },
  );
  await enqueue(
    JOB_NAMES.QUOTE_NO_RESPONSE,
    { quoteRequestId: quote.id, userId },
    { delay: Math.max(0, proposalDeadline.getTime() - Date.now()), jobId: `noresp:${quote.id}` },
  );

  // Deduct the credit hold after the quote row and all broadcasts are
  // committed. If this step fails the quote still exists but no money moved,
  // so the customer can retry. Ledger entry has no bookingId yet.
  if (creditHold > 0) {
    await adjustCredit('user', userId, -creditHold);
    await recordTransaction({
      type: 'escrow_hold',
      amount: creditHold,
      userId,
      reference: `Budget hold for quote ${quote.id}`,
    });
  }

  // Fetch the remaining balance after any deduction.
  const userAfter = creditHold > 0
    ? await prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true } })
    : null;

  logger.info('Quote created', { quoteId: quote.id, notified: matches.length, autoCount });

  return {
    id: quote.id,
    status: quote.status,
    merchantDeadline: quote.merchantDeadline,
    discountApplied,
    merchantsNotified: matches.length,
    creditHeld: creditHold,
    remainingBalance: userAfter ? Number(userAfter.creditBalance) : undefined,
  };
}

function deriveGeneralArea(address: string): string {
  const parts = address.split(',').map((p) => p.trim());
  return parts.length > 1 ? parts[parts.length - 1] : address;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Demo utility — generates one realistic open quote request from a random
 * demo customer, so a presenter can make the merchant incoming-quotes feed
 * light up on demand. Runs the real createQuote path (broadcast + jobs).
 * Development only.
 */
export async function seedDemoQuote() {
  if (isProd) throw badRequest('Demo quote seeding is disabled in production');

  const customers = await prisma.user.findMany({
    where: { role: 'customer', deletedAt: null, addresses: { some: {} } },
    include: { addresses: true },
  });
  if (customers.length === 0) {
    throw badRequest('No demo customer with a saved address — reseed first');
  }
  const customer = pick(customers);
  const address = customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0];

  const categories = await prisma.category.findMany({
    where: { deletedAt: null, parentCategoryId: null },
  });
  if (categories.length === 0) throw badRequest('No categories — reseed first');
  const category = pick(categories);

  const cfg = await getSetting<{ ranges: { min: number; max: number | null }[] | Record<string, { min: number; max: number | null }[]> }>(
    'budget_ranges',
  );
  const range = pick(resolveBudgetRanges(cfg, category.id));

  const result = await createQuote(customer.id, {
    categoryId: category.id,
    addressId: address.id,
    contactName: customer.contactName ?? customer.name,
    contactNumber: customer.contactNumber ?? customer.phone,
    timeSlot: pick([...TIME_SLOTS]),
    preferredDate: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    propertyType: address.propertyType ?? 'condo',
    budgetMin: range.min,
    budgetMax: range.max ?? undefined,
    paymentMode: 'pay_later',
    deadlineMode: 'fixed_time',
    proposalDeadline: new Date(Date.now() + 90 * 60_000).toISOString(),
    notes: 'Demo quote request generated for the live demo.',
  });

  return {
    quoteId: result.id,
    category: category.name,
    customer: customer.name,
    merchantsNotified: result.merchantsNotified,
  };
}

/**
 * Demo helper — generates one merchant proposal for an open quote request so
 * the customer's proposals feed can be shown filling up live. Picks the most
 * recent open quote still accepting proposals (the caller's own quote when the
 * caller is a customer) and a merchant the quote was broadcast to that has not
 * yet proposed.
 */
export async function seedDemoProposal(opts?: {
  userId?: string;
  ownQuotesOnly?: boolean;
}) {
  if (isProd) throw badRequest('Demo proposal seeding is disabled in production');

  const quotes = await prisma.quoteRequest.findMany({
    where: {
      status: 'open',
      merchantDeadline: { gt: new Date() },
      ...(opts?.ownQuotesOnly && opts.userId ? { userId: opts.userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      category: { select: { name: true, imageUrl: true } },
      broadcasts: { include: { merchant: { select: { id: true, businessName: true } } } },
      proposals: { select: { merchantId: true } },
    },
  });

  for (const quote of quotes) {
    const alreadyProposed = new Set(quote.proposals.map((p) => p.merchantId));
    const candidate = quote.broadcasts.find((b) => !alreadyProposed.has(b.merchantId));
    if (!candidate) continue;

    const min = quote.budgetMin ? Number(quote.budgetMin) : 60;
    const max = quote.budgetMax ? Number(quote.budgetMax) : min + 120;
    const price = Math.round(min + Math.random() * Math.max(max - min, 20));

    await submitProposal(candidate.merchantId, quote.id, {
      proposedPrice: price,
      message: `Demo proposal from ${candidate.merchant.businessName} — happy to take on your ${quote.category.name.toLowerCase()} job.`,
      etaMinutes: pick([45, 60, 90, 120]),
    });

    return {
      quoteId: quote.id,
      category: quote.category.name,
      merchant: candidate.merchant.businessName,
      proposedPrice: price,
    };
  }

  throw badRequest(
    opts?.ownQuotesOnly
      ? 'None of your open quotes are awaiting proposals — create a quote first'
      : 'No open quote is awaiting proposals — create a demo quote first',
  );
}

const QUOTE_STATUSES = new Set<string>([
  'open',
  'matched',
  'expired',
  'cancelled',
  'reposted',
]);

/** List the requesting customer's own quotes. */
export async function listMyQuotes(userId: string, status?: string) {
  const statusFilter = status && QUOTE_STATUSES.has(status) ? (status as QuoteStatus) : undefined;
  return prisma.quoteRequest.findMany({
    where: { userId, ...(statusFilter ? { status: statusFilter } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { category: { select: { name: true, slug: true, imageUrl: true, icon: true } }, _count: { select: { proposals: true } } },
  });
}

/** Fetch one quote owned by the customer with full detail. */
export async function getQuote(userId: string, quoteId: string) {
  const quote = await prisma.quoteRequest.findFirst({
    where: { id: quoteId, userId },
    include: {
      category: true,
      address: true,
      _count: { select: { proposals: true, broadcasts: true } },
    },
  });
  if (!quote) throw notFound('Quote not found');
  return quote;
}

/** Bundled proposals for a quote — only visible to the owning customer. */
export async function getQuoteProposals(userId: string, quoteId: string) {
  const quote = await prisma.quoteRequest.findFirst({
    where: { id: quoteId, userId },
    include: { category: { select: { name: true, icon: true } } },
  });
  if (!quote) throw notFound('Quote not found');

  const proposals = await prisma.quoteProposal.findMany({
    where: { quoteRequestId: quoteId, status: { in: ['submitted', 'selected'] } },
    include: {
      merchant: { select: { id: true, businessName: true, rating: true, logoUrl: true } },
    },
    orderBy: { proposedPrice: 'asc' },
  });

  return proposals.map((p) => ({
    id: p.id,
    merchant: p.merchant,
    proposedPrice: p.proposedPrice,
    message: p.message,
    etaMinutes: p.etaMinutes,
    isAuto: p.isAuto,
    submittedAt: p.createdAt,
    categoryName: quote.category.name,
    categoryIcon: quote.category.icon,
  }));
}

/** Cancel an open quote before any proposal is selected. */
export async function cancelQuote(userId: string, quoteId: string): Promise<void> {
  const quote = await prisma.quoteRequest.findFirst({ where: { id: quoteId, userId } });
  if (!quote) throw notFound('Quote not found');
  if (quote.status !== 'open') {
    throw conflict('Quote is already matched, expired, or reposted');
  }
  await prisma.quoteRequest.update({ where: { id: quoteId }, data: { status: 'cancelled' } });

  // Refund the credit hold that was taken at quote creation.
  const refundAmount =
    quote.paymentMode === 'pay_now' && quote.budgetMax != null
      ? Number(quote.budgetMax) + Number(quote.tipAmount ?? 0)
      : 0;
  if (refundAmount > 0) {
    await adjustCredit('user', userId, refundAmount);
    await recordTransaction({
      type: 'refund',
      amount: refundAmount,
      userId,
      reference: `Refund — quote ${quoteId} cancelled by customer`,
    });
  }

  logger.info('Quote cancelled', { quoteId });

  // Notify broadcast merchants that the quote was cancelled.
  const broadcasts = await prisma.quoteBroadcast.findMany({
    where: { quoteRequestId: quoteId },
    select: { merchantId: true },
  });
  const merchantIds = broadcasts.map((b) => b.merchantId);
  if (merchantIds.length > 0) {
    emitToMerchants(merchantIds, 'quote.cancelled', { quoteId });
    for (const merchantId of merchantIds) {
      await notify({
        merchantId,
        type: 'jobs',
        message: `A quote request was cancelled by the customer.`,
        linkUrl: '/servicer/jobs',
      });
    }
  }
}

/**
 * Update a still-open quote's non-pricing fields. Customers can change
 * contact info, timing and notes but NOT budget, payment mode, or tip.
 * Returns the updated quote id. Merchants are notified of the change.
 */
export async function updateQuote(
  userId: string,
  quoteId: string,
  input: {
    contactName?: string;
    contactNumber?: string;
    timeSlot?: TimeSlotValue;
    preferredDate?: string;
    notes?: string;
  },
): Promise<{ id: string }> {
  const quote = await prisma.quoteRequest.findFirst({
    where: { id: quoteId, userId },
    include: { broadcasts: { select: { merchantId: true } }, category: { select: { name: true } } },
  });
  if (!quote) throw notFound('Quote not found');
  if (quote.status !== 'open') {
    throw conflict('Only open quotes can be edited');
  }

  const data: Record<string, unknown> = {};
  if (input.contactName !== undefined) data.contactName = input.contactName.trim();
  if (input.contactNumber !== undefined) data.contactNumber = input.contactNumber.trim();
  if (input.timeSlot !== undefined) data.timeSlot = input.timeSlot;
  if (input.preferredDate !== undefined) {
    const d = new Date(input.preferredDate);
    if (Number.isNaN(d.getTime())) throw badRequest('Invalid preferredDate');
    data.preferredDate = d;
  }
  if (input.notes !== undefined) data.notes = input.notes.trim() || null;

  await prisma.quoteRequest.update({ where: { id: quoteId }, data });

  // Notify all merchants the quote was broadcast to.
  const merchantIds = quote.broadcasts.map((b) => b.merchantId);
  if (merchantIds.length > 0) {
    emitToMerchants(merchantIds, 'quote.updated', { quoteId });
    for (const merchantId of merchantIds) {
      await notify({
        merchantId,
        type: 'jobs',
        message: `Customer updated their ${quote.category.name} quote request.`,
        linkUrl: '/servicer/jobs',
        category: quote.categoryId,
      });
    }
  }

  logger.info('Quote updated', { quoteId });
  return { id: quoteId };
}

/** Repost an expired quote as a fresh request with the same form data. */
export async function repostQuote(userId: string, quoteId: string) {
  const original = await prisma.quoteRequest.findFirst({ where: { id: quoteId, userId } });
  if (!original) throw notFound('Quote not found');
  if (original.status !== 'expired') {
    throw conflict('Only expired quotes can be reposted');
  }

  // New deadlines: same window length, anchored to now.
  const windowMs = original.proposalDeadline.getTime() - original.createdAt.getTime();
  const proposalDeadline = new Date(Date.now() + Math.max(windowMs, 30 * 60_000));

  const result = await createQuote(userId, {
    categoryId: original.categoryId,
    addressId: original.addressId,
    contactName: original.contactName,
    contactNumber: original.contactNumber,
    timeSlot: original.timeSlot,
    preferredDate: original.preferredDate.toISOString(),
    propertyType: original.propertyType ?? undefined,
    budgetMin: original.budgetMin ? Number(original.budgetMin) : undefined,
    budgetMax: original.budgetMax ? Number(original.budgetMax) : undefined,
    paymentMode: original.paymentMode,
    tipAmount: original.tipAmount ? Number(original.tipAmount) : undefined,
    deadlineMode: original.deadlineMode,
    proposalDeadline: proposalDeadline.toISOString(),
    notes: original.notes ?? undefined,
  });

  await prisma.quoteRequest.update({
    where: { id: result.id },
    data: { parentQuoteId: original.id },
  });
  await prisma.quoteRequest.update({ where: { id: quoteId }, data: { status: 'reposted' } });

  return result;
}

/** Guest quote — creates a guest user + address, then submits the quote via the normal flow. */
export async function createGuestQuote(input: {
  categoryId: string;
  contactName: string;
  contactNumber: string;
  address: string;
  timeSlot: TimeSlotValue;
  preferredDate: string;
  budgetMin?: number;
  budgetMax?: number;
  paymentMode?: 'pay_now' | 'pay_later' | 'cash';
  settlementMethod?: 'gateway' | 'cash';
  lat?: number;
  lng?: number;
  postcode?: string;
  district?: string;
  state?: string;
  propertyType?: string;
  notes?: string;
  serviceDetails?: Record<string, string | string[]>;
}) {
  const now = Date.now();
  const guest = await prisma.user.create({
    data: {
      role: 'customer',
      name: input.contactName,
      email: `guest-${now}@guest.local`,
      phone: input.contactNumber,
      passwordHash: `guest-${now}`,
      contactName: input.contactName,
      contactNumber: input.contactNumber,
      preferredTimeSlot: input.timeSlot,
    },
  });

  const userAddress = await prisma.userAddress.create({
    data: {
      userId: guest.id,
      label: 'Home',
      address: input.address,
      isDefault: true,
      ...(input.lat != null ? { lat: input.lat } : {}),
      ...(input.lng != null ? { lng: input.lng } : {}),
      ...(input.postcode ? { postcode: input.postcode } : {}),
      ...(input.district ? { district: input.district } : {}),
      ...(input.state ? { state: input.state } : {}),
      ...(input.propertyType ? { propertyType: input.propertyType } : {}),
    },
  });

  const proposalDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const result = await createQuote(guest.id, {
    categoryId: input.categoryId,
    addressId: userAddress.id,
    contactName: input.contactName,
    contactNumber: input.contactNumber,
    timeSlot: input.timeSlot,
    preferredDate: input.preferredDate,
    budgetMin: input.budgetMin,
    budgetMax: input.budgetMax,
    paymentMode: input.paymentMode ?? 'pay_later',
    settlementMethod: input.paymentMode === 'pay_later' ? (input.settlementMethod ?? 'cash') : undefined,
    deadlineMode: 'fixed_time',
    proposalDeadline: proposalDeadline.toISOString(),
    propertyType: input.propertyType,
    notes: input.notes,
    serviceDetails: input.serviceDetails,
  }, { skipCreditCheck: true });
  return { ...result, userId: guest.id };
}
