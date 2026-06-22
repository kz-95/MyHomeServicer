import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from "@angular/core";
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

const SKELETON_COUNT = 34;

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
            @for (cat of visibleList(); track cat.id || ('skel-' + cat.index); let i = $index) {
                <a
                  class="bw-card"
                  [class.bw-revealed]="cat.revealed"
                  [class.bw-skeleton]="!cat.revealed"
                  [style.--spawn-delay.ms]="i * 50"
                  routerLink="/customer/quote/new"
                  [queryParams]="cat.id ? { category: cat.id } : {}"
                  [style]="cat.id ? {'--cat-color': cat.cardColor || 'var(--color-primary)'} : {}"
                >
                  @if (cat.id) {
                    <span class="bw-wash"></span>
                    <span class="bw-photo" [style.background-image]="'url(' + (cat.bannerUrl || cat.imageUrl || placeholderUrl(cat.slug || '')) + ')'" [style.background-size]="cat.bgZoom && cat.bgZoom !== 100 ? (cat.bgZoom + '%') : 'cover'" [style.background-position]="(cat.bgPosX ?? 50) + '% ' + (cat.bgPosY ?? 50) + '%'"></span>
                    <span class="bw-body">
                      <span class="bw-ic"><app-icon [name]="cat.icon || 'home'" sizeToken="md" stroke="#fff" strokeWidth="1.5" /></span>
                      <strong>{{ cat.name }}</strong>
                      @if (cat.defaultPriceSuggestion) {
                        <span class="bw-price">from RM {{ cat.defaultPriceSuggestion }}</span>
                      }
                    </span>
                    <span class="card-cover" [class.loaded]="cat.revealed"></span>
                  }
                  @if (!barsRemovedIds().has(cat.id || 'skel-'+cat.index)) {
                    <span class="bw-scan1" [style.animation-delay.ms]="(-700 + i * 350) % 1200 - 1200"></span>
                    <span class="bw-scan2" [style.animation-delay.ms]="(i * 350) % 1400 - 1400"></span>
                    <span class="bw-sweep1" [style.animation-delay.ms]="(-1300 + i * 350) % 1800 - 1800"></span>
                    <span class="bw-sweep2" [style.animation-delay.ms]="(-600 + i * 350) % 900 - 900"></span>
                  }
                </a>
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

      /* Skeleton reveal - cover overlay + spawn stagger */
      @keyframes skeleton-spawn {
        from { opacity: 1; }
        to   { opacity: 0; pointer-events: none; }
      }
      .bw-card.bw-skeleton::after {
        content: "";
        position: absolute; inset: 0; z-index: 10;
        background: var(--color-bg);
        animation: skeleton-spawn 0.1s ease both;
        animation-delay: var(--spawn-delay, 0s);
      }
      .bw-card.bw-skeleton {
        cursor: default;
      }
      .bw-card.bw-skeleton:hover {
        transform: none;
        box-shadow: var(--shadow);
      }
      .card-cover {
        position: absolute; inset: 0; z-index: 4;
        background: var(--color-surface);
        transition: opacity 0.35s ease;
      }
      .card-cover.loaded { opacity: 0; pointer-events: none; }

      @media (prefers-reduced-motion: reduce) {
        .bw-revealed { animation: none; }
        .bw-card.bw-skeleton::after { animation: none; opacity: 0; }
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
  /** Category ids whose thumbnail has finished preloading (card reveals then). */
  loadedIds = signal<Set<string>>(new Set());
  barsRemovedIds = signal<Set<string>>(new Set());

  private queuedIds = new Set<string>();
  private preloadQueue: Category[] = [];
  private preloading = false;
  private destroyed = false;

  staggerDone = computed(() => this.filtered().every((c) => this.loadedIds().has(c.id)));

  loadingOrStaggering = computed(() => this.loading() || !this.staggerDone());

  constructor() {
    // Preload thumbnails for whatever the grid currently shows (tracks search +
    // sort changes) so each card reveals only once its image is fully loaded.
    effect(() => {
      this.queuePreload(this.filtered());
    });
  }

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

  visibleList = computed<
    Array<Partial<Category> & { revealed: boolean; index: number }>
  >(() => {
    const cats = this.filtered();
    const loaded = this.loadedIds();

    // During the initial API load, show pure skeleton placeholders (no card data).
    if (this.loading() && cats.length === 0) {
      return Array.from({ length: SKELETON_COUNT }, (_, i) => ({
        revealed: false,
        index: i,
      }));
    }

    // Render every real card up-front so its photo starts loading immediately,
    // hidden under the cover. A card only flips `revealed` (cover cross-fade)
    // once its thumbnail has fully preloaded - so the cover lifts onto an
    // already-painted image instead of catching it mid-interlace.
    return cats.map((c, i) => ({ ...c, revealed: loaded.has(c.id), index: i }));
  });

  ngOnInit(): void {
    this.reload();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(false);
    this.loadedIds.set(new Set());
    this.barsRemovedIds.set(new Set());
    this.queuedIds.clear();
    this.preloadQueue = [];
    this.api.get<{ data: Category[] }>("/categories", { scope: "all" }).subscribe({
      next: (res) => {
        // Show the leaf services (children), not the 7 parent groupings.
        this.categories.set((res.data ?? []).filter((c) => c.parentCategoryId));
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Queue thumbnails for sequential preload; each card reveals as its own
   *  image finishes, with a short gap so reveals cascade instead of popping. */
  private queuePreload(cats: Category[]): void {
    for (const c of cats) {
      if (!this.queuedIds.has(c.id)) {
        this.queuedIds.add(c.id);
        this.preloadQueue.push(c);
      }
    }
    if (!this.preloading) this.drainPreload();
  }

  private drainPreload(): void {
    const cat = this.preloadQueue.shift();
    if (!cat || this.destroyed) {
      this.preloading = false;
      return;
    }
    this.preloading = true;
    const url = cat.bannerUrl || cat.imageUrl || placeholderUrl(cat.slug);
    const t0 = performance.now();
    const img = new Image();
    img.src = url;
    img.decode().then(() => {
      if (this.destroyed) return;
      const wait = Math.max(0, 50 - (performance.now() - t0));
      setTimeout(() => {
        this.loadedIds.update((s) => {
          const n = new Set(s);
          n.add(cat.id);
          return n;
        });
        setTimeout(() => {
          this.barsRemovedIds.update(s => { const n = new Set(s); n.add(cat.id); return n; });
        }, 200);
        setTimeout(() => this.drainPreload(), 100);
      }, wait);
    }).catch(() => {
      if (this.destroyed) return;
      this.loadedIds.update((s) => {
        const n = new Set(s);
        n.add(cat.id);
        return n;
      });
      setTimeout(() => {
        this.barsRemovedIds.update(s => { const n = new Set(s); n.add(cat.id); return n; });
      }, 200);
      setTimeout(() => this.drainPreload(), 100);
    });
  }
}
