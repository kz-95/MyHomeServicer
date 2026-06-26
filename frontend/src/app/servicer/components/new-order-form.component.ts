import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ModalComponent } from '../../shared/modal.component';
import { PhoneInputComponent } from '../../shared/phone-input.component';

/* ── Types ─────────────────────────────────────────────────────────── */

interface Category {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null;
  children?: Category[];
}

interface CategoryQuestion {
  key: string;
  label: string;
  type: string;          // 'radio' | 'checkbox' | 'text' | 'number' | 'quantity'
  options?: { value: string; label: string; active?: boolean }[];
  priced?: boolean;
}

interface ServicerPrice {
  questionKey: string;
  optionValue: string;
  price: number;
}

interface NewOrderPayload {
  mode: 'direct' | 'broadcast';
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  address: string;
  postcode?: string;
  district?: string;
  state?: string;
  propertyType?: string;
  categorySlug: string;
  serviceDetails?: Record<string, any>;
  preferredDate: string;
  timeSlot: string;
  notes?: string;
  price?: number;
}

interface NewOrderResponse {
  bookingId?: string;
  quoteId: string;
  customerId: string;
  broadcastCount?: number;
}

const PROPERTY_TYPES = ['condo', 'landed', 'apartment', 'office', 'shop'];

const TIME_SLOTS = [
  { value: 'morning', label: 'Morning (8am - 12pm)' },
  { value: 'noon', label: 'Noon (12pm - 2pm)' },
  { value: 'afternoon', label: 'Afternoon (2pm - 5pm)' },
  { value: 'evening', label: 'Evening (5pm - 8pm)' },
  { value: 'night', label: 'Night (8pm - 12am)' },
];

const STEPS = ['Category', 'Details', 'Customer', 'Schedule', 'Submit'] as const;

/**
 * "+ New order" wizard form opened via `<app-modal>`.
 *
 * Matches backend `POST /api/v1/servicer/new-order` contract.
 * Uses the shared `<app-modal>` (native top-layer `<dialog>`) per the
 * overlays law (STYLE-RULES §7.0, modal-audit.md).
 */
@Component({
  selector: 'app-new-order-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, PhoneInputComponent],
  template: `
    <app-modal
      [open]="open"
      [title]="'New order – Step ' + (step() + 1) + ' of ' + STEPS.length + ': ' + STEPS[step()]"
      [wide]="step() === 2"
      (closed)="close()"
    >
      <!-- ── Step indicator ────────────────────────────────────────── -->
      <div class="steps">
        @for (s of STEPS; track s; let i = $index) {
          <button
            class="step-dot"
            [class.done]="i < step()"
            [class.active]="i === step()"
            [attr.aria-label]="s"
            (click)="i < step() ? goToStep(i) : null"
          >
            @if (i < step()) { ✓ } @else { {{ i + 1 }} }
          </button>
          @if (i < STEPS.length - 1) { <span class="step-line"></span> }
        }
      </div>

      <!-- ── Step 1: Category ──────────────────────────────────────── -->
      @if (step() === 0) {
        <div class="step-body">
          @if (categoriesLoading()) {
            <p class="muted">Loading categories…</p>
          } @else if (categoriesError()) {
            <p class="err">{{ categoriesError() }}</p>
          } @else {
            <label>
              <span>Category <span class="req">*</span></span>
              <input
                type="text"
                class="cat-search"
                placeholder="Search categories…"
                [(ngModel)]="catSearch"
                name="catSearch"
              />
            </label>

            <div class="cat-grid">
              @for (c of filteredCategories(); track c.id) {
                <button
                  class="cat-tile"
                  [class.sel]="selectedCategory()?.id === c.id"
                  (click)="selectCategory(c)"
                >
                  <strong>{{ c.name }}</strong>
                  @if (c.children?.length) {
                    <span class="muted small">+{{ c.children!.length }} sub-categories</span>
                  }
                </button>
              } @empty {
                <p class="muted">No categories match "{{ catSearch() }}".</p>
              }
            </div>

            <!-- Sub-categories -->
            @if (selectedCategory()?.children?.length) {
              <label>
                <span>Sub-category <span class="req">*</span></span>
                <select [(ngModel)]="selectedSubcategorySlug" name="subcategory">
                  <option value="" disabled>Select a sub-category</option>
                  @for (sc of selectedCategory()!.children!; track sc.id) {
                    <option [value]="sc.slug">{{ sc.name }}</option>
                  }
                </select>
              </label>
            }
          }
        </div>
      }

      <!-- ── Step 2: Service Details ───────────────────────────────── -->
      @if (step() === 1) {
        <div class="step-body">
          @if (questionsLoading()) {
            <p class="muted">Loading service details…</p>
          } @else if (questionsError()) {
            <p class="err">{{ questionsError() }}</p>
          } @else if (questions().length === 0) {
            <p class="muted">No service questions defined for this category.</p>
          } @else {
            @for (q of questions(); track q.key) {
              <fieldset>
                <legend>
                  {{ q.label }}
                  @if (q.options?.some(o => o.active !== false)) { <span class="req">*</span> }
                </legend>

                @if (q.type === 'radio') {
                  <div class="radio-group">
                    @for (o of q.options ?? []; track o.value) {
                      @if (o.active !== false) {
                        <label class="radio-label">
                          <input
                            type="radio"
                            [name]="q.key"
                            [value]="o.value"
                            [(ngModel)]="serviceDetails[q.key]"
                          />
                          <span>{{ o.label }}</span>
                          @if (q.priced) {
                            <span class="price-tip">RM {{ getOptionPrice(q.key, o.value) | number: '1.2-2' }}</span>
                          }
                        </label>
                      }
                    }
                  </div>
                } @else if (q.type === 'checkbox') {
                  <div class="radio-group">
                    @for (o of q.options ?? []; track o.value) {
                      @if (o.active !== false) {
                        <label class="checkbox-row chk-row">
                          <input
                            type="checkbox"
                            [value]="o.value"
                            [checked]="checkboxValue(q.key, o.value)"
                            (change)="toggleCheckbox(q.key, o.value, $event)"
                          />
                          <span>{{ o.label }}</span>
                          @if (q.priced) {
                            <span class="price-tip">RM {{ getOptionPrice(q.key, o.value) | number: '1.2-2' }}</span>
                          }
                        </label>
                      }
                    }
                  </div>
                } @else if (q.type === 'text') {
                  <input type="text" [(ngModel)]="serviceDetails[q.key]" [name]="q.key" />
                } @else if (q.type === 'number' || q.type === 'quantity') {
                  <input type="number" [(ngModel)]="serviceDetails[q.key]" [name]="q.key" min="0" />
                }
              </fieldset>
            }

            @if (calculatedPrice() > 0) {
              <div class="price-est">
                Estimated: <strong>RM {{ calculatedPrice() | number: '1.2-2' }}</strong>
              </div>
            }
          }
        </div>
      }

      <!-- ── Step 3: Customer Info ──────────────────────────────────── -->
      @if (step() === 2) {
        <div class="step-body customer-step">
          <div class="two-col">
            <label>
              <span>Customer name <span class="req">*</span></span>
              <input type="text" [(ngModel)]="customerName" name="cname" placeholder="Full name" />
            </label>
            <label>
              <span>Phone <span class="req">*</span></span>
              <app-phone-input [(ngModel)]="customerPhone" name="cphone"></app-phone-input>
            </label>
          </div>

          <label>
            <span>Email <span class="opt">(optional)</span></span>
            <input type="email" [(ngModel)]="customerEmail" name="cemail" placeholder="customer@example.com" />
          </label>

          <label>
            <span>Address <span class="req">*</span></span>
            <textarea [(ngModel)]="address" name="caddr" rows="2" placeholder="No, Street, Area"></textarea>
          </label>

          <div class="two-col">
            <label>
              <span>Postcode</span>
              <input type="text" [(ngModel)]="postcode" name="cpostcode" placeholder="e.g. 50490" maxlength="10" />
            </label>
            <label>
              <span>Property type</span>
              <select [(ngModel)]="propertyType" name="cptype">
                <option value="">Select type</option>
                @for (pt of PROPERTY_TYPES; track pt) {
                  <option [value]="pt">{{ pt | titlecase }}</option>
                }
              </select>
            </label>
          </div>

          <div class="two-col">
            <label>
              <span>District</span>
              <input type="text" [(ngModel)]="district" name="cdist" placeholder="e.g. Brickfields" />
            </label>
            <label>
              <span>State</span>
              <select [(ngModel)]="state" name="cstate">
                <option value="">Select state</option>
                <option value="Kuala Lumpur">Kuala Lumpur</option>
                <option value="Selangor">Selangor</option>
                <option value="Penang">Penang</option>
                <option value="Johor">Johor</option>
                <option value="Melaka">Melaka</option>
                <option value="Negeri Sembilan">Negeri Sembilan</option>
                <option value="Perak">Perak</option>
                <option value="Pahang">Pahang</option>
                <option value="Kedah">Kedah</option>
                <option value="Kelantan">Kelantan</option>
                <option value="Terengganu">Terengganu</option>
                <option value="Sabah">Sabah</option>
                <option value="Sarawak">Sarawak</option>
                <option value="Perlis">Perlis</option>
                <option value="Labuan">Labuan</option>
                <option value="Putrajaya">Putrajaya</option>
              </select>
            </label>
          </div>
        </div>
      }

      <!-- ── Step 4: Schedule ───────────────────────────────────────── -->
      @if (step() === 3) {
        <div class="step-body">
          <label>
            <span>Preferred date <span class="req">*</span></span>
            <input type="date" [(ngModel)]="preferredDate" name="sdate" [min]="todayStr()" />
          </label>

          <label>
            <span>Time slot <span class="req">*</span></span>
            <select [(ngModel)]="timeSlot" name="stslot">
              <option value="" disabled>Select a time slot</option>
              @for (ts of TIME_SLOTS; track ts.value) {
                <option [value]="ts.value">{{ ts.label }}</option>
              }
            </select>
          </label>

          <label>
            <span>Notes <span class="opt">(optional)</span></span>
            <textarea [(ngModel)]="notes" name="snotes" rows="2" placeholder="Any special instructions…"></textarea>
          </label>
        </div>
      }

      <!-- ── Step 5: Mode & Submit ──────────────────────────────────── -->
      @if (step() === 4) {
        <div class="step-body">
          <div class="mode-section">
            <label class="radio-label mode-row" [class.sel]="mode() === 'broadcast'">
              <input type="radio" name="mode" value="broadcast" [(ngModel)]="mode" />
              <div class="mode-info">
                <strong>Broadcast to all servicers</strong>
                <span class="muted">Your request will be sent to all servicers in this category. Customer receives proposals.</span>
              </div>
            </label>

            <label class="radio-label mode-row" [class.sel]="mode() === 'direct'">
              <input type="radio" name="mode" value="direct" [(ngModel)]="mode" />
              <div class="mode-info">
                <strong>Assign to me directly</strong>
                <span class="muted">Creates a confirmed booking assigned to you immediately.</span>
              </div>
            </label>
          </div>

          @if (mode() === 'direct') {
            <label class="price-field">
              <span>Price (RM) <span class="req">*</span></span>
              <input
                type="number"
                [(ngModel)]="price"
                name="oprice"
                min="0"
                step="0.01"
                [class.input-error]="priceError()"
              />
              @if (priceError()) { <span class="err">{{ priceError() }}</span> }
            </label>
          }

          <!-- Review summary -->
          <div class="review card">
            <div class="review-row"><span class="rv-label">Category</span><strong>{{ selectedCategory()?.name }}</strong></div>
            <div class="review-row"><span class="rv-label">Customer</span><strong>{{ customerName() }}</strong></div>
            <div class="review-row"><span class="rv-label">Date</span><strong>{{ preferredDate() | date: 'mediumDate' }}</strong></div>
            <div class="review-row"><span class="rv-label">Time</span><strong>{{ timeSlotLabel() }}</strong></div>
            <div class="review-row">
              <span class="rv-label">Mode</span>
              <strong>{{ mode() === 'direct' ? 'Assign to me' : 'Broadcast' }}</strong>
            </div>
            @if (mode() === 'direct') {
              <div class="review-row">
                <span class="rv-label">Price</span>
                <strong>RM {{ (price() ?? calculatedPrice()) | number: '1.2-2' }}</strong>
              </div>
            }
          </div>

          @if (submitError()) {
            <p class="err">{{ submitError() }}</p>
          }
        </div>
      }

      <!-- ── Footer actions ─────────────────────────────────────────── -->
      <div class="modal-actions">
        <button class="btn-ghost" (click)="close()">Cancel</button>

        @if (step() > 0) {
          <button class="btn-ghost" (click)="prevStep()">Back</button>
        }

        @if (step() < STEPS.length - 1) {
          <button class="btn-primary" (click)="nextStep()">Next</button>
        } @else {
          <button
            class="btn-primary"
            (click)="submit()"
            [disabled]="submitting()"
          >
            @if (submitting()) {
              Submitting…
            } @else {
              {{ mode() === 'direct' ? 'Create order' : 'Broadcast request' }}
            }
          </button>
        }
      </div>
    </app-modal>
  `,
  styles: [`
    :host { display: contents; }

    /* ── Step indicator ─────────────────────────────────────────── */
    .steps {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      margin-bottom: 1.2rem;
    }
    .step-dot {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 2px solid var(--color-border);
      background: var(--color-surface);
      color: var(--color-muted);
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-family: inherit;
      transition: background var(--transition), border-color var(--transition), color var(--transition);
    }
    .step-dot.active {
      border-color: var(--color-primary);
      color: var(--color-primary);
      font-weight: 700;
    }
    .step-dot.done {
      background: var(--color-primary);
      background: var(--gradient-primary);
      border-color: var(--color-primary);
      color: #fff;
    }
    .step-line {
      width: 36px;
      height: 2px;
      background: var(--color-border);
      margin: 0 4px;
    }
    .step-dot.done + .step-line {
      background: var(--color-primary);
    }

    /* ── Step body ───────────────────────────────────────────────── */
    .step-body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .customer-step {
      gap: 0.8rem;
    }

    /* ── Labels ──────────────────────────────────────────────────── */
    label {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      font-size: 0.9rem;
      font-weight: 500;
      color: var(--color-text);
    }
    label > span:first-child {
      font-weight: 600;
    }
    .req {
      color: var(--color-danger);
      font-weight: 700;
    }
    .opt {
      color: var(--color-muted);
      font-weight: 400;
      font-size: 0.82rem;
    }

    /* ── Two-column layout ───────────────────────────────────────── */
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.8rem;
    }
    @media (max-width: 560px) {
      .two-col {
        grid-template-columns: 1fr;
      }
    }

    /* ── Category tiles ──────────────────────────────────────────── */
    .cat-search {
      margin-bottom: 0.5rem;
    }
    .cat-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 0.5rem;
      max-height: 260px;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .cat-tile {
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 0.7rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-surface);
      cursor: pointer;
      font-family: inherit;
      font-size: 0.88rem;
      text-align: left;
      color: var(--color-text);
      transition: border-color var(--transition), box-shadow var(--transition);
    }
    .cat-tile:hover {
      border-color: var(--color-primary);
      box-shadow: var(--shadow);
    }
    .cat-tile.sel {
      border-color: var(--color-primary);
      background: var(--color-primary-light);
      box-shadow: var(--shadow-primary);
    }
    .cat-tile strong { font-size: 0.9rem; }
    .small { font-size: 0.78rem; }

    /* ── Question schema fieldsets ────────────────────────────────── */
    fieldset {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: 0.8rem;
      margin: 0;
    }
    legend {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--color-text);
      padding: 0 0.4rem;
    }
    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      margin-top: 0.5rem;
    }
    .radio-label {
      display: flex;
      flex-direction: row !important;
      align-items: center;
      gap: 0.5rem;
      font-weight: 400;
      cursor: pointer;
    }
    .radio-label input[type="radio"] {
      width: auto;
      accent-color: var(--color-primary);
    }
    .chk-row {
      display: flex;
      flex-direction: row !important;
      align-items: center;
      gap: 0.5rem;
      font-weight: 400;
      cursor: pointer;
    }
    .chk-row input[type="checkbox"] {
      width: auto;
      accent-color: var(--color-primary);
    }
    .price-tip {
      font-size: 0.78rem;
      font-weight: 600;
      color: var(--color-primary);
      margin-left: auto;
    }
    .price-est {
      text-align: right;
      font-size: 0.95rem;
      padding: 0.5rem 0;
      border-top: 1px solid var(--color-border);
    }
    .price-est strong {
      color: var(--color-primary);
      font-size: 1.1rem;
    }

    /* ── Mode selection ───────────────────────────────────────────── */
    .mode-section {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
    }
    .mode-row {
      display: flex;
      flex-direction: row !important;
      align-items: flex-start;
      gap: 0.6rem;
      padding: 0.8rem;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      cursor: pointer;
      transition: border-color var(--transition), background var(--transition);
      font-weight: 400 !important;
    }
    .mode-row:hover {
      border-color: var(--color-primary);
    }
    .mode-row.sel {
      border-color: var(--color-primary);
      background: var(--color-primary-light);
      box-shadow: var(--shadow-primary);
    }
    .mode-row input[type="radio"] {
      width: auto;
      accent-color: var(--color-primary);
      margin-top: 0.15rem;
    }
    .mode-info {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .mode-info .muted {
      font-size: 0.8rem;
      font-weight: 400;
    }

    /* ── Price field ──────────────────────────────────────────────── */
    .price-field {
      margin-top: 0.5rem;
    }
    .price-field input {
      max-width: 160px;
    }

    /* ── Review summary ───────────────────────────────────────────── */
    .review {
      padding: 0.8rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .review-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.9rem;
    }
    .rv-label {
      color: var(--color-muted);
      font-size: 0.85rem;
    }
  `],
})
export class NewOrderFormComponent implements OnInit, OnDestroy {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  protected readonly STEPS = STEPS;
  protected readonly PROPERTY_TYPES = PROPERTY_TYPES;
  protected readonly TIME_SLOTS = TIME_SLOTS;

  private api = inject(ApiService);
  private toast = inject(ToastService);

  /* ── Step state ─────────────────────────────────────────────────── */

  step = signal(0);

  /* ── Step 1: Category ───────────────────────────────────────────── */

  categoriesLoading = signal(true);
  categoriesError = signal('');
  allCategories = signal<Category[]>([]);
  catSearch = signal('');
  selectedCategory = signal<Category | null>(null);
  selectedSubcategorySlug = signal('');

  /** Effective category slug (sub-category if selected, else parent). */
  effectiveCategorySlug = computed(() =>
    this.selectedSubcategorySlug() || this.selectedCategory()?.slug || '',
  );

  filteredCategories = computed(() => {
    const q = this.catSearch().toLowerCase().trim();
    const cats = this.allCategories();
    if (!q) return cats;
    return cats.filter((c) => c.name.toLowerCase().includes(q));
  });

  /* ── Step 2: Service Details ────────────────────────────────────── */

  questionsLoading = signal(false);
  questionsError = signal('');
  questions = signal<CategoryQuestion[]>([]);
  servicerPrices = signal<ServicerPrice[]>([]);
  serviceDetails: Record<string, any> = {};
  checkboxSets: Record<string, Set<string>> = {};

  calculatedPrice = computed(() => {
    let total = 0;
    for (const [key, val] of Object.entries(this.serviceDetails)) {
      if (val == null || val === '') continue;
      if (Array.isArray(val)) {
        for (const v of val) {
          total += this.getOptionPrice(key, v);
        }
      } else {
        total += this.getOptionPrice(key, String(val));
      }
    }
    return total;
  });

  /* ── Step 3: Customer Info ──────────────────────────────────────── */

  customerName = signal('');
  customerPhone = signal('');
  customerEmail = signal('');
  address = signal('');
  postcode = signal('');
  district = signal('');
  state = signal('');
  propertyType = signal('');

  /* ── Step 4: Schedule ───────────────────────────────────────────── */

  preferredDate = signal('');
  timeSlot = signal('');
  notes = signal('');

  todayStr = computed(() => new Date().toISOString().slice(0, 10));

  /* ── Step 5: Mode & Submit ──────────────────────────────────────── */

  mode = signal<'direct' | 'broadcast'>('direct');
  price = signal<number | null>(null);
  priceError = signal('');
  submitting = signal(false);
  submitError = signal('');

  timeSlotLabel = computed(() => {
    const ts = TIME_SLOTS.find((t) => t.value === this.timeSlot());
    return ts?.label ?? this.timeSlot();
  });

  /* ── Lifecycle ──────────────────────────────────────────────────── */

  ngOnInit(): void {
    this.loadCategories();
  }

  ngOnDestroy(): void {}

  /* ── Actions ────────────────────────────────────────────────────── */

  close(): void {
    this.closed.emit();
  }

  goToStep(i: number): void {
    if (i < this.step()) this.step.set(i);
  }

  prevStep(): void {
    if (this.step() > 0) this.step.set(this.step() - 1);
  }

  nextStep(): void {
    const s = this.step();

    if (s === 0) {
      if (!this.effectiveCategorySlug()) {
        this.toast.error('Please select a category.');
        return;
      }
      this.loadQuestions();
    }

    if (s === 2) {
      if (!this.customerName().trim()) { this.toast.error('Customer name is required.'); return; }
      if (!this.customerPhone().trim()) { this.toast.error('Phone number is required.'); return; }
      if (!this.address().trim()) { this.toast.error('Address is required.'); return; }
    }

    if (s === 3) {
      if (!this.preferredDate()) { this.toast.error('Preferred date is required.'); return; }
      if (!this.timeSlot()) { this.toast.error('Time slot is required.'); return; }
    }

    this.step.set(s + 1);
  }

  selectCategory(cat: Category): void {
    this.selectedCategory.set(cat);
    this.selectedSubcategorySlug.set('');
    // If no sub-categories, use parent slug directly.
    if (!cat.children?.length && cat.slug) {
      this.selectedSubcategorySlug.set('');
    }
  }

  getOptionPrice(questionKey: string, optionValue: string): number {
    const prices = this.servicerPrices();
    const match = prices.find(
      (p) => p.questionKey === questionKey && p.optionValue === optionValue,
    );
    return match?.price ?? 0;
  }

  checkboxValue(key: string, val: string): boolean {
    return this.checkboxSets[key]?.has(val) ?? false;
  }

  toggleCheckbox(key: string, val: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (!this.checkboxSets[key]) this.checkboxSets[key] = new Set();
    if (checked) {
      this.checkboxSets[key].add(val);
    } else {
      this.checkboxSets[key].delete(val);
    }
    this.serviceDetails[key] = Array.from(this.checkboxSets[key]);
  }

  /* ── Data loading ──────────────────────────────────────────────── */

  private loadCategories(): void {
    this.categoriesLoading.set(true);
    this.categoriesError.set('');
    this.api.get<{ data: Category[] }>('/categories?scope=all').subscribe({
      next: (r) => {
        // Build tree: parent categories with children nested.
        const all = r.data ?? [];
        const parents = all.filter((c) => !c.parentId && !(c as any).parent?.id);
        const children = all.filter((c) => c.parentId || (c as any).parent?.id);

        // Build lookup of parentId -> children
        const byParent = new Map<string, Category[]>();
        for (const c of children) {
          const pid = c.parentId ?? (c as any).parent?.id;
          if (!pid) continue;
          if (!byParent.has(pid)) byParent.set(pid, []);
          byParent.get(pid)!.push({ ...c, parentId: pid });
        }

        for (const p of parents) {
          p.children = byParent.get(p.id) ?? [];
        }

        this.allCategories.set(parents);
        this.categoriesLoading.set(false);
      },
      error: (e) => {
        this.categoriesError.set(e.message ?? 'Failed to load categories.');
        this.categoriesLoading.set(false);
      },
    });
  }

  private loadQuestions(): void {
    const slug = this.effectiveCategorySlug();
    if (!slug) return;

    this.questionsLoading.set(true);
    this.questionsError.set('');
    this.serviceDetails = {};
    this.checkboxSets = {};

    // Load the category's question schema and servicer pricing.
    this.api.get<{ data: { id: string; questionSchema?: CategoryQuestion[] | null }[] }>('/categories?scope=all')
      .subscribe({
        next: (r) => {
          const cat = (r.data ?? []).find((c) => {
            // Find the category by matching slug in the tree
            const found = this.findCategoryInTree(this.allCategories(), slug);
            return found && c.id === found.id;
          });

          // Fallback: look for any category with matching slug
          let schema: CategoryQuestion[] | null = null;
          if (cat?.questionSchema?.length) {
            schema = cat.questionSchema;
          } else {
            for (const c of r.data ?? []) {
              if (c.questionSchema?.length) {
                schema = c.questionSchema;
                break;
              }
            }
          }

          this.questions.set(schema ?? []);
          this.questionsLoading.set(false);

          // Load servicer prices
          this.loadServicerPrices(slug);
        },
        error: (e) => {
          this.questionsError.set(e.message ?? 'Failed to load service details.');
          this.questionsLoading.set(false);
        },
      });
  }

  private findCategoryInTree(tree: Category[], slug: string): Category | null {
    for (const c of tree) {
      if (c.slug === slug) return c;
      if (c.children) {
        const found = this.findCategoryInTree(c.children, slug);
        if (found) return found;
      }
    }
    return null;
  }

  private loadServicerPrices(_categorySlug: string): void {
    // Load modules to compute price estimates.
    this.api.get<{ data: { questionKey?: string; optionValue?: string; price: number }[] }>('/servicer/modules')
      .subscribe({
        next: (r) => {
          this.servicerPrices.set(
            (r.data ?? [])
              .filter((m) => m.questionKey && m.optionValue)
              .map((m) => ({
                questionKey: m.questionKey!,
                optionValue: m.optionValue!,
                price: Number(m.price),
              })),
          );
        },
        error: () => {
          // Non-critical - prices just won't show.
        },
      });
  }

  /* ── Submit ────────────────────────────────────────────────────── */

  submit(): void {
    this.submitError.set('');

    if (this.mode() === 'direct') {
      const p = this.price();
      if (p == null || p <= 0) {
        this.priceError.set('Price is required for direct orders.');
        return;
      }
      this.priceError.set('');
    }

    const payload: NewOrderPayload = {
      mode: this.mode(),
      customerName: this.customerName().trim(),
      customerPhone: this.customerPhone().trim(),
      customerEmail: this.customerEmail().trim() || undefined,
      address: this.address().trim(),
      postcode: this.postcode().trim() || undefined,
      district: this.district().trim() || undefined,
      state: this.state() || undefined,
      propertyType: this.propertyType() || undefined,
      categorySlug: this.effectiveCategorySlug(),
      serviceDetails: Object.keys(this.serviceDetails).length > 0 ? { ...this.serviceDetails } : undefined,
      preferredDate: this.preferredDate(),
      timeSlot: this.timeSlot(),
      notes: this.notes().trim() || undefined,
      price: this.mode() === 'direct' ? (this.price() ?? this.calculatedPrice()) : undefined,
    };

    this.submitting.set(true);
    this.api.post<NewOrderResponse>('/servicer/new-order', payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res.bookingId) {
          this.toast.success(`Order created! Booking #${res.bookingId} confirmed.`);
        } else {
          const count = res.broadcastCount ?? 0;
          this.toast.success(`Quote sent to ${count} servicer${count === 1 ? '' : 's'}. Customer will receive proposals.`);
        }
        this.closed.emit();
        this.resetForm();
      },
      error: (e) => {
        this.submitting.set(false);
        const msg = e?.error?.error?.message ?? e?.message ?? 'Failed to create order.';
        this.submitError.set(msg);
        this.toast.error(msg);
      },
    });
  }

  private resetForm(): void {
    this.step.set(0);
    this.selectedCategory.set(null);
    this.selectedSubcategorySlug.set('');
    this.catSearch.set('');
    this.questions.set([]);
    this.servicerPrices.set([]);
    this.serviceDetails = {};
    this.checkboxSets = {};
    this.customerName.set('');
    this.customerPhone.set('');
    this.customerEmail.set('');
    this.address.set('');
    this.postcode.set('');
    this.district.set('');
    this.state.set('');
    this.propertyType.set('');
    this.preferredDate.set('');
    this.timeSlot.set('');
    this.notes.set('');
    this.mode.set('direct');
    this.price.set(null);
    this.priceError.set('');
    this.submitError.set('');
  }
}
