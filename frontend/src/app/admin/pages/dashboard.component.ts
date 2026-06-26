import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
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
  totalBookingRevenue?: number;
  totalPayouts?: number;
  totalWithdrawals?: number;
  gatewayFee?: number;
  registeredDiscount?: number;
  promoCost?: number;
  pointsCost?: number;
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
  dailyDiscount?: DailyValue[];
  customerLeaderboard?: CustomerLeader[];
  servicerLeaderboard?: ServicerLeader[];
}

type ChartLineKey = 'revenue' | 'fees' | 'gross' | 'discount' | 'cashflow';

const DONUT_COLORS = ['#f59e0b', '#16a34a', '#2563eb', '#dc2626', '#9333ea', '#6b7280'];

// ── Component ──────────────────────────────────────────────────────────────

@Component({
  selector: 'app-admin-dashboard',
  host: { class: 'page-enter' },
  imports: [CommonModule, RouterLink, FormsModule, IconComponent],
  template: `
    <h1>Admin dashboard</h1>

    <!-- ── STICKY TOP BAR ──────────────────────────────────────────────── -->
    <div class="dash-head" style="position:sticky;top:0;z-index:10;">
      <!-- Section A (darker bg): Categories + Search -->
      <div class="dash-head-a">
        <!-- Row 1: Parent categories -->
        <div class="cat-marquee" (mousedown)="onMarqueeMouseDown($event, marqueeEl)" #marqueeEl>
          <button class="chip" [class.active]="selectedCatIds().size === 0" (click)="clearCats()">All</button>
          @for (cat of parentCategories(); track cat.id) {
            <button class="chip" [class.active]="isCatSelected(cat.id) || isChildOfParent(cat.id)" (click)="toggleCat(cat.id)">{{ cat.name }}</button>
          }
        </div>
        <!-- Row 2: Child categories -->
        <div class="cat-marquee sub" (mousedown)="onMarqueeMouseDown($event, childMarqueeEl)" #childMarqueeEl>
          <button class="chip" [class.active]="selectedCatIds().size === 0" (click)="clearCats()">All</button>
          @for (cat of filteredChildCategories(); track cat.id) {
            <button class="chip" [class.active]="isCatSelected(cat.id)" (click)="toggleCat(cat.id)">{{ cat.name }}</button>
          }
        </div>

        <!-- Search bar -->
        <div class="search-row">
          <div class="search-wrap">
            <app-icon name="search" sizeToken="sm" class="search-icon-inline" />
            <input type="search" class="toolbar-search" placeholder="Search bookings, customers, servicers..." [(ngModel)]="searchQuery" (input)="onSearchChange()" />
          </div>
          <div class="sort-controls">
            <div class="sort-dropdown" (click)="$event.stopPropagation()">
              <button class="btn-ghost btn-sm sort-btn" (click)="sortDropdownOpen.set(!sortDropdownOpen())">
                Sort: {{ sortFieldLabel() }} <app-icon name="chevron-down" sizeToken="sm" />
              </button>
              @if (sortDropdownOpen()) {
                <div class="sort-menu">
                  @for (f of sortFields; track f.key) {
                    <button class="sort-menu-item" [class.active]="sortState().key === f.key" (click)="selectSortField(f.key)">{{ f.label }}</button>
                  }
                </div>
              }
            </div>
            <button class="btn-ghost btn-sm" title="Reverse order" (click)="toggleSortDir()"><app-icon [name]="sortState().dir === 'asc' ? 'chevron-up' : 'chevron-down'" sizeToken="sm" /></button>
          </div>
        </div>
      </div>

      <!-- Divider -->
      <div class="dash-divider"></div>

      <!-- Section B (lighter bg): Section filter pills -->
      <div class="dash-head-b">
        <button class="chip" [class.active]="sectionFilters()['all']" (click)="toggleSectionFilter('all')">All</button>
        <button class="chip" [class.active]="sectionFilters()['queues']" (click)="toggleSectionFilter('queues')">Queues</button>
        <button class="chip" [class.active]="sectionFilters()['cards']" (click)="toggleSectionFilter('cards')">Cards</button>
        <button class="chip" [class.active]="sectionFilters()['chart']" (click)="toggleSectionFilter('chart')">Chart</button>
        <button class="chip" [class.active]="sectionFilters()['breakdown']" (click)="toggleSectionFilter('breakdown')">Breakdown</button>
        <button class="chip" [class.active]="sectionFilters()['customers']" (click)="toggleSectionFilter('customers')">Customers</button>
        <button class="chip" [class.active]="sectionFilters()['servicers']" (click)="toggleSectionFilter('servicers')">Servicers</button>
      </div>
    </div>

    <div class="dash-content">
    <!-- ── 1. PENDING QUEUES ────────────────────────────────────────────── -->
    @if (showSection('queues')) {
      @if (data(); as d) {
        <div class="grid page-child">
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
      }
    }

    <!-- ── 2. FINANCIAL CARDS (4 cards) ─────────────────────────────────── -->
    @if (showSection('cards')) {
      @if (finData(); as fd) {
        <div class="fin-cards page-child">
          <!-- Card 1: Cashflow -->
          @let grossIn = (fd.totalBookingRevenue ?? 0);
          @let grossOut = (fd.totalPayouts ?? 0) + (fd.gatewayFee ?? 0) + (fd.registeredDiscount ?? 0) + (fd.promoCost ?? 0) + (fd.pointsCost ?? 0);
          @let gross = grossIn - grossOut;
          @let cashflow = gross - (fd.totalWithdrawals ?? 0);
          <div class="card fin-card">
            <div class="fin-cf-row">
              <span class="fin-label">IN <button class="hint-btn" title="Total booking value from all completed jobs.">(?)</button></span>
              <span class="fin-cf-in">RM {{ grossIn | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">OUT <button class="hint-btn" title="Servicer payouts + gateway fees + discounts + promo costs + points costs.">(?)</button></span>
              <span class="fin-cf-out">RM {{ grossOut | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">GROSS <button class="hint-btn" [title]="'IN &minus; OUT = ' + (grossIn | number:'1.0-0') + ' &minus; ' + (grossOut | number:'1.0-0') + ' = RM ' + (gross | number:'1.2-2')">(?)</button></span>
              <span class="fin-cf-gross" [class.neg]="gross < 0">RM {{ gross | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Cashflow <button class="hint-btn" title="GROSS &minus; company withdrawals = actual cash available.">(?)</button></span>
              <span class="fin-cf-cashflow" [class.neg]="cashflow < 0">RM {{ cashflow | number:'1.2-2' }}</span>
            </div>
          </div>
          <!-- Card 2: Revenue breakdown -->
          <div class="card fin-card">
            <div class="fin-cf-row">
              <span class="fin-label">Revenue <button class="hint-btn" title="Platform earnings: 8% fees + customer top-ups">(?)</button></span>
              <span class="fin-n">RM {{ (fd.totalFees + fd.totalTopUps) | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Fees <button class="hint-btn" title="Platform's commission (20%) collected from completed bookings.">(?)</button></span>
              <span class="cf-good">RM {{ fd.totalFees | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Top-ups <button class="hint-btn" title="Customer wallet top-ups (deposit_topup transactions).">(?)</button></span>
              <span class="cf-good">RM {{ fd.totalTopUps | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Discounts <button class="hint-btn" title="Registered customer discounts + promotion redemptions.">(?)</button></span>
              <span class="cf-bad">RM {{ ((fd.registeredDiscount ?? 0) + (fd.promoCost ?? 0)) | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Rewards <button class="hint-btn" title="Loyalty points redeemed by customers.">(?)</button></span>
              <span class="cf-bad">RM {{ (fd.pointsCost ?? 0) | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Gateway <button class="hint-btn" title="Stripe/gateway processing fees (3.4% + RM 1.00).">(?)</button></span>
              <span class="cf-bad">RM {{ (fd.gatewayFee ?? 0) | number:'1.2-2' }}</span>
            </div>
          </div>
          <!-- Card 3: Escrow -->
          <div class="card fin-card">
            <div class="fin-cf-row">
              <span class="fin-label">Escrow <button class="hint-btn" title="Funds held in escrow and pending release to servicers">(?)</button></span>
              <span class="fin-n">RM {{ (fd.totalEscrow + fd.pendingPayouts) | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Held <button class="hint-btn" title="Customer payments currently held in escrow (funds not yet released).">(?)</button></span>
              <span class="fin-cf-sub">RM {{ fd.totalEscrow | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Pending <button class="hint-btn" title="Escrow amounts ready to be released to servicers upon job completion.">(?)</button></span>
              <span class="fin-cf-sub">RM {{ fd.pendingPayouts | number:'1.2-2' }}</span>
            </div>
          </div>
          <!-- Card 4: Urgent -->
          <div class="card fin-card urgent-card">
            <div class="fin-cf-row">
              <span class="fin-label">Urgent <button class="hint-btn" title="RM 150 same-day surcharge; platform takes 20% (RM 30)">(?)</button></span>
              <span class="fin-n">RM {{ fd.urgentFeeRevenue | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Fee <button class="hint-btn" title="Total urgent surcharge collected from customers (RM 150 per urgent booking).">(?)</button></span>
              <span class="fin-cf-sub">RM {{ fd.urgentFeeRevenue | number:'1.2-2' }}</span>
            </div>
            <div class="fin-cf-row">
              <span class="fin-label">Platform share <button class="hint-btn" title="Platform's 20% cut of the urgent surcharge.">(?)</button></span>
              <span class="fin-cf-sub">RM {{ fd.urgentFeePlatformShare | number:'1.2-2' }}</span>
            </div>
          </div>
        </div>
      }
    }

    <!-- ── 3. Revenue & Fees Chart ──────────────────────────────────────── -->
    @if (showSection('chart')) {
      @if (finData(); as fd) {
        <!-- Date range + quick selects -->
        <div class="chart-controls page-child">
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
            <button class="range-btn" [class.on]="activeQuarter() === 1" (click)="setQuarter(1)">Q1</button>
            <button class="range-btn" [class.on]="activeQuarter() === 2" (click)="setQuarter(2)">Q2</button>
            <button class="range-btn" [class.on]="activeQuarter() === 3" (click)="setQuarter(3)">Q3</button>
            <button class="range-btn" [class.on]="activeQuarter() === 4" (click)="setQuarter(4)">Q4</button>
            <input type="number" class="year-input" [ngModel]="activeYear()" (ngModelChange)="setYear(+$event)" min="2020" max="2030" />
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
          <button class="pill" [class.on]="chartPills()['gross']" (click)="toggleChartPill('gross')">
            <span class="pill-dot gross" [class.off]="!chartPills()['gross']"></span>Gross
          </button>
          <button class="pill" [class.on]="chartPills()['cashflow']" (click)="toggleChartPill('cashflow')">
            <span class="pill-dot cashflow" [class.off]="!chartPills()['cashflow']"></span>Cashflow
          </button>
          <button class="pill" [class.on]="chartPills()['discount']" (click)="toggleChartPill('discount')">
            <span class="pill-dot disc" [class.off]="!chartPills()['discount']"></span>Discounts
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
                @if (chartPills()['gross']) {
                  <span class="legend-item"><span class="legend-dot gross"></span>Gross</span>
                }
                @if (chartPills()['cashflow']) {
                  <span class="legend-item"><span class="legend-dot cashflow"></span>Cashflow</span>
                }
                @if (chartPills()['discount']) {
                  <span class="legend-item"><span class="legend-dot disc"></span>Discounts</span>
                }
              </div>
              <svg class="chart-svg" [attr.viewBox]="'0 0 ' + chartW + ' ' + chartH" preserveAspectRatio="none"
                   (mousemove)="onChartHover($event)" (mouseleave)="chartTooltip.set(null)">
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
                <!-- Gross line -->
                @if (chartPills()['gross'] && grossLine()) {
                  <polyline [attr.points]="grossLine()" class="line-gross" />
                }
                <!-- Cashflow line -->
                @if (chartPills()['cashflow'] && cashflowLine()) {
                  <polyline [attr.points]="cashflowLine()" class="line-cashflow" />
                }
                <!-- Discount line -->
                @if (chartPills()['discount'] && discountLine()) {
                  <polyline [attr.points]="discountLine()" class="line-disc" />
                }
                <!-- X-axis labels -->
                @for (xl of xLabels(); track xl.x) {
                  <text [attr.x]="xl.x" [attr.y]="chartH - 4" class="axis-label x-label" text-anchor="middle">{{ xl.label | date:'M/d' }}</text>
                }
              </svg>
              @if (chartTooltip(); as tip) {
                <div class="chart-tooltip" [style.left.px]="tip.x" [style.top.px]="tip.y">
                  <div class="tip-date">{{ tip.date }}</div>
                  @if (tip.rev != null) { <div class="tip-row rev">Revenue: RM {{ tip.rev | number:'1.2-2' }}</div> }
                  @if (tip.fee != null) { <div class="tip-row fee">Fees: RM {{ tip.fee | number:'1.2-2' }}</div> }
                  @if (tip.gross != null) { <div class="tip-row gross">Gross: RM {{ tip.gross | number:'1.2-2' }}</div> }
                  @if (tip.cf != null) { <div class="tip-row cf">Cashflow: RM {{ tip.cf | number:'1.2-2' }}</div> }
                  @if (tip.disc != null) { <div class="tip-row disc">Discounts: RM {{ tip.disc | number:'1.2-2' }}</div> }
                </div>
              }
            </div>
            <!-- Summary row -->
            <div class="chart-summary">
              @if (chartPills()['revenue']) {
                <span class="summary-item rev">Revenue: <strong>RM {{ revenueTotal() | number:'1.2-2' }}</strong></span>
              }
              @if (chartPills()['fees']) {
                <span class="summary-item fee">Fees: <strong>RM {{ feesTotal() | number:'1.2-2' }}</strong></span>
              }
              @if (chartPills()['gross']) {
                <span class="summary-item gross">Gross: <strong>RM {{ grossTotal() | number:'1.2-2' }}</strong></span>
              }
              @if (chartPills()['cashflow']) {
                <span class="summary-item cashflow">Cashflow: <strong>RM {{ cashflowTotal() | number:'1.2-2' }}</strong></span>
              }
              @if (chartPills()['discount']) {
                <span class="summary-item disc">Discounts: <strong>RM {{ discountTotal() | number:'1.2-2' }}</strong></span>
              }
            </div>
          } @else {
            <p class="muted">No revenue data yet - bookings will populate this chart.</p>
          }
        </div>
      }
    }

    <!-- ── 4. Category Breakdown ────────────────────────────────────────── -->
    @if (showSection('breakdown')) {
      @if (finData(); as fd) {
        <div class="card cat-breakdown page-child">
          @if (fd.categoryBreakdown.length) {
            <!-- Bar + Donut charts -->
            <div class="chart-row">
              <div class="chart-left">
                <div class="h-bar-chart">
                  @for (row of catBarTop5(); track row.label) {
                    <div class="h-bar-row">
                      <span class="h-bar-label" [title]="row.label">{{ row.label }}</span>
                      <div class="h-bar-track">
                        <div class="h-bar-fill" [style.width.%]="row.pct"></div>
                      </div>
                      <span class="h-bar-val">{{ row.value }}</span>
                    </div>
                  }
                  @if (!catBarTop5().length) {
                    <span class="muted">No data</span>
                  }
                </div>
              </div>
              <div class="chart-right">
                @if (catDonutGradient()) {
                  <div class="donut-legend">
                    @for (item of catDonutLegend(); track item.name) {
                      <span><span class="donut-dot" [style.background]="item.color"></span>{{ item.name }}</span>
                    }
                  </div>
                  <div class="donut" [style.background]="catDonutGradient()"></div>
                }
              </div>
            </div>
            <table class="cb-table">
              <thead>
                <tr>
                  <th (click)="sortState.set({key:'name',dir:sortState().key==='name'&&sortState().dir==='asc'?'desc':'asc'})">Category <span class="sort-icon">{{ sortIcon('name') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'count',dir:sortState().key==='count'&&sortState().dir==='asc'?'desc':'asc'})">Bookings <span class="sort-icon">{{ sortIcon('count') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'revenue',dir:sortState().key==='revenue'&&sortState().dir==='asc'?'desc':'asc'})">Revenue <span class="sort-icon">{{ sortIcon('revenue') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'fees',dir:sortState().key==='fees'&&sortState().dir==='asc'?'desc':'asc'})">Fees <span class="sort-icon">{{ sortIcon('fees') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'pct',dir:sortState().key==='pct'&&sortState().dir==='asc'?'desc':'asc'})">% of Total <span class="sort-icon">{{ sortIcon('pct') }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (row of sortedCategoryBreakdown(); track row.categoryId) {
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
      }
    }

    <!-- ── 5. Customer Leaderboard ──────────────────────────────────────── -->
    @if (showSection('customers')) {
      @if (finData(); as fd) {
        <div class="card lb-table-wrap page-child">
          @if (fd.customerLeaderboard && fd.customerLeaderboard.length) {
            <!-- Bar + Donut charts -->
            <div class="chart-row">
              <div class="chart-left">
                <div class="h-bar-chart">
                  @for (row of custBarTop5(); track row.label) {
                    <div class="h-bar-row">
                      <span class="h-bar-label" [title]="row.label">{{ row.label }}</span>
                      <div class="h-bar-track">
                        <div class="h-bar-fill" [style.width.%]="row.pct"></div>
                      </div>
                      <span class="h-bar-val">RM {{ row.value | number:'1.0-0' }}</span>
                    </div>
                  }
                  @if (!custBarTop5().length) {
                    <span class="muted">No data</span>
                  }
                </div>
              </div>
              <div class="chart-right">
                @if (custDonutGradient()) {
                  <div class="donut-legend">
                    @for (item of custDonutLegend(); track item.name) {
                      <span><span class="donut-dot" [style.background]="item.color"></span>{{ item.name }}</span>
                    }
                  </div>
                  <div class="donut" [style.background]="custDonutGradient()"></div>
                }
              </div>
            </div>
            <table class="lb-table">
              <thead>
                <tr>
                  <th class="num-col">#</th>
                  <th (click)="sortState.set({key:'custName',dir:sortState().key==='custName'&&sortState().dir==='asc'?'desc':'asc'})">Customer <span class="sort-icon">{{ sortIcon('custName') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'custBookings',dir:sortState().key==='custBookings'&&sortState().dir==='asc'?'desc':'asc'})">Bookings <span class="sort-icon">{{ sortIcon('custBookings') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'custSpent',dir:sortState().key==='custSpent'&&sortState().dir==='asc'?'desc':'asc'})">Total Spent <span class="sort-icon">{{ sortIcon('custSpent') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'custLast',dir:sortState().key==='custLast'&&sortState().dir==='asc'?'desc':'asc'})">Last Booking <span class="sort-icon">{{ sortIcon('custLast') }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (row of sortedCustomerLB(); track row.userId; let i = $index) {
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
      }
    }

    <!-- ── 6. Servicer Leaderboard ──────────────────────────────────────── -->
    @if (showSection('servicers')) {
      @if (finData(); as fd) {
        <div class="card lb-table-wrap page-child">
          @if (fd.servicerLeaderboard && fd.servicerLeaderboard.length) {
            <!-- Bar + Donut charts -->
            <div class="chart-row">
              <div class="chart-left">
                <div class="h-bar-chart">
                  @for (row of svcBarTop5(); track row.label) {
                    <div class="h-bar-row">
                      <span class="h-bar-label" [title]="row.label">{{ row.label }}</span>
                      <div class="h-bar-track">
                        <div class="h-bar-fill" [style.width.%]="row.pct"></div>
                      </div>
                      <span class="h-bar-val">RM {{ row.value | number:'1.0-0' }}</span>
                    </div>
                  }
                  @if (!svcBarTop5().length) {
                    <span class="muted">No data</span>
                  }
                </div>
              </div>
              <div class="chart-right">
                @if (svcDonutGradient()) {
                  <div class="donut" [style.background]="svcDonutGradient()"></div>
                  <div class="donut-legend">
                    @for (item of svcDonutLegend(); track item.name) {
                      <span><span class="donut-dot" [style.background]="item.color"></span>{{ item.name }}</span>
                    }
                  </div>
                }
              </div>
            </div>
            <table class="lb-table">
              <thead>
                <tr>
                  <th class="num-col">#</th>
                  <th (click)="sortState.set({key:'svcName',dir:sortState().key==='svcName'&&sortState().dir==='asc'?'desc':'asc'})">Servicer <span class="sort-icon">{{ sortIcon('svcName') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'svcJobs',dir:sortState().key==='svcJobs'&&sortState().dir==='asc'?'desc':'asc'})">Jobs <span class="sort-icon">{{ sortIcon('svcJobs') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'svcRevenue',dir:sortState().key==='svcRevenue'&&sortState().dir==='asc'?'desc':'asc'})">Revenue <span class="sort-icon">{{ sortIcon('svcRevenue') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'svcRating',dir:sortState().key==='svcRating'&&sortState().dir==='asc'?'desc':'asc'})">Rating <span class="sort-icon">{{ sortIcon('svcRating') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'svcReports',dir:sortState().key==='svcReports'&&sortState().dir==='asc'?'desc':'asc'})">Reports <span class="sort-icon">{{ sortIcon('svcReports') }}</span></th>
                </tr>
              </thead>
              <tbody>
                @for (row of sortedServicerLB(); track row.servicerId; let i = $index) {
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
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      h1 { margin-bottom: 1rem; }

      /* ── Sticky top bar ────────────────────────────────────────────── */
      .dash-head {
        padding: 0.4rem 0 0.5rem 0;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
      }
      .dash-head-a { padding: 0.75rem 2rem; background: var(--color-bg); }
      .dash-head-b { padding: 0.5rem 2rem; background: var(--color-surface); }
      .dash-content { padding: 1.25rem 2rem 2rem 2rem; }
      .dash-divider { border: none; border-top: 1px solid var(--color-border); margin: 0; }
      .cat-marquee { display: flex; gap: 0.4rem; overflow-x: auto; padding-bottom: 0.3rem; scrollbar-width: none; cursor: grab; user-select: none; }
      .cat-marquee::-webkit-scrollbar { display: none; }
      .cat-marquee.sub { padding-top: 0.3rem; }

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
      }
      .fin-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-muted);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .fin-n {
        font-size: 1.6rem;
        font-weight: 700;
        color: #f59e0b;
      }
      .fin-sub {
        font-size: 0.78rem;
        color: var(--color-text);
      }
      .fin-cf-row { display: flex; justify-content: space-between; align-items: center; }
      .fin-cf-row .fin-label { color: var(--color-muted); font-size: 0.8rem; }
      .fin-cf-in { font-size: 1.6rem; font-weight: 700; color: #f59e0b; }
      .fin-cf-out { font-size: 1.1rem; font-weight: 600; color: #dc2626; }
      .fin-cf-gross { font-size: 1.1rem; font-weight: 600; color: #16a34a; }
.fin-cf-gross.neg { color: #dc2626; }
      .fin-cf-cashflow { font-size: 1.1rem; font-weight: 600; color: inherit; }
.fin-cf-cashflow.neg { color: #dc2626; }
.fin-cf-sub { font-size: 1.1rem; font-weight: 600; color: var(--color-text); }
.cf-good { font-size: 1.1rem; font-weight: 600; color: #16a34a; }
.cf-bad { font-size: 1.1rem; font-weight: 600; color: #dc2626; }
      .fin-cf-net { font-size: 0.78rem; color: var(--color-muted); }
      .urgent-card {
        border: 1px solid var(--color-border);
        background: rgba(196, 144, 58, 0.04);
      }

      /* ── Queue grid ─────────────────────────────────────────────────── */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 1rem;
        margin: 1.5rem 0 1rem;
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

      /* ── Search row ──────────────────────────────────────────────────── */
      .search-row {
        display: flex; align-items: center; gap: 0.75rem; padding-top: 0.5rem;
      }
      .search-wrap {
        flex: 1;
        display: flex;
        align-items: center;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-input);
        transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
      }
      .search-wrap:focus-within {
        border-color: var(--color-primary);
        box-shadow: var(--focus-ring);
      }
      .sort-controls { display: flex; gap: 0.4rem; flex-shrink: 0; }
      .sort-btn { display: inline-flex; align-items: center; gap: 0.3rem; white-space: nowrap; }
      .sort-dropdown { position: relative; }
      .sort-menu { position: absolute; top: 100%; right: 0; z-index: 20; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.3rem 0; min-width: 140px; box-shadow: var(--shadow-md); margin-top: 0.25rem; }
      .sort-menu-item { display: block; width: 100%; text-align: left; background: none; border: none; padding: 0.4rem 0.8rem; font-size: 0.82rem; color: var(--color-text); cursor: pointer; font-family: inherit; }
      .sort-menu-item:hover { background: var(--color-bg); }
      .sort-menu-item.active { color: var(--color-primary); font-weight: 600; }
      .search-icon-inline {
        margin: 0 0.5rem 0 0.85rem;
        flex-shrink: 0;
        color: var(--color-muted);
      }
      .toolbar-search {
        flex: 1;
        border: none;
        padding: 0.55rem 0.5rem 0.55rem 0;
        background: transparent;
        font-family: inherit;
        font-size: 0.88rem;
        color: var(--color-text);
      }
      .toolbar-search:focus { outline: none; }
      .toolbar-search::placeholder { color: var(--color-muted); }

      /* ── Chips ───────────────────────────────────────────────────────── */
      .chip {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.35rem 0.85rem;
        font-size: 0.8rem;
        font-family: inherit;
        cursor: pointer;
        color: var(--color-text);
        white-space: nowrap;
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
        margin-top: 1rem;
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
      .range-btn.on { background: #f59e0b; color: #fff; }
      .year-input {
        background: transparent;
        border: none;
        padding: 0.3rem 0.5rem;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--color-muted);
        font-family: inherit;
        width: 4ch;
        text-align: center;
        line-height: 1.4;
        box-sizing: border-box;
      }
      .year-input:focus { outline: none; color: var(--color-primary); }

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
        padding: 0.35rem 0.7rem;
        font-size: 0.8rem;
        font-family: inherit;
        cursor: pointer;
        color: var(--color-muted);
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
        min-height: 44px;
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
      .pill-dot.gross { background: #16a34a; }
      .pill-dot.cashflow {
        background: #9333ea;
        border: 1px dashed #9333ea;
      }
      .pill-dot.disc { background: var(--color-muted); }

      /* ── Chart card ─────────────────────────────────────────────────── */
      .chart-card { padding: 1rem 1.25rem 0.5rem; overflow: hidden; }
      .chart-wrap { width: 100%; overflow: hidden; position: relative; }
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
      .legend-dot.gross { background: #16a34a; }
      .legend-dot.cashflow {
        background: #9333ea;
        outline: 1px dashed #9333ea;
        outline-offset: 1px;
      }
      .legend-dot.disc {
        background: #dc2626;
        outline: 1px dashed #dc2626;
        outline-offset: 1px;
      }

      /* Line chart polylines */
      .line-rev {
        fill: none;
        stroke: var(--color-primary);
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .line-fee {
        fill: none;
        stroke: #f59e0b;
        stroke-dasharray: 6 3;
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .line-gross {
        fill: none;
        stroke: #16a34a;
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .line-cashflow {
        fill: none;
        stroke: #9333ea;
        stroke-dasharray: 2 6;
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .line-disc {
        fill: none;
        stroke: #dc2626;
        stroke-dasharray: 4 4;
        stroke-width: 1;
        vector-effect: non-scaling-stroke;
      }
      .line-fee {
        fill: none;
        stroke: var(--color-warning);
        stroke-width: 2;
        stroke-dasharray: 6 3;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .line-gross {
        fill: none;
        stroke: #16a34a;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .line-cashflow {
        fill: none;
        stroke: #9333ea;
        stroke-width: 2;
        stroke-dasharray: 2 6;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .line-disc {
        fill: none;
        stroke: #dc2626;
        stroke-width: 2;
        stroke-dasharray: 4 4;
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
      .summary-item.gross strong { color: #16a34a; }
      .summary-item.cashflow strong { color: #9333ea; }
      .summary-item.disc strong { color: #dc2626; }

      /* Chart tooltip */
      .chart-tooltip { position: absolute; pointer-events: none; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.5rem 0.75rem; font-size: 0.78rem; z-index: 5; box-shadow: var(--shadow-md); min-width: 140px; }
      .tip-date { font-weight: 600; margin-bottom: 0.25rem; color: var(--color-text); }
      .tip-row { padding: 0.1rem 0; }
      .tip-row.rev { color: var(--color-primary); }
      .tip-row.fee { color: #f59e0b; }
      .tip-row.gross { color: #16a34a; }
      .tip-row.cf { color: #9333ea; }
      .tip-row.disc { color: #dc2626; }

      /* ── Category breakdown table ───────────────────────────────────── */
      .cat-breakdown { padding: 0.75rem 1rem; margin-top: 1.5rem; }
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

      .cb-table th { cursor: pointer; user-select: none; white-space: nowrap; }
      .cb-table th:hover { color: var(--color-primary); }
      .sort-icon { font-size: 0.7rem; margin-left: 2px; opacity: 0.5; }
      th:hover .sort-icon { opacity: 1; }

      /* ── Leaderboard tables ─────────────────────────────────────────── */
      .lb-table-wrap { padding: 0.5rem 1rem 1rem; margin-top: 1.5rem; }
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

      .lb-table th { cursor: pointer; user-select: none; white-space: nowrap; }
      .lb-table th:hover { color: var(--color-primary); }
      .lb-name { font-weight: 500; }
      .rating-stars { color: var(--color-warning); }
      .report-warn { color: var(--color-danger); font-weight: 600; }
      .report-ok { color: var(--color-muted); }

      /* ── Bar + Donut charts ─────────────────────────────────────────── */
      .chart-row { display: flex; gap: 1.5rem; align-items: center; margin-bottom: 1rem; }
      .chart-left { flex: 1; min-width: 0; }
      .chart-right { flex-shrink: 0; min-width: 140px; }

      /* Bar chart */
      .h-bar-chart { width: 100%; }
      .h-bar-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem; padding: 0.15rem 0; }
      .h-bar-row:hover { background: var(--color-bg); border-radius: 4px; }
      .h-bar-label { width: 90px; font-size: 0.78rem; text-align: right; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--color-muted); }
      .h-bar-track { flex: 1; height: 16px; background: var(--color-bg); border-radius: 4px; overflow: hidden; }
      .h-bar-fill { height: 100%; border-radius: 4px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); min-width: 2px; }
      .h-bar-val { width: 55px; font-size: 0.78rem; text-align: right; flex-shrink: 0; font-weight: 600; color: var(--color-text); }

      /* Donut */
      .donut { width: 130px; height: 130px; border-radius: 50%; mask: radial-gradient(circle, transparent 55%, black 56%); -webkit-mask: radial-gradient(circle, transparent 55%, black 56%); }
      .donut-legend { font-size: 0.72rem; margin-top: 0.6rem; display: flex; flex-wrap: wrap; gap: 0.3rem 0.6rem; }
      .donut-legend span { display: inline-flex; align-items: center; gap: 0.25rem; }
      .donut-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }

      /* ── Responsive ─────────────────────────────────────────────────── */
      @media (max-width: 760px) { .chart-row { display: none; } }
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

  // ── Section filter ───────────────────────────────────────────────────
  sectionFilters = signal<Record<string, boolean>>({ all: true, queues: true, cards: true, chart: true, breakdown: true, customers: true, servicers: true });
  toggleSectionFilter(key: string): void {
    this.sectionFilters.update(f => {
      const sections = ['queues','cards','chart','breakdown','customers','servicers'];
      if (key === 'all') return { all: true, queues: true, cards: true, chart: true, breakdown: true, customers: true, servicers: true };
      // If All is currently active, isolate this one pill
      if (f['all']) {
        const isolated: Record<string, boolean> = { all: false };
        for (const s of sections) isolated[s] = s === key;
        return isolated;
      }
      // Toggle this one pill
      const updated = { ...f, [key]: !f[key] };
      const active = sections.filter(s => updated[s]);
      if (active.length === 0) return { all: true, queues: true, cards: true, chart: true, breakdown: true, customers: true, servicers: true };
      if (active.length === sections.length) updated['all'] = true;
      return updated;
    });
  }
  showSection(s: string): boolean { return this.sectionFilters()[s] || this.sectionFilters()['all']; }

  /** Whether any selected category is a child of the given parent ID. */
  isChildOfParent(parentId: string): boolean {
    const sel = this.selectedCatIds();
    if (sel.size === 0) return false;
    for (const id of sel) {
      const c = this.dashCategories().find(x => x.id === id);
      if (c?.parentCategoryId === parentId) return true;
    }
    return false;
  }

  // ── Drag-to-scroll ───────────────────────────────────────────────────
  private _dragActive = false;
  private _dragStartX = 0;
  private _dragScrollLeft = 0;
  private _dragTarget: HTMLElement | null = null;

  onMarqueeMouseDown(e: MouseEvent, el: HTMLElement): void {
    this._dragActive = true;
    this._dragStartX = e.pageX - el.offsetLeft;
    this._dragScrollLeft = el.scrollLeft;
    this._dragTarget = el;
    el.style.cursor = 'grabbing';
    e.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMarqueeMouseMove(e: MouseEvent): void {
    if (!this._dragActive || !this._dragTarget) return;
    const x = e.pageX - this._dragTarget.offsetLeft;
    this._dragTarget.scrollLeft = this._dragScrollLeft - (x - this._dragStartX);
  }

  @HostListener('document:mouseup')
  onMarqueeMouseUp(): void {
    this._dragActive = false;
    if (this._dragTarget) this._dragTarget.style.cursor = 'grab';
    this._dragTarget = null;
  }

  // ── Chart pills ──────────────────────────────────────────────────────
  chartPills = signal<Record<ChartLineKey, boolean>>({
    revenue: true, fees: true, gross: true, discount: false, cashflow: false,
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
  grossLine = signal('');
  cashflowLine = signal('');
  discountLine = signal('');
  gridLines = signal<{ y: number; label: string }[]>([]);
  xLabels = signal<{ x: number; label: string }[]>([]);

  chartTooltip = signal<{ x: number; y: number; date: string; rev?: number; fee?: number; gross?: number; cf?: number; disc?: number } | null>(null);

  onChartHover(e: MouseEvent): void {
    const fd = this.finData();
    if (!fd) return;
    const svg = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = e.clientX - svg.left;
    const w = svg.width - this.padL - this.padR;
    const days = this.financialDays();
    const step = w / Math.max(days - 1, 1);
    const idx = Math.round((x - this.padL) / step);
    if (idx < 0 || idx >= days) { this.chartTooltip.set(null); return; }

    const dr = fd.dailyRevenue[idx];
    const dp = fd.dailyPayouts?.[idx];
    const dd = fd.dailyDiscount?.[idx];
    const rev = dr?.revenue ?? 0;
    const payout = dp?.amount ?? 0;
    const disc = dd?.amount ?? 0;
    const gross = rev - payout - disc;
    const cf = gross; // approximate (withdrawals are total, not daily)
    this.chartTooltip.set({
      x: e.clientX - svg.left + 12,
      y: e.clientY - svg.top - 60,
      date: dr?.date ?? '',
      rev: dr?.revenue,
      fee: dr?.fees,
      gross: gross || undefined,
      cf: cf || undefined,
      disc: dd?.amount,
    });
  }

  // ── Totals ───────────────────────────────────────────────────────────
  financialDays = signal(30);
  revenueTotal = signal(0);
  feesTotal = signal(0);
  grossTotal = signal(0);
  cashflowTotal = signal(0);
  discountTotal = signal(0);

  // ── Date range ───────────────────────────────────────────────────────
  dateFrom = signal(this.formatDate(todayMinus(30)));
  dateTo = signal(this.formatDate(new Date()));
  /** Detect which quarter the current date range falls into. */
  activeQuarter = computed(() => {
    const from = this.dateFrom();
    const to = this.dateTo();
    const y = new Date(from).getFullYear();
    const qStarts = ['', `${y}-01-01`, `${y}-04-01`, `${y}-07-01`, `${y}-10-01`];
    const qEnds = ['', `${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`];
    for (let q = 1; q <= 4; q++) {
      if (from === qStarts[q] && to === qEnds[q]) return q;
    }
    return 0;
  });
  activeYear = computed(() => new Date(this.dateFrom()).getFullYear());

  // ── Category filter ──────────────────────────────────────────────────
  selectedCatIds = signal<Set<string>>(new Set());
  isCatSelected(id: string): boolean { return this.selectedCatIds().has(id); }
  toggleCat(id: string): void {
    this.selectedCatIds.update(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    const ids = this.selectedCatIds();
    const singleId = ids.size === 1 ? [...ids][0] : '';
    this.loadFinancial(this.financialDays(), singleId);
  }
  clearCats(): void {
    this.selectedCatIds.set(new Set());
    this.loadFinancial(this.financialDays(), '');
  }
  /** Extract single category ID helper. */
  private get singleCatId(): string {
    const ids = this.selectedCatIds();
    return ids.size === 1 ? [...ids][0] : '';
  }
  dashCategories = signal<{ id: string; name: string; parentCategoryId: string | null }[]>([]);
  parentCategories = computed(() => this.dashCategories().filter((c) => !c.parentCategoryId));
  childCategories = computed(() => this.dashCategories().filter((c) => c.parentCategoryId));
  filteredChildCategories = computed(() => {
    const sel = this.selectedCatIds();
    if (sel.size === 0) return this.childCategories();
    // Show children of ALL selected parent categories
    const filtered = this.childCategories().filter(c => sel.has(c.parentCategoryId!));
    // Also include children that are directly selected
    for (const id of sel) {
      const cat = this.dashCategories().find(c => c.id === id);
      if (cat?.parentCategoryId && !filtered.some(c => c.id === id)) {
        filtered.push(cat);
      }
    }
    return filtered;
  });
  labelInterval = computed(() => (this.financialDays() > 20 ? 5 : 1));

  // ── Search ───────────────────────────────────────────────────────────
  searchQuery = '';
  /** Available sort fields for the toolbar dropdown. */
  readonly sortFields = [
    { key: 'fees', label: 'Fees' },
    { key: 'revenue', label: 'Revenue' },
    { key: 'count', label: 'Bookings' },
    { key: 'name', label: 'Category' },
  ];
  // ── Sort ─────────────────────────────────────────────────────────────
  sortState = signal<{ key: string; dir: 'asc' | 'desc' }>({ key: 'fees', dir: 'desc' });
  sortDropdownOpen = signal(false);

  toggleSortDir(): void {
    const s = this.sortState();
    this.sortState.set({ key: s.key, dir: s.dir === 'asc' ? 'desc' : 'asc' });
  }

  onSearchChange(): void { /* triggers recompute via signal reads in sorted arrays */ }

  sortIcon(key: string): string {
    if (this.sortState().key !== key) return '↕';
    return this.sortState().dir === 'asc' ? '▲' : '▼';
  }

  sortedCategoryBreakdown = computed(() => {
    const q = this.searchQuery.toLowerCase().trim();
    let rows = [...(this.finData()?.categoryBreakdown ?? [])];
    if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q) || String(r.count).includes(q) || String(r.revenue).includes(q) || String(r.fees).includes(q));
    const { key, dir } = this.sortState();
    const m = dir === 'asc' ? 1 : -1;
    if (key === 'name') rows.sort((a, b) => a.name.localeCompare(b.name) * m);
    else if (key === 'count') rows.sort((a, b) => (a.count - b.count) * m);
    else if (key === 'revenue') rows.sort((a, b) => (a.revenue - b.revenue) * m);
    else if (key === 'fees') rows.sort((a, b) => (a.fees - b.fees) * m);
    else if (key === 'pct') rows.sort((a, b) => ((a.fees / (this.finData()?.totalFees || 1)) - (b.fees / (this.finData()?.totalFees || 1))) * m);
    return rows;
  });

  sortedCustomerLB = computed(() => {
    const q = this.searchQuery.toLowerCase().trim();
    let rows = [...(this.finData()?.customerLeaderboard ?? [])];
    if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q) || String(r.bookingCount).includes(q) || String(r.totalSpent).includes(q) || (r.lastBooking ?? '').includes(q));
    const { key, dir } = this.sortState();
    const m = dir === 'asc' ? 1 : -1;
    if (key === 'custName') rows.sort((a, b) => a.name.localeCompare(b.name) * m);
    else if (key === 'custBookings') rows.sort((a, b) => (a.bookingCount - b.bookingCount) * m);
    else if (key === 'custSpent') rows.sort((a, b) => (a.totalSpent - b.totalSpent) * m);
    else if (key === 'custLast') rows.sort((a, b) => (a.lastBooking ?? '').localeCompare(b.lastBooking ?? '') * m);
    return rows;
  });

  sortedServicerLB = computed(() => {
    const q = this.searchQuery.toLowerCase().trim();
    let rows = [...(this.finData()?.servicerLeaderboard ?? [])];
    if (q) rows = rows.filter(r => (r.businessName || r.name).toLowerCase().includes(q) || String(r.jobCount).includes(q) || String(r.revenue).includes(q) || String(r.rating).includes(q));
    const { key, dir } = this.sortState();
    const m = dir === 'asc' ? 1 : -1;
    if (key === 'svcName') rows.sort((a, b) => (a.businessName || b.name).localeCompare(b.businessName || b.name) * m);
    else if (key === 'svcJobs') rows.sort((a, b) => (a.jobCount - b.jobCount) * m);
    else if (key === 'svcRevenue') rows.sort((a, b) => (a.revenue - b.revenue) * m);
    else if (key === 'svcRating') rows.sort((a, b) => (a.rating - b.rating) * m);
    else if (key === 'svcReports') rows.sort((a, b) => (a.reportCount - b.reportCount) * m);
    return rows;
  });

  // ── Bar + Donut charts for bottom 3 sections ──────────────────────────
  catBarTop5 = computed(() => {
    const rows = [...(this.finData()?.categoryBreakdown ?? [])];
    const sorted = rows.sort((a, b) => b.count - a.count).slice(0, 5);
    if (!sorted.length) return [];
    const maxVal = sorted[0].count || 1;
    return sorted.map((r) => ({ label: r.name, value: r.count, pct: (r.count / maxVal) * 100 }));
  });

  catDonutGradient = computed(() => {
    const rows = [...(this.finData()?.categoryBreakdown ?? [])].sort((a, b) => b.fees - a.fees);
    return this.buildDonutGradient(rows, (r) => r.fees);
  });

  catDonutLegend = computed(() => {
    const rows = [...(this.finData()?.categoryBreakdown ?? [])].sort((a, b) => b.fees - a.fees);
    return this.buildDonutLegend(rows, (r) => r.fees, (r) => r.name);
  });

  custBarTop5 = computed(() => {
    const rows = [...(this.finData()?.customerLeaderboard ?? [])]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);
    if (!rows.length) return [];
    const maxVal = rows[0].totalSpent || 1;
    return rows.map((r) => ({ label: r.name, value: r.totalSpent, pct: (r.totalSpent / maxVal) * 100 }));
  });

  custDonutGradient = computed(() => {
    const rows = [...(this.finData()?.customerLeaderboard ?? [])].sort((a, b) => b.totalSpent - a.totalSpent);
    return this.buildDonutGradient(rows, (r) => r.totalSpent);
  });

  custDonutLegend = computed(() => {
    const rows = [...(this.finData()?.customerLeaderboard ?? [])].sort((a, b) => b.totalSpent - a.totalSpent);
    return this.buildDonutLegend(rows, (r) => r.totalSpent, (r) => r.name);
  });

  svcBarTop5 = computed(() => {
    const rows = [...(this.finData()?.servicerLeaderboard ?? [])]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    if (!rows.length) return [];
    const maxVal = rows[0].revenue || 1;
    return rows.map((r) => ({ label: r.businessName || r.name, value: r.revenue, pct: (r.revenue / maxVal) * 100 }));
  });

  svcDonutGradient = computed(() => {
    const rows = [...(this.finData()?.servicerLeaderboard ?? [])].sort((a, b) => b.revenue - a.revenue);
    return this.buildDonutGradient(rows, (r) => r.revenue);
  });

  svcDonutLegend = computed(() => {
    const rows = [...(this.finData()?.servicerLeaderboard ?? [])].sort((a, b) => b.revenue - a.revenue);
    return this.buildDonutLegend(rows, (r) => r.revenue, (r) => r.businessName || r.name);
  });

  private buildDonutGradient<T>(rows: T[], valFn: (r: T) => number): string {
    const top5 = rows.slice(0, 5);
    const otherSum = rows.slice(5).reduce((s, r) => s + valFn(r), 0);
    const total = top5.reduce((s, r) => s + valFn(r), 0) + otherSum || 1;
    const stops: string[] = [];
    let acc = 0;
    for (let i = 0; i < top5.length; i++) {
      const pct = (valFn(top5[i]) / total) * 100;
      if (pct <= 0) continue;
      stops.push(`${DONUT_COLORS[i]} ${acc}% ${acc + pct}%`);
      acc += pct;
    }
    if (otherSum > 0 && acc < 100) {
      stops.push(`${DONUT_COLORS[5]} ${acc}% 100%`);
    }
    return stops.length ? `conic-gradient(${stops.join(',')})` : '';
  }

  private buildDonutLegend<T>(rows: T[], valFn: (r: T) => number, nameFn: (r: T) => string): { name: string; color: string }[] {
    const top5 = rows.slice(0, 5);
    const otherSum = rows.slice(5).reduce((s, r) => s + valFn(r), 0);
    const legend = top5.map((r, i) => ({ name: nameFn(r), color: DONUT_COLORS[i] }));
    if (otherSum > 0) legend.push({ name: 'Other', color: DONUT_COLORS[5] });
    return legend;
  }

  // ── Helpers ─────────────────────────────────────────────────────────
  cycleSortField(): void {
    const idx = this.sortFields.findIndex(f => f.key === this.sortState().key);
    const next = this.sortFields[(idx + 1) % this.sortFields.length];
    this.sortState.set({ key: next.key, dir: this.sortState().dir });
  }
  sortFieldLabel(): string {
    return this.sortFields.find(f => f.key === this.sortState().key)?.label ?? 'Fees';
  }
  selectSortField(key: string): void {
    this.sortState.set({ key, dir: this.sortState().dir });
    this.sortDropdownOpen.set(false);
  }

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
    this.loadFinancial(days, this.singleCatId);
  }

  setDateRange(from: string, to: string): void {
    this.dateFrom.set(from);
    this.dateTo.set(to);
    if (from && to) {
      const f = new Date(from);
      const t = new Date(to);
      const diffDays = Math.ceil((t.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
      this.financialDays.set(Math.max(1, diffDays));
      this.loadFinancial(Math.max(1, diffDays), this.singleCatId);
    }
  }

  setQuarter(q: number): void {
    const y = new Date().getFullYear();
    const starts = [0, 0, 3, 6, 9]; // months (0-indexed): Q1=Jan, Q2=Apr, Q3=Jul, Q4=Oct
    const from = new Date(y, starts[q], 1);
    const to = new Date(y, starts[q] + 3, 0); // last day of quarter-end month
    this.dateFrom.set(from.toISOString().slice(0, 10));
    this.dateTo.set(to.toISOString().slice(0, 10));
    const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    this.financialDays.set(Math.max(1, diffDays));
    this.loadFinancial(Math.max(1, diffDays), this.singleCatId);
  }
  setYear(y: number): void {
    const from = new Date(y, 0, 1);
    const to = new Date(y, 11, 31);
    this.dateFrom.set(from.toISOString().slice(0, 10));
    this.dateTo.set(to.toISOString().slice(0, 10));
    const diffDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    this.financialDays.set(Math.max(1, diffDays));
    this.loadFinancial(Math.max(1, diffDays), this.singleCatId);
  }

  reloadDashboard(): void {
    this.loadDashboard();
    this.loadFinancial(this.financialDays(), this.singleCatId);
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
    if (this.singleCatId) p['categoryId'] = this.singleCatId;
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
    const allDays = new Map<string, { rev: number; fee: number; pay: number; disc: number }>();

    for (const d of fd.dailyRevenue) {
      if (!allDays.has(d.date)) allDays.set(d.date, { rev: 0, fee: 0, pay: 0, disc: 0 });
      const pt = allDays.get(d.date)!;
      pt.rev = d.revenue;
      pt.fee = d.fees;
    }

    if (fd.dailyPayouts) {
      for (const d of fd.dailyPayouts) {
        if (!allDays.has(d.day)) allDays.set(d.day, { rev: 0, fee: 0, pay: 0, disc: 0 });
        allDays.get(d.day)!.pay = d.amount;
      }
    }

    if (fd.dailyDiscount) {
      for (const d of fd.dailyDiscount) {
        if (!allDays.has(d.day)) allDays.set(d.day, { rev: 0, fee: 0, pay: 0, disc: 0 });
        allDays.get(d.day)!.disc = d.amount;
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
    let revTotal = 0, feeTotal = 0, grossTotal = 0, cashflowTotal = 0, discTotal = 0;
    const revArr: number[] = [], feeArr: number[] = [], payArr: number[] = [], discArr: number[] = [];
    const dateArr: string[] = [];

    for (const [date, vals] of sorted) {
      dateArr.push(date);
      revArr.push(vals.rev);
      feeArr.push(vals.fee);
      payArr.push(vals.pay);
      discArr.push(vals.disc);
      if (pills.revenue) revTotal += vals.rev;
      if (pills.fees) feeTotal += vals.fee;
      if (pills.discount) discTotal += vals.disc;
    }

    // Compute gross and cashflow arrays (gross = rev - payout - disc)
    const grossArr: number[] = [];
    const cashflowArr: number[] = [];
    for (let i = 0; i < revArr.length; i++) {
      const payout = payArr[i] ?? 0;
      const disc = discArr[i] ?? 0;
      const g = revArr[i] - payout - disc;
      grossArr.push(g);
      cashflowArr.push(g); // approx (withdrawals are total, not daily)
      if (pills.gross) grossTotal += g;
      if (pills.cashflow) cashflowTotal += g;
    }

    this.revenueTotal.set(revTotal);
    this.feesTotal.set(feeTotal);
    this.grossTotal.set(grossTotal);
    this.cashflowTotal.set(cashflowTotal);
    this.discountTotal.set(discTotal);

    // Compute max value across active series
    let maxVal = 1;
    if (pills.revenue) maxVal = Math.max(maxVal, ...revArr);
    if (pills.fees) maxVal = Math.max(maxVal, ...feeArr);
    if (pills.gross) maxVal = Math.max(maxVal, ...grossArr.map(v => Math.abs(v)));
    if (pills.cashflow) maxVal = Math.max(maxVal, ...cashflowArr.map(v => Math.abs(v)));
    if (pills.discount) maxVal = Math.max(maxVal, ...discArr);

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
    this.grossLine.set(buildLine(grossArr, pills.gross));
    this.cashflowLine.set(buildLine(cashflowArr, pills.cashflow));
    this.discountLine.set(buildLine(discArr, pills.discount));

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
    this.grossLine.set('');
    this.cashflowLine.set('');
    this.discountLine.set('');
    this.gridLines.set([]);
    this.xLabels.set([]);
    this.revenueTotal.set(0);
    this.feesTotal.set(0);
    this.grossTotal.set(0);
    this.cashflowTotal.set(0);
    this.discountTotal.set(0);
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
