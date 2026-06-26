import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';
import { broadcastQuote } from './quote.service';
import { TIME_SLOTS } from '../lib/time-slots';
import bcrypt from 'bcryptjs';

const DEMO_PASSWORD = 'Demo@2026';
const BCRYPT_COST = 12;

export interface CreateServicerOrderInput {
  mode: 'direct' | 'broadcast';
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: string;
  postcode?: string;
  district?: string;
  state?: string;
  propertyType?: string;
  categorySlug: string;
  serviceDetails?: Record<string, unknown>;
  preferredDate: string;
  timeSlot: string;
  notes?: string;
  price?: number;
}

interface OrderResult {
  bookingId?: string;
  quoteId: string;
  customerId: string;
  broadcastCount?: number;
}

/**
 * Find or create a customer User by email first, then by phone.
 * If no user exists, creates one with isDemo:true and Demo@2026 password.
 */
async function findOrCreateCustomer(input: CreateServicerOrderInput): Promise<string> {
  // Try by email first if provided.
  if (input.customerEmail) {
    const existing = await prisma.user.findUnique({
      where: { email: input.customerEmail },
      select: { id: true },
    });
    if (existing) return existing.id;
  }

  // Try by phone.
  const byPhone = await prisma.user.findFirst({
    where: { phone: input.customerPhone },
    select: { id: true },
  });
  if (byPhone) return byPhone.id;

  // Create new customer account.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_COST);
  const created = await prisma.user.create({
    data: {
      name: input.customerName,
      email: input.customerEmail ?? `${input.customerPhone.replace(/\D/g, '')}@demo.local`,
      phone: input.customerPhone,
      passwordHash,
      isDemo: true,
      role: 'customer',
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Find an existing address for the user that matches the input, or create one.
 */
async function findOrCreateAddress(userId: string, input: CreateServicerOrderInput): Promise<string> {
  // Try to match an existing address.
  const existing = await prisma.userAddress.findFirst({
    where: {
      userId,
      address: input.address,
      postcode: input.postcode ?? null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.userAddress.create({
    data: {
      userId,
      label: input.address,
      address: input.address,
      propertyType: input.propertyType ?? null,
      postcode: input.postcode ?? null,
      district: input.district ?? null,
      state: input.state ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

/**
 * Build the common QuoteRequest create data shared between direct and broadcast flows.
 */
function buildQuoteData(
  userId: string,
  categoryId: string,
  addressId: string,
  input: CreateServicerOrderInput,
) {
  const preferredDate = new Date(input.preferredDate);
  if (Number.isNaN(preferredDate.getTime())) {
    throw badRequest('preferredDate must be a valid date');
  }

  // Reasonable defaults for deadlines when creating a quote from the servicer side.
  const now = new Date();
  const proposalDeadline = new Date(preferredDate);
  if (proposalDeadline.getTime() <= now.getTime()) {
    proposalDeadline.setTime(now.getTime() + 24 * 60 * 60 * 1000);
  }
  const servicerDeadline = new Date(proposalDeadline.getTime() - 15 * 60 * 1000);

  return {
    userId,
    categoryId,
    addressId,
    contactName: input.customerName,
    contactNumber: input.customerPhone,
    timeSlot: input.timeSlot as any,
    preferredDate,
    propertyType: input.propertyType ?? null,
    paymentMode: 'pay_later' as const,
    settlementMethod: 'cash' as const,
    deadlineMode: 'fcfs' as const,
    proposalDeadline,
    servicerDeadline,
    notes: input.notes ?? null,
    serviceDetails: (input.serviceDetails ?? undefined) as Prisma.InputJsonValue | undefined,
  };
}

/**
 * Direct mode: create QuoteRequest (matched), create QuoteProposal (selected),
 * create Booking (confirmed), return all IDs.
 */
async function handleDirectOrder(
  servicer: { id: string; name: string; email: string; phone: string },
  customerId: string,
  addressId: string,
  input: CreateServicerOrderInput,
  category: { id: string; slug: string },
): Promise<OrderResult> {
  if (input.price == null || input.price <= 0) {
    throw badRequest('price is required and must be positive for direct orders');
  }

  const quoteData = buildQuoteData(customerId, category.id, addressId, input);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Create QuoteRequest with status = matched.
    const quote = await tx.quoteRequest.create({
      data: {
        ...quoteData,
        status: 'matched',
      },
      select: { id: true },
    });

    // 2. Create QuoteProposal with status = selected.
    const proposal = await tx.quoteProposal.create({
      data: {
        quoteRequestId: quote.id,
        servicerId: servicer.id,
        proposedPrice: input.price!,
        status: 'selected',
        lineItems: [
          { label: 'Service', amount: input.price!, taxable: true, serviceChargeable: true },
        ] as any,
      },
      select: { id: true },
    });

    // 3. Create Booking confirmed.
    const booking = await tx.booking.create({
      data: {
        quoteRequestId: quote.id,
        proposalId: proposal.id,
        userId: customerId,
        servicerId: servicer.id,
        status: 'confirmed',
        confirmedAt: new Date(),
        price: input.price!,
        paymentMode: 'pay_later',
        paymentTiming: 'pay_later',
        settlementMethod: 'cash',
        lineItems: [
          { label: 'Service', amount: input.price!, taxable: true, serviceChargeable: true },
        ] as any,
        scheduledDate: quoteData.preferredDate,
        timeSlot: quoteData.timeSlot,
        notes: quoteData.notes,
      },
      select: { id: true },
    });

    return { quoteId: quote.id, proposalId: proposal.id, bookingId: booking.id };
  });

  return {
    bookingId: result.bookingId,
    quoteId: result.quoteId,
    customerId,
  };
}

/**
 * Broadcast mode: create QuoteRequest (open), broadcast to matching servicers,
 * return quoteId + broadcast count.
 */
async function handleBroadcastOrder(
  customerId: string,
  addressId: string,
  input: CreateServicerOrderInput,
  category: { id: string; slug: string },
): Promise<OrderResult> {
  const quoteData = buildQuoteData(customerId, category.id, addressId, input);

  const quote = await prisma.quoteRequest.create({
    data: {
      ...quoteData,
      status: 'open',
    },
    select: { id: true },
  });

  // Broadcast the quote to matching servicers.
  const { servicersNotified } = await broadcastQuote(quote.id);

  return {
    quoteId: quote.id,
    customerId,
    broadcastCount: servicersNotified,
  };
}

/**
 * Create a servicer-initiated order ("+New Order").
 *
 * Two modes:
 * - "direct": creates QuoteRequest (matched), QuoteProposal (selected), Booking (confirmed).
 * - "broadcast": creates QuoteRequest (open), then broadcasts to matching servicers.
 */
export async function createServicerOrder(
  servicerId: string,
  input: CreateServicerOrderInput,
): Promise<OrderResult> {
  // Validate timeSlot.
  if (!(TIME_SLOTS as readonly string[]).includes(input.timeSlot)) {
    throw badRequest(`timeSlot must be one of: ${TIME_SLOTS.join(', ')}`);
  }

  // Validate mode.
  if (input.mode !== 'direct' && input.mode !== 'broadcast') {
    throw badRequest('mode must be "direct" or "broadcast"');
  }

  // Find the servicer.
  const servicer = await prisma.servicer.findUnique({
    where: { id: servicerId, deletedAt: null },
    select: { id: true, categoryId: true, name: true, email: true, phone: true },
  });
  if (!servicer) throw notFound('Servicer not found');

  // Find the category by slug.
  const category = await prisma.category.findFirst({
    where: { slug: input.categorySlug, deletedAt: null },
  });
  if (!category) throw notFound(`Category "${input.categorySlug}" not found`);

  // Find or create the customer User.
  const customerId = await findOrCreateCustomer(input);

  // Find or create the UserAddress.
  const addressId = await findOrCreateAddress(customerId, input);

  if (input.mode === 'direct') {
    return await handleDirectOrder(servicer, customerId, addressId, input, category);
  } else {
    return await handleBroadcastOrder(customerId, addressId, input, category);
  }
}
