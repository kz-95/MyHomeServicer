import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { ConfigService } from '../core/services/config.service';
import { PhoneInputComponent } from '../shared/phone-input.component';
import { environment } from '../../environments/environment';

const googleOAuthUrl = `${environment.apiBase}/auth/google`;

/** Customer registration page. */
@Component({
    selector: 'app-register',
    imports: [FormsModule, RouterLink, PhoneInputComponent],
    template: `
    <div class="wrap">
      <div class="card box">
        <h1>Create account</h1>
        <p class="muted">Sign up as a customer</p>

        @if (showGoogle) {
          <a class="btn-google" [href]="googleUrl">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Sign up with Google
          </a>
          <div class="divider"><span>or</span></div>
        }

        <label>Name<input [(ngModel)]="name" name="name" maxlength="100" /></label>
        <label>Email<input [(ngModel)]="email" name="email" type="email" autocomplete="email" maxlength="255" /></label>
        <label>Phone<app-phone-input [(ngModel)]="phone" name="phone"></app-phone-input></label>
        <label>
          Password
          <input type="password" [(ngModel)]="password" name="password" autocomplete="new-password" maxlength="128" />
        </label>
        <span class="muted hint">At least 8 characters and one number.</span>
        <label>
          Security PIN <span class="muted">(optional)</span>
          <input type="password" [(ngModel)]="pin" name="pin" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" placeholder="6-digit PIN" />
        </label>
        <span class="muted hint">Leave blank to use the default PIN (123456). You can change it in Account settings.</span>

        @if (error()) {
          <p class="err">{{ error() }}</p>
        }

        <button class="btn-primary" (click)="submit()" [disabled]="busy()">
          {{ busy() ? 'Creating…' : 'Create account' }}
        </button>
        <p class="muted">Already have an account? <a routerLink="/login">Sign in</a></p>
        <p class="muted">
          Are you a service provider? <a routerLink="/register/servicer">Join as a Servicer</a>
        </p>
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
        justify-content: center;
        height: 100vh;
        overflow-y: auto;
        padding-top: 6vh;
        padding-inline: 1rem;
      }
      .box {
        width: 100%;
        max-width: 380px;
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        animation: card-drop 0.22s ease both;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .hint {
        font-size: 0.8rem;
        margin-top: -0.3rem;
      }
      .err {
        color: var(--color-danger);
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
    `,
    ]
})
export class RegisterComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private config = inject(ConfigService);

  name = '';
  email = '';
  phone = '';
  password = '';
  pin = '';
  busy = signal(false);
  error = signal('');
  showGoogle = Boolean(this.config.googleClientId);
  googleUrl = googleOAuthUrl;

  ngOnInit(): void {
    const prefill = this.route.snapshot.queryParamMap.get('prefill');
    if (prefill === 'guest') {
      const guest = this.auth.getGuestData();
      if (guest) {
        if (guest.contactName) this.name = guest.contactName;
        if (guest.contactNumber) this.phone = guest.contactNumber;
      }
    }
  }

  submit(): void {
    if (!this.name || !this.email || !this.phone || !this.password) {
      this.error.set('Please fill in every field');
      return;
    }
    if (this.password.length < 8) {
      this.error.set('Password must be at least 8 characters');
      return;
    }
    if (!/^[0-9+\-\s()]{6,20}$/.test(this.phone)) {
      this.error.set('Please enter a valid phone number');
      return;
    }
    if (!this.email.includes('@')) {
      this.error.set('Please enter a valid email address');
      return;
    }
    if (this.pin && !/^[0-9]{6}$/.test(this.pin)) {
      this.error.set('PIN must be exactly 6 digits');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const payload: { name: string; email: string; phone: string; password: string; pin?: string } = {
      name: this.name, email: this.email, phone: this.phone, password: this.password,
    };
    if (this.pin && this.pin.length === 6) payload.pin = this.pin;
    this.auth
      .register(payload)
      .subscribe({
        next: () => this.router.navigate(['/customer']),
        error: (e) => {
          this.error.set(e.message ?? 'Registration failed');
          this.busy.set(false);
        },
      });
  }
}
