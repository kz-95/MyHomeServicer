import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { DemoUnlockService } from '../../core/services/demo-unlock.service';
import { environment } from '../../../environments/environment';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

interface PointsData {
  balance: number;
  lifetimeEarned: number;
  tier: { name: string; bonusPercent: number; progress: number; next: string | null };
}

interface PointsTransaction {
  id: string;
  type: string;
  amount: number;
  balance: number;
  note?: string;
  createdAt: string;
}

interface RewardItem {
  id: string;
  name: string;
  description?: string;
  pointCost: number;
  discountType: string;
  discountValue: number;
  maxDiscount?: number;
  active: boolean;
}

interface Redemption {
  id: string;
  voucherCode: string;
  status: string;
  usedAt?: string;
  expiresAt?: string;
  reward: RewardItem;
}

interface VoucherWithApp extends Redemption {
  _applicable: boolean;
  _reason: string;
  _checking: boolean;
}

@Component({
    selector: 'app-rewards',
    imports: [CommonModule, FormsModule, ListToolbarComponent],
    host: { class: 'page-enter' },
    template: `
    <h1>Rewards</h1>
    <p class="muted">Earn points on every booking and redeem them for perks.</p>

    <!-- Welcome banner -->
    @if (showWelcomeBanner()) {
      <div class="welcome-banner page-child">
        <h3>🎉 Welcome! You have {{ pointsData()?.balance ?? 0 }} free points.</h3>
        <p>Try redeeming one - pick a reward below to start.</p>
        <button class="btn-primary" (click)="dismissWelcome()">Got it, show me rewards</button>
      </div>
    }

    <!-- Points + tier -->
    <div class="card hero page-child">
      <div class="balance">
        <span class="pts">{{ (pointsData()?.balance ?? 0) | number }}</span>
        <span class="pts-label">points</span>
      </div>
      <div class="tier-info">
        <div class="tier-badge" [style.--tier-color]="tierColor()">
          <span class="tier-name">{{ tier()?.name }}</span>
        </div>
        <div class="tier-progress">
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="tierProgress()"></div>
          </div>
          <span class="progress-label">
            @if (nextTier()) {
              {{ tierProgress() | number:'1.0-0' }}% to {{ nextTier() }}
            } @else {
              Max tier reached!
            }
          </span>
        </div>
      </div>
      @if (!environment.production && unlock.unlocked()) {
        <button class="btn-demo demo-points-btn" (click)="demoPoints()" [disabled]="demoPointing()">
          {{ demoPointing() ? 'Adding…' : '✨ Demo: +500 pts' }}
        </button>
      }
    </div>

    @if (redeemSuccess()) {
      <p class="flash page-child">{{ redeemSuccess() }}</p>
    }
    @if (redeemError()) {
      <p class="err page-child">{{ redeemError() }}</p>
    }

    <!-- How to earn -->
    <section class="card page-child">
      <h3>How to earn points</h3>
      <ul class="earn-rates">
        <li>🛒 1 point per RM 1 spent on bookings</li>
        <li>⭐ 50 points for submitting a review</li>
        <li>👥 200 points for referring a friend</li>
        <li>🎉 500 welcome points on signup</li>
      </ul>
      @if (tier()?.bonusPercent) {
        <p class="tier-bonus">Your {{ tier()?.name }} tier: +{{ tier()?.bonusPercent }}% bonus on all earnings!</p>
      }
    </section>

    <!-- Rewards catalog -->
    <section class="card page-child">
      <h3>Redeem your points</h3>
      <app-list-toolbar>
        <input class="search" type="text" [(ngModel)]="rewardQuery" name="rq" placeholder="Search rewards…" toolbar-search />
        <div toolbar-filters>
          <button class="chip" [class.active]="!showRedeemableOnly()" (click)="showRedeemableOnly.set(false)">All</button>
          <button class="chip" [class.active]="showRedeemableOnly()" (click)="showRedeemableOnly.set(true)">I can afford</button>
        </div>
        <select [ngModel]="rewardSortBy()" (ngModelChange)="rewardSortBy.set($event); rewardSortDir.set('asc')" name="rwsort" toolbar-sort>
          <option value="name">Name A-Z</option>
          <option value="cost">Cost low-high</option>
        </select>
        <button class="sort-dir" (click)="rewardSortDir.set(rewardSortDir() === 'asc' ? 'desc' : 'asc')" toolbar-sort>
          {{ rewardSortDir() === 'asc' ? '↑' : '↓' }}
        </button>
      </app-list-toolbar>
      <div class="reward-list">
        @for (r of filteredRewards(); track r.id) {
          <div class="reward-card" [class.affordable]="r.pointCost <= (pointsData()?.balance ?? 0)">
            <div class="reward-info">
              <strong>{{ r.name }}</strong>
              @if (r.description) { <p class="muted">{{ r.description }}</p> }
            </div>
            <div class="reward-action">
              <span class="reward-cost">{{ r.pointCost }} pts</span>
              <button class="btn-primary btn-sm" (click)="redeem(r)"
                      [disabled]="r.pointCost > (pointsData()?.balance ?? 0) || redeeming()">
                Redeem
              </button>
            </div>
          </div>
        } @empty {
          <p class="muted">No rewards available.</p>
        }
      </div>
    </section>

    <!-- My Vouchers -->
    <section class="card page-child">
      <h3>My Vouchers</h3>

      <!-- Voucher search by code -->
      <app-list-toolbar>
        <input class="search" type="text" [(ngModel)]="voucherQuery" name="vq" placeholder="Search voucher code…" toolbar-search />
        <div toolbar-filters>
          <button class="chip" [class.active]="voucherFilter() === 'all'" (click)="voucherFilter.set('all')">All</button>
          <button class="chip" [class.active]="voucherFilter() === 'active'" (click)="voucherFilter.set('active')">Active</button>
          <button class="chip" [class.active]="voucherFilter() === 'used'" (click)="voucherFilter.set('used')">Used</button>
        </div>
      </app-list-toolbar>

      @for (v of filteredVouchers(); track v.id) {
        <div class="voucher-row" [class.voucher-inapplicable]="!v._applicable">
          <div class="voucher-info">
            <span class="voucher-code">{{ v.voucherCode }}</span>
            <span class="voucher-status" [class.used]="v.status === 'used'" [class.expired]="v.status === 'expired'">{{ v.status }}</span>
            <span class="voucher-expiry muted">Expires {{ v.expiresAt | date }}</span>
            @if (v.reward) {
              <span class="voucher-desc muted">{{ v.reward.name }} - {{ formatDiscount(v.reward) }}</span>
            }
            @if (!v._applicable && v.status === 'active') {
              <span class="voucher-reason">{{ v._reason }}</span>
            }
          </div>
          @if (v.status === 'active' && v._applicable) {
            <button class="btn-primary btn-sm voucher-use" (click)="useVoucher(v.voucherCode)">
              Use
            </button>
          }
          @if (v.status === 'active' && !v._applicable) {
            <span class="voucher-na muted">Not applicable</span>
          }
        </div>
      }
      @if (filteredVouchers().length === 0) {
        <p class="muted">No vouchers match your search.</p>
      }
    </section>

    <!-- Activity / Points history -->
    <section class="card page-child">
      <h3>Activity</h3>
      <app-list-toolbar>
        <select [(ngModel)]="historySortBy" name="hssort" toolbar-sort>
          <option value="date">Date</option>
          <option value="amount">Amount</option>
        </select>
        <button class="sort-dir" (click)="historySortDir.set(historySortDir() === 'asc' ? 'desc' : 'asc')" toolbar-sort>
          {{ historySortDir() === 'asc' ? '↑' : '↓' }}
        </button>
      </app-list-toolbar>
      <table class="history-table">
        <thead><tr><th>Date</th><th>Type</th><th>Points</th><th>Note</th></tr></thead>
        <tbody>
          @for (t of sortedHistory(); track t.id) {
            <tr>
              <td class="muted">{{ t.createdAt | date }}</td>
              <td>{{ formatType(t.type) }}</td>
              <td [class.earn]="t.amount > 0" [class.spend]="t.amount < 0">{{ t.amount > 0 ? '+' : '' }}{{ t.amount }}</td>
              <td class="muted">{{ t.note }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="muted">No activity yet.</td></tr>
          }
        </tbody>
      </table>
    </section>
  `,
    styles: [
        `
      :host { display: block; }
      h1 { margin-bottom: 0.2rem; }
      h3 { margin-top: 0; font-size: 1.05rem; }
      section { margin-bottom: 1.4rem; }
      .err { color: var(--color-danger); font-weight: 500; }

      /* Welcome banner */
      .welcome-banner {
        background: var(--color-primary);
        color: #fff;
        border-radius: var(--radius);
        padding: 1rem 1.2rem;
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        animation: page-enter 0.3s ease-out both;
      }
      .welcome-banner h3 { margin: 0; color: #fff; }
      .welcome-banner p { margin: 0; color: rgba(255,255,255,0.85); font-size: 0.9rem; }
      .welcome-banner .btn-primary { align-self: flex-start; margin-top: 0.3rem; background: #fff; color: var(--color-primary); border: none; }
      .welcome-banner .btn-primary:hover { background: rgba(255,255,255,0.9); }

      /* Hero card */
      .hero {
        display: flex;
        align-items: center;
        gap: 2rem;
        flex-wrap: wrap;
        background: var(--color-primary);
        color: #fff;
        border: none;
        transition: box-shadow 0.2s ease, transform 0.2s ease;
      }
      .hero:hover {
        box-shadow: 0 6px 20px rgba(201, 90, 60, 0.3);
        transform: translateY(-2px);
      }
      .balance { display: flex; flex-direction: column; }
      .pts { font-size: 2.4rem; font-weight: 800; line-height: 1; }
      .pts-label { color: rgba(255,255,255,0.8); font-size: 0.85rem; }
      .tier-info { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 0.5rem; }
      .demo-points-btn {
        margin-left: auto; align-self: center;
        background: rgba(255,255,255,0.15); color: #fff;
        border: 1px solid rgba(255,255,255,0.3); border-radius: 999px;
        padding: 0.625rem 1rem; font-size: 0.85rem; cursor: pointer;
        white-space: nowrap; transition: background 0.2s;
      }
      .demo-points-btn:hover { background: rgba(255,255,255,0.25); }
      .demo-points-btn:disabled { opacity: 0.5; cursor: default; }
      .tier-badge {
        display: inline-flex; align-items: center; gap: 0.4rem;
        background: color-mix(in srgb, var(--tier-color, #cd7f32) 25%, transparent);
        color: var(--tier-color, #cd7f32);
        padding: 0.2rem 0.7rem; border-radius: 999px; font-weight: 600; font-size: 0.85rem;
        align-self: flex-start;
      }
      .tier-name { }
      .progress-bar { height: 0.5rem; background: rgba(255,255,255,0.25); border-radius: 999px; overflow: hidden; }
      .progress-fill { height: 100%; background: #fff; border-radius: 999px; transition: width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
      .progress-label { color: rgba(255,255,255,0.85); font-size: 0.82rem; }
      /* DISP-5/§7.6: reward feedback uses brand primary, never success-green. */
      .flash { color: var(--color-primary); font-weight: 600; animation: page-enter 0.2s ease-out both; }

      /* Earn rates */
      .earn-rates { margin: 0.5rem 0 0; padding-left: 1.1rem; line-height: 1.9; }
      .tier-bonus { margin-top: 0.5rem; font-weight: 600; color: var(--color-primary); }

      /* Search */
      .search-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.8rem; }
      .search { flex: 1; min-width: 140px; max-width: 220px; border-radius: 999px; padding: 0.4rem 0.8rem; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); font-size: 0.85rem; outline: none; }
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
      .sort-dir {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.625rem 0.625rem;
        cursor: pointer;
        color: var(--color-muted);
        font-size: 0.85rem;
        line-height: 1;
      }
      .sort-dir:hover { border-color: var(--color-primary); color: var(--color-primary); }
      .history-toolbar {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        margin-bottom: 0.6rem;
      }
      .chip {
        background: transparent; border: 1px solid var(--color-border); border-radius: 999px;
        padding: 0.625rem 0.75rem; font-size: 0.82rem; cursor: pointer; color: var(--color-muted);
        transition: background var(--transition), color var(--transition), border-color var(--transition);
      }
      .chip.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }

      /* Reward list */
      .reward-list { display: flex; flex-direction: column; gap: 0.5rem; }
      .reward-card {
        display: flex; justify-content: space-between; align-items: center; gap: 1rem;
        padding: 0.7rem 0.8rem; border: 1px solid var(--color-border); border-radius: var(--radius);
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .reward-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); transform: translateY(-1px); }
      .reward-card.affordable { border-color: var(--color-primary); }
      .reward-info { display: flex; flex-direction: column; gap: 0.15rem; }
      .reward-info p { margin: 0; font-size: 0.82rem; }
      .reward-action { display: flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
      .reward-cost { font-weight: 700; color: var(--color-primary); font-size: 0.9rem; white-space: nowrap; }
      .btn-sm { font-size: 0.82rem; padding: 0.625rem 0.7rem; }

      /* Vouchers */
      .voucher-row {
        display: flex; align-items: center; gap: 0.8rem; padding: 0.5rem 0;
        border-bottom: 1px solid var(--color-border); font-size: 0.88rem;
        transition: opacity 0.2s;
      }
      .voucher-row:last-of-type { border-bottom: none; }
      .voucher-row.voucher-inapplicable { opacity: 0.5; }
      .voucher-info { display: flex; flex-direction: column; gap: 0.15rem; flex: 1; min-width: 0; }
      .voucher-code { font-family: monospace; font-weight: 600; font-size: 0.85rem; }
      .voucher-status {
        font-size: 0.72rem; padding: 0.1rem 0.5rem; border-radius: 999px;
        background: var(--color-status-completed-bg); color: var(--color-status-completed-text);
        text-transform: capitalize; font-weight: 600;
      }
      .voucher-status.used { background: var(--color-status-cancelled-bg); color: var(--color-status-cancelled-text); }
      .voucher-status.expired { background: var(--color-bg); color: var(--color-muted); }
      .voucher-expiry { font-size: 0.8rem; }
      .voucher-desc { font-size: 0.78rem; }
      .voucher-reason { font-size: 0.78rem; color: var(--color-danger); font-weight: 500; }
      .voucher-na { font-size: 0.8rem; font-style: italic; }
      .voucher-use { font-size: 0.82rem; padding: 0.625rem 0.7rem; white-space: nowrap; }

      /* History */
      .history-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
      .history-table th, .history-table td { text-align: left; padding: 0.5rem 0.4rem; border-bottom: 1px solid var(--color-border); }
      .history-table th { font-weight: 600; color: var(--color-muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
      .history-table .earn { color: var(--color-success); font-weight: 700; }
      .history-table .spend { color: var(--color-danger); font-weight: 700; }

      /* Mobile */
      @media (max-width: 560px) {
        .hero { flex-direction: column; align-items: flex-start; gap: 1.2rem; }
        .tier-info { min-width: unset; width: 100%; }
        .pts { font-size: 2rem; }
        .reward-card { flex-direction: column; align-items: flex-start; gap: 0.5rem; }
      }
    `,
    ]
})

export class RewardsComponent implements OnInit {
  protected environment = environment;
  private api = inject(ApiService);
  private router = inject(Router);
  protected readonly unlock = inject(DemoUnlockService);

  pointsData = signal<PointsData | null>(null);
  demoPointing = signal(false);
  history = signal<PointsTransaction[]>([]);
  rewards = signal<RewardItem[]>([]);
  myRedemptions = signal<Redemption[]>([]);
  redeeming = signal(false);
  redeemSuccess = signal('');
  redeemError = signal('');

  rewardQuery = signal('');
  showRedeemableOnly = signal(false);
  showWelcomeBanner = signal(false);
  rewardSortBy = signal<'name' | 'cost'>('name');
  rewardSortDir = signal<'asc' | 'desc'>('asc');
  historySortBy = signal<'date' | 'amount'>('date');
  historySortDir = signal<'desc' | 'asc'>('desc');

  // Voucher search + applicability
  voucherQuery = signal('');
  voucherFilter = signal<'all' | 'active' | 'used'>('all');

  filteredRewards = computed(() => {
    let list = this.rewards().filter((r) => r.active);
    const q = this.rewardQuery().toLowerCase();
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q));
    if (this.showRedeemableOnly()) {
      const balance = this.pointsData()?.balance ?? 0;
      list = list.filter((r) => r.pointCost <= balance);
    }
    const field = this.rewardSortBy();
    const dir = this.rewardSortDir();
    list = [...list].sort((a, b) => {
      let cmp: number;
      if (field === 'cost') {
        cmp = a.pointCost - b.pointCost;
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return dir === 'desc' ? -cmp : cmp;
    });
    return list;
  });

  sortedHistory = computed(() => {
    const list = [...this.history()];
    const field = this.historySortBy();
    const dir = this.historySortDir();
    list.sort((a, b) => {
      let cmp: number;
      if (field === 'amount') {
        cmp = Math.abs(a.amount) - Math.abs(b.amount);
      } else {
        cmp = a.createdAt.localeCompare(b.createdAt);
      }
      return dir === 'desc' ? -cmp : cmp;
    });
    return list;
  });

  /** Filtered vouchers with applicability checks applied. */
  filteredVouchers = computed<VoucherWithApp[]>(() => {
    let list = this.myRedemptions().map((r) => ({
      ...r,
      _applicable: false,
      _reason: '',
      _checking: false,
    }));

    // Search filter
    const q = this.voucherQuery().toLowerCase();
    if (q) list = list.filter((v) => v.voucherCode.toLowerCase().includes(q));

    // Status filter
    const f = this.voucherFilter();
    if (f === 'active') list = list.filter((v) => v.status === 'active');
    if (f === 'used') list = list.filter((v) => v.status === 'used' || v.status === 'expired');

    // Applicability: only active vouchers need checking
    return list.map((v) => {
      if (v.status !== 'active') return { ...v, _applicable: false, _reason: v.status === 'used' ? 'Already used' : 'Expired' };
      if (v.expiresAt && new Date(v.expiresAt) < new Date()) return { ...v, _applicable: false, _reason: 'Expired' };

      // For topup vouchers, check minTopup (flag as applicable since we don't have context here)
      // For booking_percent/waiver, always applicable
      return { ...v, _applicable: true, _reason: '' };
    });
  });

  formatDiscount(r: RewardItem): string {
    if (r.discountType === 'topup_fixed') return `RM ${r.discountValue} off top-up`;
    if (r.discountType === 'booking_percent') {
      const s = `${r.discountValue}% off booking`;
      return r.maxDiscount ? `${s} (max RM ${r.maxDiscount})` : s;
    }
    if (r.discountType === 'waiver') return 'Fee waiver';
    return '';
  }

  useVoucher(code: string): void {
    this.router.navigate(['/customer/quote/new'], { queryParams: { promoCode: code } });
  }

  tier = computed(() => this.pointsData()?.tier ?? null);
  nextTier = computed(() => this.pointsData()?.tier.next ?? null);
  tierProgress = computed(() => this.pointsData()?.tier.progress ?? 0);
  tierColor = computed(() => {
    const name = this.tier()?.name ?? '';
    const colors: Record<string, string> = { bronze: '#cd7f32', silver: '#c0c0c0', gold: '#ffd700', platinum: '#e5e4e2' };
    return colors[name.toLowerCase()] ?? '#cd7f32';
  });

  ngOnInit(): void {
    this.loadPoints();
    this.loadHistory();
    this.loadRewards();
    this.loadRedemptions();
    this.checkWelcome();
  }

  private loadPoints(): void {
    this.api.get<PointsData>('/user/me/points').subscribe({
      next: (r) => this.pointsData.set(r),
      error: () => {},
    });
  }

  private loadHistory(): void {
    this.api.get<{ data: PointsTransaction[] }>('/user/me/points/history').subscribe({
      next: (r) => this.history.set(r.data ?? []),
      error: () => {},
    });
  }

  private loadRewards(): void {
    this.api.get<{ data: RewardItem[] }>('/rewards').subscribe({
      next: (r) => this.rewards.set(r.data ?? []),
      error: () => {},
    });
  }

  private loadRedemptions(): void {
    this.api.get<{ data: Redemption[] }>('/user/me/rewards').subscribe({
      next: (r) => this.myRedemptions.set(r.data ?? []),
      error: () => {},
    });
  }

  private checkWelcome(): void {
    const dismissed = localStorage.getItem('rewards_welcome_seen');
    if (dismissed) return;
    this.api.get<{ show: boolean; points: number }>('/user/me/rewards/prompt').subscribe({
      next: (r) => {
        if (r.show && r.points > 0) {
          this.showWelcomeBanner.set(true);
        }
      },
      error: () => {},
    });
  }

  dismissWelcome(): void {
    this.showWelcomeBanner.set(false);
    localStorage.setItem('rewards_welcome_seen', 'true');
  }

  redeem(r: RewardItem): void {
    this.redeemSuccess.set('');
    this.redeemError.set('');
    if ((this.pointsData()?.balance ?? 0) < r.pointCost) return;
    this.redeeming.set(true);
    this.api.post<{ voucherCode: string }>(`/user/me/rewards/${r.id}/redeem`, {}).subscribe({
      next: () => {
        this.redeeming.set(false);
        this.redeemSuccess.set(`Redeemed "${r.name}"! Voucher code generated.`);
        setTimeout(() => this.redeemSuccess.set(''), 6000);
        this.loadPoints();
        this.loadRedemptions();
        this.loadHistory();
      },
      error: (e) => {
        this.redeeming.set(false);
        this.redeemError.set(e.message ?? 'Redemption failed.');
      },
    });
  }

  demoPoints(): void {
    this.demoPointing.set(true);
    this.api.post<{ awarded: number }>('/dev/points', {}).subscribe({
      next: () => {
        this.demoPointing.set(false);
        this.loadPoints();
        this.loadHistory();
      },
      error: () => this.demoPointing.set(false),
    });
  }

  formatType(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
