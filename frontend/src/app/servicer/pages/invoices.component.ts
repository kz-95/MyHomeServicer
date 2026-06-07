import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

interface Invoice {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  total: number;
  issuedAt: string;
  paidAt: string | null;
  pdfUrl: string | null;
}

/**
 * Servicer Invoices page - lists all invoices issued under this merchant's account.
 * Supports filtering by paid / unpaid status and links to the PDF download.
 */
@Component({
    selector: 'app-servicer-invoices',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ListToolbarComponent],
    template: `
    <h1>Invoices</h1>

    <!-- ── Filter tabs ───────────────────────────────────────────────── -->
    <div class="tabs page-child">
      <button class="tab" [class.active]="filter() === ''" (click)="setFilter('')">
        All
      </button>
      <button class="tab" [class.active]="filter() === 'paid'" (click)="setFilter('paid')">
        Paid
      </button>
      <button class="tab" [class.active]="filter() === 'unpaid'" (click)="setFilter('unpaid')">
        Unpaid
      </button>
    </div>

    <!-- ── Search + sort toolbar ─────────────────────────────────────── -->
    <app-list-toolbar>
      <input
        class="search"
        type="text"
        placeholder="Search by invoice number…"
        [(ngModel)]="searchQuery"
        name="invsearch"
        toolbar-search
      />
      <select [(ngModel)]="sortBy" name="invsort" toolbar-sort>
        <option value="date">Most recent</option>
        <option value="amount">Highest amount</option>
      </select>
    </app-list-toolbar>

    <!-- ── Summary row ────────────────────────────────────────────────── -->
    @if (!loading()) {
      <div class="summary page-child">
        <span class="muted">{{ filtered().length }} invoice{{ filtered().length !== 1 ? 's' : '' }}</span>
        <span class="sep">·</span>
        <span>Total: <strong>RM {{ grandTotal() | number: '1.2-2' }}</strong></span>
      </div>
    }

    <!-- ── Invoice list ───────────────────────────────────────────────── -->
    @if (loading()) {
      <p class="muted">Loading invoices…</p>
    } @else if (loadFailed()) {
      <p class="muted">Could not load invoices. Please refresh the page.</p>
    } @else if (filtered().length === 0) {
      <div class="empty card">
        <span class="empty-icon">🧾</span>
        <p>No {{ filter() ? filter() : '' }} invoices yet.</p>
        <p class="muted small">Invoices are generated automatically when a job is marked done.</p>
      </div>
    } @else {
      <!-- Desktop table header -->
      <div class="table-head hide-mobile">
        <span>Invoice</span>
        <span>Issued</span>
        <span>Status</span>
        <span class="right">Total</span>
        <span></span>
      </div>

      <div class="invoice-list page-child">
        @for (inv of filtered(); track inv.id) {
          <div class="card inv-row">
            <!-- Invoice number + booking ref -->
            <div class="inv-id">
              <strong>{{ inv.invoiceNumber }}</strong>
              <span class="muted small">Booking {{ inv.bookingId | slice: 0:8 }}…</span>
            </div>

            <!-- Issued date -->
            <div class="inv-date">
              {{ inv.issuedAt | date: 'mediumDate' }}
            </div>

            <!-- Paid / Unpaid badge -->
            <div class="inv-status">
              @if (inv.paidAt) {
                <span class="badge badge-paid">Paid</span>
                <span class="muted small paid-date">{{ inv.paidAt | date: 'mediumDate' }}</span>
              } @else {
                <span class="badge badge-pending">Unpaid</span>
              }
            </div>

            <!-- Total -->
            <div class="inv-total">
              RM {{ inv.total | number: '1.2-2' }}
            </div>

            <!-- PDF action -->
            <div class="inv-actions">
              @if (inv.pdfUrl) {
                <a
                  class="btn-pdf"
                  [href]="inv.pdfUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open PDF invoice"
                >
                  ⬇ PDF
                </a>
              } @else {
                <span class="muted small">Generating…</span>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
    styles: [
        `
      :host { display: block; }
      h1 {
        margin-bottom: 1.2rem;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        margin-bottom: 0.8rem;
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
      /* Tabs */
      .tabs {
        display: flex;
        gap: 0.4rem;
        margin-bottom: 0.8rem;
      }
      .tab {
        padding: 0.35rem 0.85rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background: transparent;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        color: var(--color-muted);
        transition: background var(--transition), color var(--transition), border-color var(--transition),
                    box-shadow var(--transition), transform 0.12s ease;
      }
      .tab:hover:not(.active) {
        background: var(--color-surface);
        border-color: var(--color-primary);
        color: var(--color-primary);
        transform: translateY(-1px);
      }
      .tab.active {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
        box-shadow: 0 2px 8px rgba(201, 90, 60, 0.25);
      }
      /* Summary */
      .summary {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        font-size: 0.85rem;
        margin-bottom: 1rem;
      }
      .sep {
        color: var(--color-border);
      }
      /* Table header (desktop hint) */
      .table-head {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 80px;
        gap: 0.8rem;
        padding: 0 1rem 0.4rem;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-muted);
      }
      .right {
        text-align: right;
      }
      @media (max-width: 700px) {
        .hide-mobile {
          display: none;
        }
      }
      /* Invoice rows */
      .invoice-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .inv-row {
        display: grid;
        grid-template-columns: 2fr 1fr 1fr 1fr 80px;
        gap: 0.8rem;
        align-items: center;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .inv-row:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09);
        transform: translateY(-1px);
      }
      @media (max-width: 700px) {
        .inv-row {
          grid-template-columns: 1fr 1fr;
          grid-template-rows: auto auto;
        }
        .inv-id {
          grid-column: 1 / -1;
        }
        .inv-actions {
          grid-column: 1 / -1;
        }
      }
      .inv-id {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .inv-date,
      .inv-status,
      .inv-total {
        font-size: 0.88rem;
      }
      .inv-total {
        font-weight: 700;
        color: var(--color-primary);
        text-align: right;
      }
      .inv-actions {
        display: flex;
        justify-content: flex-end;
      }
      /* .badge + .badge-{status} styles come from global styles.css */
      .paid-date {
        display: block;
        margin-top: 0.1rem;
      }
      /* PDF button */
      .btn-pdf {
        display: inline-block;
        padding: 0.3rem 0.65rem;
        border-radius: var(--radius);
        border: 1px solid var(--color-border);
        background: var(--color-bg);
        font-size: 0.78rem;
        font-weight: 600;
        text-decoration: none;
        color: var(--color-text);
        transition: background 0.25s ease, border-color 0.25s ease, transform 0.12s ease;
      }
      .btn-pdf:hover {
        background: var(--color-surface);
        border-color: var(--color-primary);
        transform: translateY(-1px);
      }
      /* Empty state */
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        padding: 2.5rem;
        text-align: center;
      }
      .empty-icon {
        font-size: 2.5rem;
      }
      .small {
        font-size: 0.8rem;
      }
    `,
    ]
})
export class ServicerInvoicesComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  loadFailed = signal(false);
  invoices = signal<Invoice[]>([]);
  filter = signal<'' | 'paid' | 'unpaid'>('');
  searchQuery = signal('');
  sortBy = signal<'date' | 'amount'>('date');

  filtered = computed(() => {
    const f = this.filter();
    const q = this.searchQuery().toLowerCase();
    const sb = this.sortBy();
    let all = this.invoices();
    if (!f) return all;
    if (f === 'paid') all = all.filter((i) => !!i.paidAt);
    if (f === 'unpaid') all = all.filter((i) => !i.paidAt);
    if (q) {
      all = all.filter((i) => i.invoiceNumber.toLowerCase().includes(q));
    }
    all = [...all].sort((a, b) => {
      if (sb === 'amount') return b.total - a.total;
      return b.issuedAt.localeCompare(a.issuedAt);
    });
    return all;
  });

  grandTotal = computed(() =>
    this.filtered().reduce((s, i) => s + Number(i.total), 0),
  );

  ngOnInit(): void {
    this.api.get<{ data: Invoice[] }>('/servicer/me/invoices').subscribe({
      next: (r) => {
        this.invoices.set(r.data ?? []);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });
  }

  setFilter(f: '' | 'paid' | 'unpaid'): void {
    this.filter.set(f);
  }
}
