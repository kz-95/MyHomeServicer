import { Component, OnInit, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../core/services/api.service';

@Component({
    selector: 'app-reset-password',
    imports: [FormsModule, RouterLink],
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
        <h1>Set new password</h1>

        @if (!done()) {
          <label>New password<input type="password" [(ngModel)]="newPassword" name="np" /></label>
          <label>Confirm password<input type="password" [(ngModel)]="confirmPassword" name="cp" /></label>
          <p class="muted hint">At least 8 characters and one number.</p>
          @if (error()) { <p class="err">{{ error() }}</p> }
          <button class="btn-primary" (click)="resetPassword()" [disabled]="busy()">
            {{ busy() ? 'Resetting\u2026' : 'Reset password' }}
          </button>
        } @else {
          <p class="muted">Your password has been updated. You can now log in with your new password.</p>
          <a class="btn-primary" routerLink="/login">Go to login</a>
        }

        <p class="muted"><a routerLink="/login">\u2190 Back to login</a></p>
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
      .err {
        color: var(--color-danger);
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
export class ResetPasswordComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  logoLoaded = signal(false);
  token = '';
  newPassword = '';
  confirmPassword = '';
  busy = signal(false);
  error = signal('');
  done = signal(false);

  ngOnInit(): void {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) this.error.set('Invalid reset link. No token provided.');
  }

  resetPassword(): void {
    if (!this.newPassword || this.newPassword.length < 8) { this.error.set('Password must be at least 8 characters.'); return; }
    if (this.newPassword !== this.confirmPassword) { this.error.set('Passwords do not match.'); return; }
    this.busy.set(true); this.error.set('');
    this.api.post('/auth/reset-password', { token: this.token, newPassword: this.newPassword }).subscribe({
      next: () => { this.busy.set(false); this.done.set(true); },
      error: (e) => { this.busy.set(false); this.error.set(e.message ?? 'Reset failed.'); },
    });
  }
}
