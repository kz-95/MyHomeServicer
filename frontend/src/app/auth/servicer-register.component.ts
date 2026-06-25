import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { routeFor } from '../core/route-for';
import { ApiService } from '../core/services/api.service';
import { ConfigService } from '../core/services/config.service';
import { PhoneInputComponent } from '../shared/phone-input.component';
import { environment } from '../../environments/environment';

const googleServicerUrl = `${environment.apiBase}/auth/google?intent=servicer`;

interface Category {
  id: string;
  name: string;
}

/**
 * Servicer ("servicer") registration page. The platform category is fixed at
 * registration - a servicer operates within one main category.
 */
@Component({
    selector: 'app-servicer-register',
    imports: [FormsModule, RouterLink, PhoneInputComponent],
    template: `
    <div class="wrap">
      <div class="card box">
        <div class="brand">
          <span class="logo-wrap" [class.loaded]="logoLoaded()">
            <img src="assets/ico/MyHomeServicerIcon.png" class="logo-icon" alt="" (load)="logoLoaded.set(true)" />
            <span class="logo-shimmer"></span>
          </span>
          My Home Servicer
        </div>
        <h1>Join as a Servicer</h1>
        <p class="muted">Register your business and start receiving quote requests.</p>

        <div class="steps">
          <span class="step" [class.active]="step() >= 1">1. Account</span>
          <span class="step" [class.active]="step() >= 2">2. Business</span>
          <span class="step" [class.active]="step() >= 3">3. PIN</span>
        </div>

        @if (step() === 1) {
          <span class="section">Your account</span>

          @if (showGoogle && !emailLocked()) {
            <a class="btn-google" [href]="googleUrl">
              <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </a>
            <div class="divider"><span>or</span></div>
          }

          <label>Contact name<input [(ngModel)]="name" name="name" [class.input-error]="fieldErr()['name']" (ngModelChange)="clearErr('name')" (blur)="validateField('name')" /></label>
          @if (fieldErr()['name']) { <span class="field-err">{{ fieldErr()['name'] }}</span> }
          <label>Email<input [(ngModel)]="email" name="email" autocomplete="username" [disabled]="emailLocked()" [class.input-error]="fieldErr()['email']" (ngModelChange)="clearErr('email')" (blur)="validateField('email')" /></label>
          @if (emailLocked()) { <span class="muted hint">Verified email - locked to your account.</span> }
          @if (fieldErr()['email']) { <span class="field-err">{{ fieldErr()['email'] }}</span> }
          <label>Phone<app-phone-input [(ngModel)]="phone" name="phone" (ngModelChange)="clearErr('phone')"></app-phone-input></label>
          @if (fieldErr()['phone']) { <span class="field-err">{{ fieldErr()['phone'] }}</span> }
          <label>
            Password
            <div class="pw-wrap">
              <input [type]="showPassword() ? 'text' : 'password'" [(ngModel)]="password" name="password" autocomplete="new-password" [class.input-error]="fieldErr()['password']" (ngModelChange)="clearErr('password')" (blur)="validateField('password')" />
              <button type="button" class="eye-btn" (click)="showPassword.set(!showPassword())" tabindex="-1" [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'">
                @if (showPassword()) {
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                } @else {
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </label>
          @if (fieldErr()['password']) { <span class="field-err">{{ fieldErr()['password'] }}</span> }
          <label>
            Confirm password
            <div class="pw-wrap">
              <input [type]="showConfirmPassword() ? 'text' : 'password'" [(ngModel)]="confirmPassword" name="confirmPassword" autocomplete="new-password" [class.input-error]="fieldErr()['confirmPassword']" (ngModelChange)="clearErr('confirmPassword')" (blur)="validateField('confirmPassword')" />
              <button type="button" class="eye-btn" (click)="showConfirmPassword.set(!showConfirmPassword())" tabindex="-1" [attr.aria-label]="showConfirmPassword() ? 'Hide password' : 'Show password'">
                @if (showConfirmPassword()) {
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                } @else {
                  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </label>
          @if (fieldErr()['confirmPassword']) { <span class="field-err">{{ fieldErr()['confirmPassword'] }}</span> }
          <span class="muted hint">At least 8 characters and one number.</span>

          @if (error()) {
            <p class="err">{{ error() }}</p>
          }

          <button class="btn-primary" (click)="nextStep1()">Continue</button>
        }

        @if (step() === 2) {
          <span class="section">Your business</span>
          <label>Business name<input [(ngModel)]="businessName" name="businessName" [class.input-error]="fieldErr()['businessName']" (ngModelChange)="clearErr('businessName')" (blur)="validateField('businessName')" /></label>
          @if (fieldErr()['businessName']) { <span class="field-err">{{ fieldErr()['businessName'] }}</span> }
          <label>
            Service category
            <select [(ngModel)]="categoryId" name="categoryId" [class.input-error]="fieldErr()['categoryId']" (ngModelChange)="clearErr('categoryId')" (blur)="validateField('categoryId')">
              <option value="">Select a category…</option>
              @for (c of categories(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </label>
          @if (fieldErr()['categoryId']) { <span class="field-err">{{ fieldErr()['categoryId'] }}</span> }
          <span class="muted hint">This is fixed once you register.</span>

          <label>
            Service areas <span class="muted">(optional, comma-separated)</span>
            <input [(ngModel)]="serviceAreas" name="serviceAreas" placeholder="Petaling Jaya, Subang…" />
          </label>

          <label class="checkbox">
            <input type="checkbox" [(ngModel)]="isCompany" name="isCompany" />
            We are a registered company
          </label>
          @if (isCompany) {
            <label>Tax number<input [(ngModel)]="taxNumber" name="taxNumber" [class.input-error]="fieldErr()['taxNumber']" (ngModelChange)="clearErr('taxNumber')" (blur)="validateField('taxNumber')" /></label>
            @if (fieldErr()['taxNumber']) { <span class="field-err">{{ fieldErr()['taxNumber'] }}</span> }
            <label>
              Business registration number
              <input [(ngModel)]="businessRegistrationNumber" name="brn" [class.input-error]="fieldErr()['businessRegistrationNumber']" (ngModelChange)="clearErr('businessRegistrationNumber')" (blur)="validateField('businessRegistrationNumber')" />
            </label>
            @if (fieldErr()['businessRegistrationNumber']) { <span class="field-err">{{ fieldErr()['businessRegistrationNumber'] }}</span> }
          }

          @if (error()) {
            <p class="err">{{ error() }}</p>
          }

          <div class="btn-row">
            <button class="btn-ghost" (click)="step.set(1)">Back</button>
            <button class="btn-primary" (click)="nextStep2()">Continue</button>
          </div>
        }

        @if (step() === 3) {
          <section class="card page-child">
            <h2>Set your Action PIN (optional)</h2>
            <p class="muted">
              Your PIN protects cancellations and withdrawals.
              Skip to use the default: <strong>123456</strong>.
            </p>
            <label>PIN (6 digits)
              <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="pin" name="pin" [class.input-error]="fieldErr()['pin']" (ngModelChange)="clearErr('pin')" (blur)="validateField('pin')" />
            </label>
            @if (fieldErr()['pin']) { <span class="field-err">{{ fieldErr()['pin'] }}</span> }
            <label>Confirm PIN
              <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="pinConfirm" name="pinConfirm" [class.input-error]="fieldErr()['pinConfirm']" (ngModelChange)="clearErr('pinConfirm')" (blur)="validateField('pinConfirm')" />
            </label>
            @if (fieldErr()['pinConfirm']) { <span class="field-err">{{ fieldErr()['pinConfirm'] }}</span> }
            @if (error()) { <p class="err">{{ error() }}</p> }
            <div class="btn-row">
              <button class="btn-ghost" (click)="skipPin()">Skip</button>
              <button class="btn-primary" (click)="submitPin()" [disabled]="busy()">
                {{ busy() ? 'Creating…' : 'Continue' }}
              </button>
            </div>
          </section>
        }

        <p class="muted">Looking for a service? <a [routerLink]="routeFor('register')">Customer sign-up</a></p>
        <p class="muted">Already have an account? <a [routerLink]="routeFor('login')">Sign in</a></p>
        <p class="muted"><a [routerLink]="routeFor('home')">← Back to home</a></p>
      </div>
    </div>
  `,
    styles: [
        `
      @keyframes card-drop {
        from { opacity: 0; transform: translateY(-12px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100vh;
        height: 100dvh;
        overflow-y: auto;
        padding: 6vh 1rem;
        box-sizing: border-box;
      }
      .box {
        width: 100%;
        max-width: 420px;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        animation: card-drop 0.22s ease both;
      }
      .steps {
        display: flex;
        gap: 1rem;
        margin-bottom: 0.4rem;
      }
      .step {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--color-muted);
        opacity: 0.5;
      }
      .step.active {
        opacity: 1;
        color: var(--color-primary);
      }
      .section {
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-muted);
        margin-top: 0.6rem;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .checkbox {
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
        font-weight: 400;
      }
      .checkbox input {
        width: auto;
      }
      .hint {
        font-size: 0.8rem;
        margin-top: -0.3rem;
      }
      .pw-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .pw-wrap input {
        flex: 1;
        padding-right: 2.4rem;
      }
      .eye-btn {
        position: absolute;
        right: 0.5rem;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        line-height: 1;
        color: var(--color-muted);
      }
      .eye-btn svg {
        display: block;
      }
      .err {
        color: var(--color-danger);
      }
      .field-err {
        color: var(--color-danger);
        font-size: 0.78rem;
        margin-top: -0.4rem;
      }
      .btn-row {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.3rem;
      }
      .page-child {
        border: none;
        padding: 0;
      }
      .btn-google {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.6rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-bg);
        color: var(--color-text);
        font-size: 0.9rem;
        font-weight: 500;
        text-decoration: none;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      .btn-google:hover {
        background: var(--color-surface);
        border-color: var(--color-primary);
      }
      .divider {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        color: var(--color-muted);
        font-size: 0.8rem;
      }
      .divider::before, .divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--color-border);
      }
      .brand {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        gap: 0.4rem;
        border: none;
        padding: 0;
        cursor: pointer;
        font-family: var(--font-display);
        font-weight: 400;
        font-size: 1.5rem;
        background: var(--gradient-primary);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-decoration: none;
        flex-shrink: 0;
        margin-bottom: 0.5rem;
      }
      h1 { font-size: 1.05rem; margin-top: 0.25rem; }
      .logo-wrap {
        position: relative;
        display: inline-flex;
        width: 34px;
        height: 34px;
        flex-shrink: 0;
      }
      .logo-shimmer {
        position: absolute;
        inset: 0;
        border-radius: 6px;
        background: linear-gradient(90deg, var(--color-border) 25%, var(--color-bg) 50%, var(--color-border) 75%);
        background-size: 200% 100%;
        animation: logo-shimmer-move 2s ease-in-out infinite;
        transition: opacity 0.3s;
      }
      .logo-wrap.loaded .logo-shimmer { opacity: 0; pointer-events: none; animation: none; }
      @keyframes logo-shimmer-move {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
    `,
    ]
})
export class ServicerRegisterComponent implements OnInit {
  routeFor = routeFor;
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private config = inject(ConfigService);
  private router = inject(Router);

  logoLoaded = signal(false);
  categories = signal<Category[]>([]);
  showGoogle = Boolean(this.config.googleClientId);
  googleUrl = googleServicerUrl;
  /** True when the email came from a signed-in account (Google or existing) - locked. */
  emailLocked = signal(false);

  name = '';
  email = '';
  phone = '';
  password = '';
  confirmPassword = '';
  showPassword = signal(false);
  showConfirmPassword = signal(false);
  businessName = '';
  categoryId = '';
  serviceAreas = '';
  isCompany = false;
  taxNumber = '';
  businessRegistrationNumber = '';

  step = signal(1);
  pin = signal('');
  pinConfirm = signal('');

  busy = signal(false);
  error = signal('');
  fieldErr = signal<Record<string, string>>({});

  /** Validate a single field; returns its error message ('' when valid). */
  private checkField(key: string): string {
    switch (key) {
      case 'name':
        return this.name.trim() ? '' : 'Enter your name';
      case 'email':
        if (!this.email.trim()) return 'Enter a valid email';
        return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(this.email) ? '' : 'Enter a valid email';
      case 'phone':
        return /^[0-9+\-\s()]{6,20}$/.test(this.phone) ? '' : 'Enter a valid phone number';
      case 'password':
        if (this.password.length < 8 || !/[0-9]/.test(this.password))
          return 'At least 8 characters and one number';
        return '';
      case 'confirmPassword':
        if (!this.confirmPassword) return 'Passwords do not match';
        return this.confirmPassword === this.password ? '' : 'Passwords do not match';
      case 'businessName':
        return this.businessName.trim() ? '' : 'Enter your business name';
      case 'categoryId':
        return this.categoryId ? '' : 'Select a category';
      case 'taxNumber':
        if (this.isCompany && !this.taxNumber.trim()) return 'Required for a registered company';
        return '';
      case 'businessRegistrationNumber':
        if (this.isCompany && !this.businessRegistrationNumber.trim())
          return 'Required for a registered company';
        return '';
      case 'pin':
        if ((this.pin() || this.pinConfirm()) && !/^[0-9]{6}$/.test(this.pin()))
          return 'PIN must be exactly 6 digits';
        return '';
      case 'pinConfirm':
        if ((this.pin() || this.pinConfirm()) && this.pinConfirm() !== this.pin())
          return 'PINs do not match';
        return '';
      default:
        return '';
    }
  }

  /** Validate one field on blur and store its message. */
  validateField(key: string): void {
    const msg = this.checkField(key);
    this.fieldErr.update((m) => ({ ...m, [key]: msg }));
  }

  /** Clear a field's error on input. */
  clearErr(key: string): void {
    if (this.fieldErr()[key]) {
      this.fieldErr.update((m) => ({ ...m, [key]: '' }));
    }
  }

  ngOnInit(): void {
    // A signed-in customer (e.g. after Google sign-in or "become a servicer")
    // converts in place: lock their verified email so they finish the business form.
    const principal = this.auth.principal();
    if (principal?.email && !principal.email.endsWith('@customer.servicer.local')) {
      this.email = principal.email;
      this.emailLocked.set(true);
      if (principal.name && !this.name) this.name = principal.name;
    }
    this.api
      .get<{ data: Category[] }>('/categories')
      .subscribe({
        next: (r) => this.categories.set(r.data ?? []),
        error: () => this.error.set('Could not load categories. Please refresh the page.'),
      });
  }

  nextStep1(): void {
    this.error.set('');
    const keys = ['name', 'email', 'phone', 'password', 'confirmPassword'];
    if (this.validateKeys(keys)) return;
    this.step.set(2);
  }

  nextStep2(): void {
    this.error.set('');
    const keys = ['businessName', 'categoryId'];
    if (this.isCompany) keys.push('taxNumber', 'businessRegistrationNumber');
    if (this.validateKeys(keys)) return;
    this.step.set(3);
  }

  /** Validate the given field keys, store messages, return true if any invalid. */
  private validateKeys(keys: string[]): boolean {
    const errs: Record<string, string> = { ...this.fieldErr() };
    for (const k of keys) errs[k] = this.checkField(k);
    this.fieldErr.set(errs);
    return keys.some((k) => errs[k]);
  }

  submit(pin?: string): void {
    this.busy.set(true);
    this.error.set('');
    const areas = this.serviceAreas
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    this.auth
      .registerServicer({
        name: this.name,
        email: this.email,
        phone: this.phone,
        password: this.password,
        confirmPassword: this.confirmPassword,
        businessName: this.businessName,
        categoryId: this.categoryId,
        isCompany: this.isCompany,
        ...(this.isCompany && this.taxNumber ? { taxNumber: this.taxNumber } : {}),
        ...(this.isCompany && this.businessRegistrationNumber
          ? { businessRegistrationNumber: this.businessRegistrationNumber }
          : {}),
        ...(areas.length ? { serviceAreas: areas } : {}),
        ...(pin ? { pin } : {}),
      })
      .subscribe({
        next: () => this.router.navigate([routeFor('servicer')]),
        error: (e) => {
          this.error.set(e.message ?? 'Registration failed');
          this.busy.set(false);
        },
      });
  }

  skipPin(): void {
    this.submit();
  }

  submitPin(): void {
    const p = this.pin();
    if (this.validateKeys(['pin', 'pinConfirm'])) return;
    this.submit(p || undefined);
  }
}
