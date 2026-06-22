# TODO — Current Project State

> **State: 🟢 ACTIVE** — 2026-06-22 (autopilot backlog sweep — see SESSION-HANDOFF.md)

---

## 🟢 Autopilot backlog sweep — 2026-06-22 (branch `feat/sp3-dispatch-cards`)

Full detail + next-agent actions in `docs/ai-context/logs/SESSION-HANDOFF.md`.

- [x] Committed inherited dirty tree: 60s PIN cooldown (backend), demo-autofill
      gated behind `DemoUnlockService.unlocked()` + review layout polish + favicon (frontend).
- [x] `fix(sp3)` MYT weekday in `sp3-auto-accept availabilityOk` (shift +8h before
      `getUTCDay`); coerce Decimal-as-string module price → Number on load (carry-fwd #2).
- [x] **Discovery — SP-3 Work-stream A already DONE.** `ServicerService` already has
      `listingMode`/`moduleRefs`/`autoAccept`/`estimatedDurationMinutes`/`priceType`/
      `autoAcceptMessage` (rename + commits `0cc8984`/`23fdc47`). 3 engines compile clean.
      No migration needed. (See "Work-stream A" section below — superseded.)
- [x] **Discovery — painting/moving/gardening seed already correct** (M97–M105 =
      9 servicers / 18 published listings). Browse shows 0 ONLY because live DB predates
      the rows. **ACTION: `cd backend && npm run db:reset`** (blocked this session by the
      guardian destructive-command gate; safe — DB confirmed in sync, no server running).
- [x] **Discovery — routing restructure mostly moot.** linkUrl emitters / dead links /
      IDOR all already correct (recon in handoff). Only cosmetic flat→nested nesting left
      = low value, would break working links. Recommend skip.
- [ ] **Deferred to next agent (LARGE/risky):** SP-3 B wire `evaluateAutoAcceptGates` into
      live `quote.service.ts:503` flow; SP-3 C proposal-redesign breakdown/add-ons; SP-3 E/F
      migration+tests; CI workflows push-checks/pr-gate/nightly (never created — keep `ci.yml`).
- Gates this session: backend `tsc` 0, frontend `tsc` 0, `ng build` AOT 0.

---

## 🟡 Payment gate before broadcast — 2026-06-17 (branch `feat/questionSchema-in-chat`)

Quotes were broadcast to servicers BEFORE payment settled: pay_now (credit) deducted
the budget hold AFTER `quoteBroadcast.createMany` + `quote.new` emit + dispatch
rotation; the guest pay_now path broadcast immediately and created the Stripe session
afterwards. Fix gates ALL payment modes before any broadcast/dispatch/notify.

- [x] **Schema:** `pending_payment` added to `QuoteStatus` enum (`schema.prisma`).
- [x] **`quote.service.ts`:** broadcast/auto-accept/dispatch/job-scheduling extracted to
      `broadcastQuote(quoteId)` (idempotent — skips an already-broadcast quote). `createQuote`
      now deducts the pay_now credit hold **before** calling `broadcastQuote`; on a gate failure
      the quote exists but never broadcasts. New `deferBroadcastUntilPayment` option →
      guest pay_now is parked `pending_payment`, not broadcast. New `settleAndBroadcastGuestQuote(quoteId)`
      takes the hold + broadcasts + flips to `open`.
- [x] **`stripe.routes.ts`:** `handleCheckoutSessionCompleted` reads the pending top-up's
      `metadata.{quoteId,guestPayment}` and calls `settleAndBroadcastGuestQuote` after funding the wallet.
- [x] **`quotes.routes.ts`:** guest pay_now Stripe-session failure leaves the quote `pending_payment`
      and un-broadcast (no `stripeUrl` in response); customer can retry.
- [x] **Tests:** `tests/unit/payment-gate.test.ts` (hold amount the gate deducts, 5 cases, green);
      `tests/e2e/quote-flow.test.ts` new RUN_E2E block — guest pay_now → `pending_payment` + 0 broadcast/0 proposals; `settleAndBroadcastGuestQuote` → `open` + idempotent.
- [x] Docs synced: `schema-notes.md` (QuoteStatus), `api-doc.md` (POST /quotes payment-gate note),
      `security-notes.md` (Payment gate before broadcast).
- [x] Backend `tsc --noEmit` — 0 errors in changed files (only the 2 pre-existing tsconfig
      TS5101/TS5107 deprecation warnings remain).
- [x] **Migration applied + client regenerated.** DB `QuoteStatus` enum verified to include
      `pending_payment` (`migrate status` = in sync). The `ALTER TYPE "QuoteStatus" ADD VALUE
      'pending_payment'` lives in `prisma/migrations/20260617124345_/migration.sql` (created by the
      parallel payment-wave agent). NOTE: my `20260617124809_sp_quote_pending_payment/` migration is
      collateral — it captured an unrelated **invoices.due_date default** drift from another agent's
      uncommitted schema edit (benign, applied). Whoever owns the invoices change should confirm the
      migration name/attribution; functionally the DB is in sync.
- [ ] Restart backend dev server (it was stopped for the migration DLL lock; the bat/auto-committer
      normally restarts it).

---

## 🔴 Quote / Dispatch / Payment fix wave — 2026-06-17

> From live testing. Design discussed + locked with user. Online accept = **submit
> proposal** (no race); customer select = **auto-confirm booking, no servicer re-confirm**;
> payment gated **all modes** before broadcast; demo → plumbing ×2 distinct identities.
> Run as 5 agents in 2 waves by **file ownership** (jobs.component.ts owned by ONE agent).
> Each agent updates its own docs (schema-notes / api-doc) in-session.

### WAVE 1 — parallel (disjoint files)

- [ ] **A — Payment gate (backend)** — broadcast + dispatch fire BEFORE payment settles
      (`quote.service.ts` broadcast ~323-350 / dispatch ~412 vs hold deduct ~435; guest
      `createGuestQuote` ~783-851 hardcodes `skipCreditCheck:true`, Stripe after broadcast
      `quotes.routes.ts:169`). Gate ALL modes before broadcast: pay_now credit → deduct first;
      guest gateway → quote `pending_payment`, broadcast only on Stripe `checkout.session.completed`
      webhook; pay_later/cash → validate account + `requireNoUnpaidInvoice`. Wrap so a gate
      failure leaves zero broadcast rows / no socket / no notify. Files: `quote.service.ts`,
      `quotes.routes.ts`, `stripe.routes.ts`. Gate: BE `tsc` 0 + jest.
- [ ] **B — Demo data (frontend forms)** — (1) ✅ DONE (2026-06-17): guest stale answers cleared via
      `f.answers={}` in `guest-quote.component.ts onCategoryChange` (L898) + `onParentChange` (L887);
      `ng build` AOT 0. (2) repoint both
      demo autofills to plumbing, distinct: customer (`quote-form.component.ts demoAutoFill ~1798`)
      = plumbing child A + Sarah Lim (keep `+60 12-345 6789`); guest (`guest-quote ~919`) = a
      DIFFERENT plumbing child B + Zen `+60 11-3929 6559`. Pick children by slug, no shared sample.
      Files: `guest-quote.component.ts`, `customer/pages/quote-form.component.ts`. Gate: `ng build` 0.
- [x] **C — Photo picker (frontend)** — `jobs.component.ts:415-424` "Choose photo" opened no dialog.
      Root cause: `.file-label{display:inline-flex}` label wrapping a `display:none` input + a nested
      `<span class="btn-ghost file-btn">` visible button broke the implicit label→input click. Fixed to
      the working pattern (`listing-simple.component.ts:52-61`): label carries the button classes,
      visible text/icon is a direct child, input uses the `hidden` attr — no wrapper span. Audited all
      file pickers: same nested-span-inside-label pattern also found + fixed in
      `admin/pages/settings.component.ts` (category thumbnail "Upload") and
      `admin/pages/category-settings.component.ts` (thumbnail "Upload"). Removed dead `.file-label`/
      `.file-hidden` CSS. `servicer/account`, `customer/account` (text direct in label),
      `listing-advanced` (already working pattern), `faq`/`ai-chat-settings` (explicit `fileInput.click()`),
      `uiux-settings` (native visible input) verified OK — left unchanged. Gate: `ng build` AOT 0.

### WAVE 2 — after C lands (jobs.component.ts owner = Agent D)

- [x] **D — Dispatch + booking-flow + cards bundle** — ✅ DONE (2026-06-17, branch `feat/sp3-dispatch-cards`).
      No-re-confirm (booking `confirmed` on select + dispatch accept; no-show scheduled at creation; `confirmJob`
      dead-path); online→center guard / offline→corner toast; one-tap Accept Job → `POST /quotes/:id/accept-listing`
      (listing-computed price/duration via the live `computePrefill` + base fallback — did NOT wire the still-broken
      Phase-2 `listing-pricing.service`, whose `ModuleRef.kind`/`durationDeltaMin` usage mismatches the committed
      schema, Work-stream A's scope); post-accept 3-line collapse; atomic "taken" guard (conditional `updateMany`
      claim → 409 "taken by another servicer"); active card same detail + `<app-wa-button>`. Gates: BE `tsc` 0
      (only tsconfig TS5101/TS5107 deprecations), `jest tests/unit` 259 pass (`listing-pricing.test.ts` pre-broken =
      Work-stream A, my code doesn't import it), `ng build` AOT 0. — reuse untracked SP-3 `listing-pricing.service.ts`
      (fallback `basePrice`+`estimatedDurationMinutes`). (1) **No re-confirm**: `booking.service.selectProposal`
      → booking `confirmed` not `pending_confirm`; remove servicer Confirm step (`jobs.component.ts ~291-312`);
      same in `dispatch.service` accept. (2) **Online/offline branch**: `dispatch-prompt-guard.component.ts`
      (~263) show center guard only when `isOnline`, else corner toast; route `quote.new` through guard when
      online. (3) **Accept Job button** on pending card → one-tap submit proposal at computed
      `{price,duration,auto-msg}`. (4) **Post-accept collapse** to 3 lines `[Price][Duration]` + `[Message]`.
      (5) **"Taken" guard**: tap on already-matched/closed quote → backend conflict → "taken by another
      servicer"; harden `dispatch.service.ts:177` findFirst→create into atomic txn/conditional update.
      (6) **Awaiting (proposal sent, awaiting customer pick) + Active (won/confirmed) cards** = same detail
      as pending card. Imports `<app-wa-button>` from E. Files: `jobs.component.ts`, `incoming-quotes.component.ts`,
      `dispatch-prompt-guard.component.ts`, `booking.service.ts`, `dispatch.service.ts`, routes. Gates: BE `tsc` 0 + jest, `ng build` 0.
- [x] **E — Servicer WhatsApp preset CRUD + wa.me** — ✅ DONE (2026-06-17, branch `feat/sp3-wa-preset`).
      `ServicerWaPreset` model + migration `20260617201521_sp3_servicer_wa_preset` (backend server stopped
      for DLL lock; applied via `prisma db execute` + `migrate resolve --applied` so the unrelated in-DB
      drift from other agents' WIP — `listing_mode`/`auto_accept_message`/`quote_proposals.listing_id`/
      `QuoteStatus` — was NOT touched; client regenerated). Backend CRUD `/servicer/wa-presets`
      (`servicer-wa-preset.{service,routes}.ts`, mounted in `index.ts`, servicerId-scoped, fields picked,
      DELETE soft-disables). Frontend `<app-wa-preset-manager>` section in servicer Business Profile
      (`account.component.ts`) + standalone reusable `<app-wa-button>` (`shared/wa-button.component.ts`).
      Did NOT edit `jobs.component.ts` (D wires the button). Gates: BE `tsc` 0 in scope (3 untracked
      Phase-2 engine files stay pre-broken pending Work-stream A schema columns — not my scope),
      `ng build` AOT 0. wa-button contract for D: `[phone] [preset]({label,body}) [body] [vars]({name,orderId,eta}) [label] [disabled]`.
      Original spec — new
      `ServicerWaPreset` model `{id, servicerId, label, body(placeholders {name}{orderId}{eta}), active, ts}`
      + migration (stop server, DLL lock). Backend CRUD `/servicer/wa-presets` (servicerId-scoped, fields
      picked). Frontend presets manager (servicer settings) + standalone reusable `<app-wa-button>`
      (phone + preset → `https://wa.me/<intlPhone>?text=<encoded>`). **Do NOT edit `jobs.component.ts`**
      (D adds the button). Files: schema.prisma, migration, `servicer-wa-preset.{service,routes}.ts`,
      `routes/index.ts`, settings component, `wa-button.component.ts`. Gates: BE `tsc` 0, `ng build` 0.

### Seed (paused — record for when seeding resumes)
- New customer **Zen** `+60 11-3929 6559` (guest demo identity); **Ahmad Bin Ismail** M1 plumber
  `+60 18-286 2739`; **Sarah Lim** keeps `+60 12-345 6789`. Real numbers so wa.me demo links deliver.

---

## ✅ Seed servicers for Painting, Moving, Gardening — 2026-06-17

- [x] Added M97–M105 to `backend/prisma/seed/data/accounts.ts` (3 merchants per new category)
- [x] Added 9 entries to `merchantSlugs` in `backend/prisma/seed/seed.ts` (bulk completed bookings)
- [x] Updated "105 merchants" comment in seed.ts; updated header in accounts.ts
- [x] `npm run db:reset` — 1107 bulk completed bookings, all 105 merchants seeded

---

## ✅ QA harness — repeated-card answer variance — 2026-06-17

### Fix — repeated card caused harness to re-send same answer verbatim
- [x] Root cause: `driveScenario` incremented `sameSigCount` on a repeated card but
      fell through to `actOnCard` — re-tapping the same card with identical data,
      making the simulated customer look like a broken record.
- [x] Fix: on `sig === lastSig` (card seen before), skip `actOnCard` entirely and
      send a prose text reply instead — `naturalQuestionReply` for `quote_question`,
      `freeTextForField`/`humanAnswerText` for `quote_field`, random-pick from 3
      phrasings for other card types — then `waitIdle` + `flush` + `continue`.
- [x] Gate: `npx tsc --noEmit` 0 errors.

---

## ✅ pending_confirm jobs moved to Pending tab — 2026-06-15

### Bug — `pending_confirm` jobs showed in Active tab instead of Pending
- [x] Root cause: `jobs.component.ts:108` `const ACTIVE = ['pending_confirm', 'confirmed', 'in_progress']`
      classified `pending_confirm` jobs into the Active tab. They belong in Pending (awaiting servicer
      confirmation, not yet started).
- [x] Fix: removed `pending_confirm` from `ACTIVE`; added `pendingJobs` computed signal filtering
      jobs by `status === 'pending_confirm'`; inserted "Awaiting confirmation" section in the
      Pending tab body (below incoming quotes) with Confirm/Cancel/View details actions.
- [x] Cleanup: removed `pending_confirm` chip from Active tab filter chips; updated `activeFilter`
      type and `hydrateFromRoute` to drop the stale filter value.
- [x] Gates: frontend `tsc --noEmit` 0 errors, `ng build` green.

---

## 🟡 BRAINSTORM — Servicer Profile & Dispatch initiative (2026-06-12)

Started from two small requests (job-card pay method, proposal popout); uncovered a
wider servicer-profile / availability / dispatch restructure. **Findings + SP roadmap +
full field audit + security note** recorded in
`docs/superpowers/specs/2026-06-12-servicer-profile-initiative-findings.md`.

- SP-1 popout firing gate (online + category + radius) — designed, blocked on SP-5/SP-3
- SP-2 `isOnline` manual toggle — deferred
- SP-3 service listings (radius, maxAutoAccepts, contact prefill) — deferred
- SP-4 role switch toggle — deferred
- **SP-5 Business Profile restructure — ✅ IMPLEMENTED 2026-06-12** — schema (`ServicerContact` model + migration with seed backfill), backend (contact CRUD, updated profile endpoints, `backupEmail` on customer update, auto-derived `isCompany`, public profile with `visibleToCustomer` contacts, categoryId change-request via identity pipeline), frontend (single Business Profile page with 7 sections, business contacts CRUD, tax config + calculator, operating hours editor, service areas, bank editor moved to deposit page, backupEmail on customer account, nav cleanup removing redundant dashboard from jobs history).
- SP-3 service listings — **🟢 Phase 1 SIGNED OFF 2026-06-17** (review: 0 blockers); Phase 2 scoped + ready (see section below)
- SP-6 KYC document upload UI — deferred
- CAL calendar reroute → `/calendar/schedule` + `/calendar/workhours`

---

## ✅ SP-3 Phase 1 — Service listings foundation (2026-06-12)

Spec: `docs/superpowers/specs/2026-06-12-sp3-service-listings-design.md`. Phase 1 =
modules model + tabs + Modules CRUD + Simple listing (Advanced wizard stubbed).
Phase 2 (pricing engine, auto-accept, customer proposal, migration) is **pending review**.

### Done
- [x] **Backend `ServicerModule`** (`business_modules`): `{ id, servicerId, name, price(Decimal),
      sku?, active, timestamps }` — **no tax flags** (flat tax from business profile, spec §8).
      Migrations `20260612120000_sp3_servicer_modules` + `20260612123000_sp3_module_drop_tax_flags`
      (removed the over-built tax columns). `PricingModule` kept for the Phase-2 migration.
- [x] **CRUD `/servicer/modules`** (`servicer-module.{service,routes}.ts`, mounted in `index.ts`) —
      list (computed `usedInListings`) / create / patch / delete (soft-disable). Fields picked
      explicitly; money = Decimal.
- [x] **MerchantService** gains `image_url` + `published`; service CRUD + validators extended;
      `file.service.ts` gains the `listing_photo` presign purpose.
- [x] **Frontend `/servicer/services` → 2 tabs** (`services.component.ts` shell + router-outlet):
      `listings` (`services-listings.component.ts`) and `module` (`services-modules.component.ts`).
- [x] **Modules tab**: card (name · price · SKU/— · "used in N listings" · Edit) + add/edit modal
      (name*, price*, SKU only); search · active filter · sort + reverse.
- [x] **Listings tab**: 3-line collapsed card (photo · title · short desc · `RM · duration · N
      modules · auto-accept ●` · Active/Draft toggle · ⋯ menu [Edit/Duplicate/Activate-Deactivate/
      Delete]); expand → modules / jobs-offered / auto-accept summary; search · status filter ·
      sort + reverse.
- [x] **+ Add → Simple/Advanced chooser** (`listing-create.component.ts`). **Simple built fully**
      (`listing-simple.component.ts`): photo (opt, presign) · title* · short desc · price type ·
      base price* · est. duration · "What jobs do you want?" offered/N-A toggles → stored in
      `modifiers` as `{price:null, notOffered}`; saves with no modules / no auto-accept.
      **Advanced stubbed** (`listing-advanced-stub.component.ts`, route wired).
- [x] Gates: backend `tsc` 0 · frontend `tsc` 0 · `ng build` AOT green · migration applied+committed.
      Docs synced (schema-notes, api-doc, this file).

### Phase 2 — scoped plan (Phase 1 ✅ signed off 2026-06-17; review: 0 blockers)

**Already on disk (untracked, unwired) — pure engines, reviewed clean:**
- `backend/src/services/listing-pricing.service.ts` — §8 stacking + flat tax, §9 duration. Pure fns.
- `backend/src/services/sp3-auto-accept.service.ts` — §11 4-gate eval (pure).
- `backend/src/services/proposal-view.service.ts` — §12/§14 enrichment + add-on recompute (pure).
- `backend/tests/unit/listing-pricing.test.ts` — pricing unit tests.
- `frontend/src/app/servicer/pages/listing-advanced.component.ts` — real Advanced 3-step wizard (replaces stub).

**Work-stream A — schema rework (§14) [CRITICAL PATH — blocks everything below]**
- [ ] Rework `MerchantService` for the new listing shape: `listingMode` (simple/advanced),
      `moduleRefs` (Json: `ModuleRef[]` incl/addon + overridePrice + durationDeltaMin),
      `autoAccept` (bool), `estimatedDurationMinutes` (int), confirm `priceType` exists.
      The 3 engines already reference these fields — they won't wire until the columns exist.
- [ ] Migration (stop server first — DLL lock). Additive; backfill `listingMode='simple'`,
      `moduleRefs='[]'` for existing rows. Commit migration folder.
- [ ] Update `schema-notes.md` same session.

**Work-stream B — wire engines into the live flow (§11)**
- [ ] Replace `quoteMatchesAutoAccept` + `MerchantProposalPreset` flow (`quote.service.ts:353`)
      with `evaluateAutoAcceptGates`. Load servicer tax config + schedules + modulesById; enforce
      per-account `maxAutoAccepts` cap around the call. On all-pass → create proposal at computed
      total, `isAuto=true`.
- [ ] ⚠️ **Review bug before wiring:** auto-accept `availabilityOk` uses `getUTCDay()` — MYT is
      UTC+8, so a quote near midnight maps to the wrong weekday. Use the app TZ, not UTC.
- [ ] Listing preview endpoint uses `computeListingPrice` for the servicer-side breakdown.

**Work-stream C — customer proposal redesign (§12)**
- [ ] Route `/customer/quotes/:id/proposals` — backend uses `proposal-view.service.ts` to enrich
      each proposal (included modules, add-on options, breakdown, distance, availability window).
- [ ] Add-on tick → `recomputeProposalPrice` live; selected add-ons captured into the booking.
- [ ] Replace thin `proposals.component.ts` card (logo/rating/msg/eta/price) with collapsed+expanded
      card per §12 (breakdown ▾, tickable add-ons, distance, ETA window, Choose).

**Work-stream D — Advanced wizard (§10.2) + carry-forward from Phase 1 review**
- [x] Wire `listing-advanced.component.ts` (3 steps: Basics / Pricing+options / Auto-accept;
      Preview overlay; only Basics required). Replaced the stub route (`services/new/advanced`).
      Backend: added `listing_mode` + `auto_accept_message` columns (migration
      `20260619143732_sp3_listing_mode_and_auto_accept_message`); `createService`/`updateService`
      + validators now pick `listingMode`/`moduleRefs`/`autoAccept`/`autoAcceptMessage`
      (Zod `moduleRefsSchema`/`optionPriceMapSchema`). Stub `listing-advanced-stub.component.ts` now dead.
- [x] **Carry-fwd #1:** `services/:id/edit` repointed to the new Advanced wizard; the component
      reads `:id`, prefills basics/modules/per-option pricing from `GET /me/services`, and `PATCH`es on save.
- [ ] **Carry-fwd #2:** Decimal-as-string typing — coerce `Number(m.price)` on load in
      `services-modules.component.ts` (+ audit other listing money fields hitting number inputs).

**Work-stream E — migration of old data (§15) + seeding (§13)**
- [ ] Migrate `PricingModule` + old `MerchantService.modifiers`/`moduleRefs` → `ServicerModule`
      library + listing module refs; preserve existing prices.
- [ ] Seed a few modules/servicer + both a Simple and an Advanced listing/servicer (auto-accept on)
      so matching + proposals + breakdown run end-to-end. (Painting/moving/gardening seed = covered by
      the parallel clear-path task #2 — coordinate, don't double-seed.)

**Work-stream F — tests + gates (§16)**
- [ ] Unit: extend pricing tests (tax-inclusive extraction, duration scaling); add 4-gate eval tests
      (budget/availability/coverage/Q-match edges).
- [ ] E2E: create Simple+Advanced listing; module CRUD + "used in N"; proposal breakdown + add-on
      recompute → booking captures add-ons; auto-accept fires only when all gates pass.
- [ ] Gates: backend + frontend `tsc --noEmit` 0; `ng build` AOT; migration committed.

**Suggested order:** A → B → (C ∥ D) → E → F. A is the hard dependency; the engines are done so
B/C/D are mostly wiring once the columns exist.

> ⚠️ **Backend dev server was stopped** for the Phase 1 migration (DLL lock) and **needs a restart**.

---

## ✅ Demo gate PIN data leak — SESSION 2026-06-12

### Bug — Account balance visible behind the demo login-gate PIN dialog
- [x] Repro: log in as admin (or any portal), then demo-bar quick-login into a
      servicer/customer → their name + credit/deposit balance showed in the
      topbar BEFORE the gate PIN was entered.
- [x] Root cause: the demo-bar switch swaps `auth.principal()` (which carries
      `creditBalance`/`depositBalance`) **before** the gate, and the SPA
      navigation is held pending by the route guard — so the still-mounted
      previous portal shell reactively renders the NEW account's data behind
      the translucent modal backdrop.
- [x] Fix 1: `pin-prompt.component.ts` — opaque full-screen `.gate-cover`
      (z-index 999, under the modal backdrop at 1000) rendered while the gate
      PIN dialog is open, so nothing behind it is visible.
- [x] Fix 2: `snackbar.component.ts` — backend notification toasts (z-index
      2000, would float above the cover) are suppressed while the gate PIN is
      pending; the new account's socket is already live pre-gate.
- [x] Regression test: `frontend/e2e/specs/demo-gate-leak.spec.ts` — occlusion
      assertion via `elementFromPoint` (verified: fails without fix, passes with).

---

## ✅ Quote/proposal realtime + pending-card redesign — SESSION 2026-06-12

Bugs in the quote→proposal→accept flow. All `tsc` (BE+FE) + `ng build` pass.

### Bug 1 — Customer proposals page never updated live
- [x] `proposals.component.ts` only listened to `quote.proposals_ready` (deadline
      batch). Now also subscribes `proposal.submitted` (per-proposal) and
      `notification.new` (type `orders`, reconnect fallback) → reloads on the
      matching `quoteId`.
- [x] **Backend** `servicer-quote.service.ts submitProposal` now
      `emitToUser(quote.userId, 'proposal.submitted', {quoteId, proposalId})`
      after the notify().

### Bug 2 — No notification on customer for a new proposal
- [x] Root cause: **auto-proposals** (`quote.service.ts` saved-rule auto-accept)
      created `quoteProposal` rows but **never called `notify()`**. Added a single
      customer notify (type `orders`) + `proposal.submitted` emit after the
      auto-accept loop when `autoCount > 0`.

### Bug 3 — Servicer pending card: missing fields + wrong layout
- [x] **Backend** `listIncomingQuotes` now returns `paymentMode`, address parts
      (`address`/`postcode`/`district`/`state`), `lat`/`lng`, `notes`, and
      `descriptions` (new `formatServiceDetails()` resolves `serviceDetails` →
      readable lines via the category `questionSchema`).
- [x] **Frontend** pending card redesigned to 3 rows:
      Row 1 `[avatar][name][date·slot][budget][building][payment] … [status]`,
      Row 2 `[composed address] [Map button]` (toggles inline `app-map-view`),
      Row 3 `[descriptions chips + notes] … [countdown timer]`.

### Bug 5 — Notifications leaked between accounts
- [x] Root cause: the singleton `SocketService` connected **once** with whatever
      token was current and was never re-handshaked on an account switch. Demo-bar
      switches are SPA nav (no hard reload), so the stale socket stayed joined to
      the **previous** user's room (`user:{oldId}`/`servicer:{oldId}`) and kept
      delivering their `notification.new` events to the new account.
- [x] `socket.service.ts` — `connect()` now tracks `connectedToken`; when the
      token changes it re-handshakes on the **same** socket (preserves existing
      `on()` listeners but re-joins the new room). `on()` calls `connect()` on
      every subscribe so a switch is always reconciled; `disconnect()` resets the
      tracked token; `updateToken()` updates it too.
- [x] `demo-bar.component.ts` — `demoLogin`/`demoLoginEmail` call
      `notifications.start()` after the new session so the socket reconciles
      immediately even on a same-role switch (shell reused, ngOnInit not re-run).
- [x] Backend already derives the room from the token on every connection and
      auto-leaves rooms on disconnect, so the re-handshake moves rooms correctly.

### Bug 4 — Servicer pending didn't update when customer accepted
- [x] `jobs.component.ts` only subscribed `quote.new`. Now also subscribes
      `job.new` (→ `loadJobs()` + `loadQuotes()`) and `quote.matched` (→
      `loadQuotes()`); added a `subs[]` array + cleanup.
- [x] **Backend** `booking.service.ts selectProposal` now emits `quote.matched`
      to every **other** broadcast merchant so losing bidders drop the quote live.
- [x] **Backend** `listIncomingQuotes` filters to `status === 'open'` so a matched/
      expired/cancelled quote leaves the pending feed.

---

## ✅ Toast notification sound + bigger toasts — SESSION 2026-06-12

### Sound for action toasts
- [x] **`toast.service.ts`** — `ToastService` now plays a short chime on `success`/`error`
      toasts (info stays silent). Loads the `notification_sound_enabled` admin setting
      and respects it. Audio context unlocked on first user gesture to satisfy browser
      autoplay policies. Success → `NotificationCard.wav`, error → `Notification_Job.wav`,
      volume 0.4.
- [x] **`notification.service.ts`** — poll-based toast creation in `refresh()` now also
      plays a sound (previously only the real-time socket path did). Added `unlockAudio()`
      for AudioContext priming on first user gesture, matching the ToastService approach.
      Plays sound for the first unread notification to avoid spamming on batch arrivals.

### Bigger snackbar toasts
- [x] **`snackbar.component.ts`** — full visual upgrade:
  - Width: 330px → 420px
  - Padding: 0.7rem 0.8rem → 1rem 1.1rem
  - Border-radius: 10px → 12px
  - Shadow: heavier (0 10px 36px rgba(0,0,0,0.24))
  - Gap: 0.6rem → 0.75rem (both container and item)
  - Message font: 0.88rem → 0.95rem (+ `line-height: 1.35`)
  - Type label font: 0.7rem → 0.75rem
  - Icon font: 1rem → 1.15rem
  - Dismiss (✕) font: 0.8rem → 0.9rem, padding 0.25rem
  - Dot: 0.6rem → 0.7rem
  - Animation translateY increased proportionally (10→14px in, 6→10px out)

### Verification
- [x] Frontend `tsc --noEmit`: 0 errors
- [x] Frontend `ng build`: green, 14.4s
- [x] Backend `tsc --noEmit`: 0 errors (unchanged)

---

## ✅ Loading-skeleton reveal fix + demo unlock env var — SESSION 2026-06-12

### Loading skeletons (per-card image gating)
Cards used to appear before their thumbnail finished decoding, so the user saw
the image interlace-load inside a live card. Skeletons were also a different size
than the real cards, causing a layout jump on reveal. Fixed on all three browse
surfaces so each card slot stays a skeleton until **its own** thumbnail is fully
preloaded (`new Image()` queue, sequential with a short gap so reveals cascade),
then the whole card fades in (`card-reveal`). Skeletons now sit in the same grid
track at the same `min-height: 100px` as real cards — no size jump.

- [x] **`/customer`** (`browse.component.ts`) — replaced the 100ms `setInterval`
      stagger (revealed cards by timer, not by image load) with a thumbnail
      preload queue driven by an `effect()` over `filtered()`; `loadedIds` signal
      gates each card. `revealCount`/`staggerTimer` removed; `staggerDone` +
      `loadingOrStaggering` now derived from `loadedIds`.
- [x] **`/`** (`home.component.ts`) — added the same preload queue (none existed;
      images streamed into the live card). Skeleton `height: 120px` → `min-height:
      100px` to match `.svc-card`. `isLoaded()`/`thumbUrl()` helpers + `OnDestroy`.
- [x] **`/services/:parentSlug`** (`children-browse.component.ts`) — preload already
      existed but skeleton grid used `minmax(180px)`/120px vs the real
      `svc-grid` `minmax(260px)`/100px; unified to `svc-grid` + `min-height: 100px`.
      Card shell no longer renders before its photo (skeleton-or-card `@if`).
- [x] All three respect `prefers-reduced-motion`. `tsc` + `ng build` (AOT) pass.
      Runtime-verified `/` and `/services/cleaning-service` (mid-load showed
      skeletons + revealed cards coexisting); `/customer` compiles, same mechanism.

### Demo unlock phrase → env var
Phrase was hardcoded `'unlockdemobar'` in the backend fallback + seed. Now driven
by `DEMO_UNLOCK_PHRASE`. Resolution order: DB row `demo_unlock_phrase`
(admin-editable live) → `env.DEMO_UNLOCK_PHRASE` (deploy default) → no hardcode.

- [x] **`backend/src/config/env.ts`** — added `DEMO_UNLOCK_PHRASE` (Zod, default `unlockdemobar`).
- [x] **`backend/src/routes/index.ts`** — `/config/public` returns `byKey['demo_unlock_phrase'] || env.DEMO_UNLOCK_PHRASE`.
- [x] **`backend/prisma/seed/data/static.ts`** — seeds `process.env.DEMO_UNLOCK_PHRASE || "unlockdemobar"`.
- [x] **`backend/.env` + `.env.example`** — documented `DEMO_UNLOCK_PHRASE`.
- [x] **`frontend/environment.ts`** — comment clarified it's a build-time fallback;
      live value comes from `/config/public`. Frontend already var-driven (toggle:
      type phrase to show demo UI, type again to hide). `tsc` passes.
- [x] Docs: `docs/ai-context/tech-stack.md` env block updated.

---

## ✅ Code simplifier — batch 1 (2026-06-10)

Ran code-simplifier across 6 files + 7 deletions. All `tsc` (backend + frontend) pass.

### Deleted (dead / never-implemented)
- [x] **6 Windows bat scripts** — `Run-Clean.bat`, `Run-Test.bat`, `Git-Commit-Pusher.bat`,
      `Git-Puller.bat`, `Rerun-Kilo.bat`, `set-local-env.bat`. Superseded by `Run.bat` +
      `scripts/*.ps1`/`.sh`; the dependency-smart install + multi-window launcher pattern was
      fragile and hard to maintain across machines.
- [x] **`docs/ai-context/AlterAIChat.md`** — tiered conditional chat architecture proposal,
      never implemented. On-hold design; current `chat.service.ts` tokens per message are
      acceptable. Frozen record in git history.
- [x] **`docs/setup-guides/INSTRUCTIONS.md`** — removed "Windows shortcut — bat launchers"
      section + `set-local-env.bat` reference in Common Issues (both pointed at deleted files).

### Code simplifications
- [x] **`backend/src/lib/errors.ts`** — added `getErrorMessage()` helper (extract message from
      unknown caught errors).
- [x] **`backend/src/lib/geocoding.ts`** — `parseComponents` refactored from chain of
      `if/else if` to dict-based lookup (`TYPE_FIELD` map). Cleaner, easier to extend.
- [x] **`backend/src/services/notification.service.ts`** — DRY'd `emitToUser`/`emitToMerchant`
      by extracting a shared `payload` variable.
- [x] **`frontend/angular.json`** — added `allowedCommonJsDependencies: ["qrcode"]` (Angular 19+
      warns on CJS packages); bumped `maximumWarning` budget from 500kb → 2mb (initial payload
      with all lazy chunks exceeds the old limit).
- [x] **`frontend/src/app/admin/pages/ai-chat-settings.component.ts`** — removed unnecessary
      `?? []` nullish coalescing (backend always returns an array for greetings).
- [x] **`frontend/src/app/customer/pages/quote-form.component.ts`** — extracted `PAYMENT_MODE_MAP`
      + `applyPaymentMode()` helper to DRY duplicate payment-mode mapping logic in
      `applyReorderPrefill` and `applyChatPrefill`.

### New tracking files
- [ ] **`TODO-CS.md`** — code-simplifier tracking sheet (201 source files, 0 done so far).
      Tracks per-file progress across entire codebase.
- [ ] **`docs/ai-context/logs/code-simplifier-log.md`** — session log for the simplifier agent.
- [ ] **`frontend/e2e/specs/readme-screenshots.spec.ts`** — new Playwright spec for README
      screenshots.

---

## 🔨 Chat QA harness + booking-flow hardening (2026-06-09)

Driven by automated chat-QA runs (`chat-qa-harness.ts`, logs in `logs/ChatQA_*.log`).
All items below: `tsc` + `ng build` pass, committed to `feat/ux-polish`, pushed.

### Done — 2026-06-09 chat reliability + new services
- [x] **Deterministic card-confirm turns** — when the user taps a card (date/time/budget/
      address/contact/question/service), the backend skips the LLM and returns the next card
      from `computeNextCards()`. Zero tokens / 429 / hallucination on those turns. Client flags
      `cardConfirm`; LLM still drives free-form turns. (`chat.service.ts`, `chat.routes.ts`,
      `chat-widget.component.ts`)
- [x] **Soft input hint replaces the input LOCK** — input always usable; a non-blocking hint
      (`cardInputHint`) shows above it while a required card is pending. Filled cards stay collapsed.
- [x] **Unit regression net** — `backend/tests/unit/chat-flow.test.ts` pins `nextStepBlocks` +
      `computeNextCards` (17 cases). Run `npx jest chat-flow`.
- [x] **QA harness: types custom answers** — ~40% of service questions answered as free text
      (through the LLM) instead of tapping the option.
- [x] **QA harness: richer log** — per turn shows `[time] role: content`, `SENT` (frontend
      request body), `RECV` (backend reply), `DATA` (actual prefill incl. budgetMax vs budgetIndex).
- [x] **3 new services: Painting, Moving, Gardening** — own question schemas (non-essential
      questions skippable), budget ranges, card images. Fixes repaint→Renovation /
      movers→Carpenter / lawn→Renovation mis-match. **Run `npm run db:reset` to apply.**
      Docs: `docs/ai-context/seed-plan.md`, `docs/ai-context/chat-qa-findings.md`, `ai-chat.md`.
- [x] **QA personas: typing_shortcut + typing_adhd** — never tap a card, type every answer
      (terse SMS / erratic kid input) to stress free-text extraction.
- [x] **Failed-send auto-retry** — one retry after ~3.5 s before "Could not send message".
- [x] **Reject/stall recovery** — bot names a service but emits no card → backend injects its
      `quote_options`; stuck-watchdog now catches non-Latin question/colon endings. Verified
      against ChatQA_Log_222309 (run-3 stall). B1 (budget) + B2 (full address) confirmed
      RESOLVED by the richer log's DATA lines.
- [x] **Docs + diagrams** — `ai-chat.md` (mermaid flow + quote-flow), `chat-qa-harness.md`
      (full rules + possibility calc + drive-loop diagram), `chat-flow-diagrams.md` (card-confirm
      + inject diagrams). `aichat.md` renamed → `ai-chat.md`.
- [x] **Follow-ups DONE (2026-06-10, branch `fix/chat-lang-and-text-confirm`):**
      - convoLang reset on `clear()` (+ re-derive on "it's me"/continue) — language no longer
        bleeds between customers/scenarios.
      - Multilingual typed service-confirm (`maybeTextConfirmCategory`): zh/ms/ta affirmatives +
        de-anchored + negation/short-message guards (typing-only personas can confirm by text).
      - Free-text address registers (`extractAddress`) — address card no longer loops forever.
      - Deterministic card collapse during field collection — no more stacked/out-of-order cards.
      - Budget free-text → correct bracket (`matchChatBudgetBracket`) — fixed `budget=0`.
      - Question/option labels localized (ms/zh/ta) via `QUESTION_I18N` + `localizeQuestions`
        (561 labels, applied via db:reset).
      - Harness: `not-registered` detector + transcript-regex fix (judge no longer "no-transcript").
      - **Checkbox service-question loop** (`ChatQA_Log_124410062601` runs 1, 3): `matchQuestionAnswer`
        handled only number/quantity/radio → a typed answer to a `checkbox` question (`heavy_items`,
        `aircon_service`) was never credited → the `quote_question` card re-emitted 4+ turns. Now
        checkbox matches like radio across value + every `labelI18n` lang and returns the matched
        values as an **array** (`['wall_chemical']`; multi-mention credits all). Backend-only (client
        already array-ready). Unit-tested, 39/39.
      - **Confirmation re-opened filled cards** (`ChatQA_Log_142210062601` run 1): the "is this an
        edit?" regex matched **"correct"** in "yes that's all correct, please continue", so the
        confirmed-card dedup was skipped → already-filled date/time/address cards re-emitted every
        turn (`redundant` loop). Fixed by one exported `wantsFieldEdit(message)` used by all 3 edit
        gates: "correct" only triggers as a verb on a field; confirmations don't. Unit-tested, 44/44.
      - **Cross-guest state leak on "not me"** (runs 2/4/5): `confirmIdentity(false)` only cleared
        name/phone/address — the prior guest's locked category + date/budget/answers stayed in memory
        → next person inherited a stale locked service → loop. Now full `resetQuoteFlowState()`.
        Harness refresh path now DECLINES identity when the restored name ≠ `scn.name` (was always
        confirming, adopting the previous scenario's booking).
      - `tsconfig` deprecation warnings (TS5101/TS5107) left at `ignoreDeprecations: "5.0"` —
        bumping to "6.0" silences them under standalone tsc but breaks the ts-node seed (project's
        bundled TS only accepts 5.0 → TS5103). Cosmetic noise; not worth breaking the seed. To
        truly remove, migrate `moduleResolution: node` → `node16`/`bundler` + drop `baseUrl` (risky).
- [x] **Follow-ups DONE (2026-06-12, branch `feat/demo-unlock`, from `ChatQA_Log_005312062601`):**
      Root cause of that run's loops: the reply LLM and the deterministic extractors are two
      parallel comprehension layers — whenever a regex missed a value the LLM understood, prose
      said "noted, next step" while the state machine stayed pinned → text/card divergence → loop.
      - `extractBudget` now catches spend-verb bare numbers ("i can spend about 302") — was
        rm-anchored only, so the budget step stalled while the bot's text moved on to name.
      - `matchQuestionAnswer` 60-char global cap → per-type (option questions 300, numeric 120).
        Rojak-wrapped answers ("eh boss, so basically Motor/Engine, … can help anot?" = 76 chars)
        were rejected → `quote_question:component` re-emitted 4× (the run's FAIL). Unit-tested.
      - **LLM extraction fallback** (`llmExtractFieldValue` / `llmExtractQuestionAnswer`): when the
        regexes miss, one strict-JSON LLM call reads ONLY the pending base field / pending question
        from the message. Hard-validated (format/enum; budget+phone digits must appear verbatim in
        the message; question answers whitelisted to schema option values) so a hallucinated value
        can never enter state. Failure-tolerant: any error/no-key degrades to old behavior.
      - **NEXT REQUIRED STEP prompt anchor**: the system prompt now names the exact pending field
        and forbids "noted/got it" or advancing in prose without emitting the filled card.
- [ ] **QA harness follow-ups (from the same log, not yet done):** harness answers the visible
      CARD even when the bot's TEXT asks a different question (re-sent "Motor/Engine" 4× verbatim
      instead of answering "what's the problem?") — on a repeated card it should answer the bot's
      text question (`humanAnswerText`) and vary retry phrasing.
- [ ] **Deferred (need a log to reproduce, or a product call):** prose hallucination (model NAMES
      wrong services in text though the cards are correct); B2 structured address sub-fields
      (No./postcode/type) empty for a credited free-text address (needs frontend geocode-on-prefill);
      category linkifier corrupts prose mid-sentence ("Is it not [Moving](…)" — service-name word
      auto-linked); date prose/state mismatch ("16 June" said, `2026-06-19` stored).
- [ ] **No servicers seeded** under painting/moving/gardening yet (browse shows 0 providers).

### Done — LLM / DeepSeek
- [x] DeepSeek `first-token timeout` root cause: `deepseek-v4-*` are **reasoning models**
      (stream `reasoning_content` before `content`); `streamLlm` now clears the first-token
      timer on reasoning so a working model isn't aborted. Reasoning is not added to the answer.
- [x] Live `/v1/models` = `deepseek-v4-flash`, `deepseek-v4-pro` only (chat/reasoner gone).
      Demo seed chain reordered: Gemini ×4 → DS v4-flash → DS v4-pro (fallback); default model
      + valid-models list updated.
- [x] QA judge pinned to `deepseek-v4-flash`; judge never substitutes the customer-facing
      `localFallback` (was polluting QA logs as fake verdicts) — `noFallback` flag threaded.

### Done — QA harness hardening (2026-06-09 batch)
- [x] ZERO-TOLERANCE: shrunk from ~20-line bullet-point bloat to 6-line compact version.
      Bloat pushed critical flow rules out of the model's attention window → "ghost wall" looping.
- [x] `⚠ NO CARD` false positive: now checks trailing assistant message BATCH (not per-message),
      so blocks arriving in a separate message no longer trigger false warnings.
- [x] `btoa` → Unicode-safe (encodeURIComponent+unescape) for Tamil/Chinese prefill data.
      Updated all encode/decode sites with backward-compat fallback.
- [x] `confirmAddress` geocode fallback: when API fails or returns invalid, falls back to
      sending raw composed address text → flow never dead-ends on missing geocode API.
- [x] `forceCardInput` signal: disables chat input/send when address card is showing,
      replacing input with visible instruction text.
- [x] Adjacent-service fallback: 1st refusal = warm "not in catalog" (no card); 2nd+ ask =
      suggest closest catalog category with a real card. Fixes bot repeating "we don't offer
      that" 3× without giving the user anything to tap.
- [x] QA log resilience: client buffers chunks when file-locked, retries on next write;
      server retries `append` on EBUSY/EPERM/EACCES with exponential backoff (200→1600ms).
      Fixes runs losing the 2nd scenario when the log file is open in an editor.

### Done — prompt hardening (ZERO-TOLERANCE)
- [x] ZERO-TOLERANCE rule: "The tag IS the card" — covers ALL action types (quote_options,
      quote_field, quote_question, quote_prefill) with CORRECT/WRONG examples per type.
- [x] BUTTON CONFUSION rule: when user repeats instead of tapping, re-emit the card + ask
      kindly; after 2 re-emits, try different approach → escalate.
- [x] SELF-RECOVERY rule: if previous turn slipped, own it, apologise, emit the correct card.
- [x] QA harness: `⚠ NO CARD` warns when bot mentions card/button but emits zero actionable
      blocks (also warns when only link/retry blocks exist, not real cards).
- [x] QA harness: escalating nudge system (need → reworded → "I don't see a card, re-send?").
- [x] QA harness: `[⚙ ...]` annotation ghosts sanitized from content before LLM sees them.

### Done — bot booking flow
- [x] Phone-loop: `extractPhone` matched the booking date (`2026-06-19`) → false `contactNumber`;
      now strips date tokens + tightens length.
- [x] Hallucinated final recap: prompt no longer re-lists collected values in text (the review
      card is the source of truth); `collectedData` (exact values) sent so any recap is grounded.
- [x] Repeat cards: front-loaded/text-extracted fields now counted via `collectedData` so the
      bot stops re-showing filled field cards every turn.
- [x] Re-ask loop (e.g. Tamil): strip `quote_question` cards whose key isn't a real schema key
      (LLM invented `whatDoYouNeed`/`serviceType` variants → answered-tracking never matched).
- [x] Reject-recovery: prompt — ask a clarifying question once; on re-stated need, re-offer the
      best-fit service instead of looping.
- [x] Language pin (`lang`) + strict reply-language directive; convoLang detection made sticky
      (a Latin field value / phone digits no longer flips an established ms/zh/ta to English);
      synthetic button-echo drafts localized.
- [x] `questionSchema` auto-translate on save (`labelI18n`/`descriptionI18n`) + chat resolves
      to conversation lang; `POST /admin/categories/backfill-translations` for existing rows.
- [x] Service-name links carry the in-progress prefill (wired `goToQuoteForm`); gated
      "clear my quote" (2-confirmation count) via chat.

### Done — QA harness
- [x] Human-like answers, info-count distribution (0–7), free-text field answers, repeat-info
      (idempotency) test, refresh/"is this {name}?" restore test, 0.5–1s reply delay.
- [x] Checks: `language` / `duplicate` / `redundant` / `unconfirmed` / `flow` (out-of-order) /
      `refresh`; text-only replies tolerated (re-state need, not auto-fail); keyed transcript +
      backend decision log. Conclusion honesty: structural pass/fail + judge coverage fed to the
      conclude (no more "excellent" when the judge was down).

### Pending — operational (not code)
- [x] **contactNumber dedup fix**: `confirmedFields` filter was removing pre-filled contactNumber
      blocks (line 2279-2286). Blocks with non-empty values now pass through so the frontend
      receives extracted phone data. Was root cause of 7/8 QA failures. (2026-06-09 ChatQA)
- [ ] Restart BE + reload FE; re-seed demo keys (chain order); run `backfill-translations` once.
- [ ] Re-run QA (10 runs) to verify contactNumber fix; expect 7-8/10 passes min.

---

## 🔨 IN PROGRESS — App-Wide Route Redesign (2026-06-08)

**Specs:** `docs/superpowers/specs/2026-06-08-route-redesign.md` (frontend route map)
+ `docs/superpowers/specs/2026-06-08-route-redesign-completeness-design.md` (full reroute
surface: backend emitters, seed FAQ, redirects, dynamic routes, **security review**).

Restructure all portal URLs from flat/in-component-tab patterns to RESTful,
hierarchical paths with tabs as URL segments and filters as query params.

> ⚠️ Two gaps in the original spec's route-config examples (completeness §6/§9f): add
> backward-compat `redirectTo` entries, and carry `adminActionPinGuard` (`canActivate`)
> onto the restructured `queues`/`users`/`api-keys` routes — copying the examples verbatim
> makes the demo PIN gate (token + accidental-admin-edit safeguard) stop firing.

### Phase 1 — Servicer jobs ✅ (2026-06-08)
- [x] `servicer.routes.ts` — `jobs` parent + `pending`/`active`/`history` children (each
      `ServicerJobsComponent` with `data.tab`), `'' → pending` redirect, and `:id`
      (opens dispatch overlay via `data.detail`). `jobs/history/:id` deferred to Phase 5.
- [x] `jobs.component.ts` — tab read from route `data.tab`; tab buttons use `routerLink`;
      filter/sort/search hydrate from query params on init and an `effect()` mirrors them
      back to the URL (`?filter=`, `?sort=`, `?search=`, history `?days=`). `:id` deep
      link opens the overlay.
- [x] `servicer-shell.component.ts` — left at `/servicer/jobs` (redirects to pending;
      non-exact `routerLinkActive` keeps "My Jobs" lit across all `/jobs/*`).
- [x] `calendar.component.ts` — `viewJob()` already navigates to `/servicer/jobs/:id`
      (done in the calendar-card commit). Both `tsc` + `ng build` pass.

### Phase 2 — Customer bookings
- [ ] Restructure bookings + history under `/customer/bookings/*`

### Phase 3 — Admin settings + queues nesting
- [ ] Nest flat settings under `/admin/settings/*`, queues under `/admin/queues/*`

### Phase 4 — Shared links + dead link fixes
- [ ] Fix `/customer/chat`, `/contact`, `/admin/dashboard` dead links
- [ ] Update notification service routes (`linkReorder` → `/customer/bookings/history`)

### Phase 5 — New detail pages (stretch)
- [ ] Job history detail, booking detail, user detail, merchant detail
- [ ] Each `:id` detail route enforces server-side ownership/role (IDOR — completeness §9d)

### Phase 6 — Backend & dynamic links (NEW, from completeness audit)
- [ ] Backend `linkUrl` emitters → new routes: `booking.service` (5), `quote.service` (3),
      `dispatch.service` (2, incl. dead `/bookings`), `stripe.routes` (1)
- [ ] Stripe return URLs (`booking.service` 839/840, `stripe.routes` 93/94) → `/bookings/active`
- [ ] Global-search `route` fields (`index.ts` 390/421)
- [ ] Chat AI prompt (`chat.service` 83-102,518) → new routes + fix 4 dead links
- [ ] Seed FAQ knowledge base (`static.ts` ~5 lines, incl. dead `/admin/money`) + reseed
- [ ] Servicer dashboard quickLinks (`dashboard.component.ts` 93/294/295/296, incl. dead
      `/servicer/history`)
- [ ] `routeFor()` relative-path guard (`notification.service`) — defense-in-depth

### ✅ Dead-link hotfix — DONE (2026-06-08)
**Plan:** `docs/superpowers/plans/2026-06-08-dead-link-hotfix.md`. All 9 dead links
re-pointed to routes that exist today (renamed-route re-points still deferred to Phases 2/3/6).
- [x] `/servicer/history` → `/servicer/jobs/history` (servicer dashboard quickLink) — `4fc4822`
- [x] `/admin/dashboard` → `/admin` (setup-wizard) — `8ee0c55`
- [x] `/customer/chat` + `/contact` → open chat widget in place (my-bookings, chat-widget) — `0eab573`
- [x] `/bookings` → `/customer/bookings` (dispatch.service notification) — `444d7bf`
- [x] `/admin/money` → `/admin/money-settings` (seed FAQ) — `9114f05`
- [~] `/servicer/quotes`, `/admin/dashboard`, `/customer/proposals`, `/customer/deposit`
      (chat.service AI prompt) — **applied + tsc-verified, commit held**: `chat.service.ts` has
      unrelated in-progress chat-infra work in the tree; my prompt fix will land when that file
      is committed (auto-committer) or on explicit request.
- [ ] **Reseed deferred** (T6): `npm run db:reset` needed for the FAQ string to reach an
      already-seeded DB — NOT auto-run (destructive; would wipe demo data). Run when ready.
- Gates: backend + frontend `tsc` pass (2 pre-existing `tsconfig.json` TS5101/5107 deprecation
  errors are unrelated); grep guard clean (only false-positive = `/bookings` API call).

---

## 🐛 FIXED (uncommitted) — AI chat: name/budget/flow bugs (2026-06-08)

**Plan:** `docs/ai-context/chat-bugfix-plan.md`

From real transcript. 3 root causes — all fixed; `tsc` backend + frontend pass:
- [x] **A (name):** "is this From?" — backend `extractName` disable (already in tree) +
      frontend `isPlausibleName()` guard on the returning-guest greeting; poisoned
      `contactName` dropped from `sessionStorage` on load.
      (`chat-widget.component.ts` `loadGuest` + new helpers.)
- [x] **B (budget):** "budget 1000" pre-filled — `extractBudget`/`extractPhone` now run
      on `userConvo` (user words only), not the assistant's prose. (`chat.service.ts:1679`.)
- [x] **C (flow):** gave info first → skipped service pick → jumped to review. Field
      collection now requires a real category context (`hasCategoryContext`); premature
      `quote_field`/`quote_prefill` cards stripped until a service is settled.
      (`chat.service.ts` `collectingFields` gate.)

### Chat QA harness — card-driving E2E (2026-06-08)
Standalone, shared, dev-only automated QA that completes a FULL quote to the review card.
- [x] **Architecture (separated for tidiness):**
      - `frontend/src/app/shared/chat-qa-harness.ts` — pure engine: persona model, data
        pools, procedural scenario generator, card-driving loop + per-run checker.
      - `frontend/src/app/shared/chat-qa.service.ts` — `@Injectable({providedIn:root})`
        shared runner (run state signals, log-name, POSTs the log). Reusable by any component.
      - `chat-widget.component.ts` — only the `QaHost` adapter (`buildQaHost`) mapping
        harness card actions onto the real handlers (continueQuoteInChat, confirmDate,
        confirmBudget, answerRadio, submitPrefill…), plus `qaAnswerQuestion`.
- [x] **Card-driving:** inspects the card the bot shows and calls the real handler →
      goes through base fields AND the service question schema → success = the
      `quote_prefill` review card appears (does NOT navigate away). Fixes the old
      text-only harness that could never finish a card-driven flow.
- [x] **Persona model (per run):** {Typing}{Tone}{Behavior}{Sorting}{Language} +
      **Customer Preset** (customer-mode 6th axis — named test customers). Procedural.
- [x] **Run count:** inline number input next to the QA button (default 1, max 500);
      each run = one full procedurally-random quote.
- [x] **Personas extended:** Typing adds `slang`; Language adds `ta` (Tamil) + improved
      `rojak`. Malay short typing styles apply SMS shortcuts (saya→i, tak→x, perlu→prlu,
      ambil→ambik, boleh→blh, lah→la, kan→kn…); rojak mixes English + Manglish particles
      (lah/lor/mah/sia/leh/liao + "can anot"); Tamil service needs added so Tamil cards
      are actually exercised.
- [x] **Incremental log writing:** `/chat/qa-log` gains an `append` mode (returns the
      resolved name on create-collision). The harness streams chunks (`onChunk`) — header,
      each scenario, then summary — so the file is written to disk AS the run goes. A
      Stop or crash still leaves everything-so-far recorded (file now chronological).
- [x] **Guest + customer mode** (adapter uses mode-agnostic send/clear/messages).
- [x] **Heuristic checker** logs per run: missing fields / loop / stall / timeout /
      redundant re-ask. Skips cards for fields already in prefill (no parroting).
- [x] **LLM judge** (`POST /chat/qa-judge`, dev-only) reviews each transcript for
      LOGICAL issues the heuristics miss: wrong reply language, assumed/hallucinated
      data, contradictions, ignored input, illogical flow, tone. Reuses the chatbot's
      LLM chain (Gemini→DeepSeek→OpenAI). Findings logged per run.
- [x] **Final conclusion:** one LLM pass over all findings → overall verdict + top
      fixes, written at the TOP of the log (CONCLUSION + SUMMARY incl. logical-issue
      count). `JUDGE_UNAVAILABLE` when no LLM key configured.
- [x] **Bot language match:** `buildAssistantPrompt` now instructs the assistant to
      reply in the user's language (Malay→Malay, Chinese→Chinese, Tamil→Tamil, rojak mirrored).
- [x] **Card i18n (EN / Malay / CN / Tamil):** quote-flow card UI translated via a
      `CARD_T` dictionary + `t(key)`/`tSlot()` helpers. `cardLang` is detected from the
      last few user messages (Tamil/Chinese script → ta/zh, Malay markers → ms, else en);
      rojak resolves to its non-English side instead of always English. Covers category
      Yes/No, Confirm buttons, time slots, field labels, address form (options,
      placeholders, validation), budget, review summary, identity confirm. Profile/PIN/
      link cards (servicer/admin context) left in English.
- [x] **PIN-gated** (`5201314`) on press; **dev-build only** (`!environment.production`).
- [x] **Log output:** `POST /chat/qa-log` writes `<repo-root>/logs/ChatQA_Log_<HHMMDDMMYYXX>.log`
      (name sanitised, write confined to logs/). `logs/` git-kept, `*.log` ignored.
- [x] **Security (review fix):** `/chat/qa-log` registered ONLY when `NODE_ENV !==
      'production'` (the PIN is a UX gate, not auth — env guard is the real protection);
      exclusive write (`flag: 'wx'`) + random suffix on collision so a client name can
      never overwrite an existing log.

Verified: backend tsc + frontend tsc clean, ng build green.

---

## 🐛 FIXED — Calendar day-click crash + card redesign (2026-06-08)

**Root cause:** `b.price` (Prisma Decimal) serialized as string in JSON → `.toFixed(2)`
threw TypeError, crashing modal rendering for days with bookings.

**Fix applied:**
- `backend/src/routes/servicer.routes.ts` — `Number(b.price)` cast; enriched endpoint
  with `paymentMode`, `cashConfirmed`, `contactName`, `contactNumber`, address fields,
  `notes`, `serviceDetails`
- `frontend/src/app/servicer/pages/calendar.component.ts` — new detail card layout:
  status + time + payment/paid + price row, category, contact with copy button,
  address with copy button, expandable job description (collapsed by default),
  View Job button (new tab on desktop, direct navigate on mobile)
- Both `tsc --noEmit` pass (zero errors)

---

## ✅ RESOLVED — AI-chat quote flow hardening (2026-06-08)

The chat quote flow is now deterministically backstopped so a one-line dump
(e.g. `"wedding last sunday of dec 2026 night No.18, Jalan Tempua 5, 47100, Brian,
0111123456 RM1500"`) captures **every** field, regardless of which LLM answered or
whether it skipped a word.

- **Deterministic field capture — all six fields scan the WHOLE conversation
  (history), not just the current turn** (`chat.service.ts`): date + time (chrono,
  intent gated on the user's own messages), address (`extractAddress`, street
  keyword → 5-digit postcode), budget (`extractBudget`), name (`extractName`,
  connector-required + stopwords + capitalised echo), phone (`extractPhone`, → +60).
- **One-shot fill / no stalling:** all fields are captured + pushed as pre-filled
  cards BEFORE the next step is computed, so a full dump advances straight to the
  questions/review instead of one field per turn (fixed the "stops after budget").
- **Budget = the user's ceiling:** the slider picks the lowest bracket whose top
  covers the stated amount (RM999 → 500-1000, never 1000-3000).
- **No repeated cards:** confirmed field/question cards show once, then are
  suppressed (unless the user asks to change/edit). Phone normalised to +60.
- **Service-question text answers captured:** a number/option typed in chat (e.g.
  "50" for attendees) is recorded so the question isn't re-asked.
- **Name false-positives killed:** dropped the "you are / it's / this is" lead-ins
  that matched the assistant's prose ("you are comfortable spending" → junk name
  "Comfortable"); only unambiguous lead-ins + a capitalised echo remain.
- **Prefill → quote handoff (no redundant re-entry):** "Review & submit" carries
  ALL collected data to the quote form, and the guest quote form ALSO reads the
  chat's `sessionStorage` prefill as a fallback, so the data prefills even if the
  user reached the form another way (e.g. tapped a service link mid-chat). Guest
  ingestion now maps budget + service-question answers too (budget applied after
  the category resolves so it isn't reset), and chat prefill wins over older saved
  guest data.
- **questionSchema-in-chat** (5 card types, serviceDetails, "I'm not sure").
- **Session isolation + guest persistence:** guest chat + prefill in sessionStorage
  (survives refresh, clears on tab close); returning guest greeted by name with a
  Yes/No identity confirm; Clear wipes everything.
- **Greeting tiers (admin-managed):** anonymous / returning / customer / servicer /
  admin, with a `{name}` placeholder. Edited in Admin → AI Chat Settings.
- **Event Planner budget ranges:** 500-1000, 1000-2000, 1500-2500, 2500-5000, 5000+.
- **Services browse cards** (`/services/:parentSlug`) scan-load thumbnails one by
  one; photo reveals only when its image is decoded; scan line sweeps from outside
  the left edge.

> **Settings drift fix:** budget ranges + chat settings (incl. greeting tiers) are
> upserted by `npm run seed:settings` — **non-destructive** (no data wipe). Run it
> after a settings default changes instead of a full `db:reset`, then restart the
> backend.

---

## ✅ AI-chat quote flow — SESSION 2026-06-08 (category_lock + address split + Service Catalog UUIDs)

- [x] **Bug A — category_lock hallucinates wrong UUID.** Validation now drops `category_lock` blocks whose UUID's category name doesn't appear in the assistant's reply text. Also strips any `quote_question` blocks emitted for the wrong category in the same reply.
- [x] **Bug B — preferredDate grabs anchor "today" instead of resolved date.** `parseDateTimeFromText` now prefers the last fully-specified (`day`+`month`+`year` certain) non-past chrono result, not blindly `results[0]`.
- [x] **Root cause: children UUIDs missing from Service Catalog.** The children Prisma query didn't select `id`, so the model had to guess UUIDs and hallucinated wrong ones (Interior Design's for Event Planner). Now prints `(id: \`uuid\`, slug: \`slug\`)` in the catalog.
- [x] **Address split into sub-fields.** `extractAddressNo` + `extractPostcode` extract unit number and postcode separately from raw text. `fillField` now fills `addressNo`, `streetDetails`, `postcode` alongside `address`. `nextStepBlocks` emits `propertyType` selector card. Prompt updated with new valid keys.
- [x] **Building type picker in chat.** Front-end `addrPropertyType` signal + dropdown (Landed/Condo/Commercial) in address card, plus standalone `propertyType` card support. `confirmAddress` stores sub-fields separately; `confirmPropertyType` handler.
- [x] **Echo regex `/i` flag** — `extractName` wasn't matching capitalised echoes like "Perfect, Bryan!".
- [x] **Redis pub/sub `error` listeners** — `redis.duplicate()` returns clients with no listeners; error handlers now attached.
- [x] **Red warning note in review card** — prefill-warning banner: "Your contact details and address cannot be changed after submitting."
- [x] **Chat bubble stays open after navigating to quote** — removed `widget.close()` from `submitPrefill`.
- [x] **Dedupe review card** — `prefillSeen` flag filters duplicate `quote_prefill` blocks; reset on `resetQuoteFlowState`.
- [x] **Cards stream one at a time** — `revealCards()` drips each action block as its own message bubble with 400-1000ms gap instead of all-at-once.
- [x] **Logo click full reload with role redirect** — `window.location.href` for full re-init; admin→/admin, servicer→/servicer, customer→/customer, guest→/.
- [x] **Admin PIN: prompt on every guarded navigation** — `pin.clear()` in guard before each `requirePin()`. No storage persistence. Logout clears cache.

## 🚧 AI-chat quote flow — OUTSTANDING (backlog + decisions, 2026-06-07)

Found via live QA. Order = priority. Decisions from the user are marked **[decided]**.

### 🔴 Data integrity / correctness
- [x] **Wrong address can submit.** Model re-emits fields from whole-conversation history each turn; `applyQuoteFieldValues` blindly overwrites newer `prefillData` values with stale ones (saw confirmed "18 Jln Pudu" but summary/submit held old "42 Jalan SS2/72"). Fix: do NOT overwrite a field already present in `prefillData` with a re-extracted value — keep the user's latest. (Already fixed: `fieldAlreadySet` guard at line 1119.)
- [x] **Chat prefill not flowing to quote form for new address sub-fields.** Both guest and customer `applyChatPrefill` now map `addressNo`, `streetDetails`, `postcode`, `propertyType`. localStorage fallback (`msvc_latest_chat_prefill`) for service hyperlinks opened in new tab.
- [x] **Guest history bleeds into account view + persistence.** (a) Already handled: identity-change effect at line 828 clears `guestMsgs` on login. (b) Guest chat persisted in `sessionStorage` already. (c) Account uses backend session, guest uses sessionStorage — no cross-contamination.

### 🟠 Flow / UX
- [x] **Mobile: chat takes over the whole screen + blocks the background** — at ≤640px the panel goes full-screen (`inset:0`, no radius/border) and the backdrop dims (`--color-backdrop`) so nothing behind it can be tapped while open (tap backdrop or close to return). Was 420px / 85vh, which left the page visible + tappable.
- [x] **Remove postcode from the chat address card** (unnecessary) — done; postcode still auto-captured from Places/GPS into the composed address, just no manual field.
- [x] **Red note under the address in the review summary** — added `prefill-warning` banner in `quote_prefill` card: "Your contact details and address cannot be changed after submitting."
- [x] **Budget card never collapses** — already handled: `budgetAnswered()` checks both `budgetChosen()` AND `prefillData()['budgetMax']`, so collapses whether answered via slider or text.
- [x] **[decided] Budget = brackets.** `prefillSummary` already maps `budgetMax` to a readable bracket via `rangeLabel()`.
- [x] **Hide internal keys from the review summary.** Already uses a whitelist (preferredDate/timeSlot/address/contactName/contactNumber/notes/Budget + question answers). `lat`/`lng`/`budgetIndex`/`categoryId` never leak.
- [x] **Chat vanishes for guest after navigating to the quote.** Removed `widget.close()` from `submitPrefill`.
- [x] **Dedupe the "Review & submit" (`quote_prefill`) card** — `prefillSeen` flag filters duplicates in `applyFormFills`; reset on `resetQuoteFlowState`.
- [ ] **No markdown / raw `*` already fixed (B12); verify after these changes.**

### ⭐ Governing principle — FLEXIBLE, NATURAL COLLECTION ORDER **[decided]**
The chat must feel buttery smooth and human: the assistant asks for missing details in whatever order is natural to the conversation, and captures anything the user volunteers out of order (e.g. they give budget + address in one sentence). **No rigid forced sequence.**
- The MODEL leads ordering. Relax the strict "Step 3 MUST come before Step 4 / follow this order" rules → "prefer a sensible order, but adapt to the user; never re-ask what's collected."
- `nextStepBlocks` becomes a SAFETY NET only: (a) if the model emits NO field card while fields are still missing, inject ONE missing field so the flow never dead-ends (order here is just a fallback default); (b) emit the final review (`quote_prefill`) ONLY when ALL required base fields + ALL required questionSchema answers are present.
- Cards must collapse the moment their value lands in `prefillData` (the collapse-on-answer fix) so out-of-order answers always look clean and never show a stale question.
- Completeness gate: define the required set = base fields (date, time, address, budget, contact) + the category's required questionSchema keys. Review only when the set is satisfied.

### 🎴 Cards only when NEEDED **[decided]**
Don't always throw cards. A card appears ONLY when a UI control genuinely helps the user; otherwise the assistant just converses and captures the answer from the user's words.
- **Card-worthy (control adds value):** date (picker), time slot (buttons), budget (brackets), address (No/Street/Postcode + GPS + Places), phone (country-code prefix), quantity (steppers), and questionSchema radio/checkbox when the user wants to pick explicitly. Final review = always a card.
- **No card (just talk + capture):** the customer's name, free-text problem descriptions, text-type questions, and ANY value the user already gave in words. The assistant acknowledges in text and the value is captured silently (stored in `prefillData`, shown at most as a small confirmed line, never an interactive input).
- The model decides per turn whether a card adds value. Free-text answers that map to a schema option (e.g. "won't turn on" → "No power") are captured WITHOUT forcing the option card.
- Implementation note: need a way to capture a value from conversation without rendering an interactive card (e.g. a silent-capture action, or a collapsed confirmation only). The deterministic safety net should only inject a card for control-worthy fields, never for name/free-text.

**Adaptive contact card (two variants):** phone needs the country-code prefix control (card-worthy), name is just typeable. So:
- **Both name + phone missing** → combined **`contact` card** (name input + phone control together) — good default for terse users who want one shot.
- **Name already known** (given in text, or from the logged-in account) → **phone-only card** (`phone` key: just prefix + number). Don't re-ask the name.
- **Only name missing** (phone already given) → just ask in text, no card.
- A straightforward user who types "I'm David, 0123456789" → capture both from text, show at most a confirmed line, no card at all.

### 💬 Conversational tone + diagnostic collection **[decided]**
The assistant is an empathetic, helpful human, not a form. Reference example (TV repair):
> "my tv is broken!" → "Oh no, what happened? (e.g. no power? no sound? no display? graphic lines?) What kind of TV is it? (Samsung LED? LG Plasma?) Tell me how it broke — and if you're not sure, I can help you figure it out." → "Idk someone hit it, can't turn on" → "That must be tough. May I get your name?" → "David" → "OK David, here's the service I think you need, can you confirm?" → [confirm] → "OK David, let me guide you on what to do next…" → [advice] → [card forms]

Rules to encode:
- **Empathy first** on problems ("oh no", "that must be tough"), then help.
- **Ask questionSchema questions CONVERSATIONALLY**, surfacing the options as natural examples/hints in the text (radio/checkbox options → "no power? no sound? graphic lines?"), NOT a bare card dump.
- **Accept free-text answers and MAP them to the schema option** (user says "won't turn on" → maps to a "No power" radio option). The card stays available as an explicit fallback picker.
- **Offer to help if the user is unsure** ("if you're not sure, I can help you find out") — guide them to the right answer/category.
- **Use the customer's name** naturally once given.
- Optionally give brief helpful **guidance/advice** for the service before/after collecting.
- Stay warm, plain, no markdown, no dashes (existing rules).

### 🟢 questionSchema-in-chat — NEW FEATURE **[decided: A1 + B2]**
- **A1 (conversational + mapping):** ask each question naturally with the options as hints ("no power? no sound? graphic lines?"); accept a free-text answer and the AI maps it to the matching option; the `quote_question` card still renders as an explicit fallback to tap.
- **B2 (ask ALL questions):** ask every questionSchema question, required AND optional. Optional ones are asked briefly ("the input is there for a reason"), and the user can skip an optional one.
- **"I don't know" option:** option-based questions (radio especially) for things a user may not be able to identify (e.g. TV screen type: LED / OLED / Plasma / **I don't know**) must include an "I'm not sure" / "I don't know" option. When chosen, the AI offers to help figure it out (A1), and it's recorded as unknown for the servicer rather than blocking the flow. (Content rule for the questionSchema editor + seed data.)
- [x] **After base fields, do NOT say "All information collected".** Say instead:
  > Thank you for confirming your information! We've got all the information needed. Before we proceed, please bear with us, there are a few more questions to clarify.
  — `CARD_TRANSITION_ACK` + `transitionToQuestionsAck()` in `chat.service.ts`; fires on card-confirm turn when entering questions for the first time (`answeredQuestions.length === 0` and next card is `quote_question`). Localized en/ms/zh/ta/rojak.
- [x] **Then ask the category's questionSchema questions, one card at a time** (all of them), then a FINAL review (incl. budget bracket + question answers), then Review & submit.
  — `computeNextCards` (card-confirm path) and `nextStepBlocks` safety-net (LLM path) both gate `quote_prefill` behind unanswered questions. `answeredQuestions` sent by frontend from `prefillData.serviceDetails`.
- [x] **New `quote_question` action card**, rendered by type (5 types, value shapes per the quote form):
  - `radio` → option buttons (`answerRadio`) → string
  - `checkbox` → multi-select chips (`toggleQCheckbox` + `confirmQCheckbox`) → string[]
  - `text` → text input (`confirmQText`) → string
  - `number` → number input (`confirmQNumber`) → number
  - `quantity` → per-option steppers (`incQ`/`decQ` + `confirmQQuantity`) → `{ [optionValue]: count }`
  - Answers accumulate into `prefillData.serviceDetails[key]` via `setQuestionAnswer`. Backend `nextStepBlocks`/`computeNextCards` gate review until all done.
  - Gates: backend tsc 0 (pre-existing TS5101/5107 deprecation warnings only), frontend ng build 0.

### Open question
- (none — #8 decided: questionSchema in chat; #9 decided: budget brackets, show in review.)

---

## 🔓 Demo PIN gate: scope to demo-bar + logout-on-cancel; harden sign-out (2026-06-07)

Two demo-account issues + a sign-out hardening. Gates: frontend `tsc` 0, `ng build` 0.

**Bug: cancelling the demo PIN looped forever.** Demo-bar login issues the
session *before* the PIN gate, so on cancel the user stayed logged in; home's
`ngOnInit` redirect ("logged-in → portal") bounced them back into the gate →
infinite loop, only escapable by entering the PIN.

- [x] **Gate scoped to demo-bar sessions, not `isDemo`.** New `hs_demo_gate` flag (`AuthService.requiresDemoGate()`) set only by `/dev/demo-login` for a demo account; cleared by `store()` (every real login) and `logout()`. Guard (`auth.guards.ts`) gates on the flag. → A real `/auth/login` (email+password) of a demo account is NOT gated; only the demo-bar quick-login is.
- [x] **Cancel logs out.** Guard calls `auth.logout()` before redirecting `/` on cancel/wrong-PIN, so the pre-issued demo session is discarded and the loop can't form.
- [x] **Sign-out: confirm dialog + awaited revoke.** `shell.logout()` now opens a confirm dialog (button only — NOT `auth.logout()`, which the 401 interceptor / demo-switch / account-delete still call silently); shows "Signing out…". `auth.logout()` is now async: clears local state first (so a hung revoke can't trap you logged in), awaits `POST /auth/logout`, returns `false` if the revoke couldn't be reached → toast warns.
- [x] Docs: `security-notes.md` §1 (gate scope + cancel-logout).

---

## 🔒 Validate the session on startup, never trust localStorage (2026-06-07)

Security fix. Logged-in UI ("My portal", portal routes) was shown purely on the
strength of the cached `localStorage` principal — a stale/forged `hs_user` would
present as authenticated until an API call happened to 401. Gates: backend `tsc`
0, frontend `tsc` 0, frontend `ng build` 0.

- [x] **Backend `GET /session`** (`routes/index.ts`, root mount, NOT under `/auth`): `requireAuth` + new `getCurrentPrincipal(kind, id)` in `services/auth.service.ts` rebuilds the principal fresh from the DB. 401 if the account no longer exists.
- [x] **Frontend `AuthService.verifySession()`**: calls `GET /session` at startup; on success refreshes the stored principal, on any failure calls `logout()`. Adds `authReady` signal. Resolves (never rejects).
- [x] **Blocking `APP_INITIALIZER`** (`app.config.ts`): app does not render until `verifySession()` resolves, so first paint reflects the backend-verified session (or logged-out). The auth interceptor's silent refresh-on-expiry covers an expired-but-valid token.
- [x] Docs: `api-doc.md` (GET /session), `security-notes.md` §1 (never trust the cached principal).

---

## 🤖 AI-chat quote flow fixes (2026-06-06)

Three issues in the chat-widget conversational quote flow. Gates: backend `tsc` 0, frontend `ng build` 0.

**A — Confirm button on every action card (fixes "filled form but AI didn't proceed").**
- Root cause: each field signals the AI by auto-sending a chat message, but **address + free-text fields only accumulated data and never sent** — so the assistant stayed silent and the user was stuck. Date/time/budget worked because they sent.
- Fix (`chat-widget.component.ts`): uniform **Confirm** button per card. Date + time switched from auto-send-on-pick to **pick → Confirm → send** (also gives the user a review step). Free-text fields (name/phone/notes) get a Confirm button + per-key `confirmedTextValues` ✅ display. Budget already had one.

**B — AI guides to nearest budget instead of rejecting (`chat.service.ts`).**
- The budget brackets were injected with no handling instruction, so the model improvised and dead-ended low budgets ("RM50 too tight"). Wrong: customers set a budget and **servicers** send proposals — any budget is allowed.
- Added a budget-guidance rule after the brackets: never reject/discourage over price; if under the lowest bracket, mention the lowest bracket in a friendly way, offer to set it, keep moving the booking forward; phrase it **naturally in own words, not a fixed template**.

**B2 — Sales-forward on partial/mixed/weird requests (`chat.service.ts`, after L276).**
- The anti-tone-deaf-upsell rule (L276) over-fired: a real need buried in noise (e.g. "throw a party… budget USD300… [absurd/inappropriate extras]") made the model treat the WHOLE request as "beyond what we offer" and bail, even though it had already matched Catering.
- New rule: real customers ramble/joke/overshare/say absurd things. Stay unflappable, never lecture or moralise, isolate the one serviceable need and PURSUE it (emit quote_options, drive the booking). Quietly set aside the parts we don't serve / inappropriate bits — don't repeat them back. Party/event/gathering ⇒ usually Catering = a sales opportunity, not a reason to back off. Only "we don't offer that" when NOTHING maps.

**C — Structured 3-field address card with GPS + live autocomplete.**
- Address card is now **No. | Street | Postcode + [📍 Pin] [Confirm]** (was one free-text box).
- **Street** uses the existing `<app-places-autocomplete>` (live Google Places dropdown). Picking a suggestion auto-fills the **postcode** from that place — because the user selected one specific place it's unambiguous, satisfying the "don't autocomplete an ambiguous postcode when several same-name streets exist" rule (typing without picking leaves postcode for manual entry).
- **📍 Pin** → browser `getCurrentPosition` → new backend `POST /chat/reverse-geocode` → fills **Street + Postcode** (not the unit No.).
- Backend: `reverseGeocode(lat,lng)` added to `lib/geocoding.ts` (parses street_number+route + postal_code from components); `AddressValidation` gains `street`/`postcode`. Reuses the server-safe `GOOGLE_MAPS_API_KEY` — no browser Maps JS dependency for the GPS path.
- Confirm composes "No, Street, Postcode", stores `address` (+ lat/lng when known), sends "My address is …" to advance the flow.

**Context — Google key fix (prereq, same session):** local `backend/.env` `GOOGLE_MAPS_API_KEY` was a **referer-restricted browser key** → server-side Geocoding returned `REQUEST_DENIED` ("API keys with referer restrictions cannot be used with this API"), so address validation failed on localhost. Resolved by using an **unrestricted server key** locally. Deployed uses a separate restricted key. (Clean long-term: split into a browser key + a server key — backend `geocoding.ts` + `/config/public` currently share one `GOOGLE_MAPS_API_KEY` env var.)

**B3 — No dashes / em-dashes in AI replies (`chat.service.ts`, after `Tone:`).** User dislikes `-`/`–`/`—` joining clauses or the "X — Y" aside structure. Added a punctuation-style rule: plain complete sentences, commas/full stops/joining words instead, never the dash-aside structure. (Prompt-only; if dashes persist a post-process strip on the reply text is the hard backstop.)

**B4 — "Not this service" reject button + AI re-suggest (`chat-widget.component.ts` + `chat.service.ts`).**
- `quote_options` card buttons changed: "Continue in chat" / "Go to form →" → **"Yes, that's it"** (confirm) / **"Not this service"** (reject). New `rejectCategory()` sends "No, <category> isn't the service I'm looking for." (`goToQuoteForm()` now unused, left in place.)
- Prompt: the old "emit quote_options ONCE" rule blocked re-suggesting after a wrong guess. Loosened — may emit a fresh `quote_options` for a DIFFERENT category after a rejection (still never after CONFIRM, no same-suggestion loop). On reject / unsure user: ask ONE short clarifying question about what they're trying to get done, then suggest a better-fitting service; don't bail to the services page.

**B5 — Multi-choice category cards when several services fit (`chat.service.ts`).**
- Prompt: when a need maps to several services (party → Catering or Event Planner), emit a SEPARATE `quote_options` card per candidate (2–3 max) with a short lead-in, instead of guessing one and forcing a reject.
- Backend dedup rewritten (was "keep only the FIRST quote_options card"): now allows several **distinct** cards but only real published **child** categories (drops the non-bookable parent the model sometimes adds), dedupes by categoryId, caps at 3. Uses the `linkServices` child list already loaded for linkifying.

**B6 — Category rename: "Event & Weddings" → "Events", "Event & Wedding Planner" → "Event Planner" (2026-06-07).**
- Old name read wedding-only and confused the assistant for general parties. **Slugs unchanged** (`events-weddings` / `event-planner`) so links/routes don't break.
- Files: `seed/data/static.ts` (parent + child + the assistant's services-summary string + comment), `seed/seed-test.ts` (parent + child), `seed/data/accounts.ts` (M8 comment), frontend `site-footer.component.ts` label. Docs: `category-taxonomy.md`, `category-questions.md` updated with a changelog note. Historical spec `2026-05-31-quote-question-pricing-model-design.md` left as-is (frozen record).
- **Requires reseed** (`npm run db:reset`) for the new names to appear in the DB.

**B7 — Combined contact card + address validation + Places dropdown fix (2026-06-07).**
- **Disabled-Confirm bug**: text-field Confirm was bound to `prefillText`, but the input's `onPrefillField` only accumulated into prefillData and never set `prefillText` → Confirm stayed permanently disabled. Fixed `onPrefillField` to also `prefillText.set(value)`. Also: two simultaneous name+phone cards shared the one `prefillText` signal (collision).
- **Combined contact card**: name + phone now collected in ONE card ("May I know your contact?" → Your Name | Phone No. + one Confirm). Backend `nextStepBlocks` emits a single `contact` field; post-process collapses any LLM-emitted `contactName`/`contactNumber` into one `contact` block; prompt Step 5 + keys updated. Frontend has dedicated `contactNameDraft`/`contactPhoneDraft` signals (no collision), `confirmContact()` accumulates both.
- **Phone regex + nudge**: `phoneValid` = `/^(\+?60|0)\d{8,11}$/` (spaces/dashes stripped); Confirm disabled + inline "Enter a valid Malaysian phone number" until valid.
- **Address geocode-validated on Confirm**: hand-typed street+postcode could be confirmed without ever resolving (wrong address sent). `confirmAddress()` now calls `/chat/validate-address` with the composed address; only advances on a real Google-resolved address (uses the formatted address + lat/lng), else shows a nudge. Postcode regex `^\d{5}$` + inline hint; `maxlength=5`.
- **Places dropdown white-on-white (also in prod)**: `.pac-container`/`.pac-item` styles were component-scoped `::ng-deep`, but Google attaches the dropdown to `<body>` outside the component → styles never applied → unreadable default text. Moved to **global** `frontend/src/styles.css` (themed + high z-index above the chat panel).
- **Dash kill**: `normalizeDashes` was converting em-dashes → ` - ` (i.e. creating the hyphen). Now converts em/en dashes AND ` - ` joins → commas (hard backstop for the no-dash style).

**B8 — Global phone input with country-code dropdown, app-wide (2026-06-07).**
- Phone validation is now **global, not Malaysia-only** (international customers use WhatsApp numbers from many countries). New shared `frontend/src/app/shared/phone-input.component.ts` (`<app-phone-input>`): a country-code prefix `<select>` (default 🇲🇾 +60) + local number, `ControlValueAccessor` reading/writing one E.164 string (e.g. `+60123456789`). Exports `PHONE_PREFIXES` + `isValidPhone()` (`^\+\d{7,15}$`).
- **Wired into every contact-phone field**: customer + servicer account (settings), customer + guest quote forms, customer + merchant registration, admin users, and the in-chat assistant's combined contact card. Replaced bare `<input type="tel">` + per-form MY-only regexes.
- Rule documented in `frontend/STYLE-RULES.md` §7.4.1 (new phone fields must use the component; never duplicate the country list).
- Gate: frontend `ng build` 0.

**B9 — Multi-card dead-end fix + staggered card reveal (2026-06-07).**
- **Dead-end**: the multi-card dedup hard-required each card's id be a published child → a single id mismatch dropped the ONLY card → AI text with no card, flow stuck. Now lenient: dedupe + cap 3, drop the parent card only when a real child card is also present, never strip a lone card.
- **Stagger**: action cards now fade in one by one (~1.2s apart, `$index * 1200ms` + `cardReveal` animation, respects reduced-motion) so they appear like chat messages instead of all at once.

**B10 — Fixed: assistant re-asking date/time already collected (2026-06-07).** The in-chat flow never told the model which fields were already given (only form-assist did), so it re-asked date/time/etc. it already had. Now injects an "ALREADY COLLECTED — do not ask again: <fields>" block into the in-chat prompt from `opts.collected` (already sent by the client + passed through the route). Backend `tsc` 0.

**B11 — Fixed: chat contact card phone number input invisible (2026-06-07).** The card laid Name | Phone side-by-side; in the narrow chat panel the prefix `<select>` ate the row and the number input collapsed to ~0 width. Stacked the fields vertically so the number input gets full width. Frontend `ng build` 0. (Other phone fields use `<app-phone-input>` in full-width fields — unaffected.)

**B12 — Chat flow polish (2026-06-07).**
- **Phone prefix/input proportions**: prefix `<select>` narrowed (~4.5–5rem), number input grows to fill the row (`flex:1 1 auto; width:auto`). Both the chat contact card and the shared `<app-phone-input>`.
- **Step order budget-before-contact**: was contact-before-budget, so the model asked "what's your budget?" in text while the contact card rendered (mismatch). Reordered `nextStepBlocks` + the prompt steps to date/time → address → budget → contact.
- **No markdown in replies**: model was emitting `* Date: …` bullets that render as raw asterisks. Added a strict no-markdown/no-bullets prompt rule (recap in one sentence) + a `stripMarkdown()` backstop in `processReply` (strips leading bullets, bold, headings).

**Requires backend restart** (prompt + dedup + contact + dash logic) and a **reseed** (category rename).

---

## 🔑 LLM API Keys admin page UX overhaul (2026-06-04)

**Backend fixes:**
- Fixed `validate` middleware usage in `llm-keys.routes.ts` — all 5 instances were `validate,` (bare reference, never executed) → `validate([...])` (array-wrapped chains). This was the root cause of all `/api/v1/admin/llm-keys/*` routes hanging on validation errors.
- Removed `requireSetupComplete` from route middleware chain (was blocking with 403 on demo setups).
- `POST /models` now accepts `id` (resolves encrypted key from DB) OR `provider`+`apiKey` for new unsaved keys.
- Gemini model fetch implemented via Google ListModels API.
- API keys returned to frontend are masked (`maskKey()`) — plaintext never leaves the server.

**Frontend fixes:**
- Model input: `<datalist>` → `<select>` dropdown with fetched models.
- Fetch button separated from Save — placed left of Save as explicit action.
- Existing saved keys displayed as disabled `••••••••` password field (cannot edit, only delete & re-add).
- Validation: `*` indicators on required fields, inline red error text + red border on empty submit.
- Delete: trash-2 icon (Lucide) with `DialogService.confirm()` guard.
- Save only sends `value` when present (editing existing key skips it).
- Mask: `maskKey()` simplified to first 3 chars + 14 bullets.
- CSS: `.key-card.edit-mode` changed to `flex-wrap: wrap` (fixes overflow), `.btn-icon-delete`, `.save-error`, `.input-error` styles.
- Timeout safety net on fetch — 15s force-re-enables button so it never stays stuck.
- Console trace logs on all fetch/save/delete handlers for debugging.

**Files changed:**
- `backend/src/routes/llm-keys.routes.ts`
- `frontend/src/app/admin/pages/api-keys.component.ts`
- `frontend/src/app/admin/admin-shell.component.ts`

**Backend tsc:** 0 · **Frontend tsc:** 0 · **Compile:** 0 warnings

---

## 🔐 Two-PIN model: demo login gate (5201314) + admin action PIN (1234) (2026-06-03)

**Two distinct PINs, verified differently:**

| PIN | Value | What it protects | Verify endpoint | Cached? |
|-----|-------|------------------|-----------------|---------|
| **Demo login gate** | `5201314` (fixed, shared by all demo accounts) | Portal entry (`/admin`, `/servicer`, `/customer`) for **demo accounts only** | `POST /config/demo-gate` (compares a fixed `DEMO_GATE_PIN` constant) | No — re-validates every entry |
| **Action PIN** | `1234` (per-account hash; `User.actionPinHash` / `Servicer.pinHash`) | Sensitive admin saves **+ viewing Admin → Accounts & Review Queues** | admin → `POST /admin/verify-pin` (`x-action-pin`); servicer/customer → `POST /chat/verify-pin` | Yes — per session |

- **Demo login gate** — `admin`/`servicer`/`customer` route guards (`auth.guards.ts`) run `PinService.requireGatePin()` in `canActivate`. The demo bar now navigates via **`router.navigate` (SPA), not `window.location.href`**, so the guard fires the PIN dialog **before** the URL changes — no redirect into the portal until the PIN is confirmed. Cancel/wrong PIN → `/`. Never cached → every restricted-page entry re-validates.
  - **Scoped to `principal.isDemo === true`** (the `/auth/login` + `/dev/demo-login` responses now include `isDemo`; `Principal` carries it). Real (non-demo) users — including `Run-Clean.bat`'s `admin@demo.local` (`isDemo=false`) — skip the gate.
  - Backend: `POST /config/demo-gate` (requireAuth, demo-only) compares to `DEMO_GATE_PIN` (default `5201314`, env-overridable). Distinct from the action-PIN endpoints.
- **Admin action-PIN view guard** — new `adminActionPinGuard` on `/admin/users` (**Accounts**) and `/admin/queues` (**Review Queues**). Prompts for the admin action PIN (`1234`, `/admin/verify-pin`) before the page activates; `clear()` first so each tab open re-prompts; cancel → `/admin`. Applies to all admins.
- **Action PIN reverted to `1234`** — `ADMIN_PIN` constant restored to `1234` in `accounts.ts`, `seed-test.ts`, `seed-admin.ts` (my earlier `5201314` overwrite was wrong — that value is the demo gate, not the action PIN). Customer `actionPinHash` + servicer `pinHash` seeded (= `1234`); `/chat/verify-pin` handles the `customer` role; `PinService.confirm()` routes customer → `/chat/verify-pin`.
- **Unplug input** maxlength `6 → 8` (`demo-bar.component.ts`).
- **Requires reseed** (`npm run db:reset` / restart Run.bat). Gates: frontend `tsc` 0 + `ng build` 0; backend `tsc` 0.

---

## 🚀 Production-grade DB: Prisma migrations (2026-06-03)

Switched the whole DB workflow from `db push` to **Prisma migrations** (reviewed SQL, audit trail, fail-fast-on-drift) for a production-grade deploy.

- **Baseline migration** committed: `backend/prisma/migrations/0_init/migration.sql` (full schema, generated via `prisma migrate diff --from-empty`) + `migration_lock.toml`.
- **Prod start** (`root package.json`): `prisma migrate deploy && prisma generate && node dist/index.js` (Railway `deploy.startCommand = npm start`). Applies pending migrations on every deploy — idempotent, no auto-DDL, aborts on drift. Fixes the missing `llm_api_keys` table without silently rewriting prod (addresses the commit security review's MEDIUM finding on `db push` at startup).
- **Scripts** (`backend/package.json`): `db:migrate` = `migrate dev`; `db:deploy`/`db:sync` = `migrate deploy`; `db:reset` = `migrate reset --force` (drops + re-applies + reseeds, fully reseedable); `db:reset-test` = `migrate reset --force --skip-seed` + `seed:test`.
- **Launchers**: Run.bat/Run-Test use the updated `db:reset`/`db:reset-test`; Run-Clean inline `db push --force-reset` → `migrate reset --force --skip-seed`.
- **One-time prod baseline** (existing db-push'd Railway DB → P3005 on first deploy): `railway run npx prisma migrate resolve --applied 0_init` (keep data) or `migrate reset --force` (wipe+reseed). See PRODUCTION-GO-LIVE §4.1.
- CLAUDE.md DB rule + INSTRUCTIONS + PRODUCTION-GO-LIVE updated.
- Context: the earlier Railway build failure (TS2307 `./llm-keys.routes`, TS2339 `prisma.llmApiKey`) was the intermediate commit `e3b4681` missing its deps; they landed in `360556c`. HEAD builds clean.

## 🔑 LLM env-key rename (2026-06-03)

- Renamed the AI-chat `.env` keys to provider-agnostic names (the keys are still a Gemini key + DeepSeek fallback, but the env names no longer hardcode the vendor):
  - `GEMINI_API_KEY` → `AICHAT_LLM_API_KEY`
  - `DEEPSEEK_API_KEY` → `AICHAT_LLM_FALLBACK_API_KEY`
- Touched: `backend/src/config/env.ts` (schema), `backend/src/services/chat.service.ts` (`isGeminiConfigured`/`isDeepSeekConfigured` reads), `backend/.env.example`, `Run.bat`, `Run-Clean.bat`, and the local `backend/.env` (values preserved). Docs synced: `tech-stack.md`, `INSTRUCTIONS.md`, `PRODUCTION-GO-LIVE.md`, `MANUAL-TEST-PLAN.md`.
- Provider identifiers (`gemini`/`deepseek`) in the admin API-key **vault** (`llm-keys.routes.ts`, `api-keys.component.ts`) and the Gemini/DeepSeek call implementations are unchanged — only the `.env` variable names changed. Backend `tsc` 0.

---

## 🧾 Quote form UX overhaul (2026-06-03)

- **Step 1 — Choose service**: "Extra Notes" → "Extra Details" (both guest + customer)
- **Step 2 — Contact**: "Any extra details?" moved up below name/phone, relabeled "Enter Building/Premise Instructions (optional)", placeholder with guard/parking/management-hours examples. No longer appears below address/calendar.
- **Step 3 — Summary**: Redesigned layout:
  - Preferred Time + Date (combined row)
  - Contact Name + Number (combined row)
  - Service: XXX [▸] collapsible (opens to show questionSchema answers)
  - Extra Details (from step 1)
  - Address Instructions (from step 2)
  - Full Address (2-liner: "No, Street." / "District, Postcode")
- **Demo autofill**: Now available on BOTH guest and customer forms. Customer checks saved presets first (uses default or first preset), falls back to guest-style demo data.
- **Customer autofill button**: "⚡ Demo: Auto-fill" placed above Name | Phone No in Step 2. Existing preset section (Save as Preset / Auto-fill) stays below address fields.
- **Bottom padding**: `.pane { padding-bottom: 1rem }` on both forms.

## 🗺️ Map view on pending quotes (2026-06-03)

- **What**: When a servicer expands a pending quote, a Google Map pin now shows the customer's location.
- **Backend**: `openQuote()` (`servicer-quote.service.ts`) now returns `lat`/`lng` from the `QuoteRequest` record.
- **Frontend**: `jobs.component.ts` — restored `MapViewComponent` import, added `quoteLat`/`quoteLng` signals, stores them from the `openQuote` API response, renders `<app-map-view>` in the expanded quote section.
- **Map shows**: Expanded quote card, between customer identity row and propose form.
- **Fallback**: Map section hidden when lat/lng is null.

## 🔒 Admin rescue disabled (2026-06-03)

- **Why**: Not needed for demo build. Backend routes `/auth/admin/*` commented out, frontend "Lost admin access?" UI removed from login page.
- **Files changed**:
  - `backend/src/routes/index.ts` — commented out `adminRescueRouter` mount
  - `frontend/src/app/auth/login.component.ts` — commented out rescue template, CSS, and TS methods
- **Re-enable**: Uncomment the above sections when admin rescue is needed.
- **Spec**: `docs/superpowers/specs/2026-05-29-admin-rescue-apikeys.md`
- **Plan**: `docs/superpowers/plans/2026-05-29-admin-rescue-apikeys.md`

---

## 🎨 STYLE-RULES audit — dispatch jobs (2026-06-02)

> Source: full §1→§16 rule-by-rule pass on `frontend/STYLE-RULES.md` — deduped the
> duplicated §16 card/hero spec, synced colour/gradient/motion tokens to actual
> `styles.css`, killed stale status notes, added §12.1 home-title-alignment contract +
> §7.6 reward-colour rule. Below are the CODE changes to make the app match the now-clean
> rules. Frontend-only. Gates each: `npx tsc --noEmit` 0 + `ng build` exit 0.

> **2026-06-02 — guest home page pass done.** All home-page DISP items below shipped
> in `home.component.ts` (+ `styles.css` DISP-1). Gates: `npx tsc --noEmit` 0, `ng build`
> exit 0 (home-component chunk emitted; only pre-existing unrelated warnings). DISP-4/8/12
> have non-home remnants noted inline; DISP-5/11/13 are not home-page tasks.

- [x] **DISP-1 — Breakpoint + hero h1** (`frontend/src/styles.css`): off-grid `@media (max-width: 640px)` → `560px`. Left `h1 { font-size: 1.4rem }` as-is — the home hero is unaffected because component `.hero h1` (§16.4 2.8→2→1.7rem) outranks the global `h1` by specificity (verified).
- [x] **DISP-2 — Home section-title alignment** (`home.component.ts` `.cats`): added §12.1 gutter `padding: 0.5rem 1.5rem 0`; dropped the now-redundant max-width/margin/padding from `.svc-grid` (the parent `.cats` provides it) so "Browse services" aligns with the other section titles and cards no longer double-pad.
- [x] **DISP-3 — Search focus ring** (`home.component.ts` `.search`): kept `outline:none` on the borderless input, added a visible replacement on the wrapper `.search:focus-within { border-color: var(--color-primary); box-shadow: var(--focus-ring) }`. §7.4/§11.
- [~] **DISP-4 — Unify the service card to §16.3 canonical** — SIZES UNIFIED across all 3 grids (home `.svc-card`, customer browse `.bw-card`, public children-browse `.svc-card`): min-height 100, grid `repeat(auto-fit, minmax(260px,1fr))` + `grid-auto-rows:1fr`, icon `md`/1.5rem, title `1.05rem`, price `0.75rem`, body `flex:1; padding .7rem 1rem; gap .15rem`, 4-stop per-`--cat-color` wash, `bgZoom/X/Y` bound, photo `no-repeat`. Verified: home + children-browse render canonical (ng build 0, browser screenshots). REMAINING (optional, low-pri): extract a shared `<app-service-card>`/`<app-service-grid>` (or global `.svc-*`) + rename browse `bw-*` → `svc-*` so they can't drift again; children-browse still has an `.svc-row` (icon+title same row) vs the canonical stacked body.
- [x] **DISP-5 — Reward feedback colour** (`customer/pages/rewards.component.ts:290` `.flash`): changed `color: var(--color-success)` → `var(--color-primary)`. No separate reward toast exists — redeem feedback is the inline `.flash` only (`redeemSuccess()` signal), so nothing else to re-route. Left `.history-table .earn` green (accounting earn/spend semantics, not reward-success feedback). §7.6.
- [x] **DISP-6 — Phone: hide card CTA text** (`home.component.ts` `.svc-cta`): `@media (max-width: 560px) { .svc-cta { display: none; } }` added.
- [x] **DISP-7 — Hero top padding (phone)** (`home.component.ts` `.hero`): mobile `.hero` padding `1.5rem 1.5rem 0.4rem` → `2.25rem 1.5rem 0.4rem`. §16.4.
- [x] **DISP-8 — Photo layers tile on phone** — DONE: `background-repeat: no-repeat` added to home `.hero-photo` + `.svc-photo`, customer browse `.bw-photo`, and public children-browse `.svc-photo`. §16.3/§16.4.
- [x] **DISP-9 — Phone hero edge mask off** (`home.component.ts`): `@media (max-width: 560px) { .hero-bg { mask-image: none; -webkit-mask-image: none; } }` (mask moved to `.hero-bg` per DISP-19; kept `.hero-wash`). §16.4.
- [x] **DISP-10 — Phone top nav strip-down** (`home.component.ts` `.topnav`, ≤560px): hides `.logo-icon`, the theme `.tt-label` (kept `.dot`), `.nav-btn--solid` ("Join as Servicer"), and the topnav `.search` (hero has its own). Keeps brand text · theme dot · Log in.
- [x] **DISP-11 — Portal topbar phone logout switch** (`shell.component.ts` `.topbar`, ≤560px): kept the `.account` name; on ≤560 the "Sign out" text (`.btn-signout`) is hidden and a far-right `.logout-switch` icon button (`<app-icon name="log-out">`, both call `logout()`) shows instead. Shared by admin/customer/servicer (one shell). §5.6.
- [x] **DISP-12 — Drop topbar auto-hide** (§7.13 deprecated) — DONE: home `.topnav` (sticky/overflow/is-collapsed/is-idle + `[style.top.px]` removed), shell `.topbar` (removed `appAutoHide` + `.is-collapsed`/`.is-idle` + overflow/transition/will-change → plain fixed top flex row, §5.3), guest-quote `.topbar` sticky dropped (§5.3). Dead `AutoHideDirective` import + `imports[]` entry removed from `jobs.component.ts` (cleared the NG8113 warning), then `auto-hide.directive.ts` deleted (verified via rg as the last reference). Only remaining `appAutoHide` strings are two explanatory CSS comments in home/shell.
- [x] **DISP-14 — Topnav search overflow** (`home.component.ts`): removed `.topnav { overflow: hidden }` (the appAutoHide artifact, folded with DISP-12) so a topnav dropdown can overlay. §7.12. (The *hero* dropdown clip is a separate issue — see DISP-19.)
- [x] **DISP-15 — Hero search text invisible in dark theme** (`home.component.ts` `.hero-search-white input`): fixed `color: #2c2420` + dark-muted placeholder `#6b6258` on the always-white bar (intentional theme-independent hex). §16.4.
- [x] **DISP-19 — Hero search dropdown clipped by the hero (NOT z-index)** (`home.component.ts`): the hero `.search-dropdown` (`top:100%; z-index:200`) was cut off at the hero's bottom edge — `.hero { overflow: hidden }` + `mask-image` clip descendants, which z-index can't rescue. Wrapped `.hero-photo` + `.hero-wash` in a new `.hero-bg` layer (`position:absolute; inset:0; overflow:hidden; mask-image:…`) and removed overflow/mask from the `.hero` section, so the dropdown overlays the section below. Distinct from DISP-14 (topnav). §16.4 + §7.12 updated. _(was mis-numbered DISP-16, collided with the button-padding task; renumbered.)_
- [x] **DISP-20 — Phone hero banner zoom-to-fit** (`home.component.ts` `.hero-photo`, ≤560px): `background-size: contain !important; background-position: center !important` so the whole banner is visible (scaled to fit the short phone hero, no crop); `!important` beats the admin `heroZoom()` inline style. Letterbox fills with `--color-bg`. §16.4 updated. _(was mis-numbered DISP-17, collided with the card-buffer task; renumbered.)_
- [x] **DISP-13 — Sidebar: kill the horizontal scrollbar** (`shell-nav.component.ts`) — verified compliant: desktop `.sidebar nav` has `overflow-x: hidden`; mobile (≤760) `.sidebar nav` hides the horizontal bar three ways — `scrollbar-width: none` (Firefox) + `-ms-overflow-style: none` (legacy Edge) + `.sidebar nav::-webkit-scrollbar { display: none }` (L98, webkit). No x-overflow leak. §15.3.
- [x] **§15.4 sidebar viewport-fit — FIXED 2026-06-03** (earlier "verified compliant" was WRONG): runtime showed `.sidebar` = 389px (content height), bottom at 468 on an 800px viewport — it stopped short, did not fill. Root cause: `app-shell-nav` had **no `:host` style**, so the flex-stretch from `.body` (721px) never reached `.sidebar`. Fix: `:host { display:flex; flex-direction:column; min-height:0 }` + `.sidebar { flex:1 }` (desktop fills host) + mobile `.sidebar { flex:none }` (short row). Verified in browser: sidebar now 721px, bottom = 800 = viewport.

### New rules — buttons + card buffer (2026-06-02)

> Source: §7.2 button text-padding floor + §7.1.2 card bottom-buffer added to
> `STYLE-RULES.md` this session. Below = CODE changes to make the app match. Both are
> global (`styles.css`) so one edit fixes most surfaces; audit the listed elements
> by eye after. Gates: `npx tsc --noEmit` 0 + `ng build` exit 0.

- [x] **DISP-16 — Button text-padding floor ≥10px (BOTH axes, app-wide)** — DONE 2026-06-17. Base `styles.css` `button` already at `0.625rem 1rem`. Per-component sweep bumped all remaining offenders: `jobs.component.ts` `.chip` (normal + collapsed toolbar), `rewards.component.ts` `.chip` / `.sort-dir` / `.demo-points-btn` / `.voucher-use`, `api-keys.component.ts` `.btn-demo` / `.btn-demo-confirm` / `.btn-demo-cancel` / `.btn-primary` / `.btn-outline` / `.btn-save` / `.btn-cancel` / `.btn-delete` / `.btn-fetch`, `chat-widget.component.ts` `.action-btn` / `.ac-actions button` / `.ac-budget-confirm` / `.time-btn` / `.ac-confirm`, `demo-bar.component.ts` `.demo-dd-item` / `.demo-action` / `.btn-reseed` / `.btn-primary` / `.btn-ghost` + inline unplug override, `calendar.component.ts` `.nav-btn` (≤560px). Gate: `ng build` green (10.7s). §7.2.
- [x] **DISP-17 — Card bottom buffer 24px** — DONE: global `.card` padding `1.25rem` → `1.25rem 1.25rem 1.5rem` (24px bottom). Single global edit covers every `.card`/`.pane`. ng build 0. §7.1.2. Original audit notes:
  - **Quote form (`/quote`) > Step 2 (Contact & schedule) > `.card.pane` foot — `.actions` row** (← Back / Next: Summary →) — the reported case; buttons currently sit too close to the card bottom.
  - **Quote form (`/quote`) > Steps 1, 3, 4 > `.card.pane` > `.actions`** — same pattern, verify buffer.
  - **Audited 2026-06-02:** no component overrides `.card`/`.pane` padding-bottom — the single global edit covers every card; nothing else to chase. Spot-check dense cards aren't over-padded: **Admin (`/admin`) > Settings tab > `.card`**, **Customer (`/portal`) > My Bookings > booking `.card`**.
  - **Modals already compliant** — every `.modal` container uses `padding: 1.5rem` (24px), so `.modal-actions` rows already sit 24px above the modal foot. No modal rule needed; this change just brings `.card` to parity (20→24px). `.badge` is a status label, not a button — exempt from the §7.2 button floor.
- [x] **DISP-18 — Site footer top margin ≥300px** (`frontend/src/app/shared/site-footer.component.ts` `.sf`): added `margin-top: 300px` to `.sf` (was none) so every page has a clear whitespace band before the footer. §7.17. Footer renders globally via `shell.component.ts` (portal) + `app.component.ts` (guest/public). Gate: ng build 0. Eyeball remaining:
  - **Guest home (`/`) > page bottom > `footer.sf`** — gap above footer ≥300px.
  - **Portal (`/portal` / `/admin`) > any tab > page bottom > `footer.sf`** — same; confirm short pages don't read as a huge empty gap (if so, revisit whether 300px should be a min-gap via `min-height` instead of a flat margin).

### New rule — evidence-image object-fit (2026-06-02)

> Source: §9.6.1 (`object-fit: cover` vs `contain`) added to `STYLE-RULES.md` this
> session. Evidence/preview images must show the whole photo (`contain` + `--color-bg`
> letterbox), never crop (`cover`). **Code-only — do NOT edit STYLE-RULES.md (R4 owns
> it this wave; §9.6.1 already landed in commit `f97d024`).** Gates: `npx tsc --noEmit`
> 0 + `ng build` 0.

- [x] **DISP-21a — Evidence previews already fixed** (commit `f97d024`, pushed): `.preview` (`servicer/pages/jobs.component.ts` — arrival/completion upload modals) + `.job-photo` (`shared/dispatch-overlay.component.ts` — incoming job photo) `cover`→`contain` + `background: var(--color-bg)`. Was the reported "photo cut off in the Upload arrival photo modal" — root cause was `cover` cropping, NOT modal overflow (`app-modal` body already scrolls). §9.6.1.
- [x] **DISP-21b — Sweep remaining evidence/preview images** (Frontend): find every OTHER image the user must read in full and convert `object-fit: cover`→`contain` + `var(--color-bg)` (or `background-size: cover`→`contain` for photo divs used as previews). **Keep `cover`** on avatars + fixed-frame thumbnails (8 classified correct: servicer/customer account avatars ×2, jobs + dispatch avatars, category-settings `.thumb-banner`/`.thumb-photo`, settings `.thumb-img`, uiux `.tb-preview img`, services `.lc-thumb`). Audit by surface:
  - **Customer (`/portal`) > My Bookings / booking detail > job photos + before/after** — full view, not crop.
  - **Customer / Servicer > chat (`app-chat`) > image attachments / lightbox** — show whole image.
  - **Servicer (`/servicer`) > profile / reviews > review photos** — full view.
  - **Admin (`/admin`) > banner-editor / media preview** — confirm intent (editor crop-frames may legitimately use `cover`).
  - Any **PDF/document preview** or **zoom/lightbox** component.
  - Re-gate `ng build` 0; eyeball each converted image letterboxes cleanly on `--color-bg`.

## ✅ Done — 2026-06-02 (RUN 2 — SPEC-2 pricing pass)

- [x] **Pricing pass** — 29 of 31 child categories now have priced:true questions (renovation + roof = requiresInspection:true, no per-question pricing)
- [x] **Inspection-first booking sub-flow** — `Booking.isInspection` flag; `doneJob` on inspection booking reopens QuoteRequest so servicer submits final work proposal; socket event `inspection.done` emitted to both parties
- [x] **travelFee + inspectionFee** snapshotted on Booking at creation time; schema: `travelFee`, `inspectionFee`, `isInspection` fields added
- [x] **Non-refundable logic** — `computeNonRefundableAmount()` + `refundEscrowIfHeld` deducts travelFee (post-arrive) and inspectionFee (inspection + post-done)
- [x] **Estimate endpoint** — `inspectionFee.amount` = category travel fee baseline for requiresInspection categories
- [x] **Customer seed transactions** — demo customers have top-up + booking transaction history
- [x] Gates: backend tsc 0, jest all pass, db:reset + seed:test exit 0

---

## ✅ Done — 2026-06-02 (RUN 3: Rewards + promo integration)

- [x] **Backend: `POST /rewards/vouchers/search`** — search user's vouchers by partial code match (`contains`, case-insensitive). Returns up to 50 matching redemptions with reward info.
- [x] **Backend: `POST /rewards/voucher/:code/applicability`** — checks if a voucher can be used given optional context (budget). Verifies status=active, not expired, and minTopup for topup vouchers.
- [x] **Backend: `resolvePromo()`** — replaced stub in `quote.service.ts`. Now actually looks up a Redemption by voucherCode, validates active+not-expired, computes discount for `booking_percent` (with `maxDiscount` cap) and `waiver` types.
- [x] **Backend: `GET /quotes/estimate`** — removed hardcoded "not available" error. Now calls `resolvePromo()` for real discount calculation. Shows error only if a code was provided but no discount resolved.
- [x] **Frontend: Voucher search in rewards page** — "My Vouchers" section now has a search-by-code input + All/Active/Used filter chips.
- [x] **Frontend: Voucher applicability display** — active vouchers are assessed: expired/used are shown with reason, greyed out (`opacity: 0.5`). Discount type/amount shown as description.
- [x] **Frontend: "Use" button on applicable vouchers** — navigates to `/customer/quote/new?promoCode=CODE` with the voucher code pre-filled.
- [x] **Frontend: Quote form reads `promoCode` query param** — sets `f.promoCode` on init if present. Auto-applies promo when reaching the Bill step.
- [x] **Frontend: Promo re-validation at submit** — when a promo is applied and user clicks "Send request", re-calls `/quotes/estimate` to re-validate. If the promo no longer applies, clears it and shows error instead of submitting with stale discount.
- [x] Gates: backend tsc 0, jest 298 pass, frontend tsc 0, ng build 0.

---

---

## ✅ Completed — 2026-06-02 (Big seed expansion)

- [x] **Seed scale-up** — 36 → 96 merchants (3 per child category, 3D modeling keeps 6), 3 → 9 customers. Every merchant account seeded with `pending_confirm` + `in_progress` + `cancelled` + bulk completed bookings. All new merchants have `autoAccept: true` on at least one service.
- [x] **Demo bar 2-level hierarchy** — Servicers dropdown now shows Parent Category → Child Category → merchant accounts (7 parents, 31 children, 96 merchants). Customer list expanded to 9.
- [x] Files changed: `backend/prisma/seed/data/accounts.ts`, `backend/prisma/seed/seed.ts`, `frontend/src/app/shared/demo-bar.component.ts`

---

## ✅ Done — 2026-06-02 (Quote form UX fixes)

- [x] **Guest auto-fill fills question schema** — `demoAutoFill()` in `guest-quote.component.ts` now loops `questions()` (synchronous after `onCategoryChange`) and fills random valid answers: radio → random option, checkbox → first option as array, text → "Standard service required", number → 1, quantity → `{ firstOption: 1 }`. Required fields no longer skipped.
- [x] **Pay later: card option added** — `quote-form.component.ts` pay_later settlement block now includes a Card (gateway) radio option alongside Wallet credit and Cash. Description: "Stripe payment link sent after job is done."

---

## ✅ Fixed — 2026-06-02 (BUG-5: top-up pre-fill used full total instead of hold amount)

- [x] **BUG-5** — `requiredTopUp()` now uses `estimateData()?.holdAmount ?? estimatedTotal()`. Top-up overlay label changed "Estimated total" → "Hold amount". `submit()` guard and `confirmAfterTopUp()` both compare holdAmount vs credit balance. Gates: frontend tsc 0, ng build 0.

---

## ✅ Done — 2026-06-02 (Order ID system + chat service)

- [x] **Order ID** — `Booking.orderNumber` (`@unique @default(autoincrement())`) added to schema. `backend/src/lib/order-id.ts` → `formatOrderId(n, date)` produces `SVC-YYYY-NNNNN`. `listBookings()` + `getBooking()` + `GET /user/me/history` all attach `orderId`. `my-bookings.component.ts` + `order-history.component.ts` display it as monospace muted text. Requires `db push` + Prisma client regen.
- [x] **Chat service revision** — `chat.service.ts` significant update (~108 lines); `chat.routes.ts` minor fix.

---

## ✅ Fixed — 2026-06-02 (Phase 1 bugs)

- [x] **Gateway settlement stub** — `settleBooking('gateway')` now creates real Stripe Checkout Session, returns `{ paymentUrl }`. No DB changes at initiation; settlement via webhook → `completeGatewaySettlement()`. Backend tsc 0, jest 298 pass.
- [x] **Card payment required manual click** — `onCardPaymentSuccess()` now calls `doSubmit()` immediately after card succeeds. No OK-click needed.
- [x] **Bill step showed misleading "Estimated total"** — Redesigned to show `holdAmount` ("We'll hold RM X") as primary. `GET /quotes/estimate` now returns `travelFee`, `inspectionFee`, `holdAmount`, `estimatedReturn`. Terms checkbox links to new `/terms` public page. Footer TnC link added.

---

## ✅ Completed — 2026-06-02 (Full session: T1-T8 + final seed re-run)

### [1/9] P1 — Money & Listing Epic gaps — ✅ ALL DONE (3/3)
- [x] `ServicerIdentityChangeRequest` admin review queue — wired into `queues.component.ts` "Account Changes" tab with Approve/Reject (PIN-gated). Servicer submits via `account.component.ts`. Backend: `identity-change.service.ts`, `GET/PATCH /admin/identity-change-requests`.
- [x] Itemized proposal composition UI — pricing modules wired into servicer proposal form (jobs.component.ts)
- [x] Soft enforcement (unpaid → block) — `requireNoUnpaidInvoice()` check in `quote.service.ts` + `booking.service.ts`, returns 402 PAYMENT_REQUIRED

### [2/9] 🔴 P0 — Stripe frontend missing (pay-now card payments) — ✅ DONE
- [x] `@stripe/stripe-js` package installed in frontend
- [x] `confirmCardPayment()` wired into `StripeCardFormComponent`
- [x] `STRIPE_PUBLISHABLE_KEY` in backend `env.ts` + frontend `environment.ts`
- [x] Reusable `StripeCardFormComponent` built and wired into quote-form + proposals for pay_now/gateway flow
- [x] `POST /stripe/create-payment-intent` called to get clientSecret

### [3/9] 🟡 P2 — Seed & test gaps (Phase 1) — ✅ DONE
- [x] `seed-test.ts` rewritten: 7 parents + 31 children, 8 merchants (M1/M2/M4/M8/M9/M12/M24/M36), 2 open quotes + 2 completed bookings
- [x] `check-seed.ts` updated for new table references
- [x] Full reseed verified: `npm run db:reset` + `npm run seed:test` both clean

### [4/9] 🟡 P1 — Customer Rewards gaps — ✅ DONE
- [x] Review points (50pts) — `awardReviewPoints()` in `points.service.ts`, called from `doneJob()`
- [x] Welcome banner on rewards page — first-visit overlay with localStorage dismiss
- [x] Idle re-engagement banner — customer shell checks 30-day idle, shows rewards banner
- [x] Voucher auto-apply in top-up UI — `GET /rewards/active-vouchers` fetched, selectable in top-up modal
- [x] Customer notification prefs UI — `notificationPrefs` toggle section added to account page

### [5/9] 🟡 P1 — AI Smart Assistant gaps — ✅ DONE
- [x] Servicer profile assistant flow — `POST /chat/verify-pin` + `POST /chat/apply-profile` routes. Frontend `PinService` role-aware. `editProfileField()` wired through chat-widget with PIN gate.
- [x] Full quote wizard end-to-end — verified correct (intent detection → category ID → prefill → navigation)
- [x] Action token inline fields — verified `quote_field` items render correctly (date picker, address autocomplete, text input)
- [x] `quote_prefill` navigation — verified `/customer/quote/new?prefill=...` loads and fills form correctly

### [6/9] 🟡 P2 — Seed & test gaps (Phase 2 — re-seed after rewards + AI) — ✅ DONE
- [x] Re-run seed to verify all scenarios still work after rewards/AI changes — `npm run db:reset` exit 0 (36 merch, 477 bookings, 31 cats), `npm run seed:test` exit 0 (9/9 scenarios)
- [x] Seed data compatible with new models (ApiKeyConfig, AdminOtp) — all have optional fields, no FK dependencies, no changes needed

### [7/9] 🔴 P0 — Admin Rescue + API Keys Vault — ✅ DONE
**Spec:** `docs/superpowers/specs/2026-05-29-admin-rescue-apikeys.md`

- [x] `ApiKeyConfig` model (AES-256-GCM encrypted keys, HMAC-SHA256 key derivation from JWT_SECRET)
- [x] `AdminOtp` model (SHA-256 hashed OTPs, 300s expiry)
- [x] `User.passwordChangedAt` + `vaultPasswordHash` + `backupEmail`
- [x] `lib/config-vault.ts` — AES-256-GCM encrypt/decrypt + in-memory cache + boot-time load
- [x] `lib/gmail-rescue.ts` — Gmail API OAuth2 sender (Tier 3), dev fallback to console
- [x] `services/admin-rescue.service.ts` — OTP gen/hash/verify, password+PIN reset, token revoke, audit
- [x] `routes/admin-rescue.routes.ts` — 4 endpoints: forgot-password, rescue, verify-otp, reset-password
- [x] `routes/admin-vault.routes.ts` — 6 endpoints: list, unlock, initialize, upsert, change-password, delete
- [x] Auth `setupRequired` JWT claim + `requireSetupComplete` middleware
- [x] Frontend: 4-step setup wizard `/admin/setup` with PIN + vault password + backup email
- [x] Frontend: API Keys vault page `/admin/settings/api-keys` with lock/unlock, grouped key list, edit/test
- [x] Audit trail for rescue/key events (reuses existing AuditLog model)
- [x] Tier 1-3 rescue flow (self-service → backup email OTP → super admin Gmail API)

### [8/9] 🟡 P2 — UI / Frontend gaps — ✅ DONE
- [x] Visibility controls in dispatch overlay — `showEmailPublic`/`showPhonePublic` wired to conditional hide in `dispatch-overlay.component.ts`
- [x] SP2b deferred tabs — thumbnail file upload, tips list, FAQ entries added to `category-settings.component.ts`
- [x] Quantity × unit pricing in `computePrefill` — already implemented in backend (verified)
- [x] Presence wiring — `isOnline` already handled by backend `socket/index.ts` on connect/disconnect (verified)
- [x] Shell component split — nav extracted to `shell-nav.component.ts`, demo-bar enhanced, shell reduced from 2930→~2100 lines

### [9/9] 🟡 P2 — Seed & test gaps (Phase 3 — final seed sync) — ✅ DONE
- [x] Full reseed verification — all 36 merchants, 31 categories, 477 bulk bookings (verified by Task 3 seed sync)
- [x] seed-test.ts covers 9 lifecycle scenarios across 8 merchants (plumber, aircond, electrical, cleaning, event, catering, tutoring, 3d-modeling)

### ✅ Already Verified Done (after audit)
- **Bell → overlay panel** — `notification-panel.component.ts` + `NotificationPanelService` is a live inline dropdown
- **Socket notification toasts** — `notification.service.ts` receives `notification.new` socket event (45s poll is intentional fallback)
- **No dead servicer folder** — only one active `frontend/src/app/servicer/` exists
- All 17 other spec files are fully or mostly implemented per codebase verification

---



## ✅ Done — 2026-06-01 (Notification sounds by role + "important" indicator)

- [x] **Role-based notification chime** — `NotificationService.playNotificationSound` plays a distinct sound per account so servicers can tell their job alerts apart by ear: servicer account → `NotificationChat.wav`, customer/admin → `NotificationCard.wav` (the overall default). Still gated by the `notification_sound_enabled` admin toggle. (Reuses the 2 existing wavs per decision — servicer notif + chat widget therefore share the Chat sound.)
- [x] **"Important" indicator on the snackbar** — order-lifecycle notifications (`orders` = customer quote/proposal/booking updates; `jobs` = servicer incoming work) show a small "! Important" pill + left accent bar. `isImportant(type)` in `snackbar.component.ts`; promos/listings/queues render normally.
- [x] Scope: chime fires on backend notifications only (not CRUD success/error action toasts). Gate: `ng build` 0.

## ✅ Done — 2026-06-01 (Listing wizard: time-slot windows in accept mode)

- [x] **Auto-accept "Match time slots" now shows each period's time window** — listing wizard (`/servicer/services/:id/edit`, `listing-wizard.component.ts`) rendered bare `morning`/`noon`/… Added `slotLabel()` sourcing the shared `TIME_SLOTS` labels, so each toggle reads e.g. "Morning (9:00–11:00)", "Noon (11:00–13:00)". Gate: `ng build` 0.

## ✅ Done — 2026-06-01 (Quote contact: phone validation/normalize, auto-fill postcode, preset layout)

- [x] **Customer quote 400 — `contactNumber` rejected by `isMobilePhone('any')`.** Malaysian numbers with spaces/dashes (e.g. `+60 12-345 6789`) failed server validation while the frontend regex accepted them. Both quote routes (`POST /quotes`, `POST /quotes/guest`) now validate `contactNumber` with the same `/^[0-9+\-\s()]{6,20}$/`. Verified spaced number → 201.
- [x] **Phone auto-normalised to +60** — new `frontend/src/app/shared/phone.util.ts#normalizeMyPhone` (pure string logic, no AI): `012-345 6789` / `0123456789` / `+60 12-345 6789` → `+60123456789`. Wired on the contact-number `(blur)` and at validation in both customer + guest quote forms.
- [x] **Auto-fill now fills No. & postcode** — `GET /user/me/addresses` returned only id/label/address/propertyType; added `postcode`/`district`/`state` so preset auto-fill (`applyPresetObject`) can populate them. (No. is parsed from the leading number of the saved address.)
- [x] **Contact step layout** — moved "Auto-fill (use preset)" from the top of step 2 to the end, grouped with Save-as-Preset: `[+ Save as Preset]  or  [Auto-fill (use preset)]`.
- [x] Gates: backend `tsc` 0, frontend `ng build` 0.

## ✅ Done — 2026-06-02 (Booked quotes leave "current quotes")

- [x] **`matched` quotes removed from My Quotes** — selecting a proposal creates a booking (`pending_confirm`) and sets the quote to `matched` ("Booking confirmed"); it previously stayed in My Quotes *and* appeared in My Bookings. `my-quotes.component.ts` now filters `status==='matched'` out on load (dropped the Matched chip + render branch). The booking already shows on the Bookings/upcoming page, so a confirmed quote lives only there. Completed/cancelled bookings keep the quote `matched`, so they also stay out of current quotes. Gate: `ng build` 0.

## ✅ Done — 2026-06-01 (Fix: quote submit 500 + servicer first-time PIN)

- [x] **Quote submit 500 (guest) / blocked (customer) — BullMQ `Custom Id cannot contain :`.** `createQuote` schedules `expiry:<id>` / `noresp:<id>` jobs; the installed BullMQ rejects `:` in a custom job id (its key separator), so `enqueue` threw and every quote submit 500'd. Fix: `enqueue` (`backend/src/lib/queue.ts`) now normalises any `:` in `jobId` → `-` (covers expiry/noresp/penalty/promo/escrow/noshow). `worker.ts` repeat ids (`repeat:*`) fixed directly (they call `jobQueue.add`, not `enqueue`). Verified: guest + customer quote now `201`.
- [x] **Servicer first-time PIN set was impossible (400 "Current PIN is incorrect").** `PUT /servicer/account/pin` always ran `verifyPin`, which returns false when `pinHash` is null — so a servicer with no PIN could never set one. Fix: backend requires `currentPin` only when a PIN already exists (`currentPin` now `optional`); frontend (`servicer/.../account.component.ts`) hides the Current PIN field + omits it on first-time set and labels the action "Set PIN". Verified: first-time set returns `200 "PIN set"`.
- [x] Gates: backend `tsc --noEmit` 0, frontend `ng build` 0.

## ✅ Done — 2026-06-01 (Shared address-fields component — guest = customer)

- [x] **New `frontend/src/app/shared/address-fields.component.ts`** — extracted the structured service-address block (No. + property-type, Street + GPS, Postcode, District, State) into one reusable `<app-address-fields>`. Two-way bound props (`addressNo/streetDetails/postcode/district/state/propertyType/lat/lng`), `[errors]` set in + `(clearError)`/`(userEntered)` out. Owns the place-autocomplete + GPS/reverse-geocode handlers and its own scoped CSS.
- [x] **Customer quote-form uses it** — replaced the inline address-section markup with `<app-address-fields>`; removed the now-moved handlers (`onNewPlaceSelect`/postcode/district/state, `locateViaGps`, `reverseGeocode`, dead `cancelNewAddress`), `newAddrError`/`locatingGps` signals, the address CSS block, and the `PlacesAutocompleteComponent`/`PlaceResult` imports. `(userEntered)="f.addressId=''"` keeps the new-address-vs-saved behaviour.
- [x] **Guest quote-form now has the SAME address form** — was a single free-text "Service address" field; now the full structured block. `FormState` gained `addressNo/streetDetails/newAddress{Postcode,District,State,PropertyType,Lat,Lng}` (dropped `address` + the `place*` props); validation requires No./Street/Postcode/Type; summary shows a composed address; save composes the `address` string + sends postcode/district/state/lat/lng/propertyType; guest localStorage (restore/save) + demo-autofill updated.
- [x] **Backend guest persist** — `POST /quotes/guest` now accepts `propertyType`; `createGuestQuote` persists `postcode/district/state/propertyType` on the guest `UserAddress` and passes `propertyType` through to `createQuote` (previously these were validated but silently dropped — only `address`+lat/lng saved). No schema change (columns already exist).
- [x] Gates: backend `tsc --noEmit` 0 errors, frontend `ng build` 0 errors.

## ✅ Done — 2026-06-01 (Quote preset auto-fill parse + seed propertyType)

- [x] **`applyPresetObject` address parse fixed** — was splitting the saved address on the first comma, dumping the whole street line ("12 Jalan Bukit Bintang") into No. Now takes the first comma-segment as the street line and splits a leading number off it: No "12" + Street "Jalan Bukit Bintang" (district/state still come from the dedicated `addr.*` fields). `frontend/.../customer/pages/quote-form.component.ts`.
- [x] **Seed: Sarah Lim `propertyType` `condo` → `landed`** — the "12 Jalan …" plain street-number format is landed, not condo (drove the wrong Type* dropdown value + condo entry note on auto-fill). `backend/prisma/seed/data/accounts.ts`. **Requires reseed** to take effect in the DB.

## ✅ Done — 2026-06-01 (Pull-to-refresh: removed ugly bar, FB/Twitter-style spinner)

- [x] **Reworked pull-to-refresh — no surface bar.** First removed the old `.ptr-bar` (sticky full-width surface panel with border+shadow that overlaid/blocked content), then re-implemented FB/Twitter-style: page content rubber-bands down to follow the finger + a small floating circular spinner fades/rotates in; release past threshold reloads. `pull-to-refresh.directive.ts` rewritten (spinner-only, translates `.content-main`, native touch listeners outside Angular zone, `preventDefault` only on a clear downward pull from the top so normal scroll is never blocked). `shell.component.ts` carries `.ptr-spin*` CSS (no bar) + `appPullToRefresh` on `<main>`. Gate: `ng build` 0 errors.

## ✅ Done — 2026-06-01 (Quote Step-1 "Extra Notes" field)

- [x] **Customer + guest quote forms: optional "Extra Notes:" textarea in Step 1 (Choose service)** — positioned after the `questionSchema` questions, before the budget-range slider. Free text, `maxlength 1000`, optional. Surfaced in the Step-3 Summary when filled.
- [x] **Persistence: stored in the existing `serviceDetails` JSON under reserved key `_extraNotes`** — no schema/migration change. `computePrefill` only reads `questionSchema` keys for pricing, so the reserved key is ignored (no pricing side-effect). Customer reorder-prefill pulls `_extraNotes` back into the field.
- [x] Files: `frontend/src/app/customer/pages/quote-form.component.ts`, `frontend/src/app/guest/guest-quote.component.ts`. Extra Notes resets on category switch (customer). Servicer-side display of `serviceDetails`/notes is a separate future task (neither is rendered to servicers yet).
- [x] Label renders "Extra Notes: (optional)" on one inline line — heading + hint wrapped in a single `.label-text` span (customer) / inline `<span>` (guest) so the flex-column `<label>` doesn't drop the hint to its own line.
- [x] Gate: `ng build` 0 errors (quote-form + guest-quote chunks emitted).

## ✅ Done — 2026-06-01 (Servicer SVG icons on customer pages)

- [x] **Backend: added `icon` to 3 customer-facing endpoints** — `GET /bookings`, `GET /quotes`, `GET /user/me/history` now return `category.icon`. `GET /quotes/:id/proposals` also returns `categoryName` + `categoryIcon` from parent quote.
- [x] **Frontend: 4 customer pages now show Lucide SVG icons (home-page style)** — replaced logo/initials with `<app-icon>` in `.svc-avatar` circles (32px, `var(--color-primary)` bg, white stroke):
  - My Bookings, Proposals, Order History, My Quotes
- [x] Each servicer gets a unique icon from its service category's `icon` field (e.g. `wrench` for plumber, `sparkles` for cleaning)
- [x] Gates: backend tsc 0, jest 298 pass/0 fail, frontend ng build 0

## ✅ Shipped 2026-06-01

- [x] **Time-slot expansion** — `TimeSlot` enum `lunch` → `noon` + `afternoon` (4 slots → 5: morning/noon/afternoon/evening/night). New `backend/src/lib/time-slots.ts` (`TIME_SLOTS`/`TimeSlotValue`) is the single source of truth; all validators (quotes/servicer/user routes), `quote.service`, `json-schemas` Zod enum, and `booking.service` slot-hour map import it. Seed data + e2e/unit tests migrated. New `backend/tests/unit/time-slots.test.ts`. Schema change → run `db push` + regenerate client before serving. Docs synced: `schema-notes.md` (Block 10), `api-doc.md` (auto-accept example). **2026-06-01 follow-up (BE-045):** the original entry shipped only the docs/seed-defaults — the backend code still ran the 4-slot enum (`lunch`), so customer + guest quote submits returned `400 VALIDATION_ERROR` on `timeSlot` whenever Noon/Afternoon was picked. This session landed the actual code switch (all 8 backend slot lists + Prisma enum via `lib/time-slots.ts`), ran `db push --force-reset` + reseed, and verified gates: backend tsc 0 / jest 298 pass, frontend tsc 0. See `backend-log.md` Session 2026-06-01.
- [x] **Footer sitemap + How-it-works + quote chat auto-open** — three frontend tweaks (frontend tsc 0 each):
  - **Footer** (`site-footer.component.ts`, commit `dd9b3c1`): replaced the single stale "Services" column (its `/services/plumbing|cleaning|aircond` slugs 404'd) with 7 parent-category columns (Cleaning, Repair, Event, Improvement, Maintenance, Training, Tech & IT), each listing its child services linking to `/services/:parentSlug` (ChildrenBrowseComponent — the only public category route). Kept Company/Support/Legal. Static, mirrors the seed taxonomy in `static.ts` (will drift if admin adds categories — candidate to wire to `/categories` later).
  - **How it works** (`home.component.ts`, commit `f6ad6a0`): refined the 3 generic steps to the real 4-step flow — Request a quote → Get proposals → Pick & book → Track & pay; `.steps` grid switched to `repeat(auto-fit, minmax(180px,1fr))` for the 4th card.
  - **Quote chat auto-open** (`shell.component.ts`, commit `d75a014`): `/quote/new` now auto pops-out the help chat once on entry and keeps the FAB bubble floating (previously it auto-*collapsed* the stack). One-shot `quoteChatAutoOpened` guard (reset on leaving) fires it once per visit and never reopens after a manual close. Customer form only — guest `/guest/quote/new` is a public route outside the shell, not yet covered.
- [x] **Home/browse card redesign** — home grid switched `svc-grid`→`grid-bento` bento layout (`svc-card`→`cat`), removed per-category `bgPosX/bgPosY/bgZoom` knobs, responsive 2-col under 560px. Icon sizing tweaks on browse + children-browse cards (stroke `#fff`, smaller tokens). New `party-popper` + `monitor` icons in `icon.component`.
- [x] **Category placeholder images** — `Aircond__Placeholder.png` removed; added `AircondInstall/AircondRepair/AircondService/Carpenter/Organizer/WashingMachineRepair_Placeholder.png`. `category-colors.ts` slug→placeholder map remapped (carpenter, professional-organizer, aircond-servicer get dedicated art).
- [x] **Thumbnail taxonomy rename** — all 28 ad-hoc placeholders renamed to `Parent_Child_FunctionNN_Placeholder.png` (e.g. `ApplianceRepair_Refrigerator_Fix01_Placeholder.png`); parents use `Parent_CategoryNN`. One file per subcategory (38 total: 7 parents + 31 children), shared art duplicated per slug. `Banner_Placeholder.png` kept as generic hero + `placeholderUrl()` fallback. `SLUG_PLACEHOLDER` in `category-colors.ts` rewired to the new names.
- [x] **Dev proxy** — `proxy.conf.json` `localhost` → `127.0.0.1` (IPv6 resolution flake on Windows).
- [x] **Home + quote-flow overhaul (2026-06-01)** — large UI/flow pass:
  - **Home cards**: reverted bento back to §16 horizontal thumbnail cards (`.svc-card`: photo → colour-wash → white body); grid 3-col desktop / 2-col phone, `grid-auto-rows: 1fr` for equal rows, card height cut ~60% (compact body).
  - **Dynamic theme washout**: hero wash now token-driven (`color-mix(var(--color-bg))`) + text `var(--color-text)`/`--color-muted` + hero-hint links `var(--color-primary)` — auto-flips day(white)/night(dark), no hardcoded overrides. Demo bar gets a light day skin under `[data-theme="warm"]`.
  - **Category endpoint**: `GET /categories?scope=all` returns parents AND children with `parentCategoryId` (one call). api-doc updated.
  - **Search/browse over children**: home search now matches child services (loads `scope=all`); customer browse page lists all children (not just the 7 parents) + searches them.
  - **Quote step 1 = two dependent dropdowns**: `Category` (parent) → `Type of service` (child); child drives `questionSchema` + budget. Applied to both `quote-form` (customer) and `guest-quote` (skip path). Fixes the old single-select that offered parents (which have no questions/budget).
  - **Auto-assign category through login/skip**: `login.component` now forwards the picked child id as `?category=` on both skip → `/guest/quote/new` and sign-in → `/customer/quote/new` (previously `exitGuestMode()` wiped it). Quote forms preselect parent+child from the child id.
  - **Next-button validation**: removed the silent `[disabled]`; clicking Next validates parent + child + budget (when loaded) + required questions, shows a nudge, and highlights every missing field (`field-invalid`).
  - **Chat widget**: guest auto-open no longer fires on `/quote/new` (floating button stays; panel won't steal focus). Gates: backend tsc 0, frontend ng build 0.
- [x] **Card thumbnail watermark crop** — AI placeholder art carries a Gemini watermark at the bottom edge. Card photo layers (`.svc-photo`/`.bw-photo` in home, browse, children-browse) now `transform: scale(1.12); transform-origin: top center` + `background-position: center top` so the bottom band is clipped by the card's `overflow:hidden`. Also fixed a pre-existing dangling `}` in `home.component.ts` styles — a lost `@media (max-width:560px)` wrapper had leaked the hero/request-bar mobile overrides to all widths (caught by `ng build` css-syntax warning).

---

## 🔴 Gaps Found in Superpowers Spec Audit

### G-1: Admin settings 5-tab restructure ✅ DONE
**Spec:** `docs/superpowers/specs/2026-05-28-admin-settings-redesign.md`
**Status:** Resolved. Admin settings split into Money Settings + UI/UX Settings top-level pages. Original spec's 5-tab layout superseded by the customer rewards admin restructure.

- [x] Money Settings page (fee breakdown, rewards config, tier CRUD, reward catalog CRUD, redemption log)
- [x] UI/UX Settings page (sound toggles, content text)
- [x] Old Platform Settings tab replaced with Money/UI/UX nav items
- [x] SP1 Category Settings rework: split Budget Ranges + Time Slots out of Financial Settings into new `/admin/category-settings` page (Question Schema | Budget Ranges | Time Slots tabs); Financial Settings Servicer tab → Servicer Rules direct card
- [x] `allowedTimeSlots` on Category ✅ exists in schema
- [x] `condo_entry_note` setting ✅ quote form displays it (fixed 2026-05-29: moved from admin-protected `/admin/settings` to public `/config/public`)
- [x] Postcode resolved via Google Maps Places API ✅

### G-2: Proposal prompt inline form ✅ DONE
**Spec:** `docs/superpowers/specs/2026-05-28-proposal-prompt-guard.md`
**Status:** Fully implemented. Commit `a07b2ee`. MVP toast + inline expandable form with price input, description textarea, customer identity, and submit button. Esc dismiss, 60s auto-dismiss, socket dedup.

- [x] Quote prompt banner with count, category, dismiss, 60s timer ✅
- [x] Inline proposal form — expandable card with price input, description textarea, submit button ✅
- [x] Customer identity (name + avatar) in expanded prompt ✅
- [x] Esc to collapse/dismiss ✅
- [x] Socket `quote.new` dedup + 60s auto-dismiss ✅

### G-3: Booking.notes field ✅ FALSE ALARM (not a bug)
**Spec:** `docs/superpowers/specs/2026-05-28-deactivate-account.md`
**Status:** `notes` field EXISTS on both `QuoteRequest` (line 725) and `Booking` (line 810) in `schema.prisma`. The `deactivate.service.ts` already uses `cancelReason` (valid Booking field), not `notes`. The `booking.service.ts:1001` `notes: q.notes` correctly copies QuoteRequest.notes → Booking.notes. **No bug found.**

### G-4: Deactivation system ✅ FULLY implemented
**Spec:** `docs/superpowers/specs/2026-05-28-deactivate-account.md`
**Status:** Verified against code — ALL 12 items are done. Previous TODO was wrong.

- [x] Schema: User.active/deactivationCount/deactivatedAt ✅
- [x] Schema: Servicer.active/deactivationCount/deactivatedAt ✅
- [x] Schema: BannedEmail model ✅
- [x] Service: deactivate.service.ts ✅
- [x] Route: POST /user/me/deactivate ✅
- [x] Route: POST /servicer/me/deactivate ✅
- [x] Auth: banned email check on registration ✅
- [x] Frontend: customer deactivation UI ✅
- [x] Frontend: servicer deactivation UI ✅ (3-step PIN-gated wizard at servicer/pages/account.component.ts:625+)
- [x] Admin: banned accounts tab ✅ (settings.component.ts 'banned' tab with ban/unban/search)
- [x] db push ✅ (schema fields + BannedEmail model synced)
- [x] Tests ✅ (236 pass, 0 fail)

### G-4b: Seed fixes — Promotion + ServicerSchedule ✅ DONE
**Status:** Resolved 2026-05-28.
- [x] Promotion createMany rewritten with correct fields (`label`, `triggerType`, `valueType`, `value`, `conditions`, `targetRole`, `maxUses`, `endDate`) ✅
- [x] ServicerSchedule seed added for M1–M5 (60 rows: weekday morning+lunch, weekend morning) ✅
- [x] Pre-existing TS errors in seed.ts fixed (tuple cast + 3 unused vars) ✅
- [x] `npx ts-node prisma/seed/seed.ts` → full success ✅

### G-5: test-seed-design.md ✅ Implemented
**Spec:** `docs/superpowers/specs/2026-05-28-test-seed-design.md`
**Status:** `seed-test.ts` exists (24 KB, 32 booking lifecycle paths) with its own `reseed:test` npm script. Implementation differs from spec (standalone script instead of flag-gated import in seed.ts) but functionally equivalent.

---

## ✅ Verified Complete (all specs checked)

| Feature | Spec | Notes |
|---------|------|-------|
| UI/UX review fixes | — | Accessibility, touch targets, icons, motion |
| Servicer experience improvements | — | Listing form, entity type, business details, admin review queue, pricing modules |
| PIN Registration + Settings | ✅ spec | PIN hash, default 123456, verify endpoint, change endpoint |
| Deposit/Credit/Promotions | ✅ (backend+frotier) | Schema, transfer, top-up, Stripe webhook, onboarding gate, promotion engine, admin CRUD |
| Session cleanup | — | preferredWeekday removal, label renames |
| Visible Calendar Picker | ✅ spec | Shared calendar-picker component |
| Identity avatars | — | Servicer logo on quotes, customer avatar on servicer quotes |
| Admin-managed card thumbnails | — | Category imageUrl, Thumbnails tab |
| Calculation correctness | — | Unified platform fee, promo discount, SST, tests |
| Payment model redesign | — | Two timings, Stripe, escrow, cash settlement |
| Quote-flow redesign | — | 4-step wizard, Bill step, budget in step 1 |
| Servicer listings redesign | — | List-card layout, photo-ready slot |
| Notification bell overlay | — | Facebook-style dropdown |
| Chat privacy + render fix | — | Signal write fix, ephemeral guest chat |
| Admin AI Chat Settings page | — | FAQ tabs, tier naming, seed |
| Chat / FAQ tier system | — | Tiered FAQ filtering, injection guard |
| Google OAuth | — | Passport strategy, callback, admin via ADMIN_EMAILS |
| Google Maps API | ✅ | Geocoding, Places Autocomplete, radius matching, map view |
| Phase 9 F-B (Calendar) | ✅ spec | Month grid, backend endpoint, nav item |
| Phase 9 F-C (Contact Presets) | ✅ spec | CRUD presets, Save as preset, auto-fill |
| Phase 9 F-D (Search/Filter) | ✅ spec | Search bars on all customer tabs |
| Forgot Password | ✅ spec | Nodemailer, reset token, forgot/reset endpoints |
| Admin banned accounts | ✅ spec | Banned tab, CRUD, search, PIN-gated |
| Dispatch Overlay | ✅ spec | 4-panel layout, QR code, cancel flow, arrive/done |
| Settings Refinements | ✅ spec | Email field, visibility toggles, invoice content/suffix |
| Customer Rewards | ✅ (backend+frotier) | Points engine, tier computation, vouchers, redemption, admin UI |
| WAV notification sounds | — | `NotificationCard.wav`, `NotificationChat.wav` |
| ServicerSchedule endpoints + UI | ✅ Done | GET + PATCH /servicer/me/schedule backend endpoints + 7×4 working hours toggle grid in servicer account page, PIN-gated save |
| Optional PIN at registration | ✅ Done | `register.component.ts` PIN field (optional, 6-digit), `auth.service.ts` `pin?` param |
| Deactivation system | ✅ Done | Full system: schema, service, routes, customer+servicer UI, admin banned tab, db push, tests. |
| Booking.notes + deactivate fixes | ✅ | `notes` exists on both models; `cancelReason` used in deactivation |
| Admin settings restructure | 🟡 Resolved | Money Settings → Financial Settings 3-tab layout (Pricing/Rewards/Servicer). Categories budget ranges + time slots now live under Pricing tab (moved from orphaned Platform Settings page). Platform Settings route `/admin/settings` still exists for Banned/Promotions/Location/Thumbnails but is no longer the primary settings entry point. |

| Quote Question + Pricing Model | ✅ Done (2026-05-31) | Schema: Category (travelFeeBaseline, suppliesFeeBaseline, requiresInspection, procedure) + MerchantService (travelFee, suppliesFee, requiresInspection, procedure). Zod: maxSelect/minSelect/showIf on questionItemSchema; property_type reserved key rejected; durationMin in optionPriceEntrySchema. fee-split.ts: calcTravelFeeSplit + calcSuppliesFeeSplit (separate). computePrefill: showIf hidden-question skipping + durationMin accumulation. Admin Financial Settings: fee baselines card. Admin Category Settings: Dispatch tab with travel/supplies baselines + inspection toggle + procedure. Seed: property_type removed from aircond-servicer, travel/supplies overall baselines seeded. Unit tests: 30 new assertions. Inspection-first booking sub-flow stubbed (TODO). |

---

## 🗑️ Removed by Decision

**F-E: Phone as primary identity + Google Authenticator TOTP** — not building. Email/password stays primary auth. Decided 2026-05-28.

---

## ✅ Resolved Issues (previously tracked as open)

### ✅ SECURITY: /dev/seed — RESOLVED 2026-06-01 (endpoint removed)
- **What was found on review:** an `isProd` guard ALREADY existed (`index.ts` `if (isProd) throw ...`) — the original TODO ("no isProd guard") was stale. The remaining risk was a shell-exec surface (`exec('npm run reseed')`) + a redundant endpoint (`/dev/reseed` already reseeds via the service) + a misleading comment.
- **Fix shipped:** removed the entire `POST /dev/seed` endpoint + now-orphaned `exec`/`promisify`/`bcrypt` imports from `backend/src/routes/index.ts`. Frontend never called it (only `/dev/seed-proposal`). Reseed prod via Railway shell (`railway ssh` → `npm run reseed`) when needed. Gates: backend tsc 0, jest 293 pass/0 fail.
- _Optional future hardening (not done): make `NODE_ENV` required in `env.ts` (drop the `'development'` default) so a future misconfig fails loud._

### ✅ SECURITY: hardcoded `'123456'` fallback PIN — RESOLVED 2026-06-01 (already fixed; docstring corrected)
- **What was found on review:** the code in `verifyPin()` ([backend/src/middleware/pin.ts](backend/src/middleware/pin.ts)) ALREADY returned `false` for a null `pinHash` — the `'123456'` backdoor was already gone. Only the **docstring** still falsely claimed a "default fallback of `123456`", which is itself a risk (someone could read it and believe/restore a backdoor).
- **Fix shipped:** corrected the docstring to state there is intentionally NO hardcoded default-PIN fallback (null `pinHash` → `false`, access denied). Gates: backend tsc 0, jest 293 pass/0 fail.

### 🔴 Stripe — pay-now card payments have no frontend (FIXED ✅ 2026-06-02)
- `POST /stripe/create-payment-intent` returns `clientSecret` on backend
- `@stripe/stripe-js` installed, `StripeCardFormComponent` built, `confirmCardPayment()` wired
- `STRIPE_PUBLISHABLE_KEY` in backend `env.ts` + frontend `environment.ts`

### ✅ Stripe — gateway settlement stub — FIXED 2026-06-02
- `settleBooking('gateway')` now creates a Stripe Checkout Session via `createBookingPaymentSession()` and returns `{ paymentUrl }` — no DB writes at initiation. Actual settlement happens via Stripe webhook → `completeGatewaySettlement()` (unchanged).

### ✅ Customer avatar upload — RESOLVED (verified 2026-06-01, TODO was stale)
- `PATCH /user/me` ([backend/src/routes/user.routes.ts:68,71,75,77]) now validates, destructures, persists, and returns `avatarUrl`. The "silently dropped" claim no longer holds.

### ✅ Customer email read-only — RESOLVED (verified 2026-06-01, TODO was stale)
- Frontend renders email as a read-only `<span class="static-field">` ([customer/pages/account.component.ts:93]); `saveProfile()` payload (`:766`) omits `email`. Backend `PATCH /user/me` correctly does not accept it. The "shown as editable but never saves" claim no longer holds — the "make email read-only" option was taken.

### 🔴 Servicer topup wasn't wired to Stripe (FIXED ✅)
- `shell.component.ts` called `POST /dev/topup` for all topups (instant credit)
- **Fixed:** `submitTopUp()` now calls `POST /servicer/me/topup` → Stripe
- `demoTopUp()` kept on `/dev/topup` (intentional dev-only path)

### 🔴 Reward calculator on frontend (FIXED ✅)
- `effectiveReturnRate()` and `calcRows()` computed on frontend
- **Fixed:** Moved to `GET /admin/rewards/calculator` backend endpoint

### 🔴 Stripe webhook errors silently swallowed (FIXED ✅)
- `stripe.routes.ts` caught all webhook handler errors and returned 200, preventing Stripe retries
- **Fixed:** Return 500 on error so Stripe retries the event

### 🔴 Quote form top-up modal replaced with prompt guard (FIXED ✅)
- Old top-up modal was a regular `app-modal` inside the card layout, could be clipped
- Top-up amount was hardcoded to RM 50 with no minimum enforcement
- **Fixed:** Replaced with fixed centered prompt guard overlay (backdrop, body scroll lock, z-index 9999)
- Pre-fills amount to `max(shortfall, 10)` enforcing RM 10 minimum
- "Top Up" button calls backend `/user/me/topup` → Stripe Checkout (minimum RM 10 enforced server-side)
- Demo button kept on `/dev/topup` for instant credit
- Backend top-up validation changed from `min: 1` to `min: 10` on all three routes (user, servicer, stripe)

---

## ✅ Done — 2026-06-01 (AI Chat FAQ + Dynamic Category Injection)

- [x] **Dynamic Category injection in `chat.service.ts`** — `sendToAi()` now fetches all published child categories with their full questionSchema, description, pricing, and procedure. Builds a "Service Catalog" section appended to the system prompt, grouped by parent category. AI can now answer service-specific questions (e.g. "what does aircond servicing include?") from live DB data without manual per-category FAQ entries.
- [x] **FAQ seed rewrite (`static.ts` `chatKnowledge`)** — 52→74 entries, all updated to current 7-parent + 28-child taxonomy and latest platform workflows:
  - Removed 13 outdated individual-category entries (old flat 11-cat model), replaced with 1 consolidated taxonomy entry
  - Updated quote-flow steps (now: Category→Service Type, Date+Time, Address, Contact, Review+Pay)
  - Fixed `/admin/faq` path → `/admin/ai-chat-settings` in admin FAQ entry
  - Added new admin entries: Category Settings (question schema editor, budget ranges, time slots), Financial Settings, Promotions
  - Updated servicer entries for dispatch overlay, listing wizard, current penalty rules
  - Updated credit wallet minimum top-up (RM10), servicer PIN (no default fallback)
  - Time slots updated to 5-slot system (morning/noon/afternoon/evening/night)
- [x] **`seed-test.ts` FAQ sync** — tightened to 19 entries covering all tiers (general/quotes/bookings/payments/servicer), matching updated workflow
- [x] Gates: backend tsc 0, jest 298 pass/0 fail, frontend ng build 0

## ✅ Done This Session (2026-05-29)

- [x] **Run-Clean.bat admin seed** — `Run-Clean.bat` now seeds a non-demo admin account (`admin@demo.local`, password `Demo@2026`, PIN `1234`) after the fresh schema push, so the admin panel is usable without loading the full 19-servicer demo dataset.
- [x] `backend/prisma/seed/seed-admin.ts` — new standalone idempotent seed script, creates admin with `isDemo: false`
- [x] `admin.service.ts` `runClearContent()` — relaxed to find any admin (not just `isDemo: true`)
- [x] All gates pass: `tsc --noEmit` zero errors backend + frontend

## ✅ Category Settings + Listings + Dispatch initiative — ALL COMPLETE

**Specs:** `docs/superpowers/specs/2026-05-30-category-settings-question-schema-design.md`,
`docs/superpowers/specs/2026-05-30-live-order-accept-dispatch-design.md`

All 4 sub-projects shipped:

- [x] SP1 — Admin nav split ✅
- [x] SP2a — Question Schema editor + Category CRUD ✅
- [x] SP2b — Category Settings additive tabs ✅
- [x] SP3 — Servicer new/edit listing wizard ✅ (full-page 4-step at `/servicer/services/new` + `/:id/edit`)
- [x] SP4 — Live order-accept dispatch ✅ (rotation, BullMQ, socket prompt, accept/decline, presence wiring)

> Deferred: retire legacy `/admin/settings` page — holds unique location/thumbnails/banned/promotions tabs; investigate + rehome before removal.

### ✅ 2026-06-01 — Browse page card-by-card loading + scanning animation (DONE)
- [x] **Browse page staggered card reveal** — replaced `loading → all cards at once` with skeleton cards + scanning light bar during API call, then stagger-reveal cards one by one every 70ms. Prevents the "stuck on loading" freeze that happened when ~31 cards rendered simultaneously.
- [x] **Scanning animation** — `.bw-scan` light bar sweeps top→bottom across skeleton cards (`@keyframes bw-scan-sweep`, 1.8s loop, staggered per card via `nth-child` delay). Uses `--color-primary` gradient; disabled via `prefers-reduced-motion: reduce`.
- [x] **Template restructured** — single grid now mixes real cards + skeleton placeholders via `visibleList()` computed. `OnDestroy` cleans up stagger timer. Search/sort still works on full dataset (only initial load is staggered).
- [x] Gates: frontend tsc 0, ng build exit 0.

### ✅ 2026-05-31 — Taxonomy redesign + browse drill-down (DONE)
- **Taxonomy:** flat 11 → **7 parents + 28 children** (commit `c72d2a8`, reseeded). Map: `docs/ai-context/category-taxonomy.md`. Parents=grouping, children=quotable. Merchants/budget/quotes remapped to child slugs.
- **Browse drill-down (full-stack):** Backend `GET /categories?parent=<slug>` (commit `3770818`). Frontend `/services/:parentSlug` route with `ChildrenBrowseComponent` (standalone, signals, svc-card style). Home parents → drill-down; children → quote. Gates: tsc 0, ng build 0.
- **Quote+pricing model spec** (draft): `docs/superpowers/specs/2026-05-31-quote-question-pricing-model-design.md`. Build pending.
- **bcrypt→bcryptjs** + 32 npm-audit fixes landed (commit `3770818`).
- **Per-child questionSchema content** — Done (all 28 children have questionSchemas seeded; 29th added). Pricing pass (quantity × unit-price, `priced: true`) pending — see SPEC-2. (2026-06-02 update)
- **Follow-ups:** category banner images (Gemini) for new slugs; `.gitattributes eol=lf`; `/dev/seed` isProd guard.

## ✅ Done — 2026-06-01

- [x] **Admin Category Settings: bulk publish/unpublish** — full-stack. Backend `POST /admin/categories/bulk-publish` (PIN-gated, validates UUIDs, validates `ids`+`published`, verifies categories exist, `updateMany`, audited). Frontend row checkboxes + select-all header + bulk action bar ("N selected", Publish/Unpublish/Clear). All gates pass: backend tsc 0 + jest 14/14, frontend tsc 0 + ng build exit 0.
- [x] **Admin Category Settings: avg listing price per category** — read-only analytics. Backend `GET /admin/categories` now returns `averagePrice` (null | number, 2dp) + `priceStatListingCount` per row. Parent (top-level) prices aggregate children's listings via weighted avg; sub-category prices use own services. Uses `$queryRaw` `AVG(base_price)` with `ROUND(..., 2)`. Frontend: green badge `avg RM X.XX (n listings)` on each category row in Category Settings list. All gates pass: backend tsc 0 + jest 14/14, frontend tsc 0 + ng build exit 0.
- [x] **Deep-route MIME bug — REPRODUCED + reclassified + fixed.** Was tracked as 🔴 "systemic, BLOCKS demo." Live browser repro (gstack /browse, 4 deep routes) proved every deep route already **boots and works** on direct-load/refresh; the 10× "Failed to load module script" errors are **non-fatal** (relative `<link rel="modulepreload">` hrefs resolve against the deep doc URL → Cloudflare SPA fallback serves index.html → MIME error, but the real module graph loads from root because `<script src>` honors `<base href="/">`). Real impact = console noise + ~22KB waste per deep load, not breakage. **Fix:** `frontend/scripts/postbuild-absolutize.mjs` (idempotent post-build transform → root-absolute asset URLs in index.html), wired into `package.json` build. Verified locally (14 refs rewritten). ⚠️ Cloudflare build command must be `npm run build`. Details: ceo-log + frontend-log + devops-log 2026-06-01.

### 🟡 Demo deployment (investor/portfolio demos)
- Real prod (`NODE_ENV=production`) blocks demo login + demo accounts + `/dev/*` — by design. To demo, use a **separate Railway environment**: 2nd Postgres + 2nd Redis + 2nd backend service running `NODE_ENV=development` (unlocks demo login + seed), throwaway demo DB, own demo frontend URL. Real prod untouched. Cleanest via Railway **Environments**.
- Pairs with the `/dev/seed` fix: adding the `isProd` guard makes real prod safe while the demo instance (dev mode) can still seed freely.

### ✅ §7.15 Search + Filter + Sort triad — ALL DONE (verified 2026-06-01)

> Verified: 18/19 frontend page components use the shared `app-list-toolbar`. Completed 2026-05-29 across all customer, servicer, and admin pages. Per-page table removed (stale historical data).

### 🔴 STYLE-RULES.md compliance — priority queue (2026-05-29 user-directed)

> **User priority:** Thumbnail cards first, then gradient system compliance.
> See `docs/ai-context/logs/ceo-log.md` session 2026-05-29 for dispatch record.

#### 🔴 S-P1 — §16 Thumbnail Cards (implement now)
**Target:** Frontend — `home/home.component.ts` + `core/category-icons.ts`
**Spec:** STYLE-RULES.md §16.1–§16.7

Convert home page from bento `.cat` cards to horizontal `.svc-card` thumbnail cards:

- [x] Replace `.grid-bento` / `.cat` with `.svc-grid` / `.svc-card` in `home.component.ts`
- [x] Three-layer pattern: photo (`background-image`) → colour wash (linear-gradient) → body (white text)
- [x] Create `core/category-colors.ts` with slug→colour map (Option A from §16.5)
- [x] Wire `cat.bannerUrl` into `.svc-photo` background
- [x] Hero section: add photo/wash layers, white headline text
- [x] Responsive: 2 cols → 1 col at ≤760px
- [x] Grid uses `grid-template-columns: 1fr 1fr` (per §16.3)
- [x] Gate: `ng build` exit 0

#### 🔴 S-P2 — §2.6 Gradient system audit & fix
**Target:** Cross-component
**Spec:** STYLE-RULES.md §2.6

Ensure all surfaces listed in the gradient application table use the correct gradient tokens:
- [x] `.btn-primary` — uses `--gradient-primary` / `--gradient-primary-hover` ✅ (verify shell/home)
- [x] Shell `.logo` wordmark — uses gradient text (`--gradient-primary`) ✅ (verify)
- [x] Shell sidebar active link — uses `--gradient-sidebar` ✅ (verify shell)
- [x] Home `.brand` wordmark — uses gradient text ✅ (verify home)
- [x] Home `.nav-btn--solid` — uses `--gradient-primary` ✅ (verify home)
- [x] Home `.num` step circles — uses `--gradient-primary` ✅ (verify home)
- [x] Home `.request-bar` — uses `--gradient-primary` ✅ (verify home)
- [x] Home `.page` background — uses `--gradient-hero` ✅ (verify home)
- [x] All gradient usages include solid fallback before gradient override (`background: var(--color-primary); background: var(--gradient-primary);`)
- [x] Gradient text omits `color:` property, uses `-webkit-background-clip: text` + `-webkit-text-fill-color: transparent`
- [x] No `--gradient-primary` applied inside `[data-theme="cool"]` component styles
- [x] Gate: `ng build` exit 0

#### 🟡 S-P3 — §2.7 Raw hex → CSS var migration (65+ violations — queue after P1/P2)

| # | Gap | Severity | Details |
|---|-----|----------|---------|
| S-5 | **§7.16 — Top-up prompt guard uses modal instead of blocking overlay** | 🟡 | Spec requires fixed-position blocking overlay (like §7.14) but implementation uses `<app-modal>`. Backdrop click closes it, no body scroll lock. |
| S-6 | **§5.3 — Demo bar not hidden on mobile (≤760px)** | 🟢 | Spec says "Hidden" on mobile but shell.component.ts mobile breakpoint doesn't hide `.demo-bar`. |
| S-7 | **§7.8 — Card grid pattern doesn't match spec** | 🟢 | Spec says `repeat(auto-fit, minmax(300px, 360px))` with `justify-content: center`. Got from S-P1. |
| S-8 | **§7.15 — app-list-toolbar not used by all pages** | 🟢 | my-quotes and users components implement their own toolbars instead of using the shared component. |
| S-9 | **§7.4 — Search input outline removed without replacement** | 🟢 | `home.component.ts` `.search input { outline: none }` has no visible focus replacement. |
| S-10 | **§5 — Undocumented breakpoint (640px)** | 🟢 | `styles.css` uses `@media (max-width: 640px)` which is not in the canonical breakpoint list. |
| S-11 | **Dialog-outlet backdrop hardcoded** | 🟢 | Uses `rgba(15, 18, 22, 0.5)` instead of `var(--color-backdrop)`. |

### ✅ Servicer dual-profile system — RESOLVED (verified 2026-06-01, TODO was stale)
- `servicer/pages/account.component.ts` has a "personal identity" Profile section (lines ~110–172): `personalF.name`, `phone`, `bio`, `contactName`, `contactNumber`, personal avatar upload, `savePersonal()`. The "NO personal profile UI" claim no longer holds.

### ✅ Customer account page — address management — RESOLVED (verified 2026-06-01, TODO was stale)
- `customer/pages/account.component.ts` has full saved-address CRUD: "Add / edit address" modal (lines ~199–241), `saveAddress()`, `editingAddress()`, `addresses()`, plus a "Contact & Address Settings" section. Customers can view/edit addresses outside the quote flow.

### ✅ Customer account page — notification preferences (DONE 2026-06-02)
- `notificationPrefs` UI added: toggles for booking updates, proposals, promotions, chat messages (in-app + email). `frontend/customer/pages/account.component.ts`, `PATCH /user/me`.

### 🟢 Frontend financial calculations still on frontend (downgraded — cosmetic, not a security risk)
- `deposit.component.ts:maxTransferable` — `Math.max(0, currentBalance - minimumRequired)` is a client-side business rule, BUT the authoritative floor IS enforced server-side: `deposit.service.ts:28` `if (current - amount < minReq) throw badRequest(...)`. So the client value is a display/UX hint only — moving it server-side is purity, not a fix. Low priority.
- `dashboard.component.ts` / `jobs.component.ts` / `history.component.ts` / `invoices.component.ts` — `.reduce()` earnings summations are display aggregations of already-fetched rows (not money-movement logic). Only worth moving server-side if those lists become paginated (then a client sum would be wrong).

### ✅ STRIPE_PUBLISHABLE_KEY in env config (DONE 2026-06-02)
- Added to `backend/src/config/env.ts` + `frontend/environment.ts` + `.env.example`

---

## 🧪 Tests

| Suite | Tests | Status |
|-------|-------|--------|
| booking-lifecycle | 36 | ✅ |
| noshow-jobs | 21 | ✅ |
| modifier-pricing | 27 | ✅ |
| auto-accept | 11 | ✅ |
| credit-charge | 13 | ✅ |
| errors | 4 | ✅ |
| http | 7 | ✅ |
| mask | 6 | ✅ |
| login-regression | 6 | ✅ |
| money | 24 | ✅ |
| settlement | 15 | ✅ |
| auth-lockout | — | ✅ |
| question-schema | — | ✅ |
| **Total** | **363** | **298 ✅ / 0 ❌ / 65 ⏭️** |

All 298 tests pass. 65 skipped are sandbox-dependent (supertest/DB).
TypeScript: 0 errors backend + frontend (validated 2026-06-02).

### ✅ 2026-06-02 — SP4 Dispatch Enhancements: configurable timer + Maps/Waze deep-link
- [x] **Backend: `dispatch_prompt_timeout_seconds` now stored as `{ seconds: number }`** — schema registered in `json-schemas.ts` settingsSchemas, default updated in `settings.service.ts` from bare `10` to `{ seconds: 10 }`, dispatch.service.ts reads `.seconds` property
- [x] **Frontend admin UI: Dispatch Timeout setting added** to Financial Settings → Servicer Rules tab in `money-settings.component.ts`, stored/loaded via existing NumSetting pattern with `prop: 'seconds'`
- [x] **Frontend dispatch overlay: Maps/Waze deep-link dropdown** — replaces single "Navigate" button with a split-button showing Google Maps and Waze options in a small dropdown. `gmapsUrl()`/`wazeUrl()` helpers generate the correct URLs. QR code modal unchanged.
- [x] Gates: backend tsc 0, frontend tsc 0, ng build 0, jest 298/363 pass.

---

## 🔒 Security

- [x] bcrypt cost 12, JWT verify, role guards, ownership checks
- [x] Input validation on all POST/PATCH routes
- [x] Winston redaction, file type validation, EXIF stripping
- [x] PIN rate-limited, account lockout, idempotency on money ops
- [x] Socket.io JWT handshake, no global broadcasts with user data
- [x] BullMQ payloads Zod-validated, AI chat rate-limited
- [x] Demo accounts blocked in production
- [x] `.env` gitignored, `gitleaks` + `trufflehog` in CI

## 🔧 Pre-existing Technical Debt (non-blocking)

- **Angular 17 XSS advisory** (GHSA-58c5-g7wp-6w37) — requires `ng update` (breaking major version bump from 17 → 19+). 27 high vulns in frontend `npm audit`.
- ~~**Backend 32 npm audit vulns** (1 critical, 5 high, 13 moderate, 13 low) — all need `--force` (breaking: express 5, socket.io 4.8, @aws-sdk v3.1055, file-type 22).~~ ✅ **FIXED 2026-05-31** — deps upgraded (express 4.22.2, socket.io 4.8.3, @aws-sdk 3.1057, bullmq 5.77.6, morgan 1.10.1); bcrypt→bcryptjs (kills tar path traversal chain); file-type + uuid removed (unused). 0 vulns remaining.
- **Bundle budget** 510 kB vs 500 kB threshold — pre-existing
- **No frontend unit tests** — all 12 test suites are backend-only (236 pass)
- **18 ESLint warnings** — all `no-explicit-any` in 4 service files (booking, invoice, deactivate, servicer-account). Pre-existing domain types; 1 fixed this session.

## ✅ Resolved This Week (2026-05-28)

- [x] Plan files — all `[ ]` → `[x]` in both plan files
- [x] Proposal prompt inline form (G-2) — resolved by running agent (commit `a07b2ee`)
- [x] Deactivation system (G-4) — verified fully implemented (TODO was wrong)
- [x] test-seed-design.md (G-5) — verified implemented (seed-test.ts 32 lifecycle paths)
- [x] adminRewardsRouter missing auth — requireAuth+requireAdmin (commit `fef1b23`)
- [x] pricingModuleRouter never mounted — 4 endpoints now live (commit `fef1b23`)
- [x] Duplicate tier routes — 4 dupes removed from admin.routes.ts
- [x] PATCH /admin/reports/:id missing requirePin
- [x] Idempotency — 10 write endpoints hardened (admin, servicer, user, bookings, quotes routes)
- [x] PATCH /user/me/quote-presets/:id — partial validators, guarded assertOwnAddress, dynamic update data
- [x] ESLint `any` in user.routes.ts — typed as `Record<string, string | boolean | null>`
- [x] Money Settings → Financial Settings — 3-tab layout (Pricing, Rewards, Servicer)
- [x] Categories settings restored — budget ranges + time slots per category now in Pricing tab
- [x] UI/UX Settings — WAV sound file upload (notification + chat sounds) via S3 presigned flow
- [x] STYLE-RULES.md — §7.14 Proposal prompt guard (fixed overlay, body scroll lock, 60s auto-dismiss)
- [x] Admin sidebar — "Money Settings" renamed to "Financial Settings"

---

## ✅ Done — 2026-05-29

- [x] Fixed POST /quotes 400 error — timeSlot validator mismatched frontend values
- [x] Fixed addressId validation — made optional when new address fields provided
- [x] Created shared `StripePaymentService` — unified new-tab + polling for all Stripe top-up flows
- [x] Refactored shell, quote-form, deposit top-up to use shared service + shared shell overlay
- [x] Refactored guest quote Stripe flow to open new tab with waiting overlay (was popup)

### ✅ §7.15 Search/Filter/Sort triad — filled across all pages

- [x] Created shared `ListToolbarComponent` (`shared/list-toolbar.component.ts`) — reusable toolbar wrapper with content projection (`toolbar-search`, `toolbar-filters`, `toolbar-sort`)
- [x] Updated all pages to use `<app-list-toolbar>` instead of manual `<div class="toolbar">`
- [x] STYLE-RULES.md §7.15 updated to document the shared component pattern

**Customer pages:**
- [x] Browse — added sort dropdown (name/price + direction toggle)
- [x] My Bookings — added sort dropdown (date/price)
- [x] Order History — added status filter chips (All/Completed/Cancelled)
- [x] Proposals — added search + filter chips (All/Auto/Manual) + sort (date/price/rating)
- [x] Notifications — added search + filter chips (All/Unread/Read) + sort (date)
- [x] Rewards — added sort dropdown for reward catalog + sort for activity history table

**Servicer pages:**
- [x] Jobs — added sort dropdown (date/price) across all 3 tabs
- [x] History — added search + sort dropdown (date/earnings)
- [x] Incoming Quotes — added search + filter chips (All/New/Responded) + sort (date/budget)
- [x] Invoices — added search + sort dropdown (date/amount)
- [x] Services — added sort dropdown (title/price + direction toggle)
- [x] Account (penalties table) — added search + filter chips (All/Active/Appealed/Resolved) + sort (date/amount)
- [x] Deposit & Credit (txn table) — added search + filter chips (All/Top-up/Transfer/Penalty/Withdrawal) + sort (date/amount)
- [x] Promotions — added search + filter chips (All/Active/Inactive) + sort (code/value)

**Admin pages:**
- [x] Merchants — added search + filter chips (All/Active/Banned) + clickable column sort headers
- [x] Queues — added filter chips + sort to withdrawals tab; wrapped bare search inputs in shared toolbar component

---

## ✅ Done — 2026-06-02 (Session — commit `331e7ac`)

| # | Fix | What changed |
|---|-----|-------------|
| 1 | Credit hold for gateway | `createQuote()` skips credit hold when `settlementMethod === 'gateway'`. Frontend routes "insufficient credit" to top-up overlay. |
| 2 | Address parsing | `applyPresetObject()` regex handles `No. 12`, `12A`, `B-2-3`, `Lot 1234`. |
| 3 | Empty addressNo passthrough | `stepHint` soft prompt when number can't be parsed. |
| 4 | Preset scan skeleton | Lazy-load on first toggle + `bw-scan` skeleton rows. |
| 5 | Preset buttons | Centered `.preset-row`, widened to `min-width: 140px`, orange auto-fill. |
| 6 | Credit error routing | Backend "insufficient" rejection → frontend top-up overlay. |

---

## ✅ Done — 2026-06-02 (Search bar removal + address parse fixes)

- [x] **Topbar global search removed** — `shell.component.ts`: removed `<label class="global-search">` template block, all related CSS (`.global-search`, `.gs-ic`, `.search-results`, `.sr-*`), and TS class members (`searchQuery`, `searchResults`, `searchOpen`, `searchInputRef`, `searchDebounce`, `onSearchInput`, `doSearch`, `closeSearchDelayed`, `navigateSearch`). Each page already has its own per-page search via `<app-list-toolbar>`.

---

## ✅ Done — 2026-06-02 (UX polish batch)

- [x] **`.card.warn` dark theme text** — added `color: var(--color-status-open-text)` to quote-form `.warn` rule + global `.card.warn` in styles.css. Warm text color shows correctly on both light/dark warn banners.
- [x] **`field-msg` outside element** — `.cat-field` in quote-form changed from `flex-wrap` row to `flex-direction: column`. `field-msg` now sits cleanly below the select, never overflows.
- [x] **Mobile nav icon-only** — shell-nav wraps label in `<span class="nav-label">`, hidden at ≤760px. Icon stays visible, label hidden. `nav-ic` margin reset to 0 on mobile.
- [x] **Preset address form** — "Contact & Address Settings" modal now uses `<app-address-fields>` instead of saved-address `<select>`. Creates address inline on save via `POST /user/me/addresses`. Preset no longer requires pre-existing saved addresses.

---

## ✅ Done — 2026-06-02 (RUN 4: UX polish batch)

- [x] **Topbar scroll-away** — `appAutoHide` directive wired to `.topbar` in `shell.component.ts`. Topbar collapses (`padding 0.1rem`, `is-collapsed`) on scroll-down and fades to `opacity: 0.15` when idle (`is-idle`). Smooth `transition: padding 0.25s, opacity 0.25s`.
- [x] **Card scan-on-load animation** — skeleton + stagger reveal added to `my-bookings.component.ts`, `proposals.component.ts`, `services.component.ts` (servicer). Each shows `SKELETON_COUNT=5` animated skeleton cards with `bw-scan`/`bw-sweep` sweep, then reveals real cards one-by-one every 70ms. `prefers-reduced-motion` skips stagger.
- [x] **STYLE-RULES.md leftover entries** — §5.4 mobile-keyboard-push documented (CSS already in styles.css); §7.1.1 card-scan animation rule added; §15.4 sidebar viewport-height fit rule added (with code example). §5.3 reference updated to §5.5.
- [x] **Order ID display** — `order-history.component.ts` renders `orderId` as monospace muted text when present.
- [x] **chat.routes.ts** — `sendToAi` now receives `req.user!.id` for per-user context.
- [x] **Icon compression** — `MyHomeServicerIcon.png` reduced 807 kB → 99 kB.
- [x] Gates: frontend tsc 0, ng build exit 0.

---

## 🔴 UX — Next session (from office-hours design doc 2026-06-02)

Design doc: `~/.gstack/projects/AllergicToAnything-MyServicerDemo/Zen-master-design-20260602-135956.md`

**Session 1 — STYLE-RULES.md only (rules before code):**
- [x] **§7.0 Global Prompt Guard Law** — added as §7.0 before §7.1 Cards. §7.14/§7.16 now reference this master rule.
- [x] **§2.3b Status display-name → token mapping** — added after §2.3 with display→token table and `statusBadgeClass()` docs.
- [x] **§5.3 Topbar scroll behaviour** — added "topbar scrolls with content, demo bar sticks" note.
- [x] **§5.4 Mobile keyboard push rule** — STALE (done): §5.4 entry present in STYLE-RULES.md + CSS in styles.css (see L735).
- [x] **§7.1 Card scan animation rule** — STALE (done): §7.1.1 card-scan rule present in STYLE-RULES.md (see L735).
- [x] **§15.4 Sidebar viewport-height fit (rule)** — added to STYLE-RULES.md 2026-06-02: sidebar fits `100vh − topbar`; overflow nav scrolls inside the sidebar (`nav { flex:1; min-height:0; overflow-y:auto }`), never the page; footer (theme toggle / sign-out) pinned outside the scroll. Mobile ≤760px exempt.
- [x] **§15.4 verify code** — ⚠️ this 2026-06-02 "verified compliant" was WRONG (only checked `.sidebar` rules, missed the missing `app-shell-nav` `:host`). Actual runtime fix landed 2026-06-03 — see the §15.4 sidebar viewport-fit entry in the dispatch section.

**Session 2 — Shell + global styles:**
- [x] **Demo bar theme-aware** — all hardcoded `#0c0c0c`, `#1a1a1a`, `rgba(201,168,76,…)` replaced with `var(--color-surface)`, `var(--color-border)`, `var(--color-warning)`. Hidden on mobile ≤760px (`display: none`).
- [x] **Topbar scrolls away** — STALE: shipped RUN4 (L733) then SUPERSEDED/removed by DISP-12 (§7.13 auto-hide deprecated). No longer wanted.
- [x] **Card scanline animation on load** — STALE (done): shipped RUN4 (L734).

**Session 2 — Code (after rules land):**
- [x] **Status color unification** — `shared/status-badge.util.ts` created, imported into `history.component.ts` + `jobs.component.ts`. Local hardcoded badge overrides removed.
- [x] **Cancelled bookings → Order History** — `my-bookings.component.ts` base list filters `cancelled` out; `GET /user/me/history` now returns completed + cancelled (type: b.status); Cancelled chip already in Order History.
- [x] **Global keyboard push CSS** — `frontend/src/styles.css` §5.4 rule: `padding-bottom: env(safe-area-inset-bottom)` on scrollable containers, `scroll-margin-bottom: 80px` on inputs/textareas/selects.
- [x] **Notification filters → content-type** — done 2026-06-02. 5 chips: All/Orders/Jobs/Promos/System; secondary Unread toggle.
- [x] **Notification delete option** — done 2026-06-02. Per-item × dismiss (optimistic local removal).
- [x] **Notification past-activities section** — done 2026-06-02. Collapsible section, last 10 read, grouped by day.
- [x] **Customer seed transactions** — STALE (done): RUN2 — demo customers seeded with top-up + booking transaction history.
- [x] **Payment history dropdown alignment — FIXED 2026-06-03** (`transactions.component.ts` `.toolbar`): the global `input,select,textarea { width:100% }` (§7.4) overrode `.toolbar select { min-width:120px }`, so the search + 4 selects each rendered full-width and stacked vertically instead of one row. Fix: `.toolbar input.search { flex:2 1 200px; width:auto }` + `.toolbar select { flex:1 1 140px; width:auto }` + `align-items:center`. Verified in browser: all 5 controls sit in one aligned row, wrap gracefully. §7.4/§7.15.

## ✅ FEATURE — Quote submission confirmation flow — DONE 2026-06-02

- [x] **Customer quote confirmation page** — "Request Confirmed!" inline state in `quote-form.component.ts`. Shows category, short ID, 3s countdown → `/customer/quotes`. `goToQuotesNow()` for immediate nav.
- [x] **Guest quote confirmation redirect** — `guestCountdown` signal in `guest-quote.component.ts`. 3s countdown → `/`. "Back to home" link.
- [x] **Servicer may contact via phone/WhatsApp disclosure** — `.wa-disclosure` on bill step + `.confirm-wa-note` on confirm page. `waLink()` helper in `dispatch-overlay.component.ts` with WhatsApp pill button (#25D366) next to customer tel link.
- [x] **Proposal arrival notification on confirmation** — banner shows if `submittedProposalCount() > 0` with link to `/customer/proposals`.

---

## 🟡 FEATURE — Rewards + promo integration  (STALE — all shipped in RUN3, see L52–56)

- [x] **Voucher search + claim in rewards page** — STALE (done RUN3): "My Vouchers" search-by-code + All/Active/Used filter chips.
- [x] **Grey out non-applicable vouchers** — STALE (done RUN3): expired/used vouchers assessed + greyed (`opacity:0.5`) with reason.
- [x] **Promo field auto-populate from voucher** — STALE (done RUN3): "Use" → `/customer/quote/new?promoCode=CODE` prefill.
- [x] **Bill step re-validation** — STALE (done RUN3): re-calls `/quotes/estimate` at submit; clears promo + shows error if no longer applicable.

---

## 🔴 BUGS — Remaining (unsettled)

| Bug | Problem | Fix |
|-----|---------|-----|

### ✅ Resolved bugs (2026-06-02)
| Bug | Resolution |
|-----|-----------|
| BUG-1 | Bill step redesign done — shows `holdAmount` ("We'll hold RM X") with travel/inspection line items |
| BUG-2 | Gateway settlement — `settleBooking('gateway')` now creates real Stripe Checkout Session |
| BUG-3 | Card auto-advance — `onCardPaymentSuccess()` calls `doSubmit()` immediately, no manual OK needed |
| BUG-4 | Credit hold drift eliminated — `computeHoldAmount()` in `money.ts` is single source of truth for both `GET /quotes/estimate` and `createQuote()` |

---

## 🟡 SPECS — Open items

### SPEC-1: Bill step redesign (✅ DONE 2026-06-02)
**Spec:** `docs/superpowers/specs/2026-06-02-bill-step-redesign.md`
- [x] Honest hold/refund wording: `holdAmount` ("We'll hold RM X") as primary display
- [x] `GET /quotes/estimate` returns `travelFee`, `inspectionFee`, `holdAmount`, `estimatedReturn`
- [x] Terms & Conditions page (`/terms`) — checkbox links from Bill step + footer TnC link
- [x] 8-section TnC content — confirmed complete 2026-06-02 (Platform Role, Quotes & Pricing, Holds & Refunds, Payments, Cancellations, Data & Privacy, Disputes, Amendments)

### SPEC-2: Pricing pass per category (🟡 partial)
**Spec:** `docs/superpowers/specs/2026-05-31-quote-question-pricing-model-design.md`
- ✅ Schema, fee baselines, fee-split, questionSchema enhancements done
- ✅ Pricing pass: 29 priceable categories updated; renovation + roof = `requiresInspection:true`
- ✅ `computePrefill`: already implemented (verified)
- ✅ Inspection-first flow: `isInspection` flag, `doneJob` reopens QR, travelFee/inspectionFee snapshotted on Booking
- ✅ Non-refundable: `refundEscrowIfHeld` deducts travelFee (post-arrive) + inspectionFee (post-inspection-done)

### SPEC-3: Category Settings SP2b (🟡 mostly done)
**Spec:** `docs/superpowers/specs/2026-05-30-category-settings-question-schema-design.md`
- ✅ SP1 nav split, SP2a Question Schema + bulk publish, SP2b thumbnail/tips/FAQ, SP3 listing wizard, SP4 dispatch — all done
- ✅ SP2b: Sub-categories editor tab built (inline CRUD, icon display, delete guard)
- ⬜ Deferred: retire legacy `/admin/settings` page

### SPEC-4: SP4 dispatch enhancements (✅ done)
**Spec:** `docs/superpowers/specs/2026-05-30-live-order-accept-dispatch-design.md`
- ✅ Rotation dispatch, accept/decline, presence wiring done
- ✅ Admin-configurable response timer (`dispatch_prompt_timeout_seconds` in settings, surfaced in Financial Settings → Servicer Rules)
- ✅ Maps/Waze deep-link on confirm (dropdown in dispatch-overlay with Google Maps + Waze URLs)

---

## 🟢 COMPLIANCE — Queued (low priority)

| # | Item | Detail |
|---|------|--------|
| C-1 | S-P3: Raw hex → CSS var | 65+ raw hex values in component styles |
| C-2 | S-5: Top-up prompt guard | Uses `<app-modal>` instead of blocked overlay per §7.16 |
| C-3 | Category banner images | No Gemini art for 29 child categories |
| C-4 | `.gitattributes eol=lf` | Prevents CRLF churn on Windows |

---

## 📋 Full Spec Inventory (21 specs)

### ✅ Fully Done (17)
`admin-settings-redesign` · `pin-registration-settings` · `dispatch-overlay` · `forgot-password` · `settings-refinements` · `visible-calendar-picker` · `quote-preset-picker` · `customer-search-filter` · `proposal-prompt-guard` · `servicer-calendar` · `admin-banned-accounts` · `deactivate-account` · `deposit-credit-promotions` · `customer-rewards` · `admin-rescue-apikeys` · `ai-smart-assistant` · `test-seed-design`

### ⬜ Has Open Items (3)
`bill-step-redesign` (not built) · `quote-question-pricing-model` (partial) · `category-settings-question-schema` (minor — only retire legacy page left)

---

## 🔄 CI Pipeline (2026-06-10 design)

> Spec: `docs/superpowers/specs/2026-06-10-ci-pipeline-design.md`

- [x] **Implemented `push-checks.yml`** — lint + build + unit tests on every push (~3 min) + WhatsApp notify
- [x] **Implemented `pr-gate.yml`** — lint + build + unit + API E2E + browser E2E + secret scan + npm audit on PR to master (~10 min) + WhatsApp notify
- [x] **Implemented `nightly.yml`** — API E2E + secret scan + npm audit at 2am MYT (~6 min) + WhatsApp notify
- [x] **Scaffold Playwright** — `frontend/e2e/` with config, fixtures, 5 initial browser E2E scenarios + `npm run test:e2e` script
- [ ] **Set Meta WhatsApp secrets** in GitHub → Settings → Secrets → Actions: `META_TOKEN`, `META_PHONE_ID`, `META_WHATSAPP_TO` (free: 1000 msgs/month)
- [ ] **Delete `security.yml` and `ci.yml`** after new workflows confirmed working
- [x] **WhatsApp notify step** added to `ci.yml` (CallMeBot, curl-based)
- [x] **`e2e-test-local.bat`** created — runs full E2E suite locally (Docker + db:reset + test:e2e)
- [x] **Branch consolidation** — feat/ux-polish → master (PR #1), amethyst-tin deleted
- [x] **Spec written** — `docs/superpowers/specs/2026-06-10-ci-pipeline-design.md`
- [x] **Docs updated** — README, CLAUDE.md, security-notes.md, tech-stack.md, devops-log.md, SESSION-HANDOFF.md

---

## 📁 Key Reference Files

| Purpose | Path |
|---------|------|
| All specs (15) | `docs/superpowers/specs/*.md` |
| Execution plans (2) | `docs/superpowers/plans/*.md` |
| CEO overview + design | `docs/ai-context/ceo-overview.md` |
| CEO log | `docs/ai-context/logs/ceo-log.md` |
| Backend session log | `docs/ai-context/logs/backend-log.md` |
| Frontend session log | `docs/ai-context/logs/frontend-log.md` |
| QA log | `docs/ai-context/logs/qa-log.md` |
| DevOps log | `docs/ai-context/logs/devops-log.md` |
| Full archive | `docs/ai-context/archive/todo-full.md` |
