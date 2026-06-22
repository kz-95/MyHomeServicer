import { z } from 'zod';
import { TIME_SLOTS } from './time-slots';

/**
 * Zod schemas for every JSONB field on the platform. security-notes.md §4
 * mandates that all JSONB writes are validated against a schema before save.
 */

const timeSlot = z.enum(TIME_SLOTS);
const weekday = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const fieldRule = z.enum(['required', 'optional', 'hidden']);

/** SERVICER_SERVICE.auto_accept_conditions */
export const autoAcceptConditionsSchema = z.object({
  budget_min: z.number().nonnegative().optional(),
  budget_max: z.number().nonnegative().optional(),
  match_property_type: z.array(z.string()).optional(),
  match_time_slot: z.array(timeSlot).optional(),
  match_weekday: z.array(weekday).optional(),
});
export type AutoAcceptConditions = z.infer<typeof autoAcceptConditionsSchema>;

/** SERVICER_SERVICE.field_requirements — address/time/date/contact are locked. */
export const fieldRequirementsSchema = z.record(z.string(), fieldRule);
export type FieldRequirements = z.infer<typeof fieldRequirementsSchema>;

/**
 * SERVICER_SERVICE.modifiers — option-price map (Phase 6 shape, extended with durationMin).
 *
 * Shape: Record<questionKey, Record<optionValue, { price: number|null, durationMin?: number, notOffered: boolean }>>
 *
 * - questionKey  matches a priced question's `key` in Category.questionSchema
 * - optionValue  matches one of that question's option `value` strings
 * - price        the servicer's per-option price (null = "use base price only")
 * - durationMin  estimated minutes for this option (optional; sums into estimated job time)
 * - notOffered   when true, the servicer does not offer this option at all;
 *                the option-price grid shows it greyed out / skippable
 *
 * Only priced questions (priced: true in the questionSchema) are stored here.
 * Informational questions (property_type, free text) are never keyed.
 */
export const optionPriceEntrySchema = z.object({
  price: z.number().nonnegative().nullable(),
  durationMin: z.number().int().nonnegative().optional(),
  notOffered: z.boolean(),
});

export const optionPriceMapSchema = z.record(
  z.string().min(1),
  z.record(z.string().min(1), optionPriceEntrySchema),
);
export type OptionPriceEntry = z.infer<typeof optionPriceEntrySchema>;
export type OptionPriceMap = z.infer<typeof optionPriceMapSchema>;

/**
 * @deprecated Use optionPriceMapSchema — retained only to avoid breaking
 * any existing callers while the migration is in progress.
 */
export const serviceModifiersSchema = optionPriceMapSchema;
export type ServiceModifiers = OptionPriceMap;

/** QuoteProposal line item — per money-listing-epic-spec.md §2.4 */
export const lineItemSchema = z.object({
  label: z.string().min(1).max(200),
  amount: z.number().nonnegative(),
  taxable: z.boolean().default(true),
  serviceChargeable: z.boolean().default(true),
});
export type LineItem = z.infer<typeof lineItemSchema>;

export const lineItemsSchema = z.array(lineItemSchema);

/**
 * Module reference — used both by a listing (ServicerService.moduleRefs) and by
 * a QuoteProposal. `kind` distinguishes always-included modules from tickable
 * add-ons (SP-3 §8); `durationDeltaMin` is the module's contribution to the
 * estimated job time (SP-3 §9). Both default so pre-SP-3 refs parse unchanged.
 */
export const moduleRefSchema = z.object({
  moduleId: z.string().uuid(),
  kind: z.enum(['included', 'addon']).default('included'),
  overridePrice: z.number().nonnegative().nullable().optional(),
  durationDeltaMin: z.number().int().optional(),
});
export type ModuleRef = z.infer<typeof moduleRefSchema>;

export const moduleRefsSchema = z.array(moduleRefSchema);

/** PLATFORM_SETTINGS.value — one schema per known key. */
export const platformFeeRateSchema = z.object({
  current_rate: z.number().min(0).max(1),
  scheduled_changes: z
    .array(
      z.object({
        starts_at: z.string(),
        ends_at: z.string(),
        new_rate: z.number().min(0).max(1),
        advertised_discount: z.string().optional(),
      }),
    )
    .default([]),
});

/** PLATFORM_SETTINGS.budget_ranges — admin-defined budget brackets a customer
 *  picks from on the quote form (they cannot type an arbitrary min/max).
 *
 *  Supports both:
 *  - Legacy format: `{ ranges: [...rangeRows] }` (same ranges for all categories)
 *  - Per-category:  `{ ranges: { [categoryId]: [...rangeRows] } }` */
const budgetRangeRow = z.object({ min: z.number().nonnegative(), max: z.number().positive().nullable() });
const budgetRangeArray = z.array(budgetRangeRow).min(1);

export const budgetRangesSchema = z.object({
  ranges: z.union([
    budgetRangeArray,
    z.record(z.string(), budgetRangeArray),
  ]),
});

const greetingArray = z.array(z.string().min(1).max(500)).min(10).max(50);
// Per-tier greeting pools (returning guest, customer, servicer, admin). Fewer
// required than the anonymous pool, and the returning pool may use a {name}
// placeholder that the client fills in (e.g. "Hello, is this {name}?").
const tierGreetingArray = z.array(z.string().min(1).max(500)).min(1).max(50);

const chatServiceKeywordsSchema = z.record(
  z.string().uuid(),
  z.object({
    keywords: z.array(z.string().min(1)),
    description: z.string().min(1).max(500),
  }),
);

export const settingsSchemas: Record<string, z.ZodTypeAny> = {
  platform_fee_rate: platformFeeRateSchema,
  travel_fee_baseline_overall: z.object({ amount: z.number().nonnegative() }),
  supplies_fee_baseline_overall: z.object({ amount: z.number().nonnegative() }),
  sst_rate: z.object({ rate: z.number().min(0).max(1) }),
  no_response_discount: z.object({
    discount_type: z.enum(['percent', 'fixed']),
    value: z.number().positive(),
    expires_in_days: z.number().int().positive(),
  }),
  noshow_grace_minutes: z.object({ minutes: z.number().int().positive() }),
  budget_ranges: budgetRangesSchema,
  points_per_rm: z.number().nonnegative(),
  points_per_review: z.number().nonnegative(),
  points_per_referral: z.number().nonnegative(),
  welcome_points: z.number().nonnegative(),
  redemption_rate: z.number().nonnegative(),
  chat_assistant_enabled: z.boolean(),
  chat_quote_enabled: z.boolean(),
  chat_profile_enabled: z.boolean(),
  chat_guest_enabled: z.boolean(),
  chat_history_limit: z.number().int().min(10).max(200),
  chat_guest_auto_open: z.boolean(),
  chat_guest_auto_open_delay: z.number().int().min(1000).max(30000),
  chat_assistant_prompt: z.string().max(2000),
  chat_assistant_tone: z.enum(['friendly', 'professional', 'casual']),
  chat_greetings: greetingArray,
  chat_greetings_returning: tierGreetingArray,
  chat_greetings_customer: tierGreetingArray,
  chat_greetings_servicer: tierGreetingArray,
  chat_greetings_admin: tierGreetingArray,
  chat_service_keywords: chatServiceKeywordsSchema,
  chat_banned_words: z.array(z.string().min(1)).max(200),
  dispatch_prompt_timeout_seconds: z.object({ seconds: z.number().int().positive() }),
};

/**
 * Validate a JSONB value against its registered schema. Throws a ZodError on
 * failure — callers convert it into a VALIDATION_ERROR response.
 */
export function validateSettingValue(key: string, value: unknown): unknown {
  const schema = settingsSchemas[key];
  if (!schema) throw new Error(`Unknown platform setting key: ${key}`);
  return schema.parse(value);
}

// ── Category.questionSchema ────────────────────────────────────────────────

/**
 * Reserved global question keys that may never appear in a category's questionSchema.
 * These are rendered as global built-in fields on every quote form.
 */
export const RESERVED_QUESTION_KEYS = ['property_type'] as const;

/**
 * Per-language label translations. `en` mirrors the canonical label and is set by the
 * auto-translator so a later save can tell whether the source text changed (and the
 * other languages need refreshing). ms/zh/ta are filled on save; any value an admin
 * supplies is preserved (manual override). All optional — absent = fall back to the
 * canonical `label`.
 */
export const localizedSchema = z
  .object({
    en: z.string(),
    ms: z.string(),
    zh: z.string(),
    ta: z.string(),
  })
  .partial();

/** One option inside a radio/checkbox question. `value` is immutable after first save. */
export const questionOptionSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  labelI18n: localizedSchema.optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
});

/**
 * Conditional visibility rule: show this question only when the referenced
 * question's answer includes any of the listed option values.
 * Hidden questions are skipped in validation and pricing.
 */
export const showIfSchema = z.object({
  questionKey: z.string().min(1),
  includesAny: z.array(z.string().min(1)).min(1),
});

/** One question in a category's question schema. `key` is immutable after first save. */
export const questionItemSchema = z.object({
  key: z.string().min(1).refine(
    (k) => !RESERVED_QUESTION_KEYS.includes(k as typeof RESERVED_QUESTION_KEYS[number]),
    { message: `Question key is reserved and cannot be used in a category schema (reserved: ${RESERVED_QUESTION_KEYS.join(', ')})` },
  ),
  label: z.string().min(1),
  labelI18n: localizedSchema.optional(),
  /**
   * Input types:
   *  - checkbox  — multi-select from a fixed option list (answer: string[])
   *  - radio     — single-select from a fixed option list (answer: string)
   *  - text      — free-text field (answer: string)
   *  - quantity  — per-option count stepper (answer: Record<optionValue, number>)
   *  - number    — single numeric input, informational (answer: number)
   */
  type: z.enum(['checkbox', 'radio', 'text', 'quantity', 'number']),
  required: z.boolean().optional(),
  priced: z.boolean().optional(),
  description: z.string().optional(),
  descriptionI18n: localizedSchema.optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
  /** Maximum number of selections (checkbox only). Unset = unlimited. */
  maxSelect: z.number().int().positive().optional(),
  /** Minimum number of selections required (checkbox only). */
  minSelect: z.number().int().nonnegative().optional(),
  /** Conditional visibility: render this question only when another question's answer matches. */
  showIf: showIfSchema.optional(),
  options: z.array(questionOptionSchema).optional(),
});

export const questionSchemaSchema = z.array(questionItemSchema);

export type Localized = z.infer<typeof localizedSchema>;
export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type ShowIf = z.infer<typeof showIfSchema>;
export type QuestionItem = z.infer<typeof questionItemSchema>;
export type QuestionSchema = z.infer<typeof questionSchemaSchema>;

/**
 * Compares an incoming questionSchema against the currently-stored one.
 * Returns an error string if any existing `key` or option `value` was removed or
 * renamed (immutability violation). Returns null when the payload is safe to save.
 * Adding new questions/options and editing labels/flags/active is always allowed.
 */
export function checkQuestionSchemaImmutability(
  existing: QuestionSchema,
  incoming: QuestionSchema,
): string | null {
  for (const existingQ of existing) {
    const incomingQ = incoming.find((q) => q.key === existingQ.key);
    if (!incomingQ) {
      return `Question key "${existingQ.key}" cannot be removed — set active: false to deactivate it.`;
    }
    for (const existingOpt of existingQ.options ?? []) {
      const found = (incomingQ.options ?? []).find((o) => o.value === existingOpt.value);
      if (!found) {
        return `Option value "${existingOpt.value}" in question "${existingQ.key}" cannot be removed — set active: false to deactivate it.`;
      }
    }
  }
  return null;
}
