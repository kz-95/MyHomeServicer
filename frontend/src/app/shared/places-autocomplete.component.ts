import { Component, OnInit, OnDestroy, AfterViewInit, Output, EventEmitter, Input, ViewChild, ElementRef, forwardRef, inject, signal } from '@angular/core';

import { NG_VALUE_ACCESSOR, ControlValueAccessor, FormsModule } from '@angular/forms';
import { ConfigService } from '../core/services/config.service';

/**
 * Emitted when a place is selected from the autocomplete dropdown.
 */
export interface PlaceResult {
  /** Full formatted address string. */
  address: string;
  /** Latitude of the selected place. */
  lat: number;
  /** Longitude of the selected place. */
  lng: number;
  /** Street number + route, if available. */
  street?: string;
  /** Locality / city, if available. */
  city?: string;
  /** State / administrative area level 1, if available. */
  state?: string;
  /** Postal code, if available. */
  postcode?: string;
  /** Country, if available. */
  country?: string;
}

/**
 * Reusable Google Places Autocomplete input (standalone component).
 *
 * Loads the Google Maps JavaScript API dynamically using the key from
 * `environment.googleMapsApiKey`. When a user selects a suggestion, emits
 * structured address components + lat/lng via the `placeSelect` output.
 *
 * Implements `ControlValueAccessor` so it works with `[(ngModel)]` or reactive
 * forms - the value is the full formatted address string.
 */
@Component({
    selector: 'app-places-autocomplete',
    host: { class: 'pac-host' },
    imports: [FormsModule],
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => PlacesAutocompleteComponent),
            multi: true,
        },
    ],
    template: `
    <div class="pac-wrap">
      <input
        #inputEl
        type="text"
        [placeholder]="placeholder"
        [disabled]="disabled()"
        class="pac-input"
        [class.input-error]="hasError"
        (input)="onInput($event)"
        (keydown.enter)="$event.preventDefault()"
        autocomplete="off"
      />
      @if (!loaded()) {
        <span class="pac-loading">Loading places…</span>
      }
      @if (loadError()) {
        <span class="pac-error">Places autocomplete unavailable</span>
      }
    </div>
  `,
    styles: [
        `
      :host { display: block; }
      .pac-wrap { position: relative; }
      .pac-input {
        width: 100%;
        padding: 0.55rem 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-input);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: 0.9rem;
        font-family: var(--font-body);
        outline: none;
        transition: border-color var(--transition), box-shadow var(--transition);
        box-sizing: border-box;
      }
      .pac-input:focus {
        border-color: var(--color-primary);
        box-shadow: var(--focus-ring);
      }
      .pac-input.input-error {
        border-color: var(--color-danger) !important;
        box-shadow: var(--focus-ring-danger);
      }
      .pac-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .pac-loading,
      .pac-error {
        display: block;
        font-size: 0.75rem;
        margin-top: 0.2rem;
      }
      .pac-loading { color: var(--color-muted); }
      .pac-error { color: var(--color-danger); }
      /* Google Places autocomplete dropdown styles */
      ::ng-deep .pac-container {
        border: 1px solid var(--color-border);
        border-radius: 0 0 var(--radius-input) var(--radius-input);
        box-shadow: var(--shadow-md);
        font-family: var(--font-body);
        z-index: 9999;
      }
      ::ng-deep .pac-item {
        padding: 0.4rem 0.6rem;
        font-size: 0.85rem;
        color: var(--color-text);
        border-top: 1px solid var(--color-border);
        cursor: pointer;
      }
      ::ng-deep .pac-item:hover {
        background: var(--color-bg);
      }
      ::ng-deep .pac-icon {
        margin-right: 0.4rem;
      }
      ::ng-deep .pac-item-query {
        font-size: 0.85rem;
        color: var(--color-text);
      }
    `,
    ]
})
export class PlacesAutocompleteComponent implements OnInit, AfterViewInit, OnDestroy, ControlValueAccessor {
  /** Placeholder text for the input. */
  @Input() placeholder = 'Search for an address…';
  /** Google Places autocomplete types filter. Default: ['address']. */
  @Input() types: string[] = ['address'];
  /** Whether to mark the input as errored. */
  @Input() hasError = false;

  /** Emits structured place data when the user selects a suggestion. */
  @Output() placeSelect = new EventEmitter<PlaceResult>();

  loaded = signal(false);
  loadError = signal(false);
  disabled = signal(false);

  @ViewChild('inputEl') private inputElRef!: ElementRef<HTMLInputElement>;

  private config = inject(ConfigService);
  private inputEl!: HTMLInputElement;
  private autocomplete!: google.maps.places.Autocomplete;
  private scriptTag: HTMLScriptElement | null = null;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  ngOnInit(): void {
    this.loadMapsApi();
  }

  ngAfterViewInit(): void {
    this.inputEl = this.inputElRef.nativeElement;
  }

  ngOnDestroy(): void {
    if (this.scriptTag && this.scriptTag.parentNode) {
      this.scriptTag.parentNode.removeChild(this.scriptTag);
      const queueKey = '__gmaps_pac_queue';
      const w = window as unknown as Record<string, unknown>;
      const q = w[queueKey];
      if (Array.isArray(q) && q.length === 0) {
        delete w['__gmaps_pac_callback'];
        delete w[queueKey];
      }
    }
  }

  // ── ControlValueAccessor ──────────────────────────────────────────────────
  writeValue(value: string): void {
    if (this.inputEl && value !== this.inputEl.value) {
      this.inputEl.value = value ?? '';
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  // ── Internal ──────────────────────────────────────────────────────────────
  /** Called on every keystroke - notifies the form of the raw text value. */
  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.onChange(value);
    this.onTouched();
  }

  private loadMapsApi(): void {
    const key = this.config.googleMapsApiKey;
    if (!key) {
      this.loaded.set(true);
      return;
    }

    if (typeof google !== 'undefined' && google.maps && google.maps.places) {
      this.loaded.set(true);
      setTimeout(() => this.initAutocomplete(), 0);
      return;
    }

    // Dynamically load the Google Maps JS API once.
    // Multiple component instances share the same script load via a global
    // callback queue - every instance registers its init function so none
    // gets skipped.
    const w = window as unknown as Record<string, unknown>;
    const queueKey = '__gmaps_pac_queue';

    const cb = () => {
      this.loaded.set(true);
      this.initAutocomplete();
    };

    if (w[queueKey] && Array.isArray(w[queueKey])) {
      (w[queueKey] as Array<() => void>).push(cb);
      return;
    }

    w[queueKey] = [cb];
    w['__gmaps_pac_callback'] = () => {
      for (const fn of w[queueKey] as Array<() => void>) fn();
    };

    this.scriptTag = document.createElement('script');
    this.scriptTag.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&callback=__gmaps_pac_callback`;
    this.scriptTag.async = true;
    this.scriptTag.defer = true;
    this.scriptTag.onerror = () => {
      this.loadError.set(true);
      this.loaded.set(true);
    };
    document.head.appendChild(this.scriptTag);
  }

  private initAutocomplete(): void {
    const el = this.inputEl;
    if (!el) {
      setTimeout(() => this.initAutocomplete(), 100);
      return;
    }

    try {
      this.autocomplete = new google.maps.places.Autocomplete(el, {
        types: this.types,
        fields: ['address_components', 'geometry', 'formatted_address'],
      });

      this.autocomplete.addListener('place_changed', () => {
        const place = this.autocomplete.getPlace();
        if (!place || !place.geometry || !place.geometry.location) return;

        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const formatted = place.formatted_address ?? el.value;

        // Extract structured address components
        let street = '';
        let city = '';
        let state = '';
        let postcode = '';
        let country = '';

        for (const c of place.address_components ?? []) {
          const types = c.types;
          if (types.includes('street_number')) {
            street = c.long_name + ' ' + street; // prepend to route
          }
          if (types.includes('route')) {
            street += c.long_name;
          }
          if (types.includes('locality')) {
            city = c.long_name;
          }
          if (types.includes('administrative_area_level_1')) {
            state = c.long_name;
          }
          if (types.includes('postal_code')) {
            postcode = c.long_name;
          }
          if (types.includes('country')) {
            country = c.long_name;
          }
        }

        // Update the input value — only show the street portion, not the full
        // formatted address with postcode/city/state/country.
        const display = street || formatted;
        el.value = display;
        this.onChange(display);
        this.onTouched();

        this.placeSelect.emit({
          address: formatted,
          lat,
          lng,
          street: street || undefined,
          city: city || undefined,
          state: state || undefined,
          postcode: postcode || undefined,
          country: country || undefined,
        });
      });
    } catch {
      // If Google Maps fails to initialise, fall back to plain text input
      this.loadError.set(true);
    }
  }
}
