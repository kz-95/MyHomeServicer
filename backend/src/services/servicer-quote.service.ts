import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { logger } from '../lib/logger';
import { pairedCustomerEmail } from '../lib/paired-account';
import { notify } from './notification.service';
import { optionPriceMapSchema, OptionPriceMap, lineItemsSchema, moduleRefsSchema } from '../lib/json-schemas';

/**
 * Require that a servicer has completed onboarding before they can take jobs.
 * Throws ApiError with missing fields and a redirect URL if not yet onboarded.
 */
export async function requireOnboarded(servicerId: string): Promise<void> {
  const servicer = await prisma.servicer.findUnique({
    where: { id: servicerId },
    select: { onboarded: true, bankName: true, bankAccount: true },
  });
  if (!servicer) throw notFound('Servicer not found');
  if (servicer.onboarded) return;

  const missing: string[] = [];
  if (!servicer.bankName || !servicer.bankAccount) missing.push('bank_account');

  if (missing.length > 0) {
    throw new ApiError('BUSINESS_RULE_VIOLATION',
      'Complete your profile before taking jobs.',
      missing.map(f => ({ field: f, issue: 'missing' })),
    );
  }

  await prisma.servicer.update({
    where: { id: servicerId },
    data: { onboarded: true },
  });
}

/**
 * Quote-side merchant operations: viewing broadcast quotes, marking a quote
 * opened, and submitting a proposal.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** One line in a proposal price breakdown (Phase 6). */
export interface PrefillBreakdownItem {
  questionKey: string;
  optionValue: string;
  label: string;
  price: number;
}

/**
 * Pre-computed default price for the proposal form.
 *
 * `defaultTotal` = merchant's base price + sum of per-option prices for the
 * customer's selected priced options.
 *
 * `breakdown` lists each contributing option so the frontend can show a
 * "(default: RM X)" hint per line item.
 *
 * `estimatedDurationMin` = sum of durationMin across all priced selected options
 * (undefined when no option has a durationMin set).
 */
export interface ProposalPrefill {
  defaultTotal: number;
  basePrice: number;
  breakdown: PrefillBreakdownItem[];
  estimatedDurationMin?: number;
}

/**
 * Minimal shape of a category's question schema item.
 * Mirrors QuestionItem in json-schemas.ts (kept local to avoid circular imports).
 */
interface QuestionSchemaItem {
  key: string;
  label: string;
  type: string;
  priced?: boolean;
  active?: boolean;
  maxSelect?: number;
  minSelect?: number;
  showIf?: { questionKey: string; includesAny: string[] };
  options?: { value: string; label: string; active?: boolean }[];
}

/**
 * Determine whether a question is visible given the current answers.
 * A question without showIf is always visible.
 * A question with showIf is visible only when the referenced question's
 * answer includes at least one of the listed option values.
 * Hidden questions are skipped in validation and pricing.
 */
function isQuestionVisible(
  question: QuestionSchemaItem,
  answers: Record<string, string | string[]>,
): boolean {
  if (!question.showIf) return true;
  const { questionKey, includesAny } = question.showIf;
  const raw = answers[questionKey];
  if (raw === undefined || raw === null) return false;
  const selected = Array.isArray(raw) ? raw : [raw];
  return includesAny.some((v) => selected.includes(v));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Given a quote request and the merchant's best-fit service for the quote's
 * category, compute the pre-fill total and breakdown.
 *
 * Returns null when no priced questions exist or when the merchant has no
 * option-price map on any service.
 */
/** @internal Exported for unit testing (modifier-pricing.test.ts). */
export function computePrefill(
  serviceDetails: Record<string, string | string[]> | null,
  questionSchema: QuestionSchemaItem[] | null,
  service: { basePrice: Prisma.Decimal; modifiers: Prisma.JsonValue | null } | null,
): ProposalPrefill | null {
  if (!service) return null;

  const basePrice = Number(service.basePrice);
  const pricedQuestions = (questionSchema ?? []).filter((q) => q.priced === true && q.active !== false);

  // No priced questions in this category — no pre-fill needed.
  if (pricedQuestions.length === 0) return { defaultTotal: basePrice, basePrice, breakdown: [] };

  // Parse the option-price map. If the service has none, return base-only.
  let optionPriceMap: OptionPriceMap | null = null;
  if (service.modifiers) {
    const parsed = optionPriceMapSchema.safeParse(service.modifiers);
    if (parsed.success) optionPriceMap = parsed.data;
  }
  if (!optionPriceMap) return { defaultTotal: basePrice, basePrice, breakdown: [] };

  const answers = serviceDetails ?? {};
  const breakdown: PrefillBreakdownItem[] = [];
  let optionTotal = 0;
  let totalDurationMin = 0;
  let hasDuration = false;

  for (const question of pricedQuestions) {
    // Skip questions hidden by showIf branching — they are excluded from pricing.
    if (!isQuestionVisible(question, answers)) continue;

    const raw = answers[question.key];
    if (raw === undefined || raw === null) continue;

    const questionPriceMap = optionPriceMap[question.key];
    if (!questionPriceMap) continue;

    if (question.type === 'quantity') {
      // quantity-type answer: Record<optionValue, count>
      // Pricing = unit-price × qty per option.
      if (typeof raw !== 'object' || Array.isArray(raw)) continue;
      const counts = raw as Record<string, number>;
      for (const [optionValue, qty] of Object.entries(counts)) {
        if (!qty || qty <= 0) continue;
        const entry = questionPriceMap[optionValue];
        if (!entry || entry.notOffered) continue;
        if (entry.price === null) continue;

        const label =
          question.options?.find((o) => o.value === optionValue)?.label ?? optionValue;
        const linePrice = entry.price * qty;

        breakdown.push({ questionKey: question.key, optionValue, label, price: linePrice });
        optionTotal += linePrice;

        if (typeof entry.durationMin === 'number') {
          totalDurationMin += entry.durationMin * qty;
          hasDuration = true;
        }
      }
    } else {
      // checkbox / radio — answer is string or string[].
      const selected = Array.isArray(raw) ? raw : [raw];
      for (const optionValue of selected) {
        const entry = questionPriceMap[optionValue];
        if (!entry || entry.notOffered) continue;
        if (entry.price === null) continue;

        const label =
          question.options?.find((o) => o.value === optionValue)?.label ?? optionValue;

        breakdown.push({ questionKey: question.key, optionValue, label, price: entry.price });
        optionTotal += entry.price;

        if (typeof entry.durationMin === 'number') {
          totalDurationMin += entry.durationMin;
          hasDuration = true;
        }
      }
    }
  }

  // defaultTotal: sum of all matched option prices (not additive on top of
  // base — the option prices are the per-item prices, and the merchant sets
  // them to already include their base margin).  For multi-select jobs
  // (e.g. "wall chemical + wall general") the total is the sum across units.
  // Base price serves as the fallback / minimum.
  const defaultTotal = breakdown.length > 0 ? Math.max(optionTotal, basePrice) : basePrice;

  return {
    defaultTotal,
    basePrice,
    breakdown,
    ...(hasDuration ? { estimatedDurationMin: totalDurationMin } : {}),
  };
}

// ── Service functions ────────────────────────────────────────────────────────

/** List quotes this merchant was broadcast to, optionally filtered by status. */
export async function listIncomingQuotes(merchantId: string, status?: string) {
  const broadcasts = await prisma.quoteBroadcast.findMany({
    // BE-045: defence-in-depth — never surface a quote created by this
    // merchant's own paired customer account ("customer mode") in their feed.
    where: {
      merchantId,
      quoteRequest: { user: { email: { not: pairedCustomerEmail(merchantId) } } },
    },
    include: {
      quoteRequest: {
        include: {
          category: { select: { name: true, slug: true } },
          proposals: { where: { merchantId }, select: { id: true, status: true, isAuto: true } },
          user: { select: { name: true, avatarUrl: true } },
        },
      },
    },
    orderBy: { sentAt: 'desc' },
  });

  return broadcasts
    .map((b) => {
      const q = b.quoteRequest;
      const myProposal = q.proposals[0];
      const derived = myProposal ? 'responded' : q.status;
      return {
        quoteId: q.id,
        category: q.category.name,
        timeSlot: q.timeSlot,
        preferredDate: q.preferredDate,
        propertyType: q.propertyType,
        budgetMin: q.budgetMin,
        budgetMax: q.budgetMax,
        status: q.status,
        derivedStatus: derived,
        openedAt: b.openedAt,
        merchantDeadline: q.merchantDeadline,
        myProposalId: myProposal?.id ?? null,
        myProposalIsAuto: myProposal?.isAuto ?? false,
        customerAvatarUrl: q.user.avatarUrl,
        customerName: q.user.name,
      };
    })
    .filter((q) => !status || q.derivedStatus === status);
}

/**
 * Marks a broadcast quote as opened and returns a proposal pre-fill object.
 *
 * **Response shape (Phase 6):**
 * ```json
 * {
 *   "proposalPrefill": {
 *     "defaultTotal": 200,
 *     "basePrice": 110,
 *     "breakdown": [
 *       { "questionKey": "aircon_service", "optionValue": "wall_chemical",
 *         "label": "Wall Unit — Chemical Cleaning (Recommended)", "price": 110 },
 *       { "questionKey": "aircon_service", "optionValue": "wall_general",
 *         "label": "Wall Unit — General Cleaning", "price": 80 }
 *     ]
 *   }
 * }
 * ```
 * `proposalPrefill` is `null` when the category has no priced questions.
 *
 * (Previous shape was `204 No Content` — this endpoint now returns `200 JSON`
 *  as documented in COORDINATION.md §API contracts.)
 */
export async function openQuote(
  merchantId: string,
  quoteId: string,
): Promise<{ proposalPrefill: ProposalPrefill | null; customerAvatarUrl: string | null; customerName: string; lat: number | null; lng: number | null }> {
  // 1. Verify the broadcast exists.
  const broadcast = await prisma.quoteBroadcast.findUnique({
    where: { quoteRequestId_merchantId: { quoteRequestId: quoteId, merchantId } },
  });
  if (!broadcast) throw notFound('Quote was not broadcast to this merchant');

  // 2. Mark opened (idempotent).
  if (!broadcast.openedAt) {
    await prisma.quoteBroadcast.update({
      where: { id: broadcast.id },
      data: { openedAt: new Date() },
    });
  }

  // 3. Load quote (serviceDetails + category questionSchema) and the
  //    merchant's best-fit service (first one with modifiers for this
  //    category, falling back to the first service in the category).
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: quoteId },
    select: {
      serviceDetails: true,
      category: { select: { questionSchema: true } },
      categoryId: true,
      lat: true,
      lng: true,
      user: { select: { email: true, name: true, avatarUrl: true } },
    },
  });
  if (!quote) throw notFound('Quote not found');

  // BE-046: a merchant cannot open a quote created by their own paired
  // customer account ("customer mode" — the same person).
  if (quote.user.email === pairedCustomerEmail(merchantId)) {
    throw forbidden('You cannot act on a quote request from your own customer account');
  }

  // Find merchant's service for this category — prefer one with modifiers.
  const services = await prisma.merchantService.findMany({
    where: { merchantId, categoryId: quote.categoryId, deletedAt: null },
    select: { basePrice: true, modifiers: true },
    orderBy: { createdAt: 'asc' },
  });

  const serviceWithModifiers = services.find((s) => s.modifiers !== null) ?? services[0] ?? null;

  const proposalPrefill = computePrefill(
    quote.serviceDetails as Record<string, string | string[]> | null,
    quote.category.questionSchema as QuestionSchemaItem[] | null,
    serviceWithModifiers,
  );

  logger.info('Quote opened', { quoteId, merchantId, hasPrefill: proposalPrefill !== null });
  return { proposalPrefill, customerAvatarUrl: quote.user.avatarUrl, customerName: quote.user.name, lat: quote.lat, lng: quote.lng };
}

export interface ProposeInput {
  proposedPrice: number;
  message?: string;
  etaMinutes?: number;
  presetId?: string;
  lineItems?: { label: string; amount: number; taxable?: boolean; serviceChargeable?: boolean }[];
  moduleRefs?: { moduleId: string; overridePrice?: number | null }[];
}

/** Submit (or replace) this merchant's proposal for a broadcast quote. */
export async function submitProposal(merchantId: string, quoteId: string, input: ProposeInput) {
  await requireOnboarded(merchantId);

  const broadcast = await prisma.quoteBroadcast.findUnique({
    where: { quoteRequestId_merchantId: { quoteRequestId: quoteId, merchantId } },
  });
  if (!broadcast) throw notFound('Quote was not broadcast to this merchant');

  const quote = await prisma.quoteRequest.findUnique({
    where: { id: quoteId },
    select: { id: true, userId: true, categoryId: true, status: true, merchantDeadline: true, user: { select: { email: true, name: true, avatarUrl: true } } },
  });
  if (!quote) throw notFound('Quote not found');

  // BE-047: a merchant must not submit a proposal on a quote created by their
  // own paired customer account ("customer mode" — the same person). This is
  // the authoritative server-side reject: it holds even when the request is
  // made directly, bypassing the (already self-filtered) incoming feed.
  if (quote.user.email === pairedCustomerEmail(merchantId)) {
    throw forbidden('You cannot submit a proposal on a quote request from your own customer account');
  }

  if (quote.status !== 'open') throw conflict('Quote is no longer open for proposals');
  if (quote.merchantDeadline < new Date()) {
    throw conflict('The merchant proposal deadline has passed');
  }
  if (input.proposedPrice <= 0) throw badRequest('proposedPrice must be greater than zero');

  // Validate lineItems and moduleRefs when provided.
  let lineItems: Prisma.InputJsonValue = [];
  let moduleRefs: Prisma.InputJsonValue = [];
  if (input.lineItems !== undefined) {
    const parsed = lineItemsSchema.safeParse(input.lineItems);
    if (!parsed.success) throw badRequest('Invalid line items');
    lineItems = parsed.data as Prisma.InputJsonValue;
  }
  if (input.moduleRefs !== undefined) {
    const parsed = moduleRefsSchema.safeParse(input.moduleRefs);
    if (!parsed.success) throw badRequest('Invalid module references');
    moduleRefs = parsed.data as Prisma.InputJsonValue;
  }

  const existing = await prisma.quoteProposal.findUnique({
    where: { quoteRequestId_merchantId: { quoteRequestId: quoteId, merchantId } },
  });

  const data = {
    proposedPrice: input.proposedPrice,
    lineItems,
    moduleRefs,
    message: input.message ?? null,
    etaMinutes: input.etaMinutes ?? null,
    presetId: input.presetId ?? null,
    isAuto: false,
  };

  let proposal;
  if (existing) {
    if (existing.status !== 'submitted') {
      throw conflict('This proposal can no longer be changed');
    }
    proposal = await prisma.quoteProposal.update({ where: { id: existing.id }, data });
  } else {
    proposal = await prisma.quoteProposal.create({
      data: { quoteRequestId: quoteId, merchantId, ...data },
    });
  }

  await notify({
    userId: quote.userId,
    type: 'orders',
    message: `A merchant has submitted a proposal for your quote.`,
    linkUrl: `/customer/quotes/${quoteId}/proposals`,
    category: quote.categoryId,
  });

  logger.info('Proposal submitted', { quoteId, merchantId, proposalId: proposal.id });
  return proposal;
}
