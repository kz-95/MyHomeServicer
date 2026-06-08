import { Injectable, Injector, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

/**
 * PIN dialog holder. Two distinct PINs flow through the same `<app-pin-prompt>`:
 *
 *  1. **Action PIN** (`requirePin`) - the per-account second credential
 *     (`1234` on demo accounts). Required for sensitive operations and the
 *     admin Accounts / Review Queues view-guards. Verified per role:
 *     admin → `/admin/verify-pin` (x-action-pin header), servicer + customer →
 *     `/chat/verify-pin` (body). Cached for the session once verified.
 *
 *  2. **Demo gate PIN** (`requireGatePin`) - the FIXED shared demo login-gate
 *     PIN (`5201314`), a portal-entry speedbump for demo accounts only.
 *     Verified against `/config/demo-gate`. NEVER cached - every restricted
 *     portal entry re-validates.
 *
 * The PIN is never persisted to storage.
 */
@Injectable({ providedIn: 'root' })
export class PinService {
  private api = inject(ApiService);
  private injector = inject(Injector);
  /** Lazy to break the AuthService <-> PinService DI cycle (NG0200 white-screen).
      Only read inside methods, never at construction, so on-demand resolve is safe. */
  private get auth(): AuthService {
    return this.injector.get(AuthService);
  }

  /** Dialog state - read by the global `<app-pin-prompt>` component. */
  open = signal(false);
  verifying = signal(false);
  error = signal('');

  private cachedPin: string | null = null;
  private resolver: ((pin: string | null) => void) | null = null;
  private mode: 'action' | 'gate' = 'action';

  /** Whether this is a servicer PIN request (affects verify endpoint + label). */
  isServicerMode = signal(false);
  /** Whether the dialog is the demo login gate (affects label text). */
  gateMode = signal(false);

  /**
   * Action PIN. Resolves with a backend-verified PIN, or null if cancelled.
   * Reuses the in-memory cached PIN within the same page session; page refresh
   * or new tab re-prompts. Cleared on logout/account switch.
   */
  requirePin(): Observable<string | null> {
    if (this.cachedPin) return of(this.cachedPin);
    this.mode = 'action';
    this.gateMode.set(false);
    this.isServicerMode.set(this.auth.principal()?.role === 'servicer');
    return this.openDialog();
  }

  /**
   * Demo login-gate PIN. ALWAYS opens the dialog (never cached) and verifies
   * the fixed shared demo PIN against the backend. Resolves with the verified
   * PIN, or null if cancelled. Used by the route guards for demo accounts.
   */
  requireGatePin(): Observable<string | null> {
    this.mode = 'gate';
    this.gateMode.set(true);
    this.isServicerMode.set(false);
    return this.openDialog();
  }

  private openDialog(): Observable<string | null> {
    return new Observable<string | null>((sub) => {
      this.error.set('');
      this.verifying.set(false);
      this.resolver = (pin) => {
        sub.next(pin);
        sub.complete();
      };
      this.open.set(true);
    });
  }

  /** Dialog action - verify the entered PIN with the backend, then resolve. */
  confirm(pin: string): void {
    if (!pin.trim()) {
      this.error.set('Enter your PIN.');
      return;
    }
    this.verifying.set(true);
    this.error.set('');

    let obs;
    if (this.mode === 'gate') {
      // Demo login gate - fixed shared PIN, distinct from the action PIN.
      obs = this.api.post<{ ok?: boolean }>('/config/demo-gate', { pin });
    } else {
      const role = this.auth.principal()?.role;
      obs = role === 'servicer' || role === 'customer'
        ? this.api.post<{ ok?: boolean }>('/chat/verify-pin', { pin })
        : this.api.post('/admin/verify-pin', {}, { 'x-action-pin': pin });
    }

    obs.subscribe({
      next: () => {
        this.verifying.set(false);
        this.open.set(false);
        // Only the action PIN is cached in-memory; page refresh re-prompts.
        if (this.mode === 'action') this.cachedPin = pin;
        this.finish(pin);
      },
      error: (e: { message?: string }) => {
        this.verifying.set(false);
        this.error.set(e?.message ?? 'Incorrect PIN.');
      },
    });
  }

  /** Dialog action - cancel without a PIN. */
  cancel(): void {
    this.open.set(false);
    this.finish(null);
  }

  /** Forgets the cached action PIN so the next `requirePin()` re-prompts. */
  clear(): void {
    this.cachedPin = null;
  }

  /** Returns the cached action PIN, or null if not yet verified this page session. */
  getCachedPin(): string | null {
    return this.cachedPin;
  }

  private finish(pin: string | null): void {
    const resolve = this.resolver;
    this.resolver = null;
    resolve?.(pin);
  }
}
