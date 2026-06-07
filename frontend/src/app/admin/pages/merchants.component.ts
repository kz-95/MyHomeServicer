import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { PinService } from '../../core/services/pin.service';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

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

/** Admin merchant management - view and ban/unban merchants. */
@Component({
    selector: 'app-admin-merchants',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ListToolbarComponent],
    template: `
    <h1>Merchants</h1>
    @if (loading()) {
      <p class="muted">Loading merchants…</p>
    } @else if (loadFailed()) {
      <div class="card load-err">Could not load merchants. Please refresh the page.</div>
    } @else {
    <app-list-toolbar>
      <input class="search" type="text" placeholder="Search name or email…" [(ngModel)]="search" name="ms" toolbar-search />
      <div class="chips" toolbar-filters>
        <button class="chip" [class.on]="statusFilter() === 'all'" (click)="statusFilter.set('all')">All</button>
        <button class="chip" [class.on]="statusFilter() === 'active'" (click)="statusFilter.set('active')">Active</button>
        <button class="chip" [class.on]="statusFilter() === 'banned'" (click)="statusFilter.set('banned')">Banned</button>
      </div>
    </app-list-toolbar>
    <table class="card page-child">
      <thead>
        <tr>
          <th class="sort-th" (click)="toggleSort('business')">Business {{ sortIndicator('business') }}</th>
          <th class="sort-th" (click)="toggleSort('email')">Email {{ sortIndicator('email') }}</th>
          <th class="sort-th" (click)="toggleSort('rating')">Rating {{ sortIndicator('rating') }}</th>
          <th class="sort-th" (click)="toggleSort('deposit')">Deposit {{ sortIndicator('deposit') }}</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        @for (m of displayMerchants(); track m.id) {
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
            <td colspan="6" class="muted">No merchants found.</td>
          </tr>
        }
      </tbody>
    </table>
    }
  `,
    styles: [
        `
      :host {
        display: block;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        overflow: hidden;
      }
      th {
        text-align: left;
        padding: 0.6rem 0.5rem;
        border-bottom: 2px solid var(--color-border);
        font-size: 0.82rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--color-muted);
      }
      td {
        text-align: left;
        padding: 0.6rem 0.5rem;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.9rem;
      }
      tbody tr {
        transition: background 0.12s ease;
      }
      tbody tr:hover {
        background: var(--color-surface);
      }
      .banned {
        color: var(--color-danger);
        font-weight: 600;
      }
      .load-err {
        color: var(--color-danger);
      }
      /* Mobile: hide lower-priority columns */
      @media (max-width: 700px) {
        th:nth-child(3), td:nth-child(3),
        th:nth-child(4), td:nth-child(4) {
          display: none;
        }
      }
    `,
    ]
})
export class AdminMerchantsComponent implements OnInit {
  private api = inject(ApiService);
  private pin = inject(PinService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  merchants = signal<Merchant[]>([]);
  loading = signal(true);
  loadFailed = signal(false);
  message = signal('');

  search = signal('');
  statusFilter = signal<'all' | 'active' | 'banned'>('all');
  sortField = signal<'business' | 'email' | 'rating' | 'deposit'>('business');
  sortDir = signal<'asc' | 'desc'>('asc');

  private sortFieldMap: Record<string, keyof Merchant> = { business: 'businessName', email: 'email', rating: 'rating', deposit: 'depositBalance' };

  displayMerchants = computed(() => {
    let list = this.merchants();
    const q = this.search().toLowerCase();
    if (q) {
      list = list.filter((m) => m.businessName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    }
    const sf = this.statusFilter();
    if (sf === 'active') list = list.filter((m) => !m.isBanned);
    if (sf === 'banned') list = list.filter((m) => m.isBanned);
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    const field = this.sortFieldMap[this.sortField()];
    return [...list].sort((a, b) => {
      const va = a[field] ?? '';
      const vb = b[field] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  });

  toggleSort(field: string): void {
    if (this.sortField() === field) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field as 'business' | 'email' | 'rating' | 'deposit');
      this.sortDir.set('asc');
    }
  }

  sortIndicator(field: string): string {
    if (this.sortField() !== field) return '';
    return this.sortDir() === 'asc' ? '▲' : '▼';
  }

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.loadFailed.set(false);
    this.api.get<{ data: Merchant[] }>('/admin/merchants').subscribe({
      next: (r) => {
        this.merchants.set(r.data);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }

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
                this.load();
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
        if (note === null) return; // cancelled
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
                this.load();
              },
              error: (e) => this.toast.error(e.message ?? 'Could not unban merchant'),
            });
        });
      });
  }
}
