import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { routeFor } from '../../core/route-for';
import { IconComponent } from '../../shared/icon.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { ModalComponent } from '../../shared/modal.component';
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
  modifiers?: Record<string, Record<string, { price: number | null; notOffered: boolean; modKind?: string }>> | null;
  autoAcceptConditions?: {
    budget_min?: number;
    budget_max?: number;
    match_time_slot?: string[];
  } | null;
  moduleRefs?: { moduleId: string; priceOverride?: number | null; kind?: 'included' | 'addon' }[] | null;
}

interface ModuleLookup {
  id: string;
  name: string;
  price: number;
}

@Component({
  selector: 'app-servicer-listings',
  standalone: true,
  imports: [FormsModule, IconComponent, ListToolbarComponent, ModalComponent],
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
                    <button class="danger" (click)="deleteTarget.set(s); menuId.set(null)">Delete</button>
                  </div>
            }
              <div class="ex-acts">
                <button class="btn-ghost" (click)="previewListing(s)">👁 Preview as customer</button>
              </div>
            </div>
            </div>
          </div>

          @if (isOpen(s.id)) {
            <div class="lc-expand-body">
              <div class="ex-sec">
                <span class="ex-label">Modules</span>
                <span class="ex-val">
                  @if (moduleCount(s) > 0) {
                    @for (ref of (s.moduleRefs ?? []); track ref.moduleId) {
                      <span class="ex-chip" [class.ex-addon]="moduleRefKind(s, ref.moduleId) === 'addon'">
                        {{ moduleRefName(ref.moduleId) }}
                        @if (moduleRefKind(s, ref.moduleId) === 'addon') { <span class="kind-tag">add-on</span> }
                      </span>
                    }
                  } @else {
                    None (manual quoting)
                  }
                </span>
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
              @if (s.modifiers && objectKeys(s.modifiers).length) {
                <div class="ex-sec ex-pricing">
                  <span class="ex-label">Pricing options</span>
                  <div class="ex-val">
                    @for (qKey of objectKeys(s.modifiers); track qKey) {
                      <div class="ex-opt-group">
                        <span class="ex-opt-key">{{ questionLabel(qKey) }}</span>
                        <span class="ex-opts">
                          @for (opt of objectKeys(s.modifiers![qKey]); track opt) {
                            @if (!s.modifiers![qKey][opt].notOffered) {
                              <span class="ex-opt-chip">{{ opt }}: RM {{ s.modifiers![qKey][opt].price }}</span>
                            }
                          }
                        </span>
                      </div>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
    }

    <app-modal [open]="preview() !== null" title="Customer preview" (closed)="preview.set(null)">
      @if (preview(); as p) {
        <div class="pv-card">
          <div class="pv-avatar">{{ p.title ? p.title.charAt(0) : '?' }}</div>
          <div class="pv-info">
            <strong class="pv-title">{{ p.title || 'Untitled' }}</strong>
            @if (p.description) { <p class="pv-desc">{{ p.description }}</p> }
            <div class="pv-meta">
              <span>~{{ p.estimatedDurationMinutes }} min</span>
              <span class="mdot">·</span>
              <span>RM {{ p.basePrice }}</span>
              @if (p.autoAccept) { <span class="pv-aa">auto-accept</span> }
            </div>
            @if (moduleCount(p) > 0) {
              <div class="pv-mods">
                <span class="pv-mods-label">Includes:</span>
                @for (ref of (p.moduleRefs ?? []); track ref.moduleId) {
                  @if (moduleRefKind(p, ref.moduleId) === 'included') {
                    <span class="chip-soft">{{ moduleRefName(ref.moduleId) }}</span>
                  }
                }
              </div>
            }
            @if (offeredSummary(p).length) {
              <div class="pv-mods">
                <span class="pv-mods-label">Jobs:</span>
                @for (line of offeredSummary(p); track line) {
                  <span class="chip-soft">{{ line }}</span>
                }
              </div>
            }
          </div>
          <div class="pv-action">
            <span class="pv-price">From RM {{ p.basePrice }}</span>
          </div>
        </div>
      }
    </app-modal>

    <app-modal
      [open]="deleteTarget() !== null"
      title="Delete listing"
      (closed)="deleteTarget.set(null)"
    >
      @if (deleteTarget(); as s) {
        <p>Are you sure you want to delete <strong>{{ s.title }}</strong>?</p>
        <p class="muted small">This action cannot be undone.</p>
        <div class="modal-actions">
          <button class="btn-ghost" (click)="deleteTarget.set(null)">Cancel</button>
          <button class="btn-danger" (click)="confirmDelete()">Delete listing</button>
        </div>
      }
    </app-modal>
  `,
  styles: [
    `
      :host {
        display: block; max-width: 720px; width: 100%;
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
        padding: 0.35rem 0.75rem;
        font-size: 0.82rem;
        font-weight: 500;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        line-height: 1.3;
        white-space: nowrap;
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
        padding: 0.45rem 0.6rem;
        cursor: pointer;
        color: var(--color-muted);
        font-size: 0.88rem;
        line-height: 1;
        font-family: inherit;
        min-width: 36px;
        min-height: 36px;
      }
      .sort-dir:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }

      .lc {
        margin-bottom: 0.7rem;
        padding: 1rem;
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
        padding: 0.5rem;
        min-width: 44px;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
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
        font-size: 0.78rem;
        font-weight: 600;
        padding: 0.4rem 0.75rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background: var(--color-bg);
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        line-height: 1.3;
        white-space: nowrap;
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
        padding: 0.5rem;
        min-width: 44px;
        min-height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
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
        padding: 0.5rem 0.75rem;
        font-size: 0.88rem;
        color: var(--color-text);
        cursor: pointer;
        border-radius: var(--radius-sm);
        font-family: inherit;
        line-height: 1.3;
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
      .ex-chip.ex-addon {
        border-style: dashed;
      }
      .kind-tag {
        font-size: 0.66rem;
        font-weight: 600;
        background: var(--color-warning-bg, #fef3c7);
        color: var(--color-warning, #d97706);
        border-radius: 4px;
        padding: 0.05rem 0.35rem;
        margin-left: 0.25rem;
      }
      .ex-acts {
        display: flex;
        gap: 0.5rem;
        padding-top: 0.4rem;
      }

      .pv-card { display: flex; gap: 1rem; align-items: flex-start; }
      .pv-avatar { width: 44px; height: 44px; border-radius: 999px; background: var(--color-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; flex-shrink: 0; }
      .pv-info { flex: 1; min-width: 0; }
      .pv-title { font-weight: 700; font-size: 1.05rem; }
      .pv-desc { margin: 0.2rem 0; font-size: 0.85rem; color: var(--color-muted); }
      .pv-meta { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; color: var(--color-muted); margin-top: 0.2rem; }
      .pv-aa { font-size: 0.7rem; background: var(--color-primary-light); color: var(--color-primary); padding: 0.05rem 0.4rem; border-radius: 4px; }
      .pv-mods { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; margin-top: 0.35rem; }
      .pv-mods-label { font-size: 0.78rem; color: var(--color-muted); margin-right: 0.2rem; }
      .chip-soft { font-size: 0.74rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 999px; padding: 0.05rem 0.5rem; }
      .pv-action { display: flex; flex-direction: column; align-items: flex-end; flex-shrink: 0; }
      .pv-price { font-size: 1.3rem; font-weight: 700; }

      .modal-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }
      .btn-danger {
        background: var(--color-danger);
        color: #fff;
        border: none;
        border-radius: var(--radius);
        padding: 0.55rem 1.1rem;
        font-size: 0.9rem;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        line-height: 1.3;
        transition: opacity 0.15s ease;
      }
      .btn-danger:hover {
        opacity: 0.85;
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
  preview = signal<Service | null>(null);
  deleteTarget = signal<Service | null>(null);

  private moduleData = signal<ModuleLookup[]>([]);

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
    this.loadModules();
    this.load();
  }

  private loadModules(): void {
    this.api.get<{ data: ModuleLookup[] }>('/servicer/modules').subscribe({
      next: (r) => this.moduleData.set(r.data),
      error: () => {},
    });
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

  moduleRefName(moduleId: string): string {
    return this.moduleData().find((m) => m.id === moduleId)?.name ?? moduleId;
  }

  moduleRefKind(s: Service, moduleId: string): string {
    return s.moduleRefs?.find((r) => r.moduleId === moduleId)?.kind ?? 'included';
  }

  questionLabel(qKey: string): string {
    return this.questions().find((q) => q.key === qKey)?.label ?? qKey;
  }

  previewListing(s: Service): void {
    this.preview.set(s);
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

  objectKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }

  toggleDir(): void {
    this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
  }

  toggleMenu(id: string): void {
    this.menuId.set(this.menuId() === id ? null : id);
  }

  add(): void {
    this.router.navigate([routeFor('servicer.services.new')]);
  }

  edit(s: Service): void {
    this.menuId.set(null);
    this.router.navigate([routeFor('servicer.services.edit', { id: s.id })]);
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

  confirmDelete(): void {
    const s = this.deleteTarget();
    if (!s) return;
    this.deleteTarget.set(null);
    this.busyId.set(s.id);
    this.api.delete(`/servicer/me/services/${s.id}`).subscribe({
      next: () => {
        this.busyId.set(null);
        this.toast.success('Listing deleted.');
        this.load();
      },
      error: (e) => {
        this.busyId.set(null);
        this.toast.error(e.message ?? 'Could not delete the listing');
      },
    });
  }
}
