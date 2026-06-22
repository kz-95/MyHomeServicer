import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';

interface WaPresetRow {
  id: string;
  label: string;
  body: string;
  active: boolean;
}

/**
 * <app-wa-preset-manager> — servicer settings section to manage reusable WhatsApp
 * message presets. List + create + edit + soft-delete CRUD against
 * /servicer/wa-presets. Bodies may carry {name}/{orderId}/{eta} placeholders that
 * the won-job card's <app-wa-button> interpolates before opening the wa.me link.
 */
@Component({
  selector: 'app-wa-preset-manager',
  standalone: true,
  imports: [FormsModule, ListToolbarComponent],
  template: `
    <div class="head">
      <h2>WhatsApp message presets</h2>
      <button class="btn-primary" (click)="openCreate()">+ Add preset</button>
    </div>
    <p class="muted small">
      Reusable templates you can fire at a customer over WhatsApp from a won job. Use
      <code>&#123;name&#125;</code>, <code>&#123;orderId&#125;</code> and
      <code>&#123;eta&#125;</code> placeholders — they fill in automatically when you send.
    </p>

    @if (loading()) {
      <p class="muted">Loading presets…</p>
    } @else if (loadFailed()) {
      <p class="muted">Could not load your presets. Please refresh the page.</p>
    } @else if (presets().length === 0) {
      <p class="muted small">No presets yet. Add one to message customers in one tap.</p>
    } @else {
      <app-list-toolbar>
        <input
          class="search"
          type="text"
          placeholder="Search by label or text…"
          [(ngModel)]="search"
          name="wpsearch"
          toolbar-search
        />
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="filter() === 'all'" (click)="filter.set('all')">
            All <span class="n">{{ presets().length }}</span>
          </button>
          <button class="chip" [class.on]="filter() === 'active'" (click)="filter.set('active')">
            Active <span class="n">{{ activeCount() }}</span>
          </button>
          <button class="chip" [class.on]="filter() === 'inactive'" (click)="filter.set('inactive')">
            Inactive <span class="n">{{ inactiveCount() }}</span>
          </button>
        </div>
      </app-list-toolbar>

      <div class="wp-list">
        @for (p of filtered(); track p.id) {
          <div class="wp-row" [class.inactive]="!p.active">
            <div class="wp-info">
              <div class="wp-title-row">
                <strong class="wp-label">{{ p.label }}</strong>
                @if (!p.active) {
                  <span class="badge badge-manual">Inactive</span>
                }
              </div>
              <p class="wp-body">{{ p.body }}</p>
            </div>
            <div class="wp-acts">
              <button class="btn-ghost small-btn" (click)="openEdit(p)">Edit</button>
              @if (p.active) {
                <button class="btn-ghost small-btn btn-remove" (click)="remove(p)">Disable</button>
              }
            </div>
          </div>
        }
      </div>
    }

    @if (modalOpen()) {
      <div class="pg-backdrop"></div>
      <div class="pg-guard">
        <div class="pg-header">
          <h3>{{ editId() ? 'Edit preset' : 'Add preset' }}</h3>
          <button class="pg-close" (click)="closeModal()" aria-label="Close">✕</button>
        </div>
        <div class="pg-body">
          @if (formError()) {
            <p class="err">{{ formError() }}</p>
          }
          <label>
            <span>Label<span class="req"> *</span></span>
            <input
              type="text"
              [(ngModel)]="f.label"
              name="wplabel"
              maxlength="80"
              placeholder="e.g. On my way"
            />
          </label>
          <label>
            <span>Message<span class="req"> *</span></span>
            <textarea
              rows="5"
              [(ngModel)]="f.body"
              name="wpbody"
              maxlength="2000"
              placeholder="Hi {name}, I'm on my way for order {orderId}. ETA {eta}."
            ></textarea>
          </label>
          <p class="muted small">
            Placeholders: <code>&#123;name&#125;</code> <code>&#123;orderId&#125;</code>
            <code>&#123;eta&#125;</code>
          </p>
        </div>
        <div class="pg-footer">
          <button class="btn-ghost" (click)="closeModal()">Cancel</button>
          <button class="btn-primary" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Saving…' : editId() ? 'Save changes' : 'Add preset' }}
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
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .head h2 {
        margin: 0;
      }
      .small {
        font-size: 0.82rem;
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
      .wp-list {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        margin-top: 0.5rem;
      }
      .wp-row {
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.75rem 0.9rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
      }
      .wp-row.inactive {
        opacity: 0.6;
      }
      .wp-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .wp-title-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .wp-label {
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .wp-body {
        margin: 0;
        font-size: 0.85rem;
        color: var(--color-muted);
        white-space: pre-wrap;
        word-break: break-word;
      }
      .wp-acts {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        flex-shrink: 0;
      }
      .small-btn {
        font-size: 0.78rem;
        padding: 0.4rem 0.7rem;
      }
      .btn-remove:hover {
        color: var(--color-danger);
        border-color: var(--color-danger);
      }
      code {
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 4px;
        padding: 0.05rem 0.3rem;
        font-size: 0.78rem;
      }
      .pg-backdrop {
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: var(--color-backdrop);
      }
      .pg-guard {
        position: fixed;
        top: 45%;
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
      .pg-header h3 {
        margin: 0;
        font-size: 1.05rem;
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
export class WaPresetManagerComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private bodyOverflow: string | null = null;

  presets = signal<WaPresetRow[]>([]);
  loading = signal(true);
  loadFailed = signal(false);

  search = signal('');
  filter = signal<'all' | 'active' | 'inactive'>('all');

  modalOpen = signal(false);
  editId = signal<string | null>(null);
  saving = signal(false);
  formError = signal('');
  f = this.blankForm();

  activeCount = computed(() => this.presets().filter((p) => p.active).length);
  inactiveCount = computed(() => this.presets().filter((p) => !p.active).length);

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const flt = this.filter();
    return this.presets().filter((p) => {
      if (flt === 'active' && !p.active) return false;
      if (flt === 'inactive' && p.active) return false;
      if (q && !p.label.toLowerCase().includes(q) && !p.body.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  });

  private blankForm() {
    return { label: '', body: '' };
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
    this.api.get<{ data: WaPresetRow[] }>('/servicer/wa-presets').subscribe({
      next: (r) => {
        this.presets.set(r.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  openCreate(): void {
    this.editId.set(null);
    this.f = this.blankForm();
    this.formError.set('');
    this.modalOpen.set(true);
    this.lockBody();
  }

  openEdit(p: WaPresetRow): void {
    this.editId.set(p.id);
    this.f = { label: p.label, body: p.body };
    this.formError.set('');
    this.modalOpen.set(true);
    this.lockBody();
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.unlockBody();
  }

  save(): void {
    const label = this.f.label.trim();
    const body = this.f.body.trim();
    if (!label) {
      this.formError.set('Label is required.');
      return;
    }
    if (!body) {
      this.formError.set('Message text is required.');
      return;
    }
    this.saving.set(true);
    this.formError.set('');
    const payload: Record<string, unknown> = { label, body };
    const id = this.editId();
    const req = id
      ? this.api.patch<WaPresetRow>(`/servicer/wa-presets/${id}`, payload)
      : this.api.post<WaPresetRow>('/servicer/wa-presets', payload);
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.unlockBody();
        this.toast.success(id ? 'Preset updated.' : 'Preset added.');
        this.load();
      },
      error: (e) => {
        this.saving.set(false);
        this.formError.set(e.message ?? 'Could not save the preset');
      },
    });
  }

  remove(p: WaPresetRow): void {
    this.dialog
      .confirm(`Disable the preset "${p.label}"?`, { confirmLabel: 'Disable' })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`/servicer/wa-presets/${p.id}`).subscribe({
          next: () => {
            this.toast.success('Preset disabled.');
            this.load();
          },
          error: (e) => this.toast.error(e.message ?? 'Could not disable the preset'),
        });
      });
  }
}
