import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface StripePaymentConfig {
  url: string;
  sessionId: string;
  /** If set, polls this backend endpoint to verify payment (requires auth). */
  verifyEndpoint?: string;
  /** A tab the caller already opened synchronously inside the click handler
   *  (to dodge popup blockers). If provided, it is navigated to `url` instead
   *  of opening a fresh tab here in the async callback. */
  targetWindow?: Window | null;
  /** Called after successful payment. Receives the new balance. */
  onSuccess?: (balance: number) => void;
  onCancel?: () => void;
}

/**
 * Shared service for Stripe Checkout payment flows.
 *
 * Opens Stripe in a **new tab** (`window.open` with `_blank`) and shows a
 * waiting overlay while the user completes payment.  Two verification
 * strategies are available:
 *
 *  1. **Backend polling** – calls `verifyEndpoint` every 3 s (authenticated
 *     users).  The endpoint should return `{ balance }` on success and
 *     throw on "not yet paid".
 *  2. **localStorage polling** – listens for a result written by the
 *     redirect-back tab via `checkPopupContext()`.  Used for guest flows
 *     where no auth token is available.
 *
 * The overlay is rendered by the `ShellComponent` which binds to `state()`.
 */
@Injectable({ providedIn: 'root' })
export class StripePaymentService {
  private api = inject(ApiService);

  readonly state = signal<'idle' | 'processing' | 'success' | 'cancelled' | 'failed'>('idle');
  readonly error = signal('');
  readonly completedBalance = signal<number | null>(null);

  private config: StripePaymentConfig | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private localStoragePolling = false;

  // ── Context detection (call from root component OnInit) ──────────────

  /**
   * Detects if the current window is a redirect-back from Stripe Checkout.
   * If so, it stores the result in localStorage and closes (or shows a
   * message on the current tab).  Should be called once in the shell or
   * app component's `ngOnInit`.
   */
  checkPopupContext(): void {
    if (!window.opener) return;
    const params = new URLSearchParams(window.location.search);

    const submitted = params.get('submitted');
    const topup     = params.get('topup');
    const sessionId = params.get('session_id');

    if (submitted === 'true' || topup === 'success') {
      try {
        localStorage.setItem('stripe_payment_result', JSON.stringify({
          result: 'success',
          sessionId,
          timestamp: Date.now(),
        }));
      } catch {}
    } else if (topup === 'cancelled') {
      try {
        localStorage.setItem('stripe_payment_result', JSON.stringify({
          result: 'cancel',
          sessionId,
          timestamp: Date.now(),
        }));
      } catch {}
    }
    // Close the tab after a brief delay so the user sees a flash of content
    setTimeout(() => window.close(), 500);
  }

  // ── Public API ───────────────────────────────────────────────────────

  /** Opens Stripe Checkout in a new tab and starts backend polling. */
  openPayment(config: StripePaymentConfig): void {
    this.state.set('processing');
    this.error.set('');
    this.completedBalance.set(null);
    this.config = config;
    this.localStoragePolling = false;

    try { localStorage.removeItem('stripe_payment_result'); } catch {}

    const tab = config.targetWindow ?? window.open(config.url, '_blank');
    if (!tab || tab.closed) {
      window.location.href = config.url;
      return;
    }
    // Caller pre-opened a blank tab synchronously (popup-blocker safe) - point
    // it at the Stripe URL now that we have it.
    if (config.targetWindow) {
      try { config.targetWindow.location.href = config.url; } catch { /* ignore */ }
    }

    this.pollTimer = setInterval(() => this.pollBackend(), 3_000);
  }

  /** Opens Stripe Checkout and polls localStorage (guest flows without auth). */
  openGuestPayment(config: StripePaymentConfig): void {
    this.state.set('processing');
    this.error.set('');
    this.completedBalance.set(null);
    this.config = config;
    this.localStoragePolling = true;

    try { localStorage.removeItem('stripe_payment_result'); } catch {}

    const tab = window.open(config.url, '_blank');
    if (!tab || tab.closed) {
      window.location.href = config.url;
      return;
    }

    this.pollTimer = setInterval(() => this.pollLocalStorage(), 400);
  }

  cancel(): void {
    this.stopPoll();
    this.state.set('cancelled');
    this.config?.onCancel?.();
  }

  reset(): void {
    this.stopPoll();
    this.state.set('idle');
    this.error.set('');
    this.completedBalance.set(null);
    this.config = null;
  }

  // ── Polling strategies ───────────────────────────────────────────────

  private pollBackend(): void {
    if (!this.config) { this.stopPoll(); return; }
    const ep = this.config.verifyEndpoint ?? '/stripe/verify-topup';
    this.api.post<{ balance: number }>(ep, { sessionId: this.config.sessionId }).subscribe({
      next: (r) => this.onVerified(r.balance),
      error: () => {},
    });
  }

  private pollLocalStorage(): void {
    try {
      const stored = localStorage.getItem('stripe_payment_result');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed.result === 'success') {
        this.stopPoll();
        this.state.set('success');
        this.config?.onSuccess?.(0);
      } else if (parsed.result === 'cancel') {
        this.stopPoll();
        this.state.set('cancelled');
        this.config?.onCancel?.();
      }
    } catch {}
  }

  private onVerified(balance: number): void {
    this.stopPoll();
    this.completedBalance.set(balance);
    this.state.set('success');
    this.config?.onSuccess?.(balance);
  }

  private stopPoll(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}
