# Category Settings — Admin restructure, Question Schema editor & Category CRUD

**Date:** 2026-05-30
**Status:** Design approved (SP1 in flight, SP2 detailed below, SP3 sketched)
**Scope:** Admin portal + backend category endpoints + form consumers

---

## Problem

Service listings are clunky and hard to modify. Each category should carry its own
"adjustment questions", but today those questions (`Category.questionSchema`) are
**seed-only / DB-edited** — there is no admin UI. Adding or changing a category's
questions requires a developer to edit JSONB by hand. Admin category config is also
scattered (budget ranges + time slots buried under "Financial Settings"; categories
themselves cannot be created/edited in the UI at all).

## Background — how `questionSchema` works today

`Category.questionSchema` (JSONB, [schema.prisma:636](../../backend/prisma/schema.prisma))
is an array of `{ key, label, type:'checkbox'|'radio'|'text', required?, description?,
priced?, options?:[{value,label}] }`. One schema per category. Three consumers:

1. **Customer quote form** ([quote-form.component.ts](../../frontend/src/app/customer/pages/quote-form.component.ts))
   — the Details step. Answers attach to the QuoteRequest.
2. **Servicer listing pricing grid** ([services.component.ts](../../frontend/src/app/servicer/pages/services.component.ts))
   — questions with `priced:true` become the per-option price grid; servicer prices each
   option, stored in `MerchantService.modifiers` (keyed by question `key` → option `value`).
3. **Backend** — `servicer-quote.service.ts` computes quote prices; `json-schemas.ts`
   validates the `modifiers` shape against the schema.

There is **no Zod validator for `questionSchema` itself** today (only seed writes it).

## Decomposition

Three independent, shippable sub-projects:

- **SP1 — Admin nav split + reorg** (frontend only). *In progress.*
- **SP2 — Category Settings master-detail: Category CRUD + Question Schema editor** (full-stack). *Detailed here.*
- **SP3 — Servicer new-listing flow cleanup** (frontend). *Sketched; next after SP2.*

---

## SP1 — Admin nav split + reorg (in flight)

Frontend only, no backend. Splits the live "Financial Settings" page.

- **Financial Settings** (keep `/admin/money-settings`, keep title): tabs **Pricing | Rewards | Servicer Rules**. Servicer Rules promoted from card to its own tab (no chip toolbar). Pricing + Rewards unchanged.
- **Category Settings** (new page `/admin/category-settings`): initial tabs **Question Schema (placeholder) | Budget Ranges | Time Slots**, moved out of Financial Settings.
- New nav item "Category Settings" after Financial Settings; existing icon from the icon set.

> Note: SP2 reshapes this page from tabs into a master-detail layout (below). Budget
> Ranges + Time Slots fold into the per-category detail editor. SP1's tab layout is a
> stepping stone, intentionally superseded by SP2.

---

## SP2 — Category Settings: master-detail (detailed design)

### Layout — searchable category list + detail editor

Category Settings leads with a **searchable category list** + a full **search / filter /
sort** toolbar (§7.15 shared `ListToolbarComponent`):

- **Search** — by category name.
- **Sort** — name A-Z / Z-A; **# active listings** (popular first, needs backend count).
- **Filters (chips)** — has questions vs empty; active vs soft-deleted; top-level vs
  sub-category; **published vs unpublished**.

Each row: category name (+ icon/meta) with **Edit** and **Delete** at the row end.
A **"+ New category"** action creates one.

**Edit / New** opens a **wide modal** (matches the app modal pattern) with section-tabs for
that single category:

1. **Basics** — name, slug (editable on create only), icon (from icon set), image URL,
   default price suggestion, default estimated duration, **published toggle**.
2. **Question Schema** — list of questions with **drag-and-drop reorder** (`@angular/cdk`).
   Add/Edit question: label, type, required, priced, description, options. Options are a
   nested list with drag-drop reorder + per-option deactivate. `key` and option `value`
   are shown **read-only after first save**. An **active toggle** soft-deactivates.
3. **Budget Ranges** — per-category brackets (logic ported from SP1 / money-settings).
4. **Time Slots** — allowed slots toggles (logic ported from SP1 / money-settings).
5. **Sub-categories** — CRUD child categories under this one (uses existing
   `parentCategoryId` hierarchy). Replaces servicers creating subcats ad-hoc in the listing
   form. Reuses the same POST/PATCH/DELETE category endpoints, scoped to children.
6. **Thumbnail / imagery** — home-page card photo + banner + color wash (§16 thumbnail
   cards). Needs new fields `Category.bannerUrl String?` + `cardColor String?` (image URL
   already exists; reuse for the card photo).
7. **Customer-facing copy** — category description/blurb shown on browse. Needs new field
   `Category.description String?`.
8. **Dispatch defaults** *(SP4 stub)* — per-category override of the order-accept prompt
   timeout + matching defaults. Placeholder tab now; wired when SP4 lands (field e.g.
   `dispatchPromptTimeoutSeconds Int?` added with SP4).

**Delete** soft-deletes the category (backend-guarded — see below).

> **Schema additions this brings:** `published` (Boolean, §Backend), `bannerUrl`,
> `cardColor`, `description`. One `db push` + client regen covers them. `dispatchPromptTimeoutSeconds`
> deferred to SP4.

> **Sizing note:** with 8 tabs + CRUD + question editor + 4 new fields, SP2 is large. Build
> in two phases: **SP2a** = Category CRUD + Basics + published + Question Schema editor +
> Budget + Time Slots (the core, supersedes SP1); **SP2b** = Sub-categories + Thumbnail +
> Copy tabs + Dispatch stub. SP2a is the must-have; SP2b is additive and can ship after.

### Data model — JSONB shape extension (backward compatible)

```ts
// Category.questionSchema entry
{
  key: string,                 // slug of label, generated on create, IMMUTABLE after save
  label: string,               // editable
  type: 'checkbox' | 'radio' | 'text',
  required?: boolean,
  priced?: boolean,
  description?: string,
  sortOrder?: number,          // drag-drop order
  active?: boolean,            // default true; false = soft-deactivated
  options?: Array<{
    value: string,             // slug of label, generated on create, IMMUTABLE after save
    label: string,             // editable
    sortOrder?: number,
    active?: boolean,          // default true
  }>
}
```

`active` defaults to `true` when absent (existing seeded schemas stay valid untouched).

### Integrity policy — keys immutable + soft-deactivate (DECIDED)

`MerchantService.modifiers` and customer quote answers are keyed by question `key` /
option `value`. To prevent silent orphaning:

- `key` and option `value` are **locked after first save**. Generated as a slug of the
  label on creation. Labels remain freely editable.
- "Removing" a question or option = set `active:false` (hidden from new forms, existing
  data preserved). No hard deletes of keys/values.
- **Backend enforces immutability**: `PATCH` compares the incoming schema against the
  stored row and **rejects** any payload that renames or drops an existing `key` or
  option `value`. (Adding new questions/options and editing labels/flags/active is allowed.)

### Priced-flag flip — allow + warn (DECIDED)

Flipping a question's `priced` flag is permitted even when listings exist, but the editor
shows an impact warning first (via the impact endpoint below):
- `priced → unpriced`: existing `modifiers` data for that key becomes dead (preserved, unused).
- `unpriced → priced`: existing listings have no per-option prices; treated as base price
  until the servicer edits.

### Backend endpoints

- **Schema change** — add `Category.published Boolean @default(false)`. `db push` +
  regenerate client (per CLAUDE.md workflow). Unpublished = admin-only draft, hidden from
  customers + servicer listing creation.
- **`PATCH /admin/categories/:id`** — extend to accept `questionSchema` (new Zod-validated,
  immutability-checked), `name`, `icon`, `defaultPriceSuggestion`,
  `defaultEstimatedDurationMinutes`, `published`. PIN-gated, audited (existing pattern at
  [admin.routes.ts:252](../../backend/src/routes/admin.routes.ts)).
- **`POST /admin/categories`** — create: name, slug, icon, imageUrl, parentCategoryId?,
  defaults, empty `questionSchema`, default `allowedTimeSlots`, `published: false`. PIN-gated, audited.
- **`GET /categories`** — return per-category **active-listing count** (for the # listings
  sort) + `published` flag. Public/customer callers get **published categories only**;
  admin gets all.
- **`DELETE /admin/categories/:id`** — soft-delete (`deletedAt`). **Block** when active
  `MerchantService` or open `QuoteRequest` exist in the category; return a clear error.
- **`GET /admin/categories/:id/question-impact?key=…`** — count of listings whose
  `modifiers` reference the key. Powers deactivate + priced-flip warnings.

### Validation (security-notes §4)

Add `questionSchemaSchema` (Zod) to [json-schemas.ts](../../backend/src/lib/json-schemas.ts).
All `questionSchema` writes validate against it before save. The immutability check runs
after schema validation, comparing to the current persisted value.

### Consumer changes — respect `active`

New-form consumers filter to `active !== false` (inactive questions/options stay readable
for existing data, just not offered on new forms):

- Customer quote form ([quote-form.component.ts](../../frontend/src/app/customer/pages/quote-form.component.ts))
- Servicer listing pricing grid ([services.component.ts](../../frontend/src/app/servicer/pages/services.component.ts))
- Backend `servicer-quote.service.ts` price calculation

**Plus `published`:** customer browse/quote + servicer listing creation must show
**published categories only**. Unpublished categories are admin-draft (visible in admin
Category Settings, hidden everywhere else).

### New dependency

`@angular/cdk@^17` (drag-drop module), version-matched to Angular 17.3. Record in
`tech-stack.md`.

### Docs to update (same session as code)

- `docs/ai-context/schema-notes.md` — questionSchema shape + `active`, soft-delete note.
- `docs/api-reference/api-doc.md` — new/changed category endpoints.
- `docs/ai-context/tech-stack.md` — `@angular/cdk`.
- `TODO.md` — task state.

---

## SP3 — Servicer new/edit listing flow cleanup (full design)

Rework the "haywired clunky" listing form ([services.component.ts](../../frontend/src/app/servicer/pages/services.component.ts))
— today one big modal with 3 collapsible sections. Fixes all four pains the user named:
giant modal, confusing priced grid, hard edits, too much up front.

### Container — full-page route (DECIDED)

Move off the modal to dedicated routes `/servicer/services/new` and
`/servicer/services/:id/edit`. Full-screen wizard, room for the pricing grid + modules,
cleaner edit URLs, matches the customer quote flow (already a routed page wizard).

### Flow — 4-step wizard

1. **Basics** *(required — only step needed to save)* — subcategory, title, SKU,
   description, base price, price type, duration.
2. **Service options & pricing** — priced-question grid driven by the category's **active**
   questions (post-SP2). Per question: option rows with price input + "I don't offer this"
   toggle, base price shown as context. Empty state when the category has no priced questions.
3. **Modules & tax** *(advanced, optional, collapsed)* — module library + per-listing
   tax/SST/service-charge overrides, all defaulting to "Account default".
4. **Accept mode** *(replaces the old "Auto-accept" step — links to SP4)* — choose how
   orders are handled for this listing: **Prompt me (default)** = real-time accept/decline
   prompt when available (SP4); or **Instant auto-accept (no prompt)** = opt-in hands-off
   matching (current behavior). Auto-accept conditions (budget/slot) shown only when
   instant mode is selected.

### Progressive disclosure + defaults

- Only Basics required; **Save available after Step 1**.
- Safe defaults everywhere (tax = account default, no modules, accept mode = prompt).
- Advanced tax/SST/service-charge collapsed unless opened.

### Priced grid redesign

- One clean card per active priced question; option rows = `price input` + `N/A toggle`,
  base price as hint.
- Respect SP2 `active`: inactive questions/options hidden for new pricing, but a listing
  that already priced a now-inactive option shows it greyed ("no longer offered by this
  category") so nothing silently vanishes.

### Edit ergonomics

- Edit reuses the wizard, pre-filled, with steps as **free-nav tabs** (jump to any step).
- Save enabled anytime; unsaved-changes guard.

### Backend

Mostly frontend. Optional: consolidate the current two-call save (service save, then
separate auto-accept PATCH) into one body. Not required for SP3.

### Sequencing

After SP2 (clean questions), but the wizard refactor can start in parallel.

---

## Out of scope / deferred

- **Legacy `settings.component.ts`** ("Platform settings", `/admin/settings`, not in nav):
  holds unique tabs not covered by money-settings — **location/postcode directory,
  thumbnails, banned words, promotions**. Do NOT retire blindly. Decision: investigate and
  rehome those before any removal; handle as a separate cleanup task.
- Schema versioning of questionSchema (rejected as overkill; immutable-keys covers integrity).
- Category hierarchy/parent editing beyond create-time parent selection.

## Open questions

- None blocking SP2. SP3 needs its own design pass.
