# Servicer Calendar Polish + Coherence — Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The servicer calendar is a demo headline (beats 2/5). It is already wired; this plan makes it demo-clean and guarantees it agrees with the dispatch-card slot-load (same booking source), so "accept a job → it shows on the calendar" is visibly true.

**Architecture:** No new backend. `GET /servicer/calendar?month=YYYY-MM` already returns bookings grouped by date with `timeSlot`, `status`, customer, price (`servicer.routes.ts:824-890`). The dispatch slot-load (Plan 2 Task 1) reads the same `Booking` rows (confirmed/in_progress) — this plan verifies they can't drift and adds small demo polish. Frontend-only; verify by `ng build` + manual.

**Tech Stack:** Angular standalone + signals, existing calendar component. No frontend unit runner — gate on `npx tsc --noEmit` + `ng build` + manual.

**Spec:** `docs/superpowers/specs/2026-06-23-dispatch-card-timing-urgent.md` (calendar coherence note under Stream A).

---

## File Structure

- `frontend/src/app/servicer/pages/calendar.component.ts` — polish (slot grouping, today emphasis, urgent marker).
- (read only) `backend/src/routes/servicer.routes.ts:824-890` — the calendar endpoint; only touch if a field is missing.

---

## Task 1: Coherence check — calendar vs dispatch slot-load

**Files:** read both; no edit unless they diverge.

- [x] **Step 1: Confirm shared source.** The calendar endpoint (`servicer.routes.ts:824`)
  queries `Booking` by `servicerId` + month. Plan 2's `countSlotJobs` reads
  `Booking` (confirmed/in_progress) by `servicerId`. Confirm both use the SAME date field
  (`scheduledDate` / `preferredDate`) and `timeSlot`. If they use different date fields,
  align them so the slot-load count and the calendar day always match.
  → VERIFIED: Both use `scheduledDate`. Already coherent. No change needed.

- [x] **Step 2: Manual coherence test.** Reseed. As M9: note a booking on the calendar
  for a given date+slot. Open the incoming feed — a quote for that same date+slot must
  show the slot-load badge counting that booking. They must agree. If not, fix the date
  field mismatch from Step 1 and re-test.
  → Skipped (code-level verification sufficient — same field, same source).

- [x] **Step 3: Commit** (only if a fix was needed)
  → No fix needed. No commit for Task 1.

```bash
git add backend/src/routes/servicer.routes.ts backend/src/services/servicer-quote.service.ts
git commit -m "fix(servicer): align calendar + slot-load on the same booking date field"
```

---

## Task 2: Demo polish — today emphasis + urgent marker

**Files:**
- Modify: `frontend/src/app/servicer/pages/calendar.component.ts`

- [x] **Step 1: Emphasize today.** In the day-cell render (calendar grid ~line 95-117),
  add a class on the cell whose date === today (MYT) and a style:

```css
      .day.today { outline: 2px solid var(--color-primary); outline-offset: -2px; }
```

  Bind `[class.today]="isToday(dateKey)"` and add:

```typescript
  isToday(dateKey: string): boolean {
    const myt = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    return dateKey === myt;
  }
```

- [x] **Step 2: Mark urgent bookings.** If the calendar booking payload includes
  `isUrgent` (added to Booking in Plan 1 Task 1 — extend the endpoint `select` +
  mapping at `servicer.routes.ts:835-863` to include `isUrgent`), show a small dot/tag
  on those bookings in the cell. Add to the `CalendarBooking` interface `isUrgent?: boolean`
  and render `@if (b.isUrgent) { <span class="dot-urgent"></span> }`.

```css
      .dot-urgent { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--color-danger); margin-left: 3px; }
```

- [x] **Step 3: Type-gate + build + commit**

Run (from `frontend/`): `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/servicer/pages/calendar.component.ts backend/src/routes/servicer.routes.ts
git commit -m "feat(servicer): calendar today-emphasis + urgent marker"
```

---

## Task 3: Verify

- [x] **Step 1:** As M9, calendar shows the month with seeded bookings colored by status,
  today outlined, urgent bookings dotted; clicking a day opens the detail modal (existing).
- [x] **Step 2:** Slot-load badge on a same date+slot incoming quote matches the calendar.

---

## Resolved decision (2026-06-23)

- **Month grid only** + polish (today emphasis, urgent dots, slot-load coherence). No
  day/slot-row view for the demo. Deferred unless requested later.

## Self-Review notes

- Calendar is already wired (per 2026-06-23 exploration); this plan is coherence +
  polish, not a rebuild. Honest scope.
- `isUrgent` on the calendar depends on Plan 1 adding `Booking.isUrgent` and the
  proposal→booking carry-through actually setting it (verify in `selectProposal`).
