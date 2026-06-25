import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { routeFor } from '../../core/route-for';
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
  options?: { value: string; label: string; active?: boolean }[];
}

interface ListingData {
  id: string;
  title: string;
  label?: string | null;
  description?: string | null;
  proposalPreset?: string | null;
  autoAccept: boolean;
  moduleRefs?: { moduleId: string }[] | null;
  basePrice: number;
  priceType: string;
  estimatedDurationMinutes: number;
  categoryId: string;
}

/**
 * SP-3 Redesign (2026-06-25): unified listing form.
 * Fields: Label (internal), Title (customer), Description (internal),
 * Proposal Preset (auto/manual), Enable Auto, Modules (min 1 from library).
 */
@Component({
  selector: 'app-listing-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page-enter wrap">
      <button class="btn-ghost back" (click)="cancel()">← Back</button>
      <h1>{{ isEdit() ? 'Edit listing' : 'New listing' }}</h1>

      @if (error()) {
        <p class="err">{{ error() }}</p>
      }

      <div class="form card">
        <!-- Label (internal) -->
        <label>
          <span>Label<span class="req"> *</span></span>
          <input type="text" [(ngModel)]="f.label" name="label" maxlength="120"
            placeholder="Internal reference, e.g. AC-Standard" (input)="error.set('')" />
          <span class="hint">Only you see this. Helps you identify this listing on your dashboard.</span>
        </label>

        <!-- Title (customer) -->
        <label>
          <span>Title<span class="req"> *</span></span>
          <input type="text" [(ngModel)]="f.title" name="title" maxlength="200"
            placeholder="e.g. Aircond Servicing — Wall Unit" (input)="error.set('')" />
          <span class="hint">Shown to customers on the proposal and browse cards.</span>
        </label>

        <!-- Description (internal) -->
        <label>
          <span>Description</span>
          <textarea [(ngModel)]="f.description" name="desc" rows="2" maxlength="300"
            placeholder="Internal notes about this listing…"></textarea>
          <span class="hint">Not shown to customers. Use for your own reference.</span>
        </label>

        <!-- Proposal Preset -->
        <label>
          <span>Proposal Preset<span class="req"> *</span></span>
          <textarea [(ngModel)]="f.proposalPreset" name="preset" rows="3" maxlength="500"
            placeholder="e.g. Thank you for your request! We'll be there on time with full equipment…"></textarea>
          <span class="hint">Auto-accept sends this message. Manual proposals can load + edit it.</span>
        </label>

        <!-- Enable Auto -->
        <label class="toggle-row">
          <span>Enable auto-accept</span>
          <input type="checkbox" [(ngModel)]="f.autoAccept" name="auto" />
        </label>
        <p class="muted small">When ON, matching quotes are auto-accepted if all gates pass (budget, availability, coverage, Q-match).</p>

        <!-- Modules -->
        <div class="sec">
          <div class="sec-head">
            <strong>Modules<span class="req"> *</span></strong>
            <span class="muted">Min 1 required</span>
          </div>

          @if (loading()) {
            <p class="muted">Loading module library…</p>
          } @else if (moduleLibrary().length === 0) {
            <p class="muted">
              No modules yet.
              <a [routerLink]="[]" (click)="goModules(); $event.preventDefault()">Create some first.</a>
            </p>
          } @else {
            <div class="mod-pick">
              @for (m of moduleLibrary(); track m.id) {
                <label class="mod-row" [class.on]="isSelected(m.id)">
                  <input type="checkbox" [checked]="isSelected(m.id)"
                    (change)="toggleModule(m.id)" [name]="'mod_'+m.id" />
                  <div class="mod-info">
                    <span class="mod-name">{{ m.name }}</span>
                    <span class="mod-detail">
                      @if (m.questionKey) {
                        <span class="mod-q">{{ m.questionKey }} → {{ m.optionValue || '—' }}</span>
                      }
                      RM {{ m.price }}
                      @if (m.durationMin) { · ~{{ m.durationMin }} min }
                      @if (m.sku) { · {{ m.sku }} }
                    </span>
                  </div>
                </label>
              }
            </div>
            <p class="muted small">{{ selectedCount() }} module{{ selectedCount() === 1 ? '' : 's' }} selected</p>
          }
        </div>

        <div class="actions">
          <button class="btn-ghost" (click)="cancel()">Cancel</button>
          <button class="btn-primary" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Saving…' : isEdit() ? 'Save changes' : 'Create listing' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .wrap { max-width: 680px; margin: 0 auto; }
    .back { margin-bottom: 0.8rem; }
    h1 { margin-bottom: 0.5rem; }
    .err { color: var(--color-danger); background: var(--color-danger-bg); border: 1px solid var(--color-danger); border-radius: var(--radius); padding: 0.5rem 0.8rem; font-size: 0.85rem; }
    .form { display: flex; flex-direction: column; gap: 1rem; padding: 1.25rem; }
    .form label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.88rem; font-weight: 500; }
    .toggle-row { flex-direction: row !important; align-items: center; gap: 0.5rem; cursor: pointer; }
    .toggle-row input { width: auto; }
    .hint { font-size: 0.76rem; color: var(--color-muted); }
    .req { color: var(--color-danger); }
    .small { font-size: 0.8rem; }
    .sec { display: flex; flex-direction: column; gap: 0.5rem; }
    .sec-head { display: flex; align-items: center; gap: 0.5rem; }
    .mod-pick { border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; }
    .mod-row { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.6rem 0.75rem; cursor: pointer; background: var(--color-bg); border-bottom: 1px solid var(--color-border); font-weight: 400; }
    .mod-row:last-child { border-bottom: none; }
    .mod-row.on { background: var(--color-primary-light); }
    .mod-row input { width: auto; margin-top: 0.15rem; flex-shrink: 0; }
    .mod-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
    .mod-name { font-size: 0.88rem; font-weight: 600; }
    .mod-detail { font-size: 0.78rem; color: var(--color-muted); display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
    .mod-q { font-family: monospace; font-size: 0.72rem; background: var(--color-border); padding: 0.05rem 0.35rem; border-radius: 3px; }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
  `],
})
export class ListingFormComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  isEdit = signal(false);
  private editId: string | null = null;
  loading = signal(true);
  saving = signal(false);
  error = signal('');

  moduleLibrary = signal<ServicerModule[]>([]);
  private selectedIds = signal<Set<string>>(new Set());
  selectedCount = signal(0);

  f = {
    label: '',
    title: '',
    description: '',
    proposalPreset: '',
    autoAccept: false,
  };

  ngOnInit(): void {
    this.editId = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(!!this.editId);

    this.api.get<{ data: ServicerModule[] }>('/servicer/modules?active=true').subscribe({
      next: (r) => {
        this.moduleLibrary.set(r.data.map((m) => ({ ...m, price: Number(m.price) })));
        if (this.editId) this.loadExisting(this.editId);
        else this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e.message ?? 'Could not load module library.');
      },
    });
  }

  private loadExisting(id: string): void {
    this.api.get<{ data: ListingData[] }>('/servicer/me/services').subscribe({
      next: (r) => {
        const s = r.data.find((x) => x.id === id);
        if (!s) { this.error.set('Listing not found.'); this.loading.set(false); return; }
        this.f = {
          label: s.label ?? '',
          title: s.title,
          description: s.description ?? '',
          proposalPreset: s.proposalPreset ?? '',
          autoAccept: s.autoAccept,
        };
        const refs = Array.isArray(s.moduleRefs) ? s.moduleRefs : [];
        const ids = new Set(refs.map((x: { moduleId: string }) => x.moduleId));
        this.selectedIds.set(ids);
        this.selectedCount.set(ids.size);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(e.message ?? 'Could not load the listing.');
      },
    });
  }

  isSelected(moduleId: string): boolean {
    return this.selectedIds().has(moduleId);
  }

  toggleModule(moduleId: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(moduleId)) next.delete(moduleId);
    else next.add(moduleId);
    this.selectedIds.set(next);
    this.selectedCount.set(next.size);
  }

  save(): void {
    if (!this.f.label.trim()) { this.error.set('Label is required.'); return; }
    if (!this.f.title.trim()) { this.error.set('Title is required.'); return; }
    if (!this.f.proposalPreset.trim()) { this.error.set('Proposal preset is required.'); return; }
    if (this.selectedCount() < 1) { this.error.set('At least 1 module is required.'); return; }

    this.error.set('');
    this.saving.set(true);

    const moduleRefs = [...this.selectedIds()].map((moduleId) => ({ moduleId }));
    // Compute base price and duration from selected modules
    const selectedModules = this.moduleLibrary().filter((m) => this.isSelected(m.id));
    const basePrice = selectedModules.reduce((sum, m) => sum + m.price, 0);
    const durationMin = selectedModules.reduce((sum, m) => sum + (m.durationMin ?? 0), 0);

    const body: Record<string, unknown> = {
      label: this.f.label.trim(),
      title: this.f.title.trim(),
      description: this.f.description.trim() || undefined,
      proposalPreset: this.f.proposalPreset.trim(),
      basePrice,
      priceType: 'fixed',
      taxMode: 'none',
      estimatedDurationMinutes: durationMin || 60,
      autoAccept: this.f.autoAccept,
      autoAcceptMessage: this.f.autoAccept ? this.f.proposalPreset.trim() : undefined,
      published: true,
      moduleRefs,
    };

    const req$ = this.editId
      ? this.api.patch(`/servicer/me/services/${this.editId}`, body)
      : this.api.post('/servicer/me/services', body);

    req$.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(this.editId ? 'Listing updated.' : 'Listing created.');
        this.router.navigate([routeFor('servicer.services.listings')]);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(e.message ?? 'Could not save the listing');
      },
    });
  }

  goModules(): void {
    this.router.navigate([routeFor('servicer.services.modules')]);
  }

  cancel(): void {
    this.router.navigate([routeFor('servicer.services.listings')]);
  }
}
