import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '../lib/prisma';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { recordTransaction } from './ledger.service';
import { getSetting } from './settings.service';
import { notifyWithdrawalSubmitted } from './admin.service';

/** Servicer profile with deposit + credit + contacts + tax config. */
export async function getServicerProfile(servicerId: string) {
  const m = await prisma.servicer.findUnique({
    where: { id: servicerId },
    include: {
      deposit: true,
      category: true,
      contacts: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] },
      identityChangeRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
  if (!m) throw notFound('Servicer not found');
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    showEmailPublic: m.showEmailPublic,
    showPhonePublic: m.showPhonePublic,
    invoiceContent: m.invoiceContent,
    invoiceSuffix: m.invoiceSuffix,
    businessName: m.businessName,
    bio: m.bio,
    logoUrl: m.logoUrl,
    isCompany: m.isCompany,
    entityType: m.entityType,
    taxNumber: m.taxNumber,
    businessRegistrationNumber: m.businessRegistrationNumber,
    kycStatus: m.kycStatus,
    sstRegistered: m.sstRegistered,
    sstNumber: m.sstNumber,
    serviceChargeRate: Number(m.serviceChargeRate),
    taxInclusive: m.taxInclusive,
    serviceAreas: m.serviceAreas,
    rating: m.rating,
    isOnline: m.isOnline,
    isBanned: m.isBanned,
    creditBalance: m.creditBalance,
    bankName: m.bankName,
    bankAccount: m.bankAccount,
    onboarded: m.onboarded,
    invoicePrefix: m.invoicePrefix,
    invoiceYearFormat: m.invoiceYearFormat,
    invoiceSeparator: m.invoiceSeparator,
    invoicePadding: m.invoicePadding,
    // The fixed platform "big category" this servicer operates under.
    category: { id: m.category.id, name: m.category.name, slug: m.category.slug, imageUrl: m.category.imageUrl },
    categoryId: m.categoryId,
    deposit: m.deposit,
    contacts: m.contacts,
    identityChangeRequests: m.identityChangeRequests,
    operatingHours: m.operatingHours,
  };
}

/** Today's earnings snapshot for the servicer dashboard. */
export async function getEarningsToday(servicerId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const [completedToday, activeJobs, pendingProposals, releaseRows, cashToday, cashFeesToday] = await Promise.all([
    prisma.booking.count({
      where: { servicerId, status: 'completed', doneAt: { gte: start } },
    }),
    prisma.booking.count({ where: { servicerId, status: { in: ['confirmed', 'in_progress'] } } }),
    prisma.quoteProposal.count({ where: { servicerId, status: 'submitted' } }),
    prisma.transaction.aggregate({
      where: { servicerId, type: 'escrow_release', createdAt: { gte: start } },
      _sum: { amount: true },
    }),
    // Cash jobs have no escrow_release — count separately
    prisma.booking.findMany({
      where: { servicerId, status: 'completed', paymentMode: 'cash', cashConfirmed: true, cashConfirmedAt: { gte: start } },
      select: { id: true, price: true },
    }),
    // Use actual recorded platform_fee to avoid fee-base mismatch (promo discounts change the base)
    prisma.transaction.findMany({
      where: { servicerId, type: 'platform_fee', reference: 'Platform fee (cash)', createdAt: { gte: start } },
      select: { bookingId: true, amount: true },
    }),
  ]);

  const feeMapToday = new Map(cashFeesToday.filter((t) => t.bookingId).map((t) => [t.bookingId!, Number(t.amount)]));
  const cashEarnings = cashToday.reduce((s, b) => {
    return s + Math.max(0, Number(b.price) - (feeMapToday.get(b.id) ?? 0));
  }, 0);

  return {
    date: start.toISOString().slice(0, 10),
    earningsToday: Number(releaseRows._sum.amount ?? 0) + cashEarnings,
    completedJobs: completedToday,
    activeJobs,
    pendingProposalResponses: pendingProposals,
  };
}

/** Daily earnings breakdown over the last N days. */
export async function getEarningsDaily(servicerId: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  // pay_later settled via credit creates escrow_release — counting it separately double-counts.
  // Cash has no escrow_release; query bookings + actual recorded platform_fee for accurate net.
  const [txns, bookings, cashBookings, cashFees] = await Promise.all([
    prisma.transaction.findMany({
      where: { servicerId, type: 'escrow_release', createdAt: { gte: since }, bookingId: { not: null } },
      select: { amount: true, createdAt: true },
    }),
    prisma.booking.findMany({
      where: { servicerId, status: 'completed', doneAt: { gte: since } },
      select: { doneAt: true },
    }),
    prisma.booking.findMany({
      where: {
        servicerId,
        status: 'completed',
        paymentMode: 'cash',
        cashConfirmed: true,
        cashConfirmedAt: { gte: since },
      },
      select: { id: true, cashConfirmedAt: true, price: true },
    }),
    prisma.transaction.findMany({
      where: { servicerId, type: 'platform_fee', reference: 'Platform fee (cash)', createdAt: { gte: since } },
      select: { bookingId: true, amount: true },
    }),
  ]);

  const byDate: Record<string, { earnings: number; jobs: number }> = {};
  for (const t of txns) {
    const d = t.createdAt.toISOString().slice(0, 10);
    byDate[d] = byDate[d] ?? { earnings: 0, jobs: 0 };
    byDate[d].earnings += Number(t.amount);
  }
  for (const b of bookings) {
    if (!b.doneAt) continue;
    const d = b.doneAt.toISOString().slice(0, 10);
    byDate[d] = byDate[d] ?? { earnings: 0, jobs: 0 };
    byDate[d].jobs += 1;
  }
  const feeMap = new Map(cashFees.filter((t) => t.bookingId).map((t) => [t.bookingId!, Number(t.amount)]));
  for (const cb of cashBookings) {
    if (!cb.cashConfirmedAt) continue;
    const d = cb.cashConfirmedAt.toISOString().slice(0, 10);
    byDate[d] = byDate[d] ?? { earnings: 0, jobs: 0 };
    byDate[d].earnings += Math.max(0, Number(cb.price) - (feeMap.get(cb.id) ?? 0));
  }

  // Fill all days in the range so the chart always shows 30 contiguous bars.
  const data: { date: string; earnings: number; jobs: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    data.push({ date: d, ...(byDate[d] ?? { earnings: 0, jobs: 0 }) });
  }

  return {
    data,
    totalEarnings: data.reduce((s, d) => s + d.earnings, 0),
    totalJobs: data.reduce((s, d) => s + d.jobs, 0),
  };
}

// ── Servicer promotions ──────────────────────────────────────────────────────

export async function listServicerPromotions(_servicerId: string) {
  // Servicer-owned promo codes removed — promotions are now platform-level engine rules
  return [];
}

export async function createServicerPromotion(
  _servicerId: string,
  _input: {
    code: string;
    discountType: 'percent' | 'fixed';
    value: number;
    minOrderAmount?: number;
    maxUses?: number;
    appliesToScope?: 'all' | 'category' | 'service';
    expiresAt?: string;
  },
) {
  throw forbidden('Servicer promotions are managed through the platform promotion engine');
}

async function ownedPromotion(_servicerId: string, promotionId: string) {
  const promo = await prisma.promotion.findFirst({ where: { id: promotionId } });
  if (!promo) throw notFound('Promotion not found');
  return promo;
}

export async function updateServicerPromotion(
  servicerId: string,
  promotionId: string,
  data: { isActive?: boolean; maxUses?: number; expiresAt?: string },
) {
  await ownedPromotion(servicerId, promotionId);
  return prisma.promotion.update({
    where: { id: promotionId },
    data: {
      active: data.isActive,
      maxUses: data.maxUses,
      endDate: data.expiresAt ? new Date(data.expiresAt) : undefined,
    },
  });
}

export async function deactivateServicerPromotion(servicerId: string, promotionId: string) {
  await ownedPromotion(servicerId, promotionId);
  return prisma.promotion.update({ where: { id: promotionId }, data: { active: false } });
}

// ── Withdrawals & deposit top-up ─────────────────────────────────────────────

export async function requestWithdrawal(
  servicerId: string,
  input: { amount: number; bankName: string; bankAccount: string },
) {
  const servicer = await prisma.servicer.findUnique({ where: { id: servicerId } });
  if (!servicer) throw notFound('Servicer not found');

  const minimum = await getSetting<{ amount: number }>('servicer_credit_withdrawal_minimum');
  if (input.amount < (minimum.amount ?? 50)) {
    throw badRequest(`Minimum withdrawal is RM ${minimum.amount ?? 50}`);
  }

  // Reserve check — subtract in-flight (pending or approved) withdrawals so a
  // servicer cannot submit multiple requests that together exceed their balance.
  // creditBalance is only decremented by markWithdrawalPaid, so we must account
  // for any amounts already earmarked here (BE-001 double-spend fix).
  const inFlight = await prisma.servicerWithdrawal.aggregate({
    where: { servicerId, status: { in: ['pending', 'approved'] } },
    _sum: { amount: true },
  });
  const reserved = Number(inFlight._sum.amount ?? 0);
  const available = Number(servicer.creditBalance) - reserved;
  if (input.amount > available) {
    throw badRequest(
      `Withdrawal exceeds available credit balance (RM ${available.toFixed(2)} available after in-flight requests)`,
    );
  }

  const withdrawal = await prisma.servicerWithdrawal.create({
    data: {
      servicerId,
      amount: input.amount,
      bankName: input.bankName,
      bankAccount: input.bankAccount,
    },
  });
  await notifyWithdrawalSubmitted(withdrawal.id, servicerId);
  return { id: withdrawal.id, status: withdrawal.status };
}

export async function listServicerWithdrawals(servicerId: string) {
  return prisma.servicerWithdrawal.findMany({
    where: { servicerId },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Earnings PDF export ──────────────────────────────────────────────────────

/**
 * Generates a weekly earnings summary PDF for the servicer and returns the
 * raw bytes. Caller streams these bytes back as application/pdf.
 *
 * @param servicerId  The servicer whose bookings are summarised.
 * @param weekStart   ISO date string for the Monday of the target week
 *                    (e.g. "2026-05-18").  Defaults to the current week.
 */
export async function exportEarningsPdf(
  servicerId: string,
  weekStart?: string,
): Promise<Buffer> {
  // Resolve the Monday of the requested week.
  const monday = weekStart ? new Date(weekStart) : getMondayOfCurrentWeek();
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday.getTime() + 7 * 86_400_000);

  const servicer = await prisma.servicer.findUnique({ where: { id: servicerId } });
  if (!servicer) throw notFound('Servicer not found');

  // Fetch completed bookings with their invoices for the week.
  const bookings = await prisma.booking.findMany({
    where: {
      servicerId,
      status: 'completed',
      doneAt: { gte: monday, lt: sunday },
    },
    include: { invoice: true },
    orderBy: { doneAt: 'asc' },
  });

  const totalEarnings = bookings.reduce(
    (sum, b) => sum + (b.invoice ? Number(b.invoice.total) : Number(b.price)),
    0,
  );

  // ── Build PDF ───────────────────────────────────────────────────────────────
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4 portrait
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.11, 0.14);
  const light = rgb(0.5, 0.5, 0.5);

  let y = 790;

  const text = (
    str: string,
    opts: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) =>
    page.drawText(str, {
      x: opts.x ?? 50,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? bold : font,
      color: opts.color ?? ink,
    });

  // Header
  text('Weekly Earnings Summary', { size: 20, bold: true });
  y -= 24;
  text(servicer.businessName, { size: 13, bold: true });
  y -= 18;
  text(
    `Week of ${monday.toISOString().slice(0, 10)} – ${new Date(sunday.getTime() - 86_400_000).toISOString().slice(0, 10)}`,
    { size: 11, color: light },
  );
  y -= 30;

  // Divider
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: light });
  y -= 20;

  // Column headers
  text('Date', { x: 50, bold: true });
  text('Invoice #', { x: 140, bold: true });
  text('Booking ID', { x: 250, bold: true });
  text('Amount (RM)', { x: 470, bold: true });
  y -= 16;

  if (bookings.length === 0) {
    text('No completed jobs this week.', { size: 11, color: light });
    y -= 20;
  } else {
    for (const b of bookings) {
      const dateStr = b.doneAt ? b.doneAt.toISOString().slice(0, 10) : '—';
      const invNum = b.invoice?.invoiceNumber ?? '(pending)';
      const amount = b.invoice ? Number(b.invoice.total) : Number(b.price);
      const shortId = b.id.slice(0, 8) + '…';

      text(dateStr, { x: 50 });
      text(invNum, { x: 140 });
      text(shortId, { x: 250 });
      text(amount.toFixed(2), { x: 470 });
      y -= 18;

      if (y < 80) {
        // Overflow guard — truncate with note rather than multi-page for V1.
        text('(report truncated — too many rows)', { size: 9, color: light });
        break;
      }
    }
  }

  // Totals row
  y -= 6;
  page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 1, color: light });
  y -= 18;
  text('Total earnings', { x: 50, bold: true });
  text(`RM ${totalEarnings.toFixed(2)}`, { x: 460, bold: true });
  y -= 16;
  text(`${bookings.length} completed job${bookings.length !== 1 ? 's' : ''}`, {
    x: 50,
    size: 10,
    color: light,
  });

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function getMondayOfCurrentWeek(): Date {
  const d = new Date();
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon … 6 = Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
}

/** Update editable profile fields (bio, serviceAreas, logo, invoice settings, visibility, invoice content, bank, tax config, business details). */
export async function updateServicerProfile(
  servicerId: string,
  data: {
    bio?: string;
    logoUrl?: string;
    serviceAreas?: string[];
    invoicePrefix?: string;
    invoiceYearFormat?: string;
    invoiceSeparator?: string;
    invoicePadding?: number;
    showEmailPublic?: boolean;
    showPhonePublic?: boolean;
    invoiceContent?: string;
    invoiceSuffix?: string;
    bankName?: string;
    bankAccount?: string;
    // Tax config
    sstRegistered?: boolean;
    sstNumber?: string;
    serviceChargeRate?: number;
    taxInclusive?: boolean;
    // Business identity
    businessName?: string;
    entityType?: string;
    businessRegistrationNumber?: string;
    taxNumber?: string;
    operatingHours?: unknown;
    categoryId?: string;
  },
) {
  const servicer = await prisma.servicer.findUnique({ where: { id: servicerId } });
  if (!servicer) throw notFound('Servicer not found');

  // Auto-derive isCompany from entityType
  const effectiveEntityType = data.entityType !== undefined ? data.entityType : servicer.entityType;
  const isCompany = effectiveEntityType && effectiveEntityType !== 'sole_proprietorship';

  const updateData: Record<string, unknown> = {};
  if (data.bio !== undefined) updateData['bio'] = data.bio;
  if (data.logoUrl !== undefined) updateData['logoUrl'] = data.logoUrl;
  if (data.serviceAreas !== undefined) updateData['serviceAreas'] = data.serviceAreas;
  if (data.invoicePrefix !== undefined) updateData['invoicePrefix'] = data.invoicePrefix;
  if (data.invoiceYearFormat !== undefined) updateData['invoiceYearFormat'] = data.invoiceYearFormat;
  if (data.invoiceSeparator !== undefined) updateData['invoiceSeparator'] = data.invoiceSeparator;
  if (data.invoicePadding !== undefined) updateData['invoicePadding'] = data.invoicePadding;
  if (data.showEmailPublic !== undefined) updateData['showEmailPublic'] = data.showEmailPublic;
  if (data.showPhonePublic !== undefined) updateData['showPhonePublic'] = data.showPhonePublic;
  if (data.invoiceContent !== undefined) updateData['invoiceContent'] = data.invoiceContent;
  if (data.invoiceSuffix !== undefined) updateData['invoiceSuffix'] = data.invoiceSuffix;
  if (data.bankName !== undefined) updateData['bankName'] = data.bankName;
  if (data.bankAccount !== undefined) updateData['bankAccount'] = data.bankAccount;
  // Tax config
  if (data.sstRegistered !== undefined) updateData['sstRegistered'] = data.sstRegistered;
  if (data.sstNumber !== undefined) updateData['sstNumber'] = data.sstNumber;
  if (data.serviceChargeRate !== undefined) updateData['serviceChargeRate'] = data.serviceChargeRate;
  if (data.taxInclusive !== undefined) updateData['taxInclusive'] = data.taxInclusive;
  // Business identity
  if (data.businessName !== undefined) updateData['businessName'] = data.businessName;
  if (data.entityType !== undefined) {
    updateData['entityType'] = data.entityType;
    updateData['isCompany'] = isCompany;
  }
  if (data.businessRegistrationNumber !== undefined) updateData['businessRegistrationNumber'] = data.businessRegistrationNumber;
  if (data.taxNumber !== undefined) updateData['taxNumber'] = data.taxNumber;
  if (data.operatingHours !== undefined) updateData['operatingHours'] = data.operatingHours;
  if (data.categoryId !== undefined) updateData['categoryId'] = data.categoryId;

  return prisma.servicer.update({
    where: { id: servicerId },
    data: updateData,
  });
}

/** Toggle the servicer's online status (V1: always-on, but endpoint preserved for post-V1). */
export async function setServicerOnline(servicerId: string, isOnline: boolean) {
  return prisma.servicer.update({ where: { id: servicerId }, data: { isOnline } });
}

// ── Credit log ───────────────────────────────────────────────────────────────

/** History of credit balance movements for the servicer (promo paybacks, withdrawals, etc.). */
export async function listCreditLog(servicerId: string) {
  return prisma.servicerCreditLog.findMany({
    where: { servicerId },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Penalties & appeals ──────────────────────────────────────────────────────

/** List penalty logs for this servicer, including appeal status if one was filed. */
export async function listPenalties(servicerId: string) {
  const logs = await prisma.penaltyLog.findMany({
    where: { servicerId },
    include: { appeal: true },
    orderBy: { createdAt: 'desc' },
  });
  return logs.map((p) => ({
    id: p.id,
    type: p.type,
    amountDeducted: p.amountDeducted,
    status: p.status,
    createdAt: p.createdAt,
    bookingId: p.bookingId,
    appealStatus: p.appeal?.status ?? null,
  }));
}

/**
 * File a penalty appeal for the given penalty log row.
 * Throws 409 if an appeal already exists.
 */
export async function fileAppeal(servicerId: string, penaltyLogId: string, reason: string) {
  const log = await prisma.penaltyLog.findFirst({ where: { id: penaltyLogId, servicerId } });
  if (!log) throw notFound('Penalty not found');

  const existing = await prisma.penaltyAppeal.findUnique({ where: { penaltyLogId } });
  if (existing) throw conflict('An appeal has already been filed for this penalty');

  return prisma.penaltyAppeal.create({
    data: { penaltyLogId, servicerId, reason },
  });
}

/** Get the appeal record for a specific penalty log (servicer view). */
export async function getPenaltyAppeal(servicerId: string, penaltyLogId: string) {
  const log = await prisma.penaltyLog.findFirst({ where: { id: penaltyLogId, servicerId } });
  if (!log) throw notFound('Penalty not found');

  const appeal = await prisma.penaltyAppeal.findUnique({ where: { penaltyLogId } });
  if (!appeal) throw notFound('No appeal filed for this penalty');
  return appeal;
}

// ── KYC documents ────────────────────────────────────────────────────────────

/** Submit a KYC document (post-upload via presign flow). V1: kyc bypassed but endpoint live. */
export async function submitKycDocument(
  servicerId: string,
  input: { docType: string; fileId: string },
) {
  return prisma.servicerDocument.create({
    data: {
      servicerId,
      docType: input.docType as any,
      fileId: input.fileId,
    },
    select: { id: true, docType: true, status: true },
  });
}

/** List submitted KYC documents for the servicer. */
export async function listKycDocuments(servicerId: string) {
  return prisma.servicerDocument.findMany({
    where: { servicerId },
    select: { id: true, docType: true, status: true, verifiedAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Category requests ────────────────────────────────────────────────────────

/** Submit a request for a new platform category. */
export async function submitCategoryRequest(
  servicerId: string,
  input: { name: string; parentCategoryId?: string | null; description?: string },
) {
  return prisma.categoryRequest.create({
    data: {
      servicerId,
      name: input.name.trim(),
      parentCategoryId: input.parentCategoryId ?? null,
      description: input.description ?? null,
    },
  });
}

/** List this servicer's own category requests with current status. */
export async function listCategoryRequests(servicerId: string) {
  return prisma.categoryRequest.findMany({
    where: { servicerId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Records a deposit top-up request. V1 is a manual flow — a pending `deposit`
 * TRANSACTION is created; an admin credits it after verifying the transfer
 * (schema-notes.md §Servicer deposit top-up).
 */
export async function requestDepositTopup(
  servicerId: string,
  input: { amount: number; paymentReference: string },
) {
  const txId = await recordTransaction({
    type: 'deposit',
    status: 'pending',
    amount: input.amount,
    servicerId,
    reference: input.paymentReference,
  });
  return {
    id: txId,
    status: 'pending',
    amount: input.amount,
    message: 'Top-up request received. Admin will credit your deposit after verifying payment.',
  };
}

// ── Personal profile (User record linked by email) ────────────────

/**
 * Get the personal profile for a servicer's linked User account.
 * Servicer and User share the same email. If no User record exists yet,
 * one is auto-created (lazy provisioning) using the servicer's details.
 */
export async function getPersonalProfile(servicerEmail: string) {
  let user = await prisma.user.findUnique({ where: { email: servicerEmail } });
  if (!user) {
    // Lazy-create the User record from the Servicer record.
    const servicer = await prisma.servicer.findUnique({ where: { email: servicerEmail } });
    if (!servicer) throw notFound('Servicer not found');
    user = await prisma.user.create({
      data: {
        id: servicer.id,
        role: 'customer',
        name: servicer.name,
        email: servicer.email,
        phone: servicer.phone,
        bio: null,
        isDemo: servicer.isDemo,
      },
    });
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    contactName: user.contactName,
    contactNumber: user.contactNumber,
    preferredTimeSlot: user.preferredTimeSlot,
  };
}

/**
 * Update the personal profile on a servicer's linked User account.
 * Finds the User by the servicer's email and updates allowed fields.
 * Lazy-creates the User record if it doesn't exist yet.
 */
export async function updatePersonalProfile(
  servicerEmail: string,
  data: {
    name?: string;
    phone?: string;
    avatarUrl?: string | null;
    bio?: string | null;
    contactName?: string | null;
    contactNumber?: string | null;
  },
) {
  let user = await prisma.user.findUnique({ where: { email: servicerEmail } });
  if (!user) {
    // Lazy-create: first-time personal profile save creates the User record.
    const servicer = await prisma.servicer.findUnique({ where: { email: servicerEmail } });
    if (!servicer) throw notFound('Servicer not found');
    user = await prisma.user.create({
      data: {
        id: servicer.id,
        role: 'customer',
        name: servicer.name,
        email: servicer.email,
        phone: servicer.phone,
        bio: null,
        isDemo: servicer.isDemo,
      },
    });
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.phone !== undefined && { phone: data.phone }),
      ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      ...(data.bio !== undefined && { bio: data.bio }),
      ...(data.contactName !== undefined && { contactName: data.contactName }),
      ...(data.contactNumber !== undefined && { contactNumber: data.contactNumber }),
    },
  });

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone,
    avatarUrl: updated.avatarUrl,
    bio: updated.bio,
    contactName: updated.contactName,
    contactNumber: updated.contactNumber,
    preferredTimeSlot: updated.preferredTimeSlot,
  };
}
