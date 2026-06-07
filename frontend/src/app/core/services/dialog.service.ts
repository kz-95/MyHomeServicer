import { Injectable, signal } from '@angular/core';
import { Observable } from 'rxjs';

/** Shape of an active dialog request. */
export type DialogRequest =
  | {
      type: 'confirm';
      message: string;
      /** Optional detail line shown below the main message. */
      detail?: string;
      confirmLabel: string;
      cancelLabel: string;
      resolve: (confirmed: boolean) => void;
    }
    | {
      type: 'prompt';
      message: string;
      detail?: string;
      placeholder: string;
      defaultValue: string;
      multiline: boolean;
      password: boolean;
      confirmLabel: string;
      cancelLabel: string;
      resolve: (value: string | null) => void;
    };

/**
 * Global service for native-replacement dialogs. Replaces browser
 * `confirm()` and `prompt()` with in-app modal counterparts.
 *
 * Usage - confirm:
 *   dialog.confirm('Delete this address?').subscribe(ok => { if (ok) … });
 *
 * Usage - prompt:
 *   dialog.prompt('Reason for cancelling?').subscribe(reason => {
 *     if (reason !== null) …
 *   });
 *
 * The global `<app-dialog-outlet>` component (rendered in app.component.ts)
 * reads `dialog.request()` and drives the visible modal.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  /** The active dialog request - null when no dialog is open. */
  readonly request = signal<DialogRequest | null>(null);

  /**
   * Opens a confirmation dialog.
   * Emits `true` if the user confirms, `false` if they cancel/close.
   */
  confirm(
    message: string,
    options: {
      detail?: string;
      confirmLabel?: string;
      cancelLabel?: string;
    } = {},
  ): Observable<boolean> {
    return new Observable<boolean>((sub) => {
      this.request.set({
        type: 'confirm',
        message,
        detail: options.detail,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        resolve: (v) => {
          this.request.set(null);
          sub.next(v);
          sub.complete();
        },
      });
    });
  }

  /**
   * Opens a text-prompt dialog.
   * Emits the entered string if confirmed, or `null` if cancelled/closed.
   */
  prompt(
    message: string,
    options: {
      detail?: string;
      placeholder?: string;
      defaultValue?: string;
      multiline?: boolean;
      password?: boolean;
      confirmLabel?: string;
      cancelLabel?: string;
    } = {},
  ): Observable<string | null> {
    return new Observable<string | null>((sub) => {
      this.request.set({
        type: 'prompt',
        message,
        detail: options.detail,
        placeholder: options.placeholder ?? '',
        defaultValue: options.defaultValue ?? '',
        multiline: options.multiline ?? false,
        password: options.password ?? false,
        confirmLabel: options.confirmLabel ?? 'OK',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        resolve: (v) => {
          this.request.set(null);
          sub.next(v);
          sub.complete();
        },
      });
    });
  }
}
