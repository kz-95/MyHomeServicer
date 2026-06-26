# TODO - Current Project State

> **State: DEMO-FOCUSED - SP-3 REDESIGN + ADMIN DASHBOARD + UX POLISH** - 2026-06-26
> Branch: feat/admin-fix (from master, which contains feat/ux-polish merge)
> Demo script + slides: `ignorethis/demo-presentation-flow.md` (7-beat single-thread story)
>
> Rule this phase: only work items on the demo thread. Everything else is deferred.
>
> ### ✅ DONE — Seed Consolidation + Dashboard Wiring + UX Polish (2026-06-25/26)
> - [x] SP-3 modules merged into seed.ts (single `npm run seed`, all 34 categories)
> - [x] OptionValue mismatches fixed + missing priced-question ModuleDefs added
> - [x] All field gaps filled (lineItems, operatingHours, avatars, coords, labels, notes, radius, payment)
> - [x] Escrow rows + escrow_hold bookingId + platform_fee distributed + urgent bookings
> - [x] Revenue query: SUM(urgent_fee) → SUM(booking.price)
> - [x] Customer address coords via areaCoords, quotes inherit from address
> - [x] Tamarind Square → Tamarind Suites
> - [x] Dashboard full rewrite: 7 collapsible sections → 4-card financial row (Cashflow IN/OUT/GROSS) → sortable headers → search filter → Q1-Q4 buttons → chart filter pills → leaderboards → (?) tooltips
> - [x] Backend APIs: dailyEscrow, dailyPayouts, customerLeaderboard, servicerLeaderboard, totalBookingRevenue, totalPayouts, totalWithdrawals
> - [x] 90-day seed data with today (day 0) completions + future confirmed bookings
> - [x] 124 customer accounts (9 demo + 105 servicer-paired + 10 guest)
> - [x] High-ticket pricing (renovation 30k-120k, event 1.2k-25k, ID 4k-20k, catering 500-4k)
> - [x] Google Maps + Waze brand SVGs (simple-icons), emoji→app-icon
> - [x] Platform fee: 20% with breakdown (Marketing 5%, Rewards 8%, Ops 4%, Margin 3%)
> - [x] Servicer contact visibility: checkboxes in account page → customer sees in booking card
> - [x] Payment: settlementMethod always explicit (no skipCreditCheck anti-pattern)
> - [x] Admin dashboard: sortable tables + search filter + Q1-Q4 + cashflow cards
> - [x] Money settings: +Add buttons on right side of tier/reward titles
> - [x] Helmet CSP: maps.googleapis.com allowed
> - [x] Prisma seed config: && fix on Windows
> - [x] All docs synced: README, seed-plan, schema-notes, INSTRUCTIONS, PRODUCTION-GO-LIVE, spec, admin-account.md
> - [x] Security coding styles doc: ignorethis/SECURITY-CODING-STYLES.md (8 anti-pattern rules)
> - [x] Post-mortem: docs/ai-context/archive/POSTMORTEM-2026-06-25.md (14 mistakes catalogued)
> - [x] Git: squashed → merged to master → new feat/admin-fix branch
>
> ### ✅ DONE — Admin Dashboard Polish + Rewards Seed (2026-06-26)
> - [x] Sticky toolbar: 2-tone sections (A/B), edge-to-edge with CSS variables
> - [x] Category marquee: 2 rows (parents + children), draggable, hidden scrollbar
> - [x] Sub-category filter: hides children when parent selected
> - [x] Section filter pills: All/Queues/Cards/Chart/Breakdown/Customers/Servicers
> - [x] Date controls moved to section pills row (right-aligned, single row, no-wrap)
> - [x] Q1-Q4 highlight fixed (string dates, no UTC shift)
> - [x] Cashflow card: IN (orange), OUT (red), GROSS (green/neg red), Cashflow (white/neg red)
> - [x] Revenue card: Fees/Top-ups (green), Discounts/Rewards/Gateway (red)
> - [x] Chart.js: 7 interactive charts + dark mode theme + daily/cumulative toggle
> - [x] Donut: pizza % labels + metric dropdown + legend + 3-column layout
> - [x] Chart lines: 1px, 500px height
> - [x] (?) tooltips: every metric label + sub-line with native title
> - [x] sampleAnswers updated for all 34 categories with 2-3 variants
> - [x] Rewards seed: C_LOYAL2/3 with 2800pts + 2 redemptions, C_ACTIVE2/3 with 1250pts
> - [x] ignorethis/ docs: SECURITY-CODING-STYLES, POSTMORTEM, CHARTJS-UPGRADE-PROPOSAL, AUDIT
> - [x] Admin account doc: docs/ai-context/admin-account.md
>
> ### ✅ DONE — Seed createdAt Date Spread Fix (2026-06-26)
> - [x] Root cause: all seed bookings had `createdAt = now()` — admin dashboard `b.created_at >= $1` filter excluded all bookings if seed >30 days old
> - [x] Fix: `makeBooking()` accepts `createdAt` in opts; bulk completed bookings pass `createdAt: sched` spread across 90 days
> - [x] Commit `ef6d503` — after reseed, `categoryBreakdown`, `customerLeaderboard`, `totalBookingRevenue` show real non-zero data
>
> ### PENDING - Discount/Graph
> - [ ] Per-category discount/promo/points/gateway data in backend (GROUP BY category_id)
> - [ ] Wire to donut "Show by" dropdown + chart discount line
>
> ### ✅ DONE — Servicer +New Order + GPS Verification (2026-06-26)
> - [x] Backend: `POST /servicer/new-order` endpoint with dual-mode (broadcast/direct) — `servicer-order.service.ts`
> - [x] Backend: `BookingLocationLog` model + migration `20260626065510_add_booking_location_log`
> - [x] Backend: `gps-verification.service.ts` — `isWithinRadius()`, `logArrivalLocation()`, `logDoneLocation()`
> - [x] Backend: arrive/done endpoints accept optional `{ lat, lng, accuracy }` — verifies within 500m/1km radius
> - [x] Frontend: `navigator.geolocation.getCurrentPosition()` wired into arrive/done flow in `jobs.component.ts`
> - [x] Frontend: graceful fallback if GPS denied — proceeds without coords
> - [x] Demobar: `+ New Order` button already wired to `POST /dev/random-order` (random customer → current servicer)
> - [x] Zen customer seeded: `zen@demo.local / Demo@2026`, leak repair booking with Ahmad Plumbing
> - [x] Both backend + frontend typecheck pass (zero errors)

---

## Demo thread (the one story we must nail)

Customer asks → Servicer accepts (dispatch card) → Customer pays (escrow) →
Job done (photos) → Servicer earns → Admin sees real revenue/fees.
Two centerpieces: **dispatch card** (beat 2) + **admin financial dashboard** (beat 6).

---

## DEMO-BLOCKING (do now, ranked by demo risk)

> **Dashboard spec:** `docs/superpowers/specs/2026-06-23-admin-dashboard-financial-redesign.md`

- [x] **D1. Seed Escrow rows** ✅
- [x] **D2. escrow_hold txs get bookingId** ✅
- [x] **D3. Distribute platform_fee txs across categories** ✅
- [x] **D4. Seed urgent bookings + urgent_fee txs** ✅
- [x] **D5. Fix "Revenue" query from SUM(urgent_fee) → SUM(booking.price)** ✅
- [x] **D6. Extend servicer schedule seed to M97-M105** ✅

> **Spec for items 1-3 + quote images:** `docs/superpowers/specs/2026-06-23-dispatch-card-timing-urgent.md`
> (4 streams: card visual, timing rework, urgent surcharge, quote images - build top-down).
> **Plans (build in order):**
> - Plan 1 - `docs/superpowers/plans/2026-06-23-dispatch-backend-foundation.md` (schema + timing model + urgent surcharge; slot hours 9/11/13/15/17 to match UI)
> - Plan 2 - `docs/superpowers/plans/2026-06-23-dispatch-card-visual.md` (card redesign + slot-load + map deep-link + taken-status)
> - Plan 3 - `docs/superpowers/plans/2026-06-23-upload-fix-quote-images.md` (fix local-upload URL mismatch + quote images)
> - Plan 4 - `docs/superpowers/plans/2026-06-23-servicer-calendar-polish.md` (calendar already wired; coherence + polish, item S1)
> - Plan 5 - `docs/superpowers/plans/2026-06-23-customer-journey-polish.md` (C1 proposal logo ✓; C2 CORRECTED to full customer route restructure - findService/quote rename + bookings split from history ✓; C3 quote photos above Extra Details ✓)

- [ ] **1. Dispatch card spec - build top-down** (beat 2). Per the spec, in order:
  - [x] Schema migration: `QuoteRequest.isUrgent/urgentFee/images`, Booking carry-through, seed `urgent_same_day_fee` setting
  - [x] Stream B - timing rework: job datetime from `preferredDate`+bucket (morning 9 / noon 11 / afternoon 13 / evening 15 / night 17 MYT - matches UI ranges); timer = now→job time; reject past bookings; fix MYT `getUTCDay` bug; drop customer deadline picker
  - [x] Stream C - urgent same-day: admin-configurable RM150 fee (20% platform / 80% servicer), customer warning hint, line-item + escrow split, admin-dashboard urgent-fee line
  - [x] Stream A - card visual: Price→Time→Place bold hierarchy, address, `[Urgent]` tag, propertyType chip, `View on map` deep-link (Google/Waze, new tab), ▾ expander (name/avatar/answers/notes). Frontend-only. File: `frontend/src/app/servicer/pages/incoming-quotes.component.ts`
  - [~] Tier 2 OSM mini-map - skipped; Google Maps deep-link covers demo need
- [x] **2. Auto-accept wiring** (beat 2) - wire `evaluateAutoAcceptGates` into the live
  flow; listing preview endpoint. (SP3 work-stream B; MYT bug fixed in item 1)
- [x] **3. Escrow integrity** (beat 3/6) - write `escrow_hold` at payment time; derive
  amount server-side; when accepted/final price (+ urgent fee) > escrow held → BLOCK +
  require top-up (no silent bypass); verify PI status/amount/currency before recording;
  unique constraint on `Transaction.stripePaymentIntentId`. **Verify current bypass in
  code before fixing.** ✅ Fixed 2026-06-23 (4 commits: urgent-fee line item, shortfall block, PI verification, escrow_hold for gateway)
- [x] **4. Upload fix + quote images** (beat 4 + Stream D) - route EXISTS
  (`files.routes.ts:35` `PUT /local-upload/:fileId`); real bug = URL mismatch:
  `file.service.ts:75` emits `/api/v1/files/local-upload/{file.id}` vs `s3.ts:31`
  `/api/files/local-upload/{key}`; route mounted at `/files`. Verify mount base, align
  the emitters, then reuse for customer quote images (schema `images[]` in item 1, form
  upload, card thumbnails).
- [x] **5. Chat-assisted quote flow** (beat 1) - smooth submission via demo button.
- [x] **6. Admin dashboard redesign** (beat 6) - revenue/fee/escrow cards + 30-day
  line chart from the real transaction ledger (not stubbed); category breakdown; urgent-fee
  line; quick links; date range. Spec: `docs/superpowers/specs/2026-06-23-admin-dashboard-financial-redesign.md`.
- [x] **7. Live dispatch overlay - VERIFIED** (beat 2, demo-critical) - structural
  code-path verification pass completed 2026-06-24 (Task 7-QA). All 7 tests PASS:
  quote→dispatch rotation, servicer prompt with overlay UI, accept→booking,
  decline→rotation, timeout→auto-decline, offline exclusion, working-hours gating.
   Two low-severity polish gaps filed and fixed:
   - [x] 🟢 **QA-001** (LOW) - Frontend countdown hardcoded to 10s. `dispatch.prompt` socket payload omits `timeoutSeconds`. → ✅ Fixed `777cffb` (backend + frontend sync).
   - [x] 🟢 **QA-002** (LOW) - No per-servicer skip log. → ✅ Fixed `3e558d9` (logger.info for offline and out-of-hours).
- [x] **8. Finance engine - proper end-to-end** (beats 3/6, demo-critical) - verify the
  whole money path reconciles with REAL numbers for the demo: `escrow_hold` at payment →
  `escrow_release` + platform fee on completion → urgent-fee 20/80 split → all surfacing
  correctly on the admin dashboard. Items 3 (escrow integrity) + 6 (dashboard) are the
  pieces; this is the end-to-end reconciliation check. Full Wallet/Fee-engine build = STRETCH.
  **FINDINGS from 2026-06-24 verification - ALL FIXED 2026-06-24 (11 commits):**
  - [x] 🔴 **QA-005** - `handleDispatchAccept()` creates Booking without escrow/payment. → ✅ Fixed `0ea3dbd` (mirrored selectProposal payment logic).
  - [x] 🟡 **QA-003** - Platform fee double-recorded per pay_now booking. → ✅ Fixed `18b17cc` (removed booking-time reserve).
  - [x] 🟡 **QA-004** - `splitUrgentFee()` never called. → ✅ Fixed `8cb084d` (wired into escrow release + separate urgent_fee transaction).
  - [x] 🔴 **BE-007** - Service-area filter neutered by `|| true`. → ✅ Fixed `1d58af0` (removed `|| true`).
  - [x] 🔴 **BE-001** - AI receives "[object Promise]". → ✅ Fixed `c094f18` (added await).
  - [x] 🔴 **BE-008** - Double-refund in `quote.no_response`. → ✅ Fixed `75e008c` ($transaction + idempotency guard).
  - [x] 🔴 **BE-011** - No-show counter outside `$transaction`. → ✅ Fixed `e04b29d` (moved inside $transaction).
  - [x] 🟡 **BE-013** - Demo-login accepts arbitrary email. → ✅ Fixed `5379ff0` (locked to DEMO_ACCOUNTS map).
  - ⚠ **BE-013 regression:** `5379ff0` over-hardened - broke all email-based demo logins (80+ accounts). Frontend sends `{ email }` but backend only read `role`. → ✅ Fixed (accept both `role` + `email`; email gated to `@demo.local` domain).
  - [x] 🟡 **BE-019** - Chat verify-pin token leak. → ✅ Fixed `a59ad59` (TTL + consume guard).

### Servicer journey polish (beats 2/5 - added 2026-06-23)

- [x] **S1. Servicer calendar wired** (demo headline) - `calendar.component.ts` shows
  the servicer's confirmed/in-progress bookings by date + slot. Must agree with the
  dispatch-card slot-load badge (same source): accepting a job appears on the calendar;
  the calendar is how the servicer sees "what's already in this slot". Wire data + nice
  layout (day/week, slot rows). Likely its own plan (Plan 4).
- [x] **S2. Distance in km on dispatch card** - show "~X km away" on the card face.
  Needs: (1) `lat`/`lng` on Servicer model, (2) seed coordinates, (3) backend Haversine
  calc in feed, (4) frontend render. ✅ All pieces done: schema migration + haversine lib + service wiring + seed coords via areaCoords (`f8b04c9`), frontend render (`8702a65`).

### Customer journey polish (beats 1/3 - added 2026-06-23)

- [x] **C1. Proposal cards show servicer image** (beat 3) - `proposals.component.ts`
  has `servicer.logoUrl?` (line 15) but template renders only the name (lines 76/110),
  no `<img>`. Add servicer logo/avatar to each proposal card. Verify the proposals API
  actually sends `logoUrl` (fallback to initials/placeholder when null).
- [x] **C2. Customer route restructure** (corrected 2026-06-23 - first attempt merged
  everything into one Order History, which was wrong). Target tree: `/customer/findService`
  (rename from browse `''`), `/customer/quote` (rename from `quote/new`), `/customer/quotes`,
  `/customer/bookings/{upcoming,inProgress}` (active - SEPARATE from history),
  `/customer/history` (past, with "Rebook this servicer"), `/customer/transactions`,
  `/rewards`, `/notifications`, `/account`. Full path rename WITH redirects from old paths.
  See Plan 5 Task 3 (revised). ✅ Fixed 2026-06-24 (2 nav items, context-aware tabs, redirects)
- [x] **C3. Quote photos above Extra Details** - move the quote-form "Add photos" upload
  block above the "Extra Details:" label on the first page. Plan 5 Task 4. ✅ Already in correct order in source; ticked

---

## STRETCH (after the demo thread holds)

- [x] Full fintech P1-P5 - Wallet model, Fee engine, Payment methods, Escrow automation,
  Reporting. (demo needs items 3 + 6 + 8 only; full Wallet/Fee-engine build deferred here)
  ✅ P1 (Wallet + BalanceCheckpoint models+service), P2 model (FeeRule), P3 model (SavedPaymentMethod),
  P4 model (Dispute), P5-light (CSV export endpoint) done 2026-06-24.
  ✅ P2-P4 service logic + routes completed 2026-06-24: fee-engine.service.ts with FeeRule CRUD + computeFees()
  (wired into credit.service.ts + booking.jobs.ts escrow release), saved-payment.service.ts CRUD,
  dispute.service.ts CRUD + status machine, admin dispute routes, open dispute route for customers.
- [ ] **P1 Financial Foundation (plan-eng-review + forensic audit approved)** — 18 tasks over ~8h: tip fix (payout + refund paths), urgent fee double-dip fix, platform_fee_rate default alignment, fee-engine.test.ts, unify 5 fee sites, computeFees activeFrom/activeTo fix, 4 new TransactionType enum values, gateway fee settings + txn, registered discount txn, points liability txn + fix fire-and-forget, promo payback routing fix, points config cache invalidation, evaluatePromotions tests (6-8 cases), reconciliation harness (cases 1-4,7,8), dashboard urgentFee time-anchor fix, dashboard 4 cost-line fields. Spec: `docs/superpowers/specs/2026-06-26-profit-simulator-financial.md`. Full review + audit in `docs/ai-context/logs/ceo-log.md` (Session 2026-06-26 01:02 + 01:28).

## E2E QA PIPELINE (2026-06-26)

- [x] `/e2e-fix` Kilo command — per-scenario QA→Reviewer→Roast→Debugger→Approval→Apply pipeline
- [x] `scripts/bat/auto-fix-loop.bat` — one-click launcher (Docker + deps + servers)
- [x] `tests/e2e/scripts/summarize.js` — log parser → failure-summary.json
- [x] `tests/e2e/auto-fix-loop.ps1` — fixed here-string + path resolution bugs
- [x] `scripts/bat/e2e-test-local.bat` — fixed Playwright reporter (list+html)

---

## PLATFORM POLISH

> Merged with DISCUSSED brainstorms. Duplicates collapsed; spec-linked items kept.

- [x] **SP3 listing wizard** - rework `services.component.ts` (1151-line monolith) into 4-step wizard
  (basics / pricing / tax-modules / accept), create-then-PATCH save, routes `/services/new` +
  `/:id/edit`, priced grid active-aware. ✅ Committed `4457ee5`: 4-step wizard, /services/new + /:id/edit routes.
  > **SUPERSEDED 2026-06-25** - Scrapped. New unified module-first design per spec §17.
- [ ] **SP-3 REDESIGN (2026-06-25)** - New listing form replacing simple/advanced/model-chooser.
  Spec: `docs/superpowers/specs/2026-06-12-sp3-service-listings-design.md` §17.
  - [x] Tab order: Modules first + default redirect ✅ `66b5950`
  - [x] Scrap old components: listing-wizard, service-wizard, listing-create, listing-simple, listing-advanced ✅ `cb9bd30`
  - [x] Spec update: §6 tab order, NEW §17 redesign, seeding coverage plan ✅ `66b5950` + `cb9bd30`
  - [x] Schema: add `questionKey`, `optionValue`, `durationMin` to `ServicerModule` ✅ `fca678a`
  - [x] Backend: add `label`, `proposalPreset` to `ServicerService` ✅ `fca678a`
  - [x] Build new unified listing form component ✅ `40f7ebf`
  - [x] Auto-accept engine: Q-match via modules (not modifiers) ✅ `1f526ca`
  - [x] Seed data: per-category auto-accept listings with modules (4 categories) ✅ `82486ba`
  - [x] Seed consolidated - all 34 categories with modules + matched optionValues + line items ✅ `(this commit)`
- [x] **Full SP4 live-dispatch** - real `isOnline` presence wiring; availability gating = online +
  working hours (`ServicerSchedule`); admin-configurable rotation timer; decline → rotate →
  async fallback; Google Map preview in the accept prompt.
  Spec: `2026-05-30-live-order-accept-dispatch-design.md`.
  ✅ Backend done (isOnline gate, schedule gating, configurable timer, decline→rotate, timeout→rotate, HTTP routes).
  ✅ Frontend overlay done (dispatch-prompt-guard.component.ts with native `<dialog>`, countdown, map preview, accept/decline buttons, timeout auto-decline). Verified QA 2026-06-24.
- [x] **S2. Distance in km on dispatch card** - add `lat`/`lng` to Servicer model, seed coords,
  backend Haversine calc in feed, frontend "~X km away" render. ✅ All done `f8b04c9` + `8702a65`.
- [x] **Estimated duration on dispatch card face** - show "~90 min" per quote (from listing
  prefill `estimatedDurationMin`); currently only in the propose flow. ✅ Committed `8702a65`.
- [x] **Navigation - Maps/Waze on confirmed booking** - job-detail "Open in Google Maps / Waze"
  deep-link buttons once a booking is confirmed/in_progress/completed. ✅ Servicer side already had
  Maps/Waze in Active + History tabs. Customer side added 2026-06-24 (my-bookings.component.ts:
  lat/lng/address on Booking interface, openJobMap() method, Maps + Waze link buttons for
  confirmed/in_progress/completed bookings when coordinates present).
- [x] **In-app map debug** - `app-map-view` component broken (API-key load / init timing); fix. ✅ Fixed 2026-06-24 (retry loop with existing keyRetries/KEY_RETRY_MAX, timer cleanup in ngOnDestroy)
- [x] **Route redesign + dead link sweep** - nest admin/customer routes; audit + fix backend
  notification `linkUrl` emitters + Stripe return URLs after C2 rename; servicer dashboard
  quickLinks; chat AI route updates. One pass, all dead links. ✅ Fixed 2026-06-24 (1 dead linkUrl fixed in admin.routes.ts, all 20 linkUrls + 4 Stripe URLs + 60 routerLinks + chat prompts audited)
- [x] **Customer rewards / deposit-credit promotions** ✅ Wired 2026-06-24: points engine reads admin-configurable platform settings (points_per_rm, points_per_review, welcome_points), tier bonus multiplier applied on booking completion (Silver +10%, Gold +25%, Platinum +50%), Google OAuth new customers receive welcome points, reward config keys seeded, topup_bonus added to admin CRUD validation
- [x] **Admin banned-accounts, deactivate-account, customer search/filter** ✅ Verified 2026-06-24 (BannedEmail model + migration, GET/POST/DELETE /admin/banned-emails, POST /user/me/deactivate + /servicer/me/deactivate, deactivate.service.ts with email suffix + auto-ban after 10, admin users page search/role filter, admin settings banned tab, customer/servicer Danger Zone deactivation modals)
- [x] **Forgot-password + settings refinements + PIN-registration settings** ✅ Built 2026-06-24 (forgot/reset flow already existed; added 4 PIN/password policy platform settings + security tab in admin settings + configurable cooldown middleware)
- [x] **Cancel reason presets + form validation UX + admin footer wiring** - ✅ Fixed 2026-06-24 (cancel_reasons platform setting, customer booking cancel dropdown, admin footer links)
- [~] **IDOR audit + Decimal-as-string coercion + global-search fields** ✅ Audited 2026-06-24: fixed 1 IDOR (`PUT /files/local-upload/:fileId` ownership check), Decimal serialization OK (Prisma PostgreSQL toJSON), global search exists at `/api/v1/search` with documented gaps.
- [x] **Servicer report button** - Active + History + dispatch overlay ✅ Fixed 2026-06-24 (report buttons + modals in dispatch-overlay + jobs.component)
- [x] **Admin reports list polish** - card rendering, category data, notifications ✅ Fixed 2026-06-24 (card layout + category icons + reporter info + booking context + notifyAdmins on creation + notify on resolve)
- [x] **Seed reform** - cap each servicer at 3 listings; seed painting/moving/gardening servicers;
  add profile pictures for servicers M97–M105 (currently missing avatar/logoUrl)
  ✅ Already done: all servicers ≤3 listings, M97-M105 seeded with 9 entries across painting/moving/gardening.
- [x] **Servicer shell content widths** - 720px default (`:host` on each page component), exceptions:
  - Dashboard: 900px (already had it)
  - Calendar: 1000px (already had it)
  - Shell `.content-main.narrow` uses flex center so each page's own `max-width` takes effect.
  - Pages set: Jobs, Promotions, Invoices, Deposit, Account, Services Listings, Services Modules, Listing Wizard.
  - Shared components (Notifications, Notification Settings) run full-width in the narrow container.
- [x] **routeFor() relative-path guard** (defense-in-depth)
- [ ] **Itemization** - separate "service listing" vs "itemized line items" (parts/labour). Defer
  until SP3-SP4 land.

---

## DEFERRED

- [ ] Customer Support role (schema + middleware + portal)
- [ ] Code simplifier tracking (TODO-CS.md, session log, Playwright spec)
- [ ] Prose hallucination in QA harness (needs log to reproduce)

---

## Done recent (context)

**Payment & credit** - bookingId optional, proposal payment radios removed, top-up
unconditional, adjustCredit throws, quote cancel with reason+PIN, offline toast suppressed
**Proposal card** - budget/schedule/breakdown/map, dismiss uses collapseExpanded, countdown
hidden after respond, notification linkUrls fixed
**Admin pages** - category chips+dropdown, dashboard date modes+Prisma groupBy,
/admin/users/{all,servicers} routes, reports tab
**Servicer pages** - widths tuned, pricing options in listing, form placeholders
**Modals** - page-level hand-rolled modals migrated to top-layer `<app-modal>`
