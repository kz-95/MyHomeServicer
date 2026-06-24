# Engineering Brief — Remaining Items

> **Date**: 2026-06-24 · **Branch**: `feat/sp3-dispatch-cards` (NEVER commit to master)
> **Source of truth**: `TODO.md` · **Target**: 20 remaining items across DEMO-BLOCKING, STRETCH, and PLATFORM POLISH
> **Phase**: Post-dispatch-card polish + demo readiness

---

## Project Overview

**MyServicer** — on-demand home services marketplace (Airbnb TaskRabbit for Malaysia).
Full-stack: Angular 18 standalone (signals, `@if/@for`), Express + TypeScript, Prisma + PostgreSQL,
Redis + BullMQ, Socket.io, Stripe. 49 Prisma models, ~1400-line schema.

**Current state**: The dispatch-card initiative (5 plans, 31 commits) is code-complete.
The 7-beat demo thread (customer → servicer → pay → done → earnings → admin) has real wiring.
Now hardening the platform for demo walkthrough and production readiness.

---

## Branch & Commit Rules

- **Branch**: `feat/sp3-dispatch-cards`. Never commit to `master`.
- Commit per item with a **clear Conventional Commits message** (e.g., `feat(sp4): wire isOnline presence for live dispatch rotation`).
- NO `Co-Authored-By:` / NO AI attribution trailer. NO `--no-verify`.
- NEVER `git add -A` — stage only files this item touched.
- Before pushing, squash/rebase into clean commits. No long chains of WIP commits.

---

## Technical Constraints

### Backend
- **STOP the backend server (port 3000) before ANY `prisma migrate`.** The Windows DLL lock on
  `query_engine-windows.dll.node` makes `prisma generate` fail silently (P2022 on next login).
- After every `backend/src/` edit: `rtk proxy npx tsc --noEmit` (NOT plain `rtk npx tsc` — hides source errors).
- After schema changes: `npm run db:migrate -- --name <change>` → commit the migration folder → restart server.
- All money fields use `Prisma.Decimal`. Never `float`/`number` for currency.
- Never pass `req.body` directly to Prisma — pick fields explicitly.
- BullMQ job payloads validated with Zod.
- Run `npm test` (Jest) after backend changes. 382 tests should stay green.

### Frontend
- After every change: `npx tsc --noEmit` THEN `ng build --configuration development`.
  A broken AOT serves stale `ng serve` bundles and masks errors. Both must pass.
- All modals/dialogs MUST use `<app-modal>` (native `<dialog>` + `showModal()`) — NEVER hand-roll
  `position: fixed` backdrops inside feature/page components (STYLE-RULES §7.0).
- Use existing `--color-*` CSS tokens. Angular standalone components + signals.

### Both
- Keep docs in sync: tick checkboxes in `TODO.md` + return a brief summary after each item.

---

## Items — Ordered by Priority

### PRIORITY 1: Demo-critical

| # | Item | Effort | Notes |
|---|------|--------|-------|
| **8** | Finance engine — verify end-to-end | M | Walk the money path with real numbers: escrow_hold → escrow_release + platform_fee → urgent-fee 20/80 split → admin dashboard. Verify every number reconciles. |
| **S2** | Distance km on dispatch card | M | Add `lat`/`lng` to `Servicer` model (schema + migration), seed coordinates for demo servicers, add Haversine helper to backend, return `distanceKm` in `listIncomingQuotes` feed, render "~X km away" on card face. |
| **SP4** | Full SP4 live-dispatch | L | Wire `isOnline` presence + `ServicerSchedule` working-hours gating into `dispatch.service.ts` → `startDispatchRotation`. Admin-configurable rotation timer. Decline → rotate → async fallback. Google Map preview in accept prompt. Spec: `docs/superpowers/specs/2026-05-30-live-order-accept-dispatch-design.md`. This unblocks item 7 — the demo overlay won't fire without presence/availability live. |
| **7** | Live dispatch overlay — verify | S | After SP4 wiring, walk end-to-end: quote created → rotation fires → accept-now overlay pops with countdown → servicer accepts/declines → next servicer on timeout. Verify online/offline guard. |

### PRIORITY 2: Dispatch card polish

| # | Item | Effort | Notes |
|---|------|--------|-------|
| **ED** | Estimated duration on card face | S | Show "~90 min" on dispatch card from listing prefill `estimatedDurationMin`. Currently only in propose/expand flow. Frontend-only. |
| **NAV** | Maps/Waze on confirmed booking | S | Add "Open in Google Maps / Waze" deep-link buttons to the booking detail view (confirmed/in_progress/completed). Reuse `openMap()` pattern from dispatch card. |

### PRIORITY 3: Platform hardening

| # | Item | Effort | Notes |
|---|------|--------|-------|
| **LINK** | Route redesign + dead link sweep | M | One pass: (a) nest admin/customer routes, (b) audit all backend `notify()` `linkUrl` emitters + Stripe return URLs for broken paths after C2 customer route rename, (c) fix servicer dashboard quickLinks, (d) fix chat AI prompt route references. grep for old paths: `/bookings/active`, `/customer/quote/new`, `/customer/chat`, `/contact`, `/admin/dashboard`. Redirects exist but emitters should be clean. |
| **SP3** | SP3 listing wizard | L | Rework `services.component.ts` (1151-line monolith) into 4-step wizard: basics / pricing / tax-modules / accept. Create-then-PATCH save. Routes: `/services/new` + `/:id/edit`. Priced grid active-aware. 7 decisions locked (`project-sp3-wizard-design`). See memory for full constraints. |
| **S3** | Seed reform | M | Cap each servicer at 3 service listings (currently over-seeded). Add profile pictures (avatar/logoUrl) for servicers M97–M105. Seed painting/moving/gardening servicers (currently browse shows 0). |
| **MAP** | In-app map debug | S | Fix `app-map-view` component (broken API-key load / init timing). Blocking any embedded map previews. |
| **RPT** | Servicer report button | M | Add "Report customer/job" button to Active Jobs tab, History tab, and dispatch overlay prompt. |
| **RPP** | Admin reports list polish | S | Card rendering, category data populating correctly, notification wiring in admin reports tab. |

### PRIORITY 4: Admin & UX

| # | Item | Effort | Notes |
|---|------|--------|-------|
| **REW** | Customer rewards / deposit-credit promotions | M | Backend + frontend for reward redemption and deposit-credit promo flow. |
| **ADM** | Admin banned-accounts, deactivate-account, customer search/filter | M | Admin user management: ban toggle, deactivate, search/filter customers. |
| **PW** | Forgot-password + settings refinements + PIN-registration | M | Password reset flow. Settings page polish. PIN validation on registration. |
| **VAL** | Cancel reason presets + form validation UX + admin footer | S | Dropdown presets for cancel reasons. Per-form error states where missing. Wire admin footer links. |
| **SEC** | IDOR audit + Decimal-as-string + global-search | M | Audit all `:id` route params for ownership checks. Ensure Decimal fields serialize to string (JSON safety). Verify global search covers all relevant fields. |
| **RFG** | routeFor() relative-path guard | S | Defense-in-depth: ensure all route navigations use typed paths, not magic strings. |
| **ITM** | Itemization | M | Separate "service listing" (offering) vs "itemized line items" (parts/labour breakdown). Defer execution until SP3-SP4 land — just document the design decision. |

### PRIORITY 5: Stretch

| # | Item | Effort | Notes |
|---|------|--------|-------|
| **FINTECH** | Full fintech P1-P5 | XL | Wallet model + BalanceCheckpoint (P1), Fee engine (P2), Saved payments + auto top-up (P3), Escrow automation (P4), Financial reporting (P5). Build in order. Spec: `docs/superpowers/specs/2026-06-23-admin-dashboard-financial-redesign.md` §Fintech roadmap. |

---

## Key Files to Read First per Item

| Item | Read first |
|------|-----------|
| S2 (distance km) | `backend/prisma/schema.prisma` (Servicer model, line ~655), `backend/src/services/servicer-quote.service.ts` (listIncomingQuotes ~line 288) |
| SP4 (dispatch) | `backend/src/services/dispatch.service.ts`, `backend/src/jobs/dispatch.jobs.ts`, `frontend/src/app/shared/dispatch-overlay.component.ts` |
| 7 (overlay verify) | Same as SP4 + `frontend/src/app/shared/dispatch-prompt-guard.component.ts` |
| 8 (finance verify) | `backend/src/services/booking.service.ts` (selectProposal ~line 89, escrow → line 213), `backend/src/routes/stripe.routes.ts` |
| LINK (dead links) | `backend/src/services/notification.service.ts` (notify emitters), `backend/src/routes/stripe.routes.ts` (return URLs), `frontend/src/app/servicer/pages/dashboard.component.ts` (quickLinks) |
| SP3 (listing wizard) | `frontend/src/app/servicer/pages/services.component.ts` (monolith), `frontend/src/app/servicer/pages/listing-advanced.component.ts` (reference wizard), memory `project-sp3-wizard-design` |
| SEC (IDOR audit) | All `backend/src/routes/*.ts` — grep `req.params` crossed with `req.user!.id` ownership checks |

---

## Verification Gates

After each item:
1. Backend: `rtk proxy npx tsc --noEmit` — 0 new errors
2. Backend: `npm test` — all existing tests green
3. Frontend: `npx tsc --noEmit` — 0 errors
4. Frontend: `ng build --configuration development` — exit 0
5. Tick the item checkbox in `TODO.md`
6. Summarize what changed (1-2 lines)

---

## Project Memory & Specs

- **Dispatch card spec**: `docs/superpowers/specs/2026-06-23-dispatch-card-timing-urgent.md`
- **Admin dashboard spec**: `docs/superpowers/specs/2026-06-23-admin-dashboard-financial-redesign.md`
- **SP4 dispatch design**: `docs/superpowers/specs/2026-05-30-live-order-accept-dispatch-design.md`
- **Schema reference**: `docs/ai-context/schema-notes.md`
- **API reference**: `docs/api-reference/api-doc.md`
- **Security notes**: `docs/ai-context/security-notes.md`
- **Setup guide**: `docs/setup-guides/INSTRUCTIONS.md`
- **Read on demand only**: STYLE-RULES.md, tech-stack.md, seed-plan.md

---

## Start Here

Priority 1 items first: **S2 (distance km)** → **SP4 (dispatch)** → **7 (verify)** → **8 (finance verify)**.
Then Priority 2-5 in order. Each item is self-contained and can be committed independently.
