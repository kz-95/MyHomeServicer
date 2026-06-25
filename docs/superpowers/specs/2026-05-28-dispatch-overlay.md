# Servicer Job Dispatch Overlay

> 2026-05-28 · Brainstorming session · Ready for execution

## Goal

Replace the inline expandable job detail section in the Active tab Kanban card with a **full-screen dispatch overlay**. This overlay auto-pops when a servicer confirms a booking and provides a 4-panel layout showing all job details, customer info, instructions with map, and action buttons.

Dependencies: requires **PIN in registration** spec (PIN verify endpoint for cancel flow).

## Current state

- Active jobs display as Kanban cards with an inline `[View details]` toggle
- The toggle fetches `GET /servicer/jobs/:id` and shows a small detail section
- Actions (Confirm / Mark Arrived / Mark Done / Cancel) are in the card footer
- Map is rendered inline via `MapViewComponent`

## Layout

**Desktop (≥1024px):** Full-screen overlay with 2-column × 2-row grid, fixed positioning, independent scroll:

```
┌──────────────────────────────────────────────────────────────┐
│  📋 Booking #HS-2026-06-15-042        ✅ Confirmed      [×]  │
├───────────────────────────┬──────────────────────────────────┤
│                           │                                  │
│  ┌── CUSTOMER ──────────┐ │  ┌── INSTRUCTIONS ────────────┐  │
│  │  [40px avatar]        │ │  │  "Call 10 min before..."   │  │
│  │  Ahmad bin Abdullah   │ │  │  "Park at visitor B1."     │  │
│  │  📞 012-3456789       │ │  │  "Take lift to L5."       │  │
│  │  📍 12, Jalan SS2/1   │ │  │  (scroll if overflow)     │  │
│  │     47300 PJ, Selangor│ │  └────────────────────────────┘  │
│  │  🏠 Condo · Level 5   │ │                                  │
│  │  👤 Contact: Sarah    │ │  ┌── MAP ─────────────────────┐  │
│  ├───────────────────────┤ │  │  [🗺️ Mini Map]            │  │
│  │  ┌── JOB DETAILS ───┐│ │  │  [📍 Nav] [📱 QR]         │  │
│  │  │ Service:Plumbing  ││ │  └────────────────────────────┘  │
│  │  │ Date: 15 Jun 2026 ││ │                                  │
│  │  │ Time: Morning     ││ │  (2fr - map takes more space)   │
│  │  │ Price: RM 150     ││ │                                  │
│  │  │ Payment: Cash     ││ │                                  │
│  │  │ Line items...     ││ │                                  │
│  │  │ Status: Confirmed ││ │                                  │
│  │  └───────────────────┘│ │                                  │
│  │  (1fr)                │ │                                  │
│  ├───────────────────────┤ │                                  │
│  │  ACTIONS (centered)   │ │                                  │
│  │  [📸 Mark Arrived]    │ │                                  │
│  └───────────────────────┴─┴──────────────────────────────────┘
└──────────────────────────────────────────────────────────────┘
```

**Mobile (<1024px):** Single column, 4 accordion sections stacked vertically. Each section independently collapsible.

## Trigger points

| Action | Behavior |
|--------|----------|
| Servicer clicks "Confirm job" on pending booking | ✅ Auto-pops dispatch overlay |
| Servicer clicks an active job card (replaces current inline expand) | ✅ Opens dispatch overlay |
| History tab → click a completed job | ✅ Opens dispatch overlay (read-only - no action buttons) |
| Close (× / backdrop click / Esc) | ✅ Returns to jobs board |

## Component architecture

**New file:** `frontend/src/app/shared/dispatch-overlay.component.ts`

### Inputs / Outputs

```typescript
@Input({ required: true }) jobId!: string;
@Input() readOnly = false;  // true for history/completed jobs
@Output() closed = new EventEmitter<void>();
```

### Data fetching

On open: `GET /servicer/jobs/:id` (existing endpoint, returns `JobDetail`):
```typescript
interface JobDetail {
  id: string;
  status: string;
  price: number;
  paymentMode: string;
  lineItems: { label: string; amount: number }[] | null;
  scheduledDate: string;
  timeSlot: string;
  // Customer info (Phase 6)
  customerName?: string;
  customerPhone?: string;
  customerAvatarUrl?: string;
  // Address
  address?: string;
  lat?: number | null;
  lng?: number | null;
  propertyType?: string;
  // Contact
  contactName?: string;
  contactNumber?: string;
  instructions?: string;
  // Booking metadata
  quoteRequest: { category: { name: string } };
}
```

### Template structure

```html
@if (open()) {
  <div class="dispatch-backdrop" (click)="onBackdropClick($event)">
    <div class="dispatch-overlay" role="dialog" aria-modal="true">
      <!-- Header bar -->
      <div class="dispatch-hd">
        <strong>📋 Booking #{{ jobData.id | slice:-8 }}</strong>
        <span class="status-badge">{{ jobData.status }}</span>
        <button class="dispatch-close" (click)="close()">×</button>
      </div>

      <!-- 2×2 grid -->
      <div class="dispatch-grid" [class.mobile]="isMobile()">

        <!-- Panel 1: Customer Info -->
        <section class="dispatch-panel customer-panel">
          <h3>Customer</h3>
          <div class="customer-avatar-row">
            @if (jobData.customerAvatarUrl) {
              <img [src]="jobData.customerAvatarUrl" alt="" class="avatar" />
            } @else {
              <div class="avatar-fallback">{{ initials(jobData.customerName) }}</div>
            }
            <div>
              <strong>{{ jobData.customerName }}</strong>
            </div>
          </div>
          <div class="info-rows">
            <div class="info-row">📞 <a [href]="'tel:' + jobData.customerPhone">{{ jobData.customerPhone }}</a></div>
            <div class="info-row">📍 {{ jobData.address }}</div>
            @if (jobData.propertyType) {
              <div class="info-row">🏠 {{ jobData.propertyType }}</div>
            }
            @if (jobData.contactName && jobData.contactName !== jobData.customerName) {
              <div class="info-row">👤 Contact: {{ jobData.contactName }} · {{ jobData.contactNumber }}</div>
            }
          </div>
        </section>

        <!-- Panel 2: Job Details -->
        <section class="dispatch-panel details-panel">
          <h3>Job Details</h3>
          <div class="info-rows">
            <div class="info-row"><span class="label">Service</span> <span>{{ jobData.quoteRequest.category.name }}</span></div>
            <div class="info-row"><span class="label">Date</span> <span>{{ jobData.scheduledDate | date: 'fullDate' }}</span></div>
            <div class="info-row"><span class="label">Time</span> <span>{{ jobData.timeSlot }}</span></div>
            <div class="info-row"><span class="label">Price</span> <span>RM {{ jobData.price | number: '1.2-2' }}</span></div>
            <div class="info-row"><span class="label">Payment</span> <span>{{ jobData.paymentMode }}</span></div>
            <div class="info-row"><span class="label">Status</span> <span class="status-badge">{{ jobData.status }}</span></div>
          </div>
          @if (jobData.lineItems && jobData.lineItems.length > 0) {
            <details>
              <summary>Line items ({{ jobData.lineItems.length }})</summary>
              @for (li of jobData.lineItems; track $index) {
                <div class="line-item">
                  <span>{{ li.label }}</span>
                  <span>RM {{ li.amount | number: '1.2-2' }}</span>
                </div>
              }
            </details>
          }
        </section>

        <!-- Panel 3: Instructions -->
        <section class="dispatch-panel instructions-panel">
          <h3>Instructions</h3>
          @if (jobData.instructions) {
            <div class="instructions-text">{{ jobData.instructions }}</div>
          } @else {
            <p class="muted">No special instructions.</p>
          }
        </section>

        <!-- Panel 4: Map -->
        <section class="dispatch-panel map-panel">
          @if (jobData.lat != null && jobData.lng != null) {
            <app-map-view [lat]="jobData.lat" [lng]="jobData.lng" class="mini-map" />
            <div class="map-actions">
              <button class="btn-ghost" (click)="openNav()">📍 Navigate</button>
              <button class="btn-ghost" (click)="showQr.set(true)">📱 QR</button>
            </div>
          } @else {
            <p class="muted">No location available for this booking.</p>
          }
        </section>
      </div>

      <!-- Actions row (bottom, centered) - only when not readOnly -->
      @if (!readOnly) {
        <div class="dispatch-actions">
          @if (isArriveable()) {
            <button class="btn-primary" (click)="markArrived()">📸 Mark Arrived</button>
          }
          @if (isDoable()) {
            <button class="btn-primary" (click)="markDone()">✅ Mark Done</button>
          }
          @if (isCancellable()) {
            <button class="btn-ghost" (click)="openCancelModal()">🚫 Cancel</button>
          }
        </div>
      }
    </div>
  </div>
}

<!-- QR sub-overlay -->
@if (showQr()) {
  <div class="dispatch-backdrop" (click)="showQr.set(false)">
    <div class="dispatch-qr" (click)="$event.stopPropagation()">
      <h3>📱 Navigate from your phone</h3>
      <div class="qr-code">
        <img [src]="qrDataUrl()" alt="QR code for navigation" />
      </div>
      <p class="muted">Opens Waze or Google Maps</p>
      <p class="muted small">Destination: {{ jobData.address }}</p>
      <button class="btn-ghost" (click)="showQr.set(false)">← Back to job</button>
    </div>
  </div>
}

<!-- Cancel modal (combined reason + PIN) -->
@if (showCancelModal()) {
  <div class="dispatch-backdrop" (click)="cancelModalClose()">
    <div class="dispatch-cancel" (click)="$event.stopPropagation()">
      <h3>🚫 Cancel this booking?</h3>
      <form (ngSubmit)="submitCancel()">
        <label>
          Why are you cancelling? *
          <textarea [(ngModel)]="cancelReason" name="reason" rows="3" required></textarea>
        </label>
        <label>
          Enter your PIN
          <input type="password" maxlength="6" [(ngModel)]="cancelPin" name="pin" placeholder="••••••" />
        </label>
        <p class="muted small">Default PIN is 123456. Change it in Account Settings.</p>
        @if (cancelError()) {
          <p class="err">{{ cancelError() }}</p>
        }
        <div class="cancel-actions">
          <button type="submit" class="btn-primary" [disabled]="cancelling()">
            {{ cancelling() ? 'Cancelling…' : 'Cancel booking' }}
          </button>
          <button type="button" class="btn-ghost" (click)="cancelModalClose()">Go back</button>
        </div>
      </form>
    </div>
  </div>
}
```

### Status-based button visibility

```typescript
isArriveable(): boolean {
  return ['confirmed'].includes(this.jobData.status);
}
isDoable(): boolean {
  return ['in_progress'].includes(this.jobData.status);
}
isCancellable(): boolean {
  return ['pending_confirm', 'confirmed'].includes(this.jobData.status);
}
```

### Mark Arrived

Calls existing `POST /servicer/jobs/:id/arrive` flow:
- Opens photo upload modal (existing `openPhotoModal()`)
- Photo is **optional** for MVP (validate without photo, or with empty body)
- On success: reload overlay data, update status

### QR Code generation

```typescript
// Backend generates navigation URL:
// https://www.google.com/maps/dir/?api=1&destination={lat},{lng}
// OR waze://?ll={lat},{lng}&navigate=yes

// Frontend generates QR code using qrcode.js library
// npm install qrcode (or use a qrcode-generator component)
```

Navigation URLs:
- Google Maps: `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`
- Waze: `https://waze.com/ul?ll={lat},{lng}&navigate=yes`

Both URLs are encoded in the QR code. The phone OS picks the user's default navigation app.

### Cancel flow (combined modal)

Single modal with reason + PIN in one panel:
1. User fills reason (required)
2. User enters PIN (6 digits)
3. Submit → validate PIN via `POST /servicer/account/verify-pin`
4. If valid → `POST /servicer/jobs/:id/cancel` with reason
5. If PIN wrong → show "Incorrect PIN" inline error
6. On success: close overlay, reload jobs board, show toast

## Mobile accordion

Each panel is independently collapsible:

```html
<div class="dispatch-panel">
  <button class="panel-header" (click)="togglePanel('customer')">
    Customer {{ expandedPanels().customer ? '▲' : '▼' }}
  </button>
  @if (expandedPanels().customer) {
    <div class="panel-body">...</div>
  }
</div>
```

All panels default to **expanded** when the overlay opens. User can collapse/uncollapse independently.

## Files changed

| File | Change |
|------|--------|
| `frontend/src/app/shared/dispatch-overlay.component.ts` | **New** - shared overlay component |
| `frontend/src/app/servicer/pages/jobs.component.ts` | Replace inline `toggleJobDetail()` with `openOverlay(jobId)`; wire card click to overlay |
| `frontend/src/app/servicer/servicer-shell.component.ts` | Wire prompt guard "View" button to open overlay |
| `backend/src/routes/servicer.routes.ts` | Ensure `GET /servicer/jobs/:id` returns all fields needed (address, instructions, contactName, contactNumber, lineItems, lat, lng, customerName, customerPhone, customerAvatarUrl, propertyType) |
| `package.json` (frontend) | Add `qrcode` dependency |
| `docs/ai-context/schema-notes.md` | No schema changes needed |
| `docs/api-reference/api-doc.md` | Document new overlay endpoints if any |

## DoD

| Gate | Expected |
|------|----------|
| `npx tsc --noEmit` backend | 0 errors |
| `ng build` frontend | Exit 0 |
| Confirm job → dispatch overlay auto-pops | ✅ |
| 4 panels render in 2×2 grid on desktop, stack on mobile | ✅ |
| Customer info shows avatar, name, phone (tel: link), address, property type | ✅ |
| Job details shows all booking fields | ✅ |
| Instructions panel scrolls if text overflows | ✅ |
| Map renders with Navigate + QR buttons | ✅ |
| QR sub-overlay shows scannable code → opens navigation app | ✅ |
| Cancel modal has reason + PIN in one panel | ✅ |
| Correct PIN submits cancel, wrong PIN shows error | ✅ |
| Mark Arrived opens photo upload (optional photo for MVP) | ✅ |
| Close (× / Esc / backdrop click) returns to jobs board | ✅ |
