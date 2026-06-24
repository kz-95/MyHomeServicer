import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { routeFor } from '../../core/route-for';
import { ToastService } from '../../core/services/toast.service';
import { DialogService } from '../../core/services/dialog.service';

interface Category {
  id: string;
  name: string;
  parentCategoryId?: string | null;
}

interface PricingModule {
  id: string;
  label: string;
  defaultPrice: number;
  taxable: boolean;
  serviceChargeable: boolean;
  categoryId?: string | null;
  active: boolean;
}

interface ModuleRef {
  moduleId: string;
  priceOverride?: number | null;
}

interface ServiceData {
  id: string;
  categoryId: string;
  category?: { id: string; name: string; parentCategoryId?: string | null };
  title: string;
  description?: string | null;
  basePrice: number;
  priceType: string;
  autoAccept: boolean;
  autoAcceptMessage?: string | null;
  autoAcceptConditions?: Record<string, unknown> | null;
  moduleRefs?: ModuleRef[] | null;
  serviceChargeRate?: number | null;
  taxInclusive?: boolean | null;
  sstApplies?: boolean | null;
}

type WizardStep = 1 | 2 | 3 | 4;

@Component({
  selector: 'app-service-wizard',
  standalone: true,
  imports: [FormsModule, RouterModule],
  template: `
    <div class="page-enter">
      <div class="wiz-hd">
        <button class="btn-ghost" (click)="goBack()">← Back to listings</button>
        <h1>{{ isEdit() ? 'Edit service' : 'New service listing' }}</h1>
        <p class="muted" style="margin-top:0.2rem">
          {{ bigCategoryName() || '…' }}
          @if (isEdit()) { · <strong>{{ existingTitle() }}</strong> }
        </p>
      </div>

      <!-- Step indicator -->
      <div class="step-bar">
        @for (s of steps; track s.num) {
          <div class="step-dot" [class.active]="step() >= s.num" [class.done]="step() > s.num">
            <span class="step-circle">{{ step() > s.num ? '✓' : s.num }}</span>
            <span class="step-label">{{ s.label }}</span>
          </div>
          @if (!s.last) {
            <div class="step-line" [class.active]="step() > s.num"></div>
          }
        }
      </div>

      <div class="wiz-body">
        @if (error()) {
          <p class="err-banner">{{ error() }}</p>
        }

        <!-- ═══════ Step 1: Basics ═══════ -->
        @if (step() === 1) {
          <div class="step-card">
            <div class="step-card-title">Basic information</div>

            <label>
              Category
              <select [(ngModel)]="f.categoryId" name="cat">
                <option value="">Select a category…</option>
                @if (bigCategory()) {
                  <option [value]="bigCategory()!.id">{{ bigCategory()!.name }} (main)</option>
                }
                @for (sc of subcats(); track sc.id) {
                  <option [value]="sc.id">{{ sc.name }}</option>
                }
              </select>
            </label>

            <label>
              Name *
              <input [(ngModel)]="f.title" name="title" placeholder="e.g. Standard plumbing service" />
            </label>

            <label>
              Description
              <textarea [(ngModel)]="f.description" name="desc" rows="3" placeholder="Describe what this service includes…"></textarea>
            </label>

            <div class="row row-2">
              <label>
                Base price (RM) *
                <input type="number" [(ngModel)]="f.basePrice" name="price" min="0" step="0.01" placeholder="0.00" />
              </label>
              <label>
                Price type
                <select [(ngModel)]="f.priceType" name="pt">
                  <option value="fixed">Fixed</option>
                  <option value="hourly">Hourly</option>
                  <option value="quote">Quote</option>
                </select>
              </label>
            </div>
          </div>
        }

        <!-- ═══════ Step 2: Pricing & Modules ═══════ -->
        @if (step() === 2) {
          <div class="step-card">
            <div class="step-card-title">Pricing & modules</div>
            <p class="muted small">Attach reusable pricing modules and set per-module price overrides.</p>

            <div class="sub-head">Module library</div>
            @if (pricingModules().length > 0) {
              <div class="mod-list">
                @for (mod of pricingModules(); track mod.id) {
                  <div class="mod-row" [class.selected]="isModuleSelected(mod.id)">
                    <label class="mod-check">
                      <input type="checkbox" [checked]="isModuleSelected(mod.id)"
                        (change)="toggleModule(mod, $any($event.target).checked)"
                        [name]="'mod_' + mod.id" />
                      <span class="mod-name">{{ mod.label }}</span>
                      <span class="mod-price">RM {{ mod.defaultPrice }}</span>
                      @if (!mod.taxable) { <span class="mod-flag">no SST</span> }
                      @if (!mod.serviceChargeable) { <span class="mod-flag">no SC</span> }
                    </label>
                    @if (isModuleSelected(mod.id)) {
                      <label class="mod-override">
                        Override: RM
                        <input type="number" class="mod-ov-input" min="0" step="0.01"
                          [placeholder]="mod.defaultPrice.toString()"
                          [ngModel]="getModuleOverride(mod.id)"
                          (ngModelChange)="setModuleOverride(mod.id, $event)"
                          [name]="'modprice_' + mod.id" />
                      </label>
                    }
                  </div>
                }
              </div>
            } @else {
              <p class="empty-modules muted small">No pricing modules yet. Create them in the Modules tab.</p>
            }

            <div class="sub-head ruled">Service charge</div>
            <label>
              Service charge rate (%)
              <input type="number" [(ngModel)]="f.serviceChargeRate" name="scr" min="0" max="100" step="0.01" placeholder="Account default" />
            </label>
          </div>
        }

        <!-- ═══════ Step 3: Tax & Config ═══════ -->
        @if (step() === 3) {
          <div class="step-card">
            <div class="step-card-title">Tax & configuration</div>
            <p class="muted small">Override per-listing tax behavior for this service.</p>

            <div class="row row-2">
              <label>
                Tax inclusive
                <select [(ngModel)]="f.taxInclusive" name="ti">
                  <option [ngValue]="null">Account default</option>
                  <option [ngValue]="true">Inclusive</option>
                  <option [ngValue]="false">Exclusive</option>
                </select>
              </label>
              <label>
                SST applies
                <select [(ngModel)]="f.sstApplies" name="sa">
                  <option [ngValue]="null">Account default</option>
                  <option [ngValue]="true">Yes</option>
                  <option [ngValue]="false">No</option>
                </select>
              </label>
            </div>
          </div>
        }

        <!-- ═══════ Step 4: Accept Mode ═══════ -->
        @if (step() === 4) {
          <div class="step-card">
            <div class="step-card-title">Accept mode</div>
            <p class="muted small">Configure how orders are handled for this service.</p>

            <label class="toggle-row">
              <span>Auto-accept orders</span>
              <input type="checkbox" [(ngModel)]="f.autoAccept" name="aa" />
            </label>

            @if (f.autoAccept) {
              <label>
                Auto-accept message
                <input [(ngModel)]="f.autoAcceptMessage" name="aam" placeholder="e.g. Thank you! We'll be there shortly." maxlength="200" />
              </label>

              <label>
                Auto-accept conditions (JSON)
                <textarea [(ngModel)]="f.autoAcceptConditionsJson" name="aac" rows="4"
                  placeholder='{"budget_min": 0, "budget_max": 500, "match_time_slot": ["morning", "afternoon"]}'></textarea>
              </label>
              <p class="muted small">Leave empty for no conditions. Valid keys: budget_min, budget_max, match_time_slot.</p>
            }
          </div>
        }

        <!-- Navigation footer -->
        <div class="wiz-footer">
          <div class="wiz-footer-left">
            @if (step() > 1) {
              <button type="button" class="btn-ghost" (click)="prevStep()">← Back</button>
            } @else {
              <button type="button" class="btn-ghost" (click)="goBack()">Cancel</button>
            }
          </div>
          <div class="wiz-footer-right">
            @if (saving()) {
              <p class="muted">Saving…</p>
            }
            @if (step() < 4) {
              <button type="button" class="btn-primary" (click)="nextStep()" [disabled]="saving()">
                {{ saving() ? 'Saving…' : 'Next →' }}
              </button>
            }
            @if (step() === 4) {
              <button type="button" class="btn-primary" (click)="save()" [disabled]="saving()">
                {{ saving() ? 'Saving…' : isEdit() ? 'Save changes' : 'Create & finish' }}
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; max-width: 800px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
    .wiz-hd { margin-bottom: 1.5rem; }
    .wiz-hd h1 { margin: 0.3rem 0 0; font-size: 1.4rem; }
    .wiz-body { min-height: 300px; }

    .step-bar {
      display: flex; align-items: center; justify-content: center;
      gap: 0; margin-bottom: 2rem; padding: 0.5rem 0;
    }
    .step-dot {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.3rem; min-width: 55px;
    }
    .step-circle {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 50%;
      background: var(--color-border); color: var(--color-muted);
      font-size: 0.8rem; font-weight: 700;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .step-dot.active .step-circle { background: var(--color-primary); color: #fff; }
    .step-dot.done .step-circle { background: var(--color-primary); color: #fff; }
    .step-label {
      font-size: 0.68rem; color: var(--color-muted);
      text-align: center; max-width: 70px; line-height: 1.2;
    }
    .step-dot.active .step-label { color: var(--color-text); font-weight: 600; }
    .step-line {
      width: 36px; height: 2px; background: var(--color-border);
      margin: 0 4px; margin-bottom: 1.2rem;
      transition: background 0.2s ease;
    }
    .step-line.active { background: var(--color-primary); }

    .step-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius); padding: 1.5rem;
      display: flex; flex-direction: column; gap: 1rem;
    }
    .step-card-title { font-size: 1.05rem; font-weight: 700; color: var(--color-text); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .row-2 { grid-template-columns: 1fr 1fr; }
    @media (max-width: 600px) { .row, .row-2 { grid-template-columns: 1fr; } }
    label {
      display: flex; flex-direction: column; gap: 0.3rem;
      font-size: 0.88rem; font-weight: 500; color: var(--color-text);
    }
    .toggle-row {
      display: flex !important; flex-direction: row !important;
      align-items: center; justify-content: space-between;
      gap: 0.5rem; cursor: pointer;
    }
    .toggle-row input { width: auto; }

    .sub-head { font-size: 0.9rem; font-weight: 600; color: var(--color-text); margin-top: 0.25rem; }
    .sub-head.ruled { border-top: 1px solid var(--color-border); padding-top: 1rem; }
    .mod-list { border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; }
    .mod-row {
      display: flex; align-items: center; gap: 1rem;
      padding: 0.6rem 0.75rem; background: var(--color-bg);
      border-bottom: 1px solid var(--color-border); flex-wrap: wrap;
    }
    .mod-row:last-child { border-bottom: none; }
    .mod-row.selected { background: var(--color-primary-light); }
    .mod-check {
      display: flex !important; flex-direction: row !important;
      align-items: center; gap: 0.45rem; cursor: pointer; font-weight: 400;
      flex: 1; min-width: 0;
    }
    .mod-check input { width: auto; flex-shrink: 0; }
    .mod-name { font-size: 0.88rem; font-weight: 500; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .mod-price { font-size: 0.8rem; color: var(--color-muted); white-space: nowrap; }
    .mod-flag { font-size: 0.7rem; color: var(--color-muted); border: 1px dashed var(--color-border); border-radius: 4px; padding: 0.05rem 0.35rem; white-space: nowrap; flex-shrink: 0; }
    .mod-override {
      display: flex !important; flex-direction: row !important;
      align-items: center; gap: 0.35rem;
      font-size: 0.8rem; font-weight: 500; color: var(--color-muted); white-space: nowrap;
    }
    .mod-ov-input { width: 6rem; }
    .empty-modules { padding: 0.75rem; border: 1px dashed var(--color-border); border-radius: var(--radius-sm); text-align: center; }

    .wiz-footer {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 1.5rem; padding-top: 1rem;
      border-top: 1px solid var(--color-border);
    }
    .wiz-footer-left, .wiz-footer-right { display: flex; align-items: center; gap: 0.5rem; }

    .err-banner {
      background: var(--color-danger-bg); color: var(--color-danger);
      padding: 0.6rem 1rem; border-radius: var(--radius-sm);
      font-size: 0.85rem; margin-bottom: 0.75rem;
    }
    .small { font-size: 0.8rem; }
  `],
})
export class ServiceWizardComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  steps = [
    { num: 1 as WizardStep, label: 'Basics', last: false },
    { num: 2 as WizardStep, label: 'Pricing & Modules', last: false },
    { num: 3 as WizardStep, label: 'Tax & Config', last: false },
    { num: 4 as WizardStep, label: 'Accept Mode', last: true },
  ];

  step = signal<WizardStep>(1);
  isEdit = signal(false);
  editId = signal<string | null>(null);
  existingTitle = signal('');
  bigCategory = signal<Category | null>(null);
  bigCategoryName = signal('');
  subcats = signal<Category[]>([]);
  pricingModules = signal<PricingModule[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  hasUnsavedChanges = signal(false);

  f: {
    categoryId: string;
    title: string;
    description: string;
    basePrice: number | null;
    priceType: string;
    moduleRefs: ModuleRef[];
    serviceChargeRate: number | null;
    taxInclusive: boolean | null;
    sstApplies: boolean | null;
    autoAccept: boolean;
    autoAcceptMessage: string;
    autoAcceptConditionsJson: string;
  } = this.blankForm();

  private blankForm() {
    return {
      categoryId: '',
      title: '',
      description: '',
      basePrice: null as number | null,
      priceType: 'fixed',
      moduleRefs: [] as ModuleRef[],
      serviceChargeRate: null as number | null,
      taxInclusive: null as boolean | null,
      sstApplies: null as boolean | null,
      autoAccept: false,
      autoAcceptMessage: '',
      autoAcceptConditionsJson: '',
    };
  }

  ngOnInit(): void {
    const serviceId = this.route.snapshot.paramMap.get('id');
    if (serviceId) {
      this.isEdit.set(true);
      this.editId.set(serviceId);
    }

    this.api.get<{ data: PricingModule[] }>('/servicer/pricing-modules?active=true').subscribe({
      next: (r) => this.pricingModules.set(r.data),
    });

    this.api.get<{ category: { id: string; name: string }; subcategories: Category[] }>('/servicer/me/subcategories').subscribe({
      next: (r) => {
        this.bigCategory.set({ id: r.category.id, name: r.category.name });
        this.bigCategoryName.set(r.category.name);
        this.subcats.set(r.subcategories);

        if (serviceId) {
          this.loadService(serviceId);
        } else {
          this.loading.set(false);
        }
      },
      error: () => {
        this.loading.set(false);
        this.error.set('Failed to load category data.');
      },
    });
  }

  private loadService(id: string): void {
    this.api.get<{ data: ServiceData[] }>('/servicer/me/services').subscribe({
      next: (r) => {
        const svc = r.data.find((s) => s.id === id);
        if (!svc) {
          this.error.set('Service not found.');
          this.loading.set(false);
          return;
        }
        this.existingTitle.set(svc.title);
        const moduleRefs = Array.isArray(svc.moduleRefs)
          ? svc.moduleRefs.map((m: ModuleRef) => ({ moduleId: m.moduleId, priceOverride: m.priceOverride ?? null }))
          : [];
        this.f = {
          categoryId: svc.categoryId || '',
          title: svc.title,
          description: svc.description ?? '',
          basePrice: Number(svc.basePrice),
          priceType: svc.priceType,
          moduleRefs,
          serviceChargeRate: svc.serviceChargeRate != null ? Number(svc.serviceChargeRate) : null,
          taxInclusive: svc.taxInclusive ?? null,
          sstApplies: svc.sstApplies ?? null,
          autoAccept: svc.autoAccept,
          autoAcceptMessage: svc.autoAcceptMessage ?? '',
          autoAcceptConditionsJson: svc.autoAcceptConditions
            ? JSON.stringify(svc.autoAcceptConditions, null, 2)
            : '',
        };
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load the service.');
        this.loading.set(false);
      },
    });
  }

  isModuleSelected(moduleId: string): boolean {
    return this.f.moduleRefs.some((r) => r.moduleId === moduleId);
  }

  toggleModule(mod: PricingModule, checked: boolean): void {
    let refs = [...this.f.moduleRefs];
    if (checked) {
      if (!refs.some((r) => r.moduleId === mod.id)) {
        refs = [...refs, { moduleId: mod.id, priceOverride: null }];
      }
    } else {
      refs = refs.filter((r) => r.moduleId !== mod.id);
    }
    this.f = { ...this.f, moduleRefs: refs };
    this.hasUnsavedChanges.set(true);
  }

  getModuleOverride(moduleId: string): number | null {
    return this.f.moduleRefs.find((r) => r.moduleId === moduleId)?.priceOverride ?? null;
  }

  setModuleOverride(moduleId: string, price: number | null): void {
    const refs = this.f.moduleRefs.map((r) =>
      r.moduleId === moduleId ? { ...r, priceOverride: price != null ? Number(price) : null } : r,
    );
    this.f = { ...this.f, moduleRefs: refs };
    this.hasUnsavedChanges.set(true);
  }

  nextStep(): void {
    if (this.step() === 1) {
      if (!this.f.title.trim()) { this.error.set('Name is required.'); return; }
      if (this.f.basePrice == null) { this.error.set('Base price is required.'); return; }
      if (!this.f.categoryId) { this.error.set('Category is required.'); return; }
      this.saveStep1();
      return;
    }
    if (this.step() === 2) {
      this.saveStep2();
      return;
    }
    if (this.step() === 3) {
      this.saveStep3();
      return;
    }
    this.error.set('');
    if (this.step() < 4) {
      this.step.update((s) => (s + 1) as WizardStep);
    }
  }

  prevStep(): void {
    this.error.set('');
    if (this.step() > 1) {
      this.step.update((s) => (s - 1) as WizardStep);
    }
  }

  goBack(): void {
    if (this.hasUnsavedChanges()) {
      this.dialog.confirm('Discard unsaved changes?', { confirmLabel: 'Discard' }).subscribe((ok) => {
        if (ok) this.router.navigate([routeFor('servicer.services')]);
      });
    } else {
      this.router.navigate([routeFor('servicer.services')]);
    }
  }

  private saveStep1(): void {
    this.saving.set(true);
    this.error.set('');

    const body: Record<string, unknown> = {
      title: this.f.title.trim(),
      description: this.f.description || undefined,
      basePrice: this.f.basePrice,
      priceType: this.f.priceType,
      taxMode: 'none',
      estimatedDurationMinutes: 60,
      subcategoryId: this.f.categoryId ? this.f.categoryId : undefined,
    };

    if (this.isEdit()) {
      this.api.patch(`/servicer/me/services/${this.editId()}`, body).subscribe({
        next: () => { this.saving.set(false); this.step.set(2); },
        error: (e) => { this.saving.set(false); this.error.set(e.message ?? 'Failed to update service'); },
      });
    } else {
      this.api.post<{ id: string }>('/servicer/me/services', body).subscribe({
        next: (r) => {
          this.editId.set(r.id);
          this.isEdit.set(true);
          this.hasUnsavedChanges.set(true);
          this.saving.set(false);
          this.step.set(2);
        },
        error: (e) => { this.saving.set(false); this.error.set(e.message ?? 'Failed to create service'); },
      });
    }
  }

  private saveStep2(): void {
    this.saving.set(true);
    this.error.set('');

    const body: Record<string, unknown> = {};
    body['moduleRefs'] = this.f.moduleRefs.length > 0 ? this.f.moduleRefs : [];
    if (this.f.serviceChargeRate != null) body['serviceChargeRate'] = this.f.serviceChargeRate;

    this.api.patch(`/servicer/me/services/${this.editId()}`, body).subscribe({
      next: () => { this.saving.set(false); this.step.set(3); },
      error: (e) => { this.saving.set(false); this.error.set(e.message ?? 'Failed to update modules'); },
    });
  }

  private saveStep3(): void {
    this.saving.set(true);
    this.error.set('');

    const body: Record<string, unknown> = {};
    if (this.f.taxInclusive != null) body['taxInclusive'] = this.f.taxInclusive;
    if (this.f.sstApplies != null) body['sstApplies'] = this.f.sstApplies;

    this.api.patch(`/servicer/me/services/${this.editId()}`, body).subscribe({
      next: () => { this.saving.set(false); this.step.set(4); },
      error: (e) => { this.saving.set(false); this.error.set(e.message ?? 'Failed to update tax config'); },
    });
  }

  save(): void {
    this.saving.set(true);
    this.error.set('');

    const body: Record<string, unknown> = {
      autoAccept: this.f.autoAccept,
    };
    if (this.f.autoAccept) {
      body['autoAcceptMessage'] = this.f.autoAcceptMessage || undefined;
      if (this.f.autoAcceptConditionsJson.trim()) {
        try {
          body['autoAcceptConditions'] = JSON.parse(this.f.autoAcceptConditionsJson);
        } catch {
          this.saving.set(false);
          this.error.set('Auto-accept conditions must be valid JSON.');
          return;
        }
      }
    }

    this.api.patch(`/servicer/me/services/${this.editId()}/auto-accept`, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.hasUnsavedChanges.set(false);
        this.toast.success(this.isEdit() ? 'Service updated.' : 'Service created.');
        this.router.navigate([routeFor('servicer.services')]);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(e.message ?? 'Failed to save accept mode');
      },
    });
  }
}
