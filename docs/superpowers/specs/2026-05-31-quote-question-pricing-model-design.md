# Quote Question + Pricing Model — Design

**Date:** 2026-05-31
**Status:** IMPLEMENTED (2026-05-31) — `quantity` + `number` input types built (Zod schema, quote-form, guest-quote, admin schema editor); `Category.photosEnabled` added (schema + admin toggle + seed); all 29 child questionSchemas seeded; `aircond-repair` child added under `appliance-repair`; `event-planner` renamed "Event & Wedding Planner"; `requiresInspection` false on all children for demo. NOT built yet: quantity unit-price × qty pricing in `computePrefill` (priced:false for now), photo attach on individual questions (reuses existing quote photo upload controlled by `photosEnabled` toggle).
**Mode:** Builder / content+model design
**Scope:** questionSchema shape, global quote fields, per-option duration, travel fee, inspection flow. Touches SP2 (category settings + question editor), SP3 (servicer listing), Financial Settings, quote form, booking, money calc.

---

## Why

Before writing each category's `questionSchema` one-by-one, the underlying model needs new
capabilities the current shape can't express: limited multi-select, per-option time,
travel fee, inspection-first flow, and a clean split between *global* quote fields vs
*per-category* questions.

---

## 1. Global reserved quote fields (NOT in questionSchema)

Some answers EVERY service needs regardless of category. These are **built-in quote-form
fields**, not per-category questions. They are **reserved keys** — a category's
`questionSchema` may not redefine them.

- **`property_type`** — required, every quote. Options:
  - Landed (terrace, semi-d, bungalow)
  - High-rise (condo, apartment)
  - Light commercial (office, shop, cafe)
  - Commercial (shopping centre, factory)

Rationale: user — *"type of property is not a category question schema, but every service needs to know."* Removes the awkward "shared tail" duplicated per category.

- **Photos — per-category toggle (NOT all quotes).** Admin enables "request reference photos"
  per category (`Category.photosEnabled`). When on, the quote shows an optional photo upload;
  when off, no photo field. ON for repair/install (plumber, appliance repair, electrical,
  door-gate, roof, carpentry, aircond installer); OFF for cleaning etc. Reuse existing quote
  photo upload. Not a per-question type — a category setting in Category Settings.

> Note: an "urgency" field is NOT part of this model — it was a stray draft idea, dropped.
> Global: `property_type` (required, every quote). Photos: per-category toggle (`photosEnabled`).

## 2. questionSchema shape changes

Per-category questions only (the category-specific stuff). Shape gains:

```ts
{
  key, label, type: 'checkbox'|'radio'|'text'|'quantity'|'number',
  // NEW input-type backlog (base build did checkbox/radio/text only — these need building):
  //  'quantity' — each option has a count stepper (0/-/+); pricing = unit-price × qty. (Curtain Q1)
  //  'number'   — single free numeric input (e.g. attendees, duration hours). (Wedding Planner)
  //  photo attach — optional reference photos on a question; likely reuse the existing quote
  //                 photo upload rather than a new type. (Wedding Planner Q8)
  required?, priced?, description?, sortOrder?, active?,
  maxSelect?: number,      // checkbox only — "choose up to N"; unset = all
  minSelect?: number,      // checkbox only — minimum required
  showIf?: { questionKey: string, includesAny: string[] },  // conditional/branching:
                           // render this question only when another question's answer
                           // includes any of these option values (e.g. show sofa-size
                           // only if clean_for includes a sofa)
  options?: [{ value, label, sortOrder?, active? }]
}
```

**Branching (conditional questions):** `showIf` makes a question appear only when an earlier
question's selection includes one of the listed option values. Quote form hides it otherwise;
hidden questions are skipped in validation + pricing.

**Rules (from user):**
- **Single-use keys.** Each `key` used once per schema; the reserved global key
  `property_type` can never be used in a category schema.
- **Immutable after save.** Can't edit an existing question's key or option values;
  "removing" = `active:false` (soft-deactivate). (Matches SP2 immutability decision.)
- **maxSelect / minSelect** apply to `checkbox` questions; the quote form enforces them.

## 2b. Question pattern (reference: Plumbing)

Established flow logic for service categories — decompose into independent axes:
- **`action`** — radio (choose one) — what to do. e.g. Dismantle · Install · Repair · Replace
- **`area`** — checkbox, `minSelect:1` — what part/subject. e.g. Tap · Toilet · Water heater · Other (explain)
- **`problem`** — checkbox, `minSelect:1` — the symptom (often info). e.g. Leak/drip · Clogged · Low pressure · Other (explain)
- An **"Other (explain below)"** option pairs with the `details` text field.

**Pricing is additive across priced axes.** For Plumbing the priced axes are **action +
area** (problem = info): customer total contribution = price(chosen action) + Σ price(chosen
areas). Servicer sets a price (and duration) per option on each priced question; selections
sum into the proposal.

Not every category uses all three axes — adapt per category (e.g. cleaning = type + size;
catering = type + pax). Design each one-by-one.

## 3. Per-option service duration (B)

Servicer sets an estimated **time per option**, alongside price. `MerchantService.modifiers`
entry extends:

```ts
modifiers[questionKey][optionValue] = { price, durationMin, notOffered }
```

Total estimated job time = sum of `durationMin` over selected options. Feeds scheduling,
customer expectation, and SP4 dispatch (slot sizing). Servicer sets this in the listing
pricing grid (SP3).

## 4. Travel fee (C) — money, exact

- **Baseline default: RM 20.** Two admin controls:
  - **Overall** baseline — Financial Settings (platform-wide, fast adjust).
  - **Per-category** baseline — Category Settings.
- **Effective category baseline = max(category baseline, overall baseline).** Overall acts
  as a floor; a category intentionally set higher is never lowered by the overall. Raising
  the overall above a category raises that category's floor.
- **Servicer sets their travel fee ≥ effective baseline** (flexible — real travel costs vary).
- Customer pays the servicer's travel fee.
- **Platform-fee split (DECIDED):**
  - **Baseline portion → 100% to the servicer. Platform takes 0%.**
  - **Extra above baseline (`servicerTravelFee − effectiveBaseline`) → platform charges its
    normal platform-fee % on that extra; servicer keeps the rest.
- **Non-refundable (DECIDED 2026-06-02):** Travel fee is non-refundable once the servicer
  arrives at site. Displayed as "non-refundable" on the bill step at quote-creation time.

## 4b. Pass-through fees (travel + supplies — same rule, coded separately)

Cleaning supplies fee follows the **same rule as travel fee** (DECIDED): admin baseline
(overall + per-category, effective = max), servicer ≥ baseline, **baseline 0% to platform
(100% servicer), extra above baseline platform-%'d.** Customer can opt out (RM0).

Decision: keep travel fee and supplies fee **coded separately** (NOT a generalized
"pass-through fee" type) — same rule, distinct implementations. First two: `travel` (global),
`cleaning_supplies` (Home Cleaning Q2, baseline ~RM30).

## 5. Inspection / procedure (D = both)

- **Inspection-first flow** — a listing/category can require an on-site inspection before a
  real quote is possible (roof leak, renovation). Flow: customer requests → books an
  inspection visit (free or travel-fee) → servicer inspects → sends the real quote. New
  booking sub-type; biggest piece — likely its own implementation phase.
- **Procedure description** — servicer free-text steps shown to the customer
  (e.g. "1. Inspect 2. Chemical wash 3. Test"). Informational, small.
- **Non-refundable (DECIDED 2026-06-02):** Inspection fee is non-refundable once the
  inspection is completed. Displayed as "non-refundable" on bill step.

## 6. Admin price analytics (parked idea)

Category Settings shows **average active service-listing price per category + sub-category**.
Gives admin marketplace price visibility. Separate analytics feature; defer (SP2 follow-up).

---

## Impact map

| Area | Change |
|------|--------|
| `schema.prisma` | category travel/urgency baselines; listing travelFee, requiresInspection, procedure; `modifiers` durationMin (JSON) |
| Financial Settings (admin) | overall travel baseline |
| Category Settings (admin, SP2) | per-category travel baseline, inspection default, procedure; questionSchema editor gains maxSelect/minSelect |
| Servicer listing (SP3) | per-option price+duration grid; travel fee (≥ baseline); procedure text; requires-inspection toggle |
| Quote form | global property_type field; travel fee display; inspection-first path |
| Booking | inspection-first sub-flow |
| Money calc + tests | travel split (baseline 0% / extra %'d); urgency split (platform-heavy); all Decimal, validated, tested |

## Open questions

- Inspection visit: free, or charges the travel fee?
- Where exactly does `property_type` render in the existing 4-step quote wizard?
- Travel-fee extra: capped, or servicer can set any amount above baseline?

## Next

Lock this model → then design each category's `questionSchema` one-by-one (detailed),
using the finalized shape (no property_type/urgency inside — those are global).
