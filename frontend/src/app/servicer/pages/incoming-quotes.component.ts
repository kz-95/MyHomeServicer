import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { CountdownComponent } from '../../shared/countdown-timer.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

interface IncomingQuote {
  quoteId: string;
  category: string;
  timeSlot: string;
  preferredDate: string;
  propertyType?: string;
  budgetMin?: number;
  budgetMax?: number;
  derivedStatus: string;
  servicerDeadline: string;
  myProposalId?: string | null;
}

/**
 * Servicer incoming-quotes feed. New quotes arrive live over Socket.io;
 * the servicer expands one (which marks it opened) and submits a proposal.
 */
@Component({
  selector: 'app-incoming-quotes',
  standalone: true,
  host: { class: 'page-enter' },
  imports: [CommonModule, FormsModule, CountdownComponent, ListToolbarComponent],
  template: `
    <h1>Incoming quotes</h1>
    <p class="muted">New requests appear here live. Respond before the deadline.</p>

    @if (loading()) {
      <p class="muted">Loading incoming quotes…</p>
    } @else if (quotes().length === 0) {
      <div class="card">No incoming quotes right now - they'll appear here live.</div>
    } @else {
      <app-list-toolbar>
        <input class="search" type="text" placeholder="Search category…" [(ngModel)]="search" name="iqs" toolbar-search />
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="responseFilter() === 'all'" (click)="responseFilter.set('all')">All</button>
          <button class="chip" [class.on]="responseFilter() === 'new'" (click)="responseFilter.set('new')">New</button>
          <button class="chip" [class.on]="responseFilter() === 'responded'" (click)="responseFilter.set('responded')">Responded</button>
        </div>
        <select [(ngModel)]="sort" name="iqsort" toolbar-sort>
          <option value="recent">Most recent</option>
          <option value="budget_desc">Budget high-low</option>
          <option value="budget_asc">Budget low-high</option>
        </select>
      </app-list-toolbar>
      @for (q of displayQuotes(); track q.quoteId) {
      <div class="card quote">
        <div
          class="head"
          role="button"
          tabindex="0"
          (click)="expand(q)"
          (keydown.enter)="expand(q)"
        >
          <div>
            <strong>{{ q.category }}</strong>
            <span class="muted">
              · {{ q.timeSlot }} · {{ q.preferredDate | date: 'mediumDate' }}
              @if (q.propertyType) {
                · {{ q.propertyType }}
              }
            </span>
            <div class="muted">
              Budget: RM {{ q.budgetMin ?? ' - ' }} – {{ q.budgetMax ?? ' - ' }}
            </div>
          </div>
          <div class="right">
            <app-countdown [deadline]="q.servicerDeadline" />
            @if (q.myProposalId) {
              <span class="done">Proposal sent</span>
            }
          </div>
        </div>

        @if (!q.myProposalId) {
          <div class="accept-row">
            <button class="btn-primary" (click)="acceptListing(q, $event)" [disabled]="busy()">Accept Job</button>
          </div>
        }

        @if (expanded() === q.quoteId && !q.myProposalId) {
          <form class="propose" (ngSubmit)="propose(q)">
            <input type="number" placeholder="Price (RM)" [(ngModel)]="price" name="price" />
            <input type="number" placeholder="ETA (min)" [(ngModel)]="eta" name="eta" />
            <input placeholder="Message" [(ngModel)]="message" name="message" />
            <button class="btn-primary" type="submit" [disabled]="busy()">Send proposal</button>
          </form>
        }
      </div>
      }
    }
    @if (error()) {
      <p class="err">{{ error() }}</p>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; }
      .search { min-width: 180px; max-width: 260px; border-radius: 999px; padding: 0.45rem 0.85rem; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); font-size: 0.88rem; outline: none; }
      .search:focus { border-color: var(--color-primary); }
      .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
      .chip { background: transparent; border: 1px solid var(--color-border); border-radius: 999px; padding: 0.625rem 0.75rem; font-size: 0.82rem; cursor: pointer; color: var(--color-muted); }
      .chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
      select { border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); padding: 0.4rem 0.6rem; font-size: 0.85rem; outline: none; cursor: pointer; }
      .quote {
        margin-bottom: 0.8rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .quote:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09);
        transform: translateY(-1px);
      }
      .head {
        display: flex;
        justify-content: space-between;
        cursor: pointer;
        border-radius: calc(var(--radius) - 2px);
        padding: 0.25rem;
        margin: -0.25rem;
        transition: background 0.12s ease;
      }
      .head:hover {
        background: rgba(0, 0, 0, 0.03);
      }
      .right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.3rem;
      }
      .done {
        font-size: 0.75rem;
        color: var(--color-success);
      }
      .propose {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.8rem;
        flex-wrap: wrap;
        animation: slide-down 0.18s ease-out both;
      }
      @keyframes slide-down {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .propose input {
        flex: 1;
        min-width: 120px;
      }
      .err {
        color: var(--color-danger);
      }
      .accept-row { margin-top: 0.6rem; display: flex; }
    `,
  ],
})
export class IncomingQuotesComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private socket = inject(SocketService);

  quotes = signal<IncomingQuote[]>([]);
  loading = signal(true);
  expanded = signal<string | null>(null);
  busy = signal(false);
  error = signal('');

  search = signal('');
  responseFilter = signal<'all' | 'new' | 'responded'>('all');
  sort = signal<'recent' | 'budget_desc' | 'budget_asc'>('recent');
  displayQuotes = computed(() => {
    let list = this.quotes();
    const q = this.search().toLowerCase();
    if (q) list = list.filter((qt) => qt.category.toLowerCase().includes(q));
    const rf = this.responseFilter();
    if (rf === 'new') list = list.filter((qt) => !qt.myProposalId);
    else if (rf === 'responded') list = list.filter((qt) => !!qt.myProposalId);
    const s = this.sort();
    if (s === 'recent') list.sort((a, b) => new Date(b.servicerDeadline).getTime() - new Date(a.servicerDeadline).getTime());
    else if (s === 'budget_desc') list.sort((a, b) => (b.budgetMax ?? 0) - (a.budgetMax ?? 0));
    else if (s === 'budget_asc') list.sort((a, b) => (a.budgetMax ?? 0) - (b.budgetMax ?? 0));
    return list;
  });

  price?: number;
  eta?: number;
  message = '';
  private sub?: Subscription;

  ngOnInit(): void {
    this.load();
    this.sub = this.socket.on<{ quoteId: string }>('quote.new').subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private load(): void {
    this.api.get<{ data: IncomingQuote[] }>('/servicer/quotes').subscribe({
      next: (r) => {
        this.quotes.set(r.data);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e.message);
        this.loading.set(false);
      },
    });
  }

  expand(q: IncomingQuote): void {
    const next = this.expanded() === q.quoteId ? null : q.quoteId;
    this.expanded.set(next);
    if (next) {
      this.api.post(`/servicer/quotes/${q.quoteId}/open`, {}).subscribe({ error: () => {} });
    }
  }

  /** One-tap accept: submit a proposal at the listing's computed price. */
  acceptListing(q: IncomingQuote, event: Event): void {
    event.stopPropagation();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.post(`/servicer/quotes/${q.quoteId}/accept-listing`, {}).subscribe({
      next: () => {
        this.busy.set(false);
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        if (e.error?.message?.includes('taken')) {
          this.error.set('Sorry, this job was taken by another servicer.');
          this.load();
        } else {
          this.error.set(e.error?.message ?? e.message ?? 'Could not accept the job.');
        }
      },
    });
  }

  propose(q: IncomingQuote): void {
    if (!this.price || this.price <= 0) {
      this.error.set('Enter a valid price');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api
      .post(`/servicer/quotes/${q.quoteId}/propose`, {
        proposedPrice: this.price,
        etaMinutes: this.eta,
        message: this.message || undefined,
      })
      .subscribe({
        next: () => {
          this.price = undefined;
          this.eta = undefined;
          this.message = '';
          this.expanded.set(null);
          this.busy.set(false);
          this.load();
        },
        error: (e) => {
          this.error.set(e.message ?? 'Could not submit proposal');
          this.busy.set(false);
        },
      });
  }
}
