import { prisma } from '../lib/prisma';
import { notFound, businessRule } from '../lib/errors';
import { logger } from '../lib/logger';
import { notify } from './notification.service';

/**
 * Dispute Service - CRUD for the Dispute model plus resolution logic.
 *
 * Disputes are tied to a Booking (and optionally an Escrow). They can be
 * opened by customers, servicers, or admins. Resolution actions (resolve,
 * dismiss) are admin-only and may trigger escrow actions.
 *
 * When a dispute is open, the escrow auto-release job checks for open
 * disputes and holds the release (already implemented in booking.jobs.ts
 * via open Report checks - disputes follow the same pattern).
 */

// ── Query ──────────────────────────────────────────────────────────────────────

/** List all disputes (admin). */
export async function listDisputes(filters?: {
  status?: string;
  openedBy?: string;
}) {
  return prisma.dispute.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.openedBy ? { openedBy: filters.openedBy } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      booking: {
        select: { id: true, price: true, status: true },
      },
      escrow: {
        select: { id: true, amount: true, status: true },
      },
    },
  });
}

/** Get a single dispute by id. */
export async function getDispute(id: string) {
  const dispute = await prisma.dispute.findUnique({
    where: { id },
    include: {
      booking: {
        select: { id: true, price: true, status: true, userId: true, servicerId: true },
      },
      escrow: {
        select: { id: true, amount: true, status: true },
      },
    },
  });
  if (!dispute) throw notFound('Dispute not found');
  return dispute;
}

// ── Mutate ─────────────────────────────────────────────────────────────────────

export interface OpenDisputeInput {
  bookingId: string;
  reason: string;
  escrowId?: string;
}

/**
 * Open a dispute on a booking. Can be called by customer, servicer, or admin.
 * Only one open dispute per booking at a time.
 */
export async function openDispute(
  openedById: string,
  openedBy: 'customer' | 'servicer' | 'admin',
  input: OpenDisputeInput,
) {
  // Block duplicate open disputes
  const existing = await prisma.dispute.findFirst({
    where: { bookingId: input.bookingId, status: { in: ['open', 'under_review'] } },
  });
  if (existing) {
    throw businessRule('An open dispute already exists for this booking.');
  }

  // Verify booking exists
  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw notFound('Booking not found');

  const dispute = await prisma.dispute.create({
    data: {
      bookingId: input.bookingId,
      escrowId: input.escrowId ?? null,
      openedById,
      openedBy,
      reason: input.reason,
      status: 'open',
    },
  });

  // Notify admins
  notify({
    userId: 'admin',
    type: 'system',
    message: `Dispute opened on booking #${input.bookingId.slice(-8)} by ${openedBy}`,
  }).catch((err) => logger.error('Failed to notify admin of dispute', { error: String(err) }));

  return dispute;
}

// ── Resolution (admin-only) ───────────────────────────────────────────────────

export interface ResolveDisputeInput {
  resolution: 'refund_customer' | 'release_servicer' | 'partial';
  notes?: string;
}

/**
 * Resolve a dispute (admin action). Sets status to 'resolved' and records
 * the resolution type. Actual escrow adjustment is handled by the calling
 * route handler.
 */
export async function resolveDispute(disputeId: string, input: ResolveDisputeInput) {
  const dispute = await getDispute(disputeId);
  if (!['open', 'under_review'].includes(dispute.status)) {
    throw businessRule(`Cannot resolve dispute in "${dispute.status}" status.`);
  }

  return prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: 'resolved',
      resolution: input.resolution,
      resolvedAt: new Date(),
    },
  });
}

/** Dismiss a dispute (admin action). */
export async function dismissDispute(disputeId: string) {
  const dispute = await getDispute(disputeId);
  if (!['open', 'under_review'].includes(dispute.status)) {
    throw businessRule(`Cannot dismiss dispute in "${dispute.status}" status.`);
  }

  return prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: 'dismissed',
      resolvedAt: new Date(),
    },
  });
}

/** Set dispute to under_review (admin action). */
export async function reviewDispute(disputeId: string) {
  const dispute = await getDispute(disputeId);
  if (dispute.status !== 'open') {
    throw businessRule(`Cannot set dispute to under_review from "${dispute.status}" status.`);
  }
  return prisma.dispute.update({
    where: { id: disputeId },
    data: { status: 'under_review' },
  });
}
