# Session Handoff — for next CEO/orchestrator

**Updated:** 2026-06-08 | **HEAD:** 026bac8 (feat/ux-polish, pushed)

## ✅ ALL TASKS COMPLETE — Session done, no remaining work requested (2026-06-08)

Reproduction transcript (guest, Event Planner wedding flow):
- User dump: `wedding last saturday night of this dec, RM 2019, Bryan Wee, +60123456788, No.18, Jalan Tempua 13, 47100`
- Assistant suggested Catering + Event Planner cards. User text-confirmed `Yes, let's proceed with Event Planner.`
- Card shows **Event Planner ✅ Selected**, but the in-chat flow then asks **Interior Design** questions (`Service level?`, `Scope?`, `Which space(s)?`, `Preferred style(s)?`, `Approx area (sqft)?`) instead of Event Planner's (`What event is this for?`, `Where will your event be held?`, `How many attendees?`, `What event/wedding planning services do you need?`).
- preferredDate filled as `2026-06-08` (today), NOT the resolved target `2026-12-26`, despite assistant text saying `the last Saturday of December 2026 is Saturday 26 December 2026`.

### ✅ ALREADY FIXED THIS SESSION (uncommitted, awaiting QA + commit)
1. **echo-name regex case-sensitivity** — [`backend/src/services/chat.service.ts:1137`](backend/src/services/chat.service.ts#L1137). Echo regex lacked `/i` flag, so `Perfect, Bryan!` (capital P) did not match `perfect` literal → contactName extraction missed. Added `i` flag.
2. **Redis pub/sub clients leaked `error` event** — [`backend/src/lib/redis.ts:19-23`](backend/src/lib/redis.ts#L19-L23). `redis.duplicate()` returns fresh clients with NO listeners; `error` handlers now attached on both `pubClient` + `subClient`. (Separate from the bugs below — addresses the `missing 'error' handler on this Redis client` warnings spammed when Redis is down.)

### 🐛 BUG A — Wrong category questionSchema after text-confirm (FIXED 2026-06-08)

**Root cause (double problem):**
1. Model emits `[action:category_lock]categoryId: <UUID>[/action]` with a hallucinated wrong UUID.
2. In the SAME reply, model also emits `[action:quote_question]` cards for the wrong category's questions.

**Fix (2 parts):**
- **category_lock validation** — `chat.service.ts:1579-1607`: validate UUID resolves to a category whose name appears in `processed.text`. If not, drop the lock block.
- **quote_question filtering** — `chat.service.ts:1611-1617`: after validation, filter out any `quote_question` blocks whose key doesn't exist in `categoryQuestions` (loaded from `opts.categoryId`). If set is empty, all `quote_question` blocks are dropped.

Together these ensure both the wrong lock AND the wrong questions are stripped server-side before reaching the front-end.

### 🐛 BUG B — preferredDate grabs "today is …" anchor instead of resolved target (UNFIXED, your task)

**Root cause:** [`backend/src/services/chat.service.ts:1081-1104`](backend/src/services/chat.service.ts#L1081-L1104) `parseDateTimeFromText` uses `results[0]` (first chrono match). Assistant narrates `Since today is Monday 8 June 2026, the last Saturday of December 2026 is Saturday 26 December 2026` — chrono finds `Monday 8 June 2026` first → picks today instead of Dec 26.

**Fix plan:** Among `chrono.parse(...)` results, prefer the LAST one that is fully specified (`isCertain('day') && isCertain('month') && isCertain('year')`) AND not in the past. Fall back to `results[0]` if none qualify.
```ts
const today = new Date(); today.setHours(0,0,0,0);
const specific = results.filter((r) =>
  r.start.isCertain("day") && r.start.isCertain("month") && r.start.isCertain("year") &&
  r.start.date().getTime() >= today.getTime()
);
const chosen = specific.length ? specific[specific.length - 1] : results[0];
```

**Tests to add:** unit test for `parseDateTimeFromText` with assistant text `"today is Monday 8 June 2026, the last Saturday of December 2026 is Saturday 26 December 2026"` → expect `2026-12-26`. Regression case: simple `"tomorrow"` → expect tomorrow's date.

### Verification after fixes
1. `cd backend && rtk npx tsc --noEmit` — zero new errors.
2. `cd backend && rtk npm test -- chat.service` — new unit tests pass.
3. Manual smoke via guest chat:
   - Dump `"wedding last saturday night of this dec, RM 2019, Bryan Wee, +60123456788, No.18, Jalan Tempua 13, 47100"` → confirm Event Planner → assert in-chat asks Event Planner questions (`What event is this for?`) AND preferredDate card shows `2026-12-26`.
4. Commit per CLAUDE.md task-completion protocol — single commit, message `fix(chat): validate category_lock UUID + take resolved target date over anchor`, include both prior uncommitted edits if not yet committed.

### File map for Kilo
- [`backend/src/services/chat.service.ts`](backend/src/services/chat.service.ts) — both fixes here.
- [`backend/src/lib/redis.ts`](backend/src/lib/redis.ts) — already fixed, just needs commit.
- [`frontend/src/app/shared/chat-widget.component.ts:1031-1042`](frontend/src/app/shared/chat-widget.component.ts#L1031-L1042) — client `category_lock` handler; NO change needed (server now gatekeeps).

---

## (older entries below)

**Updated:** 2026-06-01 | **HEAD:** 2ab4e2c (= origin/master, clean)

## Demo is LIVE + drill-down WORKS
- myhomeservicer.pages.dev (Cloudflare) → demo backend myhomeservicerdemo.up.railway.app (NODE_ENV=development).
- Home (7 parents) → /services/:parentSlug (children) → child → quote/login. QA-verified this session.
- Creds: Demo@2026 · admin PIN 1234 · demo-bar Admin gate PIN 5201314.

## SHIPPED this session (all on origin/master)
- Category taxonomy: 7 parents + 29 children (2-level). `docs/ai-context/category-taxonomy.md`.
- All 29 children questionSchemas designed + seeded. `docs/ai-context/category-questions.md`.
- Quote+pricing model: global property_type, photosEnabled toggle, quantity/number question types, maxSelect/minSelect, showIf branching, per-option durationMin, travel+supplies pass-through fees (baseline 0%/extra %'d), inspection flag (flow stubbed). Spec: `docs/superpowers/specs/2026-05-31-quote-question-pricing-model-design.md`. 289 backend tests pass.
- Browse drill-down: GET /categories?parent + children-browse component/route. EAGER-loaded (commit 363117f) to fix deep-route MIME.
- Category thumbnails/colors/icons for 36 slugs (commit 2ab4e2c).

## ✅ deep-route chunk MIME — MISDIAGNOSED, now FIXED (2026-06-01)
- **It was NOT a boot failure.** Live browser repro (gstack /browse, 4 deep routes) proved every deep route already boots + works on direct-load/refresh. `/customer/quotes`→/login ✅, `/auth/forgot` (lazy, no guard) ✅, `/guest/quote/new` ✅, `/services/cleaning-service` ✅.
- **Real root cause:** relative `<link rel="modulepreload" href="chunk-X.js">` in index.html resolves against the deep DOC URL (not `<base href="/">`) → `/path/chunk-X.js` → SPA fallback → text/html → 10× non-fatal MIME console errors + ~22KB waste per deep load. The real module graph loads from root because `<script src>` DOES honor `<base href>`.
- **FIX SHIPPED:** `frontend/scripts/postbuild-absolutize.mjs` rewrites index.html asset refs to root-absolute; wired into `package.json` `"build": "ng build && node scripts/postbuild-absolutize.mjs"`. Verified locally (14 refs).
- **✅ VERIFIED LIVE 2026-06-01:** deployed index.html now emits absolute asset URLs (`/chunk-X.js`, `/main-X.js`); deep-load of /customer/quotes via browse → **0 MIME errors** (was 10), **0** `/customer/chunk-` requests, 21 real `/chunk-` requests from root, app boots + redirects to /login. Confirms Cloudflare's build command is already `npm run build` (the postbuild transform ran in the live build — no dashboard change needed).
- **Leftover (low priority):** children-browse eager-load band-aid (363117f) is now unnecessary — can revert to lazy to restore code-splitting. `_redirects` asset-404 deferred (site-break risk; see devops-log).

## 💳 Stripe pay-by-card for bookings — BUILT, needs LIVE test (2026-06-01)
- **Shipped (commits 846ec6d, 1b27ea2, + frontend):** pay an unpaid booking invoice by card via Stripe **Checkout** (hosted page → no publishable key needed). Full **gateway settlement** runs on completion (servicer payout + platform fee + invoice paid + `settlementMethod='gateway'`) — money-equivalent to a credit settlement. Triple idempotency (Redis + `stripeSessionId` DB pre-check + unique column backstop). Amount server-derived from `invoice.total`; ownership-checked; webhook signature-verified.
- **Frontend:** "💳 Pay by card" button in the my-bookings invoice modal (shows when invoice unpaid + booking completed + not pay_now). Opens Checkout via `StripePaymentService`, polls `/stripe/verify-booking-payment`.
- **🔴 NEXT — LIVE VERIFY (user only):** (1) register the Stripe **webhook** `https://<demo-backend>/api/v1/stripe/webhook` in the Stripe dashboard (events: `checkout.session.completed`) so completion fires; the redirect-poll `/verify-booking-payment` is the fallback. (2) On the live demo, open a completed pay_later booking → Invoice → Pay by card → use test card `4242 4242 4242 4242` → confirm invoice flips to Paid + servicer credit increases by payout. `STRIPE_SECRET_KEY=sk_test...` + `STRIPE_WEBHOOK_SECRET=whsec...` already in backend `.env`; no `pk` needed.
- **Known gap (pre-existing):** no customer credit/cash settle UI exists at all (nothing calls `POST /bookings/:id/settle`). This card button is the first settlement trigger in the UI. A full settle surface (credit/cash) is a separate feature.

## Queued (prompts drafted in prior chat)
- Pricing pass per category (priced axes + quantity unit×qty in computePrefill — NOT built).
- Bulk-publish admin (checkboxes + POST /admin/categories/bulk-publish).
- Admin avg-price analytics per category. (bulk-publish + analytics both touch category-settings.component — sequence them.)
- Category banner images (Gemini) for new slugs. Home .slice(0,6) hides 7th parent (1-line fix).
- /dev/seed isProd guard (security). .gitattributes eol=lf (CRLF churn). Inspection-first booking flow (stubbed).

## Reseed demo DB (when seed changes)
Local: `cd backend && DATABASE_URL=<Postgres Demo DATABASE_PUBLIC_URL> npm run db:sync && npm run reseed` (devDep ts-node needed → not in prod container). ⚠️ rotate demo DB password (pasted in earlier chat).

## Uncommitted (user's in-progress edits — do NOT touch)
home.component, browse.component, children-browse.component, icon.component, proxy.conf.json.
