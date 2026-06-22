import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
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
 *
 * ── Why a native <dialog> with showModal() (not a position:fixed backdrop) ──
 * `showModal()` renders the dialog in the browser **top layer**, which is
 * immune to ancestor `transform` / `filter` / `will-change` / `contain` and to
 * any `overflow:hidden` clipping. A plain `position:fixed` overlay re-anchors
 * to the nearest transformed ancestor — and this app animates page sections
 * with `transform: translateY(...)` everywhere — so fixed overlays declared
 * inside a page component get cropped, mis-centered, and scroll-trapped.
 * The top layer makes centering + stacking bulletproof regardless of where the
 * <app-modal> sits in the component tree. DO NOT replace this with a custom
 * position:fixed overlay. See frontend/STYLE-RULES.md "Overlays & modals".
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  template: `
    <dialog
      #dlg
      class="dialog"
      [class.wide]="wide"
      (mousedown)="onDown($event)"
      (mouseup)="onUp($event)"
      (cancel)="onCancel($event)"
    >
      <div class="panel">
        <header>
          <h2>{{ title }}</h2>
          <button class="x" type="button" (click)="closed.emit()" aria-label="Close">✕</button>
        </header>
        <div class="body">
          <ng-content></ng-content>
        </div>
      </div>
    </dialog>
  `,
  styles: [
    `
      /* The <dialog> itself IS the centered box — UA styles center it via
         margin:auto in the top layer. We strip the default chrome and let the
         inner .panel carry the surface. */
      .dialog {
        padding: 0;
        border: none;
        background: transparent;
        max-width: min(480px, calc(100vw - 2rem));
        max-height: calc(100dvh - 4rem);
        width: 100%;
        overflow: visible;
        color: var(--color-text);
      }
      .dialog.wide {
        max-width: min(720px, calc(100vw - 2rem));
      }
      .dialog::backdrop {
        background: var(--color-backdrop, rgba(0, 0, 0, 0.6));
        animation: backdrop-in 0.18s ease-out both;
      }
      .panel {
        background: var(--color-surface);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        max-height: calc(100dvh - 4rem);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
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
        flex-shrink: 0;
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
export class ModalComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() open = false;
  @Input() title = '';
  /** Render a wider dialog - useful for detail panels and logs. */
  @Input() wide = false;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('dlg') private dlgRef?: ElementRef<HTMLDialogElement>;

  /** Element the mouse was pressed on - so a drag that starts inside the dialog
   *  (e.g. selecting text) and releases on the backdrop does NOT close it. */
  private downTarget: EventTarget | null = null;

  ngAfterViewInit(): void {
    // ViewChild only resolves now, so reflect the initial `open` state once.
    this.sync();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) this.sync();
  }

  ngOnDestroy(): void {
    // Guard against leaking an open top-layer dialog if the host is torn down.
    const dlg = this.dlgRef?.nativeElement;
    if (dlg?.open) dlg.close();
  }

  /** Drive the native dialog from the parent-owned `open` input. */
  private sync(): void {
    const dlg = this.dlgRef?.nativeElement;
    if (!dlg) return;
    if (this.open && !dlg.open) {
      dlg.showModal();
    } else if (!this.open && dlg.open) {
      dlg.close();
    }
  }

  onDown(event: MouseEvent): void {
    this.downTarget = event.target;
  }

  onUp(event: MouseEvent): void {
    // The <dialog> element fills the centered box; the visible card is `.panel`
    // inside it. A press+release both landing on the dialog element itself (the
    // letterbox area around the panel, i.e. the backdrop region) closes it.
    if (event.target === event.currentTarget && this.downTarget === event.currentTarget) {
      this.closed.emit();
    }
    this.downTarget = null;
  }

  /** Native Esc fires `cancel`; keep the parent the single owner of `open`. */
  onCancel(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }
}
