import { Component, forwardRef, signal, computed, Input } from '@angular/core';
import { FormsModule, NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

/** Common country dialling codes for the phone-prefix dropdown (Malaysia first). */
export const PHONE_PREFIXES: ReadonlyArray<{ code: string; label: string }> = [
  { code: '+60', label: '🇲🇾 +60' },
  { code: '+65', label: '🇸🇬 +65' },
  { code: '+62', label: '🇮🇩 +62' },
  { code: '+66', label: '🇹🇭 +66' },
  { code: '+63', label: '🇵🇭 +63' },
  { code: '+84', label: '🇻🇳 +84' },
  { code: '+95', label: '🇲🇲 +95' },
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+86', label: '🇨🇳 +86' },
  { code: '+880', label: '🇧🇩 +880' },
  { code: '+92', label: '🇵🇰 +92' },
  { code: '+977', label: '🇳🇵 +977' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+61', label: '🇦🇺 +61' },
];

/**
 * Global phone validity: a leading + and 7–15 digits (E.164 range), after
 * stripping spaces/dashes/parentheses. Use this everywhere a phone is validated
 * so the rule stays consistent across the app.
 */
export function isValidPhone(value: string | null | undefined): boolean {
  return /^\+\d{7,15}$/.test((value ?? '').replace(/[\s\-()]/g, ''));
}

/**
 * Reusable phone input: a country-code prefix `<select>` (default Malaysia +60)
 * plus the local number. Implements ControlValueAccessor, so it drops into any
 * form via `[(ngModel)]` / `formControlName` exactly like a plain input and
 * reads/writes a single full E.164-style string (e.g. "+60123456789").
 *
 * Used app-wide for every contact-phone field (quote forms, account settings,
 * registration, admin) so non-Malaysian users (e.g. WhatsApp from abroad) can
 * pick their own country code. See isValidPhone for the matching validator.
 */
@Component({
  selector: 'app-phone-input',
  imports: [FormsModule],
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInputComponent), multi: true },
  ],
  template: `
    <div class="phone-row">
      <select
        class="phone-prefix"
        [ngModel]="prefix()"
        (ngModelChange)="onPrefix($event)"
        [disabled]="disabled()"
        aria-label="Country code"
      >
        @for (c of prefixes; track c.code) {
          <option [value]="c.code">{{ c.label }}</option>
        }
      </select>
      <input
        type="tel"
        inputmode="tel"
        class="phone-local"
        [ngModel]="local()"
        (ngModelChange)="onLocal($event)"
        (blur)="onTouched()"
        [disabled]="disabled()"
        [placeholder]="placeholder"
      />
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      .phone-row { display: flex; gap: 0.4rem; align-items: stretch; }
      .phone-prefix {
        flex: 0 0 5rem; width: 5rem; font-size: 0.85rem; padding: 0.5rem 0.3rem;
        border: 1px solid var(--color-border); border-radius: var(--radius-input, var(--radius));
        background: var(--color-surface); color: var(--color-text);
      }
      .phone-local {
        flex: 1 1 auto; width: auto; min-width: 0; font-size: 0.9rem; padding: 0.5rem 0.6rem; box-sizing: border-box;
        border: 1px solid var(--color-border); border-radius: var(--radius-input, var(--radius));
        background: var(--color-surface); color: var(--color-text);
      }
      .phone-prefix:focus, .phone-local:focus {
        outline: none; border-color: var(--color-primary); box-shadow: var(--focus-ring);
      }
      .phone-prefix:disabled, .phone-local:disabled { opacity: 0.5; cursor: not-allowed; }
    `,
  ],
})
export class PhoneInputComponent implements ControlValueAccessor {
  /** Placeholder for the local-number input. */
  @Input() placeholder = '12 345 6789';

  prefixes = PHONE_PREFIXES;
  prefix = signal('+60');
  local = signal('');
  disabled = signal(false);

  private onChangeFn: (v: string) => void = () => {};
  onTouched: () => void = () => {};

  /** Full E.164-style value: chosen prefix + local digits (leading zeros dropped). */
  full = computed(() => `${this.prefix()}${this.local().replace(/[\s\-()]/g, '').replace(/^0+/, '')}`);

  writeValue(value: string | null): void {
    const val = (value ?? '').trim();
    const match = this.prefixes.find((c) => val.startsWith(c.code));
    if (match) {
      this.prefix.set(match.code);
      this.local.set(val.slice(match.code.length));
    } else if (val) {
      this.local.set(val.replace(/^\+/, ''));
    } else {
      this.local.set('');
    }
  }

  registerOnChange(fn: (v: string) => void): void { this.onChangeFn = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.disabled.set(isDisabled); }

  onPrefix(value: string): void { this.prefix.set(value); this.emit(); }
  onLocal(value: string): void { this.local.set(value); this.emit(); }

  private emit(): void { this.onChangeFn(this.full()); }
}
