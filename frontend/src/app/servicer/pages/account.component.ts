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
  proposed: {
    entityType?: string;
    businessRegistrationNumber?: string | null;
    taxNumber?: string | null;
    sstNumber?: string | null;
  };
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

interface ServicerProfile {
  id: string;
  businessName: string;
  email: string;
  bio?: string | null;
  logoUrl?: string | null;
  serviceAreas?: string[] | null;
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
  /** Money/listing epic additions */
  entityType?: string | null;
  businessRegistrationNumber?: string | null;
  taxNumber?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  sstRegistered?: boolean;
  sstNumber?: string | null;
  serviceChargeRate?: number;
  taxInclusive?: boolean;
  identityChangeRequests?: IdentityChangeRequest[];
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
 * Servicer account settings page.
 *
 * Sections:
 * 1. Profile - bio, logo (via presign upload flow), service areas
 * 2. Identity change request status banner
 * 3. Business details - legal name, entity type, reg no, tax no (identity fields - admin review)
 * 4. Tax config - SST registered, SST number, service charge rate, tax inclusive
 * 5. Invoice formatting - prefix / year format / separator / padding
 * 6. Penalties - list with "File appeal" for eligible penalties
 */
@Component({
    selector: "app-servicer-account",
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, PlacesAutocompleteComponent, PhoneInputComponent, ModalComponent, ListToolbarComponent],
    template: `
    <h1>Account settings</h1>

    @if (loading()) {
      <p class="muted">Loading profile…</p>
    } @else if (profileFailed()) {
      <p class="muted">Could not load profile. Please refresh the page.</p>
    } @else {
      @if (profile(); as p) {
        <!-- ── 0. Personal Profile (User record) ────────────────────────────── -->
        <section class="card page-child">
          <h2>Personal Profile</h2>
          <p class="muted small">Your personal identity - shared across all portals. Separate from your business profile below.</p>

          <!-- Avatar -->
          <div class="logo-row">
            @if (personalAvatar()) {
              <img [src]="personalAvatar()" alt="Avatar" class="logo-img" />
            } @else {
              <div class="logo-placeholder">
                {{ personalF.name.charAt(0).toUpperCase() || '?' }}
              </div>
            }
            <div class="logo-actions">
              <label class="btn-ghost file-label">
                <input
                  #personalAvatarInput
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  class="file-hidden"
                  (change)="onPersonalAvatarChange($event)"
                />
                {{ personalAvatarUploading() ? 'Uploading…' : '📷 Change photo' }}
              </label>
              @if (personalAvatarError()) {
                <span class="err small">{{ personalAvatarError() }}</span>
              }
            </div>
          </div>

          <div class="form">
            <label>
              Name
              <input [(ngModel)]="personalF.name" name="pname" placeholder="Your full name" />
            </label>
            <label>
              Email
              <input [value]="personalEmail()" disabled class="disabled-input" />
              <span class="muted small">Email is shared with your business account and cannot be changed.</span>
            </label>
            <label>
              Phone
              <app-phone-input [(ngModel)]="personalF.phone" name="pphone"></app-phone-input>
            </label>
            <label>
              Bio
              <span class="muted">(optional - shown on your public profile)</span>
              <textarea rows="3" [(ngModel)]="personalF.bio" name="pbio" placeholder="Tell customers about yourself…"></textarea>
            </label>
            <label>
              Emergency contact name
              <span class="muted">(optional)</span>
              <input [(ngModel)]="personalF.contactName" name="pcn" placeholder="e.g. Spouse, parent" />
            </label>
            <label>
              Emergency contact number
              <span class="muted">(optional)</span>
              <app-phone-input [(ngModel)]="personalF.contactNumber" name="pcnum"></app-phone-input>
            </label>
            @if (personalError()) {
              <p class="err">{{ personalError() }}</p>
            }
            <div class="form-actions">
              <button class="btn-primary" (click)="savePersonalProfile()" [disabled]="savingPersonal()">
                {{ savingPersonal() ? "Saving…" : "Save personal profile" }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── 1. Business Profile (Servicer record) ─────────────────────────── -->
        <section class="card page-child">
          <h2>Profile</h2>

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
                {{ logoUploading() ? logoUploadStatus() : "📷 Change logo" }}
              </label>
              @if (logoError()) {
                <span class="err small">{{ logoError() }}</span>
              }
            </div>
          </div>

          <!-- Bio + service areas -->
          <div class="form">
            <label>
              Bio
              <span class="muted"
                >(optional - shown on your public profile)</span
              >
              <textarea
                rows="3"
                [(ngModel)]="f.bio"
                name="bio"
                placeholder="Describe your business…"
              ></textarea>
            </label>
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
                      <button
                        type="button"
                        class="sa-remove"
                        (click)="removeServiceArea($index)"
                        [attr.aria-label]="'Remove ' + area"
                      >&times;</button>
                    </span>
                  }
                </div>
              }
            </div>
            <label class="checkbox-row">
              <input type="checkbox" [(ngModel)]="f.showEmailPublic" name="showEmail" />
              Show email to customers
            </label>
            <label class="checkbox-row">
              <input type="checkbox" [(ngModel)]="f.showPhonePublic" name="showPhone" />
              Show phone to customers
            </label>
            @if (profileError()) {
              <p class="err">{{ profileError() }}</p>
            }
            <div class="form-actions">
              <button
                class="btn-primary"
                (click)="saveProfile()"
                [disabled]="savingProfile()"
              >
                {{ savingProfile() ? "Saving…" : "Save profile" }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── Fee Breakdown ────────────────────────────────────────────────── -->
        @if (feeBreakdown()) {
          <section class="card page-child">
            <h2>Platform Fee Breakdown</h2>
            <p class="muted">We charge {{ feeBreakdown()?.totalRate }}% on every completed booking. Here's where it goes:</p>
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
          </section>
        }

        <!-- ── 1b. Bank Account ─────────────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Bank Account</h2>
          <p class="muted small">
            Your bank details are used for withdrawals. Must be set before you can take jobs.
          </p>
          <div class="form" style="max-width: 420px;">
            <label>
              Bank name
              <input [(ngModel)]="f.bankName" name="bankName" placeholder="e.g. CIMB, Maybank" />
            </label>
            <label>
              Account number
              <input [(ngModel)]="f.bankAccount" name="bankAccount" placeholder="e.g. 1234-567-890" />
            </label>
            @if (bankSavingError()) {
              <p class="err">{{ bankSavingError() }}</p>
            }
            @if (bankSavedMsg()) {
              <p class="success-msg">{{ bankSavedMsg() }}</p>
            }
            <div class="form-actions">
              <button class="btn-primary" (click)="saveBank()" [disabled]="savingBank()">
                {{ savingBank() ? 'Saving…' : 'Save bank details' }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── Identity change request status banner ────────────────────────── -->
        @if (identityChangeRequests().length > 0) {
          <section class="card page-child id-banner">
            <h2>Identity change requests</h2>
            @for (req of identityChangeRequests(); track req.id) {
              <div class="id-req" [attr.data-status]="req.status">
                <div class="id-req-header">
                  <span class="badge" [attr.data-status]="req.status">{{ req.status }}</span>
                  <span class="muted small">Requested {{ req.createdAt | date: 'mediumDate' }}</span>
                </div>
                <dl class="id-req-dl">
                  @if (req.proposed.entityType) {
                    <dt>Entity type</dt>
                    <dd>{{ formatEntityType(req.proposed.entityType) }}</dd>
                  }
                  @if (req.proposed.businessRegistrationNumber) {
                    <dt>Registration no.</dt>
                    <dd>{{ req.proposed.businessRegistrationNumber }}</dd>
                  }
                  @if (req.proposed.taxNumber) {
                    <dt>Tax number</dt>
                    <dd>{{ req.proposed.taxNumber }}</dd>
                  }
                  @if (req.proposed.sstNumber) {
                    <dt>SST number</dt>
                    <dd>{{ req.proposed.sstNumber }}</dd>
                  }
                </dl>
                @if (req.status === 'approved' && req.reviewedAt) {
                  <p class="id-req-approved">Approved on {{ req.reviewedAt | date: 'mediumDate' }}</p>
                }
                @if (req.status === 'rejected' && req.reviewedAt) {
                  <p class="id-req-rejected">Rejected on {{ req.reviewedAt | date: 'mediumDate' }}</p>
                }
              </div>
            }
          </section>
        }

        <!-- ── 2. Business Details ──────────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Business details</h2>
          <p class="muted small">
            Changes to legal identity fields require admin review. Other fields
            save immediately.
          </p>
          <div class="form">
            <div class="row two-col">
              <label>
                Legal business name
                <input
                  [(ngModel)]="f.businessLegalName"
                  name="bln"
                  placeholder="e.g. My Home Servicer Sdn Bhd"
                />
              </label>
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
            </div>
            <div class="row two-col">
              <label>
                Business registration number
                <input
                  [(ngModel)]="f.businessRegNumber"
                  name="brn"
                  placeholder="e.g. 202401234567"
                />
              </label>
              <label>
                Tax number
                <input
                  [(ngModel)]="f.taxNumber"
                  name="tn"
                  placeholder="e.g. C 1234567890"
                />
              </label>
            </div>
            @if (identityFieldsDirty()) {
              <p class="id-note">
                Saving identity fields will create a change request for admin
                review. Your current details remain in effect until approved.
              </p>
            }
            @if (identitySavingError()) {
              <p class="err">{{ identitySavingError() }}</p>
            }
            <div class="form-actions">
              <button
                class="btn-primary"
                (click)="saveBusinessDetails()"
                [disabled]="savingIdentity()"
              >
                {{ savingIdentity() ? "Submitting…" : "Save business details" }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── PIN section ──────────────────────────────────────────────────── -->
        @if (pinSectionVisible()) {
          <section class="card page-child">
            <h2>Action PIN</h2>
            <p class="muted">
              Your PIN is used to confirm cancellations and withdrawals.
            </p>
            <div class="pin-status">
              @if (hasPin()) {
                <span class="badge-green">● PIN set</span>
              } @else {
                <span class="badge-yellow">● Using default (123456)</span>
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
                <p [class.err]="!verifyResult()">{{ verifyResult() ? '✓ PIN verified' : '✗ Incorrect PIN' }}</p>
              }
              <div class="modal-actions">
                <button type="button" class="btn-ghost" (click)="verifyPinOpen.set(false)">Close</button>
                <button type="submit" class="btn-primary">Verify</button>
              </div>
            </form>
          </app-modal>
        }

        <!-- ── 3. Tax Config ────────────────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Tax configuration</h2>
          <p class="muted small">
            Controls how tax and service charge are applied to your proposals
            and invoices. Changes save immediately - no admin review required.
          </p>
          <div class="form">
            <label class="toggle-row">
              <span>
                <strong>SST registered</strong>
                <span class="muted">(Malaysian Sales & Service Tax)</span>
              </span>
              <input
                type="checkbox"
                [(ngModel)]="f.sstRegistered"
                name="sstr"
                class="toggle"
                (change)="onSstToggled()"
              />
            </label>
            @if (f.sstRegistered) {
              <label>
                SST number
                <input
                  [(ngModel)]="f.sstNumber"
                  name="sstn"
                  placeholder="e.g. SST-1234-567890"
                />
              </label>
            }
            <div class="row two-col">
              <label>
                Service charge rate (%)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  [(ngModel)]="f.serviceChargeRate"
                  name="scr"
                  placeholder="e.g. 5 or 10"
                />
              </label>
            </div>
            <label class="toggle-row">
              <span>
                <strong>Tax inclusive</strong>
                <span class="muted">(quoted prices already include SC + SST)</span>
              </span>
              <input
                type="checkbox"
                [(ngModel)]="f.taxInclusive"
                name="ti"
                class="toggle"
              />
            </label>
            @if (taxSavingError()) {
              <p class="err">{{ taxSavingError() }}</p>
            }
            <div class="form-actions">
              <button
                class="btn-primary"
                (click)="saveTaxConfig()"
                [disabled]="savingTax()"
              >
                {{ savingTax() ? "Saving…" : "Save tax settings" }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── 4. Invoice formatting ───────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Invoice formatting</h2>
          <p class="muted small">
            Controls the invoice number format, e.g.
            <code>INV-2026-0042</code>.
          </p>
          <div class="form">
            <div class="row">
              <label>
                Prefix
                <input
                  [(ngModel)]="f.invoicePrefix"
                  name="ip"
                  placeholder="INV"
                />
              </label>
              <label>
                Content
                <input
                  [(ngModel)]="f.invoiceContent"
                  name="ic"
                  placeholder="(optional)"
                />
              </label>
              <label>
                Suffix
                <input
                  [(ngModel)]="f.invoiceSuffix"
                  name="isuf"
                  placeholder="(optional)"
                />
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
                <input
                  [(ngModel)]="f.invoiceSeparator"
                  name="is"
                  placeholder="-"
                  maxlength="3"
                />
              </label>
              <label>
                Number padding
                <input
                  type="number"
                  min="1"
                  max="10"
                  [(ngModel)]="f.invoicePadding"
                  name="ipad"
                />
              </label>
            </div>
            <p class="preview muted small">
              Preview: <strong>{{ invoicePreview() }}</strong>
            </p>
            <div class="form-actions">
              <button
                class="btn-primary"
                (click)="saveProfile()"
                [disabled]="savingProfile()"
              >
                {{ savingProfile() ? "Saving…" : "Save invoice settings" }}
              </button>
            </div>
          </div>
        </section>

        <!-- ── 5. Penalties ───────────────────────────────────────────────── -->
        <section class="card page-child">
          <h2>Penalties</h2>
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
            <p class="muted">No penalties on record - keep it up!</p>
          } @else {
            <table class="penalties-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Appeal</th>
                </tr>
              </thead>
              <tbody>
                @for (pen of penaltiesDisplay(); track pen.id) {
                  <tr>
                    <td>{{ formatType(pen.type) }}</td>
                    <td class="amount">
                      RM {{ pen.amountDeducted | number: "1.2-2" }}
                    </td>
                    <td class="muted">
                      {{ pen.createdAt | date: "mediumDate" }}
                    </td>
                    <td>
                      <span class="badge" [attr.data-status]="pen.status">{{
                        pen.status
                      }}</span>
                    </td>
                    <td>
                      @if (pen.appealStatus) {
                        <span
                          class="badge"
                          [attr.data-status]="pen.appealStatus"
                        >
                          Appeal: {{ pen.appealStatus }}
                        </span>
                      } @else {
                        <button
                          class="btn-ghost small-btn"
                          (click)="fileAppeal(pen)"
                        >
                          Appeal
                        </button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>

        <!-- ── 6. Danger Zone ──────────────────────────────────────────────── -->
        <section class="card page-child danger-zone">
          <h2>Danger Zone</h2>
          <p class="muted">
            Permanently deactivate your account. This action cannot be undone.
          </p>
          <button class="btn-danger" (click)="deactivateStep.set(1)">
            Deactivate my account
          </button>
        </section>

        @if (deactivateStep() === 1) {
          <div class="modal-backdrop" (click)="deactivateStep.set(0)">
            <div class="modal" (click)="$event.stopPropagation()">
              <h2>⚠️ Deactivate your account?</h2>
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
    styles: [
        `
      :host { display: block; }
      section {
        margin-bottom: 1.4rem;
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
      .logo-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .logo-img {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid var(--color-border);
      }
      .logo-placeholder {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: var(--color-primary);
        color: #fff;
        font-size: 1.6rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .logo-actions {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
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
      .form {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.9rem;
        font-weight: 500;
      }
      .row {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
        gap: 0.7rem;
      }
      .form-actions {
        margin-top: 0.3rem;
      }
      .preview {
        padding: 0.5rem 0.7rem;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
      }
      .checkbox-row {
        flex-direction: row;
        align-items: center;
        gap: 0.5rem;
        font-weight: 400;
      }
      .checkbox-row input {
        width: auto;
      }
      .err {
        color: var(--color-danger);
        font-size: 0.88rem;
      }
      .success-msg {
        color: var(--color-success);
        font-size: 0.85rem;
        font-weight: 500;
      }
      .small {
        font-size: 0.82rem;
      }
      .penalties-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.88rem;
      }
      .penalties-table th,
      .penalties-table td {
        text-align: left;
        padding: 0.5rem 0.4rem;
        border-bottom: 1px solid var(--color-border);
      }
      .penalties-table tbody tr {
        transition: background 0.12s ease;
      }
      .penalties-table tbody tr:hover {
        background: var(--color-surface);
      }
      .penalties-table .amount {
        font-weight: 600;
        color: var(--color-danger);
      }
      .badge[data-status="deducted"] {
        background: var(--color-status-cancelled-bg);
        border-color: var(--color-status-cancelled-border);
        color: var(--color-status-cancelled-text);
      }
      .badge[data-status="pending"],
      .badge[data-status="under_review"] {
        background: var(--color-status-progress-bg);
        border-color: var(--color-status-progress-border);
        color: var(--color-status-progress-text);
      }
      .badge[data-status="approved"] {
        background: var(--color-status-completed-bg);
        border-color: var(--color-status-completed-border);
        color: var(--color-status-completed-text);
      }
      .small-btn {
        font-size: 0.8rem;
        padding: 0.15rem 0.6rem;
      }
      .sa-section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .sa-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .sa-chip {
        display: inline-flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.2rem 0.5rem;
        background: var(--color-primary-light);
        color: var(--color-primary-dark);
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 500;
      }
      .sa-remove {
        background: none;
        border: none;
        color: inherit;
        font-size: 1rem;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        opacity: 0.6;
        transition: opacity 0.12s ease;
      }
      .sa-remove:hover { opacity: 1; }

      /* ── Identity change request banner ── */
      .id-banner {
        border-left: 4px solid var(--color-primary);
      }
      .id-req {
        padding: 0.6rem 0;
        border-bottom: 1px solid var(--color-border);
      }
      .id-req:last-child {
        border-bottom: none;
      }
      .id-req-header {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        margin-bottom: 0.4rem;
      }
      .id-req-dl {
        display: grid;
        grid-template-columns: 130px 1fr;
        gap: 0.2rem 0.8rem;
        margin: 0 0 0.3rem 0;
        font-size: 0.85rem;
      }
      .id-req-dl dt {
        font-weight: 600;
        color: var(--color-muted);
      }
      .id-req-dl dd {
        margin: 0;
      }
      .id-req-approved {
        color: var(--color-success);
        font-size: 0.82rem;
        font-weight: 500;
      }
      .id-req-rejected {
        color: var(--color-danger);
        font-size: 0.82rem;
        font-weight: 500;
      }
      .badge[data-status="rejected"] {
        background: var(--color-status-cancelled-bg);
        border-color: var(--color-status-cancelled-border);
        color: var(--color-status-cancelled-text);
      }

      /* ── Two-column row ── */
      .two-col {
        grid-template-columns: 1fr 1fr;
      }

      /* ── Toggle row (label + checkbox) ── */
      .toggle-row {
        flex-direction: row !important;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.4rem 0;
      }
      .toggle-row span {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .toggle {
        width: 2.6rem;
        height: 1.5rem;
        appearance: none;
        background: var(--color-border);
        border-radius: 999px;
        cursor: pointer;
        position: relative;
        transition: background var(--transition-fast);
        flex-shrink: 0;
      }
      .toggle::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: calc(1.5rem - 4px);
        height: calc(1.5rem - 4px);
        background: #fff;
        border-radius: 50%;
        transition: transform var(--transition-fast);
      }
      .toggle:checked {
        background: var(--color-primary);
      }
      .toggle:checked::after {
        transform: translateX(1.1rem);
      }
      .toggle:focus-visible {
        outline: 2px solid var(--color-primary);
        outline-offset: 2px;
      }

      .id-note {
        font-size: 0.8rem;
        color: var(--color-accent);
        font-weight: 500;
        padding: 0.4rem 0.6rem;
        background: var(--color-accent-light, #fef9e7);
        border-radius: var(--radius);
        margin: 0;
      }

      .pin-status { margin-bottom: 0.5rem; }
      .pin-status .badge-green { color: var(--color-success, #16a34a); font-weight: 600; font-size: 0.9rem; }
      .pin-status .badge-yellow { color: var(--color-warning, #d97706); font-weight: 600; font-size: 0.9rem; }
      .pin-form { display: flex; flex-direction: column; gap: 0.6rem; }
      .pin-form label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.88rem; font-weight: 500; }
      .pin-form input { max-width: 180px; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
      .btn-row { display: flex; gap: 0.5rem; margin-top: 0.3rem; }
      .row-msg { margin-top: 0.4rem; font-size: 0.88rem; }
      .danger-zone { border: 1px solid var(--color-danger, #dc2626); }
      .danger-zone h2 { color: var(--color-danger); }
      .btn-danger {
        background: var(--color-danger, #dc2626); color: #fff; border: none;
        padding: 0.5rem 1rem; border-radius: var(--radius); cursor: pointer;
        font-size: 0.88rem; font-weight: 600; font-family: inherit;
        transition: opacity 0.15s ease;
      }
      .btn-danger:hover { opacity: 0.85; }
      .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
      .fee-table { max-width: 360px; margin-top: 0.5rem; }
      .fee-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 0.4rem 0; border-bottom: 1px solid var(--color-border);
        font-size: 0.88rem;
      }
      .fee-row.total {
        font-weight: 700; border-bottom: none; border-top: 2px solid var(--color-text);
        margin-top: 0.3rem; padding-top: 0.5rem;
      }
      .modal-backdrop {
        position: fixed; inset: 0; z-index: 999;
        background: rgba(0,0,0,0.4); display: flex; align-items: center;
        justify-content: center;
      }
      .modal {
        background: var(--color-surface); border-radius: var(--radius);
        padding: 1.5rem; max-width: 440px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        display: flex; flex-direction: column; gap: 0.7rem;
      }
      .modal ul { margin: 0; padding-left: 1.2rem; }
      .modal ul li { margin-bottom: 0.3rem; font-size: 0.9rem; }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        padding-bottom: 1rem;
        border-bottom: 1px solid var(--color-border);
        margin-bottom: 1rem;
      }
      .search {
        min-width: 180px;
        max-width: 260px;
        border-radius: 999px;
        padding: 0.45rem 0.85rem;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        font-size: 0.88rem;
        outline: none;
      }
      .search:focus { border-color: var(--color-primary); }
      select {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        padding: 0.4rem 0.6rem;
        font-size: 0.85rem;
        outline: none;
        cursor: pointer;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .chip {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.25rem 0.75rem;
        font-size: 0.82rem;
        cursor: pointer;
        color: var(--color-muted);
        transition: background var(--transition), color var(--transition), border-color var(--transition);
      }
      .chip.on {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
      }
`,
    ]
})
export class ServicerAccountComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  private auth = inject(AuthService);
  private router = inject(Router);

  @ViewChild("logoInput") logoInputRef?: ElementRef<HTMLInputElement>;

  profile = signal<ServicerProfile | null>(null);
  penalties = signal<Penalty[]>([]);
  penaltySearch = signal('');
  penaltyFilter = signal<'all' | 'active' | 'appealed' | 'resolved'>('all');
  penaltySort = signal<'recent' | 'amount'>('recent');
  penaltiesDisplay = computed(() => {
    let list = this.penalties();
    const q = this.penaltySearch().toLowerCase().trim();
    if (q) {
      list = list.filter((p) => p.type.toLowerCase().includes(q));
    }
    const f = this.penaltyFilter();
    if (f !== 'all') {
      list = list.filter((p) => {
        if (f === 'active') return p.status === 'deducted' && !p.appealStatus;
        if (f === 'appealed') return !!p.appealStatus && p.appealStatus === 'pending';
        if (f === 'resolved') return !!p.appealStatus && p.appealStatus !== 'pending';
        return true;
      });
    }
    const s = this.penaltySort();
    if (s === 'recent') {
      list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (s === 'amount') {
      list = [...list].sort((a, b) => b.amountDeducted - a.amountDeducted);
    }
    return list;
  });
  feeBreakdown = signal<FeeBreakdown | null>(null);
  loading = signal(true);
  profileFailed = signal(false);
  loadingPenalties = signal(true);
  savingProfile = signal(false);
  profileError = signal("");
  logoUploading = signal(false);
  logoUploadStatus = signal("");
  logoError = signal("");

  // ── Personal profile signals ──
  personalProfile = signal<{ name: string; email: string; phone: string; bio: string | null; avatarUrl: string | null; contactName: string | null; contactNumber: string | null } | null>(null);
  personalEmail = signal("");
  personalAvatar = signal<string | null>(null);
  savingPersonal = signal(false);
  personalError = signal("");
  personalAvatarUploading = signal(false);
  personalAvatarError = signal("");

  /** Personal profile form fields. */
  personalF = {
    name: "",
    phone: "",
    bio: "",
    contactName: "",
    contactNumber: "",
  };

  /** Editable form fields - seeded from the profile on load. */
  f = {
    bio: "",
    serviceAreas: "",
    serviceAreaList: [] as string[],
    invoicePrefix: "INV",
    invoiceContent: "",
    invoiceSuffix: "",
    invoiceYearFormat: "YYYY",
    invoiceSeparator: "-",
    invoicePadding: 4,
    // Business details (identity fields - admin review)
    businessLegalName: "",
    businessEntityType: "",
    businessRegNumber: "",
    taxNumber: "",
    // Bank account
    bankName: "",
    bankAccount: "",
    // Tax config (non-identity - direct save)
    sstRegistered: false,
    sstNumber: "",
    serviceChargeRate: null as number | null,
    taxInclusive: false,
    showEmailPublic: false,
    showPhonePublic: false,
  };

  newAreaInput = "";

  // Bank account
  savingBank = signal(false);
  bankSavingError = signal("");
  bankSavedMsg = signal("");

  // Identity change requests
  identityChangeRequests = signal<IdentityChangeRequest[]>([]);
  savingIdentity = signal(false);
  identitySavingError = signal("");

  // Tax config saving
  savingTax = signal(false);
  taxSavingError = signal("");

  /** True when identity fields differ from the saved profile. */
  identityFieldsDirty = signal(false);

  ngOnInit(): void {
    this.api.get<ServicerProfile>("/servicer/me").subscribe({
      next: (p) => {
        this.profile.set(p);
        this.f.bio = p.bio ?? "";
        this.f.serviceAreaList = p.serviceAreas ?? [];
        this.f.serviceAreas = this.f.serviceAreaList.join(", ");
        this.f.invoicePrefix = p.invoicePrefix ?? "INV";
        this.f.invoiceYearFormat = p.invoiceYearFormat ?? "YYYY";
        this.f.invoiceSeparator = p.invoiceSeparator ?? "-";
        this.f.invoicePadding = p.invoicePadding ?? 4;
        this.f.invoiceContent = p.invoiceContent ?? "";
        this.f.invoiceSuffix = p.invoiceSuffix ?? "";
        // Bank account
        this.f.bankName = p.bankName ?? "";
        this.f.bankAccount = p.bankAccount ?? "";
        // Business details
        this.f.businessLegalName = p.businessName ?? "";
        this.f.businessEntityType = p.entityType ?? "";
        this.f.businessRegNumber = p.businessRegistrationNumber ?? "";
        this.f.taxNumber = p.taxNumber ?? "";
        // Tax config
        this.f.sstRegistered = p.sstRegistered ?? false;
        this.f.sstNumber = p.sstNumber ?? "";
        this.f.serviceChargeRate = p.serviceChargeRate ?? null;
        this.f.taxInclusive = p.taxInclusive ?? false;
        this.f.showEmailPublic = p.showEmailPublic ?? false;
        this.f.showPhonePublic = p.showPhonePublic ?? false;
        // Identity change requests
        this.identityChangeRequests.set(p.identityChangeRequests ?? []);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.profileFailed.set(true); },
    });

    this.api.get<{ data: Penalty[] }>("/servicer/me/penalties").subscribe({
      next: (r) => {
        this.penalties.set(r.data ?? []);
        this.loadingPenalties.set(false);
      },
      error: () => this.loadingPenalties.set(false),
    });

    this.api.get<FeeBreakdown>("/servicer/me/fee-breakdown").subscribe({
      next: (r) => this.feeBreakdown.set(r),
      error: () => {},
    });

    // Personal profile (User record linked by shared email)
    this.api.get<{ name: string; email: string; phone: string; bio: string | null; avatarUrl: string | null; contactName: string | null; contactNumber: string | null }>("/servicer/me/personal").subscribe({
      next: (p) => {
        this.personalProfile.set(p);
        this.personalEmail.set(p.email);
        this.personalAvatar.set(p.avatarUrl);
        this.personalF.name = p.name;
        this.personalF.phone = p.phone;
        this.personalF.bio = p.bio ?? "";
        this.personalF.contactName = p.contactName ?? "";
        this.personalF.contactNumber = p.contactNumber ?? "";
      },
      error: () => {},
    });

    this.loadPinStatus();
  }

  // ── Invoice number preview ───────────────────────────────────────────────
  invoicePreview(): string {
    const prefix = this.f.invoicePrefix || "INV";
    const content = this.f.invoiceContent || "";
    const suffix = this.f.invoiceSuffix || "";
    const sep = this.f.invoiceSeparator || "-";
    const year =
      this.f.invoiceYearFormat === "YYYY"
        ? new Date().getFullYear().toString()
        : this.f.invoiceYearFormat === "YY"
          ? new Date().getFullYear().toString().slice(2)
          : null;
    const num = String(42).padStart(Number(this.f.invoicePadding) || 4, "0");
    return year
      ? `${prefix}${content}${sep}${year}${sep}${num}${suffix}`
      : `${prefix}${content}${sep}${num}${suffix}`;
  }

  // ── Bank account save ──────────────────────────────────────────────────────
  saveBank(): void {
    this.bankSavingError.set("");
    this.bankSavedMsg.set("");
    if (!this.f.bankName.trim() || !this.f.bankAccount.trim()) {
      this.bankSavingError.set("Both bank name and account number are required.");
      return;
    }
    this.savingBank.set(true);
    this.api.patch<ServicerProfile>("/servicer/me", {
      bankName: this.f.bankName.trim(),
      bankAccount: this.f.bankAccount.trim(),
    }).subscribe({
      next: (updated) => {
        this.profile.update((p) => (p ? { ...p, ...updated } : p));
        this.savingBank.set(false);
        this.bankSavedMsg.set("Bank details saved.");
        setTimeout(() => this.bankSavedMsg.set(""), 3000);
      },
      error: (e) => {
        this.savingBank.set(false);
        this.bankSavingError.set(e.message ?? "Could not save bank details");
      },
    });
  }

  // ── Profile save ─────────────────────────────────────────────────────────
  saveProfile(): void {
    this.savingProfile.set(true);
    this.profileError.set("");

    const serviceAreas = this.f.serviceAreaList
      .map((s) => s.trim())
      .filter(Boolean);

    this.api
      .patch<ServicerProfile>("/servicer/me", {
        bio: this.f.bio || undefined,
        serviceAreas: serviceAreas.length ? serviceAreas : undefined,
        invoicePrefix: this.f.invoicePrefix || undefined,
        invoiceContent: this.f.invoiceContent || undefined,
        invoiceSuffix: this.f.invoiceSuffix || undefined,
        invoiceYearFormat: this.f.invoiceYearFormat || undefined,
        invoiceSeparator: this.f.invoiceSeparator || undefined,
        invoicePadding: this.f.invoicePadding ?? undefined,
        showEmailPublic: this.f.showEmailPublic,
        showPhonePublic: this.f.showPhonePublic,
      })
      .subscribe({
        next: (updated) => {
          this.profile.update((p) => (p ? { ...p, ...updated } : p));
          this.savingProfile.set(false);
          this.toast.success("Profile saved.");
        },
        error: (e) => {
          this.savingProfile.set(false);
          this.profileError.set(e.message ?? "Could not save profile");
        },
      });
  }

  // ── Business details save (identity fields - admin review) ─────────────────
  saveBusinessDetails(): void {
    this.identitySavingError.set("");
    this.savingIdentity.set(true);

    const proposed: Record<string, unknown> = {};
    if (this.f.businessEntityType) proposed['entityType'] = this.f.businessEntityType;
    if (this.f.businessRegNumber) proposed['businessRegistrationNumber'] = this.f.businessRegNumber;
    if (this.f.taxNumber) proposed['taxNumber'] = this.f.taxNumber;
    if (this.f.sstRegistered && this.f.sstNumber) proposed['sstNumber'] = this.f.sstNumber;

    this.api
      .post<IdentityChangeRequest>("/servicer/me/identity-change-request", { proposed })
      .subscribe({
        next: (req) => {
          this.identityChangeRequests.update((list) => [...list, req]);
          this.identityFieldsDirty.set(false);
          this.savingIdentity.set(false);
          this.toast.success("Identity change request submitted for admin review.");
        },
        error: (e) => {
          this.savingIdentity.set(false);
          this.identitySavingError.set(e.message ?? "Could not submit identity change request");
        },
      });
  }

  // ── Tax config save (non-identity - direct save) ───────────────────────────
  saveTaxConfig(): void {
    this.taxSavingError.set("");
    this.savingTax.set(true);

    const body: Record<string, unknown> = {
      sstRegistered: this.f.sstRegistered,
      serviceChargeRate: this.f.serviceChargeRate ?? 0,
      taxInclusive: this.f.taxInclusive,
    };
    if (this.f.sstRegistered && this.f.sstNumber) {
      body['sstNumber'] = this.f.sstNumber;
    }

    this.api
      .patch<ServicerProfile>("/servicer/me", body)
      .subscribe({
        next: (updated) => {
          this.profile.update((p) => (p ? { ...p, ...updated } : p));
          this.savingTax.set(false);
          this.toast.success("Tax settings saved.");
        },
        error: (e) => {
          this.savingTax.set(false);
          this.taxSavingError.set(e.message ?? "Could not save tax settings");
        },
      });
  }

  /** Hide SST number field when SST is toggled off. */
  onSstToggled(): void {
    if (!this.f.sstRegistered) {
      this.f.sstNumber = "";
    }
  }

  /** Format entity type enum value for display. */
  formatEntityType(type: string): string {
    const map: Record<string, string> = {
      sole_proprietorship: "Sole Proprietorship",
      partnership: "Partnership",
      enterprise: "Enterprise",
      sdn_bhd: "Sdn Bhd",
    };
    return map[type] ?? type;
  }

  // ── Service area management ──────────────────────────────────────────────
  /** Called when a Google Places suggestion is selected for a service area. */
  onServiceAreaSelect(place: PlaceResult): void {
    const area = place.city || place.state || place.address;
    if (!area || this.f.serviceAreaList.includes(area)) return;
    this.f.serviceAreaList = [...this.f.serviceAreaList, area];
    this.newAreaInput = "";
    // Also update the legacy string field for display
    this.f.serviceAreas = this.f.serviceAreaList.join(", ");
  }

  removeServiceArea(index: number): void {
    this.f.serviceAreaList = this.f.serviceAreaList.filter((_, i) => i !== index);
    this.f.serviceAreas = this.f.serviceAreaList.join(", ");
  }

  // ── Logo upload (presign → S3 PUT → confirm → PATCH /servicer/me) ────────
  onLogoFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.logoError.set("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.logoError.set("Logo must be under 5 MB.");
      input.value = "";
      return;
    }

    this.logoUploading.set(true);
    this.logoUploadStatus.set("Requesting upload URL…");

    this.api
      .post<{ uploadUrl: string; fileId: string }>("/files/presign", {
        purpose: "merchant_logo",
        mimeType: file.type || "image/jpeg",
        sizeBytes: file.size,
      })
      .pipe(
        switchMap(({ uploadUrl, fileId }) => {
          this.logoUploadStatus.set("Uploading logo…");
          return this.http
            .put(uploadUrl, file, {
              headers: { "Content-Type": file.type || "image/jpeg" },
            })
            .pipe(
              switchMap(() => {
                this.logoUploadStatus.set("Confirming…");
                return this.api.post<{ fileUrl: string }>(
                  `/files/${fileId}/confirm`,
                  {},
                );
              }),
            );
        }),
        switchMap(({ fileUrl }) => {
          this.logoUploadStatus.set("Updating profile…");
          return this.api.patch<ServicerProfile>("/servicer/me", {
            logoUrl: fileUrl,
          });
        }),
      )
      .subscribe({
        next: (updated) => {
          this.profile.update((p) =>
            p ? { ...p, logoUrl: updated.logoUrl } : p,
          );
          this.logoUploading.set(false);
          this.toast.success("Logo updated.");
          if (this.logoInputRef) this.logoInputRef.nativeElement.value = "";
        },
        error: (e) => {
          this.logoUploading.set(false);
          this.logoError.set(e.message ?? "Logo upload failed.");
        },
      });
  }

  // ── Penalties ─────────────────────────────────────────────────────────────
  formatType(type: string): string {
    return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  fileAppeal(pen: Penalty): void {
    this.dialog
      .prompt(
        `Reason for appealing the ${this.formatType(pen.type)} penalty?`,
        {
          placeholder: "Describe the circumstances…",
          confirmLabel: "Submit appeal",
          multiline: true,
        },
      )
      .subscribe((reason) => {
        if (!reason) return;
        this.api
          .post(`/servicer/me/penalties/${pen.id}/appeal`, { reason })
          .subscribe({
            next: () => {
              this.toast.success("Appeal submitted.");
              // Update the local list so the button disappears
              this.penalties.update((list) =>
                list.map((p) =>
                  p.id === pen.id ? { ...p, appealStatus: "pending" } : p,
                ),
              );
            },
            error: (e) =>
              this.toast.error(e.message ?? "Could not submit appeal"),
          });
      });
  }

  // ── PIN section ────────────────────────────────────────────────────────────
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

  // ── Deactivate account wizard ──────────────────────────────────────────────
  deactivateStep = signal(0);
  deactivateReason = signal('');
  deactivatePin = signal('');
  deactivateConfirm = signal('');
  deactivateError = signal<string | null>(null);
  deactivating = signal(false);
  // ────────────────────────────────────────────────────────────────────────────

  private loadPinStatus(): void {
    this.api.get<{ hasPin: boolean }>('/servicer/account/pin-status').subscribe({
      next: (r) => this.hasPin.set(r.hasPin),
      error: () => {},
    });
  }

  openChangePin(): void {
    this.changeForm = { currentPin: '', newPin: '', confirmPin: '' };
    this.changePinError.set('');
    this.changePinOpen.set(true);
  }

  doChangePin(): void {
    const { currentPin, newPin, confirmPin } = this.changeForm;
    if (!newPin || (this.hasPin() && !currentPin)) { this.changePinError.set('All fields required.'); return; }
    if (newPin !== confirmPin) { this.changePinError.set('New PINs do not match.'); return; }
    this.changingPin.set(true);
    this.changePinError.set('');
    const body = this.hasPin() ? { currentPin, newPin } : { newPin };
    this.api.put('/servicer/account/pin', body).subscribe({
      next: () => {
        this.changingPin.set(false);
        this.changePinOpen.set(false);
        this.hasPin.set(true);
        this.pinMsg.set({ text: 'PIN changed.', error: false });
      },
      error: (e) => {
        this.changingPin.set(false);
        this.changePinError.set(e.message ?? 'Could not change PIN');
      },
    });
  }

  openVerifyPin(): void {
    this.verifyForm = { pin: '' };
    this.verifyResult.set(null);
    this.verifyPinOpen.set(true);
  }

  doVerifyPin(): void {
    if (!this.verifyForm.pin) return;
    this.api.post<{ ok: boolean }>('/servicer/account/verify-pin', { pin: this.verifyForm.pin }).subscribe({
      next: (r) => this.verifyResult.set(r.ok),
      error: () => this.verifyResult.set(false),
    });
  }

  // ── Deactivate account ─────────────────────────────────────────────────────
  doDeactivate(): void {
    this.deactivateError.set(null);
    if (this.deactivateConfirm() !== 'DELETE') {
      this.deactivateError.set('Type DELETE to confirm.');
      return;
    }
    this.deactivating.set(true);
    this.api.post('/servicer/me/deactivate', {
      reason: this.deactivateReason(),
      pin: this.deactivatePin(),
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

  // ── Personal profile ─────────────────────────────────────────────────────

  savePersonalProfile(): void {
    this.savingPersonal.set(true);
    this.personalError.set("");

    this.api.patch<any>("/servicer/me/personal", {
      name: this.personalF.name || undefined,
      phone: this.personalF.phone || undefined,
      bio: this.personalF.bio || null,
      contactName: this.personalF.contactName || null,
      contactNumber: this.personalF.contactNumber || null,
    }).subscribe({
      next: () => {
        this.savingPersonal.set(false);
        this.toast.success("Personal profile saved.");
      },
      error: (e) => {
        this.savingPersonal.set(false);
        this.personalError.set(e.message ?? "Could not save personal profile");
      },
    });
  }

  onPersonalAvatarChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.personalAvatarError.set("");
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.personalAvatarError.set("Photo must be under 5 MB.");
      input.value = "";
      return;
    }

    this.personalAvatarUploading.set(true);

    this.api
      .post<{ uploadUrl: string; fileId: string }>("/files/presign", {
        purpose: "avatar",
        mimeType: file.type || "image/jpeg",
        sizeBytes: file.size,
      })
      .pipe(
        switchMap(({ uploadUrl, fileId }) => {
          return this.http.put(uploadUrl, file, {
            headers: { "Content-Type": file.type || "image/jpeg" },
          }).pipe(
            switchMap(() => this.api.post<{ fileUrl: string }>(`/files/${fileId}/confirm`, {})),
          );
        }),
        switchMap(({ fileUrl }) => {
          return this.api.patch("/servicer/me/personal", { avatarUrl: fileUrl });
        }),
      )
      .subscribe({
        next: () => {
          this.personalAvatar.set(null); // trigger reload
          this.personalAvatarUploading.set(false);
          this.toast.success("Profile photo updated.");
          input.value = "";
          // Reload personal profile to get fresh avatarUrl
          this.api.get<any>("/servicer/me/personal").subscribe({
            next: (p: any) => {
              this.personalAvatar.set(p.avatarUrl);
              this.personalProfile.set(p);
            },
          });
        },
        error: (e) => {
          this.personalAvatarUploading.set(false);
          this.personalAvatarError.set(e.message ?? "Upload failed.");
        },
      });
  }
}
