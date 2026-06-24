import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PinService } from '../core/services/pin.service';
import { ModalComponent } from './modal.component';

/**
 * Global action-PIN dialog. Rendered once at the app root; opens whenever
 * `PinService.requirePin()` needs a PIN. Replaces the old native `prompt()`.
 * The PIN field is masked, with a Show/Hide toggle.
 */
@Component({
    selector: 'app-pin-prompt',
    imports: [FormsModule, ModalComponent],
    template: `
    <!-- Demo login-gate: opaque full-screen cover under the dialog. The account
         switch already swapped auth.principal() BEFORE the gate, so the still-
         mounted previous portal shell would otherwise render the NEW account's
         name and credit/deposit balance behind the translucent backdrop. -->
    @if (pin.open() && pin.gateMode()) {
      <div class="gate-cover"></div>
    }
    <app-modal [open]="pin.open()" title="Enter your PIN" (closed)="cancel()">
      @if (pin.gateMode()) {
        <p class="muted">Enter the demo PIN to continue.</p>
      } @else {
        <p class="muted">This action needs your {{ pin.isServicerMode() ? 'servicer' : 'admin' }} action PIN.</p>
      }
      <div class="pin-field">
        <input
          [type]="reveal() ? 'text' : 'password'"
          [(ngModel)]="value"
          name="actionPin"
          autocomplete="off"
          placeholder="••••"
          (keyup.enter)="confirm()"
        />
        <button type="button" class="reveal" (click)="reveal.set(!reveal())">
          {{ reveal() ? 'Hide' : 'Show' }}
        </button>
      </div>
      @if (pin.error()) {
        <p class="err">{{ pin.error() }}</p>
      }
      <div class="actions">
        <button class="btn-ghost" (click)="cancel()" [disabled]="pin.verifying()">Cancel</button>
        <button class="btn-primary" (click)="confirm()" [disabled]="pin.verifying()">
          {{ pin.verifying() ? 'Verifying…' : 'Confirm' }}
        </button>
      </div>
    </app-modal>
  `,
    styles: [
        `
      .gate-cover {
        position: fixed;
        inset: 0;
        background: var(--color-bg);
        z-index: 999; /* just below the modal backdrop (1000) */
      }
      .pin-field {
        display: flex;
        gap: 0.5rem;
        margin: 0.6rem 0;
      }
      .pin-field input {
        flex: 1;
        padding: 0.5rem 0.7rem;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        font-size: 1rem;
        letter-spacing: 0.15em;
      }
      .reveal {
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0 0.8rem;
        cursor: pointer;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 1rem;
      }
      .err {
        color: var(--color-danger);
      }
    `,
    ]
})
export class PinPromptComponent {
  pin = inject(PinService);
  value = '';
  reveal = signal(false);

  constructor() {
    // Reset the field whenever the dialog closes (cancel or successful verify).
    // allowSignalWrites: the effect sets the `reveal` signal in response to pin.open().
    effect(() => {
      if (!this.pin.open()) {
        this.value = '';
        this.reveal.set(false);
      }
    }, { allowSignalWrites: true });
  }

  confirm(): void {
    const entered = this.value;
    this.value = '';   // Clear field immediately after submit — don't leave PIN visible
    this.reveal.set(false);
    this.pin.confirm(entered);
  }

  cancel(): void {
    this.pin.cancel();
  }
}
