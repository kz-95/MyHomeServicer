import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { placeholderUrl } from '../core/category-colors';
import { IconComponent } from '../shared/icon.component';

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  defaultPriceSuggestion?: number;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  cardColor?: string | null;
  bgPosX?: number;
  bgPosY?: number;
  bgZoom?: number;
}

@Component({
  selector: 'app-children-browse',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="page page-enter">
      <nav class="back-nav">
        <a class="back-link" routerLink="/">&larr; Home</a>
      </nav>

      <section class="children-section">
        @if (loading()) {
          <div class="svc-grid">
            @for (_ of [1, 2, 3, 4]; track _; let i = $index) {
              <div class="card skeleton">
                  <span class="bw-scan1" [style.animation-delay.ms]="(-700 + i * 350) % 1200 - 1200"></span>
                  <span class="bw-scan2" [style.animation-delay.ms]="(i * 350) % 1400 - 1400"></span>
                  <span class="bw-sweep1" [style.animation-delay.ms]="(-1300 + i * 350) % 1800 - 1800"></span>
                  <span class="bw-sweep2" [style.animation-delay.ms]="(-600 + i * 350) % 900 - 900"></span>
                </div>
            }
          </div>
        } @else if (error()) {
          <div class="card err-card">
            <span class="err-ic">
              <app-icon name="x-circle" sizeToken="lg" />
            </span>
            <span>Couldn't load services.</span>
            <button class="btn-ghost" (click)="load()">Retry</button>
          </div>
        } @else if (children().length === 0) {
          <div class="empty-state">
            <span class="empty-ic">
              <app-icon name="search" sizeToken="xl" strokeWidth="1.5" />
            </span>
            <p>No services available in this category yet.</p>
          </div>
        } @else {
          <h2>{{ parentName() }}</h2>
          <div class="svc-grid">
            @for (cat of children(); track cat.id; let i = $index) {
                <button class="svc-card" [class.skeleton]="!isLoaded(cat.id)" (click)="pick(cat)" [style]="{'--cat-color': cat.cardColor || 'var(--color-primary)'}">
                  <span class="svc-wash"></span>
                  <span class="svc-photo shown" [style.background-image]="'url(' + thumbUrl(cat) + ')'" [style.background-size]="cat.bgZoom && cat.bgZoom !== 100 ? (cat.bgZoom + '%') : 'cover'" [style.background-position]="(cat.bgPosX ?? 50) + '% ' + (cat.bgPosY ?? 50) + '%'"></span>
                  <span class="svc-body">
                    <span class="svc-row">
                      <span class="svc-ic"><app-icon [name]="cat.icon || 'home'" sizeToken="md" stroke="#fff" strokeWidth="1.5" /></span>
                      <strong>{{ cat.name }}</strong>
                    </span>
                    @if (cat.defaultPriceSuggestion) {
                      <span class="svc-price">from RM {{ cat.defaultPriceSuggestion }}</span>
                    }
                  </span>
                  <span class="card-cover" [class.loaded]="isLoaded(cat.id)"></span>
                  @if (!barsRemovedIds().has(cat.id)) {
                    <span class="bw-scan1" [style.animation-delay.ms]="(-700 + i * 350) % 1200 - 1200"></span>
                    <span class="bw-scan2" [style.animation-delay.ms]="(i * 350) % 1400 - 1400"></span>
                    <span class="bw-sweep1" [style.animation-delay.ms]="(-1300 + i * 350) % 1800 - 1800"></span>
                    <span class="bw-sweep2" [style.animation-delay.ms]="(-600 + i * 350) % 900 - 900"></span>
                  }
                </button>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--color-bg);
      }
      .page {
        min-height: 100vh;
        background: var(--color-bg);
        background: var(--gradient-hero);
      }
      .back-nav {
        padding: 1rem 1.5rem 0;
      }
      .back-link {
        display: inline-block;
        font-size: 0.9rem;
        font-weight: 500;
        color: var(--color-primary);
        text-decoration: none;
        padding: 0.3rem 0;
      }
      .back-link:hover {
        text-decoration: underline;
      }
      .children-section {
        max-width: var(--content-max);
        margin: 0 auto;
        padding: 1rem 1.5rem 2.5rem;
      }
      .children-section h2 {
        font-family: var(--font-display);
        font-size: 1.6rem;
        font-weight: 400;
        margin: 0 0 1.25rem;
        color: var(--color-text);
      }

      /* ── Grid ── */
      /* §16.3 canonical grid - auto-fit so columns adapt with no per-page breakpoints */
      .svc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        grid-auto-rows: 1fr;
        gap: var(--space-base);
      }
      .svc-card {
        position: relative;
        display: flex;
        align-items: stretch;
        overflow: hidden;
        min-height: 100px;
        text-align: left;
        cursor: pointer;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        transition: box-shadow var(--transition), transform var(--transition),
                    border-color var(--transition);
        width: 100%;
        padding: 0;
        color: inherit;
        font: inherit;
      }
      .svc-card:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
        border-color: var(--color-primary-light);
      }
      /* §16.3 canonical 4-stop per-category wash */
      .svc-wash {
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
      .svc-photo {
        position: absolute;
        inset: 0;
        z-index: 1;
        background-color: var(--color-bg);
        background-size: cover;
        background-position: center top;
        background-repeat: no-repeat;
        opacity: 0;
        transition: opacity 0.45s ease;
      }
      .svc-photo.shown { opacity: 1; }
      .svc-body {
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
      .svc-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .svc-ic {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        color: #fff;
        flex-shrink: 0;
        font-size: 1rem;
      }
      .svc-body strong {
        font-family: var(--font-display);
        font-size: 1.05rem;
        color: #fff;
      }
      .svc-price {
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.85);
      }

      /* Skeleton reveal - cover overlay */
      @keyframes skeleton-spawn {
        from { opacity: 1; }
        to   { opacity: 0; pointer-events: none; }
      }
      .skeleton::after,
      .svc-card.skeleton::after {
        content: "";
        position: absolute; inset: 0; z-index: 10;
        background: var(--color-bg);
        animation: skeleton-spawn 0.1s ease both;
      }
      .svc-grid > :nth-child(1)::after { animation-delay: 0s; }
      .svc-grid > :nth-child(2)::after { animation-delay: 0.05s; }
      .svc-grid > :nth-child(3)::after { animation-delay: 0.1s; }
      .svc-grid > :nth-child(4)::after { animation-delay: 0.15s; }
      .svc-card.skeleton {
        cursor: default;
      }
      .svc-card.skeleton:hover {
        transform: none;
        box-shadow: var(--shadow);
      }
      .card-cover {
        position: absolute;
        inset: 0;
        z-index: 4;
        background: var(--color-surface);
        transition: opacity 0.35s ease;
      }
      .card-cover.loaded {
        opacity: 0;
        pointer-events: none;
      }
      .svc-card .bw-scan1 { width: 30%; }
      .svc-card .bw-scan2 { width: 45%; }
      .svc-card .bw-sweep1 { width: 25%; }
      .svc-card .bw-sweep2 { width: 18%; }

      /* ── Error ── */
      .err-card {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: var(--color-danger);
        padding: 1.25rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
      }
      .err-ic {
        display: inline-flex;
        flex-shrink: 0;
      }

      /* ── Empty state ── */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        padding: 3rem 1.5rem;
        text-align: center;
      }
      .empty-ic {
        color: var(--color-muted);
      }
      .empty-state p {
        margin: 0;
        color: var(--color-muted);
      }
    `,
  ],
})
export class ChildrenBrowseComponent implements OnInit, OnDestroy {
  placeholderUrl = placeholderUrl;
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  children = signal<Category[]>([]);
  parentName = signal('');
  loading = signal(true);
  error = signal(false);
  /** Category ids whose thumbnail has finished preloading (then the photo reveals). */
  loadedIds = signal<Set<string>>(new Set());
  barsRemovedIds = signal<Set<string>>(new Set());
  private currentSlug = '';
  private destroyed = false;

  isLoaded(id: string): boolean { return this.loadedIds().has(id); }
  thumbUrl(cat: Category): string { return cat.bannerUrl || cat.imageUrl || this.placeholderUrl(cat.slug); }

  ngOnDestroy(): void { this.destroyed = true; }

  /** Preload thumbnails ONE BY ONE: a card keeps its scanning animation until its
   *  own image is fully decoded, then reveals; a short gap staggers the reveals so
   *  they don't all pop at once. Errors still reveal (the placeholder). */
  private preloadSequential(cats: Category[]): void {
    let i = 0;
    const next = () => {
      if (this.destroyed || i >= cats.length) return;
      const cat = cats[i++];
      const url = this.thumbUrl(cat);
      const t0 = performance.now();
      const img = new Image();
      img.src = url;
      img.decode().then(() => {
        if (this.destroyed) return;
        const wait = Math.max(0, 50 - (performance.now() - t0));
        setTimeout(() => {
          this.loadedIds.update((s) => { const n = new Set(s); n.add(cat.id); return n; });
          setTimeout(() => {
            this.barsRemovedIds.update(s => { const n = new Set(s); n.add(cat.id); return n; });
          }, 200);
          setTimeout(next, 100);
        }, wait);
      }).catch(() => {
        if (this.destroyed) return;
        this.loadedIds.update((s) => { const n = new Set(s); n.add(cat.id); return n; });
        setTimeout(() => {
          this.barsRemovedIds.update(s => { const n = new Set(s); n.add(cat.id); return n; });
        }, 200);
        setTimeout(next, 100);
      });
    };
    next();
  }

  ngOnInit(): void {
    // Land at the top so the service cards are visible immediately — without this, a
    // navigation from a scrolled page keeps the old scroll offset and the cards start
    // off-screen below the fold.
    window.scrollTo({ top: 0, left: 0 });
    this.currentSlug = this.route.snapshot.paramMap.get('parentSlug') ?? '';
    if (this.currentSlug) {
      this.parentName.set(this.currentSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
      this.load();
    }
  }

  load(): void {
    const slug = this.currentSlug;
    if (!slug) return;
    this.loading.set(true);
    this.error.set(false);

    this.api.get<{ data: Category[] }>('/categories', { parent: slug }).subscribe({
      next: (res) => {
        const cats = res.data ?? [];
        this.loadedIds.set(new Set());
        this.barsRemovedIds.set(new Set());
        this.children.set(cats);
        this.loading.set(false);
        this.preloadSequential(cats);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  pick(cat: Category): void {
    if (this.auth.isLoggedIn()) {
      this.router.navigate(['/customer/quote'], {
        queryParams: { category: cat.id },
      });
    } else {
      this.auth.enterGuestMode(cat.id);
      this.router.navigate(['/login'], { queryParams: { intent: 'quote' } });
    }
  }
}
