import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { DemoUnlockService } from '../../core/services/demo-unlock.service';
import { QuoteAssistBridge, QuoteFormContext } from '../../core/services/quote-assist-bridge.service';
import { StripePaymentService } from '../../core/services/stripe-payment.service';
import { ModalComponent } from '../../shared/modal.component';
import { AddressFieldsComponent } from '../../shared/address-fields.component';
import { PhoneInputComponent } from '../../shared/phone-input.component';
import { CalendarPickerComponent } from '../../shared/calendar-picker.component';
import { IconComponent } from '../../shared/icon.component';
import { StripeCardFormComponent } from '../../shared/stripe-card-form.component';
import { TIME_SLOTS } from '../../shared/constants/time-slots';
import { normalizeMyPhone } from '../../shared/phone.util';

interface QuoteQuestion {
  key: string;
  label: string;
  type: 'checkbox' | 'radio' | 'text' | 'quantity' | 'number';
  required: boolean;
  description?: string;
  active?: boolean;
  options?: { value: string; label: string; active?: boolean }[];
}
interface Category {
  id: string;
  name: string;
  slug?: string;
  parentCategoryId?: string | null;
  questionSchema?: QuoteQuestion[] | null;
  allowedTimeSlots?: string[];
  photosEnabled?: boolean;
}
interface Address {
  id: string;
  label: string;
  address: string;
  propertyType?: string;
  postcode?: string;
  district?: string;
  state?: string;
}
interface Preset {
  id: string;
  label?: string | null;
  contactName: string;
  contactNumber: string;
  addressId: string;
  address?: { id: string; label: string; address: string };
  instruction?: string | null;
  preferredTimeSlot?: string | null;
  isDefault: boolean;
}
interface BudgetRange {
  min: number;
  max: number | null;
}
interface EstimateResult {
  subtotal: number;
  promoDiscount: number;
  promoError?: string;
  serviceCharge: number;
  sst: number;
  total: number;
  note: string;
  travelFee?: { amount: number; nonRefundable: boolean };
  inspectionFee?: { amount: number; nonRefundable: boolean };
  holdAmount?: number;
  estimatedReturn?: number;
}

/** Payment mode → [paymentTiming, settlementMethod] mapping used by chat/reorder prefill. */
const PAYMENT_MODE_MAP: Record<string, readonly [string, string]> = {
  pay_now: ['pay_now', 'credit'] as const,
  cash: ['pay_later', 'cash'] as const,
  pay_later: ['pay_later', 'credit'] as const,
};

@Component({
    selector: 'app-quote-form',
    host: { class: 'page-enter' },
    imports: [FormsModule, RouterLink, ModalComponent, AddressFieldsComponent, PhoneInputComponent, CalendarPickerComponent, IconComponent, StripeCardFormComponent],
    template: `
    <div class="page-head">
      <h1>Request a quote</h1>
      @if (config.hasDemoData && unlock.unlocked()) {
        <button class="btn-autofill" type="button" (click)="demoAutoFill()">⚡ Demo: Auto-fill</button>
      }
    </div>

    @if (submitted()) {
      <!-- ── Confirmation state ──────────────────────────────────────────── -->
      <div class="card confirm-card page-child">
        <div class="confirm-icon">✓</div>
        <h2 class="confirm-heading">Request Confirmed!</h2>
        <p class="confirm-sub">
          <strong>{{ submittedCategory() }}</strong> - your request has been sent to nearby servicers.
        </p>
        @if (submittedQuoteId()) {
          <p class="confirm-id muted">Request ID: #{{ submittedQuoteId().slice(-6).toUpperCase() }}</p>
        }

        @if (submittedProposalCount() > 0) {
          <div class="confirm-proposals-banner">
            You already got <strong>{{ submittedProposalCount() }}</strong> proposal{{ submittedProposalCount() > 1 ? 's' : '' }} for this request - pick your servicer now!
            <a class="confirm-proposals-link" (click)="goToQuotesNow()">View proposals →</a>
          </div>
        }

        <p class="confirm-wa-note muted">Your servicer may contact you via phone or WhatsApp using the number you provided.</p>

        <p class="confirm-countdown muted">
          Redirecting to My Quotes in {{ confirmCountdown() }}…
        </p>
        <button class="btn-primary" (click)="goToQuotesNow()">Go now →</button>
      </div>
    } @else if (loadError()) {
      <div class="card load-err">Could not load the form. Please refresh the page.</div>
    } @else {

    <!-- Stepper -->
    <div class="card stepper">
      @for (s of steps; track s.n) {
        <button
          class="step"
          [class.on]="step() === s.n"
          [class.done]="step() > s.n"
          [disabled]="s.n > step()"
          (click)="goToStep(s.n)"
        >
          <span class="dot">{{ step() > s.n ? '✓' : s.n }}</span>
          <span>{{ s.label }}</span>
        </button>
      }
    </div>

    @if (noAddress()) {
      <div class="card warn">
        You don't have a saved address yet, and a quote needs one.
        <a routerLink="/customer/account">Add an address</a> to continue.
      </div>
    }

    <!-- ── Step 1 - Choose service ──────────────────────────────────────────── -->
    @if (step() === 1) {
      <div class="card pane page-child">
        @if (rebookServicerId()) {
          <!-- Locked rebook: servicer + category are fixed; no category choice. -->
          <div class="rebook-lock">
            <span class="rebook-badge">Rebooking</span>
            <div class="rebook-info">
              <strong>{{ rebookServicerName() }}</strong>
              <span class="muted">{{ categoryName() }} · this request goes to them only</span>
            </div>
          </div>
        } @else {
        <!-- Quick search bar - find a service by name, auto-fills both dropdowns -->
        <div class="svc-search" [class.open]="searchFocused() && filteredChildren().length > 0">
          <span class="svc-search-ic"><app-icon name="search" sizeToken="sm" /></span>
          <input
            type="text"
            class="svc-search-inp"
            [ngModel]="serviceSearch()"
            (ngModelChange)="onServiceSearch($event)"
            (focus)="searchFocused.set(true)"
            (blur)="onSearchBlur()"
            name="svcSearch"
            placeholder="Search for a service…"
            autocomplete="off"
          />
          @if (searchFocused() && filteredChildren().length > 0) {
            <ul class="svc-search-drop">
              @for (c of filteredChildren(); track c.id) {
                <li (mousedown)="onSearchPick(c.id, c.parentCategoryId ?? '')">
                  <strong>{{ c.name }}</strong>
                  <span class="svc-search-parent">{{ parentName(c.parentCategoryId) }}</span>
                </li>
              }
            </ul>
          }
        </div>

        <div class="cat-row">
          <label class="cat-field" [class.field-invalid]="hasError('parentCat')">
            <select [ngModel]="parentId()" (ngModelChange)="onParentChange($event)" name="parentCat">
              <option value="">Select category here</option>
              @for (p of parentOptions(); track p.id) {
                <option [value]="p.id">{{ p.name }}</option>
              }
            </select>
            @if (hasError('parentCat')) {
              <span class="field-msg">Please choose a category.</span>
            }
          </label>
          <label class="cat-field" [class.field-invalid]="hasError('category')">
            <select [ngModel]="categoryId()" (ngModelChange)="onCategoryChange($event)" name="cat" [disabled]="!parentId()">
              <option value="">{{ parentId() ? 'Select a type of service' : 'Choose a category first' }}</option>
              @for (c of childOptions(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
            @if (hasError('category')) {
              <span class="field-msg">Please choose a type of service.</span>
            }
          </label>
        </div>
        }

        @if (categoryId()) {
          @for (q of questions(); track q.key) {
            <div class="qgroup" [class.field-invalid]="hasError(q.key)">
              <span class="qlabel">{{ q.label }}@if (q.required) {<span class="req">*</span>}</span>
              @if (q.type === 'checkbox') {
                <div class="opts">
                  @for (o of activeOptions(q.options); track o.value) {
                    <label class="opt">
                      <input type="checkbox" [checked]="isChecked(q.key, o.value)" (change)="toggleCheck(q.key, o.value)" />
                      <span>{{ o.label }}</span>
                    </label>
                  }
                </div>
              } @else if (q.type === 'radio') {
                <div class="opts">
                  @for (o of activeOptions(q.options); track o.value) {
                    <label class="opt">
                      <input type="radio" [name]="q.key" [checked]="radioValue(q.key) === o.value" (change)="setRadio(q.key, o.value)" />
                      <span>{{ o.label }}</span>
                    </label>
                  }
                </div>
              } @else if (q.type === 'quantity') {
                <div class="qty-list">
                  @for (o of activeOptions(q.options); track o.value) {
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
              @if (hasError(q.key)) { <span class="field-msg">This field is required.</span> }
            </div>
          }

          <label>
            Extra Details: <span class="muted">(optional)</span>
            <textarea rows="2" [(ngModel)]="f.extraNotes" name="extraNotes" maxlength="1000" placeholder="Anything else the servicer should know about this service…"></textarea>
          </label>

          @if (budgetRanges().length > 0) {
            <div class="budget-group" [class.field-invalid]="hasError('budgetIndex')">
              <div class="budget-header">
                <span class="qlabel">Budget range<span class="req">*</span></span>
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
              @if (hasError('budgetIndex')) {
                <span class="field-msg">Please select a budget range.</span>
              }
            </div>
          }
        }

        @if (stepError()) { <p class="err">{{ stepError() }}</p> }
        <div class="actions">
          <button class="btn-primary" (click)="goToContact()">Next: Contact →</button>
        </div>
      </div>
    }

    <!-- ── Step 2 - Contact ─────────────────────────────────────────────── -->
    @if (step() === 2) {
      <div class="card pane page-child">

        <!-- Preset actions - save the current details, or auto-fill from a saved preset -->
        <div class="preset-row">
          <button type="button" class="btn-ghost btn-save-preset" (click)="openSavePreset()"
                  [disabled]="!f.contactName.trim() || !f.contactNumber.trim() || (!f.addressId && !f.streetDetails.trim())">
            <span class="sp">+</span> Save as Preset
          </button>
          <span class="preset-or">or</span>
          <div class="af-section">
            <button type="button" class="btn-ghost af-trigger" (click)="toggleAutoFill()">
              <app-icon name="chevron-down" sizeToken="sm" />
              Auto-fill <span class="muted">(use preset)</span>
            </button>
            @if (autoFillOpen()) {
              <div class="af-dropdown">
                @if (presetsLoading()) {
                  @for (_ of [0,1,2]; track _; let i = $index) {
                    <div class="af-item bw-skeleton">
                      <span class="card-cover"></span>
                      <span class="bw-scan1" [style.animation-delay.ms]="(-700 + i * 350) % 1200 - 1200"></span>
                      <span class="bw-scan2" [style.animation-delay.ms]="(i * 350) % 1400 - 1400"></span>
                      <span class="bw-sweep1" [style.animation-delay.ms]="(-1300 + i * 350) % 1800 - 1800"></span>
                      <span class="bw-sweep2" [style.animation-delay.ms]="(-600 + i * 350) % 900 - 900"></span>
                      <strong class="sk-line sk-title">&nbsp;</strong>
                      <span class="sk-line sk-sub">&nbsp;</span>
                    </div>
                  }
                } @else {
                  @for (p of presets(); track p.id) {
                    <button type="button" class="af-item" (click)="applyPreset(p.id); autoFillOpen.set(false)">
                      <strong>{{ p.label || p.contactName }}</strong>
                      <span class="muted small">{{ p.contactNumber }} - {{ p.address?.address || '' }}</span>
                    </button>
                  }
                  @if (presets().length === 0) {
                    <span class="muted small af-empty">No saved presets</span>
                  }
                }
              </div>
            }
          </div>
        </div>

        <!-- Name + Phone No -->
        <div class="row">
          <label [class.field-invalid]="hasError('contactName')">
            <span class="label-text">Name<span class="req">*</span></span>
            <input [(ngModel)]="f.contactName" name="contactName" maxlength="100" (ngModelChange)="clearError('contactName')" />
            @if (hasError('contactName')) { <span class="field-msg">Name is required.</span> }
          </label>
          <label [class.field-invalid]="hasError('contactNumber')">
            <span class="label-text">Phone No<span class="req">*</span></span>
            <app-phone-input [(ngModel)]="f.contactNumber" name="contactNumber" (ngModelChange)="clearError('contactNumber')"></app-phone-input>
            @if (hasError('contactNumber')) { <span class="field-msg">Phone number is required.</span> }
          </label>
        </div>

        <!-- Address hint when auto-fill couldn't parse a house number -->
        @if (stepHint()) { <p class="hint" style="margin-bottom:0.5rem">{{ stepHint() }}</p> }
        <!-- Building/Premise instructions - moved above address -->
        <label><span>Enter Building/Premise Instructions <span class="muted">(optional)</span></span>
          <textarea rows="2" [(ngModel)]="f.notes" name="notes" maxlength="1000" placeholder="Register at guard house, park at visitor lot B, management office open 9am-5pm"></textarea>
        </label>
        <!-- Address No + Street Details + Google Maps / GPS -->
        <app-address-fields
          [(addressNo)]="f.addressNo"
          [(streetDetails)]="f.streetDetails"
          [(postcode)]="f.newAddressPostcode"
          [(district)]="f.newAddressDistrict"
          [(state)]="f.newAddressState"
          [(propertyType)]="f.newAddressPropertyType"
          [(lat)]="f.newAddressLat"
          [(lng)]="f.newAddressLng"
          [errors]="fieldErrors()"
          (clearError)="clearError($event)"
          (userEntered)="f.addressId = ''"
        />

        @if (isCondoAddress()) {
          <div class="condo-note">{{ condoEntryNote() }}</div>
        }

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

    <!-- ── Step 3 - Summary ─────────────────────────────────────────────── -->
    @if (step() === 3) {
      <div class="card pane page-child">
        <h2>Review your request</h2>
        <dl class="review">
          <dt>Preferred Time + Date</dt>
          <dd>{{ timeSlotLabel(f.timeSlot) }} · {{ f.preferredDate || ' - ' }}</dd>
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
        <p class="prefill-warning">⚠️ Please double-check your contact and address above. They cannot be changed or updated once the request is sent.</p>
        <p class="looks-good muted">Looks good? Choose how you'd like to pay on the next step.</p>

        <div class="actions">
          <button class="btn-ghost" (click)="step.set(2)">← Back</button>
          <button class="btn-primary" (click)="goToBill()">Next: Bill →</button>
        </div>
      </div>
    }

    <!-- ── Step 4 - Bill ───────────────────────────────────────────────── -->
    @if (step() === 4) {
      <div class="card pane page-child">
        <h2>Payment</h2>

        <!-- Payment timing -->
        <div class="qgroup">
          <span class="qlabel">When would you like to pay?</span>
          <div class="opts">
            <label class="opt timing-opt" [class.timing-opt--on]="f.paymentTiming === 'pay_now'">
              <input
                type="radio"
                name="payTiming"
                [checked]="f.paymentTiming === 'pay_now'"
                (change)="f.paymentTiming = 'pay_now'; onTimingChange()"
              />
              <div class="timing-body">
                <strong>Pay now</strong>
                <span class="muted">RM {{ (estimateData()?.holdAmount ?? estimateData()?.total ?? 0).toFixed(2) }} held now via card or wallet</span>
              </div>
            </label>
            <label class="opt timing-opt" [class.timing-opt--on]="f.paymentTiming === 'pay_later'">
              <input
                type="radio"
                name="payTiming"
                [checked]="f.paymentTiming === 'pay_later'"
                (change)="f.paymentTiming = 'pay_later'; onTimingChange()"
              />
              <div class="timing-body">
                <strong>Pay later</strong>
                <span class="muted">Settle after job done via card, wallet, or cash</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Settlement method -->
        @if (f.paymentTiming === 'pay_later') {
          <div class="qgroup">
            <span class="qlabel">Settlement method</span>
            <div class="opts">
              <label class="opt">
                <input type="radio" name="payMethod" [checked]="f.settlementMethod === 'credit'" (change)="f.settlementMethod = 'credit'" />
                <span>Wallet credit <span class="muted">(balance: RM {{ creditBalance().toFixed(2) }})</span></span>
              </label>
              <label class="opt">
                <input type="radio" name="payMethod" [checked]="f.settlementMethod === 'cash'" (change)="f.settlementMethod = 'cash'" />
                <span>Cash <span class="muted">(pay servicer directly after job done)</span></span>
              </label>
              <label class="opt">
                <input type="radio" name="payMethod" [checked]="f.settlementMethod === 'gateway'" (change)="f.settlementMethod = 'gateway'" />
                <span>Card <span class="muted">(Stripe payment link sent after job is done)</span></span>
              </label>
            </div>
          </div>
          <p class="no-charge-note muted">No charge until a servicer accepts your request.</p>
        }

        @if (f.paymentTiming === 'pay_now') {
          <div class="qgroup">
            <span class="qlabel">Settlement method</span>
            <div class="opts">
              <label class="opt">
                <input type="radio" name="payNowMethod" [checked]="f.settlementMethod === 'credit'" (change)="f.settlementMethod = 'credit'; cardStep.set('idle')" />
                <span>Wallet credit <span class="muted">(balance: RM {{ creditBalance().toFixed(2) }})</span></span>
              </label>
              <label class="opt">
                <input type="radio" name="payNowMethod" [checked]="f.settlementMethod === 'gateway'" (change)="onGatewaySelect()" />
                <span>Credit / Debit card</span>
              </label>
            </div>
          </div>

          @if (f.settlementMethod === 'gateway') {
            @if (cardStep() === 'intent_loading') {
              <p class="muted">Preparing payment…</p>
            } @else if (cardStep() === 'intent_ready' && clientSecret()) {
              <app-stripe-card-form
                [clientSecret]="clientSecret()!"
                [amount]="estimatedTotal() ?? 0"
                [loading]="false"
                (paymentSuccess)="onCardPaymentSuccess()"
                (paymentError)="onCardPaymentError($event)"
                (cancel)="cardStep.set('idle'); f.settlementMethod = 'credit'"
              />
            } @else if (cardStep() === 'success') {
              <p class="card-pay-ok">✓ Payment successful!</p>
            } @else if (cardStep() === 'error') {
              <p class="err">{{ cardErrorMsg() }}</p>
              <button class="btn-ghost" (click)="onGatewaySelect()">Try again</button>
            }
          }
        }

        <!-- Promo code with Apply button -->
        <label class="promo-label">
          Promo code <span class="muted">(optional)</span>
          <div class="promo-row">
            <input
              [(ngModel)]="f.promoCode"
              name="promo"
              placeholder="Enter code…"
              [disabled]="!!appliedPromoCode()"
            />
            @if (!appliedPromoCode()) {
              <button
                type="button"
                class="btn-ghost small-btn"
                (click)="applyPromo()"
                [disabled]="!f.promoCode.trim() || promoApplying()"
              >{{ promoApplying() ? 'Applying…' : 'Apply' }}</button>
            } @else {
              <button type="button" class="btn-ghost small-btn promo-remove" (click)="removePromo()">Remove</button>
            }
          </div>
          @if (promoApplySuccess()) { <span class="promo-ok">Promo code applied!</span> }
          @if (promoApplyError()) { <span class="field-msg">{{ promoApplyError() }}</span> }
        </label>

        <!-- Price Summary card -->
        <div class="est-card">
          <h3 class="est-title">Price Summary</h3>
          @if (estimateLoading()) {
            <p class="muted est-loading">Calculating…</p>
          } @else if (estimateData()) {
            <div class="est-body">
              <div class="est-row"><span>Service estimate</span><span>RM {{ estimateData()!.subtotal.toFixed(2) }}</span></div>
              @if (estimateData()!.travelFee && estimateData()!.travelFee!.amount > 0) {
                <div class="est-row"><span>Travel fee</span><span>RM {{ estimateData()!.travelFee!.amount.toFixed(2) }}</span></div>
              }
              @if (estimateData()!.promoDiscount > 0) {
                <div class="est-row est-disc">
                  <span>Promo ({{ appliedPromoCode() }})</span>
                  <span>− RM {{ estimateData()!.promoDiscount.toFixed(2) }}</span>
                </div>
              }
              @if (estimateData()!.serviceCharge > 0) {
                <div class="est-row"><span>Service charge</span><span>RM {{ estimateData()!.serviceCharge.toFixed(2) }}</span></div>
              }
              @if (estimateData()!.sst > 0) {
                <div class="est-row"><span>SST</span><span>RM {{ estimateData()!.sst.toFixed(2) }}</span></div>
              }
              <div class="est-divider"></div>
              <div class="est-row est-hold-row">
                <span>We'll hold</span>
                <strong class="est-hold-amt">RM {{ (estimateData()!.holdAmount ?? estimateData()!.total).toFixed(2) }}</strong>
              </div>
            </div>
            <p class="est-hold-note">To secure your booking, we hold your chosen budget ceiling upfront. The servicer's final price may be lower - any unused portion is returned to you automatically.</p>
            @if (estimateData()!.estimatedReturn !== undefined && estimateData()!.estimatedReturn! > 0) {
              <div class="est-refund-block">
                <div class="est-row est-refund-row"><span>Refundable</span><span>~RM {{ estimateData()!.estimatedReturn!.toFixed(2) }}</span></div>
                @if (estimateData()!.travelFee && estimateData()!.travelFee!.nonRefundable && estimateData()!.travelFee!.amount > 0) {
                  <div class="est-row est-nonrefund-row">
                    <span>Non-refundable <span class="muted">(travel &amp; inspection fees)</span></span>
                    <span>RM {{ estimateData()!.travelFee!.amount.toFixed(2) }}</span>
                  </div>
                }
              </div>
            }
            <p class="muted est-note">{{ estimateData()!.note }}</p>
          }
        </div>

        <p class="wa-disclosure muted">Your servicer may contact you via phone or WhatsApp using the number you provided.</p>

        <label class="checkbox" [class.field-invalid]="hasError('agreeTerms')">
          <input type="checkbox" [(ngModel)]="f.agreeTerms" name="agree" (ngModelChange)="clearError('agreeTerms')" />
          I've read and agree to the <a routerLink="/terms" target="_blank">Terms &amp; Conditions</a>
          @if (hasError('agreeTerms')) { <span class="field-msg">You must agree to continue.</span> }
        </label>

        @if (stepError()) { <p class="err">{{ stepError() }}</p> }
        <div class="actions">
          <button class="btn-ghost" (click)="step.set(3)">← Back</button>
          <button class="btn-primary" (click)="submit()" [disabled]="submitting()">
            {{ submitting() ? 'Submitting…' : 'Send request' }}
          </button>
        </div>
      </div>
    }

    } <!-- end @else (not loadError) -->

    <!-- Save preset modal -->
    @if (savePresetOpen()) {
      <app-modal [open]="true" title="Save as preset" (closed)="savePresetOpen.set(false)">
        <form class="save-preset-form" (ngSubmit)="doSavePreset()">
          <label>
            Preset name <span class="muted small">(e.g. Home, Office, Parents)</span>
            <input [(ngModel)]="savePresetLabel" name="spLabel" placeholder="Home" maxlength="50" />
          </label>
          @if (savePresetError()) {
            <p class="err">{{ savePresetError() }}</p>
          }
          <div class="modal-actions">
            <button type="button" class="btn-ghost" (click)="savePresetOpen.set(false)">Cancel</button>
            <button type="submit" class="btn-primary" [disabled]="savingPreset()">
              {{ savingPreset() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </form>
      </app-modal>
    }

    <!-- Top-up prompt guard - insufficient credit overlay -->
    @if (showTopUp()) {
      <div class="tp-backdrop"></div>
      <div class="tp-guard">
        <div class="tp-header">
          <strong>Top up your credit</strong>
          <button class="tp-close" (click)="dismissTopUp()">✕</button>
        </div>
        <div class="tp-body">
          <p class="muted">Your balance: <strong>RM {{ creditBalance().toFixed(2) }}</strong></p>
          <p class="muted">Hold amount: <strong>RM {{ estimateData()?.holdAmount != null ? estimateData()!.holdAmount!.toFixed(2) : estimatedTotal() !== null ? estimatedTotal()!.toFixed(2) : ' - ' }}</strong></p>
          <p class="tp-shortfall">
            You need at least <strong>RM {{ requiredTopUp().toFixed(2) }}</strong> more to submit.
          </p>
          <label class="tp-label">
            Top-up amount (RM) <span class="muted">(minimum RM 10)</span>
            <input type="number" min="10" [(ngModel)]="topUpAmount" name="topup" class="tp-input" />
          </label>
          @if (topUpError()) { <p class="err">{{ topUpError() }}</p> }
        </div>
        <div class="tp-footer">
          <p class="muted sm-note">Demo gives instant credit (dev only). Real payments go through Stripe.</p>
          <div class="tp-actions">
            <button class="btn-ghost" (click)="dismissTopUp()">Cancel</button>
            <button class="btn-primary" (click)="doTopUpRedirect()" [disabled]="toppingUp() || !topUpAmount">
              {{ toppingUp() ? 'Opening…' : 'Top up' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
    styles: [
        `
      :host { display: block; }
      .load-err { color: var(--color-danger); }
      .pane { display: flex; flex-direction: column; gap: 0.9rem; max-width: 720px; }
      .cat-row { display: flex; gap: 0.75rem; }
      .cat-field { flex: 1 1 0; display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
      .cat-field .field-msg { flex-basis: auto; }
      .cat-field select { width: 100%; }
      @media (max-width: 560px) { .cat-row { flex-direction: column; } }
      .rebook-lock {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.85rem 1rem;
        border: 1px solid var(--color-primary-light);
        border-radius: var(--radius);
        background: var(--color-primary-light);
      }
      .rebook-badge {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #fff;
        background: var(--color-primary);
        padding: 0.2rem 0.55rem;
        border-radius: 999px;
        flex-shrink: 0;
      }
      .rebook-info { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
      /* Quick service search bar */
      .svc-search { position: relative; display: flex; align-items: center; gap: 0.4rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.5rem 0.75rem; transition: border-color var(--transition); }
      .svc-search:focus-within, .svc-search.open { border-color: var(--color-primary); }
      .svc-search-ic { display: flex; color: var(--color-muted); flex-shrink: 0; }
      .svc-search-inp { border: none; background: transparent; outline: none; flex: 1; font-size: 0.9rem; padding: 0; color: var(--color-text); }
      .svc-search-drop { position: absolute; top: calc(100% + 3px); left: 0; right: 0; z-index: 200; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius); box-shadow: 0 8px 28px rgba(0,0,0,0.14); max-height: min(50vh, 16rem); overflow-y: auto; list-style: none; margin: 0; padding: 0.25rem 0; overscroll-behavior: contain; }
      .svc-search-drop li { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; cursor: pointer; font-size: 0.9rem; color: var(--color-text); transition: background var(--transition-fast); }
      .svc-search-drop li:hover { background: var(--color-primary-light); }
      .svc-search-drop li strong { flex-shrink: 0; }
      .svc-search-parent { font-size: 0.78rem; color: var(--color-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .stepper { display: flex; gap: 0.5rem; max-width: 720px; margin-bottom: 1rem; }
      .step {
        flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem;
        background: var(--color-bg); border: 1px solid var(--color-border);
        border-radius: var(--radius); padding: 0.6rem 0.5rem;
        font-weight: 600; font-size: 0.9rem; color: var(--color-muted);
        cursor: pointer;
        transition: background var(--transition), color var(--transition), border-color var(--transition),
                    box-shadow var(--transition), transform 0.12s ease;
      }
      .step:not(:disabled):hover:not(.on) {
        background: var(--color-surface); border-color: var(--color-primary);
        color: var(--color-primary); transform: translateY(-1px);
      }
      .step:disabled { cursor: default; }
      .step.on {
        border-color: var(--color-primary); color: var(--color-primary);
        background: var(--color-surface); box-shadow: 0 2px 8px rgba(201, 90, 60, 0.15);
      }
      .step.done { color: var(--color-success); }
      .step.done:not(:disabled):hover { border-color: var(--color-success); color: var(--color-success); }
      .dot {
        display: inline-flex; align-items: center; justify-content: center;
        width: 1.5rem; height: 1.5rem; border-radius: 999px;
        background: var(--color-border); color: var(--color-text); font-size: 0.8rem;
        transition: background var(--transition), color var(--transition);
      }
      .step.on .dot { background: var(--color-primary); color: #fff; }
      .step.done .dot { background: var(--color-success); color: #fff; }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
      @media (max-width: 560px) {
        .row { grid-template-columns: 1fr; }
        .stepper .step span:not(.dot) { display: none; }
      }
      label {
        display: flex; flex-direction: column; gap: 0.3rem;
        font-size: 0.9rem; font-weight: 500;
      }
      .label-text { display: inline; }
      .qgroup {
        display: flex; flex-direction: column; gap: 0.4rem;
        padding: 0.8rem; border: 1px solid var(--color-border);
        border-radius: var(--radius); background: var(--color-bg);
        transition: border-color var(--transition), box-shadow var(--transition);
      }
      .qgroup:not(.field-invalid):focus-within {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 2px rgba(201, 90, 60, 0.1);
      }
      .qlabel { font-weight: 600; font-size: 0.92rem; }
      .req { color: var(--color-danger); }
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
      .budget-group:not(.field-invalid):focus-within { border-color: var(--color-primary); }
      .budget-header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
      .budget-selected-badge {
        font-size: 0.85rem; font-weight: 700; color: var(--color-primary);
        background: var(--color-primary-light); padding: 0.15rem 0.6rem;
        border-radius: 999px;
      }
      .budget-range {
        -webkit-appearance: none; appearance: none;
        width: 100%; height: 6px;
        background: linear-gradient(to right, var(--color-primary) calc(var(--pct, 0%) ), var(--color-border) calc(var(--pct, 0%)));
        border-radius: 999px; cursor: pointer; outline: none;
      }
      .budget-range::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 22px; height: 22px; border-radius: 50%;
        background: var(--color-primary); cursor: pointer;
        box-shadow: 0 1px 6px rgba(0,0,0,0.22);
        border: 2px solid #fff;
        transition: transform 0.12s ease, box-shadow 0.12s ease;
      }
      .budget-range::-webkit-slider-thumb:hover { transform: scale(1.15); box-shadow: 0 2px 8px rgba(201,90,60,0.3); }
      .budget-range::-moz-range-thumb {
        width: 22px; height: 22px; border-radius: 50%;
        background: var(--color-primary); cursor: pointer; border: 2px solid #fff;
        box-shadow: 0 1px 6px rgba(0,0,0,0.22);
      }
      .budget-ticks { display: flex; justify-content: space-between; padding: 0 2px; }
      .budget-tick { font-size: 0.78rem; color: var(--color-muted); transition: color var(--transition), font-weight 0.1s; }
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
      .timing-opt--on {
        border-color: var(--color-primary);
        background: var(--color-surface);
      }
      .timing-body {
        display: flex; flex-direction: column; gap: 0.15rem;
      }
      .timing-body strong { font-size: 0.95rem; font-weight: 600; }
      .timing-body .muted { font-size: 0.82rem; }
      .no-charge-note { font-size: 0.82rem; margin: -0.2rem 0 0; }
      /* Promo */
      .promo-label { gap: 0.35rem; }
      .promo-row { display: flex; gap: 0.5rem; align-items: stretch; }
      .promo-row input { flex: 1; }
      .promo-ok { font-size: 0.82rem; color: var(--color-success); font-weight: 500; }
      .promo-remove { color: var(--color-danger) !important; border-color: var(--color-danger) !important; }
      /* Canonical estimate card */
      .est-card {
        padding: 1rem 1.1rem;
        background: var(--color-bg); border: 1px solid var(--color-border);
        border-radius: var(--radius);
      }
      .est-title { margin: 0 0 0.6rem; font-size: 0.95rem; font-weight: 700; }
      .est-loading { font-size: 0.88rem; margin: 0; }
      .est-body { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.5rem; }
      .est-row {
        display: flex; align-items: baseline; justify-content: space-between; gap: 0.5rem;
        font-size: 0.9rem;
      }
      .est-disc { color: var(--color-success); }
      .est-total-row {
        margin-top: 0.35rem; padding-top: 0.4rem;
        border-top: 1px solid var(--color-border);
        font-weight: 600;
      }
      .est-total-amt { font-size: 1.2rem; font-weight: 700; color: var(--color-primary); }
      .est-note { font-size: 0.78rem; margin: 0; }
      .looks-good { font-size: 0.88rem; margin: 0; }
      .checkbox { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 400; flex-wrap: wrap; }
      .checkbox input { width: auto; }
      .review {
        display: grid; grid-template-columns: minmax(7rem, 13rem) minmax(0, 1fr);
        gap: 0.5rem 1.25rem; margin: 0; font-size: 0.9rem;
      }
      .review dt { font-weight: 600; color: var(--color-muted); min-width: 0; }
      .review dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
      .prefill-warning {
        margin: 0.75rem 0 0.2rem; font-size: 0.82rem; font-weight: 600;
        color: var(--color-danger); background: var(--color-danger-bg);
        border: 1px solid var(--color-danger); border-radius: var(--radius);
        padding: 0.5rem 0.65rem; line-height: 1.35;
      }
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
      .pane { padding-bottom: 1rem; container-type: inline-size; }
      /* Stack on the CARD's own width (sidebar narrows content while viewport stays wide) */
      @container (max-width: 30rem) {
        .review { grid-template-columns: 1fr; gap: 0.15rem 0; }
        .review dt { margin-top: 0.6rem; }
        .review dt:first-of-type { margin-top: 0; }
        .review dd { margin-bottom: 0.35rem; }
        .service-answers { grid-template-columns: 1fr; gap: 0 0; }
        .answer-row { display: block; margin-bottom: 0.35rem; }
        .answer-label { display: block; }
      }
      @media (max-width: 560px) {
        .review { grid-template-columns: 1fr; gap: 0.15rem 0; }
        .review dd { margin-bottom: 0.35rem; }
        .service-answers { grid-template-columns: 1fr; gap: 0 0; }
        .answer-row { display: block; margin-bottom: 0.35rem; }
        .answer-label { display: block; }
      }
      .actions { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem; }
      .actions .btn-primary { margin-left: auto; }
      .err { color: var(--color-danger); }
      .warn { background: var(--color-status-open-bg); border-color: var(--color-status-open-border); color: var(--color-status-open-text); margin-bottom: 1rem; }
      /* Per-field validation */
      label.field-invalid > input,
      label.field-invalid > select,
      label.field-invalid > textarea { border-color: var(--color-danger) !important; outline: none; box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.18); }
      .qgroup.field-invalid, .budget-group.field-invalid { border-color: var(--color-danger, #dc2626); box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1); }
      .checkbox.field-invalid { color: var(--color-danger); }
      .field-msg { font-size: 0.8rem; font-weight: 400; color: var(--color-danger); margin-top: 0.1rem; }
      /* Page header row: title left, demo autofill right */
      .page-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
      .page-head h1 { margin: 0; }
      .btn-autofill {
        font-size: 0.78rem; font-weight: 500; padding: 0.25rem 0.7rem;
        border-radius: 999px; border: 1px solid var(--color-border);
        background: transparent; color: var(--color-muted); cursor: pointer;
        transition: all 0.2s ease;
      }
      .btn-autofill:hover { background: var(--color-bg); color: var(--color-text); border-color: var(--color-muted); }
      /* Auto-fill preset */
      .af-section { position: relative; }
      .preset-row { display: flex; align-items: center; justify-content: center; gap: 0.6rem; flex-wrap: wrap; }
      .preset-or { font-size: 0.85rem; color: var(--color-muted); }
      .af-trigger {
        font-size: 0.88rem; padding: 0.45rem 1.2rem; min-width: 140px;
        display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem;
        color: var(--color-primary); border-color: var(--color-primary-light);
        background: var(--color-primary-light);
      }
      .af-trigger:hover:not(:disabled) {
        background: var(--color-primary); color: #fff; border-color: var(--color-primary);
      }
      .af-dropdown {
        position: absolute; top: 100%; left: 0; z-index: 100;
        min-width: 320px; max-width: 90vw; margin-top: 4px;
        background: var(--color-bg); border: 1px solid var(--color-border);
        border-radius: var(--radius); box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        display: flex; flex-direction: column; overflow: hidden;
      }
      .af-item {
        display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
        padding: 0.6rem 0.85rem; text-align: left;
        background: none; border: none; border-bottom: 1px solid var(--color-border);
        cursor: pointer; font-size: 0.85rem; width: 100%;
        transition: background 0.12s ease;
      }
      .af-item:last-child { border-bottom: none; }
      .af-item:hover { background: var(--color-bg); }
      .af-item strong { font-size: 0.9rem; font-weight: 600; }
      .af-empty { padding: 0.75rem; text-align: center; }
      /* Scan skeleton for dropdown */
      .af-item.bw-skeleton {
        position: relative; overflow: hidden; cursor: default; pointer-events: none;
        background: var(--color-surface); min-height: 48px;
      }
      .af-item.bw-skeleton:hover { background: var(--color-surface); }
      .af-item.bw-skeleton .sk-line {
        display: block; background: var(--color-border); border-radius: 4px;
      }
      .af-item.bw-skeleton .sk-title {
        width: 55%; height: 12px; margin-bottom: 6px; margin-top: 4px;
      }
      .af-item.bw-skeleton .sk-sub {
        width: 80%; height: 10px;
      }
      .af-item.bw-skeleton .bw-scan1 { width: 30%; }
      .af-item.bw-skeleton .bw-scan2 { width: 40%; }
      .af-item.bw-skeleton .bw-sweep1 { width: 25%; }
      .af-item.bw-skeleton .bw-sweep2 { width: 20%; }
      @keyframes skeleton-spawn {
        from { opacity: 1; }
        to   { opacity: 0; pointer-events: none; }
      }
      .af-item.bw-skeleton::after {
        content: "";
        position: absolute; inset: 0; z-index: 10;
        background: var(--color-bg);
        animation: skeleton-spawn 0.1s ease both;
      }
      .af-dropdown > :nth-child(1)::after { animation-delay: 0s; }
      .af-dropdown > :nth-child(2)::after { animation-delay: 0.05s; }
      .af-dropdown > :nth-child(3)::after { animation-delay: 0.1s; }
      .card-cover {
        position: absolute; inset: 0; z-index: 4;
        background: var(--color-surface);
        transition: opacity 0.35s ease;
      }
      .card-cover.loaded { opacity: 0; pointer-events: none; }
      /* Save as Preset */
      .btn-save-preset {
        font-size: 0.82rem; padding: 0.45rem 1.2rem; min-width: 140px;
        white-space: nowrap; justify-content: center;
      }
      .btn-save-preset .sp {
        font-weight: 700; font-size: 1rem; margin-right: 0.15rem;
      }
      /* Address fields moved to the shared <app-address-fields> component. */
      input.auto-fill {
        background: var(--color-surface);
      }
      .save-preset-form {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .save-preset-form label {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      /* Top-up prompt guard - fixed centered overlay */
      .tp-backdrop {
        position: fixed; inset: 0; z-index: 9998;
        background: var(--color-backdrop, rgba(0,0,0,0.45));
      }
      .tp-guard {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        z-index: 9999; width: 420px; max-width: 92vw;
        background: var(--color-bg); border: 1px solid var(--color-border);
        border-radius: var(--radius); box-shadow: 0 8px 40px rgba(0,0,0,0.25);
        display: flex; flex-direction: column;
      }
      .tp-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem 1.2rem 0.5rem; font-size: 1rem;
      }
      .tp-close {
        background: none; border: none; font-size: 1.1rem;
        color: var(--color-muted); cursor: pointer; padding: 0.2rem;
        line-height: 1;
      }
      .tp-close:hover { color: var(--color-text); }
      .tp-body {
        padding: 0.5rem 1.2rem 0.2rem;
        max-height: 50vh; overflow-y: auto;
        overscroll-behavior: contain;
      }
      .tp-shortfall {
        margin: 0.4rem 0 0.7rem; font-size: 0.9rem;
        color: var(--color-danger, #b91c1c);
      }
      .tp-shortfall strong { font-weight: 700; }
      .tp-label {
        display: flex; flex-direction: column; gap: 0.25rem;
        font-size: 0.9rem; font-weight: 500; margin-top: 0.5rem;
      }
      .tp-label span { font-weight: 400; }
      .tp-input { padding: 0.45rem 0.6rem; font-size: 0.95rem; }
      .tp-footer {
        padding: 0.5rem 1.2rem 1rem;
      }
      .tp-actions {
        display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem;
      }
      .condo-note {
        margin-top: 0.3rem;
        padding: 0.55rem 0.75rem;
        background: var(--color-warning-light, #fef3c7);
        border: 1px solid var(--color-warning, #d97706);
        border-radius: var(--radius);
        font-size: 0.82rem;
        color: var(--color-warning-text, #92400e);
        line-height: 1.4;
      }
      .btn-demo {
        background: var(--color-primary-light); border: 1px solid var(--color-primary-light);
        color: var(--color-primary); padding: 0.45rem 0.8rem;
        font-size: 0.85rem; font-weight: 600; cursor: pointer; transition: background 0.15s ease;
      }
      .btn-demo:hover { background: var(--color-primary); color: #fff; }
      .sm-note { font-size: 0.78rem; color: var(--color-muted); border-top: 1px dashed var(--color-border); padding-top: 0.5rem; margin-top: 0.3rem; }
      .card-pay-ok { color: var(--color-success); font-weight: 600; font-size: 0.95rem; }
      .tp-processing { text-align: center; padding: 1rem 0; }
      .tp-spinner { font-size: 2rem; margin-bottom: 0.5rem; }
      .tp-result { text-align: center; padding: 0.8rem 0; font-size: 1.05rem; font-weight: 600; }
      .tp-result-ok { color: var(--color-success, #16a34a); }
      .tp-result-fail { color: var(--color-danger, #b91c1c); }
      /* Confirmation state */
      .confirm-card {
        max-width: 520px;
        display: flex; flex-direction: column; align-items: center;
        gap: 0.75rem; text-align: center; padding: 2rem 1.5rem;
      }
      .confirm-icon {
        width: 3.5rem; height: 3.5rem; border-radius: 999px;
        background: var(--color-success); color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.6rem; font-weight: 700;
      }
      .confirm-heading { font-family: var(--font-display); margin: 0; font-size: 1.4rem; }
      .confirm-sub { margin: 0; font-size: 0.95rem; }
      .confirm-id { font-size: 0.82rem; margin: 0; font-family: monospace; }
      .confirm-proposals-banner {
        width: 100%;
        background: var(--color-promo-bg); border: 1px solid var(--color-promo-border);
        color: var(--color-promo-text); border-radius: var(--radius);
        padding: 0.65rem 0.9rem; font-size: 0.88rem;
        display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; justify-content: center;
      }
      .confirm-proposals-link {
        color: var(--color-primary); font-weight: 600; cursor: pointer; text-decoration: underline;
      }
      .confirm-wa-note { font-size: 0.82rem; margin: 0; }
      .confirm-countdown { font-size: 0.88rem; margin: 0; }
      /* WhatsApp disclosure on Bill step */
      .wa-disclosure { font-size: 0.82rem; margin: 0; }
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
        transition: background 0.12s ease, border-color 0.12s ease;
      }
      .qty-btn:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
      .qty-val { min-width: 24px; text-align: center; font-size: 0.95rem; font-weight: 600; }
      /* Number input */
      .num-input { max-width: 160px; }
    `,
    ]
})
export class QuoteFormComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private assist = inject(QuoteAssistBridge);
  config = inject(ConfigService);
  protected readonly unlock = inject(DemoUnlockService);

  private reorderPrefill: Record<string, unknown> | null = null;
  /** Locked-rebook target: when set, the quote goes to this servicer only and
   *  the category pickers are hidden/locked (entered from order history). */
  rebookServicerId = signal<string | null>(null);
  rebookServicerName = signal<string>('');

  readonly steps = [
    { n: 1, label: 'Choose service' },
    { n: 2, label: 'Contact' },
    { n: 3, label: 'Summary' },
    { n: 4, label: 'Confirmation' },
  ];
  readonly timeSlots = TIME_SLOTS;
  readonly todayStr = new Date().toISOString().slice(0, 10);
  /** Time slots available for the selected category. Falls back to all slots. */
  availableTimeSlots = computed(() => {
    const cat = this.categories().find((c) => c.id === this.categoryId());
    return cat?.allowedTimeSlots?.length ? cat.allowedTimeSlots : TIME_SLOTS.map((s) => s.value);
  });

  /** Condo entry note from platform settings. */
  condoEntryNote = signal('');
  isCondoAddress = computed(() => {
    const addr = this.addresses().find((a) => a.id === this.f.addressId);
    return addr?.propertyType === 'condo';
  });
  onAddressChange(): void {
    // computed triggers on signal change automatically
  }

  // ── Post-submission confirmation state ────────────────────────────────────
  submitted = signal(false);
  submittedQuoteId = signal('');
  submittedCategory = signal('');
  submittedProposalCount = signal(0);
  confirmCountdown = signal(3);
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  step = signal(1);
  categories = signal<Category[]>([]);
  addresses = signal<Address[]>([]);
  presets = signal<Preset[]>([]);
  presetsLoading = signal(false);
  presetsLoaded = false;
  budgetRanges = signal<BudgetRange[]>([]);
  categoryId = signal('');
  parentId = signal('');
  serviceSearch = signal('');
  searchFocused = signal(false);
  answers = signal<Record<string, string | string[] | Record<string, number> | number | null>>({});
  loadError = signal(false);

  noAddress = signal(false);
  submitting = signal(false);
  stepError = signal('');
  stepHint = signal('');
  private stripePayment = inject(StripePaymentService);

  // ── Card payment state ──────────────────────────────────────────────────
  cardStep = signal<'idle' | 'intent_loading' | 'intent_ready' | 'success' | 'error'>('idle');
  clientSecret = signal<string | null>(null);
  cardErrorMsg = signal('');
  cardPaymentDone = signal(false);

  async onGatewaySelect(): Promise<void> {
    this.f.settlementMethod = 'gateway';
    this.cardStep.set('intent_loading');
    this.cardErrorMsg.set('');
    this.clientSecret.set(null);
    const total = this.estimatedTotal();
    if (!total || total <= 0) {
      this.cardStep.set('idle');
      return;
    }
    try {
      const res = await firstValueFrom(this.api.post<{ clientSecret: string }>('/stripe/create-payment-intent', { amount: total }));
      if (res?.clientSecret) {
        this.clientSecret.set(res.clientSecret);
        this.cardStep.set('intent_ready');
      } else {
        this.cardStep.set('error');
        this.cardErrorMsg.set('Could not initiate payment. Please try again.');
      }
    } catch {
      this.cardStep.set('error');
      this.cardErrorMsg.set('Could not initiate payment. Please try again.');
    }
  }

  onCardPaymentSuccess(): void {
    this.cardStep.set('success');
    this.cardPaymentDone.set(true);
    this.doSubmit();  // auto-advance
  }

  onCardPaymentError(msg: string): void {
    this.cardErrorMsg.set(msg);
  }

  showTopUp = signal(false);
  toppingUp = signal(false);
  topUpAmount: number | null = null;
  topUpError = signal('');
  requiredTopUp = computed(() => {
    const hold = this.estimateData()?.holdAmount ?? this.estimatedTotal();
    const balance = this.creditBalance();
    if (hold === null) return 10;
    const shortfall = Math.max(hold - balance, 0);
    return Math.max(shortfall, 10);
  });

  creditBalance = computed(() => this.auth.principal()?.creditBalance ?? 0);

  fieldErrors = signal<Set<string>>(new Set());

  // Estimate / promo state
  estimateData = signal<EstimateResult | null>(null);
  estimateLoading = signal(false);
  promoApplying = signal(false);
  promoApplyError = signal('');
  promoApplySuccess = signal(false);
  appliedPromoCode = signal('');

  // Budget slider position (numeric index, synced to f.budgetIndex)
  budgetSlider = 0;

  f = {
    addressId: '',
    addressNo: '',
    streetDetails: '',
    newAddressLat: undefined as number | undefined,
    newAddressLng: undefined as number | undefined,
    newAddressPostcode: '',
    newAddressDistrict: '',
    newAddressState: '',
    newAddressPropertyType: '',
    contactName: '',
    contactNumber: '',
    timeSlot: '',
    preferredDate: '',
    paymentTiming: 'pay_later' as 'pay_now' | 'pay_later',
    settlementMethod: 'credit' as 'credit' | 'gateway' | 'cash',
    budgetIndex: '' as string | number,
    notes: '',
    extraNotes: '',
    promoCode: '',
    agreeTerms: false,
  };

  autoFillOpen = signal(false);

  questions = computed<QuoteQuestion[]>(() => {
    const cat = this.categories().find((c) => c.id === this.categoryId());
    return (cat?.questionSchema ?? []).filter((q) => q.active !== false);
  });

  /** Parent categories for the Category dropdown. */
  parentOptions = computed(() => this.categories().filter((c) => !c.parentCategoryId));
  /** Children of the selected parent for the Type-of-service dropdown. */
  childOptions = computed(() => {
    const pid = this.parentId();
    if (!pid) return [];
    return this.categories().filter((c) => c.parentCategoryId === pid);
  });

  /** All child services for the quick-search bar. */
  allChildren = computed(() => this.categories().filter((c) => c.parentCategoryId));
  /** Children filtered by the quick-search query (top 8, ranked by fuzzy match). */
  filteredChildren = computed(() => {
    const q = this.serviceSearch().trim().toLowerCase();
    const all = this.allChildren();
    if (!q) return [];
    return all
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 8);
  });

  estimatedTotal = computed(() => this.estimateData()?.total ?? null);

  ngOnInit(): void {
    this.assist.register(() => this.buildFormContext(), (k, v) => this.applyFormField(k, v));
    this.reorderPrefill = history.state?.prefill ?? null;

    // Locked rebook (from order history "Rebook same servicer"): pin the servicer
    // so the quote goes to them only, and lock the category to the past job's.
    const rebook = history.state?.rebookServicer as { id: string; name: string } | undefined;
    if (rebook?.id) {
      this.rebookServicerId.set(rebook.id);
      this.rebookServicerName.set(rebook.name ?? 'this servicer');
    }

    // AI Smart Assistant prefill: base64-encoded JSON from chat widget
    const prefillParam = this.route.snapshot.queryParamMap.get('prefill');
    let chatPrefill: Record<string, unknown> | null = null;
    if (prefillParam) {
      try {
        // Unicode-safe base64: new format first, fall back to old.
        chatPrefill = JSON.parse(decodeURIComponent(escape(atob(prefillParam))));
      } catch {
        try { chatPrefill = JSON.parse(atob(prefillParam)); }
        catch { /* ignore invalid prefill */ }
      }
    }
    // Fallback for service hyperlinks opened in new tab (sessionStorage per-tab).
    if (!chatPrefill) {
      try {
        const pid = this.auth.principal()?.id;
        const key = pid ? `msvc_latest_chat_prefill_${pid}` : 'msvc_latest_chat_prefill';
        const raw = localStorage.getItem(key);
        if (raw) chatPrefill = JSON.parse(raw) as Record<string, unknown>;
      } catch { /* ignore */ }
    }

    this.api.get<{ data: Category[] }>('/categories', { scope: 'all' }).subscribe({
      next: (r) => {
        this.categories.set(r.data);
        const pre = (this.reorderPrefill?.['categoryId'] as string | undefined)
          ?? this.route.snapshot.queryParamMap.get('category')
          ?? (chatPrefill?.['categoryId'] as string | undefined);
        const child = pre ? r.data.find((c) => c.id === pre) : undefined;
        if (child) {
          this.parentId.set(child.parentCategoryId ?? '');
          this.categoryId.set(child.id);
          this.loadBudgetRanges(child.id);
          this.applyReorderPrefill();
          if (chatPrefill) this.applyChatPrefill(chatPrefill);
        }
      },
      error: () => this.loadError.set(true),
    });
    this.api.get<{ data: Address[] }>('/user/me/addresses').subscribe({
      next: (r) => {
        this.addresses.set(r.data);
        this.noAddress.set(r.data.length === 0);
        const preAddr = this.reorderPrefill?.['addressId'] as string | undefined;
        if (preAddr && r.data.some((a) => a.id === preAddr)) {
          this.f.addressId = preAddr;
        } else if (r.data.length > 0) {
          this.f.addressId = r.data[0].id;
        }
      },
      error: () => this.loadError.set(true),
    });
    // Presets loaded lazily on first auto-fill toggle (scan animation)
    this.condoEntryNote.set(this.config.condoEntryNote);

    // Voucher promo code from URL param (e.g. from rewards page "Use" button)
    const promoParam = this.route.snapshot.queryParamMap.get('promoCode');
    if (promoParam) {
      this.f.promoCode = promoParam;
    }
  }

  private applyReorderPrefill(): void {
    const p = this.reorderPrefill;
    if (!p) return;
    if (typeof p['timeSlot'] === 'string') this.f.timeSlot = p['timeSlot'];
    if (typeof p['notes'] === 'string') this.f.notes = p['notes'];
    if (typeof p['contactName'] === 'string') this.f.contactName = p['contactName'];
    if (typeof p['contactNumber'] === 'string') this.f.contactNumber = p['contactNumber'];
    this.applyPaymentMode(p['paymentMode']);
    if (p['serviceDetails'] && typeof p['serviceDetails'] === 'object') {
      const sd: Record<string, unknown> = { ...(p['serviceDetails'] as Record<string, unknown>) };
      if (typeof sd['_extraNotes'] === 'string') { this.f.extraNotes = sd['_extraNotes']; delete sd['_extraNotes']; }
      this.answers.set(sd as unknown as Record<string, string | string[]>);
    }
  }

  private applyPaymentMode(mode: unknown): void {
    if (typeof mode !== 'string') return;
    const entry = PAYMENT_MODE_MAP[mode];
    if (entry) {
      this.f.paymentTiming = entry[0] as 'pay_now' | 'pay_later';
      this.f.settlementMethod = entry[1] as 'credit' | 'gateway' | 'cash';
    }
  }

  private applyChatPrefill(p: Record<string, unknown>): void {
    if (typeof p['contactName'] === 'string') this.f.contactName = p['contactName'];
    if (typeof p['contactNumber'] === 'string') this.f.contactNumber = p['contactNumber'];
    if (typeof p['addressNo'] === 'string') this.f.addressNo = p['addressNo'];
    if (typeof p['streetDetails'] === 'string') this.f.streetDetails = p['streetDetails'];
    if (typeof p['postcode'] === 'string') this.f.newAddressPostcode = p['postcode'];
    if (typeof p['district'] === 'string') this.f.newAddressDistrict = p['district'];
    if (typeof p['state'] === 'string') this.f.newAddressState = p['state'];
    if (typeof p['propertyType'] === 'string') this.f.newAddressPropertyType = p['propertyType'];
    if (typeof p['address'] === 'string') {
      this.f.notes = (this.f.notes ? this.f.notes + '\n' : '') + `Address: ${p['address']}`;
    }
    if (typeof p['timeSlot'] === 'string') this.f.timeSlot = p['timeSlot'];
    if (typeof p['preferredDate'] === 'string') this.f.preferredDate = p['preferredDate'];
    if (typeof p['notes'] === 'string') this.f.notes = this.f.notes ? this.f.notes + '\n' + p['notes'] : p['notes'];
    this.applyPaymentMode(p['paymentMode']);
    if (p['budgetMin'] != null || p['budgetMax'] != null) {
      if (!this.reorderPrefill) {
        this.reorderPrefill = { budgetMin: p['budgetMin'], budgetMax: p['budgetMax'] };
      }
    }
  }

  private loadBudgetRanges(categoryId: string): void {
    if (!categoryId) return;
    this.api.get<{ ranges: BudgetRange[] }>('/quotes/budget-ranges', { categoryId }).subscribe({
      next: (r) => {
        this.budgetRanges.set(r.ranges);
        // Auto-select first range if none selected yet
        if (this.f.budgetIndex === '' && r.ranges.length > 0) {
          this.f.budgetIndex = 0;
          this.budgetSlider = 0;
        }
        this.matchPrefillBudget();
      },
      error: () => {},
    });
  }

  private matchPrefillBudget(): void {
    const p = this.reorderPrefill;
    if (!p) return;
    const bMin = p['budgetMin'] != null ? Number(p['budgetMin']) : null;
    const bMax = p['budgetMax'] != null ? Number(p['budgetMax']) : null;
    if (bMin == null) return;
    const idx = this.budgetRanges().findIndex(
      (r) => r.min === bMin && (r.max ?? null) === (bMax ?? null),
    );
    if (idx >= 0) {
      this.f.budgetIndex = idx;
      this.budgetSlider = idx;
    }
  }

  onBudgetSlide(idx: number): void {
    this.budgetSlider = idx;
    this.f.budgetIndex = idx;
    this.clearError('budgetIndex');
  }

  // ── Field-error helpers ──────────────────────────────────────────────────
  hasError(key: string): boolean { return this.fieldErrors().has(key); }
  clearError(key: string): void {
    if (!this.fieldErrors().has(key)) return;
    this.fieldErrors.update((s) => { const n = new Set(s); n.delete(key); return n; });
  }
  private setErrors(keys: string[], message: string): void {
    this.fieldErrors.set(new Set(keys));
    this.stepError.set(message);
  }

  // ── Step navigation ──────────────────────────────────────────────────────
  goToStep(n: number): void {
    if (n < this.step()) {
      this.fieldErrors.set(new Set());
      this.stepError.set('');
      this.step.set(n);
    }
  }

  goToContact(): void {
    const errors: string[] = [];
    if (!this.parentId()) errors.push('parentCat');
    if (!this.categoryId()) errors.push('category');
    if (this.budgetRanges().length > 0 && this.f.budgetIndex === '') errors.push('budgetIndex');
    const unanswered = this.questions().filter((q) => q.required && !this.isAnswered(q));
    unanswered.forEach((q) => errors.push(q.key));

    if (errors.length > 0) {
      const first = errors[0];
      const label =
        first === 'parentCat' ? 'Please choose a category.'
        : first === 'category' ? 'Please choose a type of service.'
        : first === 'budgetIndex' ? 'Please select a budget range.'
        : `Please answer: ${this.questions().find((q) => q.key === first)?.label}`;
      this.setErrors(errors, label);
      return;
    }
    this.fieldErrors.set(new Set());
    this.stepError.set('');
    this.step.set(2);
  }

  /** Normalise the contact number to +60 form when the field loses focus. */
  onPhoneBlur(): void {
    this.f.contactNumber = normalizeMyPhone(this.f.contactNumber);
  }

  goToSummary(): void {
    this.f.contactNumber = normalizeMyPhone(this.f.contactNumber);
    const errors: string[] = [];
    if (!this.f.contactName.trim()) errors.push('contactName');
    else if (this.f.contactName.trim().length < 2) errors.push('contactName');
    if (!this.f.contactNumber.trim()) errors.push('contactNumber');
    else if (!/^[0-9+\-\s()]{6,20}$/.test(this.f.contactNumber)) errors.push('contactNumber');
    if (!this.f.addressId) {
      if (!this.f.addressNo.trim()) { errors.push('addressNo'); }
      if (!this.f.streetDetails.trim()) { errors.push('streetDetails'); }
      if (!this.f.newAddressPostcode.trim()) { errors.push('postcode'); }
      if (!this.f.newAddressPropertyType) { errors.push('propertyType'); }
    } else if (!this.f.addressNo.trim() && this.f.streetDetails.trim()) {
      // Saved address used but house number couldn't be parsed from it.
      // Don't block - the full address is in the record. Show a hint instead.
      this.stepHint.set('Enter a unit/lot number if your address has one. ');
    }
    if (!this.f.preferredDate) errors.push('preferredDate');
    if (!this.f.timeSlot) errors.push('timeSlot');

    if (errors.length > 0) {
      const first = errors[0];
      let msg: string;
      if (first === 'contactName') {
        msg = this.f.contactName.trim().length < 2 && this.f.contactName.trim().length > 0
          ? 'Name must be at least 2 characters'
          : 'Please enter a contact name and number.';
      } else if (first === 'contactNumber') {
        msg = this.f.contactNumber.trim() && !/^[0-9+\-\s()]{6,20}$/.test(this.f.contactNumber)
          ? 'Please enter a valid phone number'
          : 'Please enter a contact name and number.';
      } else if (first === 'streetDetails') {
        msg = 'Please enter or select a service address.';
      } else if (first === 'addressNo') {
        msg = 'Please enter a unit or lot number.';
      } else if (first === 'postcode') {
        msg = 'Please enter a postcode.';
      } else if (first === 'propertyType') {
        msg = 'Please select a property type.';
      } else {
        msg = first === 'addressId' ? 'Please select a service address.'
          : first === 'preferredDate' ? 'Please choose a preferred date.'
          : 'Please pick a preferred appointment time.';
      }
      this.setErrors(errors, msg);
      return;
    }
    this.fieldErrors.set(new Set());
    this.stepError.set('');
    this.step.set(3);
  }

  goToBill(): void {
    this.fieldErrors.set(new Set());
    this.stepError.set('');
    this.step.set(4);
    this.fetchEstimate();
    // Auto-apply promo code from URL param (voucher "Use" button) if not yet applied
    if (this.f.promoCode.trim() && !this.appliedPromoCode()) {
      this.applyPromo();
    }
  }

  // ── Estimate / promo ─────────────────────────────────────────────────────
  private fetchEstimate(promoCode?: string): void {
    if (this.f.budgetIndex === '') { this.estimateData.set(null); return; }
    const range = this.budgetRanges()[Number(this.f.budgetIndex)];
    if (!range) { this.estimateData.set(null); return; }

    this.estimateLoading.set(true);
    const params: Record<string, string> = {
      categoryId: this.categoryId(),
      budgetMin: String(range.min),
    };
    if (range.max != null) params['budgetMax'] = String(range.max);
    if (promoCode) params['promoCode'] = promoCode;

    this.api
      .get<EstimateResult & { promoError?: string }>('/quotes/estimate', params)
      .subscribe({
        next: (r) => { this.estimateLoading.set(false); this.estimateData.set(r); },
        error: () => { this.estimateLoading.set(false); this.estimateData.set(null); },
      });
  }

  applyPromo(): void {
    const code = this.f.promoCode.trim();
    if (!code) return;
    this.promoApplying.set(true);
    this.promoApplyError.set('');
    this.promoApplySuccess.set(false);

    if (this.f.budgetIndex === '') { this.promoApplying.set(false); return; }
    const range = this.budgetRanges()[Number(this.f.budgetIndex)];
    if (!range) { this.promoApplying.set(false); return; }

    const params: Record<string, string> = {
      categoryId: this.categoryId(),
      budgetMin: String(range.min),
      promoCode: code,
    };
    if (range.max != null) params['budgetMax'] = String(range.max);

    this.api.get<EstimateResult & { promoError?: string }>('/quotes/estimate', params).subscribe({
      next: (r) => {
        this.promoApplying.set(false);
        if (r.promoError) {
          this.promoApplyError.set(r.promoError);
          this.estimateData.set({ ...r, promoDiscount: 0 });
        } else {
          this.appliedPromoCode.set(code);
          this.promoApplySuccess.set(true);
          this.estimateData.set(r);
        }
      },
      error: () => {
        this.promoApplying.set(false);
        this.promoApplyError.set('Could not apply promo code. Please try again.');
      },
    });
  }

  removePromo(): void {
    this.appliedPromoCode.set('');
    this.f.promoCode = '';
    this.promoApplySuccess.set(false);
    this.promoApplyError.set('');
    this.fetchEstimate();
  }

  // ── Payment helpers ──────────────────────────────────────────────────────
  onTimingChange(): void {
    if (this.f.paymentTiming === 'pay_now') {
      this.f.settlementMethod = 'credit';
    } else if (this.f.settlementMethod === 'gateway') {
      this.f.settlementMethod = 'credit';
    }
  }

  // ── Dynamic question handling ────────────────────────────────────────────
  onServiceSearch(value: string): void {
    this.serviceSearch.set(value);
    if (!value.trim()) this.searchFocused.set(false);
  }

  onSearchPick(childId: string, parentId: string): void {
    this.parentId.set(parentId);
    this.categoryId.set(childId);
    this.answers.set({});
    this.f.extraNotes = '';
    this.f.budgetIndex = '';
    this.budgetSlider = 0;
    this.loadBudgetRanges(childId);
    this.clearError('parentCat');
    this.clearError('category');
    this.stepError.set('');
    this.serviceSearch.set('');
    this.searchFocused.set(false);
  }

  onSearchBlur(): void {
    setTimeout(() => this.searchFocused.set(false), 150);
  }

  parentName(pid: string | null | undefined): string {
    if (!pid) return '';
    return this.categories().find((c) => c.id === pid)?.name ?? '';
  }

  onParentChange(parentId: string): void {
    this.parentId.set(parentId);
    // Reset the dependent child + everything derived from it.
    this.categoryId.set('');
    this.answers.set({});
    this.f.extraNotes = '';
    this.f.budgetIndex = '';
    this.budgetSlider = 0;
    this.budgetRanges.set([]);
    this.clearError('parentCat');
    this.clearError('category');
    this.stepError.set('');
  }

  onCategoryChange(id: string): void {
    this.categoryId.set(id);
    this.answers.set({});
    this.f.extraNotes = '';
    this.f.budgetIndex = '';
    this.budgetSlider = 0;
    this.loadBudgetRanges(id);
    this.clearError('category');
    this.stepError.set('');
  }

  isChecked(key: string, value: string): boolean {
    const a = this.answers()[key];
    return Array.isArray(a) && a.includes(value);
  }
  toggleCheck(key: string, value: string): void {
    const a = this.answers();
    const current = Array.isArray(a[key]) ? [...(a[key] as string[])] : [];
    const i = current.indexOf(value);
    if (i >= 0) current.splice(i, 1); else current.push(value);
    this.answers.set({ ...a, [key]: current });
    if (current.length > 0) this.clearError(key);
  }
  radioValue(key: string): string {
    const a = this.answers()[key];
    return typeof a === 'string' ? a : '';
  }
  setRadio(key: string, value: string): void {
    this.answers.set({ ...this.answers(), [key]: value });
    this.clearError(key);
  }
  textValue(key: string): string {
    const a = this.answers()[key];
    return typeof a === 'string' ? a : '';
  }
  setText(key: string, value: string): void {
    this.answers.set({ ...this.answers(), [key]: value });
    if (value.trim()) this.clearError(key);
  }
  activeOptions(options: { value: string; label: string; active?: boolean }[] | undefined): { value: string; label: string; active?: boolean }[] {
    return (options ?? []).filter(o => o.active !== false);
  }

  // ── Quantity type helpers ──────────────────────────────────────────────────
  qtyValue(key: string, optionValue: string): number {
    const a = this.answers()[key];
    if (a && typeof a === 'object' && !Array.isArray(a)) {
      return (a as Record<string, number>)[optionValue] ?? 0;
    }
    return 0;
  }
  incQty(key: string, optionValue: string): void {
    const a = this.answers();
    const map = (a[key] && typeof a[key] === 'object' && !Array.isArray(a[key]))
      ? { ...(a[key] as Record<string, number>) } : {};
    map[optionValue] = (map[optionValue] ?? 0) + 1;
    this.answers.set({ ...a, [key]: map });
    this.clearError(key);
  }
  decQty(key: string, optionValue: string): void {
    const a = this.answers();
    const map = (a[key] && typeof a[key] === 'object' && !Array.isArray(a[key]))
      ? { ...(a[key] as Record<string, number>) } : {};
    const cur = map[optionValue] ?? 0;
    if (cur > 0) map[optionValue] = cur - 1;
    this.answers.set({ ...a, [key]: map });
  }

  // ── Number type helpers ──────────────────────────────────────────────────
  numberValue(key: string): number | null {
    const a = this.answers()[key];
    return typeof a === 'number' ? a : null;
  }
  setNumber(key: string, value: number | string): void {
    const n = value === '' || value === null ? null : Number(value);
    this.answers.set({ ...this.answers(), [key]: n });
    if (n !== null) this.clearError(key);
  }

  private isAnswered(q: QuoteQuestion): boolean {
    const a = this.answers()[q.key];
    if (q.type === 'checkbox') return Array.isArray(a) && a.length > 0;
    if (q.type === 'quantity') {
      if (!a || typeof a !== 'object' || Array.isArray(a)) return false;
      return Object.values(a as Record<string, number>).some(v => v > 0);
    }
    if (q.type === 'number') return typeof a === 'number' && a >= 0;
    return typeof a === 'string' && a.trim() !== '';
  }

  demoAutoFill(): void {
    this.stepError.set('');
    this.fieldErrors.set(new Set());

    // Use saved preset if available
    const defaultPreset = this.presets().find((p) => p.isDefault) ?? this.presets()[0];
    if (defaultPreset) {
      this.applyPresetObject(defaultPreset);
    } else {
      // Fallback: demo guest preset
      this.f.contactName = 'Sarah Lim';
      this.f.contactNumber = '012-3456789';
      this.f.addressNo = '12';
      this.f.streetDetails = 'Jalan SS2/72';
      this.f.newAddressPostcode = '47300';
      this.f.newAddressDistrict = 'SS2';
      this.f.newAddressState = 'Selangor';
      this.f.newAddressPropertyType = 'landed';
      this.f.notes = 'Register at guard house, park at visitor lot B, management office open 9am-5pm';
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.f.preferredDate = tomorrow.toISOString().split('T')[0];
    this.f.timeSlot = 'morning';
    this.f.paymentTiming = 'pay_now';
    this.f.settlementMethod = 'gateway';

    // Fill answer questions from the first child category
    const cats = this.categories();
    const firstChild = cats.find((c) => c.parentCategoryId) ?? cats[0];
    if (firstChild) {
      this.parentId.set(firstChild.parentCategoryId ?? '');
      this.onCategoryChange(firstChild.id);
      const ans: Record<string, unknown> = {};
      for (const q of this.questions() ?? []) {
        const opts = q.options ?? [];
        if (q.type === 'radio') {
          ans[q.key] = opts[Math.floor(Math.random() * Math.max(opts.length, 1))]?.value ?? '';
        } else if (q.type === 'checkbox') {
          ans[q.key] = opts.length ? [opts[0].value] : [];
        } else if (q.type === 'text') {
          ans[q.key] = 'Standard service required';
        } else if (q.type === 'number') {
          ans[q.key] = 1;
        } else if (q.type === 'quantity') {
          ans[q.key] = opts.length ? { [opts[0].value]: 1 } : {};
        }
      }
      this.answers.set(ans as Record<string, string | number | string[] | Record<string, number> | null>);
      setTimeout(() => {
        const ranges = this.budgetRanges();
        const idx = ranges.findIndex((r) => r.min === 100 && r.max === 500);
        this.budgetSlider = idx >= 0 ? idx : 0;
        this.f.budgetIndex = String(this.budgetSlider);
      }, 300);
    }
  }

  toggleAutoFill(): void {
    const next = !this.autoFillOpen();
    this.autoFillOpen.set(next);
    if (next) this.loadPresets();
  }

  // ── Presets ──────────────────────────────────────────────────────────────
  private loadPresets(): void {
    if (this.presetsLoaded) return;
    this.presetsLoading.set(true);
    this.api.get<{ data: Preset[] }>('/user/me/quote-presets').subscribe({
      next: (r) => {
        this.presets.set(r.data);
        this.presetsLoading.set(false);
        this.presetsLoaded = true;
      },
      error: () => {
        this.presetsLoading.set(false);
      },
    });
  }

  savePresetOpen = signal(false);
  savePresetLabel = signal('');
  savePresetError = signal('');
  savingPreset = signal(false);

  openSavePreset(): void {
    this.savePresetLabel.set('');
    this.savePresetError.set('');
    this.savePresetOpen.set(true);
    this.autoFillOpen.set(false);
  }

  doSavePreset(): void {
    const label = this.savePresetLabel().trim();
    if (!label) {
      this.savePresetError.set('Please enter a name for this preset.');
      return;
    }
    // Require a saved address (addressId) - new manual addresses must be saved first via account page
    if (!this.f.addressId) {
      this.savePresetError.set('Please save your address in Account settings first, then create a preset.');
      return;
    }
    this.savingPreset.set(true);
    this.savePresetError.set('');
    this.api.post('/user/me/quote-presets', {
      label,
      contactName: this.f.contactName.trim(),
      contactNumber: this.f.contactNumber.trim(),
      addressId: this.f.addressId,
      instruction: this.f.notes?.trim() || undefined,
      preferredTimeSlot: this.f.timeSlot || undefined,
    }).subscribe({
      next: () => {
        this.savingPreset.set(false);
        this.savePresetOpen.set(false);
        this.loadPresets();
      },
      error: (e) => {
        this.savingPreset.set(false);
        this.savePresetError.set(e.message ?? 'Could not save preset');
      },
    });
  }

  applyPreset(id: string): void {
    const p = this.presets().find((x) => x.id === id);
    if (p) this.applyPresetObject(p);
  }
  private applyPresetObject(p: Preset): void {
    this.f.contactName = p.contactName;
    this.f.contactNumber = p.contactNumber;
    this.f.addressId = p.addressId;
    if (p.instruction) this.f.notes = p.instruction;
    if (p.preferredTimeSlot) this.f.timeSlot = p.preferredTimeSlot;
    const addr = this.addresses().find((a) => a.id === p.addressId);
    if (addr) {
      // First segment (before the first comma) is the street line; split a
      // leading house/unit number off it into No.  Supports formats:
      //   "12 Jalan…"           → No "12",  Street "Jalan…"
      //   "No. 12 Jalan…"       → No "12",  Street "Jalan…"
      //   "12A Jalan…"          → No "12A", Street "Jalan…"
      //   "B-2-3 Jalan…"        → No "B-2-3", Street "Jalan…"
      //   "Lot 1234 Jalan…"     → No "1234", Street "Jalan…"
      //   "Jalan SS2/72,…"      → No "",    Street "Jalan SS2/72,…" (no leading number)
      const firstComma = addr.address.indexOf(',');
      const firstSegment = (firstComma > 0 ? addr.address.slice(0, firstComma) : addr.address).trim();
      // Try to extract a leading number/unit token: optional No|Lot prefix, then number token
      const numMatch = firstSegment.match(
        /^(?:(?:No|Lot)\.?\s+)?(\d[\dA-Za-z]*|(?:[A-Z]-\d[\d\/\-]*))\s+(.+)$/i
      );
      if (numMatch) {
        this.f.addressNo = numMatch[1];
        this.f.streetDetails = numMatch[2].trim();
      } else if (/^(?:Suite|Unit|Block|Apt|No\.?|Lot\.?)\s+\S+$/i.test(firstSegment)) {
        // Standalone unit segment like "Suite 8" - whole segment is unit, next comma segment is street
        this.f.addressNo = firstSegment;
        const rest = firstComma > 0 ? addr.address.slice(firstComma + 1) : '';
        const nextComma = rest.indexOf(',');
        this.f.streetDetails = (nextComma > 0 ? rest.slice(0, nextComma) : rest).trim();
      } else {
        this.f.addressNo = '';
        this.f.streetDetails = firstSegment;
      }
      this.f.newAddressPostcode = addr.postcode ?? '';
      this.f.newAddressDistrict = addr.district ?? '';
      this.f.newAddressState = addr.state ?? '';
      this.f.newAddressPropertyType = addr.propertyType ?? '';
    } else {
      this.f.addressNo = '';
      this.f.streetDetails = '';
      this.f.newAddressLat = undefined;
      this.f.newAddressLng = undefined;
      this.f.newAddressPostcode = '';
      this.f.newAddressDistrict = '';
      this.f.newAddressState = '';
      this.f.newAddressPropertyType = '';
    }
  }

  // ── Summary helpers ──────────────────────────────────────────────────────
  categoryName(): string {
    return this.categories().find((c) => c.id === this.categoryId())?.name ?? ' - ';
  }
  addressLabel(): string {
    const a = this.addresses().find((x) => x.id === this.f.addressId);
    if (a) return `${a.label} - ${a.address}`;
    const full = [this.f.addressNo, this.f.streetDetails].filter(Boolean).join(', ');
    return full || ' - ';
  }
  timeSlotLabel(value: string): string {
    return TIME_SLOTS.find((t) => t.value === value)?.label ?? value;
  }
  rangeLabel(r: BudgetRange): string {
    return r.max == null ? `RM ${r.min}+` : `RM ${r.min}–${r.max}`;
  }
  budgetLabel(): string {
    if (this.f.budgetIndex === '') return ' - ';
    const r = this.budgetRanges()[Number(this.f.budgetIndex)];
    return r ? this.rangeLabel(r) : ' - ';
  }
  answerLabel(q: QuoteQuestion): string {
    const a = this.answers()[q.key];
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
    if (q.type === 'text') return typeof a === 'string' ? a : '';
    return labelFor(typeof a === 'string' ? a : String(a));
  }

  // ── Top-up prompt guard actions ──────────────────────────────────

  /** Real top-up - opens Stripe Checkout in new tab via shared service. */
  doTopUpRedirect(): void {
    const amount = this.topUpAmount;
    if (!amount || amount < 10) return;
    this.toppingUp.set(true);
    this.topUpError.set('');
    this.api.post<{ url: string; sessionId: string }>('/user/me/topup', { amount }).subscribe({
      next: (r) => {
        this.toppingUp.set(false);
        if (r.url) {
          this.dismissTopUp();
          this.stripePayment.openPayment({
            url: r.url,
            sessionId: r.sessionId,
            onSuccess: (balance) => {
              this.auth.updateCreditBalance(balance);
              this.confirmAfterTopUp();
            },
          });
        }
      },
      error: (e) => {
        this.toppingUp.set(false);
        this.topUpError.set(e?.message ?? 'Top-up failed');
      },
    });
  }

  /** Confirm top-up completed and submit quote if balance is sufficient. */
  confirmAfterTopUp(): void {
    const hold = this.estimateData()?.holdAmount ?? this.estimatedTotal();
    if (
      this.f.paymentTiming === 'pay_now' &&
      this.f.settlementMethod === 'credit' &&
      hold !== null &&
      hold > this.creditBalance()
    ) {
      this.topUpError.set(
        `Still insufficient. You need RM ${(hold - this.creditBalance()).toFixed(2)} more.`,
      );
      return;
    }
    this.dismissTopUp();
    this.doSubmit();
  }

  /** Dismiss the prompt guard and restore body scroll. */
  dismissTopUp(): void {
    this.showTopUp.set(false);
    this.topUpError.set('');
    this.restoreBodyScroll();
  }

  private restoreBodyScroll(): void {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
  }

  startConfirmCountdown(): void {
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
    this.confirmCountdown.set(3);
    this.countdownTimer = setInterval(() => {
      const n = this.confirmCountdown() - 1;
      this.confirmCountdown.set(n);
      if (n <= 0) this.goToQuotesNow();
    }, 1000);
  }

  goToQuotesNow(): void {
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
    this.router.navigate(['/customer/quotes']);
  }

  ngOnDestroy(): void {
    this.restoreBodyScroll();
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
    this.assist.unregister();
  }

  // ── Chat assist bridge ─────────────────────────────────────────────────────
  /** Snapshot of the live form for the chat assistant. */
  private buildFormContext(): QuoteFormContext {
    const step = this.step();
    const stepName = step === 1 ? 'service' : step === 2 ? 'contact' : step === 3 ? 'summary' : 'confirmation';
    const filled: string[] = [];
    if (this.categoryId()) filled.push('categoryId');
    if (this.f.preferredDate) filled.push('preferredDate');
    if (this.f.timeSlot) filled.push('timeSlot');
    if (this.f.contactName.trim()) filled.push('contactName');
    if (this.f.contactNumber.trim()) filled.push('contactNumber');
    if (this.f.addressId || this.f.streetDetails.trim()) filled.push('address');
    if (this.f.notes.trim()) filled.push('notes');

    const required =
      step === 1 ? ['categoryId']
      : step === 2 ? ['contactName', 'contactNumber', 'address', 'preferredDate', 'timeSlot']
      : [];
    const missing = required.filter((k) => !filled.includes(k));

    const cat = this.categories().find((c) => c.id === this.categoryId());
    return { step, stepName, categoryName: cat?.name, filled, missing };
  }

  /** Fill one field in the live form on the assistant's behalf. */
  private applyFormField(key: string, value: string): void {
    switch (key) {
      case 'categoryId': {
        const child = this.categories().find((c) => c.id === value);
        if (child) { this.parentId.set(child.parentCategoryId ?? ''); this.onCategoryChange(value); }
        break;
      }
      case 'preferredDate': this.f.preferredDate = value; break;
      case 'timeSlot':      this.f.timeSlot = value; break;
      case 'contactName':   this.f.contactName = value; break;
      case 'contactNumber': this.f.contactNumber = value; break;
      case 'address':       this.f.streetDetails = value; break;
      case 'notes':         this.f.notes = value; break;
      case 'extraNotes':    this.f.extraNotes = value; break;
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────
  submit(): void {
    if (!this.f.agreeTerms) {
      this.setErrors(['agreeTerms'], 'Please agree to the platform terms.');
      return;
    }
    this.fieldErrors.set(new Set());
    this.stepError.set('');

    // Re-validate promo code before submit - check conditions haven't changed
    const code = this.f.promoCode.trim();
    if (code && this.appliedPromoCode()) {
      this.submitting.set(true);
      const range = this.f.budgetIndex !== '' ? this.budgetRanges()[Number(this.f.budgetIndex)] : undefined;
      const params: Record<string, string> = {
        categoryId: this.categoryId(),
        budgetMin: range ? String(range.min) : '0',
        promoCode: code,
      };
      if (range?.max != null) params['budgetMax'] = String(range.max);

      this.api.get<EstimateResult & { promoError?: string }>('/quotes/estimate', params).subscribe({
        next: (r) => {
          this.submitting.set(false);
          if (r.promoError) {
            // Promo code no longer valid - remove it and show error
            this.appliedPromoCode.set('');
            this.f.promoCode = '';
            this.promoApplyError.set(r.promoError);
            this.fetchEstimate();
            return;
          }
          this.estimateData.set(r);
          this.continueSubmit();
        },
        error: () => {
          this.submitting.set(false);
          this.stepError.set('Could not re-validate promo code. Please try again.');
        },
      });
      return;
    }

    this.continueSubmit();
  }

  private continueSubmit(): void {
    const total = this.estimatedTotal();
    const hold = this.estimateData()?.holdAmount ?? total;
    if (this.f.paymentTiming === 'pay_now' && this.f.settlementMethod === 'gateway') {
      if (!this.cardPaymentDone()) {
        this.onGatewaySelect();
        return;
      }
      this.doSubmit();
      return;
    }

    if (
      this.f.paymentTiming === 'pay_now' &&
      this.f.settlementMethod === 'credit' &&
      hold !== null &&
      hold > this.creditBalance()
    ) {
      this.topUpAmount = this.requiredTopUp();
      this.topUpError.set('');
      this.showTopUp.set(true);
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return;
    }
    this.doSubmit();
  }

  private doSubmit(): void {
    this.submitting.set(true);
    const proposalDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const range = this.f.budgetIndex !== '' ? this.budgetRanges()[Number(this.f.budgetIndex)] : undefined;

    const paymentMode = this.f.paymentTiming === 'pay_now' ? 'pay_now' : 'pay_later';

    const payload: Record<string, unknown> = {
      categoryId: this.categoryId(),
      contactName: this.f.contactName,
      contactNumber: this.f.contactNumber,
      timeSlot: this.f.timeSlot,
      preferredDate: new Date(this.f.preferredDate).toISOString(),
      paymentMode,
      deadlineMode: 'fixed_time',
      proposalDeadline: proposalDeadline.toISOString(),
      agreeTerms: true,
    };

    // Locked rebook: direct the quote to the pinned servicer only.
    if (this.rebookServicerId()) {
      payload['targetServicerId'] = this.rebookServicerId();
    }

    if (this.f.addressId) {
      payload['addressId'] = this.f.addressId;
    }

    if (this.f.paymentTiming === 'pay_later' || this.f.settlementMethod === 'gateway') {
      payload['settlementMethod'] = this.f.settlementMethod;
    }

    if (!this.f.addressId && this.f.streetDetails.trim()) {
      const fullAddress = [this.f.addressNo, this.f.streetDetails].filter(Boolean).join(', ');
      payload['address'] = fullAddress;
      if (this.f.newAddressLat != null) payload['lat'] = this.f.newAddressLat;
      if (this.f.newAddressLng != null) payload['lng'] = this.f.newAddressLng;
      if (this.f.newAddressPostcode) payload['postcode'] = this.f.newAddressPostcode;
      if (this.f.newAddressDistrict) payload['district'] = this.f.newAddressDistrict;
      if (this.f.newAddressState) payload['state'] = this.f.newAddressState;
      if (this.f.newAddressPropertyType) payload['propertyType'] = this.f.newAddressPropertyType;
    }
    if (range) {
      payload['budgetMin'] = range.min;
      if (range.max != null) payload['budgetMax'] = range.max;
    }
    if (this.f.notes.trim()) payload['notes'] = this.f.notes.trim();
    if (this.f.promoCode.trim()) payload['promoCode'] = this.f.promoCode.trim();
    const serviceDetails: Record<string, unknown> = { ...this.answers() };
    if (this.f.extraNotes.trim()) serviceDetails['_extraNotes'] = this.f.extraNotes.trim();
    if (Object.keys(serviceDetails).length > 0) payload['serviceDetails'] = serviceDetails;

    this.api.post<{ id: string; remainingBalance?: number; proposals?: unknown[] }>('/quotes', payload).subscribe({
      next: (r) => {
        this.submitting.set(false);
        if (r.remainingBalance != null) this.auth.updateCredit(r.remainingBalance);
        // Show confirmation state with countdown redirect
        this.submittedQuoteId.set(r.id ?? '');
        this.submittedCategory.set(this.categoryName());
        this.submitted.set(true);
        this.startConfirmCountdown();
        if (r.id) {
          this.api.get<{ data: unknown[] }>(`/quotes/${r.id}/proposals`).subscribe({
            next: (p) => this.submittedProposalCount.set(p.data?.length ?? 0),
            error: () => {},
          });
        }
      },
      error: (e) => {
        this.submitting.set(false);
        const msg = e?.message ?? '';
        // Insufficient credit - route to top-up overlay instead of raw error
        if (/insufficient credit/i.test(msg) && this.f.paymentTiming === 'pay_now') {
          const total = this.estimatedTotal();
          if (total !== null && total > this.creditBalance()) {
            this.topUpAmount = this.requiredTopUp();
            this.topUpError.set('');
            this.showTopUp.set(true);
            document.body.style.overflow = 'hidden';
            document.body.style.touchAction = 'none';
            return;
          }
        }
        this.stepError.set(msg || 'Could not submit quote');
      },
    });
  }
}
