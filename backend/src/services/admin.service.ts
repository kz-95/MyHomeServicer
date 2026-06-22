import { exec } from 'child_process';
import { promisify } from 'util';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { recordAudit, recordTransaction } from './ledger.service';
import { validateSettingValue } from '../lib/json-schemas';
import { maskPhone, maskBankAccount } from '../lib/mask';
import { enqueue, JOB_NAMES } from '../lib/queue';
import { allowDemo } from '../config/env';

const execAsync = promisify(exec);

/** Aggregated platform stats for the admin dashboard. */
export async function getDashboard() {
  const [servicers, bookings, completed, openReports, pendingAppeals, pendingWithdrawals, pendingCatReqs, feeResult] =
    await Promise.all([
      prisma.servicer.count({ where: { deletedAt: null } }),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: 'completed' } }),
      prisma.report.count({ where: { status: 'open' } }),
      prisma.penaltyAppeal.count({ where: { status: 'pending' } }),
      prisma.servicerWithdrawal.count({ where: { status: 'pending' } }),
      prisma.categoryRequest.count({ where: { status: 'pending' } }),
      prisma.invoice.aggregate({ _sum: { platformFee: true } }),
    ]);

  return {
    servicers,
    bookings,
    completedBookings: completed,
    platformRevenue: feeResult._sum.platformFee ?? 0,
    queues: {
      openReports,
      pendingAppeals,
      pendingWithdrawals,
      pendingCategoryRequests: pendingCatReqs,
    },
  };
}

/**
 * Returns daily platform revenue (from invoice platformFee) for the last
 * `days` calendar days, padded with zeros for days with no revenue.
 */
export async function getDashboardRevenue(days = 30): Promise<{ date: string; revenue: number }[]> {
  type Row = { date: Date; revenue: bigint | number | string };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      DATE("issued_at") AS date,
      COALESCE(SUM("platform_fee"), 0) AS revenue
    FROM "invoices"
    WHERE "issued_at" >= CURRENT_DATE - INTERVAL '1 day' * ${days - 1}
    GROUP BY DATE("issued_at")
    ORDER BY date ASC
  `;

  // Build a map of date-string → revenue so we can fill gaps.
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = new Date(row.date).toISOString().slice(0, 10);
    map.set(key, Number(row.revenue));
  }

  // Produce a dense array covering every day in the window.
  const result: { date: string; revenue: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, revenue: map.get(key) ?? 0 });
  }
  return result;
}

/**
 * Wipes and re-seeds the demo database by running `npm run reseed`. A
 * development convenience only — refused when NODE_ENV=production (the seed
 * scripts also refuse independently). The admin's session is invalidated
 * afterwards since accounts are recreated with fresh IDs.
 */
export async function runReseed(): Promise<{ ok: boolean; durationMs: number }> {
  if (!allowDemo) {
    throw forbidden('Reseeding is disabled in production');
  }
  const start = Date.now();
  logger.warn('Admin triggered a database reseed');
  try {
    await execAsync('npm run reseed', {
      cwd: process.cwd(),
      timeout: 180_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    logger.error('Reseed failed', { error: (err as Error).message });
    throw new ApiError('INTERNAL_ERROR', `Reseed failed: ${(err as Error).message}`);
  }
  const durationMs = Date.now() - start;
  logger.info('Reseed complete', { durationMs });
  return { ok: true, durationMs };
}

export async function runClear(): Promise<{ ok: boolean; durationMs: number }> {
  if (!allowDemo) throw forbidden('Clear is disabled in production');
  const start = Date.now();
  logger.warn('Admin triggered a content clear — demo accounts preserved');
  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.promotionRedemption.deleteMany();
  await prisma.servicerCreditLog.deleteMany();
  await prisma.penaltyAppeal.deleteMany();
  await prisma.penaltyLog.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.escrow.deleteMany();
  await prisma.report.deleteMany();
  await prisma.orderHistory.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.quoteProposal.deleteMany();
  await prisma.quoteBroadcast.deleteMany();
  await prisma.discountCode.deleteMany();
  await prisma.quoteRequest.deleteMany();
  await prisma.servicerWithdrawal.deleteMany();
  await prisma.categoryRequest.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.quotePreset.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.userDevice.deleteMany();
  await prisma.jobQueue.deleteMany();
  await prisma.idempotencyFallback.deleteMany();
  const durationMs = Date.now() - start;
  logger.info('Clear complete', { durationMs });
  return { ok: true, durationMs };
}

/**
 * Clears all transactional content (bookings, quotes, chat, penalties, etc.)
 * while preserving demo account structure: users, servicers, services,
 * deposits, categories, settings, feature flags, FAQ, penalty rules.
 * Requires the admin action PIN for confirmation.
 */
export async function runClearContent(pin: string): Promise<{ ok: boolean; durationMs: number }> {
  if (!allowDemo) throw forbidden('Clear content is disabled in production');
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!admin?.actionPinHash) throw badRequest('Admin account not found or PIN not set');
  const pinValid = await bcrypt.compare(pin, admin.actionPinHash);
  if (!pinValid) throw badRequest('Incorrect PIN');

  const start = Date.now();
  logger.warn('Admin triggered unplug — removing all demo data');

  await prisma.chatMessage.deleteMany();
  await prisma.chatSession.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.llmApiKey.deleteMany({ where: { label: { startsWith: 'Demo ' } } });
  await prisma.transaction.deleteMany();
  await prisma.promotionRedemption.deleteMany();
  await prisma.servicerCreditLog.deleteMany();
  await prisma.penaltyAppeal.deleteMany();
  await prisma.penaltyLog.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.escrow.deleteMany();
  await prisma.report.deleteMany();
  await prisma.orderHistory.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.quoteProposal.deleteMany();
  await prisma.quoteBroadcast.deleteMany();
  await prisma.discountCode.deleteMany();
  await prisma.quoteRequest.deleteMany();
  await prisma.servicerWithdrawal.deleteMany();
  await prisma.categoryRequest.deleteMany();
  await prisma.promotion.deleteMany();
  await prisma.quotePreset.deleteMany();
  await prisma.customerPoints.deleteMany();
  await prisma.pointsTransaction.deleteMany();
  await prisma.redemption.deleteMany();
  await prisma.reward.deleteMany();
  await prisma.loyaltyTier.deleteMany();
  await prisma.servicerDeposit.deleteMany();
  await prisma.servicerDocument.deleteMany();
  await prisma.servicerSchedule.deleteMany();
  await prisma.servicerProposalPreset.deleteMany();
  await prisma.servicerService.deleteMany();
  await prisma.servicer.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.userDevice.deleteMany();
  await prisma.userAddress.deleteMany();
  await prisma.user.deleteMany({ where: { id: { not: admin.id } } });
  await prisma.jobQueue.deleteMany();
  await prisma.idempotencyFallback.deleteMany();

  const durationMs = Date.now() - start;
  logger.info('Unplug complete — demo accounts removed', { durationMs });
  return { ok: true, durationMs };
}

// ── Servicer management ──────────────────────────────────────────────────────

export async function listServicers(kycStatus?: string) {
  const servicers = await prisma.servicer.findMany({
    where: {
      deletedAt: null,
      ...(kycStatus ? { kycStatus: kycStatus as 'pending' | 'approved' | 'rejected' } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: { deposit: true },
  });
  return servicers.map((m) => ({
    id: m.id,
    businessName: m.businessName,
    email: m.email,
    phone: maskPhone(m.phone),
    kycStatus: m.kycStatus,
    isBanned: m.isBanned,
    rating: m.rating,
    depositBalance: m.deposit?.currentBalance ?? 0,
    creditBalance: m.creditBalance,
    createdAt: m.createdAt,
  }));
}

export async function getServicerDetail(servicerId: string) {
  const m = await prisma.servicer.findUnique({
    where: { id: servicerId },
    include: { deposit: true, documents: true, _count: { select: { penaltyLogs: true } } },
  });
  if (!m) throw notFound('Servicer not found');
  return {
    id: m.id,
    businessName: m.businessName,
    email: m.email,
    phone: m.phone,
    kycStatus: m.kycStatus,
    isBanned: m.isBanned,
    penaltyScore: m._count.penaltyLogs,
    depositBalance: m.deposit?.currentBalance ?? 0,
    creditBalance: m.creditBalance,
    documents: m.documents,
    createdAt: m.createdAt,
  };
}

export async function setServicerBan(
  adminId: string,
  servicerId: string,
  banned: boolean,
  note: string,
  ip?: string,
) {
  const servicer = await prisma.servicer.findUnique({ where: { id: servicerId } });
  if (!servicer) throw notFound('Servicer not found');
  await prisma.servicer.update({ where: { id: servicerId }, data: { isBanned: banned } });
  await recordAudit({
    actorUserId: adminId,
    actorType: 'admin',
    action: banned ? 'servicer.ban' : 'servicer.unban',
    entityType: 'Servicer',
    entityId: servicerId,
    oldValue: { isBanned: servicer.isBanned },
    newValue: { isBanned: banned, note },
    ipAddress: ip,
  });
  logger.info('Servicer ban status changed', { servicerId, banned });
}

// ── User management ──────────────────────────────────────────────────────────

/**
 * Lists all platform accounts — customers, admins and servicers — in one
 * unified view. Servicers live in their own table, so the two sets are
 * fetched, normalised to a common shape (tagged with `kind`), merged and
 * paginated. The area is PIN-gated, so full contact details are returned.
 */
export async function listUsers(params: { search?: string; role?: string; skip: number; limit: number }) {
  const search = params.search?.trim();
  const ci = (v: string) => ({ contains: v, mode: 'insensitive' as const });

  const userWhere = {
    ...(params.role && params.role !== 'servicer'
      ? { role: params.role as 'customer' | 'admin' }
      : {}),
    ...(search ? { OR: [{ email: ci(search) }, { name: ci(search) }] } : {}),
  };
  const servicerWhere = {
    deletedAt: null,
    ...(search
      ? { OR: [{ email: ci(search) }, { name: ci(search) }, { businessName: ci(search) }] }
      : {}),
  };

  const users =
    !params.role || params.role !== 'servicer'
      ? await prisma.user.findMany({ where: userWhere, orderBy: { createdAt: 'desc' } })
      : [];
  const servicers =
    !params.role || params.role === 'servicer'
      ? await prisma.servicer.findMany({ where: servicerWhere, orderBy: { createdAt: 'desc' } })
      : [];

  const combined = [
    ...users.map((u) => ({
      id: u.id,
      kind: 'user' as const,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role as string,
      createdAt: u.createdAt,
    })),
    ...servicers.map((m) => ({
      id: m.id,
      kind: 'servicer' as const,
      name: m.businessName,
      email: m.email,
      phone: m.phone,
      role: 'servicer',
      createdAt: m.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    data: combined.slice(params.skip, params.skip + params.limit),
    total: combined.length,
  };
}

export async function getUserDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { _count: { select: { bookings: true, reports: true } } },
  });
  if (!user) throw notFound('User not found');
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    bookingCount: user._count.bookings,
    reportCount: user._count.reports,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt,
  };
}

/** Diff `input` against `current` for the given fields. */
function diffFields(current: Record<string, unknown>, input: Record<string, unknown>, fields: string[]) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};
  for (const f of fields) {
    const next = input[f];
    if (next !== undefined && next !== current[f]) {
      before[f] = current[f];
      after[f] = next;
      data[f] = next;
    }
  }
  return { before, after, data };
}

/**
 * Edits a customer/admin OR servicer account. The account kind is detected by
 * ID lookup. Every edit is recorded to AUDIT_LOG with the editing admin and a
 * mandatory reason; only changed fields are logged.
 */
export async function updateUserInfo(
  adminId: string,
  accountId: string,
  input: {
    name?: string;
    email?: string;
    phone?: string;
    role?: 'customer' | 'admin';
    businessName?: string;
  },
  reason: string,
  ip?: string,
) {
  if (!reason || !reason.trim()) {
    throw badRequest('A reason is required when editing an account');
  }

  const user = await prisma.user.findUnique({ where: { id: accountId } });
  if (user) {
    const { before, after, data } = diffFields(
      user as unknown as Record<string, unknown>,
      input,
      ['name', 'email', 'phone', 'role'],
    );
    if (Object.keys(data).length === 0) throw badRequest('No changes were provided');
    const updated = await prisma.user.update({
      where: { id: accountId },
      data: data as Prisma.UserUpdateInput,
    });
    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: 'account.update',
      entityType: 'User',
      entityId: accountId,
      oldValue: before,
      newValue: { changes: after, reason: reason.trim() },
      ipAddress: ip,
    });
    logger.info('Admin edited a user', { adminId, accountId, fields: Object.keys(data) });
    return {
      id: updated.id,
      kind: 'user',
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
    };
  }

  const servicer = await prisma.servicer.findUnique({ where: { id: accountId } });
  if (servicer) {
    const { before, after, data } = diffFields(
      servicer as unknown as Record<string, unknown>,
      input,
      ['name', 'email', 'phone', 'businessName'],
    );
    if (Object.keys(data).length === 0) throw badRequest('No changes were provided');
    const updated = await prisma.servicer.update({
      where: { id: accountId },
      data: data as Prisma.ServicerUpdateInput,
    });
    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: 'account.update',
      entityType: 'Servicer',
      entityId: accountId,
      oldValue: before,
      newValue: { changes: after, reason: reason.trim() },
      ipAddress: ip,
    });
    logger.info('Admin edited a servicer', { adminId, accountId, fields: Object.keys(data) });
    return {
      id: updated.id,
      kind: 'servicer',
      name: updated.businessName,
      email: updated.email,
      phone: updated.phone,
      role: 'servicer',
    };
  }

  throw notFound('Account not found');
}

/** Builds the info-update history (admin edits) for an account from AUDIT_LOG. */
async function buildInfoUpdates(entityType: 'User' | 'Servicer', entityId: string) {
  const audits = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const actorIds = [...new Set(audits.map((a) => a.actorUserId).filter(Boolean))] as string[];
  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true },
  });
  const actorById = new Map(actors.map((a) => [a.id, a]));
  return audits.map((a) => {
    const nv = (a.newValue as { changes?: unknown; reason?: string } | null) ?? {};
    return {
      id: a.id,
      action: a.action,
      editedBy: a.actorUserId ? actorById.get(a.actorUserId)?.name ?? 'Unknown' : 'System',
      editedByEmail: a.actorUserId ? actorById.get(a.actorUserId)?.email ?? null : null,
      reason: nv.reason ?? null,
      before: a.oldValue ?? null,
      after: nv.changes ?? a.newValue ?? null,
      at: a.createdAt,
    };
  });
}

/**
 * Activity log for a single account (customer/admin or servicer): the
 * info-update history plus a feed of the account's own activity.
 */
export async function getUserActivity(accountId: string) {
  const user = await prisma.user.findUnique({ where: { id: accountId } });
  if (user) {
    const infoUpdates = await buildInfoUpdates('User', accountId);
    const [bookings, quotes, reports] = await Promise.all([
      prisma.booking.findMany({
        where: { userId: accountId },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          servicer: { select: { businessName: true } },
          quoteRequest: { select: { category: { select: { name: true } } } },
        },
      }),
      prisma.quoteRequest.findMany({
        where: { userId: accountId },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { category: { select: { name: true } } },
      }),
      prisma.report.findMany({ where: { userId: accountId }, orderBy: { createdAt: 'desc' }, take: 15 }),
    ]);
    return {
      account: { id: user.id, kind: 'user', name: user.name, email: user.email },
      infoUpdates,
      activity: {
        bookings: bookings.map((b) => ({
          id: b.id,
          status: b.status,
          label: `${b.quoteRequest.category.name} with ${b.servicer.businessName}`,
          at: b.createdAt,
        })),
        quotes: quotes.map((q) => ({ id: q.id, status: q.status, label: q.category.name, at: q.createdAt })),
        reports: reports.map((r) => ({ id: r.id, status: r.status, label: r.subject, at: r.createdAt })),
        withdrawals: [] as { id: string; status: string; label: string; at: Date }[],
      },
    };
  }

  const servicer = await prisma.servicer.findUnique({ where: { id: accountId } });
  if (servicer) {
    const infoUpdates = await buildInfoUpdates('Servicer', accountId);
    const [jobs, withdrawals] = await Promise.all([
      prisma.booking.findMany({
        where: { servicerId: accountId },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { quoteRequest: { select: { category: { select: { name: true } } } } },
      }),
      prisma.servicerWithdrawal.findMany({
        where: { servicerId: accountId },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ]);
    return {
      account: { id: servicer.id, kind: 'servicer', name: servicer.businessName, email: servicer.email },
      infoUpdates,
      activity: {
        bookings: jobs.map((b) => ({
          id: b.id,
          status: b.status,
          label: `${b.quoteRequest.category.name} job`,
          at: b.createdAt,
        })),
        quotes: [] as { id: string; status: string; label: string; at: Date }[],
        reports: [] as { id: string; status: string; label: string; at: Date }[],
        withdrawals: withdrawals.map((w) => ({
          id: w.id,
          status: w.status,
          label: `RM ${w.amount} to ${w.bankName}`,
          at: w.createdAt,
        })),
      },
    };
  }

  throw notFound('Account not found');
}

// ── Withdrawals ──────────────────────────────────────────────────────────────

export async function listWithdrawals(status?: string) {
  const rows = await prisma.servicerWithdrawal.findMany({
    where: status ? { status: status as 'pending' | 'approved' | 'paid' | 'rejected' } : {},
    orderBy: { createdAt: 'desc' },
    include: { servicer: { select: { businessName: true } } },
  });
  return rows.map((w) => ({
    id: w.id,
    servicerId: w.servicerId,
    servicerName: w.servicer.businessName,
    amount: w.amount,
    bankName: w.bankName,
    bankAccount: maskBankAccount(w.bankAccount),
    status: w.status,
    adminNote: w.adminNote,
    createdAt: w.createdAt,
  }));
}

export async function reviewWithdrawal(
  adminId: string,
  withdrawalId: string,
  status: 'approved' | 'rejected',
  note: string,
  ip?: string,
) {
  const w = await prisma.servicerWithdrawal.findUnique({ where: { id: withdrawalId } });
  if (!w) throw notFound('Withdrawal not found');
  if (w.status !== 'pending') throw conflict('Withdrawal has already been reviewed');
  const updated = await prisma.servicerWithdrawal.update({
    where: { id: withdrawalId },
    data: { status, adminNote: note, approvedAt: status === 'approved' ? new Date() : null },
  });
  await recordAudit({
    actorUserId: adminId,
    actorType: 'admin',
    action: `withdrawal.${status}`,
    entityType: 'ServicerWithdrawal',
    entityId: withdrawalId,
    newValue: { status, note },
    ipAddress: ip,
  });
  return updated;
}

export async function markWithdrawalPaid(adminId: string, withdrawalId: string, ip?: string) {
  const w = await prisma.servicerWithdrawal.findUnique({ where: { id: withdrawalId } });
  if (!w) throw notFound('Withdrawal not found');
  if (w.status !== 'approved') throw conflict('Only approved withdrawals can be marked paid');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.servicerWithdrawal.update({
      where: { id: withdrawalId },
      data: { status: 'paid', paidAt: new Date() },
    });
    const servicer = await tx.servicer.update({
      where: { id: w.servicerId },
      data: { creditBalance: { decrement: w.amount } },
    });
    await tx.servicerCreditLog.create({
      data: {
        servicerId: w.servicerId,
        type: 'withdrawal',
        amount: Number(w.amount),
        balanceAfter: servicer.creditBalance,
        referenceId: withdrawalId,
        note: 'Withdrawal paid out',
      },
    });
    await recordTransaction(
      {
        type: 'withdrawal',
        amount: Number(w.amount),
        servicerId: w.servicerId,
        reference: 'Servicer withdrawal paid',
      },
      tx,
    );
    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: 'withdrawal.paid',
      entityType: 'ServicerWithdrawal',
      entityId: withdrawalId,
      ipAddress: ip,
      tx,
    });
    return updated;
  });
}

// ── Penalty appeals ──────────────────────────────────────────────────────────

export async function listAppeals(status?: string) {
  return prisma.penaltyAppeal.findMany({
    where: status ? { status: status as 'pending' | 'approved' | 'rejected' } : {},
    orderBy: { createdAt: 'desc' },
    include: {
      servicer: { select: { businessName: true } },
      penaltyLog: true,
    },
  });
}

export async function reviewAppeal(
  adminId: string,
  appealId: string,
  status: 'approved' | 'rejected',
  note: string,
  ip?: string,
) {
  const appeal = await prisma.penaltyAppeal.findUnique({
    where: { id: appealId },
    include: { penaltyLog: true },
  });
  if (!appeal) throw notFound('Appeal not found');
  if (appeal.status !== 'pending') throw conflict('Appeal has already been reviewed');

  return prisma.$transaction(async (tx) => {
    const updated = await tx.penaltyAppeal.update({
      where: { id: appealId },
      data: { status, adminNote: note, reviewedAt: new Date() },
    });
    // Approved appeal → reverse the penalty and restore the deposit.
    if (status === 'approved' && appeal.penaltyLog.status === 'applied') {
      const amount = Number(appeal.penaltyLog.amountDeducted);
      await tx.penaltyLog.update({
        where: { id: appeal.penaltyLogId },
        data: { status: 'reversed' },
      });
      await tx.servicerDeposit.update({
        where: { servicerId: appeal.servicerId },
        data: { currentBalance: { increment: amount } },
      });
      await recordTransaction(
        {
          type: 'refund',
          amount,
          servicerId: appeal.servicerId,
          reference: 'Penalty reversed — appeal approved',
        },
        tx,
      );
    }
    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: `appeal.${status}`,
      entityType: 'PenaltyAppeal',
      entityId: appealId,
      newValue: { status, note },
      ipAddress: ip,
      tx,
    });
    return updated;
  });
}

// ── Category requests ────────────────────────────────────────────────────────

export async function listCategoryRequests(status?: string) {
  return prisma.categoryRequest.findMany({
    where: status ? { status: status as 'pending' | 'approved' | 'rejected' } : {},
    orderBy: { createdAt: 'desc' },
    include: { servicer: { select: { businessName: true } } },
  });
}

export async function reviewCategoryRequest(
  adminId: string,
  requestId: string,
  input: {
    status: 'approved' | 'rejected';
    name?: string;
    parentCategoryId?: string;
    defaultPriceSuggestion?: number;
    defaultEstimatedDurationMinutes?: number;
    adminNote?: string;
  },
  ip?: string,
) {
  const request = await prisma.categoryRequest.findUnique({ where: { id: requestId } });
  if (!request) throw notFound('Category request not found');
  if (request.status !== 'pending') throw conflict('Request has already been reviewed');

  return prisma.$transaction(async (tx) => {
    let createdCategoryId: string | null = null;
    if (input.status === 'approved') {
      const name = input.name ?? request.name;
      const slug = name.toLowerCase().trim().replace(/\s+/g, '-');
      const category = await tx.category.create({
        data: {
          name,
          slug,
          parentCategoryId: input.parentCategoryId ?? null,
          defaultPriceSuggestion: input.defaultPriceSuggestion ?? null,
          defaultEstimatedDurationMinutes: input.defaultEstimatedDurationMinutes ?? null,
        },
      });
      createdCategoryId = category.id;
    }
    const updated = await tx.categoryRequest.update({
      where: { id: requestId },
      data: {
        status: input.status,
        adminNote: input.adminNote ?? null,
        reviewedAt: new Date(),
        createdCategoryId,
      },
    });
    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: `category_request.${input.status}`,
      entityType: 'CategoryRequest',
      entityId: requestId,
      newValue: { status: input.status, createdCategoryId },
      ipAddress: ip,
      tx,
    });
    return updated;
  });
}

// ── Servicer deposit top-ups (manual flow) ───────────────────────────────────

export async function listDepositTopups(status?: string) {
  const txStatus = status === 'credited' ? 'completed' : status === 'pending' ? 'pending' : undefined;
  return prisma.transaction.findMany({
    where: { type: 'deposit', ...(txStatus ? { status: txStatus } : {}) },
    orderBy: { createdAt: 'desc' },
  });
}

export async function creditDepositTopup(
  adminId: string,
  transactionId: string,
  note: string,
  ip?: string,
) {
  const txn = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!txn || txn.type !== 'deposit') throw notFound('Deposit top-up not found');
  if (txn.status !== 'pending') throw conflict('Top-up has already been processed');
  if (!txn.servicerId) throw badRequest('Top-up transaction has no servicer');

  return prisma.$transaction(async (tx) => {
    await tx.transaction.update({ where: { id: transactionId }, data: { status: 'completed' } });
    await tx.servicerDeposit.update({
      where: { servicerId: txn.servicerId! },
      data: {
        currentBalance: { increment: txn.amount },
        totalDeposited: { increment: txn.amount },
      },
    });
    await recordAudit({
      actorUserId: adminId,
      actorType: 'admin',
      action: 'deposit_topup.credited',
      entityType: 'Transaction',
      entityId: transactionId,
      newValue: { note },
      ipAddress: ip,
      tx,
    });
  });
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function listSettings() {
  return prisma.platformSettings.findMany({ orderBy: { key: 'asc' } });
}

export async function updateSetting(adminId: string, key: string, value: unknown, ip?: string) {
  // JSONB values are validated against a per-key schema before save.
  const validated = validateSettingValue(key, value);
  const existing = await prisma.platformSettings.findUnique({ where: { key } });
  const setting = await prisma.platformSettings.upsert({
    where: { key },
    update: { value: validated as Prisma.InputJsonValue, updatedByUserId: adminId },
    create: { key, value: validated as Prisma.InputJsonValue, updatedByUserId: adminId },
  });
  await recordAudit({
    actorUserId: adminId,
    actorType: 'admin',
    action: 'settings.update',
    entityType: 'PlatformSettings',
    entityId: key,
    oldValue: existing?.value,
    newValue: validated,
    ipAddress: ip,
  });
  return setting;
}

// ── Withdrawal notification trigger ──────────────────────────────────────────

/** Called when a servicer submits a withdrawal — alerts admin via a job. */
export async function notifyWithdrawalSubmitted(withdrawalId: string, servicerId: string) {
  await enqueue(JOB_NAMES.WITHDRAWAL_NOTIFY, { withdrawalId, servicerId });
}

// ── Admin Self-Service ──────────────────────────────────────────────────────

export async function updateAdminEmail(adminId: string, newEmail: string): Promise<{ oldEmail: string }> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  const oldEmail = admin.email;
  await prisma.user.update({
    where: { id: adminId },
    data: { email: newEmail.toLowerCase().trim() },
  });
  if (admin.backupEmail) {
    const { sendEmail } = await import('../lib/email');
    sendEmail(admin.backupEmail, '[SECURITY] MyHomeServicer admin login email was changed',
      `<p>The admin login email was changed from ${oldEmail} to ${newEmail}.</p>
       <p>If you did not make this change, secure your account immediately.</p>`).catch(() => {});
  }
  return { oldEmail };
}

export async function updateAdminPassword(adminId: string, oldPassword: string, newPassword: string): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  if (!admin.passwordHash) throw badRequest('No password set.');
  const valid = await bcrypt.compare(oldPassword, admin.passwordHash);
  if (!valid) throw badRequest('Current password is incorrect.');
  if (newPassword.length < 8 || !/[0-9]/.test(newPassword)) {
    throw badRequest('Password must be at least 8 characters and contain a number.');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: adminId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
}

export async function updateAdminPin(adminId: string, oldPin: string, newPin: string): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  if (!admin.actionPinHash) throw badRequest('No PIN set.');
  const valid = await bcrypt.compare(oldPin, admin.actionPinHash);
  if (!valid) throw badRequest('Current PIN is incorrect.');
  if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
    throw badRequest('PIN must be a 6-digit number.');
  }
  const pinHash = await bcrypt.hash(newPin, 12);
  await prisma.user.update({
    where: { id: adminId },
    data: { actionPinHash: pinHash },
  });
}

export async function updateAdminBackupEmail(adminId: string, email: string): Promise<void> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  if (email.toLowerCase().trim() === admin.email) {
    throw badRequest('Backup email must be different from your login email.');
  }
  await prisma.user.update({
    where: { id: adminId },
    data: { backupEmail: email.toLowerCase().trim() },
  });
  const { sendEmail } = await import('../lib/email');
  sendEmail(email.toLowerCase().trim(), 'MyHomeServicer Admin backup email updated',
    `<p>Your admin backup email has been updated to ${email}.</p>
     <p>This address will receive account recovery codes.</p>
     <p>If you did not make this change, use the super admin rescue immediately.</p>`).catch(() => {});
}

export async function getAdminBackupEmail(adminId: string): Promise<{ email: string | null }> {
  const admin = await prisma.user.findUnique({ where: { id: adminId } });
  if (!admin || admin.role !== 'admin') throw notFound('Admin not found');
  if (!admin.backupEmail) return { email: null };
  const [name, domain] = admin.backupEmail.split('@');
  const masked = `${name.substring(0, 2)}***@${domain.substring(0, 3)}***`;
  return { email: masked };
}
