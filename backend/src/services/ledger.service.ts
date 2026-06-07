import { Prisma, TransactionType, TransactionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Append-only money ledger helpers. Every money movement writes a TRANSACTION
 * row and an AUDIT_LOG entry (security-notes.md §9). Both tables are
 * never updated or deleted.
 */
export interface LedgerEntry {
  type: TransactionType;
  amount: number;
  status?: TransactionStatus;
  bookingId?: string;
  merchantId?: string;
  userId?: string;
  escrowId?: string;
  reference?: string;
  idempotencyKey?: string;
  /**
   * Stripe Checkout session id. Set on gateway settlements so the unique column
   * acts as the hard double-charge guard on webhook/redirect retries.
   */
  stripeSessionId?: string;
  metadata?: Record<string, unknown>;
}

/** Record a transaction and a paired audit-log entry, optionally in a tx. */
export async function recordTransaction(
  entry: LedgerEntry,
  tx: Prisma.TransactionClient = prisma,
): Promise<string> {
  const transaction = await tx.transaction.create({
    data: {
      type: entry.type,
      status: entry.status ?? 'completed',
      amount: entry.amount,
      bookingId: entry.bookingId ?? null,
      merchantId: entry.merchantId ?? null,
      userId: entry.userId ?? null,
      escrowId: entry.escrowId ?? null,
      reference: entry.reference ?? null,
      idempotencyKey: entry.idempotencyKey ?? null,
      stripeSessionId: entry.stripeSessionId ?? null,
      metadata: (entry.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });

  await tx.auditLog.create({
    data: {
      actorUserId: entry.userId ?? null,
      actorType: 'system',
      action: `transaction.${entry.type}`,
      entityType: 'Transaction',
      entityId: transaction.id,
      newValue: {
        type: entry.type,
        amount: entry.amount,
        bookingId: entry.bookingId ?? null,
        merchantId: entry.merchantId ?? null,
      },
    },
  });

  return transaction.id;
}

/** Write a plain audit-log entry for a non-money admin/system action. */
export async function recordAudit(params: {
  actorUserId?: string;
  actorType: string;
  action: string;
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const client = params.tx ?? prisma;
  await client.auditLog.create({
    data: {
      actorUserId: params.actorUserId ?? null,
      actorType: params.actorType,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      oldValue: (params.oldValue as Prisma.InputJsonValue) ?? undefined,
      newValue: (params.newValue as Prisma.InputJsonValue) ?? undefined,
      ipAddress: params.ipAddress ?? null,
    },
  });
}
