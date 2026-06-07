import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';

/**
 * Reusable modal dialog. Replaces native prompt()/confirm() across the app.
 *
 * Usage:
 *   <app-modal [open]="showEdit()" title="Edit user" (closed)="showEdit.set(false)">
 *     ...projected content (form, details, etc.)...
 *   </app-modal>
 *
 * Closes on backdrop click and the Escape key. The parent owns the `open`
 * state and reacts to `(closed)`.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    @if (open) {
      <div class="backdrop" (mousedown)="onBackdropDown($event)" (mouseup)="onBackdropUp($event)">
        <div
          class="dialog"
          [class.wide]="wide"
          role="dialog"
          aria-modal="true"
        >
          <header>
            <h2>{{ title }}</h2>
            <button class="x" type="button" (click)="closed.emit()" aria-label="Close">✕</button>
          </header>
          <div class="body">
            <ng-content></ng-content>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        background: var(--color-backdrop);
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 5vh 1rem;
        z-index: 1000;
        overflow-y: auto;
        overscroll-behavior: contain;
        animation: backdrop-in 0.18s ease-out both;
      }
      .dialog {
        background: var(--color-surface);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        width: 100%;
        max-width: 480px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        animation: pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      .dialog.wide {
        max-width: 720px;
      }
      @keyframes backdrop-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @keyframes pop {
        from {
          opacity: 0;
          transform: translateY(-10px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 1rem 1.25rem;
        border-bottom: 1px solid var(--color-border);
      }
      header h2 {
        margin: 0;
        font-size: 1.1rem;
      }
      .x {
        background: transparent;
        font-size: 1rem;
        color: var(--color-muted);
        padding: 0.25rem 0.5rem;
      }
      .x:hover {
        color: var(--color-text);
      }
      .body {
        padding: 1.25rem;
        overflow-y: auto;
        overscroll-behavior: contain;
        flex: 1;
        min-height: 0;
      }
    `,
  ],
})
export class ModalComponent {
  @Input() open = false;
  @Input() title = '';
  /** Render a wider dialog - useful for detail panels and logs. */
  @Input() wide = false;
  @Output() closed = new EventEmitter<void>();

  /** Element the mouse was pressed on - so a drag that starts inside the dialog
   *  (e.g. selecting text) and releases on the backdrop does NOT close it. */
  private downTarget: EventTarget | null = null;

  onBackdropDown(event: MouseEvent): void {
    this.downTarget = event.target;
  }

  onBackdropUp(event: MouseEvent): void {
    // Close only when BOTH the press and the release land on the backdrop itself
    // (the empty area), never when either happened inside the dialog.
    if (event.target === event.currentTarget && this.downTarget === event.currentTarget) {
      this.closed.emit();
    }
    this.downTarget = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.closed.emit();
  }
}
