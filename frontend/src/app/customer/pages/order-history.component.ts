import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { IconComponent } from '../../shared/icon.component';

interface HistoryItem {
  type: string;
  bookingId: string;
  orderId?: string;
  merchantId: string;
  merchantName: string;
  categoryName: string;
  categoryIcon?: string;
  completedAt: string;
  totalPrice: number;
}

/** Order history with one-tap reorder. */
@Component({
    selector: 'app-order-history',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ListToolbarComponent, IconComponent],
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
      <app-list-toolbar>
        <input
          class="search"
          type="text"
          placeholder="Search by merchant or category…"
          [(ngModel)]="search"
          name="ohs"
          toolbar-search
        />
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="statusFilter() === 'all'" (click)="statusFilter.set('all')">All</button>
          <button class="chip" [class.on]="statusFilter() === 'completed'" (click)="statusFilter.set('completed')">Completed</button>
          <button class="chip" [class.on]="statusFilter() === 'cancelled'" (click)="statusFilter.set('cancelled')">Cancelled</button>
        </div>
        <select [(ngModel)]="sortBy" name="ohsort" toolbar-sort>
          <option value="date">Most recent</option>
          <option value="price">Highest price</option>
        </select>
      </app-list-toolbar>
      @for (h of filteredItems(); track h.bookingId) {
      <div class="card row page-child">
        <div class="row-left">
          <span class="svc-avatar"><app-icon [name]="(h.categoryIcon || 'home')" sizeToken="md" stroke="#fff" strokeWidth="1.5" /></span>
          <div>
            <strong>{{ h.merchantName }}</strong>
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
        <button class="btn-primary" (click)="reorder(h)">Rebook same merchant</button>
      </div>
      }
    }
    @if (message()) {
      <p class="err">{{ message() }}</p>
    }
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
        margin-bottom: 0.8rem;
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
      select {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        color: var(--color-text);
        padding: 0.4rem 0.6rem;
        font-size: 0.88rem;
        outline: none;
        cursor: pointer;
      }
      select:focus { border-color: var(--color-primary); }
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
  loading = signal(true);
  loadFailed = signal(false);
  message = signal('');

  search = signal('');
  sortBy = signal<'date' | 'price'>('date');
  statusFilter = signal<'all' | 'completed' | 'cancelled'>('all');
  filteredItems = computed(() => {
    let list = this.items();
    const q = this.search().toLowerCase();
    if (q) {
      list = list.filter(
        (h) =>
          h.merchantName.toLowerCase().includes(q) ||
          h.categoryName.toLowerCase().includes(q),
      );
    }
    const sf = this.statusFilter();
    if (sf !== 'all') {
      list = list.filter((h) => h.type === sf);
    }
    const sort = this.sortBy();
    list = [...list].sort((a, b) => {
      if (sort === 'price') return b.totalPrice - a.totalPrice;
      return b.completedAt.localeCompare(a.completedAt);
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
      next: (r) => this.router.navigate(['/customer/quote/new'], { state: { prefill: r.prefill } }),
      error: (e) => this.message.set(e.message),
    });
  }
}
