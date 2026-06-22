import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
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

interface RevenueDay {
  date: string;
  revenue: number;
}

/** Admin dashboard - platform stats, pending-queue counts, and 30-day revenue chart. */
@Component({
    selector: 'app-admin-dashboard',
    host: { class: 'page-enter' },
    imports: [CommonModule, RouterLink],
    template: `
    <h1>Admin dashboard</h1>
    @if (data(); as d) {
      <div class="grid page-child">
        <a class="card stat" routerLink="/admin/users" [queryParams]="{tab:'servicer'}" title="View all servicers">
          <span class="n">{{ d.servicers }}</span>
          <span class="muted">Servicers</span>
        </a>
        <div class="card stat">
          <span class="n">{{ d.bookings }}</span>
          <span class="muted">Total bookings</span>
        </div>
        <div class="card stat">
          <span class="n">{{ d.completedBookings }}</span>
          <span class="muted">Completed</span>
        </div>
        <div class="card stat revenue-stat">
          <span class="n">RM {{ d.platformRevenue | number: '1.2-2' }}</span>
          <span class="muted">Platform revenue</span>
        </div>
      </div>

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

      <!-- Revenue chart -->
      <div class="chart-head">
        <h2>Platform revenue</h2>
        <div class="range-toggle">
          <button class="range-btn" [class.on]="revenueDays() === 7" (click)="setRevenueRange(7)">7 days</button>
          <button class="range-btn" [class.on]="revenueDays() === 30" (click)="setRevenueRange(30)">30 days</button>
        </div>
      </div>
      <div class="card chart-card page-child">
        @if (revenueLoading()) {
          <p class="muted">Loading chart…</p>
        } @else if (revenueData().length) {
          <div class="chart-wrap">
            <svg class="chart-svg" [attr.viewBox]="'0 0 ' + chartW + ' ' + chartH" preserveAspectRatio="none">
              <!-- Grid lines -->
              @for (line of gridLines(); track line.y) {
                <line [attr.x1]="padL" [attr.y1]="line.y" [attr.x2]="chartW - padR" [attr.y2]="line.y" class="grid-line" />
                <text [attr.x]="padL - 6" [attr.y]="line.y + 4" class="axis-label" text-anchor="end">{{ line.label }}</text>
              }
              <!-- Bars -->
              @for (bar of bars(); track bar.date; let i = $index) {
                <rect
                  [attr.x]="bar.x"
                  [attr.y]="bar.y"
                  [attr.width]="bar.w"
                  [attr.height]="bar.h"
                  class="bar"
                  [class.bar-zero]="bar.revenue === 0"
                >
                  <title>{{ bar.date }}: RM {{ bar.revenue | number:'1.2-2' }}</title>
                </rect>
              }
              <!-- X-axis date labels -->
              @for (bar of bars(); track bar.date; let i = $index) {
                @if (i % labelInterval() === 0) {
                  <text [attr.x]="bar.x + bar.w / 2" [attr.y]="chartH - 2" class="axis-label x-label" text-anchor="middle">
                    {{ bar.date | date:'MMM d' }}
                  </text>
                }
              }
            </svg>
          </div>
          <p class="chart-total muted">Total: <strong>RM {{ revenueTotal() | number:'1.2-2' }}</strong></p>
        } @else {
          <p class="muted">No revenue data yet - bookings will populate this chart.</p>
        }
      </div>
    } @else if (loadFailed()) {
      <p class="err">Could not load dashboard. Please refresh the page.</p>
    } @else {
      <p class="muted">Loading dashboard…</p>
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
      .n.warn { color: var(--color-warning, #d97706); }
      .err { color: var(--color-danger); font-size: 0.9rem; }

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

      /* Revenue chart */
      .chart-card { padding: 1rem 1.25rem 0.5rem; overflow: hidden; }
      .chart-wrap { width: 100%; overflow: hidden; }
      .chart-svg { width: 100%; display: block; }
      .bar {
        fill: var(--color-primary);
        opacity: 0.75;
        transition: opacity 0.15s ease;
      }
      .bar:hover { opacity: 1; }
      .bar-zero { fill: var(--color-border); opacity: 1; }
      .grid-line { stroke: var(--color-border); stroke-width: 0.5; }
      .axis-label {
        font-size: 9px;
        fill: var(--color-muted);
        font-family: inherit;
      }
      .x-label { font-size: 8px; }
      .chart-total { margin-top: 0.5rem; font-size: 0.85rem; }

      /* Tablet / mobile: 2 cols */
      @media (max-width: 600px) {
        .grid { grid-template-columns: 1fr 1fr; }
      }
    `,
    ]
})
export class AdminDashboardComponent implements OnInit {
  private api = inject(ApiService);

  data = signal<Dashboard | null>(null);
  loadFailed = signal(false);
  revenueData = signal<RevenueDay[]>([]);
  revenueLoading = signal(true);

  // Chart geometry - width adapts to bar count so the viewBox fits the container.
  readonly chartH = 110;
  readonly padL = 40;
  readonly padR = 8;
  readonly padT = 8;
  readonly padB = 18;
  chartW = 600;

  revenueTotal = signal(0);
  bars = signal<{ date: string; revenue: number; x: number; y: number; w: number; h: number }[]>([]);
  gridLines = signal<{ y: number; label: string }[]>([]);
  revenueDays = signal(30);
  labelInterval = computed(() => this.revenueDays() > 20 ? 5 : 1);

  setRevenueRange(days: number): void {
    this.revenueDays.set(days);
    this.revenueLoading.set(true);
    this.api.get<{ data: RevenueDay[] }>('/admin/dashboard/revenue', { days: String(days) }).subscribe({
      next: ({ data }) => {
        this.revenueData.set(data);
        this.revenueLoading.set(false);
        this.buildChart(data);
      },
      error: () => this.revenueLoading.set(false),
    });
  }

  ngOnInit(): void {
    this.api.get<Dashboard>('/admin/dashboard').subscribe({
      next: (d) => this.data.set(d),
      error: () => this.loadFailed.set(true),
    });
    this.setRevenueRange(30);
  }

  private buildChart(data: RevenueDay[]): void {
    const total = data.reduce((s, d) => s + d.revenue, 0);
    this.revenueTotal.set(total);

    const maxRev = Math.max(...data.map((d) => d.revenue), 1);
    const n = data.length;
    const gap = 1;
    const barW = n > 20 ? 12 : 40;
    this.chartW = Math.max(600, n * (barW + gap) + this.padL + this.padR);
    const innerW = this.chartW - this.padL - this.padR;
    const innerH = this.chartH - this.padT - this.padB;
    const bw = Math.max(1, (innerW - gap * (n - 1)) / n);

    this.bars.set(
      data.map((d, i) => {
        const h = Math.max(1, (d.revenue / maxRev) * innerH);
        return {
          date: d.date,
          revenue: d.revenue,
          x: this.padL + i * (bw + gap),
          y: this.padT + innerH - h,
          w: bw,
          h,
        };
      }),
    );

    // 3 horizontal grid lines at 25%, 50%, 75% of max
    this.gridLines.set(
      [0.25, 0.5, 0.75, 1].map((frac) => ({
        y: this.padT + innerH * (1 - frac),
        label: frac === 1 ? `RM${this.formatK(maxRev)}` : `RM${this.formatK(maxRev * frac)}`,
      })),
    );
  }

  private formatK(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0);
  }
}
