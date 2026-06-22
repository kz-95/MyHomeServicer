/**
 * SP-3 auto-accept engine (spec §11). When a listing has auto-accept ON, ALL
 * FOUR gates must pass (they are not individually toggleable):
 *   1. Budget   — computed total ≤ quote.budgetMax (no max → passes). hourly/quote
 *                 price types never auto-accept.
 *   2. Availability — servicer isOnline AND the quote's weekday+slot is ticked
 *                 available in their calendar work-hours (empty schedule = always on).
 *   3. Coverage — quote within `serviceRadiusKm` of any coordinate service area
 *                 (no quote coords or no coord areas → passes, matching the lenient
 *                 broadcast matcher).
 *   4. Q-match  — every selected question-option the listing has an opinion on is
 *                 offered (not N/A).
 * The per-account `maxAutoAccepts` cap is enforced by the caller.
 *
 * Replaces `quoteMatchesAutoAccept` + the `ServicerProposalPreset` price-offset flow.
 */
import { ServicerTaxConfig, LineItem } from '../lib/money';
import { OptionPriceMap } from '../lib/json-schemas';
import { haversineKm } from '../lib/distance';
import {
  Answers,
  ListingForPricing,
  ModuleLite,
  computeListingPrice,
  computeListingDurationMin,
} from './listing-pricing.service';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export interface QuoteLite {
  budgetMax: number | null;
  lat: number | null;
  lng: number | null;
  preferredDate: Date;
  timeSlot: string;
  answers: Answers;
}

export interface ServicerLite {
  isOnline: boolean;
  serviceAreas: string[];
  serviceRadiusKm: number;
  serviceChargeRate: number;
  sstRegistered: boolean;
  taxInclusive: boolean;
}

export interface ListingLite extends ListingForPricing {
  autoAccept: boolean;
  priceType: string;
}

export interface ScheduleLite {
  weekday: string;
  timeSlot: string;
  isAvailable: boolean;
}

export interface AutoAcceptResult {
  pass: boolean;
  total: number;
  durationMin: number;
  lineItems: LineItem[];
  reasons: string[];
}

function parseCoords(area: string): { lat: number; lng: number } | null {
  const parts = area.split(',').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/** Coverage gate — true if within radius of any coord area (or no coords to test). */
function coverageOk(quote: QuoteLite, servicer: ServicerLite): boolean {
  if (quote.lat == null || quote.lng == null) return true;
  const coordAreas = servicer.serviceAreas.map(parseCoords).filter((c): c is { lat: number; lng: number } => c !== null);
  if (coordAreas.length === 0) return true;
  return coordAreas.some(
    (c) => haversineKm(quote.lat!, quote.lng!, c.lat, c.lng) <= servicer.serviceRadiusKm,
  );
}

/** Availability gate — online AND weekday+slot ticked available (empty schedule = on). */
function availabilityOk(quote: QuoteLite, servicer: ServicerLite, schedules: ScheduleLite[]): boolean {
  if (!servicer.isOnline) return false;
  if (schedules.length === 0) return true;
  // Resolve the weekday in Malaysia time (UTC+8). A quote near UTC midnight maps
  // to the wrong calendar day under raw getUTCDay() — shift by +8h first.
  const MYT_OFFSET_MS = 8 * 60 * 60_000;
  const weekday = WEEKDAYS[new Date(new Date(quote.preferredDate).getTime() + MYT_OFFSET_MS).getUTCDay()];
  const slot = schedules.find((s) => s.weekday === weekday && s.timeSlot === quote.timeSlot);
  // No row for this weekday+slot at all → not part of the work week → unavailable.
  return slot ? slot.isAvailable : false;
}

/** Q-match gate — every selected option the listing prices/offers must be offered. */
function qMatchOk(modifiers: OptionPriceMap | null | undefined, answers: Answers): boolean {
  if (!modifiers) return true;
  for (const [qKey, optMap] of Object.entries(modifiers)) {
    const answer = answers[qKey];
    const selected = selectedValues(answer);
    for (const value of selected) {
      const entry = optMap[value];
      if (!entry || entry.notOffered) return false;
    }
  }
  return true;
}

function selectedValues(answer: unknown): string[] {
  if (answer == null) return [];
  if (typeof answer === 'string') return answer ? [answer] : [];
  if (Array.isArray(answer)) return answer.filter((v): v is string => typeof v === 'string');
  if (typeof answer === 'object') {
    return Object.entries(answer as Record<string, unknown>)
      .filter(([, c]) => Number(c) > 0)
      .map(([k]) => k);
  }
  return [];
}

/**
 * Pure evaluation of the four auto-accept gates. The cap (`maxAutoAccepts`) is
 * enforced by the caller before/after this. Returns the computed total + duration
 * (add-ons excluded) so a passing result can be turned straight into a proposal.
 */
export function evaluateAutoAcceptGates(
  quote: QuoteLite,
  listing: ListingLite,
  servicer: ServicerLite,
  modulesById: Map<string, ModuleLite>,
  sstRate: number,
  schedules: ScheduleLite[],
): AutoAcceptResult {
  const reasons: string[] = [];
  const taxConfig: ServicerTaxConfig = {
    serviceChargeRate: servicer.serviceChargeRate,
    sstRegistered: servicer.sstRegistered,
    sstRate,
    taxInclusive: servicer.taxInclusive,
  };
  const breakdown = computeListingPrice(listing, modulesById, quote.answers, taxConfig, []);
  const durationMin = computeListingDurationMin(listing, quote.answers, []);

  if (!listing.autoAccept) reasons.push('auto-accept off');
  if (listing.priceType === 'hourly' || listing.priceType === 'quote') {
    reasons.push('price type does not auto-accept');
  }
  // Budget gate.
  if (quote.budgetMax != null && breakdown.total > quote.budgetMax) {
    reasons.push(`total ${breakdown.total} exceeds budget ${quote.budgetMax}`);
  }
  // Availability gate.
  if (!availabilityOk(quote, servicer, schedules)) reasons.push('not available at requested time');
  // Coverage gate.
  if (!coverageOk(quote, servicer)) reasons.push('outside coverage radius');
  // Q-match gate.
  if (!qMatchOk(listing.modifiers, quote.answers)) reasons.push('requested option not offered');

  return {
    pass: reasons.length === 0,
    total: breakdown.total,
    durationMin,
    lineItems: breakdown.lineItems,
    reasons,
  };
}
