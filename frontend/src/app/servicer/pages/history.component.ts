import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { statusBadgeClass } from '../../shared/status-badge.util';

interface Job {
  id: string;
  status: string;
  price: number;
  netPrice: number;
  paymentMode: string;
  scheduledDate: string;
  timeSlot: string;
  cashConfirmed: boolean;
  quoteRequest: { category: { name: string } };
}

interface DailyEarning {
  date: string;
  earnings: number;
  jobs: number;
}

interface EarningsSummary {
  totalEarnings: number;
  totalJobs: number;
}

/**
 * Servicer History page - dedicated completed-jobs and earnings history view.
 * Shows a 30-day earnings summary and a paginated list of completed / cancelled jobs.
 */
@Component({
  selector: 'app-servicer-history',
  standalone: true,
  host: { class: 'page-enter' },
  imports: [CommonModule, FormsModule, ListToolbarComponent],
  template: `
    <h1>Job history</h1>

    <!-- ── Earnings summary ───────────────────────────────────────────── -->
    <section class="card summary page-child">
      <h2>Last 30 days</h2>
      @if (loadingEarnings()) {
        <p class="muted">Loading earnings…</p>
      } @else if (earningsFailed()) {
        <p class="load-err">Could not load earnings data. Please refresh to try again.</p>
      } @else {
        <div class="stat-row">
          <div class="stat">
            <span class="n">RM {{ summary().totalEarnings | number: '1.2-2' }}</span>
            <span class="muted">Total earned</span>
          </div>
          <div class="stat">
            <span class="n">{{ summary().totalJobs }}</span>
            <span class="muted">Completed jobs</span>
          </div>
          <div class="stat">
            <span class="n">
              RM {{ summary().totalJobs > 0
                ? (summary().totalEarnings / summary().totalJobs | number: '1.2-2')
                : '0.00' }}
            </span>
            <span class="muted">Avg per job</span>
          </div>
        </div>

        <!-- Mini bar chart -->
        @if (chartDays().length) {
          <div class="chart" aria-hidden="true">
            @for (d of chartDays(); track d.date) {
              <div class="bar-col" [title]="d.date + ': RM ' + d.earnings">
                <div class="bar-track">
                  <div class="bar" [style.height.%]="barHeight(d.earnings)"></div>
                </div>
              </div>
            }
          </div>
          <div class="chart-labels">
            <span>30 days ago</span>
            <span>Today</span>
          </div>
        }
      }
    </section>

    <!-- ── Search + sort toolbar ──────────────────────────────────────── -->
    <app-list-toolbar>
      <input
        class="search"
        type="text"
        placeholder="Search by business or category…"
        [(ngModel)]="searchQuery"
        name="hists"
        toolbar-search
      />
      <select [(ngModel)]="sortBy" name="histsort" toolbar-sort>
        <option value="date">Most recent</option>
        <option value="earnings">Highest earnings</option>
      </select>
    </app-list-toolbar>

    <!-- ── Status filter tabs ─────────────────────────────────────────── -->
    <div class="tabs page-child">
      <button
        class="tab"
        [class.active]="filter() === 'all'"
        (click)="filter.set('all')"
      >All</button>
      <button
        class="tab"
        [class.active]="filter() === 'completed'"
        (click)="filter.set('completed')"
      >Completed</button>
      <button
        class="tab"
        [class.active]="filter() === 'cancelled'"
        (click)="filter.set('cancelled')"
      >Cancelled</button>
    </div>

    <!-- ── Jobs list ──────────────────────────────────────────────────── -->
    @if (loadingJobs()) {
      <p class="muted">Loading jobs…</p>
    } @else if (jobsFailed()) {
      <p class="load-err">Could not load job history. Please refresh to try again.</p>
    } @else {
      <div class="jobs-list page-child">
        @for (j of filteredJobs(); track j.id) {
          <div class="card job-row">
            <div class="job-main">
              <strong>{{ j.quoteRequest.category.name }}</strong>
              <span [class]="statusBadgeClass(j.status)">
                {{ j.status }}
              </span>
            </div>
            <div class="job-meta">
              <span>{{ j.scheduledDate | date: 'mediumDate' }}</span>
              <span class="sep">·</span>
              <span>{{ j.timeSlot }}</span>
              <span class="sep">·</span>
              <span>{{ j.paymentMode | titlecase }}</span>
            </div>
            <div class="job-price">
              RM {{ j.status === 'completed' ? (j.netPrice | number: '1.2-2') : (j.price | number: '1.2-2') }}
              @if (j.status === 'completed' && j.netPrice < j.price) {
                <span class="muted small">(charge deducted)</span>
              }
              @if (j.status === 'completed' && j.paymentMode === 'cash' && !j.cashConfirmed) {
                <span class="warn">Cash not confirmed</span>
              }
            </div>
          </div>
        } @empty {
          <p class="muted empty">No {{ filter() === 'all' ? '' : filter() }} jobs found.</p>
        }
      </div>
    }
  `,
  styles: [
    `
      :host { display: block; }
      h1 {
        margin-bottom: 1.2rem;
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        padding-bottom: 0.6rem;
        margin-bottom: 0.6rem;
        border-bottom: 1px solid var(--color-border);
      }
      .search {
        min-width: 180px;
        max-width: 260px;
        border-radius: 999px;
        padding: 0.45rem 0.85rem;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: 0.88rem;
        outline: none;
        transition: border-color var(--transition);
      }
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
      h2 {
        margin: 0 0 1rem;
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .summary {
        margin-bottom: 1.6rem;
      }
      .stat-row {
        display: flex;
        gap: 2rem;
        flex-wrap: wrap;
      }
      .stat {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .n {
        font-size: 1.6rem;
        font-weight: 800;
        color: var(--color-primary);
      }
      /* Bar chart */
      .chart {
        display: flex;
        align-items: flex-end;
        gap: 3px;
        height: 64px;
        margin-top: 1.2rem;
      }
      .bar-col {
        flex: 1;
        height: 100%;
        display: flex;
        align-items: flex-end;
      }
      .bar-track {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: flex-end;
      }
      .bar {
        width: 100%;
        min-height: 2px;
        background: var(--color-primary);
        opacity: 0.6;
        border-radius: 3px 3px 0 0;
      }
      .chart-labels {
        display: flex;
        justify-content: space-between;
        font-size: 0.72rem;
        color: var(--color-muted);
        margin-top: 0.3rem;
      }
      /* Tabs */
      .tabs {
        display: flex;
        gap: 0.4rem;
        margin-bottom: 1rem;
      }
      .tab {
        padding: 0.35rem 0.85rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background: transparent;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        color: var(--color-muted);
        transition: background var(--transition), color var(--transition), border-color var(--transition),
                    box-shadow var(--transition), transform 0.12s ease;
      }
      .tab:hover:not(.active) {
        background: var(--color-surface);
        border-color: var(--color-primary);
        color: var(--color-primary);
        transform: translateY(-1px);
      }
      .tab.active {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
        box-shadow: 0 2px 8px rgba(201, 90, 60, 0.25);
      }
      /* Jobs list */
      .jobs-list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .job-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
        flex-wrap: wrap;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .job-row:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09);
        transform: translateY(-1px);
      }
      .job-main {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-width: 180px;
      }
      .job-meta {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.83rem;
        color: var(--color-muted);
      }
      .sep {
        color: var(--color-border);
      }
      .job-price {
        font-weight: 700;
        color: var(--color-primary);
        display: flex;
        align-items: center;
        gap: 0.5rem;
        white-space: nowrap;
      }
      /* .badge + .badge-{status} styles come from global styles.css */
      .warn {
        font-size: 0.72rem;
        color: var(--color-warning);
        font-weight: 600;
      }
      .load-err {
        color: var(--color-danger);
        padding: 0.5rem 0;
      }
      .empty {
        padding: 2rem 0;
        text-align: center;
      }
    `,
  ],
})
export class ServicerHistoryComponent implements OnInit {
  protected readonly statusBadgeClass = statusBadgeClass;
  private api = inject(ApiService);

  loadingJobs = signal(true);
  loadingEarnings = signal(true);
  jobsFailed = signal(false);
  earningsFailed = signal(false);
  jobs = signal<Job[]>([]);
  daily = signal<DailyEarning[]>([]);
  filter = signal<'all' | 'completed' | 'cancelled'>('all');
  searchQuery = signal('');
  sortBy = signal<'date' | 'earnings'>('date');

  summary = computed<EarningsSummary>(() => {
    const rows = this.daily();
    return {
      totalEarnings: rows.reduce((s, r) => s + Number(r.earnings), 0),
      totalJobs: rows.reduce((s, r) => s + Number(r.jobs), 0),
    };
  });

  filteredJobs = computed(() => {
    const f = this.filter();
    const q = this.searchQuery().toLowerCase();
    const sb = this.sortBy();
    let all = this.jobs();
    if (f !== 'all') all = all.filter((j) => j.status === f);
    if (q) {
      all = all.filter(
        (j) =>
          j.quoteRequest.category.name.toLowerCase().includes(q),
      );
    }
    all = [...all].sort((a, b) => {
      if (sb === 'earnings') return b.netPrice - a.netPrice;
      return b.scheduledDate.localeCompare(a.scheduledDate);
    });
    return all;
  });

  chartDays = computed(() => this.daily());

  ngOnInit(): void {
    // Load completed + cancelled jobs
    this.api
      .get<{ data: Job[] }>('/servicer/jobs', { status: 'completed' })
      .subscribe({
        next: (r) => {
          // Merge with cancelled jobs fetched separately
          const completed = r.data ?? [];
          this.api
            .get<{ data: Job[] }>('/servicer/jobs', { status: 'cancelled' })
            .subscribe({
              next: (c) => {
                // Sort newest first by scheduledDate
                const all = [...completed, ...(c.data ?? [])].sort(
                  (a, b) =>
                    new Date(b.scheduledDate).getTime() -
                    new Date(a.scheduledDate).getTime(),
                );
                this.jobs.set(all);
                this.loadingJobs.set(false);
              },
              error: () => {
                this.jobs.set(completed);
                this.loadingJobs.set(false);
              },
            });
        },
        error: () => {
          this.loadingJobs.set(false);
          this.jobsFailed.set(true);
        },
      });

    // Load 30-day earnings
    this.api
      .get<{ data: DailyEarning[]; totalEarnings: number; totalJobs: number }>(
        '/servicer/me/earnings/daily',
        { days: '30' },
      )
      .subscribe({
        next: (r) => {
          this.daily.set(r.data ?? []);
          this.loadingEarnings.set(false);
        },
        error: () => {
          this.loadingEarnings.set(false);
          this.earningsFailed.set(true);
        },
      });
  }

  barHeight(earnings: number): number {
    const max = Math.max(...this.chartDays().map((d) => Number(d.earnings)), 1);
    return Math.round((Number(earnings) / max) * 100);
  }
}
