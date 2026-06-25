import { Job } from 'bullmq';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { JOB_NAMES } from '../lib/queue';
import { registerJob } from './index';
import { generateInvoice } from '../services/invoice.service';
import { recordTransaction } from '../services/ledger.service';
import { notify } from '../services/notification.service';

const invoicePayload = z.object({
  bookingId: z.string().uuid(),
  servicerId: z.string().uuid(),
});
const promoPayload = z.object({ bookingId: z.string().uuid() });
const withdrawalPayload = z.object({
  withdrawalId: z.string().uuid(),
  servicerId: z.string().uuid(),
});
const pushPayload = z.object({
  userId: z.string().uuid(),
  type: z.string(),
  message: z.string(),
  linkQuoteList: z.string().optional(),
  linkReorder: z.string().optional(),
});

/** invoice.generate - builds the INVOICE row + PDF for a completed booking. */
async function handleInvoiceGenerate(job: Job): Promise<void> {
  const { bookingId, servicerId } = invoicePayload.parse(job.data);
  await generateInvoice(bookingId, servicerId);
}

/**
 * promo.credit_payback - for a platform promo used on a booking, reimburses
 * the servicer via credit balance once the job is done + payment confirmed.
 * Idempotent: skips if a redemption is already recorded for the booking.
 */
async function handlePromoCreditPayback(job: Job): Promise<void> {
  const { bookingId } = promoPayload.parse(job.data);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { quoteRequest: true },
  });
  if (!booking?.quoteRequest.promoCode) return;

  // Look up an unpaid redemption for this booking created by the promotion engine
  const redemption = await prisma.promotionRedemption.findFirst({
    where: { bookingId, paidToServicerViaCredit: false },
  });
  if (!redemption) return;

  const discount = Number(redemption.amountDiscounted);

  await prisma.$transaction(async (tx) => {
    await tx.promotionRedemption.update({
      where: { id: redemption.id },
      data: { paidToServicerViaCredit: true, paidAt: new Date() },
    });
    await tx.promotion.update({
      where: { id: redemption.promotionId },
      data: { usedCount: { increment: 1 } },
    });
    const servicer = await tx.servicer.update({
      where: { id: booking.servicerId },
      data: { creditBalance: { increment: discount } },
    });
    await tx.servicerCreditLog.create({
      data: {
        servicerId: booking.servicerId,
        type: 'promo_payback',
        amount: discount,
        balanceAfter: servicer.creditBalance,
        referenceId: bookingId,
        note: `Platform promo reimbursed`,
      },
    });
    // T19: record promo_cost transaction for dashboard cost tracking
    await recordTransaction(
      {
        type: 'promo_cost',
        amount: discount,
        bookingId,
        servicerId: booking.servicerId,
        userId: booking.userId,
        reference: 'Platform promo reimbursement',
        status: 'completed',
      },
      tx,
    );
    // Track marketing-budget spend.
    const budget = await tx.platformMarketingBudget.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
    if (budget) {
      await tx.platformMarketingBudget.update({
        where: { id: budget.id },
        data: { spentAmount: { increment: discount } },
      });
    }
  });
  logger.info('promo.credit_payback - servicer reimbursed', { bookingId, discount });
}

/** withdrawal.notify - alerts all admins of a pending withdrawal request. */
async function handleWithdrawalNotify(job: Job): Promise<void> {
  const { withdrawalId, servicerId } = withdrawalPayload.parse(job.data);
  const servicer = await prisma.servicer.findUnique({ where: { id: servicerId } });
  const admins = await prisma.user.findMany({ where: { role: 'admin', deletedAt: null } });
  for (const admin of admins) {
    await notify({
      userId: admin.id,
      type: 'withdrawal_pending',
      message: `${servicer?.businessName ?? 'A servicer'} submitted a withdrawal request for review.`,
    });
  }
  logger.info('withdrawal.notify - admins alerted', { withdrawalId });
}

/** notification.push - generic non-blocking notification dispatcher. */
async function handleNotificationPush(job: Job): Promise<void> {
  const payload = pushPayload.parse(job.data);
  await notify(payload);
}

/** Registers the Phase 4 admin/invoice/promo jobs. */
export function register(): void {
  registerJob(JOB_NAMES.INVOICE_GENERATE, handleInvoiceGenerate);
  registerJob(JOB_NAMES.PROMO_CREDIT_PAYBACK, handlePromoCreditPayback);
  registerJob(JOB_NAMES.WITHDRAWAL_NOTIFY, handleWithdrawalNotify);
  registerJob(JOB_NAMES.NOTIFICATION_PUSH, handleNotificationPush);
}
