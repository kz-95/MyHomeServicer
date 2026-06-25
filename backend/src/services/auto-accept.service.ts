import { QuoteRequest, ServicerService } from '@prisma/client';
import { autoAcceptConditionsSchema } from '../lib/json-schemas';
import { logger } from '../lib/logger';

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Evaluates whether a quote matches a servicer service's auto-accept rules
 * (schema-notes.md §Auto-accept matching). Conditions are budget overlap,
 * property type, time slot, and weekday - all optional and ANDed together.
 */
export function quoteMatchesAutoAccept(quote: QuoteRequest, service: ServicerService): boolean {
  if (!service.autoAccept || !service.autoAcceptConditions) return false;

  const parsed = autoAcceptConditionsSchema.safeParse(service.autoAcceptConditions);
  if (!parsed.success) {
    logger.warn('Invalid auto_accept_conditions JSON - skipping', { serviceId: service.id });
    return false;
  }
  const c = parsed.data;

  // Budget: the servicer matches as long as the customer can afford the
  // servicer's floor price. A service priced *below* the customer's budget
  // still fits - a generous budget is never a disqualifier; only a customer
  // whose maximum can't reach the servicer's minimum is rejected.
  if (c.budget_min !== undefined || c.budget_max !== undefined) {
    const qMax = quote.budgetMax ? Number(quote.budgetMax) : Number.MAX_SAFE_INTEGER;
    const cMin = c.budget_min ?? 0;
    if (qMax < cMin) return false;
  }

  // Property type.
  if (c.match_property_type?.length) {
    if (!quote.propertyType || !c.match_property_type.includes(quote.propertyType)) return false;
  }

  // Time slot.
  if (c.match_time_slot?.length) {
    if (!c.match_time_slot.includes(quote.timeSlot)) return false;
  }

  // Weekday derived from the preferred date.
  if (c.match_weekday?.length) {
    const day = WEEKDAYS[new Date(quote.preferredDate).getUTCDay()];
    if (!c.match_weekday.includes(day)) return false;
  }

  return true;
}

/**
 * Computes a proposed price from a preset's price offset and a base price.
 * Used when the platform auto-submits a proposal on the servicer's behalf.
 */
export function computeAutoPrice(basePrice: number, presetOffset?: number | null): number {
  const price = basePrice + (presetOffset ?? 0);
  return Math.max(0, Math.round(price * 100) / 100);
}
