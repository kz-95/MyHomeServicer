import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  inject,
  signal,
  computed,
} from "@angular/core";
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
 * 1. Business Identity  — businessName, logo, bio + Business Contacts CRUD
 * 2. Type of Services   — categoryId view/change-request, serviceAreas, operatingHours
 * 3. Status             — kycStatus + identity change requests
 * 4. Business & Tax     — entityType, regNo, taxNo, isCompany(derived), tax config+calculator, invoice settings+preview
 * 5. Action PIN
 * 6. Money (read-only)  — fee breakdown, penalties
 * 7. Danger Zone
 */
@Component({
    selector: "app-servicer-account",
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, PlacesAutocompleteComponent, PhoneInputComponent, ModalComponent, ListToolbarComponent],
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
              <span class="muted">(how far you'll travel — used to match jobs to you)</span>
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
              <span class="muted">(base schedule — your weekly template)</span>
            </label>
            <div class="hours-grid">
              @for (day of weekdays; track day) {
                <div class="hours-row">
                  <span class="day-label">{{ dayLabels[day] }}</span>
                  <input
                    class="time-input"
                    type="text"
                    [ngModel]="ohF[day].open"
                    (ngModelChange)="onTimeInput(day, 'open', $event)"
                    name="ohOpen{{day}}"
                    placeholder="09:00"
                    maxlength="5"
                    (blur)="onHoursChange()"
                    [class.err-input]="ohF[day].open && !isValidTime(ohF[day].open)"
                  />
                  <span class="muted">to</span>
                  <input
                    class="time-input"
                    type="text"
                    [ngModel]="ohF[day].close"
                    (ngModelChange)="onTimeInput(day, 'close', $event)"
                    name="ohClose{{day}}"
                    placeholder="17:00"
                    maxlength="5"
                    (blur)="onHoursChange()"
                    [class.err-input]="ohF[day].close && !isValidTime(ohF[day].close)"
                  />
                  @if (!ohF[day].open && !ohF[day].close) {
                    <span class="muted small">Closed</span>
                  }
                </div>
              }
            </div>
            <p class="muted small" style="margin-top:0.3rem">Enter time as HH:MM (24h), e.g. 08:30 or leave blank for closed.</p>
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
              <input type="checkbox" [(ngModel)]="f.sstRegistered" name="sstr" class="toggle" (change)="onSstToggled()" />
            </label>
            @if (f.sstRegistered) {
              <label>
                SST number
                <input [(ngModel)]="f.sstNumber" name="sstn" placeholder="e.g. SST-1234-567890" />
              </label>
            }
            <label>
              Service charge rate (%)
              <input type="number" min="0" step="0.5" [(ngModel)]="f.serviceChargeRate" name="scr" placeholder="e.g. 5 or 10" (change)="recalcTax()" />
            </label>
            <label class="toggle-row">
              <span><strong>Tax inclusive</strong> <span class="muted">(quoted prices include SC + SST)</span></span>
              <input type="checkbox" [(ngModel)]="f.taxInclusive" name="ti" class="toggle" (change)="recalcTax()" />
            </label>

            <!-- Tax calculator -->
            <div class="tax-calc">
              <label>
                Try amount (RM)
                <input type="number" min="1" step="0.01" [(ngModel)]="taxTryAmount" name="tta" (input)="recalcTax()" placeholder="e.g. 100.00" />
              </label>
              @if (taxTryAmount() > 0) {
                <div class="tax-breakdown">
                  <div class="tax-row"><span>Subtotal</span><span>RM {{ taxSubtotal() | number:'1.2-2' }}</span></div>
                  <div class="tax-row"><span>Service charge ({{ f.serviceChargeRate ?? 0 }}%)</span><span>RM {{ taxSC() | number:'1.2-2' }}</span></div>
                  @if (f.sstRegistered) {
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
        @if (deactivateStep() === 1) {
          <div class="modal-backdrop" (click)="deactivateStep.set(0)">
            <div class="modal" (click)="$event.stopPropagation()">
              <h2>Deactivate your account?</h2>
              <ul>
                <li>This action cannot be undone</li>
                <li>You won't be able to log in again</li>
                <li>Your data will be anonymized</li>
                <li>Open bookings will be cancelled</li>
              </ul>
              <div class="modal-actions">
                <button class="btn-ghost" (click)="deactivateStep.set(0)">Cancel</button>
                <button class="btn-primary" (click)="deactivateStep.set(2)">Continue</button>
              </div>
            </div>
          </div>
        }
        @if (deactivateStep() === 2) {
          <div class="modal-backdrop" (click)="deactivateStep.set(0)">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3>Confirm deactivation</h3>
              <label>Reason for leaving *<textarea [(ngModel)]="deactivateReason" name="dreason" rows="3"></textarea></label>
              <label>Enter your PIN to confirm<input type="password" maxlength="6" pattern="[0-9]{6}" inputmode="numeric" [(ngModel)]="deactivatePin" name="dpass" /></label>
              @if (deactivateError()) { <p class="err">{{ deactivateError() }}</p> }
              <div class="modal-actions">
                <button class="btn-ghost" (click)="deactivateStep.set(0)">Cancel</button>
                <button class="btn-primary" (click)="deactivateStep.set(3)">Continue</button>
              </div>
            </div>
          </div>
        }
        @if (deactivateStep() === 3) {
          <div class="modal-backdrop" (click)="deactivateStep.set(0)">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3>Are you absolutely sure?</h3>
              <p class="muted">Type <strong>DELETE</strong> to confirm.</p>
              <label>Type DELETE<input [(ngModel)]="deactivateConfirm" name="dconfirm" placeholder="" /></label>
              @if (deactivateError()) { <p class="err">{{ deactivateError() }}</p> }
              <div class="modal-actions">
                <button class="btn-ghost" (click)="deactivateStep.set(0)">Cancel</button>
                <button class="btn-danger" (click)="doDeactivate()" [disabled]="deactivating()">
                  {{ deactivating() ? 'Deactivating…' : 'Deactivate my account' }}
                </button>
              </div>
            </div>
          </div>
        }
      }
    }
  `,
    styles: [`
      :host { display: block; }
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

      /* Hours grid */
      .hours-grid { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.5rem; }
      .hours-row { display: flex; align-items: center; gap: 0.5rem; }
      .day-label { width: 50px; font-size: 0.85rem; font-weight: 600; text-transform: capitalize; }
      .hours-row .time-input { width: 80px; padding: 0.4rem 0.5rem; font-family: monospace; font-size: 0.85rem; }
      .time-input.err-input { border-color: var(--color-danger); }

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
      .modal-backdrop { position: fixed; inset: 0; z-index: 999; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; }
      .modal { background: var(--color-surface); border-radius: var(--radius); padding: 1.5rem; max-width: 440px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.2); display: flex; flex-direction: column; gap: 0.7rem; }
      .modal ul { margin: 0; padding-left: 1.2rem; }
      .modal ul li { margin-bottom: 0.3rem; font-size: 0.9rem; }

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
    sstRegistered: false,
    sstNumber: "",
    serviceChargeRate: null as number | null,
    taxInclusive: false,
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

  derivedIsCompany = computed(() => {
    return this.f.businessEntityType && this.f.businessEntityType !== 'sole_proprietorship';
  });

  taxSubtotal = computed(() => {
    const amt = this.taxTryAmount() || 0;
    if (this.f.taxInclusive) {
      const scRate = (this.f.serviceChargeRate ?? 0) / 100;
      const sstRate = this.f.sstRegistered ? this.sstRate() / 100 : 0;
      return amt / (1 + scRate + sstRate);
    }
    return amt;
  });

  taxSC = computed(() => {
    const scRate = (this.f.serviceChargeRate ?? 0) / 100;
    return this.taxSubtotal() * scRate;
  });

  taxSST = computed(() => {
    if (!this.f.sstRegistered) return 0;
    const sstRate = this.sstRate() / 100;
    return this.taxSubtotal() * sstRate;
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

  // ── Operating hours ──
  ohF: Record<string, { open: string; close: string }> = {
    mon: { open: '', close: '' },
    tue: { open: '', close: '' },
    wed: { open: '', close: '' },
    thu: { open: '', close: '' },
    fri: { open: '', close: '' },
    sat: { open: '', close: '' },
    sun: { open: '', close: '' },
  };

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
        this.f.sstRegistered = p.sstRegistered ?? false;
        this.f.sstNumber = p.sstNumber ?? "";
        this.f.serviceChargeRate = p.serviceChargeRate ?? null;
        this.f.taxInclusive = p.taxInclusive ?? false;
        this.contacts.set(p.contacts ?? []);
        this.contactsLoading.set(false);
        this.loading.set(false);
        // Seed operating hours from profile
        if (p.operatingHours) {
          const oh = p.operatingHours as Record<string, { open?: string; close?: string }>;
          for (const day of this.weekdays) {
            if (oh[day]) {
              this.ohF[day].open = oh[day].open || '';
              this.ohF[day].close = oh[day].close || '';
            }
          }
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
    this.recalcTax();
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

  // ── Tax recalc ──
  recalcTax(): void { /* triggers computed signals */ }
  onSstToggled(): void { if (!this.f.sstRegistered) this.f.sstNumber = ""; this.recalcTax(); }

  // ── Profile save ──
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

    // Validate time inputs
    for (const day of this.weekdays) {
      const open = this.ohF[day].open?.trim();
      const close = this.ohF[day].close?.trim();
      if (open && !this.isValidTime(open)) { this.profileError.set(`Invalid open time for ${this.dayLabels[day]}: use HH:MM (24h)`); this.savingProfile.set(false); return; }
      if (close && !this.isValidTime(close)) { this.profileError.set(`Invalid close time for ${this.dayLabels[day]}: use HH:MM (24h)`); this.savingProfile.set(false); return; }
    }

    const oh: Record<string, { open: string; close: string }> = {};
    for (const day of this.weekdays) {
      if (this.ohF[day].open && this.ohF[day].close) {
        oh[day] = { open: this.ohF[day].open, close: this.ohF[day].close };
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

  // ── Business details (admin review) ──
  saveBusinessDetails(): void {
    this.identitySavingError.set("");
    this.savingIdentity.set(true);
    const proposed: Record<string, unknown> = {};
    if (this.f.businessEntityType) proposed['entityType'] = this.f.businessEntityType;
    if (this.f.businessRegNumber) proposed['businessRegistrationNumber'] = this.f.businessRegNumber;
    if (this.f.taxNumber) proposed['taxNumber'] = this.f.taxNumber;
    this.api.post<IdentityChangeRequest>("/servicer/me/identity-change-request", { proposed }).subscribe({
      next: (req) => {
        // Update local list
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

  saveTaxConfig(): void {
    this.taxSavingError.set("");
    this.savingTax.set(true);
    const body: Record<string, unknown> = {
      sstRegistered: this.f.sstRegistered,
      serviceChargeRate: this.f.serviceChargeRate ?? 0,
      taxInclusive: this.f.taxInclusive,
    };
    if (this.f.sstRegistered && this.f.sstNumber) body['sstNumber'] = this.f.sstNumber;
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

  requestCategoryChange(): void {
    const p = this.profile();
    if (!p?.categoryId) { this.toast.error("No category set."); return; }
    this.dialog.prompt("Enter the new category name or ID to request an admin review.", {
      placeholder: "e.g. plumbing",
      confirmLabel: "Submit request",
    }).subscribe((val) => {
      if (!val) return;
      this.api.post("/servicer/me/identity-change-request", {
        proposed: { categoryId: val },
      }).subscribe({
        next: () => this.toast.success("Category change request submitted for review."),
        error: (e) => this.toast.error(e.message ?? "Request failed"),
      });
    });
  }

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

  onHoursChange(): void { /* no-op, just tracks changes */ }

  /** Auto-format time input as the user types: "9"→"09:00", "1130"→"11:30", etc. */
  onTimeInput(day: string, slot: 'open' | 'close', raw: string): void {
    // Strip non-digits
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (!digits) { this.ohF[day][slot] = ''; return; }

    let formatted = '';
    if (digits.length <= 2) {
      // 1-2 digits: treat as hour, pad to HH:00
      const h = parseInt(digits, 10);
      if (h > 23) return; // reject invalid while typing
      formatted = String(h).padStart(2, '0') + ':00';
    } else {
      // 3-4 digits: HHMM → HH:MM
      const h = parseInt(digits.slice(0, 2), 10);
      const m = parseInt(digits.slice(2, 4), 10);
      if (h > 23) return;
      const mm = Math.min(m, 59);
      formatted = String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
    }
    this.ohF[day][slot] = formatted;
  }

  isValidTime(val: string): boolean {
    if (!val) return true;
    return /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(val.trim());
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
      purpose: "merchant_logo", mimeType: file.type || "image/jpeg", sizeBytes: file.size,
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
  doDeactivate(): void {
    this.deactivateError.set(null);
    if (this.deactivateConfirm() !== 'DELETE') { this.deactivateError.set('Type DELETE to confirm.'); return; }
    this.deactivating.set(true);
    this.api.post('/servicer/me/deactivate', { reason: this.deactivateReason(), pin: this.deactivatePin() })
      .pipe(finalize(() => this.deactivating.set(false)))
      .subscribe({
        next: () => { this.auth.logout(); this.router.navigate(['/']); this.toast.success('Account deactivated.'); },
        error: (e) => { this.deactivateError.set(e.error?.message ?? e.message ?? 'Could not deactivate account'); },
      });
  }
}
