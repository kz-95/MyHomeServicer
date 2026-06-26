import { Component, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogService } from '../core/services/dialog.service';

/**
 * Global dialog outlet - rendered once at the app root. Reads
 * `DialogService.request()` and displays the appropriate confirm or prompt
 * modal. Closes on Escape key.
 *
 * This is the companion renderer for `DialogService`. Components should call
 * `dialog.confirm()` / `dialog.prompt()` rather than use native browser
 * dialogs.
 *
 * Uses a native <dialog> + showModal() so it lives in the browser top layer -
 * immune to ancestor transform/overflow clipping and always viewport-centered.
 * See frontend/STYLE-RULES.md "Overlays & modals". Do NOT revert to a
 * position:fixed backdrop.
 */
@Component({
    selector: 'app-dialog-outlet',
    imports: [FormsModule],
    template: `
    <dialog
      #dlg
      class="dlg"
      (mousedown)="onBackdropDown($event)"
      (mouseup)="onBackdropUp($event)"
      (cancel)="onCancel($event)"
    >
      @if (dialog.request(); as req) {
        <div class="panel" role="dialog" aria-modal="true">

          <p class="msg">{{ req.message }}</p>
          @if (req.detail) {
            <p class="detail">{{ req.detail }}</p>
          }

          @if (req.type === 'prompt') {
            @if (req.multiline) {
              <textarea
                class="input"
                rows="3"
                [placeholder]="req.placeholder"
                [(ngModel)]="value"
                name="dlg"
                #dlgInput
                (keydown.enter)="$any($event).shiftKey ? null : confirm()"
              ></textarea>
            } @else {
              <input
                class="input"
                [type]="req.password ? 'password' : 'text'"
                [placeholder]="req.placeholder"
                [(ngModel)]="value"
                name="dlg"
                #dlgInput
                (keydown.enter)="confirm()"
                autofocus
              />
            }
          }

          <div class="actions">
            <button class="btn-ghost" type="button" (click)="cancel()">
              {{ req.cancelLabel }}
            </button>
            <button
              class="btn-primary"
              [class.btn-danger]="isDangerous(req.message)"
              type="button"
              (click)="confirm()"
            >
              {{ req.confirmLabel }}
            </button>
          </div>
        </div>
      }
    </dialog>
  `,
    styles: [
        `
      .dlg {
        padding: 0;
        border: none;
        background: transparent;
        max-width: min(420px, calc(100vw - 2rem));
        max-height: calc(100dvh - 4rem);
        width: 100%;
        overflow: visible;
        color: var(--color-text);
      }
      .dlg::backdrop {
        background: rgba(15, 18, 22, 0.5);
      }
      .panel {
        background: var(--color-surface);
        border-radius: var(--radius);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
        width: 100%;
        max-height: calc(100dvh - 4rem);
        overflow-y: auto;
        padding: 1.5rem 1.5rem 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        animation: popIn 0.12s ease-out;
      }
      @keyframes popIn {
        from {
          opacity: 0;
          transform: scale(0.96) translateY(-6px);
        }
      }
      .msg {
        font-size: 1rem;
        font-weight: 600;
        margin: 0;
        color: var(--color-text);
        line-height: 1.4;
      }
      .detail {
        font-size: 0.88rem;
        color: var(--color-muted);
        margin: -0.4rem 0 0;
      }
      .input {
        width: 100%;
        box-sizing: border-box;
      }
      textarea.input {
        resize: vertical;
        min-height: 72px;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .btn-danger {
        background: var(--color-danger) !important;
      }
    `,
    ]
})
export class DialogOutletComponent {
  dialog = inject(DialogService);

  @ViewChild('dlg') private dlgRef?: ElementRef<HTMLDialogElement>;

  /** Value bound to the prompt input. */
  value = '';

  /** Element the mouse was pressed on - so a drag that starts inside the dialog
   *  and releases on the backdrop does NOT cancel it. */
  private downTarget: EventTarget | null = null;

  constructor() {
    // Open/close the native top-layer dialog in step with the request signal.
    effect(() => {
      // Read the signal FIRST so this effect always tracks `request` as a
      // dependency. If we bail out on a missing dlgRef before reading it, the
      // effect never subscribes to the signal and dialogs silently never open
      // (the ViewChild-vs-effect-first-run race that broke Sign out).
      const hasReq = this.dialog.request() !== null;
      const dlg = this.dlgRef?.nativeElement;
      if (!dlg) return;
      if (hasReq && !dlg.open) dlg.showModal();
      else if (!hasReq && dlg.open) dlg.close();
    });
  }

  onBackdropDown(event: MouseEvent): void {
    this.downTarget = event.target;
  }

  onBackdropUp(event: MouseEvent): void {
    // Cancel only when BOTH the press and release land on the dialog element
    // itself (the letterbox area around the panel), never inside the panel.
    if (event.target === event.currentTarget && this.downTarget === event.currentTarget) {
      this.cancel();
    }
    this.downTarget = null;
  }

  /** Native Esc fires `cancel`; route it through our cancel() resolver. */
  onCancel(event: Event): void {
    event.preventDefault();
    if (this.dialog.request()) this.cancel();
  }

  confirm(): void {
    const req = this.dialog.request();
    if (!req) return;
    if (req.type === 'confirm') {
      req.resolve(true);
    } else {
      req.resolve(this.value.trim() || null);
      this.value = '';
    }
  }

  cancel(): void {
    const req = this.dialog.request();
    if (!req) return;
    if (req.type === 'confirm') {
      req.resolve(false);
    } else {
      req.resolve(null);
      this.value = '';
    }
  }

  /**
   * Flags destructive actions so the confirm button can be styled red.
   * Heuristic: message contains "delete" or "ban".
   */
  isDangerous(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes('delete') || lower.includes('ban') || lower.includes('remove');
  }
}
