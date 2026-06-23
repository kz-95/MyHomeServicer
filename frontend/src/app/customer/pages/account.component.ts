import { Component, computed, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { switchMap, finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ModalComponent } from '../../shared/modal.component';
import { ActivatedRoute, Router } from '@angular/router';
import { PlacesAutocompleteComponent, PlaceResult } from '../../shared/places-autocomplete.component';
import { AddressFieldsComponent } from '../../shared/address-fields.component';
import { PhoneInputComponent } from '../../shared/phone-input.component';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';

interface NotificationPrefs {
  bookingUpdates?: { inApp?: boolean; email?: boolean };
  proposals?: { inApp?: boolean };
  promotions?: { inApp?: boolean; email?: boolean };
  chatMessages?: { inApp?: boolean };
}

interface Profile {
  id: string;
  name: string;
  email: string;
  phone: string;
  contactName?: string | null;
  contactNumber?: string | null;
  preferredTimeSlot?: string | null;
  backupEmail?: string | null;
  avatarUrl?: string | null;
}
interface Address {
  id: string;
  label: string;
  address: string;
  propertyType?: string | null;
  isDefault: boolean;
  postcode?: string | null;
  district?: string | null;
  state?: string | null;
}
interface QuotePreset {
  id: string;
  label?: string | null;
  contactName: string;
  contactNumber: string;
  addressId: string;
  address?: { id: string; label: string; address: string };
  instruction?: string | null;
  preferredTimeSlot?: string | null;
  isDefault: boolean;
}

/**
 * Customer account page - profile details and saved-address management.
 * A customer must have at least one address before they can request a quote,
 * so this page is the entry point that unblocks the whole customer flow.
 */
@Component({
    selector: 'app-account',
    host: { class: 'page-enter page-narrow' },
    imports: [FormsModule, ModalComponent, PlacesAutocompleteComponent, AddressFieldsComponent, PhoneInputComponent],
    template: `
    <h1>My account</h1>

    <!-- Profile -->
    <section class="card page-child">
      <h2>Profile</h2>
      @if (profile()) {
        <!-- Avatar -->
        <div class="avatar-row">
          @if (avatarUrl()) {
            <img [src]="avatarUrl()" alt="Profile photo" class="avatar-img" />
          } @else {
            <div class="avatar-placeholder">
              {{ initials(p.name) }}
            </div>
          }
          <div class="avatar-actions">
            <p class="muted small">{{ p.name }}</p>
            <label class="btn-ghost file-label">
              <input
                #avatarInput
                type="file"
                accept="image/jpeg,image/png,image/webp"
                class="file-hidden"
                (change)="onAvatarFileChange($event)"
              />
              {{ avatarUploading() ? avatarUploadStatus() : 'Change photo' }}
            </label>
            @if (avatarUrl() && !avatarUploading()) {
              <button class="btn-ghost btn-remove" (click)="removeAvatar()">Remove</button>
            }
            @if (avatarError()) {
              <span class="err small">{{ avatarError() }}</span>
            }
          </div>
        </div>

        <div class="grid">
          <label>Name<input [(ngModel)]="p.name" name="name" /></label>
          <label>Email<span class="static-field">{{ p.email }}</span></label>
          <label>Phone<app-phone-input [(ngModel)]="p.phone" name="phone"></app-phone-input></label>
          <label>Contact name<input [(ngModel)]="p.contactName" name="cn" /></label>
          <label>Contact number<app-phone-input [(ngModel)]="p.contactNumber" name="cnum"></app-phone-input></label>
          <label>
            Preferred time slot
            <select [(ngModel)]="p.preferredTimeSlot" name="ts">
              <option [ngValue]="null">No preference</option>
              <option value="morning">Morning (9:00–11:00)</option>
              <option value="noon">Noon (11:00–13:00)</option>
              <option value="afternoon">Afternoon (13:00–15:00)</option>
              <option value="evening">Evening (15:00–17:00)</option>
              <option value="night">Night (17:00–22:00)</option>
            </select>
          </label>
          <label>
            Backup email
            <span class="muted">(optional - recovery email)</span>
            <input [(ngModel)]="p.backupEmail" name="bemail" type="email" placeholder="backup@example.com" />
          </label>
        </div>
        <button class="btn-primary" (click)="saveProfile()" [disabled]="savingProfile()">
          {{ savingProfile() ? 'Saving…' : 'Save profile' }}
        </button>
      } @else if (profileFailed()) {
        <p class="muted">Could not load profile. Please refresh the page.</p>
      } @else {
        <p class="muted">Loading profile…</p>
      }
    </section>



    <!-- Contact & Address Settings -->
    <section class="card page-child">
      <div class="head">
        <h2>Contact &amp; Address Settings</h2>
        <button
          class="btn-primary"
          (click)="openContact()"
          [disabled]="contacts().length >= 10"
        >
          Add
        </button>
      </div>
      <p class="muted small">
        Save up to 10 reusable contact & address bundles to pick from when requesting a quote.
      </p>
      @if (loadingContacts()) {
        <p class="muted">Loading…</p>
      } @else if (contactsLoadFailed()) {
        <p class="muted">Could not load. Please refresh the page.</p>
      } @else if (contacts().length === 0) {
        <p class="muted">No preset saved yet.</p>
        <button class="btn-ghost" (click)="openContact()">+ Add new preset</button>
      } @else {
        @if (defaultPreset(); as d) {
          <div class="preset-default">
            <div class="addr-text">
              <strong>{{ d.label || d.contactName }}</strong>
              <span class="tag">Default</span>
              <div class="muted">{{ d.contactName }} · {{ d.contactNumber }}</div>
              <div class="muted">{{ d.address?.label }} - {{ d.address?.address }}</div>
              @if (d.preferredTimeSlot || d.instruction) {
                <div class="muted small">
                  @if (d.preferredTimeSlot) { {{ d.preferredTimeSlot }} }
                  @if (d.instruction) { · “{{ d.instruction }}” }
                </div>
              }
            </div>
            <div class="addr-actions">
              <button class="btn-ghost" (click)="openContact(d)">Edit</button>
              <button class="btn-ghost" (click)="removeContact(d)">Delete</button>
            </div>
          </div>
        }
        @for (c of otherPresets(); track c.id) {
          <div class="addr">
            <div class="addr-text">
              <strong>{{ c.label || c.contactName }}</strong>
              @if (c.isDefault) {
                <span class="tag">Default</span>
              }
              <div class="muted">{{ c.contactName }} · {{ c.contactNumber }}</div>
              <div class="muted">{{ c.address?.label }} - {{ c.address?.address }}</div>
              <div class="muted small">
                @if (c.preferredTimeSlot) {
                  {{ c.preferredTimeSlot }}
                }
                @if (c.instruction) {
                  · “{{ c.instruction }}”
                }
              </div>
            </div>
            <div class="addr-actions">
              <button class="btn-ghost" (click)="setDefaultPreset(c)">Select as default</button>
              <button class="btn-ghost" (click)="openContact(c)">Edit</button>
              <button class="btn-ghost" (click)="removeContact(c)">Delete</button>
            </div>
          </div>
        }
      }
      @if (contacts().length >= 10) {
        <p class="muted small">You've reached the 10-entry limit.</p>
      }
    </section>


    <!-- Add / edit address -->
    <app-modal
      [open]="addressModalOpen()"
      [title]="editingAddress() ? 'Edit address' : 'Add address'"
      (closed)="addressModalOpen.set(false)"
    >
      <form class="form" (ngSubmit)="saveAddress()">
        <label>Label<input [(ngModel)]="af.label" name="label" placeholder="Home, Office…" /></label>
        <label>
          Full address
          <app-places-autocomplete
            [placeholder]="'Search for an address…'"
            [hasError]="addrError() !== ''"
            [(ngModel)]="af.address"
            name="address"
            (placeSelect)="onPlaceSelect($event)"
          />
        </label>
        @if (af.lat && af.lng) {
          <span class="muted small">Lat: {{ af.lat.toFixed(6) }}, Lng: {{ af.lng.toFixed(6) }}</span>
        }
        <label>
          Property type
          <select [(ngModel)]="af.propertyType" name="pt">
            <option value="condo">Condo</option>
            <option value="landed">Landed</option>
            <option value="residential">Residential</option>
            <option value="commercial">Commercial</option>
          </select>
        </label>
        <label class="checkbox">
          <input type="checkbox" [(ngModel)]="af.isDefault" name="def" />
          Set as default address
        </label>
        @if (addrError()) {
          <p class="err">{{ addrError() }}</p>
        }
        <div class="modal-actions">
          <button type="button" class="btn-ghost" (click)="addressModalOpen.set(false)">
            Cancel
          </button>
          <button type="submit" class="btn-primary" [disabled]="savingAddr()">
            {{ savingAddr() ? 'Saving…' : 'Save address' }}
          </button>
        </div>
      </form>
    </app-modal>

    <!-- Add / edit contact & address settings -->
    <app-modal
      [open]="contactModalOpen()"
      [title]="editingContact() ? 'Edit' : 'New contact & address settings'"
      (closed)="contactModalOpen.set(false)"
    >
      <form class="form" (ngSubmit)="saveContact()">
        <label>
          Label (optional)
          <input [(ngModel)]="cf.label" name="clabel" placeholder="Home, Office, Parents…" />
        </label>
        <div class="grid">
          <label>Contact person<input [(ngModel)]="cf.contactName" name="cname" /></label>
          <label>Contact number<app-phone-input [(ngModel)]="cf.contactNumber" name="cnumber"></app-phone-input></label>
        </div>
        <label>Address</label>
        <app-address-fields
          [addressNo]="cf.addrNo"
          (addressNoChange)="cf.addrNo = $event"
          [streetDetails]="cf.addrStreet"
          (streetDetailsChange)="cf.addrStreet = $event"
          [postcode]="cf.addrPostcode"
          (postcodeChange)="cf.addrPostcode = $event"
          [district]="cf.addrDistrict"
          (districtChange)="cf.addrDistrict = $event"
          [state]="cf.addrState"
          (stateChange)="cf.addrState = $event"
          [propertyType]="cf.addrPropertyType"
          (propertyTypeChange)="cf.addrPropertyType = $event"
          [lat]="cf.addrLat"
          (latChange)="cf.addrLat = $event"
          [lng]="cf.addrLng"
          (lngChange)="cf.addrLng = $event"
          [errors]="cfAddrErrors()"
          (clearError)="clearCfAddrError($event)"
        />
        <label>
          Instruction (optional)
          <textarea [(ngModel)]="cf.instruction" name="cinst" rows="2"></textarea>
        </label>
        <div class="grid">
          <label>
            Preferred time slot
            <select [(ngModel)]="cf.preferredTimeSlot" name="cts">
              <option value="">No preference</option>
              <option value="morning">Morning (9:00–11:00)</option>
              <option value="noon">Noon (11:00–13:00)</option>
              <option value="afternoon">Afternoon (13:00–15:00)</option>
              <option value="evening">Evening (15:00–17:00)</option>
              <option value="night">Night (17:00–22:00)</option>
            </select>
          </label>
        </div>
        <label class="checkbox">
          <input type="checkbox" [(ngModel)]="cf.isDefault" name="cdef" />
          Set as default preset
        </label>
        @if (contactError()) {
          <p class="err">{{ contactError() }}</p>
        }
        <div class="modal-actions">
          <button type="button" class="btn-ghost" (click)="contactModalOpen.set(false)">
            Cancel
          </button>
          <button type="submit" class="btn-primary" [disabled]="savingContact()">
            {{ savingContact() ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </form>
    </app-modal>

    <!-- Notification Preferences -->
    <section class="card page-child">
      <h2>Notification Preferences</h2>
      @if (notifPrefs(); as np) {
        <div class="notif-grid">
          <div class="notif-group">
            <span class="notif-group-label">Booking updates</span>
            <label class="notif-toggle">
              <input type="checkbox" [ngModel]="np.bookingUpdates?.inApp" (ngModelChange)="updateNotifPref('bookingUpdates', 'inApp', $event)" />
              In-app notifications
            </label>
            <label class="notif-toggle">
              <input type="checkbox" [ngModel]="np.bookingUpdates?.email" (ngModelChange)="updateNotifPref('bookingUpdates', 'email', $event)" />
              Email
            </label>
          </div>
          <div class="notif-group">
            <span class="notif-group-label">Proposals</span>
            <label class="notif-toggle">
              <input type="checkbox" [ngModel]="np.proposals?.inApp" (ngModelChange)="updateNotifPref('proposals', 'inApp', $event)" />
              In-app notifications
            </label>
          </div>
          <div class="notif-group">
            <span class="notif-group-label">Promotions and offers</span>
            <label class="notif-toggle">
              <input type="checkbox" [ngModel]="np.promotions?.inApp" (ngModelChange)="updateNotifPref('promotions', 'inApp', $event)" />
              In-app notifications
            </label>
            <label class="notif-toggle">
              <input type="checkbox" [ngModel]="np.promotions?.email" (ngModelChange)="updateNotifPref('promotions', 'email', $event)" />
              Email
            </label>
          </div>
          <div class="notif-group">
            <span class="notif-group-label">Chat messages</span>
            <label class="notif-toggle">
              <input type="checkbox" [ngModel]="np.chatMessages?.inApp" (ngModelChange)="updateNotifPref('chatMessages', 'inApp', $event)" />
              In-app notifications
            </label>
          </div>
        </div>
        <button class="btn-primary" (click)="saveNotifPrefs()" [disabled]="savingNotifPrefs()">
          {{ savingNotifPrefs() ? 'Saving…' : 'Save notification preferences' }}
        </button>
      } @else {
        <p class="muted">Loading preferences…</p>
      }
    </section>

    <!-- Danger Zone -->
    <section class="card page-child danger-zone">
      <h2>Danger Zone</h2>
      <p class="muted">
        Permanently deactivate your account. This action cannot be undone.
      </p>
      <button class="btn-danger" (click)="deactivateStep.set(1)">
        Deactivate my account
      </button>
    </section>

    <app-modal [open]="deactivateStep() === 1" title="⚠️ Deactivate your account?" (closed)="deactivateStep.set(0)">
      <ul class="deactivate-list">
        <li>This action cannot be undone</li>
        <li>You won't be able to log in again</li>
        <li>Your data will be anonymized</li>
        <li>Open bookings will be cancelled</li>
      </ul>
      <div class="modal-actions">
        <button class="btn-ghost" (click)="deactivateStep.set(0)">Cancel</button>
        <button class="btn-primary" (click)="deactivateStep.set(2)">Continue</button>
      </div>
    </app-modal>

    <app-modal [open]="deactivateStep() === 2" title="Confirm deactivation" (closed)="deactivateStep.set(0)">
      <label>Reason for leaving <span class="err">*</span><textarea [(ngModel)]="deactivateReason" name="dreason" rows="3" required></textarea></label>
      <label>Enter your password <span class="err">*</span><input type="password" [(ngModel)]="deactivatePassword" name="dpass" required /></label>
      @if (deactivateError()) { <p class="err">{{ deactivateError() }}</p> }
      <div class="modal-actions">
        <button class="btn-ghost" (click)="deactivateStep.set(0)">Cancel</button>
        <button class="btn-primary" (click)="deactivateStep2Continue()">Continue</button>
      </div>
    </app-modal>

    <app-modal [open]="deactivateStep() === 3" title="Are you absolutely sure?" (closed)="deactivateStep.set(0)">
      <p class="muted">Type <strong>DELETE</strong> to confirm.</p>
      <label>Type DELETE<input [(ngModel)]="deactivateConfirm" name="dconfirm" placeholder="" /></label>
      @if (deactivateError()) { <p class="err">{{ deactivateError() }}</p> }
      <div class="modal-actions">
        <button class="btn-ghost" (click)="deactivateStep.set(0)">Cancel</button>
        <button class="btn-danger" (click)="doDeactivate()" [disabled]="deactivating()">
          {{ deactivating() ? 'Deactivating…' : 'Deactivate my account' }}
        </button>
      </div>
    </app-modal>
  `,
    styles: [
        `
      :host {
        display: block;
      }
      section {
        margin-bottom: 1.2rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      section:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.07);
        transform: translateY(-1px);
      }
      h2 {
        margin-top: 0;
        font-size: 1.05rem;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.8rem;
        margin-bottom: 1rem;
      }
      @media (max-width: 560px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.6rem;
      }
      .addr {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.55rem 0.5rem;
        margin: 0 -0.5rem;
        border-bottom: 1px solid var(--color-border);
        border-radius: var(--radius);
        transition: background 0.12s ease;
      }
      .addr:hover {
        background: var(--color-surface);
      }
      .addr:last-child {
        border-bottom: none;
      }
      .preset-default {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.7rem 0.6rem;
        margin: 0 -0.5rem 0.6rem;
        border: 2px solid var(--color-primary);
        border-radius: var(--radius);
        background: var(--color-primary-light);
      }
      .addr-actions {
        display: flex;
        gap: 0.4rem;
        flex-shrink: 0;
        flex-wrap: wrap;
      }
      .addr-text {
        flex: 1 1 auto;
        min-width: 0;
        overflow-wrap: break-word;
      }
      @media (max-width: 560px) {
        .addr,
        .preset-default {
          flex-direction: column;
          align-items: stretch;
          gap: 0.45rem;
        }
        .addr-actions {
          justify-content: flex-start;
        }
      }
      .tag {
        font-size: 0.7rem;
        background: var(--color-status-completed-bg);
        color: var(--color-status-completed-text);
        padding: 0.1rem 0.45rem;
        border-radius: 999px;
        margin-left: 0.4rem;
      }
      .small {
        font-size: 0.82rem;
      }
      .form {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
      }
      .checkbox {
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
        font-weight: 400;
      }
      .checkbox input {
        width: auto;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .avatar-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .avatar-img {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid var(--color-border);
      }
      .avatar-placeholder {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: var(--color-primary);
        color: #fff;
        font-size: 1.4rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .avatar-actions {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .file-hidden {
        display: none;
      }
      .file-label {
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        font-size: 0.85rem;
      }
      .btn-remove {
        font-size: 0.78rem;
        padding: 0.1rem 0.4rem;
        color: var(--color-danger);
        justify-content: flex-start;
      }
      .err {
        color: var(--color-danger);
      }
      .ok {
        color: var(--color-success);
      }
      .danger-zone { border: 1px solid var(--color-danger, #dc2626); }
      .danger-zone h2 { color: var(--color-danger); }
      .notif-grid { display: flex; flex-direction: column; gap: 0.8rem; margin-bottom: 1rem; }
      .notif-group { display: flex; flex-direction: column; gap: 0.3rem; }
      .notif-group-label { font-weight: 600; font-size: 0.92rem; color: var(--color-text); }
      .notif-toggle { flex-direction: row; align-items: center; gap: 0.4rem; font-weight: 400; font-size: 0.88rem; }
      .notif-toggle input { width: auto; }
      .btn-danger {
        background: var(--color-danger, #dc2626); color: #fff; border: none;
        padding: 0.5rem 1rem; border-radius: var(--radius); cursor: pointer;
        font-size: 0.88rem; font-weight: 600; font-family: inherit;
        transition: opacity 0.15s ease;
      }
      .btn-danger:hover { opacity: 0.85; }
      .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
      .deactivate-list { margin: 0 0 0.7rem; padding-left: 1.2rem; }
      .deactivate-list li { margin-bottom: 0.3rem; font-size: 0.9rem; }
      .static-field { display: block; padding: 0.55rem 0; font-size: 0.95rem; color: var(--color-text); }
    `,
    ]
})
export class AccountComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @ViewChild('avatarInput') avatarInputRef?: ElementRef<HTMLInputElement>;

  weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

  profile = signal<Profile | null>(null);
  profileFailed = signal(false);
  p: Profile = { id: '', name: '', email: '', phone: '' };
  savingProfile = signal(false);

  // Avatar
  avatarUrl = signal<string | null>(null);
  avatarUploading = signal(false);
  avatarUploadStatus = signal('');
  avatarError = signal('');

  addresses = signal<Address[]>([]);
  loadingAddr = signal(true);
  addrLoadFailed = signal(false);

  addressModalOpen = signal(false);
  editingAddress = signal<Address | null>(null);
  savingAddr = signal(false);
  addrError = signal('');
  af = { label: '', address: '', propertyType: 'condo', isDefault: false, lat: undefined as number | undefined, lng: undefined as number | undefined, postcode: '', district: '', state: '' };

  contacts = signal<QuotePreset[]>([]);
  loadingContacts = signal(true);
  contactsLoadFailed = signal(false);
  contactModalOpen = signal(false);
  editingContact = signal<QuotePreset | null>(null);
  savingContact = signal(false);
  contactError = signal('');
  cfAddrErrors = signal(new Set<string>());
  cf = {
    label: '',
    contactName: '',
    contactNumber: '',
    addressId: '',
    addrNo: '',
    addrStreet: '',
    addrPostcode: '',
    addrDistrict: '',
    addrState: '',
    addrPropertyType: 'landed',
    addrLat: undefined as number | undefined,
    addrLng: undefined as number | undefined,
    instruction: '',
    preferredTimeSlot: '',
    isDefault: false,
  };

  // ── Notification Preferences ──────────────────────────────────────────────
  notifPrefs = signal<NotificationPrefs | null>(null);
  savingNotifPrefs = signal(false);

  updateNotifPref(group: string, field: string, value: boolean): void {
    this.notifPrefs.update((np) => {
      if (!np) return np;
      const updated = { ...np };
      const g = updated[group as keyof NotificationPrefs];
      if (g) {
        (g as Record<string, boolean>)[field] = value;
      }
      return updated;
    });
  }

  saveNotifPrefs(): void {
    const prefs = this.notifPrefs();
    if (!prefs) return;
    this.savingNotifPrefs.set(true);
    this.api.patch('/user/me', { notificationPrefs: prefs }).subscribe({
      next: () => {
        this.savingNotifPrefs.set(false);
        this.toast.success('Notification preferences saved.');
      },
      error: (e) => {
        this.savingNotifPrefs.set(false);
        this.toast.error(e.message ?? 'Could not save preferences.');
      },
    });
  }

  // ── Deactivate account wizard ──────────────────────────────────────────────
  deactivateStep = signal(0);
  deactivateReason = signal('');
  deactivatePassword = signal('');
  deactivateConfirm = signal('');
  deactivateError = signal<string | null>(null);
  deactivating = signal(false);
  // ────────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.api.get<Profile & { avatarUrl?: string | null; notificationPrefs?: NotificationPrefs }>('/user/me').subscribe({
      next: (r) => {
        this.profile.set(r);
        this.p = { ...r };
        this.avatarUrl.set(r.avatarUrl ?? null);
        if (r.notificationPrefs) {
          this.notifPrefs.set(r.notificationPrefs);
        } else {
          this.notifPrefs.set({
            bookingUpdates: { inApp: true, email: true },
            proposals: { inApp: true },
            promotions: { inApp: false, email: false },
            chatMessages: { inApp: true },
          });
        }
      },
      error: () => this.profileFailed.set(true),
    });
    this.loadAddresses();
    this.loadContacts();

    this.route.queryParams.pipe(finalize(() => {
      this.router.navigate([], {
        queryParams: { topup: undefined, session_id: undefined },
        replaceUrl: true,
      });
    })).subscribe(params => {
      if (params['topup'] === 'success' && params['session_id']) {
        this.api.post<{ balance: number }>('/stripe/verify-topup', { sessionId: params['session_id'] }).subscribe({
          next: (r) => {
            this.auth.updateCreditBalance(r.balance);
            this.toast.success('Top-up successful!');
          },
          error: () => {
            // Fallback: still fetch balance in case webhook already processed it
            this.api.get<{ balance: number }>('/user/me/credit').subscribe({
              next: (r) => this.auth.updateCreditBalance(r.balance),
            });
          },
        });
      } else if (params['topup'] === 'success') {
        this.api.get<{ balance: number }>('/user/me/credit').subscribe({
          next: (r) => this.auth.updateCreditBalance(r.balance),
        });
      }
    });
  }

  private loadContacts(): void {
    this.loadingContacts.set(true);
    this.contactsLoadFailed.set(false);
    this.api.get<{ data: QuotePreset[] }>('/user/me/quote-presets').subscribe({
      next: (r) => {
        this.contacts.set(r.data);
        this.loadingContacts.set(false);
      },
      error: () => {
        this.loadingContacts.set(false);
        this.contactsLoadFailed.set(true);
      },
    });
  }

  openContact(c?: QuotePreset): void {
    this.contactError.set('');
    this.cfAddrErrors.set(new Set<string>());
    this.editingContact.set(c ?? null);
    if (c) {
      // Parse addrNo + addrStreet from stored address string (e.g. "12 Jalan Bukit Bintang")
      const rawAddr = c.address?.address ?? '';
      const firstCommaSegment = rawAddr.split(',')[0].trim();
      const firstSpace = firstCommaSegment.indexOf(' ');
      const maybeNum = firstSpace > 0 ? firstCommaSegment.slice(0, firstSpace) : '';
      const parsedNo = /^\d/.test(maybeNum) ? maybeNum : '';
      const parsedStreet = parsedNo ? firstCommaSegment.slice(firstSpace + 1) : firstCommaSegment;
      this.cf = {
        label: c.label ?? '',
        contactName: c.contactName,
        contactNumber: c.contactNumber,
        addressId: c.addressId,
        addrNo: parsedNo,
        addrStreet: parsedStreet,
        addrPostcode: (c.address as Address | undefined)?.postcode ?? '',
        addrDistrict: (c.address as Address | undefined)?.district ?? '',
        addrState: (c.address as Address | undefined)?.state ?? '',
        addrPropertyType: (c.address as Address | undefined)?.propertyType ?? 'landed',
        addrLat: undefined,
        addrLng: undefined,
        instruction: c.instruction ?? '',
        preferredTimeSlot: c.preferredTimeSlot ?? '',
        isDefault: c.isDefault,
      };
    } else {
      this.cf = {
        label: '',
        contactName: '',
        contactNumber: '',
        addressId: '',
        addrNo: '',
        addrStreet: '',
        addrPostcode: '',
        addrDistrict: '',
        addrState: '',
        addrPropertyType: 'landed',
        addrLat: undefined,
        addrLng: undefined,
        instruction: '',
        preferredTimeSlot: '',
        isDefault: this.contacts().length === 0,
      };
    }
    this.contactModalOpen.set(true);
  }

  saveContact(): void {
    // Validate contact fields
    if (!this.cf.contactName.trim() || !this.cf.contactNumber.trim()) {
      this.contactError.set('Contact person and number are required.');
      return;
    }
    // Validate address fields
    const addrErrs = new Set<string>();
    if (!this.cf.addrNo.trim()) addrErrs.add('addressNo');
    if (!this.cf.addrStreet.trim()) addrErrs.add('streetDetails');
    if (!this.cf.addrPostcode.trim()) addrErrs.add('postcode');
    if (!this.cf.addrPropertyType) addrErrs.add('propertyType');
    if (addrErrs.size > 0) {
      this.cfAddrErrors.set(addrErrs);
      this.contactError.set('Please fill in all required address fields.');
      return;
    }

    this.savingContact.set(true);
    this.contactError.set('');

    const existing = this.editingContact();
    const composedAddress = `${this.cf.addrNo} ${this.cf.addrStreet}, ${this.cf.addrDistrict}, ${this.cf.addrState} ${this.cf.addrPostcode}`.trim();

    const savePreset = (addressId: string) => {
      const body: Record<string, unknown> = {
        label: this.cf.label || undefined,
        contactName: this.cf.contactName,
        contactNumber: this.cf.contactNumber,
        addressId,
        instruction: this.cf.instruction || undefined,
        preferredTimeSlot: this.cf.preferredTimeSlot || undefined,
        isDefault: this.cf.isDefault,
      };
      const req = existing
        ? this.api.patch(`/user/me/quote-presets/${existing.id}`, body)
        : this.api.post('/user/me/quote-presets', body);
      req.subscribe({
        next: () => {
          this.savingContact.set(false);
          this.contactModalOpen.set(false);
          this.toast.success('Preset saved.');
          this.loadContacts();
          this.loadAddresses();
        },
        error: (e) => {
          this.savingContact.set(false);
          this.contactError.set(e.message ?? 'Could not save preset');
        },
      });
    };

    // In edit mode: if addressId is already set and address fields came from the
    // existing preset (user did not trigger userEntered), reuse the existing addressId.
    // We detect "unchanged" by checking if the addressId is still set from openContact().
    // To keep it simple: always create a new address on save (idempotent addresses list).
    const addrBody: Record<string, unknown> = {
      label: this.cf.label || this.cf.contactName,
      address: composedAddress,
      propertyType: this.cf.addrPropertyType,
      postcode: this.cf.addrPostcode || undefined,
      district: this.cf.addrDistrict || undefined,
      state: this.cf.addrState || undefined,
      isDefault: false,
    };
    if (this.cf.addrLat != null) addrBody['lat'] = this.cf.addrLat;
    if (this.cf.addrLng != null) addrBody['lng'] = this.cf.addrLng;

    this.api.post<{ id: string }>('/user/me/addresses', addrBody).subscribe({
      next: (r) => savePreset(r.id),
      error: (e) => {
        this.savingContact.set(false);
        this.contactError.set(e.message ?? 'Could not save address');
      },
    });
  }

  clearCfAddrError(field: string): void {
    this.cfAddrErrors.update(s => { const n = new Set(s); n.delete(field); return n; });
  }

  removeContact(c: QuotePreset): void {
    this.dialog
      .confirm(`Delete the preset "${c.label || c.contactName}"?`, { confirmLabel: 'Delete' })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`/user/me/quote-presets/${c.id}`).subscribe({
          next: () => {
            this.toast.success('Preset deleted.');
            this.loadContacts();
          },
          error: (e) => this.toast.error(e.message ?? 'Could not delete preset'),
        });
      });
  }

  private loadAddresses(): void {
    this.loadingAddr.set(true);
    this.addrLoadFailed.set(false);
    this.api.get<{ data: Address[] }>('/user/me/addresses').subscribe({
      next: (r) => {
        this.addresses.set(r.data);
        this.loadingAddr.set(false);
      },
      error: () => {
        this.loadingAddr.set(false);
        this.addrLoadFailed.set(true);
      },
    });
  }

  defaultPreset = computed(() => this.contacts().find((c) => c.isDefault) ?? null);
  otherPresets = computed(() => this.contacts().filter((c) => !c.isDefault));

  setDefaultPreset(preset: QuotePreset): void {
    this.api.patch(`/user/me/quote-presets/${preset.id}`, { isDefault: true }).subscribe({
      next: () => {
        this.toast.success('Default preset updated.');
        this.loadContacts();
      },
      error: (e) => this.toast.error(e.message ?? 'Could not update default preset'),
    });
  }

  saveProfile(): void {
    this.savingProfile.set(true);
    const { name, phone, contactName, contactNumber, preferredTimeSlot, backupEmail } = this.p;
    const avatarUrl = this.avatarUrl();
    this.api
      .patch('/user/me', { name, phone, contactName, contactNumber, preferredTimeSlot, avatarUrl, backupEmail: backupEmail || null })
      .subscribe({
        next: () => {
          this.savingProfile.set(false);
          this.toast.success('Profile saved.');
        },
        error: (e) => {
          this.savingProfile.set(false);
          this.toast.error(e.message ?? 'Could not save profile');
        },
      });
  }

  // ── Avatar upload (presign → S3/local PUT → confirm → PATCH /user/me) ──
  onAvatarFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.avatarError.set('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.avatarError.set('Photo must be under 5 MB.');
      input.value = '';
      return;
    }

    this.avatarUploading.set(true);
    this.avatarUploadStatus.set('Requesting upload URL…');

    this.api
      .post<{ uploadUrl: string; fileId: string }>('/files/presign', {
        purpose: 'avatar',
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
      })
      .pipe(
        switchMap(({ uploadUrl, fileId }) => {
          this.avatarUploadStatus.set('Uploading photo…');
          return this.http
            .put(uploadUrl, file, {
              headers: { 'Content-Type': file.type || 'image/jpeg' },
            })
            .pipe(
              switchMap(() => {
                this.avatarUploadStatus.set('Confirming…');
                return this.api.post<{ fileUrl: string }>(
                  `/files/${fileId}/confirm`,
                  {},
                );
              }),
            );
        }),
        switchMap(({ fileUrl }) => {
          this.avatarUploadStatus.set('Updating profile…');
          return this.api.patch<{ avatarUrl: string }>('/user/me', {
            avatarUrl: fileUrl,
          });
        }),
      )
      .subscribe({
        next: (updated) => {
          this.avatarUrl.set(updated.avatarUrl);
          this.avatarUploading.set(false);
          this.toast.success('Profile photo updated.');
          if (this.avatarInputRef) this.avatarInputRef.nativeElement.value = '';
        },
        error: (e) => {
          this.avatarUploading.set(false);
          this.avatarError.set(e.message ?? 'Upload failed.');
        },
      });
  }

  removeAvatar(): void {
    this.dialog
      .confirm('Remove your profile photo?', { confirmLabel: 'Remove' })
      .subscribe((ok) => {
        if (!ok) return;
        this.avatarUploading.set(true);
        this.api.patch<{ avatarUrl: string | null }>('/user/me', { avatarUrl: null }).subscribe({
          next: () => {
            this.avatarUrl.set(null);
            this.avatarUploading.set(false);
            this.toast.success('Profile photo removed.');
          },
          error: (e) => {
            this.avatarUploading.set(false);
            this.avatarError.set(e.message ?? 'Could not remove photo.');
          },
        });
      });
  }

  /** Extract initials from a name (max 2 chars). */
  initials(name: string): string {
    return name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }

  openAddress(a?: Address): void {
    this.addrError.set('');
    this.editingAddress.set(a ?? null);
    this.af = a
      ? {
          label: a.label,
          address: a.address,
          propertyType: a.propertyType ?? 'condo',
          isDefault: a.isDefault,
          lat: undefined,
          lng: undefined,
          postcode: a.postcode ?? '',
          district: a.district ?? '',
          state: a.state ?? '',
        }
      : { label: '', address: '', propertyType: 'condo', isDefault: this.addresses().length === 0, lat: undefined, lng: undefined, postcode: '', district: '', state: '' };
    this.addressModalOpen.set(true);
  }

  saveAddress(): void {
    if (!this.af.label.trim() || !this.af.address.trim()) {
      this.addrError.set('Label and full address are required.');
      return;
    }
    this.savingAddr.set(true);
    this.addrError.set('');
    const existing = this.editingAddress();
    const body: Record<string, unknown> = {
      label: this.af.label,
      address: this.af.address,
      propertyType: this.af.propertyType,
      isDefault: this.af.isDefault,
      postcode: this.af.postcode || undefined,
      district: this.af.district || undefined,
      state: this.af.state || undefined,
    };
    if (this.af.lat != null) body['lat'] = this.af.lat;
    if (this.af.lng != null) body['lng'] = this.af.lng;
    const req = existing
      ? this.api.patch(`/user/me/addresses/${existing.id}`, body)
      : this.api.post('/user/me/addresses', body);
    req.subscribe({
      next: () => {
        this.savingAddr.set(false);
        this.addressModalOpen.set(false);
        this.toast.success('Address saved.');
        this.loadAddresses();
      },
      error: (e) => {
        this.savingAddr.set(false);
        this.addrError.set(e.message ?? 'Could not save address');
      },
    });
  }

  /** Called when a Google Places suggestion is selected. */
  onPlaceSelect(place: PlaceResult): void {
    this.af.address = place.address;
    this.af.lat = place.lat;
    this.af.lng = place.lng;
    this.af.postcode = place.postcode ?? '';
    this.af.district = place.city ?? '';
    this.af.state = place.state ?? '';
  }

  removeAddress(a: Address): void {
    this.dialog
      .confirm(`Delete the address "${a.label}"?`, { confirmLabel: 'Delete' })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.delete(`/user/me/addresses/${a.id}`).subscribe({
          next: () => {
            this.toast.success('Address deleted.');
            this.loadAddresses();
          },
          error: (e) => this.toast.error(e.message ?? 'Could not delete address'),
        });
      });
  }

  deactivateStep2Continue(): void {
    this.deactivateError.set(null);
    if (!this.deactivateReason().trim()) {
      this.deactivateError.set('Please enter a reason.');
      return;
    }
    if (!this.deactivatePassword()) {
      this.deactivateError.set('Please enter your password.');
      return;
    }
    this.deactivateStep.set(3);
  }

  doDeactivate(): void {
    this.deactivateError.set(null);
    if (this.deactivateConfirm() !== 'DELETE') {
      this.deactivateError.set('Type DELETE to confirm.');
      return;
    }
    this.deactivating.set(true);
    this.api.post('/user/me/deactivate', {
      reason: this.deactivateReason(),
      password: this.deactivatePassword(),
    })
      .pipe(finalize(() => this.deactivating.set(false)))
      .subscribe({
        next: () => {
          this.auth.logout();
          this.router.navigate(['/']);
          this.toast.success('Account deactivated.');
        },
        error: (e) => {
          this.deactivateError.set(e.error?.message ?? e.message ?? 'Could not deactivate account');
        },
      });
  }
}
