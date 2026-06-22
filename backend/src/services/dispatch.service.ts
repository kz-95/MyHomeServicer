import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { badRequest, conflict, notFound } from '../lib/errors';
import { enqueue, JOB_NAMES, jobQueue } from '../lib/queue';
import { emitToServicer, emitToServicers, emitToUser } from '../socket';
import { notify } from './notification.service';
import { getSetting } from './settings.service';
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
  const currentDay = WEEKDAYS[now.getUTCDay()];
  const currentHour = now.getUTCHours() + 8; // MYT (UTC+8)

  const eligible: { servicerId: string }[] = [];
  for (const bc of broadcasts) {
    const m = bc.servicer;
    if (!m.isOnline) continue;

    // Check working hours from ServicerSchedule.
    const schedule = m.schedules.filter((s) => s.weekday === currentDay && s.isAvailable);
    if (schedule.length === 0) continue;

    const inWorkingHours = schedule.some((s) => {
      const slotRange = slotHourRange(s.timeSlot);
      return currentHour >= slotRange[0] && currentHour < slotRange[1];
    });
    if (!inWorkingHours) continue;

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

  await sendDispatchPrompt(firstBc.id, first.servicerId, quote);

  const timeoutSetting = await getSetting<{ seconds: number }>('dispatch_prompt_timeout_seconds');
  const timeout = timeoutSetting.seconds;
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
        select: { id: true, categoryId: true, userId: true, budgetMax: true, paymentMode: true, preferredDate: true, timeSlot: true, serviceDetails: true, status: true },
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

    return tx.booking.create({
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
      },
    });
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
        await sendDispatchPrompt(nextBroadcast.id, nextServicerId, quote);

        const timeoutSetting = await getSetting<{ seconds: number }>('dispatch_prompt_timeout_seconds');
        const timeout = timeoutSetting.seconds;
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
