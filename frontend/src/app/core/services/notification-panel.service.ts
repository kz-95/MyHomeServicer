import { Injectable, signal } from '@angular/core';

/**
 * Open/close state for the notification dropdown panel (the Facebook-style
 * overlay anchored under the topbar bell). Mirrors ChatWidgetService so the
 * bell (in ShellComponent) and the panel (rendered at app root) stay decoupled
 * - the bell toggles this signal, the panel reads it.
 */
@Injectable({ providedIn: 'root' })
export class NotificationPanelService {
  private isOpenSig = signal(false);
  readonly isOpen = this.isOpenSig.asReadonly();

  open(): void {
    this.isOpenSig.set(true);
  }

  close(): void {
    this.isOpenSig.set(false);
  }

  toggle(): void {
    this.isOpenSig.update((v) => !v);
  }
}
