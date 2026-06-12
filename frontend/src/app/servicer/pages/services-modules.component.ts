import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';

interface ServicerModule {
  id: string;
  name: string;
  price: number;
  sku?: string | null;
  active: boolean;
  usedInListings: number;
}

@Component({
  selector: 'app-servicer-modules',
  standalone: true,
  imports: [FormsModule, IconComponent, ListToolbarComponent],
  template: `
    <div class="head">
      <div>
        <h1>Modules</h1>
        <p class="muted">
          Reusable priced items you can attach to listings. Tax is applied flat from your
          business profile.
        </p>
      </div>
      <button class="btn-primary" (click)="openCreate()">+ Add module</button>
    </div>

    @if (loading()) {
      <div class="card">Loading modules…</div>
    } @else if (loadFailed()) {
      <p class="muted">Could not load your modules. Please refresh the page.</p>
    } @else if (modules().length === 0) {
      <div class="card">No modules yet. Add one to reuse it across your listings.</div>
    } @else {
      <app-list-toolbar>
        <input
          class="search"
          type="text"
          placeholder="Search by name or SKU…"
          [(ngModel)]="search"
          name="modsearch"
          toolbar-search
        />
        <select [ngModel]="sortField()" (ngModelChange)="sortField.set($event)" name="modsort" toolbar-sort>
          <option value="name">Name A-Z</option>
          <option value="price">Price low-high</option>
          <option value="used">Most used</option>
        </select>
        <button class="sort-dir" (click)="toggleDir()" toolbar-sort>
          {{ sortDir() === 'asc' ? '↑' : '↓' }}
        </button>
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="filter() === 'all'" (click)="filter.set('all')">
            All <span class="n">{{ modules().length }}</span>
          </button>
          <button class="chip" [class.on]="filter() === 'active'" (click)="filter.set('active')">
            Active <span class="n">{{ activeCount() }}</span>
          </button>
          <button class="chip" [class.on]="filter() === 'inactive'" (click)="filter.set('inactive')">
            Inactive <span class="n">{{ inactiveCount() }}</span>
          </button>
        </div>
      </app-list-toolbar>

      <div class="grid">
        @for (m of filtered(); track m.id) {
          <div class="card mod-card" [class.inactive]="!m.active">
            <div class="mc-body">
              <div class="mc-title-row">
                <strong class="mc-name">{{ m.name }}</strong>
                @if (!m.active) {
                  <span class="badge badge-manual">Inactive</span>
                }
              </div>
              <div class="mc-meta">
                <span class="mc-sku">SKU {{ m.sku || '—' }}</span>
                <span class="mdot">·</span>
                <span>used in {{ m.usedInListings }} listing{{ m.usedInListings === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <div class="mc-right">
              <span class="mc-price">RM {{ m.price }}</span>
              <div class="mc-acts">
                <button class="btn-ghost mc-edit" (click)="openEdit(m)">Edit</button>
                <button class="mc-del" (click)="remove(m)" aria-label="Deactivate module">
                  <app-icon name="trash-2" sizeToken="sm" />
                </button>
              </div>
            </div>
          </div>
        }
      </div>
    }

    @if (modalOpen()) {
      <div class="pg-backdrop"></div>
      <div class="pg-guard">
        <div class="pg-header">
          <h2>{{ editId() ? 'Edit module' : 'Add module' }}</h2>
          <button class="pg-close" (click)="closeModal()" aria-label="Close">✕</button>
        </div>
        <div class="pg-body">
          @if (formError()) {
            <p class="err">{{ formError() }}</p>
          }
          <label>
            <span>Name<span class="req"> *</span></span>
            <input type="text" [(ngModel)]="f.name" name="mname" maxlength="200" placeholder="e.g. Chemical Wash" />
          </label>
          <div class="row">
            <label>
              <span>Price (RM)<span class="req"> *</span></span>
              <input type="number" [(ngModel)]="f.price" name="mprice" min="0" step="0.01" />
            </label>
            <label>
              <span>SKU (optional)</span>
              <input type="text" [(ngModel)]="f.sku" name="msku" placeholder="3–30 chars" />
            </label>
          </div>
        </div>
        <div class="pg-footer">
          <button class="btn-ghost" (click)="closeModal()">Cancel</button>
          <button class="btn-primary" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Saving…' : editId() ? 'Save changes' : 'Add module' }}
          </button>
        </div>
      </div>
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
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 360px));
        gap: 0.8rem;
        justify-content: center;
        align-items: start;
      }
      .mod-card {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.9rem 1rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .mod-card:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-1px);
      }
      .mod-card.inactive {
        opacity: 0.6;
      }
      .mc-body {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
      }
      .mc-title-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .mc-name {
        font-size: 1rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .mc-meta {
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
      .mc-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.5rem;
        flex-shrink: 0;
      }
      .mc-price {
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .mc-acts {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }
      .mc-edit {
        font-size: 0.78rem;
        padding: 0.25rem 0.6rem;
        border-radius: var(--radius);
        color: var(--color-primary);
        border-color: var(--color-primary);
        background: transparent;
      }
      .mc-edit:hover {
        background: var(--color-primary);
        color: #fff;
      }
      .mc-del {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: var(--radius);
        color: var(--color-muted);
        transition: color 0.15s ease, background 0.15s ease;
        line-height: 1;
      }
      .mc-del:hover {
        color: var(--color-danger);
        background: var(--color-danger-bg);
      }

      .pg-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: var(--color-backdrop);
      }
      .pg-guard {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
        width: 460px;
        max-width: calc(100vw - 2rem);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;
        max-height: 80vh;
      }
      .pg-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--color-border);
      }
      .pg-header h2 {
        margin: 0;
        font-size: 1.1rem;
      }
      .pg-close {
        background: transparent;
        border: none;
        font-size: 1rem;
        color: var(--color-muted);
        padding: 0.25rem 0.5rem;
        cursor: pointer;
        border-radius: var(--radius);
        line-height: 1;
      }
      .pg-close:hover {
        color: var(--color-text);
        background: var(--color-bg);
      }
      .pg-body {
        padding: 1.25rem;
        overflow-y: auto;
        overscroll-behavior: contain;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .pg-body label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.88rem;
        font-weight: 500;
      }
      .row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.7rem;
      }
      @media (max-width: 560px) {
        .row {
          grid-template-columns: 1fr;
        }
      }
      .req {
        color: var(--color-danger);
      }
      .pg-footer {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.5rem;
        padding: 1rem 1.25rem;
        border-top: 1px solid var(--color-border);
      }
    `,
  ],
})
export class ServicerModulesComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private bodyOverflow: string | null = null;

  modules = signal<ServicerModule[]>([]);
  loading = signal(true);
  loadFailed = signal(false);

  search = signal('');
  filter = signal<'all' | 'active' | 'inactive'>('all');
  sortField = signal<'name' | 'price' | 'used'>('name');
  sortDir = signal<'asc' | 'desc'>('asc');

  modalOpen = signal(false);
  editId = signal<string | null>(null);
  saving = signal(false);
  formError = signal('');
  f = this.blankForm();

  activeCount = computed(() => this.modules().filter((m) => m.active).length);
  inactiveCount = computed(() => this.modules().filter((m) => !m.active).length);

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const flt = this.filter();
    const field = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    let list = this.modules().filter((m) => {
      if (flt === 'active' && !m.active) return false;
      if (flt === 'inactive' && m.active) return false;
      if (q && !m.name.toLowerCase().includes(q) && !(m.sku ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      let cmp: number;
      if (field === 'price') cmp = a.price - b.price;
      else if (field === 'used') cmp = a.usedInListings - b.usedInListings;
      else cmp = a.name.localeCompare(b.name);
      return cmp * dir;
    });
    return list;
  });

  private blankForm() {
    return { name: '', price: null as number | null, sku: '' };
  }

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.unlockBody();
  }

  private lockBody(): void {
    this.bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
  }

  private unlockBody(): void {
    document.body.style.overflow = this.bodyOverflow ?? '';
    document.body.style.touchAction = '';
    this.bodyOverflow = null;
  }

  private load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.api.get<{ data: ServicerModule[] }>('/servicer/modules').subscribe({
      next: (r) => {
        this.modules.set(r.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  toggleDir(): void {
    this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
  }

  openCreate(): void {
    this.editId.set(null);
    this.f = this.blankForm();
    this.formError.set('');
    this.modalOpen.set(true);
    this.lockBody();
  }

  openEdit(m: ServicerModule): void {
    this.editId.set(m.id);
    this.f = { name: m.name, price: m.price, sku: m.sku ?? '' };
    this.formError.set('');
    this.modalOpen.set(true);
    this.lockBody();
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.unlockBody();
  }

  save(): void {
    const name = this.f.name.trim();
    if (!name) {
      this.formError.set('Name is required.');
      return;
    }
    if (this.f.price == null || this.f.price < 0) {
      this.formError.set('A valid price is required.');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    const body: Record<string, unknown> = {
      name,
      price: Number(this.f.price),
      sku: this.f.sku.trim() || null,
    };
    const id = this.editId();
    const req = id
      ? this.api.patch<ServicerModule>(`/servicer/modules/${id}`, body)
      : this.api.post<ServicerModule>('/servicer/modules', body);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.unlockBody();
        this.toast.success(id ? 'Module updated.' : 'Module added.');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.formError.set(e.message ?? 'Could not save the module');
      },
    });
  }

  remove(m: ServicerModule): void {
    this.dialog
      .confirm(`Deactivate the module "${m.name}"?`, { confirmLabel: 'Deactivate' })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`/servicer/modules/${m.id}`).subscribe({
          next: () => {
            this.toast.success('Module deactivated.');
            this.load();
          },
          error: (e) => this.toast.error(e.message ?? 'Could not deactivate the module'),
        });
      });
  }
}
