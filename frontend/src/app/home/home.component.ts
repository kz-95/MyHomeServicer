import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  isDevMode,
  signal,
} from "@angular/core";
import { placeholderUrl } from "../core/category-colors";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { routeFor } from "../core/route-for";
import { ApiService } from "../core/services/api.service";
import { AuthService } from "../core/services/auth.service";
import { ConfigService } from "../core/services/config.service";
import { ThemeService } from "../core/services/theme.service";
import { ChatWidgetService } from "../core/services/chat-widget.service";
import { DemoBarComponent } from "../shared/demo-bar.component";
import { IconComponent } from "../shared/icon.component";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  defaultPriceSuggestion?: number;
  imageUrl?: string | null;
  bannerUrl?: string | null;
  cardColor?: string | null;
  bgZoom?: number | null;
  bgPosX?: number | null;
  bgPosY?: number | null;
  parentCategoryId?: string | null;
}

@Component({
  selector: "app-home",
  imports: [FormsModule, RouterLink, DemoBarComponent, IconComponent],
  template: `
    <div class="page page-enter">
      @if (config.hasDemoData) {
        <app-demo-bar />
      }
      <header class="topnav">
        <a class="brand" [routerLink]="routeFor('home')">
          <span class="logo-wrap" [class.loaded]="logoLoaded()">
            <img
              src="assets/ico/MyHomeServicerIcon.png"
              class="logo-icon"
              alt=""
              (load)="logoLoaded.set(true)"
            />
            <span class="logo-shimmer"></span>
          </span>
          My Home Servicer
        </a>
        <div class="search">
          <span class="search-ic">
            <app-icon name="search" sizeToken="sm" />
          </span>
          <input
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            name="navsearch"
            placeholder="Search for a service…"
            aria-label="Search services"
          />
        </div>
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
          <span class="tt-label">{{
            themeSvc.theme() === "warm" ? "Day" : "Night"
          }}</span>
        </button>
        <span class="spacer"></span>
        @if (auth.isLoggedIn()) {
          <a class="nav-btn nav-btn--outline" [routerLink]="portalPath()"
            >My portal</a
          >
        } @else {
          <a class="nav-btn nav-btn--ghost" [routerLink]="routeFor('login')">Log in</a>
        }
        <a class="nav-btn nav-btn--solid" [routerLink]="routeFor('register.servicer')"
          >Join as Servicer</a
        >
      </header>

      <section class="hero">
        <span class="hero-bg">
          <span
            class="hero-photo"
            [style.background-image]="
              'url(' +
              (heroBannerUrl() || '/assets/Images/Banner_Placeholder.png') +
              ')'
            "
            [style.background-size]="heroZoom() + '%'"
            [style.background-position]="heroPosX() + '% ' + heroPosY() + '%'"
          ></span>
          <span class="hero-wash"></span>
          <span class="hero-cover" [class.loaded]="!heroImageLoading()"></span>
          @if (heroImageLoading()) {
            <span class="bw-scan1"></span>
            <span class="bw-scan2"></span>
            <span class="bw-sweep1"></span>
            <span class="bw-sweep2"></span>
          }
        </span>
        <div class="hero-inner page-child">
          <h1>Home service,<br />sorted.</h1>
          <p class="hero-sub">
            Tell us what you need and get quotes from trusted local servicers -
            plumbing, cleaning, aircon and more.
          </p>
          <div class="hero-search-wrap">
            <div class="hero-search hero-search-white">
              <input
                [ngModel]="query()"
                (ngModelChange)="
                  query.set($event); searchDropdownOpen.set(true)
                "
                name="herosearch"
                placeholder="What service do you need?"
                aria-label="Search services"
                (keydown.enter)="heroSearch()"
                (focus)="searchDropdownOpen.set(!!query().trim())"
                (blur)="closeSearchDropdown()"
              />
              <button class="btn-primary hero-cta" (click)="heroSearch()">
                Get Quotes →
              </button>
            </div>
            @if (searchDropdownOpen() && query().trim()) {
              <div class="search-dropdown" (mousedown)="$event.preventDefault()">
                @for (cat of filtered(); track cat.id) {
                  <button class="sd-item" (mousedown)="pick(cat)">
                    <span class="sd-ic"
                      ><app-icon
                        [name]="cat.icon || 'home'"
                        sizeToken="sm"
                        strokeWidth="1.5"
                    /></span>
                    <span>{{ cat.name }}</span>
                    <span class="sd-price">
                      @if (cat.defaultPriceSuggestion) {
                        from RM {{ cat.defaultPriceSuggestion }}
                      } @else {
                        &ndash;
                      }
                    </span>
                  </button>
                } @empty {
                  <div class="sd-empty">No services match</div>
                }
              </div>
            }
          </div>
          <p class="hero-hint">
            <a [routerLink]="routeFor('login')">Sign in</a>
            <span class="dot-sep"> - or - </span>
            <a [routerLink]="routeFor('register.servicer')">Join as Servicer</a>
          </p>
        </div>
      </section>

      <section class="cats">
        <h2 class="page-child">Browse services</h2>
        @if (loading()) {
          <div class="grid">
             @for (_ of [1, 2, 3, 4, 5, 6]; track _; let i = $index) {
               <div class="card skeleton page-child">
                  <span class="bw-scan1" [style.animation-delay.ms]="(-700 + i * 350) % 1200 - 1200"></span>
                  <span class="bw-scan2" [style.animation-delay.ms]="(i * 350) % 1400 - 1400"></span>
                  <span class="bw-sweep1" [style.animation-delay.ms]="(-1300 + i * 350) % 1800 - 1800"></span>
                  <span class="bw-sweep2" [style.animation-delay.ms]="(-600 + i * 350) % 900 - 900"></span>
                </div>
             }
           </div>
         } @else if (error()) {
          <div class="card err-card page-child">
            <span class="err-ic">
              <app-icon name="x-circle" sizeToken="lg" />
            </span>
            <span>Couldn't load services.</span>
            <button class="btn-ghost" (click)="load()">Retry</button>
          </div>
        } @else if (filtered().length === 0) {
          <div class="empty-state page-child">
            <span class="empty-ic">
              <app-icon name="search" sizeToken="xl" strokeWidth="1.5" />
            </span>
            <p>No services match “{{ query() }}”.</p>
            <button class="btn-ghost" (click)="query.set('')">
              Clear search
            </button>
          </div>
        } @else {
          <div class="svc-grid">
            @for (cat of displayed(); track cat.id; let i = $index) {
              <button
                class="svc-card"
                [class.skeleton]="!isLoaded(cat.id)"
                [style]="{
                  '--cat-color': cat.cardColor || 'var(--color-primary)',
                }"
                (click)="pick(cat)"
              >
                <span
                  class="svc-photo"
                  [style.background-image]="'url(' + thumbUrl(cat) + ')'"
                  [style.background-size]="cat.bgZoom && cat.bgZoom !== 100 ? (cat.bgZoom + '%') : 'cover'"
                  [style.background-position]="
                    (cat.bgPosX ?? 50) + '% ' + (cat.bgPosY ?? 50) + '%'
                  "
                ></span>
                <span class="svc-wash"></span>
                <span class="card-cover" [class.loaded]="isLoaded(cat.id)"></span>
                @if (!barsRemovedIds().has(cat.id)) {
                  <span class="bw-scan1" [style.animation-delay.ms]="(-700 + i * 350) % 1200 - 1200"></span>
                  <span class="bw-scan2" [style.animation-delay.ms]="(i * 350) % 1400 - 1400"></span>
                  <span class="bw-sweep1" [style.animation-delay.ms]="(-1300 + i * 350) % 1800 - 1800"></span>
                  <span class="bw-sweep2" [style.animation-delay.ms]="(-600 + i * 350) % 900 - 900"></span>
                }
                <span class="svc-body">
                  <span class="svc-ic"
                    ><app-icon
                      [name]="cat.icon || 'home'"
                      sizeToken="md"
                      stroke="#fff"
                      strokeWidth="1.5"
                  /></span>
                  <strong>{{ cat.name }}</strong>
                  @if (cat.defaultPriceSuggestion) {
                    <span class="svc-price"
                      >from RM {{ cat.defaultPriceSuggestion }}</span
                    >
                  }
                  <span class="svc-cta">Request a quote →</span>
                </span>
              </button>
            }
          </div>
        }
      </section>

      <section class="testimonials">
        <h2 class="page-child">Trusted by homeowners</h2>
        <div class="marquee">
          <div class="marquee-track">
            @for (t of testimonials; track t.text; let i = $index) {
              <div class="t-card page-child">
                <div class="t-stars">{{ t.stars }}</div>
                <p class="t-text">"{{ t.text }}"</p>
                <div class="t-author">
                  <strong>{{ t.name }}</strong>
                  <span class="muted">{{ t.location }}</span>
                </div>
              </div>
            }
            @for (t of testimonials; track t.text + "-dup") {
              <div class="t-card page-child" aria-hidden="true">
                <div class="t-stars">{{ t.stars }}</div>
                <p class="t-text">"{{ t.text }}"</p>
                <div class="t-author">
                  <strong>{{ t.name }}</strong>
                  <span class="muted">{{ t.location }}</span>
                </div>
              </div>
            }
          </div>
        </div>
      </section>

      <section class="how">
        <div class="how-inner">
          <h2 class="page-child">How it works</h2>
          <div class="steps">
            <div class="step page-child">
              <span class="num" aria-hidden="true">1</span>
              <strong>Request a quote</strong>
              <p class="muted">
                Pick a category, answer a few questions, set your budget and
                time.
              </p>
            </div>
            <div class="step page-child">
              <span class="num" aria-hidden="true">2</span>
              <strong>Get proposals</strong>
              <p class="muted">
                Nearby servicers send prices, ETAs and ratings before your
                deadline.
              </p>
            </div>
            <div class="step page-child">
              <span class="num" aria-hidden="true">3</span>
              <strong>Pick &amp; book</strong>
              <p class="muted">
                Compare proposals, choose one and confirm the booking.
              </p>
            </div>
            <div class="step page-child">
              <span class="num" aria-hidden="true">4</span>
              <strong>Track &amp; pay</strong>
              <p class="muted">
                Follow the job from arrival to done, then pay by card, credit or
                cash.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div class="fab-stack" [class.collapsed]="fabCollapsed()">
      <button
        class="fab-toggle"
        (click)="fabCollapsed.set(!fabCollapsed())"
        [attr.aria-label]="fabCollapsed() ? 'Expand' : 'Minimize'"
      ></button>
      <button
        class="chat-bubble"
        [class.has-unread]="widget.chatUnread() > 0"
        (click)="openChat()"
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
      <button class="request-bar" (click)="heroSearch()">
        <span class="rb-glow"></span>
        <span class="rb-plus">+</span>
        <span class="rb-text">
          <strong>Request a quote</strong>
          <span
            >Tell us what you need done and get prices from local pros.</span
          >
        </span>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        padding-bottom: 1.5rem;
      }
      .page {
        height: 100vh;
        overflow-y: auto;
        background: var(--color-bg);
        background: var(--gradient-hero);
      }

      /* ── Top nav ── */
      /* §5.3 / DISP-12: plain top-of-page bar - scrolls with content, not sticky.
         No appAutoHide collapse/idle animation. No overflow:hidden so the search
         dropdown can overlay (DISP-14). */
      .topnav {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.8rem 1.5rem;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        position: relative;
        z-index: 10;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        font-family: var(--font-display);
        font-weight: 400;
        font-size: 1.25rem;
        background: var(--color-primary);
        background: var(--gradient-primary);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        text-decoration: none;
        flex-shrink: 0;
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
      .search {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.3rem 0.8rem;
        min-width: 220px;
        flex: 0 1 320px;
        transition:
          border-color var(--transition),
          box-shadow var(--transition);
      }
      /* DISP-3/§7.4/§11: visible focus replacement (input itself has outline:none) */
      .search:focus-within {
        border-color: var(--color-primary);
        box-shadow: var(--focus-ring);
      }
      .search-ic {
        display: inline-flex;
        color: var(--color-muted);
        flex-shrink: 0;
      }
      .search input {
        border: none;
        background: transparent;
        outline: none;
        flex: 1;
        font-size: 0.9rem;
        padding: 0;
        color: var(--color-text);
      }
      .spacer {
        flex: 1;
      }
      .nav-btn {
        font-size: 0.88rem;
        font-weight: 600;
        padding: 0.4rem 1rem;
        border-radius: 999px;
        text-decoration: none;
        transition: all 0.2s ease;
        white-space: nowrap;
      }
      .nav-btn--ghost {
        color: var(--color-text);
        background: transparent;
        border: 1.5px solid transparent;
      }
      .nav-btn--ghost:hover {
        background: var(--color-bg);
      }
      .nav-btn--outline {
        color: var(--color-primary);
        background: transparent;
        border: 1.5px solid var(--color-primary);
      }
      .nav-btn--outline:hover {
        background: var(--color-primary);
        color: #fff;
      }
      .nav-btn--solid {
        color: #fff;
        background: var(--color-primary);
        background: var(--gradient-primary);
        border: 1.5px solid var(--color-primary);
      }
      .nav-btn--solid:hover {
        background: var(--color-primary-dark);
        background: var(--gradient-primary-hover);
        border-color: var(--color-primary-dark);
        box-shadow: var(--shadow-primary);
      }

      /* ── Hero ── */
      /* No overflow/mask on the section itself - those clip the hero search
         dropdown at the hero's bottom edge. They live on .hero-bg (photo+wash
         only) so the dropdown can overflow the hero and overlay the section below.
         z-index lifts the entire hero above later siblings (cats, testimonials,
         how) so the search dropdown isn't buried by service cards. */
      .hero {
        position: relative;
        /* Lifts the whole hero (and its absolutely-positioned search dropdown)
           above the later .cats service cards, which otherwise paint over the
           dropdown's overflow. Must clear the cards' stacking. */
        z-index: 1000;
        width: 100%;
        padding: 2rem 1.5rem 0.6rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .hero-bg {
        position: absolute;
        inset: 0;
        z-index: 0;
        overflow: hidden;
        mask-image: linear-gradient(
          90deg,
          transparent 2%,
          #000 6%,
          #000 94%,
          transparent 98%
        );
        -webkit-mask-image: linear-gradient(
          90deg,
          transparent 2%,
          #000 6%,
          #000 94%,
          transparent 98%
        );
      }
      .hero-photo {
        position: absolute;
        inset: 0;
        background-color: var(--color-bg);
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
      }
      /* Dynamic washout - driven by the theme bg token: cream in day, deep stone at
         night. Single rule, flips automatically with [data-theme]. */
      .hero-wash {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          color-mix(in srgb, var(--color-bg) 92%, transparent) 0%,
          color-mix(in srgb, var(--color-bg) 60%, transparent) 45%,
          transparent 72%
        );
      }
      .hero-cover {
        position: absolute;
        inset: 0;
        z-index: 3;
        background: var(--color-bg);
        transition: opacity 0.5s ease;
        opacity: 1;
      }
      .hero-cover.loaded { opacity: 0; pointer-events: none; }
      .hero-inner {
        position: relative;
        flex: 1;
        min-width: 0;
        max-width: var(--content-max);
        margin: 0 auto;
        padding: 0 1.5rem;
      }
      .hero h1 {
        font-family: var(--font-display);
        font-size: 2.8rem;
        font-weight: 400;
        line-height: 1.15;
        margin: 0 0 0.8rem;
        color: var(--color-text);
      }
      .hero-sub {
        color: var(--color-muted);
        font-size: 1.05rem;
        margin: 0 0 1.5rem;
        max-width: 420px;
      }
      .hero-search {
        display: flex;
        gap: 0.5rem;
        max-width: 480px;
      }
      .hero-search input {
        flex: 1;
        padding: 0.7rem 1rem;
        min-height: 44px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-input);
        font-size: 1rem;
        background: var(--color-surface);
      }
      .hero-cta {
        white-space: nowrap;
        border-radius: var(--radius);
        padding: 0.7rem 1.2rem;
        font-size: 1rem;
        font-weight: 600;
      }
      .hero-search-wrap {
        position: relative;
        max-width: 480px;
      }
      .hero-hint {
        margin-top: 1rem;
        font-size: 0.88rem;
        color: var(--color-text);
      }
      .hero-hint a {
        color: var(--color-primary);
        font-weight: 600;
        text-decoration: underline;
        text-underline-offset: 2px;
        text-decoration-color: color-mix(
          in srgb,
          var(--color-primary) 45%,
          transparent
        );
        display: inline-block;
        padding: 0.5rem 0.2rem;
        margin: -0.5rem -0.2rem;
      }
      .hero-hint a:hover {
        color: var(--color-primary);
        text-decoration-color: var(--color-primary);
      }
      .dot-sep {
        margin: 0 0.4rem;
        color: var(--color-muted);
      }
      .search-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        z-index: 200;
        margin-top: 0.25rem;
        max-height: 280px;
        overflow-y: auto;
      }
      .sd-item {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        padding: 0.65rem 0.9rem;
        background: none;
        border: none;
        cursor: pointer;
        font-size: 0.9rem;
        color: var(--color-text);
        text-align: left;
      }
      .sd-item:hover {
        background: var(--color-bg);
      }
      .sd-ic {
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
        color: var(--color-primary);
      }
      .sd-price {
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--color-muted);
      }
      .sd-empty {
        padding: 1rem;
        text-align: center;
        color: var(--color-muted);
        font-size: 0.88rem;
      }
      /* ── Categories ── */
      /* §12.1 alignment contract - same gutter as .testimonials / .how-inner so
         "Browse services" left-aligns with the other section titles (DISP-2). */
      .cats {
        max-width: var(--content-max);
        margin: 0 auto;
        padding: 0.5rem 1.5rem 0;
      }
      .cats h2 {
        margin-bottom: 1rem;
        margin-top: 1.5rem;
      }
      /* Skeleton grid mirrors the canonical .svc-grid so loading cards align with
         the real cards (DISP-4). */
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        grid-auto-rows: 1fr;
        gap: var(--space-base);
      }
      @media (max-width: 560px) {
        .hero h1 {
          font-size: 1.7rem;
        }
      }
      .err-card {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: var(--color-danger);
      }
      .err-ic {
        display: inline-flex;
        flex-shrink: 0;
      }

      /* ── Empty state ── */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.75rem;
        padding: 3rem 1.5rem;
        text-align: center;
      }
      .empty-ic {
        color: var(--color-muted);
      }
      .empty-state p {
        margin: 0;
        color: var(--color-muted);
      }

      /* ── Skeleton ── sized like .svc-card so the placeholder occupies the
         exact same grid track (no jump when the real card reveals). */
      @keyframes skeleton-spawn {
        from { opacity: 1; }
        to   { opacity: 0; pointer-events: none; }
      }
      .skeleton { min-height: 100px; border-color: var(--color-border); }
      .skeleton::after,
      .svc-card.skeleton::after {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 10;
        background: var(--color-bg);
        animation: skeleton-spawn 0.15s ease both;
      }
      /* Stagger skeleton spawn 0.35s per card */
      .grid > :nth-child(1)::after,
      .svc-grid > :nth-child(1)::after { animation-delay: 0s; }
      .grid > :nth-child(2)::after,
      .svc-grid > :nth-child(2)::after { animation-delay: 0.05s; }
      .grid > :nth-child(3)::after,
      .svc-grid > :nth-child(3)::after { animation-delay: 0.1s; }
      .grid > :nth-child(4)::after,
      .svc-grid > :nth-child(4)::after { animation-delay: 0.15s; }
      .grid > :nth-child(5)::after,
      .svc-grid > :nth-child(5)::after { animation-delay: 0.2s; }
      .grid > :nth-child(6)::after,
      .svc-grid > :nth-child(6)::after { animation-delay: 0.25s; }
      .skeleton:hover { transform: none; box-shadow: var(--shadow); }
      @keyframes card-reveal {
        from { opacity: 0; transform: translateY(10px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .svc-reveal { animation: card-reveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
      .svc-card.skeleton {
        cursor: default;
      }
      .svc-card.skeleton:hover {
        transform: none;
        box-shadow: var(--shadow);
      }
      .card-cover {
        position: absolute;
        inset: 0;
        z-index: 4;
        background: var(--color-surface);
        transition: opacity 0.55s ease;
      }
      .card-cover.loaded { opacity: 0; pointer-events: none; }

      @media (prefers-reduced-motion: reduce) {
        .svc-reveal { animation: none; }
        .skeleton::after,
        .svc-card.skeleton::after { animation: none; opacity: 0; }
      }

      /* ── Testimonials ── */
      .testimonials {
        max-width: var(--content-max);
        margin: 0 auto;
        padding: 2.5rem 1.5rem;
        overflow: hidden;
      }
      .testimonials h2 {
        margin-bottom: 1.5rem;
      }
      .marquee {
        overflow: hidden;
        mask-image: linear-gradient(
          90deg,
          transparent,
          var(--color-bg) 4%,
          var(--color-bg) 96%,
          transparent
        );
        -webkit-mask-image: linear-gradient(
          90deg,
          transparent,
          #000 4%,
          #000 96%,
          transparent
        );
      }
      .marquee-track {
        display: flex;
        gap: 1.25rem;
        width: max-content;
        animation: marquee-scroll 40s linear infinite;
      }
      .marquee:hover .marquee-track {
        animation-play-state: paused;
      }
      @keyframes marquee-scroll {
        from {
          transform: translateX(0);
        }
        to {
          transform: translateX(-50%);
        }
      }
      .t-card {
        width: 280px;
        flex-shrink: 0;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        box-shadow: var(--shadow);
      }
      .t-stars {
        font-size: 1rem;
        letter-spacing: 0.1em;
        color: #eab308;
      }
      .t-text {
        font-size: 0.88rem;
        line-height: 1.55;
        color: var(--color-text);
        margin: 0;
        flex: 1;
      }
      .t-author {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        font-size: 0.82rem;
        border-top: 1px solid var(--color-border);
        padding-top: 0.5rem;
      }
      .t-author strong {
        font-size: 0.88rem;
      }

      /* ── How it works ── */
      .how {
        background: var(--color-surface);
        border-top: 1px solid var(--color-border);
        border-bottom: 1px solid var(--color-border);
      }
      .how-inner {
        max-width: var(--content-max);
        margin: 0 auto;
        padding: 2.5rem 1.5rem;
      }
      .how-inner h2 {
        margin-bottom: 1.5rem;
      }
      .steps {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 2rem;
      }
      .step {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
      }
      .num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.2rem;
        height: 2.2rem;
        border-radius: 999px;
        background: var(--color-primary);
        background: var(--gradient-primary);
        color: #fff;
        font-family: var(--font-display);
        font-size: 1rem;
        font-weight: 400;
        margin-bottom: 0.3rem;
        box-shadow: 0 2px 8px rgba(201, 90, 60, 0.22);
      }

      /* ── Footer ── */
      .foot {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        padding: 1.5rem;
        max-width: var(--content-max);
        margin: 0 auto;
      }
      .navlink {
        color: var(--color-text);
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 500;
        transition: color var(--transition);
      }
      .navlink:hover {
        color: var(--color-primary);
      }

      /* ── Mobile ── */
      @media (max-width: 760px) {
        .hero {
          /* DISP-7: more top breathing room below the topnav on phones */
          padding: 2.25rem 1.5rem 0.4rem;
          min-height: auto;
        }
        .hero h1 {
          font-size: 2rem;
        }
        .steps {
          grid-template-columns: 1fr;
          gap: 1.5rem;
        }
        .topnav {
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .topnav .search {
          order: 3;
          width: 100%;
          min-width: 0;
          flex: 1 0 100%;
        }
      }
      /* ── Fixed FAB stack */
      .fab-stack {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.75rem;
        z-index: 999;
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
      .chat-bubble {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 3.5rem;
        height: 3.5rem;
        border-radius: 999px;
        background: var(--color-surface);
        border: 1.5px solid var(--color-border);
        color: var(--color-primary);
        cursor: pointer;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
        transition:
          transform var(--transition),
          box-shadow var(--transition),
          background var(--transition),
          width 0.25s ease,
          height 0.25s ease;
        overflow: visible;
      }
      .chat-bubble:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
        background: var(--color-bg);
      }
      .fab-stack.collapsed .chat-bubble {
        width: 2.75rem;
        height: 2.75rem;
      }

      /* Rotating edge glow */
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
        pointer-events: none;
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
        font-size: 0.65rem;
        font-weight: 700;
        line-height: 20px;
        text-align: center;
        pointer-events: none;
      }
      .has-unread {
        --chat-glow-opacity: 0.8;
      }

      /* Fixed bottom-right request bar */
      .request-bar {
        position: relative;
        display: flex;
        align-items: center;
        gap: 1rem;
        width: auto;
        max-width: 340px;
        max-height: 5rem;
        padding: 1rem 1.6rem;
        overflow: visible;
        background: var(--color-primary);
        background: var(--gradient-primary);
        border: none;
        border-radius: var(--radius);
        color: #fff;
        cursor: pointer;
        text-align: left;
        box-shadow:
          0 4px 24px rgba(201, 90, 60, 0.45),
          0 0 40px rgba(201, 90, 60, 0.15);
        transition:
          transform var(--transition),
          box-shadow var(--transition),
          padding 0.25s ease,
          gap 0.25s ease,
          max-width 0.3s ease,
          max-height 0.3s ease,
          border-radius 0.25s ease;
      }
      .request-bar:hover {
        transform: translateY(-2px);
        background: var(--color-primary-dark);
        background: var(--gradient-primary-hover);
        box-shadow: 0 8px 32px rgba(201, 90, 60, 0.55);
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

      @property --rb-angle {
        syntax: "<angle>";
        inherits: false;
        initial-value: 0deg;
      }
      .rb-glow {
        position: absolute;
        inset: -1px;
        border-radius: var(--radius);
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
      .fab-stack.collapsed .request-bar {
        max-width: 3rem;
        max-height: 3rem;
        padding: 0.65rem;
        gap: 0;
        justify-content: center;
        border-radius: 999px;
      }
      .fab-stack.collapsed .rb-glow {
        border-radius: 999px;
      }
      .rb-plus {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.8rem;
        height: 2.8rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.2);
        font-size: 2rem;
        font-weight: 300;
        line-height: 1;
        transition:
          width 0.25s ease,
          height 0.25s ease,
          font-size 0.25s ease,
          background 0.25s ease;
      }
      .fab-stack.collapsed .rb-plus {
        width: 2.2rem;
        height: 2.2rem;
        font-size: 1.5rem;
        background: rgba(255, 255, 255, 0.12);
      }
      .rb-text {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        overflow: hidden;
        max-width: 260px;
        opacity: 1;
        transition:
          max-width 0.3s ease,
          opacity 0.2s ease;
      }
      .fab-stack.collapsed .rb-text {
        max-width: 0;
        opacity: 0;
      }
      .rb-text strong {
        font-size: 1.1rem;
      }
      .rb-text span {
        font-size: 0.82rem;
        opacity: 0.9;
      }
      /* §16.3 canonical service card - ONE spec shared with browse + drill-down.
         Grid sits inside .cats (which provides the §12.1 max-width + gutter), so it
         only defines columns/gap. auto-fit → ~3 cols desktop, 2 tablet, 1 phone. */
      .svc-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        grid-auto-rows: 1fr;
        gap: var(--space-base);
      }
      .svc-card {
        position: relative;
        display: flex;
        align-items: stretch;
        overflow: hidden;
        min-height: 100px;
        text-align: left;
        cursor: pointer;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        transition:
          box-shadow var(--transition),
          transform var(--transition),
          border-color var(--transition);
      }
      .svc-card:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
        border-color: var(--color-primary-light);
      }
      /* 1 - photo fills the card */
      .svc-photo {
        position: absolute;
        inset: 0;
        z-index: 1;
        background-color: var(--color-bg);
        background-size: cover;
        background-position: center top;
        background-repeat: no-repeat;
      }
      /* 2 - colour wash: solid category colour left → transparent right (the dissolve) */
      .svc-wash {
        position: absolute;
        inset: 0;
        z-index: 2;
        background: linear-gradient(
          90deg,
          var(--cat-color) 0%,
          var(--cat-color) 30%,
          color-mix(in srgb, var(--cat-color) 55%, transparent) 50%,
          transparent 74%
        );
      }
      /* 3 - body: white icon, name, price, CTA */
      .svc-body {
        position: relative;
        z-index: 3;
        flex: 1;
        min-width: 0;
        max-width: 60%;
        padding: 0.7rem 1rem;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 0.15rem;
        color: #fff;
      }
      .svc-ic {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        color: rgba(255, 255, 255, 0.92);
        margin-bottom: 0.15rem;
        flex-shrink: 0;
      }
      .svc-ic app-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
      }
      .svc-body strong {
        font-family: var(--font-display);
        font-size: 1.05rem;
        line-height: 1.1;
        color: #fff;
      }
      .svc-price {
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.88);
      }
      .svc-cta {
        margin-top: 0.1rem;
        font-size: 0.7rem;
        font-weight: 600;
        color: #fff;
      }
      /* DISP-15: the bar is fixed white in BOTH themes, so its text must be a fixed
         dark - using var(--color-text) makes it cream-on-white (invisible) at night.
         Intentional raw hex (theme-independent surface). */
      .hero-search-white input {
        background: #fff;
        color: #2c2420;
      }
      .hero-search-white input::placeholder {
        color: #6b6258;
        opacity: 1;
      }
      @media (max-width: 560px) {
        .hero-search {
          flex-direction: column;
        }
        .hero-cta {
          width: 100%;
          text-align: center;
        }
        .request-bar {
          max-width: calc(100vw - 5rem);
          padding: 0.75rem 1rem;
        }
        .rb-text > span {
          display: none;
        }
        /* DISP-9: banner fills edge-to-edge on phone - drop the horizontal fade (keep .hero-wash) */
        .hero-bg {
          mask-image: none;
          -webkit-mask-image: none;
        }
        /* Phone: zoom the banner so its HEIGHT fills the hero (top/bottom edges flush);
           width scales proportionally and crops at the sides. Overrides the admin
           heroZoom() inline background-size, so !important is required. */
        .hero-photo {
          background-size: auto 100% !important;
          background-position: center !important;
        }
        /* DISP-6: whole card is tappable - the CTA text only crowds the narrow card */
        .svc-cta {
          display: none;
        }
        /* DISP-10: strip the topnav to brand text · theme dot · Log in */
        .logo-icon {
          display: none;
        }
        .tt-label {
          display: none;
        }
        .nav-btn--solid {
          display: none;
        }
        .topnav .search {
          display: none;
        }
      }
    `,
  ],
})
export class HomeComponent implements OnInit, OnDestroy {
  routeFor = routeFor;
  isDevMode = isDevMode;
  placeholderUrl = placeholderUrl;
  config = inject(ConfigService);
  private api = inject(ApiService);
  private router = inject(Router);
  auth = inject(AuthService);
  themeSvc = inject(ThemeService);
  widget = inject(ChatWidgetService);

  categories = signal<Category[]>([]);
  allCategories = signal<Category[]>([]);
  /** Category ids whose thumbnail has finished preloading (card reveals then). */
  loadedIds = signal<Set<string>>(new Set());
  barsRemovedIds = signal<Set<string>>(new Set());
  loading = signal(true);

  private queuedIds = new Set<string>();
  private preloadQueue: Category[] = [];
  private preloading = false;
  private destroyed = false;

  constructor() {
    effect(() => {
      this.queuePreload(this.displayed());
    });
    effect(() => {
      const url = this.heroBannerUrl() || '/assets/Images/Banner_Placeholder.png';
      this.heroImageLoading.set(true);
      const img = new Image();
      const t0 = performance.now();
      img.src = url;
      img.decode().then(() => {
      const wait = Math.max(0, 50 - (performance.now() - t0));
        setTimeout(() => this.heroImageLoading.set(false), wait);
      }).catch(() => this.heroImageLoading.set(false));
    });
  }

  isLoaded(id: string): boolean {
    return this.loadedIds().has(id);
  }

  thumbUrl(cat: Category): string {
    return cat.bannerUrl || cat.imageUrl || placeholderUrl(cat.slug);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  /** Queue thumbnails for sequential preload; each card reveals as its own
   *  image finishes, with a short gap so reveals cascade instead of popping. */
  private queuePreload(cats: Category[]): void {
    for (const c of cats) {
      if (!this.queuedIds.has(c.id)) {
        this.queuedIds.add(c.id);
        this.preloadQueue.push(c);
      }
    }
    if (!this.preloading) this.drainPreload();
  }

  private drainPreload(): void {
    const cat = this.preloadQueue.shift();
    if (!cat || this.destroyed) {
      this.preloading = false;
      return;
    }
    this.preloading = true;
    const t0 = performance.now();
    const img = new Image();
    img.src = this.thumbUrl(cat);
    img.decode().then(() => {
      if (this.destroyed) return;
      const wait = Math.max(0, 50 - (performance.now() - t0));
      setTimeout(() => {
        if (this.destroyed) return;
        this.loadedIds.update((s) => {
          const n = new Set(s);
          n.add(cat.id);
          return n;
        });
        setTimeout(() => {
          this.barsRemovedIds.update((s) => {
            const n = new Set(s);
            n.add(cat.id);
            return n;
          });
        }, 200);
        setTimeout(() => this.drainPreload(), 100);
      }, wait);
    }).catch(() => {
      if (this.destroyed) return;
      this.loadedIds.update((s) => {
        const n = new Set(s);
        n.add(cat.id);
        return n;
      });
      setTimeout(() => this.drainPreload(), 100);
    });
  }
  error = signal(false);
  query = signal("");
  searchDropdownOpen = signal(false);
  fabCollapsed = signal(false);
  heroBannerUrl = signal("");
  heroImageLoading = signal(true);
  logoLoaded = signal(false);
  heroPosX = signal("50");
  heroPosY = signal("30");
  heroZoom = signal("100");

  testimonials = [
    {
      name: "Sarah Lim",
      location: "Kuala Lumpur",
      text: "Found a reliable plumber within hours. The booking and payment were seamless from start to finish.",
      stars: "★★★★★",
    },
    {
      name: "Ahmad Razak",
      location: "Petaling Jaya",
      text: "Saved so much time comparing quotes. The aircon servicing was done the next day at a fair price.",
      stars: "★★★★★",
    },
    {
      name: "Mei Ling Tan",
      location: "Cheras",
      text: "The escrow payment gave me peace of mind. I only released payment after the cleaning was done perfectly.",
      stars: "★★★★★",
    },
    {
      name: "Ravi Krishnan",
      location: "Subang Jaya",
      text: "As a busy professional, this app is a lifesaver. Booked a plumber in minutes and the quality was excellent.",
      stars: "★★★★★",
    },
    {
      name: "Diana Wong",
      location: "Penang",
      text: "The quotes were competitive and the whole process was transparent. Highly recommend for home services.",
      stars: "★★★★☆",
    },
    {
      name: "Kevin Teoh",
      location: "Johor Bahru",
      text: "From quote to completion, everything was tracked in the app. No more chasing contractors over the phone.",
      stars: "★★★★★",
    },
  ];

  // When searching, match across ALL categories (children included) so a service
  // like "aircond repair" surfaces even though only the 7 parents show by default.
  // Items with a defaultPriceSuggestion sort first so priced services surface at the top.
  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = q ? this.allCategories().filter((c) => c.name.toLowerCase().includes(q)) : this.categories();
    const priced = all.filter((c) => c.defaultPriceSuggestion != null);
    const unpriced = all.filter((c) => c.defaultPriceSuggestion == null);
    return [...priced, ...unpriced];
  });

  displayed = computed((): Category[] => {
    // Active search → show the matching child services directly.
    if (this.query().trim()) return this.filtered().slice(0, 12);
    // Default → the parent groupings, priority-pinned, capped at 6.
    const priority = [
      "aircond",
      "electrical",
      "cleaning",
      "catering",
      "plumbing",
      "tutoring",
    ];
    const all = this.filtered();
    const pinned: Category[] = [];
    for (const s of priority) {
      const found = all.find((c) => c.slug === s);
      if (found) pinned.push(found);
    }
    const rest = all.filter((c) => !priority.includes(c.slug));
    return [...pinned, ...rest].slice(0, 6);
  });

  ngOnInit(): void {
    const principal = this.auth.principal();
    if (principal) {
      const roleRoute = principal.role === 'admin' ? routeFor('admin') : principal.role === 'servicer' ? routeFor('servicer') : routeFor('customer');
      this.router.navigate([roleRoute]);
      return;
    }
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api
      .get<{
        heroBannerUrl: string;
        heroBannerPosX: string;
        heroBannerPosY: string;
        heroBannerZoom: string;
      }>("/config/public")
      .subscribe({
        next: (r) => {
          if (r.heroBannerUrl) this.heroBannerUrl.set(r.heroBannerUrl);
          if (r.heroBannerPosX) this.heroPosX.set(r.heroBannerPosX);
          if (r.heroBannerPosY) this.heroPosY.set(r.heroBannerPosY);
          if (r.heroBannerZoom) this.heroZoom.set(r.heroBannerZoom);
        },
      });
    this.api
      .get<{ data: Category[] }>("/categories", { scope: "all" })
      .subscribe({
        next: (res) => {
          const all = res.data ?? [];
          this.allCategories.set(all);
          this.categories.set(all.filter((c) => !c.parentCategoryId));
          this.loading.set(false);
        },
        error: () => {
          this.error.set(true);
          this.loading.set(false);
        },
      });
  }

  portalPath(): string {
    const role = this.auth.principal()?.role ?? "customer";
    return role === 'admin' ? routeFor('admin') : role === 'servicer' ? routeFor('servicer') : routeFor('customer');
  }

  private goToQuote(categoryId?: string): void {
    if (this.auth.isLoggedIn()) {
      const params: Record<string, string> = {};
      if (categoryId) params["category"] = categoryId;
      this.router.navigate([routeFor('customer.quote')], { queryParams: params });
    } else {
      this.auth.enterGuestMode(categoryId);
      this.router.navigate([routeFor('login')], { queryParams: { intent: "quote" } });
    }
  }

  pick(cat: Category): void {
    if (cat.defaultPriceSuggestion == null) {
      void this.router.navigate([routeFor('public.services', { parentSlug: cat.slug })]);
    } else {
      this.goToQuote(cat.id);
    }
  }

  closeSearchDropdown(): void {
    setTimeout(() => this.searchDropdownOpen.set(false), 200);
  }

  heroSearch(): void {
    this.searchDropdownOpen.set(false);
    const q = this.query().trim();
    if (!q) {
      this.goToQuote();
      return;
    }
    const matches = this.filtered();
    if (matches.length === 1) {
      this.pick(matches[0]);
    } else {
      this.goToQuote();
    }
  }

  openChat(): void {
    this.widget.open();
  }
}
