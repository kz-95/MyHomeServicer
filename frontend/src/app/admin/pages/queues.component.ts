import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { PinService } from '../../core/services/pin.service';
import { ModalComponent } from '../../shared/modal.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

/**
 * Admin review queues - pending withdrawals, penalty appeals, category
 * requests, and servicer identity change requests. All review actions are
 * PIN-gated.
 */
@Component({
    selector: 'app-admin-queues',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ModalComponent, ListToolbarComponent],
    template: `
    <h1>Review queues</h1>

    <div class="tabs page-child">
      <button class="tab" [class.active]="activeTab() === 'withdrawals'" (click)="activeTab.set('withdrawals')">
        Withdrawals {{ withdrawals().length ? '(' + withdrawals().length + ')' : '' }}
      </button>
      <button class="tab" [class.active]="activeTab() === 'appeals'" (click)="activeTab.set('appeals')">
        Appeals {{ appeals().length ? '(' + appeals().length + ')' : '' }}
      </button>
      <button class="tab" [class.active]="activeTab() === 'category'" (click)="activeTab.set('category')">
        Categories {{ categoryRequests().length ? '(' + categoryRequests().length + ')' : '' }}
      </button>
      <button class="tab" [class.active]="activeTab() === 'account'" (click)="activeTab.set('account')">
        Account Changes {{ identityRequests().length ? '(' + identityRequests().length + ')' : '' }}
      </button>
    </div>

    @if (activeTab() === 'withdrawals') {
      <app-list-toolbar>
        <input
          class="q"
          [ngModel]="wQuery()"
          (ngModelChange)="wQuery.set($event)"
          name="wq"
          placeholder="Search by merchant or bank…"
          toolbar-search
        />
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="wFilter() === 'all'" (click)="wFilter.set('all')">All</button>
          <button class="chip" [class.on]="wFilter() === 'pending'" (click)="wFilter.set('pending')">Pending</button>
          <button class="chip" [class.on]="wFilter() === 'approved'" (click)="wFilter.set('approved')">Approved</button>
          <button class="chip" [class.on]="wFilter() === 'rejected'" (click)="wFilter.set('rejected')">Rejected</button>
        </div>
        <select [(ngModel)]="wSort" name="wSort" toolbar-sort>
          <option value="date">Most recent</option>
          <option value="amount">Highest amount</option>
        </select>
      </app-list-toolbar>
      <div class="section">
      @for (w of filteredWithdrawals(); track w.id) {
        <div class="card row">
          <div>
            <strong>{{ w.merchantName }}</strong> - RM {{ w.amount | number: '1.2-2' }}
            <div class="muted">{{ w.bankName }} · {{ w.bankAccount }}</div>
          </div>
          <div class="acts">
            <button class="btn-ghost" (click)="openLog(w)">View log</button>
            <button class="btn-primary" (click)="reviewWithdrawal(w.id, 'approved')">Approve</button>
            <button class="btn-ghost" (click)="reviewWithdrawal(w.id, 'rejected')">Reject</button>
          </div>
        </div>
      } @empty {
        <p class="muted">No pending withdrawals.</p>
      }
      </div>
    }

    @if (activeTab() === 'appeals') {
      <app-list-toolbar>
      <input
        class="q"
        [ngModel]="aQuery()"
        (ngModelChange)="aQuery.set($event)"
        name="aq"
        placeholder="Search by merchant, type or reason…"
        toolbar-search
      />
      </app-list-toolbar>
      <div class="section">
      @for (a of filteredAppeals(); track a.id) {
        <div class="card row">
          <div>
            <strong>{{ a.merchant.businessName }}</strong>
            <span class="muted">· {{ a.penaltyLog.type }} · RM {{ a.penaltyLog.amountDeducted }}</span>
            <p>{{ a.reason }}</p>
          </div>
          <div class="acts">
            <button class="btn-primary" (click)="reviewAppeal(a.id, 'approved')">Approve</button>
            <button class="btn-ghost" (click)="reviewAppeal(a.id, 'rejected')">Reject</button>
          </div>
        </div>
      } @empty {
        <p class="muted">No pending appeals.</p>
      }
      </div>
    }

    @if (activeTab() === 'category') {
      <app-list-toolbar>
      <input
        class="q"
        [ngModel]="cQuery()"
        (ngModelChange)="cQuery.set($event)"
        name="cq"
        placeholder="Search by category or merchant…"
        toolbar-search
      />
      </app-list-toolbar>
      <div class="section">
      @for (c of filteredCategoryRequests(); track c.id) {
        <div class="card row">
          <div>
            <strong>{{ c.name }}</strong>
            <span class="muted">· requested by {{ c.merchant.businessName }}</span>
            <p>{{ c.description }}</p>
          </div>
          <div class="acts">
            <button class="btn-primary" (click)="openApprove(c)">Approve</button>
            <button class="btn-ghost" (click)="reviewCategory(c.id, 'rejected')">Reject</button>
          </div>
        </div>
      } @empty {
        <p class="muted">No pending category requests.</p>
      }
      </div>
    }

    @if (activeTab() === 'account') {
      <app-list-toolbar>
      <input
        class="q"
        [ngModel]="iQuery()"
        (ngModelChange)="iQuery.set($event)"
        name="iq"
        placeholder="Search by servicer name…"
        toolbar-search
      />
      </app-list-toolbar>
      <div class="section">
      @for (r of filteredIdentityRequests(); track r.id) {
        <div class="card row">
          <div>
            <strong>{{ r.merchant?.businessName ?? 'Unknown servicer' }}</strong>
            <div class="muted id-props">
              @if (r.proposed?.entityType) {
                <span>{{ formatEntityType(r.proposed.entityType) }}</span>
              }
              @if (r.proposed?.businessRegistrationNumber) {
                <span>Reg: {{ r.proposed.businessRegistrationNumber }}</span>
              }
              @if (r.proposed?.taxNumber) {
                <span>Tax: {{ r.proposed.taxNumber }}</span>
              }
              @if (r.proposed?.sstNumber) {
                <span>SST: {{ r.proposed.sstNumber }}</span>
              }
              @if (!hasAnyProposed(r)) {
                <span class="muted">No changes proposed</span>
              }
            </div>
            <p class="muted small">
              Requested {{ r.createdAt | date: 'mediumDate' }}
            </p>
          </div>
          <div class="acts">
            <button class="btn-primary" (click)="reviewIdentity(r.id, 'approved')">Approve</button>
            <button class="btn-ghost" (click)="reviewIdentity(r.id, 'rejected')">Reject</button>
          </div>
        </div>
      } @empty {
        <p class="muted">No pending identity change requests.</p>
      }
      </div>
    }

    @if (message()) {
      <p [class.err]="isError()">{{ message() }}</p>
    }

    <!-- Category-request approval - every field required, PIN entered inline. -->
    <app-modal
      [open]="!!approveTarget()"
      title="Approve category request"
      (closed)="closeApprove()"
    >
      @if (approveTarget(); as t) {
        <p class="muted">
          Requested by <strong>{{ t.merchant.businessName }}</strong>.
          Approving creates a new platform category.
        </p>

        <label>
          Category name
          <input [(ngModel)]="form.name" name="name" placeholder="e.g. Gutter cleaning" />
        </label>

        <label>
          Default price suggestion (RM)
          <input type="number" min="0" [(ngModel)]="form.price" name="price" />
        </label>

        <label>
          Default duration (minutes)
          <input type="number" min="1" [(ngModel)]="form.duration" name="duration" />
        </label>

        <label>
          Admin note <span class="muted">(shown to the merchant)</span>
          <textarea
            rows="2"
            [(ngModel)]="form.adminNote"
            name="adminNote"
            placeholder="Reason / notes for this decision"
          ></textarea>
        </label>

        <p class="muted">You'll be asked for your action PIN on confirm.</p>

        @if (formError()) {
          <p class="err">{{ formError() }}</p>
        }

        <div class="modal-actions">
          <button class="btn-ghost" (click)="closeApprove()" [disabled]="approving()">
            Cancel
          </button>
          <button class="btn-primary" (click)="submitApprove()" [disabled]="approving()">
            {{ approving() ? 'Approving…' : 'Approve & create category' }}
          </button>
        </div>
      }
    </app-modal>

    <!-- Withdrawal log - the details on record for the request. -->
    <app-modal
      [open]="!!logTarget()"
      title="Withdrawal log"
      (closed)="logTarget.set(null)"
    >
      @if (logTarget(); as w) {
        <dl class="log">
          <dt>Merchant</dt>
          <dd>{{ w.merchantName }}</dd>
          <dt>Amount</dt>
          <dd>RM {{ w.amount | number: '1.2-2' }}</dd>
          <dt>Bank</dt>
          <dd>{{ w.bankName }}</dd>
          <dt>Account number</dt>
          <dd>{{ w.bankAccount }}</dd>
          <dt>Status</dt>
          <dd>{{ w.status || 'pending' }}</dd>
          @if (w.createdAt) {
            <dt>Requested</dt>
            <dd>{{ w.createdAt }}</dd>
          }
          @if (w.reviewedAt) {
            <dt>Reviewed</dt>
            <dd>{{ w.reviewedAt }}</dd>
          }
          @if (w.adminNote) {
            <dt>Admin note</dt>
            <dd>{{ w.adminNote }}</dd>
          }
        </dl>
      }
    </app-modal>
  `,
    styles: [
        `
      :host {
        display: flex;
        flex-direction: column;
        height: calc(100vh - 120px);
      }
      .tabs {
        display: flex;
        gap: 0;
        border-bottom: 2px solid var(--color-border);
        margin-bottom: 1rem;
        flex-shrink: 0;
      }
      .tab {
        background: none;
        border: none;
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--color-muted);
        cursor: pointer;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        transition: color var(--transition-fast), border-color var(--transition-fast);
      }
      .tab:hover {
        color: var(--color-text);
      }
      .tab.active {
        color: var(--color-primary);
        border-bottom-color: var(--color-primary);
      }
      .q {
        width: 100%;
        max-width: 360px;
        margin: 0.5rem 0;
        padding: 0.4rem 0.7rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        font-size: 0.85rem;
        transition: border-color var(--transition), box-shadow var(--transition);
      }
      .q:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px rgba(201, 90, 60, 0.1);
      }
      .section {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0.25rem 0.5rem 0.25rem 0.1rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-bg);
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.7rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .row:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
      }
      .acts {
        display: flex;
        gap: 0.5rem;
        flex-shrink: 0;
      }
      .err {
        color: var(--color-danger);
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.9rem;
        font-weight: 500;
        margin-bottom: 0.8rem;
      }
      label input,
      label textarea {
        font-weight: 400;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
      }
      .log {
        display: grid;
        grid-template-columns: 130px 1fr;
        gap: 0.35rem 1rem;
        margin: 0;
        font-size: 0.9rem;
      }
      .log dt {
        font-weight: 600;
        color: var(--color-muted);
      }
      .log dd {
        margin: 0;
      }
      .id-props {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem 0.8rem;
        margin-top: 0.15rem;
      }
      .id-props span {
        font-size: 0.82rem;
      }
      /* Mobile: stack acts below info */
      @media (max-width: 580px) {
        .row {
          flex-direction: column;
          align-items: flex-start;
        }
        .acts {
          flex-wrap: wrap;
        }
      }
    `,
    ]
})
export class AdminQueuesComponent implements OnInit {
  private api = inject(ApiService);
  private pin = inject(PinService);
  private route = inject(ActivatedRoute);

  withdrawals = signal<any[]>([]);
  appeals = signal<any[]>([]);
  categoryRequests = signal<any[]>([]);
  identityRequests = signal<any[]>([]);
  activeTab = signal<'withdrawals' | 'appeals' | 'category' | 'account'>('withdrawals');
  message = signal('');
  isError = signal(false);

  // Withdrawal log modal.
  logTarget = signal<any | null>(null);
  openLog(w: any): void {
    this.logTarget.set(w);
  }

  // Per-queue search.
  wQuery = signal('');
  wFilter = signal<'all' | 'pending' | 'approved' | 'rejected'>('all');
  wSort = signal<'date' | 'amount'>('date');
  aQuery = signal('');
  aFilter = signal<'all' | 'pending' | 'approved' | 'rejected'>('all');
  aSort = signal<'date' | 'amount'>('date');
  cQuery = signal('');
  cFilter = signal<'all' | 'pending' | 'approved' | 'rejected'>('all');
  cSort = signal<'date' | 'name'>('date');
  iQuery = signal('');
  iFilter = signal<'all' | 'pending' | 'approved' | 'rejected'>('all');
  iSort = signal<'date' | 'name'>('date');

  private match(haystack: unknown[], q: string): boolean {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return haystack.some((h) => String(h ?? '').toLowerCase().includes(needle));
  }

  filteredWithdrawals = computed(() => {
    let list = this.withdrawals().filter((w) =>
      this.match([w.merchantName, w.bankName, w.bankAccount], this.wQuery()),
    );
    const f = this.wFilter();
    if (f !== 'all') list = list.filter((w) => (w.status || 'pending') === f);
    const s = this.wSort();
    if (s === 'amount') list = [...list].sort((a, b) => b.amount - a.amount);
    else list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  });
  filteredAppeals = computed(() => {
    let list = this.appeals().filter((a) =>
      this.match(
        [a.merchant?.businessName, a.penaltyLog?.type, a.reason],
        this.aQuery(),
      ),
    );
    const f = this.aFilter();
    if (f !== 'all') list = list.filter((a) => (a.status || 'pending') === f);
    const s = this.aSort();
    if (s === 'amount') list = [...list].sort((a, b) => b.penaltyLog?.amountDeducted - a.penaltyLog?.amountDeducted);
    else list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  });
  filteredCategoryRequests = computed(() => {
    let list = this.categoryRequests().filter((c) =>
      this.match([c.name, c.merchant?.businessName, c.description], this.cQuery()),
    );
    const f = this.cFilter();
    if (f !== 'all') list = list.filter((c) => (c.status || 'pending') === f);
    const s = this.cSort();
    if (s === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    else list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  });
  filteredIdentityRequests = computed(() => {
    let list = this.identityRequests().filter((r) =>
      this.match(
        [
          r.merchant?.businessName,
          r.proposed?.entityType,
          r.proposed?.businessRegistrationNumber,
          r.proposed?.taxNumber,
          r.proposed?.sstNumber,
        ],
        this.iQuery(),
      ),
    );
    const f = this.iFilter();
    if (f !== 'all') list = list.filter((r) => (r.status || 'pending') === f);
    const s = this.iSort();
    if (s === 'name') list = [...list].sort((a, b) => (a.merchant?.businessName ?? '').localeCompare(b.merchant?.businessName ?? ''));
    else list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  });

  // ── Category-request approval modal ────────────────────────────────────────
  approveTarget = signal<any | null>(null);
  approving = signal(false);
  formError = signal('');
  form = { name: '', price: null as number | null, duration: null as number | null, adminNote: '' };

  ngOnInit(): void {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    if (tab === 'appeals' || tab === 'category' || tab === 'account') this.activeTab.set(tab as any);
    this.load();
  }

  private load(): void {
    this.api
      .get<{ data: any[] }>('/admin/withdrawals', { status: 'pending' })
      .subscribe({ next: (r) => this.withdrawals.set(r.data), error: (e) => this.fail(e) });
    this.api
      .get<{ data: any[] }>('/admin/appeals', { status: 'pending' })
      .subscribe({ next: (r) => this.appeals.set(r.data), error: (e) => this.fail(e) });
    this.api
      .get<{ data: any[] }>('/admin/category-requests', { status: 'pending' })
      .subscribe({ next: (r) => this.categoryRequests.set(r.data), error: (e) => this.fail(e) });
    this.api
      .get<{ data: any[] }>('/admin/identity-change-requests', { status: 'pending' })
      .subscribe({ next: (r) => this.identityRequests.set(r.data), error: (e) => this.fail(e) });
  }

  private done(ok: string): void {
    this.isError.set(false);
    this.message.set(ok);
    this.load();
  }
  private fail(e: { message?: string }): void {
    this.isError.set(true);
    this.message.set(e.message ?? 'Action failed');
  }

  reviewWithdrawal(id: string, status: string): void {
    // Withdrawals move money - re-prompt the action PIN on every approval
    // rather than reusing the cached session PIN.
    if (status === 'approved') this.pin.clear();
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return; // PIN dialog cancelled
      this.api
        .patch(`/admin/withdrawals/${id}`, { status, adminNote: status }, { 'x-action-pin': pin })
        .subscribe({ next: () => this.done(`Withdrawal ${status}.`), error: (e) => this.fail(e) });
    });
  }

  reviewAppeal(id: string, status: string): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api
        .patch(`/admin/appeals/${id}`, { status, adminNote: status }, { 'x-action-pin': pin })
        .subscribe({ next: () => this.done(`Appeal ${status}.`), error: (e) => this.fail(e) });
    });
  }

  reviewCategory(id: string, status: string): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api
        .patch(`/admin/category-requests/${id}`, { status }, { 'x-action-pin': pin })
        .subscribe({ next: () => this.done(`Request ${status}.`), error: (e) => this.fail(e) });
    });
  }

  /** Opens the approval modal pre-filled with the merchant's suggested name. */
  openApprove(request: any): void {
    this.form = { name: request.name ?? '', price: null, duration: null, adminNote: '' };
    this.formError.set('');
    this.approveTarget.set(request);
  }

  closeApprove(): void {
    this.approveTarget.set(null);
    this.approving.set(false);
  }

  /** Validates every field, then asks for the PIN and PATCHes the request. */
  submitApprove(): void {
    const target = this.approveTarget();
    if (!target) return;
    const f = this.form;
    const name = f.name.trim();
    const adminNote = f.adminNote.trim();

    if (!name) return void this.formError.set('Enter a category name.');
    if (f.price == null || f.price < 0) return void this.formError.set('Enter a default price (RM).');
    if (f.duration == null || f.duration < 1)
      return void this.formError.set('Enter a default duration in minutes.');
    if (!adminNote) return void this.formError.set('Enter an admin note.');

    this.formError.set('');
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return; // PIN dialog cancelled
      this.approving.set(true);
      this.api
        .patch(
          `/admin/category-requests/${target.id}`,
          {
            status: 'approved',
            name,
            defaultPriceSuggestion: f.price,
            defaultEstimatedDurationMinutes: f.duration,
            adminNote,
          },
          { 'x-action-pin': pin },
        )
        .subscribe({
          next: () => {
            this.closeApprove();
            this.done(`Category "${name}" approved.`);
          },
          error: (e) => {
            this.approving.set(false);
            this.formError.set(e.message ?? 'Approval failed');
          },
        });
    });
  }

  // ── Identity change requests ──────────────────────────────────────────────

  reviewIdentity(id: string, status: string): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api
        .patch(`/admin/identity-change-requests/${id}`, { status }, { 'x-action-pin': pin })
        .subscribe({
          next: () => this.done(`Identity change request ${status}.`),
          error: (e) => this.fail(e),
        });
    });
  }

  /** Returns true when a proposed object has at least one non-empty field. */
  hasAnyProposed(r: any): boolean {
    const p = r.proposed;
    if (!p) return false;
    return !!(p.entityType || p.businessRegistrationNumber || p.taxNumber || p.sstNumber);
  }

  /** Format entity type enum value for display. */
  formatEntityType(type: string): string {
    const map: Record<string, string> = {
      sole_proprietorship: 'Sole Proprietorship',
      partnership: 'Partnership',
      enterprise: 'Enterprise',
      sdn_bhd: 'Sdn Bhd',
    };
    return map[type] ?? type;
  }
}
