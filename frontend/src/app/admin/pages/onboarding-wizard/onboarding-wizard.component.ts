import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { routeFor } from '../../../core/route-for';
import { LerpNumberDirective } from '../../../shared/lerp-number.directive';
import { StatCardComponent } from './stat-card.component';
import { MoneyCounterComponent } from './money-counter.component';
import { LerpBarComponent } from './lerp-bar.component';

/* ── Data shapes (mirror dashboard component) ────────────── */
interface Dashboard {
  servicers: number;
  bookings: number;
  completedBookings: number;
  platformRevenue: number;
  queues: {
    openReports: number;
    pendingAppeals: number;
    pendingWithdrawals: number;
    pendingCategoryRequests: number;
  };
}

interface FinancialDashboard {
  totalTopUps: number;
  totalCommission: number;
  totalEscrow: number;
  categoryBreakdown: { name: string; revenue: number }[];
}

interface CustomerLeader {
  name: string;
  bookingCount: number;
  totalSpent: number;
}

interface ServicerLeader {
  name: string;
  businessName: string;
  jobCount: number;
  revenue: number;
}

const TOTAL_STEPS = 5;

@Component({
  selector: 'app-onboarding-wizard',
  standalone: true,
  imports: [LerpNumberDirective, StatCardComponent, MoneyCounterComponent, LerpBarComponent],
  template: `
    <div class="wiz-root">
      <h1 class="wiz-title">Platform Overview</h1>

      <!-- ── Step dots ───────────────────────────────────── -->
      <nav class="wiz-nav">
        @for (s of stepNumbers; track s) {
          <button
            class="wiz-dot"
            [class.active]="currentStep() === s"
            [class.done]="completedSteps().includes(s)"
            [disabled]="navLocked() && currentStep() !== s"
            (click)="goToStep(s)">
            {{ s }}
          </button>
        }
        <!-- connecting line behind dots -->
        <div class="wiz-line"></div>
      </nav>

      <!-- ── Page 1: Stat cards ──────────────────────────── -->
      @if (currentStep() === 1) {
        <div class="wiz-page page-enter">
          <p class="wiz-desc">Key metrics across the platform, counting up live.</p>
          <div class="sc-grid">
            @for (card of page1Cards(); track card.label; let i = $index) {
              <app-stat-card
                [icon]="card.icon"
                [label]="card.label"
                [value]="card.value"
                [hint]="card.hint"
                [active]="i <= page1ActiveIdx()"
                [duration]="1400"
                (done)="onPage1CardDone(i)" />
            }
          </div>
        </div>
      }

      <!-- ── Page 2: Financial + bars ────────────────────── -->
      @if (currentStep() === 2) {
        <div class="wiz-page page-enter">
          <p class="wiz-desc">Revenue in motion — watch the milestones light up.</p>
          <div class="mc-row">
            @for (m of page2MoneyCards(); track m.label; let i = $index) {
              <app-money-counter
                [label]="m.label"
                [value]="m.value"
                [sub]="m.sub"
                [active]="i <= page2MoneyIdx()"
                [duration]="2000"
                (done)="onPage2MoneyDone(i)" />
            }
          </div>
          @if (page2MoneyDone()) {
            <div class="lb-section">
              <h3 class="lb-head">Revenue by Category</h3>
              @for (b of page2Bars(); track b.label; let i = $index) {
                <app-lerp-bar
                  [label]="b.label"
                  [value]="b.pct"
                  [barColor]="barColors[i % barColors.length]"
                  [active]="page2MoneyDone()"
                  [duration]="1600" />
              }
            </div>
          }
        </div>
      }

      <!-- ── Page 3: Top 3 customers + servicers ─────────── -->
      @if (currentStep() === 3) {
        <div class="wiz-page page-enter">
          <p class="wiz-desc">Top performers driving the marketplace.</p>
          <div class="ld-duo">
            <!-- Customers -->
            <div class="ld-col">
              <h3 class="ld-head">Top Customers</h3>
              @for (c of topCustomers(); track c.name; let i = $index) {
                <div class="ld-card" [class.visible]="i <= page3ActiveIdx()">
                  <div class="ld-rank">#{{ i + 1 }}</div>
                  <div class="ld-name">{{ c.name }}</div>
                  <div class="ld-stats">
                    <span>{{ c.bookingCount }} bookings</span>
                    <span class="ld-val" [appLerpNumber]="c.totalSpent" [lerpActive]="i <= page3ActiveIdx()" [lerpDuration]="1000" [lerpPrefix]="'RM '" (lerpDone)="onPage3CardDone(i)"></span>
                  </div>
                </div>
              }
            </div>
            <!-- Servicers -->
            <div class="ld-col">
              <h3 class="ld-head">Top Servicers</h3>
              @for (s of topServicers(); track s.name; let i = $index) {
                <div class="ld-card" [class.visible]="i <= page3ActiveIdx()">
                  <div class="ld-rank">#{{ i + 1 }}</div>
                  <div class="ld-name">{{ s.name }}</div>
                  @if (s.businessName) { <div class="ld-biz">{{ s.businessName }}</div> }
                  <div class="ld-stats">
                    <span>{{ s.jobCount }} jobs</span>
                    <span class="ld-val" [appLerpNumber]="s.revenue" [lerpActive]="i <= page3ActiveIdx()" [lerpDuration]="1000" [lerpPrefix]="'RM '" (lerpDone)="onPage3CardDone(i)"></span>
                  </div>
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- ── Page 4: Queue overview ──────────────────────── -->
      @if (currentStep() === 4) {
        <div class="wiz-page page-enter">
          <p class="wiz-desc">Pending actions requiring admin attention.</p>
          <div class="sc-grid sc-grid-4">
            @for (q of page4Queues(); track q.label) {
              <app-stat-card
                [icon]="q.icon"
                [label]="q.label"
                [value]="q.value"
                [active]="currentStep() === 4"
                [duration]="1000"
                (done)="onPage4Done()" />
            }
          </div>
        </div>
      }

      <!-- ── Page 5: All done ────────────────────────────── -->
      @if (currentStep() === 5) {
        <div class="wiz-page page-enter wiz-final">
          <div class="wiz-check">&#10003;</div>
          <h2>Setup Complete</h2>
          <p>You can now freely explore the dashboard. All navigation is unlocked.</p>
          <button class="btn-primary" (click)="finish()">Go to Dashboard</button>
        </div>
      }

      <!-- ── Bottom bar ──────────────────────────────────── -->
      @if (currentStep() !== 5) {
        <div class="wiz-actions">
          <button class="btn-ghost" [disabled]="currentStep() === 1" (click)="prev()">Previous</button>
          <button class="btn-primary" [disabled]="!canAdvance()" (click)="next()">
            {{ currentStep() === TOTAL_STEPS ? 'Finish' : 'Next' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .wiz-root {
      max-width: 800px;
      margin: 2rem auto;
      padding: 1rem 1.5rem 3rem;
    }
    .wiz-title {
      text-align: center;
      margin-bottom: 0.3rem;
    }
    .wiz-desc {
      text-align: center;
      color: var(--color-muted);
      font-size: 0.9rem;
      margin-bottom: 1.5rem;
    }

    /* ── Step dots ──────────────────────────────────── */
    .wiz-nav {
      position: relative;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 0 auto 2.5rem;
      max-width: 420px;
      padding: 0 0.5rem;
    }
    .wiz-dot {
      position: relative;
      z-index: 1;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 2px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-muted);
      font-weight: 700;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }
    .wiz-dot.active {
      border-color: var(--color-primary);
      background: var(--color-primary);
      color: #fff;
      box-shadow: 0 0 10px rgba(224, 122, 58, 0.35);
    }
    .wiz-dot.done {
      border-color: var(--color-success);
      background: var(--color-success-bg);
      color: var(--color-success);
    }
    .wiz-dot:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
    .wiz-dot.done:disabled {
      opacity: 0.7;
      cursor: pointer;
    }
    .wiz-line {
      position: absolute;
      top: 50%;
      left: 10%;
      right: 10%;
      height: 2px;
      background: var(--color-border);
      transform: translateY(-50%);
      z-index: 0;
    }

    /* ── Pages ───────────────────────────────────────── */
    .wiz-page {
      min-height: 320px;
    }
    .wiz-final {
      text-align: center;
      padding-top: 2rem;
    }
    .wiz-check {
      font-size: 3rem;
      color: var(--color-success);
      margin-bottom: 0.5rem;
    }

    /* ── Stat card grid ──────────────────────────────── */
    .sc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
    }
    .sc-grid-4 {
      grid-template-columns: repeat(2, 1fr);
      max-width: 500px;
      margin: 0 auto;
    }

    /* ── Money counter row ───────────────────────────── */
    .mc-row {
      display: flex;
      gap: 1rem;
      justify-content: center;
      flex-wrap: wrap;
      margin-bottom: 2rem;
    }
    .mc-row > * {
      flex: 1;
      min-width: 200px;
      max-width: 260px;
    }

    /* ── Lerp bars section ───────────────────────────── */
    .lb-section {
      max-width: 550px;
      margin: 0 auto;
    }
    .lb-head {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-muted);
      margin-bottom: 0.75rem;
      text-align: center;
    }

    /* ── Leaderboard duo (page 3) ─────────────────────── */
    .ld-duo {
      display: flex;
      gap: 1.5rem;
      align-items: flex-start;
    }
    .ld-col {
      flex: 1;
    }
    .ld-head {
      font-size: 0.85rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-muted);
      margin-bottom: 0.75rem;
      text-align: center;
    }
    .ld-card {
      opacity: 0;
      transform: translateY(8px);
      transition: opacity 0.4s ease, transform 0.4s ease, border-color 0.3s, box-shadow 0.3s;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 0.8rem 1rem;
      margin-bottom: 0.6rem;
    }
    .ld-card.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .ld-rank {
      font-size: 0.7rem;
      font-weight: 800;
      color: var(--color-primary);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .ld-name {
      font-weight: 600;
      font-size: 1rem;
      color: var(--color-text);
      margin-top: 0.1rem;
    }
    .ld-biz {
      font-size: 0.75rem;
      color: var(--color-muted);
    }
    .ld-stats {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-top: 0.35rem;
      font-size: 0.8rem;
      color: var(--color-muted);
    }
    .ld-val {
      font-weight: 700;
      color: var(--color-text);
    }
    /* lerp states on leaderboard values */
    .ld-val.lerping {
      color: var(--color-primary);
      text-shadow: 0 0 8px rgba(224, 122, 58, 0.3);
    }
    .ld-val.complete {
      color: var(--color-success);
    }
    .ld-val.skipped {
      color: var(--color-warning);
    }

    /* ── Actions ─────────────────────────────────────── */
    .wiz-actions {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin-top: 2.5rem;
    }

    /* ── Responsive ──────────────────────────────────── */
    @media (max-width: 640px) {
      .ld-duo { flex-direction: column; }
      .mc-row > * { max-width: 100%; }
      .sc-grid { grid-template-columns: 1fr 1fr; }
      .wiz-nav { max-width: 320px; }
      .wiz-dot { width: 32px; height: 32px; font-size: 0.8rem; }
    }
  `],
})
export class OnboardingWizardComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);

  /* ── Step state ─────────────────────────────────────── */
  readonly TOTAL_STEPS = TOTAL_STEPS;
  readonly stepNumbers = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);
  readonly currentStep = signal(1);
  readonly completedSteps = signal<number[]>([]);
  /** True = nav is locked (dots disabled). Unlocks after ALL 5 steps done. */
  readonly navLocked = computed(() => this.completedSteps().length < TOTAL_STEPS);

  /* ── Advance gating: all cards on current page done? ── */
  readonly canAdvance = signal(false);

  /* ── API data ────────────────────────────────────────── */
  readonly dash = signal<Dashboard | null>(null);
  readonly fin = signal<FinancialDashboard | null>(null);
  readonly loading = signal(true);

  /* ── Page 1: card reveal sequence ───────────────────── */
  readonly page1ActiveIdx = signal(-1);
  readonly page1Cards = computed(() => {
    const d = this.dash();
    if (!d) return [];
    return [
      { icon: '\u{1F527}', label: 'Total Servicers', value: d.servicers, hint: 'Registered providers' },
      { icon: '\u{1F4C5}', label: 'Total Bookings', value: d.bookings, hint: 'All time' },
      { icon: '\u{2705}', label: 'Completed', value: d.completedBookings, hint: 'Successfully finished' },
      { icon: '\u{1F4B0}', label: 'Platform Revenue', value: d.platformRevenue, hint: 'RM total' },
    ];
  });

  /* ── Page 2: money counters + bars ──────────────────── */
  readonly page2MoneyIdx = signal(-1);
  readonly page2MoneyDone = signal(false);
  readonly page2MoneyCards = computed(() => {
    const f = this.fin();
    if (!f) return [];
    return [
      { label: 'Total Top-ups', value: f.totalTopUps, sub: 'Customer wallet loads' },
      { label: 'Commission Earned', value: f.totalCommission, sub: 'Platform fee revenue' },
      { label: 'Total Escrow', value: f.totalEscrow, sub: 'Funds held in trust' },
    ];
  });

  readonly barColors = ['#e07a3a', '#4a8c5c', '#c4903a', '#7a5a8c', '#3a7a8c', '#b9423a'];

  readonly page2Bars = computed(() => {
    const f = this.fin();
    if (!f || !f.categoryBreakdown.length) return [];
    const total = f.categoryBreakdown.reduce((s, c) => s + c.revenue, 0) || 1;
    return f.categoryBreakdown
      .slice(0, 6)
      .map((c) => ({ label: c.name, pct: Math.round((c.revenue / total) * 100) }));
  });

  /* ── Page 3: top performers ─────────────────────────── */
  readonly page3ActiveIdx = signal(-1);
  readonly topCustomers = computed<CustomerLeader[]>(() => {
    return (this.fin() as any)?.customerLeaderboard?.slice(0, 3) ?? [];
  });
  readonly topServicers = computed<ServicerLeader[]>(() => {
    return (this.fin() as any)?.servicerLeaderboard?.slice(0, 3) ?? [];
  });

  /* ── Page 4: queue counts ───────────────────────────── */
  readonly page4Queues = computed(() => {
    const d = this.dash();
    if (!d) return [];
    return [
      { icon: '\u{1F6A8}', label: 'Open Reports', value: d.queues?.openReports ?? 0 },
      { icon: '\u{1F4DD}', label: 'Pending Appeals', value: d.queues?.pendingAppeals ?? 0 },
      { icon: '\u{1F4B8}', label: 'Withdrawals', value: d.queues?.pendingWithdrawals ?? 0 },
      { icon: '\u{1F4E2}', label: 'Category Requests', value: d.queues?.pendingCategoryRequests ?? 0 },
    ];
  });
  private page4DoneCount = 0;

  /* ── Init ───────────────────────────────────────────── */
  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);
    // Fetch both in parallel
    this.api.get<{ data: Dashboard }>('/admin/dashboard').subscribe({
      next: (r) => {
        this.dash.set(r.data ?? r as any);
        this.checkLoading();
      },
      error: () => this.checkLoading(),
    });
    this.api.get<{ data: FinancialDashboard }>('/admin/dashboard/financial', { days: 30 }).subscribe({
      next: (r) => {
        this.fin.set(r.data ?? r as any);
        this.checkLoading();
      },
      error: () => this.checkLoading(),
    });
  }

  private checkLoading(): void {
    if (this.dash() && this.fin()) {
      this.loading.set(false);
      // Start page 1 card sequence after a short delay
      setTimeout(() => this.advancePage1Card(), 400);
    }
  }

  /* ── Navigation ──────────────────────────────────────── */
  canNavigateTo(s: number): boolean {
    if (!this.navLocked()) return true;
    return s === this.currentStep();
  }

  goToStep(s: number): void {
    if (this.navLocked() && s !== this.currentStep()) return;
    this.currentStep.set(s);
    if (s === 1) this.resetAndStartPage1();
  }

  prev(): void {
    if (this.currentStep() > 1) {
      this.currentStep.update((v) => v - 1);
    }
  }

  next(): void {
    const cur = this.currentStep();
    if (cur < TOTAL_STEPS) {
      const nextStep = cur + 1;
      // Mark current as completed
      if (!this.completedSteps().includes(cur)) {
        this.completedSteps.update((a) => [...a, cur]);
      }
      this.currentStep.set(nextStep);
      this.canAdvance.set(false);

      // Trigger next page's animation
      if (nextStep === 2) {
        setTimeout(() => this.advancePage2Card(), 400);
      } else if (nextStep === 3) {
        setTimeout(() => this.advancePage3Card(), 400);
      } else if (nextStep === 5) {
        // Final step – mark as completed when user finishes
        if (!this.completedSteps().includes(TOTAL_STEPS)) {
          this.completedSteps.update((a) => [...a, TOTAL_STEPS]);
        }
      }
    }
  }

  finish(): void {
    this.router.navigate([routeFor('admin')]);
  }

  /* ── Page 1: card-by-card reveal ────────────────────── */
  private resetAndStartPage1(): void {
    this.page1ActiveIdx.set(-1);
    setTimeout(() => this.advancePage1Card(), 300);
  }

  private advancePage1Card(): void {
    this.page1ActiveIdx.update((v) => v + 1);
  }

  onPage1CardDone(idx: number): void {
    const cards = this.page1Cards();
    if (idx < cards.length - 1) {
      setTimeout(() => this.advancePage1Card(), 250);
    } else {
      this.canAdvance.set(true);
    }
  }

  /* ── Page 2: money counters then bars ───────────────── */
  private advancePage2Card(): void {
    this.page2MoneyIdx.update((v) => v + 1);
  }

  onPage2MoneyDone(idx: number): void {
    const cards = this.page2MoneyCards();
    if (idx < cards.length - 1) {
      setTimeout(() => this.advancePage2Card(), 300);
    } else {
      this.page2MoneyDone.set(true);
      // Bars auto-appear (their active is bound to page2MoneyDone)
      // Wait for bar animation + enable Next
      setTimeout(() => this.canAdvance.set(true), 2000);
    }
  }

  /* ── Page 3: leaderboard cards ──────────────────────── */
  private advancePage3Card(): void {
    this.page3ActiveIdx.update((v) => v + 1);
  }

  onPage3CardDone(idx: number): void {
    const maxRows = Math.max(this.topCustomers().length, this.topServicers().length);
    if (idx < maxRows - 1) {
      setTimeout(() => this.advancePage3Card(), 250);
    } else {
      this.canAdvance.set(true);
    }
  }

  /* ── Page 4: queue cards (all at once) ──────────────── */
  onPage4Done(): void {
    this.page4DoneCount++;
    if (this.page4DoneCount >= this.page4Queues().length) {
      this.canAdvance.set(true);
    }
  }
}
