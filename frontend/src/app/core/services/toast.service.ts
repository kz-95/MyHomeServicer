import { Injectable, signal } from '@angular/core';

export type ToastLevel = 'success' | 'error' | 'info';

export interface ActionToast {
  id: string;
  message: string;
  level: ToastLevel;
}

const DEFAULT_DURATION_MS = 4_500;

/**
 * Lightweight service for in-app action feedback toasts (success / error /
 * info). Distinct from NotificationService which polls backend notifications.
 *
 * Usage:
 *   inject(ToastService).success('Listing saved.');
 *   inject(ToastService).error('Could not save - please retry.');
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  /** Currently visible action toasts - read by SnackbarComponent. */
  readonly toasts = signal<ActionToast[]>([]);

  show(message: string, level: ToastLevel = 'info', durationMs = DEFAULT_DURATION_MS): void {
    const id = crypto.randomUUID();
    this.toasts.update((t) => [...t, { id, message, level }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  dismiss(id: string): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
