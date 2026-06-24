import { Job } from 'bullmq';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { JOB_NAMES } from '../lib/queue';
import { registerJob } from './index';
import { emitToUser } from '../socket';
import { notify } from '../services/notification.service';
import { getSetting } from '../services/settings.service';
import { adjustCredit } from '../services/credit.service';
import { recordTransaction } from '../services/ledger.service';

/** BullMQ payloads are Zod-validated before processing (security-notes §10). */
const quoteExpiryPayload = z.object({ quoteRequestId: z.string().uuid() });
const noResponsePayload = z.object({
  quoteRequestId: z.string().uuid(),
  userId: z.string().uuid(),
});

/**
 * quote.expiry — fires at servicer_deadline. Bundles all received proposals
 * and notifies the customer that their proposals are ready to review.
 */
async function handleQuoteExpiry(job: Job): Promise<void> {
  const { quoteRequestId } = quoteExpiryPayload.parse(job.data);
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: quoteRequestId },
    include: { _count: { select: { proposals: true } } },
  });
  if (!quote || quote.status !== 'open') {
    logger.info('quote.expiry skipped — quote not open', { quoteRequestId });
    return;
  }

  const proposalCount = quote._count.proposals;
  if (proposalCount > 0) {
    emitToUser(quote.userId, 'quote.proposals_ready', { quoteId: quote.id, proposalCount });
    await notify({
      userId: quote.userId,
      type: 'orders',
      message: `Your quote received ${proposalCount} proposal(s). Review and pick one.`,
      linkQuoteList: `/customer/quotes/${quote.id}/proposals`,
    });
  }
  logger.info('quote.expiry processed', { quoteRequestId, proposalCount });
}

/**
 * quote.no_response — fires at proposal_deadline. If the quote got zero
 * proposals, expires it, issues a discount code and emits
 * quote.expired_no_response. If proposals WERE received, the quote is left
 * `open` so the customer can still select one and create a booking — the
 * proposal deadline closes the servicer submission window, it is not a
 * customer-selection deadline.
 * Idempotent: re-runs are no-ops once the quote leaves `open`.
 */
async function handleNoResponse(job: Job): Promise<void> {
  const { quoteRequestId } = noResponsePayload.parse(job.data);
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: quoteRequestId },
    include: { _count: { select: { proposals: true } } },
  });
  if (!quote || quote.status !== 'open') {
    logger.info('quote.no_response skipped — quote not open', { quoteRequestId });
    return;
  }

  // BE-043 — proposals were received: the quote MUST stay `open` so the
  // customer can still select one (POST /quotes/:id/select requires the
  // quote to be `open`). A quote with proposals only leaves `open` when the
  // customer selects (→ matched) or cancels. Previously this job expired the
  // quote unconditionally at the proposal deadline, so every post-deadline
  // selection was rejected and no booking was ever created.
  if (quote._count.proposals > 0) {
    logger.info('quote.no_response — proposals present, quote left open for selection', {
      quoteRequestId,
      proposalCount: quote._count.proposals,
    });
    return;
  }

  // Zero proposals — expire the quote and issue a sorry discount code.
  // BE-008: wrap status update + refund in a $transaction with a conditional
  // update guard to prevent double-refund on concurrent BullMQ retries.
  const didExpire = await prisma.$transaction(async (tx) => {
    // Atomic conditional update — only succeeds if still 'open'. On retry
    // the row is already 'expired' so updateMany returns count=0 → bail.
    const updated = await tx.quoteRequest.updateMany({
      where: { id: quoteRequestId, status: 'open' },
      data: { status: 'expired' },
    });
    if (updated.count === 0) {
      logger.info('quote.no_response — already expired by another worker', { quoteRequestId });
      return false;
    }

    // Refund any credit held at quote creation time (pay_now with budgetMax).
    if (quote.paymentMode === 'pay_now' && quote.budgetMax != null) {
      // Idempotency guard — check for existing refund before issuing
      const existingRefund = await tx.transaction.findFirst({
        where: {
          userId: quote.userId,
          type: 'refund',
          reference: { contains: quoteRequestId },
        },
      });
      if (existingRefund) {
        logger.info('quote.no_response — refund already processed, skipping', { quoteRequestId });
      } else {
        const refundAmount = Number(quote.budgetMax) + Number(quote.tipAmount ?? 0);
        await adjustCredit('user', quote.userId, refundAmount, tx);
        await recordTransaction({
          type: 'refund',
          amount: refundAmount,
          userId: quote.userId,
          reference: `Refund — quote ${quoteRequestId} expired with no proposals`,
        }, tx);
      }
    }
    return true;
  });

  if (!didExpire) return;

  const existing = await prisma.discountCode.findUnique({ where: { quoteRequestId } });
  if (existing) {
    logger.info('quote.no_response — discount already issued', { quoteRequestId });
    return;
  }

  const cfg = await getSetting<{
    discount_type: 'percent' | 'fixed';
    value: number;
    expires_in_days: number;
  }>('no_response_discount');

  const code = `SORRY-${randomBytes(3).toString('hex').toUpperCase()}`;
  const discount = await prisma.discountCode.create({
    data: {
      code,
      userId: quote.userId,
      quoteRequestId,
      discountType: cfg.discount_type,
      value: cfg.value,
      expiresAt: new Date(Date.now() + cfg.expires_in_days * 86_400_000),
    },
  });

  emitToUser(quote.userId, 'quote.expired_no_response', {
    quoteId: quote.id,
    discountCode: discount.code,
    discountValue: discount.value,
  });
  await notify({
    userId: quote.userId,
    type: 'orders',
    message: `Sorry — no servicers responded. Here's a discount code: ${discount.code}`,
    linkReorder: `/customer/quote/new?from=${quote.id}`,
  });
  logger.info('quote.no_response — discount issued', { quoteRequestId, code });
}

/** Registers the Phase 2 quote jobs with the worker. */
export function register(): void {
  registerJob(JOB_NAMES.QUOTE_EXPIRY, handleQuoteExpiry);
  registerJob(JOB_NAMES.QUOTE_NO_RESPONSE, handleNoResponse);
}
