import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { ModalComponent } from '../../shared/modal.component';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';

interface ServicerModule {
  id: string;
  name: string;
  questionKey?: string | null;
  optionValue?: string | null;
  price: number;
  durationMin?: number | null;
  sku?: string | null;
  active: boolean;
  usedInListings: number;
}

interface CategoryQuestion {
  key: string;
  label: string;
  type: string;
  priced?: boolean;
  options?: { value: string; label: string; active?: boolean }[];
}

/** Flat service option — one per priced option across all questions. */
interface ServiceOption {
  questionKey: string;
  optionValue: string;
  label: string;          // "Chemical wash (Type of aircon service)"
  isQuantity: boolean;
}

@Component({
  selector: 'app-servicer-modules',
  standalone: true,
  imports: [FormsModule, IconComponent, ListToolbarComponent, ModalComponent],
  template: `
    <div class="head">
      <div>
        <h1>Modules</h1>
        <p class="muted">
          Reusable priced items you can attach to listings. Each module maps a
          question option to a price, duration, and optional SKU.
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
        <input class="search" type="text" placeholder="Search by name or SKU…" [(ngModel)]="search" name="modsearch" toolbar-search />
        <select [ngModel]="sortField()" (ngModelChange)="sortField.set($event)" name="modsort" toolbar-sort>
          <option value="name">Name A-Z</option>
          <option value="price">Price low-high</option>
          <option value="used">Most used</option>
        </select>
        <button class="sort-dir" (click)="toggleDir()" toolbar-sort>{{ sortDir() === 'asc' ? '↑' : '↓' }}</button>
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="filter() === 'all'" (click)="filter.set('all')">All <span class="n">{{ modules().length }}</span></button>
          <button class="chip" [class.on]="filter() === 'active'" (click)="filter.set('active')">Active <span class="n">{{ activeCount() }}</span></button>
          <button class="chip" [class.on]="filter() === 'inactive'" (click)="filter.set('inactive')">Inactive <span class="n">{{ inactiveCount() }}</span></button>
        </div>
      </app-list-toolbar>

      <div class="grid">
        @for (m of filtered(); track m.id) {
          <div class="card mod-card" [class.inactive]="!m.active">
            <div class="mc-body">
              <div class="mc-title-row">
                <strong class="mc-name">{{ m.name }}</strong>
                @if (!m.active) { <span class="badge badge-manual">Inactive</span> }
              </div>
              <div class="mc-meta">
                @if (m.questionKey) {
                  <span class="mc-q">{{ m.questionKey }} → {{ m.optionValue || '—' }}</span>
                  <span class="mdot">·</span>
                }
                @if (m.durationMin) {
                  <span>~{{ m.durationMin }} min</span>
                  <span class="mdot">·</span>
                }
                <span class="mc-sku">SKU {{ m.sku || '—' }}</span>
                <span class="mdot">·</span>
                <span>used in {{ m.usedInListings }} listing{{ m.usedInListings === 1 ? '' : 's' }}</span>
              </div>
            </div>
            <div class="mc-right">
              <span class="mc-price">RM {{ m.price }}</span>
              <div class="mc-acts">
                <button class="btn-ghost mc-edit" (click)="openEdit(m)">Edit</button>
                <button class="mc-del" (click)="remove(m)" aria-label="Deactivate module"><app-icon name="trash-2" sizeToken="sm" /></button>
              </div>
            </div>
          </div>
        }
      </div>
    }

    <app-modal
      [open]="modalOpen()"
      [title]="editId() ? 'Edit module' : 'Add module'"
      (closed)="closeModal()"
    >
      @if (formError()) {
        <p class="err">{{ formError() }}</p>
      }
      <label>
        <span>Services what you do (optional)</span>
        @if (questionsLoading()) {
          <select disabled><option>Loading…</option></select>
        } @else if (serviceOptions().length === 0) {
          <input type="text" [(ngModel)]="f.customVal" name="mcustom" placeholder="e.g. Chemical wash" />
        } @else {
          <select [ngModel]="selectedOptionKey()" (ngModelChange)="onOptionChange($event)" name="msvcopt">
            <option value="">— None —</option>
            @for (o of serviceOptions(); track o.questionKey + '::' + o.optionValue) {
              <option [value]="o.questionKey + '::' + o.optionValue">{{ o.label }}</option>
            }
            <option value="__custom__">+ Custom item</option>
          </select>
        }
        @if (selectedOptionKey() === '__custom__') {
          <input type="text" [(ngModel)]="f.customVal" name="mcustom" placeholder="What you do…" style="margin-top:0.4rem" />
        }
      </label>

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
          <span>Duration (min)</span>
          <input type="number" [(ngModel)]="f.durationMin" name="mdur" min="0" step="5" placeholder="e.g. 30" />
        </label>
      </div>
      <label>
        <span>SKU (optional)</span>
        <input type="text" [(ngModel)]="f.sku" name="msku" placeholder="3–30 chars" />
      </label>

      <div class="modal-actions">
        <button class="btn-ghost" (click)="closeModal()">Cancel</button>
        <button class="btn-primary" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Saving…' : editId() ? 'Save changes' : 'Add module' }}
        </button>
      </div>
    </app-modal>
  `,
  styles: [`
    :host { display: block; max-width: 720px; width: 100%; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
    .head > div { flex: 1; min-width: 0; }
    .head > button { flex-shrink: 0; }
    .head h1 { margin-bottom: 0.2rem; }
    .chips { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .chip { background: transparent; border: 1px solid var(--color-border); border-radius: 999px; padding: 0.2rem 0.65rem; font-size: 0.8rem; font-weight: 500; color: var(--color-muted); cursor: pointer; font-family: inherit; transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease; }
    .chip:hover { background: var(--color-bg); color: var(--color-text); }
    .chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
    .chip .n { font-size: 0.7rem; font-weight: 600; background: var(--color-border); color: var(--color-muted); border-radius: 999px; padding: 0.05rem 0.45rem; margin-left: 0.25rem; }
    .chip.on .n { background: rgba(255,255,255,0.2); color: #fff; }
    .sort-dir { background: transparent; border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.45rem 0.6rem; cursor: pointer; color: var(--color-muted); font-size: 0.88rem; line-height: 1; font-family: inherit; min-width: 36px; min-height: 36px; }
    .sort-dir:hover { border-color: var(--color-primary); color: var(--color-primary); }
    .grid { display: flex; flex-direction: column; gap: 0.6rem; }
    .mod-card { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem; }
    .mod-card.inactive { opacity: 0.55; }
    .mc-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.25rem; }
    .mc-title-row { display: flex; align-items: center; gap: 0.5rem; }
    .mc-name { font-size: 0.95rem; }
    .mc-meta { font-size: 0.78rem; color: var(--color-muted); display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; }
    .mdot { color: var(--color-border); }
    .mc-q { font-family: monospace; font-size: 0.74rem; background: var(--color-bg); padding: 0.05rem 0.4rem; border-radius: 4px; color: var(--color-muted); }
    .mc-sku { font-family: monospace; font-size: 0.76rem; }
    .mc-right { display: flex; flex-direction: column; align-items: flex-end; gap: 0.3rem; flex-shrink: 0; }
    .mc-price { font-size: 1.1rem; font-weight: 700; white-space: nowrap; }
    .mc-acts { display: flex; align-items: center; gap: 0.25rem; }
    .mc-edit, .mc-del { background: transparent; border: none; cursor: pointer; color: var(--color-muted); padding: 0.2rem 0.4rem; border-radius: var(--radius-sm); }
    .mc-edit:hover { background: var(--color-bg); color: var(--color-primary); }
    .mc-del:hover { background: var(--color-bg); color: var(--color-danger); }
    .badge-manual { background: var(--color-bg); color: var(--color-muted); font-size: 0.68rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 999px; border: 1px solid var(--color-border); }
    .err { color: var(--color-danger); background: var(--color-danger-bg); border: 1px solid var(--color-danger); border-radius: var(--radius); padding: 0.5rem 0.8rem; margin-bottom: 0.5rem; font-size: 0.85rem; }
    .row { display: flex; gap: 0.75rem; }
    .row > label { flex: 1; min-width: 0; }
    label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.88rem; font-weight: 500; }
    .req { color: var(--color-danger); }
    select, input[type="text"], input[type="number"] { width: 100%; box-sizing: border-box; }
    select:disabled, input:disabled { opacity: 0.5; cursor: not-allowed; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
  `],
})
export class ServicerModulesComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);

  modules = signal<ServicerModule[]>([]);
  loading = signal(true);
  loadFailed = signal(false);

  search = signal('');
  filter = signal<'all' | 'active' | 'inactive'>('all');
  sortField = signal<'name' | 'price' | 'used'>('name');
  sortDir = signal<'asc' | 'desc'>('asc');

  activeCount = computed(() => this.modules().filter((m) => m.active).length);
  inactiveCount = computed(() => this.modules().filter((m) => !m.active).length);

  modalOpen = signal(false);
  editId = signal<string | null>(null);
  saving = signal(false);
  formError = signal('');

  f = { name: '', price: null as number | null, durationMin: null as number | null, sku: '', customVal: '' };
  selectedOptionKey = signal('');

  // ── Category service options (flat list) ──────────────────────────
  questionsLoading = signal(false);
  private allQuestions = signal<CategoryQuestion[]>([]);

  /** All priced service options for this servicer's category, one per option. */
  serviceOptions = computed<ServiceOption[]>(() => {
    const flat: ServiceOption[] = [];
    for (const q of this.allQuestions()) {
      if (!q.priced) continue;
      if (!Array.isArray(q.options) || q.options.length === 0) continue;
      if (q.type === 'text' || q.type === 'number') continue;
      for (const o of q.options) {
        if (o.active === false) continue;
        flat.push({
          questionKey: q.key,
          optionValue: o.value,
          label: `${o.label} — ${q.label}`,
          isQuantity: q.type === 'quantity',
        });
      }
    }
    return flat;
  });

  /** When user picks a service option from the dropdown. */
  onOptionChange(value: string): void {
    this.formError.set('');
    this.selectedOptionKey.set(value);
    this.f.customVal = '';
  }

  filtered = computed(() => {
    const s = this.search().toLowerCase();
    const f = this.filter();
    const list = [...this.modules()].filter((m) => {
      if (f === 'active' && !m.active) return false;
      if (f === 'inactive' && m.active) return false;
      if (s) {
        const hay = `${m.name} ${m.sku ?? ''}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    const sf = this.sortField();
    const dir = this.sortDir() === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sf === 'used') return (b.usedInListings - a.usedInListings) * dir;
      return (a[sf] < b[sf] ? -1 : a[sf] > b[sf] ? 1 : 0) * dir;
    });
    return list;
  });

  ngOnInit(): void {
    this.load();
    this.loadQuestions();
  }

  ngOnDestroy(): void {}

  private loadQuestions(): void {
    this.questionsLoading.set(true);
    let myCatId = '';
    this.api.get<{ category: { id: string; name: string }; myCategoryId: string }>('/servicer/me/subcategories')
      .pipe(
        switchMap((sub) => {
          myCatId = sub.myCategoryId;
          return this.api.get<{ data: { id: string; questionSchema?: CategoryQuestion[] | null }[] }>('/categories?scope=all');
        }),
      )
      .subscribe({
        next: (r) => {
          this.questionsLoading.set(false);
          let best: CategoryQuestion[] | null = null;
          for (const cat of r.data) {
            if (!cat.questionSchema?.length) continue;
            if (cat.id === myCatId) { best = cat.questionSchema; break; }
            if (!best) best = cat.questionSchema;
          }
          if (best) this.allQuestions.set(best);
        },
        error: () => { this.questionsLoading.set(false); },
      });
  }

  private load(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.api.get<{ data: ServicerModule[] }>('/servicer/modules').subscribe({
      next: (r) => {
        this.modules.set(r.data.map((m) => ({ ...m, price: Number(m.price) })));
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.loadFailed.set(true); },
    });
  }

  toggleDir(): void { this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc'); }

  openCreate(): void {
    this.editId.set(null);
    this.f = { name: '', price: null, durationMin: null, sku: '', customVal: '' };
    this.selectedOptionKey.set('');
    this.formError.set('');
    this.modalOpen.set(true);
  }

  openEdit(m: ServicerModule): void {
    this.editId.set(m.id);
    const qKey = m.questionKey ?? '';
    const oVal = m.optionValue ?? '';
    // Check if this module's questionKey+optionValue exists in our service options
    const match = this.serviceOptions().find((o) => o.questionKey === qKey && o.optionValue === oVal);
    const key = match ? `${qKey}::${oVal}` : (qKey && oVal ? '__custom__' : '');
    this.f = {
      name: m.name,
      price: m.price,
      durationMin: m.durationMin ?? null,
      sku: m.sku ?? '',
      customVal: '',
    };
    this.selectedOptionKey.set(key);
    this.formError.set('');
    this.modalOpen.set(true);
  }

  closeModal(): void { this.modalOpen.set(false); }

  save(): void {
    const name = this.f.name.trim();
    if (!name) { this.formError.set('Name is required.'); return; }
    if (this.f.price == null || this.f.price < 0) { this.formError.set('A valid price is required.'); return; }

    const sel = this.selectedOptionKey();
    let questionKey: string | null = null;
    let optionValue: string | null = null;

    if (sel === '__custom__') {
      optionValue = this.f.customVal.trim() || null;
    } else if (sel) {
      const [k, v] = sel.split('::');
      questionKey = k || null;
      optionValue = v || null;
      const svcOpt = this.serviceOptions().find((o) => o.questionKey === k && o.optionValue === v);
      if (svcOpt?.isQuantity) optionValue = '1';
    }

    this.saving.set(true);
    this.formError.set('');
    const body: Record<string, unknown> = {
      name,
      questionKey,
      optionValue,
      price: Number(this.f.price),
      durationMin: this.f.durationMin != null ? Number(this.f.durationMin) : null,
      sku: this.f.sku.trim() || null,
    };

    const id = this.editId();
    const req$ = id
      ? this.api.patch<ServicerModule>(`/servicer/modules/${id}`, body)
      : this.api.post<ServicerModule>('/servicer/modules', body);
    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
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
    this.dialog.confirm(`Deactivate the module "${m.name}"?`, { confirmLabel: 'Deactivate' })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`/servicer/modules/${m.id}`).subscribe({
          next: () => { this.toast.success('Module deactivated.'); this.load(); },
          error: (e) => this.toast.error(e.message ?? 'Could not deactivate the module'),
        });
      });
  }
}
