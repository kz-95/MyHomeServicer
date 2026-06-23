# Dispatch Card Visual Redesign — Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** Redesign the servicer incoming-quote card so Price/Time/Place lead, the job's urgency + slot load + estimated duration + taken-status are visible, and the servicer can open the location in Google Maps/Waze — all from data the backend already (or now) sends.

**Architecture:** Frontend-first. Extend the `IncomingQuote` interface with fields the backend already returns, restructure the card template (Price→Time→Place hierarchy + `[Urgent]` tag + slot-load badge + duration + `View on map` deep-link + ▾ details expander). One backend addition: `slotJobs` (servicer's existing jobs in the same date+slot) on `listIncomingQuotes`. Depends on Plan 1 (which adds `isUrgent`/`urgentFee` to the feed and the timing model).

**Tech Stack:** Angular standalone components, signals, `@if`/`@for` control flow, existing `--color-*` CSS tokens. Backend: Prisma. **No frontend unit-test runner exists** (only Playwright e2e in `frontend/e2e/`), so frontend tasks gate on `npx tsc --noEmit` + `ng build` + manual check; an optional e2e assertion is included.

**Spec:** `docs/superpowers/specs/2026-06-23-dispatch-card-timing-urgent.md` (Stream A).
**Prereq:** Plan 1 merged (timing + urgent fields).

---

## File Structure

- `backend/src/services/servicer-quote.service.ts` — add `slotJobs` (+ `estimatedDurationMin` if available) to `listIncomingQuotes`.
- `frontend/src/app/servicer/pages/incoming-quotes.component.ts` — interface + template + styles + deep-link/bucket helpers.
- (optional) `frontend/e2e/specs/servicer-jobs.spec.ts` — assert the redesigned card renders Price/Time/Place + map link.

---

## Task 1: Backend — surface slot load on the incoming feed

**Files:**
- Modify: `backend/src/services/servicer-quote.service.ts` (`listIncomingQuotes`, `243-308`)
- Test: `backend/tests/unit/slot-load.test.ts` (new — pure helper)

- [x] **Step 1: Write a failing unit test for the slot-collision helper**

```typescript
import { countSlotJobs } from '../../src/services/servicer-quote.service';

describe('countSlotJobs', () => {
  const bookings = [
    { preferredDate: new Date('2026-06-15T00:00:00Z'), timeSlot: 'afternoon', estDurationMin: 90 },
    { preferredDate: new Date('2026-06-15T00:00:00Z'), timeSlot: 'afternoon', estDurationMin: 60 },
    { preferredDate: new Date('2026-06-16T00:00:00Z'), timeSlot: 'morning', estDurationMin: 30 },
  ];
  it('counts jobs + sums duration for a matching date+slot', () => {
    expect(countSlotJobs(bookings, new Date('2026-06-15T00:00:00Z'), 'afternoon'))
      .toEqual({ count: 2, totalDurationMin: 150 });
  });
  it('returns zero for a slot with no jobs', () => {
    expect(countSlotJobs(bookings, new Date('2026-06-17T00:00:00Z'), 'night'))
      .toEqual({ count: 0, totalDurationMin: 0 });
  });
});
```

- [x] **Step 2: Run, verify fail**

Run (from `backend/`): `npx jest tests/unit/slot-load.test.ts`
Expected: FAIL — `countSlotJobs` not exported.

- [x] **Step 3: Add the exported helper** to `servicer-quote.service.ts` (near the top, after imports):

```typescript
/** @internal Exported for unit testing. Count a servicer's jobs colliding on the
 *  same MYT calendar day + slot, summing estimated durations. */
export function countSlotJobs(
  bookings: { preferredDate: Date; timeSlot: string; estDurationMin: number | null }[],
  date: Date,
  slot: string,
): { count: number; totalDurationMin: number } {
  const MYT = 8 * 60 * 60 * 1000;
  const day = (d: Date) => new Date(d.getTime() + MYT).toISOString().slice(0, 10);
  const target = day(date);
  const hits = bookings.filter((b) => b.timeSlot === slot && day(b.preferredDate) === target);
  return {
    count: hits.length,
    totalDurationMin: hits.reduce((s, b) => s + (b.estDurationMin ?? 0), 0),
  };
}
```

- [x] **Step 4: Run, verify pass**

Run: `npx jest tests/unit/slot-load.test.ts`
Expected: PASS.

- [x] **Step 5: Wire it into `listIncomingQuotes`.** After the `broadcasts` query, load the
  servicer's active bookings once, then compute per quote. Add before the `return broadcasts.map(...)`:

```typescript
  const myBookings = await prisma.booking.findMany({
    where: { servicerId, status: { in: ['confirmed', 'in_progress'] } },
    select: { preferredDate: true, timeSlot: true, estimatedDurationMin: true },
  });
  const slotBookings = myBookings.map((b) => ({
    preferredDate: b.preferredDate,
    timeSlot: b.timeSlot as string,
    estDurationMin: b.estimatedDurationMin ?? null,
  }));
```

> If `Booking` has no `preferredDate`/`timeSlot`/`estimatedDurationMin` columns, read the
> Booking model first (`grep "model Booking" -A40 schema.prisma`) and map to the actual
> scheduled-date + slot + duration field names before writing this. Adjust the `select`.

  Then inside the `.map((b) => { ... })`, after `paymentMode: q.paymentMode,` add:

```typescript
        slotJobs: countSlotJobs(slotBookings, q.preferredDate, q.timeSlot),
```

- [x] **Step 6: Type-gate + commit**

Run: `rtk proxy npx tsc --noEmit`
```bash
git add backend/src/services/servicer-quote.service.ts backend/tests/unit/slot-load.test.ts
git commit -m "feat(servicer): surface slot-load (jobs+duration) on incoming quotes"
```

---

## Task 2: Frontend — extend the `IncomingQuote` interface

**Files:**
- Modify: `frontend/src/app/servicer/pages/incoming-quotes.component.ts` (interface `10-21`)

- [x] **Step 1: Replace the interface** with the full set the backend sends:

```typescript
interface IncomingQuote {
  quoteId: string;
  category: string;
  timeSlot: string;
  preferredDate: string;
  propertyType?: string;
  budgetMin?: number;
  budgetMax?: number;
  paymentMode?: 'pay_now' | 'pay_later' | 'cash';
  derivedStatus: string;
  status: string;
  servicerDeadline: string;
  myProposalId?: string | null;
  // Added 2026-06-23 (already sent by listIncomingQuotes):
  isUrgent?: boolean;
  urgentFee?: number | null;
  customerName?: string;
  customerAvatarUrl?: string | null;
  address?: string | null;
  postcode?: string | null;
  district?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  descriptions?: string[];
  slotJobs?: { count: number; totalDurationMin: number };
}
```

- [x] **Step 2: Type-gate**

Run (from `frontend/`): `npx tsc --noEmit`
Expected: zero errors (the template still references the old subset — fine).

- [x] **Step 3: Commit**

```bash
git add frontend/src/app/servicer/pages/incoming-quotes.component.ts
git commit -m "feat(servicer): widen IncomingQuote to backend payload"
```

---

## Task 3: Frontend — bucket label, deep-link, and place helpers

**Files:**
- Modify: `incoming-quotes.component.ts` (class body, near `expand`/`acceptListing`)

- [x] **Step 1: Add helper methods** to the component class:

```typescript
  /** Friendly slot label (matches the customer-facing ranges). */
  slotLabel(slot: string): string {
    const map: Record<string, string> = {
      morning: 'Morning (9–11)', noon: 'Noon (11–13)', afternoon: 'Afternoon (13–15)',
      evening: 'Evening (15–17)', night: 'Night (17–22)',
    };
    return map[slot] ?? slot;
  }

  /** Composed location text for the card (district/state line). */
  placeLine(q: IncomingQuote): string {
    return [q.district, q.state].filter(Boolean).join(', ') || (q.address ?? 'Location on accept');
  }

  /** Open the job location in the user's maps app (new tab; mobile → native app).
   *  Uses the address string so it works even when lat/lng are absent. */
  openMap(q: IncomingQuote, app: 'google' | 'waze'): void {
    const query = encodeURIComponent([q.address, q.district, q.state, q.postcode].filter(Boolean).join(', '));
    const hasCoords = q.lat != null && q.lng != null;
    const url = app === 'waze'
      ? (hasCoords ? `https://waze.com/ul?ll=${q.lat},${q.lng}&navigate=yes` : `https://waze.com/ul?q=${query}`)
      : (hasCoords ? `https://www.google.com/maps/search/?api=1&query=${q.lat},${q.lng}` : `https://www.google.com/maps/search/?api=1&query=${query}`);
    window.open(url, '_blank', 'noopener');
  }
```

(Follows the existing `wa-button.component.ts` pattern: `window.open(url, '_blank', 'noopener')`.)

- [x] **Step 2: Type-gate + commit**

Run: `npx tsc --noEmit`
```bash
git add frontend/src/app/servicer/pages/incoming-quotes.component.ts
git commit -m "feat(servicer): slot-label + maps deep-link helpers"
```

---

## Task 4: Frontend — restructure the card template

**Files:**
- Modify: `incoming-quotes.component.ts` template (the `@for` card block, `54-98`)

- [x] **Step 1: Replace the card block** (`<div class="card quote">...`) with the redesigned layout. Replace lines 54-98's card body:

```html
      @for (q of displayQuotes(); track q.quoteId) {
      <div class="card quote" [class.urgent]="q.isUrgent">
        <div class="head" role="button" tabindex="0" (click)="expand(q)" (keydown.enter)="expand(q)">
          <div class="cat">
            <strong>{{ q.category }}</strong>
            @if (q.isUrgent) { <span class="tag-urgent">Urgent +RM{{ q.urgentFee }}</span> }
          </div>
          <div class="right">
            <app-countdown [deadline]="q.servicerDeadline" />
            @if (q.myProposalId) { <span class="done">Proposal sent</span> }
          </div>
        </div>

        <div class="facts">
          <div class="fact price">RM {{ q.budgetMin ?? '—' }} – {{ q.budgetMax ?? '—' }}
            @if (q.paymentMode) { <span class="pay">· {{ q.paymentMode === 'pay_now' ? 'Pay now' : (q.paymentMode === 'cash' ? 'Cash' : 'Pay later') }}</span> }
          </div>
          <div class="fact time">{{ q.preferredDate | date: 'EEE, MMM d' }} · {{ slotLabel(q.timeSlot) }}
            @if (q.slotJobs && q.slotJobs.count > 0) {
              <span class="slot-load">🟡 {{ q.slotJobs.count }} job(s) this slot (~{{ q.slotJobs.totalDurationMin }} min)</span>
            } @else {
              <span class="slot-free">🟢 Free this slot</span>
            }
          </div>
          <div class="fact place">{{ placeLine(q) }}
            @if (q.address) { <div class="addr muted">{{ q.address }}</div> }
          </div>
        </div>

        <div class="chips-row">
          @if (q.propertyType) { <span class="chip-static">{{ q.propertyType }}</span> }
          <button type="button" class="map-link" (click)="openMap(q, 'google'); $event.stopPropagation()">View on map ↗</button>
        </div>

        @if (!q.myProposalId) {
          <div class="accept-row">
            <button class="btn-primary" (click)="acceptListing(q, $event)" [disabled]="busy()">Accept Job</button>
          </div>
        }

        @if (expanded() === q.quoteId) {
          <div class="details" (click)="$event.stopPropagation()">
            @if (q.customerName) {
              <div class="cust">
                @if (q.customerAvatarUrl) { <img class="avatar" [src]="q.customerAvatarUrl" alt="" /> }
                <span>{{ q.customerName }}</span>
              </div>
            }
            @if (q.descriptions?.length) {
              <ul class="answers">@for (d of q.descriptions; track d) { <li>{{ d }}</li> }</ul>
            }
            @if (q.notes) { <p class="notes">"{{ q.notes }}"</p> }

            @if (!q.myProposalId) {
              <form class="propose" (ngSubmit)="propose(q)">
                <input type="number" placeholder="Price (RM)" [(ngModel)]="price" name="price" />
                <input type="number" placeholder="ETA (min)" [(ngModel)]="eta" name="eta" />
                <input placeholder="Message" [(ngModel)]="message" name="message" />
                <button class="btn-primary" type="submit" [disabled]="busy()">Send proposal</button>
              </form>
            }
          </div>
        }
      </div>
      }
```

(Note: the old design split "Accept Job" and an expand-to-propose form. This keeps both — Accept = one-tap, expand reveals customer detail + the manual offer form.)

- [x] **Step 2: Add styles** to the `styles: [...]` block:

```css
      .quote.urgent { border-left: 3px solid var(--color-danger); }
      .cat { display: flex; align-items: center; gap: 0.5rem; }
      .tag-urgent { font-size: 0.7rem; font-weight: 700; color: #fff; background: var(--color-danger); padding: 0.1rem 0.4rem; border-radius: 999px; }
      .facts { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.6rem 0; }
      .fact { font-size: 1.05rem; font-weight: 600; color: var(--color-text); }
      .fact.price { color: var(--color-primary); font-size: 1.15rem; }
      .fact .pay, .fact .slot-load, .fact .slot-free { font-size: 0.8rem; font-weight: 500; margin-left: 0.4rem; }
      .slot-free { color: var(--color-success); }
      .addr { font-size: 0.8rem; font-weight: 400; }
      .chips-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0; }
      .chip-static { font-size: 0.75rem; border: 1px solid var(--color-border); border-radius: 999px; padding: 0.15rem 0.5rem; color: var(--color-muted); }
      .map-link { background: none; border: none; color: var(--color-primary); cursor: pointer; font-size: 0.85rem; padding: 0; }
      .details { margin-top: 0.7rem; border-top: 1px solid var(--color-border); padding-top: 0.6rem; animation: slide-down 0.18s ease-out both; }
      .cust { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
      .avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
      .answers { margin: 0.3rem 0; padding-left: 1.1rem; font-size: 0.85rem; color: var(--color-muted); }
      .notes { font-size: 0.85rem; font-style: italic; color: var(--color-muted); }
```

- [x] **Step 3: Type-gate + build**

Run (from `frontend/`): `npx tsc --noEmit` then `ng build`
Expected: build succeeds (AOT). Per project memory, run `ng build` — broken AOT can serve a stale `ng serve` bundle and mask errors.

- [x] **Step 4: Commit**

```bash
git add frontend/src/app/servicer/pages/incoming-quotes.component.ts
git commit -m "feat(servicer): redesign dispatch card — price/time/place, urgent, slot-load, map link"
```

---

## Task 5: Real-time taken-status (card flips when another servicer wins)

**Files:**
- Modify: `incoming-quotes.component.ts` (`ngOnInit` socket subscription, `198-205`)

- [x] **Step 1: Subscribe to `quote.matched`** alongside the existing `quote.new` sub. In `ngOnInit`:

```typescript
    this.sub = this.socket.on<{ quoteId: string }>('quote.new').subscribe(() => this.load());
    this.subMatched = this.socket.on<{ quoteId: string }>('quote.matched').subscribe(() => this.load());
```

Declare `private subMatched?: Subscription;` and unsubscribe it in `ngOnDestroy`.
`load()` already filters `status === 'open'` server-side, so a matched quote drops off
the feed on refresh. (If the backend does not emit `quote.matched`, add the emit in
`booking.service.ts selectProposal` after the quote flips to `matched`.)

- [x] **Step 2: Type-gate + build + commit**

Run: `npx tsc --noEmit` && `ng build`
```bash
git add frontend/src/app/servicer/pages/incoming-quotes.component.ts
git commit -m "feat(servicer): live-remove taken quotes from incoming feed"
```

---

## Task 6: Manual + e2e verification

- [x] **Step 1: Manual.** Reseed, log in as M9. Confirm the incoming card shows: bold
  Price + payment, date + slot label, location + `View on map` (opens Google Maps new
  tab), `[Urgent]` tag on a same-day quote, slot-load badge, and the ▾ expander shows
  customer name/answers/notes. Accept still works.
- [x] **Step 2: e2e (optional).** In `frontend/e2e/specs/servicer-jobs.spec.ts` add an
  assertion that an incoming card renders the price and a `View on map` control.
- [x] **Step 3: Commit** any e2e additions.

---

## Self-Review notes

- Spec Stream A → Tasks 2-5. Slot-load (`slotJobs`) backend → Task 1. Urgent tag/fee
  consumed here come from Plan 1's feed fields.
- Estimated duration on the card: shown via `slotJobs.totalDurationMin` for existing
  load; per-quote estimated duration (from the servicer's own listing pre-fill) is
  surfaced in the `open`/propose flow already (`openQuote` returns prefill) — not
  duplicated on the face to avoid clutter. Revisit if the demo wants it on the face.
- Map embed (OSM iframe, Tier 2) intentionally omitted here — deep-link covers the
  demo; embed is a follow-up if `lat/lng` seeding is confirmed.
- Frontend has no unit runner; helpers (`openMap`, `slotLabel`) are verified by build +
  manual. `countSlotJobs` (backend, pure) IS unit-tested (Task 1).
