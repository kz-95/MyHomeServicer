import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { routeFor } from '../../core/route-for';
import { NewOrderFormComponent } from '../components/new-order-form.component';
import { IconComponent } from '../../shared/icon.component';

interface EarningsToday {
  date: string;
  earningsToday: number;
  completedJobs: number;
  activeJobs: number;
  pendingProposalResponses: number;
}
interface DailyEarning {
  date: string;
  earnings: number;
  jobs: number;
}
interface WeekDay {
  key: string;
  label: string;
  earnings: number;
}

/** Servicer dashboard - today's snapshot, this week's earnings and shortcuts. */
@Component({
    selector: 'app-servicer-dashboard',
    host: { class: 'page-enter' },
    imports: [CommonModule, RouterLink, NewOrderFormComponent, IconComponent],
    template: `
    <div class="dash-head">
      <h1>Servicer dashboard</h1>
      <button class="btn-primary new-order-btn" (click)="newOrderOpen.set(true)">
        <app-icon name="plus" sizeToken="sm" /> + New order
      </button>
    </div>

    @if (earnings(); as e) {
      <div class="grid page-child">
        <div class="card stat">
          <span class="n">RM {{ e.earningsToday | number: '1.2-2' }}</span>
          <span class="muted">Earnings today</span>
        </div>
        <div class="card stat">
          <span class="n">{{ e.completedJobs }}</span><span class="muted">Completed today</span>
        </div>
        <div class="card stat">
          <span class="n">{{ e.activeJobs }}</span><span class="muted">Active jobs</span>
        </div>
        <div class="card stat">
          <span class="n">{{ e.pendingProposalResponses }}</span>
          <span class="muted">Pending proposals</span>
        </div>
      </div>
    } @else if (loadFailed()) {
      <p class="muted">Could not load dashboard data. Please refresh.</p>
    } @else {
      <p class="muted">Loading…</p>
    }

    <!-- Platform fee notice -->
    <div class="card fee-notice page-child">
      <strong>Platform fee: 20% per completed booking</strong>
      <p class="muted">
        20% is deducted from each completed booking payout. Of this, 15% funds an automatic
        discount for registered customers (making your service more competitive) and 5% is the
        platform commission. You always see the full 20% shown on your invoice breakdown.
      </p>
    </div>

    <!-- Weekly earnings -->
    <div class="card week page-child">
      <div class="week-head">
        <h2>Earnings</h2>
        <div class="range-toggle">
          <button class="range-btn" [class.on]="dayRange() === 7" (click)="setRange(7)">7 days</button>
          <button class="range-btn" [class.on]="dayRange() === 30" (click)="setRange(30)">30 days</button>
        </div>
      </div>
      <span class="total">RM {{ weekTotal() | number: '1.2-2' }}</span>
      <span class="muted"> total over the last {{ dayRange() }} days</span>

      <div class="chart" [class.dense]="dayRange() === 30">
        @for (d of week(); track d.key) {
          <div class="bar-col" (click)="selectDay(d)" [class.bar-selected]="selectedDay()?.key === d.key">
            <span class="bar-val">{{ d.earnings > 0 ? (d.earnings | number: '1.0-0') : '' }}</span>
            <div class="bar-track">
              <div class="bar" [style.height.%]="barHeight(d.earnings)"></div>
            </div>
            <span class="bar-label">{{ d.label }}</span>
          </div>
        }
      </div>
      @if (selectedDay(); as sd) {
        <div class="day-info">
          <span class="muted">{{ sd.key }}: <strong>RM {{ sd.earnings | number: '1.2-2' }}</strong></span>
          <div class="day-info-actions">
            <button class="range-btn" (click)="selectedDay.set(null)">× Clear</button>
            <a class="range-btn on" [routerLink]="[routeFor('servicer.jobs.history')]">View history →</a>
          </div>
        </div>
      }
      @if (weekTotal() === 0) {
        <p class="muted empty">No earnings recorded in the last {{ dayRange() }} days yet.</p>
      }
    </div>

    <!-- New order form modal -->
    <app-new-order-form
      [open]="newOrderOpen()"
      (closed)="newOrderOpen.set(false)"
    />

    <!-- Quick links -->
    <h2>Quick links</h2>
    <div class="grid links page-child">
      @for (l of quickLinks; track l.path) {
        <a class="card link" [routerLink]="l.path">
          <span class="l-ic">{{ l.icon }}</span>
          <strong>{{ l.label }}</strong>
          <span class="muted">{{ l.detail }}</span>
        </a>
      }
    </div>
  `,
    styles: [
        `
      :host { display: block; max-width: 900px; width: 100%; margin: 0 auto; }
      .dash-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .dash-head h1 { margin: 0; }
      .new-order-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        white-space: nowrap;
      }
      h2 {
        margin-top: 1.8rem;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .stat:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
      }
      .n {
        font-size: 1.6rem;
        font-weight: 700;
        color: var(--color-primary);
      }
      .fee-notice {
        margin-top: 1.2rem;
        padding: 0.9rem 1rem;
        background: color-mix(in srgb, var(--color-primary) 6%, var(--color-surface));
      }
      .fee-notice strong { display: block; margin-bottom: 0.25rem; }
      .fee-notice p { margin: 0; font-size: 0.85rem; }
      .week {
        margin-top: 1.8rem;
      }
      .week-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .week-head h2 { margin: 0; }
      .range-toggle {
        display: flex;
        gap: 0;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        overflow: hidden;
        width: fit-content;
        margin: 0.4rem 0;
      }
      .range-btn {
        background: transparent;
        border: none;
        padding: 0.2rem 0.6rem;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .range-btn:hover { background: var(--color-bg); }
      .range-btn.on { background: var(--color-primary); color: #fff; }
      .total {
        font-size: 1.4rem;
        font-weight: 800;
        color: var(--color-primary);
        display: block;
        margin-top: 0.3rem;
      }
      .total + .muted { font-size: 0.82rem; margin-top: 0.1rem; display: block; }
      .flash {
        color: var(--color-success);
        font-weight: 600;
      }
      .chart {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 140px;
        margin-top: 0.8rem;
        overflow: hidden;
      }
      .bar-col {
        flex: 1 1 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
        height: 100%;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .bar-col:hover { opacity: 0.78; }
      .bar-selected .bar { filter: brightness(1.2); }
      .day-info {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-top: 0.55rem;
        font-size: 0.82rem;
      }
      .day-info-actions { display: flex; gap: 0; border: 1px solid var(--color-border); border-radius: 6px; overflow: hidden; }
      .bar-val {
        font-size: 0.65rem;
        color: var(--color-muted);
        height: 0.85rem;
        line-height: 0.85rem;
      }
      .chart.dense .bar-val { font-size: 0.5rem; height: 0.6rem; line-height: 0.6rem; }
      .bar-track {
        flex: 1;
        width: 100%;
        display: flex;
        align-items: flex-end;
        justify-content: center;
      }
      .bar {
        width: 70%;
        min-height: 2px;
        background: var(--color-primary);
        border-radius: 4px 4px 0 0;
        transition: height 0.3s;
      }
      .bar-label {
        font-size: 0.7rem;
        font-weight: 600;
        color: var(--color-text);
        line-height: 1;
      }
      .chart.dense .bar-label { font-size: 0.5rem; font-weight: 500; }
      .empty {
        margin-top: 0.8rem;
      }
      .link {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        text-decoration: none;
        color: var(--color-text);
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .link:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
        transform: translateY(-2px);
      }
      .l-ic {
        font-size: 1.6rem;
      }
    `,
    ]
})
export class ServicerDashboardComponent implements OnInit {
  protected readonly routeFor = routeFor;
  private api = inject(ApiService);

  earnings = signal<EarningsToday | null>(null);
  loadFailed = signal(false);
  week = signal<WeekDay[]>([]);
  weekTotal = signal(0);
  dayRange = signal(7);
  selectedDay = signal<WeekDay | null>(null);

  setRange(days: number): void {
    this.dayRange.set(days);
    this.selectedDay.set(null);
    this.api
      .get<{ data: DailyEarning[] }>('/servicer/me/earnings/daily', { days: String(days) })
      .subscribe({
        next: (r) => this.buildWeek(r.data ?? []),
        error: () => { /* chart stays at previous data */ },
      });
  }

  newOrderOpen = signal(false);

  readonly quickLinks = [
    { label: 'Pending Requests', path: routeFor('servicer.jobs.pending'), icon: '📨', detail: 'Incoming quotes to respond to' },
    { label: 'Active Jobs', path: routeFor('servicer.jobs.active'), icon: '🔧', detail: 'Jobs in progress' },
    { label: 'History', path: routeFor('servicer.jobs.history'), icon: '🗂️', detail: 'Past & completed jobs' },
    { label: 'Invoices', path: routeFor('servicer.invoices'), icon: '🧾', detail: 'View and download invoices' },
    { label: 'Service Listings', path: routeFor('servicer.services'), icon: '📋', detail: 'Manage your services' },
    { label: 'Deposit', path: routeFor('servicer.deposit'), icon: '💳', detail: 'Manage your security deposit' },
    { label: 'Account', path: routeFor('servicer.account'), icon: '⚙️', detail: 'Profile, logo and penalties' },
  ];

  ngOnInit(): void {
    this.api
      .get<EarningsToday>('/servicer/me/earnings/today')
      .subscribe({
        next: (e) => this.earnings.set(e),
        error: () => this.loadFailed.set(true),
      });
    this.setRange(7);
  }

  /** Builds a fixed N-day window ending today, filling gaps with zero. */
  private buildWeek(rows: DailyEarning[]): void {
    const n = this.dayRange();
    const days: WeekDay[] = [];
    const today = new Date();
    const dayLabels = n <= 7
      ? { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' } as Record<number, string>
      : undefined;
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push({
        key: d.toISOString().slice(0, 10),
        label: dayLabels ? dayLabels[d.getDay()] : `${d.getMonth() + 1}/${d.getDate()}`,
        earnings: 0,
      });
    }
    for (const row of rows) {
      const day = days.find((x) => x.key === row.date);
      if (day) day.earnings = Number(row.earnings) || 0;
    }
    this.week.set(days);
    this.weekTotal.set(days.reduce((s, d) => s + d.earnings, 0));
  }

  /** Bar height as a percentage of the busiest day. */
  barHeight(earnings: number): number {
    const max = Math.max(...this.week().map((d) => d.earnings), 1);
    return Math.round((earnings / max) * 100);
  }

  selectDay(d: WeekDay): void {
    this.selectedDay.set(this.selectedDay()?.key === d.key ? null : d);
  }
}

