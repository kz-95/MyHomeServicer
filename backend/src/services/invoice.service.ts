import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { uploadBuffer } from '../lib/s3';
import { computeTotal, LineItem, ServicerTaxConfig } from '../lib/money';
import { getSstRate } from './settings.service';
import { notFound } from '../lib/errors';

/** Round to 2 decimal places (currency). */
const money = (n: number): number => Math.round(n * 100) / 100;

/**
 * Builds a servicer-formatted invoice number, e.g. INV-2026-0001, from the
 * servicer's own numbering rule (prefix / year format / separator / padding).
 */
function formatInvoiceNumber(
  prefix: string,
  yearFormat: string,
  separator: string,
  padding: number,
  sequence: number,
): string {
  const seq = String(sequence).padStart(padding, '0');
  // 'none' - the servicer opted out of a year segment entirely.
  if (yearFormat === 'none') return [prefix, seq].join(separator);
  const year = yearFormat === 'YY' ? String(new Date().getFullYear()).slice(-2) : String(new Date().getFullYear());
  return [prefix, year, seq].join(separator);
}

/**
 * Resolve line items from a booking, falling back to a single-item array
 * for backward compat with bookings that predate the line-items field.
 */
function resolveLineItems(booking: { lineItems: any; price: any }): LineItem[] {
  const rawItems = booking.lineItems as any;
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    return rawItems.map((li: any) => ({
      label: li.label ?? 'Service',
      amount: Number(li.amount),
      taxable: li.taxable ?? true,
      serviceChargeable: li.serviceChargeable ?? true,
    }));
  }
  // Legacy booking: use price as a single line item
  return [{ label: 'Service', amount: Number(booking.price), taxable: true, serviceChargeable: true }];
}

/**
 * Resolve servicer tax config from the booked servicer's account.
 * Tax config is ALWAYS resolved from the booked service + servicer,
 * not an arbitrary listing (spec §2.6).
 */
function resolveTaxConfig(servicer: any, sstRate: number): ServicerTaxConfig {
  return {
    serviceChargeRate: Number(servicer.serviceChargeRate) || 0,
    sstRegistered: servicer.sstRegistered ?? false,
    sstRate,
    taxInclusive: servicer.taxInclusive ?? false,
  };
}

/**
 * Generates the INVOICE row and a PDF for a completed booking. Uses the
 * canonical computeTotal() and computePlatformFee() from money.ts so the
 * invoice total == escrow charged amount == fee recorded (the invariant).
 *
 * Called from doneJob() when marking a booking complete.
 * Idempotent - a second call for the same booking returns the existing row.
 *
 * INVARIANT (tested): escrow.amount == invoice.total (for pay_now bookings).
 */
export async function generateInvoice(servicerId: string, bookingId: string) {
  const existing = await prisma.invoice.findUnique({ where: { bookingId } });
  if (existing) return existing;

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { quoteRequest: true, servicer: true, escrow: true },
  });
  if (!booking) throw new Error(`Booking ${bookingId} not found`);

  const lineItems = resolveLineItems(booking);

  // Resolve servicer tax config from the booked service + servicer (spec §2.6).
  const servicer = booking.servicer;
  const sstRateSetting = await getSstRate();
  const servicerTaxConfig = resolveTaxConfig(servicer, sstRateSetting);

  const subtotal = money(lineItems.reduce((s, li) => s + li.amount, 0));
  const promoDiscount = await resolvePromoDiscount(booking.quoteRequest.promoCode, subtotal);
  const tip = booking.tipAmount ? Number(booking.tipAmount) : 0;

  // Canonical total computation (the single source of truth).
  const totalResult = computeTotal(lineItems, promoDiscount, servicerTaxConfig, tip);

  // Platform fee: based on afterPromo only (spec decision #1).
  // T13: use FeeRule engine instead of legacy computePlatformFee
  const { computeFees } = await import('./fee-engine.service');
  const categoryId = booking.quoteRequest?.categoryId ?? undefined;
  const platformFee = await computeFees(totalResult.afterPromo, 'booking', categoryId);

  // INVARIANT: escrow.amount (pay_now) == invoice.total.
  // Log a warning if there's a mismatch - this indicates a bug in the money pipeline.
  if (booking.escrow && booking.escrow.status !== 'refunded') {
    const escrowAmount = Number(booking.escrow.amount);
    if (Math.abs(escrowAmount - totalResult.total) > 0.01) {
      logger.warn('ESCROW-INVOICE MISMATCH', {
        bookingId,
        escrowAmount,
        invoiceTotal: totalResult.total,
        diff: escrowAmount - totalResult.total,
      });
    }
  }

  // Due date: now + 14 days (standard Malaysian invoice terms).
  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60_000);

  // Reserve a sequence number from the servicer's counter.
  const seqServicer = await prisma.servicer.update({
    where: { id: servicerId },
    data: { invoiceNextNumber: { increment: 1 } },
  });
  const sequenceNumber = seqServicer.invoiceNextNumber - 1;
  const invoiceNumber = formatInvoiceNumber(
    servicer.invoicePrefix,
    servicer.invoiceYearFormat,
    servicer.invoiceSeparator,
    servicer.invoicePadding,
    sequenceNumber,
  );

  const pdfUrl: string = await renderPdf({
    invoiceNumber,
    businessName: servicer.businessName,
    subtotal: totalResult.subtotal,
    promoDiscount,
    taxRate: servicerTaxConfig.sstRate,
    taxAmount: totalResult.sst,
    tip,
    platformFee,
    total: totalResult.total,
  });

  const invoice = await prisma.invoice.create({
    data: {
      bookingId,
      servicerId,
      invoiceNumber,
      sequenceNumber,
      lineItems: lineItems as any,
      subtotal: totalResult.subtotal,
      promoDiscount,
      serviceChargeRate: servicerTaxConfig.serviceChargeRate > 0 ? servicerTaxConfig.serviceChargeRate : null,
      serviceChargeAmount: totalResult.serviceCharge > 0 ? totalResult.serviceCharge : null,
      sstApplies: servicerTaxConfig.sstRegistered,
      taxInclusive: servicerTaxConfig.taxInclusive,
      taxRate: totalResult.sst > 0 ? servicerTaxConfig.sstRate : null,
      taxAmount: totalResult.sst > 0 ? totalResult.sst : null,
      tipAmount: tip > 0 ? tip : null,
      total: totalResult.total,
      platformFee,
      dueDate,
      pdfUrl,
      paidAt: booking.paymentMode === 'cash' && !booking.cashConfirmed ? null : new Date(),
    },
  });
  logger.info('Invoice generated', { bookingId, invoiceNumber, total: totalResult.total });
  return invoice;
}

async function resolvePromoDiscount(code: string | null, _subtotal: number): Promise<number> {
  if (!code) return 0;
  // Promo code lookup removed - new promotion engine is trigger-based
  return 0;
}

// ── Invoice preview (no persistence) ───────────────────────────────────────

/** The preview shape returned by getInvoicePreview - mirrors the invoice breakdown
 *  but without an invoice row or PDF.  Used by the servicer so they can review
 *  what the invoice WILL look like before they mark the job done. */
export interface InvoicePreview {
  bookingId: string;
  lineItems: LineItem[];
  subtotal: number;
  afterPromo: number;
  promoDiscount: number;
  serviceChargeRate: number;
  serviceChargeAmount: number;
  sstApplies: boolean;
  taxInclusive: boolean;
  taxRate: number;
  taxAmount: number;
  tipAmount: number;
  platformFee: number;
  total: number;
  paymentMethod: string | null;
  dueDate: string; // ISO 8601
  /** Present when the booking is pay_now - used for the invariant assertion. */
  escrowAmount: number | null;
}

/**
 * Returns a preview of the invoice for a booking WITHOUT creating any
 * database row.  Calls computeTotal() with the actual line items so the
 * servicer can review the breakdown before marking the job as done.
 *
 * Throws 404 if the booking doesn't belong to the servicer or doesn't exist.
 */
export async function getInvoicePreview(servicerId: string, bookingId: string): Promise<InvoicePreview> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, servicerId },
    include: { quoteRequest: true, servicer: true, escrow: true },
  });
  if (!booking) throw notFound('Booking not found');

  const lineItems = resolveLineItems(booking);
  const servicer = booking.servicer;
  const sstRateSetting = await getSstRate();
  const taxConfig = resolveTaxConfig(servicer, sstRateSetting);

  const subtotal = money(lineItems.reduce((s, li) => s + li.amount, 0));
  const promoDiscount = await resolvePromoDiscount(booking.quoteRequest.promoCode, subtotal);
  const tip = booking.tipAmount ? Number(booking.tipAmount) : 0;

  const totalResult = computeTotal(lineItems, promoDiscount, taxConfig, tip);
  // T13: use FeeRule engine instead of legacy computePlatformFee
  const { computeFees } = await import('./fee-engine.service');
  const categoryId = booking.quoteRequest?.categoryId ?? undefined;
  const platformFee = await computeFees(totalResult.afterPromo, 'booking', categoryId);

  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60_000);

  return {
    bookingId,
    lineItems: totalResult.lineItems,
    subtotal: totalResult.subtotal,
    afterPromo: totalResult.afterPromo,
    promoDiscount,
    serviceChargeRate: taxConfig.serviceChargeRate,
    serviceChargeAmount: totalResult.serviceCharge,
    sstApplies: taxConfig.sstRegistered,
    taxInclusive: taxConfig.taxInclusive,
    taxRate: taxConfig.sstRate,
    taxAmount: totalResult.sst,
    tipAmount: tip,
    platformFee,
    total: totalResult.total,
    paymentMethod: booking.settlementMethod ?? null,
    dueDate: dueDate.toISOString(),
    escrowAmount: booking.escrow ? Number(booking.escrow.amount) : null,
  };
}

// ── PDF rendering ─────────────────────────────────────────────────────────

interface PdfInput {
  invoiceNumber: string;
  businessName: string;
  subtotal: number;
  promoDiscount: number;
  taxRate: number;
  taxAmount: number;
  tip: number;
  platformFee: number;
  total: number;
}

/** Renders a one-page PDF invoice with pdf-lib and uploads it to S3. */
async function renderPdf(inv: PdfInput): Promise<string> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.11, 0.14);

  let y = 780;
  const line = (text: string, opts: { size?: number; bold?: boolean; x?: number } = {}) => {
    page.drawText(text, {
      x: opts.x ?? 50,
      y,
      size: opts.size ?? 11,
      font: opts.bold ? bold : font,
      color: ink,
    });
  };

  line('INVOICE', { size: 22, bold: true });
  y -= 26;
  line(inv.businessName, { size: 13, bold: true });
  y -= 18;
  line(`Invoice no: ${inv.invoiceNumber}`);
  y -= 16;
  line(`Issued: ${new Date().toISOString().slice(0, 10)}`);
  y -= 40;

  const row = (label: string, value: number, strong = false) => {
    page.drawText(label, { x: 50, y, size: 11, font: strong ? bold : font, color: ink });
    page.drawText(`RM ${value.toFixed(2)}`, {
      x: 470,
      y,
      size: 11,
      font: strong ? bold : font,
      color: ink,
    });
    y -= 20;
  };

  row('Subtotal', inv.subtotal);
  if (inv.promoDiscount > 0) row('Promo discount', -inv.promoDiscount);
  if (inv.taxAmount > 0) row(`SST (${(inv.taxRate * 100).toFixed(0)}%)`, inv.taxAmount);
  if (inv.tip > 0) row('Tip', inv.tip);
  y -= 6;
  row('Total', inv.total, true);
  y -= 24;
  line(`Platform fee (recorded separately): RM ${inv.platformFee.toFixed(2)}`, { size: 9 });

  const bytes = await doc.save();
  const key = `invoices/${new Date().getFullYear()}/${inv.invoiceNumber}.pdf`;
  return uploadBuffer(key, Buffer.from(bytes), 'application/pdf');
}

// ── Servicer-facing invoice queries ──────────────────────────────────────────

/**
 * Lists all invoices for a servicer, newest first.
 * Optionally filtered by `status` = 'paid' | 'unpaid'.
 * Returns the list-view shape documented in api-doc.md §GET /servicer/me/invoices.
 */
export async function listServicerInvoices(servicerId: string, status?: string) {
  const where: { servicerId: string; paidAt?: object | null } = { servicerId };
  if (status === 'paid') where.paidAt = { not: null };
  if (status === 'unpaid') where.paidAt = null;

  return prisma.invoice.findMany({
    where,
    orderBy: { issuedAt: 'desc' },
    select: {
      id: true,
      invoiceNumber: true,
      bookingId: true,
      total: true,
      issuedAt: true,
      paidAt: true,
      pdfUrl: true,
    },
  });
}

/**
 * Returns the full invoice breakdown for a single invoice owned by the
 * servicer. Throws 404 if the invoice does not belong to them.
 */
export async function getServicerInvoice(servicerId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, servicerId },
  });
  if (!invoice) throw notFound('Invoice not found');
  return invoice;
}

/**
 * Returns the invoice for a booking owned by the servicer.
 * Throws 404 if the booking has no invoice or does not belong to them.
 */
export async function getServicerInvoiceByBooking(servicerId: string, bookingId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { bookingId, servicerId },
  });
  if (!invoice) throw notFound('Invoice not found for this booking');
  return invoice;
}
