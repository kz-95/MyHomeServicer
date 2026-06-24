# SP-3 — Service Listings Redesign (Design Spec)

> **Status:** DESIGN — 2026-06-12
> **Parent initiative:** `2026-06-12-servicer-profile-initiative-findings.md`
> **Depends on:** SP-5 (ServicerContact for contact-prefill; account `serviceRadiusKm`).
> **Scope:** Replace the listing wizard + thin proposal with a clean modules-based
> listing system, designed backward from the customer proposal + auto-accept.

---

## 1. Problem

The current listing wizard (`listing-wizard.component.ts`, 4 steps) is too complex
for new servicers, and the customer proposal (`proposals.component.ts`) is too thin
(only businessName/rating/logo/message/eta/price). The data model conflates
per-option pricing, modules, and tax overrides.

## 2. Goals

- Design backward from **(a) what the customer sees** and **(b) auto-accept**.
- **Richer customer output, leaner servicer input** — derive, don't re-type.
- Simple path for newcomers; advanced power behind a clear opt-in.
- One reusable **Modules** library (CRUD) replacing ad-hoc per-option/module UX.

## 3. Non-goals

- Business-profile concerns (contacts, tax config, radius) → **SP-5**.
- Popout firing gate → **SP-1**; manual `isOnline` toggle → **SP-2**.

## 4. Core principle — derive, don't re-type

| Customer proposal shows | Derived from |
|---|---|
| Service title + what's included | listing title + its **included modules** |
| Price breakdown | base + modules + question-options **+ business-profile tax** |
| Duration estimate + arrival window | computed duration + **calendar work-hours** |
| Coverage + distance | **account** `serviceRadiusKm` + serviceArea coords (computed) |
| Name / rating / contact | business profile |

## 5. One category per account

A servicer does **one** service type. **No category picker anywhere**; listings +
modules inherit `Servicer.categoryId` (changed only via the SP-5 admin-reviewed
flow). **No sub-category.**

## 6. IA — `/servicer/services` → 2 tabs

Route restructure mirroring the existing jobs tabs:
- **`/servicer/services/module`** — Title + [Add] · search · [filter] · sort + reverse · card grid. **Default tab** (redirect from `/servicer/services`).
- **`/servicer/services/listings`** — Title + [Add] · search · [Status filter] · sort + reverse · card grid.

> **2026-06-25:** Tab order swapped. Modules is now the first/default tab because the logical flow is: create modules first → then attach them when creating a listing. Redirect from `/servicer/services` changed from `listings` to `module`.

### 6.1 Listings tab — card (3-line collapsed + expand)
- Collapsed (3 lines): photo · title · short desc · `RM price · duration · N modules ·
  auto-accept ●` · **status toggle** (Active/Draft) · **⋯ menu**.
- ⋯ menu: **Edit · Duplicate · Activate/Deactivate · Delete**.
- Expand (▾): modules (included/add-on), question schema, auto-accept summary, `Preview as customer`.

### 6.2 Modules tab — card + add/edit
- Card: name · price · SKU (or —) · "used in N listings" · [Edit].
- Add/Edit modal: **name*, price*, SKU (optional)** — nothing else (see §8 tax).

## 7. Module model — `ServicerModule` (business_modules)

`{ id, servicerId FK, name, price (Decimal), sku?, active, timestamps }`
- Reusable priced item; unifies the old "what's included" text + pricing modules.
- **No per-item tax flags** (flat tax — §8). Migrating `PricingModule`/`moduleRefs` → this.

## 8. Pricing — Model B (transparent stacking) + FLAT tax

Tax config lives **entirely in the business profile**; applied flat (no per-line flags).
```
subtotal      = base + Σ included modules + Σ question-option upcharges + Σ ticked add-ons
serviceCharge = subtotal × serviceChargeRate            (business-profile rate)
sst           = (subtotal + serviceCharge) × sstRate     (only if sstRegistered)
total (tax-excl) = subtotal + serviceCharge + sst
tax-inclusive    → prices already include tax; total = subtotal; serviceCharge + sst
                   back-extracted, shown as "included" for transparency
```
- Add-on tick on the **proposal** recomputes `total` live + is captured into the booking.

## 9. Duration — mirrors the price model

- **Simple:** one flat estimate.
- **Advanced:** `duration = base + Σ matched option deltas + Σ included module deltas`.
  - Number/quantity question: **per-unit × count** (servicer sets minutes/unit).
  - Radio/checkbox option: flat delta per option.
  - Module: optional duration delta.
  - Duration sits next to price on each option/module.
- **Customer display:** estimate + arrival window (e.g. "~90 min · today 2–4pm";
  window from calendar work-hours).

## 10. Listing create — mode chooser → Simple OR Advanced

**+ Add** opens a chooser: **⚡ Simple** vs **⚙ Advanced**.

### 10.1 SIMPLE — one screen, publish fast
- Photo (opt), title*, short desc (opt), price type, base price*, est. duration.
- **"What jobs do you want?"** — category questions as **offered/N-A toggles**
  (no per-option pricing). Drives matching + auto-accept Q-match.
- No modules, no auto-accept → manual quoting. Convert to Advanced via Edit.

### 10.2 ADVANCED — 3-step wizard
- Step ① **Basics** (required) — same basics. **Publish-now** here.
- Step ② **Pricing & options** (optional) — Modules picker (each **included** or
  **optional add-on**; `+ New module` inline) + per-option price **and duration** on
  the category questions. A listing may have **zero modules** (question-only).
- Step ③ **Auto-accept** (optional) — auto-accept toggle + auto message.
  (Radius/coverage is **account-level** in the business profile, not here.)
- **Preview** = `👁 Preview as customer` toggle (overlay), any step — not a step.
- Nav: step dots clickable + skip-ahead once Basics valid; guided hints; only Basics required.

### 10.3 Question schema = "what jobs you want"
A job-preference filter (which job types/options the servicer takes) → drives which
quotes reach them + auto-accept Q-match. Per-option **pricing** is Advanced-only.

## 11. Auto-accept engine — ALL 4 gates always apply

When auto-accept is ON, all four enforced (not individually toggleable):
1. **Budget fit** — compute total for THIS quote (base + included modules +
   matched question-option upcharges + flat tax; **add-ons excluded**).
   Pass if `total ≤ quote.budgetMax` (no max → passes). `priceType` hourly/quote →
   no auto-accept.
2. **Availability** — `quote.preferredDate + timeSlot` ticked-available in **calendar
   work-hours** (live, respects per-week rest) AND `isOnline`.
3. **Coverage** — `haversine(serviceArea coords, quote address) ≤ account
   serviceRadiusKm` for **any** service area.
4. **Q-match** — every customer answer maps to an **offered** option (not N/A).
- **Cap:** servicer not already at `maxAutoAccepts` (**per-account**) concurrent auto-accepts.
- All pass → create proposal at computed total, `isAuto=true`. Replaces
  `quoteMatchesAutoAccept` + `MerchantProposalPreset` (`quote.service.ts:353`).

## 12. Customer proposal view — `/customer/quotes/:id/proposals`

- List of proposal cards · sort (price/rating/distance/recent) + reverse · filter (rating).
- **Card collapsed:** logo · businessName · ★rating(count) · auto-proposed badge ·
  **distance** · **service title** · **what's included** · **availability/ETA window** ·
  **total** · `View breakdown ▾` · **[Choose]**.
- **Card expanded:** itemized **breakdown** (§8) · **optional add-ons** (tickable,
  recompute total) · message · coverage summary · [Choose this servicer].
- Selected add-ons captured into the booking.

## 13. Seeding (demo) — `docs/ai-context/seed-plan.md` + seed data

- **Modules:** a few per demo servicer, category-apt (Aircon → Chemical Wash RM30, Gas Top-up RM25).
- **Listings:** seed **both** a Simple listing and an Advanced listing per demo
  servicer (modules incl/add-on + question-option pricing + auto-accept on), so
  matching + proposals + breakdown are exercised end-to-end.
- Seed demo servicers + listings under painting/moving/gardening (existing gap).
- (Business-profile-side seeding — contacts, operating hours, tax, Public Bank
  withdrawal, radius — is covered by SP-5 seeding.)

## 14. Backend changes summary

- New `ServicerModule` model + migration + CRUD (`/servicer/modules`).
- Rework `MerchantService` for the new listing shape (modules incl/add-on refs,
  question-option price+duration, simple/advanced flag, photo, short desc).
- New pricing computation (§8) shared by the listing preview, the proposal breakdown,
  and the auto-accept budget check.
- New auto-accept engine (§11) replacing `quoteMatchesAutoAccept`.
- Proposal payload carries title, included modules, breakdown, add-on options,
  distance, availability window; booking records chosen add-ons.

## 15. Migration

- `MerchantService.modifiers` / `moduleRefs` / `PricingModule` → new `ServicerModule`
  library + listing module refs. Preserve existing listings' prices.
- Phase plan: Phase 1 = modules model + tabs + Modules CRUD + Simple listing
  (Advanced wizard stubbed). Phase 2 = pricing engine + auto-accept + customer
  proposal + migration.

## 16. Testing

- Unit: pricing composition (§8) incl. tax-inclusive extraction; duration scaling
  (§9); auto-accept 4-gate evaluation (§11) incl. budget/availability/coverage/Q-match
  edge cases; module CRUD validation.
- E2E: create Simple + Advanced listing; module library CRUD + "used in N"; proposal
  breakdown + add-on tick recompute → booking captures add-ons; auto-accept fires only
  when all gates pass.
- Gates: backend + frontend `tsc --noEmit`; `ng build` AOT; migration committed.

---

## 17. 2026-06-25 Redesign — Module-First Listing Form

> **Status:** DESIGN — 2026-06-25
> **Supersedes:** §6 tab order, §10 Simple/Advanced split, §7 module model (extended)

### 17.1 No Simple/Advanced split

Removed. One unified listing form. No mode chooser. The old `listing-wizard.component.ts`, `service-wizard.component.ts`, `listing-create.component.ts`, `listing-simple.component.ts`, and `listing-advanced.component.ts` are all scrapped.

### 17.2 Listing Form Fields

| Field | Required | Audience | Notes |
|-------|:---:|------|-------|
| **Label** | ✅ | Servicer only | Internal reference to identify their own listing |
| **Title** | ✅ | Customer-facing | Shown on proposals, browse cards |
| **Description** | — | Servicer only | Internal notes |
| **Proposal Preset** | ✅ | Auto-accept + manual | Auto-accept fires this message; manual can load + edit it |
| **Enable Auto** | — | System | Toggle. When ON, auto-accept gates run on matching quotes |

### 17.3 Modules (min 1 required)

Each module is a priced option that maps a category question answer to a price, duration, and SKU:

| Field | Required | Description |
|-------|:---:|------|
| **Question Key** | ✅ | Which category question this module answers (e.g. `aircon_service`) |
| **Option Value** | ✅ | Which answer triggers it (e.g. `chemical_wash`) |
| **Price (RM)** | ✅ | Added to total when customer's answer matches |
| **Duration (min)** | ✅ | Added to estimated job time on match |
| **SKU** | — | Optional identifier |

When a customer's quote has `questionKey = optionValue`, that module's price + duration are included in the proposal breakdown.

### 17.4 Match Making (Three Paths)

| Path | Gate | Behavior |
|------|------|----------|
| **Broadcast** | Category match only | All servicers in same category get notification |
| **Manual accept** | Category match only | Servicer reviews, proposes manually (no Q-match check) |
| **Auto-accept** | Category + Modules Q-match + Budget + Availability + Coverage + Cap | All gates pass → auto-proposal fires with preset message + computed total |

### 17.5 Seeding Requirement

Every priced question option across all 32 categories must be covered by at least 1-3 auto-accept listings. When any customer orders any service, an auto-proposal fires. Exception: M1 (Ahmad Plumber) — manual only, no auto-accept.

See companion seeding plan: `docs/superpowers/plans/2026-06-25-sp3-seeding-coverage.md`.
