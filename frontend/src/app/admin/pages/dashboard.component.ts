import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

import { routeFor } from '../../core/route-for';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/icon.component';
import { LineChartComponent } from '../components/line-chart.component';
import { BarChartComponent } from '../components/bar-chart.component';
import { DonutChartComponent } from '../components/donut-chart.component';

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
  imports: [CommonModule, RouterLink, FormsModule, IconComponent, LineChartComponent, BarChartComponent, DonutChartComponent],
  template: `
    <h1>Admin dashboard</h1>

    <!-- ── STICKY TOP BAR ──────────────────────────────────────────────── -->
    <div class="dash-head" style="position:sticky;top:0;z-index:10;">
      <!-- Section A (darker bg): Categories + Search -->
      @if (headerExpanded()) {
      <div class="dash-head-a">
        <!-- Row 1: Parent categories -->
        <div class="cat-marquee" (mousedown)="onMarqueeMouseDown($event, marqueeEl)" #marqueeEl>
          <button class="chip" [class.active]="selectedCatIds().size === 0 || allParentsSelected()" (click)="toggleAllParents()">All</button>
          @for (cat of parentCategories(); track cat.id) {
            <button class="chip" [class.active]="isCatSelected(cat.id) || isChildOfParent(cat.id)" (click)="toggleCat(cat.id)">{{ cat.name }}</button>
          }
        </div>
        <!-- Row 2: Child categories -->
        <div class="cat-marquee sub" (mousedown)="onMarqueeMouseDown($event, childMarqueeEl)" #childMarqueeEl>
          <button class="chip" [class.active]="selectedCatIds().size === 0 || allChildrenSelected()" (click)="toggleAllChildren()">All</button>
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
      </div>
    </div>
    }

    <!-- Divider -->
      <div class="dash-divider"></div>

      <!-- Section B (lighter bg): Section pills + date controls -->
      <div class="dash-head-b">
        <div class="section-pills">
          <button class="chip" [class.active]="sectionFilters()['all']" (click)="toggleSectionFilter('all')">All</button>
          <button class="chip" [class.active]="sectionFilters()['queues']" (click)="toggleSectionFilter('queues')">Queues</button>
          <button class="chip" [class.active]="sectionFilters()['cards']" (click)="toggleSectionFilter('cards')">Cards</button>
          <button class="chip" [class.active]="sectionFilters()['chart']" (click)="toggleSectionFilter('chart')">Chart</button>
          <button class="chip" [class.active]="sectionFilters()['breakdown']" (click)="toggleSectionFilter('breakdown')">Breakdown</button>
          <button class="chip" [class.active]="sectionFilters()['customers']" (click)="toggleSectionFilter('customers')">Customers</button>
          <button class="chip" [class.active]="sectionFilters()['servicers']" (click)="toggleSectionFilter('servicers')">Servicers</button>
        </div>
        <div class="date-controls">
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
          </div>
          <input type="number" class="year-input" [ngModel]="activeYear()" (ngModelChange)="setYear(+$event)" min="2020" max="2030" />
        </div>
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
        <!-- Chart filter pills + mode toggle -->
        <div class="chart-toolbar">
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

          <!-- Chart mode toggle -->
          <div class="chart-mode-toggle">
            <button class="range-btn" [class.on]="chartMode() === 'daily'" (click)="chartMode.set('daily')">Daily █</button>
            <button class="range-btn" [class.on]="chartMode() === 'cumulative'" (click)="chartMode.set('cumulative')">Cumulative ∿</button>
          </div>
        </div>

        <!-- Chart -->
        <div class="card chart-card">
          <app-line-chart
            [labels]="chartLabels()"
            [datasets]="chartDatasets()"
            [chartType]="chartMode() === 'daily' ? 'bar' : 'line'"
            [loading]="finLoading()"
          />
        </div>
      }
    }

    <!-- ── 4. Category Breakdown ────────────────────────────────────────── -->
    @if (showSection('breakdown')) {
      @if (finData(); as fd) {
        <div class="card cat-breakdown page-child">
          <h3 class="card-title">Category Breakdown</h3>
          @if (fd.categoryBreakdown.length) {
            <!-- Bar + Donut charts -->
            <div class="chart-row">
              <div class="chart-left">
                <app-bar-chart
                  [labels]="catBarLabels()"
                  [values]="catBarValues()"
                  color="#f59e0b"
                  (barClick)="onCatBarClick($event)"
                />
              </div>
              <div class="chart-mid">
                <app-donut-chart
                  [labels]="catDonutLabels()"
                  [values]="catDonutValues()"
                  [colors]="DONUT_COLORS"
                  (sliceClick)="onCatSliceClick($event)"
                />
              </div>
              <div class="chart-right">
                <div class="donut-header">
                  <span class="muted small">Show by</span>
                  <select [(ngModel)]="catDonutMetric" (ngModelChange)="onCatDonutMetricChange()" class="donut-select">
                    <option value="fees">Fees</option>
                    <option value="count">Bookings</option>
                    <option value="revenue">Revenue</option>
                  </select>
                </div>
                <div class="donut-legend">
                  @for (item of catDonutLegend(); track item.label) {
                    <div class="donut-legend-item">
                      <span class="donut-dot" [style.background]="item.color"></span>
                      <span class="donut-legend-label">{{ item.label }}</span>
                      <span class="donut-legend-val">{{ item.value | number:'1.2-2' }} · {{ item.pct }}</span>
                    </div>
                  }
                </div>
              </div>
            </div>
            <table class="cb-table">
              <thead>
                <tr>
                  <th (click)="sortState.set({key:'name',dir:sortState().key==='name'&&sortState().dir==='asc'?'desc':'asc'})">Category <span class="sort-icon">{{ sortIcon('name') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'count',dir:sortState().key==='count'&&sortState().dir==='asc'?'desc':'asc'})">Bookings <span class="sort-icon">{{ sortIcon('count') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'revenue',dir:sortState().key==='revenue'&&sortState().dir==='asc'?'desc':'asc'})">Revenue <span class="sort-icon">{{ sortIcon('revenue') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'fees',dir:sortState().key==='fees'&&sortState().dir==='asc'?'desc':'asc'})">Fees <span class="sort-icon">{{ sortIcon('fees') }}</span></th>
                  <th class="num" (click)="sortState.set({key:'avgFee',dir:sortState().key==='avgFee'&&sortState().dir==='asc'?'desc':'asc'})">Avg Fee <span class="sort-icon">{{ sortIcon('avgFee') }}</span></th>
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
                    <td class="num">RM {{ (row.fees / (row.count || 1)) | number:'1.2-2' }}</td>
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
          <h3 class="card-title">Customer Leaderboard</h3>
          @if (fd.customerLeaderboard && fd.customerLeaderboard.length) {
            <!-- Bar + Donut charts -->
            <div class="chart-row">
              <div class="chart-left">
                <app-bar-chart
                  [labels]="custBarLabels()"
                  [values]="custBarValues()"
                  color="#16a34a"
                  (barClick)="onCustBarClick($event)"
                />
              </div>
              <div class="chart-mid">
                <app-donut-chart
                  [labels]="custDonutLabels()"
                  [values]="custDonutValues()"
                  [colors]="DONUT_COLORS"
                  (sliceClick)="onCustSliceClick($event)"
                />
              </div>
              <div class="chart-right">
                <div class="donut-header">
                  <span class="muted small">Show by</span>
                  <select [(ngModel)]="custDonutMetric" (ngModelChange)="onCustDonutMetricChange()" class="donut-select">
                    <option value="totalSpent">Total Spent</option>
                    <option value="bookingCount">Bookings</option>
                  </select>
                </div>
                <div class="donut-legend">
                  @for (item of custDonutLegend(); track item.label) {
                    <div class="donut-legend-item">
                      <span class="donut-dot" [style.background]="item.color"></span>
                      <span class="donut-legend-label">{{ item.label }}</span>
                      <span class="donut-legend-val">{{ item.value | number:'1.2-2' }} · {{ item.pct }}</span>
                    </div>
                  }
                </div>
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
          <h3 class="card-title">Servicer Leaderboard</h3>
          @if (fd.servicerLeaderboard && fd.servicerLeaderboard.length) {
            <!-- Bar + Donut charts -->
            <div class="chart-row">
              <div class="chart-left">
                <app-bar-chart
                  [labels]="svcBarLabels()"
                  [values]="svcBarValues()"
                  color="#2563eb"
                  (barClick)="onSvcBarClick($event)"
                />
              </div>
              <div class="chart-mid">
                <app-donut-chart
                  [labels]="svcDonutLabels()"
                  [values]="svcDonutValues()"
                  [colors]="DONUT_COLORS"
                  (sliceClick)="onSvcSliceClick($event)"
                />
              </div>
              <div class="chart-right">
                <div class="donut-header">
                  <span class="muted small">Show by</span>
                  <select [(ngModel)]="svcDonutMetric" (ngModelChange)="onSvcDonutMetricChange()" class="donut-select">
                    <option value="revenue">Revenue</option>
                    <option value="jobCount">Jobs</option>
                  </select>
                </div>
                <div class="donut-legend">
                  @for (item of svcDonutLegend(); track item.label) {
                    <div class="donut-legend-item">
                      <span class="donut-dot" [style.background]="item.color"></span>
                      <span class="donut-legend-label">{{ item.label }}</span>
                      <span class="donut-legend-val">{{ item.value | number:'1.2-2' }} · {{ item.pct }}</span>
                    </div>
                  }
                </div>
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
      .dash-head-b { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 2rem; background: var(--color-surface); flex-wrap: nowrap; overflow-x: auto; }
      .section-pills { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; }
      .date-controls { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; flex-wrap: wrap; }
      .header-toggle {
        margin-left: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        padding: 0;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        background: transparent;
        color: var(--color-muted);
        cursor: pointer;
        flex-shrink: 0;
        transition: color 0.15s ease, background 0.15s ease;
      }
      .header-toggle:hover { color: var(--color-text); background: var(--color-bg); }
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
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1.25rem 1.25rem 1.5rem;
        transition: box-shadow var(--transition), transform var(--transition);
        min-width: 0;
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
      .fin-cf-row { display: flex; justify-content: space-between; align-items: center; padding: 0.1rem 0; }
      .fin-cf-row .fin-label { color: var(--color-muted); font-size: 0.8rem; }
      .fin-cf-in { font-size: 1.6rem; font-weight: 700; color: #f59e0b; }
      .fin-cf-out { font-size: 1rem; font-weight: 600; color: #dc2626; }
      .fin-cf-gross { font-size: 1rem; font-weight: 600; color: #16a34a; }
      .fin-cf-gross.neg { color: #dc2626; }
      .fin-cf-cashflow { font-size: 1rem; font-weight: 600; color: inherit; }
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

      /* ── Date controls ─────────────────────────────────────────────── */
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
        align-items: center;  /* prevent flex children from stretching to tallest sibling */
        gap: 0;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        overflow: hidden;
      }
      .range-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        padding: 0.3rem 0.7rem;
        font-size: 0.78rem;
        line-height: 1;
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
        border: 1px solid var(--color-border);
        border-radius: 6px;
        /* !important to override global input:not([type="radio"]):not([type="checkbox"]) (0,0,3,1 > 0,0,1,0) */
        padding: 0.3rem 0.5rem !important;
        font-size: 0.78rem !important;
        line-height: normal !important;
        font-weight: 600;
        color: var(--color-muted);
        font-family: inherit;
        width: 5rem !important;
        text-align: center;
        box-sizing: border-box;
      }
      .year-input:focus { outline: none; color: var(--color-primary); }

      /* ── Chart filter pills ─────────────────────────────────────────── */
      .chart-toolbar { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.6rem; }
      .chart-pills {
        display: flex; flex-wrap: wrap; gap: 0.5rem;
      }
      .chart-mode-toggle {
        display: flex; gap: 0.35rem; margin-left: auto;
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

      /* ── Category breakdown table ───────────────────────────────────── */
            .card-title { font-size: 1rem; font-weight: 600; margin: 0 0 0.75rem 0; color: var(--color-text); }
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
      .chart-row { display: flex; gap: 1rem; align-items: stretch; margin-bottom: 1rem; }
      .chart-left { flex: 2; min-width: 0; }
      .chart-mid { flex: 1; display: flex; align-items: center; justify-content: center; }
      .chart-right { flex: 2; display: flex; flex-direction: column; justify-content: center; }
      .donut-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.6rem; width: 100%; }
      .donut-legend { margin-top: 0.5rem; width: 100%; }
      .donut-legend-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; margin-bottom: 0.35rem; color: var(--color-muted); }
      .donut-legend-label { flex: 1; font-size: 0.82rem; }
      .donut-legend-val { font-weight: 600; color: var(--color-text); font-size: 0.82rem; }
      .donut-select { font-size: 0.82rem; padding: 0.25rem 0.4rem; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-surface); color: var(--color-text); font-family: inherit; }

      /* ── Responsive ─────────────────────────────────────────────────── */
      @media (max-width: 760px) { .chart-row { display: none; } }
      @media (max-width: 900px) {
        .fin-cards { grid-template-columns: repeat(3, 1fr); }
      }
      @media (max-width: 600px) {
        .fin-cards { grid-template-columns: 1fr 1fr; }
        .grid { grid-template-columns: 1fr 1fr; }
      }
      @media (max-width: 400px) {
        .fin-cards { grid-template-columns: 1fr; }
      }
    `,
  ],
})
export class AdminDashboardComponent implements OnInit {
  protected readonly routeFor = routeFor;
  protected readonly DONUT_COLORS = DONUT_COLORS;
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
  headerExpanded = signal(true);
  toggleHeader(): void { this.headerExpanded.update(v => !v); }
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
  chartMode = signal<'daily' | 'cumulative'>('daily');

  toggleChartPill(key: ChartLineKey): void {
    this.chartPills.update((p) => ({ ...p, [key]: !p[key] }));
  }

  // ── Financial days ──────────────────────────────────────────────────
  financialDays = signal(30);

  // ── Date range ───────────────────────────────────────────────────────
  dateFrom = signal(this.formatDate(todayMinus(30)));
  dateTo = signal(this.formatDate(new Date()));
  /** Detect which quarter the current date range falls into. */
  activeQuarter = computed(() => {
    const from = this.dateFrom();
    const to = this.dateTo();
    const y = from.slice(0, 4);  /* extract year from string — avoids timezone skew from new Date() */
    const qStarts = ['', `${y}-01-01`, `${y}-04-01`, `${y}-07-01`, `${y}-10-01`];
    const qEnds = ['', `${y}-03-31`, `${y}-06-30`, `${y}-09-30`, `${y}-12-31`];
    for (let q = 1; q <= 4; q++) {
      if (from === qStarts[q] && to === qEnds[q]) return q;
    }
    return 0;
  });
  activeYear = computed(() => +this.dateFrom().slice(0, 4));

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
  /** Whether every parent category is currently selected. */
  allParentsSelected = computed(() => {
    const parents = this.parentCategories();
    if (parents.length === 0) return false;
    return parents.every(c => this.selectedCatIds().has(c.id));
  });
  /** Whether every visible child category is currently selected. */
  allChildrenSelected = computed(() => {
    const children = this.filteredChildCategories();
    if (children.length === 0) return false;
    return children.every(c => this.selectedCatIds().has(c.id));
  });
  /** Select or deselect all parent categories; does not affect children. */
  toggleAllParents(): void {
    if (this.allParentsSelected()) {
      this.selectedCatIds.update(s => {
        const next = new Set(s);
        for (const c of this.parentCategories()) next.delete(c.id);
        return next;
      });
    } else {
      this.selectedCatIds.update(s => {
        const next = new Set(s);
        for (const c of this.parentCategories()) next.add(c.id);
        return next;
      });
    }
    this.loadFinancial(this.financialDays(), this.singleCatId);
  }
  /** Select or deselect all visible child categories; does not affect parents. */
  toggleAllChildren(): void {
    const children = this.filteredChildCategories();
    if (this.allChildrenSelected()) {
      this.selectedCatIds.update(s => {
        const next = new Set(s);
        for (const c of children) next.delete(c.id);
        return next;
      });
    } else {
      this.selectedCatIds.update(s => {
        const next = new Set(s);
        for (const c of children) next.add(c.id);
        return next;
      });
    }
    this.loadFinancial(this.financialDays(), this.singleCatId);
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

  // ── Search ───────────────────────────────────────────────────────────
  searchQuery = '';
  // ── Sort (table column headers) ──────────────────────────────────────
  sortState = signal<{ key: string; dir: 'asc' | 'desc' }>({ key: 'fees', dir: 'desc' });

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

  // ── Chart computed signals ──────────────────────────────────────────
  chartLabels = computed(() => this.finData()?.dailyRevenue?.map(d => d.date) ?? []);
  chartDatasets = computed(() => {
    const fd = this.finData();
    if (!fd) return [];
    const pills = this.chartPills();
    const rev = pills.revenue ? fd.dailyRevenue?.map(d => d.revenue) ?? [] : [];
    const fee = pills.fees ? fd.dailyRevenue?.map(d => d.fees) ?? [] : [];
    const disc = fd.dailyDiscount ? fd.dailyDiscount.map(d => d.amount) : [];
    const payouts = fd.dailyPayouts ? fd.dailyPayouts.map(d => d.amount) : [];
    const gross = rev.map((_, i) => fee[i] - (disc[i] ?? 0));
    const cf = gross.map((_, i) => gross[i]);
    const toCumulative = (arr: number[]) => arr.reduce((acc, v, i) => { acc.push((acc[i-1] ?? 0) + v); return acc; }, [] as number[]);
    const cum = this.chartMode() === 'cumulative';
    return [
      { label: 'Revenue', data: cum ? toCumulative(rev) : rev, color: '#2563eb', hidden: !pills.revenue },
      { label: 'Fees', data: cum ? toCumulative(fee) : fee, color: '#f59e0b', dashed: true, hidden: !pills.fees },
      { label: 'Gross', data: cum ? toCumulative(gross) : gross, color: '#16a34a', hidden: !pills.gross },
      { label: 'Discounts', data: cum ? toCumulative(disc) : disc, color: '#dc2626', dashed: true, hidden: !pills.discount },
      { label: 'Cashflow', data: cum ? toCumulative(cf) : cf, color: '#9333ea', dashed: true, hidden: !pills.cashflow },
    ];
  });

  // Category breakdown charts
  catBarLabels = computed(() => this.sortedCategoryBreakdown().slice(0, 5).map(r => r.name));
  catBarValues = computed(() => this.sortedCategoryBreakdown().slice(0, 5).map(r => r.count));
  catDonutLabels = computed(() => this.sortedCategoryBreakdown().slice(0, 5).map(r => r.name));
  catDonutValues = computed(() => {
    const rows = this.sortedCategoryBreakdown().slice(0, 5);
    const m = this.catDonutMetric();
    if (m === 'fees') return rows.map(r => r.fees);
    if (m === 'count') return rows.map(r => r.count);
    return rows.map(r => r.revenue);
  });

  // Customer leaderboard charts
  custBarLabels = computed(() => this.sortedCustomerLB().slice(0, 5).map(r => r.name));
  custBarValues = computed(() => this.sortedCustomerLB().slice(0, 5).map(r => r.totalSpent));
  custDonutLabels = computed(() => this.sortedCustomerLB().slice(0, 5).map(r => r.name));
  custDonutValues = computed(() => {
    const rows = this.sortedCustomerLB().slice(0, 5);
    const m = this.custDonutMetric();
    if (m === 'bookingCount') return rows.map(r => r.bookingCount);
    return rows.map(r => r.totalSpent);
  });

  // Servicer leaderboard charts
  svcBarLabels = computed(() => this.sortedServicerLB().slice(0, 5).map(r => r.businessName || r.name));
  svcBarValues = computed(() => this.sortedServicerLB().slice(0, 5).map(r => r.revenue));
  svcDonutLabels = computed(() => this.sortedServicerLB().slice(0, 5).map(r => r.businessName || r.name));
  svcDonutValues = computed(() => {
    const rows = this.sortedServicerLB().slice(0, 5);
    const m = this.svcDonutMetric();
    if (m === 'jobCount') return rows.map(r => r.jobCount);
    return rows.map(r => r.revenue);
  });

  // ── Donut metric selectors ──────────────────────────────────────────
  catDonutMetric = signal<'fees' | 'count' | 'revenue'>('fees');
  custDonutMetric = signal<'totalSpent' | 'bookingCount'>('totalSpent');
  svcDonutMetric = signal<'revenue' | 'jobCount'>('revenue');

  onCatDonutMetricChange(): void { /* triggers recompute via signal reads */ }
  onCustDonutMetricChange(): void { /* triggers recompute via signal reads */ }
  onSvcDonutMetricChange(): void { /* triggers recompute via signal reads */ }

  // ── Donut legends ───────────────────────────────────────────────────
  catDonutLegend = computed(() => {
    const rows = this.sortedCategoryBreakdown().slice(0, 5);
    const vals = this.catDonutValues();
    const total = vals.length ? vals.reduce((s, v) => s + v, 0) || 1 : 1;
    return rows.map((r, i) => ({
      label: r.name,
      value: vals[i],
      pct: ((vals[i] / total) * 100).toFixed(1) + '%',
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
  });
  custDonutLegend = computed(() => {
    const rows = this.sortedCustomerLB().slice(0, 5);
    const vals = this.custDonutValues();
    const total = vals.length ? vals.reduce((s, v) => s + v, 0) || 1 : 1;
    return rows.map((r, i) => ({
      label: r.name,
      value: vals[i],
      pct: ((vals[i] / total) * 100).toFixed(1) + '%',
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
  });
  svcDonutLegend = computed(() => {
    const rows = this.sortedServicerLB().slice(0, 5);
    const vals = this.svcDonutValues();
    const total = vals.length ? vals.reduce((s, v) => s + v, 0) || 1 : 1;
    return rows.map((r, i) => ({
      label: r.businessName || r.name,
      value: vals[i],
      pct: ((vals[i] / total) * 100).toFixed(1) + '%',
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));
  });

  // Chart interaction handlers
  onCatBarClick(idx: number): void { /* handled by Chart.js built-in interactions */ }
  onCatSliceClick(idx: number): void { /* handled by Chart.js built-in interactions */ }
  onCustBarClick(idx: number): void { /* handled by Chart.js built-in interactions */ }
  onCustSliceClick(idx: number): void { /* handled by Chart.js built-in interactions */ }
  onSvcBarClick(idx: number): void { /* handled by Chart.js built-in interactions */ }
  onSvcSliceClick(idx: number): void { /* handled by Chart.js built-in interactions */ }

  // ── Helpers ─────────────────────────────────────────────────────────
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
    // Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
    const mStart = (q - 1) * 3; // 0,3,6,9
    const mEnd = mStart + 2; // 2,5,8,11
    const from = `${y}-${String(mStart + 1).padStart(2, '0')}-01`;
    const to = `${y}-${String(mEnd + 1).padStart(2, '0')}-${String(new Date(y, mEnd + 1, 0).getDate()).padStart(2, '0')}`;
    this.dateFrom.set(from);
    this.dateTo.set(to);
    const d = [0, 90, 91, 92, 92][q]; // days per quarter (non-leap)
    this.financialDays.set(Math.max(1, d));
    this.loadFinancial(Math.max(1, d), this.singleCatId);
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
        },
        error: () => {
          this.finLoading.set(false);
          this.finFailed.set(true);
        },
      });
  }

}

/** Return a date N days before today. */
function todayMinus(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}
