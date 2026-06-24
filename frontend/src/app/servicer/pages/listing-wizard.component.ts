import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { routeFor } from '../../core/route-for';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../core/services/toast.service';
import { DialogService } from '../../core/services/dialog.service';
import { TIME_SLOTS } from '../../shared/constants/time-slots';

interface OptionPriceEntry {
  price: number | null;
  notOffered: boolean;
}
type OptionPriceMap = Record<string, Record<string, OptionPriceEntry>>;
type SlotKey = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

interface PricedQuestion {
  key: string;
  label: string;
  options: { value: string; label: string }[];
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

interface Service {
  id: string;
  categoryId: string;
  category?: { id: string; name: string; parentCategoryId?: string | null };
  title: string;
  description?: string | null;
  servicerSku?: string | null;
  basePrice: number;
  priceType: string;
  taxMode: string;
  taxName?: string | null;
  taxRate?: number | null;
  estimatedDurationMinutes: number;
  autoAccept: boolean;
  modifiers?: OptionPriceMap | null;
  autoAcceptConditions?: {
    budget_min?: number; budget_max?: number; match_time_slot?: string[];
    match_property_type?: string[]; match_weekday?: string[];
  } | null;
  moduleRefs?: { moduleId: string; priceOverride?: number | null }[] | null;
  serviceChargeRate?: number | null;
  taxInclusive?: boolean | null;
  sstApplies?: boolean | null;
}

interface CategoryQuestion {
  key: string; label: string; type: string;
  required?: boolean; priced?: boolean; active?: boolean;
  options?: { value: string; label: string; active?: boolean }[];
}

interface Subcat {
  id: string; name: string;
}

type WizardStep = 1 | 2 | 3 | 4;

@Component({
  selector: 'app-listing-wizard',
  standalone: true,
  imports: [FormsModule, RouterModule, IconComponent],
  template: `
    <div class="page-enter">
      <!-- Header -->
      <div class="wiz-hd">
        <button class="btn-ghost" (click)="goBack()">← Back to listings</button>
        <h1>{{ isEdit() ? 'Edit listing' : 'New service listing' }}</h1>
        <p class="muted" style="margin-top:0.2rem">
          {{ bigCategory()?.name || '…' }}
          @if (isEdit()) { · <strong>{{ existingTitle() }}</strong> }
        </p>
      </div>

      <!-- Step indicator -->
      <div class="step-indicator">
        @for (s of steps; track s.num) {
          <div class="step-dot" [class.active]="step() >= s.num" [class.done]="step() > s.num"
               [class.clickable]="isEdit() && step() > s.num"
               (click)="goToStep(s.num)">
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
            <div class="step-card-title">Tell us about your service</div>

            <div class="row">
              <label>
                Sub-category
                <select [(ngModel)]="f.subcategorySel" name="sub">
                  <option value=""> - {{ bigCategory()?.name || 'Main category' }} - </option>
                  @for (sc of subcats(); track sc.id) {
                    <option [value]="sc.id">{{ sc.name }}</option>
                  }
                  <option value="__new__">+ Add a new sub-category…</option>
                </select>
              </label>
              @if (f.subcategorySel === '__new__') {
                <label>
                  New sub-category name
                  <input [(ngModel)]="f.newSubcategoryName" name="newsub" placeholder="e.g. Water heater repair" />
                </label>
              } @else {
                <label>
                  SKU (optional)
                  <input [(ngModel)]="f.servicerSku" name="sku" placeholder="e.g. PLUMB-001" />
                </label>
              }
            </div>

            <label>
              Title *
              <input [(ngModel)]="f.title" name="title" placeholder="e.g. Standard plumbing service" />
            </label>

            <label>
              Description
              <textarea [(ngModel)]="f.description" name="desc" rows="3" placeholder="Describe what this service includes…"></textarea>
            </label>

            <div class="row row-3">
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
              <label>
                Est. duration (min) *
                <input type="number" [(ngModel)]="f.estimatedDurationMinutes" name="dur" min="1" step="1" />
              </label>
            </div>
          </div>
        }

        <!-- ═══════ Step 2: Service options & pricing ═══════ -->
        @if (step() === 2) {
          <div class="step-card">
            <div class="step-card-title">Service options & pricing</div>
            <p class="muted small">
              Set your price for each option customers can choose. Toggle "N/A" for options you don't offer.
            </p>

            @if (pricedQuestions().length === 0) {
              <div class="empty-state">
                <app-icon name="package" sizeToken="lg" stroke="#999" />
                <p class="muted">No priced questions for this category yet.</p>
                <p class="muted small">Once the admin adds priced questions, you can set per-option prices here.</p>
              </div>
            }

            @for (q of pricedQuestions(); track q.key) {
              <div class="pq-card">
                <div class="pq-header">{{ q.label }}</div>
                @for (o of q.options; track o.value) {
                  <div class="pq-row">
                    <span class="pq-opt">{{ o.label }}</span>
                    @if (f.optionPrices[q.key][o.value].notOffered) {
                      <span class="na-badge">N/A</span>
                    } @else {
                      <label class="pq-price">
                        RM
                        <input type="number" class="pq-input" min="0" step="0.01" placeholder="0.00"
                          [ngModel]="f.optionPrices[q.key][o.value].price"
                          (ngModelChange)="setOptionPrice(q.key, o.value, $event)"
                          [name]="'op_' + q.key + '_' + o.value" />
                      </label>
                    }
                    <label class="toggle-label">
                      <input type="checkbox"
                        [ngModel]="f.optionPrices[q.key][o.value].notOffered"
                        (ngModelChange)="setOptionNotOffered(q.key, o.value, $event)"
                        [name]="'no_' + q.key + '_' + o.value" />
                      N/A
                    </label>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- ═══════ Step 3: Modules & tax ═══════ -->
        @if (step() === 3) {
          <div class="step-card">
            <div class="step-card-title">Modules & tax</div>
            <p class="muted small">Pick reusable pricing modules and set per-listing tax overrides.</p>

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
              <p class="empty-modules muted small">No pricing modules yet. Create them in your account settings.</p>
            }

            <div class="sub-head ruled">Tax & charges</div>
            <div class="row row-3">
              <label>
                Tax mode
                <select [(ngModel)]="f.taxMode" name="tm">
                  <option value="none">None</option>
                  <option value="exclusive">Exclusive</option>
                  <option value="inclusive">Inclusive</option>
                </select>
              </label>
              <label>
                Tax name
                <input [(ngModel)]="f.taxName" name="txn" placeholder="SST" [disabled]="f.taxMode === 'none'" />
              </label>
              <label>
                Tax %
                <input type="number" [(ngModel)]="f.taxRate" name="txr" [disabled]="f.taxMode === 'none'" />
              </label>
            </div>

            <div class="row row-3">
              <label>
                Service charge %
                <input type="number" [(ngModel)]="f.serviceChargeRate" name="scr" min="0" max="100" step="0.01" placeholder="Account default" />
              </label>
              <label>
                Tax-inclusive?
                <select [(ngModel)]="f.taxInclusive" name="ti">
                  <option [ngValue]="null">Account default</option>
                  <option [ngValue]="true">Inclusive</option>
                  <option [ngValue]="false">Exclusive</option>
                </select>
              </label>
              <label>
                SST applies?
                <select [(ngModel)]="f.sstApplies" name="sa">
                  <option [ngValue]="null">Account default</option>
                  <option [ngValue]="true">Yes</option>
                  <option [ngValue]="false">No</option>
                </select>
              </label>
            </div>
          </div>
        }

        <!-- ═══════ Step 4: Accept mode ═══════ -->
        @if (step() === 4) {
          <div class="step-card">
            <div class="step-card-title">Accept mode</div>
            <p class="muted small">Choose how orders are handled for this listing.</p>

            <div class="accept-cards">
              <div class="accept-card" [class.selected]="!f.autoAccept" (click)="f.autoAccept = false">
                <div class="accept-card-icon"><app-icon name="message-square" sizeToken="lg" /></div>
                <div class="accept-card-body">
                  <div class="accept-card-title">Prompt me (default)</div>
                  <div class="accept-card-desc">
                    When you're online and a matching order comes in, you'll get a real-time
                    prompt to Accept or Decline. You see the job details, customer info, budget,
                    and a map preview before deciding.
                  </div>
                </div>
                <div class="accept-card-check">
                  @if (!f.autoAccept) {
                    <span class="check-mark">✓</span>
                  }
                </div>
              </div>

              <div class="accept-card" [class.selected]="f.autoAccept" (click)="f.autoAccept = true">
                <div class="accept-card-icon"><app-icon name="zap" sizeToken="lg" /></div>
                <div class="accept-card-body">
                  <div class="accept-card-title">Instant auto-accept (no prompt)</div>
                  <div class="accept-card-desc">
                    Orders matching your conditions are automatically accepted without asking you.
                    You'll get a notification when a booking is confirmed.
                  </div>
                </div>
                <div class="accept-card-check">
                  @if (f.autoAccept) {
                    <span class="check-mark">✓</span>
                  }
                </div>
              </div>
            </div>

            @if (f.autoAccept) {
              <div class="aa-box">
                <div class="row">
                  <label>
                    Min budget (RM)
                    <input type="number" [(ngModel)]="f.budgetMin" name="bmin" />
                  </label>
                  <label>
                    Max budget (RM)
                    <input type="number" [(ngModel)]="f.budgetMax" name="bmax" />
                  </label>
                </div>
                <span class="muted small">Match time slots:</span>
                <div class="slots">
                  @for (slot of slotKeys; track slot) {
                    <label class="slot-toggle">
                      <input type="checkbox" [(ngModel)]="f.slots[slot]" [name]="'slot' + slot" />
                      <span>{{ slotLabel(slot) }}</span>
                    </label>
                  }
                </div>
              </div>
            }

            <p class="muted small hint">
              You can change this later. Auto-accept is off by default.
            </p>
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
              <button type="button" class="btn-primary" (click)="nextStep()">Next →</button>
            }
            @if (step() >= 1 && step() <= 4) {
              <button type="button" class="btn-primary" [class.btn-ghost]="step() < 4" (click)="save()" [disabled]="saving()">
                {{ saving() ? 'Saving…' : isEdit() ? 'Save changes' : 'Create listing' }}
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
    .wiz-hd { margin-bottom: 1.5rem; }
    .wiz-hd h1 { margin: 0.3rem 0 0; font-size: 1.4rem; }
    .wiz-body { min-height: 300px; }

    /* ── Step indicator ── */
    .step-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin-bottom: 2rem;
      padding: 0.5rem 0;
    }
    .step-dot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.3rem;
      min-width: 60px;
    }
    .step-dot.clickable { cursor: pointer; }
    .step-circle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--color-border);
      color: var(--color-muted);
      font-size: 0.85rem;
      font-weight: 700;
      transition: background 0.2s ease, color 0.2s ease;
    }
    .step-dot.active .step-circle { background: var(--color-primary); color: #fff; }
    .step-dot.done .step-circle { background: var(--color-primary); color: #fff; }
    .step-label {
      font-size: 0.7rem;
      color: var(--color-muted);
      text-align: center;
      max-width: 70px;
      line-height: 1.2;
    }
    .step-dot.active .step-label { color: var(--color-text); font-weight: 600; }
    .step-line {
      width: 40px; height: 2px;
      background: var(--color-border);
      margin: 0 4px;
      margin-bottom: 1.3rem;
      transition: background 0.2s ease;
    }
    .step-line.active { background: var(--color-primary); }

    /* ── Step card ── */
    .step-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .step-card-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--color-text);
    }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
    .row-3 { grid-template-columns: 1fr 1fr 1fr; }
    @media (max-width: 600px) { .row, .row-3 { grid-template-columns: 1fr; } }
    label {
      display: flex; flex-direction: column; gap: 0.3rem;
      font-size: 0.88rem; font-weight: 500; color: var(--color-text);
    }
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
      padding: 2rem; text-align: center;
    }

    /* ── Priced questions ── */
    .pq-card {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      overflow: hidden;
    }
    .pq-header {
      font-size: 0.8rem; font-weight: 600; color: var(--color-muted);
      text-transform: uppercase; letter-spacing: 0.03em;
      padding: 0.5rem 0.75rem;
      background: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
    }
    .pq-row {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-bg);
    }
    .pq-row:last-child { border-bottom: none; }
    .pq-opt { flex: 1; font-size: 0.88rem; }
    .pq-price { display: flex; flex-direction: row !important; align-items: center; gap: 0.3rem; font-size: 0.88rem; font-weight: 500; }
    .pq-input { width: 7rem; }
    .na-badge { font-size: 0.75rem; color: var(--color-muted); padding: 0.1rem 0.5rem; border: 1px dashed var(--color-border); border-radius: 4px; }
    .toggle-label { display: flex !important; flex-direction: row !important; align-items: center; gap: 0.3rem; font-size: 0.8rem; font-weight: 400; color: var(--color-muted); cursor: pointer; white-space: nowrap; }
    .toggle-label input { width: auto; }

    /* ── Module library ── */
    .sub-head { font-size: 0.9rem; font-weight: 600; color: var(--color-text); margin-top: 0.25rem; }
    .sub-head.ruled { border-top: 1px solid var(--color-border); padding-top: 1rem; }
    .mod-list { border: 1px solid var(--color-border); border-radius: var(--radius-sm); overflow: hidden; }
    .mod-row {
      display: flex; align-items: center; gap: 1rem;
      padding: 0.6rem 0.75rem;
      background: var(--color-bg);
      border-bottom: 1px solid var(--color-border);
      flex-wrap: wrap;
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

    /* ── Accept mode cards ── */
    .accept-cards { display: flex; flex-direction: column; gap: 0.75rem; }
    .accept-card {
      display: flex; align-items: flex-start; gap: 1rem;
      padding: 1rem; border: 2px solid var(--color-border);
      border-radius: var(--radius); cursor: pointer;
      transition: border-color 0.15s ease, background 0.15s ease;
      background: var(--color-bg);
    }
    .accept-card:hover { border-color: var(--color-primary); }
    .accept-card.selected { border-color: var(--color-primary); background: var(--color-primary-light); }
    .accept-card-icon {
      width: 44px; height: 44px; border-radius: 50%;
      background: var(--color-bg);
      display: flex; align-items: center; justify-content: center;
      color: var(--color-primary); flex-shrink: 0;
    }
    .accept-card-body { flex: 1; }
    .accept-card-title { font-size: 0.95rem; font-weight: 700; color: var(--color-text); margin-bottom: 0.2rem; }
    .accept-card-desc { font-size: 0.82rem; color: var(--color-muted); line-height: 1.45; }
    .accept-card-check {
      width: 24px; height: 24px; border-radius: 50%;
      border: 2px solid var(--color-border);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; margin-top: 0.15rem;
    }
    .accept-card.selected .accept-card-check { border-color: var(--color-primary); background: var(--color-primary); }
    .check-mark { color: #fff; font-size: 0.75rem; font-weight: 700; }
    .aa-box {
      border: 1px solid var(--color-border); border-radius: var(--radius);
      padding: 1rem; background: var(--color-bg);
      display: flex; flex-direction: column; gap: 0.75rem;
    }
    .slots { display: flex; gap: 1rem; flex-wrap: wrap; }
    .slot-toggle {
      display: flex !important; flex-direction: row !important;
      align-items: center; gap: 0.35rem; font-weight: 400; cursor: pointer;
    }
    .slot-toggle input { width: auto; }
    .hint { margin-top: 0.25rem; }

    /* ── Footer navigation ── */
    .wiz-footer {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: 1.5rem; padding-top: 1rem;
      border-top: 1px solid var(--color-border);
    }
    .wiz-footer-left, .wiz-footer-right { display: flex; align-items: center; gap: 0.5rem; }

    /* ── Misc ── */
    .err-banner {
      background: var(--color-danger-bg); color: var(--color-danger);
      padding: 0.6rem 1rem; border-radius: var(--radius-sm);
      font-size: 0.85rem; margin-bottom: 0.75rem;
    }
    .small { font-size: 0.8rem; }
  `],
})
export class ListingWizardComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);

  steps = [
    { num: 1 as WizardStep, label: 'Basics', last: false },
    { num: 2 as WizardStep, label: 'Options & Pricing', last: false },
    { num: 3 as WizardStep, label: 'Modules & Tax', last: false },
    { num: 4 as WizardStep, label: 'Accept Mode', last: true },
  ];

  slotKeys: SlotKey[] = ['morning', 'noon', 'afternoon', 'evening', 'night'];

  /** Slot label with its time window, e.g. "Morning (9:00–11:00)". */
  slotLabel(slot: string): string {
    return TIME_SLOTS.find((s) => s.value === slot)?.label ?? slot;
  }

  // ── Signals ──
  step = signal<WizardStep>(1);
  isEdit = signal(false);
  editId = signal<string | null>(null);
  existingTitle = signal('');
  bigCategory = signal<{ id: string; name: string } | null>(null);
  subcats = signal<Subcat[]>([]);
  pricedQuestions = signal<PricedQuestion[]>([]);
  pricingModules = signal<PricingModule[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal('');
  hasUnsavedChanges = signal(false);

  // ── Form state ──
  f = this.blankForm();

  private blankForm() {
    return {
      subcategorySel: '',
      newSubcategoryName: '',
      title: '',
      servicerSku: '',
      description: '',
      optionPrices: {} as OptionPriceMap,
      moduleRefs: [] as { moduleId: string; priceOverride: number | null }[],
      basePrice: null as number | null,
      priceType: 'fixed',
      taxMode: 'none',
      taxName: '',
      taxRate: null as number | null,
      serviceChargeRate: null as number | null,
      taxInclusive: null as boolean | null,
      sstApplies: null as boolean | null,
      estimatedDurationMinutes: 60,
      autoAccept: false,
      budgetMin: null as number | null,
      budgetMax: null as number | null,
      slots: { morning: false, noon: false, afternoon: false, evening: false, night: false } as Record<SlotKey, boolean>,
      moduleRefs_: [] as { moduleId: string; priceOverride: number | null }[],
    };
  }

  ngOnInit(): void {
    const serviceId = this.route.snapshot.paramMap.get('id');
    if (serviceId) {
      this.isEdit.set(true);
      this.editId.set(serviceId);
    }

    // Load reference data
    this.api.get<{ data: PricingModule[] }>('/servicer/pricing-modules?active=true').subscribe({
      next: (r) => this.pricingModules.set(r.data),
    });

    this.api
      .get<{ category: { id: string; name: string }; subcategories: Subcat[] }>('/servicer/me/subcategories')
      .pipe(
        switchMap((r) => {
          this.bigCategory.set(r.category);
          this.subcats.set(r.subcategories);
          return this.api.get<{ data: { id: string; name: string; questionSchema?: CategoryQuestion[] | null }[] }>('/categories');
        }),
      )
      .subscribe({
        next: (r) => {
          const catId = this.bigCategory()?.id;
          const cat = r.data.find((c) => c.id === catId);
          if (cat?.questionSchema) {
            const priced = cat.questionSchema
              .filter((q) => q.priced === true && q.active !== false && Array.isArray(q.options) && q.options!.length > 0)
              .map((q) => ({
                key: q.key,
                label: q.label,
                options: (q.options as { value: string; label: string; active?: boolean }[]).filter((o) => o.active !== false),
              }));
            this.pricedQuestions.set(priced);
          }
          this.initOptionPrices();

          // If editing, load service data
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
    this.api.get<{ data: Service[] }>('/servicer/me/services').subscribe({
      next: (r) => {
        const svc = r.data.find((s) => s.id === id);
        if (!svc) {
          this.error.set('Service not found.');
          this.loading.set(false);
          return;
        }
        this.existingTitle.set(svc.title);
        this.f = {
          ...this.f,
          subcategorySel: this.subcats().some((sc) => sc.id === svc.categoryId) ? svc.categoryId : '',
          title: svc.title,
          servicerSku: svc.servicerSku ?? '',
          description: svc.description ?? '',
          basePrice: svc.basePrice,
          priceType: svc.priceType,
          taxMode: svc.taxMode,
          taxName: svc.taxName ?? '',
          taxRate: svc.taxRate ?? null,
          estimatedDurationMinutes: svc.estimatedDurationMinutes,
          autoAccept: svc.autoAccept,
          moduleRefs: Array.isArray(svc.moduleRefs)
            ? svc.moduleRefs.map((m) => ({ moduleId: m.moduleId, priceOverride: m.priceOverride ?? null }))
            : [],
          serviceChargeRate: svc.serviceChargeRate ?? null,
          taxInclusive: svc.taxInclusive ?? null,
          sstApplies: svc.sstApplies ?? null,
        };
        const cond = svc.autoAcceptConditions ?? {};
        this.f.budgetMin = cond.budget_min ?? null;
        this.f.budgetMax = cond.budget_max ?? null;
        for (const k of cond.match_time_slot ?? []) {
          if (k in this.f.slots) this.f.slots[k as SlotKey] = true;
        }
        this.initOptionPrices();
        if (svc.modifiers) {
          this.f.optionPrices = this.mergeOptionPrices(this.f.optionPrices, svc.modifiers as OptionPriceMap);
        }
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Failed to load the service.');
        this.loading.set(false);
      },
    });
  }

  private initOptionPrices(): void {
    const map: OptionPriceMap = {};
    for (const q of this.pricedQuestions()) {
      map[q.key] = {};
      for (const o of q.options) {
        map[q.key][o.value] = { price: null, notOffered: false };
      }
    }
    this.f.optionPrices = map;
  }

  private mergeOptionPrices(base: OptionPriceMap, override: OptionPriceMap): OptionPriceMap {
    const result: OptionPriceMap = {};
    const allKeys = new Set([...Object.keys(base), ...Object.keys(override)]);
    for (const qKey of allKeys) {
      result[qKey] = {};
      const allOpts = new Set([...Object.keys(base[qKey] ?? {}), ...Object.keys(override[qKey] ?? {})]);
      for (const optVal of allOpts) {
        result[qKey][optVal] = {
          ...(base[qKey]?.[optVal] ?? { price: null, notOffered: false }),
          ...(override[qKey]?.[optVal] ?? {}),
        };
      }
    }
    return result;
  }

  // ── Option price helpers ──
  setOptionPrice(questionKey: string, optionValue: string, price: number | null): void {
    const map = { ...this.f.optionPrices };
    map[questionKey] = { ...(map[questionKey] ?? {}) };
    map[questionKey][optionValue] = {
      ...(map[questionKey][optionValue] ?? { notOffered: false }),
      price: price != null ? Number(price) : null,
    };
    this.f = { ...this.f, optionPrices: map };
    this.hasUnsavedChanges.set(true);
  }

  setOptionNotOffered(questionKey: string, optionValue: string, notOffered: boolean): void {
    const map = { ...this.f.optionPrices };
    map[questionKey] = { ...(map[questionKey] ?? {}) };
    map[questionKey][optionValue] = {
      ...(map[questionKey][optionValue] ?? { price: null }),
      notOffered,
    };
    this.f = { ...this.f, optionPrices: map };
    this.hasUnsavedChanges.set(true);
  }

  // ── Module helpers ──
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

  // ── Navigation ──
  goToStep(num: number): void {
    if (!this.isEdit()) return;
    if (num >= 1 && num <= 4 && num < this.step()) {
      this.error.set('');
      this.step.set(num as WizardStep);
    }
  }

  nextStep(): void {
    if (this.step() === 1) {
      if (!this.f.title.trim() || this.f.basePrice == null) {
        this.error.set('Title and base price are required.');
        return;
      }
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

  // ── Save ──
  save(): void {
    if (!this.f.title.trim() || this.f.basePrice == null) {
      this.error.set('Title and base price are required.');
      this.step.set(1);
      return;
    }
    if (this.f.subcategorySel === '__new__' && !this.f.newSubcategoryName.trim()) {
      this.error.set('Enter a name for the new sub-category.');
      this.step.set(1);
      return;
    }

    this.saving.set(true);
    this.error.set('');

    const modifiers: OptionPriceMap = {};
    for (const [qKey, optMap] of Object.entries(this.f.optionPrices)) {
      modifiers[qKey] = {};
      for (const [optVal, entry] of Object.entries(optMap)) {
        modifiers[qKey][optVal] = {
          price: entry.notOffered ? null : entry.price != null ? Number(entry.price) : null,
          notOffered: entry.notOffered,
        };
      }
    }

    const body: Record<string, unknown> = {
      title: this.f.title.trim(),
      description: this.f.description || undefined,
      servicerSku: this.f.servicerSku?.trim() || undefined,
      basePrice: this.f.basePrice,
      priceType: this.f.priceType,
      taxMode: this.f.taxMode,
      taxName: this.f.taxMode === 'none' ? undefined : this.f.taxName || undefined,
      taxRate: this.f.taxMode === 'none' ? undefined : this.f.taxRate ?? undefined,
      estimatedDurationMinutes: this.f.estimatedDurationMinutes,
      autoAccept: this.f.autoAccept,
      modifiers,
    };
    if (this.f.moduleRefs.length > 0) body['moduleRefs'] = this.f.moduleRefs;
    if (this.f.serviceChargeRate != null) body['serviceChargeRate'] = this.f.serviceChargeRate;
    if (this.f.taxInclusive != null) body['taxInclusive'] = this.f.taxInclusive;
    if (this.f.sstApplies != null) body['sstApplies'] = this.f.sstApplies;
    if (this.f.subcategorySel === '__new__') {
      body['newSubcategoryName'] = this.f.newSubcategoryName.trim();
    } else if (this.f.subcategorySel) {
      body['subcategoryId'] = this.f.subcategorySel;
    }

    const editId = this.editId();
    const req = editId
      ? this.api.patch<Service>(`/servicer/me/services/${editId}`, body)
      : this.api.post<Service>('/servicer/me/services', body);

    req.subscribe({
      next: (svc) => this.saveAutoAccept(svc.id, editId != null),
      error: (e) => {
        this.saving.set(false);
        this.error.set(e.message ?? 'Could not save the listing');
      },
    });
  }

  private saveAutoAccept(serviceId: string, wasEdit: boolean): void {
    const body: Record<string, unknown> = { autoAccept: this.f.autoAccept };
    if (this.f.autoAccept) {
      const slots = this.slotKeys.filter((k) => this.f.slots[k]);
      body['autoAcceptConditions'] = {
        ...(this.f.budgetMin != null ? { budget_min: this.f.budgetMin } : {}),
        ...(this.f.budgetMax != null ? { budget_max: this.f.budgetMax } : {}),
        ...(slots.length ? { match_time_slot: slots } : {}),
      };
    }
    this.api.patch(`/servicer/me/services/${serviceId}/auto-accept`, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.hasUnsavedChanges.set(false);
        this.toast.success(wasEdit ? 'Listing updated.' : 'Listing created.');
        this.router.navigate([routeFor('servicer.services')]);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(e.message ?? 'Listing saved, but auto-accept rules failed');
      },
    });
  }
}
