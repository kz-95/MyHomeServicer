import { Component, ElementRef, ViewChild, inject, signal, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/icon.component';

// ── Types ──────────────────────────────────────────────────────────────────

interface FinancialTotals {
  bookingRevenue: number; commission: number; topUps: number;
  payouts: number; withdrawals: number; escrowHeld: number; pendingPayouts: number;
  gatewayFees: number; registeredDiscounts: number; promoCosts: number; pointsCosts: number;
  urgentFeeRevenue: number; urgentFeePlatformShare: number;
}
interface Cashflow { totalIn: number; totalOut: number; gross: number; netAfterWithdrawals: number; }
interface CatItem { name: string; count: number; revenue: number; commission: number; confirmed: number; completed: number; cancelled: number; }
interface CustItem { name: string; email: string; bookingCount: number; totalSpent: number; }
interface ServItem { name: string; businessName: string; rating: number; jobCount: number; revenue: number; reportCount: number; }
interface DailyTrend { highestRevenueDay: string; highestRevenueAmount: number; averageDailyRevenue: number; totalDays: number; }
interface FinancialSnapshot {
  period: string; categoryId?: string; totals: FinancialTotals; cashflow: Cashflow;
  categoryBreakdown: CatItem[]; customerTop10: CustItem[]; servicerTop10: ServItem[];
  dailyTrend: DailyTrend; periodLabel: string;
}
interface ReportResponse { report: string; tokensUsed: number | null; financialData: FinancialSnapshot; }

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtMyr(n: number): string {
  return n >= 1000
    ? `RM ${n.toLocaleString('en-MY', { maximumFractionDigits: 0 })}`
    : `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function pct(n: number, total: number): number { return total > 0 ? (n / total) * 100 : 0; }
function succ(c: CatItem): number { return c.count > 0 ? (c.completed / c.count) * 100 : 0; }
function canc(c: CatItem): number { return c.count > 0 ? (c.cancelled / c.count) * 100 : 0; }

// ── Component ──────────────────────────────────────────────────────────────

@Component({
  selector: 'app-financial-chat',
  standalone: true,
  imports: [CommonModule, IconComponent],
  template: `
    <!-- Trigger -->
    <button class="report-btn" (click)="open()" title="Generate AI financial report">
      <span class="rb-glow"></span>
      <app-icon name="file-text" sizeToken="sm" />
      <span>Financial Report Generate</span>
    </button>

    <!-- Dialog -->
    <dialog #dialogRef class="report-dialog">
      <div class="wizard-shell">
        <!-- Top bar -->
        <div class="wiz-top">
          <div class="wiz-brand">
            <app-icon name="bar-chart" sizeToken="sm" />
            <span>Financial Report</span>
            <span class="wiz-period">{{ finData()?.periodLabel ?? '' }}</span>
          </div>
          <div class="wiz-actions">
            @if (finData()) {
              <button class="tb-btn" title="Regenerate" (click)="generate()" [disabled]="loading()"><app-icon name="refresh-cw" sizeToken="sm" /></button>
            }
            <button class="tb-btn" title="Close" (click)="close()"><app-icon name="x" sizeToken="sm" /></button>
          </div>
        </div>

        <!-- Step dots -->
        @if (finData()) {
          <div class="wiz-dots">
            @for (s of steps; track s.id; let i = $index) {
              <button class="wiz-dot" [class.active]="step() === i" [class.done]="step() > i" (click)="step.set(i)">
                <span class="dot-num">{{ i + 1 }}</span>
                <span class="dot-label">{{ s.label }}</span>
              </button>
            }
          </div>
        }

        <!-- Body -->
        <div class="wiz-body" #scrollBody>
          @if (loading()) {
            <div class="wiz-skeleton">
              @for (i of [1,2,3,4]; track i) {
                <div class="sk-card"><div class="sk-line w80"></div><div class="sk-line w60"></div><div class="sk-line w40"></div></div>
              }
            </div>
          } @else if (error()) {
            <div class="wiz-error">
              <app-icon name="alert-triangle" sizeToken="lg" />
              <p>{{ error() }}</p>
              <button class="gen-btn" (click)="generate()">Retry</button>
            </div>
          } @else if (finData()) {
            <!-- ═══ STEP 1: Overview ═══ -->
            @if (step() === 0) {
              <div class="wiz-page" @enter>
                <div class="hero-grid">
                  @for (h of heroCards(); track h.label; let i = $index) {
                    <div class="hero-card" [class.primary]="i===0" [style.animation-delay.ms]="i * 80">
                      <div class="hero-label">{{ h.label }}</div>
                      <div class="hero-value" [class.pos]="h.positive" [class.neg]="h.negative">{{ h.value }}</div>
                      <div class="hero-sub">{{ h.sub }}</div>
                    </div>
                  }
                </div>
                <h2 class="sec-title">Performance Summary</h2>
                <div class="perf-grid">
                  @for (p of perfCards(); track p.label; let i = $index) {
                    <div class="perf-card" [style.animation-delay.ms]="200 + i * 60">
                      <div class="perf-label">{{ p.label }}</div>
                      <div class="perf-value">{{ p.value }}</div>
                      @if (p.sub) { <div class="perf-sub">{{ p.sub }}</div> }
                      @if (p.barPct !== undefined) { <div class="mini-bar"><div class="mini-fill green" [style.width.%]="p.barPct"></div></div> }
                    </div>
                  }
                </div>
              </div>
            }

            <!-- ═══ STEP 2: Income & Expense ═══ -->
            @if (step() === 1) {
              <div class="wiz-page" @enter>
                <h2 class="sec-title">Income Breakdown</h2>
                <div class="bd-list">
                  @for (item of incomeItems(); track item.label; let i = $index) {
                    <div class="bd-row" [style.animation-delay.ms]="i * 70">
                      <div class="bd-label">{{ item.label }}</div>
                      <div class="bd-track"><div class="bd-fill" [class.green]="item.color==='green'" [class.amber]="item.color==='amber'" [style.width.%]="item.pct"></div></div>
                      <div class="bd-val">{{ fmtMyr(item.value) }}</div>
                      <div class="bd-pct">{{ item.pct.toFixed(1) }}%</div>
                    </div>
                  }
                </div>
                <h2 class="sec-title" style="margin-top:24px">Expense Breakdown</h2>
                <div class="bd-list">
                  @for (item of expenseItems(); track item.label; let i = $index) {
                    <div class="bd-row" [style.animation-delay.ms]="300 + i * 60">
                      <div class="bd-label">{{ item.label }}</div>
                      <div class="bd-track"><div class="bd-fill red" [style.width.%]="item.pct"></div></div>
                      <div class="bd-val">{{ fmtMyr(item.value) }}</div>
                      <div class="bd-pct">{{ item.pct.toFixed(1) }}%</div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- ═══ STEP 3: Categories & Leaders ═══ -->
            @if (step() === 2) {
              <div class="wiz-page" @enter>
                <h2 class="sec-title">Category Highlights</h2>
                <div class="cat-grid">
                  @for (cat of topCategories(); track cat.name; let i = $index) {
                    <div class="cat-card" [class.t1]="i===0" [class.t2]="i===1" [class.t3]="i===2" [style.animation-delay.ms]="i * 60">
                      <div class="cat-rank">{{ i + 1 }}</div>
                      <div class="cat-info">
                        <div class="cat-name">{{ cat.name }}</div>
                        <div class="cat-stats"><span>{{ cat.count }} bookings</span><span>{{ fmtMyr(cat.revenue) }}</span></div>
                        <div class="cat-tags"><span class="tag g">{{ succ(cat).toFixed(0) }}% success</span>@if (canc(cat) > 20) {<span class="tag r">{{ canc(cat).toFixed(0) }}% cancel</span>}</div>
                      </div>
                    </div>
                  }
                </div>
                <h2 class="sec-title" style="margin-top:24px">Top Customers</h2>
                <div class="ldr-list">
                  @for (c of finData()!.customerTop10.slice(0, 5); track c.email; let i = $index) {
                    <div class="ldr-row" [style.animation-delay.ms]="400 + i * 50">
                      <div class="ldr-rank">{{ i+1 }}</div>
                      <div class="ldr-info"><div class="ldr-name">{{ c.name }}</div><div class="ldr-meta">{{ c.bookingCount }} bookings · {{ fmtMyr(c.totalSpent) }}</div></div>
                    </div>
                  }
                </div>
                <h2 class="sec-title" style="margin-top:24px">Top Servicers</h2>
                <div class="ldr-list">
                  @for (s of finData()!.servicerTop10.slice(0, 5); track s.businessName || s.name; let i = $index) {
                    <div class="ldr-row" [style.animation-delay.ms]="600 + i * 50">
                      <div class="ldr-rank">{{ i+1 }}</div>
                      <div class="ldr-info"><div class="ldr-name">{{ s.businessName || s.name }}</div><div class="ldr-meta">{{ s.jobCount }} jobs · {{ fmtMyr(s.revenue) }} · {{ (s.rating || 0).toFixed(1) }}★</div></div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- ═══ STEP 4: Progress & Achievements ═══ -->
            @if (step() === 3) {
              <div class="wiz-page" @enter>
                <h2 class="sec-title">KPI Progress</h2>
                <div class="kpi-grid">
                  @for (k of kpiItems(); track k.label; let i = $index) {
                    <div class="kpi-card" [style.animation-delay.ms]="i * 80">
                      <div class="kpi-hdr"><span>{{ k.label }}</span><span class="kpi-tgt">{{ fmtMyr(k.current) }} / {{ fmtMyr(k.target) }}</span></div>
                      <div class="kpi-track"><div class="kpi-fill" [class.g]="k.pct>=80" [class.a]="k.pct>=50&&k.pct<80" [class.r]="k.pct<50" [style.width.%]="k.pct"></div></div>
                      <div class="kpi-ftr"><span class="kpi-pct">{{ k.pct.toFixed(0) }}%</span><span>{{ k.estimate }}</span></div>
                    </div>
                  }
                </div>
                <h2 class="sec-title" style="margin-top:24px">Achievements</h2>
                <div class="ach-grid">
                  @for (a of achievements(); track a.label; let i = $index) {
                    <div class="ach-card" [class.earned]="a.earned" [class.locked]="!a.earned" [style.animation-delay.ms]="300 + i * 60">
                      <span class="ach-icon">{{ a.icon }}</span>
                      <div><div class="ach-name">{{ a.label }}</div><div class="ach-desc">{{ a.desc }}</div></div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- ═══ STEP 5: AI Insights ═══ -->
            @if (step() === 4) {
              <div class="wiz-page" @enter>
                <h2 class="sec-title"><app-icon name="sparkles" sizeToken="sm" /> AI Analysis</h2>
                @if (aiLoading()) {
                  <div class="ai-block ai-loading">
                    <div class="sk-line w80"></div><div class="sk-line w60"></div><div class="sk-line w90"></div>
                    <div class="sk-line w50"></div><div class="sk-line w70"></div><div class="sk-line w40"></div>
                    <p class="ai-loading-text">Generating detailed analysis...</p>
                  </div>
                } @else if (aiReport()) {
                  <div class="ai-block" [innerHTML]="fmtRpt(aiReport()!)"></div>
                } @else {
                  <div class="ai-block"><p class="ai-loading-text">Analysis not available. Try regenerating.</p></div>
                }
              </div>
            }
          } @else {
            <div class="wiz-empty">
              <app-icon name="file-text" sizeToken="lg" class="empty-icon" />
              <h3>Financial Report</h3>
              <p>Generate a comprehensive financial analysis.</p>
              <button class="gen-btn" (click)="generate()"><app-icon name="sparkles" sizeToken="sm" /> Generate Report</button>
            </div>
          }
        </div>

        <!-- Footer with nav -->
        @if (finData()) {
          <div class="wiz-foot">
            <button class="wiz-nav" [disabled]="step() === 0" (click)="step.update(s => s - 1)"><app-icon name="chevron-left" sizeToken="sm" /> Previous</button>
            <span class="wiz-step-num">{{ step() + 1 }} / {{ steps.length }}</span>
            <button class="wiz-nav" [disabled]="step() === steps.length - 1" (click)="step.update(s => s + 1)">Next <app-icon name="chevron-right" sizeToken="sm" /></button>
          </div>
        }
      </div>
    </dialog>
  `,
  styles: [`
    /* ── rotating border button ── */
    @property --rb-angle { syntax:"<angle>"; inherits:false; initial-value:0deg; }
    .report-btn {
      position:relative; display:inline-flex; align-items:center; gap:6px;
      padding:7px 16px; border-radius:8px; border:none;
      background:var(--gradient-primary); color:#fff; font-size:0.85rem; cursor:pointer;
      white-space:nowrap; overflow:visible;
      box-shadow:0 4px 18px rgba(201,90,60,0.35),0 0 30px rgba(201,90,60,0.1);
      transition:transform 0.3s ease,box-shadow 0.3s ease,background 0.3s ease;
    }
    .report-btn:hover {
      transform:translateY(-1px);
      background:var(--gradient-primary-hover);
      box-shadow:0 6px 24px rgba(201,90,60,0.5),0 0 50px rgba(201,90,60,0.2);
    }
    .report-btn:hover .rb-glow { background:conic-gradient(from var(--rb-angle),transparent,rgba(255,255,255,0.8),rgba(255,200,100,0.6),rgba(255,255,255,0.8),transparent 70%); }
    .rb-glow {
      position:absolute; inset:-1px; border-radius:8px; padding:2px;
      background:conic-gradient(from var(--rb-angle),transparent,rgba(255,255,255,0.35),rgba(255,200,100,0.25),rgba(255,255,255,0.35),transparent 70%);
      animation:rb-glow-spin 3s linear infinite;
      -webkit-mask:linear-gradient(#000,#000) content-box,linear-gradient(#000,#000); -webkit-mask-composite:xor; mask-composite:exclude;
      pointer-events:none; transition:background 0.3s ease;
    }
    @keyframes rb-glow-spin { from{--rb-angle:0deg} to{--rb-angle:360deg} }

    /* ── dialog ── */
    .report-dialog {
      width:800px; max-width:calc(100vw - 2rem); height:92vh; max-height:calc(100dvh - 3rem);
      margin:auto; padding:0; border:none; border-radius:14px;
      background:var(--color-bg); color:var(--color-text);
      box-shadow:var(--shadow-lg);
      overflow:hidden; animation:d-in 0.3s ease;
    }
    .report-dialog::backdrop { background:var(--color-backdrop); backdrop-filter:blur(3px); }
    @keyframes d-in { from{opacity:0;transform:scale(0.96) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
    @media(max-width:768px){ .report-dialog{width:calc(100vw - 0.5rem);height:96vh;border-radius:8px} }

    /* ── wizard shell ── */
    .wizard-shell { display:flex; flex-direction:column; height:100%; }
    .wiz-top {
      display:flex; align-items:center; justify-content:space-between;
      padding:12px 20px; border-bottom:1px solid var(--color-border); flex-shrink:0;
      background:var(--color-surface);
    }
    .wiz-brand { display:flex; align-items:center; gap:8px; font-weight:700; font-size:0.95rem; }
    .wiz-period { font-weight:400; font-size:0.72rem; color:var(--color-muted); margin-left:4px; }
    .wiz-actions { display:flex; gap:4px; }
    .tb-btn {
      display:flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:6px;
      border:none; background:transparent; color:var(--color-muted);
      cursor:pointer; transition:all 0.15s;
    }
    .tb-btn:hover { background:var(--color-bg); color:var(--color-text); }

    /* ── dots ── */
    .wiz-dots {
      display:flex; justify-content:center; gap:4px;
      padding:10px 20px; border-bottom:1px solid var(--color-border); flex-shrink:0;
      background:var(--color-surface);
    }
    .wiz-dot {
      display:flex; flex-direction:column; align-items:center; gap:2px;
      border:none; background:none; cursor:pointer; padding:4px 10px; border-radius:6px;
      transition:all 0.2s ease; min-width:60px;
    }
    .wiz-dot:hover { background:var(--color-bg); }
    .dot-num {
      width:26px; height:26px; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-size:0.72rem; font-weight:700;
      background:var(--color-border); color:var(--color-muted);
      transition:all 0.3s ease;
    }
    .wiz-dot.active .dot-num { background:var(--color-primary); color:#fff; }
    .wiz-dot.done .dot-num { background:var(--color-success); color:#fff; }
    .dot-label { font-size:0.62rem; color:var(--color-muted); white-space:nowrap; transition:color 0.2s; }
    .wiz-dot.active .dot-label { color:var(--color-primary); font-weight:600; }

    /* ── body ── */
    .wiz-body {
      flex:1; overflow-y:auto; padding:24px 28px;
      scroll-behavior:smooth; background:var(--color-bg);
    }
    .wiz-page {
      animation:wp-in 0.4s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes wp-in {
      from { opacity:0; transform:translateY(12px); }
      to { opacity:1; transform:translateY(0); }
    }

    /* stagger each card */
    .hero-card, .perf-card, .bd-row, .cat-card, .kpi-card, .ach-card, .ldr-row {
      opacity:0; animation:card-in 0.45s cubic-bezier(0.16,1,0.3,1) forwards;
    }
    @keyframes card-in {
      from { opacity:0; transform:translateY(16px); }
      to { opacity:1; transform:translateY(0); }
    }

    .sec-title {
      font-size:0.82rem; font-weight:700; text-transform:uppercase;
      letter-spacing:0.05em; color:var(--color-muted);
      margin-bottom:12px; display:flex; align-items:center; gap:6px;
    }

    /* hero */
    .hero-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; margin-bottom:20px; }
    .hero-card {
      background:var(--color-surface); border:1px solid var(--color-border);
      border-radius:10px; padding:16px 18px; transition:transform 0.2s ease,box-shadow 0.2s ease;
    }
    .hero-card:hover { transform:translateY(-2px); box-shadow:var(--shadow-md); }
    .hero-card.primary { border-color:var(--color-primary); background:linear-gradient(135deg,var(--color-primary-light),var(--color-surface)); }
    .hero-label { font-size:0.7rem; color:var(--color-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }
    .hero-value { font-size:1.4rem; font-weight:800; }
    .hero-value.pos { color:var(--color-success); }
    .hero-value.neg { color:var(--color-danger); }
    .hero-sub { font-size:0.7rem; color:var(--color-muted); margin-top:3px; }

    /* perf */
    .perf-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:8px; }
    .perf-card {
      background:var(--color-surface); border:1px solid var(--color-border);
      border-radius:8px; padding:12px 14px; transition:transform 0.15s ease;
    }
    .perf-card:hover { transform:translateY(-1px); }
    .perf-label { font-size:0.7rem; color:var(--color-muted); margin-bottom:2px; }
    .perf-value { font-size:1rem; font-weight:700; }
    .perf-sub { font-size:0.67rem; color:var(--color-muted); margin-top:2px; }
    .mini-bar { height:3px; background:var(--color-border); border-radius:2px; margin-top:5px; overflow:hidden; }
    .mini-fill { height:100%; border-radius:2px; background:var(--color-success); transition:width 0.8s ease; }

    /* breakdown */
    .bd-list { display:flex; flex-direction:column; gap:5px; }
    .bd-row {
      display:flex; align-items:center; gap:10px; padding:7px 10px;
      background:var(--color-surface); border-radius:8px; font-size:0.78rem;
      border:1px solid transparent; transition:border-color 0.15s;
    }
    .bd-row:hover { border-color:var(--color-border); }
    .bd-label { width:130px; flex-shrink:0; font-weight:500; }
    .bd-track { flex:1; height:6px; background:var(--color-border); border-radius:3px; overflow:hidden; }
    .bd-fill { height:100%; border-radius:3px; background:var(--color-primary); transition:width 0.7s ease; }
    .bd-fill.green { background:var(--color-success); }
    .bd-fill.amber { background:var(--color-warning); }
    .bd-fill.red { background:var(--color-danger); }
    .bd-val { width:90px; text-align:right; font-weight:600; font-variant-numeric:tabular-nums; }
    .bd-pct { width:42px; text-align:right; color:var(--color-muted); font-variant-numeric:tabular-nums; }

    /* kpi */
    .kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px; }
    .kpi-card {
      background:var(--color-surface); border:1px solid var(--color-border);
      border-radius:10px; padding:14px 16px;
    }
    .kpi-hdr { display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.78rem; }
    .kpi-tgt { color:var(--color-muted); }
    .kpi-track { height:8px; background:var(--color-border); border-radius:4px; overflow:hidden; margin-bottom:5px; }
    .kpi-fill { height:100%; border-radius:4px; transition:width 1s ease; }
    .kpi-fill.g { background:var(--color-success); }
    .kpi-fill.a { background:var(--color-warning); }
    .kpi-fill.r { background:var(--color-danger); }
    .kpi-ftr { display:flex; justify-content:space-between; font-size:0.68rem; color:var(--color-muted); }
    .kpi-pct { font-weight:700; }

    /* categories */
    .cat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:8px; }
    .cat-card {
      display:flex; align-items:center; gap:10px;
      background:var(--color-surface); border:1px solid var(--color-border);
      border-radius:10px; padding:12px 14px; transition:all 0.15s ease;
    }
    .cat-card:hover { transform:translateY(-1px); box-shadow:var(--shadow-md); }
    .cat-card.t1 { border-color:var(--color-warning); }
    .cat-card.t2 { border-color:var(--color-muted); }
    .cat-card.t3 { border-color:#cd853f; }
    .cat-rank {
      width:26px; height:26px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-weight:800; font-size:0.75rem;
      background:var(--color-border); color:var(--color-muted);
    }
    .t1 .cat-rank { background:var(--color-warning); color:#fff; }
    .t2 .cat-rank { background:var(--color-muted); color:#fff; }
    .t3 .cat-rank { background:#cd853f; color:#fff; }
    .cat-info { flex:1; min-width:0; }
    .cat-name { font-weight:600; font-size:0.82rem; }
    .cat-stats { font-size:0.7rem; color:var(--color-muted); display:flex; gap:8px; margin-top:2px; }
    .cat-tags { margin-top:4px; display:flex; gap:5px; }
    .tag { font-size:0.62rem; padding:1px 7px; border-radius:4px; font-weight:600; }
    .tag.g { background:var(--color-success-bg); color:var(--color-success); }
    .tag.r { background:var(--color-danger-bg); color:var(--color-danger); }

    /* leaders */
    .ldr-list { display:flex; flex-direction:column; gap:5px; }
    .ldr-row {
      display:flex; align-items:center; gap:10px;
      padding:8px 12px; background:var(--color-surface);
      border-radius:8px; border:1px solid transparent; transition:border-color 0.15s;
    }
    .ldr-row:hover { border-color:var(--color-border); }
    .ldr-rank {
      width:22px; height:22px; border-radius:50%; flex-shrink:0;
      display:flex; align-items:center; justify-content:center;
      font-weight:700; font-size:0.68rem;
      background:var(--color-border); color:var(--color-muted);
    }
    .ldr-info { flex:1; min-width:0; }
    .ldr-name { font-weight:600; font-size:0.8rem; }
    .ldr-meta { font-size:0.68rem; color:var(--color-muted); }

    /* achievements */
    .ach-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:6px; }
    .ach-card {
      display:flex; align-items:center; gap:8px;
      padding:10px 12px; border-radius:10px; border:1px solid var(--color-border);
      background:var(--color-surface); transition:all 0.15s ease;
    }
    .ach-card.earned { border-color:var(--color-success); background:linear-gradient(135deg,var(--color-success-bg),var(--color-surface)); }
    .ach-card.locked { opacity:0.45; filter:grayscale(1); }
    .ach-icon { font-size:1.2rem; flex-shrink:0; }
    .ach-name { font-weight:600; font-size:0.74rem; }
    .ach-desc { font-size:0.65rem; color:var(--color-muted); }

    /* AI block */
    .ai-block {
      font-size:0.82rem; line-height:1.7; color:var(--color-text);
      padding:16px 20px; background:var(--color-surface);
      border-radius:10px; border:1px solid var(--color-border);
    }
    .ai-block h2 { font-size:0.95rem; margin:1em 0 0.3em; }
    .ai-block h3 { font-size:0.85rem; margin:0.8em 0 0.2em; }
    .ai-block p { margin:0.4em 0; }
    .ai-block strong { color:var(--color-primary); }
    .ai-block ul, .ai-block ol { padding-left:1.2em; margin:0.3em 0; }
    .ai-block li { margin:0.15em 0; }
    .ai-block code { font-size:0.75rem; padding:2px 5px; border-radius:4px; background:var(--color-border); }
    .ai-loading { display:flex; flex-direction:column; gap:10px; padding:24px 20px; }
    .ai-loading-text { font-size:0.8rem; color:var(--color-muted); text-align:center; margin-top:8px; }
    .ai-loading .sk-line { height:10px; border-radius:5px; background:var(--color-border); animation:sk-pulse 1.5s ease infinite; }
    .ai-loading .sk-line.w90 { width:90%; } .ai-loading .sk-line.w70 { width:70%; } .ai-loading .sk-line.w50 { width:50%; }

    /* skeleton */
    .wiz-skeleton { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; padding:20px; }
    .sk-card {
      background:var(--color-surface); border-radius:10px; padding:18px;
      border:1px solid var(--color-border);
    }
    .sk-line { height:10px; border-radius:5px; background:var(--color-border); margin-bottom:8px; animation:sk-pulse 1.5s ease infinite; }
    .sk-line.w80 { width:80%; } .sk-line.w60 { width:60%; } .sk-line.w40 { width:40%; }
    @keyframes sk-pulse { 0%,100%{opacity:0.4} 50%{opacity:1} }

    /* empty / error */
    .wiz-empty, .wiz-error {
      display:flex; flex-direction:column; align-items:center;
      justify-content:center; height:100%; gap:12px;
      text-align:center; padding:60px 20px; color:var(--color-muted);
    }
    .wiz-empty h3 { font-size:1.1rem; color:var(--color-text); }
    .wiz-error { color:var(--color-danger); }
    .empty-icon { opacity:0.3; margin-bottom:8px; }
    .gen-btn {
      display:inline-flex; align-items:center; gap:8px;
      padding:10px 24px; border-radius:8px; border:none;
      background:var(--color-primary); color:#fff;
      font-size:0.9rem; font-weight:600; cursor:pointer; transition:all 0.15s;
    }
    .gen-btn:hover { opacity:0.85; transform:translateY(-1px); }

    /* footer */
    .wiz-foot {
      display:flex; align-items:center; justify-content:center; gap:16px;
      padding:10px 20px; border-top:1px solid var(--color-border); flex-shrink:0;
      background:var(--color-surface);
    }
    .wiz-nav {
      display:inline-flex; align-items:center; gap:4px;
      padding:6px 14px; border-radius:8px; border:1px solid var(--color-border);
      background:var(--color-surface); color:var(--color-text);
      font-size:0.8rem; cursor:pointer; transition:all 0.15s;
    }
    .wiz-nav:hover:not(:disabled) { border-color:var(--color-primary); color:var(--color-primary); }
    .wiz-nav:disabled { opacity:0.35; cursor:default; }
    .wiz-step-num { font-size:0.75rem; color:var(--color-muted); }
  `],
})
export class FinancialChatComponent {
  Math = Math; fmtMyr = fmtMyr; succ = succ; canc = canc;
  private api = inject(ApiService);

  finData = signal<FinancialSnapshot | null>(null);
  aiReport = signal<string | null>(null);
  aiLoading = signal(false);
  loading = signal(false);
  error = signal<string | null>(null);
  step = signal(0);

  readonly steps = [
    { id: 'overview', label: 'Overview' },
    { id: 'income', label: 'Income & Expenses' },
    { id: 'categories', label: 'Categories & Leaders' },
    { id: 'progress', label: 'Progress & Achievements' },
    { id: 'insights', label: 'AI Insights' },
  ];

  @ViewChild('dialogRef') dialogRef!: ElementRef<HTMLDialogElement>;

  readonly queryParams = input<Record<string, string | number>>({ days: 30 });

  // ── computed ──
  netProfit = (): number => this.finData()?.cashflow.netAfterWithdrawals ?? 0;
  platformEarnings = (): number => {
    const d = this.finData(); return d ? d.totals.commission + d.totals.urgentFeePlatformShare : 0;
  };
  commissionRate = (): number => {
    const d = this.finData(); return d ? (d.totals.commission / Math.max(1, d.totals.bookingRevenue)) * 100 : 0;
  };
  totalBk = (): number => this.finData()?.categoryBreakdown.reduce((s,c) => s + c.count, 0) ?? 0;
  completedBk = (): number => this.finData()?.categoryBreakdown.reduce((s,c) => s + c.completed, 0) ?? 0;
  cancelledBk = (): number => this.finData()?.categoryBreakdown.reduce((s,c) => s + c.cancelled, 0) ?? 0;
  overallSucc = (): number => { const t=this.totalBk(); return t>0 ? (this.completedBk()/t)*100 : 0; };
  activeCats = (): number => this.finData()?.categoryBreakdown.filter(c=>c.count>0).length ?? 0;
  avgCustSpend = (): number => {
    const d=this.finData(); if(!d?.customerTop10.length) return 0;
    return d.customerTop10.reduce((s,c)=>s+c.totalSpent,0)/d.customerTop10.length;
  };
  avgServRev = (): number => {
    const d=this.finData(); if(!d?.servicerTop10.length) return 0;
    return d.servicerTop10.reduce((s,c)=>s+c.revenue,0)/d.servicerTop10.length;
  };

  heroCards = (): Array<{ label:string; value:string; sub:string; positive?:boolean; negative?:boolean }> => {
    const d = this.finData(); if (!d) return [];
    const np = this.netProfit();
    return [
      { label:'Net Profit', value:fmtMyr(np), sub:'After all costs & withdrawals', positive:np>=0, negative:np<0 },
      { label:'Revenue', value:fmtMyr(d.totals.bookingRevenue), sub:`${d.dailyTrend.totalDays}d booking revenue` },
      { label:'Expenses', value:fmtMyr(d.cashflow.totalOut), sub:'Payouts, fees, promos, points' },
      { label:'Platform Earnings', value:fmtMyr(this.platformEarnings()), sub:`${this.commissionRate().toFixed(1)}% commission rate` },
      { label:'Pending Payouts', value:fmtMyr(d.totals.pendingPayouts), sub:'Completed, not yet paid' },
      { label:'Cash Flow', value:fmtMyr(d.cashflow.gross), sub:`${fmtMyr(d.cashflow.totalIn)} in · ${fmtMyr(d.cashflow.totalOut)} out`, positive:d.cashflow.gross>=0, negative:d.cashflow.gross<0 },
    ];
  };

  perfCards = (): Array<{ label:string; value:string; sub?:string; barPct?:number }> => {
    const d = this.finData(); if (!d) return [];
    return [
      { label:'Avg Daily Revenue', value:fmtMyr(d.dailyTrend.averageDailyRevenue), sub:`Highest: ${d.dailyTrend.highestRevenueDay} (${fmtMyr(d.dailyTrend.highestRevenueAmount)})` },
      { label:'Total Bookings', value:`${this.totalBk()}`, sub:`${this.completedBk()} completed · ${this.cancelledBk()} cancelled` },
      { label:'Success Rate', value:`${this.overallSucc().toFixed(1)}%`, barPct:this.overallSucc() },
      { label:'Commission Earned', value:fmtMyr(d.totals.commission), sub:`${this.commissionRate().toFixed(1)}% effective` },
      { label:'Active Categories', value:`${this.activeCats()}`, sub:`${d.categoryBreakdown.length} total` },
      { label:'Top Customers', value:`${d.customerTop10.length}`, sub:`Avg ${fmtMyr(this.avgCustSpend())}/customer` },
      { label:'Top Servicers', value:`${d.servicerTop10.length}`, sub:`Avg ${fmtMyr(this.avgServRev())}/servicer` },
      { label:'Escrow Held', value:fmtMyr(d.totals.escrowHeld), sub:`Top-ups: ${fmtMyr(d.totals.topUps)}` },
    ];
  };

  incomeItems = (): Array<{ label:string; value:number; pct:number; color:string }> => {
    const d = this.finData(); if (!d) return [];
    const t = d.totals.bookingRevenue + d.totals.topUps;
    return [
      { label:'Booking Revenue', value:d.totals.bookingRevenue, pct:pct(d.totals.bookingRevenue,t), color:'green' },
      { label:'Commission', value:d.totals.commission, pct:pct(d.totals.commission,t), color:'green' },
      { label:'Wallet Top-ups', value:d.totals.topUps, pct:pct(d.totals.topUps,t), color:'amber' },
      { label:'Urgent Fees', value:d.totals.urgentFeeRevenue, pct:pct(d.totals.urgentFeeRevenue,t), color:'amber' },
    ];
  };

  expenseItems = (): Array<{ label:string; value:number; pct:number }> => {
    const d = this.finData(); if (!d) return [];
    const t = d.cashflow.totalOut || 1;
    return [
      { label:'Servicer Payouts', value:d.totals.payouts, pct:pct(d.totals.payouts,t) },
      { label:'Withdrawals', value:d.totals.withdrawals, pct:pct(d.totals.withdrawals,t) },
      { label:'Gateway Fees', value:d.totals.gatewayFees, pct:pct(d.totals.gatewayFees,t) },
      { label:'Customer Discounts', value:d.totals.registeredDiscounts, pct:pct(d.totals.registeredDiscounts,t) },
      { label:'Promotions', value:d.totals.promoCosts, pct:pct(d.totals.promoCosts,t) },
      { label:'Loyalty Points', value:d.totals.pointsCosts, pct:pct(d.totals.pointsCosts,t) },
    ];
  };

  kpiItems = (): Array<{ label:string; current:number; target:number; pct:number; estimate:string }> => {
    const d = this.finData(); if (!d) return [];
    const rev = d.totals.bookingRevenue;
    const mr = d.dailyTrend.averageDailyRevenue * 30;
    return [
      { label:'Monthly Revenue', current:rev, target:Math.max(rev*1.2,mr*1.2), pct:Math.min(100,(rev/Math.max(1,mr*1.2))*100), estimate:mr>0?`~${fmtMyr(mr)}/mo`:'--' },
      { label:'Profit Target', current:d.cashflow.gross, target:Math.max(d.cashflow.gross*1.3,rev*0.15), pct:Math.min(100,(d.cashflow.gross/Math.max(1,rev*0.15))*100), estimate:d.cashflow.gross>=0?'On track':'Below target' },
      { label:'Success Rate', current:this.overallSucc(), target:90, pct:Math.min(100,this.overallSucc()), estimate:this.overallSucc()>=80?'Good':this.overallSucc()>=60?'Fair':'Needs work' },
    ];
  };

  topCategories = (): CatItem[] => {
    const d = this.finData(); return d ? [...d.categoryBreakdown].sort((a,b)=>b.revenue-a.revenue).slice(0,8) : [];
  };

  achievements = (): Array<{ icon:string; label:string; desc:string; earned:boolean }> => {
    const d = this.finData(); if (!d) return [];
    const rev = d.totals.bookingRevenue;
    const tc = this.topCategories()[0];
    const tcu = d.customerTop10[0];
    return [
      { icon:'🏆', label:'Highest Revenue Day', desc:`${d.dailyTrend.highestRevenueDay} — ${fmtMyr(d.dailyTrend.highestRevenueAmount)}`, earned:d.dailyTrend.highestRevenueAmount>0 },
      { icon:'🎯', label:'90%+ Success Rate', desc:this.overallSucc()>=90?`${this.overallSucc().toFixed(1)}%`:`${this.overallSucc().toFixed(1)}% — aim 90%`, earned:this.overallSucc()>=90 },
      { icon:'📦', label:'100+ Bookings', desc:this.totalBk()>=100?`${this.totalBk()} completed`:`${this.totalBk()} so far`, earned:this.totalBk()>=100 },
      { icon:'⚡', label:'Urgent Revenue', desc:d.totals.urgentFeeRevenue>0?`${fmtMyr(d.totals.urgentFeeRevenue)} earned`:'None yet', earned:d.totals.urgentFeeRevenue>0 },
      { icon:'⭐', label:'Top Category > RM50k', desc:tc?`${tc.name}: ${fmtMyr(tc.revenue)}`: '--', earned:!!tc&&tc.revenue>=50000 },
      { icon:'💎', label:'VIP Customer', desc:tcu?`${tcu.name}: ${fmtMyr(tcu.totalSpent)}`:'--', earned:!!tcu&&tcu.totalSpent>=10000 },
      { icon:'📈', label:'Revenue > RM100k', desc:rev>=100000?`${fmtMyr(rev)}`:`${fmtMyr(100000-rev)} to go`, earned:rev>=100000 },
      { icon:'🛡️', label:'Low Cancel Rate', desc:this.cancelledBk()>0&&(this.cancelledBk()/Math.max(1,this.totalBk()))*100<10?'Under 10%':'Reduce', earned:this.cancelledBk()>0&&(this.cancelledBk()/Math.max(1,this.totalBk()))*100<10 },
    ];
  };

  // ── dialog ──
  open(): void {
    try { const d=this.dialogRef?.nativeElement as HTMLDialogElement|undefined; if(!d||d.open) return; d.showModal(); if(!this.finData()&&!this.loading()) this.generate(); } catch(e){ console.error(e); }
  }
  close(): void { try { const d=this.dialogRef?.nativeElement as HTMLDialogElement|undefined; if(d?.open) d.close(); } catch{} }

  async generate(): Promise<void> {
    this.loading.set(true); this.aiLoading.set(true); this.error.set(null); this.step.set(0);

    const qp = this.queryParams();
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(qp)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();

    try {
      // 1. Fast: load snapshot data for steps 1-4
      const snapRes = await firstValueFrom(
        this.api.get<FinancialSnapshot>(`/admin/dashboard/financial/snapshot?${qs}`),
      );
      this.finData.set(snapRes);
      this.loading.set(false);
      // Report is now visible with steps 1-4

      // 2. Slow: load AI analysis for step 5 (runs in background while admin browses)
      const aiRes = await firstValueFrom(
        this.api.post<ReportResponse>(`/admin/chat/financial-report?${qs}`, {}),
      );
      this.aiReport.set(aiRes.report);
    } catch (err: any) {
      // If snapshot failed, show error. If only AI failed, steps 1-4 still work.
      if (!this.finData()) {
        this.error.set(err?.error?.error?.message || err?.message || 'Failed to load financial data.');
      }
      // AI failure is silent - step 5 will show "not available"
    } finally {
      this.loading.set(false);
      this.aiLoading.set(false);
    }
  }

  fmtRpt(text:string): string {
    let o = text.replace(/^#### (.+)$/gm,'<h4>$1</h4>').replace(/^### (.+)$/gm,'<h3>$1</h3>').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/^# (.+)$/gm,'<h1>$1</h1>');
    o = o.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/\*(.+?)\*/g,'<em>$1</em>');
    o = o.replace(/^(\d+)\.\s+(.+)$/gm,'<li value="$1">$2</li>');
    o = o.replace(/^[-*]\s+(.+)$/gm,'<li>$1</li>');
    o = o.replace(/\n\n+/g,'</p><p>'); o = '<p>'+o+'</p>';
    o = o.replace(/<p>\s*<\/p>/g,'').replace(/<p>(<(?:h[1-4]|ul|ol|li|hr)[^>]*>[\s\S]*?)<\/p>/g,'$1');
    o = o.replace(/^---$/gm,'<hr>'); o = o.replace(/`([^`]+)`/g,'<code>$1</code>');
    return o;
  }
}
