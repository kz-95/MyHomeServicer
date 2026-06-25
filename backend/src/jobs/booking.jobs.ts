import { Job } from 'bullmq';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { JOB_NAMES, enqueue } from '../lib/queue';
import { registerJob } from './index';
import { recordTransaction } from '../services/ledger.service';
import { adjustCredit } from '../services/credit.service';
import { notify } from '../services/notification.service';
import { resolveUrgentFee, splitUrgentFee } from '../services/quote-timing.service';
import { emitToUser } from '../socket';

const noshowPayload = z.object({
  bookingId: z.string().uuid(),
  servicerId: z.string().uuid(),
});
const penaltyPayload = z.object({
  bookingId: z.string().uuid(),
  servicerId: z.string().uuid(),
  penaltyType: z.enum(['noshow', 'cancel']),
});
const escrowPayload = z.object({
  bookingId: z.string().uuid(),
  escrowId: z.string().uuid(),
});

const CONSECUTIVE_BAN_THRESHOLD = 3;
const WEEKLY_BAN_THRESHOLD = 5;

/**
 * noshow.detect - fires 30 min after the service window ends. If the servicer
 * never marked arrived, the booking is treated as a no-show: it is cancelled,
 * escrow refunded, the servicer's no-show counters incremented, an auto-ban
 * applied if a threshold is hit, and penalty.deduct is enqueued.
 */
async function handleNoshowDetect(job: Job): Promise<void> {
  const { bookingId, servicerId } = noshowPayload.parse(job.data);
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;

  // Servicer showed up - reset the consecutive counter and stop.
  if (['in_progress', 'completed'].includes(booking.status)) {
    await prisma.servicer.update({
      where: { id: servicerId },
      data: { consecutiveNoshow: 0 },
    });
    logger.info('noshow.detect - servicer showed, counter reset', { bookingId });
    return;
  }
  // Already resolved some other way.
  if (booking.status === 'cancelled') return;

  // Confirmed but never arrived → no-show.
  // BE-011: all DB writes now share a single $transaction.
  // Previously the counter increment + auto-ban ran outside the transaction,
  // so a failure there would silently desync the counters while the booking
  // was already cancelled (the cancelled guard at line 50 would then block
  // BullMQ retries from ever correcting the drift).
  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'cancelled',
        cancelledBy: 'servicer',
        cancelReason: 'No-show - servicer did not arrive',
        cancelConfirmedAt: new Date(),
      },
    });
    const escrow = await tx.escrow.findUnique({ where: { bookingId } });
    if (escrow && escrow.status === 'held') {
      const refundAmount = Number(escrow.amount) + Number(escrow.tipAmount);
      await tx.escrow.update({
        where: { id: escrow.id },
        data: { status: 'refunded', refundedAt: new Date() },
      });
      await adjustCredit('user', booking.userId, refundAmount, tx);
      await recordTransaction(
        {
          type: 'refund',
          amount: refundAmount,
          bookingId,
          servicerId,
          userId: booking.userId,
          escrowId: escrow.id,
          reference: 'Refund - servicer no-show',
        },
        tx,
      );
    }

    // Increment no-show counters atomically with booking cancellation + escrow refund.
    const servicer = await tx.servicer.update({
      where: { id: servicerId },
      data: { consecutiveNoshow: { increment: 1 }, weeklyNoshow: { increment: 1 } },
    });

    // Auto-ban on threshold breach (schema-notes.md §No-show penalty system).
    if (
      servicer.consecutiveNoshow >= CONSECUTIVE_BAN_THRESHOLD ||
      servicer.weeklyNoshow >= WEEKLY_BAN_THRESHOLD
    ) {
      await tx.servicer.update({ where: { id: servicerId }, data: { isBanned: true } });
      logger.warn('Servicer auto-banned for repeated no-shows', { servicerId });
    }
  });

  emitToUser(booking.userId, 'booking.cancelled', {
    bookingId,
    cancelledBy: 'servicer',
    reason: 'no-show',
  });
  await notify({
    userId: booking.userId,
    type: 'orders',
    message: 'The servicer did not show up. Your payment has been refunded.',
    linkReorder: `/customer/quote/new?from=${booking.quoteRequestId}`,
  });

  await enqueue(
    JOB_NAMES.PENALTY_DEDUCT,
    { bookingId, servicerId, penaltyType: 'noshow' },
    { jobId: `penalty:${bookingId}` },
  );
}

/**
 * penalty.deduct - deducts a penalty from the servicer's deposit. Idempotent:
 * if a PENALTY_LOG already exists for the booking the job is a no-op so
 * retries never double-charge (security-notes.md §10).
 */
async function handlePenaltyDeduct(job: Job): Promise<void> {
  const { bookingId, servicerId, penaltyType } = penaltyPayload.parse(job.data);

  const existing = await prisma.penaltyLog.findFirst({ where: { bookingId } });
  if (existing) {
    logger.info('penalty.deduct - penalty already applied, skipping', { bookingId });
    return;
  }

  const rule = await prisma.penaltyRule.findFirst({
    where: { type: penaltyType, isActive: true },
  });
  if (!rule) {
    logger.warn('penalty.deduct - no active rule', { penaltyType });
    return;
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;

  const amount =
    rule.calcMode === 'percentage'
      ? Math.round(Number(booking.price) * Number(rule.amount)) / 100
      : Number(rule.amount);

  await prisma.$transaction(async (tx) => {
    const deposit = await tx.servicerDeposit.findUnique({ where: { servicerId } });
    if (deposit) {
      await tx.servicerDeposit.update({
        where: { servicerId },
        data: { currentBalance: { decrement: amount } },
      });
    }
    const txId = await recordTransaction(
      {
        type: 'penalty',
        amount,
        bookingId,
        servicerId,
        reference: `Penalty - ${penaltyType}`,
      },
      tx,
    );
    await tx.penaltyLog.create({
      data: {
        bookingId,
        servicerId,
        ruleId: rule.id,
        type: penaltyType,
        amountDeducted: amount,
        transactionId: txId,
      },
    });
  });
  logger.info('penalty.deduct - applied', { bookingId, servicerId, amount });
}

/**
 * escrow.release - releases held funds to the servicer once a job is done and
 * no report or dispute is open. The platform fee is split off; tips pass through whole.
 * Uses the FeeRule engine (P2) with fallback to legacy platform_fee_rate.
 */
async function handleEscrowRelease(job: Job): Promise<void> {
  const { bookingId, escrowId } = escrowPayload.parse(job.data);
  const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } });
  if (!escrow || escrow.status !== 'held') {
    logger.info('escrow.release - nothing to release', { escrowId });
    return;
  }

  // Hold release if an open report or dispute exists (P4 dispute gating)
  const openReport = await prisma.report.findFirst({ where: { bookingId, status: 'open' } });
  const openDispute = await prisma.dispute.findFirst({ where: { bookingId, status: { in: ['open', 'under_review'] } } });
  if (openReport || openDispute) {
    logger.info('escrow.release - held: open report or dispute, retrying later', { bookingId });
    await enqueue(JOB_NAMES.ESCROW_RELEASE, { bookingId, escrowId }, { delay: 60 * 60_000 });
    return;
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { quoteRequest: { select: { categoryId: true } } },
  });
  if (!booking) return;

  const amount = Number(escrow.amount);
  const tip = Number(escrow.tipAmount);

  // Platform fee on afterPromo only (stored in escrow.platformFeeBase).
  // Fall back to compute on amount for legacy rows where platformFeeBase is null.
  const feeBase = escrow.platformFeeBase != null ? Number(escrow.platformFeeBase) : amount;

  // Use FeeRule engine (P2) with category scope, fall back to legacy rate
  const { computeFees } = await import('../services/fee-engine.service');
  const categoryId = booking.quoteRequest?.categoryId ?? undefined;
  const platformFee = await computeFees(feeBase, 'booking', categoryId);

  // ── Urgent fee 20/80 split (QA-004) ────────────────────────────────────
  // The urgent_same_day_fee.platform_share (default 20%) is the platform's
  // cut of the urgent fee.  splitUrgentFee() computes { platform, servicer }
  // rounded to cents; we deduct the platform share from the servicer payout
  // and record a separate urgent_fee transaction so the dashboard can source
  // the real ledger instead of deriving from settings.
  let urgentPlatformShare = 0;
  if (booking.isUrgent && booking.urgentFee) {
    const urgentCfg = await resolveUrgentFee();
    if (urgentCfg && urgentCfg.platform_share > 0) {
      const split = splitUrgentFee(Number(booking.urgentFee), urgentCfg.platform_share);
      urgentPlatformShare = split.platform;
    }
  }

  const servicerPayout = amount - platformFee + tip - urgentPlatformShare;

  await prisma.$transaction(async (tx) => {
    await tx.escrow.update({
      where: { id: escrowId },
      data: { status: 'released', releasedAt: new Date() },
    });
    // Credit the servicer's wallet with their payout (price minus platform fee, plus tip,
    // minus platform's urgent-fee share).
    await adjustCredit('servicer', booking.servicerId, servicerPayout, tx);
    await recordTransaction(
      {
        type: 'platform_fee',
        amount: platformFee,
        bookingId,
        servicerId: booking.servicerId,
        reference: `Platform fee (escrow release)`,
      },
      tx,
    );
    // Record the platform's urgent-fee share as a separate transaction type
    // so the admin dashboard can source urgentFeePlatformShare from the real
    // ledger instead of deriving it from settings (QA-004).
    if (urgentPlatformShare > 0) {
      await recordTransaction(
        {
          type: 'urgent_fee',
          amount: urgentPlatformShare,
          bookingId,
          servicerId: booking.servicerId,
          reference: `Urgent fee platform share (20/80 split)`,
        },
        tx,
      );
    }
    await recordTransaction(
      {
        type: 'escrow_release',
        amount: servicerPayout,
        bookingId,
        servicerId: booking.servicerId,
        escrowId,
        reference: 'Escrow released to servicer',
      },
      tx,
    );
  });

  // Platform-promo payback may now apply.
  await enqueue(JOB_NAMES.PROMO_CREDIT_PAYBACK, { bookingId }, { jobId: `promo:${bookingId}` });
  logger.info('escrow.release - released', { bookingId, servicerPayout, platformFee });
}

/** noshow.weekly_reset - clears every servicer's weekly no-show counter. */
async function handleWeeklyReset(): Promise<void> {
  const result = await prisma.servicer.updateMany({ data: { weeklyNoshow: 0 } });
  logger.info('noshow.weekly_reset - counters reset', { servicers: result.count });
}

/** Registers the Phase 3 booking/escrow/penalty jobs. */
export function register(): void {
  registerJob(JOB_NAMES.NOSHOW_DETECT, handleNoshowDetect);
  registerJob(JOB_NAMES.PENALTY_DEDUCT, handlePenaltyDeduct);
  registerJob(JOB_NAMES.ESCROW_RELEASE, handleEscrowRelease);
  registerJob(JOB_NAMES.NOSHOW_WEEKLY_RESET, handleWeeklyReset);
}
