import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, switchMap } from 'rxjs';
import { statusBadgeClass } from '../../shared/status-badge.util';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { routeFor } from '../../core/route-for';
import { CountdownComponent } from '../../shared/countdown-timer.component';
import { ModalComponent } from '../../shared/modal.component';
import { IconComponent } from '../../shared/icon.component';
import { DispatchOverlayComponent } from '../../shared/dispatch-overlay.component';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';
import { MapViewComponent } from '../../shared/map-view.component';
import { WaButtonComponent } from '../../shared/wa-button.component';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { NewOrderFormComponent } from '../components/new-order-form.component';

interface IncomingQuote {
  quoteId: string;
  category: string;
  timeSlot: string;
  preferredDate: string;
  propertyType?: string;
  budgetMin?: number;
  budgetMax?: number;
  paymentMode?: string;
  derivedStatus: string;
  servicerDeadline: string;
  myProposalId?: string | null;
  myProposalIsAuto?: boolean;
  myProposalPrice?: number | null;
  myProposalEta?: number | null;
  myProposalMessage?: string | null;
  customerAvatarUrl?: string | null;
  customerName?: string;
  address?: string | null;
  postcode?: string | null;
  district?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
  distanceKm?: number | null;
  notes?: string | null;
  descriptions?: string[];
}
interface Job {
  id: string;
  status: string;
  price: number;
  netPrice: number;
  paymentMode: string;
  scheduledDate: string;
  timeSlot: string;
  doneAt: string | null;
  cashConfirmedAt: string | null;
  cashConfirmed: boolean;
  etaMinutes?: number | null;
  orderId?: string;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  distanceKm?: number | null;
  quoteRequest: { category: { name: string } };
}
interface JobDetail {
  id: string;
  lat?: number | null;
  lng?: number | null;
  customerName?: string;
  customerPhone?: string;
  address?: string;
  contactName?: string;
  contactNumber?: string;
  instructions?: string;
  quoteRequest?: { category: { name: string } };
}

interface DailyEarning {
  date: string;
  earnings: number;
  jobs: number;
}

type PhotoPurpose = 'arrive_photo' | 'done_photo';

interface PricingModule {
  id: string;
  label: string;
  defaultPrice: number;
  taxable: boolean;
  serviceChargeable: boolean;
  categoryId?: string | null;
  active: boolean;
}

interface ModuleRef {
  moduleId: string;
  priceOverride: number | null;
}

const ACTIVE = ['confirmed', 'in_progress'];

/**
 * Servicer jobs board - three columns side by side:
 *  1. Pending - incoming quote requests (respond with a proposal)
 *  2. Active Job - accepted jobs not yet finished
 *  3. History - completed and cancelled jobs
 *
 * The "Mark arrived" and "Mark done" buttons open a file-picker modal that
 * uploads the evidence photo via the backend presigned-URL flow (S3 direct
 * browser upload) before posting the job status update.
 */
@Component({
    selector: 'app-servicer-jobs',
    host: { class: 'page-enter' },
    imports: [CommonModule, FormsModule, RouterLink, IconComponent, CountdownComponent, ModalComponent, DispatchOverlayComponent, ListToolbarComponent, MapViewComponent, WaButtonComponent, NewOrderFormComponent],
    template: `
    <div class="page-head">
      <div class="tabs">
        <button class="tab" [class.active]="tab() === 'pending'" [routerLink]="[routeFor('servicer.jobs.pending')]">
          Pending <span class="n">{{ quotes().length + pendingJobs().length }}</span>
        </button>
        <button class="tab" [class.active]="tab() === 'active'" [routerLink]="[routeFor('servicer.jobs.active')]">
          Active <span class="n">{{ activeJobs().length }}</span>
        </button>
        <button class="tab" [class.active]="tab() === 'history'" [routerLink]="[routeFor('servicer.jobs.history')]">
          History <span class="n">{{ historyJobs().length }}</span>
        </button>
      </div>
      <button class="btn-primary new-order-btn" (click)="newOrderOpen.set(true)">
        <app-icon name="plus" sizeToken="sm" /> + New order
      </button>
    </div>

    <app-list-toolbar>
      <input class="search" type="text" placeholder="Search by category…" [(ngModel)]="search" name="search" toolbar-search />
      <select [(ngModel)]="sortBy" name="jbsort" toolbar-sort>
        <option value="date">Most recent</option>
        <option value="price_high">Highest price</option>
        <option value="price_low">Lowest price</option>
      </select>
      <div class="chips" toolbar-filters>
        @if (tab() === 'pending') {
          <button class="chip" [class.on]="pendingFilter() === 'all'" (click)="pendingFilter.set('all')">All</button>
          <button class="chip" [class.on]="pendingFilter() === 'new'" (click)="pendingFilter.set('new')">New</button>
          <button class="chip" [class.on]="pendingFilter() === 'responded'" (click)="pendingFilter.set('responded')">Responded</button>
        }
        @if (tab() === 'active') {
          <button class="chip" [class.on]="activeFilter() === 'all'" (click)="activeFilter.set('all')">All</button>
          <button class="chip" [class.on]="activeFilter() === 'confirmed'" (click)="activeFilter.set('confirmed')">Confirmed</button>
          <button class="chip" [class.on]="activeFilter() === 'in_progress'" (click)="activeFilter.set('in_progress')">In Progress</button>
        }
        @if (tab() === 'history') {
          <button class="chip" [class.on]="historyFilter() === 'all'" (click)="historyFilter.set('all')">All</button>
          <button class="chip" [class.on]="historyFilter() === 'completed'" (click)="historyFilter.set('completed')">Completed</button>
          <button class="chip" [class.on]="historyFilter() === 'cancelled'" (click)="historyFilter.set('cancelled')">Cancelled</button>
        }
      </div>
    </app-list-toolbar>

    <div class="tab-content page-child">
      <!-- ── Pending - incoming quote requests ──────────────────────────── -->
      @if (tab() === 'pending') {
        @if (loadingQuotes()) {
          <p class="muted small">Loading…</p>
        } @else {
          <div class="grid">
            @for (q of filteredQuotes(); track q.quoteId) {
              <div class="card item">
                <!-- Row 1: name · session date · budget · building type · payment | status -->
                <div class="pq-head">
                  <div class="pq-id">
                    @if (q.customerAvatarUrl) {
                      <img [src]="q.customerAvatarUrl" alt="" class="avatar-circle sm" />
                    } @else {
                      <div class="avatar-fallback sm">{{ initials(q.customerName) }}</div>
                    }
                    <div class="pq-id-text">
                      <strong class="pq-name">{{ q.customerName || q.category }}</strong>
                      <div class="pq-tags">
                        <span class="pq-tag">{{ q.preferredDate | date: 'mediumDate' }} · {{ q.timeSlot }}</span>
                        <span class="pq-tag budget">RM {{ q.budgetMin ?? '—' }}–{{ q.budgetMax ?? '—' }}</span>
                        @if (q.propertyType) { <span class="pq-tag">{{ q.propertyType }}</span> }
                        @if (q.paymentMode) { <span class="pq-tag pay">{{ payLabel(q.paymentMode) }}</span> }
                        @if (q.distanceKm != null) { <span class="pq-tag dist">{{ q.distanceKm | number:'1.1-1' }} km</span> }
                      </div>
                    </div>
                  </div>
                  <span class="badge" [class.badge-responded]="q.myProposalId">
                    {{ q.myProposalId ? (q.myProposalIsAuto ? 'Auto-proposed' : 'Proposal sent') : 'New' }}
                  </span>
                </div>

                <!-- Row 2: address + map links -->
                @if (q.address) {
                  <div class="pq-addr-row">
                    <span class="pq-addr">{{ composedAddress(q) }}</span>
                    @if (q.lat != null && q.lng != null) {
                      <div class="pq-map-links">
                        <a class="btn-ghost btn-sm" [href]="gmapsUrl(q.lat!, q.lng!)" target="_blank" rel="noopener">
                          <svg width="14" height="14" viewBox="0 0 24 24"><path d="M19.527 4.799c1.212 2.608.937 5.678-.405 8.173-1.101 2.047-2.744 3.74-4.098 5.614-.619.858-1.244 1.75-1.669 2.727-.141.325-.263.658-.383.992-.121.333-.224.673-.34 1.008-.109.314-.236.684-.627.687h-.007c-.466-.001-.579-.53-.695-.887-.284-.874-.581-1.713-1.019-2.525-.51-.944-1.145-1.817-1.79-2.671L19.527 4.799zM8.545 7.705l-3.959 4.707c.724 1.54 1.821 2.863 2.871 4.18.247.31.494.622.737.936l4.984-5.925-.029.01c-1.741.601-3.691-.291-4.392-1.987a3.377 3.377 0 0 1-.209-.716c-.063-.437-.077-.761-.004-1.198l.001-.007zM5.492 3.149l-.003.004c-1.947 2.466-2.281 5.88-1.117 8.77l4.785-5.689-.058-.05-3.607-3.035zM14.661.436l-3.838 4.563a.295.295 0 0 1 .027-.01c1.6-.551 3.403.15 4.22 1.626.176.319.323.683.377 1.045.068.446.085.773.012 1.22l-.003.016 3.836-4.561A8.382 8.382 0 0 0 14.67.439l-.009-.003zM9.466 5.868L14.162.285l-.047-.012A8.31 8.31 0 0 0 11.986 0a8.439 8.439 0 0 0-6.169 2.766l-.016.018 3.665 3.084z" fill="#4285F4"/></svg> Google Maps
                        </a>
                        <a class="btn-ghost btn-sm" [href]="wazeUrl(q.lat!, q.lng!)" target="_blank" rel="noopener">
                          <svg width="14" height="14" viewBox="0 0 24 24"><path d="M13.218 0C9.915 0 6.835 1.49 4.723 4.148c-1.515 1.913-2.31 4.272-2.31 6.706v1.739c0 .894-.62 1.738-1.862 1.813-.298.025-.547.224-.547.522-.05.82.82 2.31 2.012 3.502.82.844 1.788 1.515 2.832 2.036a3 3 0 0 0 2.955 3.528 2.966 2.966 0 0 0 2.931-2.385h2.509c.323 1.689 2.086 2.856 3.974 2.21 1.64-.546 2.36-2.409 1.763-3.924a12.84 12.84 0 0 0 1.838-1.465 10.73 10.73 0 0 0 3.18-7.65c0-2.882-1.118-5.589-3.155-7.625A10.899 10.899 0 0 0 13.218 0zm0 1.217c2.558 0 4.967.994 6.78 2.807a9.525 9.525 0 0 1 2.807 6.78A9.526 9.526 0 0 1 20 17.585a9.647 9.647 0 0 1-6.78 2.807h-2.46a3.008 3.008 0 0 0-2.93-2.41 3.03 3.03 0 0 0-2.534 1.367v.024a8.945 8.945 0 0 1-2.41-1.788c-.844-.844-1.316-1.614-1.515-2.11a2.858 2.858 0 0 0 1.441-.846 2.959 2.959 0 0 0 .795-2.036v-1.789c0-2.11.696-4.197 2.012-5.861 1.863-2.385 4.62-3.726 7.6-3.726zm-2.41 5.986a1.192 1.192 0 0 0-1.191 1.192 1.192 1.192 0 0 0 1.192 1.193A1.192 1.192 0 0 0 12 8.395a1.192 1.192 0 0 0-1.192-1.192zm7.204 0a1.192 1.192 0 0 0-1.192 1.192 1.192 1.192 0 0 0 1.192 1.193 1.192 1.192 0 0 0 1.192-1.193 1.192 1.192 0 0 0-1.192-1.192zm-7.377 4.769a.596.596 0 0 0-.546.845 4.813 4.813 0 0 0 4.346 2.757 4.77 4.77 0 0 0 4.347-2.757.596.596 0 0 0-.547-.845h-.025a.561.561 0 0 0-.521.348 3.59 3.59 0 0 1-3.254 2.061 3.591 3.591 0 0 1-3.254-2.061.64.64 0 0 0-.546-.348z" fill="#33CCFF"/></svg> Waze
                        </a>
                      </div>
                    }
                  </div>
                  @if (q.lat != null && q.lng != null) {
                    <div class="map-section">
                      <app-map-view [lat]="q.lat" [lng]="q.lng" [zoom]="15" />
                    </div>
                  }
                }

                <!-- Row 3: descriptions (question-schema answers + notes) + timer -->
                <div class="pq-foot">
                  <div class="pq-desc">
                    @for (d of (q.descriptions ?? []); track d) {
                      <span class="pq-chip">{{ d }}</span>
                    }
                    @if (q.notes) { <span class="pq-chip note">{{ q.notes }}</span> }
                    @if (!(q.descriptions?.length) && !q.notes) {
                      <span class="muted small">No extra details</span>
                    }
                  </div>
                </div>

                <!-- Post-accept collapse: 3 lines once a proposal has been sent. -->
                @if (q.myProposalId && !q.myProposalIsAuto) {
                  <div class="pq-accepted">
                    <div class="pq-accepted-row">
                      <span class="pq-price">RM {{ (q.myProposalPrice ?? 0) | number: '1.2-2' }}</span>
                      @if (q.myProposalEta != null) {
                        <span class="pq-dur">{{ q.myProposalEta }} min</span>
                      }
                    </div>
                    @if (q.myProposalMessage) {
                      <p class="pq-msg">{{ q.myProposalMessage }}</p>
                    }
                  </div>
                } @else if (!q.myProposalId) {
                  <div class="pq-actions">
                    <div class="pq-propose-inline">
                      <input type="text" class="prop-input prop-msg" placeholder="Message (optional)" [(ngModel)]="proposalMsg" name="pmsg_{{q.quoteId}}" />
                      <input type="number" class="prop-input prop-price" placeholder="RM" [(ngModel)]="price" name="price_{{q.quoteId}}" />
                      <input type="number" class="prop-input prop-dur" placeholder="min" [(ngModel)]="eta" name="eta_{{q.quoteId}}" />
                      <button class="btn-primary btn-sm" (click)="propose(q)" [disabled]="busy() || !price">Accept</button>
                      <button class="btn-ghost btn-sm" (click)="declineQuote(q, $event)" [disabled]="busy()">Decline</button>
                    </div>
                    <app-countdown [deadline]="q.servicerDeadline" />
                  </div>
                }
              </div>
            } @empty {
              <p class="muted small empty">No matching requests.</p>
            }
          </div>
        }
      }

      <!-- ── Active - accepted, not finished ────────────────────────────── -->
      @if (tab() === 'active') {
        @if (loadingJobs()) {
          <p class="muted small">Loading…</p>
        } @else {
          <div class="grid">
            @for (j of filteredActiveJobs(); track j.id) {
              <div class="card item acard">
                <div class="ac-left">
                  <strong class="ac-title">{{ j.scheduledDate | date: 'EEE, MMM d' }} · {{ timeSpan(j) }} · {{ sessionLabel(j) }}</strong>
                  <span class="ac-timer" [class.ac-urgent]="isUrgent(j)">{{ countdown(j) }}</span>
                  <span class="ac-cust">{{ j.customerName ?? '-' }}</span>
                  <div class="ac-price-row">
                    <span class="ac-price">RM {{ j.price | number: '1.2-2' }}</span>
                    <span class="sep">·</span>
                    <span>{{ j.etaMinutes ?? '-' }} min</span>
                    <span class="sep">·</span>
                    <span>{{ formatPaymentMode(j.paymentMode) }}</span>
                    @if (j.distanceKm != null) {
                      <span class="sep">·</span>
                      <span>{{ j.distanceKm | number:'1.1-1' }} km</span>
                    }
                  </div>
                </div>
                <div class="ac-right">
                  <div class="ac-rr">
                    <span [class]="statusBadgeClass(j.status)">{{ j.status }}</span>
                    <button class="btn-ghost btn-sm" (click)="openOverlay(j.id)">Details</button>
                    <button class="btn-ghost btn-sm" (click)="openJobMap(j, 'google')">Map</button>
                  </div>
                  <div class="ac-rr">
                    @if (j.status === 'in_progress') {
                      <button class="btn-primary btn-sm" (click)="openPhotoModal(j, 'done_photo')">Mark done</button>
                    }
                    @if (j.status === 'confirmed') {
                      <button class="btn-primary btn-sm" (click)="openPhotoModal(j, 'arrive_photo')">Mark arrived</button>
                    }
                    @if (j.customerPhone) {
                      <app-wa-button
                        [phone]="j.customerPhone"
                        [body]="'Hi {name}, this is regarding your booking ' + (j.orderId || '') + '. '"
                        [vars]="{ name: j.customerName || '', orderId: j.orderId || '', eta: j.etaMinutes ? (j.etaMinutes + ' min') : '' }"
                        label="WhatsApp"
                      ></app-wa-button>
                    }
                  </div>
                </div>
              </div>
            } @empty {
              <p class="muted small empty">No matching active jobs.</p>
            }
          </div>
        }
      }

      <!-- ── History - completed / cancelled ────────────────────────────── -->
      @if (tab() === 'history') {
        @if (loadingHistory()) {
          <p class="muted small">Loading…</p>
        } @else {
          <div class="jobs-list">
            @for (j of filteredHistoryJobs(); track j.id) {
              <div class="card job-row" (click)="openOverlay(j.id, true)">
                <div class="jr-head">
                  <strong class="jr-title">{{ j.quoteRequest.category.name }}</strong>
                  <span [class]="statusBadgeClass(j.status)">{{ j.status }}</span>
                </div>
                <div class="jr-meta">
                  <span>{{ j.scheduledDate | date: 'mediumDate' }}</span>
                  <span class="sep">·</span>
                  <span>{{ j.timeSlot }}</span>
                  <span class="sep">·</span>
                  <span>{{ j.paymentMode | titlecase }}</span>
                </div>
                <div class="jr-foot">
                  <div class="jr-earn">
                    @if (j.status === 'completed') {
                      <span class="jr-net">RM {{ j.netPrice | number: '1.2-2' }}</span>
                      <span class="jr-gross muted">(of RM {{ j.price | number: '1.2-2' }})</span>
                    } @else {
                      <span class="muted">RM {{ j.price | number: '1.2-2' }}</span>
                    }
                  </div>
                  <div class="jr-actions">
                    @if (j.status === 'completed' && j.paymentMode === 'cash' && !j.cashConfirmed) {
                      <button class="btn-primary btn-cash" (click)="$event.stopPropagation(); cashConfirm(j)">Confirm cash</button>
                    }
                    <button class="btn-ghost btn-sm" (click)="$event.stopPropagation(); openInvoice(j)"><app-icon name="file-text" sizeToken="sm" /> Invoice</button>
                    @if (j.status === 'completed' && j.lat != null && j.lng != null) {
                      <button class="map-link" (click)="$event.stopPropagation(); openJobMap(j, 'google')">Maps</button>
                      <button class="map-link" (click)="$event.stopPropagation(); openJobMap(j, 'waze')">Waze</button>
                    }
                  </div>
                </div>
              </div>
            } @empty {
              <p class="muted empty">No {{ historyFilter() === 'all' ? '' : historyFilter() }} jobs found.</p>
            }
          </div>
        }
      }
    </div>

    <!-- ── Photo upload modal ─────────────────────────────────────────────── -->
    <app-modal
      [open]="photoModalOpen()"
      [title]="photoModalTitle()"
      (closed)="closePhotoModal()"
    >
      <div class="upload-body">
        <p class="muted small">
          Take or upload a photo as evidence. Supported: JPEG, PNG, WEBP (max 10 MB).
        </p>

        <!-- File picker trigger -->
        <label class="btn-ghost file-btn">
          <app-icon name="camera" sizeToken="sm" /> Choose photo…
          <input
            #fileInput
            type="file"
            accept="image/jpeg,image/png,image/webp"
            (change)="onFileChange($event)"
            hidden
          />
        </label>

        <!-- Preview -->
        @if (photoPreview()) {
          <div class="preview-wrap">
            <img [src]="photoPreview()" alt="Preview" class="preview" />
            <span class="preview-name">{{ photoFileName() }}</span>
          </div>
        }

        @if (photoError()) {
          <p class="err">{{ photoError() }}</p>
        }

        <div class="modal-actions">
          <button class="btn-ghost" type="button" (click)="closePhotoModal()">Cancel</button>
          <button
            class="btn-primary"
            type="button"
            [disabled]="!photoFile() || photoUploading()"
            (click)="uploadAndAct()"
          >
            {{ photoUploading() ? uploadStatus() : 'Upload & confirm' }}
          </button>
        </div>
      </div>
    </app-modal>

    <!-- ── Invoice modal ──────────────────────────────────────────────────── -->
    <app-modal
      [open]="invoiceModalOpen()"
      title="Invoice"
      (closed)="invoiceModalOpen.set(false)"
    >
      @if (invoiceLoading()) {
        <p class="muted">Loading invoice…</p>
      } @else if (invoiceError()) {
        <p class="err">{{ invoiceError() }}</p>
      } @else {
        @if (invoiceData(); as inv) {
        <div class="invoice-detail">
          <div class="inv-row">
            <span class="inv-label">Invoice</span>
            <strong>{{ inv.invoiceNumber }}</strong>
          </div>
          <div class="inv-row">
            <span class="inv-label">Total</span>
            <strong>RM {{ inv.total | number: '1.2-2' }}</strong>
          </div>
          <div class="inv-row">
            <span class="inv-label">Issued</span>
            <span>{{ inv.issuedAt | date: 'mediumDate' }}</span>
          </div>
          <div class="inv-row">
            <span class="inv-label">Status</span>
            @if (inv.paidAt) {
              <span class="badge badge-paid">Paid {{ inv.paidAt | date: 'mediumDate' }}</span>
            } @else {
              <span class="badge badge-pending">Unpaid</span>
            }
          </div>
          @if (inv.pdfUrl) {
            <div class="inv-actions">
              <a class="btn-primary" [href]="inv.pdfUrl" target="_blank" rel="noopener noreferrer">
                ⬇ Download PDF
              </a>
              <button class="btn-ghost" (click)="printInvoice(inv)">
                🖨️ Print
              </button>
            </div>
          }
        </div>
        }
      }
    </app-modal>


    <!-- ── Onboarding gate modal ──────────────────────────────────────────── -->
    <app-modal [open]="onboardingRequired()" title="Complete your profile first" (closed)="onboardingRequired.set(false)">
      <p>Before you can take jobs, fill in:</p>
      <ul class="onboarding-list">
        @for (item of missingItems(); track item) {
          <li>• {{ item }}</li>
        }
      </ul>
      <div class="modal-actions">
        <button class="btn-ghost" (click)="onboardingRequired.set(false)">Cancel</button>
        <button class="btn-primary" [routerLink]="routeFor('servicer.account')">Go to Account Settings</button>
      </div>
    </app-modal>

    <!-- ── Dispatch overlay ───────────────────────────────────────────────── -->
    @if (overlayJobId(); as jobId) {
      <app-dispatch-overlay
        [jobId]="jobId"
        [readOnly]="overlayReadOnly()"
        (closed)="overlayJobId.set(null)"
        (actionPerformed)="loadJobs()"
      />
    }

    <!-- ── New order form modal ────────────────────────────────────────────── -->
    <app-new-order-form
      [open]="newOrderOpen()"
      (closed)="newOrderOpen.set(false); loadJobs()"
    />
  `,
    styles: [
        `
      :host { display: block; max-width: 720px; width: 100%; }
      .page-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }
      .new-order-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        white-space: nowrap;
      }
      .tabs {
        display: flex;
        justify-content: center;
        gap: 0.4rem;
        margin-bottom: 1rem;
      }
      .tab {
        background: transparent;
        border: none;
        border-radius: 999px;
        padding: 0.6rem 1.2rem;
        font-size: 0.92rem;
        font-weight: 500;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .tab:hover:not(.active) { color: var(--color-text); background: var(--color-bg); }
      .tab.active {
        background: var(--color-primary);
        background: var(--gradient-sidebar);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 1px 6px rgba(201, 90, 60, 0.2);
      }
      .tab .n {
        font-size: 0.72rem;
        font-weight: 600;
        background: rgba(255, 255, 255, 0.25);
        color: #fff;
        border-radius: 999px;
        padding: 0.05rem 0.5rem;
      }
      .tab:not(.active) .n {
        background: var(--color-border);
        color: var(--color-muted);
      }
      .tab-content {
        animation: fade-in 0.18s ease-out both;
      }
      @keyframes fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 0;
        margin-bottom: 0.8rem;
        flex-wrap: wrap;
        border-bottom: 1px solid var(--color-border);
        background: var(--color-bg);
        transition: padding 0.3s ease, gap 0.3s ease, opacity 0.3s ease, margin 0.3s ease;
      }
      .toolbar.is-collapsed {
        padding-top: 0.1rem;
        padding-bottom: 0.1rem;
        gap: 0.4rem;
        margin-bottom: 0.3rem;
        overflow: hidden;
      }
      .toolbar.is-collapsed .search { height: 1.6rem; font-size: 0.75rem; padding: 0.2rem 0.5rem; }
      .toolbar.is-collapsed .chip { font-size: 0.7rem; padding: 0.625rem 0.625rem; }
      .toolbar.is-idle {
        pointer-events: none;
        padding: 0;
        gap: 0;
        margin-bottom: 0;
        border-bottom: none;
        height: 0;
        min-height: 0;
        overflow: hidden;
        transition: padding 1s ease 4s, gap 1s ease 4s, height 1s ease 4s, margin-bottom 1s ease 4s, border-bottom 1s ease 4s;
      }
      .search {
        flex: 1;
        min-width: 180px;
        max-width: 300px;
        padding: 0.45rem 0.7rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background: var(--color-bg);
        color: var(--color-text);
        font-size: 0.85rem;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s ease;
      }
      .search:focus {
        border-color: var(--color-primary);
      }
      .toolbar select {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-surface);
        color: var(--color-text);
        padding: 0.4rem 0.6rem;
        font-size: 0.82rem;
        outline: none;
        cursor: pointer;
      }
      .toolbar select:focus { border-color: var(--color-primary); }
      .chips {
        display: flex;
        gap: 0.35rem;
        flex-wrap: wrap;
      }
      .chip {
        padding: 0.625rem 0.7rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background: transparent;
        font-size: 0.78rem;
        font-weight: 500;
        cursor: pointer;
        color: var(--color-muted);
        font-family: inherit;
        transition: background var(--transition), color var(--transition), border-color var(--transition);
      }
      .chip:hover:not(.on) {
        border-color: var(--color-primary);
        color: var(--color-primary);
        background: var(--color-surface);
      }
      .chip.on {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
      }
      .grid {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
      }
      .empty {
        grid-column: 1 / -1;
        text-align: center;
        padding: 1rem 0;
      }
      .item {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin: 0;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .item:hover {
        box-shadow: 0 3px 12px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
      }
      .head {
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        border-radius: calc(var(--radius) - 2px);
        padding: 0.25rem;
        margin: -0.25rem;
        transition: background 0.12s ease;
      }
      .head:hover {
        background: rgba(0, 0, 0, 0.03);
      }
      /* ── Pending quote card (3-row layout) ─────────────────────────────── */
      .pq-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.6rem;
        border-radius: calc(var(--radius) - 2px);
        padding: 0.25rem;
        margin: -0.25rem;
        transition: background 0.12s ease;
      }
      .pq-head:hover { background: rgba(0, 0, 0, 0.03); }
      .pq-id { display: flex; align-items: center; gap: 0.55rem; min-width: 0; }
      .pq-id-text { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
      .pq-name { font-size: 0.95rem; line-height: 1.1; }
      .pq-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }
      .pq-tag {
        font-size: 0.72rem;
        font-weight: 500;
        color: var(--color-muted);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.1rem 0.5rem;
        white-space: nowrap;
      }
      .pq-tag.budget { color: var(--color-text); font-weight: 600; }
      .pq-tag.pay { color: var(--color-primary); border-color: var(--color-primary); }
      .avatar-circle.sm, .avatar-fallback.sm { width: 32px; height: 32px; font-size: 0.85rem; }
      .badge-responded { background: var(--color-success); color: #fff; }
      .pq-addr-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-top: 0.5rem;
        font-size: 0.82rem;
        color: var(--color-text);
      }
      .pq-addr { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .pq-map-btn { font-size: 0.75rem; padding: 0.25rem 0.7rem; flex-shrink: 0; }
      .pq-map-links { display: flex; gap: 0.5rem; flex-shrink: 0; }
      .pq-map-links a { font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.25rem; }
      .pq-map-links svg { width: 14px; height: 14px; }
      .map-link {
        background: none;
        border: none;
        color: var(--color-primary);
        cursor: pointer;
        font-size: 0.82rem;
        padding: 0;
        text-decoration: underline;
        font-family: inherit;
      }
      .map-link:hover { color: var(--color-text); }
      .pq-foot {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.6rem;
        margin-top: 0.5rem;
      }
      .pq-desc { display: flex; flex-wrap: wrap; gap: 0.3rem; min-width: 0; }
      .pq-chip {
        font-size: 0.74rem;
        color: var(--color-text);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        padding: 0.12rem 0.5rem;
      }
      .pq-chip.note { font-style: italic; color: var(--color-muted); }
      /* ── Post-accept collapse (3 lines: price · duration + message) ─────── */
      .pq-accepted {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin-top: 0.6rem;
        padding-top: 0.5rem;
        border-top: 1px solid var(--color-border);
      }
      .pq-accepted-row {
        display: flex;
        align-items: baseline;
        gap: 0.6rem;
        flex-wrap: wrap;
      }
      .pq-price { font-weight: 700; color: var(--color-primary); font-size: 1rem; }
      .pq-dur {
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--color-muted);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.1rem 0.55rem;
      }
      .pq-msg { margin: 0; font-size: 0.85rem; color: var(--color-text); line-height: 1.35; }

      /* -- Active card -- two-column layout ------------------------------------ */
      .acard { padding: 0.7rem 0.85rem; display: flex; flex-direction: row; gap: 0.75rem; align-items: flex-start; }
      .ac-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.3rem; }
      .ac-right { display: flex; flex-direction: column; gap: 0.3rem; flex-shrink: 0; }
      .ac-rr { display: flex; align-items: center; gap: 0.35rem; }
      .ac-rr .btn-sm { flex: 1; min-width: 60px; }
      .ac-rr .badge { flex-shrink: 0; }
      .ac-rr app-wa-button { display: block; flex: 1; }
      .ac-rr app-wa-button button { width: 100% !important; box-sizing: border-box; }
      .ac-title { font-size: 1.2rem; font-weight: 700; line-height: 1.25; }
      .ac-timer { font-size: 0.95rem; color: var(--color-muted); }
      .ac-cust { font-size: 1rem; color: var(--color-muted); }
      .ac-price-row { font-size: 0.95rem; display: flex; align-items: baseline; gap: 0.35rem; flex-wrap: wrap; }
      .ac-price { font-weight: 700; color: var(--color-primary); font-size: 1.05rem; }
      .btn-sm { font-size: 0.85rem; padding: 0.4rem 0.75rem; border-radius: var(--radius); line-height: 1.3; min-height: 36px; white-space: nowrap; }
      .sep { color: var(--color-border); }

      .small {
        font-size: 0.8rem;
      }
      .done {
        font-size: 0.75rem;
        color: var(--color-success);
        font-weight: 600;
      }
      .actions {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin-top: 0.4rem;
      }
      .pq-actions {
        display: flex; align-items: center; justify-content: space-between;
        padding: 0.5rem 0; gap: 0.4rem; flex-wrap: nowrap;
      }
      .pq-propose-inline {
        display: flex; align-items: center; gap: 0.35rem; flex: 1; flex-wrap: nowrap; min-width: 0;
      }
      .prop-input {
        border: 1px solid var(--color-border); border-radius: var(--radius);
        padding: 0.3rem 0.4rem; font-size: 0.78rem; font-family: inherit;
        background: var(--color-bg); color: var(--color-text); min-width: 0;
      }
      .prop-input:focus { border-color: var(--color-primary); outline: none; }
      .prop-msg { flex: 2; min-width: 0; }
      .prop-price { flex: 0 0 56px; min-width: 0; }
      .prop-dur { flex: 0 0 46px; min-width: 0; }
      @keyframes slide-down {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* ── Upload modal ─────────────────────────────────────────────────── */
      .upload-body {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
      }
      .file-btn {
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .preview-wrap {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .preview {
        width: 100%;
        max-height: 220px;
        object-fit: contain;
        background: var(--color-bg);
        border-radius: var(--radius);
        border: 1px solid var(--color-border);
      }
      .preview-name {
        font-size: 0.8rem;
        color: var(--color-muted);
        word-break: break-all;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .err {
        color: var(--color-danger);
        font-size: 0.88rem;
      }
      /* ── History tab ─────────────────────────────────────────────────── */
      .summary {
        margin-bottom: 1.2rem;
      }
      .summary-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .range-toggle {
        display: flex;
        gap: 0;
        border: 1px solid var(--color-border);
        border-radius: 6px;
        overflow: hidden;
        width: fit-content;
        margin: 0.3rem 0;
      }
      .range-btn {
        background: transparent;
        border: none;
        padding: 0.2rem 0.6rem;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--color-muted);
        cursor: pointer;
        font-family: inherit;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .range-btn:hover { background: var(--color-bg); }
      .range-btn.on { background: var(--color-primary); color: #fff; }
      .stat-row { display: flex; gap: 1.5rem; flex-wrap: wrap; }
      .stat { display: flex; flex-direction: column; gap: 0.15rem; }
      .stat .n { font-size: 1.2rem; font-weight: 800; color: var(--color-primary); }
      .chart { display: flex; align-items: flex-end; gap: 1px; height: 40px; margin-top: 0.8rem; overflow: hidden; }
      .bar-col { flex: 1 1 0; min-width: 0; height: 100%; display: flex; align-items: flex-end; cursor: pointer; transition: opacity 0.15s; }
      .bar-col:hover { opacity: 0.75; }
      .bar-selected .bar { filter: brightness(1.2); opacity: 1; }
      .bar-track { width: 100%; height: 100%; display: flex; align-items: flex-end; }
      .bar { width: 100%; min-height: 2px; background: var(--color-primary); opacity: 0.6; border-radius: 3px 3px 0 0; }
      .chart-labels { display: flex; justify-content: space-between; font-size: 0.68rem; color: var(--color-muted); margin-top: 0.2rem; }
      .day-filter { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; color: var(--color-muted); margin-top: 0.3rem; }

      .jobs-list { display: flex; flex-direction: column; gap: 0.5rem; }
      .job-row { display: flex; flex-direction: column; gap: 0; cursor: pointer; transition: box-shadow var(--transition), transform var(--transition); }
      .job-row:hover { box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09); transform: translateY(-1px); }
      .sep { color: var(--color-border); }
      .btn-cash { font-size: 0.75rem; padding: 0.625rem 0.7rem; }
      .jr-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
      .jr-title { font-size: 0.95rem; }
      .jr-meta { display: flex; align-items: center; gap: 0.3rem; font-size: 0.78rem; color: var(--color-muted); margin-top: 0.2rem; flex-wrap: wrap; }
      .jr-foot { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 0.5rem; flex-wrap: wrap; }
      .jr-earn { display: flex; align-items: baseline; gap: 0.35rem; }
      .jr-net { font-weight: 700; color: var(--color-primary); font-size: 1rem; }
      .jr-gross { font-size: 0.75rem; text-decoration: line-through; }
      .jr-actions { display: flex; align-items: center; gap: 0.4rem; }
      .load-err { color: var(--color-danger); padding: 0.5rem 0; font-size: 0.88rem; }
      .warn { font-size: 0.72rem; color: var(--color-warning); font-weight: 600; }
      .btn-sm { font-size: 0.82rem; padding: 0.625rem 0.7rem; }
      .job-detail {
        margin-top: 0.6rem;
        padding-top: 0.6rem;
        border-top: 1px solid var(--color-border);
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        animation: slide-down 0.18s ease-out both;
      }
      .detail-row {
        display: flex;
        gap: 0.5rem;
        font-size: 0.85rem;
      }
      .detail-label {
        color: var(--color-muted);
        font-weight: 500;
        min-width: 80px;
        flex-shrink: 0;
      }
      .map-section { margin: 0.5rem 0; }
      .inv-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
      .invoice-detail { display: flex; flex-direction: column; gap: 0.8rem; }
      .inv-row { display: flex; justify-content: space-between; align-items: center; }
      .inv-label { color: var(--color-muted); font-size: 0.88rem; }

      /* ── Avatar ──────────────────────────────────────────────────────────── */
      .avatar-circle {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
      }
      .avatar-fallback {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--color-accent);
        color: white;
        font-weight: 600;
        font-size: 1rem;
      }
      /* ── Onboarding gate modal ──────────────────────────────────────────── */
      .onboarding-list { margin: 0 0 0.7rem; padding-left: 1.2rem; }
      .onboarding-list li { margin-bottom: 0.3rem; font-size: 0.9rem; }
      .modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
    `,
    ]
})
export class ServicerJobsComponent implements OnInit, OnDestroy {
  routeFor = routeFor;
  protected readonly statusBadgeClass = statusBadgeClass;
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private socket = inject(SocketService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  @ViewChild('fileInput') fileInputRef?: ElementRef<HTMLInputElement>;

  tab = signal<'pending' | 'active' | 'history'>('pending');
  quotes = signal<IncomingQuote[]>([]);
  jobs = signal<Job[]>([]);
  loadingQuotes = signal(true);
  loadingJobs = signal(true);

  search = signal('');
  sortBy = signal<'date' | 'price_high' | 'price_low'>('date');
  pendingFilter = signal<'all' | 'new' | 'responded'>('all');
  activeFilter = signal<'all' | 'confirmed' | 'in_progress'>('all');

  filteredQuotes = computed(() => {
    const q = this.quotes();
    const s = this.search().toLowerCase();
    const f = this.pendingFilter();
    const sb = this.sortBy();
    let list = q.filter((item) => {
      if (s && !item.category.toLowerCase().includes(s)) return false;
      if (f === 'new' && item.myProposalId) return false;
      if (f === 'responded' && !item.myProposalId) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sb === 'price_high') return (b.budgetMax ?? 0) - (a.budgetMax ?? 0);
      if (sb === 'price_low') return (a.budgetMin ?? 0) - (b.budgetMin ?? 0);
      return b.servicerDeadline.localeCompare(a.servicerDeadline);
    });
    return list;
  });

  filteredActiveJobs = computed(() => {
    const j = this.activeJobs();
    const s = this.search().toLowerCase();
    const f = this.activeFilter();
    const sb = this.sortBy();
    let list = j.filter((item) => {
      if (s && !item.quoteRequest.category.name.toLowerCase().includes(s)) return false;
      if (f !== 'all' && item.status !== f) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sb === 'price_high') return b.price - a.price;
      if (sb === 'price_low') return a.price - b.price;
      return b.scheduledDate.localeCompare(a.scheduledDate);
    });
    return list;
  });

  // History tab
  historyFilter = signal<'all' | 'completed' | 'cancelled'>('all');
  historyJobs = signal<Job[]>([]);
  loadingHistory = signal(true);
  daily = signal<DailyEarning[]>([]);
  loadingEarnings = signal(true);
  earningsFailed = signal(false);
  earningsDays = signal(30);
  selectedDay = signal<string | null>(null);


  setEarningsRange(days: number): void {
    this.earningsDays.set(days);
    this.selectedDay.set(null);
    this.loadingEarnings.set(true);
    this.earningsFailed.set(false);
    this.loadEarnings();
  }

  historySummary = computed(() => {
    const rows = this.daily();
    return {
      totalEarnings: rows.reduce((s, r) => s + Number(r.earnings), 0),
      totalJobs: rows.reduce((s, r) => s + Number(r.jobs), 0),
    };
  });

  filteredHistoryJobs = computed(() => {
    const f = this.historyFilter();
    const sd = this.selectedDay();
    const sb = this.sortBy();
    let all = this.historyJobs();
    if (f !== 'all') all = all.filter((j) => j.status === f);
    if (sd) all = all.filter((j) => {
      const date = (j.cashConfirmedAt ?? j.doneAt ?? j.scheduledDate)?.slice(0, 10);
      return date === sd;
    });
    all = [...all].sort((a, b) => {
      if (sb === 'price_high') return b.price - a.price;
      if (sb === 'price_low') return a.price - b.price;
      return b.scheduledDate.localeCompare(a.scheduledDate);
    });
    return all;
  });

  chartDays = computed(() => this.daily());

  overlayJobId = signal<string | null>(null);
  overlayReadOnly = signal(false);

  // ── New order form ────────────────────────────────────────────────────────
  newOrderOpen = signal(false);

  // ── Onboarding gate ───────────────────────────────────────────────────────
  onboardingRequired = signal(false);
  missingItems = signal<string[]>([]);
  redirectUrl = signal('');

  openOverlay(id: string, readOnly = false): void {
    this.overlayJobId.set(id);
    this.overlayReadOnly.set(readOnly);
  }

  busy = signal(false);
  price?: number;
  eta?: number;
  proposalMsg = '';

  /** Proposal price pre-fills keyed by quoteId. Populated when a quote is opened. */
  pricingModules = signal<PricingModule[]>([]);
  moduleRefs = signal<ModuleRef[]>([]);

  activeJobs = computed(() => this.jobs().filter((j) => ACTIVE.includes(j.status)));
  pendingJobs = computed(() => this.jobs().filter((j) => j.status === 'pending_confirm'));

  // ── Photo upload modal state ────────────────────────────────────────────
  photoModalOpen = signal(false);
  photoFile = signal<File | null>(null);
  photoPreview = signal<string | null>(null);
  photoFileName = signal('');
  photoError = signal('');
  photoUploading = signal(false);
  uploadStatus = signal('Uploading…');

  private photoTargetJob: Job | null = null;
  private photoTargetPurpose: PhotoPurpose = 'arrive_photo';

  photoModalTitle = computed(() =>
    this.photoTargetPurpose === 'arrive_photo' ? 'Upload arrival photo' : 'Upload completion photo',
  );

  // ── Report modal state ──────────────────────────────────────────────────
  reportModalOpen = signal(false);
  reportSubject = signal('');
  reportDescription = signal('');
  reportError = signal('');
  reportSubmitting = signal(false);
  private reportTargetJobId = signal<string | null>(null);

  // ── Invoice modal state ─────────────────────────────────────────────────
  invoiceModalOpen = signal(false);
  invoiceData = signal<{ invoiceNumber: string; total: number; issuedAt: string; paidAt: string | null; pdfUrl: string | null } | null>(null);
  invoiceLoading = signal(false);
  invoiceError = signal('');

  openInvoice(j: Job): void {
    this.invoiceData.set(null);
    this.invoiceError.set('');
    this.invoiceLoading.set(true);
    this.invoiceModalOpen.set(true);
    this.api.get<{ invoiceNumber: string; total: number; issuedAt: string; paidAt: string | null; pdfUrl: string | null }>(`/servicer/me/invoices/by-booking/${j.id}`).subscribe({
      next: (inv) => {
        this.invoiceData.set(inv);
        this.invoiceLoading.set(false);
      },
      error: (e) => {
        this.invoiceError.set(e.message ?? 'Invoice not available');
        this.invoiceLoading.set(false);
      },
    });
  }

  printInvoice(inv: { invoiceNumber: string; total: number; issuedAt: string; paidAt: string | null; pdfUrl: string | null }): void {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>${inv.invoiceNumber}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 2rem; max-width: 600px; margin: auto; }
        h1 { font-size: 1.4rem; margin-bottom: 1.5rem; }
        .row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #eee; }
        .label { color: #666; }
        .total { font-size: 1.2rem; font-weight: 700; margin-top: 1rem; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>${inv.invoiceNumber}</h1>
      <div class="row"><span class="label">Total</span><strong>RM ${Number(inv.total).toFixed(2)}</strong></div>
      <div class="row"><span class="label">Issued</span><span>${new Date(inv.issuedAt).toLocaleDateString()}</span></div>
      <div class="row"><span class="label">Status</span><span>${inv.paidAt ? 'Paid - ' + new Date(inv.paidAt).toLocaleDateString() : 'Unpaid'}</span></div>
      <script>window.print();<\/script>
      </body></html>
    `);
    win.document.close();
  }

  private sub?: Subscription;
  private subs: Subscription[] = [];

  /** True until the route's query params have hydrated the local signals, so the
   *  sync effect does not write back a half-built URL during init. */
  private hydrated = false;

  constructor() {
    // OUT: mirror filter / sort / search signal state into the URL query params
    // so the view is bookmarkable and shareable. Reads run on every signal change.
    effect(() => {
      const params = this.computeQueryParams();
      if (!this.hydrated) return;
      const current = this.route.snapshot.queryParams;
      if (this.sameParams(current, params)) return;
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: params,
        replaceUrl: true,
      });
    });
  }

  /** Build the query-param object from current signal state for the active tab.
   *  Default values (all / date / 30) are omitted so they drop out of the URL. */
  private computeQueryParams(): Params {
    const t = this.tab();
    const p: Params = {};
    const s = this.search().trim();
    if (s) p['search'] = s;
    if (this.sortBy() !== 'date') p['sort'] = this.sortBy();
    if (t === 'pending' && this.pendingFilter() !== 'all') p['filter'] = this.pendingFilter();
    if (t === 'active' && this.activeFilter() !== 'all') p['filter'] = this.activeFilter();
    if (t === 'history') {
      if (this.historyFilter() !== 'all') p['filter'] = this.historyFilter();
      if (this.earningsDays() !== 30) p['days'] = String(this.earningsDays());
    }
    return p;
  }

  private sameParams(a: Params, b: Params): boolean {
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => String(a[k]) === String(b[k]));
  }

  /** IN: seed the local signals from the route's segment (tab) + query params. */
  private hydrateFromRoute(): void {
    const t = (this.route.snapshot.data['tab'] as 'pending' | 'active' | 'history') ?? 'pending';
    this.tab.set(t);

    const qp = this.route.snapshot.queryParamMap;
    const search = qp.get('search');
    if (search) this.search.set(search);
    const sort = qp.get('sort');
    if (sort === 'price_high' || sort === 'price_low') this.sortBy.set(sort);

    const filter = qp.get('filter');
    if (t === 'pending' && (filter === 'new' || filter === 'responded')) {
      this.pendingFilter.set(filter);
    } else if (
      t === 'active' &&
      (filter === 'confirmed' || filter === 'in_progress')
    ) {
      this.activeFilter.set(filter);
    } else if (t === 'history' && (filter === 'completed' || filter === 'cancelled')) {
      this.historyFilter.set(filter);
    }
    if (t === 'history' && qp.get('days') === '7') this.earningsDays.set(7);

    this.hydrated = true;
  }

  ngOnInit(): void {
    // Seed state from the URL before loading so loaders (e.g. earnings) honour it.
    this.hydrateFromRoute();

    // Deep link /servicer/jobs/:id — open the dispatch overlay for that job.
    if (this.route.snapshot.data['detail']) {
      const id = this.route.snapshot.paramMap.get('id');
      if (id) this.openOverlay(id);
    }

    this.loadQuotes();
    this.loadJobs();
    this.loadHistoryJobs();
    this.loadEarnings();
    this.loadPricingModules();
    this.sub = this.socket.on<{ quoteId: string }>('quote.new').subscribe(() => this.loadQuotes());
    // A customer accepted a proposal: the winning servicer gets a new active job;
    // every servicer's pending list must drop the now-matched quote. Refresh both.
    this.subs.push(
      this.socket.on<{ bookingId: string }>('job.new').subscribe(() => {
        this.loadJobs();
        this.loadQuotes();
      }),
      this.socket.on<{ quoteId: string }>('quote.matched').subscribe(() => this.loadQuotes()),
    );
  }

  private loadPricingModules(): void {
    this.api.get<{ data: PricingModule[] }>('/servicer/pricing-modules?active=true').subscribe({
      next: (r) => this.pricingModules.set(r.data ?? []),
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.subs.forEach((s) => s.unsubscribe());
  }

  private loadQuotes(): void {
    this.api.get<{ data: IncomingQuote[] }>('/servicer/quotes').subscribe({
      next: (r) => {
        this.quotes.set(r.data);
        this.loadingQuotes.set(false);
      },
      error: () => this.loadingQuotes.set(false),
    });
  }

  loadJobs(): void {
    this.api.get<{ data: Job[] }>('/servicer/jobs').subscribe({
      next: (r) => {
        this.jobs.set(r.data);
        this.loadingJobs.set(false);
      },
      error: () => this.loadingJobs.set(false),
    });
  }

  private loadHistoryJobs(): void {
    this.api.get<{ data: Job[] }>('/servicer/jobs', { status: 'completed' }).subscribe({
      next: (r) => {
        const completed = r.data ?? [];
        this.api.get<{ data: Job[] }>('/servicer/jobs', { status: 'cancelled' }).subscribe({
          next: (c) => {
            const all = [...completed, ...(c.data ?? [])].sort(
              (a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime(),
            );
            this.historyJobs.set(all);
            this.loadingHistory.set(false);
          },
          error: () => {
            this.historyJobs.set(completed);
            this.loadingHistory.set(false);
          },
        });
      },
      error: () => this.loadingHistory.set(false),
    });
  }

  private loadEarnings(): void {
    this.api.get<{ data: DailyEarning[] }>('/servicer/me/earnings/daily', { days: String(this.earningsDays()) }).subscribe({
      next: (r) => {
        this.daily.set(r.data ?? []);
        this.loadingEarnings.set(false);
      },
      error: () => {
        this.loadingEarnings.set(false);
        this.earningsFailed.set(true);
      },
    });
  }

  barHeight(earnings: number): number {
    const max = Math.max(...this.chartDays().map((d) => Number(d.earnings)), 1);
    return Math.round((Number(earnings) / max) * 100);
  }

  filterByDay(date: string): void {
    this.selectedDay.set(this.selectedDay() === date ? null : date);
  }

  /** Extract first-letter initials from a name for avatar fallback. */
  initials(name?: string | null): string {
    return (name ?? '?').charAt(0).toUpperCase();
  }

  // ── Active card session/timer helpers ───────────────────────────────────────
  private readonly TIME_SLOT_HOURS: Record<string, [number, number]> = {
    morning: [8, 12], noon: [12, 14], afternoon: [14, 17], evening: [17, 20], night: [20, 23],
  };

  sessionLabel(j: Job): string {
    const slot = j.timeSlot ?? 'morning';
    return slot.charAt(0).toUpperCase() + slot.slice(1) + ' session';
  }

  timeSpan(j: Job): string {
    const [start, end] = this.TIME_SLOT_HOURS[j.timeSlot] ?? [8, 12];
    return `${start}:00 – ${end}:00`;
  }

  countdown(j: Job): string {
    const d = new Date(j.scheduledDate);
    const [hour] = this.TIME_SLOT_HOURS[j.timeSlot] ?? [8, 12];
    d.setHours(hour, 0, 0, 0);
    const diff = d.getTime() - Date.now();
    if (j.status === 'in_progress') {
      if (diff < -3600000) return `Started ${this.fmtDelta(-diff)} ago`;
      return 'Ongoing';
    }
    if (diff <= 0) return 'Overdue';
    return `Starts in ${this.fmtDelta(diff)}`;
  }

  isUrgent(j: Job): boolean {
    const d = new Date(j.scheduledDate);
    const [hour] = this.TIME_SLOT_HOURS[j.timeSlot] ?? [8, 12];
    d.setHours(hour, 0, 0, 0);
    return d.getTime() - Date.now() < 3600000; // < 1 hour
  }

  private fmtDelta(ms: number): string {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  formatPaymentMode(mode: string): string {
    return this.PAY_LABELS[mode] ?? mode;
  }

  /** Placeholder distance — will be replaced with actual Haversine calc when servicer coords available. */
  computeDistance(j: Job): string {
    return '-';
  }

  // ── Pending card helpers ───────────────────────────────────────────────────
  private readonly PAY_LABELS: Record<string, string> = {
    pay_now: 'Pay now',
    pay_later: 'Pay later',
    cash: 'Cash',
    credit: 'Credit',
  };

  payLabel(mode?: string | null): string {
    if (!mode) return '';
    return this.PAY_LABELS[mode] ?? mode.replace(/_/g, ' ');
  }

  /** "No./Street, Postcode District" from the quote's address parts. */
  composedAddress(q: IncomingQuote): string {
    const tail = [q.postcode, q.district].filter(Boolean).join(' ');
    return [q.address, tail].filter(Boolean).join(', ');
  }

  gmapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  wazeUrl(lat: number, lng: number): string {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }

  // ── Pending column - propose on a quote ────────────────────────────────────
  isModuleSelected(moduleId: string): boolean {
    return this.moduleRefs().some((r) => r.moduleId === moduleId);
  }

  toggleModule(mod: PricingModule, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    let refs = [...this.moduleRefs()];
    if (checked) {
      if (!refs.some((r) => r.moduleId === mod.id)) {
        refs = [...refs, { moduleId: mod.id, priceOverride: null }];
      }
    } else {
      refs = refs.filter((r) => r.moduleId !== mod.id);
    }
    this.moduleRefs.set(refs);
  }

  getModuleOverride(moduleId: string): number | null {
    return this.moduleRefs().find((r) => r.moduleId === moduleId)?.priceOverride ?? null;
  }

  setModuleOverride(moduleId: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    const val = target.value ? Number(target.value) : null;
    this.moduleRefs.update((refs) =>
      refs.map((r) =>
        r.moduleId === moduleId ? { ...r, priceOverride: val } : r,
      ),
    );
  }

  propose(q: IncomingQuote): void {
    if (!this.price || this.price <= 0) {
      this.toast.error('Enter a valid price.');
      return;
    }
    this.busy.set(true);

    // Build lineItems from selected modules.
    const refs = this.moduleRefs().filter((r) => r.moduleId);
    const lineItems: { label: string; amount: number; taxable?: boolean; serviceChargeable?: boolean }[] = [];
    for (const ref of refs) {
      const mod = this.pricingModules().find((m) => m.id === ref.moduleId);
      if (mod) {
        lineItems.push({
          label: mod.label,
          amount: ref.priceOverride ?? mod.defaultPrice,
          taxable: mod.taxable,
          serviceChargeable: mod.serviceChargeable,
        });
      }
    }

    const body: Record<string, unknown> = {
      proposedPrice: this.price,
      etaMinutes: this.eta,
      message: this.proposalMsg || undefined,
    };
    if (lineItems.length > 0) body['lineItems'] = lineItems;
    if (refs.length > 0) body['moduleRefs'] = refs;
    this.api
      .post(`/servicer/quotes/${q.quoteId}/propose`, body)
      .subscribe({
        next: () => {
          this.price = undefined;
          this.eta = undefined;
          this.proposalMsg = '';
          this.moduleRefs.set([]);
          this.busy.set(false);
          this.toast.success('Proposal sent.');
          this.loadQuotes();
        },
        error: (e) => {
          this.busy.set(false);
          // Check for onboarding gate response
          if (e.error?.missing && Array.isArray(e.error.missing)) {
            this.missingItems.set(e.error.missing.map((m: string) => m.replace(/_/g, ' ')));
            this.redirectUrl.set(e.error.redirectUrl ?? '/servicer/account');
            this.onboardingRequired.set(true);
          } else {
            this.toast.error(e.message ?? 'Could not submit proposal');
          }
        },
      });
  }

  async declineQuote(q: IncomingQuote, event: Event): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.dialog.prompt(
      'Decline this quote request?',
      {
        detail: 'You will not be able to receive this job request again after declining.',
        confirmLabel: 'Yes, decline',
      },
    ).toPromise();
    if (!confirmed) return;

    this.busy.set(true);
    this.api.post(`/quotes/${q.quoteId}/decline`, {}).subscribe({
      next: () => {
        this.quotes.set(this.quotes().filter(p => p.quoteId !== q.quoteId));
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e.error?.message ?? 'Decline failed');
      },
      complete: () => this.busy.set(false),
    });
  }

  // ── Active column - job lifecycle ──────────────────────────────────────────
  private act(path: string, body: unknown, okMsg: string): void {
    this.api.post(path, body).subscribe({
      next: () => {
        this.toast.success(okMsg);
        this.loadJobs();
      },
      error: (e) => this.toast.error(e.message ?? 'Action failed'),
    });
  }

  /** Capture GPS position, then call arrive/done with coords included. */
  private captureGpsThenAct(jobId: string, photoUrl: string, purpose: 'arrive_photo' | 'done_photo'): void {
    const path = purpose === 'arrive_photo'
      ? `/servicer/jobs/${jobId}/arrive`
      : `/servicer/jobs/${jobId}/done`;
    const okMsg = purpose === 'arrive_photo' ? 'Marked as arrived.' : 'Marked as done.';

    if (!navigator.geolocation) {
      // No GPS — fall back to legacy behavior
      this.act(path, { photoUrl }, okMsg);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.act(path, {
          photoUrl,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }, okMsg);
      },
      (err) => {
        // GPS denied or unavailable — proceed without coords
        console.warn('GPS unavailable for arrive/done:', err.message);
        this.act(path, { photoUrl }, okMsg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  cashConfirm(j: Job): void {
    this.act(`/servicer/jobs/${j.id}/cash-confirm`, {}, 'Cash confirmed.');
  }

  /** Open job location in Google Maps or Waze in a new tab. */
  openJobMap(j: Job, app: 'google' | 'waze'): void {
    const hasCoords = j.lat != null && j.lng != null;
    if (!hasCoords) return;
    const url = app === 'waze'
      ? `https://waze.com/ul?ll=${j.lat},${j.lng}&navigate=yes`
      : `https://www.google.com/maps/dir/?api=1&destination=${j.lat},${j.lng}`;
    window.open(url, '_blank', 'noopener');
  }

  cancel(j: Job): void {
    this.dialog
      .prompt('Reason for cancelling?', {
        detail: 'Note: cancelling a confirmed job may trigger a penalty.',
        placeholder: 'Enter reason…',
        confirmLabel: 'Cancel job',
      })
      .subscribe((reason) => {
        if (!reason) return;
        this.act(`/servicer/jobs/${j.id}/cancel`, { reason }, 'Job cancelled.');
      });
  }

  // ── Photo upload flow ──────────────────────────────────────────────────────

  openPhotoModal(j: Job, purpose: PhotoPurpose): void {
    this.photoTargetJob = j;
    this.photoTargetPurpose = purpose;
    this.photoFile.set(null);
    this.photoPreview.set(null);
    this.photoFileName.set('');
    this.photoError.set('');
    this.photoUploading.set(false);
    this.photoModalOpen.set(true);
  }

  closePhotoModal(): void {
    if (this.photoUploading()) return; // don't close mid-upload
    this.photoModalOpen.set(false);
    // Reset the file input so the same file can be re-selected if needed.
    if (this.fileInputRef) this.fileInputRef.nativeElement.value = '';
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.photoError.set('');

    if (!file) return;

    // Validate size (10 MB cap)
    if (file.size > 10 * 1024 * 1024) {
      this.photoError.set('File is too large - maximum size is 10 MB.');
      input.value = '';
      return;
    }

    this.photoFile.set(file);
    this.photoFileName.set(file.name);

    // Generate a local preview
    const reader = new FileReader();
    reader.onload = (e) => this.photoPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  uploadAndAct(): void {
    const file = this.photoFile();
    const job = this.photoTargetJob;
    if (!file || !job) return;

    this.photoUploading.set(true);
    this.photoError.set('');

    // Step 1 - get a presigned upload URL from the backend
    this.uploadStatus.set('Requesting upload URL…');
    this.api
      .post<{ uploadUrl: string; fileId: string }>('/files/presign', {
        purpose: this.photoTargetPurpose,
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
      })
      .pipe(
        // Step 2 - PUT the file directly to S3
        switchMap(({ uploadUrl, fileId }) => {
          this.uploadStatus.set('Uploading photo…');
          return this.http
            .put(uploadUrl, file, {
              headers: { 'Content-Type': file.type || 'image/jpeg' },
            })
            .pipe(
              // Step 3 - confirm the upload with the backend
              switchMap(() => {
                this.uploadStatus.set('Confirming upload…');
                return this.api.post<{ fileUrl: string }>(`/files/${fileId}/confirm`, {});
              }),
            );
        }),
      )
      .subscribe({
        next: ({ fileUrl }) => {
          this.photoUploading.set(false);
          this.photoModalOpen.set(false);

          // Step 4 - capture GPS, then post the job status update
          const purpose = this.photoTargetPurpose;
          this.captureGpsThenAct(job.id, fileUrl, purpose);
        },
        error: (e) => {
          this.photoUploading.set(false);
          this.photoError.set(e.message ?? 'Upload failed - please try again.');
        },
      });
  }

  // ── Report issue ──────────────────────────────────────────────────────────
  openReportModal(jobId: string, event: MouseEvent): void {
    event.stopPropagation();
    this.reportTargetJobId.set(jobId);
    this.reportSubject.set('');
    this.reportDescription.set('');
    this.reportError.set('');
    this.reportModalOpen.set(true);
  }

  closeReportModal(): void {
    this.reportModalOpen.set(false);
    this.reportError.set('');
  }

  submitReport(): void {
    const jobId = this.reportTargetJobId();
    if (!jobId) return;
    const subject = this.reportSubject()?.trim();
    const desc = this.reportDescription()?.trim();
    if (!subject) { this.reportError.set('Please enter a subject.'); return; }
    if (!desc) { this.reportError.set('Please enter a description.'); return; }
    this.reportSubmitting.set(true);
    this.api.post(`/servicer/jobs/${jobId}/report`, { subject, description: desc }).subscribe({
      next: () => {
        this.reportSubmitting.set(false);
        this.reportModalOpen.set(false);
        this.toast.success('Report submitted. Admin will review it.');
      },
      error: (e) => {
        this.reportSubmitting.set(false);
        this.reportError.set(e.message ?? 'Failed to submit report');
      },
    });
  }
}
