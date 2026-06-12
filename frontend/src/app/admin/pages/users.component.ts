import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { PinService } from '../../core/services/pin.service';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { PhoneInputComponent } from '../../shared/phone-input.component';

interface Account {
  id: string;
  kind: 'user' | 'servicer';
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin' | 'servicer';
  createdAt: string;
}

interface InfoUpdate {
  id: string;
  editedBy: string;
  reason?: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  at: string;
}
interface ActivityItem {
  id: string;
  status: string;
  label: string;
  at: string;
}
interface ActivityData {
  account: { id: string; kind: string; name: string; email: string };
  infoUpdates: InfoUpdate[];
  activity: {
    bookings: ActivityItem[];
    quotes: ActivityItem[];
    reports: ActivityItem[];
    withdrawals: ActivityItem[];
  };
}

interface Merchant {
  id: string;
  businessName: string;
  email: string;
  kycStatus: string;
  isBanned: boolean;
  rating: number;
  depositBalance: number;
  creditBalance: number;
}

type MerchantStatus = '' | 'active' | 'banned';
type MerchantKyc = '' | 'approved' | 'pending' | 'rejected' | 'unsubmitted';

/**
 * Admin account management - all users and merchants under one PIN-gated view.
 * Tabs: All Accounts (server-side search) | Merchant (client-side filter + sort).
 */
@Component({
    selector: 'app-admin-users',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ModalComponent, PhoneInputComponent],
    template: `
    <h1>Accounts</h1>

    @if (locked()) {
      <div class="card gate">
        <p>This page is protected. Enter your admin action PIN to continue.</p>
        <button class="btn-primary" (click)="unlock()">Enter PIN</button>
      </div>
    } @else {
      <!-- Sticky tab + search + filters -->
      <div class="sticky-header">
        <div class="tabs">
          <button class="tab" [class.active]="tab() === 'all'" (click)="switchTab('all')">All Accounts</button>
          <button class="tab" [class.active]="tab() === 'servicer'" (click)="switchTab('servicer')">Servicer</button>
        </div>
        <div class="search-row">
          <input
            placeholder="Search name, business or email…"
            [(ngModel)]="search"
            (input)="onSearchInput()"
            (keyup.enter)="load()"
          />
          @if (tab() === 'all') {
            <select [(ngModel)]="roleFilter" (change)="loadUsers()">
              <option value="">All types</option>
              <option value="customer">Customers</option>
              <option value="servicer">Servicers</option>
              <option value="admin">Admins</option>
            </select>
          }
          <button class="btn-primary" (click)="load()">Search</button>
        </div>

        @if (tab() === 'servicer') {
          <div class="filter-row">
            <div class="filter-group">
              <span class="filter-label">Status</span>
              <div class="chips">
                <button class="chip" [class.active]="merchantStatus() === ''" (click)="setMerchantStatus('')">All</button>
                <button class="chip" [class.active]="merchantStatus() === 'active'" (click)="setMerchantStatus('active')">Active</button>
                <button class="chip" [class.active]="merchantStatus() === 'banned'" (click)="setMerchantStatus('banned')">Banned</button>
              </div>
            </div>
            <div class="filter-group">
              <span class="filter-label">KYC</span>
              <div class="chips">
                <button class="chip" [class.active]="merchantKyc() === ''" (click)="setMerchantKyc('')">All</button>
                <button class="chip" [class.active]="merchantKyc() === 'approved'" (click)="setMerchantKyc('approved')">Approved</button>
                <button class="chip" [class.active]="merchantKyc() === 'pending'" (click)="setMerchantKyc('pending')">Pending</button>
                <button class="chip" [class.active]="merchantKyc() === 'rejected'" (click)="setMerchantKyc('rejected')">Rejected</button>
                <button class="chip" [class.active]="merchantKyc() === 'unsubmitted'" (click)="setMerchantKyc('unsubmitted')">Unsubmitted</button>
              </div>
            </div>
          </div>
        }
      </div>

      <!-- All Accounts table -->
      @if (tab() === 'all') {
        <table class="card page-child">
          <thead>
            <tr>
              <th class="sortable" [class.sorted]="sortCol() === 'name'" (click)="sortAccounts('name')">
                Name <span class="sort-ic">{{ aSortIcon('name') }}</span>
              </th>
              <th class="sortable" [class.sorted]="sortCol() === 'email'" (click)="sortAccounts('email')">
                Email <span class="sort-ic">{{ aSortIcon('email') }}</span>
              </th>
              <th>Phone</th>
              <th class="sortable" [class.sorted]="sortCol() === 'role'" (click)="sortAccounts('role')">
                Type <span class="sort-ic">{{ aSortIcon('role') }}</span>
              </th>
              <th class="sortable" [class.sorted]="sortCol() === 'createdAt'" (click)="sortAccounts('createdAt')">
                Joined <span class="sort-ic">{{ aSortIcon('createdAt') }}</span>
              </th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (u of sortedAccounts(); track u.id) {
              <tr>
                <td>{{ u.name }}</td>
                <td class="muted">{{ u.email }}</td>
                <td>{{ u.phone }}</td>
                <td>
                  <span class="role" [class.admin]="u.role === 'admin'" [class.servicer]="u.role === 'servicer'">
                    {{ u.role }}
                  </span>
                </td>
                <td class="muted">{{ u.createdAt | date: 'mediumDate' }}</td>
                <td class="actions">
                  <button class="btn-ghost" (click)="openActivity(u)">Activity log</button>
                  <button class="btn-ghost" (click)="openEdit(u)">Edit</button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="muted">
                  {{ loading() ? 'Loading accounts…' : 'No accounts match your search.' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      }

      <!-- Merchant table -->
      @if (tab() === 'servicer') {
        @if (merchantLoading()) {
          <p class="muted">Loading merchants…</p>
        } @else if (merchantFailed()) {
          <div class="card load-err">Could not load merchants. Please refresh the page.</div>
        } @else {
          <table class="card page-child">
            <thead>
              <tr>
                <th class="sortable" [class.sorted]="mSortCol() === 'businessName'" (click)="sortMerchants('businessName')">
                  Business <span class="sort-ic">{{ mSortIcon('businessName') }}</span>
                </th>
                <th class="sortable" [class.sorted]="mSortCol() === 'email'" (click)="sortMerchants('email')">
                  Email <span class="sort-ic">{{ mSortIcon('email') }}</span>
                </th>
                <th class="sortable" [class.sorted]="mSortCol() === 'rating'" (click)="sortMerchants('rating')">
                  Rating <span class="sort-ic">{{ mSortIcon('rating') }}</span>
                </th>
                <th class="sortable" [class.sorted]="mSortCol() === 'depositBalance'" (click)="sortMerchants('depositBalance')">
                  Deposit <span class="sort-ic">{{ mSortIcon('depositBalance') }}</span>
                </th>
                <th class="sortable" [class.sorted]="mSortCol() === 'isBanned'" (click)="sortMerchants('isBanned')">
                  Status <span class="sort-ic">{{ mSortIcon('isBanned') }}</span>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (m of sortedMerchants(); track m.id) {
                <tr>
                  <td>{{ m.businessName }}</td>
                  <td class="muted">{{ m.email }}</td>
                  <td>★ {{ m.rating | number: '1.1-1' }}</td>
                  <td>RM {{ m.depositBalance | number: '1.2-2' }}</td>
                  <td>
                    <span [class.banned]="m.isBanned">{{ m.isBanned ? 'Banned' : 'Active' }}</span>
                  </td>
                  <td>
                    @if (m.isBanned) {
                      <button class="btn-ghost" (click)="unban(m)">Unban</button>
                    } @else {
                      <button class="btn-ghost" (click)="ban(m)">Ban</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="muted">No merchants match the current filters.</td>
                </tr>
              }
            </tbody>
          </table>
        }
      }
    }

    @if (message()) {
      <p class="ok">{{ message() }}</p>
    }

    <!-- Edit account -->
    <app-modal [open]="!!editing()" title="Edit account info" (closed)="closeEdit()">
      @if (editing(); as u) {
        <form class="form" (ngSubmit)="saveEdit()">
          <p class="muted">
            Editing {{ u.name }} ({{ u.email }}) ·
            <span class="role" [class.servicer]="u.kind === 'servicer'">{{ u.role }}</span>
          </p>
          @if (u.kind === 'servicer') {
            <label>Business name<input [(ngModel)]="f.businessName" name="bn" /></label>
          } @else {
            <label>Name<input [(ngModel)]="f.name" name="name" /></label>
          }
          <label>Email<input [(ngModel)]="f.email" name="email" type="email" /></label>
          <label>Phone<app-phone-input [(ngModel)]="f.phone" name="phone"></app-phone-input></label>
          @if (u.kind === 'user') {
            <label>
              Role
              <select [(ngModel)]="f.role" name="role">
                <option value="customer">customer</option>
                <option value="admin">admin</option>
              </select>
            </label>
          }
          <label>
            Reason for this change <span class="req">(required)</span>
            <textarea
              [(ngModel)]="f.reason"
              name="reason"
              rows="2"
              placeholder="Why is this account being edited?"
            ></textarea>
          </label>
          @if (editError()) {
            <p class="err">{{ editError() }}</p>
          }
          <div class="modal-actions">
            <button type="button" class="btn-ghost" (click)="closeEdit()">Cancel</button>
            <button type="submit" class="btn-primary" [disabled]="saving() || !f.reason.trim()">
              {{ saving() ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </form>
      }
    </app-modal>

    <!-- Activity log -->
    <app-modal
      [open]="!!activityAccount()"
      [wide]="true"
      title="Account activity log"
      (closed)="activityAccount.set(null)"
    >
      @if (activity(); as a) {
        <p class="muted">{{ a.account.name }} ({{ a.account.email }}) · {{ a.account.kind }}</p>

        <h3>Info update history</h3>
        @for (e of a.infoUpdates; track e.id) {
          <div class="log">
            <div>
              <strong>{{ e.editedBy }}</strong>
              <span class="muted"> · {{ e.at | date: 'medium' }}</span>
            </div>
            <div class="muted">Reason: {{ e.reason || ' - ' }}</div>
            <div class="changes">{{ changeSummary(e) }}</div>
          </div>
        } @empty {
          <p class="muted">No edits have been made to this account.</p>
        }

        <h3>{{ a.account.kind === 'servicer' ? 'Jobs' : 'Bookings' }}</h3>
        @for (b of a.activity.bookings; track b.id) {
          <div class="log">{{ b.label }} <span class="muted"> - {{ b.status }} · {{ b.at | date: 'mediumDate' }}</span></div>
        } @empty {
          <p class="muted">None.</p>
        }

        @if (a.account.kind === 'servicer') {
          <h3>Withdrawals</h3>
          @for (w of a.activity.withdrawals; track w.id) {
            <div class="log">{{ w.label }} <span class="muted"> - {{ w.status }} · {{ w.at | date: 'mediumDate' }}</span></div>
          } @empty {
            <p class="muted">None.</p>
          }
        } @else {
          <h3>Quotes</h3>
          @for (q of a.activity.quotes; track q.id) {
            <div class="log">{{ q.label }} <span class="muted"> - {{ q.status }} · {{ q.at | date: 'mediumDate' }}</span></div>
          } @empty {
            <p class="muted">None.</p>
          }
          <h3>Reports filed</h3>
          @for (r of a.activity.reports; track r.id) {
            <div class="log">{{ r.label }} <span class="muted"> - {{ r.status }} · {{ r.at | date: 'mediumDate' }}</span></div>
          } @empty {
            <p class="muted">None.</p>
          }
        }
      } @else {
        <p class="muted">Loading activity…</p>
      }
    </app-modal>
  `,
    styles: [
        `
      /* Sticky tab + search + filter header */
      .sticky-header {
        position: sticky;
        top: 0;
        z-index: 5;
        background: var(--color-bg);
        padding-bottom: 0.6rem;
        margin-bottom: 0.25rem;
        border-bottom: 1px solid var(--color-border);
      }
      .tabs {
        display: flex;
        gap: 0.4rem;
        margin-bottom: 0.5rem;
      }
      .tab {
        background: transparent;
        border: none;
        border-radius: 999px;
        padding: 0.5rem 1.1rem;
        font-size: 0.88rem;
        font-weight: 500;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .tab:hover:not(.active) { color: var(--color-text); background: var(--color-bg); }
      .tab.active {
        background: var(--color-primary);
        background: var(--gradient-sidebar);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 1px 6px rgba(201, 90, 60, 0.2);
      }
      .search-row {
        display: flex;
        gap: 0.5rem;
        max-width: 620px;
      }

      /* Merchant filters */
      .filter-row {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 1.25rem;
        align-items: center;
        padding-top: 0.45rem;
      }
      .filter-group {
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }
      .filter-label {
        font-size: 0.75rem;
        color: var(--color-muted);
        font-weight: 500;
        white-space: nowrap;
      }
      .chips {
        display: flex;
        gap: 0.2rem;
        flex-wrap: wrap;
      }
      .chip {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.12rem 0.55rem;
        font-size: 0.74rem;
        font-weight: 500;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s ease;
      }
      .chip:hover { color: var(--color-text); border-color: var(--color-muted); }
      .chip.active {
        background: var(--color-primary-light);
        border-color: var(--color-primary);
        color: var(--color-primary);
      }

      /* Table */
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        text-align: left;
        padding: 0.6rem 0.5rem;
        border-bottom: 1px solid var(--color-border);
      }
      th {
        font-size: 0.82rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--color-muted);
        border-bottom: 2px solid var(--color-border);
      }
      .sortable {
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
      }
      .sortable:hover { color: var(--color-text); }
      .sortable.sorted { color: var(--color-primary); }
      .sort-ic {
        font-size: 0.68rem;
        margin-left: 0.15rem;
        opacity: 0.35;
        font-style: normal;
      }
      .sortable.sorted .sort-ic { opacity: 1; }
      tbody tr { transition: background 0.12s ease; }
      tbody tr:hover { background: var(--color-surface); }
      .actions { display: flex; gap: 0.4rem; }
      .role {
        font-size: 0.75rem;
        padding: 0.1rem 0.5rem;
        border-radius: 999px;
        background: var(--color-bg);
        text-transform: capitalize;
      }
      .role.admin, .role.servicer {
        background: var(--color-primary-light);
        color: var(--color-primary);
      }
      .banned { color: var(--color-danger); font-weight: 600; }
      .load-err { color: var(--color-danger); }

      /* PIN gate */
      .gate {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.8rem;
        max-width: 420px;
      }

      /* Edit form */
      .form {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .form label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .req { color: var(--color-danger); font-weight: 400; }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .err { color: var(--color-danger); }
      .ok { color: var(--color-success); }

      /* Activity log */
      h3 { margin: 1rem 0 0.5rem; font-size: 0.95rem; }
      .log {
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.9rem;
      }
      .changes { font-size: 0.85rem; margin-top: 0.2rem; }

      /* Mobile: hide lower-priority columns */
      @media (max-width: 700px) {
        th:nth-child(3), td:nth-child(3),
        th:nth-child(4), td:nth-child(4) { display: none; }
      }
    `,
    ]
})
export class AdminUsersComponent implements OnInit {
  private api = inject(ApiService);
  private pin = inject(PinService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);

  tab = signal<'all' | 'servicer'>('all');

  // ── All Accounts ──────────────────────────────────────────────────────────
  accounts = signal<Account[]>([]);
  loading = signal(true);
  locked = signal(false);
  message = signal('');
  search = '';
  roleFilter = '';

  editing = signal<Account | null>(null);
  saving = signal(false);
  editError = signal('');
  f = { name: '', businessName: '', email: '', phone: '', role: 'customer', reason: '' };

  activityAccount = signal<Account | null>(null);
  activity = signal<ActivityData | null>(null);

  // Sort - All Accounts
  sortCol = signal('');
  sortDir = signal<'asc' | 'desc'>('asc');

  sortedAccounts = computed(() => {
    const col = this.sortCol();
    const dir = this.sortDir();
    if (!col) return this.accounts();
    return [...this.accounts()].sort((a, b) => {
      const av = a[col as keyof Account] as unknown;
      const bv = b[col as keyof Account] as unknown;
      if (col === 'createdAt') {
        const diff = new Date(av as string).getTime() - new Date(bv as string).getTime();
        return dir === 'asc' ? diff : -diff;
      }
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  // ── Merchants ─────────────────────────────────────────────────────────────
  merchants = signal<Merchant[]>([]);
  visibleMerchants = signal<Merchant[]>([]);
  merchantLoading = signal(false);
  merchantFailed = signal(false);
  merchantStatus = signal<MerchantStatus>('');
  merchantKyc = signal<MerchantKyc>('');

  // Sort - Merchant
  mSortCol = signal('');
  mSortDir = signal<'asc' | 'desc'>('asc');

  sortedMerchants = computed(() => {
    const col = this.mSortCol();
    const dir = this.mSortDir();
    if (!col) return this.visibleMerchants();
    return [...this.visibleMerchants()].sort((a, b) => {
      const av = a[col as keyof Merchant];
      const bv = b[col as keyof Merchant];
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av;
      }
      if (typeof av === 'boolean' && typeof bv === 'boolean') {
        const ai = av ? 1 : 0;
        const bi = bv ? 1 : 0;
        return dir === 'asc' ? ai - bi : bi - ai;
      }
      const cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, { sensitivity: 'base' });
      return dir === 'asc' ? cmp : -cmp;
    });
  });

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('tab') === 'servicer') {
      this.tab.set('servicer');
      this.loadMerchants();
    } else {
      this.loadUsers();
    }
  }

  switchTab(t: 'all' | 'servicer'): void {
    if (this.tab() === t) return;
    this.tab.set(t);
    this.search = '';
    if (t === 'servicer') {
      this.loadMerchants();
    } else {
      this.loadUsers();
    }
  }

  onSearchInput(): void {
    if (this.tab() === 'servicer') this.applyMerchantFilter();
  }

  load(): void {
    if (this.tab() === 'servicer') {
      this.loadMerchants();
    } else {
      this.loadUsers();
    }
  }

  loadUsers(): void {
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) {
        this.locked.set(true);
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      this.message.set('');
      const params: Record<string, string> = {};
      if (this.search) params['search'] = this.search;
      if (this.roleFilter) params['role'] = this.roleFilter;
      this.api
        .get<{ data: Account[] }>('/admin/users', params, { 'x-action-pin': pin })
        .subscribe({
          next: (r) => {
            this.accounts.set(r.data);
            this.locked.set(false);
            this.loading.set(false);
          },
          error: (e) => {
            this.loading.set(false);
            if (e.status === 403) {
              this.pin.clear();
              this.locked.set(true);
            } else {
              this.message.set(e.message ?? 'Could not load accounts');
            }
          },
        });
    });
  }

  loadMerchants(): void {
    this.merchantFailed.set(false);
    this.merchantLoading.set(true);
    this.api.get<{ data: Merchant[] }>('/admin/merchants').subscribe({
      next: (r) => {
        this.merchants.set(r.data);
        this.applyMerchantFilter();
        this.merchantLoading.set(false);
      },
      error: () => {
        this.merchantFailed.set(true);
        this.merchantLoading.set(false);
      },
    });
  }

  applyMerchantFilter(): void {
    let list = this.merchants();
    const q = this.search.toLowerCase();
    if (q) list = list.filter((m) => m.businessName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    const status = this.merchantStatus();
    if (status === 'active') list = list.filter((m) => !m.isBanned);
    if (status === 'banned') list = list.filter((m) => m.isBanned);
    const kyc = this.merchantKyc();
    if (kyc) list = list.filter((m) => m.kycStatus === kyc);
    this.visibleMerchants.set(list);
  }

  setMerchantStatus(s: MerchantStatus): void {
    this.merchantStatus.set(s);
    this.applyMerchantFilter();
  }

  setMerchantKyc(k: MerchantKyc): void {
    this.merchantKyc.set(k);
    this.applyMerchantFilter();
  }

  unlock(): void {
    this.pin.clear();
    this.loadUsers();
  }

  // ── Sort helpers ──────────────────────────────────────────────────────────
  sortAccounts(col: string): void {
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('asc');
    }
  }

  sortMerchants(col: string): void {
    if (this.mSortCol() === col) {
      this.mSortDir.set(this.mSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.mSortCol.set(col);
      this.mSortDir.set('asc');
    }
  }

  aSortIcon(col: string): string {
    return this.sortCol() === col ? (this.sortDir() === 'asc' ? '↑' : '↓') : '⇅';
  }

  mSortIcon(col: string): string {
    return this.mSortCol() === col ? (this.mSortDir() === 'asc' ? '↑' : '↓') : '⇅';
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  openEdit(u: Account): void {
    this.editError.set('');
    this.f = {
      name: u.kind === 'user' ? u.name : '',
      businessName: u.kind === 'servicer' ? u.name : '',
      email: u.email,
      phone: u.phone,
      role: u.role === 'admin' ? 'admin' : 'customer',
      reason: '',
    };
    this.editing.set(u);
  }

  closeEdit(): void {
    this.editing.set(null);
  }

  saveEdit(): void {
    const u = this.editing();
    if (!u || !this.f.reason.trim()) return;
    this.editError.set('');
    const body: Record<string, unknown> = {
      reason: this.f.reason,
      email: this.f.email,
      phone: this.f.phone,
    };
    if (u.kind === 'servicer') {
      body['businessName'] = this.f.businessName;
    } else {
      body['name'] = this.f.name;
      body['role'] = this.f.role;
    }
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.saving.set(true);
      this.api.patch(`/admin/users/${u.id}`, body, { 'x-action-pin': pin }).subscribe({
        next: () => {
          this.saving.set(false);
          this.editing.set(null);
          this.message.set(`${u.name}'s details were updated.`);
          this.loadUsers();
        },
        error: (e) => {
          this.saving.set(false);
          this.editError.set(e.message ?? 'Could not save changes');
        },
      });
    });
  }

  // ── Activity log ───────────────────────────────────────────────────────────
  openActivity(u: Account): void {
    this.activity.set(null);
    this.activityAccount.set(u);
    this.pin.requirePin().subscribe((pin) => {
      if (!pin) return;
      this.api
        .get<ActivityData>(`/admin/users/${u.id}/activity`, undefined, { 'x-action-pin': pin })
        .subscribe({
          next: (a) => this.activity.set(a),
          error: (e) => this.message.set(e.message ?? 'Could not load activity'),
        });
    });
  }

  changeSummary(e: InfoUpdate): string {
    const after = e.after ?? {};
    const before = e.before ?? {};
    const parts = Object.keys(after).map(
      (k) =>
        `${k}: ${String(before[k] ?? ' - ')} → ${String((after as Record<string, unknown>)[k])}`,
    );
    return parts.length ? parts.join(', ') : 'No field changes recorded';
  }

  // ── Merchant ban / unban ───────────────────────────────────────────────────
  ban(m: Merchant): void {
    this.dialog
      .prompt(`Reason for banning ${m.businessName}?`, {
        placeholder: 'Enter ban reason…',
        confirmLabel: 'Ban merchant',
      })
      .subscribe((reason) => {
        if (!reason) return;
        this.pin.requirePin().subscribe((pin) => {
          if (!pin) return;
          this.api
            .post(`/admin/merchants/${m.id}/ban`, { reason }, { 'x-action-pin': pin })
            .subscribe({
              next: () => {
                this.toast.success('Merchant banned.');
                this.loadMerchants();
              },
              error: (e) => this.toast.error(e.message ?? 'Could not ban merchant'),
            });
        });
      });
  }

  unban(m: Merchant): void {
    this.dialog
      .prompt(`Note for unbanning ${m.businessName}?`, {
        placeholder: 'Optional note…',
        defaultValue: 'Ban lifted.',
        confirmLabel: 'Unban merchant',
      })
      .subscribe((note) => {
        if (note === null) return;
        this.pin.requirePin().subscribe((pin) => {
          if (!pin) return;
          this.api
            .post(
              `/admin/merchants/${m.id}/unban`,
              { adminNote: note || 'Ban lifted.' },
              { 'x-action-pin': pin },
            )
            .subscribe({
              next: () => {
                this.toast.success('Merchant unbanned.');
                this.loadMerchants();
              },
              error: (e) => this.toast.error(e.message ?? 'Could not unban merchant'),
            });
        });
      });
  }
}
