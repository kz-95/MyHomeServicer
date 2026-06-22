import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';

interface CategoryQuestion {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string; active?: boolean }[];
}

interface Service {
  id: string;
  categoryId: string;
  category?: { id: string; name: string; imageUrl?: string | null };
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  published: boolean;
  servicerSku?: string | null;
  basePrice: number;
  priceType: string;
  taxMode: string;
  estimatedDurationMinutes: number;
  autoAccept: boolean;
  modifiers?: Record<string, Record<string, { price: number | null; notOffered: boolean }>> | null;
  autoAcceptConditions?: {
    budget_min?: number;
    budget_max?: number;
    match_time_slot?: string[];
  } | null;
  moduleRefs?: { moduleId: string; priceOverride?: number | null }[] | null;
}

@Component({
  selector: 'app-servicer-listings',
  standalone: true,
  imports: [FormsModule, IconComponent, ListToolbarComponent],
  template: `
    <div class="head">
      <div>
        <h1>Listings</h1>
        <p class="muted">
          Your services under <strong>{{ bigCategory()?.name || '…' }}</strong>. Customers browse
          and quote these.
        </p>
      </div>
      <button class="btn-primary" (click)="add()">+ Add listing</button>
    </div>

    @if (loading()) {
      <div class="card">Loading listings…</div>
    } @else if (loadFailed()) {
      <p class="muted">Could not load your listings. Please refresh the page.</p>
    } @else if (services().length === 0) {
      <div class="card">No listings yet. Create one so customers can find you.</div>
    } @else {
      <app-list-toolbar>
        <input
          class="search"
          type="text"
          placeholder="Search by title or SKU…"
          [(ngModel)]="search"
          name="lsearch"
          toolbar-search
        />
        <select [ngModel]="sortField()" (ngModelChange)="sortField.set($event)" name="lsort" toolbar-sort>
          <option value="title">Title A-Z</option>
          <option value="price">Price low-high</option>
          <option value="duration">Duration</option>
        </select>
        <button class="sort-dir" (click)="toggleDir()" toolbar-sort>
          {{ sortDir() === 'asc' ? '↑' : '↓' }}
        </button>
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="filter() === 'all'" (click)="filter.set('all')">
            All <span class="n">{{ services().length }}</span>
          </button>
          <button class="chip" [class.on]="filter() === 'active'" (click)="filter.set('active')">
            Active <span class="n">{{ activeCount() }}</span>
          </button>
          <button class="chip" [class.on]="filter() === 'draft'" (click)="filter.set('draft')">
            Draft <span class="n">{{ draftCount() }}</span>
          </button>
        </div>
      </app-list-toolbar>

      @for (s of filtered(); track s.id) {
        <div class="card lc" [class.is-draft]="!s.published">
          <div class="lc-main">
            <button class="lc-expand" (click)="toggle(s.id)" [attr.aria-expanded]="isOpen(s.id)">
              <app-icon [name]="isOpen(s.id) ? 'chevron-down' : 'chevron-right'" sizeToken="sm" />
            </button>
            <div class="lc-tile">
              @if (s.imageUrl) {
                <img [src]="s.imageUrl" class="lc-thumb" alt="" />
              } @else if (s.category?.imageUrl) {
                <img [src]="s.category!.imageUrl" class="lc-thumb" alt="" />
              } @else {
                <span class="lc-icon"><app-icon name="clipboard-list" sizeToken="lg" strokeWidth="1.5" /></span>
              }
            </div>

            <div class="lc-body">
              <strong class="lc-title">{{ s.title }}</strong>
              <div class="lc-desc">{{ s.description || 'No description' }}</div>
              <div class="lc-meta">
                <span>RM {{ s.basePrice }}</span>
                <span class="mdot">·</span>
                <span>~{{ s.estimatedDurationMinutes }} min</span>
                <span class="mdot">·</span>
                <span>{{ moduleCount(s) }} module{{ moduleCount(s) === 1 ? '' : 's' }}</span>
                <span class="mdot">·</span>
                <span class="aa" [class.on]="s.autoAccept">
                  <span class="aa-dot"></span>auto-accept {{ s.autoAccept ? 'on' : 'off' }}
                </span>
              </div>
            </div>

            <div class="lc-right">
              <button
                class="status-toggle"
                [class.active]="s.published"
                (click)="toggleStatus(s)"
                [disabled]="busyId() === s.id"
                [title]="s.published ? 'Active — click to set Draft' : 'Draft — click to Activate'"
              >
                {{ s.published ? 'Active' : 'Draft' }}
              </button>
              <div class="menu-wrap">
                <button class="lc-menu-btn" (click)="toggleMenu(s.id)" aria-label="More actions">⋯</button>
                @if (menuId() === s.id) {
                  <div class="menu" (mouseleave)="menuId.set(null)">
                    <button (click)="edit(s)">Edit</button>
                    <button (click)="duplicate(s)">Duplicate</button>
                    <button (click)="toggleStatus(s)">{{ s.published ? 'Deactivate' : 'Activate' }}</button>
                    <button class="danger" (click)="remove(s)">Delete</button>
                  </div>
                }
              </div>
            </div>
          </div>

          @if (isOpen(s.id)) {
            <div class="lc-expand-body">
              <div class="ex-sec">
                <span class="ex-label">Modules</span>
                <span class="ex-val">{{ moduleCount(s) > 0 ? moduleCount(s) + ' attached' : 'None (manual quoting)' }}</span>
              </div>
              <div class="ex-sec">
                <span class="ex-label">Jobs offered</span>
                <span class="ex-val">
                  @if (offeredSummary(s).length) {
                    @for (line of offeredSummary(s); track line) {
                      <span class="ex-chip">{{ line }}</span>
                    }
                  } @else {
                    All job types
                  }
                </span>
              </div>
              <div class="ex-sec">
                <span class="ex-label">Auto-accept</span>
                <span class="ex-val">{{ autoSummary(s) }}</span>
              </div>
            </div>
          }
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 0.5rem;
      }
      .head h1 {
        margin-bottom: 0.2rem;
      }
      .chips {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
      }
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
      .chip:hover {
        background: var(--color-bg);
        color: var(--color-text);
      }
      .chip.on {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
      }
      .chip .n {
        font-size: 0.7rem;
        font-weight: 600;
        background: var(--color-border);
        color: var(--color-muted);
        border-radius: 999px;
        padding: 0.05rem 0.45rem;
        margin-left: 0.25rem;
      }
      .chip.on .n {
        background: rgba(255, 255, 255, 0.2);
        color: #fff;
      }
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
      .sort-dir:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }

      .lc {
        margin-bottom: 0.7rem;
        padding: 0.75rem 0.9rem;
      }
      .lc.is-draft {
        border-style: dashed;
      }
      .lc-main {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      .lc-expand {
        background: transparent;
        border: none;
        cursor: pointer;
        color: var(--color-muted);
        padding: 0.25rem;
        line-height: 1;
        flex-shrink: 0;
      }
      .lc-expand:hover {
        color: var(--color-primary);
      }
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
      .lc-icon {
        display: inline-flex;
        color: var(--color-primary);
      }
      .lc-thumb {
        width: 48px;
        height: 48px;
        border-radius: var(--radius-sm);
        object-fit: cover;
      }
      .lc-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .lc-title {
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lc-desc {
        font-size: 0.85rem;
        color: var(--color-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .lc-meta {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.78rem;
        color: var(--color-muted);
        flex-wrap: wrap;
      }
      .mdot {
        color: var(--color-border);
      }
      .aa {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
      }
      .aa-dot {
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 999px;
        background: var(--color-border);
      }
      .aa.on .aa-dot {
        background: var(--color-success);
      }
      .lc-right {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-shrink: 0;
      }
      .status-toggle {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.25rem 0.6rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background: var(--color-bg);
        color: var(--color-muted);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .status-toggle.active {
        background: var(--color-success-bg);
        color: var(--color-success);
        border-color: var(--color-success);
      }
      .status-toggle:disabled {
        opacity: 0.5;
        cursor: default;
      }
      .menu-wrap {
        position: relative;
      }
      .lc-menu-btn {
        background: transparent;
        border: none;
        font-size: 1.2rem;
        line-height: 1;
        cursor: pointer;
        color: var(--color-muted);
        padding: 0.1rem 0.4rem;
        border-radius: var(--radius);
      }
      .lc-menu-btn:hover {
        background: var(--color-bg);
        color: var(--color-text);
      }
      .menu {
        position: absolute;
        right: 0;
        top: 100%;
        z-index: 20;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow-md);
        display: flex;
        flex-direction: column;
        min-width: 140px;
        padding: 0.25rem;
      }
      .menu button {
        background: transparent;
        border: none;
        text-align: left;
        padding: 0.45rem 0.6rem;
        font-size: 0.85rem;
        color: var(--color-text);
        cursor: pointer;
        border-radius: var(--radius-sm);
        font-family: inherit;
      }
      .menu button:hover {
        background: var(--color-bg);
      }
      .menu button.danger {
        color: var(--color-danger);
      }
      .menu button.danger:hover {
        background: var(--color-danger-bg);
      }
      .lc-expand-body {
        margin-top: 0.6rem;
        padding-top: 0.6rem;
        border-top: 1px solid var(--color-border);
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .ex-sec {
        display: flex;
        gap: 0.6rem;
        align-items: flex-start;
        font-size: 0.82rem;
      }
      .ex-label {
        flex-shrink: 0;
        width: 90px;
        font-weight: 600;
        color: var(--color-muted);
      }
      .ex-val {
        flex: 1;
        color: var(--color-text);
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
      }
      .ex-chip {
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.1rem 0.5rem;
        font-size: 0.76rem;
      }
    `,
  ],
})
export class ServicerListingsComponent implements OnInit {
  private api = inject(ApiService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private router = inject(Router);

  services = signal<Service[]>([]);
  bigCategory = signal<{ id: string; name: string } | null>(null);
  questions = signal<CategoryQuestion[]>([]);
  loading = signal(true);
  loadFailed = signal(false);
  busyId = signal<string | null>(null);

  search = signal('');
  filter = signal<'all' | 'active' | 'draft'>('all');
  sortField = signal<'title' | 'price' | 'duration'>('title');
  sortDir = signal<'asc' | 'desc'>('asc');

  openIds = signal<Set<string>>(new Set());
  menuId = signal<string | null>(null);

  activeCount = computed(() => this.services().filter((s) => s.published).length);
  draftCount = computed(() => this.services().filter((s) => !s.published).length);

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const flt = this.filter();
    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    let list = this.services().filter((s) => {
      if (flt === 'active' && !s.published) return false;
      if (flt === 'draft' && s.published) return false;
      if (q && !s.title.toLowerCase().includes(q) && !(s.servicerSku ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp: number;
      if (field === 'price') cmp = a.basePrice - b.basePrice;
      else if (field === 'duration') cmp = a.estimatedDurationMinutes - b.estimatedDurationMinutes;
      else cmp = a.title.localeCompare(b.title);
      return cmp * dir;
    });
    return list;
  });

  ngOnInit(): void {
    this.api
      .get<{ category: { id: string; name: string } }>('/servicer/me/subcategories')
      .pipe(
        switchMap((r) => {
          this.bigCategory.set(r.category);
          return this.api.get<{
            data: { id: string; questionSchema?: CategoryQuestion[] | null }[];
          }>('/categories');
        }),
      )
      .subscribe({
        next: (r) => {
          const cat = r.data.find((c) => c.id === this.bigCategory()?.id);
          this.questions.set(
            (cat?.questionSchema ?? []).filter(
              (qq) => Array.isArray(qq.options) && (qq.options as unknown[]).length > 0,
            ),
          );
        },
        error: () => {},
      });
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.api.get<{ data: Service[] }>('/servicer/me/services').subscribe({
      next: (r) => {
        this.services.set(r.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  moduleCount(s: Service): number {
    return Array.isArray(s.moduleRefs) ? s.moduleRefs.length : 0;
  }

  offeredSummary(s: Service): string[] {
    if (!s.modifiers) return [];
    const lines: string[] = [];
    for (const q of this.questions()) {
      const qMap = s.modifiers[q.key];
      if (!qMap) continue;
      const offered = (q.options ?? [])
        .filter((o) => qMap[o.value] && !qMap[o.value].notOffered)
        .map((o) => o.label);
      if (offered.length) lines.push(`${q.label}: ${offered.join(', ')}`);
    }
    return lines;
  }

  autoSummary(s: Service): string {
    if (!s.autoAccept) return 'Off — you quote manually';
    const c = s.autoAcceptConditions ?? {};
    const parts: string[] = [];
    if (c.budget_min != null || c.budget_max != null) {
      parts.push(`budget ${c.budget_min ?? 0}–${c.budget_max ?? '∞'}`);
    }
    if (c.match_time_slot?.length) parts.push(`slots: ${c.match_time_slot.join(', ')}`);
    return parts.length ? `On — ${parts.join(' · ')}` : 'On';
  }

  isOpen(id: string): boolean {
    return this.openIds().has(id);
  }

  toggle(id: string): void {
    const next = new Set(this.openIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.openIds.set(next);
  }

  toggleDir(): void {
    this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
  }

  toggleMenu(id: string): void {
    this.menuId.set(this.menuId() === id ? null : id);
  }

  add(): void {
    this.router.navigate(['/servicer/services/new']);
  }

  edit(s: Service): void {
    this.menuId.set(null);
    this.router.navigate(['/servicer/services', s.id, 'edit']);
  }

  toggleStatus(s: Service): void {
    this.menuId.set(null);
    this.busyId.set(s.id);
    const next = !s.published;
    this.api.patch(`/servicer/me/services/${s.id}`, { published: next }).subscribe({
      next: () => {
        this.services.update((list) =>
          list.map((x) => (x.id === s.id ? { ...x, published: next } : x)),
        );
        this.busyId.set(null);
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(e.message ?? 'Could not update status');
      },
    });
  }

  duplicate(s: Service): void {
    this.menuId.set(null);
    const body: Record<string, unknown> = {
      title: `${s.title} (Copy)`,
      description: s.description || undefined,
      imageUrl: s.imageUrl || undefined,
      basePrice: s.basePrice,
      priceType: s.priceType,
      taxMode: s.taxMode,
      estimatedDurationMinutes: s.estimatedDurationMinutes,
      published: false,
      autoAccept: false,
      modifiers: s.modifiers ?? undefined,
    };
    // Keep the listing under its current sub-category if it differs from the big category.
    if (s.categoryId && s.categoryId !== this.bigCategory()?.id) {
      body['subcategoryId'] = s.categoryId;
    }
    this.api.post<Service>('/servicer/me/services', body).subscribe({
      next: () => {
        this.toast.success('Listing duplicated as a draft.');
        this.load();
      },
      error: (e) => this.toast.error(e.message ?? 'Could not duplicate the listing'),
    });
  }

  remove(s: Service): void {
    this.menuId.set(null);
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
}
