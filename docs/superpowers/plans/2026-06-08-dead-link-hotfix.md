# Dead-Link Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 9 navigation links that point at routes which do not exist today, so no user-facing link, AI reply, or notification lands on a 404 — independent of the larger route redesign.

**Architecture:** Each dead link is re-pointed to a route that **already exists right now** (not the future redesigned route), so this hotfix never depends on Phases 2–6 and never creates a new dead link. Two links whose destination genuinely does not exist (`/customer/chat`, `/contact`) are converted to open the in-app chat widget instead. Phases 2/3/6 will later re-point the renamed routes (e.g. `/customer/bookings` → `/customer/bookings/active`); this hotfix deliberately stops at today's valid routes.

**Tech Stack:** Angular 21 (frontend, standalone components + signals), Node/TypeScript + Express + Prisma (backend), Jest (backend tests). No frontend unit-test framework is configured in this repo, so the verification gate for frontend changes is `npx tsc --noEmit` + `npx ng build` + a manual click, per the project's CLAUDE.md gates. Backend changes gate on `npx tsc --noEmit`.

**Scope — the 9 dead links and their existing-route targets:**

| # | Dead link | Site(s) | Re-point to (exists today) | Class |
|---|-----------|---------|----------------------------|-------|
| 1 | `/servicer/history` | `servicer/pages/dashboard.component.ts` quickLink | `/servicer/jobs/history` | A |
| 2 | `/admin/dashboard` | `admin/pages/setup-wizard.component.ts` + `chat.service.ts` prompt | `/admin` | A |
| 3 | `/servicer/quotes` | `chat.service.ts` prompt | `/servicer/jobs/pending` | A |
| 4 | `/customer/proposals` | `chat.service.ts` prompt | `/customer/quotes` | A |
| 5 | `/customer/deposit` | `chat.service.ts` prompt | `/customer/transactions` | A |
| 6 | `/bookings` (missing `/customer`) | `dispatch.service.ts` notification | `/customer/bookings` | A |
| 7 | `/admin/money` | `prisma/seed/data/static.ts` FAQ | `/admin/money-settings` | A |
| 8 | `/customer/chat` | `customer/pages/my-bookings.component.ts` `reportIssue()` | open chat widget | B |
| 9 | `/contact` | `shared/chat-widget.component.ts` `runAction('report_bug')` | open chat widget (stay in-widget) | B |

> NOT in scope (renamed but NOT dead — they resolve today, handled later in Phase 2/3/6):
> `/customer/bookings` (chat prompt `:96`), `/customer/history` (chat prompt `:97`, `:518`),
> `/servicer/jobs` (chat prompt `:85` — redirects to `/jobs/pending`), `/admin/*-settings`
> sidebar links. Leave these untouched here.

> ⚠️ Line numbers below are a 2026-06-08 snapshot. `shared/chat-widget.component.ts` and
> `services/chat.service.ts` are under active edit — **locate each edit by the quoted
> string, not the line number.** All `old_string` blocks below are unique enough to match.

---

## Task 1: Servicer dashboard "History" quickLink

**Files:**
- Modify: `frontend/src/app/servicer/pages/dashboard.component.ts` (the `quickLinks` array, ~line 296)

- [ ] **Step 1: Fix the dead path**

Find the `History` entry in the `quickLinks` array and change its `path`:

```typescript
// OLD
    { label: 'History', path: '/servicer/history', icon: '🗂️', detail: 'Past & completed jobs' },
// NEW
    { label: 'History', path: '/servicer/jobs/history', icon: '🗂️', detail: 'Past & completed jobs' },
```

(`/servicer/jobs/history` already exists — shipped in Phase 1.)

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/servicer/pages/dashboard.component.ts
git commit -m "fix(servicer): dead /servicer/history quickLink -> /servicer/jobs/history"
```

---

## Task 2: Admin setup-wizard redirect

**Files:**
- Modify: `frontend/src/app/admin/pages/setup-wizard.component.ts:99`

- [ ] **Step 1: Fix the dead navigate target**

```typescript
// OLD
          next: () => this.router.navigate(['/admin/dashboard']),
// NEW
          next: () => this.router.navigate(['/admin']),
```

(`/admin/dashboard` never existed as a frontend route; the admin dashboard is the `''` child → `/admin`.)

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/admin/pages/setup-wizard.component.ts
git commit -m "fix(admin): dead /admin/dashboard navigate -> /admin"
```

---

## Task 3: Class-B links — open the chat widget instead of navigating to a missing page

Two flows navigate to pages that do not exist. Both become "open the in-app chat widget."

**Files:**
- Modify: `frontend/src/app/customer/pages/my-bookings.component.ts` (`reportIssue()`, ~line 712-731; class has `private router` injected)
- Modify: `frontend/src/app/shared/chat-widget.component.ts` (`runAction()`, the `report_bug` branch, ~line 2782-2790)

- [ ] **Step 1: Inject `ChatWidgetService` into `MyBookingsComponent`**

Confirm the import exists; the service lives at `core/services/chat-widget.service.ts` and is `providedIn: 'root'`. Add the import near the other imports at the top of `my-bookings.component.ts`:

```typescript
import { ChatWidgetService } from '../../core/services/chat-widget.service';
```

Add the injected field next to the existing `private router = inject(Router);` line (around line 502):

```typescript
  private widget = inject(ChatWidgetService);
```

- [ ] **Step 2: Replace the dead `/customer/chat` navigate in `reportIssue()`**

The server still creates the `booking_support` session (useful backend context); only the navigation changes — open the widget instead of routing to the nonexistent `/customer/chat` page.

```typescript
// OLD
        next: (r) => {
          this.reporting.set(null);
          this.router.navigate(['/customer/chat'], { queryParams: { session: r.sessionId } });
        },
// NEW
        next: () => {
          this.reporting.set(null);
          this.widget.openWithQuestion('I need help with this booking.');
        },
```

- [ ] **Step 3: Replace the dead `/contact` navigate in `runAction('report_bug')`**

`runAction` lives inside the chat widget itself, so the widget is already open. Instead of routing to the nonexistent `/contact`, keep the user in the chat and prompt them to describe the bug. The component already has an `injectAssistantMessage(...)` helper (used elsewhere in this file).

```typescript
// OLD
  runAction(action: string): void {
    if (action === "report_booking") {
      this.router.navigate(["/customer/bookings"]);
      this.widget.close();
    } else if (action === "report_bug") {
      this.router.navigate(["/contact"]);
      this.widget.close();
    }
  }
// NEW
  runAction(action: string): void {
    if (action === "report_booking") {
      this.router.navigate(["/customer/bookings"]);
      this.widget.close();
    } else if (action === "report_bug") {
      this.injectAssistantMessage(
        "Sorry you hit a problem. Please describe what happened — what you were doing and what went wrong — and I'll log it for the team.",
      );
    }
  }
```

(`report_booking` keeps navigating to `/customer/bookings`, which resolves today; Phase 6 re-points it to `/customer/bookings/active`. Not touched here.)

- [ ] **Step 4: Type-check + build**

Run: `cd frontend && npx tsc --noEmit`
Expected: exits 0.
Run: `cd frontend && npx ng build --configuration development`
Expected: "Application bundle generation complete", no errors (pre-existing NG8102 warnings in `ai-chat-settings`/`chat-widget` are unrelated and acceptable).

- [ ] **Step 5: Manual smoke**

Run the app. As a customer: open My Bookings → "Report issue" on a booking → the chat widget opens with the seeded question (no 404). In the chat widget, trigger the "report a bug" button (ask the assistant "I want to report a bug") → the bug-intake message appears in-widget, no navigation away.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/customer/pages/my-bookings.component.ts frontend/src/app/shared/chat-widget.component.ts
git commit -m "fix(chat): dead /customer/chat + /contact -> open chat widget in place"
```

---

## Task 4: Backend chat AI prompt — fix the 4 dead routes it tells the model to emit

**Files:**
- Modify: `backend/src/services/chat.service.ts` (the `linkExamples`/`locationLinks` prompt strings, ~lines 85-102)

Only the **dead** routes change here. `/customer/bookings` (`:96`), `/customer/history` (`:97`), and `/servicer/jobs` (`:85`) resolve today and are left for Phase 6.

- [ ] **Step 1: Fix servicer + admin example links (~line 85-86)**

```typescript
// OLD
        : role === "servicer"
          ? `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). For example: [view your proposals](/servicer/quotes), [manage your jobs](/servicer/jobs). Use relative paths starting with /.`
          : `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). For example: [admin dashboard](/admin/dashboard), [manage users](/admin/users). Use relative paths starting with /.`;
// NEW
        : role === "servicer"
          ? `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). For example: [view your jobs](/servicer/jobs/pending), [manage your jobs](/servicer/jobs/pending). Use relative paths starting with /.`
          : `When directing users to a page, include a clickable link using markdown link syntax: [page name](/path). For example: [admin home](/admin), [manage users](/admin/users). Use relative paths starting with /.`;
```

(`/servicer/quotes` and `/admin/dashboard` do not exist; servicer proposals are managed under My Jobs, and the admin home is `/admin`.)

- [ ] **Step 2: Fix the customer `locationLinks` proposal + wallet lines (~line 99, 102)**

```typescript
// OLD
- "where is my proposal" → [Proposals](/customer/proposals)
- "where are my rewards / points / vouchers" → [Rewards](/customer/rewards)
- "where is my account / profile / settings" → [Account](/customer/account)
- "where is my wallet / credit / balance" → [Deposit & Credit](/customer/deposit) — but answer balance from the account context above; do NOT link to external bank or card pages
// NEW
- "where is my proposal" → [My Quotes](/customer/quotes)
- "where are my rewards / points / vouchers" → [Rewards](/customer/rewards)
- "where is my account / profile / settings" → [Account](/customer/account)
- "where is my wallet / credit / balance" → [Payments](/customer/transactions) — but answer balance from the account context above; do NOT link to external bank or card pages
```

(Customer proposals live under `/customer/quotes/:id/proposals`; the generic landing is `/customer/quotes`. The customer wallet page is `/customer/transactions`, not `/customer/deposit`.)

- [ ] **Step 3: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 4: Manual smoke (optional, needs a running LLM key)**

Ask the in-app assistant (as servicer) "where are my jobs?" and (as customer) "where is my wallet?" — the returned markdown link should resolve to a real page, not 404.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/chat.service.ts
git commit -m "fix(chat): AI prompt no longer emits dead routes (/servicer/quotes, /admin/dashboard, /customer/proposals, /customer/deposit)"
```

---

## Task 5: Backend dispatch notification — fix the prefix-less `/bookings`

**Files:**
- Modify: `backend/src/services/dispatch.service.ts:234`

- [ ] **Step 1: Add the missing `/customer` prefix**

```typescript
// OLD
  await notify({
    userId: qr.userId,
    type: 'orders',
    message: `Your booking has been accepted!`,
    linkUrl: '/bookings',
  });
// NEW
  await notify({
    userId: qr.userId,
    type: 'orders',
    message: `Your booking has been accepted!`,
    linkUrl: '/customer/bookings',
  });
```

(`/bookings` has no portal prefix and matches no frontend route — the "booking accepted" notification currently 404s when clicked. `/customer/bookings` resolves today; Phase 6 re-points it to `/customer/bookings/active`.)

- [ ] **Step 2: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/dispatch.service.ts
git commit -m "fix(dispatch): booking-accepted notification linkUrl /bookings -> /customer/bookings"
```

---

## Task 6: Seed FAQ — fix the dead `/admin/money` reference

**Files:**
- Modify: `backend/prisma/seed/data/static.ts:3008` (the Financial Settings FAQ entry)

- [ ] **Step 1: Fix the dead route in the FAQ prose**

```typescript
// OLD
      "Financial Settings (/admin/money) has three tabs: Pricing (platform fee rate, fee mode), Rewards (loyalty tiers CRUD — Bronze/Silver/Gold/Platinum with point thresholds and bonus rates, reward catalog CRUD, redemption log), and Servicer (deposit minimum, withdrawal threshold, penalty amounts, fee baselines for travel and supplies). All changes require action PIN.",
// NEW
      "Financial Settings (/admin/money-settings) has three tabs: Pricing (platform fee rate, fee mode), Rewards (loyalty tiers CRUD — Bronze/Silver/Gold/Platinum with point thresholds and bonus rates, reward catalog CRUD, redemption log), and Servicer (deposit minimum, withdrawal threshold, penalty amounts, fee baselines for travel and supplies). All changes require action PIN.",
```

(`/admin/money` matches no route; the current Financial Settings page is `/admin/money-settings`. Phase 3 will later rename it to `/admin/settings/money` and update this string again.)

> The other admin FAQ route strings in this file (`/admin/ai-chat-settings`,
> `/admin/category-settings`, `/admin/queues`) are renamed-but-not-dead and are handled in
> Phase 3/6 — do NOT change them here.

- [ ] **Step 2: Type-check**

Run: `cd backend && npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Reseed so existing DBs pick up the fixed FAQ row**

The FAQ is served from the DB, so the fixed seed string only reaches an already-seeded environment after a reseed.

Run: `cd backend && npm run db:reset`
Expected: Prisma resets, re-applies migrations, and reseeds without error. (Local/dev only — never against production.)

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed/data/static.ts
git commit -m "fix(seed): Financial Settings FAQ dead /admin/money -> /admin/money-settings"
```

---

## Final verification (after all tasks)

- [ ] **Backend type-check:** `cd backend && npx tsc --noEmit` → exits 0
- [ ] **Frontend type-check:** `cd frontend && npx tsc --noEmit` → exits 0
- [ ] **Frontend build:** `cd frontend && npx ng build --configuration development` → bundle generation complete
- [ ] **Grep guard — no dead route strings remain in the touched files:**

Run (PowerShell):
```powershell
Select-String -Path frontend/src/app/servicer/pages/dashboard.component.ts,frontend/src/app/admin/pages/setup-wizard.component.ts,frontend/src/app/customer/pages/my-bookings.component.ts,frontend/src/app/shared/chat-widget.component.ts,backend/src/services/chat.service.ts,backend/src/services/dispatch.service.ts,backend/prisma/seed/data/static.ts -Pattern "/servicer/history|/customer/proposals|/customer/deposit|/servicer/quotes|/admin/dashboard|/admin/money\)|/customer/chat|/contact|'/bookings'"
```
Expected: no matches. (`/admin/money\)` matches the old prose form `(/admin/money)` but
NOT the fixed `/admin/money-settings`; `'/bookings'` is single-quoted to match the old
`linkUrl: '/bookings'` without matching `/customer/bookings`.)

- [ ] **Update TODO.md:** tick the dead-link hotfix checklist under the route-redesign block; note "9 dead links fixed to current routes; renamed-route re-points deferred to Phases 2/3/6."

---

## Notes for the implementer

- This hotfix points at **routes that exist today**, on purpose. Do not "helpfully" point them at the redesigned routes (`/customer/bookings/active`, `/admin/settings/money`, etc.) — those don't exist yet and would re-introduce dead links. The redesign phases own those re-points.
- Class A tasks (1, 2, 4, 5, 6) are pure string swaps; Class B (Task 3) is a small behavior change (open widget) and is the only one touching component logic.
- No frontend unit tests exist in this repo; the gate is `tsc` + `ng build` + the manual smoke in Task 3. Do not scaffold a new test framework for this hotfix.
- Each task commits independently so any single fix can be reverted in isolation.
