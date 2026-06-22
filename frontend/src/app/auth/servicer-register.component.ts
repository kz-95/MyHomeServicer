import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { ApiService } from '../core/services/api.service';
import { PhoneInputComponent } from '../shared/phone-input.component';

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
        <h1>Join as a Servicer</h1>
        <p class="muted">Register your business and start receiving quote requests.</p>

        <div class="steps">
          <span class="step" [class.active]="step() >= 1">1. Account</span>
          <span class="step" [class.active]="step() >= 2">2. Business</span>
          <span class="step" [class.active]="step() >= 3">3. PIN</span>
        </div>

        @if (step() === 1) {
          <span class="section">Your account</span>
          <label>Contact name<input [(ngModel)]="name" name="name" /></label>
          <label>Email<input [(ngModel)]="email" name="email" autocomplete="username" /></label>
          <label>Phone<app-phone-input [(ngModel)]="phone" name="phone"></app-phone-input></label>
          <label>
            Password
            <div class="pw-wrap">
              <input [type]="showPassword() ? 'text' : 'password'" [(ngModel)]="password" name="password" autocomplete="new-password" />
              <button type="button" class="eye-btn" (click)="showPassword.set(!showPassword())" tabindex="-1">
                {{ showPassword() ? '🙈' : '👁' }}
              </button>
            </div>
          </label>
          <label>
            Confirm password
            <div class="pw-wrap">
              <input [type]="showConfirmPassword() ? 'text' : 'password'" [(ngModel)]="confirmPassword" name="confirmPassword" autocomplete="new-password" />
              <button type="button" class="eye-btn" (click)="showConfirmPassword.set(!showConfirmPassword())" tabindex="-1">
                {{ showConfirmPassword() ? '🙈' : '👁' }}
              </button>
            </div>
          </label>
          <span class="muted hint">At least 8 characters and one number.</span>

          @if (error()) {
            <p class="err">{{ error() }}</p>
          }

          <button class="btn-primary" (click)="nextStep1()">Continue</button>
        }

        @if (step() === 2) {
          <span class="section">Your business</span>
          <label>Business name<input [(ngModel)]="businessName" name="businessName" /></label>
          <label>
            Service category
            <select [(ngModel)]="categoryId" name="categoryId">
              <option value="">Select a category…</option>
              @for (c of categories(); track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </label>
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
            <label>Tax number<input [(ngModel)]="taxNumber" name="taxNumber" /></label>
            <label>
              Business registration number
              <input [(ngModel)]="businessRegistrationNumber" name="brn" />
            </label>
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
              <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="pin" name="pin" />
            </label>
            <label>Confirm PIN
              <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="pinConfirm" name="pinConfirm" />
            </label>
            @if (pinError()) { <p class="err">{{ pinError() }}</p> }
            @if (error()) { <p class="err">{{ error() }}</p> }
            <div class="btn-row">
              <button class="btn-ghost" (click)="skipPin()">Skip</button>
              <button class="btn-primary" (click)="submitPin()" [disabled]="busy()">
                {{ busy() ? 'Creating…' : 'Continue' }}
              </button>
            </div>
          </section>
        }

        <p class="muted">Looking for a service? <a routerLink="/register">Customer sign-up</a></p>
        <p class="muted">Already have an account? <a routerLink="/login">Sign in</a></p>
        <p class="muted"><a routerLink="/">← Back to home</a></p>
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
        background: none;
        border: none;
        cursor: pointer;
        font-size: 1rem;
        padding: 0;
        line-height: 1;
        color: var(--color-muted);
      }
      .err {
        color: var(--color-danger);
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
    `,
    ]
})
export class ServicerRegisterComponent implements OnInit {
  private auth = inject(AuthService);
  private api = inject(ApiService);
  private router = inject(Router);

  categories = signal<Category[]>([]);

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
  pinError = signal('');

  busy = signal(false);
  error = signal('');

  ngOnInit(): void {
    this.api
      .get<{ data: Category[] }>('/categories')
      .subscribe({
        next: (r) => this.categories.set(r.data ?? []),
        error: () => this.error.set('Could not load categories. Please refresh the page.'),
      });
  }

  nextStep1(): void {
    this.error.set('');
    if (!this.name || !this.email || !this.phone || !this.password) {
      this.error.set('Please fill in your account details');
      return;
    }
    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match.');
      return;
    }
    this.step.set(2);
  }

  nextStep2(): void {
    this.error.set('');
    if (!this.businessName || !this.categoryId) {
      this.error.set('Please enter your business name and pick a category');
      return;
    }
    this.step.set(3);
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
        next: () => this.router.navigate(['/servicer']),
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
    const pc = this.pinConfirm();
    this.pinError.set('');
    if (p || pc) {
      if (p !== pc) {
        this.pinError.set('PINs do not match.');
        return;
      }
      if (!/^[0-9]{6}$/.test(p)) {
        this.pinError.set('PIN must be exactly 6 digits.');
        return;
      }
    }
    this.submit(p || undefined);
  }
}
