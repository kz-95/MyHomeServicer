import { Component, Input, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { ModalComponent } from '../../shared/modal.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { ServicerDetailPopupComponent } from '../../shared/servicer-detail-popup.component';

interface Proposal {
  id: string;
  servicer: { id: string; businessName: string; rating: number; logoUrl?: string };
  proposedPrice: number;
  message?: string;
  etaMinutes?: number;
  isAuto: boolean;
  submittedAt: string;
  categoryName?: string;
  categoryIcon?: string;
}

const SKELETON_COUNT = 5;
const STAGGER_MS = 70;

/** Bundled proposals for one quote - the customer picks one to book. */
@Component({
    selector: 'app-proposals',
    host: { class: 'page-enter page-narrow' },
    imports: [CommonModule, FormsModule, ModalComponent, ListToolbarComponent, ServicerDetailPopupComponent],
    template: `
    <h1>Proposals</h1>
    <p class="muted">Compare servicer offers and pick one to create a booking.</p>

    @if (loading()) {
      <div class="skeleton-list">
        @for (s of skeletonSlots; track s; let i = $index) {
          <div class="card proposal skel-card">
            <span class="card-cover"></span>
            <span class="bw-scan1" [style.animation-delay.ms]="(-700 + i * 350) % 1200 - 1200"></span>
            <span class="bw-scan2" [style.animation-delay.ms]="(i * 350) % 1400 - 1400"></span>
            <span class="bw-sweep1" [style.animation-delay.ms]="(-1300 + i * 350) % 1800 - 1800"></span>
            <span class="bw-sweep2" [style.animation-delay.ms]="(-600 + i * 350) % 900 - 900"></span>
          </div>
        }
      </div>
    } @else if (error() && proposals().length === 0) {
      <p class="err">{{ error() }}</p>
    } @else if (proposals().length === 0) {
      <div class="card">
        No proposals in yet. They appear here live as servicers respond.
      </div>
    } @else {
      <app-list-toolbar>
        <input class="search" type="text" placeholder="Search by servicer…" [(ngModel)]="search" name="ps" toolbar-search />
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="filter() === 'all'" (click)="filter.set('all')">All</button>
          <button class="chip" [class.on]="filter() === 'auto'" (click)="filter.set('auto')">Auto</button>
          <button class="chip" [class.on]="filter() === 'manual'" (click)="filter.set('manual')">Manual</button>
        </div>
        <select [(ngModel)]="sort" name="psort" toolbar-sort>
          <option value="recent">Most recent</option>
          <option value="price_asc">Price low-high</option>
          <option value="price_desc">Price high-low</option>
          <option value="rating">Highest rated</option>
        </select>
      </app-list-toolbar>
      @for (p of displayProposals(); track p.id; let idx = $index) {
        @if (idx < revealCount()) {
        <div class="card proposal pp-revealed">
          <div class="info">
            <div class="servicer-head">
              <span class="svc-avatar">
                @if (p.servicer.logoUrl) {
                  <img [src]="p.servicer.logoUrl" [alt]="p.servicer.businessName" class="svc-logo" />
                } @else {
                  <span class="svc-initials">{{ initials(p.servicer.businessName) }}</span>
                }
              </span>
              <button type="button" class="svc-name-btn" (click)="detailServicerId.set(p.servicer.id)">{{ p.servicer.businessName }}</button>
            </div>
            <span class="muted">★ {{ p.servicer.rating | number: '1.1-1' }}</span>
            @if (p.isAuto) {
              <span class="auto">auto</span>
            }
            @if (p.message) {
              <p class="msg">{{ p.message }}</p>
            }
            @if (p.etaMinutes) {
              <span class="muted">ETA ~{{ p.etaMinutes }} min</span>
            }
          </div>
          <div class="action">
            <span class="price">RM {{ p.proposedPrice | number: '1.2-2' }}</span>
            <button class="btn-primary" (click)="confirmSelect(p)" [disabled]="selecting()">
              Select
            </button>
          </div>
        </div>
        }
      }
    }
    @if (error()) {
      <p class="err">{{ error() }}</p>
    }

    @if (pending(); as p) {
      <app-modal
        [open]="true"
        title="Choose this servicer?"
        (closed)="cancelSelect()">
        <p>
          You're about to book
          <span class="servicer-head">
            <span class="svc-avatar">
              @if (p.servicer.logoUrl) {
                <img [src]="p.servicer.logoUrl" [alt]="p.servicer.businessName" class="svc-logo" />
              } @else {
                <span class="svc-initials">{{ initials(p.servicer.businessName) }}</span>
              }
            </span>
            <button type="button" class="svc-name-btn" (click)="detailServicerId.set(p.servicer.id)">{{ p.servicer.businessName }}</button>
          </span>
          for <strong>RM {{ p.proposedPrice | number: '1.2-2' }}</strong>.
        </p>
        <p class="muted">This will create a booking and cannot be undone.</p>
        <div class="modal-acts">
          <button class="btn-ghost" (click)="cancelSelect()" [disabled]="selecting()">Cancel</button>
            <button class="btn-primary" (click)="select(p.id)" [disabled]="selecting()">
              {{ selecting() ? 'Confirming…' : 'Confirm - book this servicer' }}
            </button>
        </div>
      </app-modal>
    }

    <!-- ── Servicer detail popup ──────────────────────────────────────── -->
    <app-servicer-detail-popup [servicerId]="detailServicerId()" (closed)="detailServicerId.set(null)" />
  `,
    styles: [
        `
      .toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; }
      .search { min-width: 180px; max-width: 260px; border-radius: 999px; padding: 0.45rem 0.85rem; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); font-size: 0.88rem; outline: none; }
      .search:focus { border-color: var(--color-primary); }
      .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
      .chip { background: transparent; border: 1px solid var(--color-border); border-radius: 999px; padding: 0.625rem 0.75rem; font-size: 0.82rem; cursor: pointer; color: var(--color-muted); }
      .chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
      select { border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); padding: 0.4rem 0.6rem; font-size: 0.85rem; outline: none; cursor: pointer; }
      .proposal {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.8rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .proposal:hover {
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
      }
      .servicer-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .svc-name-btn {
        background: transparent;
        border: none;
        padding: 0;
        font: inherit;
        font-weight: 700;
        color: var(--color-text);
        cursor: pointer;
        text-align: left;
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
        overflow: hidden;
      }
      .svc-logo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .svc-initials {
        color: #fff;
        font-size: 0.78rem;
        font-weight: 600;
      }
      .msg {
        margin: 0.4rem 0;
      }
      .action {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.5rem;
      }
      .price {
        font-size: 1.2rem;
        font-weight: 700;
      }
      .auto {
        font-size: 0.7rem;
        background: var(--color-primary-light);
        color: var(--color-primary);
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        margin-left: 0.4rem;
      }
      .err {
        color: var(--color-danger);
      }
      .modal-acts {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
        margin-top: 1rem;
      }
      .settle-opt {
        margin: 1rem 0;
      }
      .settle-opt .label {
        font-size: 0.85rem;
        font-weight: 600;
        margin-bottom: 0.4rem;
      }
      .settle-opt .opt {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        margin-bottom: 0.3rem;
        cursor: pointer;
      }
      .card-pay-ok { color: var(--color-success); font-weight: 600; font-size: 0.95rem; }

      /* ── Skeleton + stagger reveal ── */
      .skeleton-list { display: flex; flex-direction: column; gap: 0.8rem; }
      .skel-card {
        position: relative; overflow: hidden; min-height: 72px;
        cursor: default;
        animation: border-glow 1.2s cubic-bezier(0.85, 0, 0.15, 1) infinite;
      }
      .skel-card:hover { transform: none; box-shadow: var(--shadow); }
      .bw-scan1 { width: 30%; }
      .bw-scan2 { width: 45%; }
      .bw-sweep1 { width: 25%; }
      .bw-sweep2 { width: 18%; }
      @keyframes skeleton-spawn {
        from { opacity: 1; }
        to   { opacity: 0; pointer-events: none; }
      }
      .skel-card::after {
        content: "";
        position: absolute; inset: 0; z-index: 10;
        background: var(--color-bg);
        animation: skeleton-spawn 0.1s ease both;
      }
      .skeleton-list > :nth-child(1)::after { animation-delay: 0s; }
      .skeleton-list > :nth-child(2)::after { animation-delay: 0.05s; }
      .skeleton-list > :nth-child(3)::after { animation-delay: 0.1s; }
      .skeleton-list > :nth-child(4)::after { animation-delay: 0.15s; }
      .skeleton-list > :nth-child(5)::after { animation-delay: 0.2s; }
      .card-cover {
        position: absolute; inset: 0; z-index: 4;
        background: var(--color-surface);
        transition: opacity 0.35s ease;
      }
      .card-cover.loaded { opacity: 0; pointer-events: none; }
      @keyframes pp-reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .pp-revealed { animation: pp-reveal 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
      @media (prefers-reduced-motion: reduce) {
        .pp-revealed { animation: none; }
        .skel-card::after { animation: none; opacity: 0; }
      }
    `,
    ]
})
export class ProposalsComponent implements OnInit, OnDestroy {
  @Input() id!: string;

  private api = inject(ApiService);
  private socket = inject(SocketService);
  private router = inject(Router);

  readonly skeletonSlots = Array.from({ length: SKELETON_COUNT }, (_, i) => i);
  revealCount = signal(0);
  private staggerTimer: ReturnType<typeof setInterval> | null = null;

  proposals = signal<Proposal[]>([]);
  /** Servicer id whose detail popup is open, or null. */
  detailServicerId = signal<string | null>(null);
  loading = signal(true);
  selecting = signal(false);
  error = signal('');
  pending = signal<Proposal | null>(null);
  paymentMode = signal<string | null>(null);

  search = signal('');
  filter = signal<'all' | 'auto' | 'manual'>('all');
  sort = signal<'recent' | 'price_asc' | 'price_desc' | 'rating'>('recent');
  displayProposals = computed(() => {
    let list = this.proposals();
    const q = this.search().toLowerCase();
    if (q) list = list.filter((p) => p.servicer.businessName.toLowerCase().includes(q));
    const f = this.filter();
    if (f === 'auto') list = list.filter((p) => p.isAuto);
    else if (f === 'manual') list = list.filter((p) => !p.isAuto);
    const s = this.sort();
    if (s === 'price_asc') list.sort((a, b) => a.proposedPrice - b.proposedPrice);
    else if (s === 'price_desc') list.sort((a, b) => b.proposedPrice - a.proposedPrice);
    else if (s === 'recent') list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    else if (s === 'rating') list.sort((a, b) => b.servicer.rating - a.servicer.rating);
    return list;
  });

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.load();
    this.loadQuote();
    // Live refresh when the quote deadline bundles proposals.
    this.subs.push(
      this.socket.on<{ quoteId: string }>('quote.proposals_ready').subscribe((e) => {
        if (e.quoteId === this.id) this.load();
      }),
      // Live refresh as each individual proposal arrives (manual or auto).
      this.socket.on<{ quoteId: string }>('proposal.submitted').subscribe((e) => {
        if (e.quoteId === this.id) this.load();
      }),
      // Fallback: any new notification while viewing this quote reloads the
      // list, in case the proposal event was missed during a socket reconnect.
      this.socket.on<{ type?: string }>('notification.new').subscribe((e) => {
        if (e?.type === 'orders') this.load();
      }),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.clearStagger();
  }

  private load(): void {
    this.clearStagger();
    this.revealCount.set(0);
    this.api.get<{ data: Proposal[] }>(`/quotes/${this.id}/proposals`).subscribe({
      next: (r) => {
        this.proposals.set(r.data);
        this.loading.set(false);
        this.staggerReveal(r.data.length);
      },
      error: (e) => {
        this.error.set(e.message);
        this.loading.set(false);
      },
    });
  }

  private staggerReveal(total: number): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.revealCount.set(total);
      return;
    }
    let i = 0;
    this.staggerTimer = setInterval(() => {
      i++;
      this.revealCount.set(i);
      if (i >= total) this.clearStagger();
    }, STAGGER_MS);
  }

  private clearStagger(): void {
    if (this.staggerTimer !== null) {
      clearInterval(this.staggerTimer);
      this.staggerTimer = null;
    }
  }

  /** Extract initials from a business name (max 2 chars). */
  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  confirmSelect(p: Proposal): void {
    this.error.set('');
    this.pending.set(p);
  }

  cancelSelect(): void {
    this.pending.set(null);
  }

  private loadQuote(): void {
    this.api.get<{ paymentMode: string }>(`/quotes/${this.id}`).subscribe({
      next: (q) => {
        this.paymentMode.set(q.paymentMode);
      },
    });
  }



  select(proposalId: string): void {
    this.selecting.set(true);
    this.error.set('');
    const body: Record<string, unknown> = { proposalId };
    this.api
      .post<{ bookingId: string }>(`/quotes/${this.id}/select`, body)
      .subscribe({
        next: (r) => this.router.navigate(['/customer/bookings/upcoming'], { queryParams: { id: r.bookingId } }),
        error: (e) => {
          this.error.set(e.message ?? 'Could not select proposal');
          this.selecting.set(false);
        },
      });
  }
}
