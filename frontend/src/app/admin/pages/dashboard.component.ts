import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { routeFor } from '../../core/route-for';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/icon.component';

// ── Interfaces ────────────────────────────────────────────────────────────

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

interface DailyValue {
  day: string;
  amount: number;
}

interface CustomerLeader {
  userId: string;
  name: string;
  email: string;
  bookingCount: number;
  totalSpent: number;
  lastBooking: string;
}

interface ServicerLeader {
  servicerId: string;
  name: string;
  businessName: string;
  rating: number;
  jobCount: number;
  revenue: number;
  reportCount: number;
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
  dailyEscrow?: DailyValue[];
  dailyPayouts?: DailyValue[];
  customerLeaderboard?: CustomerLeader[];
  servicerLeaderboard?: ServicerLeader[];
}

type ChartLineKey = 'revenue' | 'fees' | 'escrow' | 'payouts';

// ── Component ──────────────────────────────────────────────────────────────

@Component({
  selector: 'app-admin-dashboard',
  host: { class: 'page-enter' },
  imports: [CommonModule, RouterLink, FormsModule, IconComponent],
  template: `
    <h1>Admin dashboard</h1>

    <!-- ── 1. PENDING QUEUES (collapsible) ─────────────────────────────── -->
    @if (data(); as d) {
      <div class="section-header page-child">
        <button class="section-toggle" (click)="toggleSection('queues')">Pending Queues {{ showSections()['queues'] ? '▲' : '▼' }}</button>
        <button class="hint-btn" title="Service requests waiting for admin action">(?)</button>
        <span class="section-spacer"></span>
      </div>
      @if (showSections()['queues']) {
        <div class="section-body">
          <div class="grid">
            <a class="card stat" [routerLink]="[routeFor('admin.queues')]" [queryParams]="{tab:'withdrawals'}" title="Review withdrawals">
              <span class="n">{{ d.queues.pendingWithdrawals }}</span>
              <span class="muted">Withdrawals</span>
            </a>
            <a class="card stat" [routerLink]="[routeFor('admin.queues')]" [queryParams]="{tab:'appeals'}" title="Review appeals">
              <span class="n warn">{{ d.queues.pendingAppeals }}</span>
              <span class="muted">Appeals</span>
            </a>
            <a class="card stat" [routerLink]="[routeFor('admin.queues')]" [queryParams]="{tab:'category'}" title="Review category requests">
              <span class="n">{{ d.queues.pendingCategoryRequests }}</span>
              <span class="muted">Category Requests</span>
            </a>
            <a class="card stat" [routerLink]="[routeFor('admin.queues')]" [queryParams]="{tab:'reports'}" title="View open reports">
              <span class="n warn">{{ d.queues.openReports }}</span>
              <span class="muted">Open Reports</span>
            </a>
          </div>
        </div>
      }
    }

    <!-- ── 2. FINANCIAL CARDS (5 cards, 1 row, no collapse) ────────────── -->
    @if (finData(); as fd) {
      <div class="fin-cards page-child">
        <div class="card fin-card">
          <span class="fin-label">Total Revenue <button class="hint-btn" title="Sum of all platform fees and customer top-ups">(?)</button></span>
          <span class="fin-n">RM {{ (fd.totalTopUps + fd.totalFees) | number:'1.2-2' }}</span>
          <span class="fin-sub">Today: RM {{ (fd.todayTopUps + fd.todayFees) | number:'1.2-2' }}</span>
        </div>
        <div class="card fin-card">
          <span class="fin-label">Platform Fees <button class="hint-btn" title="Platform's 8% service fee collected from completed bookings">(?)</button></span>
          <span class="fin-n">RM {{ fd.totalFees | number:'1.2-2' }}</span>
        </div>
        <div class="card fin-card">
          <span class="fin-label">Escrow Held <button class="hint-btn" title="Customer payments currently held in escrow pending job completion">(?)</button></span>
          <span class="fin-n">RM {{ fd.totalEscrow | number:'1.2-2' }}</span>
        </div>
        <div class="card fin-card">
          <span class="fin-label">Pending Payouts <button class="hint-btn" title="Escrow funds ready to be released to servicers upon job completion">(?)</button></span>
          <span class="fin-n">RM {{ fd.pendingPayouts | number:'1.2-2' }}</span>
        </div>
        <div class="card fin-card urgent-card">
          <span class="fin-label">Urgent Fee <button class="hint-btn" title="RM 150 same-day surcharge for urgent bookings; platform takes 20% (RM 30)">(?)</button></span>
          <span class="fin-n">RM {{ fd.urgentFeeRevenue | number:'1.2-2' }}</span>
          <span class="fin-sub">Platform share: RM {{ fd.urgentFeePlatformShare | number:'1.2-2' }}</span>
        </div>
      </div>
    }

    <!-- ── 3. TOOLBAR ──────────────────────────────────────────────────── -->
    <div class="toolbar page-child">
      <div class="cat-chips">
        <button class="chip" [class.active]="!dashCategoryId()" (click)="dashCategoryId.set(''); reloadDashboard()">All</button>
        @for (cat of topCategories(); track cat.id) {
          <button class="chip" [class.active]="dashCategoryId() === cat.id" (click)="dashCategoryId.set(cat.id); reloadDashboard()">{{ cat.name }}</button>
        }
      </div>
      <div class="search-row">
        <div class="search-wrap">
          <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16"
               fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            type="search"
            class="toolbar-search"
            placeholder="Search bookings, customers, servicers..."
            [(ngModel)]="searchQuery"
          />
        </div>
        <div class="sort-controls">
          <button class="btn-ghost btn-sm sort-btn">Sort: Revenue <app-icon name="chevron-down" sizeToken="sm" /></button>
          <button class="btn-ghost btn-sm" title="Reverse order"><app-icon name="arrow-up-down" sizeToken="sm" /></button>
        </div>
      </div>
    </div>

    <!-- ── 4-7. CHART + TABLES (all collapsible) ────────────────────────── -->
    @if (finData(); as fd) {
      <!-- ── 4. Revenue & Fees Chart ──────────────────────────────────── -->
      <div class="section-header page-child">
        <button class="section-toggle" (click)="toggleSection('chart')">Revenue &amp; Fees {{ showSections()['chart'] ? '▲' : '▼' }}</button>
        <button class="hint-btn" title="Daily platform revenue and financial metrics. Toggle lines with the pills below.">(?)</button>
        <span class="section-spacer"></span>
      </div>
      @if (showSections()['chart']) {
        <div class="section-body">

          <!-- Date range + quick selects -->
          <div class="chart-controls">
            <div class="date-range">
              <input type="date" [ngModel]="dateFrom()" (ngModelChange)="setDateRange($event, dateTo())" />
              <span class="date-sep">to</span>
              <input type="date" [ngModel]="dateTo()" (ngModelChange)="setDateRange(dateFrom(), $event)" />
            </div>
            <div class="range-toggle">
              <button class="range-btn" [class.on]="financialDays() === 1" (click)="setFinancialRange(1)">Today</button>
              <button class="range-btn" [class.on]="financialDays() === 7" (click)="setFinancialRange(7)">7d</button>
              <button class="range-btn" [class.on]="financialDays() === 30" (click)="setFinancialRange(30)">30d</button>
              <button class="range-btn" [class.on]="financialDays() === 90" (click)="setFinancialRange(90)">90d</button>
              <button class="range-btn" [class.on]="financialDays() === 365" (click)="setFinancialRange(365)">All</button>
            </div>
            <div class="quarter-toggle">
              <button class="range-btn">Q1</button>
              <button class="range-btn">Q2</button>
              <button class="range-btn">Q3</button>
              <button class="range-btn">Q4</button>
              <span class="range-btn year-label">2026 &#9660;</span>
            </div>
          </div>

          <!-- Chart filter pills -->
          <div class="chart-pills">
            <button class="pill" [class.on]="chartPills()['revenue']" (click)="toggleChartPill('revenue')">
              <span class="pill-dot rev" [class.off]="!chartPills()['revenue']"></span>Revenue
            </button>
            <button class="pill" [class.on]="chartPills()['fees']" (click)="toggleChartPill('fees')">
              <span class="pill-dot fee" [class.off]="!chartPills()['fees']"></span>Fees
            </button>
            <button class="pill" [class.on]="chartPills()['escrow']" (click)="toggleChartPill('escrow')">
              <span class="pill-dot escrow" [class.off]="!chartPills()['escrow']"></span>Escrow Held
            </button>
            <button class="pill" [class.on]="chartPills()['payouts']" (click)="toggleChartPill('payouts')">
              <span class="pill-dot payout" [class.off]="!chartPills()['payouts']"></span>Pending Payouts
            </button>
          </div>

          <!-- Chart -->
          <div class="card chart-card">
            @if (finLoading()) {
              <p class="muted">Loading chart…</p>
            } @else if (fd.dailyRevenue.length || (fd.dailyEscrow && fd.dailyEscrow.length) || (fd.dailyPayouts && fd.dailyPayouts.length)) {
              <div class="chart-wrap">
                <!-- Legend -->
                <div class="chart-legend">
                  @if (chartPills()['revenue']) {
                    <span class="legend-item"><span class="legend-dot rev"></span>Revenue</span>
                  }
                  @if (chartPills()['fees']) {
                    <span class="legend-item"><span class="legend-dot fee"></span>Fees</span>
                  }
                  @if (chartPills()['escrow']) {
                    <span class="legend-item"><span class="legend-dot escrow"></span>Escrow Held</span>
                  }
                  @if (chartPills()['payouts']) {
                    <span class="legend-item"><span class="legend-dot payout"></span>Pending Payouts</span>
                  }
                </div>
                <svg class="chart-svg" [attr.viewBox]="'0 0 ' + chartW + ' ' + chartH" preserveAspectRatio="none">
                  <!-- Grid lines -->
                  @for (line of gridLines(); track line.y) {
                    <line [attr.x1]="padL" [attr.y1]="line.y" [attr.x2]="chartW - padR" [attr.y2]="line.y" class="grid-line" />
                    <text [attr.x]="padL - 6" [attr.y]="line.y + 4" class="axis-label" text-anchor="end">{{ line.label }}</text>
                  }
                  <!-- Revenue line -->
                  @if (chartPills()['revenue'] && revenueLine()) {
                    <polyline [attr.points]="revenueLine()" class="line-rev" />
                  }
                  <!-- Fees line -->
                  @if (chartPills()['fees'] && feesLine()) {
                    <polyline [attr.points]="feesLine()" class="line-fee" />
                  }
                  <!-- Escrow line -->
                  @if (chartPills()['escrow'] && escrowLine()) {
                    <polyline [attr.points]="escrowLine()" class="line-escrow" />
                  }
                  <!-- Payouts line -->
                  @if (chartPills()['payouts'] && payoutsLine()) {
                    <polyline [attr.points]="payoutsLine()" class="line-payout" />
                  }
                  <!-- X-axis labels -->
                  @for (xl of xLabels(); track xl.x) {
                    <text [attr.x]="xl.x" [attr.y]="chartH - 4" class="axis-label x-label" text-anchor="middle">{{ xl.label | date:'M/d' }}</text>
                  }
                </svg>
              </div>
              <!-- Summary row -->
              <div class="chart-summary">
                @if (chartPills()['revenue']) {
                  <span class="summary-item rev">Revenue: <strong>RM {{ revenueTotal() | number:'1.2-2' }}</strong></span>
                }
                @if (chartPills()['fees']) {
                  <span class="summary-item fee">Fees: <strong>RM {{ feesTotal() | number:'1.2-2' }}</strong></span>
                }
                @if (chartPills()['escrow']) {
                  <span class="summary-item escrow">Escrow Held: <strong>RM {{ escrowTotal() | number:'1.2-2' }}</strong></span>
                }
                @if (chartPills()['payouts']) {
                  <span class="summary-item payout">Pending Payouts: <strong>RM {{ payoutsTotal() | number:'1.2-2' }}</strong></span>
                }
              </div>
            } @else {
              <p class="muted">No revenue data yet - bookings will populate this chart.</p>
            }
          </div>
        </div>
      }

      <!-- ── 5. Category Breakdown ─────────────────────────────────────── -->
      <div class="section-header page-child">
        <button class="section-toggle" (click)="toggleSection('categories')">Category Breakdown {{ showSections()['categories'] ? '▲' : '▼' }}</button>
        <button class="hint-btn" title="Per-category booking count, total booking value, and platform fees.">(?)</button>
        <span class="section-spacer"></span>
      </div>
      @if (showSections()['categories']) {
        <div class="section-body">
          <div class="card cat-breakdown">
            @if (fd.categoryBreakdown.length) {
              <table class="cb-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th class="num">Bookings</th>
                    <th class="num">Revenue</th>
                    <th class="num">Fees</th>
                    <th class="num">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of fd.categoryBreakdown; track row.categoryId) {
                    <tr>
                      <td>{{ row.name }}</td>
                      <td class="num">{{ row.count }}</td>
                      <td class="num">RM {{ row.revenue | number:'1.2-2' }}</td>
                      <td class="num">RM {{ row.fees | number:'1.2-2' }}</td>
                      <td class="num">{{ feesPercent(row.fees, fd.totalFees) }}%</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="muted">No category data yet.</p>
            }
          </div>
        </div>
      }

      <!-- ── 6. Customer Leaderboard ───────────────────────────────────── -->
      <div class="section-header page-child">
        <button class="section-toggle" (click)="toggleSection('customers')">Customer Leaderboard {{ showSections()['customers'] ? '▲' : '▼' }}</button>
        <button class="hint-btn" title="Top 20 customers ranked by total spend.">(?)</button>
        <span class="section-spacer"></span>
      </div>
      @if (showSections()['customers']) {
        <div class="section-body">
          <div class="card lb-table-wrap">
            @if (fd.customerLeaderboard && fd.customerLeaderboard.length) {
              <table class="lb-table">
                <thead>
                  <tr>
                    <th class="num-col">#</th>
                    <th>Customer</th>
                    <th class="num">Bookings</th>
                    <th class="num">Total Spent</th>
                    <th class="num">Last Booking</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of fd.customerLeaderboard; track row.userId; let i = $index) {
                    <tr>
                      <td class="num-col">{{ i + 1 }}</td>
                      <td><span class="lb-name">{{ row.name }}</span></td>
                      <td class="num">{{ row.bookingCount }}</td>
                      <td class="num">RM {{ row.totalSpent | number:'1.2-2' }}</td>
                      <td class="num">{{ row.lastBooking | date:'MMM d, yyyy' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="muted">No customer data yet.</p>
            }
          </div>
        </div>
      }

      <!-- ── 7. Servicer Leaderboard ───────────────────────────────────── -->
      <div class="section-header page-child">
        <button class="section-toggle" (click)="toggleSection('servicers')">Servicer Leaderboard {{ showSections()['servicers'] ? '▲' : '▼' }}</button>
        <button class="hint-btn" title="Top 20 servicers ranked by total booking revenue.">(?)</button>
        <span class="section-spacer"></span>
      </div>
      @if (showSections()['servicers']) {
        <div class="section-body">
          <div class="card lb-table-wrap">
            @if (fd.servicerLeaderboard && fd.servicerLeaderboard.length) {
              <table class="lb-table">
                <thead>
                  <tr>
                    <th class="num-col">#</th>
                    <th>Servicer</th>
                    <th class="num">Jobs</th>
                    <th class="num">Revenue</th>
                    <th class="num">Rating</th>
                    <th class="num">Reports</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of fd.servicerLeaderboard; track row.servicerId; let i = $index) {
                    <tr>
                      <td class="num-col">{{ i + 1 }}</td>
                      <td><span class="lb-name">{{ row.businessName || row.name }}</span></td>
                      <td class="num">{{ row.jobCount }}</td>
                      <td class="num">RM {{ row.revenue | number:'1.2-2' }}</td>
                      <td class="num"><span class="rating-stars">{{ row.rating | number:'1.1-1' }} ⭐</span></td>
                      <td class="num">
                        @if (row.reportCount > 0) {
                          <span class="report-warn">{{ row.reportCount }}</span>
                        } @else {
                          <span class="report-ok">0</span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            } @else {
              <p class="muted">No servicer data yet.</p>
            }
          </div>
        </div>
      }
    }

    <!-- ── Loading / error states ──────────────────────────────────────── -->
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
      h1 { margin-bottom: 1rem; }

      /* ── Hint tooltip (?) ──────────────────────────────────────────── */
      .hint-btn {
        background: none; border: none; cursor: help;
        font-size: 0.75rem; color: var(--color-muted);
        padding: 0; margin-left: 2px; line-height: 1;
        font-family: inherit; vertical-align: middle;
      }
      .hint-btn:hover { color: var(--color-primary); }

      /* ── Financial cards grid ───────────────────────────────────────── */
      .fin-cards {
        display: grid;
        grid-template-columns: repeat(5, 1fr);
        gap: 1rem;
        margin: 1.5rem 0;
      }
      .fin-card {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        padding: 1rem 1.25rem 1.25rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .fin-card:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
      }
      .fin-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .fin-n {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--color-primary);
      }
      .fin-sub {
        font-size: 0.78rem;
        color: var(--color-muted);
      }
      .urgent-card {
        border: 1px solid var(--color-border);
        background: rgba(196, 144, 58, 0.04);
      }

      /* ── Collapsible section headers ────────────────────────────────── */
      .section-header {
        display: flex; align-items: center; gap: 0.35rem;
        border-bottom: 1px solid var(--color-border); margin-top: 1.5rem; padding: 0.5rem 0;
      }
      .section-spacer { flex: 1; }
      .section-toggle {
        background: none; border: none; cursor: pointer;
        font-size: 1rem; font-weight: 600; font-family: inherit;
        color: var(--color-text); text-align: left; padding: 0;
      }
      .section-toggle:hover { color: var(--color-primary); }
      .section-body { padding-top: 0.75rem; }

      /* ── Queue grid ─────────────────────────────────────────────────── */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 1rem;
        margin: 0 0 1rem;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        transition: box-shadow var(--transition), transform var(--transition);
        text-decoration: none;
        color: inherit;
        padding: 1rem 1.25rem;
      }
      a.stat { cursor: pointer; }
      a.stat:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
      }
      .n {
        font-size: 1.6rem;
        font-weight: 700;
        color: var(--color-primary);
      }
      .n.warn { color: var(--color-warning); }
      .muted { color: var(--color-muted); font-size: 0.85rem; }
      .err { color: var(--color-danger); font-size: 0.9rem; }

      /* ── Toolbar ────────────────────────────────────────────────────── */
      .toolbar {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        margin: 0.5rem 0 1rem;
      }
      .search-row {
        display: flex; align-items: center; gap: 0.75rem;
      }
      .search-wrap {
        flex: 1;
        position: relative;
        display: flex;
        align-items: center;
      }
      .sort-controls {
        display: flex; gap: 0.4rem; flex-shrink: 0;
      }
      .sort-btn { display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
      .search-icon {
        position: absolute;
        left: 0.7rem;
        color: var(--color-muted);
        pointer-events: none;
      }
      .toolbar-search {
        width: 100%;
        padding: 0.55rem 0.85rem 0.55rem 2.2rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-input);
        font-family: inherit;
        font-size: 0.88rem;
        color: var(--color-text);
        background: var(--color-surface);
        transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
      }
      .toolbar-search:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: var(--focus-ring);
      }
      .toolbar-search::placeholder { color: var(--color-muted); }

      /* ── Category chips ─────────────────────────────────────────────── */
      .cat-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .chip {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.35rem 0.85rem;
        font-size: 0.8rem;
        font-family: inherit;
        cursor: pointer;
        color: var(--color-text);
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }
      .chip:hover { border-color: var(--color-primary); }
      .chip.active {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
      }

      /* ── Chart controls ─────────────────────────────────────────────── */
      .chart-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
        margin-bottom: 0.6rem;
      }
      .date-range {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .date-range input[type="date"] {
        padding: 0.4rem 0.6rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-input);
        font-family: inherit;
        font-size: 0.82rem;
        max-width: 10rem;
        color: var(--color-text);
        background: var(--color-surface);
      }
      .date-range input[type="date"]:focus {
        outline: none;
        border-color: var(--color-primary);
        box-shadow: var(--focus-ring);
      }
      .date-sep {
        font-size: 0.82rem;
        color: var(--color-muted);
      }
      .range-toggle,
      .quarter-toggle {
        display: flex;
        gap: 0;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        overflow: hidden;
      }
      .range-btn {
        background: transparent;
        border: none;
        padding: 0.3rem 0.7rem;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .range-btn:hover { background: var(--color-bg); }
      .range-btn.on { background: var(--color-primary); color: #fff; }
      .year-label {
        cursor: default;
        opacity: 0.5;
        padding: 0.3rem 0.7rem;
      }

      /* ── Chart filter pills ─────────────────────────────────────────── */
      .chart-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-bottom: 0.6rem;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.35rem 0.85rem;
        font-size: 0.8rem;
        font-family: inherit;
        cursor: pointer;
        color: var(--color-muted);
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }
      .pill:hover { border-color: var(--color-primary); color: var(--color-text); }
      .pill.on { font-weight: 600; color: var(--color-text); }
      .pill-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .pill-dot.off {
        background: transparent;
        border: 1px solid var(--color-border);
      }
      .pill-dot.rev { background: var(--color-primary); }
      .pill-dot.fee { background: var(--color-warning); }
      .pill-dot.escrow { background: var(--color-success); }
      .pill-dot.payout {
        background: var(--color-success);
        border: 1px dashed var(--color-success);
      }

      /* ── Chart card ─────────────────────────────────────────────────── */
      .chart-card { padding: 1rem 1.25rem 0.5rem; overflow: hidden; }
      .chart-wrap { width: 100%; overflow: hidden; }
      .chart-svg { width: 100%; display: block; }

      /* Chart legend */
      .chart-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
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
      .legend-dot.fee { background: var(--color-warning); }
      .legend-dot.escrow { background: var(--color-success); }
      .legend-dot.payout {
        background: var(--color-success);
        outline: 1px dashed var(--color-success);
        outline-offset: 1px;
      }

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
        stroke: var(--color-warning);
        stroke-width: 2;
        stroke-dasharray: 6 3;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .line-escrow {
        fill: none;
        stroke: var(--color-success);
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .line-payout {
        fill: none;
        stroke: var(--color-success);
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

      /* Chart summary */
      .chart-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        margin-top: 0.5rem;
        font-size: 0.82rem;
      }
      .summary-item { color: var(--color-muted); }
      .summary-item.rev strong { color: var(--color-primary); }
      .summary-item.fee strong { color: var(--color-warning); }
      .summary-item.escrow strong { color: var(--color-success); }
      .summary-item.payout strong { color: var(--color-success); }

      /* ── Category breakdown table ───────────────────────────────────── */
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

      /* ── Leaderboard tables ─────────────────────────────────────────── */
      .lb-table-wrap { padding: 0.5rem 1rem 1rem; }
      .lb-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.85rem;
      }
      .lb-table th {
        text-align: left;
        font-weight: 600;
        color: var(--color-muted);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding: 0.5rem 0.5rem;
        border-bottom: 1px solid var(--color-border);
      }
      .lb-table td {
        padding: 0.5rem 0.5rem;
        border-bottom: 1px solid var(--color-border);
      }
      .lb-table tbody tr:last-child td { border-bottom: none; }
      .lb-table .num { text-align: right; white-space: nowrap; }
      .lb-table .num-col { text-align: center; width: 2rem; color: var(--color-muted); }
      .lb-name { font-weight: 500; }
      .rating-stars { color: var(--color-warning); }
      .report-warn { color: var(--color-danger); font-weight: 600; }
      .report-ok { color: var(--color-muted); }

      /* ── Responsive ─────────────────────────────────────────────────── */
      @media (max-width: 900px) {
        .fin-cards { grid-template-columns: repeat(3, 1fr); }
      }
      @media (max-width: 600px) {
        .fin-cards { grid-template-columns: 1fr 1fr; }
        .grid { grid-template-columns: 1fr 1fr; }
        .chart-controls { flex-direction: column; align-items: flex-start; gap: 0.6rem; }
      }
      @media (max-width: 400px) {
        .fin-cards { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class AdminDashboardComponent implements OnInit {
  protected readonly routeFor = routeFor;
  private api = inject(ApiService);

  // ── Queues dashboard ─────────────────────────────────────────────────
  data = signal<Dashboard | null>(null);
  loadFailed = signal(false);

  // ── Financial dashboard ──────────────────────────────────────────────
  finData = signal<FinancialDashboard | null>(null);
  finLoading = signal(true);
  finFailed = signal(false);

  // ── Collapsible sections ─────────────────────────────────────────────
  showSections = signal<Record<string, boolean>>({
    queues: true,
    chart: true,
    categories: true,
    customers: true,
    servicers: true,
  });

  toggleSection(key: string): void {
    this.showSections.update((s) => ({ ...s, [key]: !s[key] }));
  }

  // ── Chart pills ──────────────────────────────────────────────────────
  chartPills = signal<Record<ChartLineKey, boolean>>({
    revenue: true,
    fees: true,
    escrow: false,
    payouts: false,
  });

  toggleChartPill(key: ChartLineKey): void {
    this.chartPills.update((p) => ({ ...p, [key]: !p[key] }));
    this.rebuildChart();
  }

  // ── Chart layout constants ───────────────────────────────────────────
  readonly chartH = 140;
  readonly padL = 48;
  readonly padR = 12;
  readonly padT = 14;
  readonly padB = 22;
  chartW = 600;

  // ── Chart line signals ───────────────────────────────────────────────
  revenueLine = signal('');
  feesLine = signal('');
  escrowLine = signal('');
  payoutsLine = signal('');
  gridLines = signal<{ y: number; label: string }[]>([]);
  xLabels = signal<{ x: number; label: string }[]>([]);

  // ── Totals ───────────────────────────────────────────────────────────
  financialDays = signal(30);
  revenueTotal = signal(0);
  feesTotal = signal(0);
  escrowTotal = signal(0);
  payoutsTotal = signal(0);

  // ── Date range ───────────────────────────────────────────────────────
  dateFrom = signal(this.formatDate(todayMinus(30)));
  dateTo = signal(this.formatDate(new Date()));

  // ── Category filter ──────────────────────────────────────────────────
  dashCategoryId = signal('');
  dashCategories = signal<{ id: string; name: string; parentCategoryId: string | null }[]>([]);
  topCategories = computed(() => this.dashCategories().filter((c) => !c.parentCategoryId));
  labelInterval = computed(() => (this.financialDays() > 20 ? 5 : 1));

  // ── Search ───────────────────────────────────────────────────────────
  searchQuery = '';

  // ── Lifecycle ────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadDashboard();
    this.loadCategories();
    this.loadFinancial(30, '');
  }

  // ── Public actions ───────────────────────────────────────────────────
  setFinancialRange(days: number): void {
    this.financialDays.set(days);
    const to = new Date();
    const from = todayMinus(days);
    this.dateFrom.set(this.formatDate(from));
    this.dateTo.set(this.formatDate(to));
    this.loadFinancial(days, this.dashCategoryId());
  }

  setDateRange(from: string, to: string): void {
    this.dateFrom.set(from);
    this.dateTo.set(to);
    if (from && to) {
      const f = new Date(from);
      const t = new Date(to);
      const diffDays = Math.ceil((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
      this.financialDays.set(Math.max(1, diffDays));
      this.loadFinancial(Math.max(1, diffDays), this.dashCategoryId());
    }
  }

  reloadDashboard(): void {
    this.loadDashboard();
    this.loadFinancial(this.financialDays(), this.dashCategoryId());
  }

  // ── Category helpers ─────────────────────────────────────────────────
  feesPercent(fees: number, total: number): string {
    if (!total) return '0.0';
    return ((fees / total) * 100).toFixed(1);
  }

  // ── Format helper ────────────────────────────────────────────────────
  private formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── Data loading ─────────────────────────────────────────────────────
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
          this.rebuildChart();
        },
        error: () => {
          this.finLoading.set(false);
          this.finFailed.set(true);
        },
      });
  }

  // ── Chart builder ────────────────────────────────────────────────────
  private rebuildChart(): void {
    const fd = this.finData();
    if (!fd) {
      this.clearChart();
      return;
    }

    const pills = this.chartPills();

    // Gather all unique dates from all series
    const allDays = new Map<string, { rev: number; fee: number; esc: number; pay: number }>();

    for (const d of fd.dailyRevenue) {
      if (!allDays.has(d.date)) allDays.set(d.date, { rev: 0, fee: 0, esc: 0, pay: 0 });
      const pt = allDays.get(d.date)!;
      pt.rev = d.revenue;
      pt.fee = d.fees;
    }

    if (fd.dailyEscrow) {
      for (const d of fd.dailyEscrow) {
        if (!allDays.has(d.day)) allDays.set(d.day, { rev: 0, fee: 0, esc: 0, pay: 0 });
        allDays.get(d.day)!.esc = d.amount;
      }
    }

    if (fd.dailyPayouts) {
      for (const d of fd.dailyPayouts) {
        if (!allDays.has(d.day)) allDays.set(d.day, { rev: 0, fee: 0, esc: 0, pay: 0 });
        allDays.get(d.day)!.pay = d.amount;
      }
    }

    if (!allDays.size) {
      this.clearChart();
      return;
    }

    // Sort by date
    const sorted = [...allDays.entries()].sort(([a], [b]) => a.localeCompare(b));
    const n = sorted.length;

    // Compute totals
    let revTotal = 0, feeTotal = 0, escTotal = 0, payTotal = 0;
    const revArr: number[] = [], feeArr: number[] = [], escArr: number[] = [], payArr: number[] = [];
    const dateArr: string[] = [];

    for (const [date, vals] of sorted) {
      dateArr.push(date);
      revArr.push(vals.rev);
      feeArr.push(vals.fee);
      escArr.push(vals.esc);
      payArr.push(vals.pay);
      if (pills.revenue) revTotal += vals.rev;
      if (pills.fees) feeTotal += vals.fee;
      if (pills.escrow) escTotal += vals.esc;
      if (pills.payouts) payTotal += vals.pay;
    }

    this.revenueTotal.set(revTotal);
    this.feesTotal.set(feeTotal);
    this.escrowTotal.set(escTotal);
    this.payoutsTotal.set(payTotal);

    // Compute max value across active series
    let maxVal = 1;
    if (pills.revenue) maxVal = Math.max(maxVal, ...revArr);
    if (pills.fees) maxVal = Math.max(maxVal, ...feeArr);
    if (pills.escrow) maxVal = Math.max(maxVal, ...escArr);
    if (pills.payouts) maxVal = Math.max(maxVal, ...payArr);

    const innerW = this.chartW - this.padL - this.padR;
    const innerH = this.chartH - this.padT - this.padB;
    const stepX = n > 1 ? innerW / (n - 1) : innerW / 2;
    const fmt = (v: number) => v.toFixed(1);

    const yFor = (v: number) => this.padT + innerH - (v / maxVal) * innerH;

    // Build polyline point strings
    const buildLine = (arr: number[], active: boolean): string => {
      if (!active) return '';
      return arr
        .map((v, i) => {
          const x = this.padL + i * stepX;
          const y = yFor(v);
          return `${fmt(x)},${fmt(y)}`;
        })
        .join(' ');
    };

    this.revenueLine.set(buildLine(revArr, pills.revenue));
    this.feesLine.set(buildLine(feeArr, pills.fees));
    this.escrowLine.set(buildLine(escArr, pills.escrow));
    this.payoutsLine.set(buildLine(payArr, pills.payouts));

    // Grid lines
    this.gridLines.set(
      [0.25, 0.5, 0.75, 1].map((frac) => ({
        y: this.padT + innerH * (1 - frac),
        label: `RM${this.formatK(maxVal * frac)}`,
      })),
    );

    // X-axis date labels
    const interval = this.labelInterval();
    this.xLabels.set(
      dateArr
        .map((d, i) => ({ x: this.padL + i * stepX, label: d }))
        .filter((_, i) => i % interval === 0),
    );
  }

  private clearChart(): void {
    this.revenueLine.set('');
    this.feesLine.set('');
    this.escrowLine.set('');
    this.payoutsLine.set('');
    this.gridLines.set([]);
    this.xLabels.set([]);
    this.revenueTotal.set(0);
    this.feesTotal.set(0);
    this.escrowTotal.set(0);
    this.payoutsTotal.set(0);
  }

  private formatK(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0);
  }
}

/** Return a date N days before today. */
function todayMinus(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
