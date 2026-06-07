import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';

interface Service {
  id: string;
  categoryId: string;
  category?: { id: string; name: string; parentCategoryId?: string | null; imageUrl?: string | null };
  title: string;
  description?: string | null;
  merchantSku?: string | null;
  basePrice: number;
  priceType: string;
  taxMode: string;
  taxName?: string | null;
  taxRate?: number | null;
  estimatedDurationMinutes: number;
  autoAccept: boolean;
  modifiers?: Record<string, Record<string, { price: number | null; notOffered: boolean }>> | null;
  autoAcceptConditions?: {
    budget_min?: number;
    budget_max?: number;
    match_time_slot?: string[];
  } | null;
  moduleRefs?: { moduleId: string; priceOverride?: number | null }[] | null;
  serviceChargeRate?: number | null;
  taxInclusive?: boolean | null;
  sstApplies?: boolean | null;
}

interface Category {
  id: string;
  name: string;
}

interface Subcat {
  id: string;
  name: string;
}

const SKELETON_COUNT = 5;
const STAGGER_MS = 70;

@Component({
    selector: 'app-servicer-services',
    host: {},
    imports: [FormsModule, IconComponent, ListToolbarComponent],
    template: `
    <div class="page-enter">
      <div class="head page-child">
        <div>
          <h1>Service listings</h1>
          <p class="muted">
            Your shop's services under
            <strong>{{ bigCategory()?.name || '…' }}</strong>. Customers browse and quote these.
          </p>
        </div>
        <button class="btn-primary" (click)="openCreate()">+ New service listing</button>
      </div>

      @if (loading()) {
        <div class="skeleton-list">
          @for (s of skeletonSlots; track s) {
            <div class="card lc skel-card">
              <span class="bw-scan"></span>
              <span class="bw-sweep"></span>
            </div>
          }
        </div>
      } @else if (loadFailed()) {
        <p class="muted">Could not load your listings. Please refresh the page.</p>
      } @else if (services().length === 0) {
        <div class="card">No listings yet. Create one so customers can find you.</div>
      } @else {
        <app-list-toolbar>
          <input class="search" type="text" placeholder="Search by title or SKU…" [(ngModel)]="searchQuery" name="sq" toolbar-search />
          <select [ngModel]="sortField()" (ngModelChange)="sortField.set($event); sortDir.set('asc')" name="svsort" toolbar-sort>
            <option value="title">Title A-Z</option>
            <option value="price">Price low-high</option>
          </select>
          <button class="sort-dir" (click)="sortDir.set(sortDir() === 'asc' ? 'desc' : 'asc')" toolbar-sort>
            {{ sortDir() === 'asc' ? '↑' : '↓' }}
          </button>
          <div class="chips" toolbar-filters>
            <button class="chip" [class.on]="filter() === 'all'" (click)="filter.set('all')">All <span class="n">{{ services().length }}</span></button>
            <button class="chip" [class.on]="filter() === 'auto'" (click)="filter.set('auto')">Auto-accept <span class="n">{{ autoCount() }}</span></button>
            <button class="chip" [class.on]="filter() === 'manual'" (click)="filter.set('manual')">Manual <span class="n">{{ manualCount() }}</span></button>
          </div>
        </app-list-toolbar>

        @for (s of filteredServices(); track s.id; let idx = $index) {
          @if (idx < revealCount()) {
           <div class="card lc sv-revealed">
            <div class="lc-tile">
              @if (s.category?.imageUrl) {
                <img [src]="s.category!.imageUrl" class="lc-thumb" alt="" />
              } @else if (s.category?.name) {
                <span class="lc-icon"><app-icon [name]="categoryIconFor(s.category?.name ?? '')" sizeToken="lg" strokeWidth="1.5" /></span>
              }
            </div>
            <div class="lc-body">
              <div class="lc-title-row">
                <strong class="lc-title">{{ s.title }}</strong>
                @if (s.autoAccept) {
                  <span class="badge badge-auto">Auto-accept</span>
                } @else {
                  <span class="badge badge-manual">Manual</span>
                }
              </div>
              @if (s.description) {
                <div class="lc-desc">{{ s.description }}</div>
              }
              <div class="lc-meta">
                <span>~{{ s.estimatedDurationMinutes }} min</span>
                @if (s.merchantSku) {
                  <span class="mdot">·</span>
                  <span>SKU {{ s.merchantSku }}</span>
                }
                @if (pricedOptionCount(s) > 0) {
                  <span class="mdot">·</span>
                  <span>{{ pricedOptionCount(s) }} priced option(s)</span>
                }
              </div>
            </div>
            <div class="lc-right">
              <div class="lc-price-block">
                <span class="lc-price">RM {{ s.basePrice }}</span>
                <span class="lc-price-type">{{ s.priceType }}</span>
              </div>
              <div class="lc-acts">
                <label class="aa-toggle" [class.on]="s.autoAccept" [class.disabled]="togglingId() === s.id" title="Toggle auto-accept">
                  <input type="checkbox" [checked]="s.autoAccept" (change)="toggleAutoAccept(s)" [disabled]="togglingId() === s.id" />
                  <span class="aa-slider"></span>
                </label>
                <button class="btn-ghost lc-edit" (click)="openEdit(s)">Edit</button>
                <button class="lc-del" (click)="remove(s)" aria-label="Delete listing"><app-icon name="trash-2" sizeToken="sm" /></button>
              </div>
            </div>
          </div>
          }
        }
      }
    </div>

    <!-- Edit / Delete - now routes to the full-page wizard -->
    <div style="margin-top:1rem; text-align:center">
      <p class="muted small">Create or edit your listings in the full-page wizard for a cleaner experience.</p>
    </div>
  `,
    styles: [
        `
      :host { display: block; }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 0.5rem;
      }
      .head h1 { margin-bottom: 0.2rem; }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0;
        margin-bottom: 0.6rem;
        flex-wrap: wrap;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-bg);
        transition: padding 0.3s ease, gap 0.3s ease, opacity 0.3s ease, margin 0.3s ease;
      }
      .toolbar.is-collapsed {
        padding-top: 0.1rem;
        padding-bottom: 0.1rem;
        gap: 0.4rem;
        margin-bottom: 0.3rem;
        overflow: hidden;
      }
      .toolbar.is-collapsed .search { height: 1.6rem; font-size: 0.75rem; padding: 0.2rem 0.5rem; }
      .toolbar.is-collapsed .chip { font-size: 0.7rem; padding: 0.15rem 0.5rem; }
      .toolbar.is-idle {
        pointer-events: none;
        padding: 0;
        gap: 0;
        margin-bottom: 0;
        border-bottom: none;
        height: 0;
        min-height: 0;
        overflow: hidden;
        transition: padding 1s ease 4s, gap 1s ease 4s, height 1s ease 4s, margin-bottom 1s ease 4s, border-bottom 1s ease 4s;
      }
      .toolbar.is-idle:hover,
      .toolbar.is-idle:focus-within { pointer-events: auto; }
      .toolbar .search {
        flex: 1;
        min-width: 160px;
        max-width: 280px;
        padding: 0.4rem 0.7rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background: var(--color-bg);
        font-size: 0.85rem;
        color: var(--color-text);
        outline: none;
      }
      .toolbar .search:focus {
        border-color: var(--color-primary);
        box-shadow: var(--focus-ring);
      }
      .chips { display: flex; gap: 0.35rem; flex-wrap: wrap; }
      .chip {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.2rem 0.65rem;
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }
      .chip:hover { background: var(--color-bg); color: var(--color-text); }
      .chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
      .chip .n {
        font-size: 0.7rem;
        font-weight: 600;
        background: var(--color-border);
        color: var(--color-muted);
        border-radius: 999px;
        padding: 0.05rem 0.45rem;
        margin-left: 0.25rem;
      }
      .chip.on .n { background: rgba(255,255,255,0.2); color: #fff; }
      .sort-dir {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 0.3rem 0.5rem;
        cursor: pointer;
        color: var(--color-muted);
        font-size: 0.85rem;
        line-height: 1;
      }
      .sort-dir:hover { border-color: var(--color-primary); color: var(--color-primary); }

      /* ── Listing card ───────────────────────────────────────────── */
      .lc {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.7rem;
        padding: 0.9rem 1rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .lc:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
      .lc-tile {
        width: 48px;
        height: 48px;
        border-radius: var(--radius);
        background: var(--color-bg);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .lc-icon { display: inline-flex; align-items: center; justify-content: center; color: var(--color-primary); }
      .lc-thumb { width: 48px; height: 48px; border-radius: var(--radius-sm); object-fit: cover; }
      .lc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
      .lc-title-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
      .lc-title { font-size: 1rem; font-weight: 700; color: var(--color-text); }
      .lc-desc {
        font-size: 0.85rem;
        color: var(--color-muted);
        display: -webkit-box;
        -webkit-line-clamp: 1;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.4;
      }
      .lc-meta { display: flex; align-items: center; gap: 0.25rem; font-size: 0.78rem; color: var(--color-muted); flex-wrap: wrap; }
      .mdot { color: var(--color-border); }
      .lc-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; flex-shrink: 0; }
      .lc-price-block { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; }
      .lc-price { font-size: 1.15rem; font-weight: 700; color: var(--color-text); }
      .lc-price-type { font-size: 0.7rem; color: var(--color-muted); text-transform: capitalize; }
      .lc-acts { display: flex; align-items: center; gap: 0.35rem; }
      .lc-edit {
        font-size: 0.78rem;
        padding: 0.25rem 0.6rem;
        border-radius: var(--radius);
        color: var(--color-primary);
        border-color: var(--color-primary);
        background: transparent;
      }
      .lc-edit:hover { background: var(--color-primary); color: #fff; }
      .lc-del {
        background: transparent;
        border: none;
        font-size: 1rem;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: var(--radius);
        color: var(--color-muted);
        transition: color 0.15s ease, background 0.15s ease;
        line-height: 1;
      }
      .lc-del:hover { color: var(--color-danger); background: var(--color-danger-bg); }
      .badge-auto { background: var(--color-primary); color: #fff; border-color: var(--color-primary); font-size: 0.65rem; padding: 0.1rem 0.45rem; }
      .badge-manual { background: var(--color-bg); color: var(--color-muted); border-color: var(--color-border); font-size: 0.65rem; padding: 0.1rem 0.45rem; }
      .aa-toggle { position: relative; display: inline-flex; align-items: center; width: 36px; height: 20px; cursor: pointer; }
      .aa-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
      .aa-slider { position: absolute; inset: 0; background: var(--color-border); border-radius: 999px; transition: background 0.2s ease; }
      .aa-slider::before { content: ''; position: absolute; width: 16px; height: 16px; left: 2px; top: 2px; background: #fff; border-radius: 999px; transition: transform 0.2s ease; }
      .aa-toggle.on .aa-slider { background: var(--color-primary); }
      .aa-toggle.on .aa-slider::before { transform: translateX(16px); }
      .aa-toggle.disabled { opacity: 0.5; cursor: default; }

      /* ── Form ───────────────────────────────────────────────────── */
      .form { display: flex; flex-direction: column; gap: 0.5rem; }
      .form label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.88rem; font-weight: 500; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
      .row-3 { grid-template-columns: 1fr 1fr 1fr; }
      @media (max-width: 560px) { .row, .row-3 { grid-template-columns: 1fr; } }
      .toggle { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 400; }
      .toggle input { width: auto; }

      /* ── Collapsible sections ────────────────────────────────────── */
      .fm-section { border: 1px solid var(--color-border); border-radius: var(--radius); overflow: hidden; margin-bottom: 0; }
      .fm-sec-hdr {
        width: 100%;
        background: var(--color-bg);
        border: none;
        border-bottom: 1px solid transparent;
        padding: 0.7rem 1rem;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        font-family: inherit;
        transition: background var(--transition-fast), border-color var(--transition-fast);
      }
      .fm-sec-hdr:hover { background: var(--color-surface); }
      .fm-sec-hdr[aria-expanded="true"] { border-bottom-color: var(--color-border); }
      .fm-sec-info { display: flex; align-items: center; gap: 0.45rem; flex: 1; min-width: 0; }
      .fm-sec-icon { color: var(--color-primary); flex-shrink: 0; }
      .fm-sec-title { font-size: 0.9rem; font-weight: 600; color: var(--color-text); white-space: nowrap; }
      .fm-sec-desc { font-size: 0.76rem; color: var(--color-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .fm-chev { color: var(--color-muted); flex-shrink: 0; }
      /* CSS grid row expand - animates 0 → auto without JS height measurement */
      .fm-sec-body { display: grid; grid-template-rows: 1fr; transition: grid-template-rows 0.25s ease; }
      .fm-sec-body.collapsed { grid-template-rows: 0fr; }
      .fm-sec-inner { overflow: hidden; display: flex; flex-direction: column; gap: 0.7rem; padding: 0.85rem 1rem 1rem; }

      /* Sub-section headings */
      .sub-head { display: flex; flex-direction: column; gap: 0.15rem; }
      .sub-head-ruled { border-top: 1px solid var(--color-border); padding-top: 0.75rem; margin-top: 0.1rem; }
      .sub-title { font-size: 0.88rem; font-weight: 600; color: var(--color-text); }

      /* ── Module library picker ────────────────────────────────────── */
      .mod-list { border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; }
      .mod-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: var(--color-bg);
        border-bottom: 1px solid var(--color-border);
        flex-wrap: wrap;
        transition: background var(--transition-fast);
      }
      .mod-row:last-child { border-bottom: none; }
      .mod-row.selected { background: var(--color-primary-light); }
      .mod-check-label {
        display: flex !important;
        flex-direction: row !important;
        align-items: center;
        gap: 0.45rem;
        cursor: pointer;
        font-weight: 400;
        flex: 1;
        min-width: 0;
      }
      .mod-check-label input[type=checkbox] { width: auto; flex-shrink: 0; }
      .mod-name { font-size: 0.88rem; font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .mod-default { font-size: 0.8rem; color: var(--color-muted); white-space: nowrap; }
      .mod-flag { font-size: 0.7rem; color: var(--color-muted); border: 1px dashed var(--color-border); border-radius: 4px; padding: 0.05rem 0.35rem; white-space: nowrap; flex-shrink: 0; }
      .mod-override {
        display: flex !important;
        flex-direction: row !important;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.8rem;
        font-weight: 500;
        color: var(--color-muted);
        white-space: nowrap;
      }
      .mod-override-price { display: flex; flex-direction: row; align-items: center; gap: 0.25rem; font-size: 0.85rem; font-weight: 500; }
      .mod-override-input { width: 6rem; }
      .empty-modules { padding: 0.75rem; border: 1px dashed var(--color-border); border-radius: var(--radius-sm); text-align: center; }

      /* ── Option-price grid ──────────────────────────────────────── */
      .price-grid-section { border: 1px solid var(--color-border); border-radius: 8px; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.7rem; }
      .pg-head { display: flex; flex-direction: column; gap: 0.2rem; }
      .pg-title { font-size: 0.9rem; font-weight: 600; }
      .pg-question { display: flex; flex-direction: column; gap: 0.4rem; }
      .pg-q-label { font-size: 0.85rem; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.03em; }
      .pg-rows { display: flex; flex-direction: column; gap: 0.35rem; }
      .pg-row { display: flex; align-items: center; gap: 0.8rem; padding: 0.35rem 0.5rem; border: 1px solid var(--color-border); border-radius: 6px; background: var(--color-bg); transition: background 0.12s ease, border-color 0.12s ease; }
      .pg-row:hover { background: var(--color-surface); border-color: var(--color-primary); }
      .pg-opt-label { flex: 1; font-size: 0.88rem; }
      .pg-price-label { display: flex; flex-direction: row !important; align-items: center; gap: 0.3rem; font-size: 0.88rem; font-weight: 500; }
      .pg-price-input { width: 7rem; }
      .na-badge { font-size: 0.75rem; color: var(--color-muted); padding: 0.1rem 0.5rem; border: 1px dashed var(--color-border); border-radius: 4px; }
      .toggle-label { display: flex !important; flex-direction: row !important; align-items: center; gap: 0.3rem; font-size: 0.8rem; font-weight: 400; color: var(--color-muted); cursor: pointer; white-space: nowrap; }
      .toggle-label input { width: auto; }

      /* ── Auto-accept box ────────────────────────────────────────── */
      .aa-box { border: 1px solid var(--color-border); border-radius: 8px; padding: 0.6rem; background: var(--color-bg); display: flex; flex-direction: column; gap: 0.5rem; }
      .slots { display: flex; gap: 1rem; flex-wrap: wrap; }
      .small { font-size: 0.8rem; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.3rem; }
      .err { color: var(--color-danger); }

      /* ── Skeleton + stagger reveal ── */
      .skeleton-list { display: flex; flex-direction: column; gap: 0.7rem; }
      .skel-card {
        position: relative; overflow: hidden; min-height: 72px;
        cursor: default;
        animation: sv-border-glow 1.2s cubic-bezier(0.85, 0, 0.15, 1) infinite;
      }
      .skel-card:hover { transform: none; box-shadow: var(--shadow); }
      @keyframes sv-border-glow {
        0%, 100% { border-color: var(--color-border); box-shadow: var(--shadow); }
        50%       { border-color: rgba(240,160,30,0.35); box-shadow: 0 0 0 1.5px rgba(240,160,30,0.12), var(--shadow-md); }
      }
      @keyframes sv-scan1 { 0% { transform: skewX(-24deg) translateX(-98%); } 100% { transform: skewX(-24deg) translateX(245%); } }
      @keyframes sv-scan2 { 0% { transform: skewX(-24deg) translateX(-53%); } 100% { transform: skewX(-24deg) translateX(107%); } }
      @keyframes sv-sweep1 { 0% { transform: skewX(-24deg) translateX(-103%); } 100% { transform: skewX(-24deg) translateX(295%); } }
      @keyframes sv-sweep2 { 0% { transform: skewX(-24deg) translateX(-53%); } 100% { transform: skewX(-24deg) translateX(118%); } }
      .bw-scan, .bw-sweep {
        position: absolute; top: 0; height: 100%; z-index: 5; pointer-events: none; will-change: transform;
      }
      .bw-scan::before, .bw-sweep::before { content: ''; position: absolute; top: 0; height: 100%; pointer-events: none; will-change: transform; }
      .bw-scan { width: 41%; background: linear-gradient(to right, transparent 0%, rgba(180,140,255,0.06) 25%, rgba(240,160,30,0.12) 50%, rgba(180,140,255,0.06) 75%, transparent 100%); animation: sv-scan1 0.9s linear infinite; }
      .bw-scan::before { width: 94%; background: linear-gradient(to right, transparent 0%, rgba(140,210,255,0.08) 30%, rgba(240,160,30,0.14) 50%, rgba(140,210,255,0.08) 70%, transparent 100%); animation: sv-scan2 1.4s linear infinite; }
      .bw-sweep { width: 34%; background: linear-gradient(to right, transparent 0%, rgba(255,180,180,0.06) 25%, rgba(240,160,30,0.12) 50%, rgba(255,180,180,0.06) 75%, transparent 100%); animation: sv-sweep1 1.8s linear infinite; }
      .bw-sweep::before { width: 85%; background: linear-gradient(to right, transparent 0%, rgba(180,220,255,0.08) 30%, rgba(240,160,30,0.14) 50%, rgba(180,220,255,0.08) 70%, transparent 100%); animation: sv-sweep2 1.5s linear infinite; }
      .skel-card:nth-child(1) .bw-scan, .skel-card:nth-child(1) .bw-sweep { animation-delay: 0s; }
      .skel-card:nth-child(2) .bw-scan, .skel-card:nth-child(2) .bw-sweep { animation-delay: 0.15s; }
      .skel-card:nth-child(3) .bw-scan, .skel-card:nth-child(3) .bw-sweep { animation-delay: 0.3s; }
      .skel-card:nth-child(4) .bw-scan, .skel-card:nth-child(4) .bw-sweep { animation-delay: 0.45s; }
      .skel-card:nth-child(5) .bw-scan, .skel-card:nth-child(5) .bw-sweep { animation-delay: 0.6s; }
      @keyframes sv-reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .sv-revealed { animation: sv-reveal 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }
      @media (prefers-reduced-motion: reduce) {
        .bw-scan, .bw-sweep, .bw-scan::before, .bw-sweep::before { animation: none; }
        .skel-card { animation: none; }
        .sv-revealed { animation: none; }
      }
    `,
    ]
})
export class ServicerServicesComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private router = inject(Router);

  private readonly CATEGORY_ICON_MAP: Record<string, string> = {
    plumbing: 'wrench',
    cleaning: 'sparkles',
    'air-cond': 'wind',
    catering: 'chef-hat',
    electrical: 'zap',
    'door gate': 'home',
    roof: 'home',
    renovation: 'hammer',
    'interior design': 'paintbrush',
    wedding: 'heart',
    tutoring: 'book',
  };

  categoryIconFor(catName: string): string {
    return this.CATEGORY_ICON_MAP[catName.toLowerCase()] ?? 'clipboard-list';
  }

  readonly skeletonSlots = Array.from({ length: SKELETON_COUNT }, (_, i) => i);
  revealCount = signal(0);
  private staggerTimer: ReturnType<typeof setInterval> | null = null;

  services = signal<Service[]>([]);
  bigCategory = signal<{ id: string; name: string } | null>(null);
  subcats = signal<Subcat[]>([]);
  loading = signal(true);
  loadFailed = signal(false);
  togglingId = signal<string | null>(null);

  searchQuery = signal('');
  filter = signal<'all' | 'auto' | 'manual'>('all');
  sortField = signal<'title' | 'price'>('title');
  sortDir = signal<'asc' | 'desc'>('asc');

  autoCount = computed(() => this.services().filter((s) => s.autoAccept).length);
  manualCount = computed(() => this.services().filter((s) => !s.autoAccept).length);

  filteredServices = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const f = this.filter();
    const field = this.sortField();
    const dir = this.sortDir();
    let list = this.services().filter((s) => {
      if (f === 'auto' && !s.autoAccept) return false;
      if (f === 'manual' && s.autoAccept) return false;
      if (q && !s.title.toLowerCase().includes(q) && !(s.merchantSku ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp: number;
      if (field === 'price') {
        cmp = a.basePrice - b.basePrice;
      } else {
        cmp = a.title.localeCompare(b.title);
      }
      return dir === 'desc' ? -cmp : cmp;
    });
    return list;
  });

  ngOnInit(): void {
    this.api
      .get<{ category: { id: string; name: string }; subcategories: Subcat[] }>(
        '/servicer/me/subcategories',
      )
      .pipe(
        switchMap((r) => {
          this.bigCategory.set(r.category);
          this.subcats.set(r.subcategories);
          return this.api.get<{ data: Category[] }>('/categories');
        }),
      )
      .subscribe({
        next: () => {},
        error: () => {},
      });

    this.load();
  }

  ngOnDestroy(): void {
    this.clearStagger();
  }

  private load(): void {
    this.clearStagger();
    this.revealCount.set(0);
    this.loading.set(true);
    this.loadFailed.set(false);
    this.api.get<{ data: Service[] }>('/servicer/me/services').subscribe({
      next: (r) => {
        this.services.set(r.data);
        this.loading.set(false);
        this.staggerReveal(r.data.length);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  private staggerReveal(total: number): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.revealCount.set(total);
      return;
    }
    let i = 0;
    this.staggerTimer = setInterval(() => {
      i++;
      this.revealCount.set(i);
      if (i >= total) this.clearStagger();
    }, STAGGER_MS);
  }

  private clearStagger(): void {
    if (this.staggerTimer !== null) {
      clearInterval(this.staggerTimer);
      this.staggerTimer = null;
    }
  }

  pricedOptionCount(s: Service): number {
    if (!s.modifiers) return 0;
    let count = 0;
    for (const qMap of Object.values(s.modifiers)) {
      for (const entry of Object.values(qMap)) {
        if (!entry.notOffered) count++;
      }
    }
    return count;
  }

  openCreate(): void {
    this.router.navigate(['/servicer/services/new']);
  }

  openEdit(s: Service): void {
    this.router.navigate(['/servicer/services', s.id, 'edit']);
  }

  remove(s: Service): void {
    this.dialog
      .confirm(`Delete the listing "${s.title}"?`, { confirmLabel: 'Delete listing' })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`/servicer/me/services/${s.id}`).subscribe({
          next: () => {
            this.toast.success('Listing deleted.');
            this.load();
          },
          error: (e) => this.toast.error(e.message ?? 'Could not delete the listing'),
        });
      });
  }

  toggleAutoAccept(s: Service): void {
    this.togglingId.set(s.id);
    const next = !s.autoAccept;
    const body: Record<string, unknown> = { autoAccept: next };
    if (next && s.autoAcceptConditions) {
      body['autoAcceptConditions'] = s.autoAcceptConditions;
    }
    this.api.patch(`/servicer/me/services/${s.id}/auto-accept`, body).subscribe({
      next: () => {
        s.autoAccept = next;
        this.togglingId.set(null);
      },
      error: (e) => {
        this.togglingId.set(null);
        this.toast.error(e.message ?? 'Could not toggle auto-accept');
      },
    });
  }
}
