import { Component, OnInit, OnDestroy, inject, isDevMode, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../core/services/api.service';
import { AuthService, GuestQuoteData } from '../core/services/auth.service';
import { ConfigService } from '../core/services/config.service';
import { StripePaymentService } from '../core/services/stripe-payment.service';
import { DemoBarComponent } from '../shared/demo-bar.component';
import { DemoUnlockService } from '../core/services/demo-unlock.service';
import { AddressFieldsComponent } from '../shared/address-fields.component';
import { PhoneInputComponent } from '../shared/phone-input.component';
import { CalendarPickerComponent } from '../shared/calendar-picker.component';
import { TIME_SLOTS } from '../shared/constants/time-slots';
import { normalizeMyPhone } from '../shared/phone.util';
import { QaFormBridge } from '../shared/qa-form-bridge.service';

interface Category {
  id: string; name: string; icon?: string;
  slug?: string;
  parentCategoryId?: string | null;
  defaultPriceSuggestion?: number;
  allowedTimeSlots?: string[];
  questionSchema?: { key: string; label: string; type: 'checkbox' | 'radio' | 'text' | 'quantity' | 'number'; required: boolean; description?: string; options?: { value: string; label: string }[] }[] | null;
  photosEnabled?: boolean;
}

interface EstimateResult {
  subtotal: number;
  promoDiscount: number;
  promoError?: string;
  serviceCharge: number;
  sst: number;
  total: number;
  note: string;
}

const STEPS = [
  { n: 1, label: 'Choose service' },
  { n: 2, label: 'Contact' },
  { n: 3, label: 'Summary' },
  { n: 4, label: 'Confirmation' },
];

interface FormState {
  categoryId: string;
  timeSlot: string;
  preferredDate: string;
  notes: string;
  extraNotes: string;
  contactName: string;
  contactNumber: string;
  addressNo: string;
  streetDetails: string;
  newAddressPostcode: string;
  newAddressDistrict: string;
  newAddressState: string;
  newAddressPropertyType: string;
  newAddressLat?: number;
  newAddressLng?: number;
  budgetIndex: string;
  paymentTiming: 'pay_now' | 'pay_later';
  settlementMethod: 'gateway' | 'cash';
  agreeTerms: boolean;
  answers: Record<string, unknown>;
}

function emptyForm(): FormState {
  return {
    categoryId: '',
    timeSlot: '',
    preferredDate: '',
    notes: '',
    extraNotes: '',
    contactName: '',
    contactNumber: '',
    addressNo: '',
    streetDetails: '',
    newAddressPostcode: '',
    newAddressDistrict: '',
    newAddressState: '',
    newAddressPropertyType: '',
    newAddressLat: undefined,
    newAddressLng: undefined,
    budgetIndex: '',
    paymentTiming: 'pay_later',
    settlementMethod: 'cash',
    agreeTerms: false,
    answers: {},
  };
}

@Component({
    selector: 'app-guest-quote',
    imports: [FormsModule, RouterLink, DemoBarComponent, AddressFieldsComponent, PhoneInputComponent, CalendarPickerComponent],
    template: `
    <div class="shell">
      @if (config.hasDemoData) {
      <app-demo-bar />
      }
      <header class="topbar">
        <a class="brand" routerLink="/">
          <img src="assets/ico/MyHomeServicerIcon.png" class="logo-icon" alt="" />
          My Home Servicer
        </a>
        <span class="spacer"></span>
        <div class="top-acts">
          <a class="nav-btn nav-btn--ghost" routerLink="/login">Sign in</a>
          <a class="nav-btn nav-btn--solid" routerLink="/register">Register</a>
        </div>
      </header>

      <main class="content">
        <div class="wrap">
          <h1>Request a quote</h1>
          <div class="sub-row">
            <p class="sub-muted">Your details stay in this browser. <a routerLink="/login">Sign in</a> to save them to your account.</p>
            @if (config.hasDemoData && unlock.unlocked()) {
            <div class="demo-autofill">
              <button class="btn-autofill" type="button" (click)="demoAutoFill()">⚡ Demo: Auto-fill</button>
            </div>
            }
          </div>

          @if (submitted()) {
            <div class="card success-card">
              <span class="success-ic">✓</span>
              <strong>Request submitted!</strong>
              <p>Please be patient - our servicers will contact you shortly to confirm and start working.</p>
              <p class="muted">Want to track your quote and earn rewards? Create an account and your details will be ready for you.</p>
              <p class="muted" style="font-size:0.88rem">Redirecting to home in {{ guestCountdown() }}…</p>
              <div class="success-acts">
                <a class="btn-primary" routerLink="/register" [queryParams]="{prefill: 'guest'}">Create a free account</a>
                <a class="btn-ghost" routerLink="/login">Already have an account? Login here</a>
                <a class="btn-ghost" routerLink="/">Back to home</a>
              </div>
            </div>
          } @else if (stripePayment.state() === 'processing') {
            <div class="card stripe-overlay">
              <div class="spinner"></div>
              <strong>Waiting for payment</strong>
              <p class="muted">Complete the payment in the new tab, then return here.</p>
              <button class="btn-ghost" (click)="stripePayment.cancel()">Cancel payment</button>
            </div>
          } @else if (stripePayment.state() === 'cancelled') {
            <div class="card err-card">
              <strong>Payment cancelled</strong>
              <p class="muted">Your quote was saved but payment was not processed. You can try again or contact support.</p>
              <button class="btn-primary" (click)="stripePayment.reset()">Try again</button>
            </div>
          } @else {

          @if (loadError()) {
            <div class="card err-card">Could not load the form. <button class="btn-ghost" (click)="load()">Retry</button></div>
          } @else {

          <!-- Stepper -->
          <div class="card stepper">
            @for (s of stepDefs; track s.n) {
              <button class="step" [class.on]="step() === s.n" [class.done]="step() > s.n" [disabled]="s.n > step()" (click)="goToStep(s.n)">
                <span class="dot">{{ step() > s.n ? '✓' : s.n }}</span>
                <span>{{ s.label }}</span>
              </button>
            }
          </div>

          <!-- Step 1 - Choose service -->
          @if (step() === 1) {
            <div class="card pane">
              <div style="display:flex;gap:1rem;flex-wrap:wrap;">
                <label style="flex:1 1 220px;"><span>Category<span class="req"> *</span></span>
                  <select [ngModel]="parentId()" (ngModelChange)="onParentChange($event)" name="parentCat">
                    <option value="">Select a category…</option>
                    @for (p of parentOptions(); track p.id) {
                      <option [value]="p.id">{{ p.name }}</option>
                    }
                  </select>
                </label>
                <label style="flex:1 1 220px;"><span>Type of service<span class="req"> *</span></span>
                  <select [ngModel]="f.categoryId" (ngModelChange)="onCategoryChange($event)" name="cat" [disabled]="!parentId()">
                    <option value="">{{ parentId() ? 'Select a service…' : 'Choose a category first' }}</option>
                    @for (c of childOptions(); track c.id) {
                      <option [value]="c.id">{{ c.name }}</option>
                    }
                  </select>
                  @if (hasError('category')) { <span class="field-msg">Please choose a type of service.</span> }
                </label>
              </div>

              @if (f.categoryId) {
                @for (q of questions(); track q.key) {
                  <div class="qgroup">
                    <span class="qlabel">{{ q.label }}@if (q.required) {<span class="req"> *</span>}</span>
                    @if (q.type === 'checkbox') {
                      <div class="opts">
                        @for (o of q.options; track o.value) {
                          <label class="opt">
                            <input type="checkbox" [checked]="isChecked(q.key, o.value)" (change)="toggleCheck(q.key, o.value)" />
                            <span>{{ o.label }}</span>
                          </label>
                        }
                      </div>
                    } @else if (q.type === 'radio') {
                      <div class="opts">
                        @for (o of q.options; track o.value) {
                          <label class="opt">
                            <input type="radio" [name]="q.key" [checked]="radioValue(q.key) === o.value" (change)="setRadio(q.key, o.value)" />
                            <span>{{ o.label }}</span>
                          </label>
                        }
                      </div>
                    } @else if (q.type === 'quantity') {
                      <div class="qty-list">
                        @for (o of (q.options ?? []); track o.value) {
                          <div class="qty-row">
                            <span class="qty-label">{{ o.label }}</span>
                            <div class="qty-stepper">
                              <button type="button" class="qty-btn" (click)="decQty(q.key, o.value)">−</button>
                              <span class="qty-val">{{ qtyValue(q.key, o.value) }}</span>
                              <button type="button" class="qty-btn" (click)="incQty(q.key, o.value)">+</button>
                            </div>
                          </div>
                        }
                      </div>
                    } @else if (q.type === 'number') {
                      <input type="number" min="0" [ngModel]="numberValue(q.key)" (ngModelChange)="setNumber(q.key, $event)" [name]="'q_' + q.key" class="num-input" />
                    } @else {
                      <textarea rows="2" [ngModel]="textValue(q.key)" (ngModelChange)="setText(q.key, $event)" [name]="'q_' + q.key"></textarea>
                    }
                    @if (q.description) { <span class="muted hint">{{ q.description }}</span> }
                  </div>
                }

                <label><span>Extra Details: <span class="muted">(optional)</span></span>
                  <textarea rows="2" [(ngModel)]="f.extraNotes" name="extraNotes" maxlength="1000" placeholder="Anything else the servicer should know about this service…"></textarea>
                </label>

                @if (budgetRanges().length > 0) {
                  <div class="budget-group" [class.field-invalid]="hasError('budgetIndex')">
                    <div class="budget-header">
                      <span class="qlabel">Budget range<span class="req"> *</span></span>
                      @if (f.budgetIndex !== '') {
                        <span class="budget-selected-badge">{{ budgetLabel() }}</span>
                      }
                    </div>
                    <input
                      type="range"
                      class="budget-range"
                      [min]="0"
                      [max]="budgetRanges().length - 1"
                      [step]="1"
                      [ngModel]="budgetSlider"
                      (ngModelChange)="onBudgetSlide($event)"
                      name="budgetRange"
                    />
                    <div class="budget-ticks">
                      @for (r of budgetRanges(); track $index) {
                        <span class="budget-tick" [class.budget-tick--on]="budgetSlider === $index">
                          {{ rangeLabel(r) }}
                        </span>
                      }
                    </div>
                    @if (hasError('budgetIndex')) { <span class="field-msg">Please select a budget range.</span> }
                  </div>
                }
              }

              @if (stepError()) { <p class="err">{{ stepError() }}</p> }
              <div class="actions">
                <button class="btn-primary" (click)="goToContact()" [disabled]="!f.categoryId">Next: Contact →</button>
              </div>
            </div>
          }

          <!-- Step 2 - Contact -->
          @if (step() === 2) {
            <div class="card pane">
              <div class="row">
                <label><span class="cap">Contact name<span class="req"> *</span></span>
                  <input [(ngModel)]="f.contactName" name="name" maxlength="100" (ngModelChange)="clearError('contactName')" />
                  @if (hasError('contactName')) { <span class="field-msg">Contact name is required.</span> }
                </label>
                <label><span class="cap">Contact number<span class="req"> *</span></span>
                  <app-phone-input [(ngModel)]="f.contactNumber" name="phone" (ngModelChange)="clearError('contactNumber')"></app-phone-input>
                  @if (hasError('contactNumber')) { <span class="field-msg">Contact number is required.</span> }
                </label>
              </div>

              <label><span>Enter Building/Premise Instructions <span class="muted">(optional)</span></span>
                <textarea rows="2" [(ngModel)]="f.notes" name="notes" maxlength="1000" placeholder="Register at guard house, park at visitor lot B, management office open 9am-5pm"></textarea>
              </label>

              <app-address-fields
                [(addressNo)]="f.addressNo"
                [(streetDetails)]="f.streetDetails"
                [(postcode)]="f.newAddressPostcode"
                [(district)]="f.newAddressDistrict"
                [(state)]="f.newAddressState"
                [(propertyType)]="f.newAddressPropertyType"
                [(lat)]="f.newAddressLat"
                [(lng)]="f.newAddressLng"
                [errors]="fieldErrors"
                (clearError)="clearError($event)"
              />

              <app-calendar-picker
                [(selectedDate)]="f.preferredDate"
                [(selectedSlot)]="f.timeSlot"
                [minDate]="todayStr"
                [availableSlots]="availableTimeSlots()"
              />

              @if (hasError('preferredDate') || hasError('timeSlot')) {
                <span class="field-msg">Please choose a preferred date and time.</span>
              }

              @if (stepError()) { <p class="err">{{ stepError() }}</p> }
              <div class="actions">
                <button class="btn-ghost" (click)="step.set(1)">← Back</button>
                <button class="btn-primary" (click)="goToSummary()">Next: Summary →</button>
              </div>
            </div>
          }

          <!-- Step 3 - Summary -->
          @if (step() === 3) {
            <div class="card pane">
              <h2>Review your request</h2>
              <dl class="review">
                <dt>Preferred Time + Date</dt>
                <dd>{{ timeSlotLabel() }} · {{ f.preferredDate || ' - ' }}</dd>
                <dt>Contact</dt>
                <dd>{{ f.contactName }} · {{ f.contactNumber }}</dd>
                <dt class="service-dt">
                  <details class="service-details">
                    <summary class="service-summary">Service: {{ categoryName() }} <span class="chevron">▸</span></summary>
                    <div class="service-answers">
                      @for (q of questions(); track q.key) {
                        <div class="answer-row"><span class="answer-label">{{ q.label }}:</span> <span class="answer-value">{{ answerLabel(q) || ' - ' }}</span></div>
                      }
                    </div>
                  </details>
                </dt>
                @if (f.extraNotes) { <dt>Extra Details</dt><dd>{{ f.extraNotes }}</dd> }
                @if (f.notes) { <dt>Address Instructions</dt><dd>{{ f.notes }}</dd> }
                <dt>Full Address</dt>
                <dd>
                  <div>{{ addressLabel() }}</div>
                  <div class="addr-line2">{{ [f.newAddressDistrict, f.newAddressPostcode].filter(v => v).join(', ') || '' }}</div>
                </dd>
              </dl>
              <p class="looks-good muted">Looks good? Choose how you'd like to pay on the next step.</p>

              <div class="actions">
                <button class="btn-ghost" (click)="step.set(2)">← Back</button>
                <button class="btn-primary" (click)="goToBill()">Next: Bill →</button>
              </div>
            </div>
          }

          <!-- Step 4 - Bill -->
          @if (step() === 4) {
            <div class="card pane">
              <h2>Payment</h2>

              <!-- Payment timing -->
              <div class="qgroup">
                <span class="qlabel">When would you like to pay?</span>
                <div class="opts">
                  <label class="opt timing-opt" [class.timing-opt--on]="f.paymentTiming === 'pay_now'">
                    <input type="radio" name="payTiming" [checked]="f.paymentTiming === 'pay_now'" (change)="f.paymentTiming = 'pay_now'; onTimingChange()" />
                    <div class="timing-body">
                      <strong>Pay now</strong>
                      <span class="muted">Charged at proposal acceptance, held in escrow until the job is done</span>
                    </div>
                  </label>
                  <label class="opt timing-opt" [class.timing-opt--on]="f.paymentTiming === 'pay_later'">
                    <input type="radio" name="payTiming" [checked]="f.paymentTiming === 'pay_later'" (change)="f.paymentTiming = 'pay_later'; onTimingChange()" />
                    <div class="timing-body">
                      <strong>Pay later</strong>
                      <span class="muted">Nothing charged now - invoice issued after the job is complete</span>
                    </div>
                  </label>
                </div>
              </div>

              <!-- Settlement method - pay_later only -->
              @if (f.paymentTiming === 'pay_later') {
                <div class="qgroup">
                  <span class="qlabel">Settlement method</span>
                  <div class="opts">
                    <label class="opt">
                      <input type="radio" name="payMethod" [checked]="f.settlementMethod === 'gateway'" (change)="f.settlementMethod = 'gateway'" />
                      <span>Credit / Debit card <span class="muted">(pay via Stripe after job done)</span></span>
                    </label>
                    <label class="opt">
                      <input type="radio" name="payMethod" [checked]="f.settlementMethod === 'cash'" (change)="f.settlementMethod = 'cash'" />
                      <span>Cash <span class="muted">(pay servicer directly after job done)</span></span>
                    </label>
                  </div>
                  <span class="muted hint"><a routerLink="/register">Create an account</a> to pay with wallet credit.</span>
                </div>
                <p class="no-charge-note muted">No charge until a servicer accepts your request.</p>
              }

              <!-- Canonical estimate card -->
              <div class="est-card">
                <h3 class="est-title">Estimated bill</h3>
                @if (estimateLoading()) {
                  <p class="muted est-loading">Calculating…</p>
                } @else if (estimateData()) {
                  <div class="est-body">
                    <div class="est-row"><span>Subtotal</span><span>RM {{ estimateData()!.subtotal.toFixed(2) }}</span></div>
                    @if (estimateData()!.serviceCharge > 0) {
                      <div class="est-row"><span>Service charge</span><span>RM {{ estimateData()!.serviceCharge.toFixed(2) }}</span></div>
                    }
                    @if (estimateData()!.sst > 0) {
                      <div class="est-row"><span>SST</span><span>RM {{ estimateData()!.sst.toFixed(2) }}</span></div>
                    }
                    <div class="est-row est-total-row">
                      <span>Estimated total</span>
                      <strong class="est-total-amt">RM {{ estimateData()!.total.toFixed(2) }}</strong>
                    </div>
                  </div>
                  <p class="muted est-note">{{ estimateData()!.note }}</p>
                }
              </div>

              <label class="checkbox">
                <input type="checkbox" [(ngModel)]="f.agreeTerms" name="agree" />
                I agree to the platform terms and data collection.
              </label>

              @if (stepError()) { <p class="err">{{ stepError() }}</p> }
              <div class="actions">
                <button class="btn-ghost" (click)="step.set(3)">← Back</button>
                <button class="btn-primary" (click)="save()" [disabled]="saving() || stripeProcessing()">
                  {{ stripeProcessing() ? 'Opening payment…' : saving() ? 'Sending…' : 'Send request' }}
                </button>
              </div>
            </div>
          }

          }} <!-- end @else (not loadError) -->
        </div>
      </main>
    </div>
  `,
    styles: [`
    :host { display: block; }
    .shell { height: 100vh; overflow-y: auto; background: var(--color-bg); }
    /* §5.3: public top bar scrolls with content - NOT sticky. */
    .topbar {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.8rem 1.5rem;
      background: var(--color-surface); border-bottom: 1px solid var(--color-border);
      position: relative; z-index: 10;
    }
    .brand { display: inline-flex; align-items: center; gap: 0.4rem; font-family: var(--font-display); font-weight: 400; font-size: 1.25rem; background: var(--gradient-primary); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; text-decoration: none; }
    .logo-icon { width: 34px; height: 34px; object-fit: contain; flex-shrink: 0; }
    .spacer { flex: 1; }
    .top-acts { display: flex; gap: 0.4rem; }
    .nav-btn { font-size: 0.85rem; font-weight: 600; padding: 0.35rem 0.85rem; border-radius: 999px; text-decoration: none; transition: all 0.2s ease; white-space: nowrap; }
    .nav-btn--ghost { color: var(--color-text); background: transparent; border: 1.5px solid transparent; }
    .nav-btn--ghost:hover { background: var(--color-bg); }
    .nav-btn--solid { color: #fff; background: var(--color-primary); border: 1.5px solid var(--color-primary); }
    .nav-btn--solid:hover { background: var(--color-primary-dark); }
    .content { padding: 1.5rem 2rem; }
    .wrap { max-width: 720px; margin: 0 auto; }
    h1 { margin-bottom: 0.2rem; }
    h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
    .sub-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.2rem; }
    .sub-muted { color: var(--color-muted); font-size: 0.88rem; margin: 0; flex: 1; }
    .sub-muted a { color: var(--color-primary); }
    .stepper { display: flex; gap: 0.5rem; margin-bottom: 1rem; }
    .step {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem;
      background: var(--color-bg); border: 1px solid var(--color-border);
      border-radius: var(--radius); padding: 0.6rem 0.5rem;
      font-weight: 600; font-size: 0.9rem; color: var(--color-muted);
      cursor: pointer; transition: background var(--transition), color var(--transition), border-color var(--transition);
    }
    .step:disabled { cursor: default; }
    .step.on { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-surface); box-shadow: 0 2px 8px rgba(201,90,60,0.15); }
    .step.done { color: var(--color-success); }
    .dot {
      display: inline-flex; align-items: center; justify-content: center;
      width: 1.5rem; height: 1.5rem; border-radius: 999px;
      background: var(--color-border); color: var(--color-text); font-size: 0.8rem;
      transition: background var(--transition), color var(--transition);
    }
    .step.on .dot { background: var(--color-primary); color: #fff; }
    .step.done .dot { background: var(--color-success); color: #fff; }
    .pane { display: flex; flex-direction: column; gap: 0.9rem; }
    label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; font-weight: 500; }
    .req { color: var(--color-danger); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
    .qgroup {
      display: flex; flex-direction: column; gap: 0.4rem;
      padding: 0.8rem; border: 1px solid var(--color-border);
      border-radius: var(--radius); background: var(--color-bg);
    }
    .qlabel { font-weight: 600; font-size: 0.92rem; }
    .opts { display: flex; flex-direction: column; gap: 0.4rem; }
    .opt { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 400; cursor: pointer; }
    .opt input { width: auto; }
    .hint { font-size: 0.8rem; }
    /* Budget slider */
    .budget-group {
      display: flex; flex-direction: column; gap: 0.5rem;
      padding: 0.9rem; border: 1px solid var(--color-border);
      border-radius: var(--radius); background: var(--color-bg);
      transition: border-color var(--transition);
    }
    .budget-group.field-invalid { border-color: var(--color-danger); box-shadow: 0 0 0 2px rgba(220,38,38,0.1); }
    .budget-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .budget-selected-badge {
      font-size: 0.85rem; font-weight: 700; color: var(--color-primary);
      background: var(--color-primary-light); padding: 0.15rem 0.6rem;
      border-radius: 999px;
    }
    .budget-range {
      -webkit-appearance: none; appearance: none;
      width: 100%; height: 6px;
      background: var(--color-border);
      border-radius: 999px; cursor: pointer; outline: none;
    }
    .budget-range::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 22px; height: 22px; border-radius: 50%;
      background: var(--color-primary); cursor: pointer;
      box-shadow: 0 1px 6px rgba(0,0,0,0.22); border: 2px solid #fff;
    }
    .budget-range::-moz-range-thumb {
      width: 22px; height: 22px; border-radius: 50%;
      background: var(--color-primary); cursor: pointer; border: 2px solid #fff;
    }
    .budget-ticks { display: flex; justify-content: space-between; padding: 0 2px; }
    .budget-tick { font-size: 0.78rem; color: var(--color-muted); }
    .budget-tick--on { color: var(--color-primary); font-weight: 700; }
    /* Timing option cards */
    .timing-opt {
      align-items: flex-start;
      padding: 0.75rem 0.9rem;
      border: 1.5px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-bg);
      transition: border-color var(--transition), background var(--transition);
    }
    .timing-opt--on { border-color: var(--color-primary); background: var(--color-surface); }
    .timing-body { display: flex; flex-direction: column; gap: 0.15rem; }
    .timing-body strong { font-size: 0.95rem; font-weight: 600; }
    .timing-body .muted { font-size: 0.82rem; }
    .no-charge-note { font-size: 0.82rem; margin: -0.2rem 0 0; }
    /* Canonical estimate card */
    .est-card {
      padding: 1rem 1.1rem;
      background: var(--color-bg); border: 1px solid var(--color-border);
      border-radius: var(--radius);
    }
    .est-title { margin: 0 0 0.6rem; font-size: 0.95rem; font-weight: 700; }
    .est-loading { font-size: 0.88rem; margin: 0; }
    .est-body { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.5rem; }
    .est-row { display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem; font-size: 0.9rem; }
    .est-total-row { margin-top: 0.35rem; padding-top: 0.4rem; border-top: 1px solid var(--color-border); font-weight: 600; }
    .est-total-amt { font-size: 1.2rem; font-weight: 700; color: var(--color-primary); }
    .est-note { font-size: 0.78rem; margin: 0; }
    .looks-good { font-size: 0.88rem; margin: 0; }
    .field-msg { font-size: 0.82rem; color: var(--color-danger); }
    .field-invalid { border-color: var(--color-danger) !important; }
    .err { color: var(--color-danger); font-size: 0.88rem; margin: 0; }
    .checkbox { flex-direction: row; align-items: center; gap: 0.5rem; }
    .checkbox input { width: auto; }
    .actions { display: flex; gap: 0.5rem; justify-content: flex-end; padding-top: 0.5rem; }
    .review { display: grid; grid-template-columns: auto 1fr; gap: 0.5rem 1rem; }
    .review dt { font-weight: 600; color: var(--color-muted); }
    .review dd { margin: 0; word-break: break-word; }
    .review dt.service-dt { grid-column: 1 / -1; font-weight: 400; }
    .service-details { display: block; }
    .service-summary { cursor: pointer; list-style: none; font-weight: 600; color: var(--color-muted); user-select: none; }
    .service-summary::-webkit-details-marker { display: none; }
    .service-summary .chevron { display: inline-block; transition: transform 0.2s ease; font-size: 0.75rem; }
    .service-details[open] .chevron { transform: rotate(90deg); }
    .service-answers { margin-top: 0.5rem; display: grid; grid-template-columns: minmax(0, 14rem) minmax(0, 1fr); gap: 0.25rem 0.75rem; }
    .answer-row { display: contents; }
    .answer-label { color: var(--color-muted); }
    .answer-value { color: var(--color-text); }
    .addr-line2 { font-size: 0.85rem; color: var(--color-muted); margin-top: 0.1rem; }
    .pane { padding-bottom: 1rem; }
    .err-card { color: var(--color-danger); }
    .success-card {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.7rem; text-align: center; padding: 2rem;
    }
    .stripe-overlay {
      display: flex; flex-direction: column; align-items: center;
      gap: 0.7rem; text-align: center; padding: 2.5rem 2rem;
    }
    .spinner {
      width: 32px; height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .success-ic {
      width: 3rem; height: 3rem; border-radius: 999px;
      background: var(--color-success); color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.5rem; font-weight: 700;
    }
    .success-acts { display: flex; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; justify-content: center; }
    .success-acts a { text-decoration: none; }
    /* Quantity stepper */
    .qty-list { display: flex; flex-direction: column; gap: 0.4rem; }
    .qty-row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .qty-label { font-size: 0.9rem; flex: 1; }
    .qty-stepper { display: flex; align-items: center; gap: 0.4rem; }
    .qty-btn {
      width: 28px; height: 28px; border-radius: 50%;
      border: 1px solid var(--color-border); background: var(--color-surface);
      font-size: 1.1rem; font-weight: 600; line-height: 1; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .qty-btn:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
    .qty-val { min-width: 24px; text-align: center; font-size: 0.95rem; font-weight: 600; }
    /* Number input */
    .num-input { max-width: 160px; }
    .demo-autofill { display: flex; justify-content: flex-end; }
    .btn-autofill {
      font-size: 0.78rem; font-weight: 500; padding: 0.25rem 0.7rem;
      border-radius: 999px; border: 1px solid var(--color-border);
      background: transparent; color: var(--color-muted); cursor: pointer;
      transition: all 0.2s ease;
    }
    .btn-autofill:hover { background: var(--color-bg); color: var(--color-text); border-color: var(--color-muted); }
    @media (max-width: 560px) {
      .stepper .step span:not(.dot) { display: none; }
      .row { grid-template-columns: 1fr; }
      .content { padding: 1rem; }
      .review { grid-template-columns: 1fr; }
      .review dd { margin-bottom: 0.5rem; }
      .service-answers { grid-template-columns: 1fr; gap: 0 0; }
      .answer-row { display: block; margin-bottom: 0.35rem; }
      .answer-label { display: block; }
    }
  `]
})
export class GuestQuoteComponent implements OnInit, OnDestroy {
  isDevMode = isDevMode;
  config = inject(ConfigService);
  protected readonly unlock = inject(DemoUnlockService);
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected stripePayment = inject(StripePaymentService);
  private qaForm = inject(QaFormBridge);
  /** Stable ref so unregister matches the exact callback registered in ngOnInit. */
  private qaWalker = (demo: boolean): Promise<string[]> => this.qaWalkAndVerify(demo);

  guestCountdown = signal(3);
  private guestCountdownTimer: ReturnType<typeof setInterval> | null = null;

  protected readonly stepDefs = STEPS;
  protected readonly timeSlots = TIME_SLOTS;

  step = signal(1);
  stepError = signal('');
  saving = signal(false);
  stripeProcessing = signal(false);
  submitted = signal(false);
  loadError = signal(false);
  categories = signal<Category[]>([]);
  parentId = signal('');
  parentOptions = computed(() => this.categories().filter((c) => !c.parentCategoryId));
  childOptions = computed(() => {
    const pid = this.parentId();
    return pid ? this.categories().filter((c) => c.parentCategoryId === pid) : [];
  });
  availableTimeSlots = computed(() => {
    const cat = this.categories().find((c) => c.id === this.f.categoryId);
    return cat?.allowedTimeSlots?.length ? cat.allowedTimeSlots : TIME_SLOTS.map((s) => s.value);
  });

  f: FormState = emptyForm();
  protected fieldErrors = new Set<string>();

  budgetRanges = signal<{ min: number; max: number | null }[]>([]);
  questions = signal<Category['questionSchema']>([]);

  estimateData = signal<EstimateResult | null>(null);
  estimateLoading = signal(false);
  budgetSlider = 0;

  get todayStr(): string {
    return new Date().toISOString().split('T')[0];
  }

  ngOnInit(): void {
    this.qaForm.register(this.qaWalker);
    const submitted = this.route.snapshot.queryParamMap.get('submitted') === 'true';

    // If this window is a popup/tab returning from Stripe, communicate result to opener and close
    if (window.opener) {
      const result = submitted ? 'success' : 'cancel';
      try { localStorage.setItem('stripe_payment_result', JSON.stringify({ result, timestamp: Date.now() })); } catch {}
      window.close();
      return;
    }

    if (submitted) {
      this.submitted.set(true);
      return;
    }

    // AI Smart Assistant prefill: from the ?prefill= param (Review & submit) OR the
    // chat's own sessionStorage, so the collected details carry over even if the
    // user reached this page another way (e.g. tapped a service link mid-chat).
    // Never make the user re-enter what they already told the assistant.
    const prefillParam = this.route.snapshot.queryParamMap.get('prefill');
    if (prefillParam) {
      try {
        // Unicode-safe base64 fallback chain: new format → old format.
        this.chatPrefillData = JSON.parse(decodeURIComponent(escape(atob(prefillParam)))) as Record<string, unknown>;
      } catch {
        try { this.chatPrefillData = JSON.parse(atob(prefillParam)) as Record<string, unknown>; }
        catch { /* ignore invalid prefill */ }
      }
    }
    if (!this.chatPrefillData) {
      try {
        const raw = sessionStorage.getItem('msvc_guest_prefill');
        if (raw) this.chatPrefillData = JSON.parse(raw) as Record<string, unknown>;
      } catch { /* ignore */ }
    }
    // Fallback for service hyperlinks opened in new tab (sessionStorage per-tab).
    if (!this.chatPrefillData) {
      try {
        const raw = localStorage.getItem('msvc_latest_chat_prefill');
        if (raw) this.chatPrefillData = JSON.parse(raw) as Record<string, unknown>;
      } catch { /* ignore */ }
    }
    if (this.chatPrefillData) this.applyChatPrefill(this.chatPrefillData);

    // Direct service link from the chat (e.g. ?category=<childId>): preselect the
    // category. load() then resolves its parent + child dropdowns.
    const categoryParam = this.route.snapshot.queryParamMap.get('category');
    if (categoryParam) this.f.categoryId = categoryParam;

    // Chat prefill is the most recent intent — let it win over older saved guest
    // data so we never overwrite what the assistant just collected.
    const saved = this.auth.getGuestData();
    if (saved && !this.chatPrefillData) this.restoreForm(saved);
    this.load();
  }

  private restoreForm(saved: GuestQuoteData): void {
    if (saved.categoryId) this.f.categoryId = saved.categoryId;
    if (saved.contactName) this.f.contactName = saved.contactName;
    if (saved.contactNumber) this.f.contactNumber = saved.contactNumber;
    if (saved.notes) this.f.notes = saved.notes;
    if (saved.addressNo) this.f.addressNo = saved.addressNo;
    if (saved.streetDetails) this.f.streetDetails = saved.streetDetails;
    if (saved.postcode) this.f.newAddressPostcode = saved.postcode;
    if (saved.district) this.f.newAddressDistrict = saved.district;
    if (saved.state) this.f.newAddressState = saved.state;
    if (saved.propertyType) this.f.newAddressPropertyType = saved.propertyType;
    if (saved.timeSlot) this.f.timeSlot = saved.timeSlot;
    if (saved.preferredDate) this.f.preferredDate = saved.preferredDate;
    if (saved.budgetIndex) this.f.budgetIndex = saved.budgetIndex;
    if (saved.paymentMode) {
      if (saved.paymentMode === 'pay_now') { this.f.paymentTiming = 'pay_now'; }
      else { this.f.paymentTiming = 'pay_later'; this.f.settlementMethod = 'cash'; }
    }
  }

  /** Chat-assistant prefill (param or sessionStorage), kept so budget can be applied
   *  AFTER the category resolves (onCategoryChange resets the budget). */
  private chatPrefillData: Record<string, unknown> | null = null;

  /** Apply every field the chat collected. Budget is applied later (load()), after
   *  onCategoryChange has reset it. */
  private applyChatPrefill(p: Record<string, unknown>): void {
    const str = (k: string) => (typeof p[k] === 'string' && p[k] ? (p[k] as string) : undefined);
    if (str('categoryId')) this.f.categoryId = str('categoryId')!;
    if (str('contactName')) this.f.contactName = str('contactName')!;
    if (str('contactNumber')) this.f.contactNumber = str('contactNumber')!;
    if (str('addressNo')) this.f.addressNo = str('addressNo')!;
    if (str('streetDetails')) this.f.streetDetails = str('streetDetails')!;
    if (str('address') && !str('streetDetails')) this.f.streetDetails = str('address')!;
    if (str('postcode')) this.f.newAddressPostcode = str('postcode')!;
    if (str('district')) this.f.newAddressDistrict = str('district')!;
    if (str('state')) this.f.newAddressState = str('state')!;
    if (str('propertyType')) this.f.newAddressPropertyType = str('propertyType')!;
    if (str('newAddressPostcode') && !str('postcode')) this.f.newAddressPostcode = str('newAddressPostcode')!;
    if (typeof p['newAddressLat'] === 'number') this.f.newAddressLat = p['newAddressLat'] as number;
    if (typeof p['newAddressLng'] === 'number') this.f.newAddressLng = p['newAddressLng'] as number;
    if (str('timeSlot')) this.f.timeSlot = str('timeSlot')!;
    if (str('preferredDate')) this.f.preferredDate = str('preferredDate')!;
    if (str('notes')) this.f.notes = str('notes')!;
    if (p['serviceDetails'] && typeof p['serviceDetails'] === 'object') {
      this.f.answers = { ...(p['serviceDetails'] as Record<string, unknown>) };
    }
  }

  /**
   * Pick the budget bracket for the chat's prefilled budget, against the loaded ranges:
   *   1. the explicit index from the chat budget card, if it's in range;
   *   2. else the bracket that CONTAINS the free-text amount (budgetMax, then budgetMin) —
   *      or the highest open-ended bracket if it exceeds them all;
   *   3. else the first bracket.
   * Without (2), a free-text amount ("rm1580") carried no index and silently fell to
   * bracket 0 (the lowest), submitting the wrong budget.
   */
  private matchChatBudgetBracket(ranges: { min: number; max: number | null }[]): number {
    const p = this.chatPrefillData;
    const bi = p?.['budgetIndex'];
    if (bi != null && bi !== '') {
      const idx = Number(bi);
      if (!Number.isNaN(idx) && idx >= 0 && idx < ranges.length) return idx;
    }
    const amt = Number(p?.['budgetMax'] ?? p?.['budgetMin']);
    if (!Number.isNaN(amt) && amt > 0) {
      const within = ranges.findIndex((r) => amt >= r.min && (r.max == null || amt <= r.max));
      return within >= 0 ? within : ranges.length - 1;
    }
    return 0;
  }

  load(): void {
    this.loadError.set(false);
    this.api.get<{ data: Category[] }>('/categories', { scope: 'all' }).subscribe({
      next: (r) => {
        this.categories.set(r.data ?? []);
        if (this.f.categoryId) {
          const child = (r.data ?? []).find((c) => c.id === this.f.categoryId);
          if (child) this.parentId.set(child.parentCategoryId ?? '');
          this.onCategoryChange(this.f.categoryId);
          // The chat's budget bracket is applied in loadBudgetRanges' callback (it needs
          // the loaded ranges to validate the index / match a free-text amount).
        }
      },
      error: () => this.loadError.set(true),
    });
  }

  private loadBudgetRanges(categoryId: string): void {
    if (!categoryId) return;
    this.api
      .get<{ ranges: { min: number; max: number | null }[] }>('/quotes/budget-ranges', { categoryId })
      .subscribe({
        next: (r) => {
          this.budgetRanges.set(r.ranges ?? []);
          // Select the bracket for the chat's budget when none is chosen yet. A
          // free-text amount ("rm1580") carries budgetMax but no index, so without
          // the contains-match below it fell to bracket 0 (the lowest) and submitted
          // the wrong budget.
          if (this.f.budgetIndex === '' && (r.ranges?.length ?? 0) > 0) {
            const idx = this.matchChatBudgetBracket(r.ranges);
            this.f.budgetIndex = String(idx);
            this.budgetSlider = idx;
          }
        },
        error: () => {},
      });
  }

  private fetchEstimate(): void {
    if (this.f.budgetIndex === '') { this.estimateData.set(null); return; }
    const range = this.budgetRanges()[Number(this.f.budgetIndex)];
    if (!range) { this.estimateData.set(null); return; }

    this.estimateLoading.set(true);
    const params: Record<string, string> = {
      categoryId: this.f.categoryId,
      budgetMin: String(range.min),
    };
    if (range.max != null) params['budgetMax'] = String(range.max);

    this.api.get<EstimateResult>('/quotes/estimate', params).subscribe({
      next: (r) => { this.estimateLoading.set(false); this.estimateData.set(r); },
      error: () => { this.estimateLoading.set(false); this.estimateData.set(null); },
    });
  }

  addressLabel(): string {
    return [this.f.addressNo, this.f.streetDetails].filter(Boolean).join(', ') || ' - ';
  }

  onParentChange(parentId: string): void {
    this.parentId.set(parentId);
    this.f.categoryId = '';
    this.f.answers = {};
    this.f.budgetIndex = '';
    this.budgetSlider = 0;
    this.questions.set([]);
    this.budgetRanges.set([]);
    this.clearError('category');
    this.stepError.set('');
  }

  onCategoryChange(id: string): void {
    this.f.categoryId = id;
    this.f.answers = {};
    this.f.budgetIndex = '';
    this.budgetSlider = 0;
    const cat = this.categories().find((c) => c.id === id);
    this.questions.set(cat?.questionSchema ?? []);
    this.loadBudgetRanges(id);
    this.clearError('category');
  }

  onBudgetSlide(idx: number): void {
    this.budgetSlider = idx;
    this.f.budgetIndex = String(idx);
    this.clearError('budgetIndex');
  }

  onTimingChange(): void {
    if (this.f.paymentTiming === 'pay_now') {
      this.f.settlementMethod = 'gateway';
    } else {
      this.f.settlementMethod = 'cash';
    }
  }

  demoAutoFill(): void {
    this.stepError.set('');
    this.fieldErrors.clear();

    this.f.contactName = 'Zen';
    this.f.contactNumber = '011-39296559';
    this.f.addressNo = '12';
    this.f.streetDetails = 'Jalan SS2/72';
    this.f.newAddressPostcode = '47300';
    this.f.newAddressDistrict = 'SS2';
    this.f.newAddressState = 'Selangor';
    this.f.newAddressPropertyType = 'landed';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.f.preferredDate = tomorrow.toISOString().split('T')[0];
    this.f.timeSlot = 'morning';
    this.f.paymentTiming = 'pay_now';
    this.f.settlementMethod = 'gateway';
    this.f.notes = 'Register at guard house, park at visitor lot B, management office open 9am-5pm';

    const cats = this.categories();
    const plumber = cats.find((c) => c.slug === 'plumber');
    const firstChild = plumber ?? cats.find((c) => c.parentCategoryId) ?? cats[0];
    if (firstChild) {
      this.parentId.set(firstChild.parentCategoryId ?? '');
      this.onCategoryChange(firstChild.id);
      // Fill question schema answers - questions() is populated synchronously by onCategoryChange
      const answers: Record<string, unknown> = {};
      for (const q of this.questions() ?? []) {
        const opts = q.options ?? [];
        if (q.type === 'radio') {
          answers[q.key] = opts[Math.floor(Math.random() * Math.max(opts.length, 1))]?.value ?? '';
        } else if (q.type === 'checkbox') {
          answers[q.key] = opts.length ? [opts[0].value] : [];
        } else if (q.type === 'text') {
          answers[q.key] = 'Standard service required';
        } else if (q.type === 'number') {
          answers[q.key] = 1;
        } else if (q.type === 'quantity') {
          answers[q.key] = opts.length ? { [opts[0].value]: 1 } : {};
        }
      }
      this.f.answers = answers;
      setTimeout(() => {
        const ranges = this.budgetRanges();
        const idx = ranges.findIndex((r) => r.min === 100 && r.max === 500);
        this.budgetSlider = idx >= 0 ? idx : 0;
        this.f.budgetIndex = String(this.budgetSlider);
      }, 300);
    }
  }

  goToBill(): void {
    this.step.set(4);
    this.stepError.set('');
    this.fetchEstimate();
  }

  isChecked(key: string, value: string): boolean {
    const arr = this.f.answers[key];
    return Array.isArray(arr) && arr.includes(value);
  }
  toggleCheck(key: string, value: string): void {
    const arr: string[] = (this.f.answers[key] as string[]) || [];
    const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
    this.f.answers[key] = next;
  }
  radioValue(key: string): string { return this.f.answers[key] as string; }
  setRadio(key: string, value: string): void { this.f.answers[key] = value; }
  textValue(key: string): string { return this.f.answers[key] as string; }
  setText(key: string, value: string): void { this.f.answers[key] = value; }
  qtyValue(key: string, optionValue: string): number {
    const a = this.f.answers[key];
    if (a && typeof a === 'object' && !Array.isArray(a)) return (a as Record<string, number>)[optionValue] ?? 0;
    return 0;
  }
  incQty(key: string, optionValue: string): void {
    const map = (this.f.answers[key] && typeof this.f.answers[key] === 'object' && !Array.isArray(this.f.answers[key]))
      ? { ...(this.f.answers[key] as Record<string, number>) } : {};
    map[optionValue] = (map[optionValue] ?? 0) + 1;
    this.f.answers = { ...this.f.answers, [key]: map };
  }
  decQty(key: string, optionValue: string): void {
    const map = (this.f.answers[key] && typeof this.f.answers[key] === 'object' && !Array.isArray(this.f.answers[key]))
      ? { ...(this.f.answers[key] as Record<string, number>) } : {};
    const cur = map[optionValue] ?? 0;
    if (cur > 0) map[optionValue] = cur - 1;
    this.f.answers = { ...this.f.answers, [key]: map };
  }
  numberValue(key: string): number | null {
    const a = this.f.answers[key];
    return typeof a === 'number' ? a : null;
  }
  setNumber(key: string, value: number | string): void {
    const n = value === '' || value === null ? null : Number(value);
    this.f.answers = { ...this.f.answers, [key]: n };
  }

  clearError(field: string): void { this.fieldErrors.delete(field); }
  hasError(field: string): boolean { return this.fieldErrors.has(field); }
  private setErrors(fields: string[], msg: string): void {
    for (const f of fields) this.fieldErrors.add(f);
    this.stepError.set(msg);
  }

  categoryName(): string { return this.categories().find((c) => c.id === this.f.categoryId)?.name ?? ' - '; }
  timeSlotLabel(): string { return TIME_SLOTS.find((t) => t.value === this.f.timeSlot)?.label ?? this.f.timeSlot; }
  rangeLabel(r: { min: number; max: number | null }): string {
    return r.max == null ? `RM ${r.min}+` : `RM ${r.min}–${r.max}`;
  }
  budgetLabel(): string {
    if (this.f.budgetIndex === '') return ' - ';
    const r = this.budgetRanges()[Number(this.f.budgetIndex)];
    return r ? this.rangeLabel(r) : ' - ';
  }
  answerLabel(q: { key: string; label: string; type?: string; options?: { value: string; label: string }[] }): string {
    const a = this.f.answers[q.key];
    if (a == null) return '';
    const labelFor = (v: string) => q.options?.find((o) => o.value === v)?.label ?? v;
    if (Array.isArray(a)) return a.map(labelFor).join(', ');
    if (q.type === 'quantity' && typeof a === 'object' && !Array.isArray(a)) {
      const parts: string[] = [];
      for (const [k, cnt] of Object.entries(a as Record<string, number>)) {
        if (cnt > 0) parts.push(`${labelFor(k)} ×${cnt}`);
      }
      return parts.join(', ') || ' - ';
    }
    if (q.type === 'number') return typeof a === 'number' ? String(a) : String(a);
    return typeof a === 'string' ? a : labelFor(String(a));
  }

  goToStep(n: number): void {
    if (n > this.step()) return;
    this.step.set(n);
    this.stepError.set('');
  }

  goToContact(): void {
    this.fieldErrors.clear();
    this.stepError.set('');
    const errs: string[] = [];
    if (!this.f.categoryId) errs.push('category');
    if (this.f.budgetIndex === '') errs.push('budgetIndex');
    if (errs.length > 0) { this.setErrors(errs, 'Please fill in all required fields.'); return; }
    this.step.set(2);
  }

  /** Normalise the contact number to +60 form when the field loses focus. */
  onPhoneBlur(): void {
    this.f.contactNumber = normalizeMyPhone(this.f.contactNumber);
  }

  goToSummary(): void {
    this.f.contactNumber = normalizeMyPhone(this.f.contactNumber);
    this.fieldErrors.clear();
    this.stepError.set('');
    const errs: string[] = [];
    if (!this.f.contactName.trim()) errs.push('contactName');
    else if (this.f.contactName.trim().length < 2) errs.push('contactName');
    if (!this.f.contactNumber.trim()) errs.push('contactNumber');
    else if (!/^[0-9+\-\s()]{6,20}$/.test(this.f.contactNumber)) errs.push('contactNumber');
    if (!this.f.addressNo.trim()) errs.push('addressNo');
    if (!this.f.streetDetails.trim()) errs.push('streetDetails');
    if (!this.f.newAddressPostcode.trim()) errs.push('postcode');
    if (!this.f.newAddressPropertyType) errs.push('propertyType');
    if (!this.f.preferredDate) errs.push('preferredDate');
    if (!this.f.timeSlot) errs.push('timeSlot');
    if (errs.length > 0) {
      const first = errs[0];
      let msg: string;
      if (first === 'contactName') {
        msg = this.f.contactName.trim().length < 2 && this.f.contactName.trim().length > 0
          ? 'Name must be at least 2 characters'
          : 'Please fill in all required fields.';
      } else if (first === 'contactNumber') {
        msg = this.f.contactNumber.trim() && !/^[0-9+\-\s()]{6,20}$/.test(this.f.contactNumber)
          ? 'Please enter a valid phone number'
          : 'Please fill in all required fields.';
      } else {
        msg = 'Please fill in all required fields.';
      }
      this.setErrors(errs, msg);
      return;
    }
    this.step.set(3);
  }

  private startGuestCountdown(): void {
    this.guestCountdown.set(3);
    this.guestCountdownTimer = setInterval(() => {
      const n = this.guestCountdown() - 1;
      this.guestCountdown.set(n);
      if (n <= 0) this.goHomeNow();
    }, 1000);
  }

  goHomeNow(): void {
    if (this.guestCountdownTimer) { clearInterval(this.guestCountdownTimer); this.guestCountdownTimer = null; }
    this.router.navigate(['/']);
  }

  ngOnDestroy(): void {
    this.qaForm.unregister(this.qaWalker);
    if (this.guestCountdownTimer) { clearInterval(this.guestCountdownTimer); this.guestCountdownTimer = null; }
  }

  /**
   * QA walk: step the form Service → Contact → Summary, capturing each page's prefilled
   * values + any validation block, then STOP at the Summary (no submit, no DB write).
   * Returns one log line per page for the QA report.
   */
  private async qaWalkAndVerify(demo = false): Promise<string[]> {
    const out: string[] = [];
    // Demo: linger ~3s on each page so a viewer can read it; QA: walk fast.
    const dwell = () => (demo ? new Promise<void>((r) => setTimeout(r, 3000)) : Promise.resolve());
    const v = (s: string | undefined | null) => (s && String(s).trim() ? String(s).trim() : "-");
    const snap = () =>
      `cat=${this.f.categoryId ? "set" : "-"} date=${v(this.f.preferredDate)} time=${v(this.f.timeSlot)} ` +
      `no=${v(this.f.addressNo)} street=${v(this.f.streetDetails)} postcode=${v(this.f.newAddressPostcode)} ` +
      `district=${v(this.f.newAddressDistrict)} state=${v(this.f.newAddressState)} type=${v(this.f.newAddressPropertyType)} ` +
      `budget=${this.f.budgetIndex === "" ? "-" : this.f.budgetIndex} name=${v(this.f.contactName)} phone=${v(this.f.contactNumber)}`;

    this.step.set(1);
    out.push(`FORM page 1 (Service & Details): ${snap()}`);
    await dwell();
    this.goToContact();
    if (this.step() === 1) {
      out.push(`  FORM ISSUE: blocked at page 1 — "${this.stepError()}" [${[...this.fieldErrors].join(", ")}]`);
      return out;
    }

    out.push(`FORM page 2 (Contact): ${snap()}`);
    await dwell();
    this.goToSummary();
    if (this.step() === 2) {
      out.push(`  FORM ISSUE: blocked at page 2 — "${this.stepError()}" [${[...this.fieldErrors].join(", ")}]`);
      return out;
    }

    out.push(`FORM page 3 (Summary) reached OK — verified, stopping (no submit): ${snap()}`);
    await dwell(); // hold on the summary so it's visible at the end of the demo
    return out;
  }

  save(): void {
    if (!this.f.agreeTerms) { this.stepError.set('Please agree to the platform terms.'); return; }

    this.saving.set(true);

    const r = this.f.budgetIndex !== '' ? this.budgetRanges()[Number(this.f.budgetIndex)] : undefined;
    const paymentMode =
      this.f.paymentTiming === 'pay_now' ? 'pay_now'
      : this.f.settlementMethod === 'cash' ? 'cash'
      : 'pay_later';

    const address = [this.f.addressNo, this.f.streetDetails].filter(Boolean).join(', ');
    const payload: Record<string, unknown> = {
      categoryId: this.f.categoryId,
      contactName: this.f.contactName,
      contactNumber: this.f.contactNumber,
      address,
      timeSlot: this.f.timeSlot,
      preferredDate: this.f.preferredDate,
      notes: this.f.notes,
      paymentMode,
    };
    if (r) { payload['budgetMin'] = r.min; if (r.max != null) payload['budgetMax'] = r.max; }
    if (paymentMode !== 'pay_now') payload['settlementMethod'] = this.f.settlementMethod;
    if (this.f.newAddressLat != null) payload['lat'] = this.f.newAddressLat;
    if (this.f.newAddressLng != null) payload['lng'] = this.f.newAddressLng;
    if (this.f.newAddressPostcode) payload['postcode'] = this.f.newAddressPostcode;
    if (this.f.newAddressDistrict) payload['district'] = this.f.newAddressDistrict;
    if (this.f.newAddressState) payload['state'] = this.f.newAddressState;
    if (this.f.newAddressPropertyType) payload['propertyType'] = this.f.newAddressPropertyType;
    const serviceDetails: Record<string, unknown> = { ...this.f.answers };
    if (this.f.extraNotes.trim()) serviceDetails['_extraNotes'] = this.f.extraNotes.trim();
    if (Object.keys(serviceDetails).length > 0) payload['serviceDetails'] = serviceDetails;

    this.api.post<{ id: string; stripeUrl?: string; stripeSessionId?: string }>('/quotes/guest', payload).subscribe({
      next: (r) => {
        this.auth.saveGuestData({
          categoryId: this.f.categoryId,
          contactName: this.f.contactName,
          contactNumber: this.f.contactNumber,
          notes: this.f.notes,
          addressNo: this.f.addressNo,
          streetDetails: this.f.streetDetails,
          postcode: this.f.newAddressPostcode,
          district: this.f.newAddressDistrict,
          state: this.f.newAddressState,
          propertyType: this.f.newAddressPropertyType,
          timeSlot: this.f.timeSlot,
          preferredDate: this.f.preferredDate,
          budgetIndex: this.f.budgetIndex,
          paymentMode,
        });

        if (r.stripeUrl && r.stripeSessionId) {
          this.stripeProcessing.set(true);
          this.stripePayment.openGuestPayment({
            url: r.stripeUrl,
            sessionId: r.stripeSessionId,
            onSuccess: () => {
              this.saving.set(false);
              this.submitted.set(true);
              this.startGuestCountdown();
            },
            onCancel: () => {
              this.saving.set(false);
              this.stripeProcessing.set(false);
            },
          });
          return;
        }

        this.saving.set(false);
        this.submitted.set(true);
        this.startGuestCountdown();
      },
      error: (e) => {
        this.stepError.set(e?.message ?? 'Could not submit quote. Please try again.');
        this.saving.set(false);
      },
    });
  }
}
