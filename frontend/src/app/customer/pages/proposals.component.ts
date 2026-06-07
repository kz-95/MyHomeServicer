import { Component, Input, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { ModalComponent } from '../../shared/modal.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { IconComponent } from '../../shared/icon.component';
import { StripeCardFormComponent } from '../../shared/stripe-card-form.component';

interface Proposal {
  id: string;
  merchant: { id: string; businessName: string; rating: number; logoUrl?: string };
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
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, ModalComponent, ListToolbarComponent, IconComponent, StripeCardFormComponent],
    template: `
    <h1>Proposals</h1>
    <p class="muted">Compare merchant offers and pick one to create a booking.</p>

    @if (loading()) {
      <div class="skeleton-list">
        @for (s of skeletonSlots; track s) {
          <div class="card proposal skel-card">
            <span class="bw-scan"></span>
            <span class="bw-sweep"></span>
          </div>
        }
      </div>
    } @else if (error() && proposals().length === 0) {
      <p class="err">{{ error() }}</p>
    } @else if (proposals().length === 0) {
      <div class="card">
        No proposals in yet. They appear here live as merchants respond.
      </div>
    } @else {
      <app-list-toolbar>
        <input class="search" type="text" placeholder="Search by merchant…" [(ngModel)]="search" name="ps" toolbar-search />
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
            <div class="merchant-head">
              <span class="svc-avatar"><app-icon [name]="(p.categoryIcon || 'home')" sizeToken="md" stroke="#fff" strokeWidth="1.5" /></span>
              <strong>{{ p.merchant.businessName }}</strong>
            </div>
            <span class="muted">★ {{ p.merchant.rating | number: '1.1-1' }}</span>
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
        title="Choose this merchant?"
        (closed)="cancelSelect()">
        <p>
          You're about to book <strong>{{ p.merchant.businessName }}</strong>
          for <strong>RM {{ p.proposedPrice | number: '1.2-2' }}</strong>.
        </p>
        <p class="muted">This will create a booking and cannot be undone.</p>
        @if (paymentMode() && paymentMode() !== 'pay_now') {
          <div class="settle-opt">
            <p class="label">Settlement method</p>
            <label class="opt">
              <input type="radio" name="settlementMethod" [checked]="settlementMethod() === 'credit'" (change)="settlementMethod.set('credit')" />
              Credit / card
            </label>
            <label class="opt">
              <input type="radio" name="settlementMethod" [checked]="settlementMethod() === 'cash'" (change)="settlementMethod.set('cash')" />
              Cash on completion
            </label>
          </div>
        }
        @if (paymentMode() === 'pay_now') {
          <div class="settle-opt">
            <p class="label">Payment method</p>
            <label class="opt">
              <input type="radio" name="payNowMethod" [checked]="selectedSettlementMethod() === 'credit' || (selectedSettlementMethod() !== 'gateway')" (change)="selectedSettlementMethod.set('credit'); cardStep.set('idle')" />
              Wallet credit
            </label>
            <label class="opt">
              <input type="radio" name="payNowMethod" [checked]="selectedSettlementMethod() === 'gateway'" (change)="selectedSettlementMethod.set('gateway'); initCardPayment(p.proposedPrice)" />
              Credit / Debit card
            </label>
          </div>
        }
        @if (paymentMode() === 'pay_now' && selectedSettlementMethod() === 'gateway') {
          @if (cardStep() === 'intent_loading') {
            <p class="muted">Preparing payment…</p>
          } @else if (cardStep() === 'intent_ready' && clientSecret()) {
            <app-stripe-card-form
              [clientSecret]="clientSecret()!"
              [amount]="p.proposedPrice"
              [loading]="false"
              (paymentSuccess)="onCardPaymentSuccess()"
              (paymentError)="onCardPaymentError($event)"
              (cancel)="cancelCardPayment()"
            />
          } @else if (cardStep() === 'success') {
            <p class="card-pay-ok">✓ Payment successful!</p>
          } @else if (cardStep() === 'error') {
            <p class="err">{{ cardErrorMsg() }}</p>
            <button class="btn-ghost" (click)="initCardPayment(p.proposedPrice)">Try again</button>
          }
        }
        <div class="modal-acts">
          <button class="btn-ghost" (click)="cancelSelect()" [disabled]="selecting()">Cancel</button>
          @if (!(paymentMode() === 'pay_now' && selectedSettlementMethod() === 'gateway')) {
            <button class="btn-primary" (click)="select(p.id)" [disabled]="selecting()">
              {{ selecting() ? 'Confirming…' : 'Confirm - book this merchant' }}
            </button>
          }
        </div>
      </app-modal>
    }
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
      .merchant-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
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
        animation: pp-border-glow 1.2s cubic-bezier(0.85, 0, 0.15, 1) infinite;
      }
      .skel-card:hover { transform: none; box-shadow: var(--shadow); }
      @keyframes pp-border-glow {
        0%, 100% { border-color: var(--color-border); box-shadow: var(--shadow); }
        50%       { border-color: rgba(240,160,30,0.35); box-shadow: 0 0 0 1.5px rgba(240,160,30,0.12), var(--shadow-md); }
      }
      @keyframes pp-scan1 { 0% { transform: skewX(-24deg) translateX(-98%); } 100% { transform: skewX(-24deg) translateX(245%); } }
      @keyframes pp-scan2 { 0% { transform: skewX(-24deg) translateX(-53%); } 100% { transform: skewX(-24deg) translateX(107%); } }
      @keyframes pp-sweep1 { 0% { transform: skewX(-24deg) translateX(-103%); } 100% { transform: skewX(-24deg) translateX(295%); } }
      @keyframes pp-sweep2 { 0% { transform: skewX(-24deg) translateX(-53%); } 100% { transform: skewX(-24deg) translateX(118%); } }
      .bw-scan, .bw-sweep {
        position: absolute; top: 0; height: 100%; z-index: 5; pointer-events: none; will-change: transform;
      }
      .bw-scan::before, .bw-sweep::before { content: ''; position: absolute; top: 0; height: 100%; pointer-events: none; will-change: transform; }
      .bw-scan { width: 41%; background: linear-gradient(to right, transparent 0%, rgba(180,140,255,0.06) 25%, rgba(240,160,30,0.12) 50%, rgba(180,140,255,0.06) 75%, transparent 100%); animation: pp-scan1 0.9s linear infinite; }
      .bw-scan::before { width: 94%; background: linear-gradient(to right, transparent 0%, rgba(140,210,255,0.08) 30%, rgba(240,160,30,0.14) 50%, rgba(140,210,255,0.08) 70%, transparent 100%); animation: pp-scan2 1.4s linear infinite; }
      .bw-sweep { width: 34%; background: linear-gradient(to right, transparent 0%, rgba(255,180,180,0.06) 25%, rgba(240,160,30,0.12) 50%, rgba(255,180,180,0.06) 75%, transparent 100%); animation: pp-sweep1 1.8s linear infinite; }
      .bw-sweep::before { width: 85%; background: linear-gradient(to right, transparent 0%, rgba(180,220,255,0.08) 30%, rgba(240,160,30,0.14) 50%, rgba(180,220,255,0.08) 70%, transparent 100%); animation: pp-sweep2 1.5s linear infinite; }
      .skel-card:nth-child(1) .bw-scan, .skel-card:nth-child(1) .bw-sweep { animation-delay: 0s; }
      .skel-card:nth-child(2) .bw-scan, .skel-card:nth-child(2) .bw-sweep { animation-delay: 0.15s; }
      .skel-card:nth-child(3) .bw-scan, .skel-card:nth-child(3) .bw-sweep { animation-delay: 0.3s; }
      .skel-card:nth-child(4) .bw-scan, .skel-card:nth-child(4) .bw-sweep { animation-delay: 0.45s; }
      .skel-card:nth-child(5) .bw-scan, .skel-card:nth-child(5) .bw-sweep { animation-delay: 0.6s; }
      @keyframes pp-reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .pp-revealed { animation: pp-reveal 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
      @media (prefers-reduced-motion: reduce) {
        .bw-scan, .bw-sweep, .bw-scan::before, .bw-sweep::before { animation: none; }
        .skel-card { animation: none; }
        .pp-revealed { animation: none; }
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
  loading = signal(true);
  selecting = signal(false);
  error = signal('');
  pending = signal<Proposal | null>(null);
  paymentMode = signal<string | null>(null);
  settlementMethod = signal<'credit' | 'cash' | null>(null);

  search = signal('');
  filter = signal<'all' | 'auto' | 'manual'>('all');
  sort = signal<'recent' | 'price_asc' | 'price_desc' | 'rating'>('recent');
  displayProposals = computed(() => {
    let list = this.proposals();
    const q = this.search().toLowerCase();
    if (q) list = list.filter((p) => p.merchant.businessName.toLowerCase().includes(q));
    const f = this.filter();
    if (f === 'auto') list = list.filter((p) => p.isAuto);
    else if (f === 'manual') list = list.filter((p) => !p.isAuto);
    const s = this.sort();
    if (s === 'price_asc') list.sort((a, b) => a.proposedPrice - b.proposedPrice);
    else if (s === 'price_desc') list.sort((a, b) => b.proposedPrice - a.proposedPrice);
    else if (s === 'recent') list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    else if (s === 'rating') list.sort((a, b) => b.merchant.rating - a.merchant.rating);
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
        if (q.paymentMode !== 'pay_now') {
          this.settlementMethod.set('credit');
        }
      },
    });
  }

  // ── Card payment for gateway pay_now ──────────────────────────────────
  cardStep = signal<'idle' | 'intent_loading' | 'intent_ready' | 'success' | 'error'>('idle');
  clientSecret = signal<string | null>(null);
  cardErrorMsg = signal('');
  cardPaymentDone = signal(false);

  selectedSettlementMethod = signal<'credit' | 'cash' | 'gateway' | null>(null);

  async initCardPayment(amount: number): Promise<void> {
    this.cardStep.set('intent_loading');
    this.cardErrorMsg.set('');
    this.clientSecret.set(null);
    try {
      const res = await firstValueFrom(this.api.post<{ clientSecret: string }>('/stripe/create-payment-intent', { amount }));
      if (res?.clientSecret) {
        this.clientSecret.set(res.clientSecret);
        this.cardStep.set('intent_ready');
      } else {
        this.cardStep.set('error');
        this.cardErrorMsg.set('Could not initiate payment. Please try again.');
      }
    } catch {
      this.cardStep.set('error');
      this.cardErrorMsg.set('Could not initiate payment. Please try again.');
    }
  }

  onCardPaymentSuccess(): void {
    this.cardStep.set('success');
    this.cardPaymentDone.set(true);
    // Proceed with booking
    const p = this.pending();
    if (p) this.select(p.id);
  }

  onCardPaymentError(msg: string): void {
    this.cardErrorMsg.set(msg);
  }

  cancelCardPayment(): void {
    this.cardStep.set('idle');
    this.clientSecret.set(null);
    this.selectedSettlementMethod.set('credit');
  }

  select(proposalId: string): void {
    this.selecting.set(true);
    this.error.set('');
    const body: Record<string, unknown> = { proposalId };
    if (this.paymentMode() !== 'pay_now' && this.settlementMethod()) {
      body['settlementMethod'] = this.settlementMethod();
    }
    if (this.paymentMode() === 'pay_now' && this.selectedSettlementMethod() === 'gateway') {
      body['settlementMethod'] = 'gateway';
    }
    this.api
      .post<{ bookingId: string }>(`/quotes/${this.id}/select`, body)
      .subscribe({
        next: (r) => this.router.navigate(['/customer/bookings'], { queryParams: { id: r.bookingId } }),
        error: (e) => {
          this.error.set(e.message ?? 'Could not select proposal');
          this.selecting.set(false);
        },
      });
  }
}
