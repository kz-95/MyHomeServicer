import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
  computed,
} from "@angular/core";
import { routeFor } from '../../core/route-for';
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { HttpClient } from "@angular/common/http";
import { switchMap, finalize } from "rxjs";
import { ApiService } from "../../core/services/api.service";
import { AuthService } from "../../core/services/auth.service";
import { ToastService } from "../../core/services/toast.service";
import { DialogService } from "../../core/services/dialog.service";
import { PlacesAutocompleteComponent, PlaceResult } from "../../shared/places-autocomplete.component";
import { PhoneInputComponent } from "../../shared/phone-input.component";
import { ModalComponent } from "../../shared/modal.component";
import { Router } from "@angular/router";
import { ListToolbarComponent } from "../../shared/list-toolbar.component";
import { WaPresetManagerComponent } from "./wa-preset-manager.component";

interface FeeBreakdown {
  totalRate: number;
  breakdown: { label: string; percent: number }[];
}

interface IdentityChangeRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  proposed: Record<string, unknown>;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

interface ServicerContact {
  id: string;
  servicerId: string;
  contactPerson: string;
  number?: string | null;
  email?: string | null;
  isPrimary: boolean;
  visibleToCustomer: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ServicerProfile {
  id: string;
  businessName: string;
  email: string;
  bio?: string | null;
  logoUrl?: string | null;
  serviceAreas?: string[] | null;
  serviceRadiusKm?: number | null;
  invoicePrefix?: string | null;
  invoiceYearFormat?: string | null;
  invoiceSeparator?: string | null;
  invoicePadding?: number | null;
  invoiceContent?: string | null;
  invoiceSuffix?: string | null;
  kycStatus: string;
  rating: number;
  depositBalance: number;
  showEmailPublic?: boolean;
  showPhonePublic?: boolean;
  entityType?: string | null;
  businessRegistrationNumber?: string | null;
  taxNumber?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  sstRegistered?: boolean;
  sstNumber?: string | null;
  serviceChargeRate?: number;
  taxInclusive?: boolean;
  isCompany?: boolean;
  identityChangeRequests?: IdentityChangeRequest[];
  contacts?: ServicerContact[];
  categoryId?: string;
  category?: { id: string; name: string; slug: string; imageUrl?: string };
  operatingHours?: unknown;
}

interface Penalty {
  id: string;
  type: string;
  amountDeducted: number;
  status: string;
  createdAt: string;
  bookingId: string;
  appealStatus: string | null;
}

/**
 * Servicer Business Profile page.
 *
 * Sections:
 * 1. Business Identity  - businessName, logo, bio + Business Contacts CRUD
 * 2. Type of Services   - categoryId view/change-request, serviceAreas, operatingHours
 * 3. Status             - kycStatus + identity change requests
 * 4. Business & Tax     - entityType, regNo, taxNo, isCompany(derived), tax config+calculator, invoice settings+preview
 * 5. Action PIN
 * 6. Money (read-only)  - fee breakdown, penalties
 * 7. Danger Zone
 */
@Component({
    selector: "app-servicer-account",
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, PlacesAutocompleteComponent, PhoneInputComponent, ModalComponent, ListToolbarComponent, WaPresetManagerComponent],
    template: `
    <h1>Business Profile Settings</h1>

    @if (loading()) {
      <p class="muted">Loading profile…</p>
    } @else if (profileFailed()) {
      <p class="muted">Could not load profile. Please refresh the page.</p>
    } @else {
      @if (profile(); as p) {
        <!-- ── 1. Business Identity ─────────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Business Identity</h2>

          <!-- Logo -->
          <div class="logo-row">
            @if (p.logoUrl) {
              <img [src]="p.logoUrl" alt="Logo" class="logo-img" />
            } @else {
              <div class="logo-placeholder">
                {{ p.businessName.charAt(0).toUpperCase() }}
              </div>
            }
            <div class="logo-actions">
              <p class="muted small">{{ p.businessName }}</p>
              <label class="btn-ghost file-label">
                <input
                  #logoInput
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  class="file-hidden"
                  (change)="onLogoFileChange($event)"
                />
                {{ logoUploading() ? logoUploadStatus() : "Change logo" }}
              </label>
              @if (logoError()) {
                <span class="err small">{{ logoError() }}</span>
              }
            </div>
          </div>

          <div class="form">
            <label>
              Business name
              <input [(ngModel)]="f.businessName" name="bname" placeholder="Your business name" />
            </label>
            <label>
              Bio
              <span class="muted">(optional - shown on your public profile)</span>
              <textarea rows="3" [(ngModel)]="f.bio" name="bio" placeholder="Describe your business…"></textarea>
            </label>
            <div class="form-actions">
              <button class="btn-primary" (click)="saveProfile()" [disabled]="savingProfile()">
                {{ savingProfile() ? "Saving…" : "Save identity" }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── Business Contacts CRUD ──────────────────────────────────────── -->
        <section class="card page-child">
          <div class="head">
            <h2>Business Contacts</h2>
            <button class="btn-primary" (click)="openContactForm()" [disabled]="contacts().length >= 10">
              + Add
            </button>
          </div>
          <p class="muted small">Up to 10 contacts. The primary contact is your customer-facing fallback. Each contact controls its own public visibility.</p>

          @if (contactsLoading()) {
            <p class="muted">Loading contacts…</p>
          } @else if (contacts().length === 0) {
            <p class="muted small">No contacts yet. Add at least one to appear on your public profile.</p>
          } @else {
            @for (c of contacts(); track c.id) {
              <div class="contact-row" [class.primary]="c.isPrimary">
                <div class="contact-info">
                  <strong>{{ c.contactPerson }}</strong>
                  @if (c.isPrimary) { <span class="tag">Primary</span> }
                  <div class="muted small">
                    @if (c.number) { {{ c.number }} · }
                    @if (c.email) { {{ c.email }} }
                    @if (!c.number && !c.email) { <span class="err">No contact info</span> }
                  </div>
                  <div class="muted small">
                    <label class="inline-check">
                      <input type="checkbox" [checked]="c.visibleToCustomer" (change)="toggleContactVisibility(c, $event)" />
                      Visible to customers
                    </label>
                  </div>
                </div>
                <div class="contact-actions">
                  @if (!c.isPrimary) {
                    <button class="btn-ghost small-btn" (click)="setPrimaryContact(c)">Set primary</button>
                  }
                  <button class="btn-ghost small-btn" (click)="openContactForm(c)">Edit</button>
                  @if (contacts().length > 1 && !c.isPrimary) {
                    <button class="btn-ghost small-btn btn-remove" (click)="deleteContact(c)">Delete</button>
                  }
                </div>
              </div>
            }
          }
        </section>

        <!-- Contact add/edit modal -->
        @if (contactModalOpen()) {
          <app-modal [open]="true" [title]="editingContact() ? 'Edit contact' : 'Add contact'" (closed)="contactModalOpen.set(false)">
            <form class="pin-form" (ngSubmit)="saveContact()">
              <label>
                Contact person <span class="req">*</span>
                <input [(ngModel)]="cf.contactPerson" name="cname" placeholder="e.g. Ahmad" />
              </label>
              <label>
                Phone number
                <app-phone-input [(ngModel)]="cf.number" name="cphone"></app-phone-input>
              </label>
              <label>
                Email
                <input [(ngModel)]="cf.email" name="cemail" placeholder="contact@example.com" type="email" />
              </label>
              <p class="muted small">At least one of phone number or email is required.</p>
              <label class="checkbox-row">
                <input type="checkbox" [(ngModel)]="cf.isPrimary" name="cprimary" />
                Set as primary contact
              </label>
              <label class="checkbox-row">
                <input type="checkbox" [(ngModel)]="cf.visibleToCustomer" name="cvisible" />
                Visible to customers
              </label>
              @if (contactError()) {
                <p class="err">{{ contactError() }}</p>
              }
              <div class="modal-actions">
                <button type="button" class="btn-ghost" (click)="contactModalOpen.set(false)">Cancel</button>
                <button type="submit" class="btn-primary" [disabled]="savingContact()">
                  {{ savingContact() ? 'Saving…' : 'Save contact' }}
                </button>
              </div>
            </form>
          </app-modal>
        }

        <!-- ── WhatsApp message presets ────────────────────────────────────── -->
        <section class="card page-child">
          <app-wa-preset-manager></app-wa-preset-manager>
        </section>

        <!-- ── 2. Type of Services ─────────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Type of Services</h2>

          <!-- Primary category -->
          <div class="form">
            <label>
              Primary category
              @if (p.category) {
                <span class="static-field">{{ p.category.name }} <span class="muted small">({{ p.category.slug }})</span></span>
              } @else {
                <span class="muted">Not set</span>
              }
            </label>
            <p class="muted small">Category changes require admin review. <button class="btn-ghost small-btn" (click)="requestCategoryChange()">Request category change</button></p>

            <!-- Service areas -->
            <div class="sa-section">
              <label>
                Service areas
                <span class="muted">(postcodes or area names)</span>
                <app-places-autocomplete
                  [placeholder]="'Add a service area…'"
                  [(ngModel)]="newAreaInput"
                  name="sa"
                  (placeSelect)="onServiceAreaSelect($event)"
                />
              </label>
              @if (f.serviceAreaList.length > 0) {
                <div class="sa-chips">
                  @for (area of f.serviceAreaList; track $index) {
                    <span class="sa-chip">
                      {{ area }}
                      <button type="button" class="sa-remove" (click)="removeServiceArea($index)" [attr.aria-label]="'Remove ' + area">&times;</button>
                    </span>
                  }
                </div>
              }
            </div>

            <!-- Service radius -->
            <label>
              Service radius (km)
              <span class="muted">(how far you'll travel - used to match jobs to you)</span>
              <input
                type="number"
                min="1"
                step="1"
                [(ngModel)]="f.serviceRadiusKm"
                name="serviceRadiusKm"
                placeholder="10"
                style="max-width: 120px"
              />
            </label>

            <!-- Operating hours -->
            <label>
              Operating hours
              <span class="muted">(base schedule - your weekly template; add time ranges with rest breaks)</span>
            </label>

            @if (ohEntries().length > 0) {
              <div class="oh-list">
                @for (entry of ohEntries(); track entry._key; let i = $index) {
                  <div class="oh-row">
                    <span class="oh-days">{{ formatOhDays(entry.days) }}</span>
                    <span class="oh-times">{{ entry.open }} – {{ entry.close }}</span>
                    @if (entry.restOpen && entry.restClose) {
                      <span class="oh-rest">Break: {{ entry.restOpen }} – {{ entry.restClose }}</span>
                    }
                    <button class="btn-ghost small-btn" (click)="editOhEntry(i)">Edit</button>
                    <button class="btn-ghost small-btn btn-remove" (click)="removeOhEntry(i)">Remove</button>
                  </div>
                }
              </div>
            }

            @if (ohFormOpen()) {
              <div class="oh-form">
                <div class="oh-days-pick">
                  <span class="muted small">Days:</span>
                  @for (d of weekdays; track d) {
                    <label class="oh-day-check">
                      <input type="checkbox" [checked]="ohForm.days.includes(d)" (change)="toggleOhDay(d)" />
                      {{ dayLabels[d] }}
                    </label>
                  }
                </div>
                <div class="oh-form-row">
                  <input class="time-input" type="text" [ngModel]="ohForm.open" (ngModelChange)="formatOhFormTime('open', $event)" name="ohFOpen" placeholder="09:00" maxlength="5" />
                  <span class="muted">to</span>
                  <input class="time-input" type="text" [ngModel]="ohForm.close" (ngModelChange)="formatOhFormTime('close', $event)" name="ohFClose" placeholder="17:00" maxlength="5" />
                </div>
                <div class="oh-form-row">
                  <span class="muted small" style="min-width:50px">Rest:</span>
                  <input class="time-input" type="text" [ngModel]="ohForm.restOpen" (ngModelChange)="formatOhFormTime('restOpen', $event)" name="ohFRestO" placeholder="12:00" maxlength="5" />
                  <span class="muted">to</span>
                  <input class="time-input" type="text" [ngModel]="ohForm.restClose" (ngModelChange)="formatOhFormTime('restClose', $event)" name="ohFRestC" placeholder="13:00" maxlength="5" />
                </div>
                @if (ohFormError()) {
                  <p class="err small">{{ ohFormError() }}</p>
                }
                <div class="oh-form-actions">
                  <button class="btn-primary" (click)="confirmOhEntry()">Confirm</button>
                  <button class="btn-ghost" (click)="cancelOhForm()">Cancel</button>
                </div>
              </div>
            } @else {
              <button class="btn-ghost oh-add" (click)="openOhForm()">+ Time range</button>
            }

            @if (profileError()) {
              <p class="err">{{ profileError() }}</p>
            }
            <div class="form-actions">
              <button class="btn-primary" (click)="saveServices()" [disabled]="savingProfile()">
                {{ savingProfile() ? "Saving…" : "Save services" }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── 3. Status ────────────────────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Status</h2>
          <p>
            KYC:
            @if (p.kycStatus === 'approved') {
              <span class="badge-green">Approved</span>
            } @else if (p.kycStatus === 'rejected') {
              <span class="badge-red">Rejected</span>
            } @else {
              <span class="badge-yellow">Reviewing</span>
            }
          </p>
          @if (p.identityChangeRequests && p.identityChangeRequests.length > 0) {
            <div class="id-banner-inline">
              <strong>Pending change requests:</strong>
              @for (req of p.identityChangeRequests; track req.id) {
                <div class="id-req-inline">
                  <span class="badge" [attr.data-status]="req.status">{{ req.status }}</span>
                  <span class="muted small">Requested {{ req.createdAt | date: 'mediumDate' }}</span>
                </div>
              }
            </div>
          }
        </section>

        <!-- ── 4. Business & Tax ────────────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Business &amp; Tax</h2>
          <p class="muted small">
            Changes to legal identity fields require admin review. Tax settings save immediately.
          </p>

          <div class="form">
            <div class="row two-col">
              <label>
                Entity type
                <select [(ngModel)]="f.businessEntityType" name="bet">
                  <option value=""> - Not set - </option>
                  <option value="sole_proprietorship">Sole Proprietorship</option>
                  <option value="partnership">Partnership</option>
                  <option value="enterprise">Enterprise</option>
                  <option value="sdn_bhd">Sdn Bhd</option>
                </select>
              </label>
              <label>
                Is company
                <span class="static-field">{{ derivedIsCompany() ? 'Yes' : 'No' }}</span>
                <span class="muted small">Auto-derived from entity type</span>
              </label>
            </div>
            <div class="row two-col">
              <label>
                Registration number
                <input [(ngModel)]="f.businessRegNumber" name="brn" placeholder="e.g. 202401234567" />
              </label>
              <label>
                Tax number
                <input [(ngModel)]="f.taxNumber" name="tn" placeholder="e.g. C 1234567890" />
              </label>
            </div>
            @if (identityFieldsDirty()) {
              <p class="id-note">Saving identity fields will create a change request for admin review.</p>
            }
            @if (identitySavingError()) {
              <p class="err">{{ identitySavingError() }}</p>
            }
            <div class="form-actions">
              <button class="btn-primary" (click)="saveBusinessDetails()" [disabled]="savingIdentity()">
                {{ savingIdentity() ? "Submitting…" : "Save business details" }}
              </button>
            </div>
          </div>

          <!-- Tax config + calculator (merged panel) -->
          <h3>Tax Configuration</h3>
          <div class="form">
            <label class="toggle-row">
              <span><strong>SST registered</strong></span>
              <input type="checkbox" [ngModel]="sstRegistered()" (ngModelChange)="sstRegistered.set($event); onSstToggled()" name="sstr" class="toggle" />
            </label>
            @if (sstRegistered()) {
              <label>
                SST number
                <input [ngModel]="sstNumber()" (ngModelChange)="sstNumber.set($event)" name="sstn" placeholder="e.g. SST-1234-567890" />
              </label>
            }
            <label>
              Service charge rate (%)
              <input type="number" min="0" step="0.5" [ngModel]="serviceChargeRate()" (ngModelChange)="serviceChargeRate.set($event)" name="scr" placeholder="e.g. 5 or 10" />
            </label>
            <label class="toggle-row">
              <span><strong>Tax inclusive</strong> <span class="muted">(quoted prices include SC + SST)</span></span>
              <input type="checkbox" [ngModel]="taxInclusive()" (ngModelChange)="taxInclusive.set($event)" name="ti" class="toggle" />
            </label>

            <!-- Tax calculator -->
            <div class="tax-calc">
              <label>
                Try amount (RM)
                <input type="number" min="1" step="0.01" [ngModel]="taxTryAmount()" (ngModelChange)="taxTryAmount.set($event)" name="tta" placeholder="e.g. 100.00" />
              </label>
              @if (taxTryAmount() > 0) {
                <div class="tax-breakdown">
                  <div class="tax-row"><span>Subtotal</span><span>RM {{ taxSubtotal() | number:'1.2-2' }}</span></div>
                  <div class="tax-row"><span>Service charge ({{ serviceChargeRate() ?? 0 }}%)</span><span>RM {{ taxSC() | number:'1.2-2' }}</span></div>
                  @if (sstRegistered()) {
                    <div class="tax-row"><span>SST ({{ sstRate() }}%)</span><span>RM {{ taxSST() | number:'1.2-2' }}</span></div>
                  }
                  <div class="tax-row total"><span>Total</span><span>RM {{ taxTotal() | number:'1.2-2' }}</span></div>
                </div>
              }
            </div>

            @if (taxSavingError()) {
              <p class="err">{{ taxSavingError() }}</p>
            }
            <div class="form-actions">
              <button class="btn-primary" (click)="saveTaxConfig()" [disabled]="savingTax()">
                {{ savingTax() ? "Saving…" : "Save tax settings" }}
              </button>
            </div>
          </div>

          <!-- Invoice settings -->
          <h3>Invoice Format</h3>
          <div class="form">
            <div class="row">
              <label>
                Prefix
                <input [(ngModel)]="f.invoicePrefix" name="ip" placeholder="INV" />
              </label>
              <label>
                Content
                <input [(ngModel)]="f.invoiceContent" name="ic" placeholder="(optional)" />
              </label>
              <label>
                Suffix
                <input [(ngModel)]="f.invoiceSuffix" name="isuf" placeholder="(optional)" />
              </label>
              <label>
                Year format
                <select [(ngModel)]="f.invoiceYearFormat" name="iyf">
                  <option value="YYYY">YYYY (e.g. 2026)</option>
                  <option value="YY">YY (e.g. 26)</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label>
                Separator
                <input [(ngModel)]="f.invoiceSeparator" name="is" placeholder="-" maxlength="3" />
              </label>
              <label>
                Padding
                <input type="number" min="1" max="10" [(ngModel)]="f.invoicePadding" name="ipad" />
              </label>
            </div>
            <p class="preview muted small">
              Invoice preview: <strong>{{ invoicePreview() }}</strong>
            </p>
            <div class="form-actions">
              <button class="btn-primary" (click)="saveInvoiceSettings()" [disabled]="savingProfile()">
                {{ savingProfile() ? "Saving…" : "Save invoice settings" }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── 5. Action PIN ────────────────────────────────────────────────── -->
        @if (pinSectionVisible()) {
          <section class="card page-child">
            <h2>Action PIN</h2>
            <p class="muted">Your PIN is used to confirm cancellations and withdrawals.</p>
            <div class="pin-status">
              @if (hasPin()) {
                <span class="badge-green">PIN set</span>
              } @else {
                <span class="badge-yellow">Using default (123456)</span>
              }
            </div>
            <div class="btn-row">
              <button class="btn-ghost" (click)="openChangePin()">{{ hasPin() ? 'Change PIN' : 'Set PIN' }}</button>
              <button class="btn-ghost" (click)="openVerifyPin()">Verify PIN</button>
            </div>
            @if (pinMsg()) {
              <p [class.err]="pinMsg()?.error" class="row-msg">{{ pinMsg()?.text }}</p>
            }
          </section>
        }

        <!-- Change PIN modal -->
        @if (changePinOpen()) {
          <app-modal [open]="true" [title]="hasPin() ? 'Change PIN' : 'Set PIN'" (closed)="changePinOpen.set(false)">
            <form class="pin-form" (ngSubmit)="doChangePin()">
              @if (hasPin()) {
                <label>Current PIN
                  <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="changeForm.currentPin" name="cpin" />
                </label>
              }
              <label>New PIN
                <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="changeForm.newPin" name="npin" />
              </label>
              <label>Confirm new PIN
                <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="changeForm.confirmPin" name="cpin2" />
              </label>
              @if (changePinError()) { <p class="err">{{ changePinError() }}</p> }
              <div class="modal-actions">
                <button type="button" class="btn-ghost" (click)="changePinOpen.set(false)">Cancel</button>
                <button type="submit" class="btn-primary" [disabled]="changingPin()">{{ changingPin() ? 'Saving…' : 'Save' }}</button>
              </div>
            </form>
          </app-modal>
        }

        <!-- Verify PIN modal -->
        @if (verifyPinOpen()) {
          <app-modal [open]="true" title="Verify PIN" (closed)="verifyPinOpen.set(false)">
            <form class="pin-form" (ngSubmit)="doVerifyPin()">
              <label>Enter your PIN
                <input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="verifyForm.pin" name="vpin" />
              </label>
              @if (verifyResult() !== null) {
                <p [class.err]="!verifyResult()">{{ verifyResult() ? 'PIN verified' : 'Incorrect PIN' }}</p>
              }
              <div class="modal-actions">
                <button type="button" class="btn-ghost" (click)="verifyPinOpen.set(false)">Close</button>
                <button type="submit" class="btn-primary">Verify</button>
              </div>
            </form>
          </app-modal>
        }

        <!-- ── 6. Money (read-only) ─────────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Money</h2>

          @if (feeBreakdown()) {
            <h3>Platform Fee Breakdown</h3>
            <p class="muted small">We charge {{ feeBreakdown()?.totalRate }}% on every completed booking.</p>
            <div class="fee-table">
              @for (item of feeBreakdown()?.breakdown; track item.label) {
                <div class="fee-row">
                  <span>{{ item.label }}</span>
                  <span>{{ item.percent }}%</span>
                </div>
              }
              <div class="fee-row total">
                <span>Total</span>
                <span>{{ feeBreakdown()?.totalRate }}%</span>
              </div>
            </div>
          }

          <h3>Penalties</h3>
          <app-list-toolbar>
            <input class="search" [(ngModel)]="penaltySearch" name="penSearch" placeholder="Search by type…" toolbar-search />
            <div class="chips" toolbar-filters>
              <button class="chip" [class.on]="penaltyFilter() === 'all'" (click)="penaltyFilter.set('all')">All</button>
              <button class="chip" [class.on]="penaltyFilter() === 'active'" (click)="penaltyFilter.set('active')">Active</button>
              <button class="chip" [class.on]="penaltyFilter() === 'appealed'" (click)="penaltyFilter.set('appealed')">Appealed</button>
              <button class="chip" [class.on]="penaltyFilter() === 'resolved'" (click)="penaltyFilter.set('resolved')">Resolved</button>
            </div>
            <select [(ngModel)]="penaltySort" name="penSort" toolbar-sort>
              <option value="recent">Most recent</option>
              <option value="amount">Highest amount</option>
            </select>
          </app-list-toolbar>
          @if (loadingPenalties()) {
            <p class="muted">Loading penalties…</p>
          } @else if (penalties().length === 0) {
            <p class="muted">No penalties on record.</p>
          } @else {
            <table class="penalties-table">
              <thead>
                <tr><th>Type</th><th>Amount</th><th>Date</th><th>Status</th><th>Appeal</th></tr>
              </thead>
              <tbody>
                @for (pen of penaltiesDisplay(); track pen.id) {
                  <tr>
                    <td>{{ formatType(pen.type) }}</td>
                    <td class="amount">RM {{ pen.amountDeducted | number: "1.2-2" }}</td>
                    <td class="muted">{{ pen.createdAt | date: "mediumDate" }}</td>
                    <td><span class="badge" [attr.data-status]="pen.status">{{ pen.status }}</span></td>
                    <td>
                      @if (pen.appealStatus) {
                        <span class="badge" [attr.data-status]="pen.appealStatus">Appeal: {{ pen.appealStatus }}</span>
                      } @else {
                        <button class="btn-ghost small-btn" (click)="fileAppeal(pen)">Appeal</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        <!-- ── 7. Danger Zone ──────────────────────────────────────────────── -->
        <section class="card page-child danger-zone">
          <h2>Danger Zone</h2>
          <p class="muted">Permanently deactivate your account. This action cannot be undone.</p>
          <button class="btn-danger" (click)="deactivateStep.set(1)">Deactivate my account</button>
        </section>

        <!-- Deactivate modals -->
        <app-modal [open]="deactivateStep() === 1" title="Deactivate your account?" (closed)="deactivateStep.set(0)">
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
          <label>Enter your PIN to confirm <span class="err">*</span><input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="deactivatePin" name="dpass" required /></label>
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
      }
    }
  `,
    styles: [`
      :host { display: block; max-width: 720px; width: 100%; }
      section { margin-bottom: 1.4rem; transition: box-shadow var(--transition), transform var(--transition); }
      section:hover { box-shadow: 0 4px 16px rgba(0, 0, 0, 0.07); transform: translateY(-1px); }
      h2 { margin-top: 0; font-size: 1.05rem; }
      h3 { font-size: 0.95rem; margin-top: 1.2rem; margin-bottom: 0.5rem; }
      .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; }
      .logo-row { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
      .logo-img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border); }
      .logo-placeholder { width: 64px; height: 64px; border-radius: 50%; background: var(--color-primary); color: #fff; font-size: 1.6rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
      .logo-actions { display: flex; flex-direction: column; gap: 0.4rem; }
      .file-hidden { display: none; }
      .file-label { cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.85rem; }
      .form { display: flex; flex-direction: column; gap: 0.8rem; }
      label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.9rem; font-weight: 500; }
      .row { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 0.7rem; }
      .two-col { grid-template-columns: 1fr 1fr; }
      .form-actions { margin-top: 0.3rem; }
      .preview { padding: 0.5rem 0.7rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius); }
      .checkbox-row { flex-direction: row; align-items: center; gap: 0.5rem; font-weight: 400; }
      .checkbox-row input { width: auto; }
      .err { color: var(--color-danger); font-size: 0.88rem; }
      .success-msg { color: var(--color-success); font-size: 0.85rem; font-weight: 500; }
      .small { font-size: 0.82rem; }
      .req { color: var(--color-danger); }
      .tag { font-size: 0.7rem; background: var(--color-primary-light); color: var(--color-primary-dark); padding: 0.1rem 0.45rem; border-radius: 999px; margin-left: 0.4rem; }
      .static-field { display: block; padding: 0.55rem 0; font-size: 0.95rem; color: var(--color-text); }
      .badge-green { color: var(--color-success); font-weight: 600; }
      .badge-yellow { color: var(--color-warning); font-weight: 600; }
      .badge-red { color: var(--color-danger); font-weight: 600; }
      .muted { color: var(--color-muted); }

      /* Contacts */
      .contact-row { display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.5rem; margin: 0 -0.5rem; border-bottom: 1px solid var(--color-border); border-radius: var(--radius); transition: background 0.12s ease; }
      .contact-row:hover { background: var(--color-surface); }
      .contact-info { flex: 1; }
      .contact-actions { display: flex; gap: 0.3rem; flex-shrink: 0; }
      .inline-check { flex-direction: row; align-items: center; gap: 0.3rem; font-weight: 400; font-size: 0.8rem; }
      .inline-check input { width: auto; }
      .btn-remove { color: var(--color-danger); }
      .small-btn { font-size: 0.8rem; padding: 0.15rem 0.6rem; }

      /* Service areas */
      .sa-section { display: flex; flex-direction: column; gap: 0.5rem; }
      .sa-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; }
      .sa-chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.2rem 0.5rem; background: var(--color-primary-light); color: var(--color-primary-dark); border-radius: 999px; font-size: 0.8rem; font-weight: 500; }
      .sa-remove { background: none; border: none; color: inherit; font-size: 1rem; line-height: 1; cursor: pointer; padding: 0; opacity: 0.6; transition: opacity 0.12s ease; }
      .sa-remove:hover { opacity: 1; }

      /* Operating hours - CRUD list + form */
      .oh-list { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.3rem; }
      .oh-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0; border-bottom: 1px solid var(--color-border); font-size: 0.88rem; }
      .oh-days { font-weight: 600; min-width: 80px; }
      .oh-times { font-family: monospace; }
      .oh-rest { color: var(--color-muted); font-size: 0.82rem; }
      .oh-form { border: 1px solid var(--color-primary); border-radius: var(--radius); padding: 0.8rem; margin-bottom: 0.5rem; background: var(--color-bg); display: flex; flex-direction: column; gap: 0.6rem; }
      .oh-days-pick { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
      .oh-day-check { flex-direction: row; align-items: center; gap: 0.2rem; font-size: 0.82rem; font-weight: 400; cursor: pointer; }
      .oh-day-check input { width: auto; }
      .oh-form-row { display: flex; align-items: center; gap: 0.5rem; }
      .oh-form-row .time-input { width: 80px; padding: 0.4rem 0.5rem; font-family: monospace; font-size: 0.85rem; }
      .oh-rest-select { width: 110px; }
      .oh-form-actions { display: flex; gap: 0.5rem; }
      .oh-add { font-size: 0.85rem; }

      /* Tax calculator */
      .tax-calc { border: 1px solid var(--color-border); border-radius: var(--radius); padding: 0.8rem; margin-top: 0.5rem; background: var(--color-bg); }
      .tax-breakdown { margin-top: 0.5rem; }
      .tax-row { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.85rem; }
      .tax-row.total { font-weight: 700; border-top: 1px solid var(--color-border); margin-top: 0.2rem; padding-top: 0.4rem; }

      /* Penalties */
      .penalties-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
      .penalties-table th, .penalties-table td { text-align: left; padding: 0.5rem 0.4rem; border-bottom: 1px solid var(--color-border); }
      .penalties-table tbody tr:hover { background: var(--color-surface); }
      .penalties-table .amount { font-weight: 600; color: var(--color-danger); }

      /* Fee breakdown */
      .fee-table { max-width: 360px; margin: 0.5rem 0 1rem 0; }
      .fee-row { display: flex; justify-content: space-between; padding: 0.4rem 0; border-bottom: 1px solid var(--color-border); font-size: 0.88rem; }
      .fee-row.total { font-weight: 700; border-bottom: none; border-top: 2px solid var(--color-text); margin-top: 0.3rem; padding-top: 0.5rem; }

      /* Identity */
      .id-note { font-size: 0.8rem; color: var(--color-accent); font-weight: 500; padding: 0.4rem 0.6rem; background: var(--color-accent-light, #fef9e7); border-radius: var(--radius); margin: 0; }
      .id-banner-inline { margin-top: 0.5rem; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius); }
      .id-req-inline { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.3rem; }

      /* Toggle */
      .toggle-row { flex-direction: row !important; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.4rem 0; }
      .toggle-row span { display: flex; flex-direction: column; gap: 0.15rem; }
      .toggle { width: 2.6rem; height: 1.5rem; appearance: none; background: var(--color-border); border-radius: 999px; cursor: pointer; position: relative; transition: background var(--transition-fast); flex-shrink: 0; }
      .toggle::after { content: ""; position: absolute; top: 2px; left: 2px; width: calc(1.5rem - 4px); height: calc(1.5rem - 4px); background: #fff; border-radius: 50%; transition: transform var(--transition-fast); }
      .toggle:checked { background: var(--color-primary); }
      .toggle:checked::after { transform: translateX(1.1rem); }

      /* PIN */
      .pin-status { margin-bottom: 0.5rem; }
      .pin-form { display: flex; flex-direction: column; gap: 0.6rem; }
      .pin-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.88rem; font-weight: 500; }
      .pin-form input { max-width: 180px; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
      .btn-row { display: flex; gap: 0.5rem; margin-top: 0.3rem; }
      .row-msg { margin-top: 0.4rem; font-size: 0.88rem; }

      /* Danger */
      .danger-zone { border: 1px solid var(--color-danger, #dc2626); }
      .danger-zone h2 { color: var(--color-danger); }
      .btn-danger { background: var(--color-danger, #dc2626); color: #fff; border: none; padding: 0.5rem 1rem; border-radius: var(--radius); cursor: pointer; font-size: 0.88rem; font-weight: 600; font-family: inherit; transition: opacity 0.15s ease; }
      .btn-danger:hover { opacity: 0.85; }
      .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }

      /* Badges */
      .badge[data-status="deducted"] { background: var(--color-status-cancelled-bg); color: var(--color-status-cancelled-text); }
      .badge[data-status="pending"], .badge[data-status="under_review"] { background: var(--color-status-progress-bg); color: var(--color-status-progress-text); }
      .badge[data-status="approved"] { background: var(--color-status-completed-bg); color: var(--color-status-completed-text); }
      .badge[data-status="rejected"] { background: var(--color-status-cancelled-bg); color: var(--color-status-cancelled-text); }

      /* Modals */
      .deactivate-list { margin: 0 0 0.7rem; padding-left: 1.2rem; }
      .deactivate-list li { margin-bottom: 0.3rem; font-size: 0.9rem; }

      /* Toolbar */
      .toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; }
      .search { min-width: 180px; max-width: 260px; border-radius: 999px; padding: 0.45rem 0.85rem; border: 1px solid var(--color-border); background: var(--color-surface); font-size: 0.88rem; outline: none; }
      .search:focus { border-color: var(--color-primary); }
      select { border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); padding: 0.4rem 0.6rem; font-size: 0.85rem; outline: none; cursor: pointer; }
      .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
      .chip { background: transparent; border: 1px solid var(--color-border); border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.82rem; cursor: pointer; color: var(--color-muted); transition: background var(--transition), color var(--transition), border-color var(--transition); }
      .chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
    `]
})
export class ServicerAccountComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  private auth = inject(AuthService);
  private router = inject(Router);

  @ViewChild("logoInput") logoInputRef?: ElementRef<HTMLInputElement>;

  weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  dayLabels: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

  profile = signal<ServicerProfile | null>(null);
  profileFailed = signal(false);
  loading = signal(true);
  profileError = signal("");

  // ── Form fields ──
  f = {
    businessName: "",
    bio: "",
    serviceAreaList: [] as string[],
    serviceRadiusKm: 10,
    invoicePrefix: "INV",
    invoiceContent: "",
    invoiceSuffix: "",
    invoiceYearFormat: "YYYY",
    invoiceSeparator: "-",
    invoicePadding: 4,
    businessEntityType: "",
    businessRegNumber: "",
    taxNumber: "",
  };
  newAreaInput = "";
  identityFieldsDirty = signal(false);

  // ── Profile save ──
  savingProfile = signal(false);
  logoUploading = signal(false);
  logoUploadStatus = signal("");
  logoError = signal("");

  // ── Contacts ──
  contacts = signal<ServicerContact[]>([]);
  contactsLoading = signal(true);
  contactModalOpen = signal(false);
  editingContact = signal<ServicerContact | null>(null);
  savingContact = signal(false);
  contactError = signal("");
  cf = { contactPerson: "", number: "", email: "", isPrimary: false, visibleToCustomer: true };

  // ── Identity change ──
  savingIdentity = signal(false);
  identitySavingError = signal("");

  // ── Tax ──
  savingTax = signal(false);
  taxSavingError = signal("");
  taxTryAmount = signal<number>(0);
  sstRate = signal<number>(6);
  sstRegistered = signal(false);
  sstNumber = signal('');
  serviceChargeRate = signal<number | null>(null);
  taxInclusive = signal(false);

  derivedIsCompany = computed(() => {
    return this.f.businessEntityType && this.f.businessEntityType !== 'sole_proprietorship';
  });

  taxSubtotal = computed(() => {
    const amt = this.taxTryAmount() || 0;
    if (this.taxInclusive()) {
      const scRate = (this.serviceChargeRate() ?? 0) / 100;
      const sr = this.sstRegistered() ? this.sstRate() / 100 : 0;
      return amt / (1 + scRate + sr);
    }
    return amt;
  });

  taxSC = computed(() => {
    const scRate = (this.serviceChargeRate() ?? 0) / 100;
    return this.taxSubtotal() * scRate;
  });

  taxSST = computed(() => {
    if (!this.sstRegistered()) return 0;
    const sr = this.sstRate() / 100;
    return this.taxSubtotal() * sr;
  });

  taxTotal = computed(() => {
    return this.taxSubtotal() + this.taxSC() + this.taxSST();
  });

  // ── Penalties ──
  penalties = signal<Penalty[]>([]);
  penaltySearch = signal('');
  penaltyFilter = signal<'all' | 'active' | 'appealed' | 'resolved'>('all');
  penaltySort = signal<'recent' | 'amount'>('recent');
  loadingPenalties = signal(true);
  penaltiesDisplay = computed(() => {
    let list = this.penalties();
    const q = this.penaltySearch().toLowerCase().trim();
    if (q) list = list.filter(p => p.type.toLowerCase().includes(q));
    const f = this.penaltyFilter();
    if (f === 'active') list = list.filter(p => p.status !== 'reversed' && !p.appealStatus);
    if (f === 'appealed') list = list.filter(p => !!p.appealStatus && p.appealStatus === 'pending');
    if (f === 'resolved') list = list.filter(p => !!p.appealStatus && p.appealStatus !== 'pending');
    const s = this.penaltySort();
    if (s === 'recent') list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (s === 'amount') list = [...list].sort((a, b) => b.amountDeducted - a.amountDeducted);
    return list;
  });

  // ── Fee breakdown ──
  feeBreakdown = signal<FeeBreakdown | null>(null);

  // ── PIN ──
  pinSectionVisible = signal(true);
  hasPin = signal(false);
  pinMsg = signal<{ text: string; error: boolean } | null>(null);
  changePinOpen = signal(false);
  changeForm = { currentPin: '', newPin: '', confirmPin: '' };
  changePinError = signal('');
  changingPin = signal(false);
  verifyPinOpen = signal(false);
  verifyForm = { pin: '' };
  verifyResult = signal<boolean | null>(null);

  // ── Deactivate ──
  deactivateStep = signal(0);
  deactivateReason = signal('');
  deactivatePin = signal('');
  deactivateConfirm = signal('');
  deactivateError = signal<string | null>(null);
  deactivating = signal(false);

  // ── Operating hours - CRUD with multi-day pick + rest break ──
  ohEntries = signal<{ _key: number; days: string[]; open: string; close: string; restOpen: string; restClose: string }[]>([]);
  private _ohKey = 0;
  ohFormOpen = signal(false);
  ohFormEditing = signal<number | null>(null); // index being edited, null = new
  ohForm = { days: [] as string[], open: '', close: '', restOpen: '', restClose: '' };
  ohFormError = signal('');

  openOhForm(): void {
    this.ohForm = { days: [], open: '', close: '', restOpen: '', restClose: '' };
    this.ohFormError.set('');
    this.ohFormEditing.set(null);
    this.ohFormOpen.set(true);
  }

  editOhEntry(i: number): void {
    const e = this.ohEntries()[i];
    this.ohForm = { days: [...e.days], open: e.open, close: e.close, restOpen: e.restOpen, restClose: e.restClose };
    this.ohFormError.set('');
    this.ohFormEditing.set(i);
    this.ohFormOpen.set(true);
  }

  cancelOhForm(): void { this.ohFormOpen.set(false); }

  toggleOhDay(day: string): void {
    this.ohForm.days = this.ohForm.days.includes(day)
      ? this.ohForm.days.filter(d => d !== day)
      : [...this.ohForm.days, day];
  }

  formatOhFormTime(slot: 'open' | 'close' | 'restOpen' | 'restClose', raw: string): void {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (!digits) { this.ohForm[slot] = ''; return; }
    let formatted = '';
    if (digits.length <= 2) {
      const h = parseInt(digits, 10); if (h > 23) return;
      formatted = String(h).padStart(2, '0') + ':00';
    } else {
      const h = parseInt(digits.slice(0, 2), 10); if (h > 23) return;
      const m = Math.min(parseInt(digits.slice(2, 4), 10), 59);
      formatted = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    }
    this.ohForm[slot] = formatted;
  }

  confirmOhEntry(): void {
    if (this.ohForm.days.length === 0) { this.ohFormError.set('Pick at least one day.'); return; }
    if (!this.ohForm.open || !this.isValidTime(this.ohForm.open)) { this.ohFormError.set('Enter a valid open time (HH:MM).'); return; }
    if (!this.ohForm.close || !this.isValidTime(this.ohForm.close)) { this.ohFormError.set('Enter a valid close time (HH:MM).'); return; }
    const editing = this.ohFormEditing();
    if (editing !== null) {
      this.ohEntries.update(list => list.map((e, i) => i === editing
        ? { ...e, days: [...this.ohForm.days].sort(), open: this.ohForm.open.trim(), close: this.ohForm.close.trim(), restOpen: this.ohForm.restOpen.trim(), restClose: this.ohForm.restClose.trim() }
        : e));
    } else {
      this.ohEntries.update(list => [...list, {
        _key: ++this._ohKey,
        days: [...this.ohForm.days].sort(),
        open: this.ohForm.open.trim(),
        close: this.ohForm.close.trim(),
        restOpen: this.ohForm.restOpen.trim(),
        restClose: this.ohForm.restClose.trim(),
      }]);
    }
    this.ohFormOpen.set(false);
  }

  removeOhEntry(i: number): void {
    this.ohEntries.update(list => list.filter((_, idx) => idx !== i));
  }

  ngOnInit(): void {
    this.api.get<ServicerProfile>("/servicer/me").subscribe({
      next: (p) => {
        this.profile.set(p);
        this.f.businessName = p.businessName ?? "";
        this.f.bio = p.bio ?? "";
        this.f.serviceAreaList = p.serviceAreas ?? [];
        this.f.serviceRadiusKm = p.serviceRadiusKm ?? 10;
        this.f.invoicePrefix = p.invoicePrefix ?? "INV";
        this.f.invoiceYearFormat = p.invoiceYearFormat ?? "YYYY";
        this.f.invoiceSeparator = p.invoiceSeparator ?? "-";
        this.f.invoicePadding = p.invoicePadding ?? 4;
        this.f.invoiceContent = p.invoiceContent ?? "";
        this.f.invoiceSuffix = p.invoiceSuffix ?? "";
        this.f.businessEntityType = p.entityType ?? "";
        this.f.businessRegNumber = p.businessRegistrationNumber ?? "";
        this.f.taxNumber = p.taxNumber ?? "";
        this.sstRegistered.set(p.sstRegistered ?? false);
        this.sstNumber.set(p.sstNumber ?? "");
        this.serviceChargeRate.set(p.serviceChargeRate ?? null);
        this.taxInclusive.set(p.taxInclusive ?? false);
        this.contacts.set(p.contacts ?? []);
        this.contactsLoading.set(false);
        this.loading.set(false);
        if (p.operatingHours) {
          const oh = p.operatingHours as Record<string, { open?: string; close?: string }>;
          const entries: { _key: number; days: string[]; open: string; close: string; restOpen: string; restClose: string }[] = [];
          for (const day of this.weekdays) {
            if (oh[day]?.open && oh[day]?.close) {
              entries.push({ _key: ++this._ohKey, days: [day], open: oh[day].open!, close: oh[day].close!, restOpen: '', restClose: '' });
            }
          }
          if (entries.length > 0) this.ohEntries.set(entries);
        }
      },
      error: () => { this.loading.set(false); this.profileFailed.set(true); },
    });

    this.api.get<{ data: Penalty[] }>("/servicer/me/penalties").subscribe({
      next: (r) => { this.penalties.set(r.data ?? []); this.loadingPenalties.set(false); },
      error: () => this.loadingPenalties.set(false),
    });

    this.api.get<FeeBreakdown>("/servicer/me/fee-breakdown").subscribe({
      next: (r) => this.feeBreakdown.set(r),
      error: () => {},
    });

    this.loadPinStatus();
  }

  /** Compact day range: "Mon, Wed-Fri" */
  formatOhDays(days: string[]): string {
    if (!days.length) return '';
    const sorted = [...days].sort((a, b) => this.weekdays.indexOf(a) - this.weekdays.indexOf(b));
    const parts: string[] = [];
    let start = 0;
    for (let i = 1; i <= sorted.length; i++) {
      const prevIdx = this.weekdays.indexOf(sorted[i - 1]);
      const currIdx = i < sorted.length ? this.weekdays.indexOf(sorted[i]) : -1;
      if (currIdx !== prevIdx + 1) {
        if (start === i - 1) parts.push(this.dayLabels[sorted[start]]);
        else parts.push(this.dayLabels[sorted[start]].slice(0, 3) + '-' + this.dayLabels[sorted[i - 1]].slice(0, 3));
        start = i;
      }
    }
    return parts.join(', ');
  }

  isValidTime(val: string): boolean {
    if (!val) return true;
    return /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(val.trim());
  }

  onSstToggled(): void { if (!this.sstRegistered()) this.sstNumber.set(''); }

  // ── Service areas ──
  onServiceAreaSelect(place: PlaceResult): void {
    const area = place.city || place.state || place.address;
    if (!area || this.f.serviceAreaList.includes(area)) return;
    this.f.serviceAreaList = [...this.f.serviceAreaList, area];
    this.newAreaInput = "";
  }

  removeServiceArea(index: number): void {
    this.f.serviceAreaList = this.f.serviceAreaList.filter((_, i) => i !== index);
  }

  requestCategoryChange(): void {
    this.dialog.prompt("Enter the new category name or ID to request an admin review.", {
      placeholder: "e.g. plumbing", confirmLabel: "Submit request",
    }).subscribe((val) => {
      if (!val) return;
      this.api.post("/servicer/me/identity-change-request", { proposed: { categoryId: val } }).subscribe({
        next: () => this.toast.success("Category change request submitted."),
        error: (e) => this.toast.error(e.message ?? "Request failed"),
      });
    });
  }

  // ── Invoice preview ──
  invoicePreview(): string {
    const prefix = this.f.invoicePrefix || "INV";
    const content = this.f.invoiceContent || "";
    const suffix = this.f.invoiceSuffix || "";
    const sep = this.f.invoiceSeparator || "-";
    const year = this.f.invoiceYearFormat === "YYYY" ? new Date().getFullYear().toString()
      : this.f.invoiceYearFormat === "YY" ? new Date().getFullYear().toString().slice(2) : null;
    const num = String(42).padStart(Number(this.f.invoicePadding) || 4, "0");
    return year ? `${prefix}${content}${sep}${year}${sep}${num}${suffix}` : `${prefix}${content}${sep}${num}${suffix}`;
  }

  // ── Contacts CRUD ──
  openContactForm(c?: ServicerContact): void {
    this.contactError.set("");
    this.editingContact.set(c ?? null);
    if (c) {
      this.cf = { contactPerson: c.contactPerson, number: c.number ?? "", email: c.email ?? "", isPrimary: c.isPrimary, visibleToCustomer: c.visibleToCustomer };
    } else {
      this.cf = { contactPerson: "", number: "", email: "", isPrimary: this.contacts().length === 0, visibleToCustomer: true };
    }
    this.contactModalOpen.set(true);
  }

  saveContact(): void {
    if (!this.cf.contactPerson.trim()) { this.contactError.set("Contact person name is required."); return; }
    if (!this.cf.number.trim() && !this.cf.email.trim()) { this.contactError.set("At least one of phone or email is required."); return; }
    this.savingContact.set(true);
    this.contactError.set("");
    const body: Record<string, unknown> = {
      contactPerson: this.cf.contactPerson.trim(),
      number: this.cf.number.trim() || undefined,
      email: this.cf.email.trim() || undefined,
      isPrimary: this.cf.isPrimary,
      visibleToCustomer: this.cf.visibleToCustomer,
    };
    const existing = this.editingContact();
    const req = existing
      ? this.api.patch<ServicerContact>(`/servicer/contacts/${existing.id}`, body)
      : this.api.post<ServicerContact>("/servicer/contacts", body);
    req.subscribe({
      next: (saved) => {
        this.savingContact.set(false);
        this.contactModalOpen.set(false);
        this.toast.success("Contact saved.");
        this.loadContacts();
      },
      error: (e) => {
        this.savingContact.set(false);
        this.contactError.set(e.message ?? "Could not save contact");
      },
    });
  }

  setPrimaryContact(c: ServicerContact): void {
    this.api.patch(`/servicer/contacts/${c.id}`, { isPrimary: true }).subscribe({
      next: () => { this.toast.success("Primary contact updated."); this.loadContacts(); },
      error: (e) => this.toast.error(e.message ?? "Could not update primary"),
    });
  }

  toggleContactVisibility(c: ServicerContact, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.api.patch(`/servicer/contacts/${c.id}`, { visibleToCustomer: checked }).subscribe({
      next: () => {
        this.contacts.update(list => list.map(x => x.id === c.id ? { ...x, visibleToCustomer: checked } : x));
      },
      error: (e) => this.toast.error(e.message ?? "Could not update visibility"),
    });
  }

  deleteContact(c: ServicerContact): void {
    this.dialog.confirm(`Delete the contact "${c.contactPerson}"?`, { confirmLabel: "Delete" }).subscribe((ok) => {
      if (!ok) return;
      this.api.delete(`/servicer/contacts/${c.id}`).subscribe({
        next: () => { this.toast.success("Contact deleted."); this.loadContacts(); },
        error: (e) => this.toast.error(e.message ?? "Could not delete contact"),
      });
    });
  }

  private loadContacts(): void {
    this.api.get<{ data: ServicerContact[] }>("/servicer/contacts").subscribe({
      next: (r) => { this.contacts.set(r.data ?? []); this.contactsLoading.set(false); },
      error: () => this.contactsLoading.set(false),
    });
  }

  // ── Logo upload ──
  onLogoFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.logoError.set("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { this.logoError.set("Logo must be under 5 MB."); input.value = ""; return; }
    this.logoUploading.set(true);
    this.logoUploadStatus.set("Uploading…");
    this.api.post<{ uploadUrl: string; fileId: string }>("/files/presign", {
      purpose: "servicer_logo", mimeType: file.type || "image/jpeg", sizeBytes: file.size,
    }).pipe(
      switchMap(({ uploadUrl, fileId }) =>
        this.http.put(uploadUrl, file, { headers: { "Content-Type": file.type || "image/jpeg" } })
          .pipe(switchMap(() => this.api.post<{ fileUrl: string }>(`/files/${fileId}/confirm`, {})))
      ),
      switchMap(({ fileUrl }) => this.api.patch<ServicerProfile>("/servicer/me", { logoUrl: fileUrl })),
    ).subscribe({
      next: (updated) => {
        this.profile.update((p) => p ? { ...p, logoUrl: updated.logoUrl } : p);
        this.logoUploading.set(false);
        this.toast.success("Logo updated.");
        if (this.logoInputRef) this.logoInputRef.nativeElement.value = "";
      },
      error: (e) => { this.logoUploading.set(false); this.logoError.set(e.message ?? "Upload failed."); },
    });
  }

  // ── Penalties ──
  formatType(type: string): string { return type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }

  fileAppeal(pen: Penalty): void {
    this.dialog.prompt(`Reason for appealing the ${this.formatType(pen.type)} penalty?`, {
      placeholder: "Describe the circumstances…", confirmLabel: "Submit appeal", multiline: true,
    }).subscribe((reason) => {
      if (!reason) return;
      this.api.post(`/servicer/me/penalties/${pen.id}/appeal`, { reason }).subscribe({
        next: () => {
          this.toast.success("Appeal submitted.");
          this.penalties.update(list => list.map(p => p.id === pen.id ? { ...p, appealStatus: "pending" } : p));
        },
        error: (e) => this.toast.error(e.message ?? "Could not submit appeal"),
      });
    });
  }

  // ── Save methods (restored) ──
  saveTaxConfig(): void {
    this.taxSavingError.set("");
    this.savingTax.set(true);
    const body: Record<string, unknown> = {
      sstRegistered: this.sstRegistered(),
      serviceChargeRate: this.serviceChargeRate() ?? 0,
      taxInclusive: this.taxInclusive(),
    };
    if (this.sstRegistered() && this.sstNumber()) body['sstNumber'] = this.sstNumber();
    this.api.patch<ServicerProfile>("/servicer/me", body).subscribe({
      next: (updated) => {
        this.profile.update((p) => p ? { ...p, ...updated } : p);
        this.savingTax.set(false);
        this.toast.success("Tax settings saved.");
      },
      error: (e) => {
        this.savingTax.set(false);
        this.taxSavingError.set(e.message ?? "Could not save tax settings");
      },
    });
  }

  saveBusinessDetails(): void {
    this.identitySavingError.set("");
    this.savingIdentity.set(true);
    const proposed: Record<string, unknown> = {};
    if (this.f.businessEntityType) proposed['entityType'] = this.f.businessEntityType;
    if (this.f.businessRegNumber) proposed['businessRegistrationNumber'] = this.f.businessRegNumber;
    if (this.f.taxNumber) proposed['taxNumber'] = this.f.taxNumber;
    this.api.post<IdentityChangeRequest>("/servicer/me/identity-change-request", { proposed }).subscribe({
      next: (req) => {
        const p = this.profile();
        if (p) {
          const existing = p.identityChangeRequests ?? [];
          this.profile.set({ ...p, identityChangeRequests: [...existing, req] });
        }
        this.identityFieldsDirty.set(false);
        this.savingIdentity.set(false);
        this.toast.success("Identity change request submitted for admin review.");
      },
      error: (e) => {
        this.savingIdentity.set(false);
        this.identitySavingError.set(e.message ?? "Could not submit request");
      },
    });
  }

  saveInvoiceSettings(): void {
    this.savingProfile.set(true);
    this.profileError.set("");
    this.api.patch<ServicerProfile>("/servicer/me", {
      invoicePrefix: this.f.invoicePrefix || undefined,
      invoiceContent: this.f.invoiceContent || undefined,
      invoiceSuffix: this.f.invoiceSuffix || undefined,
      invoiceYearFormat: this.f.invoiceYearFormat || undefined,
      invoiceSeparator: this.f.invoiceSeparator || undefined,
      invoicePadding: this.f.invoicePadding ?? undefined,
    }).subscribe({
      next: (updated) => {
        this.profile.update((p) => p ? { ...p, ...updated } : p);
        this.savingProfile.set(false);
        this.toast.success("Invoice settings saved.");
      },
      error: (e) => {
        this.savingProfile.set(false);
        this.profileError.set(e.message ?? "Could not save invoice settings");
      },
    });
  }

  saveProfile(): void {
    this.savingProfile.set(true);
    this.profileError.set("");
    this.api.patch<ServicerProfile>("/servicer/me", {
      businessName: this.f.businessName || undefined,
      bio: this.f.bio || undefined,
    }).subscribe({
      next: (updated) => {
        this.profile.update((p) => p ? { ...p, ...updated } : p);
        this.savingProfile.set(false);
        this.toast.success("Business identity saved.");
      },
      error: (e) => {
        this.savingProfile.set(false);
        this.profileError.set(e.message ?? "Could not save profile");
      },
    });
  }

  saveServices(): void {
    this.savingProfile.set(true);
    this.profileError.set("");
    const serviceAreas = this.f.serviceAreaList.map(s => s.trim()).filter(Boolean);

    for (const entry of this.ohEntries()) {
      if (!this.isValidTime(entry.open)) { this.profileError.set(`Invalid open time "${entry.open}": use HH:MM (24h)`); this.savingProfile.set(false); return; }
      if (!this.isValidTime(entry.close)) { this.profileError.set(`Invalid close time "${entry.close}": use HH:MM (24h)`); this.savingProfile.set(false); return; }
    }

    const oh: Record<string, { open: string; close: string }> = {};
    for (const entry of this.ohEntries()) {
      for (const day of entry.days) {
        if (!oh[day]) oh[day] = { open: entry.open.trim(), close: entry.close.trim() };
      }
    }
    this.api.patch<ServicerProfile>("/servicer/me", {
      serviceAreas: serviceAreas.length ? serviceAreas : undefined,
      serviceRadiusKm: this.f.serviceRadiusKm ?? undefined,
      operatingHours: Object.keys(oh).length > 0 ? oh : [],
    }).subscribe({
      next: (updated) => {
        this.profile.update((p) => p ? { ...p, ...updated } : p);
        this.savingProfile.set(false);
        this.toast.success("Services saved.");
      },
      error: (e) => {
        this.savingProfile.set(false);
        this.profileError.set(e.message ?? "Could not save services");
      },
    });
  }

  // ── PIN ──
  private loadPinStatus(): void {
    this.api.get<{ hasPin: boolean }>('/servicer/account/pin-status').subscribe({
      next: (r) => this.hasPin.set(r.hasPin), error: () => {},
    });
  }

  openChangePin(): void { this.changeForm = { currentPin: '', newPin: '', confirmPin: '' }; this.changePinError.set(''); this.changePinOpen.set(true); }
  doChangePin(): void {
    const { currentPin, newPin, confirmPin } = this.changeForm;
    if (!newPin || (this.hasPin() && !currentPin)) { this.changePinError.set('All fields required.'); return; }
    if (newPin !== confirmPin) { this.changePinError.set('New PINs do not match.'); return; }
    this.changingPin.set(true); this.changePinError.set('');
    const body = this.hasPin() ? { currentPin, newPin } : { newPin };
    this.api.put('/servicer/account/pin', body).subscribe({
      next: () => { this.changingPin.set(false); this.changePinOpen.set(false); this.hasPin.set(true); this.pinMsg.set({ text: 'PIN changed.', error: false }); },
      error: (e) => { this.changingPin.set(false); this.changePinError.set(e.message ?? 'Could not change PIN'); },
    });
  }

  openVerifyPin(): void { this.verifyForm = { pin: '' }; this.verifyResult.set(null); this.verifyPinOpen.set(true); }
  doVerifyPin(): void {
    if (!this.verifyForm.pin) return;
    this.api.post<{ ok: boolean }>('/servicer/account/verify-pin', { pin: this.verifyForm.pin }).subscribe({
      next: (r) => this.verifyResult.set(r.ok), error: () => this.verifyResult.set(false),
    });
  }

  // ── Deactivate ──
  deactivateStep2Continue(): void {
    this.deactivateError.set(null);
    if (!this.deactivateReason().trim()) {
      this.deactivateError.set('Please enter a reason.');
      return;
    }
    if (!this.deactivatePin()) {
      this.deactivateError.set('Please enter your PIN.');
      return;
    }
    if (this.deactivatePin().length !== 6) {
      this.deactivateError.set('PIN must be 6 digits.');
      return;
    }
    this.deactivateStep.set(3);
  }

  doDeactivate(): void {
    this.deactivateError.set(null);
    if (this.deactivateConfirm() !== 'DELETE') { this.deactivateError.set('Type DELETE to confirm.'); return; }
    this.deactivating.set(true);
    this.api.post('/servicer/me/deactivate', { reason: this.deactivateReason(), pin: this.deactivatePin() })
      .pipe(finalize(() => this.deactivating.set(false)))
      .subscribe({
        next: () => { this.auth.logout(); this.router.navigate([routeFor('home')]); this.toast.success('Account deactivated.'); },
        error: (e) => { this.deactivateError.set(e.error?.message ?? e.message ?? 'Could not deactivate account'); },
      });
  }
}
