import { Component, Input, Output, EventEmitter, ElementRef, viewChild, effect, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { routeFor } from '../core/route-for';
import { ApiService } from '../core/services/api.service';
import { ToastService } from '../core/services/toast.service';
import { MapViewComponent } from './map-view.component';
import { IconComponent } from './icon.component';
import QRCode from 'qrcode';

interface JobDetail {
  id: string; status: string; price: number; paymentMode: string;
  lineItems?: { label: string; amount: number }[] | null;
  scheduledDate: string; timeSlot: string;
  customerName?: string; customerPhone?: string; customerAvatarUrl?: string;
  address?: string; lat?: number | null; lng?: number | null;
  propertyType?: string; contactName?: string; contactNumber?: string;
  instructions?: string; arrivedPhotoUrl?: string; donePhotoUrl?: string;
  arrivePhotoUrl?: string;
  serviceDetails?: Record<string, unknown> | null;
  quoteRequest: { category: { name: string } };
  servicerEmail?: string;
  servicerPhone?: string;
  showEmailPublic?: boolean;
  showPhonePublic?: boolean;
}

@Component({
    selector: 'app-dispatch-overlay',
    imports: [CommonModule, FormsModule, RouterLink, MapViewComponent, IconComponent],
    template: `
    <dialog #mainDlg class="dispatch-dialog wide-dlg" (mousedown)="onDown($event)" (mouseup)="onUp($event, 'main')" (cancel)="$event.preventDefault(); close()">
      @if (open()) {
        <div class="dispatch-overlay" role="dialog" aria-modal="true">

          <div class="dispatch-hd">
            <strong><app-icon name="clipboard-list" sizeToken="sm" /> Booking #{{ jobData()?.id?.slice(-8) }}</strong>
            <span class="status-badge">{{ jobData()?.status }}</span>
            <button class="dispatch-close" (click)="close()" aria-label="Close">&times;</button>
          </div>

          @if (loading()) {
            <p class="muted" style="padding: 2rem; text-align: center;">Loading job details&hellip;</p>
          } @else if (loadFailed()) {
            <p class="err" style="padding: 2rem; text-align: center;">Could not load job details.</p>
          } @else {
            @if (jobData(); as jd) {
            <div class="dispatch-grid" [class.mobile]="isMobile()">

              <section class="dispatch-panel customer-panel">
                <button class="panel-header" (click)="togglePanel('customer')">
                  Customer @if (expanded()['customer']) { <app-icon name="chevron-up" sizeToken="sm" /> } @else { <app-icon name="chevron-down" sizeToken="sm" /> }
                </button>
                @if (expanded()['customer']) {
                  <div class="panel-body">
                    <div class="customer-avatar-row">
                      @if (jd.customerAvatarUrl) {
                        <img [src]="jd.customerAvatarUrl" alt="" class="avatar" />
                      } @else {
                        <div class="avatar-fallback">{{ initials(jd.customerName) }}</div>
                      }
                      <strong>{{ jd.customerName }}</strong>
                    </div>
                    <div class="info-rows">
                      @if (jd.customerPhone) {
                        <div class="info-row"><app-icon name="phone" sizeToken="sm" /><a [href]="'tel:' + jd.customerPhone">{{ jd.customerPhone }}</a> <a [href]="waLink(jd.customerPhone)" target="_blank" rel="noopener" class="btn-wa">WhatsApp</a></div>
                      }
                      <div class="info-row"><app-icon name="map-pin" sizeToken="sm" /> {{ jd.address }}</div>
                      @if (jd.propertyType) {
                        <div class="info-row"><app-icon name="home" sizeToken="sm" /> {{ jd.propertyType }}</div>
                      }
                      @if (jd.contactName && jd.contactName !== jd.customerName) {
                        <div class="info-row"><app-icon name="user" sizeToken="sm" /> Contact: {{ jd.contactName }}{{ jd.contactNumber ? ' · ' + jd.contactNumber : '' }}</div>
                      }
                    </div>
                  </div>
                }
              </section>

              <section class="dispatch-panel instructions-panel">
                <button class="panel-header" (click)="togglePanel('instructions')">
                  Instructions @if (expanded()['instructions']) { <app-icon name="chevron-up" sizeToken="sm" /> } @else { <app-icon name="chevron-down" sizeToken="sm" /> }
                </button>
                @if (expanded()['instructions']) {
                  <div class="panel-body">
                    @if (jd.instructions) {
                      <div class="instructions-text">{{ jd.instructions }}</div>
                    } @else {
                      <p class="muted">No special instructions.</p>
                    }
                  </div>
                }
              </section>

              <section class="dispatch-panel map-panel">
                <button class="panel-header" (click)="togglePanel('map')">
                  Map @if (expanded()['map']) { <app-icon name="chevron-up" sizeToken="sm" /> } @else { <app-icon name="chevron-down" sizeToken="sm" /> }
                </button>
                @if (expanded()['map']) {
                  <div class="panel-body">
                    @if (jd.lat != null && jd.lng != null) {
                      <app-map-view [lat]="jd.lat" [lng]="jd.lng" class="mini-map" />
                      <div class="map-actions">
                        <a class="btn-ghost" [href]="gmapsUrl(jd.lat!, jd.lng!)" target="_blank" rel="noopener"><svg width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-3px;margin-right:4px;"><path d="M19.527 4.799c1.212 2.608.937 5.678-.405 8.173-1.101 2.047-2.744 3.74-4.098 5.614-.619.858-1.244 1.75-1.669 2.727-.141.325-.263.658-.383.992-.121.333-.224.673-.34 1.008-.109.314-.236.684-.627.687h-.007c-.466-.001-.579-.53-.695-.887-.284-.874-.581-1.713-1.019-2.525-.51-.944-1.145-1.817-1.79-2.671L19.527 4.799zM8.545 7.705l-3.959 4.707c.724 1.54 1.821 2.863 2.871 4.18.247.31.494.622.737.936l4.984-5.925-.029.01c-1.741.601-3.691-.291-4.392-1.987a3.377 3.377 0 0 1-.209-.716c-.063-.437-.077-.761-.004-1.198l.001-.007zM5.492 3.149l-.003.004c-1.947 2.466-2.281 5.88-1.117 8.77l4.785-5.689-.058-.05-3.607-3.035zM14.661.436l-3.838 4.563a.295.295 0 0 1 .027-.01c1.6-.551 3.403.15 4.22 1.626.176.319.323.683.377 1.045.068.446.085.773.012 1.22l-.003.016 3.836-4.561A8.382 8.382 0 0 0 14.67.439l-.009-.003zM9.466 5.868L14.162.285l-.047-.012A8.31 8.31 0 0 0 11.986 0a8.439 8.439 0 0 0-6.169 2.766l-.016.018 3.665 3.084z" fill="#4285F4"/></svg> Google Maps</a>
                        <a class="btn-ghost" [href]="wazeUrl(jd.lat!, jd.lng!)" target="_blank" rel="noopener"><svg width="16" height="16" viewBox="0 0 24 24" style="vertical-align:-3px;margin-right:4px;"><path d="M13.218 0C9.915 0 6.835 1.49 4.723 4.148c-1.515 1.913-2.31 4.272-2.31 6.706v1.739c0 .894-.62 1.738-1.862 1.813-.298.025-.547.224-.547.522-.05.82.82 2.31 2.012 3.502.82.844 1.788 1.515 2.832 2.036a3 3 0 0 0 2.955 3.528 2.966 2.966 0 0 0 2.931-2.385h2.509c.323 1.689 2.086 2.856 3.974 2.21 1.64-.546 2.36-2.409 1.763-3.924a12.84 12.84 0 0 0 1.838-1.465 10.73 10.73 0 0 0 3.18-7.65c0-2.882-1.118-5.589-3.155-7.625A10.899 10.899 0 0 0 13.218 0zm0 1.217c2.558 0 4.967.994 6.78 2.807a9.525 9.525 0 0 1 2.807 6.78A9.526 9.526 0 0 1 20 17.585a9.647 9.647 0 0 1-6.78 2.807h-2.46a3.008 3.008 0 0 0-2.93-2.41 3.03 3.03 0 0 0-2.534 1.367v.024a8.945 8.945 0 0 1-2.41-1.788c-.844-.844-1.316-1.614-1.515-2.11a2.858 2.858 0 0 0 1.441-.846 2.959 2.959 0 0 0 .795-2.036v-1.789c0-2.11.696-4.197 2.012-5.861 1.863-2.385 4.62-3.726 7.6-3.726zm-2.41 5.986a1.192 1.192 0 0 0-1.191 1.192 1.192 1.192 0 0 0 1.192 1.193A1.192 1.192 0 0 0 12 8.395a1.192 1.192 0 0 0-1.192-1.192zm7.204 0a1.192 1.192 0 0 0-1.192 1.192 1.192 1.192 0 0 0 1.192 1.193 1.192 1.192 0 0 0 1.192-1.193 1.192 1.192 0 0 0-1.192-1.192zm-7.377 4.769a.596.596 0 0 0-.546.845 4.813 4.813 0 0 0 4.346 2.757 4.77 4.77 0 0 0 4.347-2.757.596.596 0 0 0-.547-.845h-.025a.561.561 0 0 0-.521.348 3.59 3.59 0 0 1-3.254 2.061 3.591 3.591 0 0 1-3.254-2.061.64.64 0 0 0-.546-.348z" fill="#33CCFF"/></svg> Waze</a>
                      </div>
                    } @else {
                      <p class="muted">No location available.</p>
                    }
                  </div>
                }
              </section>

              <section class="dispatch-panel details-panel">
                <button class="panel-header" (click)="togglePanel('details')">
                  Job Details @if (expanded()['details']) { <app-icon name="chevron-up" sizeToken="sm" /> } @else { <app-icon name="chevron-down" sizeToken="sm" /> }
                </button>
                @if (expanded()['details']) {
                  <div class="panel-body">
                    <div class="info-rows">
                      <div class="info-row"><span class="label">Service</span><span>{{ jd.quoteRequest.category.name }}</span></div>
                      <div class="info-row"><span class="label">Date</span><span>{{ jd.scheduledDate | date:'fullDate' }}</span></div>
                      <div class="info-row"><span class="label">Time</span><span>{{ jd.timeSlot }}</span></div>
                      <div class="info-row"><span class="label">Price</span><span>RM {{ jd.price | number:'1.2-2' }}</span></div>
                      <div class="info-row"><span class="label">Payment</span><span>{{ formatPayment(jd.paymentMode) }}</span></div>
                      <div class="info-row"><span class="label">Status</span><span class="status-badge">{{ jd.status }}</span></div>
                    </div>

                    @if (jd.serviceDetails; as answers) {
                      <div class="question-answers">
                        <div class="qa-head">Answers</div>
                        @for (key of objectKeys(answers); track key) {
                          <div class="qa-row">
                            <span class="qa-key">{{ formatKey(key) }}</span>
                            <span class="qa-val">{{ formatAnswer(answers[key]) }}</span>
                          </div>
                        }
                      </div>
                    }

                    @if (jd.lineItems?.length) {
                      <details class="line-items-details">
                        <summary>Line items ({{ jd.lineItems!.length }})</summary>
                        @for (li of jd.lineItems; track $index) {
                          <div class="line-item"><span>{{ li.label }}</span><span>RM {{ li.amount | number:'1.2-2' }}</span></div>
                        }
                      </details>
                    }

                    <div class="photo-section">
                      @if (showArrivalPhoto()) {
                        @if (jd.arrivedPhotoUrl || jd.arrivePhotoUrl) {
                          <img [src]="jd.arrivedPhotoUrl || jd.arrivePhotoUrl" class="job-photo" alt="Arrival" />
                        }
                      } @else {
                        <button class="btn-ghost photo-btn" (click)="showArrivalPhoto.set(true)"><app-icon name="camera" sizeToken="sm" /> View arrival photo</button>
                      }
                    </div>
                    @if (jd.donePhotoUrl) {
                      <div class="photo-row">
                        <span class="label">Completion photo</span>
                        <img [src]="jd.donePhotoUrl" class="job-photo" alt="Completion" />
                      </div>
                    }
                  </div>
                }
              </section>

              <section class="dispatch-panel visibility-panel">
                <button class="panel-header" (click)="togglePanel('visibility')">
                  My Contact Visibility @if (expanded()['visibility']) { <app-icon name="chevron-up" sizeToken="sm" /> } @else { <app-icon name="chevron-down" sizeToken="sm" /> }
                </button>
                @if (expanded()['visibility']) {
                  <div class="panel-body">
                    <p class="muted small">Your contact info visible to this customer:</p>
                    <div class="info-rows">
                      @if (jd.showEmailPublic && jd.servicerEmail) {
                        <div class="info-row vis-on"><app-icon name="mail" sizeToken="sm" /> Email visible: {{ jd.servicerEmail }}</div>
                      } @else {
                        <div class="info-row vis-off"><app-icon name="mail" sizeToken="sm" /> Email hidden</div>
                      }
                      @if (jd.showPhonePublic && jd.servicerPhone) {
                        <div class="info-row vis-on"><app-icon name="phone" sizeToken="sm" /> Phone visible: {{ jd.servicerPhone }}</div>
                      } @else {
                        <div class="info-row vis-off"><app-icon name="phone" sizeToken="sm" /> Phone hidden</div>
                      }
                    </div>
                    <p class="muted small top-gap">Adjust visibility in <a [routerLink]="[routeFor('servicer.account')]">Account Settings</a>.</p>
                  </div>
                }
              </section>

            </div>

            <div class="dispatch-actions">
              @if (!readOnly) {
                @if (isStatus('confirmed')) {
                  <button class="btn-primary" (click)="markArrived()"><app-icon name="camera" sizeToken="sm" /> Mark Arrived</button>
                }
                @if (isStatus('in_progress')) {
                  <button class="btn-primary" (click)="markDone()"><app-icon name="check-circle" sizeToken="sm" /> Mark Done</button>
                }
                @if (isStatus('pending_confirm', 'confirmed')) {
                  <button class="btn-ghost" (click)="openCancelModal()"><app-icon name="x-circle" sizeToken="sm" /> Cancel</button>
                }
              }
              <button class="btn-ghost report-btn" (click)="openReportModal()"><app-icon name="alert-triangle" sizeToken="sm" /> Report Issue</button>
            </div>
            }
          }
        </div>
      }
    </dialog>

    <dialog #qrDlg class="dispatch-dialog" (mousedown)="onDown($event)" (mouseup)="onUp($event, 'qr')" (cancel)="$event.preventDefault(); showQr.set(false)">
      @if (showQr()) {
        <div class="dispatch-qr">
          <h3><app-icon name="smartphone" sizeToken="sm" /> Navigate from your phone</h3>
          <div class="qr-code">
            @if (qrDataUrl()) {
              <img [src]="qrDataUrl()" alt="QR code" />
            }
          </div>
          <p class="muted">Opens Google Maps or Waze</p>
          <button class="btn-ghost" (click)="showQr.set(false)">&larr; Back to job</button>
        </div>
      }
    </dialog>

    <dialog #reportDlg class="dispatch-dialog" (mousedown)="onDown($event)" (mouseup)="onUp($event, 'report')" (cancel)="$event.preventDefault(); closeReportModal()">
      @if (showReportModal()) {
        <div class="dispatch-cancel">
          <h3><app-icon name="alert-triangle" sizeToken="sm" /> Report an issue</h3>
          <p class="muted small">Describe the problem with this booking.</p>
          <form (ngSubmit)="submitReport()">
            <label>Subject *<input type="text" [(ngModel)]="reportSubject" name="rsubject" placeholder="Brief summary" required /></label>
            <label>Description *<textarea [(ngModel)]="reportDescription" name="rdesc" rows="3" placeholder="Details about the issue" required></textarea></label>
            @if (reportError()) { <p class="err">{{ reportError() }}</p> }
            <div class="cancel-actions">
              <button type="submit" class="btn-primary" [disabled]="reportSubmitting()">{{ reportSubmitting() ? 'Submitting\u2026' : 'Submit report' }}</button>
              <button type="button" class="btn-ghost" (click)="closeReportModal()">Cancel</button>
            </div>
          </form>
        </div>
      }
    </dialog>

    <dialog #cancelDlg class="dispatch-dialog" (mousedown)="onDown($event)" (mouseup)="onUp($event, 'cancel')" (cancel)="$event.preventDefault(); cancelModalClose()">
      @if (showCancelModal()) {
        <div class="dispatch-cancel">
          <h3><app-icon name="x-circle" sizeToken="sm" /> Cancel this booking?</h3>
          <form (ngSubmit)="submitCancel()">
            <label>Reason *<textarea [(ngModel)]="cancelReason" name="reason" rows="3" required></textarea></label>
            <label>PIN<input type="password" maxlength="6" [(ngModel)]="cancelPin" name="pin" placeholder="••••••" /></label>
            <p class="muted small">Default PIN is 123456. Change in Account Settings.</p>
            @if (cancelError()) { <p class="err">{{ cancelError() }}</p> }
            <div class="cancel-actions">
              <button type="submit" class="btn-primary" [disabled]="cancelling()">{{ cancelling() ? 'Cancelling\u2026' : 'Cancel booking' }}</button>
              <button type="button" class="btn-ghost" (click)="cancelModalClose()">Go back</button>
            </div>
          </form>
        </div>
      }
    </dialog>
  `,
    styles: [
        `
      :host { display: contents; }

      /* Native <dialog> + showModal() — top-layer, immune to ancestor
         transform/overflow clipping, always viewport-centered. See
         frontend/STYLE-RULES.md "Overlays & modals". Do NOT revert to a
         position:fixed backdrop. */
      .dispatch-dialog {
        padding: 0;
        border: none;
        background: transparent;
        max-width: min(440px, calc(100vw - 2rem));
        max-height: calc(100dvh - 4rem);
        width: 100%;
        overflow: visible;
        color: var(--color-text);
      }
      .dispatch-dialog.wide-dlg {
        max-width: min(1200px, calc(100vw - 2rem));
      }
      .dispatch-dialog::backdrop {
        background: var(--color-backdrop);
        animation: backdrop-in 0.18s ease-out both;
      }
      @keyframes backdrop-in {
        from { opacity: 0; }
        to   { opacity: 1; }
      }

      .dispatch-overlay {
        background: var(--color-surface);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        width: 100%;
        max-height: calc(100dvh - 4rem);
        display: flex;
        flex-direction: column;
        animation: pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        overflow: hidden;
      }
      @keyframes pop {
        from { opacity: 0; transform: translateY(-10px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .dispatch-hd {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.9rem 1.25rem;
        border-bottom: 1px solid var(--color-border);
        flex-shrink: 0;
      }
      .dispatch-hd strong {
        font-size: 1rem;
      }
      .status-badge {
        display: inline-flex;
        align-items: center;
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.15rem 0.55rem;
        border-radius: 999px;
        text-transform: capitalize;
        border: 1px solid var(--color-status-open-border, var(--color-border));
        background: var(--color-status-open-bg, var(--color-border));
        color: var(--color-status-open-text, var(--color-text));
      }
      .dispatch-close {
        margin-left: auto;
        background: transparent;
        border: none;
        font-size: 1.4rem;
        line-height: 1;
        color: var(--color-muted);
        padding: 0.15rem 0.4rem;
        cursor: pointer;
        border-radius: 4px;
        transition: background var(--transition-fast), color var(--transition-fast);
        font-family: inherit;
      }
      .dispatch-close:hover {
        background: var(--color-bg);
        color: var(--color-text);
      }

      .dispatch-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        padding: 1rem 1.25rem;
        overflow-y: auto;
        overscroll-behavior: contain;
        flex: 1;
        min-height: 0;
      }
      .dispatch-grid.mobile {
        grid-template-columns: 1fr;
      }
      @media (max-width: 1023px) {
        .dispatch-grid { grid-template-columns: 1fr; }
      }

      .dispatch-panel {
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-bg);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      .panel-header {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.65rem 0.9rem;
        background: var(--color-surface);
        border: none;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.88rem;
        font-weight: 600;
        font-family: inherit;
        color: var(--color-text);
        cursor: pointer;
        transition: background var(--transition-fast);
      }
      .panel-header:hover {
        background: var(--color-bg);
      }
      .panel-body {
        padding: 0.75rem 0.9rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        overflow-y: auto;
        overscroll-behavior: contain;
        flex: 1;
      }

      .customer-avatar-row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
      .avatar {
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
        flex-shrink: 0;
      }

      .info-rows {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .info-row {
        display: flex;
        gap: 0.5rem;
        font-size: 0.85rem;
        align-items: baseline;
      }
      .info-row .label {
        color: var(--color-muted);
        font-weight: 500;
        min-width: 80px;
        flex-shrink: 0;
      }
      .info-row a {
        color: var(--color-primary);
        text-decoration: none;
      }
      .info-row a:hover {
        text-decoration: underline;
      }
      .btn-wa {
        display: inline-block;
        background: #25D366;
        color: #fff;
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.15rem 0.5rem;
        border-radius: 999px;
        text-decoration: none !important;
        flex-shrink: 0;
      }
      .btn-wa:hover { opacity: 0.88; }

      .line-items-details {
        font-size: 0.82rem;
        margin-top: 0.3rem;
      }
      .line-items-details summary {
        cursor: pointer;
        font-weight: 500;
        color: var(--color-muted);
        padding: 0.25rem 0;
      }
      .line-items-details summary:hover {
        color: var(--color-text);
      }
      .line-item {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.2rem 0;
        border-bottom: 1px solid var(--color-border);
        font-size: 0.82rem;
      }
      .line-item:last-child {
        border-bottom: none;
      }

      .photo-row {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .job-photo {
        width: 100%;
        max-height: 180px;
        object-fit: contain;
        background: var(--color-bg);
        border-radius: 6px;
        border: 1px solid var(--color-border);
      }

      .instructions-text {
        font-size: 0.88rem;
        line-height: 1.55;
        white-space: pre-wrap;
        color: var(--color-text);
      }

      .mini-map {
        display: block;
        height: 250px;
        border-radius: var(--radius);
        overflow: hidden;
      }
      .map-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.4rem;
      }
      .nav-dropdown {
        position: relative;
      }
      .nav-trigger {
        cursor: pointer;
      }
      .nav-menu {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        display: flex;
        flex-direction: column;
        min-width: 150px;
        z-index: 10;
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.5rem 0.75rem;
        font-size: 0.85rem;
        color: var(--color-text);
        text-decoration: none;
        transition: background var(--transition-fast);
      }
      .nav-item:hover {
        background: var(--color-bg);
      }
      .nav-item:first-child {
        border-radius: var(--radius) var(--radius) 0 0;
      }
      .nav-item:last-child {
        border-radius: 0 0 var(--radius) var(--radius);
      }

      .dispatch-actions {
        display: flex;
        gap: 0.6rem;
        padding: 0.75rem 1.25rem;
        border-top: 1px solid var(--color-border);
        flex-shrink: 0;
        flex-wrap: wrap;
      }

      .dispatch-qr {
        background: var(--color-surface);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        padding: 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        max-width: 360px;
        width: 100%;
        align-self: center;
        margin: auto;
        animation: pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      .dispatch-qr h3 {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 600;
      }
      .qr-code {
        width: 200px;
        height: 200px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        padding: 0.5rem;
        background: #fff;
      }
      .qr-code img {
        width: 100%;
        height: 100%;
        image-rendering: pixelated;
      }

      .dispatch-cancel {
        background: var(--color-surface);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        padding: 1.5rem;
        max-width: 440px;
        width: 100%;
        align-self: center;
        margin: auto;
        animation: pop 0.18s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      .dispatch-cancel h3 {
        margin: 0 0 1rem;
        font-size: 1.05rem;
        font-weight: 600;
      }
      .dispatch-cancel form {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .dispatch-cancel label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.85rem;
        font-weight: 500;
      }
      .cancel-actions {
        display: flex;
        gap: 0.5rem;
        justify-content: flex-end;
        margin-top: 0.5rem;
      }

      .muted { color: var(--color-muted); }
      .err { color: var(--color-danger); font-size: 0.88rem; }
      .small { font-size: 0.8rem; }
      .top-gap { margin-top: 0.5rem; }
      .vis-on { color: var(--color-success); }
      .vis-off { color: var(--color-muted); }
      .visibility-panel .panel-body p:first-child { margin: 0 0 0.3rem; }
      .visibility-panel a { color: var(--color-primary); text-decoration: underline; }

      .question-answers { margin-top: 0.5rem; border-top: 1px solid var(--color-border); padding-top: 0.4rem; }
      .qa-head { font-size: 0.82rem; font-weight: 600; color: var(--color-muted); margin-bottom: 0.3rem; }
      .qa-row { display: flex; gap: 0.5rem; padding: 0.15rem 0; font-size: 0.85rem; align-items: flex-start; }
      .qa-key { color: var(--color-muted); min-width: 90px; font-weight: 500; }
      .qa-val { color: var(--color-text); word-break: break-word; }

      .photo-section { margin-top: 0.5rem; }
      .photo-btn { width: 100%; text-align: center; font-size: 0.9rem; }
    `,
    ]
})
export class DispatchOverlayComponent implements OnInit, OnDestroy {
  protected readonly routeFor = routeFor;
  @Input({ required: true }) jobId!: string;
  @Input() readOnly = false;
  @Output() closed = new EventEmitter<void>();
  @Output() actionPerformed = new EventEmitter<void>();

  private mainDlg = viewChild<ElementRef<HTMLDialogElement>>('mainDlg');
  private qrDlg = viewChild<ElementRef<HTMLDialogElement>>('qrDlg');
  private reportDlg = viewChild<ElementRef<HTMLDialogElement>>('reportDlg');
  private cancelDlg = viewChild<ElementRef<HTMLDialogElement>>('cancelDlg');

  private api = inject(ApiService);
  private toast = inject(ToastService);

  /** Drag-safe backdrop close: press target tracked so a text-selection drag
   *  that ends on the backdrop does not dismiss the dialog. */
  private downTarget: EventTarget | null = null;

  constructor() {
    // Keep each native top-layer dialog in step with its signal.
    // viewChild() returns a signal so the effect re-runs when the element
    // resolves — critical: @ViewChild (non-signal) would be undefined on
    // first effect run and never re-run.
    effect(() => this.toggle(this.mainDlg(), this.open()));
    effect(() => this.toggle(this.qrDlg(), this.showQr()));
    effect(() => this.toggle(this.reportDlg(), this.showReportModal()));
    effect(() => this.toggle(this.cancelDlg(), this.showCancelModal()));
  }

  private toggle(ref: ElementRef<HTMLDialogElement> | undefined, want: boolean): void {
    const dlg = ref?.nativeElement;
    if (!dlg) return;
    if (want && !dlg.open) dlg.showModal();
    else if (!want && dlg.open) dlg.close();
  }

  onDown(event: MouseEvent): void {
    this.downTarget = event.target;
  }

  onUp(event: MouseEvent, which: 'main' | 'qr' | 'report' | 'cancel'): void {
    const onBackdrop =
      event.target === event.currentTarget && this.downTarget === event.currentTarget;
    this.downTarget = null;
    if (!onBackdrop) return;
    if (which === 'main') this.close();
    else if (which === 'qr') this.showQr.set(false);
    else if (which === 'report') this.closeReportModal();
    else this.cancelModalClose();
  }

  ngOnDestroy(): void {
    for (const ref of [this.mainDlg(), this.qrDlg(), this.reportDlg(), this.cancelDlg()]) {
      const dlg = ref?.nativeElement;
      if (dlg?.open) dlg.close();
    }
  }

  open = signal(true);
  loading = signal(true);
  loadFailed = signal(false);
  jobData = signal<JobDetail | null>(null);

  showQr = signal(false);
  qrDataUrl = signal('');
  navOpen = signal(false);
  showArrivalPhoto = signal(false);

  showReportModal = signal(false);
  reportSubject = signal('');
  reportDescription = signal('');
  reportError = signal('');
  reportSubmitting = signal(false);

  showCancelModal = signal(false);
  cancelReason = signal('');
  cancelPin = signal('');
  cancelError = signal('');
  cancelling = signal(false);

  expanded = signal<Record<string, boolean>>({ customer: true, details: true, instructions: true, map: true });

  ngOnInit(): void {
    this.loadJob();
  }

  private loadJob(): void {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.api.get<JobDetail>(`/servicer/jobs/${this.jobId}`).subscribe({
      next: (d) => {
        this.jobData.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.loadFailed.set(true);
        this.loading.set(false);
      },
    });
  }

  close(): void {
    this.open.set(false);
    this.navOpen.set(false);
    this.closed.emit();
  }

  isMobile(): boolean {
    return window.innerWidth < 1024;
  }

  initials(name?: string): string {
    return (name || '?').charAt(0).toUpperCase();
  }

  waLink(phone?: string): string {
    if (!phone) return '#';
    const digits = phone.replace(/\D/g, '');
    if (!digits) return '#';
    if (digits.startsWith('60') && digits.length >= 11) return `https://wa.me/${digits}`;
    if (digits.startsWith('0')) return `https://wa.me/60${digits.slice(1)}`;
    if (digits.length <= 10) return `https://wa.me/60${digits}`;
    return `https://wa.me/${digits}`;
  }

  isStatus(...statuses: string[]): boolean {
    return statuses.includes(this.jobData()?.status ?? '');
  }

  togglePanel(key: string): void {
    this.expanded.update(e => ({ ...e, [key]: !e[key] }));
  }

  gmapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  wazeUrl(lat: number, lng: number): string {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }

  async generateQr(lat: number, lng: number): Promise<void> {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 200, margin: 1 });
      this.qrDataUrl.set(dataUrl);
    } catch {
      // QR generation failed silently
    }
  }

  formatPayment(mode: string): string {
    const map: Record<string, string> = { pay_now: 'Pay Now', pay_later: 'Pay Later', cash: 'Cash' };
    return map[mode] ?? mode;
  }

  objectKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }

  formatKey(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  formatAnswer(value: unknown): string {
    if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
    return String(value ?? '');
  }

  markArrived(): void {
    this.api.post(`/servicer/jobs/${this.jobId}/arrive`, {}).subscribe({
      next: () => {
        this.actionPerformed.emit();
        this.close();
      },
      error: (e) => this.toast.error(e.message ?? 'Failed to mark arrived'),
    });
  }

  markDone(): void {
    this.api.post(`/servicer/jobs/${this.jobId}/done`, {}).subscribe({
      next: () => {
        this.actionPerformed.emit();
        this.close();
      },
      error: (e) => this.toast.error(e.message ?? 'Failed to mark done'),
    });
  }

  openCancelModal(): void {
    this.showCancelModal.set(true);
  }

  cancelModalClose(): void {
    this.showCancelModal.set(false);
    this.cancelError.set('');
  }

  submitCancel(): void {
    if (!this.cancelReason()?.trim()) {
      this.cancelError.set('Please enter a reason.');
      return;
    }
    if (!this.cancelPin()?.trim()) {
      this.cancelError.set('Please enter your PIN.');
      return;
    }
    this.api.post<{ ok: boolean }>('/servicer/account/verify-pin', { pin: this.cancelPin() }).subscribe({
      next: (r) => {
        if (!r.ok) {
          this.cancelError.set('Incorrect PIN.');
          return;
        }
        this.cancelling.set(true);
        this.api.post(`/servicer/jobs/${this.jobId}/cancel`, { reason: this.cancelReason() }).subscribe({
          next: () => {
            this.cancelling.set(false);
            this.showCancelModal.set(false);
            this.actionPerformed.emit();
            this.close();
          },
          error: (e) => {
            this.cancelling.set(false);
            this.cancelError.set(e.message ?? 'Cancel failed');
          },
        });
      },
      error: () => {
        this.cancelError.set('Could not verify PIN. Try again.');
      },
    });
  }

  openReportModal(): void {
    this.reportSubject.set('');
    this.reportDescription.set('');
    this.reportError.set('');
    this.showReportModal.set(true);
  }

  closeReportModal(): void {
    this.showReportModal.set(false);
    this.reportError.set('');
  }

  submitReport(): void {
    const subject = this.reportSubject()?.trim();
    const desc = this.reportDescription()?.trim();
    if (!subject) { this.reportError.set('Please enter a subject.'); return; }
    if (!desc) { this.reportError.set('Please enter a description.'); return; }
    this.reportSubmitting.set(true);
    this.api.post(`/servicer/jobs/${this.jobId}/report`, { subject, description: desc }).subscribe({
      next: () => {
        this.reportSubmitting.set(false);
        this.showReportModal.set(false);
        this.toast.success('Report submitted. Admin will review it.');
      },
      error: (e) => {
        this.reportSubmitting.set(false);
        this.reportError.set(e.message ?? 'Failed to submit report');
      },
    });
  }
}
