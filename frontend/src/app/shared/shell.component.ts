import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnInit,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import {
  RouterOutlet,
  RouterLink,
  Router,
} from "@angular/router";
import { routeFor } from "../core/route-for";
import { Subscription } from "rxjs";
import { AuthService } from "../core/services/auth.service";
import { ApiService } from "../core/services/api.service";
import { ConfigService } from "../core/services/config.service";
import { SocketService } from "../core/services/socket.service";
import { NotificationService } from "../core/services/notification.service";
import { NotificationPanelService } from "../core/services/notification-panel.service";
import { ThemeService } from "../core/services/theme.service";
import { ModalComponent } from "./modal.component";
import { IconComponent } from "./icon.component";
import { SiteFooterComponent } from "./site-footer.component";
import { ChatWidgetService } from "../core/services/chat-widget.service";
import { ToastService } from "../core/services/toast.service";
import { DialogService } from "../core/services/dialog.service";
import { StripePaymentService } from "../core/services/stripe-payment.service";
import { PullToRefreshDirective } from "./pull-to-refresh.directive";
import { DispatchPromptGuardComponent } from "./dispatch-prompt-guard.component";
import { ShellNavComponent } from "./shell-nav.component";
import { DemoBarComponent } from "./demo-bar.component";

interface IncomingQuoteSummary {
  quoteId: string;
  category: string;
}

interface OpenedQuoteDetail extends IncomingQuoteSummary {
  customerName: string;
  customerAvatarUrl: string | null;
  estimatedPrice: number;
  estimatedDurationMin?: number;
  descriptions?: string[];
  // Detail fields (match jobs-card layout).
  preferredDate: string | null;
  timeSlot: string | null;
  lat: number | null;
  lng: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  address: string | null;
  postcode: string | null;
  district: string | null;
  state: string | null;
  propertyType: string | null;
  paymentMode: string | null;
  notes: string | null;
  images: string[];
  distanceKm: number | null;
  isUrgent: boolean;
  urgentFee: number | null;
  myProposalId: string | null;
  myProposalIsAuto: boolean;
  myProposalPrice: number | null;
  myProposalEta: number | null;
  myProposalMessage: string | null;
}

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  exact?: boolean;
}

interface ActiveVoucher {
  code: string;
  label: string;
  discountType: 'topup_fixed' | 'topup_bonus';
  discountValue: number;
  originalAmount: number;
  discountedAmount: number;
}

interface PromoValidationResult {
  valid: boolean;
  discountType?: 'topup_fixed' | 'topup_bonus';
  discountValue?: number;
  originalAmount?: number;
  finalCharge?: number;
  label?: string;
  error?: string;
}

/**
 * Shared portal shell: top nav + sidebar + content outlet. Used by all three
 * portals (customer, servicer, admin) with portal-specific nav items.
 */
@Component({
    selector: "app-shell",
    imports: [
        CommonModule,
        FormsModule,
        RouterOutlet,
        RouterLink,
        ModalComponent,
        IconComponent,
        SiteFooterComponent,
        PullToRefreshDirective,
        DispatchPromptGuardComponent,
        ShellNavComponent,
        DemoBarComponent,
  ],
    template: `
    <div class="shell" [class.admin-portal]="portalTitle === 'Admin'">
      <app-demo-bar />
      <header class="topbar">
        <!-- Logo title - clicking it returns to the public home page. -->
        <button class="logo" (click)="goHome()" title="Go to home page">
          <span class="logo-wrap" [class.loaded]="logoLoaded()">
            <img src="assets/ico/MyHomeServicerIcon.png" class="logo-icon" alt="" (load)="logoLoaded.set(true)" />
            <span class="logo-shimmer"></span>
          </span>
          My Home Servicer
        </button>
        @if (currentPageLabel()) {
          <span class="page-title">{{ currentPageLabel() }}</span>
        }
        <span class="spacer"></span>

        @if (modeError()) {
          <span class="err">{{ modeError() }}</span>
        }
        @if (showCredit()) {
          <div class="credit">
            <span class="credit-amt">Credit: RM {{ creditDisplay() }}</span>
            <button class="credit-topup" (click)="openTopUp()">Top-Up</button>
          </div>
        }

        @if (auth.principal()) {
          <div class="account">
            <span class="uname">{{ displayName() }}</span>
            <span class="utype">{{ accountType() }}</span>
          </div>
          <button class="notif-bell" type="button" [class.active]="notifPanel.isOpen()" (click)="toggleNotifPanel($event)" title="Notifications" aria-label="Notifications">
            <app-icon name="bell" sizeToken="md" />
            @if (notifications.unread() > 0) {
              <span class="notif-count">{{ notifications.unread() > 99 ? '99+' : notifications.unread() }}</span>
            }
          </button>
        }

        @if (auth.isServicerAccount()) {
          <!-- Online/offline toggle - Lalamove-style for servicer mode. -->
          @if (auth.mode() === 'servicer' && auth.principal(); as p) {
            <button
              type="button"
              class="online-toggle"
              [class.on]="p.isOnline"
              (click)="toggleOnline()"
              [disabled]="onlineToggling()"
              [title]="p.isOnline ? 'Go offline' : 'Go online'"
              aria-label="Toggle online status"
            >
              <span class="ot-dot"></span>
              <span class="ot-label">{{ p.isOnline ? 'Live' : 'Offline' }}</span>
            </button>
          }
          <!-- Servicer accounts can operate the platform as a customer. -->
          <span
            class="mode-toggle"
            role="group"
            aria-label="Switch portal mode"
          >
            <button
              type="button"
              [class.on]="auth.mode() === 'servicer'"
              [disabled]="switchingMode()"
              (click)="setMode('servicer')"
            >
              Servicer
            </button>
            <button
              type="button"
              [class.on]="auth.mode() === 'customer'"
              [disabled]="switchingMode()"
              (click)="setMode('customer')"
            >
              {{ switchingMode() ? "…" : "Customer" }}
            </button>
          </span>
        } @else if (auth.principal()?.role === "customer") {
          <a class="btn-pro" [routerLink]="[routeFor('register.servicer')]">Sign up as pro</a>
        }

        <button
          class="theme-toggle"
          (click)="themeSvc.toggle()"
          [title]="
            themeSvc.theme() === 'warm'
              ? 'Switch to night mode'
              : 'Switch to day mode'
          "
          [attr.aria-label]="
            themeSvc.theme() === 'warm'
              ? 'Switch to night mode'
              : 'Switch to day mode'
          "
        >
          <span class="dot"></span>
          {{ themeSvc.theme() === "warm" ? "Day" : "Night" }}
        </button>
        <button class="btn-ghost btn-signout" (click)="logout()" [disabled]="signingOut()">{{ signingOut() ? "Signing out…" : "Sign out" }}</button>
        <!-- DISP-11/§5.6: on phone (≤560px) the text "Sign out" is replaced by this
             far-right icon switch (same logout() action). -->
        <button class="logout-switch" (click)="logout()" [disabled]="signingOut()" title="Sign out" aria-label="Sign out">
          <app-icon name="log-out" sizeToken="md" />
        </button>
      </header>

      <!-- ── Idle re-engagement banner (customer, 30+ days no booking) ── -->
      @if (idleBannerVisible()) {
        <div class="idle-banner">
          <span>It's been a while! 🏠 Need help around the house?</span>
          <a [routerLink]="[routeFor('customer.quote')]" (click)="dismissIdleBanner()">Request a Quote</a>
          <button (click)="dismissIdleBanner()" aria-label="Dismiss">×</button>
        </div>
      }

      <div class="body">
        <app-shell-nav [navItems]="navItems" />
        <main class="content" appPullToRefresh #contentEl>
          <div class="content-main" [class.narrow]="narrow">
            <router-outlet />
          </div>
          <app-site-footer />
        </main>
      </div>
    </div>

    @if (auth.principal()) {
      <div class="fab-stack" [class.collapsed]="fabCollapsed()">
        <button
          class="fab-toggle"
          (click)="fabCollapsed.set(!fabCollapsed())"
          [attr.aria-label]="fabCollapsed() ? 'Expand' : 'Minimize'"
        ></button>
        <div class="fab-bubbles">
        <button
          class="chat-bubble"
          [class.has-unread]="widget.chatUnread() > 0"
          (click)="widget.open()"
          title="Help &amp; support chat"
          aria-label="Help &amp; support chat"
        >
          <span class="chat-glow"></span>
          <app-icon name="message-circle" sizeToken="lg" />
          <span
            class="chat-status"
            [class.active]="widget.chatStatus() === 'active'"
            [class.typing]="widget.chatStatus() === 'typing'"
          ></span>
          @if (widget.chatUnread() > 0) {
            <span class="chat-unread">{{
              widget.chatUnread() > 99 ? "99+" : widget.chatUnread()
            }}</span>
          }
        </button>
        @if (auth.principal()?.role === "customer") {
          <button class="request-bar" (click)="newQuote()">
            <span class="rb-glow"></span>
            <span class="rb-plus">+</span>
            <span class="rb-text">
              <strong>Request a quote</strong>
              <span
                >Tell us what you need done and get prices from local pros.</span
              >
            </span>
          </button>
        }
        </div>
      </div>
    }

    <!-- ── Rewards re-engagement banner (customer) ── -->
    @if (rewardsPromptVisible()) {
      <div class="rewards-banner" role="alert">
        <span>💎 You have points waiting! Redeem them for top-up discounts and save on your next booking.</span>
        <a [routerLink]="[routeFor('customer.rewards')]" (click)="dismissRewardsPrompt()">Check rewards →</a>
        <button (click)="dismissRewardsPrompt()">×</button>
      </div>
    }

    <!-- ── Servicer proposal prompt guard (F-A): expandable card on quote.new ── -->
    @if (quotePromptVisible()) {
      <div class="quote-prompt" [class.expanded]="expandedQuote()" role="alert" aria-live="polite">
        @if (!expandedQuote()) {
          <!-- Collapsed: summary banner with animated pulse border -->
          <div class="qp-collapsed">
            <div class="qp-body">
              <span class="qp-ic">📋</span>
              <div class="qp-text">
                <strong>{{ quotePromptCount() > 1 ? quotePromptCount() + ' new quote requests' : 'New quote request' }}</strong>
                @if (quotePromptCategory()) {
                  <span class="qp-cat">{{ quotePromptCategory() }}</span>
                }
              </div>
            </div>
            <div class="qp-actions">
              <button class="qp-btn" (click)="expandPrompt()" [disabled]="loadingExpand()">
                {{ loadingExpand() ? '…' : 'Respond' }}
              </button>
              <button class="qp-dismiss" (click)="dismissQuotePrompt()" aria-label="Dismiss">×</button>
            </div>
          </div>
        } @else {
          <!-- Expanded: inline proposal form with full detail -->
          @if (expandedQuote(); as eq) {
          <div class="qp-expanded">
            <!-- ── Header: avatar + identity + dismiss ─────────────────────── -->
            <div class="qp-form-hd">
              <div class="qp-identity">
                @if (eq.customerAvatarUrl) {
                  <img [src]="eq.customerAvatarUrl" alt="" class="avatar-circle sm" />
                } @else {
                  <div class="avatar-fallback sm">{{ customerInitials() }}</div>
                }
                <div class="qp-id-text">
                  <strong class="qp-customer-name">{{ eq.customerName }}</strong>
                  <div class="qp-tags">
                    <span class="qp-tag">{{ eq.preferredDate | date: 'mediumDate' }} · {{ eq.timeSlot }}</span>
                    <span class="qp-tag budget">RM {{ eq.budgetMin ?? '—' }}–{{ eq.budgetMax ?? '—' }}</span>
                    @if (eq.propertyType) { <span class="qp-tag">{{ eq.propertyType }}</span> }
                    @if (eq.paymentMode) { <span class="qp-tag pay">{{ payLabel(eq.paymentMode) }}</span> }
                    @if (eq.distanceKm != null) { <span class="qp-tag dist">{{ eq.distanceKm | number:'1.1-1' }} km</span> }
                  </div>
                </div>
              </div>
              <button class="qp-dismiss" (click)="dismissQuotePrompt()" aria-label="Dismiss">×</button>
            </div>

            <!-- ── Address row + map links ─────────────────────────────────── -->
            @if (eq.address) {
              <div class="qp-addr-row">
                <span class="qp-addr">{{ composeAddress(eq) }}</span>
                @if (eq.lat != null && eq.lng != null) {
                  <div class="qp-map-links">
                    <a class="btn-ghost btn-sm" [href]="gmapsUrl(eq.lat, eq.lng)" target="_blank" rel="noopener">
                      <svg width="14" height="14" viewBox="0 0 24 24"><path d="M19.527 4.799c1.212 2.608.937 5.678-.405 8.173-1.101 2.047-2.744 3.74-4.098 5.614-.619.858-1.244 1.75-1.669 2.727-.141.325-.263.658-.383.992-.121.333-.224.673-.34 1.008-.109.314-.236.684-.627.687h-.007c-.466-.001-.579-.53-.695-.887-.284-.874-.581-1.713-1.019-2.525-.51-.944-1.145-1.817-1.79-2.671L19.527 4.799zM8.545 7.705l-3.959 4.707c.724 1.54 1.821 2.863 2.871 4.18.247.31.494.622.737.936l4.984-5.925-.029.01c-1.741.601-3.691-.291-4.392-1.987a3.377 3.377 0 0 1-.209-.716c-.063-.437-.077-.761-.004-1.198l.001-.007zM5.492 3.149l-.003.004c-1.947 2.466-2.281 5.88-1.117 8.77l4.785-5.689-.058-.05-3.607-3.035zM14.661.436l-3.838 4.563a.295.295 0 0 1 .027-.01c1.6-.551 3.403.15 4.22 1.626.176.319.323.683.377 1.045.068.446.085.773.012 1.22l-.003.016 3.836-4.561A8.382 8.382 0 0 0 14.67.439l-.009-.003zM9.466 5.868L14.162.285l-.047-.012A8.31 8.31 0 0 0 11.986 0a8.439 8.439 0 0 0-6.169 2.766l-.016.018 3.665 3.084z" fill="#4285F4"/></svg> Google Maps
                    </a>
                    <a class="btn-ghost btn-sm" [href]="wazeUrl(eq.lat, eq.lng)" target="_blank" rel="noopener">
                      <svg width="14" height="14" viewBox="0 0 24 24"><path d="M13.218 0C9.915 0 6.835 1.49 4.723 4.148c-1.515 1.913-2.31 4.272-2.31 6.706v1.739c0 .894-.62 1.738-1.862 1.813-.298.025-.547.224-.547.522-.05.82.82 2.31 2.012 3.502.82.844 1.788 1.515 2.832 2.036a3 3 0 0 0 2.955 3.528 2.966 2.966 0 0 0 2.931-2.385h2.509c.323 1.689 2.086 2.856 3.974 2.21 1.64-.546 2.36-2.409 1.763-3.924a12.84 12.84 0 0 0 1.838-1.465 10.73 10.73 0 0 0 3.18-7.65c0-2.882-1.118-5.589-3.155-7.625A10.899 10.899 0 0 0 13.218 0zm0 1.217c2.558 0 4.967.994 6.78 2.807a9.525 9.525 0 0 1 2.807 6.78A9.526 9.526 0 0 1 20 17.585a9.647 9.647 0 0 1-6.78 2.807h-2.46a3.008 3.008 0 0 0-2.93-2.41 3.03 3.03 0 0 0-2.534 1.367v.024a8.945 8.945 0 0 1-2.41-1.788c-.844-.844-1.316-1.614-1.515-2.11a2.858 2.858 0 0 0 1.441-.846 2.959 2.959 0 0 0 .795-2.036v-1.789c0-2.11.696-4.197 2.012-5.861 1.863-2.385 4.62-3.726 7.6-3.726zm-2.41 5.986a1.192 1.192 0 0 0-1.191 1.192 1.192 1.192 0 0 0 1.192 1.193A1.192 1.192 0 0 0 12 8.395a1.192 1.192 0 0 0-1.192-1.192zm7.204 0a1.192 1.192 0 0 0-1.192 1.192 1.192 1.192 0 0 0 1.192 1.193 1.192 1.192 0 0 0 1.192-1.193 1.192 1.192 0 0 0-1.192-1.192zm-7.377 4.769a.596.596 0 0 0-.546.845 4.813 4.813 0 0 0 4.346 2.757 4.77 4.77 0 0 0 4.347-2.757.596.596 0 0 0-.547-.845h-.025a.561.561 0 0 0-.521.348 3.59 3.59 0 0 1-3.254 2.061 3.591 3.591 0 0 1-3.254-2.061.64.64 0 0 0-.546-.348z" fill="#33CCFF"/></svg> Waze
                    </a>
                  </div>
                }
              </div>
            }

            <!-- ── Descriptions chips ──────────────────────────────────────── -->
            <div class="qp-form-body">
              @if (eq.descriptions?.length) {
                <div class="qp-details">
                  @for (d of eq.descriptions; track d) {
                    <span class="qp-chip">{{ d }}</span>
                  }
                </div>
              }

              <!-- ── If proposal already sent: post-accept view ────────────── -->
              @if (eq.myProposalId && !eq.myProposalIsAuto) {
                <div class="qp-accepted">
                  <div class="qp-accepted-row">
                    <span class="qp-price">RM {{ (eq.myProposalPrice ?? 0) | number: '1.2-2' }}</span>
                    @if (eq.myProposalEta != null) {
                      <span class="qp-dur">{{ eq.myProposalEta }} min</span>
                    }
                  </div>
                  @if (eq.myProposalMessage) {
                    <p class="qp-msg">{{ eq.myProposalMessage }}</p>
                  }
                </div>
              } @else if (!eq.myProposalId) {
                <!-- ── Proposal form ──────────────────────────────────────── -->
                <label class="qp-field">
                  <input type="number" step="0.01" min="0.01" [(ngModel)]="proposalPrice" name="proposalPrice" placeholder="RM 0.00" class="qp-price-input" required />
                </label>
                <label class="qp-field">
                  <span>ETA <span class="qp-req">*</span> <span class="qp-optional">(min)</span></span>
                  <input type="number" min="1" step="5" [(ngModel)]="proposalEta" name="proposalEta" placeholder="60" class="qp-eta-input" required />
                </label>
                <label class="qp-field">
                  <span>Description <span class="qp-optional">(optional)</span>
                    <button type="button" class="qp-preset-btn" (click)="applyPresetMessage()" title="Insert preset greeting">✎ preset</button>
                  </span>
                  <textarea rows="2" [(ngModel)]="proposalDesc" name="proposalDesc" placeholder="Tell the customer what's included…" class="qp-textarea"></textarea>
                </label>
                @if (proposalError()) {
                  <p class="qp-error">{{ proposalError() }}</p>
                }
                <div class="qp-form-actions">
                  <button class="qp-btn-primary" (click)="submitProposal()" [disabled]="submitting()">
                    {{ submitting() ? 'Sending…' : 'Send proposal' }}
                  </button>
                  <button class="qp-btn-ghost" (click)="collapseExpanded()" [disabled]="submitting()">
                    Cancel
                  </button>
                </div>
              }
            </div>
          </div>
          }
        }
      </div>
    }

    <app-modal
      [open]="topUpOpen()"
      title="Top up your account"
      (closed)="topUpOpen.set(false)"
    >
      <p class="muted">
        Current balance: <strong>RM {{ creditDisplay() }}</strong>
      </p>
      <label class="tu-field">
        Amount (RM)
        <input
          type="number"
          min="1"
          [(ngModel)]="topUpAmount"
          name="topUpAmount"
          (input)="onTopUpAmountChange()"
        />
      </label>

      <!-- Active vouchers -->
      @if (activeVouchers().length > 0) {
        <div class="voucher-list">
          <span class="voucher-list-label">You have vouchers!</span>
          @for (v of activeVouchers(); track v.code) {
            <label class="voucher-opt" [class.voucher-opt--on]="selectedVoucherCode() === v.code">
              <input type="radio" name="voucher" [checked]="selectedVoucherCode() === v.code" (change)="selectVoucher(v.code, v)" />
              <span class="voucher-desc">
                <strong>{{ v.label }}</strong>
                <span class="muted">Pay RM {{ v.discountedAmount }} instead of RM {{ v.originalAmount }}</span>
              </span>
            </label>
          }
        </div>
      }

      <!-- Promo code typeahead -->
      <div class="promo-section">
        <label class="tu-field">
          Promo code <span class="muted small">(optional)</span>
          <input
            type="text"
            [(ngModel)]="promoQuery"
            name="promoQuery"
            placeholder="Type your promo code…"
            (input)="onPromoInput()"
            autocomplete="off"
          />
          @if (promoValidating()) {
            <span class="promo-spinner">Checking…</span>
          }
        </label>
        @if (promoValidated(); as v) {
          <div class="promo-card" [class.promo-card--valid]="v.valid" [class.promo-card--invalid]="!v.valid">
            @if (v.valid) {
              @if (v.discountType === 'topup_bonus') {
                <span class="promo-label">{{ v.label }}</span>
                <span class="promo-slash">
                  <span class="promo-orig">RM {{ v.originalAmount }}</span>
                  <span class="promo-arrow">→</span>
                  <span class="promo-final">RM {{ v.originalAmount }} + RM {{ v.discountValue }} bonus</span>
                </span>
              } @else {
                <span class="promo-label">{{ v.label }}</span>
                <span class="promo-slash">
                  <span class="promo-orig">RM {{ v.originalAmount }}</span>
                  <span class="promo-arrow">→</span>
                  <span class="promo-final">RM {{ v.finalCharge }}</span>
                </span>
              }
              <button type="button" class="promo-remove" (click)="clearPromo()">✕</button>
            } @else {
              <span class="promo-error">{{ v.error }}</span>
              <button type="button" class="promo-remove" (click)="clearPromo()">✕</button>
            }
          </div>
        }
      </div>

      @if (topUpError()) {
        <p class="err">{{ topUpError() }}</p>
      }
      <div class="modal-actions">
        <span class="spacer"></span>
        <button
          class="btn-ghost"
          (click)="topUpOpen.set(false)"
          [disabled]="toppingUp()"
        >
          Cancel
        </button>
        <button
          class="btn-primary"
          (click)="submitTopUp()"
          [disabled]="toppingUp()"
        >
          {{ toppingUp() ? "Processing…" : "Top up" }}
        </button>
      </div>
    </app-modal>

    <!-- Stripe payment overlay - shared across all authenticated flows -->
    @if (stripePayment.state() !== 'idle') {
      <div class="stripe-backdrop"></div>
      <div class="stripe-guard">
        <div class="stripe-header">
          @if (stripePayment.state() === 'processing') {
            <strong>Processing payment</strong>
          } @else if (stripePayment.state() === 'success') {
            <strong>Payment successful</strong>
            <button class="stripe-close" (click)="stripePayment.reset()">✕</button>
          } @else if (stripePayment.state() === 'cancelled') {
            <strong>Payment cancelled</strong>
            <button class="stripe-close" (click)="stripePayment.reset()">✕</button>
          } @else if (stripePayment.state() === 'failed') {
            <strong>Payment failed</strong>
            <button class="stripe-close" (click)="stripePayment.reset()">✕</button>
          }
        </div>
        <div class="stripe-body">
          @if (stripePayment.state() === 'processing') {
            <div class="stripe-processing">
              <p class="stripe-spinner">⏳</p>
              <p>Awaiting payment in new tab…</p>
              <p class="muted small">Complete the payment in the opened tab, then return here.</p>
              @if (stripePayment.completedBalance() != null) {
                <p class="muted small">New balance: <strong>RM {{ stripePayment.completedBalance()!.toFixed(2) }}</strong></p>
              }
            </div>
          }
          @if (stripePayment.state() === 'success') {
            <div class="stripe-result stripe-result-ok">
              <p>✓ Payment successful!</p>
              @if (stripePayment.completedBalance() != null) {
                <p class="muted small">Your new balance is <strong>RM {{ stripePayment.completedBalance()!.toFixed(2) }}</strong>.</p>
              }
            </div>
          }
          @if (stripePayment.state() === 'cancelled') {
            <div class="stripe-result stripe-result-cancel">
              <p>Payment was cancelled or not completed.</p>
              @if (stripePayment.error()) {
                <p class="err small">{{ stripePayment.error() }}</p>
              }
            </div>
          }
          @if (stripePayment.state() === 'failed') {
            <div class="stripe-result stripe-result-fail">
              <p>✕ Payment failed</p>
              @if (stripePayment.error()) {
                <p class="err small">{{ stripePayment.error() }}</p>
              }
              <p class="muted small">Please try again.</p>
            </div>
          }
        </div>
        <div class="stripe-footer">
          @if (stripePayment.state() === 'processing') {
            <div class="stripe-actions">
              <button class="btn-ghost" (click)="stripePayment.cancel()">Cancel</button>
            </div>
          }
          @if (stripePayment.state() === 'success') {
            <div class="stripe-actions">
              <button class="btn-primary" (click)="stripePayment.reset()">Done</button>
            </div>
          }
          @if (stripePayment.state() === 'cancelled') {
            <div class="stripe-actions">
              <button class="btn-ghost" (click)="stripePayment.reset()">Try again</button>
            </div>
          }
        </div>
      </div>
    }

    <!-- ── SP4 Dispatch prompt guard (servicer) ── -->
    <app-dispatch-prompt-guard />
  `,
    styles: [
        `
      .shell {
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      /* §5.3 / §7.13 (deprecated auto-hide removed): the portal topbar is the fixed
         top flex row of .shell - always visible, content scrolls below it. No
         appAutoHide collapse/idle/fade. */
      .topbar {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.3rem 1.5rem;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
      }
      /* DISP-11: phone-only logout icon switch (hidden on desktop/tablet) */
      .logout-switch {
        display: none;
        align-items: center;
        justify-content: center;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 999px;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-muted);
        cursor: pointer;
        transition: color var(--transition), border-color var(--transition);
      }
      .logout-switch:hover {
        color: var(--color-danger);
        border-color: var(--color-danger);
      }
      .logo {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        border: none;
        padding: 0;
        cursor: pointer;
        font-family: var(--font-display);
        font-weight: 400;
        font-size: 1.05rem;
        background: var(--gradient-primary);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        transition: opacity 0.15s ease;
        flex-shrink: 0;
      }
      .logo:hover {
        opacity: 0.8;
      }
      .logo-icon {
        width: 34px;
        height: 34px;
        object-fit: contain;
        flex-shrink: 0;
      }
      .logo-wrap {
        position: relative;
        display: inline-flex;
        width: 34px;
        height: 34px;
        flex-shrink: 0;
      }
      .logo-shimmer {
        position: absolute;
        inset: 0;
        border-radius: 6px;
        background: linear-gradient(90deg, var(--color-border) 25%, var(--color-bg) 50%, var(--color-border) 75%);
        background-size: 200% 100%;
        animation: logo-shimmer-move 2s ease-in-out infinite;
        transition: opacity 0.3s;
      }
      .logo-wrap.loaded .logo-shimmer { opacity: 0; pointer-events: none; animation: none; }
      @keyframes logo-shimmer-move {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .page-title {
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-text);
        padding-left: 0.7rem;
        border-left: 1px solid var(--color-border);
        flex-shrink: 0;
      }
      .notif-bell {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2rem;
        height: 2rem;
        padding: 0;
        border: none;
        background: transparent;
        font-family: inherit;
        cursor: pointer;
        border-radius: 999px;
        color: var(--color-muted);
        text-decoration: none;
        transition: color 0.15s ease, background 0.15s ease;
        /* ≥44px hit area via pseudo-element */
      }
      .notif-bell::after {
        content: '';
        position: absolute;
        inset: -6px;
        border-radius: 999px;
      }
      .notif-bell:hover {
        color: var(--color-text);
        background: var(--color-bg);
      }
      .notif-bell.active {
        color: var(--color-primary);
        background: var(--color-primary-light);
      }
      .notif-count {
        position: absolute;
        top: -2px;
        right: -2px;
        min-width: 16px;
        height: 16px;
        padding: 0 4px;
        border-radius: 999px;
        background: #ef4444;
        color: #fff;
        font-size: 0.6rem;
        font-weight: 700;
        line-height: 16px;
        text-align: center;
        box-shadow: 0 1px 4px rgba(239, 68, 68, 0.4);
      }
      .account {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        line-height: 1.2;
      }
      .uname {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--color-text);
      }
      .utype {
        font-size: 0.65rem;
        color: var(--color-muted);
      }
      .btn-pro {
        background: var(--color-primary);
        color: #fff;
        border: none;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.4rem 0.85rem;
        text-decoration: none;
      }
      .btn-pro:hover {
        opacity: 0.9;
      }
      .credit {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.2rem 0.3rem 0.2rem 0.7rem;
      }
      .credit-amt {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--color-text);
      }
      .credit-topup {
        background: var(--color-primary);
        color: #fff;
        border: none;
        border-radius: 999px;
        font-size: 0.76rem;
        font-weight: 600;
        padding: 0.25rem 0.7rem;
        cursor: pointer;
      }
      .credit-topup:hover {
        opacity: 0.9;
      }
      .tu-field {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.9rem;
        font-weight: 500;
        margin-top: 0.8rem;
      }
      /* Promo code validation */
      .promo-section { position: relative; margin-top: 0.4rem; }
      .promo-spinner { font-size: 0.75rem; color: var(--color-muted); margin-top: 0.15rem; }
      .promo-card {
        display: flex; align-items: center; gap: 0.5rem;
        padding: 0.5rem 0.7rem; margin-top: 0.3rem;
        border-radius: var(--radius); font-size: 0.85rem;
      }
      .promo-card--valid { background: var(--color-primary-light); }
      .promo-card--invalid { background: #fef2f2; border: 1px solid #fecaca; }
      .promo-label { font-weight: 600; white-space: nowrap; }
      .promo-slash { display: flex; align-items: center; gap: 0.4rem; margin-left: auto; }
      .promo-orig { text-decoration: line-through; color: var(--color-muted); }
      .promo-arrow { color: var(--color-muted); font-size: 0.8rem; }
      .promo-final { font-weight: 700; color: var(--color-primary); }
      .promo-error { color: var(--color-danger); flex: 1; }
      .promo-remove { background: none; border: none; cursor: pointer; color: var(--color-muted); font-size: 0.9rem; padding: 0.1rem; line-height: 1; }
      .promo-remove:hover { color: var(--color-danger); }
      .voucher-list { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.4rem; }
      .voucher-list-label { font-size: 0.82rem; font-weight: 600; color: var(--color-muted); }
      .voucher-opt {
        display: flex; align-items: center; gap: 0.5rem;
        padding: 0.5rem 0.6rem; border: 1.5px solid var(--color-border);
        border-radius: var(--radius); cursor: pointer;
        transition: border-color var(--transition), background var(--transition);
      }
      .voucher-opt--on { border-color: var(--color-primary); background: var(--color-primary-light); }
      .voucher-opt input { width: auto; }
      .voucher-desc { display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.85rem; }
      .voucher-desc strong { font-size: 0.88rem; }
      .mode-toggle {
        display: inline-flex;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        overflow: hidden;
        background: var(--color-bg);
      }
      .mode-toggle button {
        background: transparent;
        border: none;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--color-muted);
        padding: 0.3rem 0.8rem;
        cursor: pointer;
      }
      .mode-toggle button.on {
        background: var(--color-primary);
        color: #fff;
      }
      .mode-toggle button:disabled {
        cursor: default;
        opacity: 0.7;
      }
      .online-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.25rem 0.7rem;
        border: 1px solid var(--color-border);
        border-radius: 999px;
        background: var(--color-bg);
        cursor: pointer;
        font-family: inherit;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--color-muted);
        transition: border-color 0.2s, background 0.2s, color 0.2s;
      }
      .online-toggle:hover { border-color: var(--color-text); }
      .online-toggle.on {
        border-color: #22c55e;
        background: rgba(34, 197, 94, 0.08);
        color: #22c55e;
      }
      .online-toggle.on:hover {
        background: rgba(34, 197, 94, 0.15);
      }
      .online-toggle:disabled {
        cursor: default;
        opacity: 0.6;
      }
      .ot-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--color-muted);
        flex-shrink: 0;
        transition: background 0.2s;
      }
      .online-toggle.on .ot-dot {
        background: #22c55e;
        box-shadow: 0 0 4px rgba(34, 197, 94, 0.6);
      }
      .online-toggle:not(.on) .ot-dot {
        background: #ef4444;
      }
      .ot-label { white-space: nowrap; }
      .spacer {
        flex: 1;
      }
      .btn-reseed {
        background: #fef3c7;
        border: 1px solid #fde68a;
        color: #92400e;
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.4rem 0.7rem;
        transition: background 0.15s ease;
      }
      .btn-reseed:hover {
        background: #fde68a;
      }
      .btn-demo {
        background: var(--color-primary-light);
        border: 1px solid var(--color-primary-light);
        color: var(--color-primary);
        font-size: 0.85rem;
        font-weight: 600;
        padding: 0.4rem 0.7rem;
        transition: background 0.15s ease;
      }
      .btn-demo:hover {
        background: var(--color-primary);
        color: #fff;
      }
      .body {
        display: flex;
        flex: 1;
        overflow: hidden;
      }
.admin-portal .content { --content-pt: 0; --content-pl: 0; --content-pr: 0; }
      .content {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        padding: var(--content-pt, 1.5rem) var(--content-pr, 2rem) 1.5rem var(--content-pl, 2rem);
        overscroll-behavior-y: contain;
      }
      .content-main {
        flex: 1 0 auto;
      }
      .content-main.narrow {
        max-width: 720px;
        margin: 1.5rem auto;
        width: 100%;
        padding: 0 1.5rem;
      }

      .ptr-spin-host {
        position: sticky;
        top: 0;
        height: 0;
        z-index: 50;
        pointer-events: none;
      }
      .ptr-spin {
        position: absolute;
        left: 50%;
        top: 6px;
        opacity: 0;
        transform: translate(-50%, -38px);
        will-change: transform, opacity;
      }
      .ptr-spin-ring {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        border: 2.5px solid var(--color-border);
        border-top-color: var(--color-primary);
        background: var(--color-surface);
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.14);
      }
      .ptr-spin-ring--spinning {
        animation: ptr-spin-rot 0.6s linear infinite;
      }
      @keyframes ptr-spin-rot {
        to { transform: rotate(360deg); }
      }
      @media (prefers-reduced-motion: reduce) {
        .ptr-spin-ring--spinning { animation: none; }
      }

      app-site-footer { margin-top: 300px; }

      @media (max-width: 1024px) and (min-width: 761px) {
        .content { padding: var(--content-pt, 1.25rem) var(--content-pr, 1.5rem) 1.25rem var(--content-pl, 1.5rem); }
      }

      @media (max-width: 760px) {
        .shell { height: 100vh; }
        .topbar { flex-wrap: wrap; padding: 0.6rem 1rem; gap: 0.5rem; }
        .btn-pro, .page-title { display: none; }
        .account { align-items: flex-start; }
        .spacer { display: none; }
        .body { flex-direction: column; overflow: hidden; }
        .content { padding: var(--content-pt, 1rem) var(--content-pr, 1rem) 1rem var(--content-pl, 1rem); overflow-y: auto; }
      }

      /* DISP-11/§5.6: phone - keep the account name, swap the "Sign out" text button
         for a far-right icon switch. */
      @media (max-width: 560px) {
        .btn-signout { display: none; }
        .logout-switch { display: inline-flex; margin-left: auto; }
      }

      /* ── Floating FAB stack (customer only) ── */
      .fab-stack {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.75rem;
        z-index: 999;
        transition: gap 0.3s ease;
      }
      /* On collapse the bubble wrapper shrinks to 0 height, which pulls the
         toggle down to the bottom-right corner (animated). */
      .fab-stack.collapsed { gap: 0; }
      .fab-bubbles {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.75rem;
        max-height: 24rem;
        opacity: 1;
        overflow: visible;
        transition: max-height 0.3s ease, opacity 0.25s ease;
      }
      .fab-stack.collapsed .fab-bubbles {
        max-height: 0;
        opacity: 0;
        overflow: hidden;
        pointer-events: none;
      }
      .fab-toggle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 999px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        color: var(--color-muted);
        cursor: pointer;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.1);
        transition: color var(--transition);
        /* ≥44px hit area via padding + ::after */
        position: relative;
      }
      .fab-toggle::before {
        content: '';
        position: absolute;
        inset: -10px;
        border-radius: 999px;
      }
      .fab-toggle:hover {
        color: var(--color-primary);
      }
      .fab-toggle::after {
        content: "";
        display: block;
        width: 0;
        height: 0;
        border-left: 4px solid transparent;
        border-right: 4px solid transparent;
        border-top: 5px solid currentColor;
        transform: translateY(1px);
        transition: transform 0.25s ease;
      }
      .fab-stack.collapsed .fab-toggle::after {
        transform: rotate(180deg) translateY(1px);
      }

      /* ── Chat bubble with rotating glow, status, unread ── */
      .chat-bubble {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 3rem;
        height: 3rem;
        border-radius: 999px;
        background: var(--color-surface);
        border: 1.5px solid var(--color-border);
        color: var(--color-primary);
        cursor: pointer;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
        transition:
          transform 0.3s ease,
          box-shadow var(--transition),
          background var(--transition),
          opacity 0.3s ease;
        overflow: visible;
      }
      .chat-bubble:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
        background: var(--color-bg);
      }
      .chat-bubble:hover .chat-glow {
        background: conic-gradient(
          from var(--chat-angle),
          transparent,
          rgba(201, 90, 60, 0.8),
          rgba(201, 168, 76, 0.6),
          rgba(201, 90, 60, 0.8),
          transparent 70%
        );
      }
      .chat-bubble:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Rotating edge glow - only the gradient angle animates */
      @property --chat-angle {
        syntax: "<angle>";
        inherits: false;
        initial-value: 0deg;
      }
      .chat-glow {
        position: absolute;
        inset: -2.5px;
        border-radius: 999px;
        padding: 2.5px;
        background: conic-gradient(
          from var(--chat-angle),
          transparent,
          rgba(201, 90, 60, 0.35),
          rgba(201, 168, 76, 0.25),
          rgba(201, 90, 60, 0.35),
          transparent 70%
        );
        animation: chat-glow-spin 3s linear infinite;
        -webkit-mask:
          linear-gradient(#000, #000) content-box,
          linear-gradient(#000, #000);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        transition: background 0.3s ease;
      }
      @keyframes chat-glow-spin {
        from {
          --chat-angle: 0deg;
        }
        to {
          --chat-angle: 360deg;
        }
      }

      /* Status dot - bottom-right corner of the chat bubble */
      .chat-status {
        position: absolute;
        bottom: -2px;
        right: -2px;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        border: 2px solid var(--color-surface);
        background: #888;
        transition: background 0.3s ease;
      }
      .chat-status.active {
        background: #22c55e;
        box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
        animation: chat-status-pulse 2s ease-in-out infinite;
      }
      .chat-status.typing {
        background: #f59e0b;
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
        animation: chat-status-pulse 0.8s ease-in-out infinite;
      }
      .chat-status.typing::after {
        content: "";
        position: absolute;
        inset: 2px;
        border-radius: 999px;
        background: radial-gradient(
          circle at 30% 30%,
          transparent 30%,
          rgba(255, 255, 255, 0.6) 50%,
          transparent 70%
        );
        animation: chat-typing-dot 1.2s ease-in-out infinite;
      }
      @keyframes chat-status-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.6;
        }
      }
      @keyframes chat-typing-dot {
        0%,
        100% {
          transform: scale(1);
          opacity: 0.3;
        }
        50% {
          transform: scale(1.3);
          opacity: 1;
        }
      }

      /* Unread badge - top-left of the chat bubble */
      .chat-unread {
        position: absolute;
        top: -6px;
        left: -6px;
        min-width: 20px;
        height: 20px;
        padding: 0 5px;
        border-radius: 999px;
        background: #ef4444;
        color: #fff;
        font-size: 0.7rem;
        font-weight: 700;
        line-height: 20px;
        text-align: center;
        box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4);
      }

      /* ── Request bar with rotating glow ── */
      .request-bar {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        width: 3rem;
        height: 3rem;
        padding: 0;
        overflow: visible;
        background: var(--color-primary);
        background: var(--gradient-primary);
        border: none;
        border-radius: 999px;
        color: #fff;
        cursor: pointer;
        box-shadow:
          0 4px 24px rgba(201, 90, 60, 0.45),
          0 0 40px rgba(201, 90, 60, 0.15);
        transition:
          transform 0.3s ease,
          box-shadow var(--transition),
          opacity 0.3s ease;
      }
      /* Floating tooltip - the label is hidden in the compact circle. */
      .request-bar::after {
        content: 'Request a quote';
        position: absolute;
        right: calc(100% + 0.6rem);
        top: 50%;
        transform: translateY(-50%) translateX(6px);
        background: var(--color-text);
        color: var(--color-surface);
        font-size: 0.78rem;
        font-weight: 600;
        padding: 0.35rem 0.7rem;
        border-radius: 8px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
        transition: opacity 0.18s ease, transform 0.18s ease;
      }
      .request-bar:hover::after {
        opacity: 1;
        transform: translateY(-50%) translateX(0);
      }
      .request-bar:hover {
        transform: translateY(-2px);
        background: var(--gradient-primary-hover);
        box-shadow:
          0 8px 32px rgba(201, 90, 60, 0.55),
          0 0 60px rgba(201, 90, 60, 0.25);
      }
      .request-bar:hover .rb-glow {
        background: conic-gradient(
          from var(--rb-angle),
          transparent,
          rgba(255, 255, 255, 0.8),
          rgba(255, 200, 100, 0.6),
          rgba(255, 255, 255, 0.8),
          transparent 70%
        );
      }

      /* Rotating edge glow - only the gradient angle animates */
      @property --rb-angle {
        syntax: "<angle>";
        inherits: false;
        initial-value: 0deg;
      }
      .rb-glow {
        position: absolute;
        inset: -1px;
        border-radius: 999px;
        padding: 2.5px;
        background: conic-gradient(
          from var(--rb-angle),
          transparent,
          rgba(255, 255, 255, 0.35),
          rgba(255, 200, 100, 0.25),
          rgba(255, 255, 255, 0.35),
          transparent 70%
        );
        animation: rb-glow-spin 3s linear infinite;
        -webkit-mask:
          linear-gradient(#000, #000) content-box,
          linear-gradient(#000, #000);
        -webkit-mask-composite: xor;
        mask-composite: exclude;
        pointer-events: none;
        transition: background 0.3s ease;
      }
      @keyframes rb-glow-spin {
        from {
          --rb-angle: 0deg;
        }
        to {
          --rb-angle: 360deg;
        }
      }
      .rb-plus {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.9rem;
        font-weight: 300;
        line-height: 1;
      }
      /* The request bar is a compact circle now - its descriptive text is
         kept in the DOM for screen readers but not shown. */
      .rb-text {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }

      /* ── F-A: Servicer proposal prompt guard ────────────────────────────── */
      .rewards-banner {
        position: fixed;
        bottom: 1.5rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999;
        display: flex;
        align-items: center;
        gap: 0.8rem;
        background: var(--color-accent);
        color: #1c1917;
        padding: 0.65rem 1.1rem;
        border-radius: 12px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.15);
        animation: qp-slide-up 0.3s ease-out both;
        max-width: calc(100vw - 2rem);
        font-size: 0.9rem;
      }
      .rewards-banner a {
        color: inherit;
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 2px;
        white-space: nowrap;
      }
      .rewards-banner button {
        background: none;
        border: none;
        font-size: 1.2rem;
        cursor: pointer;
        line-height: 1;
        padding: 0 0.15rem;
        opacity: 0.6;
        transition: opacity 0.12s ease;
        color: inherit;
      }
      .rewards-banner button:hover { opacity: 1; }

      /* ── Idle re-engagement banner ── */
      .idle-banner {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.45rem 1.5rem;
        background: var(--color-primary-light);
        border-bottom: 1px solid var(--color-primary);
        font-size: 0.85rem;
        color: var(--color-text);
        flex-shrink: 0;
      }
      .idle-banner a {
        color: var(--color-primary);
        font-weight: 700;
        text-decoration: underline;
        text-underline-offset: 2px;
        white-space: nowrap;
      }
      .idle-banner a:hover { opacity: 0.85; }
      .idle-banner button {
        background: none;
        border: none;
        font-size: 1.1rem;
        cursor: pointer;
        line-height: 1;
        padding: 0 0.15rem;
        opacity: 0.5;
        transition: opacity 0.12s ease;
        color: var(--color-text);
        margin-left: auto;
      }
      .idle-banner button:hover { opacity: 1; }

      .quote-prompt {
        position: fixed;
        bottom: 1.5rem;
        left: 50%;
        transform: translateX(-50%);
        z-index: 1000;
        width: 360px;
        max-width: calc(100vw - 2rem);
        background: var(--color-surface);
        border: 1.5px solid rgba(201, 90, 60, 0.35);
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        overflow: hidden;
        color: var(--color-text);
        animation: qp-slide-up 0.3s ease-out both, qp-pulse-border 2s ease-in-out 0.5s infinite;
      }
      .quote-prompt.expanded {
        width: 400px;
        animation: qp-slide-up 0.3s ease-out both;
      }
      @keyframes qp-slide-up {
        from { opacity: 0; transform: translateX(-50%) translateY(20px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      @keyframes qp-pulse-border {
        0%, 100% { box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 0 0 0 rgba(201, 90, 60, 0.2); }
        50% { box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 0 0 5px rgba(201, 90, 60, 0); }
      }

      /* Collapsed layout */
      .qp-collapsed {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
      }
      .qp-body { display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0; }
      .qp-ic { font-size: 1.3rem; flex-shrink: 0; }
      .qp-text { display: flex; flex-direction: column; min-width: 0; }
      .qp-text strong { font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .qp-cat { font-size: 0.76rem; color: var(--color-muted); }
      .qp-actions { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; }
      .qp-btn {
        background: var(--gradient-primary);
        border: none;
        color: #fff;
        padding: 0.35rem 0.9rem;
        border-radius: 999px;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: opacity 0.15s ease;
        white-space: nowrap;
      }
      .qp-btn:hover { opacity: 0.88; }
      .qp-btn:disabled { opacity: 0.5; cursor: default; }
      .qp-dismiss {
        background: none;
        border: none;
        color: var(--color-muted);
        font-size: 1.2rem;
        cursor: pointer;
        padding: 0 0.25rem;
        line-height: 1;
        transition: color 0.12s ease;
        flex-shrink: 0;
      }
      .qp-dismiss:hover { color: var(--color-text); }

      /* Expanded layout */
      .qp-expanded { padding: 1rem; }
      .qp-form-hd {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.9rem;
      }
      .qp-identity { display: flex; align-items: center; gap: 0.65rem; }
      .qp-avatar {
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 999px;
        background: var(--gradient-primary);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
        font-weight: 700;
        flex-shrink: 0;
      }
      .qp-customer-name {
        display: block;
        font-size: 0.92rem;
        font-weight: 600;
        color: var(--color-text);
      }
      .qp-cat-badge {
        display: inline-block;
        background: var(--color-primary-light);
        color: var(--color-primary);
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.1rem 0.55rem;
        border-radius: 999px;
        margin-top: 0.2rem;
      }
      .qp-form-body {
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
        margin-bottom: 0.8rem;
      }
      .qp-field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        font-size: 0.82rem;
        font-weight: 500;
        color: var(--color-muted);
      }
      .qp-optional { font-weight: 400; font-size: 0.75rem; opacity: 0.7; }
      .qp-preset-btn {
        background: none; border: 1px solid var(--color-border); color: var(--color-muted);
        font-size: 0.68rem; font-family: inherit; cursor: pointer; border-radius: 3px;
        padding: 0.05rem 0.4rem; margin-left: 0.4rem; transition: color 0.15s, border-color 0.15s;
      }
      .qp-preset-btn:hover { color: var(--color-primary); border-color: var(--color-primary); }
      .qp-price-input {
        width: 100%;
        padding: 0.45rem 0.6rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-bg);
        color: var(--color-text);
        font-size: 0.9rem;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s ease;
      }
      .qp-price-input:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
      .qp-textarea {
        width: 100%;
        padding: 0.45rem 0.6rem;
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        background: var(--color-bg);
        color: var(--color-text);
        font-size: 0.88rem;
        font-family: inherit;
        resize: vertical;
        outline: none;
        transition: border-color 0.15s ease;
        box-sizing: border-box;
      }
      .qp-textarea:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
      .qp-eta-input { width: 80px; padding: 0.45rem 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius); font-size: 0.95rem; background: var(--color-surface); color: var(--color-text); outline: none; box-sizing: border-box; }
      .qp-eta-input:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
      .qp-details { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
      .qp-chip { font-size: 0.75rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 999px; padding: 0.1rem 0.5rem; color: var(--color-muted); }
      .qp-error { color: var(--color-danger); font-size: 0.82rem; margin: 0; }

      /* ── Detail tags (match jobs-card layout) ──────────────────────────── */
      .qp-id-text { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
      .qp-tags { display: flex; flex-wrap: wrap; gap: 0.3rem; }
      .qp-tag {
        font-size: 0.72rem; font-weight: 500; color: var(--color-muted);
        background: var(--color-bg); border: 1px solid var(--color-border);
        border-radius: 999px; padding: 0.1rem 0.5rem; white-space: nowrap;
      }
      .qp-tag.budget { color: var(--color-text); font-weight: 600; }
      .qp-tag.pay { color: var(--color-primary); border-color: var(--color-primary); }
      .qp-tag.dist { color: var(--color-muted); }
      .qp-addr-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 0.5rem; margin: 0.5rem 0; font-size: 0.82rem; color: var(--color-text);
      }
      .qp-addr { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .qp-map-links { display: flex; gap: 0.5rem; flex-shrink: 0; }
      .qp-map-links a { font-size: 0.75rem; display: inline-flex; align-items: center; gap: 0.25rem; }
      .qp-map-links svg { width: 14px; height: 14px; }

      /* ── Post-accept view (proposal already sent) ────────────────────────── */
      .qp-accepted {
        display: flex; flex-direction: column; gap: 0.3rem;
        padding-top: 0.5rem; border-top: 1px solid var(--color-border);
      }
      .qp-accepted-row {
        display: flex; align-items: baseline; gap: 0.6rem; flex-wrap: wrap;
      }
      .qp-price { font-weight: 700; color: var(--color-primary); font-size: 1rem; }
      .qp-dur {
        font-size: 0.78rem; font-weight: 600; color: var(--color-muted);
        background: var(--color-bg); border: 1px solid var(--color-border);
        border-radius: 999px; padding: 0.1rem 0.55rem;
      }
      .qp-msg { margin: 0; font-size: 0.85rem; color: var(--color-text); line-height: 1.35; }

      /* ── Avatar variants ─────────────────────────────────────────────────── */
      .avatar-circle.sm, .avatar-fallback.sm { width: 32px; height: 32px; font-size: 0.85rem; }
      .avatar-circle { border-radius: 50%; object-fit: cover; }
      .avatar-fallback {
        border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: var(--color-accent); color: white; font-weight: 600;
      }

      /* ── Small ghost button ──────────────────────────────────────────────── */
      .btn-sm { font-size: 0.75rem; padding: 0.2rem 0.55rem; border-radius: var(--radius); }
      .qp-form-actions { display: flex; align-items: center; gap: 0.5rem; }
      .qp-btn-primary {
        background: var(--gradient-primary);
        border: none;
        color: #fff;
        padding: 0.45rem 1.1rem;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        font-family: inherit;
        transition: opacity 0.15s ease;
      }
      .qp-btn-primary:hover { opacity: 0.88; }
      .qp-btn-primary:disabled { opacity: 0.5; cursor: default; }
      .qp-btn-ghost {
        background: none;
        border: 1px solid var(--color-border);
        color: var(--color-muted);
        padding: 0.45rem 0.85rem;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: border-color 0.15s ease, color 0.15s ease;
      }
      .qp-btn-ghost:hover { border-color: var(--color-text); color: var(--color-text); }
      .qp-btn-ghost:disabled { opacity: 0.5; cursor: default; }

      @media (max-width: 600px) {
        .quote-prompt,
        .quote-prompt.expanded {
          width: calc(100vw - 2rem);
        }
      }
      .stripe-backdrop {
        position: fixed; inset: 0; z-index: 2000;
        background: rgba(0,0,0,0.35);
      }
      .stripe-guard {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
        z-index: 2001; width: min(420px,90vw);
        background: var(--color-surface); border-radius: var(--radius);
        box-shadow: 0 8px 40px rgba(0,0,0,0.2);
        display: flex; flex-direction: column; overflow: hidden;
      }
      .stripe-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 1rem 1.25rem 0.5rem;
      }
      .stripe-header strong { font-size: 1rem; }
      .stripe-close {
        background: none; border: none; font-size: 1.1rem;
        cursor: pointer; color: var(--color-muted); padding: 0.25rem;
      }
      .stripe-body { padding: 0 1.25rem 1rem; }
      .stripe-footer { padding: 0.75rem 1.25rem; border-top: 1px solid var(--color-border); }
      .stripe-processing { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; text-align: center; }
      .stripe-spinner { font-size: 2rem; margin: 0; }
      .stripe-result { text-align: center; padding: 0.5rem 0; }
      .stripe-result p { margin: 0.25rem 0; }
      .stripe-result-ok p:first-child { font-weight: 700; color: var(--color-success); font-size: 1.05rem; }
      .stripe-result-cancel p:first-child { font-weight: 600; }
      .stripe-result-fail p:first-child { font-weight: 600; color: var(--color-danger); }
      .stripe-actions { display: flex; justify-content: center; gap: 0.5rem; }
    `,
    ]
})
export class ShellComponent implements OnInit, OnDestroy {
  protected readonly isDevMode = isDevMode;
  protected readonly routeFor = routeFor;
  protected readonly config = inject(ConfigService);
  @Input() portalTitle = "Portal";
  @Input() navItems: NavItem[] = [];
  @Input() narrow = false;

  widget = inject(ChatWidgetService);
  auth = inject(AuthService);
  notifications = inject(NotificationService);
  notifPanel = inject(NotificationPanelService);
  themeSvc = inject(ThemeService);
  private router = inject(Router);
  private api = inject(ApiService);
  private socket = inject(SocketService);
  private toast = inject(ToastService);
  private dialog = inject(DialogService);
  protected stripePayment = inject(StripePaymentService);
  @ViewChild('contentEl') private contentEl!: ElementRef<HTMLElement>;

  /** True while a sign-out is in flight (revoke request awaiting). */
  signingOut = signal(false);
  logoLoaded = signal(false);

  // ── Rewards re-engagement prompt ────────────────────────────────────────
  rewardsPromptVisible = signal(false);
  rewardsPromptPoints = signal(0);

  // ── Idle re-engagement banner (30+ days no booking) ─────────────────────
  idleBannerVisible = signal(false);

  loadRewardsPrompt(): void {
    const dismissed = localStorage.getItem('rewardsPromptDismissedAt');
    if (dismissed && (Date.now() - Number(dismissed)) < 3 * 24 * 60 * 60 * 1000) return;
    this.api.get<{ show: boolean; points: number }>('/user/me/rewards/prompt').subscribe({
      next: (r) => {
        if (r.show && r.points > 0) {
          this.rewardsPromptPoints.set(r.points);
          this.rewardsPromptVisible.set(true);
        }
      },
      error: () => {},
    });
  }

  dismissRewardsPrompt(): void {
    this.rewardsPromptVisible.set(false);
    localStorage.setItem('rewardsPromptDismissedAt', String(Date.now()));
  }

  checkIdleBanner(): void {
    const dismissed = localStorage.getItem('idleBannerDismissedAt');
    if (dismissed && (Date.now() - Number(dismissed)) < 30 * 24 * 60 * 60 * 1000) return;
    this.api.get<{ data: { createdAt: string }[] }>('/bookings?limit=1').subscribe({
      next: (r) => {
        const lastBooking = r.data?.[0]?.createdAt;
        if (!lastBooking) {
          this.idleBannerVisible.set(true);
          return;
        }
        const daysSince = Math.floor((Date.now() - new Date(lastBooking).getTime()) / 86_400_000);
        if (daysSince >= 30) this.idleBannerVisible.set(true);
      },
      error: () => {},
    });
  }

  dismissIdleBanner(): void {
    this.idleBannerVisible.set(false);
    localStorage.setItem('idleBannerDismissedAt', String(Date.now()));
  }

  // ── F-A: Servicer proposal prompt guard ────────────────────────────────
  pendingQuotes = signal<IncomingQuoteSummary[]>([]);
  expandedQuote = signal<OpenedQuoteDetail | null>(null);
  submitting = signal(false);
  loadingExpand = signal(false);
  proposalError = signal('');
  proposalPrice: number | null = null;
  proposalEta: number | null = null;
  proposalDesc = '';
  quotePromptVisible = computed(() => this.pendingQuotes().length > 0);
  quotePromptCount = computed(() => this.pendingQuotes().length);
  quotePromptCategory = computed(() => this.pendingQuotes()[0]?.category ?? '');
  customerInitials = computed(() => {
    const name = this.expandedQuote()?.customerName ?? '';
    return name.split(' ').map((p: string) => p[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
  });

  // ── Quote prompt helpers (match jobs-card layout) ──────────────────────
  composeAddress(q: OpenedQuoteDetail): string {
    const tail = [q.postcode, q.district].filter(Boolean).join(' ');
    return [q.address, tail].filter(Boolean).join(', ');
  }
  gmapsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }
  wazeUrl(lat: number, lng: number): string {
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }
  private readonly PAY_LABELS: Record<string, string> = {
    pay_now: 'Pay now', pay_later: 'Pay later', cash: 'Cash', credit: 'Credit',
  };
  payLabel(mode?: string | null): string {
    if (!mode) return '';
    return this.PAY_LABELS[mode] ?? mode.replace(/_/g, ' ');
  }

  private quoteSub?: Subscription;
  private quoteDismissTimer?: ReturnType<typeof setTimeout>;

  fabCollapsed = signal(false);

  /** Guards the auto pop-out of the help chat so it fires once per quote/new entry. */
  private quoteChatAutoOpened = false;

  switchingMode = signal(false);
  onlineToggling = signal(false);
  modeError = signal("");

  // ── Global search ────────────────────────────────────────────────────────
  // ── Credit wallet ──────────────────────────────────────────────────────
  creditBalance = computed<number | null>(() => {
    const p = this.auth.principal();
    if (!p) return null;
    if (p.role === "servicer") return p.depositBalance ?? 0;
    if (p.role === "customer") return p.creditBalance ?? 0;
    return null;
  });
  topUpOpen = signal(false);
  toppingUp = signal(false);
  topUpError = signal("");
  topUpAmount: number | null = null;
  activeVouchers = signal<ActiveVoucher[]>([]);
  selectedVoucherCode = signal('');

  onTopUpAmountChange(): void {
    this.selectedVoucherCode.set('');
    const amt = Number(this.topUpAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      this.activeVouchers.set([]);
      return;
    }
    this.api.get<{ data: ActiveVoucher[] }>(`/rewards/active-vouchers?topupAmount=${amt}`).subscribe({
      next: (r) => {
        this.activeVouchers.set(r.data ?? []);
      },
      error: () => {},
    });
  }

  selectVoucher(code: string, voucher: ActiveVoucher): void {
    this.selectedVoucherCode.set(code);
    this.promoCode.set(code);
    if (voucher.discountType === 'topup_fixed') {
      this.promoDiscount.set(voucher.discountValue);
    }
    this.promoValidated.set({
      valid: true,
      discountType: voucher.discountType,
      discountValue: voucher.discountValue,
      originalAmount: voucher.originalAmount,
      finalCharge: voucher.discountedAmount,
      label: voucher.label,
    });
  }

  promoQuery = signal("");
  promoCode = signal("");
  promoDiscount = signal(0);
  promoValidating = signal(false);
  promoValidated = signal<PromoValidationResult | null>(null);
  private promoTimer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('document:keydown.escape')
  onEscKey(): void {
    if (this.expandedQuote()) {
      this.collapseExpanded();
    } else if (this.pendingQuotes().length > 0) {
      this.dismissQuotePrompt();
    }
  }

  ngOnInit(): void {
    this.stripePayment.checkPopupContext();
    this.notifications.start();
    if (this.auth.principal()?.role === 'customer') {
      this.loadRewardsPrompt();
      this.checkIdleBanner();
    }
    // Refresh credit balance when the tab regains focus (user may have topped up
    // in another window/tab).
    this._visHandler = () => {
      if (document.visibilityState !== 'visible') return;
      const p = this.auth.principal();
      if (!p) return;
      if (p.role === 'customer') {
        this.api.get<{ balance: number }>('/user/me/credit').subscribe({
          next: (r) => this.auth.updateCreditBalance(r.balance),
        });
      } else if (p.role === 'servicer') {
        this.api.get<{ depositBalance: number; creditBalance: number }>('/servicer/me/deposit').subscribe({
          next: (r) => this.auth.updatePrincipal({ depositBalance: r.depositBalance, creditBalance: r.creditBalance }),
        });
      }
    };
    document.addEventListener('visibilitychange', this._visHandler);
    // Auto-collapse the FAB stack on the quote form so the request/chat bubbles
    // don't cover the fields. Fires on entering any quote/new route.
    // Auto-send: detect `?q=` in the URL and open the chat with that question.
    // Check on initial load AND on every navigation.
    this.router.events.subscribe(() => {
      this.contentEl?.nativeElement.scrollTo({ top: 0, behavior: 'instant' });
      const idx = this.router.url.indexOf('?q=');
      if (idx >= 0) {
        const q = decodeURIComponent(this.router.url.slice(idx + 3).split('&')[0]);
        if (q) this.widget.openWithQuestion(q);
      }
    });

    // Also check the current URL immediately (first load before any navigation event).
    (() => {
      const idx = this.router.url.indexOf('?q=');
      if (idx >= 0) {
        const q = decodeURIComponent(this.router.url.slice(idx + 3).split('&')[0]);
        if (q) this.widget.openWithQuestion(q);
      }
    })();

    // F-A: Servicer proposal prompt guard - show overlay on quote.new
    this.quoteSub = this.socket.on<{ quoteId: string; category?: string }>('quote.new').subscribe((data) => {
      if (this.auth.principal()?.role !== 'servicer') return;
      if (this.pendingQuotes().some((q) => q.quoteId === data.quoteId)) return;
      this.pendingQuotes.update((q) => [...q, { quoteId: data.quoteId, category: data.category ?? '' }]);
      this.resetQuoteTimer();
    });
  }

  private _visHandler: (() => void) | null = null;

  ngOnDestroy(): void {
    this.quoteSub?.unsubscribe();
    if (this.quoteDismissTimer) clearTimeout(this.quoteDismissTimer);
    if (this._visHandler) {
      document.removeEventListener('visibilitychange', this._visHandler);
      this._visHandler = null;
    }
  }

  private resetQuoteTimer(): void {
    // No auto-dismiss — prompt stays until servicer explicitly dismisses
  }

  dismissQuotePrompt(): void {
    this.pendingQuotes.set([]);
    this.expandedQuote.set(null);
    this.proposalError.set('');
    if (this.quoteDismissTimer) clearTimeout(this.quoteDismissTimer);
  }

  collapseExpanded(): void {
    this.expandedQuote.set(null);
    this.proposalError.set('');
  }

  expandPrompt(): void {
    const q = this.pendingQuotes()[0];
    if (!q || this.loadingExpand()) return;
    this.loadingExpand.set(true);
    this.proposalError.set('');
    this.api.post<{
      customerName: string; customerAvatarUrl: string | null;
      proposalPrefill: { defaultTotal: number; estimatedDurationMin?: number } | null;
      descriptions?: string[];
      preferredDate: string | null; timeSlot: string | null;
      lat: number | null; lng: number | null;
      budgetMin: number | null; budgetMax: number | null;
      address: string | null; postcode: string | null; district: string | null; state: string | null;
      propertyType: string | null; paymentMode: string | null; notes: string | null;
      images: string[]; distanceKm: number | null; isUrgent: boolean; urgentFee: number | null;
      myProposalId: string | null; myProposalIsAuto: boolean;
      myProposalPrice: number | null; myProposalEta: number | null; myProposalMessage: string | null;
    }>(
      `/servicer/quotes/${q.quoteId}/open`, {}
    ).subscribe({
      next: (data) => {
        this.loadingExpand.set(false);
        this.expandedQuote.set({
          ...q,
          customerName: data.customerName,
          customerAvatarUrl: data.customerAvatarUrl,
          estimatedPrice: data.proposalPrefill?.defaultTotal ?? 0,
          estimatedDurationMin: data.proposalPrefill?.estimatedDurationMin,
          descriptions: data.descriptions ?? [],
          preferredDate: data.preferredDate,
          timeSlot: data.timeSlot,
          lat: data.lat,
          lng: data.lng,
          budgetMin: data.budgetMin,
          budgetMax: data.budgetMax,
          address: data.address,
          postcode: data.postcode,
          district: data.district,
          state: data.state,
          propertyType: data.propertyType,
          paymentMode: data.paymentMode,
          notes: data.notes,
          images: data.images,
          distanceKm: data.distanceKm,
          isUrgent: data.isUrgent,
          urgentFee: data.urgentFee,
          myProposalId: data.myProposalId,
          myProposalIsAuto: data.myProposalIsAuto,
          myProposalPrice: data.myProposalPrice,
          myProposalEta: data.myProposalEta,
          myProposalMessage: data.myProposalMessage,
        });
        this.proposalPrice = data.proposalPrefill?.defaultTotal ?? null;
        this.proposalEta = data.proposalPrefill?.estimatedDurationMin ?? null;
        this.proposalDesc = '';
      },
      error: () => {
        this.loadingExpand.set(false);
        this.toast.error('Could not load quote details.');
      },
    });
  }

  applyPresetMessage(): void {
    const q = this.expandedQuote();
    const name = q?.customerName ?? 'there';
    const price = this.proposalPrice ? `RM ${this.proposalPrice}` : 'a fair price';
    const eta = this.proposalEta ? `${this.proposalEta} min` : 'a short time';
    this.proposalDesc = `Hello ${name}, I am a pro at this - please select me. I can do it for you for just ${price} in ${eta}.`;
  }

  submitProposal(): void {
    const q = this.expandedQuote();
    if (!q || this.submitting()) return;
    const price = Number(this.proposalPrice);
    if (!Number.isFinite(price) || price <= 0) {
      this.proposalError.set('Enter a valid price greater than 0.');
      return;
    }
    this.submitting.set(true);
    this.proposalError.set('');
    this.api.post(`/servicer/quotes/${q.quoteId}/propose`, {
      proposedPrice: price,
      etaMinutes: this.proposalEta || undefined,
      message: this.proposalDesc || undefined,
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.toast.success('Proposal sent!');
        this.pendingQuotes.update((list) => list.filter((x) => x.quoteId !== q.quoteId));
        // Keep prompt open for next pending quote if available
        this.expandedQuote.set(null);
        this.proposalDesc = '';
        this.proposalPrice = null;
        this.proposalEta = null;
      },
      error: (e: { message?: string }) => {
        this.submitting.set(false);
        this.proposalError.set(e.message ?? 'Could not send proposal. Please try again.');
      },
    });
  }

  /** Whether this account has a credit balance (customers and servicers). */
  showCredit(): boolean {
    const role = this.auth.principal()?.role;
    return role === "customer" || role === "servicer";
  }

  creditDisplay(): string {
    const b = this.creditBalance();
    return b == null ? " - " : b.toFixed(2);
  }

  openTopUp(): void {
    this.topUpAmount = null;
    this.topUpError.set("");
    this.activeVouchers.set([]);
    this.selectedVoucherCode.set('');
    this.promoQuery.set("");
    this.promoCode.set("");
    this.promoDiscount.set(0);
    this.promoValidated.set(null);
    this.promoValidating.set(false);
    this.topUpOpen.set(true);
  }

  onPromoInput(): void {
    const q = this.promoQuery().trim();
    if (this.promoTimer) clearTimeout(this.promoTimer);
    if (!q) {
      this.clearPromo();
      return;
    }
    this.promoTimer = setTimeout(() => this.validatePromo(q), 400);
  }

  private validatePromo(code: string): void {
    const amt = Number(this.topUpAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    this.promoValidating.set(true);
    this.promoValidated.set(null);
    this.api.post<PromoValidationResult>('/rewards/voucher/validate', { code, topupAmount: amt }).subscribe({
      next: (r) => {
        this.promoValidating.set(false);
        this.promoValidated.set(r);
        if (r.valid) {
          this.promoCode.set(code);
          this.promoDiscount.set(r.discountValue ?? 0);
        } else {
          this.promoCode.set('');
          this.promoDiscount.set(0);
        }
      },
      error: () => {
        this.promoValidating.set(false);
        this.promoValidated.set({ valid: false, error: 'Could not validate code' });
        this.promoCode.set('');
        this.promoDiscount.set(0);
      },
    });
  }

  clearPromo(): void {
    this.promoCode.set("");
    this.promoDiscount.set(0);
    this.promoQuery.set("");
    this.promoValidated.set(null);
    this.promoValidating.set(false);
    if (this.promoTimer) clearTimeout(this.promoTimer);
  }

  submitTopUp(): void {
    const amount = Number(this.topUpAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.topUpError.set("Enter a valid top-up amount.");
      return;
    }
    // Open the payment tab NOW, synchronously inside the click handler, so the
    // browser treats it as user-initiated and does not block the popup. The
    // Stripe URL is set once the top-up POST returns (in runTopUp). Without
    // this, window.open() fired from the async callback is blocked and the flow
    // falls back to navigating the CURRENT tab.
    const payTab = window.open('about:blank', '_blank');
    this.runTopUp(amount, payTab);
  }

  private runTopUp(amount: number, payTab: Window | null): void {
    this.toppingUp.set(true);
    this.topUpError.set("");

    const role = this.auth.principal()?.role;
    const endpoint = role === 'servicer' ? '/servicer/me/topup' : '/user/me/topup';
    const body: Record<string, unknown> = { amount };
    if (this.promoCode()) body['voucherCode'] = this.promoCode();

    this.api.post<{ url: string | null; sessionId?: string; balance?: number }>(endpoint, body).subscribe({
      next: (r) => {
        this.toppingUp.set(false);
        this.topUpOpen.set(false);
        if (r.url && r.sessionId) {
          this.stripePayment.openPayment({
            url: r.url,
            sessionId: r.sessionId,
            targetWindow: payTab,
            onSuccess: (balance) => {
              this.auth.updateCreditBalance(balance);
              this.toast.success(`Top-up successful! New balance: RM ${balance.toFixed(2)}`);
            },
          });
        } else {
          // No Stripe URL (instant credit or error) - close the blank tab.
          try { payTab?.close(); } catch { /* ignore */ }
          if (typeof r.balance === 'number') {
            this.auth.updateCreditBalance(r.balance);
            this.toast.success(`Topped up RM ${Number(amount).toFixed(2)}.`);
          }
        }
      },
      error: (e) => {
        this.toppingUp.set(false);
        try { payTab?.close(); } catch { /* ignore */ }
        this.topUpError.set(e.message ?? "Top-up failed");
      },
    });
  }

  logout(): void {
    if (this.signingOut()) return;
    this.dialog
      .confirm("Sign out?", {
        detail: "You'll need to sign in again to access your account.",
        confirmLabel: "Sign out",
        cancelLabel: "Stay signed in",
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.signingOut.set(true);
        this.notifications.stop();
        // auth.logout() always clears the local session; it resolves false when
        // the backend refresh-token revoke did not confirm (network/down).
        this.auth.logout().then((revoked) => {
          this.signingOut.set(false);
          if (!revoked) {
            this.toast.error(
              "Signed out on this device, but we couldn't reach the server to end the session everywhere. Sign out again when you're back online.",
            );
          }
          this.router.navigate([routeFor('home')]);
        });
      });
  }

  /** The logo title navigates to dashboard when logged in, home page otherwise. */
  goHome(): void {
    const role = this.auth.principal()?.role;
    const path = role === 'admin' ? routeFor('admin') : role === 'servicer' ? routeFor('servicer') : role === 'customer' ? routeFor('customer') : routeFor('home');
    window.location.href = path;
  }

  /** Label of the page currently shown - the deepest matching nav item. */
  currentPageLabel(): string {
    const url = this.router.url.split("?")[0];
    let best: NavItem | undefined;
    for (const item of this.navItems) {
      const hit = item.exact ? url === item.path : url.startsWith(item.path);
      if (hit && (!best || item.path.length > best.path.length)) best = item;
    }
    return best?.label ?? "";
  }

  /** Username shown in the topbar - the local part of the account email. */
  displayName(): string {
    const email = this.auth.accountEmail();
    return email ? email.split("@")[0] : "";
  }

  /** Plain-language account type shown under the username. */
  accountType(): string {
    if (this.auth.isServicerAccount()) return "Servicer account";
    return this.auth.principal()?.role === "admin"
      ? "Admin account"
      : "Customer account";
  }

  /**
   * Toggles the servicer's online/offline status (Lalamove-style).
   * Calls PATCH /servicer/me/online to update the backend, then
   * patches the local Principal so the UI reflects immediately.
   */
  toggleOnline(): void {
    const p = this.auth.principal();
    if (!p || p.role !== 'servicer') return;
    const next = !p.isOnline;
    this.onlineToggling.set(true);
    this.api.patch('/servicer/me/online', { isOnline: next }).subscribe({
      next: () => {
        this.auth.updatePrincipal({ ...p, isOnline: next });
        this.onlineToggling.set(false);
      },
      error: () => this.onlineToggling.set(false),
    });
  }

  /**
   * Switches a servicer account between servicer mode and customer mode.
   * Customer mode fetches a customer-scoped session from the backend; servicer
   * mode just restores the stashed session, so no network call is needed.
   */
  setMode(target: "servicer" | "customer"): void {
    if (this.switchingMode() || this.auth.mode() === target) return;
    this.modeError.set("");
    if (target === "customer") {
      this.switchingMode.set(true);
      this.auth.switchToCustomerMode().subscribe({
        next: () => {
          this.switchingMode.set(false);
          this.router.navigate([routeFor('customer')]);
        },
        error: (e) => {
          this.switchingMode.set(false);
          this.modeError.set(e.message ?? "Could not switch to customer mode");
          setTimeout(() => this.modeError.set(""), 6000);
        },
      });
    } else {
      this.auth.switchToServicerMode();
      this.router.navigate([routeFor('servicer')]);
    }
  }

  /** Start a quote request with no category pre-selected. */
  newQuote(): void {
    this.router.navigate([routeFor('customer.quote')]);
  }

  /** Open the chat widget overlay. */
  openChat(): void {
    this.widget.open();
  }

  /**
   * Toggle the notification dropdown. Refreshes on open so the panel always
   * shows the latest. stopPropagation keeps the document:click handler (which
   * closes the demo dropdowns) from interfering; the panel closes via its own
   * backdrop / Esc / navigation.
   */
  toggleNotifPanel(ev: Event): void {
    ev.stopPropagation();
    if (!this.notifPanel.isOpen()) this.notifications.refresh();
    this.notifPanel.toggle();
  }

}
