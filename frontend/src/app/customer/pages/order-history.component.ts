import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ServicerDetailPopupComponent } from '../../shared/servicer-detail-popup.component';

interface HistoryItem {
  type: string;
  bookingId: string;
  orderId?: string;
  servicerId: string;
  servicerName: string;
  categoryName: string;
  categoryIcon?: string;
  completedAt: string;
  totalPrice: number;
}

/** Order history with one-tap reorder. */
@Component({
    selector: 'app-order-history',
    host: { class: 'page-enter page-narrow' },
    imports: [CommonModule, FormsModule, IconComponent, ServicerDetailPopupComponent],
    template: `
    <h1>Order history</h1>
    <p class="muted">Rebook a past job in one tap.</p>

    @if (loading()) {
      <p class="muted">Loading your order history…</p>
    } @else if (loadFailed()) {
      <div class="card error">Could not load your order history. Please refresh the page.</div>
    } @else if (items().length === 0) {
      <div class="card">No completed orders yet - past jobs will appear here.</div>
    } @else {
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
        <div class="sort-group">
          <select [(ngModel)]="sortBy" name="ohsort">
            <option value="date">Date</option>
            <option value="price">Price</option>
          </select>
          <button class="btn-icon" (click)="reverseSort.set(!reverseSort())" [attr.aria-label]="reverseSort() ? 'Descending' : 'Ascending'">
            {{ reverseSort() ? '↓' : '↑' }}
          </button>
        </div>
      </div>
      @for (h of filteredItems(); track h.bookingId) {
      <div class="card row page-child">
        <div class="row-left">
          <span class="svc-avatar"><app-icon [name]="(h.categoryIcon || 'home')" sizeToken="md" stroke="#fff" strokeWidth="1.5" /></span>
          <div>
            <button type="button" class="svc-name-btn" (click)="detailServicerId.set(h.servicerId)">{{ h.servicerName }}</button>
            <span class="muted">· {{ h.categoryName }}</span>
            <div class="muted">
              Completed {{ h.completedAt | date: 'mediumDate' }} · RM
              {{ h.totalPrice | number: '1.2-2' }}
            </div>
            @if (h.orderId) {
              <div class="order-id">{{ h.orderId }}</div>
            }
          </div>
        </div>
        <button class="btn-primary" (click)="reorder(h)">Rebook same servicer</button>
      </div>
      }
    }
    @if (message()) {
      <p class="err">{{ message() }}</p>
    }

    <!-- ── Servicer detail popup ──────────────────────────────────────── -->
    <app-servicer-detail-popup [servicerId]="detailServicerId()" (closed)="detailServicerId.set(null)" />
  `,
    styles: [
        `
      :host {
        display: block;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.6rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .row:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09);
        transform: translateY(-1px);
      }
      .order-id {
        font-size: 0.72rem;
        font-family: monospace;
        color: var(--color-muted);
        margin-top: 0.15rem;
        letter-spacing: 0.03em;
      }
      .row-left {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        min-width: 0;
      }
      .svc-name-btn {
        display: block;
        background: transparent;
        border: none;
        padding: 0;
        font: inherit;
        font-weight: 700;
        color: var(--color-text);
        cursor: pointer;
        text-align: left;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
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
      }
      .row > div {
        min-width: 0;
      }
      .row strong {
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .row button {
        flex-shrink: 0;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        padding-bottom: 0.65rem;
        border-bottom: 1px solid var(--color-border);
        margin-bottom: 0.75rem;
      }
      .search {
        width: 220px;
        min-width: 140px;
        border-radius: 999px;
        padding: 0.4rem 0.75rem;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: 0.85rem;
        outline: none;
        transition: border-color var(--transition);
      }
      .search:focus { border-color: var(--color-primary); }
      .sort-group {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin-left: auto;
      }
      .sort-group select {
        border-radius: 6px;
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: 0.82rem;
        outline: none;
      }
      .sort-group select:focus { border-color: var(--color-primary); }
      .btn-icon {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        padding: 0.35rem 0.5rem;
        font-size: 0.82rem;
        cursor: pointer;
        color: var(--color-text);
        line-height: 1;
        transition: border-color var(--transition);
      }
      .btn-icon:hover { border-color: var(--color-primary); }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
      }
      .chip {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.25rem 0.65rem;
        font-size: 0.8rem;
        cursor: pointer;
        color: var(--color-muted);
        transition: background var(--transition), color var(--transition), border-color var(--transition);
      }
      .chip.on {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
      }
      .error, .err {
        color: var(--color-danger, #c0392b);
      }
      /* Tablet: stack button below info */
      @media (max-width: 640px) {
        .row {
          flex-direction: column;
          align-items: flex-start;
        }
        .row button {
          width: 100%;
        }
      }
    `,
    ]
})
export class OrderHistoryComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  items = signal<HistoryItem[]>([]);
  /** Servicer id whose detail popup is open, or null. */
  detailServicerId = signal<string | null>(null);
  loading = signal(true);
  loadFailed = signal(false);
  message = signal('');

  search = signal('');
  sortBy = signal<'date' | 'price'>('date');
  reverseSort = signal(false);
  statusFilter = signal<'all' | 'completed' | 'cancelled'>('all');
  filteredItems = computed(() => {
    let list = this.items();
    const q = this.search().toLowerCase();
    if (q) {
      list = list.filter(
        (h) =>
          h.servicerName.toLowerCase().includes(q) ||
          h.categoryName.toLowerCase().includes(q),
      );
    }
    const sf = this.statusFilter();
    if (sf !== 'all') {
      list = list.filter((h) => h.type === sf);
    }
    const sort = this.sortBy();
    const rev = this.reverseSort();
    list = [...list].sort((a, b) => {
      if (sort === 'price') {
        return rev ? a.totalPrice - b.totalPrice : b.totalPrice - a.totalPrice;
      }
      return rev
        ? b.completedAt.localeCompare(a.completedAt)
        : a.completedAt.localeCompare(b.completedAt);
    });
    return list;
  });

  ngOnInit(): void {
    this.api.get<{ data: HistoryItem[] }>('/user/me/history').subscribe({
      next: (r) => {
        this.items.set(r.data);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }

  reorder(h: HistoryItem): void {
    this.message.set('');
    this.api.post<{ prefill: Record<string, unknown> }>(`/bookings/${h.bookingId}/reorder`, {}).subscribe({
      next: (r) =>
        this.router.navigate(['/customer/quote/new'], {
          // rebookServicer locks the quote to this servicer (direct, no broadcast)
          // and hides the category pickers in the quote form.
          state: { prefill: r.prefill, rebookServicer: { id: h.servicerId, name: h.servicerName } },
        }),
      error: (e) => this.message.set(e.message),
    });
  }
}
