/**
 * SP-3 listing pricing + duration (spec §8 Model B + flat tax, §9 duration).
 *
 * Pure functions shared by the listing preview, the customer proposal breakdown,
 * and the auto-accept budget check. Tax is applied FLAT from the servicer's
 * business-profile config via the canonical `computeTotal` — modules and options
 * carry no per-item tax flags (every line is taxable + serviceChargeable).
 */
import { LineItem, ServicerTaxConfig, TotalBreakdown, computeTotal } from '../lib/money';
import { ModuleRef, OptionPriceMap } from '../lib/json-schemas';

export interface ModuleLite {
  id: string;
  name: string;
  price: number;
}

export interface ListingForPricing {
  basePrice: number;
  estimatedDurationMinutes: number;
  modifiers?: OptionPriceMap | null;
  moduleRefs?: ModuleRef[] | null;
}

/** Customer answers to the category questions: { [questionKey]: answer }. */
export type Answers = Record<string, unknown>;

/** A selected option value with its count (count > 1 only for quantity questions). */
interface SelectedOption {
  value: string;
  count: number;
}

/** Normalise one question's answer into selected (value, count) pairs. */
function selectedOptions(answer: unknown): SelectedOption[] {
  if (answer == null) return [];
  if (typeof answer === 'string') return answer ? [{ value: answer, count: 1 }] : [];
  if (Array.isArray(answer)) {
    return answer.filter((v): v is string => typeof v === 'string').map((v) => ({ value: v, count: 1 }));
  }
  if (typeof answer === 'object') {
    // quantity question: { [optionValue]: count }
    const out: SelectedOption[] = [];
    for (const [value, raw] of Object.entries(answer as Record<string, unknown>)) {
      const count = Number(raw);
      if (Number.isFinite(count) && count > 0) out.push({ value, count: Math.floor(count) });
    }
    return out;
  }
  return [];
}

function isAddon(ref: ModuleRef): boolean {
  return ref.kind === 'addon';
}

function refPrice(ref: ModuleRef, mod: ModuleLite | undefined): number {
  if (ref.overridePrice != null) return ref.overridePrice;
  return mod ? mod.price : 0;
}

/**
 * Build the itemised line items for a listing given the customer's answers and
 * any ticked add-on module ids. Order: base · included modules · matched
 * question-option upcharges · ticked add-ons.
 */
export function buildListingLineItems(
  listing: ListingForPricing,
  modulesById: Map<string, ModuleLite>,
  answers: Answers,
  selectedAddonIds: string[] = [],
): LineItem[] {
  const items: LineItem[] = [
    { label: 'Base service', amount: round2(listing.basePrice), taxable: true, serviceChargeable: true },
  ];

  const refs = Array.isArray(listing.moduleRefs) ? listing.moduleRefs : [];

  // Included modules — always in the total.
  for (const ref of refs) {
    if (isAddon(ref)) continue;
    const mod = modulesById.get(ref.moduleId);
    items.push({
      label: mod?.name ?? 'Module',
      amount: round2(refPrice(ref, mod)),
      taxable: true,
      serviceChargeable: true,
    });
  }

  // Matched question-option upcharges.
  const mods = listing.modifiers ?? {};
  for (const [qKey, optMap] of Object.entries(mods)) {
    for (const sel of selectedOptions(answers[qKey])) {
      const entry = optMap[sel.value];
      if (!entry || entry.notOffered || entry.price == null) continue;
      items.push({
        label: `${qKey}: ${sel.value}${sel.count > 1 ? ` ×${sel.count}` : ''}`,
        amount: round2(entry.price * sel.count),
        taxable: true,
        serviceChargeable: true,
      });
    }
  }

  // Ticked add-on modules.
  const addonSet = new Set(selectedAddonIds);
  for (const ref of refs) {
    if (!isAddon(ref) || !addonSet.has(ref.moduleId)) continue;
    const mod = modulesById.get(ref.moduleId);
    items.push({
      label: `${mod?.name ?? 'Add-on'} (add-on)`,
      amount: round2(refPrice(ref, mod)),
      taxable: true,
      serviceChargeable: true,
    });
  }

  return items;
}

/**
 * Duration estimate (spec §9): base + Σ matched option deltas
 * (per-unit × count) + Σ included module deltas + Σ ticked add-on deltas.
 */
export function computeListingDurationMin(
  listing: ListingForPricing,
  answers: Answers,
  selectedAddonIds: string[] = [],
): number {
  let total = listing.estimatedDurationMinutes || 0;
  const refs = Array.isArray(listing.moduleRefs) ? listing.moduleRefs : [];
  const addonSet = new Set(selectedAddonIds);

  for (const ref of refs) {
    if (isAddon(ref) && !addonSet.has(ref.moduleId)) continue;
    total += ref.durationDeltaMin ?? 0;
  }

  const mods = listing.modifiers ?? {};
  for (const [qKey, optMap] of Object.entries(mods)) {
    for (const sel of selectedOptions(answers[qKey])) {
      const entry = optMap[sel.value];
      if (!entry || entry.notOffered) continue;
      total += (entry.durationMin ?? 0) * sel.count;
    }
  }

  return Math.max(0, Math.round(total));
}

/**
 * Full price breakdown for a listing + answers (+ optional ticked add-ons),
 * applying the servicer's flat tax config. Add-ons are excluded unless their
 * id is passed in `selectedAddonIds` (the auto-accept budget check omits them).
 */
export function computeListingPrice(
  listing: ListingForPricing,
  modulesById: Map<string, ModuleLite>,
  answers: Answers,
  taxConfig: ServicerTaxConfig,
  selectedAddonIds: string[] = [],
): TotalBreakdown {
  const lineItems = buildListingLineItems(listing, modulesById, answers, selectedAddonIds);
  return computeTotal(lineItems, 0, taxConfig, 0);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
