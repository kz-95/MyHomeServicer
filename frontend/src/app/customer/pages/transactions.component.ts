import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ModalComponent } from '../../shared/modal.component';

interface Transaction {
  id: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  reference: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

interface TransactionsResponse {
  data: Transaction[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const TYPE_LABELS: Record<string, string> = {
  escrow_hold: 'Escrow hold',
  escrow_release: 'Escrow release',
  refund: 'Refund',
  tip: 'Tip',
  penalty: 'Penalty',
  deposit: 'Deposit',
  discount: 'Discount',
  platform_fee: 'Platform fee',
  promo_payback: 'Promo payback',
  withdrawal: 'Withdrawal',
  gateway_payment: 'Gateway payment',
  deposit_topup: 'Top-up',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  completed: 'Completed',
  failed: 'Failed',
};

@Component({
    selector: 'app-transactions',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ModalComponent],
    template: `
    <h1>Payment history</h1>
    <p class="muted">All your wallet transactions in one place.</p>

    <div class="toolbar">
      <input
        class="search"
        type="text"
        placeholder="Search reference…"
        [(ngModel)]="search"
        name="txs"
        (input)="onFilterChange()"
      />
      <select [(ngModel)]="typeFilter" name="txt" (change)="onFilterChange()">
        <option value="">All types</option>
        @for (t of typeOptions; track t.value) {
          <option [value]="t.value">{{ t.label }}</option>
        }
      </select>
      <select [(ngModel)]="statusFilter" name="txst" (change)="onFilterChange()">
        <option value="">All statuses</option>
        @for (s of statusOptions; track s.value) {
          <option [value]="s.value">{{ s.label }}</option>
        }
      </select>
      <select [(ngModel)]="sortField" name="txsf" (change)="loadPage(1)">
        <option value="createdAt">Date</option>
        <option value="amount">Amount</option>
      </select>
      <select [(ngModel)]="sortOrder" name="txso" (change)="loadPage(1)">
        <option value="desc">Newest first</option>
        <option value="asc">Oldest first</option>
      </select>
    </div>

    @if (loading()) {
      <p class="muted">Loading transactions…</p>
    } @else if (loadFailed()) {
      <div class="card error">Could not load transactions. Please refresh.</div>
    } @else if (items().length === 0) {
      <div class="card">No transactions found.</div>
    } @else {
      <div class="tx-list">
        @for (tx of items(); track tx.id) {
          <div class="card tx-row" (click)="selectTx(tx)">
            <div class="tx-left">
              <strong>{{ TYPE_LABELS[tx.type] }}</strong>
              <span class="muted small">{{ tx.createdAt | date: 'medium' }}</span>
              @if (tx.reference) {
                <span class="muted small">{{ tx.reference }}</span>
              }
            </div>
            <div class="tx-right">
              <span class="tx-amount" [class.tx-credit]="isCredit(tx.type)" [class.tx-debit]="isDebit(tx.type)">
                {{ isCredit(tx.type) ? '+' : '' }}RM {{ tx.amount | number: '1.2-2' }}
              </span>
              <span class="tx-status" [class.tx-pending]="tx.status === 'pending'" [class.tx-completed]="tx.status === 'completed'" [class.tx-failed]="tx.status === 'failed'">
                {{ STATUS_LABELS[tx.status] }}
              </span>
            </div>
          </div>
        }
      </div>

      <div class="pagination">
        <button class="btn-ghost small-btn" [disabled]="page() <= 1" (click)="loadPage(page() - 1)">← Prev</button>
        <span class="muted small">Page {{ page() }} of {{ totalPages() }}</span>
        <button class="btn-ghost small-btn" [disabled]="page() >= totalPages()" (click)="loadPage(page() + 1)">Next →</button>
      </div>
    }

    <app-modal [open]="!!selectedTx()" title="Transaction details" (closed)="selectedTx.set(null)">
      @if (selectedTx(); as tx) {
        <div class="tx-detail">
          <div class="td-row"><span>Type</span><strong>{{ TYPE_LABELS[tx.type] }}</strong></div>
          <div class="td-row"><span>Status</span><strong [class.tx-pending]="tx.status === 'pending'" [class.tx-completed]="tx.status === 'completed'" [class.tx-failed]="tx.status === 'failed'">{{ STATUS_LABELS[tx.status] }}</strong></div>
          <div class="td-row"><span>Amount</span><strong [class.tx-credit]="isCredit(tx.type)" [class.tx-debit]="isDebit(tx.type)">{{ isCredit(tx.type) ? '+' : '' }}RM {{ tx.amount | number: '1.2-2' }}</strong></div>
          <div class="td-row"><span>Currency</span><strong>{{ tx.currency }}</strong></div>
          @if (tx.reference) {
            <div class="td-row"><span>Reference</span><strong class="small">{{ tx.reference }}</strong></div>
          }
          <div class="td-row"><span>Date</span><strong>{{ tx.createdAt | date: 'medium' }}</strong></div>
          @if (tx.metadata; as meta) {
            <div class="td-row"><span>Metadata</span><pre class="td-pre">{{ meta | json }}</pre></div>
          }
        </div>
      }
    </app-modal>
  `,
    styles: [
        `
      :host { display: block; }
      .toolbar {
        display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem;
      }
      /* Override the global input/select width:100% (§7.4) so the controls sit in
         one row and wrap gracefully, instead of each stacking full-width. */
      .toolbar input.search { flex: 2 1 200px; min-width: 180px; width: auto; }
      .toolbar select { flex: 1 1 140px; min-width: 120px; width: auto; }
      .tx-list { display: flex; flex-direction: column; gap: 0.5rem; }
      .tx-row {
        display: flex; justify-content: space-between; align-items: center;
        gap: 1rem; cursor: pointer; transition: box-shadow var(--transition), transform var(--transition);
      }
      .tx-row:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.09); transform: translateY(-1px); }
      .tx-left { display: flex; flex-direction: column; gap: 0.15rem; }
      .tx-left .small { font-size: 0.78rem; }
      .tx-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.2rem; }
      .tx-amount { font-weight: 700; font-size: 1rem; }
      .tx-credit { color: var(--color-success, #16a34a); }
      .tx-debit { color: var(--color-danger, #b91c1c); }
      .tx-status { font-size: 0.75rem; font-weight: 600; padding: 0.1rem 0.4rem; border-radius: 999px; }
      .tx-pending { background: #fef3c7; color: #92400e; }
      .tx-completed { background: #dcfce7; color: #166534; }
      .tx-failed { background: #fee2e2; color: #991b1b; }
      .pagination {
        display: flex; align-items: center; justify-content: center; gap: 0.75rem;
        margin-top: 1rem;
      }
      .small-btn { font-size: 0.82rem; padding: 0.3rem 0.7rem; }
      .tx-detail { display: flex; flex-direction: column; gap: 0.6rem; }
      .td-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; }
      .td-row .small { font-size: 0.78rem; max-width: 260px; word-break: break-all; }
      .td-pre {
        background: var(--color-surface); padding: 0.4rem 0.6rem; border-radius: var(--radius);
        font-size: 0.75rem; max-height: 200px; overflow-y: auto; max-width: 260px;
        white-space: pre-wrap; word-break: break-all;
      }
    `,
    ]
})
export class TransactionsComponent implements OnInit {
  private api = inject(ApiService);

  protected readonly TYPE_LABELS = TYPE_LABELS;
  protected readonly STATUS_LABELS = STATUS_LABELS;

  items = signal<Transaction[]>([]);
  loading = signal(true);
  loadFailed = signal(false);
  page = signal(1);
  totalPages = signal(1);

  search = '';
  typeFilter = '';
  statusFilter = '';
  sortField = 'createdAt';
  sortOrder = 'desc';

  selectedTx = signal<Transaction | null>(null);

  typeOptions = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));
  statusOptions = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

  ngOnInit(): void {
    this.loadPage(1);
  }

  onFilterChange(): void {
    this.loadPage(1);
  }

  loadPage(p: number): void {
    this.page.set(p);
    this.loading.set(true);
    this.loadFailed.set(false);
    const params = new URLSearchParams();
    params.set('page', String(p));
    params.set('limit', '20');
    if (this.typeFilter) params.set('type', this.typeFilter);
    if (this.statusFilter) params.set('status', this.statusFilter);
    if (this.search.trim()) params.set('search', this.search.trim());
    if (this.sortField) params.set('sort', this.sortField);
    if (this.sortOrder) params.set('order', this.sortOrder);

    this.api.get<TransactionsResponse>(`/user/me/transactions?${params.toString()}`).subscribe({
      next: (r) => {
        this.items.set(r.data);
        this.totalPages.set(r.pagination.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  selectTx(tx: Transaction): void {
    this.selectedTx.set(tx);
  }

  isCredit(type: string): boolean {
    return ['deposit_topup', 'refund', 'promo_payback'].includes(type);
  }

  isDebit(type: string): boolean {
    return !this.isCredit(type);
  }
}
