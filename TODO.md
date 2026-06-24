# TODO — Current Project State

> **State: DEMO-FOCUSED** — 2026-06-23
> Branch: feat/sp3-dispatch-cards
> Demo script + slides: `ignorethis/demo-presentation-flow.md` (7-beat single-thread story)
>
> Rule this phase: only work items on the demo thread. Everything else is deferred.

---

## Demo thread (the one story we must nail)

Customer asks → Servicer accepts (dispatch card) → Customer pays (escrow) →
Job done (photos) → Servicer earns → Admin sees real revenue/fees.
Two centerpieces: **dispatch card** (beat 2) + **admin financial dashboard** (beat 6).

---

## DEMO-BLOCKING (do now, ranked by demo risk)

> **Spec for items 1-3 + quote images:** `docs/superpowers/specs/2026-06-23-dispatch-card-timing-urgent.md`
> (4 streams: card visual, timing rework, urgent surcharge, quote images — build top-down).
> **Plans (build in order):**
> - Plan 1 — `docs/superpowers/plans/2026-06-23-dispatch-backend-foundation.md` (schema + timing model + urgent surcharge; slot hours 9/11/13/15/17 to match UI)
> - Plan 2 — `docs/superpowers/plans/2026-06-23-dispatch-card-visual.md` (card redesign + slot-load + map deep-link + taken-status)
> - Plan 3 — `docs/superpowers/plans/2026-06-23-upload-fix-quote-images.md` (fix local-upload URL mismatch + quote images)
> - Plan 4 — `docs/superpowers/plans/2026-06-23-servicer-calendar-polish.md` (calendar already wired; coherence + polish, item S1)
> - Plan 5 — `docs/superpowers/plans/2026-06-23-customer-journey-polish.md` (C1 proposal logo ✓; C2 CORRECTED to full customer route restructure — findService/quote rename + bookings split from history ✓; C3 quote photos above Extra Details ✓)

- [ ] **1. Dispatch card spec — build top-down** (beat 2). Per the spec, in order:
  - [x] Schema migration: `QuoteRequest.isUrgent/urgentFee/images`, Booking carry-through, seed `urgent_same_day_fee` setting
  - [x] Stream B — timing rework: job datetime from `preferredDate`+bucket (morning 9 / noon 11 / afternoon 13 / evening 15 / night 17 MYT — matches UI ranges); timer = now→job time; reject past bookings; fix MYT `getUTCDay` bug; drop customer deadline picker
  - [x] Stream C — urgent same-day: admin-configurable RM150 fee (20% platform / 80% servicer), customer warning hint, line-item + escrow split, admin-dashboard urgent-fee line
  - [x] Stream A — card visual: Price→Time→Place bold hierarchy, address, `[Urgent]` tag, propertyType chip, `View on map` deep-link (Google/Waze, new tab), ▾ expander (name/avatar/answers/notes). Frontend-only. File: `frontend/src/app/servicer/pages/incoming-quotes.component.ts`
  - [ ] Tier 2 (optional): OSM mini-map in expander if `lat/lng` seeded
- [x] **2. Auto-accept wiring** (beat 2) — wire `evaluateAutoAcceptGates` into the live
  flow; listing preview endpoint. (SP3 work-stream B; MYT bug fixed in item 1)
- [x] **3. Escrow integrity** (beat 3/6) — write `escrow_hold` at payment time; derive
  amount server-side; when accepted/final price (+ urgent fee) > escrow held → BLOCK +
  require top-up (no silent bypass); verify PI status/amount/currency before recording;
  unique constraint on `Transaction.stripePaymentIntentId`. **Verify current bypass in
  code before fixing.** ✅ Fixed 2026-06-23 (4 commits: urgent-fee line item, shortfall block, PI verification, escrow_hold for gateway)
- [x] **4. Upload fix + quote images** (beat 4 + Stream D) — route EXISTS
  (`files.routes.ts:35` `PUT /local-upload/:fileId`); real bug = URL mismatch:
  `file.service.ts:75` emits `/api/v1/files/local-upload/{file.id}` vs `s3.ts:31`
  `/api/files/local-upload/{key}`; route mounted at `/files`. Verify mount base, align
  the emitters, then reuse for customer quote images (schema `images[]` in item 1, form
  upload, card thumbnails).
- [x] **5. Chat-assisted quote flow** (beat 1) — smooth submission via demo button.
- [x] **6. Admin dashboard redesign** (beat 6) — revenue/fee/escrow cards + 30-day
  line chart from the real transaction ledger (not stubbed); category breakdown; urgent-fee
  line; quick links; date range. Spec: `docs/superpowers/specs/2026-06-23-admin-dashboard-financial-redesign.md`.
- [ ] **7. Live dispatch overlay — VERIFY for demo** (beat 2, demo-critical) — the
  real-time order-accept flow: a quote rotates to servicers one at a time and pops the
  **accept-now overlay** with a countdown. Built (`backend/src/services/dispatch.service.ts`
  `startDispatchRotation`, `dispatch.jobs.ts`, `frontend/.../shared/dispatch-overlay.component.ts`,
  `dispatch-prompt-guard.component.ts`; specs `2026-05-28-dispatch-overlay.md`,
  `2026-05-30-live-order-accept-dispatch-design.md`) but NOT walked end-to-end this phase.
  Verify: broadcast → overlay prompt fires live → accept/decline → next servicer on timeout
  → online/offline guard. This is the money-shot of beat 2 alongside the dispatch card.
- [ ] **8. Finance engine — proper end-to-end** (beats 3/6, demo-critical) — verify the
  whole money path reconciles with REAL numbers for the demo: `escrow_hold` at payment →
  `escrow_release` + platform fee on completion → urgent-fee 20/80 split → all surfacing
  correctly on the admin dashboard. Items 3 (escrow integrity) + 6 (dashboard) are the
  pieces; this is the end-to-end reconciliation check. Full Wallet/Fee-engine build = STRETCH.

### Servicer journey polish (beats 2/5 — added 2026-06-23)

- [x] **S1. Servicer calendar wired** (demo headline) — `calendar.component.ts` shows
  the servicer's confirmed/in-progress bookings by date + slot. Must agree with the
  dispatch-card slot-load badge (same source): accepting a job appears on the calendar;
  the calendar is how the servicer sees "what's already in this slot". Wire data + nice
  layout (day/week, slot rows). Likely its own plan (Plan 4).

### Customer journey polish (beats 1/3 — added 2026-06-23)

- [x] **C1. Proposal cards show servicer image** (beat 3) — `proposals.component.ts`
  has `servicer.logoUrl?` (line 15) but template renders only the name (lines 76/110),
  no `<img>`. Add servicer logo/avatar to each proposal card. Verify the proposals API
  actually sends `logoUrl` (fallback to initials/placeholder when null).
- [x] **C2. Customer route restructure** (corrected 2026-06-23 — first attempt merged
  everything into one Order History, which was wrong). Target tree: `/customer/findService`
  (rename from browse `''`), `/customer/quote` (rename from `quote/new`), `/customer/quotes`,
  `/customer/bookings/{upcoming,inProgress}` (active — SEPARATE from history),
  `/customer/history` (past, with "Rebook this servicer"), `/customer/transactions`,
  `/rewards`, `/notifications`, `/account`. Full path rename WITH redirects from old paths.
  See Plan 5 Task 3 (revised). ✅ Fixed 2026-06-24 (2 nav items, context-aware tabs, redirects)
- [x] **C3. Quote photos above Extra Details** — move the quote-form "Add photos" upload
  block above the "Extra Details:" label on the first page. Plan 5 Task 4. ✅ Already in correct order in source; ticked

---

## STRETCH (after the demo thread holds)

- [ ] Full fintech P1-P5 — Wallet model, Fee engine, Payment methods, Escrow automation,
  Reporting. (demo needs items 3 + 6 + 8 only; full Wallet/Fee-engine build deferred here)

---

## DEFERRED (off the demo thread — do not touch this phase)

- [ ] SP-3 work-streams A/C/E/F (schema rework, proposal redesign, module migration, tests)
- [ ] Route redesign (nest admin/customer routes); fix remaining dead links
- [ ] Customer rewards / deposit-credit promotions
- [ ] Admin banned-accounts, deactivate-account, customer search/filter
- [ ] Forgot-password, settings refinements, PIN-registration settings
- [ ] Cancel reason presets; form validation UX on all forms; admin footer wiring
- [ ] No servicers seeded for painting/moving/gardening (browse shows 0)
- [ ] CI/CD: set Meta WhatsApp secrets, delete old security.yml/ci.yml
- [ ] IDOR audit on :id routes; Decimal-as-string coercion; global-search fields
- [ ] QA harness follow-ups; re-seed + backfill-translations; FAQ knowledge base
- [ ] Customer Support role (schema + middleware + portal)
- [ ] **Servicer report button** (Active + History + dispatch overlay) — report a customer/job
- [ ] **Admin reports list polish** — card rendering, category data, notifications
- [ ] **Post-rename link sweep** — after the customer route rename (findService/quote, bookings/upcoming),
  audit backend notification `linkUrl` emitters + Stripe return URLs (old `/bookings/active`,
  `/customer/quote/new`) → repoint to new routes. Redirects cover most, but emitters should be clean.
- [ ] **Notification service route emitters** — linkReorder, linkUrl correctness across all emitters
- [ ] **Servicer dashboard quickLinks fix**
- [ ] **Chat AI prompt route updates** + fix dead links (/customer/chat, /contact, /admin/dashboard)
- [ ] **Code simplifier tracking** (TODO-CS.md, session log, Playwright spec)
- [ ] **Prose hallucination in QA harness** (needs log to reproduce)
- [ ] **routeFor() relative-path guard** (defense-in-depth)

---

## Done recent (context)

**Payment & credit** — bookingId optional, proposal payment radios removed, top-up
unconditional, adjustCredit throws, quote cancel with reason+PIN, offline toast suppressed
**Proposal card** — budget/schedule/breakdown/map, dismiss uses collapseExpanded, countdown
hidden after respond, notification linkUrls fixed
**Admin pages** — category chips+dropdown, dashboard date modes+Prisma groupBy,
/admin/users/{all,servicers} routes, reports tab
**Servicer pages** — widths tuned, pricing options in listing, form placeholders
**Modals** — page-level hand-rolled modals migrated to top-layer `<app-modal>`
