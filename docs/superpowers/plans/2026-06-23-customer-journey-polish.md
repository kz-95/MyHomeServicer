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

- [ ] **Step 1: Confirm the data.** `GET /quotes/:id/proposals` already returns
  `servicer.logoUrl` (backend `quote.service.ts:788` selects it, `:795` returns
  `servicer: p.servicer`). No backend change. The interface field exists (line 15).

- [ ] **Step 2: Add an avatar with initials fallback.** In each proposal card header
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

- [ ] **Step 3: Styles**

```css
      .svc-logo { display: inline-flex; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; vertical-align: middle; margin-right: 0.5rem; flex: 0 0 auto; }
      .svc-logo img { width: 100%; height: 100%; object-fit: cover; }
      .svc-initials { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; background: var(--color-primary); color: #fff; font-weight: 700; font-size: 0.9rem; }
```

- [ ] **Step 4: Type-gate + build + commit**

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

- [ ] **Step 1: Replace the toast-only reorder** with the navigate+prefill behaviour
  from `order-history.component.ts:299-310`. Read that handler and mirror it: call
  `POST /bookings/:id/reorder`, then `router.navigate(['/customer/quote/new'], { state: { prefill, rebookServicer: { id, name } } })`.
  Inject `Router` if not already.

- [ ] **Step 2: Type-gate + build + commit**

Run: `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/customer/pages/my-bookings.component.ts
git commit -m "fix(customer): unify reorder to rebook-same-servicer (drop toast-only path)"
```

### Task 3: Make MyBookings the Order History view; retire the old one

**Files:**
- Modify: `frontend/src/app/customer/customer.routes.ts` (`33-56`)
- Modify: `frontend/src/app/customer/pages/my-bookings.component.ts` (add "Rebook this servicer")
- Remove/retire: `frontend/src/app/customer/pages/order-history.component.ts`
- Modify: customer shell nav links

- [ ] **Step 1: Point the Order History route at MyBookings.** In `customer.routes.ts`,
  make `/customer/history` (the "Order History" entry) render `MyBookingsComponent`
  instead of `OrderHistoryComponent`. Keep MyBookings' tab logic (pending / in-progress /
  history) — these become Upcoming + Past sections under Order History.

- [ ] **Step 2: Add "Rebook this servicer" to MyBookings History tab.** On each
  completed/cancelled booking row, show the strong rebook button wired to the navigate+
  prefill handler (already added in Task 2). Label it "Rebook this servicer".

- [ ] **Step 3: Retire `OrderHistoryComponent`.** Remove its route, delete the component
  file (or leave the file but drop all references), and grep `OrderHistoryComponent` +
  `order-history` across `frontend/src` to remove imports/links. Keep the backend
  `GET /user/me/history` only if MyBookings needs it; otherwise leave it unused (don't
  delete backend in this plan).

- [ ] **Step 4: Redirect old deep links** so nothing 404s:

```typescript
  // whatever the old paths were — point them at the unified history view
  { path: 'bookings', redirectTo: 'history', pathMatch: 'prefix' },
```

- [ ] **Step 5: Update nav labels** to "Order History" / "Upcoming" / "Past".

- [ ] **Step 6: Type-gate + build + commit**

Run: `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/customer
git commit -m "feat(customer): MyBookings view becomes Order History + rebook-this-servicer; retire old order-history"
```

### Task 4: Verify

- [ ] **Step 1:** As customer.loyal: one "Order History" nav entry; Upcoming shows
  pending/in-progress, Past shows completed/cancelled; each past order has a working
  "Rebook same servicer" that lands on a prefilled, servicer-locked quote form.
- [ ] **Step 2:** Old `/customer/bookings/*` and `/customer/history` links redirect, no 404.

---

## Resolved decisions (2026-06-23)

- C2 route shape: **MyBookings view wins** — it becomes the Order History content;
  `OrderHistoryComponent` is retired; "Rebook this servicer" button added to MyBookings.
- "Remove the old one" = retire the duplicate OrderHistory view + drop the toast-only
  reorder. NOT a data deletion.

## Self-Review notes

- C1: backend already sends `logoUrl` — verified via 2026-06-23 exploration
  (`quote.service.ts:788`). Frontend-only, low risk.
- C2 touches routing + removes a component — flagged as needing a confirm (open
  questions) before execution; do not run Task 3 until the route shape is approved.
- Reorder backend (`reorderBooking`, `booking.service.ts:1291`) is unchanged; both
  frontend paths already call `POST /bookings/:id/reorder` — only the frontend handling
  of the response differs. Task 2 just makes both use the navigate+prefill response.
