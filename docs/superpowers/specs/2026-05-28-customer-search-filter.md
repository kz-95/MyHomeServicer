# Customer Search & Filter — F-D

> 2026-05-28 · Brainstorming session · Ready for execution

## Goal

Add search bars and filter controls to the remaining customer list pages, matching the pattern already used on MyQuotesComponent and MyBookingsComponent.

## Current state

| Page | Route | Search | Filter | Status |
|------|-------|--------|--------|--------|
| My Quotes | `/customer/quotes` | ✅ Search + sort | ✅ Status chips + sort dropdown | Already done |
| My Bookings | `/customer/bookings` | ✅ Search by name/category | ✅ Status chips (all/pending/confirmed/in_progress/completed/cancelled) | Already done |
| Order History | `/customer/history` | ❌ None | ❌ None | **Needs work** |
| Rewards | `/customer/rewards` | ❌ None | ❌ None | **Needs work** |

Nav rename "Upcoming Bookings" → "Upcoming": ✅ Already done in `customer-shell.component.ts:18`.

## What to build

### 1. Order History — search + filter

**File:** `frontend/src/app/customer/pages/order-history.component.ts`

Template currently renders a flat list of `HistoryItem[]` with servicer name, category, date, price, and "Rebook same servicer" button. Add a toolbar between the `<h1>` and the list, following the same pattern as MyBookingsComponent:

```html
<div class="toolbar">
  <input
    class="search"
    type="text"
    placeholder="Search by servicer or category…"
    [(ngModel)]="search"
    name="ohs"
  />
  <div class="chips">
    <button class="chip" [class.on]="statusFilter() === 'all'" (click)="statusFilter.set('all')">All</button>
    <button class="chip" [class.on]="statusFilter() === 'completed'" (click)="statusFilter.set('completed')">Completed</button>
    <button class="chip" [class.on]="statusFilter() === 'cancelled'" (click)="statusFilter.set('cancelled')">Cancelled</button>
  </div>
</div>
```

Component logic additions:
- `search = signal('')`
- `statusFilter = signal<string>('all')`
- `filteredItems = computed(() => { ... })` — filters `items()` by search (servicerName, categoryName) and status (`type` field maps to 'completed' or 'cancelled')

Imports to add: `FormsModule` (for `[(ngModel)]`), `signal`, `computed` from `@angular/core`.

Styles to add: Copy the `.toolbar`, `.search`, `.chips`, `.chip` rules from MyBookingsComponent's styles block.

### 2. Rewards — search + tier filter

**File:** `frontend/src/app/customer/pages/rewards.component.ts`

Template currently shows rewards as a card grid. The list is small (4 rewards) but adding a search bar lets the customer find specific rewards by name or description.

Add a toolbar above the `.grid`:

```html
<div class="toolbar">
  <input
    class="search"
    type="text"
    placeholder="Search rewards…"
    [(ngModel)]="search"
    name="rs"
  />
</div>
```

Component logic additions:
- `search = signal('')`
- `filteredRewards = computed(() => ...)` — filters `rewards` by title or detail containing the search term
- Template: change `@for (r of rewards; ...)` → `@for (r of filteredRewards(); ...)`

Imports to add: `FormsModule`, `signal`, `computed`.

Styles: Same toolbar/search styles as Order History.

### 3. Shared toolbar/search styles

The `.toolbar`, `.search`, `.chips`, and `.chip` CSS classes are duplicated across MyQuotesComponent, MyBookingsComponent, JobsComponent, and ServicesComponent. Consider extracting to a shared stylesheet or global `styles.css` if the pattern keeps growing. For this spec (2 pages), inline CSS copy is acceptable.

## DoD

| Gate | Expected |
|------|----------|
| `npx tsc --noEmit` | 0 errors |
| `ng build` | Exit 0 |
| Order History search filters by servicer name, category name | ✅ Working |
| Order History status chips filter by completed/cancelled | ✅ Working |
| Rewards search filters by name/description | ✅ Working |
| Both pages have matching toolbar style | ✅ Consistent with MyBookings pattern |

## Non-goals

- No backend changes — all filtering is client-side on loaded data
- No pagination — data volumes are small (history < 100 items, rewards = 4)
- No sort controls — ordering is by date (newest first) from the backend
- The Rewards data is still demo/static (no backend) — search is purely cosmetic/UX
