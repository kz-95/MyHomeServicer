import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ChatWidgetService } from '../../core/services/chat-widget.service';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { StripePaymentService } from '../../core/services/stripe-payment.service';
import { ModalComponent } from '../../shared/modal.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { ServicerDetailPopupComponent } from '../../shared/servicer-detail-popup.component';

interface Booking {
  id: string;
  orderId?: string;
  status: string;
  price: number;
  paymentMode: string;
  scheduledDate: string;
  timeSlot: string;
  tipStatus?: string;
  servicer: { id: string; businessName: string; logoUrl?: string; rating: number };
  quoteRequest: { category: { name: string; icon?: string } };
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  lineItems: { label: string; amount: number }[] | null;
  subtotal: number;
  promoDiscount: number;
  serviceChargeRate: number | null;
  serviceChargeAmount: number | null;
  sstApplies: boolean;
  taxInclusive: boolean;
  taxRate: number | null;
  taxAmount: number | null;
  tipAmount: number | null;
  total: number;
  platformFee: number;
  pdfUrl: string | null;
  issuedAt: string;
  paidAt: string | null;
}

const SKELETON_COUNT = 5;
const STAGGER_MS = 70;

/** Customer booking list with live status updates over Socket.io. */
@Component({
    selector: 'app-my-bookings',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ModalComponent, RouterLink, ListToolbarComponent, ServicerDetailPopupComponent],
    template: `
    <h1>My bookings</h1>
    @if (loading()) {
      <div class="skeleton-list">
        @for (s of skeletonSlots; track s) {
          <div class="card booking skel-card">
            <span class="bw-scan"></span>
            <span class="bw-sweep"></span>
          </div>
        }
      </div>
    } @else if (loadFailed()) {
      <p class="err">Could not load bookings. Please refresh the page.</p>
    } @else if (bookings().length === 0) {
      <div class="card empty-card">
        <p>No bookings yet.</p>
        <a routerLink="/customer" class="btn-primary">Find a service →</a>
      </div>
    } @else {
      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'pending'" (click)="tab.set('pending')">
          Pending <span class="n">{{ pendingCount() }}</span>
        </button>
        <button class="tab" [class.active]="tab() === 'in_progress'" (click)="tab.set('in_progress')">
          In progress <span class="n">{{ progressCount() }}</span>
        </button>
        <button class="tab" [class.active]="tab() === 'history'" (click)="tab.set('history')">
          History <span class="n">{{ historyCount() }}</span>
        </button>
      </div>
      <app-list-toolbar>
        <input
          class="search"
          type="text"
          placeholder="Search by servicer or category…"
          [(ngModel)]="search"
          name="bs"
          toolbar-search
        />
        <select [(ngModel)]="sortBy" name="mbsort" toolbar-sort>
          <option value="date">Most recent</option>
          <option value="price">Highest price</option>
        </select>
      </app-list-toolbar>
      @if (filteredBookings().length === 0) {
        <div class="card empty-card">
          <p>No {{ tab() === 'in_progress' ? 'in-progress' : tab() }} bookings.</p>
        </div>
      }
      @for (b of filteredBookings(); track b.id; let idx = $index) {
        @if (idx < revealCount()) {
        <div class="card booking bk-revealed">
          <div>
            <span class="servicer-head">
              <span class="svc-avatar">
                @if (b.servicer.logoUrl) {
                  <img [src]="b.servicer.logoUrl" [alt]="b.servicer.businessName" class="svc-logo" />
                } @else {
                  <span class="svc-initials">{{ initials(b.servicer.businessName) }}</span>
                }
              </span>
              <button type="button" class="svc-name-btn" (click)="detailServicerId.set(b.servicer.id)">{{ b.servicer.businessName }}</button>
            </span>
            <span class="muted">· {{ b.quoteRequest.category.name }}</span>
            <div class="muted">
              RM {{ b.price | number: '1.2-2' }} · {{ b.paymentMode }} ·
              {{ b.scheduledDate | date: 'mediumDate' }} {{ b.timeSlot }}
            </div>
            @if (b.orderId) {
              <div class="order-id">{{ b.orderId }}</div>
            }
          </div>
          <div class="right">
            <span class="status" [class]="b.status">{{ statusLabel(b.status) }}</span>
            @if (b.status === 'completed' && b.paymentMode === 'pay_later' && b.tipStatus !== 'paid') {
              <button class="btn-ghost" (click)="addTip(b)">Add tip</button>
            }
            @if (['pending_confirm', 'confirmed'].includes(b.status)) {
              <button class="btn-ghost" (click)="cancel(b)">Cancel</button>
            }
            @if (b.status === 'completed') {
              <button class="btn-ghost" (click)="reorder(b)">Reorder</button>
              <button class="btn-ghost" (click)="viewInvoice(b)">Invoice</button>
            }
            <button class="btn-ghost" (click)="reportIssue(b)" [disabled]="reporting()">
              {{ reporting() === b.id ? '…' : 'Report issue' }}
            </button>
          </div>
        </div>
        }
      }
    }

    <!-- ── Invoice modal ──────────────────────────────────────────────── -->
    <app-modal
      [open]="invoiceModalOpen()"
      title="Invoice"
      (closed)="invoiceModalOpen.set(false)"
    >
      @if (invoiceLoading()) {
        <p class="muted">Loading invoice…</p>
      } @else if (invoiceError()) {
        <p class="err">{{ invoiceError() }}</p>
      } @else {
        @if (invoiceData(); as inv) {
          <div class="receipt">
            <!-- Header -->
            <div class="receipt-hd">
              <span class="receipt-num">{{ inv.invoiceNumber }}</span>
              <div class="receipt-meta">
                <span class="muted small">{{ inv.issuedAt | date: 'mediumDate' }}</span>
                @if (inv.paidAt) {
                  <span class="badge badge-paid">Paid</span>
                } @else {
                  <span class="badge badge-pending">Unpaid</span>
                }
              </div>
            </div>

            <!-- Line items table -->
            @if (inv.lineItems && inv.lineItems.length > 0) {
              <table class="li-table">
                <tbody>
                  @for (li of inv.lineItems; track $index) {
                    <tr>
                      <td class="li-label">{{ li.label }}</td>
                      <td class="li-amt">RM {{ li.amount | number: '1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              <hr class="rule" />
            }

            <!-- Breakdown rows -->
            <div class="receipt-rows">
              <div class="rr">
                <span>Subtotal</span>
                <span>RM {{ inv.subtotal | number: '1.2-2' }}</span>
              </div>
              @if (inv.promoDiscount > 0) {
                <div class="rr rr-promo">
                  <span>Promo discount</span>
                  <span>− RM {{ inv.promoDiscount | number: '1.2-2' }}</span>
                </div>
              }
              @if (inv.serviceChargeAmount && inv.serviceChargeAmount > 0) {
                <div class="rr">
                  <span>Service charge ({{ inv.serviceChargeRate }}%)</span>
                  <span>RM {{ inv.serviceChargeAmount | number: '1.2-2' }}</span>
                </div>
              }
              @if (inv.sstApplies && inv.taxAmount && inv.taxAmount > 0) {
                <div class="rr">
                  <span>SST ({{ (inv.taxRate ?? 0) * 100 | number: '1.0-0' }}%)</span>
                  <span>RM {{ inv.taxAmount | number: '1.2-2' }}</span>
                </div>
              }
              @if (inv.tipAmount && inv.tipAmount > 0) {
                <div class="rr">
                  <span>Tip</span>
                  <span>RM {{ inv.tipAmount | number: '1.2-2' }}</span>
                </div>
              }
            </div>

            <hr class="rule rule-bold" />

            <!-- Total -->
            <div class="receipt-total">
              <strong>Total</strong>
              <strong class="total-amt">RM {{ inv.total | number: '1.2-2' }}</strong>
            </div>

            <!-- Tax mode badge -->
            <div class="tax-mode-row">
              <span class="tax-badge" [class.inclusive]="inv.taxInclusive">
                {{ inv.taxInclusive ? 'Tax inclusive' : 'Tax exclusive' }}
              </span>
            </div>

            <!-- Platform fee (muted) -->
            <div class="platform-row">
              <span class="muted small">Platform fee (paid by servicer)</span>
              <span class="muted small">RM {{ inv.platformFee | number: '1.2-2' }}</span>
            </div>

            <!-- PDF action -->
            @if (inv.pdfUrl) {
              <div class="receipt-actions">
                <a class="btn-primary" [href]="inv.pdfUrl" target="_blank" rel="noopener noreferrer">
                  ⬇ Download PDF
                </a>
              </div>
            }

            <!-- Pay by card - unpaid invoice on a completed pay_later/cash booking -->
            @if (!inv.paidAt && payBooking()?.status === 'completed' && payBooking()?.paymentMode !== 'pay_now') {
              <div class="receipt-actions pay-actions">
                <button class="btn-primary" (click)="payByCard()" [disabled]="paying()">
                  {{ paying() ? 'Opening Stripe…' : '💳 Pay by card' }}
                </button>
                <p class="muted small">Secure Stripe Checkout - pays this invoice in full.</p>
              </div>
            }
          </div>
        }
      }
    </app-modal>

    <!-- ── Servicer detail popup ──────────────────────────────────────── -->
    <app-servicer-detail-popup [servicerId]="detailServicerId()" (closed)="detailServicerId.set(null)" />
  `,
    styles: [
        `
      :host {
        display: block;
      }
      .booking {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.8rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .booking:hover {
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
      }
      .order-id {
        font-size: 0.72rem;
        font-family: monospace;
        color: var(--color-muted);
        margin-top: 0.15rem;
        letter-spacing: 0.03em;
      }
      .servicer-head {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .svc-name-btn {
        background: transparent;
        border: none;
        padding: 0;
        font: inherit;
        font-weight: 700;
        color: var(--color-text);
        cursor: pointer;
        text-align: left;
        transition: color var(--transition);
      }
      .svc-name-btn:hover {
        color: var(--color-primary);
        text-decoration: underline;
      }
      .svc-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 999px;
        background: var(--color-primary);
        flex-shrink: 0;
        overflow: hidden;
      }
      .svc-logo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .svc-initials {
        color: #fff;
        font-size: 0.78rem;
        font-weight: 600;
      }
      .right {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .status {
        font-size: 0.78rem;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        background: var(--color-bg);
        white-space: nowrap;
      }
      .status.completed {
        background: var(--color-status-completed-bg);
        color: var(--color-status-completed-text);
      }
      .status.in_progress {
        background: var(--color-status-progress-bg);
        color: var(--color-status-progress-text);
      }
      .status.confirmed {
        background: var(--color-status-accepted-bg);
        color: var(--color-status-accepted-text);
      }
      .status.pending_confirm {
        background: var(--color-status-open-bg);
        color: var(--color-status-open-text);
      }
      .status.cancelled {
        background: var(--color-status-cancelled-bg);
        color: var(--color-status-cancelled-text);
      }
      .err {
        color: var(--color-danger);
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--color-border);
        margin-bottom: 1rem;
      }
      .search {
        min-width: 180px;
        max-width: 260px;
        border-radius: 999px;
        padding: 0.45rem 0.85rem;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: 0.88rem;
        outline: none;
        transition: border-color var(--transition);
      }
      .search:focus { border-color: var(--color-primary); }
      .tabs {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .tab {
        background: transparent;
        border: none;
        border-radius: 999px;
        padding: 0.6rem 1.2rem;
        color: var(--color-muted);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .tab:hover:not(.active) {
        color: var(--color-text);
        background: var(--color-bg);
      }
      .tab.active {
        background: var(--color-primary);
        background: var(--gradient-sidebar);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 1px 6px rgba(201, 90, 60, 0.2);
      }
      .tab .n {
        border-radius: 999px;
        padding: 0.05rem 0.5rem;
        font-size: 0.78rem;
        background: var(--color-bg);
        color: var(--color-muted);
      }
      .tab.active .n {
        background: rgba(255, 255, 255, 0.25);
        color: #fff;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .chip {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
        font-size: 0.82rem;
        cursor: pointer;
        color: var(--color-muted);
        transition: background var(--transition), color var(--transition), border-color var(--transition);
      }
      .chip.on {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
      }
      /* Mobile - stack info and actions vertically */
      @media (max-width: 600px) {
        .booking {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.8rem;
        }
        .right {
          justify-content: flex-start;
          width: 100%;
        }
      }
      /* ── Receipt modal ───────────────────────────────────────────────── */
      .receipt { display: flex; flex-direction: column; gap: 0.6rem; }
      .receipt-hd { display: flex; justify-content: space-between; align-items: flex-start; }
      .receipt-num { font-size: 1rem; font-weight: 700; color: var(--color-text); }
      .receipt-meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
      .li-table { width: 100%; border-collapse: collapse; }
      .li-table td { padding: 0.3rem 0; font-size: 0.88rem; }
      .li-label { color: var(--color-text); }
      .li-amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .rule { border: none; border-top: 1px solid var(--color-border); margin: 0.1rem 0; }
      .rule-bold { border-top-width: 2px; border-top-color: var(--color-text); }
      .receipt-rows { display: flex; flex-direction: column; gap: 0.25rem; }
      .rr { display: flex; justify-content: space-between; align-items: center; font-size: 0.88rem; }
      .rr-promo span:last-child { color: var(--color-success); font-weight: 600; }
      .receipt-total { display: flex; justify-content: space-between; align-items: center; }
      .receipt-total strong { font-size: 1rem; }
      .total-amt { font-size: 1.25rem; color: var(--color-primary); }
      .tax-mode-row { display: flex; }
      .tax-badge {
        font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
        padding: 0.15rem 0.55rem; border-radius: 999px;
        background: var(--color-status-open-bg); color: var(--color-status-open-text);
      }
      .tax-badge.inclusive {
        background: var(--color-status-accepted-bg); color: var(--color-status-accepted-text);
      }
      .platform-row { display: flex; justify-content: space-between; align-items: center; padding-top: 0.2rem; border-top: 1px dashed var(--color-border); }
      .receipt-actions { display: flex; gap: 0.5rem; margin-top: 0.4rem; flex-wrap: wrap; }
      .empty-card {
        text-align: center;
        padding: 3rem 1.5rem;
        color: var(--color-muted);
      }
      .empty-card p {
        margin-bottom: 1.25rem;
        font-size: 1.05rem;
      }

      /* ── Skeleton + stagger reveal ── */
      .skeleton-list { display: flex; flex-direction: column; gap: 0.8rem; }
      .skel-card {
        position: relative;
        overflow: hidden;
        min-height: 72px;
        cursor: default;
        animation: border-glow 1.2s cubic-bezier(0.85, 0, 0.15, 1) infinite;
      }
      .skel-card:hover { transform: none; box-shadow: var(--shadow); }
      @keyframes border-glow {
        0%, 100% { border-color: var(--color-border); box-shadow: var(--shadow); }
        50%       { border-color: rgba(240,160,30,0.35); box-shadow: 0 0 0 1.5px rgba(240,160,30,0.12), var(--shadow-md); }
      }
      @keyframes bk-scan1 {
        0%   { transform: skewX(-24deg) translateX(-98%); }
        100% { transform: skewX(-24deg) translateX(245%); }
      }
      @keyframes bk-scan2 {
        0%   { transform: skewX(-24deg) translateX(-53%); }
        100% { transform: skewX(-24deg) translateX(107%); }
      }
      @keyframes bk-sweep1 {
        0%   { transform: skewX(-24deg) translateX(-103%); }
        100% { transform: skewX(-24deg) translateX(295%); }
      }
      @keyframes bk-sweep2 {
        0%   { transform: skewX(-24deg) translateX(-53%); }
        100% { transform: skewX(-24deg) translateX(118%); }
      }
      .bw-scan, .bw-sweep {
        position: absolute; top: 0; height: 100%;
        z-index: 5; pointer-events: none; will-change: transform;
      }
      .bw-scan::before, .bw-sweep::before {
        content: ''; position: absolute; top: 0; height: 100%;
        pointer-events: none; will-change: transform;
      }
      .bw-scan {
        width: 41%;
        background: linear-gradient(to right, transparent 0%, rgba(180,140,255,0.06) 25%, rgba(240,160,30,0.12) 50%, rgba(180,140,255,0.06) 75%, transparent 100%);
        animation: bk-scan1 0.9s linear infinite;
      }
      .bw-scan::before {
        width: 94%;
        background: linear-gradient(to right, transparent 0%, rgba(140,210,255,0.08) 30%, rgba(240,160,30,0.14) 50%, rgba(140,210,255,0.08) 70%, transparent 100%);
        animation: bk-scan2 1.4s linear infinite;
      }
      .bw-sweep {
        width: 34%;
        background: linear-gradient(to right, transparent 0%, rgba(255,180,180,0.06) 25%, rgba(240,160,30,0.12) 50%, rgba(255,180,180,0.06) 75%, transparent 100%);
        animation: bk-sweep1 1.8s linear infinite;
      }
      .bw-sweep::before {
        width: 85%;
        background: linear-gradient(to right, transparent 0%, rgba(180,220,255,0.08) 30%, rgba(240,160,30,0.14) 50%, rgba(180,220,255,0.08) 70%, transparent 100%);
        animation: bk-sweep2 1.5s linear infinite;
      }
      .skel-card:nth-child(1) .bw-scan, .skel-card:nth-child(1) .bw-sweep { animation-delay: 0s; }
      .skel-card:nth-child(2) .bw-scan, .skel-card:nth-child(2) .bw-sweep { animation-delay: 0.15s; }
      .skel-card:nth-child(3) .bw-scan, .skel-card:nth-child(3) .bw-sweep { animation-delay: 0.3s; }
      .skel-card:nth-child(4) .bw-scan, .skel-card:nth-child(4) .bw-sweep { animation-delay: 0.45s; }
      .skel-card:nth-child(5) .bw-scan, .skel-card:nth-child(5) .bw-sweep { animation-delay: 0.6s; }
      @keyframes bk-reveal {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .bk-revealed {
        animation: bk-reveal 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      @media (prefers-reduced-motion: reduce) {
        .bw-scan, .bw-sweep, .bw-scan::before, .bw-sweep::before { animation: none; }
        .skel-card { animation: none; }
        .bk-revealed { animation: none; }
      }
    `,
    ]
})
export class MyBookingsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private socket = inject(SocketService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private widget = inject(ChatWidgetService);
  private stripePay = inject(StripePaymentService);

  readonly skeletonSlots = Array.from({ length: SKELETON_COUNT }, (_, i) => i);
  revealCount = signal(0);
  private staggerTimer: ReturnType<typeof setInterval> | null = null;

  bookings = signal<Booking[]>([]);
  /** Servicer id whose detail popup is open, or null. */
  detailServicerId = signal<string | null>(null);
  loading = signal(true);
  loadFailed = signal(false);
  /** Holds the booking id currently being opened as a support chat, or null. */
  reporting = signal<string | null>(null);

  search = signal('');
  /** Active booking tab. Pending = awaiting/confirmed, History = completed + cancelled. */
  tab = signal<'pending' | 'in_progress' | 'history'>('pending');
  sortBy = signal<'date' | 'price'>('date');

  /** Booking statuses grouped under each tab. */
  private readonly tabStatuses: Record<'pending' | 'in_progress' | 'history', string[]> = {
    pending: ['pending_confirm', 'confirmed'],
    in_progress: ['in_progress'],
    history: ['completed', 'cancelled'],
  };

  pendingCount = computed(
    () => this.bookings().filter((b) => this.tabStatuses.pending.includes(b.status)).length,
  );
  progressCount = computed(
    () => this.bookings().filter((b) => this.tabStatuses.in_progress.includes(b.status)).length,
  );
  historyCount = computed(
    () => this.bookings().filter((b) => this.tabStatuses.history.includes(b.status)).length,
  );

  filteredBookings = computed(() => {
    const statuses = this.tabStatuses[this.tab()];
    let list = this.bookings().filter((b) => statuses.includes(b.status));
    const q = this.search().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          b.servicer.businessName.toLowerCase().includes(q) ||
          b.quoteRequest.category.name.toLowerCase().includes(q),
      );
    }
    const sb = this.sortBy();
    list = [...list].sort((a, b) => {
      if (sb === 'price') return b.price - a.price;
      return b.scheduledDate.localeCompare(a.scheduledDate);
    });
    return list;
  });

  invoiceModalOpen = signal(false);
  invoiceData = signal<InvoiceDetail | null>(null);
  invoiceLoading = signal(false);
  invoiceError = signal('');
  /** Booking whose invoice is open (drives the "Pay by card" eligibility check). */
  payBooking = signal<Booking | null>(null);
  paying = signal(false);

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.load();
    for (const ev of ['booking.confirmed', 'booking.arrived', 'booking.done', 'booking.cancelled']) {
      this.subs.push(this.socket.on(ev).subscribe(() => this.load()));
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.clearStagger();
  }

  private load(): void {
    this.clearStagger();
    this.revealCount.set(0);
    this.api.get<{ data: Booking[] }>('/bookings').subscribe({
      next: (r) => {
        this.bookings.set(r.data);
        this.loading.set(false);
        this.staggerReveal(r.data.length);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  private staggerReveal(total: number): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.revealCount.set(total);
      return;
    }
    let i = 0;
    this.staggerTimer = setInterval(() => {
      i++;
      this.revealCount.set(i);
      if (i >= total) this.clearStagger();
    }, STAGGER_MS);
  }

  private clearStagger(): void {
    if (this.staggerTimer !== null) {
      clearInterval(this.staggerTimer);
      this.staggerTimer = null;
    }
  }

  /** Extract initials from a business name (max 2 chars). */
  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  statusLabel(s: string): string {
    return s.replace('_', ' ');
  }

  viewInvoice(b: Booking): void {
    this.invoiceData.set(null);
    this.invoiceError.set('');
    this.invoiceLoading.set(true);
    this.invoiceModalOpen.set(true);
    this.payBooking.set(b);
    this.api.get<InvoiceDetail>(`/bookings/${b.id}/invoice`).subscribe({
      next: (inv) => {
        this.invoiceData.set(inv);
        this.invoiceLoading.set(false);
      },
      error: (e) => {
        this.invoiceError.set(e.message ?? 'Invoice not available yet.');
        this.invoiceLoading.set(false);
      },
    });
  }

  /**
   * Pay an unpaid booking invoice by card via Stripe Checkout. The amount is
   * derived server-side from the invoice; the backend webhook runs the full
   * gateway settlement (servicer payout + platform fee) on completion.
   */
  payByCard(): void {
    const inv = this.invoiceData();
    if (!inv) return;
    this.paying.set(true);
    this.api
      .post<{ url: string; sessionId: string }>('/stripe/create-booking-payment-session', {
        bookingId: inv.bookingId,
      })
      .subscribe({
        next: ({ url, sessionId }) => {
          this.paying.set(false);
          this.stripePay.openPayment({
            url,
            sessionId,
            verifyEndpoint: '/stripe/verify-booking-payment',
            onSuccess: () => {
              this.toast.success('Payment received - invoice paid.');
              this.invoiceModalOpen.set(false);
              this.load();
            },
          });
        },
        error: (e) => {
          this.paying.set(false);
          this.toast.error(e.message ?? 'Could not start card payment');
        },
      });
  }

  addTip(b: Booking): void {
    this.dialog
      .prompt('How much would you like to tip? (RM)', {
        placeholder: 'e.g. 5',
        confirmLabel: 'Add tip',
      })
      .subscribe((v) => {
        if (v === null) return;
        const amount = Number(v);
        if (!amount || amount <= 0) {
          this.toast.error('Please enter a valid tip amount.');
          return;
        }
        this.api.post(`/bookings/${b.id}/tip`, { tipAmount: amount }).subscribe({
          next: () => {
            this.toast.success('Tip added - thank you!');
            this.load();
          },
          error: (e) => this.toast.error(e.message ?? 'Could not add tip'),
        });
      });
  }

  cancel(b: Booking): void {
    this.dialog
      .prompt('Reason for cancelling?', {
        placeholder: 'Enter a reason…',
        confirmLabel: 'Cancel booking',
      })
      .subscribe((reason) => {
        if (!reason) return;
        this.api.post(`/bookings/${b.id}/cancel`, { reason }).subscribe({
          next: () => {
            this.toast.success('Booking cancelled.');
            this.load();
          },
          error: (e) => this.toast.error(e.message ?? 'Could not cancel booking'),
        });
      });
  }

  reorder(b: Booking): void {
    this.api.post(`/bookings/${b.id}/reorder`, {}).subscribe({
      next: () => this.toast.info('Reorder shortcut saved - open the quote form to rebook.'),
      error: (e) => this.toast.error(e.message ?? 'Could not create reorder'),
    });
  }

  /** Opens a booking-support chat session and navigates to the chat page. */
  reportIssue(b: Booking): void {
    if (this.reporting()) return;
    this.reporting.set(b.id);
    this.api
      .post<{ sessionId: string }>('/chat/session', {
        contextType: 'booking_support',
        contextId: b.id,
      })
      .subscribe({
        next: () => {
          this.reporting.set(null);
          this.widget.openWithQuestion('I need help with this booking.');
        },
        error: (e) => {
          this.reporting.set(null);
          this.toast.error(e.message ?? 'Could not open support chat. Please try again.');
        },
      });
  }
}
