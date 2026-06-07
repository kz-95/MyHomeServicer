import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { ConfigService } from '../core/services/config.service';
import { environment } from '../../environments/environment';

const googleOAuthUrl = `${environment.apiBase}/auth/google`;

/** Login page. */
@Component({
    selector: 'app-login',
    imports: [FormsModule, RouterLink],
    template: `
    <div class="wrap">
      <div class="card box">
        <h1>Sign in</h1>

        <label>Email<input [(ngModel)]="email" name="email" type="email" autocomplete="username" /></label>
        <label>
          Password
          <input type="password" [(ngModel)]="password" name="password" autocomplete="current-password" maxlength="128" />
        </label>
        <div class="forgot-row">
          <a routerLink="/auth/forgot">Forgot password?</a>
        </div>

        @if (error()) {
          <p class="err">{{ error() }}</p>
        }

        <button class="btn-primary" (click)="submit()" [disabled]="busy()">
          {{ busy() ? 'Signing in…' : 'Sign in' }}
        </button>

        @if (showGoogle) {
          <div class="divider"><span>or</span></div>
          <a class="btn-google" [href]="googleUrl">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Sign in with Google
          </a>
        }

        <p class="muted">No account? <a routerLink="/register">Register</a></p>

        @if (showSkip()) {
          <button class="btn-ghost skip-btn" (click)="skip()">
            Skip login, continue as guest →
          </button>
        }

        <!-- Admin rescue DISABLED 2026-06-03 - not needed for demo
        @if (true) {
          <div class="admin-rescue-section">
            <a (click)="showRescue = true" class="rescue-link">Lost admin access?</a>
          </div>
        }

        @if (showRescue) {
          <div class="rescue-dialog">
            <h3>Admin Recovery</h3>
            @if (rescueStep === 'email') {
              <p>Enter your admin email to receive a recovery code via your backup email.</p>
              <input type="email" [(ngModel)]="rescueEmail" placeholder="Admin email" />
              <button (click)="sendForgotPassword()">Send Recovery Code</button>
              <p class="rescue-or"> - or - </p>
              <button class="btn-danger" (click)="rescueStep = 'reason'">Super Admin Rescue (break glass)</button>
            }
            @if (rescueStep === 'reason') {
              <p>This sends a recovery code to the platform owner's backup email.</p>
              <textarea [(ngModel)]="rescueReason" placeholder="Explain why you need super admin access (min 10 chars)" rows="3"></textarea>
              <button (click)="triggerRescue()" [disabled]="rescueReason.length < 10">Send Rescue Request</button>
            }
            @if (rescueStep === 'otp') {
              <p>Enter the recovery code sent to your email.</p>
              <input type="text" [(ngModel)]="rescueOtp" placeholder="6-digit code" maxlength="6" />
              <button (click)="verifyRescueOtp()">Verify</button>
            }
            @if (rescueStep === 'reset') {
              <p>Set a new password and PIN.</p>
              <input type="password" [(ngModel)]="rescueNewPassword" placeholder="New password" />
              <input type="password" [(ngModel)]="rescueNewPin" placeholder="New PIN (6 digits)" maxlength="6" />
              <button (click)="completeReset()">Reset</button>
            }
            <p class="error">{{ rescueError }}</p>
          </div>
        }
        -->

        <p class="muted"><a routerLink="/">← Back to home</a></p>
      </div>
    </div>
  `,
    styles: [
        `
      :host {
        display: block;
        animation: page-enter 0.15s ease-out both;
      }
      .wrap {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        min-height: 100vh;
        padding: 8vh 1rem 4rem;
        background: var(--color-bg);
      }
      .box {
        width: 100%;
        max-width: 380px;
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
        animation: card-drop 0.22s cubic-bezier(0.34, 1.4, 0.64, 1) both;
      }
      @keyframes card-drop {
        from {
          opacity: 0;
          transform: translateY(-12px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .forgot-row {
        text-align: right;
        margin-top: -0.3rem;
      }
      .forgot-row a {
        font-size: 0.8rem;
        color: var(--color-primary);
        text-decoration: none;
      }
      .forgot-row a:hover {
        text-decoration: underline;
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
      .skip-btn {
        width: 100%; text-align: center; font-size: 0.9rem;
        padding: 0.6rem; border: 1.5px dashed var(--color-border);
        border-radius: var(--radius); color: var(--color-muted);
        transition: border-color 0.2s, color 0.2s;
      }
      .skip-btn:hover {
        border-color: var(--color-primary); color: var(--color-primary);
      }
      /* Admin rescue CSS - DISABLED 2026-06-03 */
      /* .admin-rescue-section { text-align: center; margin-top: 1rem; } */
      /* .rescue-link { color: var(--color-muted, #666); cursor: pointer; font-size: 0.85rem; text-decoration: underline; } */
      /* .rescue-dialog { margin-top: 1.5rem; padding: 1rem; border: 1px solid var(--color-border, #eee); border-radius: 8px; } */
      /* .rescue-dialog input, .rescue-dialog textarea { display: block; width: 100%; margin: 0.5rem 0; padding: 0.5rem; } */
      /* .rescue-dialog button { margin: 0.5rem 0; padding: 0.5rem 1rem; } */
      /* .rescue-or { text-align: center; color: var(--color-muted, #999); margin: 0.5rem 0; } */
      /* .btn-danger { background: #e53e3e; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; } */
    `,
    ]
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private config = inject(ConfigService);

  email = '';
  password = '';
  busy = signal(false);
  error = signal('');
  showSkip = signal(false);
  showGoogle = Boolean(this.config.googleClientId);
  googleUrl = googleOAuthUrl;
  private intent = '';
  // Admin rescue - DISABLED 2026-06-03
  // protected showRescue = false;
  // protected rescueStep: 'email' | 'reason' | 'otp' | 'reset' = 'email';
  // protected rescueEmail = '';
  // protected rescueReason = '';
  // protected rescueOtp = '';
  // protected rescueNewPassword = '';
  // protected rescueNewPin = '';
  // protected rescueToken = '';
  // protected rescueError = '';

  // sendForgotPassword(): void {
  //   this.rescueError = '';
  //   this.http.post('/api/v1/auth/admin/forgot-password', { email: this.rescueEmail }).subscribe({
  //     next: (res: any) => {
  //       if (res.showRescueOption) {
  //         this.rescueStep = 'reason';
  //       } else {
  //         this.rescueStep = 'otp';
  //       }
  //     },
  //     error: (e) => this.rescueError = e.error?.message || 'Failed',
  //   });
  // }

  // triggerRescue(): void {
  //   this.rescueError = '';
  //   this.http.post('/api/v1/auth/admin/rescue', { reason: this.rescueReason }).subscribe({
  //     next: () => this.rescueStep = 'otp',
  //     error: (e) => this.rescueError = e.error?.message || 'Failed',
  //   });
  // }

  // verifyRescueOtp(): void {
  //   this.rescueError = '';
  //   this.http.post('/api/v1/auth/admin/verify-otp', { email: this.rescueEmail || 'admin@demo.local', otp: this.rescueOtp }).subscribe({
  //     next: (res: any) => { this.rescueToken = res.token; this.rescueStep = 'reset'; },
  //     error: (e) => this.rescueError = e.error?.message || 'Invalid code',
  //   });
  // }

  // completeReset(): void {
  //   this.rescueError = '';
  //   this.http.post('/api/v1/auth/admin/reset-password', {
  //     token: this.rescueToken,
  //     newPassword: this.rescueNewPassword,
  //     newPin: this.rescueNewPin,
  //   }).subscribe({
  //     next: () => {
  //       this.showRescue = false;
  //       this.rescueStep = 'email';
  //       alert('Password reset. Please log in with your new credentials and complete the setup wizard.');
  //     },
  //     error: (e) => this.rescueError = e.error?.message || 'Failed',
  //   });
  // }

  ngOnInit(): void {
    this.intent = this.route.snapshot.queryParamMap.get('intent') ?? '';
    this.showSkip.set(this.intent === 'quote' || this.intent === 'chat');
  }

  skip(): void {
    if (this.intent === 'chat') {
      this.router.navigate(['/']);
    } else {
      const catId = this.auth.getGuestData()?.categoryId;
      this.auth.enterGuestMode();
      this.router.navigate(['/guest/quote/new'], catId ? { queryParams: { category: catId } } : {});
    }
  }

  submit(): void {
    if (!this.email || !this.password) {
      this.error.set('Enter your email and password');
      return;
    }
    if (!this.email.includes('@')) {
      this.error.set('Please enter a valid email address');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: (res) => {
        const hasGuestData = this.auth.getGuestData() !== null;
        if (this.intent === 'chat') {
          this.router.navigate(['/']);
        } else if (hasGuestData && res.user.role === 'customer') {
          const catId = this.auth.getGuestData()?.categoryId;
          this.auth.exitGuestMode();
          this.router.navigate(['/customer/quote/new'], catId ? { queryParams: { category: catId } } : {});
        } else {
          this.router.navigate([`/${res.user.role}`]);
        }
      },
      error: (e) => {
        this.error.set(e.message ?? 'Sign in failed');
        this.busy.set(false);
      },
    });
  }
}
