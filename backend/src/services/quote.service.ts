import { Servicer, ServicerService, Prisma, QuoteStatus, QuoteRequest } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { badRequest, conflict, notFound } from '../lib/errors';
import { pairedServicerIdFromEmail } from '../lib/paired-account';
import { emitToServicers, emitToUser } from '../socket';
import { enqueue, JOB_NAMES } from '../lib/queue';
import { getSetting, resolveBudgetRanges, getSstRate } from './settings.service';
import { evaluateAutoAcceptGates, QuoteLite, ListingLite, ServicerLite, ScheduleLite } from './sp3-auto-accept.service';
import { ModuleLite } from './listing-pricing.service';
import { submitProposal } from './servicer-quote.service';
import { requireNoUnpaidInvoice } from './booking.service';
import { notify } from './notification.service';
import { allowDemo } from '../config/env';
import { adjustCredit } from './credit.service';
import { recordTransaction } from './ledger.service';
import { haversineKm } from '../lib/distance';
import { computeHoldAmount } from '../lib/money';
import { TIME_SLOTS, TimeSlotValue } from '../lib/time-slots';
import { startDispatchRotation } from './dispatch.service';
import { jobDatetime, isPastJob, isSameDayMYT, resolveUrgentFee } from './quote-timing.service';

/** The 15-minute gap between servicer deadline and proposal deadline. */
const SERVICER_DEADLINE_OFFSET_MS = 15 * 60_000;

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
  /** @deprecated Deadline is now derived from the job time; ignored if passed. */
  proposalDeadline?: string;
  notes?: string;
  promoCode?: string;
  serviceDetails?: Record<string, string | string[]>;
  /** Optional customer-attached image URLs (confirmed upload URLs). Max 5. */
  images?: string[];
  /**
   * Rebook / direct-quote target. When set, the quote is NOT broadcast to all
   * matching servicers - it goes only to this one servicer (locked rebook).
   */
  targetServicerId?: string;
}

/**
 * Default radius in kilometres used to match a servicer's service areas
 * against the quote address when lat/lng coordinates are available.
 * A servicer who has set no service areas matches all addresses.
 */
export const DEFAULT_SERVICE_RADIUS_KM = 20;

/**
 * Finds servicers eligible to receive a quote broadcast: online, not banned,
 * registered under the quote's category, and covering the address area.
 *
 * Matching strategy:
 * 1. If the quote address has lat/lng coordinates, match by Haversine
 *    distance against every servicer who has coordinates on file (from
 *    their geocoded service areas or first address).
 * 2. Fall back to substring matching on serviceAreas when coordinates
 *    are not available.
 */
export async function findMatchingServicers(
  categoryId: string,
  addressText: string,
  addressLat?: number | null,
  addressLng?: number | null,
): Promise<{ servicer: Servicer; services: ServicerService[] }[]> {
  const servicers = await prisma.servicer.findMany({
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
    return servicers.filter((m) => {
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

      // No coordinate-based areas - substring matching against a free-text
      // address. The servicer must have at least one service area that
      // matches the address text to be included.
      const haystack = addressText.toLowerCase();
      return m.serviceAreas.some((a) => haystack.includes(a.toLowerCase()));
    }).map((m) => ({ servicer: m, services: m.services }));
  }

  // Fallback: without lat/lng we cannot do reliable geographic matching.
  // Substring matching against a free-text address is too brittle - the
  // address may not happen to contain the servicer's area name. Serve all
  // category-matched servicers so quotes are always visible.
  return servicers.map((m) => ({ servicer: m, services: m.services }));
}

/**
 * Resolves a single target servicer for a locked rebook / direct quote.
 * Unlike findMatchingServicers this ignores online status and service-area
 * matching - a rebook reaches the chosen servicer regardless (they can respond
 * when next online). The servicer must still exist, not be banned, and offer
 * the quote's category. Returns [] (caller treats as "unavailable") otherwise.
 */
export async function findTargetServicer(
  targetServicerId: string,
  categoryId: string,
): Promise<{ servicer: Servicer; services: ServicerService[] }[]> {
  const servicer = await prisma.servicer.findFirst({
    where: { id: targetServicerId, deletedAt: null, isBanned: false, categoryId },
    include: { services: { where: { deletedAt: null } } },
  });
  if (!servicer) return [];
  return [{ servicer, services: servicer.services }];
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
      // Waiver: zero out the booking total (service estimate) - return the estimated budget
      return budgetMax ?? 0;
    }

    // topup_fixed / topup_bonus are not applicable at quote time
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Creates a quote request, broadcasts it to matching servicers over Socket.io,
 * auto-submits proposals where servicer auto-accept rules match, and schedules
 * the quote.expiry / quote.no_response background jobs.
 */
export async function createQuote(
  userId: string,
  input: CreateQuoteInput,
  options?: { skipCreditCheck?: boolean; deferBroadcastUntilPayment?: boolean },
) {
  // Timing model (2026-06-23): the job's own start time drives the response
  // window. No customer-chosen deadline; no past-dated jobs.
  const preferred = new Date(input.preferredDate);
  if (Number.isNaN(preferred.getTime())) throw badRequest('preferredDate must be a valid date');
  const jobAt = jobDatetime(preferred, input.timeSlot);
  if (isPastJob(jobAt)) throw badRequest('Cannot request a job in the past - pick a current or future time.');

  // Servicers must respond before the job starts (buffer-trimmed); proposal
  // deadline == job start. Reuse the existing 15-min buffer constant.
  const servicerDeadline = new Date(jobAt.getTime() - SERVICER_DEADLINE_OFFSET_MS);
  const proposalDeadline = jobAt;

  // Same MYT calendar day → urgent surcharge (snapshot fee so later setting
  // changes never rewrite history).
  const urgentCfg = isSameDayMYT(jobAt, new Date()) ? await resolveUrgentFee() : null;
  const isUrgent = urgentCfg !== null;
  const urgentFee = urgentCfg ? urgentCfg.amount : null;

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

  // Budget must be one of the admin-configured ranges - category-aware.
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
  // is cancelled/expired. Only applies when a bounded budget max is given -
  // open-ended ranges (budgetMax = null) are held at proposal selection time.
  // Gateway (Stripe card) payments do NOT need a credit hold - the customer
  // pays via card, not from their wallet balance.
  // Hold amount is the canonical computeHoldAmount() - the SAME function that
  // GET /quotes/estimate uses to compute the holdAmount shown on the Bill step,
  // so the amount held here can never drift from the figure the customer saw
  // (BUG-4). Gateway (Stripe card) payments are paid via card, not the wallet,
  // so no credit hold applies.
  const baseHold =
    input.paymentMode === 'pay_now' && input.settlementMethod !== 'gateway'
      ? computeHoldAmount(input.budgetMax ?? null, input.tipAmount ?? 0)
      : 0;
  const creditHold = baseHold > 0 && urgentFee ? Math.round((baseHold + urgentFee) * 100) / 100 : baseHold;
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

  // Guest pay_now (gateway) defers the broadcast until the Stripe payment
  // settles: the quote is parked in pending_payment and NO broadcast / dispatch /
  // hold fires until the checkout.session.completed webhook calls
  // settleAndBroadcastGuestQuote(). Payment gate before broadcast (BE).
  const defer = options?.deferBroadcastUntilPayment === true;

  const quote = await prisma.quoteRequest.create({
    data: {
      userId,
      ...(defer ? { status: 'pending_payment' as QuoteStatus } : {}),
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
      // Persist the pay_later settlement choice so proposal-select can reuse it
      // without re-asking the customer. pay_now settles at the pay step.
      settlementMethod:
        input.paymentMode === 'pay_now' ? null : (input.settlementMethod ?? null),
      tipAmount: input.tipAmount ?? null,
      deadlineMode: input.deadlineMode,
      proposalDeadline,
      servicerDeadline,
      isUrgent,
      urgentFee,
      notes: input.notes ?? null,
      images: input.images ?? [],
      promoCode: input.promoCode ?? null,
      ...(input.serviceDetails
        ? { serviceDetails: input.serviceDetails as Prisma.InputJsonValue }
        : {}),
      lat: address.lat,
      lng: address.lng,
    },
  });

  // ── PAYMENT GATE (must pass BEFORE any broadcast / dispatch / notify) ────────
  // Deduct the pay-now credit hold up-front. If this throws, the quote row
  // exists but NO broadcast rows, socket events, servicer notifications, or
  // dispatch rotation have been created - nothing reaches a servicer until the
  // money is held (BE: payment gate before broadcast). pay_later / cash were
  // already gated by requireNoUnpaidInvoice() above. Guest pay_now (gateway)
  // funds an empty wallet via Stripe, so its hold + broadcast are deferred to
  // the checkout.session.completed webhook (settleAndBroadcastGuestQuote).
  if (creditHold > 0 && !defer) {
    await adjustCredit('user', userId, -creditHold);
    await recordTransaction({
      type: 'escrow_hold',
      amount: creditHold,
      userId,
      reference: `Budget hold for quote ${quote.id}`,
    });
  }

  // Deferred (guest pay_now / gateway): leave the quote pending_payment and do
  // NOT broadcast. The Stripe webhook settles payment, takes the hold, flips the
  // quote to open, and broadcasts it.
  if (defer) {
    logger.info('Quote created pending payment - broadcast deferred to Stripe webhook', {
      quoteId: quote.id,
    });
    return {
      id: quote.id,
      status: quote.status,
      servicerDeadline: quote.servicerDeadline,
      discountApplied,
      servicersNotified: 0,
      creditHeld: 0,
      remainingBalance: undefined,
    };
  }

  // Gate passed - broadcast the quote (match → broadcast rows → socket → notify
  // → auto-accept → dispatch rotation → background jobs). A targetServicerId
  // (locked rebook) sends to that one servicer only, never broadcasts.
  const { servicersNotified } = await broadcastQuote(quote.id, {
    targetServicerId: input.targetServicerId,
  });

  // Fetch the remaining balance after any deduction.
  const userAfter = creditHold > 0
    ? await prisma.user.findUnique({ where: { id: userId }, select: { creditBalance: true } })
    : null;

  logger.info('Quote created', { quoteId: quote.id, notified: servicersNotified });

  return {
    id: quote.id,
    status: quote.status,
    servicerDeadline: quote.servicerDeadline,
    discountApplied,
    servicersNotified,
    creditHeld: creditHold,
    remainingBalance: userAfter ? Number(userAfter.creditBalance) : undefined,
  };
}

/**
 * Broadcast a quote to matching servicers and start the dispatch / auto-accept /
 * background-job machinery. Split out of createQuote so the broadcast can be
 * GATED behind payment settlement (BE: payment gate before broadcast). Called
 * inline by createQuote once the payment gate passes, or deferred to the Stripe
 * checkout.session.completed webhook for guest pay_now (gateway) quotes.
 *
 * Idempotent: a quote that already has broadcast rows is a no-op (the webhook
 * may be redelivered). Returns the number of servicers notified.
 */
export async function broadcastQuote(
  quoteId: string,
  opts?: { targetServicerId?: string },
): Promise<{ servicersNotified: number }> {
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: quoteId },
    include: { category: true, address: true },
  });
  if (!quote) throw notFound('Quote not found');
  if (!quote.address) throw badRequest('Quote has no address to broadcast against');
  if (!quote.servicerDeadline) throw badRequest('Quote has no servicer deadline');

  // Idempotency - never double-broadcast (e.g. webhook redelivery).
  const alreadyBroadcast = await prisma.quoteBroadcast.count({ where: { quoteRequestId: quoteId } });
  if (alreadyBroadcast > 0) {
    return { servicersNotified: alreadyBroadcast };
  }

  const { address, category } = quote;

  // Locked rebook / direct quote: send to ONE servicer only, never broadcast.
  if (opts?.targetServicerId) {
    const matches = await findTargetServicer(opts.targetServicerId, quote.categoryId);
    return await dispatchMatches(quote, category, address, matches);
  }

  const fullAddressText = [address.address, address.district, address.state].filter(Boolean).join(', ');
  let matches = await findMatchingServicers(quote.categoryId, fullAddressText || address.address, address.lat, address.lng);

  // BE-044: a servicer must not be broadcast a quote created by their own
  // paired customer account ("customer mode" - it is the same person). Drop
  // that servicer from the match set so the self-quote never reaches their
  // QuoteBroadcast row, the quote.new socket event, the in-app notification,
  // or auto-accept proposal submission.
  const creator = await prisma.user.findUnique({
    where: { id: quote.userId },
    select: { email: true },
  });
  const selfServicerId = pairedServicerIdFromEmail(creator?.email);
  if (selfServicerId) {
    matches = matches.filter((m) => m.servicer.id !== selfServicerId);
  }
  return await dispatchMatches(quote, category, address, matches);
}

/**
 * Shared tail of broadcastQuote: create broadcast rows, emit the sanitised
 * socket event, notify each matched servicer, run auto-accept, start the
 * dispatch rotation, and schedule the expiry/no-response jobs. Used by both the
 * normal broadcast and the locked single-target rebook path.
 */
async function dispatchMatches(
  quote: QuoteRequest,
  category: { name: string },
  address: { address: string },
  matches: { servicer: Servicer; services: ServicerService[] }[],
): Promise<{ servicersNotified: number }> {
  if (!quote.servicerDeadline) throw badRequest('Quote has no servicer deadline');

  // Broadcast rows + sanitised socket event (no customer PII - security-notes §5).
  if (matches.length > 0) {
    await prisma.quoteBroadcast.createMany({
      data: matches.map((m) => ({ quoteRequestId: quote.id, servicerId: m.servicer.id })),
      skipDuplicates: true,
    });
    emitToServicers(
      matches.map((m) => m.servicer.id),
      'quote.new',
      {
        quoteId: quote.id,
        category: category.name,
        timeSlot: quote.timeSlot,
        budgetRange: {
          min: quote.budgetMin != null ? Number(quote.budgetMin) : null,
          max: quote.budgetMax != null ? Number(quote.budgetMax) : null,
        },
        propertyType: quote.propertyType,
        generalArea: deriveGeneralArea(address.address),
      },
    );
    // In-app notification per matched servicer (respects their settings -
    // category-tagged so the "followed categories" filter applies).
    for (const m of matches) {
      await notify({
        servicerId: m.servicer.id,
        type: 'jobs',
        message: `New ${category.name} quote request in your area.`,
        linkUrl: '/servicer/jobs',
        category: quote.categoryId,
      });
    }
  }

  // Auto-accept: SP-3 4-gate engine (§11). Replaces the legacy quoteMatchesAutoAccept.
  const sstRate = await getSstRate();

  // Pre-fetch all module refs from all matched services.
  const allModuleRefs = matches.flatMap((m) =>
    m.services.flatMap((s) => {
      if (!s.moduleRefs) return [];
      try {
        const parsed = JSON.parse(typeof s.moduleRefs === 'string' ? s.moduleRefs : JSON.stringify(s.moduleRefs));
        return Array.isArray(parsed) ? (parsed as Array<{ moduleId: string }>).map((r) => r.moduleId) : [];
      } catch {
        return [];
      }
    }),
  );
  const uniqueModuleIds = [...new Set(allModuleRefs)];
  const moduleRows = uniqueModuleIds.length > 0
    ? await prisma.servicerModule.findMany({
        where: { id: { in: uniqueModuleIds } },
        select: { id: true, name: true, price: true, questionKey: true, optionValue: true, durationMin: true },
      })
    : [];
  const modulesById = new Map<string, ModuleLite>(
    moduleRows.map((m) => [m.id, {
      id: m.id, name: m.name, price: Number(m.price),
      questionKey: m.questionKey, optionValue: m.optionValue,
      durationMin: m.durationMin,
    }]),
  );

  // Pre-fetch schedules for all matched servicers.
  const servicerIds = matches.map((m) => m.servicer.id);
  const allSchedules = await prisma.servicerSchedule.findMany({
    where: { servicerId: { in: servicerIds } },
    select: { servicerId: true, weekday: true, timeSlot: true, isAvailable: true },
  });
  const schedulesByServicer = new Map<string, ScheduleLite[]>();
  for (const s of allSchedules) {
    const arr = schedulesByServicer.get(s.servicerId) ?? [];
    arr.push({ weekday: s.weekday, timeSlot: s.timeSlot, isAvailable: s.isAvailable });
    schedulesByServicer.set(s.servicerId, arr);
  }

  const quoteLite: QuoteLite = {
    budgetMax: quote.budgetMax != null ? Number(quote.budgetMax) : null,
    lat: quote.lat ?? null,
    lng: quote.lng ?? null,
    preferredDate: quote.preferredDate,
    timeSlot: quote.timeSlot,
    answers: (quote.serviceDetails ?? {}) as Record<string, unknown>,
  };

  let autoCount = 0;
  for (const { servicer, services } of matches) {
    // Only evaluate listings that have auto-accept enabled.
    const candidates = services.filter((s) => s.autoAccept);
    if (candidates.length === 0) continue;

    const servicerLite: ServicerLite = {
      isOnline: servicer.isOnline,
      serviceAreas: servicer.serviceAreas,
      serviceRadiusKm: servicer.serviceRadiusKm ?? 10,
      serviceChargeRate: Number(servicer.serviceChargeRate ?? 0) || 0,
      sstRegistered: servicer.sstRegistered ?? false,
      taxInclusive: servicer.taxInclusive ?? false,
    };
    const schedules = schedulesByServicer.get(servicer.id) ?? [];

    for (const service of candidates) {
      const listingLite: ListingLite = {
        basePrice: Number(service.basePrice),
        estimatedDurationMinutes: service.estimatedDurationMinutes,
        modifiers: (service.modifiers ?? null) as ListingLite['modifiers'],
        moduleRefs: (service.moduleRefs ?? null) as ListingLite['moduleRefs'],
        autoAccept: service.autoAccept,
        priceType: service.priceType,
      };

      const result = evaluateAutoAcceptGates(quoteLite, listingLite, servicerLite, modulesById, sstRate, schedules);
      if (!result.pass) continue;

      try {
        await prisma.quoteProposal.create({
          data: {
            quoteRequestId: quote.id,
            servicerId: servicer.id,
            proposedPrice: result.total,
            lineItems: result.lineItems as unknown as Prisma.InputJsonValue,
            message: service.autoAcceptMessage ?? 'Auto-submitted proposal based on your saved listing.',
            etaMinutes: result.durationMin,
            isAuto: true,
          },
        });
        autoCount++;
      } catch (err) {
        logger.warn('Auto-accept proposal failed', {
          servicerId: servicer.id,
          error: (err as Error).message,
        });
      }
    }
  }

  // Auto-proposals never told the customer - notify once so a proposal that
  // arrives instantly (saved-rule auto-accept) still surfaces a notification +
  // refreshes the open proposals list, same as a manual proposal.
  if (autoCount > 0) {
    await notify({
      userId: quote.userId,
      type: 'orders',
      message:
        autoCount === 1
          ? `A servicer has submitted a proposal for your quote.`
          : `${autoCount} servicers have submitted proposals for your quote.`,
      linkUrl: `/customer/quotes/${quote.id}/proposals`,
      category: quote.categoryId,
    });
    emitToUser(quote.userId, 'proposal.submitted', { quoteId: quote.id });
  }

  // SP4 Dispatch rotation: for eligible non-auto-accept servicers, start the
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
    { delay: Math.max(0, quote.servicerDeadline.getTime() - Date.now()), jobId: `expiry:${quote.id}` },
  );
  await enqueue(
    JOB_NAMES.QUOTE_NO_RESPONSE,
    { quoteRequestId: quote.id, userId: quote.userId },
    { delay: Math.max(0, quote.proposalDeadline.getTime() - Date.now()), jobId: `noresp:${quote.id}` },
  );

  logger.info('Quote broadcast', { quoteId: quote.id, notified: matches.length, autoCount });
  return { servicersNotified: matches.length };
}

/**
 * Guest pay_now (gateway) settlement - called by the Stripe webhook once the
 * guest has funded their wallet via checkout.session.completed. Takes the budget
 * hold (escrow), broadcasts the quote, then flips it pending_payment → open.
 * This is the broadcast half of "payment gate before broadcast" for the guest
 * gateway path: nothing reaches a servicer until Stripe confirms the payment.
 *
 * Idempotent: a quote that is no longer pending_payment is a no-op, and
 * broadcastQuote() itself skips an already-broadcast quote.
 */
export async function settleAndBroadcastGuestQuote(quoteId: string): Promise<void> {
  const quote = await prisma.quoteRequest.findUnique({ where: { id: quoteId } });
  if (!quote) throw notFound('Quote not found');
  if (quote.status !== 'pending_payment') {
    logger.info('Guest quote already settled - skipping broadcast', { quoteId, status: quote.status });
    return;
  }

  // The wallet has just been funded by the Stripe top-up. Move the budget hold
  // into escrow, mirroring the registered pay_now path.
  const hold = computeHoldAmount(
    quote.budgetMax != null ? Number(quote.budgetMax) : null,
    quote.tipAmount != null ? Number(quote.tipAmount) : 0,
  );
  if (hold > 0) {
    await adjustCredit('user', quote.userId, -hold);
    await recordTransaction({
      type: 'escrow_hold',
      amount: hold,
      userId: quote.userId,
      reference: `Budget hold for quote ${quote.id}`,
    });
  }

  await broadcastQuote(quote.id);
  await prisma.quoteRequest.update({ where: { id: quote.id }, data: { status: 'open' } });
  logger.info('Guest quote settled and broadcast', { quoteId, hold });
}

function deriveGeneralArea(address: string): string {
  const parts = address.split(',').map((p) => p.trim());
  return parts.length > 1 ? parts[parts.length - 1] : address;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/**
 * Demo utility - generates one realistic open quote request from a random
 * demo customer, so a presenter can make the servicer incoming-quotes feed
 * light up on demand. Runs the real createQuote path (broadcast + jobs).
 * Development only.
 */
export async function seedDemoQuote() {
  if (!allowDemo) throw badRequest('Demo quote seeding is disabled in production');

  const customers = await prisma.user.findMany({
    where: { role: 'customer', deletedAt: null, addresses: { some: {} } },
    include: { addresses: true },
  });
  if (customers.length === 0) {
    throw badRequest('No demo customer with a saved address - reseed first');
  }
  const customer = pick(customers);
  const address = customer.addresses.find((a) => a.isDefault) ?? customer.addresses[0];

  const categories = await prisma.category.findMany({
    where: { deletedAt: null, parentCategoryId: null },
  });
  if (categories.length === 0) throw badRequest('No categories - reseed first');
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
    servicersNotified: result.servicersNotified,
  };
}

/**
 * Demo helper - generates one servicer proposal for an open quote request so
 * the customer's proposals feed can be shown filling up live. Picks the most
 * recent open quote still accepting proposals (the caller's own quote when the
 * caller is a customer) and a servicer the quote was broadcast to that has not
 * yet proposed.
 */
export async function seedDemoProposal(opts?: {
  userId?: string;
  ownQuotesOnly?: boolean;
}) {
  if (!allowDemo) throw badRequest('Demo proposal seeding is disabled in production');

  const quotes = await prisma.quoteRequest.findMany({
    where: {
      status: 'open',
      servicerDeadline: { gt: new Date() },
      ...(opts?.ownQuotesOnly && opts.userId ? { userId: opts.userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      category: { select: { name: true, imageUrl: true } },
      broadcasts: { include: { servicer: { select: { id: true, businessName: true } } } },
      proposals: { select: { servicerId: true } },
    },
  });

  for (const quote of quotes) {
    const alreadyProposed = new Set(quote.proposals.map((p) => p.servicerId));
    const candidate = quote.broadcasts.find((b) => !alreadyProposed.has(b.servicerId));
    if (!candidate) continue;

    const min = quote.budgetMin ? Number(quote.budgetMin) : 60;
    const max = quote.budgetMax ? Number(quote.budgetMax) : min + 120;
    const price = Math.round(min + Math.random() * Math.max(max - min, 20));

    await submitProposal(candidate.servicerId, quote.id, {
      proposedPrice: price,
      message: `Demo proposal from ${candidate.servicer.businessName} - happy to take on your ${quote.category.name.toLowerCase()} job.`,
      etaMinutes: pick([45, 60, 90, 120]),
    });

    return {
      quoteId: quote.id,
      category: quote.category.name,
      servicer: candidate.servicer.businessName,
      proposedPrice: price,
    };
  }

  throw badRequest(
    opts?.ownQuotesOnly
      ? 'None of your open quotes are awaiting proposals - create a quote first'
      : 'No open quote is awaiting proposals - create a demo quote first',
  );
}

const QUOTE_STATUSES = new Set<string>([
  'open',
  'pending_payment',
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

/** Bundled proposals for a quote - only visible to the owning customer. */
export async function getQuoteProposals(userId: string, quoteId: string) {
  const quote = await prisma.quoteRequest.findFirst({
    where: { id: quoteId, userId },
    include: { category: { select: { name: true, icon: true } } },
  });
  if (!quote) throw notFound('Quote not found');

  const proposals = await prisma.quoteProposal.findMany({
    where: { quoteRequestId: quoteId, status: { in: ['submitted', 'selected'] } },
    include: {
      servicer: { select: { id: true, businessName: true, rating: true, logoUrl: true } },
    },
    orderBy: { proposedPrice: 'asc' },
  });

  return proposals.map((p) => ({
    id: p.id,
    servicer: p.servicer,
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
export async function cancelQuote(userId: string, quoteId: string, reason?: string, details?: string): Promise<void> {
  const quote = await prisma.quoteRequest.findFirst({ where: { id: quoteId, userId } });
  if (!quote) throw notFound('Quote not found');
  if (quote.status !== 'open') {
    throw conflict('Quote is already matched, expired, or reposted');
  }

  // Store cancel reason in notes for admin visibility.
  const cancelNote = details ? `${reason}: ${details}` : reason;
  await prisma.quoteRequest.update({
    where: { id: quoteId },
    data: { status: 'cancelled', notes: cancelNote ?? 'Cancelled by customer' },
  });

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
      reference: `Refund - quote ${quoteId} cancelled by customer`,
    });
  }

  logger.info('Quote cancelled', { quoteId });

  // Notify broadcast servicers that the quote was cancelled.
  const broadcasts = await prisma.quoteBroadcast.findMany({
    where: { quoteRequestId: quoteId },
    select: { servicerId: true },
  });
  const servicerIds = broadcasts.map((b) => b.servicerId);
  if (servicerIds.length > 0) {
    emitToServicers(servicerIds, 'quote.cancelled', { quoteId });
    for (const servicerId of servicerIds) {
      await notify({
        servicerId,
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
 * Returns the updated quote id. Servicers are notified of the change.
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
    include: { broadcasts: { select: { servicerId: true } }, category: { select: { name: true } } },
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

  // Notify all servicers the quote was broadcast to.
  const servicerIds = quote.broadcasts.map((b) => b.servicerId);
  if (servicerIds.length > 0) {
    emitToServicers(servicerIds, 'quote.updated', { quoteId });
    for (const servicerId of servicerIds) {
      await notify({
        servicerId,
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

/** Guest quote - creates a guest user + address, then submits the quote via the normal flow. */
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
  }, {
    skipCreditCheck: true,
    // Guest pay_now funds an empty wallet via Stripe - hold the broadcast until
    // the checkout.session.completed webhook settles payment (payment gate
    // before broadcast). pay_later / cash guests broadcast immediately.
    deferBroadcastUntilPayment: input.paymentMode === 'pay_now',
  });
  return { ...result, userId: guest.id };
}
