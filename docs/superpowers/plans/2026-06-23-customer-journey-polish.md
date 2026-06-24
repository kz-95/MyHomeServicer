# Customer Journey Polish — Proposal Image + Order History — Implementation Plan (Plan 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (C1) Show the servicer's logo on customer proposal cards (data already sent, just not rendered). (C2) Consolidate the customer's scattered booking views into one Order History with Upcoming + Past, and make the only reorder action the good "Rebook same servicer" (prefill + navigate), dropping the weak toast-only path.

**Architecture:** C1 is a pure frontend template change — backend already returns `servicer.logoUrl` (`quote.service.ts:788`). C2 unifies two existing views: `MyBookingsComponent` (3 tabs at `/bookings/{pending,inProgress,history}`, reorder = toast only) and `OrderHistoryComponent` (`/history`, reorder = prefill+navigate). Keep the strong reorder, retire the weak one, present one Order History.

**Tech Stack:** Angular standalone + signals + router. No frontend unit runner — gate on `npx tsc --noEmit` + `ng build` + manual.

**Spec:** none (polish items from 2026-06-23 session). TODO items C1, C2.

---

## Part C1 — Proposal cards show servicer image

### Task 1: Render the servicer logo on proposal cards

**Files:**
- Modify: `frontend/src/app/customer/pages/proposals.component.ts` (interface `13-23`, template `74-77` and `~110`)

- [x] **Step 1: Confirm the data.** `GET /quotes/:id/proposals` already returns
  `servicer.logoUrl` (backend `quote.service.ts:788` selects it, `:795` returns
  `servicer: p.servicer`). No backend change. The interface field exists (line 15).

- [x] **Step 2: Add an avatar with initials fallback.** In each proposal card header
  (both render sites — lines ~74-77 and ~110), before the business-name button:

```html
            <span class="svc-logo">
              @if (p.servicer.logoUrl) {
                <img [src]="p.servicer.logoUrl" alt="" />
              } @else {
                <span class="svc-initials">{{ p.servicer.businessName.charAt(0) }}</span>
              }
            </span>
```

- [x] **Step 3: Styles**

```css
      .svc-logo { display: inline-flex; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; vertical-align: middle; margin-right: 0.5rem; flex: 0 0 auto; }
      .svc-logo img { width: 100%; height: 100%; object-fit: cover; }
      .svc-initials { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: var(--color-primary); color: #fff; font-weight: 700; font-size: 0.9rem; }
```

- [x] **Step 4: Type-gate + build + commit**

Run (from `frontend/`): `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/customer/pages/proposals.component.ts
git commit -m "feat(customer): show servicer logo on proposal cards"
```

---

## Part C2 — Consolidate Order History

> **DECISION (locked 2026-06-23):** The **Upcoming view = `MyBookingsComponent`** is the
> better UI (lifecycle tabs: pending / in-progress / history, from `GET /bookings`). Use
> THAT as the canonical Order History content — overwrite the old `OrderHistoryComponent`
> view with it — and add a **"Rebook this servicer"** button to it (the strong
> prefill+navigate reorder from `order-history.component.ts:299`, NOT the weak toast).
> The `/customer/history` (Order History) route renders the unified MyBookings-style view;
> the old OrderHistory UI is retired. Don't break deep links.

### Task 2: Make reorder consistent — strong path everywhere

**Files:**
- Modify: `frontend/src/app/customer/pages/my-bookings.component.ts` (`reorder` `887-892`)

- [x] **Step 1: Replace the toast-only reorder** with the navigate+prefill behaviour
  from `order-history.component.ts:299-310`. Read that handler and mirror it: call
  `POST /bookings/:id/reorder`, then `router.navigate(['/customer/quote/new'], { state: { prefill, rebookServicer: { id, name } } })`.
  Inject `Router` if not already.

- [x] **Step 2: Type-gate + build + commit**

Run: `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/customer/pages/my-bookings.component.ts
git commit -m "fix(customer): unify reorder to rebook-same-servicer (drop toast-only path)"
```

### Task 3 — REVISED 2026-06-23: Customer route restructure (NOT a single Order History)

> **Correction:** the earlier "consolidate everything into one Order History" was a
> misunderstanding. The user wants **bookings (active) SEPARATE from history (past)**,
> plus a full customer nav, and the browse/quote paths renamed. Target tree:
>
> ```
> /customer/findService          (rename from '' → BrowseComponent)
> /customer/quote                (rename from quote/new → QuoteFormComponent)
> /customer/quotes               (my-quotes — keep)
> /customer/quotes/:id/proposals (keep)
> /customer/bookings
>   /upcoming                    (MyBookings — pending + confirmed)
>   /inProgress                  (MyBookings — in_progress)
> /customer/history              (MyBookings — completed + cancelled; "Rebook this servicer")
> /customer/transactions         (keep)
> /customer/rewards              (keep)
> /customer/notifications        (keep)
> /customer/account              (keep)
> ```

**Files:**
- Modify: `frontend/src/app/customer/customer.routes.ts`
- Modify: `frontend/src/app/customer/pages/my-bookings.component.ts` (segment → status filter for upcoming/inProgress/history; keep "Rebook this servicer" on history)
- Modify: every internal link to `/customer/quote/new` and to browse (`''`) — grep + update
- Modify: customer shell nav links/labels

- [ ] **Step 1: Rename browse + quote paths.** `''` → `findService` (BrowseComponent),
  `quote/new` → `quote` (QuoteFormComponent). Add a default redirect (`'' → findService`)
  so the portal root still lands on browse.

- [ ] **Step 2: Split bookings from history.** Replace the current `bookings → history`
  redirect with a real `bookings` parent: `bookings/upcoming` + `bookings/inProgress`
  (both `MyBookingsComponent`, reading the segment to filter pending+confirmed vs
  in_progress). Make `history` its own top-level route (`MyBookingsComponent` filtered to
  completed+cancelled) — the "Rebook this servicer" button stays here.

- [ ] **Step 3: Update MyBookings segment logic.** Its `729-736` tab detection maps
  route segment → status filter: `upcoming` = pending+confirmed, `inProgress` =
  in_progress, `history` = completed+cancelled. Verify labels read Upcoming / In Progress
  / History.

- [ ] **Step 4: Redirect old paths (safety).** Keep redirects so old links don't 404:

```typescript
  { path: 'quote/new', redirectTo: 'quote', pathMatch: 'full' },
  { path: 'history/pending', redirectTo: 'bookings/upcoming', pathMatch: 'full' },
  { path: 'history/inProgress', redirectTo: 'bookings/inProgress', pathMatch: 'full' },
```

- [ ] **Step 5: Update internal links.** Grep `frontend/src` for `quote/new` and browse
  links; repoint to `/customer/quote` and `/customer/findService`. Update the customer
  shell nav to list: Find Service, My Quotes, Bookings (Upcoming/In Progress), History,
  Transactions, Rewards, Notifications, Account.

- [ ] **Step 6: Type-gate + build + commit**

Run: `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/customer
git commit -m "feat(customer): restructure routes — findService/quote rename, bookings split from history"
```

### Task 4 — Move quote photos above "Extra Details:" (first page)

**Files:**
- Modify: `frontend/src/app/customer/pages/quote-form.component.ts` (photos block ~`369-377`, "Extra Details:" label ~`259`)

- [ ] **Step 1:** Move the "Add photos (optional, max 5)" upload block + thumbnails so it
  renders **above** the "Extra Details:" label on the first form page (currently it sits
  below it). Keep the same `onQuoteImage`/`quoteImages` wiring — template move only.

- [ ] **Step 2: Build + commit**

Run: `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/customer/pages/quote-form.component.ts
git commit -m "feat(quote-form): move photo upload above Extra Details on first page"
```

### Task 5: Verify

- [ ] As a customer: nav shows Find Service / My Quotes / Bookings (Upcoming, In Progress)
  / History / Transactions / Rewards / Notifications / Account. Bookings shows active jobs,
  History shows past with "Rebook this servicer". Old `/customer/quote/new` redirects.
- [ ] Quote form shows the photo upload above Extra Details.

---

## Resolved decisions (2026-06-23, corrected)

- **Customer routes = the explicit tree above** (findService, quote, bookings/upcoming,
  bookings/inProgress, history, transactions, rewards, notifications, account). Bookings
  (active) and History (past) are SEPARATE — the earlier single-Order-History merge was
  wrong and is replaced by this.
- Full path rename (`''→findService`, `quote/new→quote`) WITH redirects from old paths.
- Quote photo upload goes above "Extra Details:" on the first page.

## Self-Review notes

- C1: backend already sends `logoUrl` — verified via 2026-06-23 exploration
  (`quote.service.ts:788`). Frontend-only, low risk.
- C2 touches routing + removes a component — flagged as needing a confirm (open
  questions) before execution; do not run Task 3 until the route shape is approved.
- Reorder backend (`reorderBooking`, `booking.service.ts:1291`) is unchanged; both
  frontend paths already call `POST /bookings/:id/reorder` — only the frontend handling
  of the response differs. Task 2 just makes both use the navigate+prefill response.
