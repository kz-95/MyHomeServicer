/**
 * Listing-driven accept resolution (SP-3 dispatch wave, task D).
 *
 * Shared by the one-tap quote accept (servicer-quote.service) and the dispatch
 * prompt accept (dispatch.service). Resolves a servicer's listing for a quote's
 * category and computes the proposal `{ price, durationMin, message }` from the
 * SP-3 listing-pricing engine (`computeListingPrice` / `computeListingDurationMin`,
 * spec §8/§9), falling back to the listing's `basePrice` +
 * `estimatedDurationMinutes` when the listing carries no priced options/modules.
 */
import { prisma } from '../lib/prisma';
import { ServicerTaxConfig } from '../lib/money';
import { OptionPriceMap, moduleRefsSchema, ModuleRef } from '../lib/json-schemas';
import { getSstRate } from './settings.service';
import {
  Answers,
  ListingForPricing,
  ModuleLite,
  computeListingPrice,
  computeListingDurationMin,
} from './listing-pricing.service';

export interface ResolvedListingAccept {
  /** Proposed price (engine total, or the listing base price fallback). */
  price: number;
  /** Estimated duration in minutes. */
  durationMin: number;
  /** Auto-accept message for the proposal, or null if the listing has none. */
  message: string | null;
}

/** Parse the listing's stored moduleRefs JSON into typed refs (defaults filled). */
function parseModuleRefs(raw: unknown): ModuleRef[] {
  const parsed = moduleRefsSchema.safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/**
 * Resolve the computed accept values for a servicer accepting a quote.
 *
 * Picks the servicer's best-fit active listing for the quote's category
 * (prefers one carrying option modifiers), then runs the SP-3 engine over the
 * customer's answers to get the option-priced total + duration. When the
 * servicer has no listing, falls back to the quote's budget cap so the accept
 * still produces a valid proposal.
 */
export async function resolveListingAccept(
  servicerId: string,
  quote: {
    categoryId: string;
    serviceDetails: unknown;
    budgetMax?: number | null;
  },
): Promise<ResolvedListingAccept> {
  const [services, servicer, sstRate] = await Promise.all([
    prisma.servicerService.findMany({
      where: { servicerId, categoryId: quote.categoryId, deletedAt: null },
      select: {
        basePrice: true,
        estimatedDurationMinutes: true,
        modifiers: true,
        moduleRefs: true,
        autoAcceptMessage: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.servicer.findUnique({
      where: { id: servicerId },
      select: { serviceChargeRate: true, sstRegistered: true, taxInclusive: true },
    }),
    getSstRate(),
  ]);

  const service = services.find((s) => s.modifiers !== null) ?? services[0] ?? null;

  // No listing for this category: fall back to the quote's budget cap (or 0).
  if (!service) {
    return {
      price: quote.budgetMax != null ? Number(quote.budgetMax) : 0,
      durationMin: 60,
      message: null,
    };
  }

  const moduleRefs = parseModuleRefs(service.moduleRefs);

  // Resolve the referenced reusable modules into the engine's price lookup.
  const modulesById = new Map<string, ModuleLite>();
  if (moduleRefs.length > 0) {
    const rows = await prisma.servicerModule.findMany({
      where: { id: { in: moduleRefs.map((r) => r.moduleId) } },
      select: { id: true, name: true, price: true },
    });
    for (const m of rows) modulesById.set(m.id, { id: m.id, name: m.name, price: Number(m.price) });
  }

  const listing: ListingForPricing = {
    basePrice: Number(service.basePrice),
    estimatedDurationMinutes: service.estimatedDurationMinutes ?? 60,
    modifiers: (service.modifiers ?? null) as OptionPriceMap | null,
    moduleRefs,
  };

  const taxConfig: ServicerTaxConfig = {
    serviceChargeRate: Number(servicer?.serviceChargeRate ?? 0) || 0,
    sstRegistered: servicer?.sstRegistered ?? false,
    sstRate,
    taxInclusive: servicer?.taxInclusive ?? false,
  };

  const answers = (quote.serviceDetails ?? {}) as Answers;
  const breakdown = computeListingPrice(listing, modulesById, answers, taxConfig, []);
  const durationMin = computeListingDurationMin(listing, answers, []);

  return {
    price: breakdown.total,
    durationMin,
    message: service?.autoAcceptMessage ?? null,
  };
}
