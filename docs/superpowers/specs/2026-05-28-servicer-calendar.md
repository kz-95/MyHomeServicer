# Servicer Calendar System — F-B

> 2026-05-28 · Brainstorming session · Ready for execution

## Goal

A new Calendar tab in the servicer portal (`/servicer/calendar`) showing a visual month-view calendar with booked jobs and available time slots. Let servicers see their schedule at a glance, manage availability, and understand when they're free to take new work.

## Current state

### Data model — already exists

| Model | Fields | Status |
|-------|--------|--------|
| `ServicerSchedule` | `id`, `servicerId`, `weekday` (Mon–Sun), `timeSlot` (morning/lunch/evening/night), `isAvailable` | Schema exists, **no API routes, no frontend** |
| `Booking` | `scheduledDate`, `timeSlot`, `status`, `servicerId` | Already populated by the booking lifecycle |
| `TimeSlot` enum | `morning`, `lunch`, `evening`, `night` | Already in schema |
| `Weekday` enum | `mon`–`sun` | Already in schema |

### What's missing

1. **API**: CRUD for `ServicerSchedule` + calendar data endpoint
2. **Frontend**: `/servicer/calendar` route + page
3. **Working hours UI**: In servicer account settings, a grid to set availability per weekday×timeSlot
4. **Seed data**: Default schedule (all available Mon–Sat, none Sunday) for existing servicers

## MVP Scope

### 1. Backend API

#### Calendar data endpoint

```
GET /servicer/calendar?month=2026-06
```

Returns all confirmed/in-progress bookings for the servicer in the given month, plus available slots from ServicerSchedule.

```typescript
interface CalendarResponse {
  bookings: {
    id: string;
    date: string;       // "2026-06-15"
    timeSlot: TimeSlot;
    customerName: string;
    customerAvatarUrl?: string;
    category: string;
    status: string;
    price: number;
    jobId: string;
  }[];
  availability: {
    weekday: Weekday;   // "mon"|"tue"|...
    timeSlot: TimeSlot;  // "morning"|"lunch"|"evening"|"night"
    isAvailable: boolean;
  }[];
}
```

**File:** `backend/src/routes/servicer.routes.ts` (add route)

```typescript
router.get('/calendar', requireAuth, requireServicer, async (req, res) => {
  const servicerId = req.user!.principal.id;
  const { month } = req.query; // "2026-06"
  // Parse month to date range
  // Query bookings where servicerId + status in (confirmed,in_progress) + month matches
  // Query ServicerSchedule for availability
  // Return combined response
});
```

#### Working hours CRUD

```
GET    /servicer/schedule          → list all ServicerSchedule rows
PUT    /servicer/schedule          → bulk update: [{ weekday, timeSlot, isAvailable }]
```

**File:** `backend/src/routes/servicer.routes.ts`

`PUT /servicer/schedule` replaces all schedule rows for this servicer (delete old, insert new, single transaction). Accepts up to 35 entries (7 days × 5 slots — but current TimeSlot enum has 4, so 28 max).

**No new models, no schema changes.** The `ServicerSchedule` model already exists at `schema.prisma:527-538`.

### 2. Frontend — Calendar page

**New file:** `frontend/src/app/servicer/pages/calendar.component.ts`

#### UI structure

```
┌────────────────────────────────────────────────┐
│  Servicer Calendar          ◁ June 2026 ▷      │
│                                                │
│  ┌────────────────────────────────────────────┐ │
│  │  Mon  │  Tue  │  Wed  │  Thu  │  Fri  │   │ │
│  │  Sat  │                                       │ │
│  ├───────┼───────┼───────┼───────┼───────┼───────┤
│  │       │   1   │   2   │   3   │   4   │   5   │ │
│  │       │       │  ┌───┐ │       │       │       │ │
│  │       │       │  │J.1│ │       │       │       │ │
│  │       │       │  └───┘ │       │       │       │ │
│  ├───────┼───────┼───────┼───────┼───────┼───────┤
│  │   6   │   7   │   8   │   9   │  10   │  11   │ │
│  │       │       │       │  ┌───┐ │       │       │ │
│  │       │       │       │  │J.2│ │       │       │ │
│  │       │       │       │  └───┘ │       │       │ │
│  └───────┴───────┴───────┴───────┴───────┴───────┘ │
│                                                │
│  ┌────────────────────────────────────┐         │
│  │  June 3 — Job #123                 │         │
│  │  Plumber: Ahmad's Kitchen Sink     │         │
│  │  Morning (9am–12pm) · RM 150       │         │
│  │  Confirmed · [View] [Reschedule]   │         │
│  └────────────────────────────────────┘         │
└────────────────────────────────────────────────┘
```

#### Components

**Calendar grid:** Pure CSS grid — 6 columns (Mon–Sat), no calendar library needed for MVP. Sunday shown optionally.

**Day cell:** Small card showing:
- Day number with today highlight
- Job indicators: colored dot or small label per booking
- Dot color by status (confirmed=blue, in_progress=green)
- Click → show day detail sidebar

**Month navigation:** ← June 2026 → — prev/next buttons at top.

**Day detail panel:** Below or to the side (responsive: below on mobile). Shows all bookings for the selected day with full details.

```html
<!-- Template structure -->
<div class="cal-page">
  <!-- Month header -->
  <div class="cal-hd">
    <button (click)="prevMonth()">←</button>
    <h2>{{ monthLabel() }}</h2>
    <button (click)="nextMonth()">→</button>
  </div>

  <!-- Weekday headers -->
  <div class="cal-weekdays">
    <span *ngFor="let d of weekdays">{{ d }}</span>
  </div>

  <!-- Calendar grid -->
  <div class="cal-grid">
    @for (day of days(); track day.date) {
      <div
        class="cal-day"
        [class.other-month]="!day.isThisMonth"
        [class.today]="day.isToday"
        [class.has-bookings]="day.bookings.length > 0"
        (click)="selectDay(day)"
      >
        <span class="cal-day-num">{{ day.dayNum }}</span>
        @for (b of day.bookings.slice(0, 2); track b.id) {
          <span class="cal-dot" [class]="b.status">{{ b.customerName[0] }}</span>
        }
        @if (day.bookings.length > 2) {
          <span class="cal-more">+{{ day.bookings.length - 2 }}</span>
        }
      </div>
    }
  </div>

  <!-- Selected day details -->
  @if (selectedDay()) {
    <div class="cal-detail card page-child">
      <h3>{{ selectedDay()!.label }}</h3>
      @if (selectedDay()!.bookings.length === 0) {
        <p class="muted">No jobs scheduled. Time to promote your services!</p>
      } @else {
        @for (b of selectedDay()!.bookings; track b.id) {
          <div class="cal-booking">
            <div class="cb-left">
              <span class="cb-time">{{ b.timeSlot }}</span>
              <strong>{{ b.customerName }}</strong>
              <span class="muted">{{ b.category }}</span>
            </div>
            <div class="cb-right">
              <span class="status" [class]="b.status">{{ b.status }}</span>
              <span class="cb-price">RM {{ b.price | number: '1.2-2' }}</span>
              <button class="btn-ghost" (click)="viewJob(b)">View</button>
            </div>
          </div>
        }
      }
    </div>
  }
</div>
```

#### Component logic

```typescript
@Component({ ... })
export class CalendarComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  currentMonth = signal(new Date()); // keeps track of the viewed month
  bookings = signal<CalendarBooking[]>([]);
  availability = signal<ScheduleRow[]>([]);
  selectedDay = signal<DayData | null>(null);
  loading = signal(true);

  days = computed(() => this.buildDays(this.currentMonth(), this.bookings()));

  ngOnInit(): void { this.loadMonth(); }

  prevMonth(): void {
    this.currentMonth.update(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    this.loadMonth();
  }

  nextMonth(): void { /* same pattern */ }

  private loadMonth(): void {
    const m = this.currentMonth();
    const monthStr = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    this.api.get<CalendarResponse>(`/servicer/calendar?month=${monthStr}`).subscribe({ ... });
  }

  selectDay(day: DayData): void { this.selectedDay.set(day); }

  viewJob(b: CalendarBooking): void {
    this.router.navigate(['/servicer/jobs'], { queryParams: { jobId: b.id } });
  }

  private buildDays(month: Date, bookings: CalendarBooking[]): DayData[] { /* ... */ }
}
```

### 3. Working hours management

**Location:** Servicer account page (`servicer/pages/account.component.ts`) — add a "Working Hours" section.

**UI:** A 7×(N) grid of toggle buttons:
- Rows: Mon, Tue, Wed, Thu, Fri, Sat, Sun
- Columns: Morning, Lunch, Evening, Night
- Each cell: toggle button — green/on = available, gray/off = unavailable
- [Save] button → `PUT /servicer/schedule` with all 28 cells

```html
<section class="card page-child">
  <h2>Working Hours</h2>
  <p class="muted small">Set when you're available for new jobs.</p>
  <div class="sched-grid">
    @for (day of weekdays; track day) {
      <div class="sched-row">
        <span class="sched-day">{{ dayLabel(day) }}</span>
        @for (slot of timeSlots; track slot) {
          <button
            class="sched-cell"
            [class.on]="isAvailable(day, slot)"
            (click)="toggle(day, slot)"
          >
            {{ slotLabel(slot) }}
          </button>
        }
      </div>
    }
  </div>
  <button class="btn-primary" (click)="saveSchedule()" [disabled]="savingSched()">
    {{ savingSched() ? 'Saving…' : 'Save schedule' }}
  </button>
</section>
```

### 4. Route registration

**File:** `backend/src/routes/servicer.routes.ts` — add:
- `GET /servicer/calendar`
- `GET /servicer/schedule`
- `PUT /servicer/schedule`

**File:** `frontend/src/app/servicer/servicer.routes.ts` — add:
```typescript
{ path: 'calendar', loadComponent: () => import('./pages/calendar.component').then(m => m.CalendarComponent) },
```

**File:** `frontend/src/app/servicer/servicer-shell.component.ts` — add nav item:
```typescript
{ label: 'Calendar', path: '/servicer/calendar', icon: 'calendar' },
```

### 5. Seed data

**File:** `backend/prisma/seed/seed.ts`

For all 19 servicers, seed default `ServicerSchedule` rows:

```typescript
// Seed schedule: all time slots available Mon–Sat, none Sunday
const weekdays = ['mon','tue','wed','thu','fri','sat'];
const timeSlots = ['morning','lunch','evening','night'];

for (const servicer of allServicers) {
  for (const weekday of weekdays) {
    for (const timeSlot of timeSlots) {
      await prisma.servicerSchedule.create({
        data: {
          servicerId: servicer.id,
          weekday: weekday as Weekday,
          timeSlot: timeSlot as TimeSlot,
          isAvailable: true,
        },
      });
    }
  }
}
```

## Implementation order

1. Backend calendar + schedule endpoints
2. Frontend calendar page (grid + month nav + day detail)
3. Working hours management in account page
4. Calendar nav item in servicer sidebar
5. Seed data for default schedules

## DoD

| Gate | Expected |
|------|----------|
| `npx tsc --noEmit` backend | 0 errors |
| `ng build` frontend | Exit 0 |
| `GET /servicer/calendar?month=2026-06` returns bookings + availability | ✅ Working |
| Calendar grid shows correct days for month | ✅ Working |
| Month navigation (prev/next) reloads data | ✅ Working |
| Job dots appear on days with bookings | ✅ Working |
| Click day → detail panel shows bookings | ✅ Working |
| Working hours grid toggles + saves | ✅ Working |
| Calendar nav item visible in sidebar | ✅ Working |
| Seed creates 19 × 6 × 4 = 456 schedule rows | ✅ Seeded |

## Cross-reference: dispatch overlay

When a servicer clicks a booking on the calendar, open the **dispatch overlay** (see `2026-05-28-dispatch-overlay.md`) with that booking's job ID. The overlay provides the full customer info, instructions, map, and actions — no need to navigate away from the calendar.

```typescript
selectDay(day: DayData): void {
  // If the day has bookings, open dispatch overlay for the first one
  if (day.bookings.length > 0) {
    this.openOverlay(day.bookings[0].id);  // uses dispatch-overlay component
  }
}
```

## Future enhancements (MVP+)

1. **Week/day view** — toggle between month/week/day granularity
2. **Drag-and-drop** — move bookings between time slots
3. **Block-out days** — mark specific dates as unavailable (not just weekday templates)
4. **Notification** — 24h-before-job reminder
5. **Buffer time** — configurable gap between appointments
6. **Holiday calendar** — Malaysian public holidays overlay
7. **Integration with proposal form** — servicer sees calendar availability when proposing
