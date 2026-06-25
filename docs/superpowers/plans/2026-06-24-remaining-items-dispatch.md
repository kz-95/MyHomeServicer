# Remaining Items Execution Plan

> Branch: `feat/sp3-dispatch-cards` | Date: 2026-06-24
> Usage: "Execute Group N in this md" - orchestrator dispatches all tasks in that group.
> Each group is self-contained. Run groups in order (1 → 2 → 3 → 4).
> After each task: verify gates, commit, tick TODO.md.

---

## GROUP 1 - Demo-Critical (4 sub-steps, maximize parallel)

### Step 1.1 - Backend foundation (run alone first)
**Task:** S2-BE (lat/lng + Haversine + distanceKm)

### Step 1.2 - Parallel (run BOTH at same time after Step 1.1)
**Tasks:** S2-FE ∥ SP4-BE
- S2-FE: renders distance km on card (needs S2-BE API)
- SP4-BE: dispatch isOnline+schedule+rotation wiring (independent of FE render)

### Step 1.3 - Frontend (run alone after Step 1.2 both done)
**Task:** SP4-FE (Google Map preview - needs SP4-BE complete)

### Step 1.4 - Parallel QA (run BOTH at same time after Step 1.3)
**Tasks:** 7-QA ∥ 8-QA
- 7-QA: verify dispatch overlay (needs SP4-FE)
- 8-QA: verify finance engine (independent of dispatch)

---

### Task S2-BE - Add lat/lng + Haversine + distanceKm

**Agent:** `backend-cowork`

```
You are the Backend agent. Execute on branch feat/sp3-dispatch-cards.
DO NOT touch frontend code.

1. ADD SCHEMA FIELDS:
   Open backend/prisma/schema.prisma, find Servicer model, add:
     lat   Float?   @map("lat")   @db.DoublePrecision
     lng   Float?   @map("lng")   @db.DoublePrecision

2. STOP SERVER (port 3000) to avoid DLL lock.
   cd backend
   npx prisma migrate dev --name add_servicer_coords
   Restart server.

3. CREATE backend/src/lib/haversine.ts:
   export function haversineKm(lat1:number, lng1:number, lat2:number, lng2:number): number {
     if ([lat1,lng1,lat2,lng2].some(v => v==null || isNaN(v))) return 0;
     const R = 6371;
     const dLat = (lat2-lat1)*Math.PI/180;
     const dLng = (lng2-lng1)*Math.PI/180;
     const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
     return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 100) / 100;
   }

4. WIRE INTO backend/src/services/servicer-quote.service.ts listIncomingQuotes() (~line 288):
   - Ensure the Prisma query select includes: servicer: { select: { id, lat, lng } }
   - In the mapped return object for each q, add:
     distanceKm: (q.lat && q.lng && servicer.lat && servicer.lng)
       ? haversineKm(q.lat, q.lng, servicer.lat, servicer.lng)
       : null
   - Import haversineKm at top.

5. SEED COORDINATES in backend/prisma/seed/data/accounts.ts:
   Add lat/lng to all 36 servicers. KL/PJ area: lat 3.05-3.20, lng 101.60-101.70.
   Vary them (not all identical). Also add to seed-test.ts servicers.

6. VERIFY:
   rtk proxy npx tsc --noEmit   → 0 new errors (8 pre-existing OK)
   npm test                      → green
   npm run db:reset              → clean, 36 merchants with coords

7. DOCS: Update schema-notes.md (lat/lng on Servicer). Log to backend-log.md.
8. COMMIT: feat(servicer): add lat/lng coordinates + Haversine distance to dispatch feed
```

---

### Task S2-FE - Render distance km on dispatch card

**Agent:** `frontend-cowork`

```
You are the Frontend agent. Branch feat/sp3-dispatch-cards.
PREREQ: S2-BE complete (API returns distanceKm).

1. Open frontend/src/app/servicer/pages/incoming-quotes.component.ts

2. In the quote interface, add: distanceKm?: number;

3. In template near address/location display, add:
   @if (q.distanceKm) {
     <span class="distance-badge">~{{ q.distanceKm }} km away</span>
   }

4. CSS: .distance-badge { font-size: 0.8rem; color: var(--color-muted); }

5. VERIFY: npx tsc --noEmit → 0 errors. ng build --configuration development → exit 0.
6. COMMIT: feat(servicer): render distance km on dispatch card face
```

---

### Task SP4-BE - Wire isOnline + schedule gating + rotation timer

**Agent:** `backend-cowork`

```
You are the Backend agent. Branch feat/sp3-dispatch-cards.

1. READ: backend/src/services/dispatch.service.ts (startDispatchRotation),
   backend/src/jobs/dispatch.jobs.ts, Servicer (isOnline), ServicerSchedule.

2. ADD isOnline GATE: in startDispatchRotation(), for each eligible servicer,
   check isOnline. If false → skip + log "Servicer {id} offline, skipped".

3. ADD WORKING-HOURS GATE:
   - Query ServicerSchedule for each servicer.
   - Compute MYT: const myt = new Date(Date.now() + 8*3600_000).
   - Derive currentDay (mon/tue/...) and currentHour from MYT.
   - Check schedule[currentDay]. If no entry or outside open-close range → exclude.
   - Match pattern in sp3-auto-accept.service.ts:91-92.

4. CONFIGURABLE TIMER: Read platform setting "dispatch_prompt_timeout_seconds"
   via resolveSetting(). Default 10s. Pass in dispatch.prompt socket payload.

5. DECLINE→ROTATE: In socket handler "dispatch.decline", mark servicer declined,
   re-invoke startDispatchRotation() with remaining pool.
   If pool empty → handleDispatchFallback() (stub, log it).

6. VERIFY: rtk proxy npx tsc --noEmit → 0 new errors. npm test → green.
7. COMMIT: feat(dispatch): wire isOnline + schedule gating + configurable rotation
```

---

### Task SP4-FE - Google Map preview in accept prompt

**Agent:** `frontend-cowork`

```
You are the Frontend agent. Branch feat/sp3-dispatch-cards.
PREREQ: SP4-BE complete.

1. Open frontend/src/app/shared/dispatch-overlay.component.ts

2. In accept prompt template, below job details, add static map thumbnail:
   - Get key: ConfigService.googleMapsApiKey
   - URL: https://maps.googleapis.com/maps/api/staticmap?center={lat},{lng}&zoom=14&size=400x200&markers=color:red%7C{lat},{lng}&key={key}
   - Render as <img> with class .map-preview, loading="lazy"
   - Label "📍 Job Location" above

3. CSS: .map-preview { width:100%; max-width:400px; border-radius:12px; margin-top:1rem; }

4. VERIFY: tsc 0, ng build exit 0.
5. COMMIT: feat(dispatch): Google Map preview thumbnail in accept prompt
```

---

### Task 7-QA - Verify dispatch overlay end-to-end

**Agent:** `qa-cowork`

```
You are the QA agent. Branch feat/sp3-dispatch-cards. PREREQ: SP4 complete.
DO NOT modify source code.

TEST 1 - Quote → dispatch: Login as C_FRESH, create quote. Verify enters dispatch rotation.
TEST 2 - Servicer prompt: Login as M1_ANAS. Verify overlay with job/customer/countdown/buttons.
TEST 3 - ACCEPT: Click Accept → booking created, visible in Jobs.
TEST 4 - DECLINE: New quote. Decline → rotation skips to next servicer.
TEST 5 - TIMEOUT: New quote. Wait → countdown→0 → overlay closes → rotation moves.
TEST 6 - OFFLINE: Set isOnline=false. Create quote → verify excluded from rotation.
TEST 7 - HOURS: Verify outside-working-hours servicer excluded.

Log all results to qa-log.md. PASS/FAIL per test with evidence.
```

---

### Task 8-QA - Verify finance engine end-to-end

**Agent:** `qa-cowork`

```
You are the QA agent. Branch feat/sp3-dispatch-cards.
DO NOT modify source code.

TEST 1 - Escrow hold: C_FRESH pay_now RM300. Servicer accepts. Verify escrow_hold = total.
TEST 2 - Release: Mark done. Verify escrow_release + platform_fee. Assert: hold=release+fee.
TEST 3 - Urgent: Same-day quote. Verify 150 urgent fee. After: 30 to fee (20%), 120 to escrow (80%).
TEST 4 - Dashboard: GET /admin/dashboard/financial → totals match transaction ledger.
TEST 5 - Shortfall: escrow < final price → block with error.

Log all results and actual amounts to qa-log.md. PASS/FAIL per test.
```

---

## GROUP 2 - All Parallel (8 tasks, zero shared state)

**Tasks:** ED ∥ NAV ∥ LINK ∥ S3 ∥ MAP ∥ RPT ∥ RPP ∥ SP3

All 8 are independent - different files, different concerns. Run simultaneously.

---

### Task ED - Estimated duration on card face

**Agent:** `frontend-cowork`

```
Branch feat/sp3-dispatch-cards. In incoming-quotes.component.ts template near time/price:
  @if (q.estimatedDurationMin && q.estimatedDurationMin > 0) {
    <span class="duration-badge">~{{ q.estimatedDurationMin }} min</span>
  }
CSS: .duration-badge{font-size:.8rem;color:var(--color-muted)}
Verify: tsc 0, ng build exit 0.
Commit: feat(servicer): show estimated duration on dispatch card
```

---

### Task NAV - Maps/Waze on confirmed booking

**Agent:** `frontend-cowork`

```
Branch feat/sp3-dispatch-cards. In my-bookings.component.ts + jobs.component.ts,
booking detail view (confirmed/in_progress/completed):
  - "Open in Google Maps" → https://www.google.com/maps/dir/?api=1&destination={lat},{lng}
  - "Open in Waze" → https://waze.com/ul?ll={lat},{lng}&navigate=yes
Use booking address lat/lng. New tab. Guard: lat/lng non-null.
Reuse openMap() from incoming-quotes if available.
Verify: tsc 0, ng build exit 0.
Commit: feat(booking): add Maps/Waze deep-link buttons to booking detail
```

---

### Task LINK - Route redesign + dead link sweep

**Agent:** `general` (full-stack)

```
Branch feat/sp3-dispatch-cards. Full dead link audit.

BACKEND:
  grep "linkUrl:" in booking.service.ts, quote.service.ts, admin.service.ts.
  For each, verify path exists in frontend routes. Fix stale ones.
  grep "return_url\|success_url\|cancel_url" in stripe.ts, stripe.routes.ts.
  Verify they point to real frontend routes.

FRONTEND:
  Audit customer.routes.ts, admin.routes.ts → nest routes where flat.
  Audit servicer-shell nav + dashboard quickLinks → fix stale routerLinks.

CHAT AI:
  In chat.service.ts system prompt, update hardcoded route suggestions to match current tree.

GREP OLD PATHS (backend + frontend):
  /bookings/active, /customer/quote/new, /customer/chat, /contact, /admin/dashboard
  Fix any found.

Verify: backend tsc 0, frontend tsc 0, ng build exit 0.
Commit: fix(links): sweep notification URLs, Stripe returns, route paths, chat prompts
```

---

### Task S3 - Seed reform

**Agent:** `devops-cowork`

```
Branch feat/sp3-dispatch-cards.

1. CAP LISTINGS AT 3: In accounts.ts, for each servicer >3 services, keep 3 most relevant.
2. AVATARS M97-M105: If missing, add https://ui-avatars.com/api/?name={BusinessName}&background=random&size=128
3. NEW SERVICERS:
   - Painter (home-improvement): "Fresh Coat Painting", 3 listings, KL coords
   - Mover (home-maintenance): "Swift Movers", 2 listings, PJ coords
   - Gardener (home-maintenance): "Green Thumb Gardeners", 2 listings, Cheras coords
   Each: User, Servicer, schedule, deposit, services, pricing modules, revenue (match existing pattern).
4. Verify: tsc 0, db:reset clean (39 merchants), seed:test exit 0.
5. Commit: feat(seed): cap listings at 3, add M97-M105 avatars, seed painter/mover/gardener
```

---

---
### Task MAP - Fix app-map-view component

**Agent:** `frontend-cowork`

```
Branch feat/sp3-dispatch-cards.

Open map-view.component.ts.
Bug: init fires before ConfigService.googleMapsApiKey resolves → map fails.
Fix: Defer map init until key is non-empty.
  - Wrap init in: if (!this.configService.googleMapsApiKey) { setTimeout(init, 100); return; }
  - Or use effect() to react to key becoming available.
Verify: tsc 0, ng build exit 0.
Commit: fix(map): defer Google Maps init until API key resolves from ConfigService
```

---

### Task RPT - Servicer report button

**Agent:** `frontend-cowork`

```
Branch feat/sp3-dispatch-cards.

In jobs.component.ts:
  Active Jobs tab → "Report" ghost button per card.
  History tab → report button on completed/cancelled.
In dispatch-overlay.component.ts → "Report Issue" link at bottom.

On click: modal with reason textarea → POST /bookings/:id/report { reason, category:'servicer_report' }.
Use <app-modal> (NEVER position:fixed backdrop).

Verify: tsc 0, ng build exit 0.
Commit: feat(servicer): add report button to Active Jobs, History, dispatch overlay
```

---

### Task RPP - Admin reports list polish

**Agent:** `frontend-cowork`

```
Branch feat/sp3-dispatch-cards.

In admin/pages/queues.component.ts Reports tab:
Replace raw table → card layout per report:
  Category icon+name, reporter, booking context, status badge, timestamp, expandable reason.

Backend: ensure report creation fires admin notification (add if missing).

Verify: tsc 0, ng build exit 0.
Commit: feat(admin): card-based report list with category display and notifications
```

---

### Task SP3 - SP3 listing wizard

**Agent:** `general` (full-stack)

```
Branch feat/sp3-dispatch-cards. Largest task.

=== BACKEND ===
1. POST /servicer/me/services → creates { categoryId, name, description, basePrice, priceType }.
   Returns { id }.
2. PATCH /servicer/me/services/:id → updates full service. Ownership: service.servicerId === req.user.servicer.id.
3. tsc 0, tests green.

=== FRONTEND ===
4. New: servicer/pages/service-wizard.component.ts (standalone).
5. Routes: /servicer/services/new (create), /servicer/services/:id/edit (edit).
6. 4-step wizard with stepper indicator:
   Step 1 - Basics: category picker, name, description, price, priceType.
     Next → POST /servicer/me/services → get id.
   Step 2 - Pricing & Modules: module picker, overrides, service charge.
     Next → PATCH /servicer/me/services/:id.
   Step 3 - Tax & Config: tax inclusive, SST toggle.
     Next → PATCH /servicer/me/services/:id.
   Step 4 - Accept Mode: auto-accept toggle, conditions, message.
     Save → PATCH → navigate to /servicer/services.
7. Edit mode: GET existing, pre-fill, PATCH on each Next.
8. Services list: "Add Service" → /servicer/services/new, "Edit" → /:id/edit.

Verify: backend tsc 0 + tests green. Frontend tsc 0 + ng build exit 0.
Commit: feat(servicer): SP3 listing wizard - 4-step create-then-PATCH
```

---

## GROUP 3 - All Parallel (7 tasks, independent features)

**Tasks:** REW ∥ ADM ∥ PW ∥ VAL ∥ SEC ∥ RFG ∥ ITM

All 7 are independent features - different specs, different subsystems. Run simultaneously.

---

### Task REW - Customer rewards + deposit-credit

**Agent:** `general`

```
Spec: docs/superpowers/specs/2026-05-28-customer-rewards.md + deposit-credit-promotions.md
Backend: points engine (award/tier) + voucher CRUD (create/claim/redeem).
Frontend: customer rewards page + admin rewards tab.
Verify: tsc 0 both sides, tests green, build green.
Commit: feat(rewards): customer points engine, vouchers, tier system, admin management
```

---

### Task ADM - Admin banned-accounts + deactivate + search

**Agent:** `general`

```
Spec: docs/superpowers/specs/2026-05-28-deactivate-account.md + admin-banned-accounts.md
Backend: banned email CRUD, deactivation endpoints, customer search API.
Frontend: banned tab, deactivation Danger Zone UI, search/filter on users page.
Verify: tsc 0 both sides, tests green, build green.
Commit: feat(admin): banned accounts management, deactivation UI, customer search
```

---

### Task PW - Forgot-password + settings + PIN-registration

**Agent:** `general`

```
Spec: docs/superpowers/specs/2026-05-28-forgot-password.md + pin-registration-settings.md
Backend: Nodemailer reset token flow, settings refinements.
Frontend: forgot-password page, settings polish, PIN registration UX.
Verify: tsc 0 both sides, tests green, build green.
Commit: feat(auth): forgot-password reset flow, settings refinements, PIN registration
```

---

### Task VAL - Cancel reason presets + form validation + footer

**Agent:** `general`

```
Frontend: cancel modal with preset reasons dropdown (not free text). Form validation UX polish.
  Admin footer links wired.
Backend: cancel reason presets as platform setting.
Verify: tsc 0 both sides, tests green, build green.
Commit: feat(ux): cancel reason presets, form validation polish, admin footer wiring
```

---

### Task SEC - IDOR audit + Decimal coercion + global search

**Agent:** `backend-cowork`

```
Backend only. No frontend changes.

1. IDOR: grep all :id routes. For each handler, verify ownership check:
   booking.userId===req.user.id, quote.userId===req.user.id, service.servicerId===req.user.servicer.id.
   Flag missing checks.

2. DECIMAL: grep route handlers for Prisma Decimal returns. Ensure Number() or .toString()
   before JSON serialization. Check for { "$numberDecimal" } in responses.

3. GLOBAL SEARCH: verify endpoint searches users, servicers, bookings, quotes, categories, services.
   Document gaps.

Verify: tsc 0. Log to backend-log.md.
Commit: fix(security): IDOR ownership checks, Decimal serialization, global search coverage
```

---

### Task RFG - routeFor() typed path guard

**Agent:** `frontend-cowork`

```
Frontend only.

1. Create core/route-for.ts with RouteKey union type + ROUTES map + routeFor(key,params?) function.
2. Sweep: grep router.navigate(['/ in all .ts files. Replace magic strings with routeFor().
   Also fix [routerLink]="['/...']" in templates.

Verify: tsc 0, ng build exit 0.
Commit: feat(routes): typed path helper routeFor() replacing magic strings
```

---

### Task ITM - Itemization design (docs only)

**Agent:** `general` (docs only, no code)

```
Write docs/ai-context/itemization-design.md:
  - Service listing vs line items distinction
  - Data model: ServicerService vs Booking.lineItems
  - When to build: after SP3 + SP4 land (deferred execution)
Commit: docs(itemization): service listing vs line items design document
```

---

## GROUP 4 - Last (stretch, after all above)

---

### Task FINTECH - Full fintech P1-P5 (XL)

**Agent:** `backend-cowork`

```
Spec: docs/superpowers/specs/2026-06-23-admin-dashboard-financial-redesign.md §Fintech roadmap.
Build in order, commit per phase:

P1 - Wallet model + BalanceCheckpoint (schema, migration, tests)
P2 - Fee engine (FeeRule model, computeFees(), wire into doneJob)
P3 - Saved payments (SavedPaymentMethod, CRUD routes)
P4 - Escrow automation (auto-release job, dispute model+flow)
P5 - Reporting (financial reports endpoint, CSV export)

Each phase: tsc 0, tests green. Commit after each.
```

---

## VERIFICATION GATES (every task)

| Task | Backend tsc | Backend test | Frontend tsc | ng build |
|------|------------|-------------|-------------|----------|
| S2-BE | 0 new | green | N/A | N/A |
| S2-FE | N/A | N/A | 0 | exit 0 |
| SP4-BE | 0 new | green | N/A | N/A |
| SP4-FE | N/A | N/A | 0 | exit 0 |
| 7-QA | N/A | N/A | N/A | N/A |
| 8-QA | N/A | N/A | N/A | N/A |
| ED | N/A | N/A | 0 | exit 0 |
| NAV | N/A | N/A | 0 | exit 0 |
| LINK | 0 | green | 0 | exit 0 |
| S3 | 0 | green+reseed | N/A | N/A |
| MAP | N/A | N/A | 0 | exit 0 |
| RPT | N/A | N/A | 0 | exit 0 |
| RPP | N/A | N/A | 0 | exit 0 |
| SP3 | 0 | green | 0 | exit 0 |
| REW | 0 | green | 0 | exit 0 |
| ADM | 0 | green | 0 | exit 0 |
| PW | 0 | green | 0 | exit 0 |
| VAL | 0 | green | 0 | exit 0 |
| SEC | 0 | N/A | N/A | N/A |
| RFG | N/A | N/A | 0 | exit 0 |
| ITM | N/A | N/A | N/A | N/A |
| FINTECH | 0 | green | N/A | N/A |
