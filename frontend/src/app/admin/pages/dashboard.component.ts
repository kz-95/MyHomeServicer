import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { ApiService } from '../../core/services/api.service';

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

interface CategoryBreakdown {
  categoryId: string;
  name: string;
  count: number;
  revenue: number;
  fees: number;
}

interface DailyRevenuePoint {
  date: string;
  revenue: number;
  fees: number;
  count: number;
}

interface FinancialDashboard {
  totalTopUps: number;
  totalFees: number;
  totalEscrow: number;
  pendingPayouts: number;
  todayTopUps: number;
  todayFees: number;
  urgentFeeRevenue: number;
  urgentFeePlatformShare: number;
  categoryBreakdown: CategoryBreakdown[];
  dailyRevenue: DailyRevenuePoint[];
}

/** Admin dashboard — platform stats, pending queues, financial overview with revenue chart. */
@Component({
  selector: 'app-admin-dashboard',
  host: { class: 'page-enter' },
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <h1>Admin dashboard</h1>

    <!-- Financial overview cards -->
    @if (finData(); as fd) {
      <div class="grid page-child">
        <div class="card stat">
          <span class="n">RM {{ fd.totalTopUps + fd.totalFees | number:'1.2-2' }}</span>
          <span class="muted">Total Revenue</span>
        </div>
        <div class="card stat">
          <span class="n">RM {{ fd.totalFees | number:'1.2-2' }}</span>
          <span class="muted">Platform Fees</span>
        </div>
        <div class="card stat">
          <span class="n">RM {{ fd.totalEscrow | number:'1.2-2' }}</span>
          <span class="muted">Escrow Held</span>
        </div>
        <div class="card stat">
          <span class="n">RM {{ fd.pendingPayouts | number:'1.2-2' }}</span>
          <span class="muted">Pending Payouts</span>
        </div>
      </div>

      <!-- Today + Urgent row -->
      <div class="today-urgent page-child">
        <div class="card tu-card">
          <span class="n sm">RM {{ fd.todayTopUps + fd.todayFees | number:'1.2-2' }}</span>
          <span class="muted">Today</span>
          <div class="tu-detail">
            <span>Top-ups: RM {{ fd.todayTopUps | number:'1.2-2' }}</span>
            <span class="sep">|</span>
            <span>Fees: RM {{ fd.todayFees | number:'1.2-2' }}</span>
          </div>
        </div>
        <div class="card tu-card urgent-highlight">
          <span class="n sm urgent-n">RM {{ fd.urgentFeeRevenue | number:'1.2-2' }}</span>
          <span class="muted">Urgent Fee Revenue</span>
          <span class="tu-detail">Platform share: RM {{ fd.urgentFeePlatformShare | number:'1.2-2' }}</span>
        </div>
      </div>
    }

    <!-- Category filter chips -->
    <div class="cat-chips">
      <button class="chip" [class.active]="!dashCategoryId()" (click)="dashCategoryId.set(''); reloadDashboard()">All</button>
      @for (cat of topCategories(); track cat.id) {
        <button class="chip" [class.active]="dashCategoryId() === cat.id" (click)="dashCategoryId.set(cat.id); reloadDashboard()">{{ cat.name }}</button>
      }
    </div>

    <!-- Pending queues -->
    @if (data(); as d) {
      <h2>Pending queues</h2>
      <div class="grid page-child">
        <a class="card stat" routerLink="/admin/queues" [queryParams]="{tab:'withdrawals'}" title="Review withdrawals">
          <span class="n">{{ d.queues.pendingWithdrawals }}</span>
          <span class="muted">Withdrawals</span>
        </a>
        <a class="card stat" routerLink="/admin/queues" [queryParams]="{tab:'appeals'}" title="Review appeals">
          <span class="n warn">{{ d.queues.pendingAppeals }}</span>
          <span class="muted">Appeals</span>
        </a>
        <a class="card stat" routerLink="/admin/queues" [queryParams]="{tab:'category'}" title="Review category requests">
          <span class="n">{{ d.queues.pendingCategoryRequests }}</span>
          <span class="muted">Category requests</span>
        </a>
        <a class="card stat" routerLink="/admin/queues" [queryParams]="{tab:'reports'}" title="View open reports">
          <span class="n warn">{{ d.queues.openReports }}</span>
          <span class="muted">Open reports</span>
        </a>
      </div>
    }

    <!-- Revenue chart -->
    @if (finData(); as fd) {
      <div class="chart-head">
        <h2>Revenue &amp; Fees</h2>
        <div class="range-toggle">
          <button class="range-btn" [class.on]="financialDays() === 7" (click)="setFinancialRange(7)">7d</button>
          <button class="range-btn" [class.on]="financialDays() === 30" (click)="setFinancialRange(30)">30d</button>
          <button class="range-btn" [class.on]="financialDays() === 90" (click)="setFinancialRange(90)">90d</button>
        </div>
      </div>
      <div class="card chart-card page-child">
        @if (finLoading()) {
          <p class="muted">Loading chart…</p>
        } @else if (fd.dailyRevenue.length) {
          <div class="chart-wrap">
            <!-- Legend -->
            <div class="chart-legend">
              <span class="legend-item"><span class="legend-dot rev"></span>Revenue</span>
              <span class="legend-item"><span class="legend-dot fee"></span>Fees</span>
            </div>
            <svg class="chart-svg" [attr.viewBox]="'0 0 ' + chartW + ' ' + chartH" preserveAspectRatio="none">
              <!-- Grid lines -->
              @for (line of gridLines(); track line.y) {
                <line [attr.x1]="padL" [attr.y1]="line.y" [attr.x2]="chartW - padR" [attr.y2]="line.y" class="grid-line" />
                <text [attr.x]="padL - 6" [attr.y]="line.y + 4" class="axis-label" text-anchor="end">{{ line.label }}</text>
              }
              <!-- Revenue line (solid) -->
              <polyline [attr.points]="revenueLine()" class="line-rev" />
              <!-- Fees line (dashed) -->
              <polyline [attr.points]="feesLine()" class="line-fee" />
              <!-- X-axis date labels -->
              @for (xl of xLabels(); track xl.x) {
                <text [attr.x]="xl.x" [attr.y]="chartH - 4" class="axis-label x-label" text-anchor="middle">{{ xl.label | date:'M/d' }}</text>
              }
            </svg>
          </div>
          <p class="chart-total muted">
            Total revenue: <strong>RM {{ revenueTotal() | number:'1.2-2' }}</strong>
            &middot; Fees: <strong>RM {{ feesTotal() | number:'1.2-2' }}</strong>
          </p>
        } @else {
          <p class="muted">No revenue data yet — bookings will populate this chart.</p>
        }
      </div>

      <!-- Category breakdown -->
      <h2>Category breakdown</h2>
      <div class="card cat-breakdown page-child">
        @if (fd.categoryBreakdown.length) {
          <table class="cb-table">
            <thead>
              <tr>
                <th>Category</th>
                <th class="num">Bookings</th>
                <th class="num">Revenue</th>
                <th class="num">Fees</th>
              </tr>
            </thead>
            <tbody>
              @for (row of fd.categoryBreakdown; track row.categoryId) {
                <tr>
                  <td>{{ row.name }}</td>
                  <td class="num">{{ row.count }}</td>
                  <td class="num">RM {{ row.revenue | number:'1.2-2' }}</td>
                  <td class="num">RM {{ row.fees | number:'1.2-2' }}</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="muted">No category data yet.</p>
        }
      </div>
    }

    <!-- Loading / error states -->
    @if (finLoading() && !finData() && !loadFailed()) {
      <p class="muted">Loading dashboard…</p>
    }
    @if (finFailed()) {
      <p class="err">Could not load financial data. Please refresh the page.</p>
    }
    @if (loadFailed()) {
      <p class="err">Could not load dashboard queues. Please refresh the page.</p>
    }
  `,
  styles: [
    `
      :host { display: block; }
      h2 { margin-top: 1.6rem; font-size: 1rem; font-weight: 600; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 1rem;
        margin: 1rem 0;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        transition: box-shadow var(--transition), transform var(--transition);
        text-decoration: none;
        color: inherit;
      }
      a.stat { cursor: pointer; }
      a.stat:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
        transform: translateY(-2px);
      }
      .stat:not(a):hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09);
        transform: translateY(-2px);
      }
      .n {
        font-size: 1.6rem;
        font-weight: 700;
        color: var(--color-primary);
      }
      .n.sm { font-size: 1.3rem; }
      .n.warn { color: var(--color-warning, #d97706); }
      .urgent-n { color: var(--color-danger, #dc2626); }
      .err { color: var(--color-danger); font-size: 0.9rem; }

      /* Today + Urgent row */
      .today-urgent {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 1rem;
        margin: 1rem 0;
      }
      .tu-card {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .tu-detail {
        font-size: 0.8rem;
        color: var(--color-muted);
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .tu-detail .sep { opacity: 0.4; }
      .urgent-highlight {
        border-left: 3px solid var(--color-danger, #dc2626);
      }

      /* Category chips */
      .cat-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin: 1rem 0;
      }
      .chip {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 20px;
        padding: 0.3rem 0.8rem;
        font-size: 0.8rem;
        font-family: inherit;
        cursor: pointer;
        color: var(--color-text);
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }
      .chip:hover { border-color: var(--color-primary); }
      .chip.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }

      /* Chart header with range toggle */
      .chart-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 1.6rem;
      }
      .chart-head h2 { margin: 0; }
      .range-toggle {
        display: flex;
        gap: 0;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        overflow: hidden;
        width: fit-content;
        margin: 0.3rem 0;
      }
      .range-btn {
        background: transparent;
        border: none;
        padding: 0.25rem 0.7rem;
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .range-btn:hover { background: var(--color-bg); }
      .range-btn.on { background: var(--color-primary); color: #fff; }

      /* Chart card */
      .chart-card { padding: 1rem 1.25rem 0.5rem; overflow: hidden; }
      .chart-wrap { width: 100%; overflow: hidden; }
      .chart-svg { width: 100%; display: block; }

      /* Chart legend */
      .chart-legend {
        display: flex;
        gap: 1.25rem;
        margin-bottom: 0.5rem;
        font-size: 0.8rem;
        color: var(--color-muted);
      }
      .legend-item { display: inline-flex; align-items: center; gap: 0.35rem; }
      .legend-dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }
      .legend-dot.rev { background: var(--color-primary); }
      .legend-dot.fee { background: var(--color-warning, #d97706); }

      /* Line chart polylines */
      .line-rev {
        fill: none;
        stroke: var(--color-primary);
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .line-fee {
        fill: none;
        stroke: var(--color-warning, #d97706);
        stroke-width: 2;
        stroke-dasharray: 6 3;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* Grid & axis */
      .grid-line { stroke: var(--color-border); stroke-width: 0.5; }
      .axis-label {
        font-size: 9px;
        fill: var(--color-muted);
        font-family: inherit;
      }
      .x-label { font-size: 8px; }
      .chart-total { margin-top: 0.5rem; font-size: 0.85rem; }

      /* Category breakdown table */
      .cat-breakdown { padding: 0.75rem 1rem; }
      .cb-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .cb-table th {
        text-align: left;
        font-weight: 600;
        color: var(--color-muted);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 0.4rem 0.5rem;
        border-bottom: 1px solid var(--color-border);
      }
      .cb-table td {
        padding: 0.45rem 0.5rem;
        border-bottom: 1px solid var(--color-border);
      }
      .cb-table tbody tr:last-child td { border-bottom: none; }
      .cb-table .num { text-align: right; white-space: nowrap; }

      /* Tablet / mobile: 2 cols */
      @media (max-width: 600px) {
        .grid { grid-template-columns: 1fr 1fr; }
        .today-urgent { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);

  // ── Old dashboard (queues) ──────────────────────────────────────────
  data = signal<Dashboard | null>(null);
  loadFailed = signal(false);

  // ── Financial dashboard ─────────────────────────────────────────────
  finData = signal<FinancialDashboard | null>(null);
  finLoading = signal(true);
  finFailed = signal(false);

  // ── Chart ───────────────────────────────────────────────────────────
  readonly chartH = 140;
  readonly padL = 48;
  readonly padR = 12;
  readonly padT = 14;
  readonly padB = 22;
  chartW = 600;

  revenueLine = signal('');
  feesLine = signal('');
  gridLines = signal<{ y: number; label: string }[]>([]);
  xLabels = signal<{ x: number; label: string }[]>([]);

  financialDays = signal(30);
  revenueTotal = signal(0);
  feesTotal = signal(0);

  // ── Category filter ─────────────────────────────────────────────────
  dashCategoryId = signal('');
  dashCategories = signal<{ id: string; name: string; parentCategoryId: string | null }[]>([]);
  topCategories = computed(() => this.dashCategories().filter((c) => !c.parentCategoryId));
  labelInterval = computed(() => (this.financialDays() > 20 ? 5 : 1));

  // ── Lifecycle ───────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadDashboard();
    this.loadCategories();
    this.loadFinancial(30, '');
  }

  // ── Public actions ──────────────────────────────────────────────────
  setFinancialRange(days: number): void {
    this.financialDays.set(days);
    this.loadFinancial(days, this.dashCategoryId());
  }

  reloadDashboard(): void {
    this.loadDashboard();
    this.loadFinancial(this.financialDays(), this.dashCategoryId());
  }

  // ── Data loading ────────────────────────────────────────────────────
  private loadCategories(): void {
    this.api
      .get<{ data: { id: string; name: string; parentCategoryId: string | null }[] }>('/admin/categories')
      .subscribe({ next: (r) => this.dashCategories.set(r.data) });
  }

  private loadDashboard(): void {
    const p: Record<string, string> = {};
    if (this.dashCategoryId()) p['categoryId'] = this.dashCategoryId();
    this.api.get<Dashboard>('/admin/dashboard', p).subscribe({
      next: (d) => this.data.set(d),
      error: () => this.loadFailed.set(true),
    });
  }

  private loadFinancial(days: number, categoryId: string): void {
    this.finLoading.set(true);
    const params: Record<string, string | number> = { days };
    if (categoryId) params['categoryId'] = categoryId;
    this.api
      .get<FinancialDashboard>('/admin/dashboard/financial', params as Record<string, string>)
      .subscribe({
        next: (d) => {
          this.finData.set(d);
          this.finLoading.set(false);
          this.finFailed.set(false);
          this.buildLineChart(d.dailyRevenue);
        },
        error: () => {
          this.finLoading.set(false);
          this.finFailed.set(true);
        },
      });
  }

  // ── Chart builder ───────────────────────────────────────────────────
  private buildLineChart(data: DailyRevenuePoint[]): void {
    if (!data.length) {
      this.revenueLine.set('');
      this.feesLine.set('');
      this.gridLines.set([]);
      this.xLabels.set([]);
      this.revenueTotal.set(0);
      this.feesTotal.set(0);
      return;
    }

    const revTotal = data.reduce((s, d) => s + d.revenue, 0);
    const feeTotal = data.reduce((s, d) => s + d.fees, 0);
    this.revenueTotal.set(revTotal);
    this.feesTotal.set(feeTotal);

    const maxVal = Math.max(...data.map((d) => Math.max(d.revenue, d.fees)), 1);
    const n = data.length;
    const innerW = this.chartW - this.padL - this.padR;
    const innerH = this.chartH - this.padT - this.padB;
    const stepX = n > 1 ? innerW / (n - 1) : innerW / 2;

    const fmt = (v: number) => v.toFixed(1);

    this.revenueLine.set(
      data
        .map((d, i) => {
          const x = this.padL + i * stepX;
          const y = this.padT + innerH - (d.revenue / maxVal) * innerH;
          return `${fmt(x)},${fmt(y)}`;
        })
        .join(' '),
    );

    this.feesLine.set(
      data
        .map((d, i) => {
          const x = this.padL + i * stepX;
          const y = this.padT + innerH - (d.fees / maxVal) * innerH;
          return `${fmt(x)},${fmt(y)}`;
        })
        .join(' '),
    );

    this.gridLines.set(
      [0.25, 0.5, 0.75, 1].map((frac) => ({
        y: this.padT + innerH * (1 - frac),
        label: `RM${this.formatK(maxVal * frac)}`,
      })),
    );

    const interval = this.labelInterval();
    this.xLabels.set(
      data
        .map((d, i) => ({ x: this.padL + i * stepX, label: d.date }))
        .filter((_, i) => i % interval === 0),
    );
  }

  private formatK(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0);
  }
}
