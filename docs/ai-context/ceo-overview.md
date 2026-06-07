# CEO Overview — MyHomeServicer

> Comprehensive product + engineering review, written from a CEO / UX lens.
> Generated 2026-05-27 on branch `master`. This is a standing assessment of the
> whole project, not a per-PR plan review. For task state see `TODO.md`; for the
> CEO dispatch log see `ceo-log.md`.

---

## 1. What this product is

A three-sided home-services marketplace for the Malaysian market (RM currency, SST
tax, local categories). A customer requests a quote, nearby servicers (formerly
"servicers") send proposals, the customer books, money flows through platform escrow
with a platform fee, and an admin team moderates the whole thing.

**Three portals, one shared shell:**

| Portal | Routes | Core job |
|--------|--------|----------|
| Customer | 11 | Request quotes, compare proposals, book, pay, review, reorder |
| Servicer | 10 | Manage service listings, accept jobs, deposit/withdraw, promotions |
| Admin | 7 | Accounts, KYC, review queues, AI chat settings, platform settings, dashboard |

Plus a public **guest quote flow** (`/guest/quote/new`) that converts to a registered
customer, and an AI help chat (Gemini primary, DeepSeek fallback, DB-backed FAQ).

**Stack:** Angular 17 (standalone components, signals) · Express + TypeScript +
Prisma/Postgres · BullMQ job queue · Socket.io real-time · Stripe (placeholder) ·
S3 with local-disk fallback. Schema is 1,163 lines — this is a real domain model,
not a toy.

**Maturity:** Phases 1–6 and Auth are code-complete (per `TODO.md`). 131 backend unit
tests, all green. The bones are strong. The problems below are polish, focus, and
cleanup, not foundational defects.

---

## 2. CEO read — the one thing that matters

The product works end to end. The risk now is not "can we build it" — it is **the
experience feels clunky at exactly the moments that decide conversion and retention**:
the quote request (the core funnel) and the feedback loop (notifications). Meanwhile
the codebase is carrying dead weight from a half-finished rename that taxes every
future change.

Focus as subtraction: the highest-leverage move is not adding features. It is
**removing friction from the quote flow, making the app talk back through
notifications, and deleting the dead code so the team stops paying interest on it.**

---

## 3. The five flagged problems, graded

### 3.1 Quote flow — clunky for real reasons · severity: HIGH

`customer/pages/quote-form.component.ts` (1,044 lines). Three steps: Details →
Contact → Summary.

- **Price is hidden until the last step.** Budget range lives on Summary, after the
  user has already filled in everything. People anchor on price first; making them
  earn their way to it is backwards.
- **Payment surprise at the finish line.** "Confirm & send request" can bounce the
  user into a top-up modal when `pay_now` exceeds their credit balance. A wallet
  surprise at the moment of commitment is the worst possible place for it.
- **Inconsistent with guest flow.** Promo code was removed from the guest form but
  still sits on the logged-in Summary step.
- **Workaround code, not a fix.** The date input is hard-capped at `max-width: 12rem`
  with a comment apologizing for the native calendar popup position.
- **No felt progress.** Three equal steps, no "you're almost done," no value reflected
  back as the user invests effort.

### 3.2 Notifications — half-built, bell redirects · severity: HIGH

The honest finding: **you already have a snackbar.** `SnackbarComponent` renders
bottom-left toasts driven by `NotificationService` (45s poll + Socket.io) and
`ToastService` (CRUD action feedback). So "notifications need a pop-up snackbar" is
partly already shipped. What is actually wrong:

- **The bell is a plain `routerLink`** (`shell.component.ts:251`) that does a full-page
  navigation to `/customer/notifications` or `/servicer/notifications`. There is no
  dropdown, no overlay panel. This is exactly the "redirect to the tab" behavior you
  want gone.
- **Toasts can lag up to 45 seconds.** New-notification toasts only fire on the poll
  cycle in `refresh()`, even though the socket (`notification.new`) is already wired.
  The real-time path refreshes the list but the felt "pop" rides the slow timer.

### 3.3 Servicer's own listings page — functional, visually dense · severity: MEDIUM

`servicer/pages/services.component.ts` (975 lines). This is the servicer managing
their own shop's listings (confirmed: not the customer-facing discovery view). It
recently got a search bar + filter chips (All / Auto-accept / Manual), so the
mechanics are there. The weakness is presentation: listings render as flat,
text-heavy rows (`title · category · RM x · ~min · SKU · N priced options`) with no
visual hierarchy, no thumbnail, no clear primary action. It reads like a database
table, not a shop the servicer is proud of.

### 3.4 "MD everywhere" — doc sprawl · severity: MEDIUM

19 tracked markdown files (excluding node_modules):

- **Root (4):** `CLAUDE.md`, `README.md`, `STARTUP.md`, `TODO.md`. `STARTUP.md` and
  `README.md` and `docs/setup-guides/INSTRUCTIONS.md` overlap on setup.
- **`docs/ai-context/` (12):** 5 single-writer agent logs (`ceo`, `backend`,
  `frontend`, `qa`, `devops`), `SESSION-HANDOFF.md`, plus the genuine reference docs
  (`schema-notes`, `security-notes`, `seed-plan`, `tech-stack`).
- **`archive/` (3):** frozen history — correctly quarantined already.

The reference docs are good and pull their weight. The agent logs and handoff notes
are process scaffolding that has leaked into the repo root of attention. Nothing is
catastrophic; it just lacks a clear "start here" and a clear separation of
**reference** (durable) from **log** (ephemeral).

### 3.5 "Stuff here and there is bad" — dead code · severity: HIGH (cheap to fix)

**`frontend/src/app/servicer/` is 3,937 lines of fully dead code** — a complete portal
(shell, dashboard, jobs, services, invoices, deposit, promotions, history, account,
routes) left behind by the Servicer→Servicer rename. **Zero active imports.**
`app.routes.ts` routes `servicer`, never `servicer`. This is the single biggest,
cheapest win in the whole review: deleting it removes ~17% of the frontend component
line count and stops every future grep, refactor, and "which file is the real one?"
moment from hitting a decoy.

Related smell: **`shell.component.ts` is 1,855 lines** — a god component holding the
topbar, sidebar, demo bar, search, notifications bell, credit wallet, top-up modal,
reseed/unplug modals, FAB stack, and demo-login dropdowns. It works, but it is the
kind of file where every change risks an unrelated regression.

---

## 4. Architecture snapshot

```
            ┌─────────────────────────────────────────────┐
            │  Angular 17 SPA (signals, standalone)        │
            │  home · guest-quote · 3 portals (lazy)       │
            │  shared ShellComponent (1855 LOC — god cmp)  │
            └───────────────┬─────────────────────────────┘
                            │ REST + Socket.io (JWT handshake)
            ┌───────────────▼─────────────────────────────┐
            │  Express + TypeScript                        │
            │  12 route modules · 18 services              │
            │  middleware: JWT, role guards, rate limit,   │
            │  idempotency, PIN gate                       │
            └───┬───────────────┬───────────────┬──────────┘
                │               │               │
         ┌──────▼─────┐  ┌──────▼──────┐  ┌─────▼──────┐
         │ Postgres   │  │  BullMQ     │  │  External  │
         │ (Prisma,   │  │  (Redis):   │  │  Gemini /  │
         │  1163-line │  │  booking    │  │  DeepSeek  │
         │  schema)   │  │  lifecycle, │  │  Stripe(*) │
         │            │  │  no-show,   │  │  S3 / local│
         │            │  │  auto-accept│  │            │
         └────────────┘  └─────────────┘  └────────────┘
              (*) Stripe is a placeholder; demo top-up is the live path.
```

**What's solid:** clear portal/role separation with lazy bundles and guards; money in
`Decimal`; Postgres-generated UUIDs; explicit field-picking before Prisma; Zod-validated
job payloads; security checklist genuinely covered (bcrypt 12, idempotency on money ops,
EXIF stripping, gitleaks in CI). The CLAUDE.md discipline (db push workflow, the
Windows DLL-lock note, doc-sync rule) shows hard-won operational knowledge.

**What's fragile:** the god shell component; the dead servicer portal; Stripe is still
a placeholder so real payment is unproven; Google Maps geocoding is fully planned but
not started (addresses are free-text, matching is substring-based).

---

## 5. What already exists (don't rebuild)

| Need | Already there |
|------|---------------|
| Pop-up snackbar | `SnackbarComponent` + `NotificationService` + `ToastService` — reuse, don't rebuild |
| Real-time channel | Socket.io `notification.new` already wired — just make toasts fire on it |
| Overlay pattern | `ChatWidgetService` + chat widget overlay is the model for a bell panel |
| Search + filter chips | Already on servicer listings and notifications page — reuse the pattern |
| Modal/dialog | Shared `ModalComponent` + `DialogService` with drag-close fix |
| Fuzzy select | `search-select.component.ts` (ControlValueAccessor) for any dropdown |

The lesson: most of the flagged work is **wiring and polish of existing parts**, not
new construction. That keeps effort low and risk lower.

---

## 6. Dream-state delta (12-month arc)

```
 CURRENT                          THIS REVIEW'S FIXES            12-MONTH IDEAL
 ─────────────────────────        ──────────────────────        ─────────────────────────
 Quote: price hidden,      ──▶    Price up front, no       ──▶  Instant-estimate quote with
 payment surprise                 payment surprise, felt         map-based address + live
                                  progress                       servicer availability
 Bell redirects to a tab   ──▶    Bell opens an overlay     ──▶  Real-time activity center:
                                  panel; toasts pop on           bookings, chat, money, all
                                  socket in <1s                  in one push-driven surface
 Servicer list = DB table  ──▶    Card layout with          ──▶  Servicer storefront with
                                  hierarchy + clear action       media, ratings, analytics
 3,937 LOC dead portal     ──▶    Deleted; shell split       ──▶  Lean, single-source
 + 1855-line god shell            into focused components        component tree
 Free-text addresses       ──▶    (unchanged this pass)     ──▶  Google Maps geocoded
                                                                 radius matching (planned)
```

Every fix in the middle column moves toward the ideal. None paints into a corner.

---

## 7. Prioritized roadmap

Sequenced **quick-wins-first** (your stated preference). Effort shown as
human-team / Claude-Code, and reversibility 1 (one-way door) to 5 (trivially
reversible).

### Wave 1 — Quick wins (cleanup + high-leverage UX)

| # | Work | Effort (human / CC) | Reversibility | Why now |
|---|------|--------------------|--------------|---------|
| 1 | Delete dead `servicer/` folder (3,937 LOC) | 30m / 5m | 5 (git revert) | Removes interest you pay on every change |
| 2 | Bell → overlay panel (reuse chat-widget overlay pattern); stop the full-page redirect | 1d / 30m | 5 | Kills the exact behavior you called out |
| 3 | Fire new-notification toast on the `notification.new` socket event, not just the 45s poll | 2h / 10m | 5 | Makes the app feel alive; <1s feedback |
| 4 | Docs: add a "start here" index, fold `STARTUP.md` into `README`/`INSTRUCTIONS`, move agent logs under a `logs/` subfolder | 2h / 20m | 5 | One obvious entry point |

### Wave 2 — Quote flow redesign (core funnel)

| # | Work | Effort (human / CC) | Reversibility |
|---|------|--------------------|--------------|
| 5 | Move budget range to Step 1 (Details) so price anchors early | 3h / 20m | 4 |
| 6 | Surface credit/top-up state on the payment step, not as a finish-line surprise | 4h / 30m | 4 |
| 7 | Remove promo from logged-in Summary (match guest flow) or add it to both | 1h / 10m | 5 |
| 8 | Replace the `max-width:12rem` date hack with a proper date control | 2h / 15m | 5 |

### Wave 3 — Servicer listings + structural debt

| # | Work | Effort (human / CC) | Reversibility |
|---|------|--------------------|--------------|
| 9 | Redesign servicer listing rows into cards with clear hierarchy + primary action | 1d / 45m | 4 |
| 10 | Split `shell.component.ts` (1,855 LOC) into topbar / sidebar / demo-bar / fab-stack / wallet components | 1.5d / 1h | 4 |

### Deferred (NOT in scope this pass)

- **Google Maps geocoding** — fully planned in `TODO.md`, real work, separate spec.
- ~~Stripe real integration~~ — **moved into the payment MVP** (§12, task 8). Stripe is
  the chosen gateway; no longer deferred.
- **Servicer storefront / media / analytics** — the 12-month vision, not now.

---

## 8. Top risks

1. **Payment is unproven (now MVP scope).** Stripe is still a placeholder; the only
   working money path is the demo top-up. Real payments are now in the payment MVP (§12)
   with **Stripe as the gateway** — high-magnitude, money-critical work; build with tests
   and care.
2. **God shell component.** `shell.component.ts` at 1,855 lines is where a small change
   silently breaks an unrelated feature. The chat-leak bug history in `TODO.md` shows
   this class of runtime-only regression already bit once.
3. **Dead code as a correctness hazard.** Two `services.component.ts` files (servicer
   real, servicer dead) is a trap: a future edit to the wrong one looks done and does
   nothing.
4. **Doc/code drift.** The CLAUDE.md doc-sync rule is good discipline but depends on
   humans; the dead servicer portal proves drift already happened once.

---

## 10. Cleanup plan — decided 2026-05-27

Two decisions taken at the CEO table. Both documented here; execution awaits an
explicit go (CEO mode: plan first, code on request).

### 10.1 Delete dead `frontend/src/app/servicer/` — parity VERIFIED ✅

The folder is 3,937 LOC across 11 files (9 pages + shell + routes), structurally
identical to the live `servicer/` portal. Parity check run:

| Page | servicer | servicer | verdict |
|------|---------:|---------:|---------|
| account | 587 | 587 | byte-identical apart from rename (one line: `purpose:"servicer_logo"`, an intentional backend API constant) |
| promotions | 162 | 162 | fully identical apart from rename |
| dashboard | 325 | 365 | servicer superset (+40) |
| jobs | 679 | 1092 | servicer superset (+413: invoice button, tabs) |
| services | 893 | 975 | servicer superset (+82: search, chips) |
| deposit / history / incoming-quotes / invoices | = | = | rename-only copies |

Every delta is `servicer ≥ servicer`; nothing in `servicer/` is unique or newer.
**Conclusion: safe to delete the whole folder. Git history preserves it.** Scope is
the frontend folder only — `servicer-register` ("sign up as pro"), the DB
`@@map("servicers")` table, and JWT plumbing stay (live, intentional).

**Status: APPROVED IN PRINCIPLE, pending execution go.**

### 10.2 Docs reorg — Medium

- Add a single "start here" doc map.
- Fold `STARTUP.md` into `README.md` / `INSTRUCTIONS.md` so setup lives in one place.
- Move the 5 agent logs + `SESSION-HANDOFF.md` into `docs/ai-context/logs/` to separate
  ephemeral logs from durable reference docs.
- **Caveat:** the log paths are wired into `CLAUDE.md`'s file map + agent coordination
  table, so this requires editing `CLAUDE.md` (~10 path references). `CLAUDE.md` is
  outside the standing "TODO + CEO docs only" lane, so its edit needs a separate
  explicit go.

**Status: SCOPE AGREED (Medium), pending execution go.**

---

## 11. Servicer listings redesign — design locked 2026-05-27

Problem (§3.3): the servicer's own listings page reads like a database table. Decision:
**"design now, photo-ready later"** + **refined list-card layout** (not a product grid —
this is a management screen, and some servicers carry ~60 listings, so it must stay
scannable). This is a refinement of the existing horizontal card, not a rebuild.

**Card anatomy:**
```
┌────────────────────────────────────────────────────────────┐
│ ┌────┐  Aircon Servicing — Split Unit      RM 120   ●Auto   │
│ │ ❄  │  Deep clean + gas top-up             fixed           │
│ └────┘  ~90 min · AC-SPL-01 · 3 options    [Edit]   🗑       │
└────────────────────────────────────────────────────────────┘
```
- **Left tile (48px, rounded):** `Category.icon` on a tinted background. This is the
  photo-ready slot — it will be filled by **admin-managed thumbnails** (see §15,
  post-MVP), with the icon as fallback when none is set. NOT a per-listing servicer
  upload. No data change for the MVP listing redesign.
- **Title = hero** (bold); description a muted single-line-clamped subtitle beneath
  (today they share weight).
- **Price block** pulled out right, prominent, with `priceType` small beneath (price is
  what servicers tune most).
- **Status badge:** Auto-accept (filled) vs Manual (subtle); existing inline toggle kept.
- **Actions:** Edit = primary ghost button; Delete = muted trash icon, reddens on hover
  (no kebab component — keeps scope tight, still not a one-click-from-edit destructive).
- **Meta row:** duration · SKU · N priced options, small + muted.
- Search + filter chips (All / Auto-accept / Manual) unchanged.
- Mobile: card stacks price/actions below the title block.

**Scope:** frontend-only, `servicer/pages/services.component.ts` template + styles. No
data model, backend, or modal-form changes. `ServicerService` has no image field
today (confirmed schema line 508) — adding photos is a separate future decision.

**Status: DESIGN LOCKED, ready to hand off.**

---

## 12. Payment model redesign — IN DESIGN 2026-05-27

Triggered by a real gap, now precisely mapped (see "Verified code map" below).
**Correction to an earlier draft:** pay-later DOES collect the platform fee — it is
deducted from the *servicer's* balance at `doneJob` (booking.service.ts:240-263). The
actual gap is that the **customer never pays through the platform** for pay-later: they
pay the servicer directly off-platform (like cash), with no settlement step and no
confirmation that payment happened. Pay-later today is effectively undocumented cash.

### Verified code map (read 2026-05-27)
- **Quote create** (quote.service.ts:121-148): pay_now + bounded `budgetMax` holds
  `budgetMax + tip` from customer credit immediately; pay_later/cash hold nothing.
- **Proposal accept** (booking.service.ts selectProposal:107-152): pay_now creates an
  Escrow; refunds excess (`budgetMax − price`) if held, else deducts `price + tip` now.
- **Job done** (doneJob:240-279): pay_later deducts platform fee from servicer now;
  pay_now enqueues ESCROW_RELEASE (60s).
- **Escrow release** (booking.jobs.ts:203-230): `payout = price − fee + tip` to servicer;
  holds if an open report exists.
- **Cash** (cashConfirm:291-323): cash+completed → fee from servicer balance. Already
  matches decision #2.
- Platform fee = `computeCharge` (default 5%) from credit.service.ts.

### Decided so far
- **Two payment timings**, chosen at proposal acceptance: **Pay now** / **Pay later**.
  This folds today's separate top-level "cash" mode into pay-later as a settlement
  method → quote form drops from 3 options to 2.
- **Payment methods:**
  - **Gateway = Stripe.** (Rolled back 2026-05-27 from TnG/ShopeePay — those are too
    much integration hassle; Stripe is simpler and already has a placeholder in the
    codebase. If an e-wallet ever becomes simple to add, revisit.)
  - **Credit** = in-app wallet, funded **only** by gateway top-up.
  - **Cash** = pay servicer directly; **pay-later settlement only**.
- **Top-up is gateway-only** (no other funding source for the wallet).
- **Pay now** → source is Gateway or Credit → held in escrow → released on job done.
- **Pay later** → no charge at booking → after job done, invoice → settle via Cash,
  Gateway, or Credit → servicer paid + platform fee.

### Flowchart
```
accept proposal (price known)
      │ choose TIMING
      ├── PAY NOW ─▶ source: Gateway (Stripe) OR Credit
      │               └─▶ escrow hold ─▶ job done ─▶ servicer paid + platform fee
      └── PAY LATER ─▶ confirmed, nothing charged
                       job done ─▶ invoice ─▶ settle: Cash | Gateway | Credit
                       └─▶ servicer paid + platform fee
```

### Open decisions (block implementation)
1. ✅ **RESOLVED — Pay-now charges at proposal acceptance** (exact agreed price, then
   escrow hold until job done). Replaces today's quote-creation `budgetMax` hold +
   refund logic. Rewires existing escrow/credit-hold path.
2. ✅ **RESOLVED — Cash fee deducted from servicer deposit** on cash confirm. Servicer
   keeps the customer's cash; platform takes its fee from the deposit balance. Fits the
   existing deposit/withdrawal + `cashConfirm` machinery. (Verify `cashConfirm` actually
   books the fee today; if not, add it. Guard: low deposit blocks taking cash jobs.)
3. ✅ **RESOLVED — Soft enforcement.** No upfront money. An unpaid invoice locks the
   customer out of new bookings, fires reminders, and after X days escalates to a
   penalty/report. Reuses the existing penalty + account-restriction + report
   machinery. (E-wallet pre-auth isn't viable, so no card-style hold.) Open sub-param:
   the X-day escalation window.
4. ✅ **RESOLVED — Gateway = Stripe, in the MVP.** Rolled back from TnG/ShopeePay (too
   much hassle). A Stripe webhook placeholder already exists; finishing the Stripe
   integration is MVP scope, not deferred. Credit + cash mechanics can be built first,
   with Stripe wired in the same MVP.

### Key dependency & build order
Top-up is **gateway-only**, and pay-now-by-credit needs a funded wallet — so the wallet
is funded by **Stripe top-up** (the demo top-up stays for dev/demo only). Stripe is in
the MVP, so there's no "gateway-less phase" to ship — just a sensible build order:
- **Build first (no Stripe dependency):** data model, remove the quote-time hold,
  charge-at-acceptance from credit → escrow, pay-later settlement by cash/credit,
  soft-enforcement. Testable end-to-end using the demo top-up to fund credit.
- **Then wire Stripe (same MVP):** real top-up, pay-now Stripe source, pay-later Stripe
  settlement, webhooks + idempotency. Replaces the demo top-up as the real funding path.

### MVP implementation tasks (verified against current code)
Ordered; money-critical, so build in sequence with tests at each step. Not a blind
parallel hand-off.
1. **Data model** — split `paymentMode` into `paymentTiming` (pay_now|pay_later) and
   `settlementMethod` (gateway|credit|cash, nullable) on QuoteRequest + Booking; migrate
   existing rows; `db push`. Cash stops being a top-level timing.
2. **Quote create** — remove the quote-creation credit hold (quote.service.ts:121-148);
   no money moves at submit. Persist timing + method from the Bill step.
3. **Proposal accept** (selectProposal) — pay_now: charge the agreed price from customer
   credit now → escrow (drop the budgetMax-excess-refund branch; no prior hold exists).
   pay_later: no charge.
4. **Job done** (doneJob) — pay_later: stop deducting the fee eagerly; issue invoice and
   await settlement. pay_now: unchanged.
5. **Pay-later settlement** — new `POST /bookings/:id/settle` + my-bookings UI (replaces
   the lone "Add tip"): credit (deduct customer credit → servicer payout − fee) or cash
   (servicer confirms, fee from servicer — reuse cashConfirm). Records the customer
   payment + confirmation that today's flow lacks.
6. **Soft enforcement** — unpaid pay-later invoice (completed, unsettled, > X days) blocks
   new quote/booking creation + reminders + escalation; reuse penalty/restriction machinery.
7. **Quote form (frontend)** — the §13 4-step redesign; ships with this MVP (coupled to
   tasks 2-3).
8. **Stripe integration** — finish the existing placeholder: real top-up (gateway-only
   wallet funding), pay-now Stripe source, pay-later Stripe settlement, webhooks +
   idempotency on money ops. Replaces the demo top-up as the real funding path. MVP scope.
9. **Fix stale `/servicer` notification links** (6) → `/servicer` (independent quick fix —
   can be parallelized; see TODO).

**Status: DESIGN COMPLETE + tasks mapped. Stripe is the MVP gateway. Build in order
(money-critical).**

> **See also `calculation-audit.md`** — full money-flow trace + worked sample. It found
> the calculations are inconsistent today (two disagreeing fee systems; promo + SST shown
> on invoices but never charged). Those fixes are part of this MVP — reconcile escrow and
> invoice to one canonical money definition, with tests.

---

## 13. Quote-flow redesign — design locked 2026-05-27

Fixes the "clunky quote flow" (§3.1). Keeps a 4-step wizard but gives payment its own
dedicated final step instead of cramming it into the review.

**Steps:** Choose service → Contact → Summary → Bill
```
1. Choose service   category, dynamic questions, BUDGET (moved up to anchor early),
                    preferred time, preferred date (proper control — drop the
                    max-width:12rem hack), notes
2. Contact          contact name, number, service address
3. Summary          clean review of the job request — NO money here
4. Bill             payment timing (pay-now / pay-later) + method, budget-based
                    estimate, promo code, agree to terms, submit
```

**Decided:**
- Payment stays in the form but as its own **Bill** step (not buried in Summary) →
  removes the finish-line top-up surprise; money step is explicit and expected.
- **Bill chooses method now, charges at acceptance** — no money moves at quote submit;
  the real charge happens when the customer accepts a proposal (consistent with §12).
  Bill shows a budget-based estimate, not a final price (price is unknown until a
  proposal arrives).
- Budget moves to Step 1 so price anchors early.
- Promo code lives in the Bill step (carried to the booking, applied at charge).
- Date input gets a proper control; stepper shows clearer 4-step progress.

**Coupling:** the "no charge at quote submit" behavior depends on the §12 Phase-A
backend change (remove the quote-creation `budgetMax` hold; move charge to acceptance).
So this redesign ships WITH payment MVP, not as an isolated frontend task.

**Status: DESIGN LOCKED — sequence with payment MVP.**

---

## 14. UI/UX re-review — CEO + UI/UX pro 2026-05-27

Fresh pass with the UI/UX-pro checklist (accessibility → interaction → style → motion),
grounded in the real components + `styles.css` tokens. Prioritized by impact.

### P1 — Accessibility (CRITICAL, cheap to fix)
1. **Muted text fails WCAG AA contrast.** `--color-muted #8c8178` on `--color-bg #faf7f2`
   ≈ **3.6:1** (warm); `#857268` on `#1c1917` ≈ **4.0:1** (night). Both below the 4.5:1
   floor for normal text — and `.muted` carries most secondary content (timestamps, meta,
   descriptions, helper text) app-wide. Fix: darken muted to ~`#6b6258` (warm) /
   lighten to ~`#a09384` (night) to clear 4.5:1. One-token change, huge reach.
2. **Icon-only buttons use `title=`, not `aria-label`.** notif-bell (shell.component.ts:250),
   theme-toggle (290), chat-bubble (335) — `title` is not a reliable accessible name and
   doesn't show on touch. (fab-toggle already does it right with `[attr.aria-label]`.) Add
   `aria-label` to each.
3. **Toasts aren't announced.** `snackbar.component.ts` toasts have no `role="status"` /
   `aria-live="polite"`, so screen readers miss every success/error/notification. Add an
   aria-live region.
4. **Sub-12px text.** `.demo-dd-cat` 0.62rem, `.demo-action` 0.68rem, `.notif-count` 0.6rem
   (~9.6px). Badge counts are tolerable; the demo-bar labels are tiny. (Demo bar is
   dev-only, lower priority.)

### P1 — Touch & interaction (CRITICAL on mobile)
5. **Touch targets below 44px.** notif-bell = 2rem (32px), fab-toggle = 1.75rem (28px),
   theme-toggle small. The app has mobile breakpoints, so these are real mis-tap risks.
   Fix: pad hit areas to ≥44px (visual size can stay; expand the clickable box).
6. **Auto-hide idle state disables the topbar.** `.topbar.is-idle { pointer-events: none }`
   (shell.component.ts) — after 30s idle the topbar (now including the bell, search, sign-out)
   becomes unclickable until scroll/activity restores it. Clever, but it traps interaction.
   Fix: keep pointer-events live, or restore on hover/focus, not just scroll.

### P2 — Style & consistency (HIGH)
7. **Emoji used as structural icons — including my new notification panel.** The skill is
   explicit: SVG icons, not emoji (font-dependent, inconsistent cross-platform, untheme-able).
   The notification panel I just shipped uses 📦🔧📋🎁⚠️ for category icons; the servicer-listing
   redesign plans to use `Category.icon` (also emoji); scattered ✨🔍🔒⏏ elsewhere. Meanwhile
   bell/chat/send are hand-rolled inline SVGs. **No single icon family.** Recommend adopting
   one set (Lucide or Heroicons) and replacing emoji + ad-hoc SVGs. This also fixes my panel.
8. **Icon stroke/sizing not tokenized** — inline SVGs use varied widths/sizes. Define icon
   size tokens when adopting the set (#7).

### P2 — Motion (MEDIUM)
9. **No `prefers-reduced-motion` support anywhere.** Continuous decorative loops run forever:
   `chat-glow-spin` + `rb-glow-spin` (3s infinite conic-gradient), `chat-status-pulse`,
   `dot-pulse`, `page-enter`. Battery/CPU cost + accessibility. Add a global
   `@media (prefers-reduced-motion: reduce)` that disables/юreduces these.

### What's good (keep)
- **Quote form validation** is strong: per-field `field-invalid` + inline `field-msg` +
  focus-friendly. Matches §8 best practice — don't regress it in the redesign.
- **Focus ring tokens exist** (`--focus-ring`, `--focus-ring-danger`) — apply them
  consistently as new components land.
- **Dark/light themes are token-driven** and designed as a pair — good foundation; just
  fix the muted-contrast token (#1) in both.

### CEO call
P1 items (1-6) are mostly **one-token / small-attribute fixes with app-wide reach** — highest
return, low risk, safe to hand off in parallel. The icon-system change (#7) is bigger and
should be its own deliberate pass (and it absorbs the emoji in my notification panel).

**Status: REVIEWED — fixes captured in TODO.**

---

## 15. Admin-managed card thumbnails — POST-MVP 2026-05-27

Direction: **all cards get a picture**, configured centrally by the admin (not uploaded
per-listing by servicers). Admin CRUDs them under **Admin → Platform Settings →
Thumbnails** (a new tab alongside the existing Customer / Servicer / Platform tabs in
`admin/pages/settings.component.ts`). **Deferred until after the MVP.**

**Reconciles with §11 (servicer listings).** The "photo-ready slot" I designed (48px
left tile, category-icon fallback) is the drop-in target for these thumbnails — but the
source is **admin-managed**, not a per-listing `ServicerService.imageUrl`. The icon stays
as the fallback when no thumbnail is set.

**Open (resolve when we pick this up, post-MVP):**
- **Granularity** — most likely **per-category** (admin sets one thumbnail per category;
  all that category's cards use it), since admin can't realistically manage a picture for
  every individual listing. Confirm vs per-subcategory or per-listing-override.
- **Which cards** — servicer listing cards for sure; decide whether home/browse category
  cards and others share the same source.
- **Storage** — reuse the existing S3 / local-file fallback upload flow.

**Status: NOTED — post-MVP, granularity TBD.**

---

## 16. Identity avatars on quotes / bookings — decided 2026-05-27

Trust-building: show the other party's face/logo at decision moments ("design for trust").
Split by cost.

### 16.1 Customer sees servicer logo — MVP (cheap, data exists)
On the customer's **current quotes** (proposal list) and **upcoming bookings**, show the
servicer's `logoUrl`. The data is already in the payloads — proposals select `logoUrl`
(quote.service.ts:448) and the bookings interface already has `servicer.logoUrl`. So this
is mostly **frontend**: a small avatar component with an **initials/business-name fallback**
when no logo is set. Apply on `my-quotes` + `my-bookings`.

**Status: MVP — ready to hand off (frontend).**

### 16.2 Servicer sees customer photo — POST-MVP
On incoming quotes / the job-accept view, show the customer's profile picture **and name**,
**visible before the servicer accepts** (decided 2026-05-27 — full identity for trust, over
masking). Bigger build:
- Add `avatarUrl` to the `User` model (+ db push); customer upload UI on the account page
  (reuse the S3 / local-file flow, shared with §15).
- Include the customer avatar + name in the servicer-quote payload (servicer-quote.service.ts
  currently selects only `user.email`).
- **Privacy note:** this intentionally reverses today's pre-acceptance customer masking —
  customer identity becomes visible to every servicer a quote is broadcast to. Keep the
  existing `pairedCustomerEmail` self-account guard.

**Status: POST-MVP — decision recorded (show before acceptance).**

---

## 17. Servicer experience improvements — decided 2026-05-27 (all MVP)

Three servicer-side fixes, all MVP.

1. **Listing form UX — sectioned single form.** Redesign the dense single-column modal in
   `servicer/pages/services.component.ts` into clear labeled sections — **Basics · Pricing &
   options · Tax · Auto-accept rules** — one scrollable modal, one save. (Not a wizard —
   servicers create many listings; AC Doctor has ~60.) Logic/fields unchanged; layout +
   grouping only.
2. **Business details form + entity type.** Add `entityType` to `Servicer` (enum:
   `sole_proprietorship | partnership | enterprise | sdn_bhd`; db push). Add a **Business
   details** section to account settings (`servicer/pages/account.component.ts`) — today it
   only edits bio + service areas — exposing legal name, entity type, business registration
   number, tax number. (Other edits like bio/logo/service areas keep saving directly.)
3. **Admin review queue for identity changes.** Changing the **legal-identity block (entity
   type + registration number + tax number)** submits a review request instead of saving
   directly. New model following the existing `CategoryRequest` pattern (e.g.
   `ServicerIdentityChangeRequest`), and a new tab in the admin Review Queues page
   (`admin/pages/queues.component.ts`, which already has withdrawals / appeals / category).
   Admin approves → applied; rejects → discarded. Servicer can always request a switch.

**Status: DESIGN LOCKED (all MVP).**

---

## 18. Tax, service charge & itemized invoicing — decided 2026-05-27

Resolves the canonical "customer total" the audit (`calculation-audit.md`) and §12 need.
The total is built in a fixed order; **SST is always calculated last.**

```
1. Line items      servicer itemizes the job, e.g.
                     Running fee  RM 50
                     Service      RM 100
                     Repair       RM 50
                     Copper pipe  RM 30
                   subtotal = Σ line items     (replaces one opaque proposedPrice)
2. − Promo         after_promo = subtotal − promoDiscount
3. + Service charge   optional, servicer-set % (e.g. 5% / 10%):  svc = after_promo × rate
4. + SST  (LAST)   only if servicer is SST-registered:  sst = (after_promo + svc) × sst_rate
5. + Tip
customer_total = after_promo + svc + sst + tip
```

**Inclusive vs exclusive** — servicer chooses (account default, listing override). Inclusive =
line-item prices already contain svc/SST (extracted for the receipt); exclusive = added on top.
**The customer sees clearly** which mode and the full breakdown before paying.

**Servicer account tax config (new — extends §17 business details):**
- `sstRegistered` (bool) + optional SST number. **Not every business has SST** — if not
  registered, no SST line at all.
- `serviceChargeRate` (optional %, default 0) — account default.
- `taxInclusive` (bool) — whether quoted prices already include tax/charge.
- **Per-listing override:** a listing may set its own service charge / tax treatment or
  inherit the account default ("use the set service tax for that account or per type of
  service in the listing").

**Itemized invoice / receipt:**
- Proposal + invoice carry **line items** (label + amount), not one lump price. Servicer
  plugs in what each cost is for (running fee, service, repair, parts).
- Receipt + invoice show: line items → promo → service charge → SST → tip → total.
- The existing `computePrefill` `breakdown` (option label + price) seeds line items; the
  servicer can add custom lines (e.g. parts).

**Impact:** this is the single canonical total that **escrow AND invoice must both derive
from** (fixes audit §6.1–6.3). Data-model additions: servicer tax-config fields; line-items
on proposal/booking/invoice. Money-critical — lands with the §12 payment MVP + the
calculation fixes, with tests.

**Status: MODEL DECIDED — spec the exact fields during the payment MVP build.**

---

## 19. Servicer pricing modules (reusable library) — decided 2026-05-27

"Modularize the listing" = a **servicer-owned library of reusable priced components**
("modules") that compose listings, proposals, and the §18 itemized invoice. Define once,
reuse everywhere.

**Module** (new, servicer-owned): `{ label, defaultPrice, taxable?, serviceChargeable?,
active }` — e.g. "Running fee RM50", "Service RM100", "Repair RM50", "Copper pipe RM30".
Optional per-module tax/service-charge flags tie into §18.

**How it flows:**
```
Servicer module library  ──compose──▶  Listing (default module set)
                                            │
                              [Open quote] pre-fills modules + prices
                                            │
                              [Send proposal] servicer picks/adjusts modules
                                            │  → SNAPSHOT as line items (label + price)
                                            ▼
                              Booking + Invoice line items (§18)  ──▶  receipt breakdown
```

**Key rules:**
- **Snapshot on proposal/booking** — line items are frozen onto the booking/invoice, so
  later edits to a library module never change historical invoices.
- **Reuse across listings** — the win for servicers with many listings (AC Doctor's ~60):
  consistent, fast, itemized pricing without re-typing.
- **Relationship to today's `modifiers`** (category-question option-price map): modules
  generalize it. Spec during build — keep category-question options as auto-suggested
  modules, and let servicers add custom modules (running fee, parts) the questions don't cover.
- Feeds **§18** (line items) and pairs with **§17** (the redesigned listing form composes
  modules). Money-relevant → build with the payment MVP.

**Coupling:** §17 (form) + §18 (tax/itemized) + §19 (modules) + §12 (payment/escrow) +
`calculation-audit.md` fixes are now **one interlocking money/listing epic.** They share a
data model and must be specced together, not piecemeal.

**Status: DESIGN LOCKED — MVP, part of the money/listing epic.**

> **Consolidated spec written: `money-listing-epic-spec.md`** — data model, the single
> canonical-total + unified-fee functions, money flow, ordered build plan + test gate, and
> 6 open sub-decisions. That doc is the build source of truth for §12/§17/§18/§19 + calc fixes.

---

## 9. Recommended immediate next step

Start Wave 1. It is four changes, all reversibility-5, that together kill three of your
five complaints (bell redirect, snackbar lag, dead code/sprawl) in well under a day of
Claude-Code time. Then take the quote flow (Wave 2) through a proper design pass —
that one is worth a `/plan-design-review` before implementation because it is the core
conversion funnel and the changes are user-facing.
