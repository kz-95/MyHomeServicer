import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { routeFor } from '../../core/route-for';
import { ChatWidgetService } from '../../core/services/chat-widget.service';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { DialogService } from '../../core/services/dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { StripePaymentService } from '../../core/services/stripe-payment.service';
import { ModalComponent } from '../../shared/modal.component';
import { ServicerDetailPopupComponent } from '../../shared/servicer-detail-popup.component';

interface Booking {
  id: string;
  orderId?: string;
  invoiceNumber?: string | null;
  status: string;
  price: number;
  paymentMode: string;
  scheduledDate: string;
  timeSlot: string;
  tipStatus?: string;
  servicer: { id: string; businessName: string; logoUrl?: string; rating: number };
  categoryName: string | null;
  categoryIcon: string | null;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  lineItems: { label: string; amount: number }[] | null;
  subtotal: number;
  promoDiscount: number;
  serviceChargeRate: number | null;
  serviceChargeAmount: number | null;
  sstApplies: boolean;
  taxInclusive: boolean;
  taxRate: number | null;
  taxAmount: number | null;
  tipAmount: number | null;
  total: number;
  platformFee: number;
  pdfUrl: string | null;
  issuedAt: string;
  paidAt: string | null;
}

const SKELETON_COUNT = 5;
const STAGGER_MS = 70;

type TabKey = 'upcoming' | 'inProgress' | 'history';

const TAB_STATUSES: Record<TabKey, string[]> = {
  upcoming: ['pending_confirm', 'confirmed'],
  inProgress: ['in_progress'],
  history: ['completed', 'cancelled'],
};

const TAB_LABELS: Record<TabKey, string> = {
  upcoming: 'Upcoming',
  inProgress: 'In Progress',
  history: 'History',
};

/** Route a tab key to its full customer path (bookings vs history live on different roots). */
const TAB_ROUTES: Record<TabKey, string> = {
  upcoming: routeFor('customer.bookings.upcoming'),
  inProgress: routeFor('customer.bookings.inProgress'),
  history: routeFor('customer.history'),
};

/** Customer booking list with live status updates over Socket.io. */
@Component({
    selector: 'app-my-bookings',
    host: { class: 'page-enter page-narrow' },
    imports: [CommonModule, FormsModule, ModalComponent, RouterLink, ServicerDetailPopupComponent],
    template: `
    <h1>{{ activeTab() === 'history' ? 'History' : 'Bookings' }}</h1>
    @if (loading()) {
      <div class="skeleton-list">
        @for (s of skeletonSlots; track s; let i = $index) {
          <div class="card booking skel-card">
            <span class="card-cover"></span>
            <span class="bw-scan1" [style.animation-delay.ms]="(-700 + i * 350) % 1200 - 1200"></span>
            <span class="bw-scan2" [style.animation-delay.ms]="(i * 350) % 1400 - 1400"></span>
            <span class="bw-sweep1" [style.animation-delay.ms]="(-1300 + i * 350) % 1800 - 1800"></span>
            <span class="bw-sweep2" [style.animation-delay.ms]="(-600 + i * 350) % 900 - 900"></span>
          </div>
        }
      </div>
    } @else if (loadFailed()) {
      <p class="err">Could not load bookings. Please refresh the page.</p>
    } @else if (bookings().length === 0) {
      <div class="card empty-card">
        <p>No bookings yet.</p>
        <a [routerLink]="routeFor('customer.findService')" class="btn-primary">Find a service →</a>
      </div>
    } @else {
      <nav class="subnav">
        @for (t of tabs(); track t.key) {
          <a
            class="subnav-link"
            [class.active]="activeTab() === t.key"
            [routerLink]="TAB_ROUTES[t.key]"
          >
            {{ t.label }} <span class="n">{{ t.count }}</span>
          </a>
        }
      </nav>
      <div class="toolbar">
        <input
          class="search"
          type="text"
          placeholder="Search by date, invoice#, category, servicer or price…"
          [(ngModel)]="search"
          name="bs"
        />
        <div class="sort-group">
          <select [(ngModel)]="sortBy" name="mbsort">
            <option value="date">Date</option>
            <option value="price">Price</option>
          </select>
          <button class="btn-icon" (click)="reverseSort.set(!reverseSort())" [attr.aria-label]="reverseSort() ? 'Descending' : 'Ascending'">
            {{ reverseSort() ? '↓' : '↑' }}
          </button>
        </div>
      </div>
      @if (filteredBookings().length === 0) {
        <div class="card empty-card">
          <p>No {{ TAB_LABELS[activeTab()].toLowerCase() }} bookings.</p>
        </div>
      }
      @for (b of filteredBookings(); track b.id; let idx = $index) {
        @if (idx < revealCount()) {
        <div class="card booking bk-revealed">
          <div>
            <span class="servicer-head">
              <span class="svc-avatar">
                @if (b.servicer.logoUrl) {
                  <img [src]="b.servicer.logoUrl" [alt]="b.servicer.businessName" class="svc-logo" />
                } @else {
                  <span class="svc-initials">{{ initials(b.servicer.businessName) }}</span>
                }
              </span>
              <button type="button" class="svc-name-btn" (click)="detailServicerId.set(b.servicer.id)">{{ b.servicer.businessName }}</button>
            </span>
            <span class="muted">· {{ b.categoryName }}</span>
            <div class="muted">
              RM {{ b.price | number: '1.2-2' }} · {{ b.paymentMode }} ·
              {{ b.scheduledDate | date: 'mediumDate' }} {{ b.timeSlot }}
            </div>
            @if (b.orderId) {
              <div class="order-id">{{ b.orderId }}</div>
            }
            @if (b.invoiceNumber) {
              <div class="inv-id">{{ b.invoiceNumber }}</div>
            }
          </div>
          <div class="right">
            <span class="status" [class]="b.status">{{ statusLabel(b.status) }}</span>
            @if (b.lat != null && b.lng != null && ['confirmed', 'in_progress', 'completed'].includes(b.status)) {
              <button class="map-link" (click)="openJobMap(b, 'google')">Maps</button>
              <button class="map-link" (click)="openJobMap(b, 'waze')">Waze</button>
            }
            @if (b.status === 'completed' && b.paymentMode === 'pay_later' && b.tipStatus !== 'paid') {
              <button class="btn-ghost" (click)="addTip(b)">Add tip</button>
            }
            @if (['pending_confirm', 'confirmed'].includes(b.status)) {
              <button class="btn-ghost" (click)="cancel(b)">Cancel</button>
            }
            @if (b.status === 'completed') {
              <button class="btn-ghost" (click)="reorder(b)">Rebook this servicer</button>
              <button class="btn-ghost" (click)="viewInvoice(b)">Invoice</button>
            }
            @if (b.status === 'cancelled') {
              <button class="btn-ghost" (click)="reorder(b)">Rebook this servicer</button>
            }
            <button class="btn-ghost" (click)="reportIssue(b)" [disabled]="reporting()">
              {{ reporting() === b.id ? '…' : 'Report issue' }}
            </button>
          </div>
        </div>
        }
      }
    }

    <!-- ── Invoice modal ──────────────────────────────────────────────── -->
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
          <div class="receipt">
            <!-- Header -->
            <div class="receipt-hd">
              <span class="receipt-num">{{ inv.invoiceNumber }}</span>
              <div class="receipt-meta">
                <span class="muted small">{{ inv.issuedAt | date: 'mediumDate' }}</span>
                @if (inv.paidAt) {
                  <span class="badge badge-paid">Paid</span>
                } @else {
                  <span class="badge badge-pending">Unpaid</span>
                }
              </div>
            </div>

            <!-- Line items table -->
            @if (inv.lineItems && inv.lineItems.length > 0) {
              <table class="li-table">
                <tbody>
                  @for (li of inv.lineItems; track $index) {
                    <tr>
                      <td class="li-label">{{ li.label }}</td>
                      <td class="li-amt">RM {{ li.amount | number: '1.2-2' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              <hr class="rule" />
            }

            <!-- Breakdown rows -->
            <div class="receipt-rows">
              <div class="rr">
                <span>Subtotal</span>
                <span>RM {{ inv.subtotal | number: '1.2-2' }}</span>
              </div>
              @if (inv.promoDiscount > 0) {
                <div class="rr rr-promo">
                  <span>Promo discount</span>
                  <span>− RM {{ inv.promoDiscount | number: '1.2-2' }}</span>
                </div>
              }
              @if (inv.serviceChargeAmount && inv.serviceChargeAmount > 0) {
                <div class="rr">
                  <span>Service charge ({{ inv.serviceChargeRate }}%)</span>
                  <span>RM {{ inv.serviceChargeAmount | number: '1.2-2' }}</span>
                </div>
              }
              @if (inv.sstApplies && inv.taxAmount && inv.taxAmount > 0) {
                <div class="rr">
                  <span>SST ({{ (inv.taxRate ?? 0) * 100 | number: '1.0-0' }}%)</span>
                  <span>RM {{ inv.taxAmount | number: '1.2-2' }}</span>
                </div>
              }
              @if (inv.tipAmount && inv.tipAmount > 0) {
                <div class="rr">
                  <span>Tip</span>
                  <span>RM {{ inv.tipAmount | number: '1.2-2' }}</span>
                </div>
              }
            </div>

            <hr class="rule rule-bold" />

            <!-- Total -->
            <div class="receipt-total">
              <strong>Total</strong>
              <strong class="total-amt">RM {{ inv.total | number: '1.2-2' }}</strong>
            </div>

            <!-- Tax mode badge -->
            <div class="tax-mode-row">
              <span class="tax-badge" [class.inclusive]="inv.taxInclusive">
                {{ inv.taxInclusive ? 'Tax inclusive' : 'Tax exclusive' }}
              </span>
            </div>

            <!-- Platform fee (muted) -->
            <div class="platform-row">
              <span class="muted small">Platform fee (paid by servicer)</span>
              <span class="muted small">RM {{ inv.platformFee | number: '1.2-2' }}</span>
            </div>

            <!-- PDF action -->
            @if (inv.pdfUrl) {
              <div class="receipt-actions">
                <a class="btn-primary" [href]="inv.pdfUrl" target="_blank" rel="noopener noreferrer">
                  ⬇ Download PDF
                </a>
              </div>
            }

            <!-- Pay by card - unpaid invoice on a completed pay_later/cash booking -->
            @if (!inv.paidAt && payBooking()?.status === 'completed' && payBooking()?.paymentMode !== 'pay_now') {
              <div class="receipt-actions pay-actions">
                <button class="btn-primary" (click)="payByCard()" [disabled]="paying()">
                  {{ paying() ? 'Opening Stripe…' : '💳 Pay by card' }}
                </button>
                <p class="muted small">Secure Stripe Checkout - pays this invoice in full.</p>
              </div>
            }
          </div>
        }
      }
    </app-modal>

    <!-- ── Report issue modal ──────────────────────────────────────── -->
    <app-modal [open]="reportModalOpen()" title="Report an issue" (closed)="closeReport()">
      <div class="report-form">
        <label class="rfl">
          <span class="rfl-label">Subject</span>
          <input [(ngModel)]="reportSubject" name="rsubj" placeholder="Brief title for the issue" maxlength="200" />
        </label>
        <label class="rfl">
          <span class="rfl-label">Description</span>
          <textarea [(ngModel)]="reportDescription" name="rdesc" placeholder="Describe the problem in detail" rows="5" maxlength="2000"></textarea>
        </label>
        @if (reportError()) {
          <p class="err">{{ reportError() }}</p>
        }
        <div class="report-actions">
          <button class="btn-ghost" (click)="closeReport()">Cancel</button>
          <button class="btn-primary" (click)="submitReport()" [disabled]="reportSubmitting() || !reportSubject().trim() || !reportDescription().trim()">
            {{ reportSubmitting() ? "Submitting" : "Submit report" }}
          </button>
        </div>
      </div>
    </app-modal>

    <!-- Cancel booking modal -->
    <app-modal [open]="cancelModalOpen()" title="Cancel booking" (closed)="cancelModalOpen.set(false)">
      <div class="report-form">
        <label class="rfl">
          <span class="rfl-label">Reason *</span>
          <select [(ngModel)]="cancelReason" name="cancelreason" class="form-select">
            <option value="">Select a reason</option>
            <option value="found_another_servicer">Found another servicer</option>
            <option value="changed_my_mind">Changed my mind</option>
            <option value="too_expensive">Too expensive</option>
            <option value="no_longer_needed">No longer needed</option>
            <option value="scheduling_conflict">Scheduling conflict</option>
            <option value="service_details_changed">Service details changed</option>
            <option value="other">Other (describe below)</option>
          </select>
        </label>
        @if (cancelReason() === 'other') {
          <label class="rfl">
            <span class="rfl-label">Describe the issue</span>
            <textarea [(ngModel)]="cancelDetails" name="canceldetails" rows="3" placeholder="Additional details..."></textarea>
          </label>
        }
        @if (cancelError()) {
          <p class="err">{{ cancelError() }}</p>
        }
        <div class="report-actions">
          <button class="btn-ghost" (click)="cancelModalOpen.set(false)">Keep booking</button>
          <button class="btn-primary" (click)="doCancel()" [disabled]="cancellingBusy()">
            {{ cancellingBusy() ? 'Cancelling...' : 'Yes, cancel booking' }}
          </button>
        </div>
      </div>
    </app-modal>

    <!-- Servicer detail popup -->
    <app-servicer-detail-popup [servicerId]="detailServicerId()" (closed)="detailServicerId.set(null)" />
  `,
    styles: [
        `
      :host {
        display: block;
      }
      .booking {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.6rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .booking:hover {
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
      }
      .order-id {
        font-size: 0.72rem;
        font-family: monospace;
        color: var(--color-muted);
        margin-top: 0.15rem;
        letter-spacing: 0.03em;
      }
      .inv-id {
        font-size: 0.7rem;
        font-family: monospace;
        color: var(--color-muted);
        margin-top: 0.15rem;
      }
      .servicer-head {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .svc-name-btn {
        background: transparent;
        border: none;
        padding: 0;
        font: inherit;
        font-weight: 700;
        color: var(--color-text);
        cursor: pointer;
        text-align: left;
        transition: color var(--transition);
      }
      .svc-name-btn:hover {
        color: var(--color-primary);
        text-decoration: underline;
      }
      .report-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        min-width: 300px;
      }
      .rfl {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .rfl-label {
        font-weight: 600;
        font-size: 0.85rem;
      }
      .rfl input,
      .rfl textarea {
        padding: 0.5rem 0.7rem;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--color-surface);
        color: var(--color-text);
        font: inherit;
        font-size: 0.85rem;
        resize: vertical;
      }
      .report-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
      .svc-avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 999px;
        background: var(--color-primary);
        flex-shrink: 0;
        overflow: hidden;
      }
      .svc-logo {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .svc-initials {
        color: #fff;
        font-size: 0.78rem;
        font-weight: 600;
      }
      .right {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .status {
        font-size: 0.78rem;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        background: var(--color-bg);
        white-space: nowrap;
      }
      .status.completed {
        background: var(--color-status-completed-bg);
        color: var(--color-status-completed-text);
      }
      .status.in_progress {
        background: var(--color-status-progress-bg);
        color: var(--color-status-progress-text);
      }
      .status.confirmed {
        background: var(--color-status-accepted-bg);
        color: var(--color-status-accepted-text);
      }
      .status.pending_confirm {
        background: var(--color-status-open-bg);
        color: var(--color-status-open-text);
      }
      .status.cancelled {
        background: var(--color-status-cancelled-bg);
        color: var(--color-status-cancelled-text);
      }
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
      .err {
        color: var(--color-danger);
      }
      .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        align-items: center;
        padding-bottom: 0.65rem;
        border-bottom: 1px solid var(--color-border);
        margin-bottom: 0.75rem;
      }
      .search {
        width: 220px;
        min-width: 140px;
        border-radius: 999px;
        padding: 0.4rem 0.75rem;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: 0.85rem;
        outline: none;
        transition: border-color var(--transition);
      }
      .search:focus { border-color: var(--color-primary); }
      .sort-group {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .sort-group select {
        border-radius: 6px;
        padding: 0.4rem 0.5rem;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-text);
        font-size: 0.82rem;
        outline: none;
      }
      .sort-group select:focus { border-color: var(--color-primary); }
      .btn-icon {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 6px;
        padding: 0.35rem 0.5rem;
        font-size: 0.82rem;
        cursor: pointer;
        color: var(--color-text);
        line-height: 1;
        transition: border-color var(--transition);
      }
      .btn-icon:hover { border-color: var(--color-primary); }
      .subnav {
        display: flex;
        gap: 0.3rem;
        flex-wrap: wrap;
        margin-bottom: 0.75rem;
      }
      .subnav-link {
        background: transparent;
        border: none;
        border-radius: 999px;
        padding: 0.45rem 1rem;
        color: var(--color-muted);
        cursor: pointer;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.88rem;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .subnav-link:hover:not(.active) {
        color: var(--color-text);
        background: var(--color-bg);
      }
      .subnav-link.active {
        background: var(--gradient-sidebar);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 1px 6px rgba(201, 90, 60, 0.2);
      }
      .subnav-link .n {
        border-radius: 999px;
        padding: 0.05rem 0.5rem;
        font-size: 0.78rem;
        background: var(--color-bg);
        color: var(--color-muted);
      }
      .subnav-link.active .n {
        background: rgba(255, 255, 255, 0.25);
        color: #fff;
      }
      /* Mobile - stack info and actions vertically */
      @media (max-width: 600px) {
        .booking {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.8rem;
        }
        .right {
          justify-content: flex-start;
          width: 100%;
        }
      }
      /* ── Receipt modal ───────────────────────────────────────────────── */
      .receipt { display: flex; flex-direction: column; gap: 0.6rem; }
      .receipt-hd { display: flex; justify-content: space-between; align-items: flex-start; }
      .receipt-num { font-size: 1rem; font-weight: 700; color: var(--color-text); }
      .receipt-meta { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; }
      .li-table { width: 100%; border-collapse: collapse; }
      .li-table td { padding: 0.3rem 0; font-size: 0.88rem; }
      .li-label { color: var(--color-text); }
      .li-amt { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .rule { border: none; border-top: 1px solid var(--color-border); margin: 0.1rem 0; }
      .rule-bold { border-top-width: 2px; border-top-color: var(--color-text); }
      .receipt-rows { display: flex; flex-direction: column; gap: 0.25rem; }
      .rr { display: flex; justify-content: space-between; align-items: center; font-size: 0.88rem; }
      .rr-promo span:last-child { color: var(--color-success); font-weight: 600; }
      .receipt-total { display: flex; justify-content: space-between; align-items: center; }
      .receipt-total strong { font-size: 1rem; }
      .total-amt { font-size: 1.25rem; color: var(--color-primary); }
      .tax-mode-row { display: flex; }
      .tax-badge {
        font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;
        padding: 0.15rem 0.55rem; border-radius: 999px;
        background: var(--color-status-open-bg); color: var(--color-status-open-text);
      }
      .tax-badge.inclusive {
        background: var(--color-status-accepted-bg); color: var(--color-status-accepted-text);
      }
      .platform-row { display: flex; justify-content: space-between; align-items: center; padding-top: 0.2rem; border-top: 1px dashed var(--color-border); }
      .receipt-actions { display: flex; gap: 0.5rem; margin-top: 0.4rem; flex-wrap: wrap; }
      .empty-card {
        text-align: center;
        padding: 3rem 1.5rem;
        color: var(--color-muted);
      }
      .empty-card p {
        margin-bottom: 1.25rem;
        font-size: 1.05rem;
      }

      /* ── Skeleton + stagger reveal ── */
      .skeleton-list { display: flex; flex-direction: column; gap: 0.8rem; }
      .skel-card {
        position: relative;
        overflow: hidden;
        min-height: 72px;
        cursor: default;
        animation: border-glow 1.2s cubic-bezier(0.85, 0, 0.15, 1) infinite;
      }
      .skel-card:hover { transform: none; box-shadow: var(--shadow); }
      .bw-scan1 { width: 30%; }
      .bw-scan2 { width: 45%; }
      .bw-sweep1 { width: 25%; }
      .bw-sweep2 { width: 18%; }
      @keyframes skeleton-spawn {
        from { opacity: 1; }
        to   { opacity: 0; pointer-events: none; }
      }
      .skel-card::after {
        content: "";
        position: absolute; inset: 0; z-index: 10;
        background: var(--color-bg);
        animation: skeleton-spawn 0.1s ease both;
      }
      .skeleton-list > :nth-child(1)::after { animation-delay: 0s; }
      .skeleton-list > :nth-child(2)::after { animation-delay: 0.05s; }
      .skeleton-list > :nth-child(3)::after { animation-delay: 0.1s; }
      .skeleton-list > :nth-child(4)::after { animation-delay: 0.15s; }
      .skeleton-list > :nth-child(5)::after { animation-delay: 0.2s; }
      .card-cover {
        position: absolute; inset: 0; z-index: 4;
        background: var(--color-surface);
        transition: opacity 0.35s ease;
      }
      .card-cover.loaded { opacity: 0; pointer-events: none; }
      @keyframes bk-reveal {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .bk-revealed {
        animation: bk-reveal 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      @media (prefers-reduced-motion: reduce) {
        .bk-revealed { animation: none; }
        .skel-card::after { animation: none; opacity: 0; }
      }
    `,
    ]
})
export class MyBookingsComponent implements OnInit, OnDestroy {
  routeFor = routeFor;
  private api = inject(ApiService);
  private socket = inject(SocketService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private widget = inject(ChatWidgetService);
  private stripePay = inject(StripePaymentService);

  readonly skeletonSlots = Array.from({ length: SKELETON_COUNT }, (_, i) => i);
  revealCount = signal(0);
  private staggerTimer: ReturnType<typeof setInterval> | null = null;

  bookings = signal<Booking[]>([]);
  detailServicerId = signal<string | null>(null);
  loading = signal(true);
  loadFailed = signal(false);
  reporting = signal<string | null>(null);

  search = signal('');
  sortBy = signal<'date' | 'price'>('date');
  reverseSort = signal(false);

  /** Derived from the active route's last segment. */
  activeTab = signal<TabKey>('upcoming');
  readonly TAB_LABELS = TAB_LABELS;
  readonly TAB_ROUTES = TAB_ROUTES;

  tabs = computed(() => {
    const all = this.bookings();
    return (Object.keys(TAB_STATUSES) as TabKey[]).map((key) => ({
      key,
      label: TAB_LABELS[key],
      count: all.filter((b) => TAB_STATUSES[key].includes(b.status)).length,
    }));
  });

  filteredBookings = computed(() => {
    const statuses = TAB_STATUSES[this.activeTab()];
    let list = this.bookings().filter((b) => statuses.includes(b.status));
    const q = this.search().toLowerCase();
    if (q) {
      list = list.filter((b) => {
        if (b.servicer.businessName.toLowerCase().includes(q)) return true;
        if (b.categoryName?.toLowerCase().includes(q)) return true;
        if (b.orderId?.toLowerCase().includes(q)) return true;
        if (b.invoiceNumber?.toLowerCase().includes(q)) return true;
        if (b.scheduledDate && new Date(b.scheduledDate).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }).toLowerCase().includes(q)) return true;
        if (b.price.toString().includes(q) || `rm${b.price}`.includes(q)) return true;
        return false;
      });
    }
    const sb = this.sortBy();
    const rev = this.reverseSort();
    list = [...list].sort((a, b) => {
      if (sb === 'price') {
        return rev ? a.price - b.price : b.price - a.price;
      }
      // date sort
      return rev
        ? b.scheduledDate.localeCompare(a.scheduledDate)
        : a.scheduledDate.localeCompare(b.scheduledDate);
    });
    return list;
  });

  invoiceModalOpen = signal(false);
  invoiceData = signal<InvoiceDetail | null>(null);
  invoiceLoading = signal(false);
  invoiceError = signal('');
  payBooking = signal<Booking | null>(null);
  paying = signal(false);
  reportModalOpen = signal(false);
  reportSubject = signal("");
  reportDescription = signal("");
  reportError = signal("");
  reportSubmitting = signal(false);

  cancelModalOpen = signal(false);
  cancelReason = signal('');
  cancelDetails = signal('');
  cancellingBusy = signal(false);
  cancelError = signal('');
  private cancelTargetBooking: Booking | null = null;
  private reportBookingId = signal<string | null>(null);

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.subs.push(
      this.route.url.subscribe((segments) => {
        const last = segments[segments.length - 1]?.path as TabKey | undefined;
        if (last && last in TAB_STATUSES) {
          this.activeTab.set(last);
        } else {
          this.activeTab.set('upcoming');
        }
      }),
    );
    this.load();
    for (const ev of ['booking.confirmed', 'booking.arrived', 'booking.done', 'booking.cancelled']) {
      this.subs.push(this.socket.on(ev).subscribe(() => this.load()));
    }
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
    this.clearStagger();
  }

  private load(): void {
    this.clearStagger();
    this.revealCount.set(0);
    this.api.get<{ data: Booking[] }>('/bookings').subscribe({
      next: (r) => {
        this.bookings.set(r.data);
        this.loading.set(false);
        this.staggerReveal(r.data.length);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  private staggerReveal(total: number): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.revealCount.set(total);
      return;
    }
    let i = 0;
    this.staggerTimer = setInterval(() => {
      i++;
      this.revealCount.set(i);
      if (i >= total) this.clearStagger();
    }, STAGGER_MS);
  }

  private clearStagger(): void {
    if (this.staggerTimer !== null) {
      clearInterval(this.staggerTimer);
      this.staggerTimer = null;
    }
  }

  /** Extract initials from a business name (max 2 chars). */
  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  statusLabel(s: string): string {
    return s.replace('_', ' ');
  }

  viewInvoice(b: Booking): void {
    this.invoiceData.set(null);
    this.invoiceError.set('');
    this.invoiceLoading.set(true);
    this.invoiceModalOpen.set(true);
    this.payBooking.set(b);
    this.api.get<InvoiceDetail>(`/bookings/${b.id}/invoice`).subscribe({
      next: (inv) => {
        this.invoiceData.set(inv);
        this.invoiceLoading.set(false);
      },
      error: (e) => {
        this.invoiceError.set(e.message ?? 'Invoice not available yet.');
        this.invoiceLoading.set(false);
      },
    });
  }

  payByCard(): void {
    const inv = this.invoiceData();
    if (!inv) return;
    this.paying.set(true);
    this.api
      .post<{ url: string; sessionId: string }>('/stripe/create-booking-payment-session', {
        bookingId: inv.bookingId,
      })
      .subscribe({
        next: ({ url, sessionId }) => {
          this.paying.set(false);
          this.stripePay.openPayment({
            url,
            sessionId,
            verifyEndpoint: '/stripe/verify-booking-payment',
            onSuccess: () => {
              this.toast.success('Payment received - invoice paid.');
              this.invoiceModalOpen.set(false);
              this.load();
            },
          });
        },
        error: (e) => {
          this.paying.set(false);
          this.toast.error(e.message ?? 'Could not start card payment');
        },
      });
  }

  addTip(b: Booking): void {
    this.dialog
      .prompt('How much would you like to tip? (RM)', {
        placeholder: 'e.g. 5',
        confirmLabel: 'Add tip',
      })
      .subscribe((v) => {
        if (v === null) return;
        const amount = Number(v);
        if (!amount || amount <= 0) {
          this.toast.error('Please enter a valid tip amount.');
          return;
        }
        this.api.post(`/bookings/${b.id}/tip`, { tipAmount: amount }).subscribe({
          next: () => {
            this.toast.success('Tip added - thank you!');
            this.load();
          },
          error: (e) => this.toast.error(e.message ?? 'Could not add tip'),
        });
      });
  }

  cancel(b: Booking): void {
    this.cancelTargetBooking = b;
    this.cancelReason.set('');
    this.cancelDetails.set('');
    this.cancelError.set('');
    this.cancelModalOpen.set(true);
  }

  doCancel(): void {
    const b = this.cancelTargetBooking;
    if (!b) return;
    const reason = this.cancelReason();
    if (!reason) { this.cancelError.set('Please select a reason.'); return; }
    const detail = reason === 'other' ? this.cancelDetails().trim() : '';
    if (reason === 'other' && !detail) { this.cancelError.set('Please describe the issue.'); return; }
    const displayReason = reason === 'other' ? detail : reason.replace(/_/g, ' ');
    this.cancellingBusy.set(true);
    this.api.post(`/bookings/${b.id}/cancel`, { reason: displayReason }).subscribe({
      next: () => {
        this.cancellingBusy.set(false);
        this.cancelModalOpen.set(false);
        this.toast.success('Booking cancelled.');
        this.load();
      },
      error: (e) => {
        this.cancellingBusy.set(false);
        this.cancelError.set(e.message ?? 'Could not cancel booking');
      },
    });
  }

  reorder(b: Booking): void {
    this.api.post<{ prefill: Record<string, unknown> }>(`/bookings/${b.id}/reorder`, {}).subscribe({
      next: (r) =>
        this.router.navigate([routeFor('customer.quote')], {
          // rebookServicer locks the quote to this servicer (direct, no broadcast)
          // and hides the category pickers in the quote form.
          state: { prefill: r.prefill, rebookServicer: { id: b.servicer.id, name: b.servicer.businessName } },
        }),
      error: (e) => this.toast.error(e.message ?? 'Could not create reorder'),
    });
  }

  openJobMap(b: Booking, app: 'google' | 'waze'): void {
    const hasCoords = b.lat != null && b.lng != null;
    if (!hasCoords) return;
    const url = app === 'waze'
      ? `https://waze.com/ul?ll=${b.lat},${b.lng}&navigate=yes`
      : `https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`;
    window.open(url, '_blank', 'noopener');
  }

  reportIssue(b: Booking): void {
    this.reportBookingId.set(b.id);
    this.reportSubject.set('');
    this.reportDescription.set('');
    this.reportError.set('');
    this.reportModalOpen.set(true);
  }

  closeReport(): void {
    this.reportModalOpen.set(false);
    this.reportBookingId.set(null);
    this.reportError.set('');
  }

  submitReport(): void {
    const bid = this.reportBookingId();
    if (!bid) return;
    this.reportSubmitting.set(true);
    this.reportError.set('');
    this.api
      .post(`/bookings/${bid}/report`, {
        subject: this.reportSubject(),
        description: this.reportDescription(),
      })
      .subscribe({
        next: () => {
          this.reportSubmitting.set(false);
          this.toast.success('Issue reported. Our team will review it.');
          this.closeReport();
        },
        error: (e) => {
          this.reportSubmitting.set(false);
          this.reportError.set(e.message ?? 'Could not submit report. Please try again.');
        },
      });
  }
}
