# Session Handoff - for next agent

**Updated:** 2026-06-22 | **Branch:** `feat/sp3-dispatch-cards`
**Session mode:** autopilot (clear safe items, hand off large/risky ones)

---

## What this session did (all committed to `feat/sp3-dispatch-cards`)

1. **Committed inherited dirty tree** (was "done from another side"):
   - `feat(security): 60s PIN cooldown after 3 failed attempts` - Redis-backed
     attempt counter (`pin:cooldown:<userId>`, MAX 3 / 60s), `checkPinCooldown`
     gate + `recordPinFailure/Success` wired into admin/chat/llm-keys/servicer
     routes + deposit flow. New `backend/src/middleware/pin-cooldown.ts`.
   - `feat(ui): gate demo autofill behind demo-unlock, polish review layout, favicon`
     - Demo Auto-fill button hidden unless `DemoUnlockService.unlocked()`
     (customer quote-form + guest quote); review "Service" block layout; favicon.ico.

2. **`fix(sp3): MYT weekday + Decimal coerce`** -
   - `sp3-auto-accept.service.ts availabilityOk`: shift `preferredDate` +8h before
     `getUTCDay()` so a near-midnight-UTC quote maps to the correct MYT weekday.
     **Latent** until Work-stream B wires `evaluateAutoAcceptGates` into the live flow.
   - `services-modules.component.ts`: coerce Decimal-as-string `price` → `Number`
     on load (Phase-2 carry-fwd #2). gitignored `frontend/playwright-report`.

## Key discoveries that COLLAPSE the old backlog (TODO.md was stale)

- **SP-3 Phase-2 Work-stream A (schema rework) is ALREADY DONE.** The
  `merchant→servicer` rename + commits `0cc8984`/`23fdc47` already added every
  Phase-2 column to `ServicerService` (schema.prisma:596): `listingMode` (610),
  `moduleRefs` (630), `autoAccept` (624), `estimatedDurationMinutes` (615),
  `priceType` (608), `autoAcceptMessage` (626). The 3 engine files
  (`listing-pricing` / `sp3-auto-accept` / `proposal-view`) are committed and
  **compile clean** (backend tsc exit 0). No migration needed. TODO §"Work-stream A"
  can be checked off.

- **Seed for painting/moving/gardening is ALREADY correct in code.** M97–M105 =
  9 servicers + 18 published `ServicerService` listings across the 3 categories
  (`accounts.ts:2117-2304`, categories in `static.ts:2159/2236/2319`, listing-create
  loop `seed.ts:554-576`). Browse shows 0 providers ONLY because the **live DB
  predates these rows**. Fix = reseed (see Action #1 below). No code change.

- **Routing restructure is mostly unnecessary.** Recon (full report below) found
  the *functional* parts already correct: all 16 backend `linkUrl` emitters resolve
  to existing routes, dead links (`/customer/chat`, `/contact`, `/admin/dashboard`,
  `/admin/money`) already hotfixed, and every owned `:id` detail endpoint enforces
  `userId`/`servicerId` in its `where` clause (no IDOR). Only the **cosmetic**
  flat→nested path move (`/customer/bookings/*`, `/admin/settings/*`) is undone -
  doing it would BREAK currently-working links for zero functional gain. **Recommend
  skip / lowest priority.**

- DB state verified: `prisma migrate status` (raw) = **15 migrations applied,
  "Database schema is up to date!"** Healthy + in sync. (Note: `rtk`-wrapped prisma
  output is lossy - it reported "0 applied"; use `rtk proxy npx prisma ...` for truth.)

---

## ACTIONS LEFT (priority order)

### 1. Reseed DB to surface painting/moving/gardening (SAFE, 1 command - GATED)
```
cd backend && npm run db:reset
```
Drops, replays 15 migrations (confirmed clean), reseeds (~1100 bookings + the 18
new listings). **No app dev server was running** (DLL lock not a concern). This
session could NOT run it: the destructive drop is blocked by the **guardian safety
gate** ("Login credentials have expired. Ask the guardian mcp to login."). Run it
with a present user / after guardian re-login. This is the ONLY thing needed to make
Painting/Moving/Gardening browse populate.

### 2. SP-3 Work-stream B - wire auto-accept engine into the LIVE flow (LARGE, risky)
`quote.service.ts:503` still calls the OLD `quoteMatchesAutoAccept` from
`auto-accept.service.ts`. Replace with `evaluateAutoAcceptGates`
(`sp3-auto-accept.service.ts`), loading per-servicer tax config + schedules +
modulesById, enforcing the per-account `maxAutoAccepts` cap around the call; on
all-pass create a proposal at the computed total with `isAuto=true`.
- **Why deferred:** touches the core broadcast path that the payment-gate refactor
  (`broadcastQuote`) just reworked - high blast radius, needs unit + E2E cycles, not
  safe to blind-batch in autopilot.
- getUTCDay MYT bug already fixed in the engine; just wire it.
- Also: listing preview endpoint should use `computeListingPrice` for the
  servicer-side breakdown.

### 3. SP-3 Work-stream C - customer proposal redesign (LARGE)
Route `/customer/quotes/:id/proposals` already exists + is ownership-safe. Enhance:
backend enriches each proposal via `proposal-view.service.ts` (included modules,
add-on options, breakdown, distance, availability window); add-on tick →
`recomputeProposalPrice` live + captured into booking; replace thin
`proposals.component.ts` card with collapsed+expanded §12 card. Large FE+BE; defer.

### 4. SP-3 E (data migration) + F (tests) - after B/C land
Migrate `PricingModule`/old `modifiers` → `ServicerModule` lib; extend pricing unit
tests + 4-gate eval tests + E2E. (Seeding of new listings already covered once #1 runs.)

### 5. CI workflows - NEVER CREATED (not just "delete old ones")
`.github/workflows/` contains ONLY `ci.yml`. The designed `push-checks.yml` /
`pr-gate.yml` / `nightly.yml` (spec `docs/superpowers/specs/2026-06-10-ci-pipeline-design.md`)
were never implemented; `security.yml` already gone. **Do NOT delete `ci.yml`** until
the 3 replacements exist + pass - deleting now = zero CI. Create the 3 workflows per
spec, then retire `ci.yml`. Set GitHub secrets `META_TOKEN`/`META_PHONE_ID`/`META_WHATSAPP_TO`.

### 6. (Optional / low priority) Cosmetic route nesting
Only if product wants the URL hierarchy. Must simultaneously update all emitters in
the recon table below or links break. Not recommended without a clear reason.

---

## Routing recon (full, for whoever does #6)

- **Customer routes FLAT** (`customer.routes.ts`): `/customer/bookings`(my-bookings),
  `/customer/history`(order-history), `/customer/quotes`(my-quotes),
  `/customer/quotes/:id/proposals`(proposals). All backend reads ownership-checked
  (`booking.service.ts:655/668`, `quote.service.ts:762/775`).
- **Admin routes FLAT** (`admin.routes.ts`): `/admin`, `/admin/servicers`,
  `/admin/users`, `/admin/queues`, `/admin/settings`, `/admin/money-settings`,
  `/admin/uiux-settings`, `/admin/ai-chat-settings`, `/admin/category-settings`,
  `/admin/setup`, `/admin/settings/api-keys`.
- **linkUrl emitters all resolve:** booking.service 274/376/464/742/775,
  dispatch.service 151/249, quote.service 494/545/841/894, servicer-quote.service 474,
  stripe.routes 305/540/615/662 (+ return URLs 94/95/163/164), global search index.ts
  390-451, chat.service prompt 83-117/518, seed FAQ static.ts:3252.
- **IDOR: clean.** Owned `:id` endpoints enforce userId/servicerId; public
  `/servicers/:id` (+ `/services`) intentionally open; admin `:id` role-gated.

---

## Verify state at handoff
- backend `tsc --noEmit` = 0 errors (only pre-existing TS5101/TS5107 deprecation noise)
- frontend `tsc --noEmit` = 0 errors
- frontend `ng build` (AOT) = see this session's final commit / build log
- All session work committed to `feat/sp3-dispatch-cards`; nothing left uncommitted
  except this doc + TODO.md sync.
