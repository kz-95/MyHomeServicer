import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PlacesAutocompleteComponent, PlaceResult } from './places-autocomplete.component';

/**
 * Shared service-address entry block used by both the customer quote form and
 * the public guest quote form, so they stay identical.
 *
 * Layout: No. + property-type (Landed/Condo/Commercial), Street Details with a
 * GPS button, then Postcode / District / State. Each field is two-way bound so
 * the parent keeps owning the values; the parent passes an `errors` set to mark
 * invalid fields and listens to `(clearError)` to clear them on edit and
 * `(userEntered)` to react when the user manually edits/picks/locates.
 */
@Component({
  selector: 'app-address-fields',
  standalone: true,
  imports: [FormsModule, PlacesAutocompleteComponent],
  template: `
    <div class="address-section">
      <div class="row addr-row">
        <label class="addr-no-label" [class.field-invalid]="hasError('addressNo') || hasError('propertyType')">
          <span class="label-text">No.<span class="req">*</span></span>
          <div class="addr-no-wrap">
            <input [ngModel]="addressNo" (ngModelChange)="setAddressNo($event)" name="addressNo" maxlength="50" placeholder="e.g. 12-3" />
            <select class="ptype-select" [ngModel]="propertyType" (ngModelChange)="setPropertyType($event)" name="propertyType">
              <option value="">Type*</option>
              <option value="landed">Landed</option>
              <option value="condo">Condo</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>
          @if (hasError('addressNo')) { <span class="field-msg">Required.</span> }
        </label>
        <label class="street-wrap-label" [class.field-invalid]="hasError('streetDetails')">
          <span class="label-text">Street Details<span class="req">*</span></span>
          <div class="street-input-group">
            <app-places-autocomplete
              [placeholder]="'Search or type street…'"
              [ngModel]="streetDetails"
              (ngModelChange)="setStreet($event)"
              name="streetDetails"
              (placeSelect)="onStreetPlace($event)"
            />
            <button type="button" class="btn-icon gps-btn" (click)="locateViaGps()" [disabled]="locatingGps()" title="Use current location">
              {{ locatingGps() ? '…' : '📍' }}
            </button>
          </div>
          @if (hasError('streetDetails')) { <span class="field-msg">Street or place is required.</span> }
        </label>
      </div>

      <div class="row addr-row">
        <label [class.field-invalid]="hasError('postcode')">
          <span class="label-text">Postcode<span class="req">*</span></span>
          <app-places-autocomplete
            [placeholder]="'Search postcode…'"
            [types]="['postal_code']"
            [ngModel]="postcode"
            (ngModelChange)="setPostcode($event)"
            name="postcode"
            (placeSelect)="onPostcodePlace($event)"
          />
        </label>
        <label>
          <span class="label-text">District</span>
          <app-places-autocomplete
            [placeholder]="'Search district…'"
            [types]="['locality', 'sublocality', 'neighborhood']"
            [ngModel]="district"
            (ngModelChange)="setDistrict($event)"
            name="district"
            (placeSelect)="onDistrictPlace($event)"
          />
        </label>
      </div>
      <div class="row addr-row">
        <label>
          <span class="label-text">State</span>
          <app-places-autocomplete
            [placeholder]="'Search state…'"
            [types]="['(regions)']"
            [ngModel]="state"
            (ngModelChange)="setState($event)"
            name="state"
            (placeSelect)="onStatePlace($event)"
          />
        </label>
      </div>
    </div>
  `,
  styles: [
    `
      :host { display: block; }
      label {
        display: flex; flex-direction: column; gap: 0.3rem;
        font-size: 0.9rem; font-weight: 500;
      }
      .label-text { display: inline; }
      .req { color: var(--color-danger); }
      .row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
      .address-section {
        display: flex; flex-direction: column; gap: 0.7rem;
        padding: 0.8rem; border: 1px solid var(--color-border);
        border-radius: var(--radius); background: var(--color-bg);
      }
      .addr-row { gap: 0.7rem; }
      .addr-row label { gap: 0.2rem; }
      /* No. field - wider to fit input + property-type dropdown side-by-side */
      .addr-no-label { flex: 0 0 30%; min-width: 180px; max-width: 260px; }
      .addr-no-wrap { display: flex; gap: 0.35rem; align-items: stretch; }
      .addr-no-wrap input, .addr-no-wrap select { flex: 1; min-width: 0; padding: 0.55rem 0.7rem; }
      .street-wrap-label { flex: 1; }
      .street-input-group { display: flex; gap: 0.4rem; align-items: stretch; }
      .street-input-group > app-places-autocomplete { flex: 1; }
      .gps-btn {
        width: 38px; min-width: 38px; padding: 0;
        display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid var(--color-border); border-radius: var(--radius-input);
        background: var(--color-surface); cursor: pointer; font-size: 1rem;
        transition: background 0.12s ease, border-color 0.12s ease;
      }
      .gps-btn:hover { border-color: var(--color-primary); background: var(--color-bg); }
      .gps-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-icon { line-height: 1; }
      /* Per-field validation */
      label.field-invalid > input,
      label.field-invalid > select {
        border-color: var(--color-danger) !important; outline: none;
        box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.18);
      }
      .addr-no-label.field-invalid .addr-no-wrap input,
      .addr-no-label.field-invalid .addr-no-wrap select {
        border-color: var(--color-danger) !important;
      }
      .field-msg { font-size: 0.8rem; font-weight: 400; color: var(--color-danger); margin-top: 0.1rem; }
      @media (max-width: 560px) { .row { grid-template-columns: 1fr; } }
    `,
  ],
})
export class AddressFieldsComponent {
  @Input() addressNo = '';
  @Output() addressNoChange = new EventEmitter<string>();
  @Input() streetDetails = '';
  @Output() streetDetailsChange = new EventEmitter<string>();
  @Input() postcode = '';
  @Output() postcodeChange = new EventEmitter<string>();
  @Input() district = '';
  @Output() districtChange = new EventEmitter<string>();
  @Input() state = '';
  @Output() stateChange = new EventEmitter<string>();
  @Input() propertyType = '';
  @Output() propertyTypeChange = new EventEmitter<string>();
  @Input() lat?: number;
  @Output() latChange = new EventEmitter<number | undefined>();
  @Input() lng?: number;
  @Output() lngChange = new EventEmitter<number | undefined>();

  /** Field keys (addressNo, streetDetails, postcode, propertyType) to mark invalid. */
  @Input() errors = new Set<string>();
  @Output() clearError = new EventEmitter<string>();
  /** Fires whenever the user manually edits / picks a place / uses GPS. */
  @Output() userEntered = new EventEmitter<void>();

  locatingGps = signal(false);

  hasError(key: string): boolean {
    return this.errors.has(key);
  }

  setAddressNo(v: string): void {
    this.addressNo = v;
    this.addressNoChange.emit(v);
    this.clearError.emit('addressNo');
    this.userEntered.emit();
  }
  setStreet(v: string): void {
    this.streetDetails = v;
    this.streetDetailsChange.emit(v);
    this.clearError.emit('streetDetails');
    this.userEntered.emit();
  }
  setPropertyType(v: string): void {
    this.propertyType = v;
    this.propertyTypeChange.emit(v);
    this.clearError.emit('propertyType');
    this.userEntered.emit();
  }
  setPostcode(v: string): void {
    this.postcode = v;
    this.postcodeChange.emit(v);
    this.clearError.emit('postcode');
    this.userEntered.emit();
  }
  setDistrict(v: string): void {
    this.district = v;
    this.districtChange.emit(v);
    this.userEntered.emit();
  }
  setState(v: string): void {
    this.state = v;
    this.stateChange.emit(v);
    this.userEntered.emit();
  }

  onStreetPlace(place: PlaceResult): void {
    const st = place.street || '';
    this.emitStreet(st);
    this.emitLatLng(place.lat, place.lng);
    this.emitPostcode(place.postcode ?? '');
    this.emitDistrict(place.city ?? '');
    this.emitState(place.state ?? '');
    this.clearError.emit('streetDetails');
    this.clearError.emit('postcode');
    this.userEntered.emit();
  }
  onPostcodePlace(place: PlaceResult): void {
    this.emitPostcode(place.postcode ?? '');
    this.emitDistrict(place.city ?? '');
    this.emitState(place.state ?? '');
    this.clearError.emit('postcode');
    this.userEntered.emit();
  }
  onDistrictPlace(place: PlaceResult): void {
    this.emitDistrict(place.city ?? place.address);
    this.userEntered.emit();
  }
  onStatePlace(place: PlaceResult): void {
    this.emitState(place.state ?? place.address);
    this.userEntered.emit();
  }

  locateViaGps(): void {
    if (!navigator.geolocation) return;
    this.locatingGps.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.locatingGps.set(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.emitLatLng(lat, lng);
        this.reverseGeocode(lat, lng);
        this.userEntered.emit();
      },
      () => this.locatingGps.set(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  private reverseGeocode(lat: number, lng: number): void {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results: google.maps.GeocoderResult[] | null, status: string) => {
      if (status !== 'OK' || !results || results.length === 0) return;
      const place = results[0];
      let street = '';
      let city = '';
      let state = '';
      let postcode = '';
      for (const c of place.address_components ?? []) {
        const types = c.types;
        if (types.includes('street_number')) { street = c.long_name + ' ' + street; }
        if (types.includes('route')) { street += c.long_name; }
        if (types.includes('locality')) { city = c.long_name; }
        if (types.includes('administrative_area_level_1')) { state = c.long_name; }
        if (types.includes('postal_code')) { postcode = c.long_name; }
      }
      this.emitStreet(street);
      this.emitPostcode(postcode);
      this.emitDistrict(city);
      this.emitState(state);
    });
  }

  // ── internal emit helpers (keep local value + notify parent in sync) ──────
  private emitNo(v: string): void { this.addressNo = v; this.addressNoChange.emit(v); }
  private emitStreet(v: string): void { this.streetDetails = v; this.streetDetailsChange.emit(v); }
  private emitPostcode(v: string): void { this.postcode = v; this.postcodeChange.emit(v); }
  private emitDistrict(v: string): void { this.district = v; this.districtChange.emit(v); }
  private emitState(v: string): void { this.state = v; this.stateChange.emit(v); }
  private emitLatLng(lat: number | undefined, lng: number | undefined): void {
    this.lat = lat; this.latChange.emit(lat);
    this.lng = lng; this.lngChange.emit(lng);
  }
}
