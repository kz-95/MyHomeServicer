/**
 * SP-3 customer proposal enrichment (spec §12 / §14). Given a proposal + the
 * listing it derives from, builds the rich view the customer sees: included
 * modules, tickable add-on options, itemised breakdown, distance, and the
 * add-on-inclusive recompute used when the customer ticks extras.
 *
 * Tax is flat from the servicer business profile, applied via the shared
 * listing-pricing engine (§8).
 */
import { ServicerTaxConfig, LineItem } from '../lib/money';
import { OptionPriceMap, ModuleRef } from '../lib/json-schemas';
import { haversineKm } from '../lib/distance';
import {
  Answers,
  ModuleLite,
  computeListingPrice,
  computeListingDurationMin,
} from './listing-pricing.service';

export interface AddonOption {
  moduleId: string;
  name: string;
  price: number;
}

export interface ListingLike {
  id: string;
  title: string;
  listingMode: string;
  basePrice: unknown;
  estimatedDurationMinutes: number;
  modifiers: unknown;
  moduleRefs: unknown;
}

export interface ServicerLike {
  serviceAreas: string[];
  serviceChargeRate: unknown;
  sstRegistered: boolean;
  taxInclusive: boolean;
}

function moduleRefsOf(listing: ListingLike): ModuleRef[] {
  return Array.isArray(listing.moduleRefs) ? (listing.moduleRefs as unknown as ModuleRef[]) : [];
}

function taxConfigOf(servicer: ServicerLike, sstRate: number): ServicerTaxConfig {
  return {
    serviceChargeRate: Number(servicer.serviceChargeRate) || 0,
    sstRegistered: servicer.sstRegistered,
    sstRate,
    taxInclusive: servicer.taxInclusive,
  };
}

function pricingListing(listing: ListingLike) {
  return {
    basePrice: Number(listing.basePrice),
    estimatedDurationMinutes: listing.estimatedDurationMinutes,
    modifiers: (listing.modifiers ?? null) as OptionPriceMap | null,
    moduleRefs: moduleRefsOf(listing),
  };
}

/** The add-on modules a customer can tick on this listing's proposal. */
export function buildAddonOptions(
  listing: ListingLike,
  modulesById: Map<string, ModuleLite>,
): AddonOption[] {
  const out: AddonOption[] = [];
  for (const ref of moduleRefsOf(listing)) {
    if (ref.kind !== 'addon') continue;
    const mod = modulesById.get(ref.moduleId);
    out.push({
      moduleId: ref.moduleId,
      name: mod?.name ?? 'Add-on',
      price: ref.overridePrice != null ? ref.overridePrice : mod ? mod.price : 0,
    });
  }
  return out;
}

/** Included modules (always part of the listing total) for "what's included". */
export function buildIncludedModules(
  listing: ListingLike,
  modulesById: Map<string, ModuleLite>,
): { name: string; price: number }[] {
  const out: { name: string; price: number }[] = [];
  for (const ref of moduleRefsOf(listing)) {
    if (ref.kind === 'addon') continue;
    const mod = modulesById.get(ref.moduleId);
    out.push({
      name: mod?.name ?? 'Module',
      price: ref.overridePrice != null ? ref.overridePrice : mod ? mod.price : 0,
    });
  }
  return out;
}

/** Straight-line distance (km) from the quote to the nearest coord service area. */
export function listingDistanceKm(
  quoteLat: number | null | undefined,
  quoteLng: number | null | undefined,
  serviceAreas: string[],
): number | null {
  if (quoteLat == null || quoteLng == null) return null;
  let best: number | null = null;
  for (const area of serviceAreas) {
    const parts = area.split(',').map((s) => s.trim());
    if (parts.length !== 2) continue;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const d = haversineKm(quoteLat, quoteLng, lat, lng);
    if (best == null || d < best) best = d;
  }
  return best;
}

/**
 * Recompute a proposal's total + breakdown + duration with the customer's ticked
 * add-on module ids. `addonIds` are filtered to the listing's real add-on refs.
 */
export function recomputeProposalPrice(
  listing: ListingLike,
  servicer: ServicerLike,
  modulesById: Map<string, ModuleLite>,
  answers: Answers,
  sstRate: number,
  addonIds: string[],
): { total: number; breakdown: LineItem[]; durationMin: number; addonIds: string[] } {
  const validAddonIds = new Set(buildAddonOptions(listing, modulesById).map((a) => a.moduleId));
  const selected = addonIds.filter((id) => validAddonIds.has(id));
  const pl = pricingListing(listing);
  const breakdown = computeListingPrice(pl, modulesById, answers, taxConfigOf(servicer, sstRate), selected);
  const durationMin = computeListingDurationMin(pl, modulesById, answers, selected);
  return { total: breakdown.total, breakdown: breakdown.lineItems, durationMin, addonIds: selected };
}
