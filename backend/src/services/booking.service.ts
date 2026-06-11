import { BookingStatus, TimeSlot, Prisma, SettlementMethod } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { badRequest, businessRule, conflict, forbidden, notFound, paymentRequired } from '../lib/errors';
import { emitToUser, emitToMerchant, emitToMerchants } from '../socket';
import { requireOnboarded } from './servicer-quote.service';
import { enqueue, JOB_NAMES } from '../lib/queue';
import { recordTransaction } from './ledger.service';
import { adjustCredit, computeFee } from './credit.service';
import { computeTotal, computePlatformFee, LineItem, ServicerTaxConfig } from '../lib/money';
import { getPlatformFeeRate, getSstRate } from './settings.service';
import { notify } from './notification.service';
import { generateInvoice } from './invoice.service';
import { awardPoints, awardReviewPoints } from './points.service';
import { createBookingPaymentSession } from '../lib/stripe';

/**
 * Hour each time slot is considered to end, expressed in Malaysia time (MYT,
 * UTC+8). Used to schedule the no-show detection job.
 */
const SLOT_END_HOUR: Record<TimeSlot, number> = {
  morning:   12,
  noon:      13,
  afternoon: 15,
  evening:   19,
  night:     22,
};

/** Malaysia is UTC+8 with no DST. */
const MYT_OFFSET_MS = 8 * 60 * 60_000;

/**
 * Compute the UTC instant when a booking's service window ends.
 *
 * Uses explicit UTC arithmetic so the result is correct on any server
 * timezone — including UTC (the default for Docker / cloud deployments).
 * The old `setHours()` used the server's local clock, causing no-show
 * detection to misfire by ±8 hours on a UTC server (BUG-001).
 *
 * Algorithm:
 *  1. Shift `date` forward by +8 h to obtain the MYT calendar day in UTC
 *     fields (avoids any local-tz interpretation).
 *  2. Build a "naive-UTC" instant using those MYT calendar fields plus the
 *     slot-end hour in MYT.
 *  3. Subtract the MYT offset to convert to real UTC.
 *
 * Example on a UTC server — morning slot, date = 2026-06-15T00:00:00Z:
 *   mytDate  →  2026-06-15T08:00:00Z (getUTCDate = 15)
 *   Date.UTC(2026,5,15,12)  →  2026-06-15T12:00:00Z  (naive MYT→UTC)
 *   minus 8 h  →  2026-06-15T04:00:00Z  ✓  (12:00 MYT = 04:00 UTC)
 */
export function slotEndTime(date: Date, slot: TimeSlot): Date {
  // Step 1 — get the MYT calendar date from an arbitrary UTC input.
  const mytDate = new Date(date.getTime() + MYT_OFFSET_MS);

  // Step 2+3 — build the slot-end instant in real UTC.
  return new Date(
    Date.UTC(
      mytDate.getUTCFullYear(),
      mytDate.getUTCMonth(),
      mytDate.getUTCDate(),
      SLOT_END_HOUR[slot], // MYT hour, temporarily treated as UTC
      0, 0, 0,
    ) - MYT_OFFSET_MS,    // shift: "naive UTC" → real UTC
  );
}

// ── Proposal selection → booking creation ────────────────────────────────────

interface SelectProposalOptions {
  settlementMethod?: SettlementMethod;
}

/**
 * Customer selects a proposal. Creates a booking in `pending_confirm`, marks
 * the chosen proposal `selected` and the rest `rejected`, flips the quote to
 * `matched`.
 *
 * Two timing paths (spec §4):
 *   pay_now  — charge canonical total (credit or Stripe) → escrow.amount = total.
 *              paymentTiming='pay_now', settlementMethod=null.
 *   pay_later — NO charge at acceptance. paymentTiming='pay_later',
 *               settlementMethod from request. No escrow created.
 *
 * Both paths: copy proposal.lineItems → booking.lineItems snapshot.
 */
export async function selectProposal(
  userId: string,
  quoteId: string,
  proposalId: string,
  opts: SelectProposalOptions = {},
) {
  const quote = await prisma.quoteRequest.findFirst({
    where: { id: quoteId, userId },
    include: { category: { select: { requiresInspection: true } } },
  });
  if (!quote) throw notFound('Quote not found');
  if (quote.status !== 'open') throw conflict('Quote is no longer open for selection');

  // Minimum 5s waiting period so all auto proposals arrive before selection
  // (spec §operating-hours — fair bidding window for manual merchants).
  const msSinceCreated = Date.now() - quote.createdAt.getTime();
  if (msSinceCreated < 5000) {
    throw businessRule('Please wait a moment before selecting a proposal — other merchants may still be responding.');
  }

  // Block if customer has any unpaid invoice (soft enforcement — BE-1).
  await requireNoUnpaidInvoice(userId);

  const proposal = await prisma.quoteProposal.findFirst({
    where: { id: proposalId, quoteRequestId: quoteId },
  });
  if (!proposal) throw notFound('Proposal not found');
  if (proposal.status !== 'submitted') throw conflict('Proposal can no longer be selected');

  // Determine timing: pay_now vs pay_later.
  // Map old paymentMode for backward compat: pay_now→pay_now, pay_later|cash→pay_later.
  const isPayNow = quote.paymentMode === 'pay_now';
  const paymentTiming = isPayNow ? 'pay_now' : 'pay_later' as const;

  // pay_later must specify a settlement method.
  if (!isPayNow && !opts.settlementMethod) {
    throw badRequest('settlementMethod is required for pay_later bookings');
  }

  // Resolve line items from the proposal snapshot, or fall back to legacy.
  const rawProposalItems = proposal.lineItems as any;
  let lineItemsSnapshot: LineItem[];
  if (Array.isArray(rawProposalItems) && rawProposalItems.length > 0) {
    lineItemsSnapshot = rawProposalItems.map((li: any) => ({
      label: li.label ?? 'Service',
      amount: Number(li.amount),
      taxable: li.taxable ?? true,
      serviceChargeable: li.serviceChargeable ?? true,
    }));
  } else {
    lineItemsSnapshot = [
      { label: 'Service', amount: Number(proposal.proposedPrice), taxable: true, serviceChargeable: true },
    ];
  }

  const booking = await prisma.$transaction(async (tx) => {
    // Snapshot the servicer's travel fee + inspection flag onto the booking at
    // creation time so cancellation/refund logic uses the rate at booking time.
    const service = await tx.merchantService.findFirst({
      where: { merchantId: proposal.merchantId, categoryId: quote.categoryId },
      select: { travelFee: true, requiresInspection: true },
    });
    const isInspection =
      (service?.requiresInspection ?? false) || (quote.category?.requiresInspection ?? false);

    const created = await tx.booking.create({
      data: {
        quoteRequestId: quoteId,
        proposalId: proposal.id,
        userId,
        merchantId: proposal.merchantId,
        status: 'pending_confirm',
        price: proposal.proposedPrice,
        paymentMode: quote.paymentMode,
        paymentTiming,
        settlementMethod: isPayNow ? null : (opts.settlementMethod ?? null),
        lineItems: lineItemsSnapshot as any,
        scheduledDate: quote.preferredDate,
        timeSlot: quote.timeSlot,
        tipAmount: quote.tipAmount,
        tipStatus: isPayNow ? null : 'pending',
        travelFee: service?.travelFee ?? null,
        isInspection,
      },
    });

    await tx.quoteProposal.update({ where: { id: proposal.id }, data: { status: 'selected' } });
    await tx.quoteProposal.updateMany({
      where: { quoteRequestId: quoteId, id: { not: proposal.id } },
      data: { status: 'rejected' },
    });
    await tx.quoteRequest.update({ where: { id: quoteId }, data: { status: 'matched' } });

    // ── Pay-now: charge canonical total → escrow ─────────────────────────
    if (isPayNow) {
      const tip = Number(quote.tipAmount ?? 0);

      // Resolve merchant tax config for the canonical total.
      const merchant = await tx.servicer.findUnique({ where: { id: proposal.merchantId } });
      const [sstRate, feeRate] = await Promise.all([getSstRate(), getPlatformFeeRate()]);
      const config: ServicerTaxConfig = {
        serviceChargeRate: Number(merchant?.serviceChargeRate ?? 0),
        sstRegistered: merchant?.sstRegistered ?? false,
        sstRate,
        taxInclusive: merchant?.taxInclusive ?? false,
      };

      // Resolve promo discount.
      const promoDiscount = await resolveProposalPromo(
        quote.promoCode,
        lineItemsSnapshot.reduce((s, li) => s + li.amount, 0),
      );

      // Canonical total — this is the amount charged to customer's escrow.
      const totalResult = computeTotal(lineItemsSnapshot, promoDiscount, config, tip);
      const escrowTotal = totalResult.total;
      const afterPromo = totalResult.afterPromo;
      const platformFee = computePlatformFee(afterPromo, feeRate);

      const escrow = await tx.escrow.create({
        data: {
          bookingId: created.id,
          amount: escrowTotal,
          platformFeeBase: afterPromo,
          tipAmount: tip,
        },
      });

      if (quote.budgetMax != null) {
        // Credit was already held at quote creation — refund excess budget.
        const excess = Number(quote.budgetMax) - escrowTotal;
        if (excess > 0) {
          await adjustCredit('user', userId, excess, tx);
          await recordTransaction(
            {
              type: 'refund',
              amount: excess,
              bookingId: created.id,
              userId,
              escrowId: escrow.id,
              reference: 'Budget excess refund on proposal selection',
            },
            tx,
          );
        }
      } else {
        // No prior hold (open-ended budget) — deduct total now.
        await adjustCredit('user', userId, -escrowTotal, tx);
        await recordTransaction(
          {
            type: 'escrow_hold',
            amount: escrowTotal,
            bookingId: created.id,
            merchantId: proposal.merchantId,
            userId,
            escrowId: escrow.id,
            reference: 'Escrow hold on proposal selection',
          },
          tx,
        );
      }

      // Record the platform fee that will ultimately be taken.
      await recordTransaction(
        {
          type: 'platform_fee',
          amount: platformFee,
          bookingId: created.id,
          merchantId: proposal.merchantId,
          escrowId: escrow.id,
          reference: `Platform fee reserve (pay_now, ${(feeRate * 100).toFixed(1)}%)`,
        },
        tx,
      );
    }

    return created;
  });

  emitToMerchant(proposal.merchantId, 'job.new', { bookingId: booking.id, quoteId });
  await notify({
    merchantId: proposal.merchantId,
    type: 'jobs',
    message: `You've been selected for a new job! Review the details and confirm.`,
    linkUrl: '/servicer/jobs',
    category: quote.categoryId,
  });

  // Tell every other merchant who got this quote that it's now matched, so their
  // pending list drops it live instead of showing a quote they can no longer win.
  const broadcasts = await prisma.quoteBroadcast.findMany({
    where: { quoteRequestId: quoteId, merchantId: { not: proposal.merchantId } },
    select: { merchantId: true },
  });
  if (broadcasts.length > 0) {
    emitToMerchants(
      broadcasts.map((b) => b.merchantId),
      'quote.matched',
      { quoteId },
    );
  }
  logger.info('Booking created from proposal', {
    bookingId: booking.id,
    quoteId,
    paymentTiming,
    settlementMethod: isPayNow ? null : opts.settlementMethod,
  });
  return { bookingId: booking.id };
}

// ── Servicer lifecycle transitions ───────────────────────────────────────────

async function loadMerchantBooking(merchantId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, merchantId } });
  if (!booking) throw notFound('Booking not found');
  return booking;
}

/** Servicer two-step confirm: pending_confirm → confirmed. */
export async function confirmJob(merchantId: string, bookingId: string) {
  await requireOnboarded(merchantId);
  const booking = await loadMerchantBooking(merchantId, bookingId);
  if (booking.status !== 'pending_confirm') {
    throw conflict(`Cannot confirm a booking in status "${booking.status}"`);
  }
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });

  const merchant = await prisma.servicer.findUnique({ where: { id: merchantId } });
  emitToUser(booking.userId, 'booking.confirmed', {
    bookingId,
    merchantName: merchant?.businessName,
  });
  await notify({
    userId: booking.userId,
    type: 'orders',
    message: `${merchant?.businessName ?? 'The merchant'} confirmed your booking.`,
  });

  // Schedule no-show detection 30 min after the service window ends.
  await enqueue(
    JOB_NAMES.NOSHOW_DETECT,
    { bookingId, merchantId },
    {
      delay: Math.max(
        0,
        slotEndTime(booking.scheduledDate, booking.timeSlot).getTime() + 30 * 60_000 - Date.now(),
      ),
      jobId: `noshow:${bookingId}`,
    },
  );
  return updated;
}

/** Servicer marks arrived (with photo): confirmed → in_progress. */
export async function arriveJob(merchantId: string, bookingId: string, photoUrl: string | null) {
  const booking = await loadMerchantBooking(merchantId, bookingId);
  if (booking.status !== 'confirmed') {
    throw conflict(`Cannot mark arrived from status "${booking.status}"`);
  }
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: 'in_progress', arrivedAt: new Date(), arrivePhotoUrl: photoUrl },
  });
  emitToUser(booking.userId, 'booking.arrived', { bookingId, photoUrl });
  await notify({
    userId: booking.userId,
    type: 'orders',
    message: 'The servicer has arrived and is starting the job.',
    linkUrl: `/customer/bookings`,
  });
  return updated;
}

/** Servicer marks done (with photo): in_progress → completed. */
export async function doneJob(merchantId: string, bookingId: string, photoUrl: string | null) {
  const booking = await loadMerchantBooking(merchantId, bookingId);
  if (booking.status !== 'in_progress') {
    throw conflict(`Cannot mark done from status "${booking.status}"`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'completed', doneAt: new Date(), donePhotoUrl: photoUrl },
    });

    // Pay-later: deduct platform fee from servicer credit at done time.
    // Fee is on afterPromo only (spec: computePlatformFee base).
    if (booking.paymentMode === 'pay_later') {
      const afterPromo = await computeAfterPromo(merchantId, booking.id, Number(booking.price), booking.lineItems);
      const platformFee = await computeFee(afterPromo);
      if (platformFee > 0) {
        await adjustCredit('servicer', merchantId, -platformFee, tx);
        await recordTransaction(
          {
            type: 'platform_fee',
            amount: platformFee,
            bookingId,
            merchantId,
            reference: `Platform fee (pay_later)`,
          },
          tx,
        );
      }
    }

    return b;
  });

  // Generate the invoice row (includes PDF, idempotent). Called directly
  // from doneJob per spec: the invoice is created when the booking is marked
  // complete. Escrow invariant asserted inside generateInvoice.
  generateInvoice(merchantId, bookingId).catch((err) =>
    logger.error('Invoice generation failed in doneJob', { bookingId, error: String(err) }),
  );

  // Award booking points (1 pt per RM spent).
  const pointsEarned = Math.floor(Number(booking.price));
  if (pointsEarned > 0) {
    awardPoints(booking.userId, pointsEarned, 'earn_booking', booking.id, `Earned from booking #${booking.id.slice(-8)}`).catch((err) =>
      logger.error('Failed to award booking points', { bookingId, error: String(err) }),
    );
  }
  // Award review bonus points (50 pts per completed booking).
  // When the review creation system is built, move this call to the
  // review-submission handler so the points are tied to the review ID.
  awardReviewPoints(booking.userId, booking.id).catch((err) =>
    logger.error('Failed to award review points', { bookingId, error: String(err) }),
  );

  if (booking.paymentMode === 'pay_now') {
    const escrow = await prisma.escrow.findUnique({ where: { bookingId } });
    if (escrow) {
      await enqueue(
        JOB_NAMES.ESCROW_RELEASE,
        { bookingId, escrowId: escrow.id },
        { delay: 60_000, jobId: `escrow:${bookingId}` },
      );
    }
  }

  emitToUser(booking.userId, 'booking.done', { bookingId, photoUrl });
  await notify({
    userId: booking.userId,
    type: 'orders',
    message: 'Your job is complete. The invoice is on its way.',
  });

  // Inspection-first flow: a completed inspection booking re-opens the quote
  // request so the servicer can submit a final work proposal for the actual job.
  if (booking.isInspection) {
    emitToUser(booking.userId, 'inspection.done', { bookingId });
    await notify({
      userId: booking.userId,
      type: 'orders',
      message: 'Inspection complete! Your servicer will now provide a final quote for the work.',
      linkUrl: `/customer/bookings`,
    });
    emitToMerchant(booking.merchantId, 'inspection.done', {
      bookingId,
      quoteRequestId: booking.quoteRequestId,
    });
    await prisma.quoteRequest.update({
      where: { id: booking.quoteRequestId },
      data: { status: 'open' },
    });
  }
  return updated;
}

/** Servicer confirms cash received (cash bookings only). */
export async function cashConfirm(merchantId: string, bookingId: string) {
  const booking = await loadMerchantBooking(merchantId, bookingId);
  if (booking.paymentMode !== 'cash') {
    throw businessRule('Cash confirmation only applies to cash bookings');
  }
  if (booking.status !== 'completed') {
    throw conflict('Cash can only be confirmed after the job is marked done');
  }
  if (booking.cashConfirmed) return booking;

  // Fee on afterPromo only (spec: computePlatformFee base).
  const afterPromo = await computeAfterPromo(merchantId, booking.id, Number(booking.price), booking.lineItems);
  const platformFee = await computeFee(afterPromo);

  const updated = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.update({
      where: { id: bookingId },
      data: { cashConfirmed: true, cashConfirmedAt: new Date() },
    });
    if (platformFee > 0) {
      await adjustCredit('servicer', merchantId, -platformFee, tx);
    }
    await recordTransaction(
      {
        type: 'platform_fee',
        amount: platformFee,
        bookingId,
        merchantId,
        reference: `Platform fee (cash)`,
      },
      tx,
    );
    return b;
  });

  // Platform-promo payback may apply once payment is confirmed.
  await enqueue(JOB_NAMES.PROMO_CREDIT_PAYBACK, { bookingId }, { jobId: `promo:${bookingId}` });
  return updated;
}

/** Servicer cancels after taking the job — triggers a penalty. */
export async function merchantCancelJob(merchantId: string, bookingId: string, reason: string) {
  const booking = await loadMerchantBooking(merchantId, bookingId);
  if (['completed', 'cancelled'].includes(booking.status)) {
    throw businessRule('This booking can no longer be cancelled');
  }
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'cancelled',
      cancelledBy: 'merchant',
      cancelReason: reason,
      cancelConfirmedAt: new Date(),
    },
  });

  await enqueue(
    JOB_NAMES.PENALTY_DEDUCT,
    { bookingId, merchantId, penaltyType: 'cancel' },
    { jobId: `penalty:${bookingId}` },
  );
  emitToUser(booking.userId, 'booking.cancelled', { bookingId, cancelledBy: 'merchant', reason });
  await notify({
    userId: booking.userId,
    type: 'orders',
    message: 'The merchant cancelled your booking. You can pick another or repost your quote.',
    linkReorder: `/customer/quote/new?from=${booking.quoteRequestId}`,
  });
  return updated;
}

/** Servicer asks the customer to cancel instead — avoids a penalty. */
export async function requestMutualCancel(merchantId: string, bookingId: string, reason: string) {
  const booking = await loadMerchantBooking(merchantId, bookingId);
  if (['completed', 'cancelled'].includes(booking.status)) {
    throw businessRule('This booking can no longer be cancelled');
  }
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      mutualCancelRequested: true,
      mutualCancelStatus: 'pending',
      mutualCancelReason: reason,
      cancelRequestedAt: new Date(),
    },
  });
  const merchant = await prisma.servicer.findUnique({ where: { id: merchantId } });
  emitToUser(booking.userId, 'booking.mutual_cancel_requested', {
    bookingId,
    merchantName: merchant?.businessName,
    reason,
  });
  return updated;
}

/** List this merchant's jobs, optionally filtered by status. */
export async function listMerchantJobs(merchantId: string, status?: string) {
  const valid = new Set([
    'pending_confirm',
    'confirmed',
    'in_progress',
    'completed',
    'cancelled',
  ]);
  const filter = status && valid.has(status) ? (status as BookingStatus) : undefined;
  const jobs = await prisma.booking.findMany({
    where: { merchantId, ...(filter ? { status: filter } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { quoteRequest: { select: { category: { select: { name: true } } } } },
  });

  return Promise.all(
    jobs.map(async (j) => {
      const afterPromo = j.status === 'completed' ? await computeAfterPromo(merchantId, j.id, Number(j.price), j.lineItems as any) : Number(j.price);
      const fee = j.status === 'completed' ? await computeFee(afterPromo) : 0;
      return {
        ...j,
        netPrice: Math.max(0, afterPromo - fee),
      };
    }),
  );
}

/** Full job detail for a merchant — customer contact is included only once confirmed. */
export async function getMerchantJob(merchantId: string, bookingId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, merchantId },
    include: {
      quoteRequest: { include: { category: true, address: true } },
      proposal: true,
      escrow: true,
      invoice: true,
    },
  });
  if (!booking) throw notFound('Booking not found');

  const confirmed = !['pending_confirm'].includes(booking.status);
  const customer = confirmed
    ? await prisma.user.findUnique({
        where: { id: booking.userId },
        select: { name: true, phone: true, avatarUrl: true, contactName: true, contactNumber: true },
      })
    : null;

  return { ...booking, customer };
}

// ── Customer-side operations ─────────────────────────────────────────────────

const BOOKING_STATUSES = new Set<string>([
  'pending_confirm',
  'confirmed',
  'in_progress',
  'completed',
  'cancelled',
]);

/** List the customer's bookings. */
export async function listBookings(userId: string, status?: string) {
  const filter = status && BOOKING_STATUSES.has(status) ? (status as BookingStatus) : undefined;
  const { formatOrderId } = await import('../lib/order-id');
  const rows = await prisma.booking.findMany({
    where: { userId, ...(filter ? { status: filter } : {}) },
    orderBy: { createdAt: 'desc' },
    include: {
      merchant: { select: { id: true, businessName: true, logoUrl: true, rating: true } },
      quoteRequest: { select: { category: { select: { name: true, icon: true } } } },
    },
  });
  return rows.map((b) => ({ ...b, orderId: formatOrderId(b.orderNumber, b.createdAt) }));
}

/** Full booking detail — customer must own it. */
export async function getBooking(userId: string, bookingId: string) {
  const { formatOrderId } = await import('../lib/order-id');
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    include: {
      merchant: { select: { id: true, businessName: true, logoUrl: true, rating: true, phone: true } },
      proposal: true,
      quoteRequest: { include: { category: true, address: true } },
      escrow: true,
      invoice: true,
    },
  });
  if (!booking) throw notFound('Booking not found');
  return { ...booking, orderId: formatOrderId(booking.orderNumber, booking.createdAt) };
}

/** Add a tip to a pay_later booking once the job is done. */
export async function addTip(userId: string, bookingId: string, tipAmount: number) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });
  if (!booking) throw notFound('Booking not found');
  if (booking.paymentMode !== 'pay_later') {
    throw businessRule('Tips are added upfront for pay_now and not supported for cash bookings');
  }
  if (booking.status !== 'completed') {
    throw conflict('A tip can only be added after the job is done');
  }
  if (booking.tipStatus === 'paid') throw conflict('A tip has already been added');
  if (tipAmount <= 0) throw badRequest('tipAmount must be greater than zero');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { tipAmount, tipStatus: 'paid', tipPaidAt: new Date() },
    });
    await recordTransaction(
      {
        type: 'tip',
        amount: tipAmount,
        bookingId,
        merchantId: booking.merchantId,
        userId,
        reference: 'Pay-later tip',
      },
      tx,
    );
    return updated;
  });
}

/** Customer cancels their own booking. */
export async function customerCancelBooking(userId: string, bookingId: string, reason: string) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });
  if (!booking) throw notFound('Booking not found');
  if (['completed', 'cancelled'].includes(booking.status)) {
    throw businessRule('This booking can no longer be cancelled');
  }
  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: 'cancelled',
      cancelledBy: 'customer',
      cancelReason: reason,
      cancelConfirmedAt: new Date(),
    },
  });
  // Refund any escrow held (less non-refundable travel/inspection fees).
  await refundEscrowIfHeld(bookingId, booking.merchantId, userId, booking);
  emitToMerchant(booking.merchantId, 'booking.cancelled', {
    bookingId,
    cancelledBy: 'customer',
    reason,
  });
  await notify({
    merchantId: booking.merchantId,
    type: 'jobs',
    message: 'The customer cancelled the scheduled job.',
    linkUrl: '/servicer/jobs',
  });
  return updated;
}

/** Customer responds to a merchant's mutual-cancel request. */
export async function respondMutualCancel(userId: string, bookingId: string, accept: boolean) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });
  if (!booking) throw notFound('Booking not found');
  if (!booking.mutualCancelRequested || booking.mutualCancelStatus !== 'pending') {
    throw conflict('There is no pending mutual-cancel request on this booking');
  }
  if (accept) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        mutualCancelStatus: 'accepted',
        cancelledBy: 'customer',
        cancelReason: booking.mutualCancelReason,
        cancelConfirmedAt: new Date(),
      },
    });
    await refundEscrowIfHeld(bookingId, booking.merchantId, userId, booking);
    emitToMerchant(booking.merchantId, 'booking.cancelled', {
      bookingId,
      cancelledBy: 'customer',
      reason: 'mutual cancel accepted',
    });
    await notify({
      merchantId: booking.merchantId,
      type: 'jobs',
      message: 'The customer accepted the mutual cancellation request.',
      linkUrl: '/servicer/jobs',
    });
  }
  return prisma.booking.update({
    where: { id: bookingId },
    data: { mutualCancelStatus: 'rejected' },
  });
}

/** Report a problem with a booking. */
export async function reportBookingProblem(
  userId: string,
  bookingId: string,
  subject: string,
  description: string,
) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });
  if (!booking) throw notFound('Booking not found');
  return prisma.report.create({
    data: { bookingId, userId, subject, description },
  });
}

// ── Settlement ────────────────────────────────────────────────────────────────

/**
 * Recompute the canonical settlement amounts for a booking from its line-item
 * snapshot + the merchant's current tax config + platform rates. Single source of
 * truth shared by settleBooking (credit/cash) and completeGatewaySettlement (card)
 * so the fee/payout math can never drift between settlement methods.
 */
async function computeSettlementAmounts(
  tx: Prisma.TransactionClient,
  booking: {
    merchantId: string;
    lineItems: Prisma.JsonValue;
    price: Prisma.Decimal | number | string;
    tipAmount: Prisma.Decimal | number | string | null;
  },
): Promise<{ total: number; afterPromo: number; platformFee: number; feeRate: number }> {
  const [sstRate, feeRate] = await Promise.all([getSstRate(), getPlatformFeeRate()]);
  const merchant = await tx.servicer.findUnique({ where: { id: booking.merchantId } });
  const config: ServicerTaxConfig = {
    serviceChargeRate: Number(merchant?.serviceChargeRate ?? 0),
    sstRegistered: merchant?.sstRegistered ?? false,
    sstRate,
    taxInclusive: merchant?.taxInclusive ?? false,
  };

  // Recompute total from the line-items snapshot (fall back to price).
  const rawItems = booking.lineItems as any;
  const lineItems: LineItem[] = Array.isArray(rawItems) && rawItems.length > 0
    ? rawItems.map((li: any) => ({
        label: li.label ?? 'Service',
        amount: Number(li.amount),
        taxable: li.taxable ?? true,
        serviceChargeable: li.serviceChargeable ?? true,
      }))
    : [{ label: 'Service', amount: Number(booking.price), taxable: true, serviceChargeable: true }];

  const promoDiscount = 0; // promo was already applied at booking
  const tip = booking.tipAmount ? Number(booking.tipAmount) : 0;
  const totalResult = computeTotal(lineItems, promoDiscount, config, tip);
  const platformFee = computePlatformFee(totalResult.afterPromo, feeRate);
  return { total: totalResult.total, afterPromo: totalResult.afterPromo, platformFee, feeRate };
}

/**
 * Customer settles a pay_later booking.
 *
 * Credit: deduct from customer credit → record transaction → mark invoice paid.
 * Cash:   confirm cash received → deduct platform fee from servicer deposit
 *         (extends cashConfirm — used when servicer confirms cash).
 * Gateway: placeholder for Stripe (records pending charge).
 *
 * Validates settlementMethod matches booking's paymentTiming:
 *   cash is only valid for pay_later bookings.
 */
export async function settleBooking(
  userId: string,
  bookingId: string,
  method: SettlementMethod,
) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });
  if (!booking) throw notFound('Booking not found');
  if (booking.paymentTiming !== 'pay_later') {
    throw businessRule('Settlement is only available for pay_later bookings');
  }
  if (booking.status !== 'completed') {
    throw conflict('Settlement is only available after the job is marked done');
  }

  // cash is only valid when settlementMethod was 'cash' from the start
  if (method === 'cash' && booking.settlementMethod !== 'cash') {
    throw businessRule('Cash settlement requires the booking to be set to cash at acceptance');
  }

  const invoice = await prisma.invoice.findUnique({ where: { bookingId } });
  if (!invoice) throw notFound('Invoice not yet generated');
  if (invoice.paidAt) throw conflict('Invoice is already paid');

  // Gateway: create a Stripe Checkout Session and return the redirect URL.
  // The actual DB settlement happens later via the Stripe webhook →
  // completeGatewaySettlement(). No DB writes happen here.
  if (method === 'gateway') {
    const total = Number(invoice.total ?? 0);
    const baseUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
    const { url } = await createBookingPaymentSession(
      bookingId,
      total,
      `${baseUrl}/customer/bookings?stripe_settled=${bookingId}`,
      `${baseUrl}/customer/bookings?stripe_cancel=${bookingId}`,
    );
    return { paymentUrl: url };
  }

  return prisma.$transaction(async (tx) => {
    const { total, platformFee, feeRate } = await computeSettlementAmounts(tx, booking);

    switch (method) {
      case 'credit': {
        // Deduct from customer credit.
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user || Number(user.creditBalance) < total) {
          throw businessRule(`Insufficient credit balance. Need RM${total.toFixed(2)}, have RM${Number(user?.creditBalance ?? 0).toFixed(2)}`);
        }
        await adjustCredit('user', userId, -total, tx);
        await recordTransaction(
          {
            type: 'escrow_hold',
            amount: total,
            bookingId,
            merchantId: booking.merchantId,
            userId,
            reference: 'Pay-later settlement via credit',
          },
          tx,
        );
        // Platform fee: deduct from servicer credit.
        if (platformFee > 0) {
          await adjustCredit('servicer', booking.merchantId, -platformFee, tx);
          await recordTransaction(
            {
              type: 'platform_fee',
              amount: platformFee,
              bookingId,
              merchantId: booking.merchantId,
              reference: `Platform fee (pay_later credit settlement, ${(feeRate * 100).toFixed(1)}%)`,
            },
            tx,
          );
        }
        // Release the total minus fee to the servicer.
        const payout = total - platformFee;
        if (payout > 0) {
          await adjustCredit('servicer', booking.merchantId, payout, tx);
          await recordTransaction(
            {
              type: 'escrow_release',
              amount: payout,
              bookingId,
              merchantId: booking.merchantId,
              reference: 'Pay-later payout to servicer',
            },
            tx,
          );
        }
        break;
      }

      case 'cash': {
        // Cash settlement: servicer already collected cash.
        // Deduct platform fee from servicer deposit/credit.
        if (platformFee > 0) {
          await adjustCredit('servicer', booking.merchantId, -platformFee, tx);
          await recordTransaction(
            {
              type: 'platform_fee',
              amount: platformFee,
              bookingId,
              merchantId: booking.merchantId,
              reference: `Platform fee (pay_later cash settlement, ${(feeRate * 100).toFixed(1)}%)`,
            },
            tx,
          );
        }
        // Mark cash confirmed on the booking.
        await tx.booking.update({
          where: { id: bookingId },
          data: { cashConfirmed: true, cashConfirmedAt: new Date() },
        });
        break;
      }

      default:
        throw badRequest(`Unknown settlement method: ${method}`);
    }

    // Mark invoice as paid.
    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: { paidAt: new Date() },
    });

    // Update booking settlement method if not already set.
    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: { settlementMethod: method },
    });

    logger.info('Booking settled', { bookingId, method, total, platformFee });
    return { booking: updatedBooking, invoice: updatedInvoice };
  });
}

/**
 * Complete a pay_later settlement the customer paid by card (Stripe Checkout).
 *
 * Mirrors the servicer side of the 'credit' settlement (platform fee + payout via
 * computeSettlementAmounts), but the customer's `total` arrives via Stripe rather
 * than a credit deduction. Records: gateway_payment (customer inflow, carries the
 * unique stripeSessionId) → platform_fee (servicer −fee) → escrow_release (servicer
 * +payout) → invoice paidAt → booking.settlementMethod='gateway'.
 *
 * Idempotency is double-guarded: the caller (stripe.routes) holds a Redis lock AND
 * does a stripeSessionId DB pre-check; the unique stripeSessionId column on the
 * gateway_payment row is the hard backstop (a retry's INSERT fails → the whole
 * $transaction rolls back → no double payout).
 *
 * Trusted caller (Stripe webhook/redirect-verify): ownership was verified at session
 * creation, so userId is not re-checked here.
 */
export async function completeGatewaySettlement(params: {
  bookingId: string;
  sessionId: string;
}): Promise<{ total: number; customerUserId: string | null; alreadyPaid: boolean }> {
  const { bookingId, sessionId } = params;

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    logger.warn('Gateway settlement: booking not found', { bookingId, sessionId });
    return { total: 0, customerUserId: null, alreadyPaid: false };
  }
  const invoice = await prisma.invoice.findUnique({ where: { bookingId } });
  if (!invoice) {
    logger.warn('Gateway settlement: invoice not found', { bookingId, sessionId });
    return { total: 0, customerUserId: booking.userId, alreadyPaid: false };
  }
  if (invoice.paidAt) {
    logger.info('Gateway settlement: invoice already paid — skipping', { bookingId, sessionId });
    return { total: Number(invoice.total ?? 0), customerUserId: booking.userId, alreadyPaid: true };
  }

  return prisma.$transaction(async (tx) => {
    const { total, platformFee, feeRate } = await computeSettlementAmounts(tx, booking);

    // Customer inflow via the Stripe card charge. The unique stripeSessionId is the
    // hard double-charge backstop (a retry INSERT fails → tx rolls back).
    await recordTransaction(
      {
        type: 'gateway_payment',
        amount: total,
        bookingId,
        merchantId: booking.merchantId,
        userId: booking.userId,
        reference: `Pay-later settlement via card (Stripe ${sessionId})`,
        stripeSessionId: sessionId,
      },
      tx,
    );

    // Platform fee: deduct from servicer credit.
    if (platformFee > 0) {
      await adjustCredit('servicer', booking.merchantId, -platformFee, tx);
      await recordTransaction(
        {
          type: 'platform_fee',
          amount: platformFee,
          bookingId,
          merchantId: booking.merchantId,
          reference: `Platform fee (pay_later gateway settlement, ${(feeRate * 100).toFixed(1)}%)`,
        },
        tx,
      );
    }

    // Release the remainder to the servicer.
    const payout = total - platformFee;
    if (payout > 0) {
      await adjustCredit('servicer', booking.merchantId, payout, tx);
      await recordTransaction(
        {
          type: 'escrow_release',
          amount: payout,
          bookingId,
          merchantId: booking.merchantId,
          reference: 'Pay-later payout to servicer (card)',
        },
        tx,
      );
    }

    await tx.invoice.update({ where: { id: invoice.id }, data: { paidAt: new Date() } });
    await tx.booking.update({ where: { id: bookingId }, data: { settlementMethod: 'gateway' } });

    logger.info('Gateway settlement completed', { bookingId, sessionId, total, platformFee });
    return { total, customerUserId: booking.userId, alreadyPaid: false };
  });
}

// ── Unpaid invoices / soft enforcement ───────────────────────────────────────

/**
 * List unpaid invoices for a customer.
 * Returns invoices where `paidAt` is null and `dueDate` has passed
 * (or dueDate is null — treat as overdue if older than 14 days).
 */
export async function listUnpaidInvoices(userId: string) {
  const invoices = await prisma.invoice.findMany({
    where: {
      paidAt: null,
      booking: { userId },
    },
    orderBy: { issuedAt: 'desc' },
    include: {
      booking: { select: { id: true, status: true, price: true } },
      merchant: { select: { businessName: true } },
    },
  });

  return invoices.map((inv) => ({
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    total: Number(inv.total ?? 0),
    issuedAt: inv.issuedAt,
    dueDate: inv.dueDate,
    daysOverdue: inv.dueDate
      ? Math.max(0, Math.floor((Date.now() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24)))
      : Math.max(0, Math.floor((Date.now() - new Date(inv.issuedAt).getTime()) / (1000 * 60 * 60 * 24)) - 14),
    isOverdue: inv.dueDate
      ? new Date(inv.dueDate) < new Date()
      : (Date.now() - new Date(inv.issuedAt).getTime()) > 14 * 24 * 60 * 60 * 1000,
    booking: inv.booking,
    merchant: inv.merchant,
  }));
}

/**
 * Soft enforcement check: if the customer has any unpaid pay_later invoices
 * more than 14 days past due, return the overdue invoice IDs. Callers should
 * block new bookings and return a 400 with this information.
 */
export async function checkUnpaidEnforcement(userId: string): Promise<string[]> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const overdue = await prisma.invoice.findMany({
    where: {
      paidAt: null,
      booking: {
        userId,
        paymentTiming: 'pay_later',
      },
      OR: [
        { dueDate: { lt: new Date() } },
        { dueDate: null, issuedAt: { lt: fourteenDaysAgo } },
      ],
    },
    select: { id: true },
  });

  return overdue.map((inv) => inv.id);
}

/**
 * Strict unpaid-invoice guard. Blocks the customer if ANY invoice exists
 * where paidAt is null — regardless of due date or payment timing.
 * Used by both quote creation and proposal selection (BE-1 soft enforcement).
 */
export async function requireNoUnpaidInvoice(userId: string): Promise<void> {
  const unpaid = await prisma.invoice.findFirst({
    where: { paidAt: null, booking: { userId } },
    select: { id: true },
  });
  if (unpaid) {
    throw paymentRequired('You have an unpaid invoice. Please settle it before requesting new services.');
  }
}

/** Report a generic bug (not tied to a specific booking). */
export async function createBugReport(
  userId: string,
  subject: string,
  description: string,
) {
  return prisma.report.create({
    data: { bookingId: null, userId, subject, description },
  });
}

/**
 * Pure calculation of the portion of an escrow that is NOT refundable on
 * cancellation:
 *  - the travel fee becomes non-refundable once the servicer has arrived
 *  - the inspection fee becomes non-refundable once an inspection booking is
 *    completed (done)
 * Exported for unit testing.
 */
export function computeNonRefundableAmount(booking: {
  arrivedAt: Date | null;
  isInspection: boolean;
  doneAt: Date | null;
  travelFee: Prisma.Decimal | null;
  inspectionFee: Prisma.Decimal | null;
}): number {
  let nonRefundable = 0;
  if (booking.arrivedAt && booking.travelFee) nonRefundable += Number(booking.travelFee);
  if (booking.isInspection && booking.doneAt && booking.inspectionFee) {
    nonRefundable += Number(booking.inspectionFee);
  }
  return nonRefundable;
}

/** Refund a held escrow back to the customer (merchant/mutual cancel). */
async function refundEscrowIfHeld(
  bookingId: string,
  merchantId: string,
  userId: string,
  booking?: {
    arrivedAt: Date | null;
    isInspection: boolean;
    doneAt: Date | null;
    travelFee: Prisma.Decimal | null;
    inspectionFee: Prisma.Decimal | null;
  },
) {
  const escrow = await prisma.escrow.findUnique({ where: { bookingId } });
  if (!escrow || escrow.status !== 'held') return;

  // Deduct any non-refundable fees (travel fee once arrived, inspection fee
  // once an inspection booking is done) from the refunded amount.
  const nonRefundable = booking ? computeNonRefundableAmount(booking) : 0;
  const refundAmount = Math.max(
    0,
    Number(escrow.amount) + Number(escrow.tipAmount) - nonRefundable,
  );
  await prisma.$transaction(async (tx) => {
    await tx.escrow.update({
      where: { id: escrow.id },
      data: { status: 'refunded', refundedAt: new Date() },
    });
    await adjustCredit('user', userId, refundAmount, tx);
    await recordTransaction(
      {
        type: 'refund',
        amount: refundAmount,
        bookingId,
        merchantId,
        userId,
        escrowId: escrow.id,
        reference: 'Escrow refunded on cancellation',
      },
      tx,
    );
  });
}

/**
 * Reorder: creates a fresh quote from a completed booking's original quote
 * data and records an ORDER_HISTORY shortcut.
 */
export async function reorderBooking(userId: string, bookingId: string) {
  await requireNoUnpaidInvoice(userId);

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, userId },
    include: { quoteRequest: true },
  });
  if (!booking) throw notFound('Booking not found');

  const q = booking.quoteRequest;
  const snapshot = {
    categoryId: q.categoryId,
    addressId: q.addressId,
    timeSlot: q.timeSlot,
    budgetMin: q.budgetMin ? Number(q.budgetMin) : null,
    budgetMax: q.budgetMax ? Number(q.budgetMax) : null,
    paymentMode: q.paymentMode,
    notes: q.notes,
    contactName: q.contactName,
    contactNumber: q.contactNumber,
    serviceDetails: q.serviceDetails as Prisma.InputJsonValue,
  };
  await prisma.orderHistory.create({
    data: {
      userId,
      type: 'service',
      bookingId,
      merchantId: booking.merchantId,
      categoryId: q.categoryId,
      snapshot,
    },
  });

  return { prefill: snapshot };
}

/**
 * Resolve promo discount for a proposal selection (no invoice/quote request
 * context needed — this just reads the promo code and computes discount).
 */
async function resolveProposalPromo(code: string | null, _subtotal: number): Promise<number> {
  if (!code) return 0;
  // Promo code lookup removed — new promotion engine is trigger-based
  return 0;
}

/**
 * Compute the `afterPromo` value for an existing booking.
 * Used by doneJob, cashConfirm, and listMerchantJobs to compute the
 * platform fee on the correct base (afterPromo only, per spec).
 *
 * Fetches the merchant, resolves line items and promo, and runs
 * computeTotal to extract afterPromo.
 */
async function computeAfterPromo(merchantId: string, bookingId: string, price: number, lineItems: any): Promise<number> {
  const [merchant, sstRate] = await Promise.all([
    prisma.servicer.findUnique({ where: { id: merchantId } }),
    getSstRate(),
  ]);

  const config: ServicerTaxConfig = {
    serviceChargeRate: Number(merchant?.serviceChargeRate ?? 0),
    sstRegistered: merchant?.sstRegistered ?? false,
    sstRate,
    taxInclusive: merchant?.taxInclusive ?? false,
  };

  const rawItems = lineItems as any;
  let items: LineItem[];
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    items = rawItems.map((li: any) => ({
      label: li.label ?? 'Service',
      amount: Number(li.amount),
      taxable: li.taxable ?? true,
      serviceChargeable: li.serviceChargeable ?? true,
    }));
  } else {
    items = [{ label: 'Service', amount: price, taxable: true, serviceChargeable: true }];
  }

  // For post-booking fee computation, we cannot reliably get the promo code
  // without including the quote request. Use 0 for simplicity — the fee base
  // difference from promo is negligible at this stage (no escrow for pay_later/cash).
  const promoDiscount = 0;

  const result = computeTotal(items, promoDiscount, config, 0);
  return result.afterPromo;
}

/** Guard helper for routes that must reject non-owning callers. */
export function assertOwnership(condition: boolean): void {
  if (!condition) throw forbidden();
}
