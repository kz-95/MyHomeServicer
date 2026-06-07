import { Component, OnDestroy, OnInit, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { ApiService } from "../../core/services/api.service";
import { placeholderUrl } from "../../core/category-colors";
import { IconComponent } from "../../shared/icon.component";
import { ListToolbarComponent } from "../../shared/list-toolbar.component";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  defaultPriceSuggestion?: number;
  defaultEstimatedDurationMinutes?: number;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  cardColor?: string | null;
  parentCategoryId?: string | null;
  bgPosX?: number;
  bgPosY?: number;
  bgZoom?: number;
}

const SKELETON_COUNT = 8;
const STAGGER_MS = 100;

/**
 * Customer landing page - find a service. Search and pick a category to
 * start a quote, or use the big "Request a quote" button for any other job.
 */
    @Component({
    selector: "app-browse",
    imports: [FormsModule, RouterLink, IconComponent, ListToolbarComponent],
    template: `
    <div class="page-enter">
      <h1>Find a service</h1>
      <p class="muted">
        Search for what you need below, or request a quote for any job.
      </p>

      <app-list-toolbar>
        <div class="search" toolbar-search>
          <span class="search-ic"><app-icon name="search" sizeToken="sm" /></span>
          <input
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            name="search"
            placeholder="Search services - plumbing, cleaning, aircon…"
            aria-label="Search services"
          />
        </div>
        <select [ngModel]="sortField()" (ngModelChange)="sortField.set($event); sortDir.set('asc')" name="bsf" toolbar-sort>
          <option value="name">Name A-Z</option>
          <option value="price">Price low-high</option>
        </select>
        <button class="sort-dir" (click)="sortDir.set(sortDir() === 'asc' ? 'desc' : 'asc')" toolbar-sort>
          {{ sortDir() === 'asc' ? '↑' : '↓' }}
        </button>
      </app-list-toolbar>

      @if (error()) {
        <div class="card error">
          Couldn't load services.
          <button class="btn-ghost" (click)="reload()">Retry</button>
        </div>
      } @else {
        @if (!loadingOrStaggering() && filtered().length === 0) {
          <p class="muted">No services match “{{ query() }}”.</p>
        } @else {
          <div class="grid page-child" [class.stagger-done]="staggerDone()">
            @for (cat of visibleList(); track cat.revealed ? ('real-'+cat.id) : ('skel-'+cat.index); let idx = $index) {
              @if (cat.revealed) {
                <a
                  class="bw-card bw-revealed"
                  routerLink="/customer/quote/new"
                  [queryParams]="{ category: cat.id }"
                  [style]="{'--cat-color': cat.cardColor || 'var(--color-primary)'}"
                >
                  <span class="bw-wash"></span>
                  <span class="bw-photo" [style.background-image]="'url(' + (cat.bannerUrl || cat.imageUrl || placeholderUrl(cat.slug)) + ')'" [style.background-size]="(cat.bgZoom ?? 100) + '%'" [style.background-position]="(cat.bgPosX ?? 50) + '% ' + (cat.bgPosY ?? 50) + '%'"></span>
                  <span class="bw-body">
                    <span class="bw-ic"><app-icon [name]="cat.icon || 'home'" sizeToken="md" stroke="#fff" strokeWidth="1.5" /></span>
                    <strong>{{ cat.name }}</strong>
                    @if (cat.defaultPriceSuggestion) {
                      <span class="bw-price">from RM {{ cat.defaultPriceSuggestion }}</span>
                    }
                  </span>
                </a>
              } @else {
                <div class="bw-card bw-skeleton">
                  <span class="bw-scan"></span>
                  <span class="bw-sweep"></span>
                </div>
              }
            }
          </div>
        }
      }
    </div>
  `,
    styles: [
        `
      :host {
        display: block;
        padding-bottom: 1.5rem;
      }
      .search {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.55rem 1rem;
        margin: 1rem 0;
        max-width: 480px;
        transition:
          border-color var(--transition),
          box-shadow var(--transition);
      }
      .search:focus-within {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px rgba(201, 90, 60, 0.12);
      }
      .search input {
        border: none;
        background: transparent;
        outline: none;
        flex: 1;
        font-size: 0.95rem;
      }
      /* §16.3 canonical grid - auto-fit, no per-page breakpoints */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        grid-auto-rows: 1fr;
        gap: var(--space-base);
        margin-top: 1rem;
      }
      .error {
        color: var(--color-danger);
      }
      .bw-card {
        position: relative;
        display: flex;
        align-items: stretch;
        overflow: hidden;
        min-height: 100px;
        border-radius: var(--radius);
        color: #fff;
        text-decoration: none;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        box-shadow: var(--shadow);
        transition: box-shadow var(--transition), transform var(--transition), border-color var(--transition);
      }
      .bw-card:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
        border-color: var(--color-primary-light);
      }
      /* §16.3 canonical 4-stop per-category wash */
      .bw-wash {
        position: absolute;
        inset: 0;
        z-index: 2;
        background: linear-gradient(
          90deg,
          var(--cat-color, var(--color-primary)) 0%,
          var(--cat-color, var(--color-primary)) 30%,
          color-mix(in srgb, var(--cat-color, var(--color-primary)) 55%, transparent) 50%,
          transparent 74%
        );
      }
      .bw-photo {
        position: absolute;
        inset: 0;
        z-index: 1;
        background-color: var(--color-bg);
        background-size: cover;
        background-position: center top;
        background-repeat: no-repeat;
        /* zoom + anchor top so the AI-image watermark at the bottom is cropped off the card */
        transform: scale(1.12);
        transform-origin: top center;
      }
      .bw-body {
        position: relative;
        z-index: 3;
        flex: 1;
        min-width: 0;
        max-width: 60%;
        padding: 0.7rem 1rem;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.15rem;
      }
      .bw-ic {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        color: #fff;
        font-size: 0.85rem;
        margin-bottom: 0.15rem;
      }
      .bw-body strong {
        font-family: var(--font-display);
        font-size: 1.05rem;
        color: #fff;
      }
      .bw-price {
        font-size: 0.75rem;
        color: rgba(255,255,255,0.85);
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        margin-bottom: 1rem;
      }
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

      /* Skeleton card with scanning animation */
      .bw-skeleton {
        background: var(--color-surface);
        border-color: var(--color-border);
        cursor: default;
        animation: border-glow 1.2s cubic-bezier(0.85, 0, 0.15, 1) infinite;
      }
      .bw-skeleton:hover {
        transform: none;
        box-shadow: var(--shadow);
      }
      @keyframes border-glow {
        0%, 100% { border-color: var(--color-border); box-shadow: var(--shadow); }
        15%      { border-color: rgba(240,160,30,0.15); box-shadow: 0 0 0 1px rgba(240,160,30,0.06), var(--shadow); }
        50%      { border-color: rgba(240,160,30,0.35); box-shadow: 0 0 0 1.5px rgba(240,160,30,0.12), var(--shadow-md); }
        85%      { border-color: rgba(240,160,30,0.15); box-shadow: 0 0 0 1px rgba(240,160,30,0.06), var(--shadow); }
      }
      /* ── Scan + Sweep light bars ── 4 layers ── */
      /* Scan: thicker = slower (0.9s / 1.4s) */
      @keyframes bw-scan1 {
        0%   { transform: skewX(-24deg) translateX(-98%); }
        100% { transform: skewX(-24deg) translateX(245%); }
      }
      @keyframes bw-scan2 {
        0%   { transform: skewX(-24deg) translateX(-53%); }
        100% { transform: skewX(-24deg) translateX(107%); }
      }
      /* Sweep: thicker = faster (1.8s / 1.5s) */
      @keyframes bw-sweep1 {
        0%   { transform: skewX(-24deg) translateX(-103%); }
        100% { transform: skewX(-24deg) translateX(295%); }
      }
      @keyframes bw-sweep2 {
        0%   { transform: skewX(-24deg) translateX(-53%); }
        100% { transform: skewX(-24deg) translateX(118%); }
      }

      /* ── Scan/Sweep layer base ── */
      .bw-scan, .bw-sweep {
        position: absolute;
        top: 0;
        height: 100%;
        z-index: 5;
        pointer-events: none;
        will-change: transform;
        backface-visibility: hidden;
        transform: translateZ(0);
      }
      .bw-scan::before,
      .bw-sweep::before {
        content: '';
        position: absolute;
        top: 0;
        height: 100%;
        pointer-events: none;
        will-change: transform;
        backface-visibility: hidden;
        transform: translateZ(0);
      }

      /* ── Scan-1 - thin, fast (0.9s) ── */
      .bw-scan {
        width: 41%;
        background: linear-gradient(to right,
          transparent 0%, rgba(180,140,255,0.06) 25%, rgba(240,160,30,0.12) 50%,
          rgba(180,140,255,0.06) 75%, transparent 100%);
        animation: bw-scan1 0.9s linear infinite;
      }
      /* ── Scan-2 - medium (1.4s) ── */
      .bw-scan::before {
        width: 94%;
        background: linear-gradient(to right,
          transparent 0%, rgba(140,210,255,0.08) 30%, rgba(240,160,30,0.14) 50%,
          rgba(140,210,255,0.08) 70%, transparent 100%);
        animation: bw-scan2 1.4s linear infinite;
      }

      /* ── Sweep-1 - thin, slow (1.8s) ── */
      .bw-sweep {
        width: 34%;
        background: linear-gradient(to right,
          transparent 0%, rgba(255,180,180,0.06) 25%, rgba(240,160,30,0.12) 50%,
          rgba(255,180,180,0.06) 75%, transparent 100%);
        animation: bw-sweep1 1.8s linear infinite;
      }
      /* ── Sweep-2 - medium (1.5s) ── */
      .bw-sweep::before {
        width: 85%;
        background: linear-gradient(to right,
          transparent 0%, rgba(180,220,255,0.08) 30%, rgba(240,160,30,0.14) 50%,
          rgba(180,220,255,0.08) 70%, transparent 100%);
        animation: bw-sweep2 1.5s linear infinite;
      }

      /* Staggered delay per skeleton card - both scan and sweep */
      .bw-skeleton:nth-child(1) .bw-scan, .bw-skeleton:nth-child(1) .bw-sweep { animation-delay: 0s; }
      .bw-skeleton:nth-child(2) .bw-scan, .bw-skeleton:nth-child(2) .bw-sweep { animation-delay: 0.15s; }
      .bw-skeleton:nth-child(3) .bw-scan, .bw-skeleton:nth-child(3) .bw-sweep { animation-delay: 0.3s; }
      .bw-skeleton:nth-child(4) .bw-scan, .bw-skeleton:nth-child(4) .bw-sweep { animation-delay: 0.45s; }
      .bw-skeleton:nth-child(5) .bw-scan, .bw-skeleton:nth-child(5) .bw-sweep { animation-delay: 0.6s; }
      .bw-skeleton:nth-child(6) .bw-scan, .bw-skeleton:nth-child(6) .bw-sweep { animation-delay: 0.75s; }
      .bw-skeleton:nth-child(7) .bw-scan, .bw-skeleton:nth-child(7) .bw-sweep { animation-delay: 0.9s; }
      .bw-skeleton:nth-child(8) .bw-scan, .bw-skeleton:nth-child(8) .bw-sweep { animation-delay: 1.05s; }

      @media (prefers-reduced-motion: reduce) {
        .bw-scan, .bw-sweep,
        .bw-scan::before,
        .bw-sweep::before {
          animation: none;
        }
        .bw-skeleton {
          animation: none;
        }
        .stagger-done .bw-card,
        .bw-revealed {
          animation: none;
        }
      }
      /* Card reveal - smooth fade-in + slide-up for each staggered card */
      @keyframes card-reveal {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .bw-revealed {
        animation: card-reveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
    `,
    ]
})
export class BrowseComponent implements OnInit, OnDestroy {
  placeholderUrl = placeholderUrl;
  private api = inject(ApiService);

  readonly skeletonSlots = Array.from({ length: SKELETON_COUNT }, (_, i) => i);

  categories = signal<Category[]>([]);
  loading = signal(true);
  error = signal(false);
  query = signal("");
  sortField = signal<'name' | 'price'>('name');
  sortDir = signal<'asc' | 'desc'>('asc');
  revealCount = signal(0);
  staggerDone = signal(false);

  private staggerTimer: ReturnType<typeof setInterval> | null = null;

  loadingOrStaggering = computed(() => this.loading() || this.revealCount() < this.filtered().length);

  /** Categories filtered by the search box (case-insensitive name match). */
  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    let list = this.categories();
    if (q) {
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    const field = this.sortField();
    const dir = this.sortDir();
    list = [...list].sort((a, b) => {
      let cmp: number;
      if (field === 'price') {
        cmp = (a.defaultPriceSuggestion ?? 0) - (b.defaultPriceSuggestion ?? 0);
      } else {
        cmp = a.name.localeCompare(b.name);
      }
      return dir === 'desc' ? -cmp : cmp;
    });
    return list;
  });

  visibleList = computed(() => {
    const cats = this.filtered();
    const count = this.revealCount();
    const total = cats.length;

    // During initial API load, show skeleton placeholders
    if (this.loading() && total === 0) {
      return Array.from({ length: SKELETON_COUNT }, (_, i) => ({
        revealed: false as const,
        index: i,
      }));
    }

    if (count >= total) {
      return cats.map((c, i) => ({ revealed: true as const, index: i, ...c }));
    }

    const slots: Array<
      | ({ revealed: true; index: number } & Category)
      | { revealed: false; index: number }
    > = [];

    for (let i = 0; i < total; i++) {
      if (i < count) {
        slots.push({ revealed: true, index: i, ...cats[i] });
      } else {
        slots.push({ revealed: false, index: i });
      }
    }

    return slots;
  });

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.clearStagger();
  }

  reload(): void {
    this.clearStagger();
    this.loading.set(true);
    this.error.set(false);
    this.revealCount.set(0);
    this.staggerDone.set(false);
    this.api.get<{ data: Category[] }>("/categories", { scope: "all" }).subscribe({
      next: (res) => {
        // Show the leaf services (children), not the 7 parent groupings.
        this.categories.set((res.data ?? []).filter((c) => c.parentCategoryId));
        this.loading.set(false);
        this.staggerReveal();
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  private staggerReveal(): void {
    this.clearStagger();
    this.staggerDone.set(false);
    const total = this.filtered().length;
    if (total === 0) return;

    let i = 0;
    this.staggerTimer = setInterval(() => {
      i++;
      this.revealCount.set(i);
      if (i >= total) {
        this.clearStagger();
        this.staggerDone.set(true);
      }
    }, STAGGER_MS);
  }

  private clearStagger(): void {
    if (this.staggerTimer !== null) {
      clearInterval(this.staggerTimer);
      this.staggerTimer = null;
    }
  }
}
