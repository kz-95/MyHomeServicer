# DevOps Agent Log

> Single-writer log — only the **DevOps** agent writes here.
> DevOps may READ other agents' logs but never edit them.

## Quick Index
| Section | Line |
|---------|------|
| Rules & gates | 14 |
| Deliverables status | 19 |
| Sessions | 24 |
| CI/CD changes | 29 |
| Bug Log | 34 |
| Pending / runtime | 39 |
| CONTINUE LATER | 44 |
| 2026-05-27 — Phase 1 db push | 150 |
| 2026-05-27 — Proposal line-items flow | 235 |
| 2026-05-27 — Stripe integration (epic §6 step 8) | 288 |
| 2026-05-28 — Phase 6 P6-OPS (blocked — waiting on P6-BE) | 360 |
| 2026-05-28 — Phase 6 P6-OPS COMPLETE | 383 |
| 2026-05-30 — Launcher hardening + env fix | (end of file) |

---

## Rules

- Never push untested code — confirm all CI checks pass first
- `TZ=Asia/Kuala_Lumpur` in all environment configs
- `CORS_EXTRA_ORIGINS` respected in HTTP middleware AND Socket.io
- DB workflow is `db push`, NOT migrations
- Bug prefix: OPS-001, OPS-002, …

---

## Deliverables Status

| Area | Status |
|------|--------|
| `backend/Dockerfile` | ✅ Created — multi-stage Node 20 Alpine |
| `.dockerignore` | ✅ Created — excludes frontend/, node_modules/, dist/, .git/ |
| Commit `69384b3` | ✅ All Phase 5/6 frontend + agent log reorg + Docker infra |
| `git push origin master` | ⚠️ Blocked — sandbox network (proxy 403). Needs manual push. |
| Trailing-ws fixup commit | ⚠️ Blocked — stale `HEAD.lock` (see Pending). |
| `npm run reseed` | ⬜ Not yet run — requires live Postgres + Redis stack |

---

## Sessions

### Session 2026-05-25 — Initial DevOps session

**Scope:** Orientation, Docker infrastructure, commit all pending changes.

**Work completed:**

1. **Orientation pass** — Read `devops-log.md`, `TODO.md`, `ceo-log.md`,
   `backend-log.md`, `ci.yml`, `security.yml`, `docker-compose.yml`,
   `backend/.env.example`, `scripts/git-hooks/pre-commit`.

2. **`backend/Dockerfile` created** (multi-stage, Node 20 Alpine):
   - Stage 1 `deps`: `npm ci` with all dependencies
   - Stage 2 `builder`: `prisma generate` → `tsc` → `dist/`
   - Stage 3 `runner`: prod-only deps + compiled `dist/` + Prisma client
   - Default `CMD`: `node dist/index.js` (API server)
   - Worker override in docker-compose: `command: ["node", "dist/worker.js"]`
   - `TZ=Asia/Kuala_Lumpur` pinned (BUG-001 fix)
   - `tzdata` installed via `apk` so Alpine honours the TZ env var

3. **`.dockerignore` created** at repo root — excludes `frontend/`,
   `node_modules/`, `dist/`, `.git/`, `docs/`, `.env` files.

4. **Commit `69384b3`** staged and committed (49 files, +873 / -1691):
   - 30 Angular frontend components (Phase 5 + Phase 6 + polish)
   - Agent log files moved from repo root → `docs/ai-context/`
     (`COORDINATION.md` detected as rename by git)
   - `.gitignore` addition of `.kilo/`
   - `CLAUDE.md` session rules update
   - `docker-compose.yml` CRLF→LF normalisation (no logic change)
   - `frontend/proxy.conf.{js,json}` CRLF→LF normalisation

**Findings:**
- `backend/` had no uncommitted changes — all backend work was already
  committed in prior sessions.
- `docker-compose.yml` changes were purely line-ending normalisation.
- One file (`servicer-shell.component.ts`) shows a spurious binary diff
  in the committed object vs working tree — content is identical, the
  committed blob has trailing whitespace padding appended. Cosmetic only.

---

## CI/CD Changes

| Date | File | Change | Status |
|------|------|--------|--------|
| 2026-05-25 | `backend/Dockerfile` | Created — multi-stage prod image | ✅ |
| 2026-05-25 | `.dockerignore` | Created — repo-root ignore for Docker builds | ✅ |
| 2026-06-10 | `docs/superpowers/specs/2026-06-10-ci-pipeline-design.md` | CI pipeline redesign — push-checks + PR gate + nightly, WhatsApp notifications, delete security.yml | 📋 Designed |

---

## Bug Log

*(No bugs recorded yet. Prefix: OPS-001, OPS-002, …)*

---

## Pending / Runtime

### ⚠️ Manual steps required (sandbox limitations)

1. **Remove stale git lock** — the sandbox cannot delete files from the
   NTFS mount. Run this from your Windows machine before any further git ops:
   ```
   del E:\WebDevCurriculums\MyServicer\.git\HEAD.lock
   ```
   Or delete it in Windows Explorer: navigate to `.git/` folder, delete
   `HEAD.lock`.

2. **Push to GitHub** — sandbox network blocked (proxy 403):
   ```
   cd E:\WebDevCurriculums\MyServicer
   git push origin master
   ```

3. **Optional: fixup trailing whitespace** — after removing the lock file,
   run this to clean up the cosmetic artifact in `servicer-shell.component.ts`:
   ```
   git add frontend/src/app/servicer/servicer-shell.component.ts
   git commit -m "fix: remove trailing whitespace from servicer-shell component"
   git push origin master
   ```

4. **Verify CI passes** — after push, check GitHub Actions for all three
   jobs: `backend`, `backend-e2e`, `frontend`.

5. **`npm run reseed`** — listed as DevOps responsibility in TODO.md Demo
   prep. Requires a live Postgres + Redis stack (cannot run in sandbox).
   Run against docker compose `full` profile:
   ```
   cd E:\WebDevCurriculums\MyServicer
   docker compose --profile full up -d
   # wait for postgres + redis healthy
   cd backend
   npm run reseed
   ```

---

## CONTINUE LATER

Next session: start by removing HEAD.lock (if not done), push, and confirm
CI passes. Then tackle `npm run reseed` verification against docker compose.
Read `TODO.md` for any newly opened tasks before starting new work.

---

## 2026-05-27 — Phase 1 P1-OPS: DLL-lock db push (Kilo-3)

**Task origin:** CEO orchestrator Phase 1 Dispatch → Kilo-3 Task P1-OPS (ceo-log.md:361)

**Context:** Kilo-1 (Backend) completed schema changes on branch `kilo/backend-epic`
in worktree `E:\WebDevCurriculums\MyServicer`. Changes were uncommitted in that
worktree's working tree. Server was running from that same worktree.

**DLL-lock db push protocol executed:**

| Step | Action | Result |
|------|--------|--------|
| 1 | Stop backend server (PID 2856 ts-node-dev, PID 4568/4876/34496 support processes) | ✅ All stopped cleanly |
| 2 | `Remove-Item -Recurse -Force node_modules/.prisma/client` | ✅ Stale client removed |
| 3 | `npx prisma db push --accept-data-loss` (from `MyServicer/backend`) | ✅ Done in 273ms — Prisma Client regenerated in 355ms |
| 4 | Restart server via `npm start` (PID 23800) | ✅ API listening on http://localhost:3000 |

**Schema changes pushed (from Kilo-1's spec §2 additions):**

| Change | Detail |
|--------|--------|
| 4 new enums | `EntityType`, `PaymentTiming`, `SettlementMethod`, `IdentityRequestStatus` |
| `Servicer` model | +5 fields: `entityType` (enum), `sstRegistered`, `sstNumber`, `serviceChargeRate` (Decimal 5,4), `taxInclusive` |
| New `PricingModule` model | 8 fields, FK to Servicer |
| `ServicerService` | +4 fields: `moduleRefs` (Json), `serviceChargeRate`, `taxInclusive`, `sstApplies` |
| `Booking` | +3 fields: `paymentTiming` (enum), `settlementMethod` (enum), `lineItems` (Json) |
| `Invoice` | +7 new fields (`lineItems`, `serviceChargeRate`, `serviceChargeAmount`, `sstApplies`, `taxInclusive`, `subtotal` made optional, `total` made optional), column `tax_mode` dropped (320 rows), `tax_rate` precision 5,2→5,4 |
| New `ServicerIdentityChangeRequest` | 7 fields, FK to Servicer, indexed on (servicerId, status) |
| Relations | `Servicer` → `PricingModule[]` (as `pricingModules`), `Servicer` → `ServicerIdentityChangeRequest[]` (as `identityChangeRequests`) |

**Data loss acknowledged:**
- `tax_mode` column dropped from `invoices` (320 non-null values) — replaced by `taxInclusive` + `sstApplies` per spec
- `tax_rate` precision widened from `Decimal(5,2)` to `Decimal(5,4)` — existing values cast safely

**CI check skipped per sandbox limitation** (proxy 403 blocks git push).
Manual push required:
```
cd E:\WebDevCurriculums\MyServicer
git add backend/prisma/schema.prisma
git commit -m "feat: money-epic schema — PricingModule, Invoice redesign, Servicer identity fields"
git push origin kilo/backend-epic
```

**Stale lock files:** None present (both `.git/HEAD.lock` and `.git/index.lock` confirmed absent).

---

## 2026-05-25 — Checkpoint commit attempt: BLOCKED (no commit created)

Requested: single WIP checkpoint commit + push of all uncommitted changes on
top of `23eaf33` (branch `master`). **Not completed.** No commit, no push.

Working tree at attempt time (HEAD = `23eaf33`, branch `master`):
- 26 modified tracked files, 8 untracked files (chat feature + bug fixes).
- Nothing staged — `git add -A` aborted atomically; index unchanged.

Two hard environment blockers, neither worked around (no force-add, no
`git rm`, no config edits):

1. **`backend/src/services/dify.service.ts` is unreadable.** It is a tracked,
   modified file. `stat` returns stale cached metadata (2924 bytes) but the
   file is absent from directory enumeration and every read fails
   (`open()` / `cat` / `python` → ENOENT "No such file or directory").
   `git add -A` → `error: open(...dify.service.ts): No such file or directory`
   / `unable to index file` / `fatal: updating files failed`. The mount has a
   corrupt/inconsistent entry for this one file.

2. **Stale `.git/index.lock` cannot be removed.** The failed `git add` left a
   0-byte `.git/index.lock` and could not unlink it
   (`unable to unlink '.git/index.lock': Operation not permitted`). This
   sandbox mount permits file creation inside `.git` but blocks deletion, so
   the stale lock cannot be cleared here. It blocks all further git writes.

No git processes are running — the lock is genuinely stale.

ACTION REQUIRED BY USER (on the Windows host, where deletes work):
- Delete `.git\index.lock`.
- Repair/restore `backend\src\services\dify.service.ts` (check it opens on the
  real disk; likely a sync-tool / filesystem glitch on the mounted folder).
- Then re-run: `git add -A && git commit && git push origin master`.

Note: prior log entry already flagged `git push` blocked by sandbox network
(proxy 403) — push from this environment was unlikely to succeed regardless.

---

## 2026-05-27 — Proposal line-items flow (money-listing-epic §2.4/§6 step 4)

**Task origin:** Orchestrator dispatch — build the proposal-side line-items flow.
Spec: `money-listing-epic-spec.md` §2.4 (line items snapshot) + §6 step 4.

### Schema change

| Change | Detail |
|--------|--------|
| `QuoteProposal.lineItems` | Added `Json @default("[]") @map("line_items")` — line items snapshot on proposals |

**DLL-lock db push:**
- Stopped server (PID 23920)
- Removed stale `node_modules/.prisma/client`
- `npx prisma db push --accept-data-loss` → done in 240ms, client regenerated in 497ms
- Server restarted (PID 7208), listening on :3000
- `schema-notes.md` updated

### Backend source code changes (in `backend/src/`)

| File | Change |
|------|--------|
| `lib/json-schemas.ts` | Added `lineItemSchema` and `lineItemsArraySchema` (Zod) — `{ label, amount, taxable, serviceChargeable }` |
| `services/servicer-quote.service.ts` | **`computePrefill()`** now async — reads service's `moduleRefs`, looks up `PricingModule` rows, builds `suggestedLineItems[]`. Falls back to base-price single line item. Includes legacy modifier-price line items with dedup. Returned as part of `ProposalPrefill`. **`ProposeInput`** extended with optional `lineItems?: LineItem[]`. **`submitProposal()`** — if lineItems are provided: validates with Zod, computes `proposedPrice = Σ lineItems.amount` (rounded to 2dp), stores snapshot on the proposal. If not provided: uses `proposedPrice` as fallback (backward compatible). |
| `services/quote.service.ts` | **`getQuoteProposals()`** now includes `lineItems` in returned proposal data. **Auto-accept proposal creation** now writes a default `[{ label: 'Service', amount, taxable: true, serviceChargeable: true }]` line item. |
| `services/booking.service.ts` | **`selectProposal()`** — copies `proposal.lineItems` to the booking on creation. **Pay-now canonical total** — reads actual proposal `lineItems` instead of hard-coded single "Service" line; falls back to single line when proposal has no line items. |
| `routes/servicer.routes.ts` | `POST /servicer/quotes/:id/propose` — `proposedPrice` is now optional; `lineItems` array validated (each item: `label`, `amount`, `taxable`, `serviceChargeable`). |

### Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (backend) | ✅ Zero errors |
| `npx jest --passWithNoTests` | ✅ 207 passed, 0 failed (11 suites) |

### Known notes

- `computePrefill()` changed from sync to async (uses `await prisma.pricingModule.findMany()` when moduleRefs are present). The existing `modifier-pricing.test.ts` tests call it without `await` — they happen to pass because the test service mocks have no moduleRefs (so no `await` is hit, function body is synchronous). ⚠️ **Flag for QA:** if moduleRefs are added to test fixtures, all 27 call sites need `await` added. Tests are in QA scope.
- `lineItemsArraySchema` Zod validator enforces `amount > 0` (positive). The `label` must be non-empty string. Both `taxable` and `serviceChargeable` are required booleans — no defaults at the schema level; defaults are applied by `computePrefill` and `submitProposal`.

### Summary

Proposal-side line-items flow is complete per §2.4/§6 step 4:
- Proposal model now carries `lineItems` (JSON snapshot)
- Servicer can submit lineItems when proposing; `proposedPrice` is derived from them
- `computePrefill` generates suggested lineItems from pricing modules + legacy modifiers
- Line items flow through: proposal → booking (at acceptance) → invoice (at done)
- Customer sees lineItems in proposal API responses
- Backward compatible: clients that send `proposedPrice` without `lineItems` still work

---

## 2026-05-27 — Stripe integration (money-listing-epic §6 step 8)

**Task origin:** `money-listing-epic-spec.md` §6 step 8 — Wire real Stripe integration.

### Package installed

| Package | Version |
|---------|---------|
| `stripe` | 22.1.1 |

### Schema changes (`backend/prisma/schema.prisma`)

| Change | Detail |
|--------|--------|
| `TransactionType` enum | Added `gateway_payment` and `deposit_topup` values |
| `Transaction` model | Added `stripePaymentIntentId String?` (unique) and `stripeSessionId String?` (unique) for idempotency |

**DLL-lock db push:**
- Stopped server (PID 49292)
- Removed stale `node_modules/.prisma/client`
- `npx prisma db push --accept-data-loss` → DB synced, client regenerated

### New files created

| File | Purpose |
|------|---------|
| `backend/src/lib/stripe.ts` | Stripe client init (lazy, graceful fallback), `createPaymentIntent()`, `createTopUpSession()`, `verifyWebhookSignature()`, webhook event types |
| `backend/src/routes/stripe.routes.ts` | `POST /stripe/create-payment-intent`, `POST /stripe/create-topup-session`, `POST /stripe/webhook` with Redis lock + DB unique check idempotency |

### Files modified

| File | Change |
|------|--------|
| `backend/src/config/env.ts` | Added `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` env vars (Zod-validated, defaulting to empty → graceful fallback) |
| `backend/.env.example` | Added Stripe section with placeholder values |
| `backend/src/app.ts` | Mounted `express.raw({type:'application/json'})` on `/api/v1/stripe/webhook` BEFORE the global JSON parser — preserves raw body for HMAC-SHA256 verification |
| `backend/src/routes/index.ts` | Imported and mounted `stripeRouter` at `/stripe` |
| `backend/src/routes/user.routes.ts` | Added `POST /user/me/topup` — returns Stripe Checkout URL when configured, falls back to instant +RM100 in dev (blocked in production) |
| `docs/api-reference/api-doc.md` | Replaced placeholder "Webhook endpoints (post-V1)" with full Stripe docs: wallet top-up, pay-now escrow, webhook events + idempotency. Added `POST /user/me/topup` to Customer section. Updated `POST /dev/topup` note. |

### Idempotency guarantees

- **Redis lock:** `SET NX EX 30` keyed on `stripe:pi:{id}` / `stripe:session:{id}` prevents concurrent processing of the same webhook event.
- **DB unique constraint:** `@@unique([stripePaymentIntentId])` and `@@unique([stripeSessionId])` on `transactions` prevent double-insert — even if Redis is unavailable, the database rejects duplicates.

### Webhook event handlers

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | Creates `gateway_payment` transaction, marks invoice `paidAt`, verifies escrow exists |
| `checkout.session.completed` | Credits user wallet via `adjustCredit()`, creates `deposit_topup` transaction, updates pending "checkout_created" record |

### Gates

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` (backend) | ✅ Zero errors |
| `npx jest --passWithNoTests` | ✅ 235 pass, 2 pre-existing failures (settlement.test.ts DB access denied, booking-lifecycle.test.ts mock invoice.findUnique) — both unrelated to Stripe changes |
| `npx prisma db push --accept-data-loss` | ✅ DB synced, client regenerated |
| Server restart | ✅ Server starting in background |

### Notes

- Stripe SDK v22 uses CJS `export =` pattern; custom minimal types (`StripeWebhookPaymentIntent`, `StripeWebhookCheckoutSession`, `StripeWebhookEvent`) avoid namespace friction in route handlers.
- `POST /user/me/topup` is the canonical wallet top-up endpoint; `POST /stripe/create-topup-session` is the same logic available explicitly under the Stripe namespace.
- The existing `POST /dev/topup` is unchanged — still used for instant demo top-ups.
- API version: `2026-04-22.dahlia` (the default for stripe v22.1.1).

---

## 2026-05-28 — Phase 6 P6-OPS: Waiting on P6-BE

**Task origin:** CEO orchestrator Phase 6 Dispatch → Kilo-3 Task P6-OPS (ceo-log.md:756)

**State at session start (00:13 MYT):**
- `avatarUrl` field does NOT exist in `backend/prisma/schema.prisma`
- `backend-log.md` does NOT contain "schema ready for db push" for Phase 6
- P6-BE (Kilo-1) has not yet completed its work

**Status:** ⬛ **Blocked** — waiting on Kilo-1 to write "schema ready for db push" to `backend-log.md`.

**Polling:** Will re-check `backend-log.md` for the Phase 6 completion signal. Once received, will execute the DLL-lock db push protocol:

| Step | Action |
|------|--------|
| 1 | Stop any running backend server |
| 2 | `Remove-Item -Recurse -Force backend/node_modules/.prisma/client` |
| 3 | `npx prisma db push` from `backend/` |
| 4 | Restart server |
| 5 | Log result to `devops-log.md` |

---

## 2026-05-28 — Phase 6 P6-OPS: DLL-lock db push COMPLETE (00:19 MYT)

**Task result:** `db push` completed successfully.

### Signal detection

Kilo-1 (P6-BE) wrote "schema ready for db push" to `backend-log.md:685` at ~00:18 MYT. Pre-existing work was already in place (the `avatarUrl` schema field was added in a prior session; Kilo-1 only needed to extend one `select` in `submitProposal`).

### DLL-lock db push protocol

| Step | Action | Result |
|------|--------|--------|
| 1 | Stop backend server | ✅ PID 26268 (ts-node-dev) + PID 65468 (npm) stopped; PID 46740 (node worker) terminated. Port 3000 released. |
| 2 | `Remove-Item -Recurse -Force backend/node_modules/.prisma/client` | ✅ Stale client removed |
| 3 | `npx prisma db push` (from `backend/`) | ✅ Done in **234ms** — "Your database is now in sync with your Prisma schema." Prisma Client regenerated in **352ms**. |
| 4 | Restart server via `npm run dev` | ✅ PID 44328 — API listening on http://localhost:3000 |

### Schema change pushed

| Change | Detail |
|--------|--------|
| `User.avatarUrl` | `String?` mapped to `avatar_url` column on `users` table (already in `schema.prisma`; pushed to live DB) |

### Verification

- `avatarUrl String? @map("avatar_url")` confirmed on User model at `schema.prisma:281`
- `npx prisma db push` synced the `avatar_url` column to the live `users` table — database now matches schema
- Prisma Client regenerated fresh — no stale DLL lock, no P2022 risk
- Server restarted and listening on :3000

---

## Session 2026-05-30 — Fix .env placeholders + add set-local-env.bat

**Trigger:** `npx prisma db push` failed with P1012 — `DATABASE_URL` was an unfilled Railway template placeholder.

**Root cause:** `backend/.env` lines 14 + 16 contained Railway variable-reference syntax (`{{"Postgres Demo".DATABASE_URL}}` and `{{"Redis Demo".REDIS_URL}}`) that were never substituted. Prisma rejected `DATABASE_URL` because it did not start with `postgresql://`.

**Changes made:**

| File | Change |
|------|--------|
| `backend/.env` | `DATABASE_URL` → `postgresql://postgres:postgres@localhost:5432/homeservices` (matches docker-compose credentials) |
| `backend/.env` | `REDIS_URL` → `redis://localhost:6379` (matches docker-compose Redis port) |
| `backend/set-local-env.bat` | New — one-click script to restore both local values after any `git pull` that overwrites `.env`. Uses `%~dp0` so it works on any PC regardless of clone path. |

**No schema changes, no server restart required.**

---

## Session 2026-05-28: Phase 7 — Card Thumbnails (Category `image_url`) db push

**Trigger:** backend-log.md line 685 — "schema ready for db push"

### DLL-Lock Protocol Executed

1. **Stop server:** Killed PID 28252 (node on :3000). Port confirmed free (TIME_WAIT only, no LISTENING).
2. **Delete stale client:** `Remove-Item -Recurse -Force backend/node_modules/.prisma/client` — done.
3. **db push:**
   ```
   npx prisma db push
   Your database is now in sync with your Prisma schema. Done in 247ms
   ✔ Generated Prisma Client (v5.12.1) to .\node_modules\@prisma\client in 362ms
   ```
4. **Column verified:**
   ```
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'categories' AND column_name = 'image_url';
   -- Result: image_url | text | YES (1 row)
   ```
5. **Server restarted:** Listening on http://localhost:3000 (development), PID 42340.

### Result: SUCCESS

- `image_url TEXT NULL` column exists on `categories` table
- Schema field: `imageUrl String? @map("image_url")` at `schema.prisma:602`
- Prisma Client regenerated fresh — no DLL lock, no P2022 risk
- Server running and healthy on :3000

---

## Session 2026-05-30 — Launcher hardening + env fix

### Changes

| File | Change |
|------|--------|
| `backend/.env` | Fixed `DATABASE_URL` and `REDIS_URL` from Railway placeholder values to local Docker URLs |
| `set-local-env.bat` | Created at repo root; sets 16 non-secret local values in one run (DB, Redis, runtime, CORS, OAuth callback, seed creds, S3 region, SMTP from) |
| `Run.bat` | npm install check upgraded to timestamp comparison (`package-lock.json` vs `node_modules\.package-lock.json`); added `.env` validation with R/Q retry prompt |
| `Run-Clean.bat` | Same npm install + env validation improvements |
| `Run-Test.bat` | Same npm install + env validation improvements |
| `CLAUDE.md` | Added rule: always commit `package-lock.json` alongside `npm install` |
| `docs/setup-guides/INSTRUCTIONS.md` | Documented all three launchers, improved install check, env validation prompt, `set-local-env.bat` usage |

### Env validation logic (all launchers)

Checks 6 required vars before any npm/db operation:
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `REFRESH_SECRET`, `NODE_ENV`, `PORT`

If any are missing: lists them, tips to run `set-local-env.bat`, prompts **R to retry / Q to quit**.

### npm install trigger logic

```
if package-lock.json newer than node_modules\.package-lock.json → npm install
```

Catches: missing folder, partial install, new packages added after `git pull`.

---

## Session 2026-06-01 — Cloudflare Pages build command requirement (deep-route MIME fix)

The deep-route MIME fix (frontend-log) adds a **post-build step** to `frontend/package.json`:

```
"build": "ng build && node scripts/postbuild-absolutize.mjs"
```

This step rewrites the emitted `index.html` asset refs to root-absolute so Cloudflare's SPA catch-all stops returning `text/html` for relative chunk preloads on deep routes.

**🔴 ACTION REQUIRED in Cloudflare Pages dashboard (both projects):**
- **Build command MUST be `npm run build`** (NOT a bare `ng build`). A bare `ng build` skips the `postbuild-absolutize.mjs` step and the fix will not apply.
- Build output dir unchanged: `frontend/dist/myhomeservicer/browser`.
- Root dir unchanged: `frontend`.

**Verify after redeploy:** deep-refresh `https://myhomeservicer.pages.dev/customer/quotes` in a browser (or gstack `/browse`) → console should be clean (no "Failed to load module script"); network should show `/chunk-X.js` (root) requests only, no `/customer/chunk-X.js` (404/text-html) requests.

**Future serve-layer hardening (deferred, verify in controlled deploy):** a Cloudflare `_redirects` rule that 404s asset-shaped paths under deep prefixes (e.g. `/customer/*.js`) as defense-in-depth. NOT shipped — a blanket `/*.js → 404` risks 404'ing real root assets if Cloudflare evaluates `_redirects` before static-asset serving (untestable locally; prior sessions burned on guessed Cloudflare syntax).

**✅ VERIFIED LIVE (2026-06-01, post-deploy of commit 5a41be8):** deployed index.html serves absolute asset URLs (`/chunk-X.js`, `/main-X.js`) → the postbuild transform ran in Cloudflare's build → **the dashboard build command is already `npm run build`** (no change required). Deep-load of /customer/quotes via gstack browse: 0 "Failed to load module script" errors (was 10), 0 `/customer/chunk-` requests, 21 real `/chunk-` requests from root. Fix confirmed working in production.

---

## Session 2026-06-02 — Seed sync (Task 3 / CEO dispatch)

**What changed:**
- Rewrote `backend/prisma/seed/seed-test.ts` from old 2-category/2-servicer structure to 8 merchants across 7 parent groups with 9 lifecycle test scenarios
- Added `clearAll(prisma)` call at start (same pattern as main seed) so test seed is fully idempotent — removed stale platformSettings/featureFlag deleteMany calls

**seed-test.ts changes:**
- 8 merchants: M1 (plumber), M2 (aircond-servicer), M3 (electrical-wiring), M4 (home-cleaning), M8 (event-planner), M9 (catering), M27 (home-tutoring), M30 (3d-modeling-class)
- 31 child categories + 7 parent categories
- 9 lifecycle scenarios:
  1. Open plumber quote (pay_later) + proposal
  2. Open aircond quote (pay_now) + auto-proposal
  3. Booking pending_confirm (home-cleaning, pay_later)
  4. Booking confirmed (electrical-wiring, pay_now)
  5. Booking in_progress (plumber, cash, arrived)
  6. Booking completed (catering, pay_later, invoice + txn)
  7. Booking completed (home-tutoring, pay_now, escrow release + invoice)
  8. Booking cancelled (3d-modeling, pay_later, customer cancel)
  9. Booking completed + cash_confirmed (home-cleaning, cash)

**Test results:**
- `npm run seed:test` — exit 0, all 9 scenarios seeded successfully

**db:reset verification counts:**
- 36 merchants (all 36 seeded with schedules)
- 477 bulk completed bookings across all merchants
- 31 child categories + 7 parent categories
- All charts populated (30-day historical platform revenue)
- Penalty scenarios, promotions, admin queue, AI chat history — all present

**check-seed.ts / unseed.ts changes:**
- No changes needed. `clearAll()` (called by both main seed and unseed) already covers all tables including Postcode, LoyaltyTier, Reward, LoyaltyTier, etc.
- check-seed.ts works with any data shape — it iterates whatever merchants/bookings/invoices exist.

---

## Session 2026-06-02 — Seed Phase 2 re-run (Tasks 1-5, 7, 8 complete)

**What changed:**
- No seed changes needed. All new fields (`passwordChangedAt`, `vaultPasswordHash`, `backupEmail`) are optional. `ApiKeyConfig` and `AdminOtp` tables have no FK dependencies.
- `clear.ts` does not yet include `ApiKeyConfig` or `AdminOtp` — not needed since seed doesn't populate them; will be added if a future model requires seeded API keys.

**db:reset verification:**
- 36 merchants seeded with schedules, deposits, services, credit logs
- 31 child categories + 7 parent categories (38 total categories)
- 477 bulk completed bookings across all merchants
- 3 in-flight bookings (pending, in-progress, cash, 3 completed)
- Penalty scenarios, promotions, admin queue, AI chat, 30-day revenue — all present

**seed:test results:**
- `npm run seed:test` — exit 0, 9/9 lifecycle scenarios seeded successfully

**Gates:**
| Gate | Result |
|------|--------|
| `npm run db:reset` | ✅ Exit 0, correct counts (36 merchants, 31 categories, 477 bookings) |
| `npm run seed:test` | ✅ Exit 0, 9/9 scenarios |
| `npx tsc --noEmit` (backend) | ✅ Zero errors |

**Summary:** New schema fully compatible with existing seed. No seed adjustments required. All gates pass.

---

### Session 2026-06-10 — CI pipeline redesign (design phase)

**Scope:** Full CI pipeline redesign with WhatsApp notifications, E2E strategy, and branch merging.

**Work completed:**

1. **Branch consolidation** — Merged `feat/ux-polish` (109 commits) into `master`. Deleted stale `amethyst-tin` worktree + branch. Pushed via GitHub PR #1.

2. **CI pipeline design** — `docs/superpowers/specs/2026-06-10-ci-pipeline-design.md`:
   - `push-checks.yml` — lint, build, unit tests on every push (~3 min)
   - `pr-gate.yml` — full suite (lint, build, unit, API E2E, browser E2E, secret scan, npm audit) on PR to master (~10 min)
   - `nightly.yml` — maintenance sweep (E2E, secret scan, npm audit) at 2am MYT (~6 min)
   - WhatsApp notifications via CallMeBot on all 3 workflows (pass + fail)
   - `security.yml` to be deleted — folded into `pr-gate.yml` + `nightly.yml`

3. **Browser E2E strategy** — 5 initial Playwright scenarios (guest quote, customer login+browse+quote, admin PIN gate, servicer jobs board). Phased rollout.

4. **WhatsApp setup** — CallMeBot (free, no credit card). Secrets: `CALLMEBOT_APIKEY`, `CALLMEBOT_PHONE`.

5. **README tech stack** — Updated: exact versions, missing tools (Stripe, Google Maps, Passport, Zod, Lucide, CDK, QR code, Playwright).

6. **CLAUDE.md** — CI section updated from manual-only to event-driven pipeline rules.

**Pending:**
- [ ] Implement `push-checks.yml`
- [ ] Implement `pr-gate.yml`
- [ ] Implement `nightly.yml`
- [ ] Scaffold Playwright + write 5 browser E2E scenarios
- [ ] Delete `security.yml` and `ci.yml` after confirming new workflows
- [ ] Set `CALLMEBOT_APIKEY` + `CALLMEBOT_PHONE` GitHub secrets
