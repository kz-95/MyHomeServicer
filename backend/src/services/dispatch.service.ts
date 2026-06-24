import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { badRequest, businessRule, conflict, notFound } from '../lib/errors';
import { computeTotal, computePlatformFee, LineItem, ServicerTaxConfig } from '../lib/money';
import { enqueue, JOB_NAMES, jobQueue } from '../lib/queue';
import { emitToServicer, emitToServicers, emitToUser } from '../socket';
import { notify } from './notification.service';
import { getPlatformFeeRate, getSetting, getSstRate } from './settings.service';
import { adjustCredit } from './credit.service';
import { recordTransaction } from './ledger.service';
import { resolveListingAccept } from './listing-accept.service';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Starts the rotation dispatch for a quote request.
 * Called after the existing auto-accept loop in createQuote().
 * If the quote already has a confirmed booking (auto-accepted), does nothing.
 */
export async function startDispatchRotation(quoteRequestId: string): Promise<void> {
  const existingBooking = await prisma.booking.findFirst({
    where: { quoteRequestId, status: { not: 'cancelled' } },
  });
  if (existingBooking) return;

  // Find broadcasts with servicer schedule data.
  const broadcasts = await prisma.quoteBroadcast.findMany({
    where: { quoteRequestId, declinedAt: null },
    include: {
      servicer: {
        select: {
          id: true, isOnline: true, categoryId: true,
          schedules: {
            select: { weekday: true, timeSlot: true, isAvailable: true },
          },
        },
      },
    },
  });
  if (broadcasts.length === 0) return;

  const now = new Date();
  const mytNow = new Date(now.getTime() + 8 * 3600_000); // MYT (UTC+8) — shift before both day and hour reads
  const currentDay = WEEKDAYS[mytNow.getUTCDay()];
  const currentHour = mytNow.getUTCHours();

  const eligible: { servicerId: string }[] = [];
  for (const bc of broadcasts) {
    const m = bc.servicer;
    if (!m.isOnline) {
      logger.info('Servicer skipped — offline', { servicerId: m.id });
      continue;
    }

    // Check working hours from ServicerSchedule.
    const schedule = m.schedules.filter((s) => s.weekday === currentDay && s.isAvailable);
    if (schedule.length === 0) {
      logger.info('Servicer skipped — no working schedule for today', { servicerId: m.id, currentDay });
      continue;
    }

    const inWorkingHours = schedule.some((s) => {
      const slotRange = slotHourRange(s.timeSlot);
      return currentHour >= slotRange[0] && currentHour < slotRange[1];
    });
    if (!inWorkingHours) {
      logger.info('Servicer skipped — outside working hours', { servicerId: m.id, currentDay, currentHour });
      continue;
    }

    eligible.push({ servicerId: m.id });
  }

  if (eligible.length === 0) return;

  // Store rotation order as JSON in the first broadcast's metadata.
  const rotationOrder: Record<string, number> = {};
  eligible.forEach((e, i) => { rotationOrder[e.servicerId] = i; });

  const first = eligible[0];
  const firstBc = broadcasts.find((b) => b.servicerId === first.servicerId);
  if (!firstBc) return;

  await prisma.quoteBroadcast.update({
    where: { id: firstBc.id },
    data: {
      openedAt: new Date(),
      metadata: {
        rotationOrder,
        currentIndex: 0,
        startedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  // Fetch full quote details for the prompt.
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: quoteRequestId },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      address: { select: { address: true, lat: true, lng: true, district: true, state: true } },
      user: { select: { id: true, name: true, avatarUrl: true } },
    },
  });
  if (!quote) return;

  const timeoutSetting = await getSetting<{ seconds: number }>('dispatch_prompt_timeout_seconds');
  const timeout = timeoutSetting.seconds;

  await sendDispatchPrompt(firstBc.id, first.servicerId, quote, timeout);

  await enqueue(
    JOB_NAMES.DISPATCH_ROTATION,
    { broadcastId: firstBc.id, quoteRequestId },
    { delay: timeout * 1000, jobId: `dispatch:${firstBc.id}` },
  );

  logger.info('Dispatch rotation started', {
    quoteRequestId, servicerId: first.servicerId, eligibleCount: eligible.length, timeoutSeconds: timeout,
  });
}

/**
 * Sends the rich dispatch prompt to a servicer via socket.
 */
async function sendDispatchPrompt(
  broadcastId: string,
  servicerId: string,
  quote: {
    id: string;
    category: { name: string; icon: string | null };
    timeSlot: string;
    preferredDate: Date;
    budgetMin: number | null | { toNumber: () => number };
    budgetMax: number | null | { toNumber: () => number };
    propertyType: string | null;
    user: { id: string; name: string | null; avatarUrl: string | null } | null;
    address: { address: string; lat: number | null; lng: number | null; district: string | null; state: string | null } | null;
    serviceDetails: unknown;
  },
  timeoutSeconds: number,
): Promise<void> {
  emitToServicer(servicerId, 'dispatch.prompt', {
    broadcastId,
    quoteId: quote.id,
    category: { name: quote.category.name, icon: quote.category.icon },
    timeSlot: quote.timeSlot,
    preferredDate: quote.preferredDate,
    budgetMin: typeof quote.budgetMin === 'object' && quote.budgetMin ? (quote.budgetMin as any).toNumber() : (quote.budgetMin ?? 0),
    budgetMax: typeof quote.budgetMax === 'object' && quote.budgetMax ? (quote.budgetMax as any).toNumber() : (quote.budgetMax ?? 0),
    propertyType: quote.propertyType,
    customerName: quote.user?.name ?? 'Customer',
    customerAvatarUrl: quote.user?.avatarUrl ?? null,
    address: quote.address?.address ?? null,
    lat: quote.address?.lat ?? null,
    lng: quote.address?.lng ?? null,
    area: quote.address?.district ? `${quote.address.district}, ${quote.address.state}` : null,
    questions: quote.serviceDetails,
    timeoutSeconds,
  });

  await notify({
    servicerId,
    type: 'jobs',
    message: `New dispatch: ${quote.category.name} — review and accept`,
    linkUrl: '/servicer/jobs',
  });
}

/**
 * Handles a servicer accepting a dispatch prompt.
 */
export async function handleDispatchAccept(
  servicerId: string,
  broadcastId: string,
): Promise<{ bookingId: string }> {
  const broadcast = await prisma.quoteBroadcast.findUnique({
    where: { id: broadcastId },
    include: {
      quoteRequest: {
        select: { id: true, categoryId: true, userId: true, budgetMax: true, paymentMode: true, preferredDate: true, timeSlot: true, serviceDetails: true, status: true, isUrgent: true, urgentFee: true },
      },
      servicer: { select: { id: true, name: true } },
    },
  });
  if (!broadcast || broadcast.servicerId !== servicerId) {
    throw notFound('Dispatch prompt not found');
  }
  if (broadcast.declinedAt) {
    throw badRequest('You have already declined this dispatch');
  }

  // Cancel the rotation timeout job.
  await cancelRotationJob(broadcastId);

  const qr = broadcast.quoteRequest;

  // Compute the proposal price + duration + message from the servicer's listing
  // (SP-3 engine), falling back to budget/base when no listing exists.
  const accept = await resolveListingAccept(servicerId, {
    categoryId: qr.categoryId,
    serviceDetails: qr.serviceDetails,
    budgetMax: typeof qr.budgetMax === 'object' && qr.budgetMax ? (qr.budgetMax as any).toNumber() : (qr.budgetMax ?? null),
  });

  // Atomic "first accept wins": flip the quote open→matched in a single
  // conditional update inside the booking transaction. If another servicer
  // already matched it (or a customer selected a proposal), updateMany affects
  // 0 rows and we abort before creating the booking — closing the findFirst
  // race window (BUG: two servicers could both pass the old read check).
  const booking = await prisma.$transaction(async (tx) => {
    const claim = await tx.quoteRequest.updateMany({
      where: { id: qr.id, status: 'open' },
      data: { status: 'matched' },
    });
    if (claim.count === 0) {
      throw conflict('Sorry, this job was taken by another servicer.');
    }

    const proposal = await tx.quoteProposal.create({
      data: {
        quoteRequestId: qr.id,
        servicerId,
        proposedPrice: accept.price,
        etaMinutes: accept.durationMin,
        message: accept.message ?? 'Accepted via dispatch prompt',
        status: 'selected',
        isAuto: false,
      },
    });

    // Build line-items snapshot (spec: single service line + urgent fee).
    const lineItemsSnapshot: LineItem[] = [
      { label: 'Service', amount: Number(accept.price), taxable: true, serviceChargeable: true },
    ];
    if (qr.isUrgent && qr.urgentFee) {
      lineItemsSnapshot.push({
        label: 'Urgent Same-Day Fee',
        amount: Number(qr.urgentFee),
        taxable: false,
        serviceChargeable: false,
      });
    }

    const created = await tx.booking.create({
      data: {
        quoteRequestId: qr.id,
        servicerId,
        userId: qr.userId,
        proposalId: proposal.id,
        status: 'confirmed',
        price: accept.price,
        paymentMode: qr.paymentMode,
        scheduledDate: qr.preferredDate,
        timeSlot: qr.timeSlot,
        confirmedAt: new Date(),
        isUrgent: qr.isUrgent ?? false,
        urgentFee: qr.urgentFee ?? null,
        lineItems: lineItemsSnapshot as any,
      },
    });

    // ── Pay-now: charge canonical total → escrow ─────────────────
    if (qr.paymentMode === 'pay_now') {
      const servicer = await tx.servicer.findUnique({ where: { id: servicerId } });
      const [sstRate, feeRate] = await Promise.all([getSstRate(), getPlatformFeeRate()]);
      const config: ServicerTaxConfig = {
        serviceChargeRate: Number(servicer?.serviceChargeRate ?? 0),
        sstRegistered: servicer?.sstRegistered ?? false,
        sstRate,
        taxInclusive: servicer?.taxInclusive ?? false,
      };

      const totalResult = computeTotal(lineItemsSnapshot, 0, config, 0);
      const escrowTotal = totalResult.total;
      const afterPromo = totalResult.afterPromo;
      const platformFee = computePlatformFee(afterPromo, feeRate);

      const escrow = await tx.escrow.create({
        data: {
          bookingId: created.id,
          amount: escrowTotal,
          platformFeeBase: afterPromo,
          tipAmount: 0,
        },
      });

      const budgetMax = qr.budgetMax != null ? Number(qr.budgetMax) : null;

      if (budgetMax != null) {
        // Credit was held at quote creation — compare with escrow total.
        const diff = budgetMax - escrowTotal;
        if (diff > 0) {
          // Refund excess budget hold back to customer.
          await adjustCredit('user', qr.userId, diff, tx);
          await recordTransaction(
            {
              type: 'refund',
              amount: diff,
              bookingId: created.id,
              userId: qr.userId,
              escrowId: escrow.id,
              reference: 'Budget excess refund on dispatch accept',
            },
            tx,
          );
        } else if (diff < 0) {
          // Proposal exceeds budget hold — deduct the shortfall from wallet.
          const shortfall = -diff;
          const wallet = await tx.user.findUnique({
            where: { id: qr.userId },
            select: { creditBalance: true },
          });
          const currentBalance = Number(wallet?.creditBalance ?? 0);
          if (currentBalance < shortfall) {
            throw businessRule(
              `Insufficient balance to cover the price difference. Need RM${shortfall.toFixed(2)}, have RM${currentBalance.toFixed(2)}. Please top up your wallet.`,
            );
          }
          await adjustCredit('user', qr.userId, -shortfall, tx);
          await recordTransaction(
            {
              type: 'escrow_hold',
              amount: shortfall,
              bookingId: created.id,
              servicerId,
              userId: qr.userId,
              escrowId: escrow.id,
              reference: 'Shortfall deduction — dispatch price exceeded budget',
            },
            tx,
          );
        }
        // diff === 0: budget hold exactly matches escrow — no adjustment needed.
      } else {
        // No prior hold (open-ended budget) — deduct total now.
        await adjustCredit('user', qr.userId, -escrowTotal, tx);
        await recordTransaction(
          {
            type: 'escrow_hold',
            amount: escrowTotal,
            bookingId: created.id,
            servicerId,
            userId: qr.userId,
            escrowId: escrow.id,
            reference: 'Escrow hold on dispatch accept',
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
          servicerId,
          escrowId: escrow.id,
          reference: `Platform fee reserve (pay_now, ${(feeRate * 100).toFixed(1)}%)`,
        },
        tx,
      );
    }

    return created;
  });

  // Mark broadcast metadata.
  await prisma.quoteBroadcast.update({
    where: { id: broadcastId },
    data: {
      metadata: {
        ...((broadcast.metadata as Record<string, unknown>) ?? {}),
        acceptedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  // Notify customer + push a live booking event so their UI updates.
  await notify({
    userId: qr.userId,
    type: 'orders',
    message: `Your booking has been accepted!`,
    linkUrl: '/customer/bookings',
  });
  emitToUser(qr.userId, 'booking.confirmed', { bookingId: booking.id, servicerName: broadcast.servicer.name });

  // Tell every other broadcast servicer the quote is now matched so their
  // pending feeds drop it live (mirrors booking.service.selectProposal).
  const others = await prisma.quoteBroadcast.findMany({
    where: { quoteRequestId: qr.id, servicerId: { not: servicerId } },
    select: { servicerId: true },
  });
  if (others.length > 0) {
    emitToServicers(others.map((b) => b.servicerId), 'quote.matched', { quoteId: qr.id });
  }

  logger.info('Dispatch accepted', { servicerId, broadcastId, bookingId: booking.id });
  return { bookingId: booking.id };
}

/**
 * Handles a servicer declining a dispatch prompt.
 */
export async function handleDispatchDecline(
  servicerId: string,
  broadcastId: string,
): Promise<void> {
  const broadcast = await prisma.quoteBroadcast.findUnique({
    where: { id: broadcastId },
    include: {
      quoteRequest: {
        select: { id: true, categoryId: true },
        include: {
          broadcasts: {
            include: { servicer: { select: { id: true, isOnline: true } } },
          },
        },
      },
    },
  });
  if (!broadcast || broadcast.servicerId !== servicerId) {
    throw notFound('Dispatch prompt not found');
  }

  await prisma.quoteBroadcast.update({
    where: { id: broadcastId },
    data: { declinedAt: new Date() },
  });

  await cancelRotationJob(broadcastId);

  const meta = (broadcast.metadata as Record<string, unknown>) ?? {};
  const rotationOrder = (meta.rotationOrder as Record<string, number>) ?? {};
  const currentIndex = (meta.currentIndex as number) ?? 0;

  // Find next eligible servicer from rotation order.
  const eligibleIds = Object.entries(rotationOrder)
    .sort(([, a], [, b]) => a - b)
    .map(([id]) => id);

  const nextIndex = currentIndex + 1;
  if (nextIndex < eligibleIds.length) {
    const nextServicerId = eligibleIds[nextIndex];

    const nextBroadcast = broadcast.quoteRequest.broadcasts.find(
      (b) => b.servicerId === nextServicerId && b.declinedAt === null,
    );
    if (nextBroadcast && nextBroadcast.servicer.isOnline) {
      await prisma.quoteBroadcast.update({
        where: { id: nextBroadcast.id },
        data: {
          openedAt: new Date(),
          metadata: { ...meta, currentIndex: nextIndex } as Prisma.InputJsonValue,
        },
      });

      const quote = await prisma.quoteRequest.findUnique({
        where: { id: broadcast.quoteRequestId },
        include: {
          category: { select: { id: true, name: true, icon: true } },
          address: { select: { address: true, lat: true, lng: true, district: true, state: true } },
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
      if (quote) {
        const timeoutSetting = await getSetting<{ seconds: number }>('dispatch_prompt_timeout_seconds');
        const timeout = timeoutSetting.seconds;

        await sendDispatchPrompt(nextBroadcast.id, nextServicerId, quote, timeout);

        await enqueue(
          JOB_NAMES.DISPATCH_ROTATION,
          { broadcastId: nextBroadcast.id, quoteRequestId: broadcast.quoteRequestId },
          { delay: timeout * 1000, jobId: `dispatch:${nextBroadcast.id}` },
        );

        logger.info('Dispatch rotated', {
          quoteRequestId: broadcast.quoteRequestId,
          fromServicer: servicerId,
          toServicer: nextServicerId,
        });
        return;
      }
    }
  }

  logger.info('Dispatch rotation exhausted, falling to async pool', {
    quoteRequestId: broadcast.quoteRequestId,
  });
}

/**
 * Handles dispatch rotation timeout (BullMQ job handler).
 */
export async function handleDispatchTimeout(payload: {
  broadcastId: string;
  quoteRequestId: string;
}): Promise<void> {
  const { broadcastId } = payload;
  const broadcast = await prisma.quoteBroadcast.findUnique({
    where: { id: broadcastId },
    include: {
      servicer: { select: { id: true } },
      quoteRequest: { select: { id: true } },
    },
  });
  if (!broadcast || broadcast.declinedAt) return;

  const booking = await prisma.booking.findFirst({
    where: { quoteRequestId: broadcast.quoteRequestId, status: { not: 'cancelled' } },
  });
  if (booking) return;

  // Mark as declined (timed out) and rotate.
  await prisma.quoteBroadcast.update({
    where: { id: broadcastId },
    data: { declinedAt: new Date() },
  });
  await handleDispatchDecline(broadcast.servicer.id, broadcastId);
}

/** Map a timeSlot to an hour range [start, end). */
function slotHourRange(slot: string): [number, number] {
  const map: Record<string, [number, number]> = {
    morning: [6, 10],
    noon: [10, 13],
    afternoon: [13, 17],
    evening: [17, 20],
    night: [20, 24],
  };
  return map[slot] ?? [6, 18];
}

/** Cancel the rotation timeout job for a broadcast. */
async function cancelRotationJob(broadcastId: string): Promise<void> {
  const jobs = await jobQueue.getJobs(['delayed']);
  const target = jobs.find(
    (j) => j.name === JOB_NAMES.DISPATCH_ROTATION && (j.data as Record<string, unknown>)?.broadcastId === broadcastId,
  );
  if (target) {
    await target.remove();
  }
}
