# Servicer Profile & Dispatch Initiative — Findings & Roadmap

> **Status:** 🟡 BRAINSTORM IN PROGRESS — 2026-06-12
> Started from two small requests (job-card pay method, proposal popout), which
> uncovered a wider servicer-profile / availability / dispatch restructure.
> This doc records **every issue found** + the sub-project (SP) roadmap.
> No code written yet — design phase only.

---

## Origin requests

- **Request A — job card pay method:** On the servicer/jobs pending **job card**,
  show a fixed payment-method label (cash/credit/card) beside the existing
  pay-now/pay-later badge. **Settled:** trivial fixed-display label. → folds into
  a small task, not a full SP.
- **Request B — proposal popout:** The global quick-proposal popout (`qp-expanded`
  in `shell.component.ts`) — how it presents + under what condition it fires.
  Became **SP-1**.

---

## Sub-project roadmap

| SP | Title | Status | Depends on |
|----|-------|--------|------------|
| **SP-1** | Popout firing gate | designed (answers locked) | SP-2, SP-3, categories |
| **SP-2** | `isOnline` manual availability toggle | deferred | — |
| **SP-3** | **Service listings — BIG REDESIGN** (modules library, lean listing, auto-accept, customer proposal) | **spec written** → `2026-06-12-sp3-service-listings-design.md` | SP-5 contacts |
| **SP-4** | Role switch toggle (servicer↔customer single switch) | deferred | — |
| **SP-5** | Servicer Business Profile restructure | **spec written** → `2026-06-12-sp5-servicer-business-profile-design.md` | — |
| **SP-6?** | KYC document upload UI | deferred (own SP) | — |
| **SP-7** | Deposit-page payment methods (withdrawal bank + saved card-on-file) | new, this session | SP-5 bank move |
| **CAL** | Calendar reroute (Schedule / WorkHours) | new, this session | ties SP-5 hours |

---

## SP-1 — Popout firing gate (Request B)

Current (`shell.component.ts:1762`): fires for **every** `quote.new` to any
servicer, no gating; auto-dismiss flat 60s; queue shows count but expanded only
handles first.

**Locked decisions:**
- Fire only when: servicer **online** AND **category matches** AND job **within radius**.
- Multiple quotes → **queue + count, one at a time**.
- Auto-dismiss → **keep 60s**.

**Blocked by:** availability (`isOnline` / operatingHours), per-listing radius,
category match — i.e. needs SP-5 + SP-3 data first.

---

## SP-5 — Servicer Business Profile restructure (ACTIVE)

`/servicer/account` → **single Business Profile page** (no personal tab).
Title: "Business Profile Settings". Personal info moves to the **customer account**
(servicer ↔ customer are the **same identity** — linked User by shared email,
`servicer.routes.ts:113`).

### Section layout (locked)
1. **Business Identity** — businessName, logo, bio + **Business Contacts CRUD** (new)
2. **Type of Services** — categoryId · serviceAreas · operatingHours
3. **Status** — kycStatus: Reviewing / Approved / Rejected [reason] + identity change requests
4. **Business & Tax** — entityType, regNo, taxNo, isCompany(derived) · tax config **+ calculator** (saves defaults) · invoice settings (6) · invoice preview (read-only)
5. **Withdrawal** *(renamed from "Bank")* — bankName, bankAccount
6. **Action PIN**
7. **Money** (read-only) — platform fee, penalties
8. **Danger Zone** — deactivate

### New model: `ServicerContact` (business_contacts)
`{ id, servicerId, contactPerson, number?, email?, isPrimary, visibleToCustomer }`
- **Rules:** name required · number OR email (≥1) · ≥1 per servicer, ≤10 · exactly one primary (customer-facing fallback)
- Per-contact `visibleToCustomer` **replaces** global `showEmailPublic`/`showPhonePublic`
- **Forward dep (SP-3):** service listings may only **prefill a contact from this list** — never free-type. Rationale: stop an unauthorized/random contact slipping into a buried listing unnoticed.
- **Migration:** seed existing `name/phone/email` as the first primary contact.

### Service areas UI
Input-on-top (Google Maps autodetect) + Add button, chips below:
```
[ Type a place… (Google Maps autodetect) ] [ Add ]
[ Kuala Lumpur ✕ ] [ Petaling Jaya ✕ ]
```

### Operating hours ↔ Calendar (one-way sync) — LOCKED
- Business Profile operating hours = **base template**. Saving **seeds/updates** Calendar/WorkHours.
- Calendar/WorkHours **does NOT write back** to Business Profile — it's the servicer's **per-week override** ("resting this week").
- **Service listings take no job during non-ticked hours in Calendar/WorkHours.**
- Backend already auto-flips `isOnline` from operatingHours via cron `servicer.online_sync` (`servicer.jobs.ts:57`, every 5 min; empty = always-on; manual offline resets next window).

### Other SP-5 changes
- **Delete** servicer Personal Details section (personal → customer account).
- **Customer account:** add `backupEmail` to Profile section.
- **Remove** redundant dashboard from `/servicer/jobs/history`.
- **No radius** in business profile — coverage/radius → service listings (SP-3).

### Backend work spawned by SP-5
- `ServicerContact` model + CRUD + validation; migrate existing contact.
- Deprecate `showEmailPublic`/`showPhonePublic`; public profile renders `visibleToCustomer` contacts.
- `isCompany` auto-derive on entityType save.
- `backupEmail` on customer update endpoint.
- Tax calculator persists defaults (reuses tax-config fields); invoice-preview render.
- kycStatus + reason display.

### Tab/section vs deferred
- **Deferred out of SP-5:** `isOnline` manual toggle (SP-2) · `maxAutoAccepts` + radius (SP-3 listings) · KYC doc upload (SP-6).

---

## CAL — Calendar reroute (new this session)

- Split `/servicer/calendar` → `/servicer/calendar/schedule` + `/servicer/calendar/workhours`.
- WorkHours is fed by SP-5 operating hours (one-way) and is the per-week availability override.
- **Future (after SP-5):** WorkHours ↔ service listings hook — listings honor WorkHours availability. To discuss later.

---

## SP-7 — Deposit-page payment methods (new this session)

The deposit page (`/servicer/deposit`) becomes the money / payment-methods hub.

- **Withdrawal bank** (`bankName`, `bankAccount`) — relocated here from SP-5 (UI
  move only; update endpoint + quoting gate unchanged).
- **Saved card-on-file (NEW infra):** none exists today — top-up is one-off Stripe
  Checkout; no `stripeCustomerId` / `paymentMethodId` / card fields on any model.
  Build: Stripe **Customer** per servicer + **SetupIntent** to save a card, store
  `paymentMethodId` + brand/last4/exp, list/add/remove.
  - **Behavior:** saved card supports **both** auto top-up (off-session, charges
    when balance < threshold) **and** manual top-up (on-session). **Default =
    manual**; servicer opts into auto top-up (+ threshold + amount).
- **Withdrawal bank display masking:** the withdrawal account shows
  `**** **** 2002` (last 4 only). Reuse/extend the existing `maskBankAccount` util
  (`admin.service.ts` already masks withdrawal rows). Apply on the deposit page and
  anywhere the bank account is shown.
  - **BUG (live):** the "Withdraw credit" section renders the account **unmasked** —
    `deposit.component.ts:201` outputs `{{ p.bankAccount }}` raw
    ("Withdraw to: CIMB · 7022 8841 0067"). Must mask → `**** **** 0067`.
  - **Link retarget:** `deposit.component.ts:204` "Go to Account Settings" →
    `/servicer/account`; after the bank section relocates to the deposit page,
    point it at the deposit-page bank section instead.
- **Seed (withdrawal account):** every demo account's **withdrawal bank** =
  **Public Bank**, account **6343 08 2002** (stored full, displayed masked).
  → `docs/ai-context/seed-plan.md` + seed data. (Card-on-file has no demo seed.)

---

## SP-3 — Service listings redesign (brainstorm, this session)

Current listing wizard (`listing-wizard.component.ts`, 4 steps) is **too complex
for new servicers** and the customer-facing proposal is too thin
(`proposals.component.ts` shows only businessName/rating/logo/message/eta/price).
Redesign **backward from the customer proposal + auto-accept**.

### Core principle — richer customer output, leaner servicer input (DERIVE, don't retype)
| Customer proposal shows | Derived from |
|---|---|
| Service title + what's included | listing title + its **modules** |
| Price breakdown | base + modules **+ tax config (business profile)** |
| Availability / ETA window | operating hours / calendar (SP-5/CAL) + duration |
| Coverage + distance | listing **radius** + servicer base location (computed) |
| Name / rating | business profile |

### One category per account
- A servicer does **one** service type. **No category picker** anywhere; listings +
  modules inherit `Servicer.categoryId` (set once, admin-reviewed in business profile).
- **Sub-category dropped** entirely.

### IA — `/servicer/services` → 2 tabs
- **`/servicer/services/listings`** — Title + [Add] · search · [Status filter] · sort + reverse · list cards.
- **`/servicer/services/module`** — Title + [Add] · search · [Taxable filter] · sort + reverse · list cards.

### Modules = reusable priced Items (NEW CRUD)
- Unifies the old "what's included" text + pricing modules + per-option matrix into
  one reusable concept.
- Module fields: **name**, **price**, SKU (optional), taxable, service-chargeable.
  Card shows "used in N listings".
- Replaces the old `PricingModule`/`moduleRefs` UX with a first-class managed library.

### Listing create — mode chooser → Simple OR Advanced
**+ Add** opens a chooser: **⚡ Simple** vs **⚙ Advanced**.

**SIMPLE — one screen, publish fast:**
- Photo (optional), title*, short desc (optional), price type, base price*, est. duration.
- **"What jobs do you want?"** — category questions shown as offered/N-A toggles
  (which job types/options the servicer will take). **No per-option pricing.**
- No modules, no auto-accept → manual quoting. Convert to Advanced anytime via Edit.

**ADVANCED — 3-step wizard:**
- Step ① **Basics** (required) — same basics fields. **Publish-now** available here.
- Step ② **Pricing & options** (optional) — Modules picker (each **included** or
  **optional add-on**; `+ New module` inline) **+** per-option pricing on the
  category questions. A listing may have **zero modules** (question-only).
- Step ③ **Auto-accept** (optional) — auto-accept toggle (4 conditions) · auto
  message. (Radius/coverage is **account-level** in the business profile, not here.)
- **Preview** = a `👁 Preview as customer` **toggle button** (overlay) available on
  any step — not a step.
- Nav: step dots **clickable + skip-ahead** once Basics is valid; **guided hints**
  per step; only Basics required.

**Cross-cutting:**
- **Question schema = "what jobs you want"** — a job-preference filter that drives
  which quotes reach the servicer + feeds auto-accept. Pricing on those options is
  **Advanced-only**.
- **Duration** — Simple carries one estimate (exact set at quote); **Advanced**
  allows **per-unit duration** that scales with quantity/option.
- **SKU** optional on **both** module and listing.

### Listings tab — card (3-line collapsed + expand)
- Collapsed (3 lines): photo · title (label) · short desc · `RM price · duration ·
  N modules · auto-accept ●` · **status toggle** (Active/Draft) · **⋯ menu**.
- **⋯ menu:** Edit · Duplicate · Activate/Deactivate · Delete.
- Expand (▾): modules (included/add-on), question schema, coverage/auto-accept,
  `Preview as customer`.

### Auto-accept engine (resolved) — ALL 4 always apply
When auto-accept is ON, **all four gates are enforced** (not individually toggleable):
1. **Budget fit** — compute total for THIS quote (base + included modules +
   question-option upcharges matching the customer's answers + flat tax; **add-ons
   excluded** — customer ticks those later). **Pass if `total ≤ quote.budgetMax`**
   (no budgetMax → passes). `priceType` hourly/quote → can't fix a total → **no auto-accept**.
2. **Availability** — `quote.preferredDate + timeSlot` is ticked-available in the
   servicer's **calendar work-hours** (live, respects per-week rest) **AND** `isOnline`.
3. **Coverage** — `haversine(serviceArea coords, quote address) ≤ account radius`
   for **any** service area. **Derives from serviceAreas coords** (no new base-pin
   field). → **Dependency:** the SP-5 serviceAreas input must store Google-Places
   **coords** (not free text); this also fixes the `quote.service.ts:108` `|| true`
   bypass.
4. **Q-match** — every customer answer maps to an option the listing marked
   **offered** (not N/A); any N-A'd option the customer picked → fail.
- **Cap:** servicer not already at `maxAutoAccepts` (**per-account**) concurrent auto-accepts.
- All pass → create proposal at computed total, `isAuto=true`. Replaces today's
  `quoteMatchesAutoAccept` + `MerchantProposalPreset` (priceOffset/message) flow
  (`quote.service.ts:353`).

### Dropped from old design
- Sub-category · two-tier quick/advanced (replaced by lean single page + separate Modules tab) · the opaque single-number proposal.

### Customer proposal view (output anchor) — `/customer/quotes/:id/proposals`
Today thin (`proposals.component.ts`: name/rating/logo/message/eta/price). Redesign:
- **List** of proposal cards · sort (price/rating/distance/recent) + reverse · filter (rating).
- **Card collapsed:** logo · businessName · ★rating(count) · auto-proposed badge ·
  **distance** · **service title** · **what's included** (from included modules) ·
  **availability/ETA window** · **total** · `View breakdown ▾` · **[Choose]**.
- **Card expanded:** itemized **breakdown** (base + included modules + question-option
  prices + service charge + SST = total) · **optional add-ons** (tickable) · message ·
  coverage summary · [Choose this servicer].
- **Optional add-ons:** customer **ticks at proposal → total recomputes** before
  choosing; selected add-ons **captured into the booking**. (Implies the proposal
  payload carries the listing's add-on modules + the booking records the selection.)
- This view is the spec for what every listing must produce (title, what's-included,
  breakdown, availability, distance).

### Pricing math (resolved) — Model B + FLAT tax
Transparent stacking; tax applied flat to the whole subtotal (tax config comes
entirely from the **business profile** — no per-line/per-option adjustment).
```
subtotal      = base + Σ included modules + Σ question-option upcharges + Σ ticked add-ons
serviceCharge = subtotal × serviceChargeRate            (business-profile rate)
sst           = (subtotal + serviceCharge) × sstRate     (only if sstRegistered)
total (tax-excl) = subtotal + serviceCharge + sst
tax-inclusive    → prices already include tax; total = subtotal; serviceCharge + sst
                   back-extracted and shown as "included" for transparency
```
- **Consequence:** under flat tax the module-level `taxable` / `serviceChargeable`
  flags are redundant → **drop them from the Module CRUD** (keep modules to: name,
  price, SKU?). Re-add only if per-line tax is ever needed.
- Add-on tick on the proposal recomputes `total` live and is captured into the booking.

### Seeding requirements (demo data — `docs/ai-context/seed-plan.md` + seed)
All new/missing content must seed so the demo shows the redesigned surfaces:
- **Business profile:** ≥1 `ServicerContact` per demo servicer (one primary,
  visibleToCustomer set) · `operatingHours` (a sane weekly template) · `categoryId`
  (already) · tax config (serviceChargeRate, sstRegistered/number, taxInclusive) ·
  invoice settings · **withdrawal bank = Public Bank `6343 08 2002`** (masked
  display) · `backupEmail` on demo users.
- **Modules (item library):** a few reusable modules per demo servicer, category-apt
  (e.g. Aircon → Chemical Wash RM30, Gas Top-up RM25).
- **Service listings:** seed **both** a Simple listing (basics + offered options, no
  modules/auto-accept) and an Advanced listing (modules incl/add-on + question-option
  pricing + radius + auto-accept on) per demo servicer, so matching + proposals +
  breakdown are exercised end-to-end.
- Ensure painting/moving/gardening (and any new categories) get demo servicers +
  listings (the existing gap: "no servicers seeded under painting/moving/gardening").

### Duration (resolved) — mirrors the price model
- **Simple:** one flat estimate.
- **Advanced:** `duration = base + Σ matched option deltas + Σ included module deltas`.
  - Number/quantity questions: **per-unit × count** (servicer sets minutes-per-unit).
  - Radio/checkbox options: flat delta per option.
  - Modules: optional duration delta (included modules add to the estimate).
  - Duration deltas sit **next to price** on each option/module in Advanced step ②.
- **Customer display:** computed **estimate + arrival window** (e.g. "~90 min ·
  today 2–4pm"); the arrival window comes from calendar work-hours.

### Coverage radius — ACCOUNT-LEVEL (overall, not per-listing)
- Radius (km) is **one overall account setting**, applied to all listings. Lives in
  the **business profile** (SP-5 Type of Services, with serviceAreas + operating
  hours) — **moves back from the listing**. Auto-accept §Coverage uses the account
  radius. (Reverses the earlier per-listing note.)
- **SP-5 impact:** radius returns to the business profile; SP-5 spec's "no radius
  here" line is superseded — add the overall radius field to Type of Services.

### Open
- Migration of existing `MerchantService.modifiers`/`moduleRefs` → new Modules library.
- `maxAutoAccepts` = **per-account** (locked); lands here as the cap on concurrent auto-accepts.

---

## Field audit — what's used vs dead (servicer account, 55 fields + User 30)

### Confirmed USED
- Bank (bankName/bankAccount) — payout + quoting gate (`servicer-quote.service.ts:23`).
- Tax config (sstRegistered, sstNumber, serviceChargeRate, taxInclusive) — invoice calc (`invoice.service.ts:55`).
- Invoice prefix/year/sep/pad — invoice-number builder (`invoice.service.ts:123`).
- serviceAreas — quote matching (but see bug below).
- bio, logo, businessName, rating, kycStatus — public profile + cards.
- operatingHours — drives auto online/offline cron (`servicer.jobs.ts`).

### Issues / dead / debt
1. **PaymentMode enum conflation** — `pay_now`/`pay_later`/`cash` in ONE field (`schema.prisma:97`); timing + method conflated. Cleaner `PaymentTiming` + `SettlementMethod` enums exist (`schema.prisma:245`) but unused.
2. **serviceAreas matching is a no-op** — `quote.service.ts:108` ends in `|| true`, so free-text area matching **always returns true** (geo gate disabled). Coordinate-style areas use haversine + a **hardcoded** `DEFAULT_SERVICE_RADIUS_KM`.
3. **Radius not per-servicer** — only the constant above. → moving to per-listing (SP-3).
4. **`isOnline` has no UI** — availability flag exists + indexed (`@@index([isOnline, isBanned])`), but no manual toggle (SP-2).
5. **`operatingHours` had no UI** — drives cron auto online/offline; editor added in SP-5.
6. **`operatingHours` vs `MerchantSchedule`** — NOT redundant: operatingHours = auto-online schedule; MerchantSchedule = booking-slot availability (calendar).
7. **`maxAutoAccepts` no UI** — auto-accept cap (default 3). → service listing (SP-3).
8. **`categoryId` no UI** — primary category not viewable/editable. → SP-5 (view/change, admin-reviewed).
9. **`isCompany` redundant** with entityType. → auto-derive.
10. **`showEmailPublic`/`showPhonePublic` dead** — saved + returned, no consumer, no UI. → replaced by per-contact `visibleToCustomer`.
11. **`invoiceContent`/`invoiceSuffix`** — stored + round-tripped, not in backend number calc; frontend-only invoice body. Keep.
12. **Business details (entityType/regNo/taxNo)** — KYC-only; not on customer invoice, not public. Kept under Business & Tax.
13. **`backupEmail` (User) no UI** — collected, never surfaced. → add to customer account.
14. **KYC document upload (`MerchantDocument`) has no servicer UI** — servicers may be unable to submit verification docs. → SP-6 (own sub-project).
15. **`Servicer.name` vs `businessName`** — two names. `name` = personal contact ("when something happens"); businessName = the customer-facing brand. Business profile = front-end; personal = back-end.
16. **Single giant account page** — `account.component.ts` ~1770 lines, 11 stacked sections, scattered order. → SP-5 restructure.
17. **Redundant dashboard in `/servicer/jobs/history`** — remove.
18. **Single PIC contact insufficient** — need multi-contact CRUD (≤10) with primary + per-contact visibility + listing-prefill enforcement. → SP-5 `ServicerContact`.

---

## Security finding (separate — automated review, 2026-06-12)

- **`pin-prompt.component.ts:19`** — `@if (false && pin.open() && pin.gateMode())`
  disables the opaque `.gate-cover`. That cover hides a real demo-gate **info
  disclosure** (new account name + credit/deposit balance visible behind the
  translucent backdrop during account-switch). The `false &&` is an **uncommitted
  in-progress repro toggle** (matching untracked `e2e/specs/demo-gate-leak.spec.ts`).
  **Action:** restore the guard before committing; **do NOT commit the `false &&`.**

---

## Open decisions still pending

- categoryId change: direct edit vs admin-reviewed request flow (TBD).
- Migration detail: how existing single name/phone/email becomes the seeded primary contact.
- SP-5 spec doc not yet written (user still refining design).
