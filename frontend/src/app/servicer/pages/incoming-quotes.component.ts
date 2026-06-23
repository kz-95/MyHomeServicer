import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { CountdownComponent } from '../../shared/countdown-timer.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { ModalComponent } from '../../shared/modal.component';

interface IncomingQuote {
  quoteId: string;
  category: string;
  timeSlot: string;
  preferredDate: string;
  propertyType?: string;
  budgetMin?: number;
  budgetMax?: number;
  paymentMode?: 'pay_now' | 'pay_later' | 'cash';
  derivedStatus: string;
  status: string;
  servicerDeadline: string;
  myProposalId?: string | null;
  // Added 2026-06-23 (already sent by listIncomingQuotes):
  isUrgent?: boolean;
  urgentFee?: number | null;
  customerName?: string;
  customerAvatarUrl?: string | null;
  address?: string | null;
  postcode?: string | null;
  district?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
  descriptions?: string[];
  images?: string[];
  slotJobs?: { count: number };
}

/**
 * Servicer incoming-quotes feed. New quotes arrive live over Socket.io;
 * the servicer expands one (which marks it opened) and submits a proposal.
 */
@Component({
  selector: 'app-incoming-quotes',
  standalone: true,
  host: { class: 'page-enter page-narrow' },
  imports: [CommonModule, FormsModule, CountdownComponent, ListToolbarComponent, ModalComponent],
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
      <div class="card quote" [class.urgent]="q.isUrgent">
        <div
          class="head"
          role="button"
          tabindex="0"
          (click)="expand(q)"
          (keydown.enter)="expand(q)"
        >
          <div class="cat">
            <strong>{{ q.category }}</strong>
            @if (q.isUrgent) { <span class="tag-urgent">Urgent +RM{{ q.urgentFee }}</span> }
          </div>
          <div class="right">
            <app-countdown [deadline]="q.servicerDeadline" />
            @if (q.myProposalId) { <span class="done">Proposal sent</span> }
          </div>
        </div>

        <div class="facts">
          <div class="fact price">RM {{ q.budgetMin ?? '—' }} – {{ q.budgetMax ?? '—' }}
            @if (q.paymentMode) { <span class="pay">· {{ q.paymentMode === 'pay_now' ? 'Pay now' : (q.paymentMode === 'cash' ? 'Cash' : 'Pay later') }}</span> }
          </div>
          <div class="fact time">{{ q.preferredDate | date: 'EEE, MMM d' }} · {{ slotLabel(q.timeSlot) }}
            @if (q.slotJobs && q.slotJobs.count > 0) {
              <span class="slot-load">🟡 {{ q.slotJobs.count }} job(s) this slot</span>
            } @else {
              <span class="slot-free">🟢 Free this slot</span>
            }
          </div>
          <div class="fact place">{{ placeLine(q) }}
            @if (q.address) { <div class="addr muted">{{ q.address }}</div> }
          </div>
        </div>

        <div class="chips-row">
          @if (q.propertyType) { <span class="chip-static">{{ q.propertyType }}</span> }
          <button type="button" class="map-link" (click)="openMap(q, 'google'); $event.stopPropagation()">View on map ↗</button>
        </div>

        @if (!q.myProposalId) {
          <div class="accept-row">
            <button class="btn-primary" (click)="acceptListing(q, $event)" [disabled]="busy()">Accept Job</button>
          </div>
        }

        @if (expanded() === q.quoteId) {
          <div class="details" (click)="$event.stopPropagation()">
            @if (q.customerName) {
              <div class="cust">
                @if (q.customerAvatarUrl) { <img class="avatar" [src]="q.customerAvatarUrl" alt="" /> }
                <span>{{ q.customerName }}</span>
              </div>
            }
            @if (q.descriptions?.length) {
              <ul class="answers">@for (d of q.descriptions; track d) { <li>{{ d }}</li> }</ul>
            }
            @if (q.notes) { <p class="notes">"{{ q.notes }}"</p> }
            @if (q.images?.length) {
              <div class="qimgs">
                @for (url of q.images; track url) {
                  <img class="qimg" [src]="url" alt="job photo" (click)="lightbox.set(url); $event.stopPropagation()" />
                }
              </div>
            }

            @if (!q.myProposalId) {
              <form class="propose" (ngSubmit)="propose(q)">
                <input type="number" placeholder="Price (RM)" [(ngModel)]="price" name="price" />
                <input type="number" placeholder="ETA (min)" [(ngModel)]="eta" name="eta" />
                <input placeholder="Message" [(ngModel)]="message" name="message" />
                <button class="btn-primary" type="submit" [disabled]="busy()">Send proposal</button>
              </form>
            }
          </div>
        }
      </div>
      }
    }
    @if (error()) {
      <p class="err">{{ error() }}</p>
    }

    <!-- Image lightbox (top-layer <app-modal>) -->
    <app-modal [open]="!!lightbox()" title="Photo" (closed)="lightbox.set(null)">
      @if (lightbox(); as url) {
        <img [src]="url" alt="" style="width:100%; max-height:70dvh; object-fit:contain;" />
      }
    </app-modal>
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
      .quote.urgent { border-left: 3px solid var(--color-danger); }
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
      .cat { display: flex; align-items: center; gap: 0.5rem; }
      .tag-urgent { font-size: 0.7rem; font-weight: 700; color: #fff; background: var(--color-danger); padding: 0.1rem 0.4rem; border-radius: 999px; }
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
      .facts { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.6rem 0; }
      .fact { font-size: 1.05rem; font-weight: 600; color: var(--color-text); }
      .fact.price { color: var(--color-primary); font-size: 1.15rem; }
      .fact .pay, .fact .slot-load, .fact .slot-free { font-size: 0.8rem; font-weight: 500; margin-left: 0.4rem; }
      .slot-load { color: var(--color-muted); }
      .slot-free { color: var(--color-success); }
      .addr { font-size: 0.8rem; font-weight: 400; }
      .chips-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0; }
      .chip-static { font-size: 0.75rem; border: 1px solid var(--color-border); border-radius: 999px; padding: 0.15rem 0.5rem; color: var(--color-muted); }
      .map-link { background: none; border: none; color: var(--color-primary); cursor: pointer; font-size: 0.85rem; padding: 0; }
      .map-link:hover { text-decoration: underline; }
      .details { margin-top: 0.7rem; border-top: 1px solid var(--color-border); padding-top: 0.6rem; animation: slide-down 0.18s ease-out both; }
      .cust { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
      .avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
      .answers { margin: 0.3rem 0; padding-left: 1.1rem; font-size: 0.85rem; color: var(--color-muted); }
      .notes { font-size: 0.85rem; font-style: italic; color: var(--color-muted); }
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
      .qimgs { display: flex; gap: 0.5rem; flex-wrap: wrap; }
      .qimg { width: 72px; height: 72px; object-fit: cover; border-radius: var(--radius); border: 1px solid var(--color-border); cursor: pointer; transition: transform 0.12s ease; }
      .qimg:hover { transform: scale(1.08); }
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
  lightbox = signal<string | null>(null);

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
  private subMatched?: Subscription;

  ngOnInit(): void {
    this.load();
    this.sub = this.socket.on<{ quoteId: string }>('quote.new').subscribe(() => this.load());
    this.subMatched = this.socket.on<{ quoteId: string }>('quote.matched').subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.subMatched?.unsubscribe();
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

  // ── Card helpers ────────────────────────────────────────────────────────

  /** Friendly slot label (matches the customer-facing ranges). */
  slotLabel(slot: string): string {
    const map: Record<string, string> = {
      morning: 'Morning (9–11)', noon: 'Noon (11–13)', afternoon: 'Afternoon (13–15)',
      evening: 'Evening (15–17)', night: 'Night (17–22)',
    };
    return map[slot] ?? slot;
  }

  /** Composed location text for the card (district/state line). */
  placeLine(q: IncomingQuote): string {
    return [q.district, q.state].filter(Boolean).join(', ') || (q.address ?? 'Location on accept');
  }

  /** Open the job location in the user's maps app (new tab; mobile → native app).
   *  Uses the address string so it works even when lat/lng are absent. */
  openMap(q: IncomingQuote, app: 'google' | 'waze'): void {
    const query = encodeURIComponent([q.address, q.district, q.state, q.postcode].filter(Boolean).join(', '));
    const hasCoords = q.lat != null && q.lng != null;
    const url = app === 'waze'
      ? (hasCoords ? `https://waze.com/ul?ll=${q.lat},${q.lng}&navigate=yes` : `https://waze.com/ul?q=${query}`)
      : (hasCoords ? `https://www.google.com/maps/search/?api=1&query=${q.lat},${q.lng}` : `https://www.google.com/maps/search/?api=1&query=${query}`);
    window.open(url, '_blank', 'noopener');
  }
}
