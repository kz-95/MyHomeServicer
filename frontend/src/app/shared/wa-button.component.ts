import { Component, Input, OnChanges, computed, signal } from '@angular/core';

/**
 * <app-wa-button> — standalone, reusable "Message on WhatsApp" button.
 *
 * PUBLIC CONTRACT (consumed by Agent D's won-job card):
 *
 *   <app-wa-button
 *     [phone]="customerPhone"        // string  — customer phone, any local/intl format
 *     [preset]="chosenPreset"        // WaPreset | null — { label, body } template (optional)
 *     [body]="rawBody"               // string  — alternative to preset.body if no preset
 *     [vars]="{ name, orderId, eta }"// WaVars   — placeholder values (all optional)
 *     [label]="'Message on WhatsApp'"// string  — button text (optional, defaults shown)
 *     [disabled]="false"             // boolean  — disable the button (optional)
 *   ></app-wa-button>
 *
 * Behaviour:
 *  - Interpolates {name} / {orderId} / {eta} placeholders in the body using `vars`.
 *    Missing vars collapse to an empty string. Unknown placeholders are left as-is.
 *  - Normalizes `phone` to international digits-only. Malaysia default: strips spaces,
 *    dashes, parentheses and the `+`; a leading `0` is replaced with `60`; a bare local
 *    number (no country code) is prefixed with `60`. Numbers already starting with a
 *    country code (e.g. `+60…`, `60…`, or another `<cc>…` once `+`/`00` is stripped)
 *    are passed through.
 *  - Opens `https://wa.me/<intlPhone>?text=<encodeURIComponent(message)>` in a new tab.
 *  - Disabled (and visually muted) when no usable phone is present.
 *
 * Pure presentation + window.open — no API calls, no router, no service deps, so it
 * drops onto any card. Either pass a `preset` (its `body` wins) or a raw `body`.
 */

export interface WaPreset {
  label: string;
  body: string;
}

export interface WaVars {
  name?: string | null;
  orderId?: string | null;
  eta?: string | null;
}

@Component({
  selector: 'app-wa-button',
  standalone: true,
  template: `
    <button
      type="button"
      class="wa-btn"
      [disabled]="disabled || !hasPhone()"
      [title]="hasPhone() ? 'Open WhatsApp' : 'No phone number on file'"
      (click)="send()"
    >
      <span class="wa-glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path
            d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.91-7.02ZM12.04 20.15h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.83 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z"
          />
        </svg>
      </span>
      {{ label }}
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }
      .wa-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        background: #25d366;
        color: #fff;
        border: none;
        border-radius: var(--radius);
        padding: 0.625rem 0.9rem;
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease, transform 0.15s ease, opacity 0.15s ease;
      }
      .wa-btn:hover:not(:disabled) {
        background: #1ebe5d;
        transform: translateY(-1px);
      }
      .wa-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .wa-glyph {
        display: inline-flex;
        line-height: 0;
      }
    `,
  ],
})
export class WaButtonComponent implements OnChanges {
  @Input() phone = '';
  @Input() preset: WaPreset | null = null;
  @Input() body = '';
  @Input() vars: WaVars | null = null;
  @Input() label = 'Message on WhatsApp';
  @Input() disabled = false;

  /** Reactive view of the current phone for the template's disabled/title state. */
  private readonly phoneSig = signal('');
  readonly hasPhone = computed(() => this.normalizePhone(this.phoneSig()).length >= 7);

  ngOnChanges(): void {
    this.phoneSig.set(this.phone ?? '');
  }

  /** Replaces {name}/{orderId}/{eta} in `text` with `vars` values (missing → ''). */
  private interpolate(text: string): string {
    const v = this.vars ?? {};
    return (text ?? '')
      .replace(/\{name\}/g, (v.name ?? '').toString())
      .replace(/\{orderId\}/g, (v.orderId ?? '').toString())
      .replace(/\{eta\}/g, (v.eta ?? '').toString());
  }

  /**
   * Normalizes a phone to international digits-only.
   * Malaysia default: strip non-digits and a leading `+`/`00`; a leading `0`
   * becomes `60`; a bare local number is prefixed with `60`.
   */
  private normalizePhone(raw: string): string {
    let s = (raw ?? '').trim();
    if (!s) return '';
    const hadPlus = s.startsWith('+');
    // strip everything except digits
    let digits = s.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2); // 00<cc> → <cc>
    if (hadPlus) return digits; // already explicit intl form (+<cc>…)
    if (digits.startsWith('60')) return digits; // already MY intl
    if (digits.startsWith('0')) return '60' + digits.slice(1); // local 0… → 60…
    return digits ? '60' + digits : ''; // bare local → assume MY
  }

  send(): void {
    const intl = this.normalizePhone(this.phone ?? '');
    if (intl.length < 7) return;
    const rawBody = this.preset?.body ?? this.body ?? '';
    const message = this.interpolate(rawBody);
    const url = `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener');
  }
}
