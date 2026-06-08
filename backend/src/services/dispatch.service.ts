import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { badRequest, conflict, notFound } from '../lib/errors';
import { enqueue, JOB_NAMES, jobQueue } from '../lib/queue';
import { emitToMerchant } from '../socket';
import { notify } from './notification.service';
import { getSetting } from './settings.service';

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

  // Find broadcasts with merchant schedule data.
  const broadcasts = await prisma.quoteBroadcast.findMany({
    where: { quoteRequestId, declinedAt: null },
    include: {
      merchant: {
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
  const currentDay = WEEKDAYS[now.getUTCDay()];
  const currentHour = now.getUTCHours() + 8; // MYT (UTC+8)

  const eligible: { merchantId: string }[] = [];
  for (const bc of broadcasts) {
    const m = bc.merchant;
    if (!m.isOnline) continue;

    // Check working hours from ServicerSchedule.
    const schedule = m.schedules.filter((s) => s.weekday === currentDay && s.isAvailable);
    if (schedule.length === 0) continue;

    const inWorkingHours = schedule.some((s) => {
      const slotRange = slotHourRange(s.timeSlot);
      return currentHour >= slotRange[0] && currentHour < slotRange[1];
    });
    if (!inWorkingHours) continue;

    eligible.push({ merchantId: m.id });
  }

  if (eligible.length === 0) return;

  // Store rotation order as JSON in the first broadcast's metadata.
  const rotationOrder: Record<string, number> = {};
  eligible.forEach((e, i) => { rotationOrder[e.merchantId] = i; });

  const first = eligible[0];
  const firstBc = broadcasts.find((b) => b.merchantId === first.merchantId);
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

  await sendDispatchPrompt(firstBc.id, first.merchantId, quote);

  const timeoutSetting = await getSetting<{ seconds: number }>('dispatch_prompt_timeout_seconds');
  const timeout = timeoutSetting.seconds;
  await enqueue(
    JOB_NAMES.DISPATCH_ROTATION,
    { broadcastId: firstBc.id, quoteRequestId },
    { delay: timeout * 1000, jobId: `dispatch:${firstBc.id}` },
  );

  logger.info('Dispatch rotation started', {
    quoteRequestId, merchantId: first.merchantId, eligibleCount: eligible.length, timeoutSeconds: timeout,
  });
}

/**
 * Sends the rich dispatch prompt to a servicer via socket.
 */
async function sendDispatchPrompt(
  broadcastId: string,
  merchantId: string,
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
): Promise<void> {
  emitToMerchant(merchantId, 'dispatch.prompt', {
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
  });

  await notify({
    merchantId,
    type: 'jobs',
    message: `New dispatch: ${quote.category.name} — review and accept`,
    linkUrl: '/servicer/jobs',
  });
}

/**
 * Handles a servicer accepting a dispatch prompt.
 */
export async function handleDispatchAccept(
  merchantId: string,
  broadcastId: string,
): Promise<{ bookingId: string }> {
  const broadcast = await prisma.quoteBroadcast.findUnique({
    where: { id: broadcastId },
    include: {
      quoteRequest: {
        select: { id: true, categoryId: true, userId: true, budgetMax: true, paymentMode: true, preferredDate: true, timeSlot: true },
      },
      merchant: { select: { id: true, name: true } },
    },
  });
  if (!broadcast || broadcast.merchantId !== merchantId) {
    throw notFound('Dispatch prompt not found');
  }
  if (broadcast.declinedAt) {
    throw badRequest('You have already declined this dispatch');
  }

  // Atomic "first accept wins".
  const existingBooking = await prisma.booking.findFirst({
    where: { quoteRequestId: broadcast.quoteRequestId, status: { not: 'cancelled' } },
  });
  if (existingBooking) {
    throw conflict('This job has already been accepted by another servicer');
  }

  // Cancel the rotation timeout job.
  await cancelRotationJob(broadcastId);

  const qr = broadcast.quoteRequest;

  // Create proposal as "selected" (accepted).
  const proposal = await prisma.quoteProposal.create({
    data: {
      quoteRequestId: qr.id,
      merchantId,
      proposedPrice: typeof qr.budgetMax === 'object' && qr.budgetMax ? (qr.budgetMax as any).toNumber() : (qr.budgetMax ?? 0),
      message: 'Accepted via dispatch prompt',
      status: 'selected',
      isAuto: false,
    },
  });

  // Create booking in confirmed status.
  const booking = await prisma.booking.create({
    data: {
      quoteRequestId: qr.id,
      merchantId,
      userId: qr.userId,
      proposalId: proposal.id,
      status: 'confirmed',
      price: typeof qr.budgetMax === 'object' && qr.budgetMax ? (qr.budgetMax as any).toNumber() : (qr.budgetMax ?? 0),
      paymentMode: qr.paymentMode,
      scheduledDate: qr.preferredDate,
      timeSlot: qr.timeSlot,
      confirmedAt: new Date(),
    },
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

  // Notify customer.
  await notify({
    userId: qr.userId,
    type: 'orders',
    message: `Your booking has been accepted!`,
    linkUrl: '/customer/bookings',
  });

  logger.info('Dispatch accepted', { merchantId, broadcastId, bookingId: booking.id });
  return { bookingId: booking.id };
}

/**
 * Handles a servicer declining a dispatch prompt.
 */
export async function handleDispatchDecline(
  merchantId: string,
  broadcastId: string,
): Promise<void> {
  const broadcast = await prisma.quoteBroadcast.findUnique({
    where: { id: broadcastId },
    include: {
      quoteRequest: {
        select: { id: true, categoryId: true },
        include: {
          broadcasts: {
            include: { merchant: { select: { id: true, isOnline: true } } },
          },
        },
      },
    },
  });
  if (!broadcast || broadcast.merchantId !== merchantId) {
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

  // Find next eligible merchant from rotation order.
  const eligibleIds = Object.entries(rotationOrder)
    .sort(([, a], [, b]) => a - b)
    .map(([id]) => id);

  const nextIndex = currentIndex + 1;
  if (nextIndex < eligibleIds.length) {
    const nextMerchantId = eligibleIds[nextIndex];

    const nextBroadcast = broadcast.quoteRequest.broadcasts.find(
      (b) => b.merchantId === nextMerchantId && b.declinedAt === null,
    );
    if (nextBroadcast && nextBroadcast.merchant.isOnline) {
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
        await sendDispatchPrompt(nextBroadcast.id, nextMerchantId, quote);

        const timeoutSetting = await getSetting<{ seconds: number }>('dispatch_prompt_timeout_seconds');
        const timeout = timeoutSetting.seconds;
        await enqueue(
          JOB_NAMES.DISPATCH_ROTATION,
          { broadcastId: nextBroadcast.id, quoteRequestId: broadcast.quoteRequestId },
          { delay: timeout * 1000, jobId: `dispatch:${nextBroadcast.id}` },
        );

        logger.info('Dispatch rotated', {
          quoteRequestId: broadcast.quoteRequestId,
          fromMerchant: merchantId,
          toMerchant: nextMerchantId,
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
      merchant: { select: { id: true } },
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
  await handleDispatchDecline(broadcast.merchant.id, broadcastId);
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
