import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { CountdownComponent } from '../../shared/countdown-timer.component';
import { ModalComponent } from '../../shared/modal.component';
import { IconComponent } from '../../shared/icon.component';

interface Quote {
  id: string;
  status: string;
  timeSlot: string;
  preferredDate: string;
  proposalDeadline: string;
  contactName?: string;
  contactNumber?: string;
  notes?: string;
  category: { name: string; icon?: string };
  _count: { proposals: number };
  createdAt: string;
  updatedAt: string;
}

interface Address {
  id: string;
  label: string;
}

@Component({
    selector: 'app-my-quotes',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, RouterLink, CountdownComponent, ModalComponent, IconComponent],
    template: `
    @if (justSubmitted()) {
      <div class="card success-banner">
        <span class="success-ic">✓</span>
        <strong>Quote request sent!</strong>
        <p class="muted">Your request has been submitted. Servicers are being notified.</p>
      </div>
    }
    <h1>My quotes</h1>
    @if (loading()) {
      <p class="muted">Loading...</p>
    } @else if (loadFailed()) {
      <div class="card load-err">Could not load your quotes. Please refresh the page.</div>
    } @else if (quotes().length === 0) {
      <div class="card empty-card">
        <p>No quotes yet.</p>
        <a routerLink="/customer/quote/new" class="btn-primary">Request your first quote →</a>
      </div>
    } @else {
      <div class="toolbar">
        <input class="search" type="text" placeholder="Search by category…" [(ngModel)]="search" name="sq" />
        <select [(ngModel)]="sortBy" name="sort">
          <option value="updated">Latest update</option>
          <option value="created">Latest quotes</option>
        </select>
        <button class="sort-dir" (click)="sortAsc.set(!sortAsc())" title="Toggle sort direction">{{ sortAsc() ? '↑' : '↓' }}</button>
        <div class="chips">
          <button class="chip" [class.on]="statusFilter() === 'all'" (click)="statusFilter.set('all')">All</button>
          <button class="chip" [class.on]="statusFilter() === 'open'" (click)="statusFilter.set('open')">Open</button>
          <button class="chip" [class.on]="statusFilter() === 'expired'" (click)="statusFilter.set('expired')">Expired</button>
        </div>
      </div>
      @for (q of filteredQuotes(); track q.id) {
        <div class="card quote page-child">
          <div class="quote-left">
            <span class="svc-avatar"><app-icon [name]="(q.category.icon || 'home')" sizeToken="md" stroke="#fff" strokeWidth="1.5" /></span>
            <div>
              <strong>{{ q.category.name }}</strong>
              <span class="badge" [class]="badgeClass(q)">{{ statusLabel(q) }}</span>
              <div class="muted">
                {{ q.timeSlot }} · {{ q.preferredDate | date: 'mediumDate' }} ·
                {{ q._count.proposals }} {{ q._count.proposals === 1 ? 'proposal' : 'proposals' }}
              </div>
            </div>
          </div>
          <div class="right">
            @if (q.status === 'open') {
              <app-countdown [deadline]="q.proposalDeadline" />
              @if (q._count.proposals > 0) {
                <a routerLink="/customer/quotes/{{ q.id }}/proposals" class="btn-cta">
                  Choose a proposal →
                </a>
              } @else {
                <div class="open-actions">
                  <button class="btn-ghost small" (click)="editQuote(q)">Edit</button>
                  <button class="btn-ghost small" (click)="confirmCancel(q)">Cancel</button>
                  <a routerLink="/customer/quotes/{{ q.id }}/proposals" class="link-muted">View proposals</a>
                </div>
              }
            } @else if (q.status === 'expired') {
              <a routerLink="/customer/quotes/{{ q.id }}/proposals" class="link-muted">View proposals</a>
            }
          </div>
        </div>
      }
    }

    <!-- Cancel confirmation -->
    @if (cancelling(); as q) {
      <app-modal [open]="true" title="Cancel this quote?" (closed)="cancelling.set(null)">
        <p>
          Are you sure you want to cancel the <strong>{{ q.category.name }}</strong> quote?
        </p>
        <p class="muted">This cannot be undone. Any servicers who have already responded will be notified.</p>
        <div class="modal-actions">
          <button class="btn-ghost" (click)="cancelling.set(null)" [disabled]="cancellingBusy()">Keep it</button>
          <button class="btn-primary" (click)="doCancel(q.id)" [disabled]="cancellingBusy()">
            {{ cancellingBusy() ? 'Cancelling…' : 'Yes, cancel it' }}
          </button>
        </div>
      </app-modal>
    }

    <!-- Edit modal -->
    @if (editing(); as q) {
      <app-modal [open]="true" title="Edit quote" (closed)="editing.set(null)">
        <p class="muted">You can update your contact details, timing, and notes. Pricing cannot be changed.</p>
        <form class="edit-form" (ngSubmit)="doEdit()">
          <label>
            Contact name
            <input type="text" [(ngModel)]="editF.contactName" name="ecn" />
          </label>
          <label>
            Contact number
            <input type="text" [(ngModel)]="editF.contactNumber" name="ecp" />
          </label>
          <label>
            Preferred time
            <select [(ngModel)]="editF.timeSlot" name="ets">
              <option value="morning">Morning (9:00–11:00)</option>
              <option value="noon">Noon (11:00–13:00)</option>
              <option value="afternoon">Afternoon (13:00–15:00)</option>
              <option value="evening">Evening (15:00–17:00)</option>
              <option value="night">Night (17:00–22:00)</option>
            </select>
          </label>
          <label>
            Preferred date
            <input type="date" [(ngModel)]="editF.preferredDate" name="epd" />
          </label>
          <label>
            Extra notes <span class="muted">(optional)</span>
            <textarea rows="2" [(ngModel)]="editF.notes" name="enotes"></textarea>
          </label>
          @if (editF.error) {
            <p class="err">{{ editF.error }}</p>
          }
          <div class="modal-actions">
            <button type="button" class="btn-ghost" (click)="editing.set(null)" [disabled]="editBusy()">Cancel</button>
            <button type="submit" class="btn-primary" [disabled]="editBusy()">
              {{ editBusy() ? 'Saving…' : 'Save changes' }}
            </button>
          </div>
        </form>
      </app-modal>
    }
  `,
    styles: [`
    .quote {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.8rem;
      transition: box-shadow var(--transition), transform var(--transition);
    }
    .quote-left {
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
    .quote:hover {
      box-shadow: 0 4px 16px rgba(0,0,0,0.1);
      transform: translateY(-1px);
    }
    .right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.5rem;
    }
    .badge { margin-left: 0.5rem; }
    .badge.open {
      background: var(--color-status-open-bg);
      color: var(--color-status-open-text);
      border-color: var(--color-status-open-border);
    }
    .badge.has-proposals {
      background: var(--color-status-accepted-bg);
      color: var(--color-status-accepted-text);
      border-color: var(--color-status-accepted-border);
    }
    .badge.matched {
      background: var(--color-status-completed-bg);
      color: var(--color-status-completed-text);
      border-color: var(--color-status-completed-border);
    }
    .badge.expired, .badge.cancelled, .badge.reposted {
      background: var(--color-status-cancelled-bg);
      color: var(--color-status-cancelled-text);
      border-color: var(--color-status-cancelled-border);
    }
    .load-err {
      color: var(--color-danger);
    }
    .btn-cta {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-primary);
      text-decoration: none;
      border: 1px solid var(--color-primary);
      border-radius: var(--radius);
      padding: 0.3rem 0.75rem;
      transition: background var(--transition), color var(--transition);
    }
    .btn-cta:hover {
      background: var(--color-primary);
      color: #fff;
    }
    .link-muted {
      font-size: 0.85rem;
      color: var(--color-muted);
      text-decoration: none;
    }
    .link-muted:hover { text-decoration: underline; }
    .success-banner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.4rem;
      text-align: center;
      padding: 1.5rem;
      border: 1px solid var(--color-success);
      background: var(--color-success-light);
      margin-bottom: 1rem;
    }
    .success-ic {
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 999px;
      background: var(--color-success);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      font-weight: 700;
    }
    .open-actions {
      display: flex;
      gap: 0.4rem;
      align-items: center;
    }
    .open-actions .small {
      font-size: 0.78rem;
      padding: 0.2rem 0.5rem;
    }
    .edit-form {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .edit-form label {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: 0.88rem;
      font-weight: 500;
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.8rem;
    }
    .err { color: var(--color-danger); }
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
    .search:focus {
      border-color: var(--color-primary);
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
    select:focus {
      border-color: var(--color-primary);
    }
    .sort-dir {
      background: transparent;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 0.35rem 0.6rem;
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
      color: var(--color-muted);
      transition: border-color var(--transition), color var(--transition);
    }
    .sort-dir:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .empty-card {
      text-align: center;
      padding: 3rem 1.5rem;
      color: var(--color-muted);
    }
    .empty-card p {
      margin-bottom: 1.25rem;
      font-size: 1.05rem;
    }
  `]
})
export class MyQuotesComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);

  quotes = signal<Quote[]>([]);
  loading = signal(true);
  loadFailed = signal(false);
  justSubmitted = signal(false);

  search = signal('');
  sortBy = signal<'updated' | 'created'>('updated');
  sortAsc = signal(false);
  statusFilter = signal<string>('all');
  filteredQuotes = computed(() => {
    let list = this.quotes();

    const q = this.search().toLowerCase();
    if (q) {
      list = list.filter((item) => item.category.name.toLowerCase().includes(q));
    }

    const sf = this.statusFilter();
    if (sf !== 'all') {
      list = list.filter((item) => item.status === sf);
    }

    const sort = this.sortBy();
    list = [...list].sort((a, b) => {
      // Priority: choose proposal (0) > request pending (1) > booking confirmed (2) > other (3)
      const prio = (x: Quote): number => {
        if (x.status === 'open' && x._count.proposals > 0) return 0;
        if (x.status === 'open') return 1;
        if (x.status === 'matched') return 2;
        return 3;
      };
      const pa = prio(a), pb = prio(b);
      if (pa !== pb) return pa - pb;
      // Within same priority, sort by selected date field (reversible).
      const dateA = sort === 'updated' ? a.updatedAt : a.createdAt;
      const dateB = sort === 'updated' ? b.updatedAt : b.createdAt;
      const cmp = dateB.localeCompare(dateA);
      return this.sortAsc() ? -cmp : cmp;
    });

    return list;
  });

  cancelling = signal<Quote | null>(null);
  cancellingBusy = signal(false);

  editing = signal<Quote | null>(null);
  editBusy = signal(false);
  editF = { contactName: '', contactNumber: '', timeSlot: 'morning', preferredDate: '', notes: '', error: '' };

  ngOnInit(): void {
    this.justSubmitted.set(this.route.snapshot.queryParamMap.get('submitted') === 'true');
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.api.get<{ data: Quote[] }>('/quotes').subscribe({
      next: (r) => {
        // Once a proposal is selected the quote becomes a booking (status
        // 'matched') and lives on the Bookings page - drop it from current quotes.
        this.quotes.set(r.data.filter((q) => q.status !== 'matched'));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  statusLabel(q: Quote): string {
    if (q.status === 'open') {
      return q._count.proposals > 0 ? 'Choose proposal' : 'Request pending';
    }
    const map: Record<string, string> = {
      matched: 'Booking confirmed',
      expired: 'Expired',
      cancelled: 'Cancelled',
      reposted: 'Reposted',
    };
    return map[q.status] ?? q.status;
  }

  badgeClass(q: Quote): string {
    if (q.status === 'open' && q._count.proposals > 0) return 'has-proposals';
    return q.status;
  }

  confirmCancel(q: Quote): void {
    this.cancelling.set(q);
  }

  doCancel(quoteId: string): void {
    this.cancellingBusy.set(true);
    this.api.post(`/quotes/${quoteId}/cancel`, {}).subscribe({
      next: () => {
        this.cancellingBusy.set(false);
        this.cancelling.set(null);
        this.toast.success('Quote cancelled.');
        this.load();
      },
      error: (e) => {
        this.cancellingBusy.set(false);
        this.toast.error(e.message ?? 'Could not cancel quote');
      },
    });
  }

  editQuote(q: Quote): void {
    this.editF = {
      contactName: q.contactName ?? '',
      contactNumber: q.contactNumber ?? '',
      timeSlot: q.timeSlot ?? 'morning',
      preferredDate: this.formatDate(q.preferredDate),
      notes: q.notes ?? '',
      error: '',
    };
    this.editing.set(q);
  }

  doEdit(): void {
    const q = this.editing();
    if (!q) return;
    if (!this.editF.contactName.trim() || !this.editF.contactNumber.trim()) {
      this.editF.error = 'Contact name and number are required.';
      return;
    }
    this.editBusy.set(true);
    this.editF.error = '';
    this.api
      .patch(`/quotes/${q.id}`, {
        contactName: this.editF.contactName.trim(),
        contactNumber: this.editF.contactNumber.trim(),
        timeSlot: this.editF.timeSlot,
        preferredDate: new Date(this.editF.preferredDate).toISOString(),
        notes: this.editF.notes.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.editBusy.set(false);
          this.editing.set(null);
          this.toast.success('Quote updated.');
          this.load();
        },
        error: (e) => {
          this.editBusy.set(false);
          this.editF.error = e.message ?? 'Could not update quote';
        },
      });
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toISOString().split('T')[0];
  }
}
