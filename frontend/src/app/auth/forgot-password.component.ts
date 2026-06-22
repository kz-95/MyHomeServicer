import { Component, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/services/api.service';

@Component({
    selector: 'app-forgot-password',
    imports: [FormsModule, RouterLink],
    template: `
    <div class="wrap">
      <div class="card box">
        <img src="assets/ico/MyHomeServicerIcon.png" class="logo-icon" alt="" />
        <h1>Forgot Password</h1>

        @if (!sent()) {
          <p class="muted">Enter your email and we'll send you a reset link.</p>
          <label>Email<input type="email" [(ngModel)]="email" name="email" /></label>
          @if (error()) { <p class="err">{{ error() }}</p> }
          <button class="btn-primary" (click)="sendResetLink()" [disabled]="busy()">
            {{ busy() ? 'Sending\u2026' : 'Send reset link' }}
          </button>
        } @else {
          <p class="muted">If the email exists, a reset link has been sent. Check your inbox and spam.</p>
          <p class="muted small">The link expires in 1 hour.</p>
          <button class="btn-primary" (click)="sent.set(false)">Resend</button>
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
      .small {
        font-size: 0.8rem;
      }
    `,
    ]
})
export class ForgotPasswordComponent {
  private api = inject(ApiService);
  email = '';
  busy = signal(false);
  error = signal('');
  sent = signal(false);

  sendResetLink(): void {
    if (!this.email.trim()) { this.error.set('Enter your email.'); return; }
    this.busy.set(true); this.error.set('');
    this.api.post('/auth/forgot-password', { email: this.email }).subscribe({
      next: () => { this.busy.set(false); this.sent.set(true); },
      error: (e) => { this.busy.set(false); this.error.set(e.message ?? 'Something went wrong.'); },
    });
  }
}
