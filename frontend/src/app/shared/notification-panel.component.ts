import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, NavigationStart } from '@angular/router';
import { filter } from 'rxjs';
import { NotificationService, Notif } from '../core/services/notification.service';
import { NotificationPanelService } from '../core/services/notification-panel.service';
import { AuthService } from '../core/services/auth.service';
import { IconComponent } from './icon.component';

const TYPE_LABELS: Record<string, string> = {
  orders: 'Order update',
  jobs: 'Job',
  listings: 'Listing',
  promos: 'Promotion',
  queues: 'Needs review',
};

/** Maps notification types to Lucide icon names for <app-icon>. */
const TYPE_ICON_NAMES: Record<string, string> = {
  orders: 'package',
  jobs: 'toolbox',
  listings: 'clipboard-list',
  promos: 'gift',
  queues: 'alert-triangle',
};

/** Content-type filter categories */
type ContentFilter = 'all' | 'orders' | 'jobs' | 'promos' | 'system';

/** Resolve a raw notification type string to a ContentFilter bucket. */
function toContentFilter(type: string): ContentFilter {
  const t = type.toLowerCase();
  if (/booking|quote|proposal/.test(t)) return 'orders';
  if (/job|dispatch/.test(t)) return 'jobs';
  if (/promo|reward|voucher/.test(t)) return 'promos';
  return 'system';
}

/**
 * Facebook-style notification dropdown. Rendered once at app root; opens as a
 * fixed panel anchored to the top-right (fixed positioning is deliberate - the
 * topbar has `overflow: hidden` for its auto-hide animation, which would clip
 * an absolutely-positioned dropdown). Reads the existing NotificationService
 * for data; toggled by the topbar bell via NotificationPanelService.
 *
 * Quick-glance surface: most recent items, click to mark-read + navigate,
 * "See all" drops to the full notifications page. The full page is unchanged.
 *
 * B1 - Content-type filter chips: All | Orders | Jobs | Promos | System
 *       plus an "Unread only" secondary toggle.
 * B2 - Per-item × dismiss button (optimistic local removal).
 * B3 - Collapsible "Past activity" section showing last-10 read items by day.
 */
@Component({
    selector: 'app-notification-panel',
    imports: [IconComponent],
    template: `
    @if (panel.isOpen()) {
      <!-- Transparent backdrop captures outside clicks to close. -->
      <div class="np-backdrop" (click)="panel.close()"></div>

      <div class="np-panel" role="dialog" aria-label="Notifications">
        <div class="np-head">
          <h2>Notifications</h2>
          @if (notifications.unread() > 0) {
            <button class="np-mark" (click)="markAll($event)">Mark all as read</button>
          }
        </div>

        <!-- B1: Content-type filter chips + Unread toggle -->
        <div class="np-filters">
          <div class="np-chips">
            @for (chip of chips; track chip.value) {
              <button
                class="np-chip"
                [class.on]="contentFilter() === chip.value"
                (click)="contentFilter.set(chip.value)"
              >{{ chip.label }}</button>
            }
          </div>
          <button
            class="np-unread-toggle"
            [class.on]="unreadOnly()"
            (click)="unreadOnly.set(!unreadOnly())"
            title="Show unread only"
          >Unread</button>
        </div>

        <div class="np-list">
          @for (n of liveItems(); track n.id) {
            <button class="np-item" [class.unread]="!n.isRead" (click)="open(n)">
              <span class="np-ic" [attr.data-type]="iconType(n.type)">
                <app-icon [name]="iconName(n.type)" sizeToken="md" strokeWidth="1.5" />
              </span>
              <span class="np-body">
                <span class="np-type">{{ label(n.type) }}</span>
                <span class="np-msg">{{ n.message }}</span>
                <span class="np-time" [class.accent]="!n.isRead">{{ ago(n.createdAt) }}</span>
              </span>
              @if (!n.isRead) {
                <span class="np-dot" aria-label="Unread"></span>
              }
              <!-- B2: per-item dismiss -->
              <button
                class="np-dismiss"
                aria-label="Dismiss notification"
                (click)="dismissItem($event, n.id)"
                title="Dismiss"
              >×</button>
            </button>
          } @empty {
            <div class="np-empty">
              <app-icon name="bell" sizeToken="xl" class="np-empty-ic" strokeWidth="1.5" />
              <p>{{ unreadOnly() || contentFilter() !== 'all' ? 'No matching notifications.' : 'You&apos;re all caught up.' }}</p>
            </div>
          }
        </div>

        <!-- B3: Past activity section -->
        @if (pastGroups().length > 0) {
          <div class="np-past">
            <button class="np-past-toggle" (click)="pastExpanded.set(!pastExpanded())" [attr.aria-expanded]="pastExpanded()">
              <span>Past activity</span>
              <app-icon [name]="pastExpanded() ? 'chevron-up' : 'chevron-down'" sizeToken="sm" />
            </button>
            @if (pastExpanded()) {
              <div class="np-past-list">
                @for (group of pastGroups(); track group.label) {
                  <div class="np-past-day">{{ group.label }}</div>
                  @for (n of group.items; track n.id) {
                    <button class="np-item np-item--past" (click)="open(n)">
                      <span class="np-ic" [attr.data-type]="iconType(n.type)">
                        <app-icon [name]="iconName(n.type)" sizeToken="md" strokeWidth="1.5" />
                      </span>
                      <span class="np-body">
                        <span class="np-type">{{ label(n.type) }}</span>
                        <span class="np-msg">{{ n.message }}</span>
                        <span class="np-time">{{ ago(n.createdAt) }}</span>
                      </span>
                      <button
                        class="np-dismiss"
                        aria-label="Dismiss notification"
                        (click)="dismissItem($event, n.id)"
                        title="Dismiss"
                      >×</button>
                    </button>
                  }
                }
              </div>
            }
          </div>
        }

        <button class="np-all" (click)="viewAll()">See all notifications</button>
      </div>
    }
  `,
    styles: [
        `
      .np-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1400;
        background: transparent;
      }
      .np-panel {
        position: fixed;
        top: 4.5rem;
        right: 1.25rem;
        z-index: 1401;
        width: 380px;
        max-width: calc(100vw - 2rem);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 14px;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: np-pop 0.16s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
      @keyframes np-pop {
        from {
          opacity: 0;
          transform: translateY(-8px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .np-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.9rem 1rem 0.5rem;
      }
      .np-head h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 800;
        letter-spacing: -0.01em;
      }
      .np-mark {
        background: transparent;
        border: none;
        color: var(--color-primary);
        font-size: 0.8rem;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        padding: 0.2rem 0.3rem;
        border-radius: 6px;
        white-space: nowrap;
      }
      .np-mark:hover {
        background: var(--color-primary-light);
      }

      /* B1 - filter chips row */
      .np-filters {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0 0.75rem 0.55rem;
        flex-wrap: nowrap;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .np-filters::-webkit-scrollbar { display: none; }
      .np-chips {
        display: flex;
        gap: 0.3rem;
        flex-shrink: 0;
      }
      .np-chip {
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        color: var(--color-muted);
        font-family: inherit;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.2rem 0.65rem;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }
      .np-chip:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
      .np-chip.on {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #fff;
      }
      .np-unread-toggle {
        margin-left: auto;
        flex-shrink: 0;
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        color: var(--color-muted);
        font-family: inherit;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.2rem 0.65rem;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      }
      .np-unread-toggle:hover {
        border-color: var(--color-primary);
        color: var(--color-primary);
      }
      .np-unread-toggle.on {
        background: var(--color-primary-light);
        border-color: var(--color-primary);
        color: var(--color-primary);
      }

      .np-list {
        display: flex;
        flex-direction: column;
        padding: 0.25rem 0.4rem;
        max-height: min(60vh, 22rem);
        overflow-y: auto;
        scrollbar-width: thin;
      }

      /* B2 - item with dismiss button */
      .np-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        width: 100%;
        text-align: left;
        background: transparent;
        border: none;
        font-family: inherit;
        padding: 0.6rem 0.6rem;
        border-radius: 10px;
        cursor: pointer;
        transition: background 0.12s ease;
      }
      .np-item:hover {
        background: var(--color-bg);
      }
      .np-item.unread {
        background: color-mix(in srgb, var(--color-primary) 7%, transparent);
      }
      .np-item.unread:hover {
        background: color-mix(in srgb, var(--color-primary) 12%, transparent);
      }
      /* Show dismiss on hover; always visible on touch */
      .np-dismiss {
        position: absolute;
        right: 0.4rem;
        top: 50%;
        transform: translateY(-50%);
        width: 1.125rem;
        height: 1.125rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 999px;
        background: transparent;
        color: var(--color-muted);
        font-size: 0.85rem;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        opacity: 0;
        transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
        font-family: inherit;
        flex-shrink: 0;
      }
      .np-item:hover .np-dismiss {
        opacity: 1;
      }
      .np-dismiss:hover {
        background: var(--color-danger-bg);
        color: var(--color-danger);
      }
      @media (pointer: coarse) {
        .np-dismiss { opacity: 1; }
      }

      .np-ic {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 2.5rem;
        height: 2.5rem;
        border-radius: 999px;
        background: var(--color-primary-light);
        font-size: 1.15rem;
      }
      .np-ic[data-type='queues'] {
        background: color-mix(in srgb, var(--color-warning) 22%, transparent);
      }
      .np-ic[data-type='promos'] {
        background: color-mix(in srgb, var(--color-promo) 22%, transparent);
      }
      .np-ic[data-type='orders'] {
        background: color-mix(in srgb, var(--color-success) 22%, transparent);
      }
      .np-body {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
        flex: 1;
        /* leave room for dismiss button */
        padding-right: 1.25rem;
      }
      .np-type {
        font-size: 0.68rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-muted);
      }
      .np-msg {
        font-size: 0.9rem;
        line-height: 1.35;
        color: var(--color-text);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .np-time {
        font-size: 0.78rem;
        color: var(--color-muted);
        margin-top: 0.05rem;
      }
      .np-time.accent {
        color: var(--color-primary);
        font-weight: 600;
      }
      .np-dot {
        flex-shrink: 0;
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 999px;
        background: var(--color-primary);
      }
      .np-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        padding: 2rem 1rem;
        text-align: center;
      }
      .np-empty-ic {
        opacity: 0.7;
      }
      .np-empty-ic ::ng-deep svg {
        width: 1.8rem;
        height: 1.8rem;
      }
      .np-empty p {
        margin: 0;
        color: var(--color-muted);
        font-size: 0.9rem;
      }

      /* B3 - Past activity */
      .np-past {
        border-top: 1px solid var(--color-border);
      }
      .np-past-toggle {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        padding: 0.55rem 1rem;
        background: transparent;
        border: none;
        font-family: inherit;
        font-size: 0.8rem;
        font-weight: 700;
        color: var(--color-muted);
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .np-past-toggle:hover {
        background: var(--color-bg);
        color: var(--color-text);
      }
      .np-past-list {
        padding: 0.1rem 0.4rem 0.4rem;
        max-height: min(40vh, 16rem);
        overflow-y: auto;
        scrollbar-width: thin;
      }
      .np-past-day {
        padding: 0.3rem 0.5rem 0.1rem;
        font-size: 0.72rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-muted);
      }
      .np-item--past {
        opacity: 0.8;
      }
      .np-item--past:hover {
        opacity: 1;
      }

      .np-all {
        flex-shrink: 0;
        border: none;
        border-top: 1px solid var(--color-border);
        background: var(--color-surface);
        color: var(--color-primary);
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 700;
        padding: 0.8rem;
        cursor: pointer;
        transition: background 0.12s ease;
      }
      .np-all:hover {
        background: var(--color-bg);
      }

      /* Mobile: near-full-width sheet pinned under the topbar. */
      @media (max-width: 600px) {
        .np-panel {
          top: auto;
          bottom: 0;
          left: 0;
          right: 0;
          width: auto;
          max-width: none;
          border-radius: 16px 16px 0 0;
          animation: np-sheet 0.2s ease both;
        }
        @keyframes np-sheet {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .np-list {
          max-height: 55vh;
        }
        .np-backdrop {
          background: rgba(0, 0, 0, 0.25);
        }
        /* Always-visible dismiss on mobile */
        .np-dismiss { opacity: 1; }
      }
    `,
    ]
})
export class NotificationPanelComponent {
  notifications = inject(NotificationService);
  panel = inject(NotificationPanelService);
  private auth = inject(AuthService);
  private router = inject(Router);

  // B1 - filter state
  contentFilter = signal<ContentFilter>('all');
  unreadOnly = signal(false);

  // B3 - past activity collapsed by default
  pastExpanded = signal(false);

  /** Locally dismissed IDs (optimistic removal without DELETE endpoint). */
  private dismissed = signal<Set<string>>(new Set());

  readonly chips: { label: string; value: ContentFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Orders', value: 'orders' },
    { label: 'Jobs', value: 'jobs' },
    { label: 'Promos', value: 'promos' },
    { label: 'System', value: 'system' },
  ];

  constructor() {
    // Close on any navigation (e.g. browser back) so the panel never lingers
    // over a page it wasn't opened on.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationStart))
      .subscribe(() => this.panel.close());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panel.isOpen()) this.panel.close();
  }

  /** All non-dismissed items. */
  private allVisible = computed<Notif[]>(() => {
    const dis = this.dismissed();
    return this.notifications.items().filter((n) => !dis.has(n.id));
  });

  /** Items shown in the live list (top section): unread + recently read, filtered. */
  liveItems = computed<Notif[]>(() => {
    let items = this.allVisible();
    const cf = this.contentFilter();
    if (cf !== 'all') {
      items = items.filter((n) => toContentFilter(n.type) === cf);
    }
    if (this.unreadOnly()) {
      items = items.filter((n) => !n.isRead);
    }
    // Live section: most recent 15 unread + recently read (not older than past 10)
    return items.slice(0, 15);
  });

  /**
   * B3 - "Past activity": last 10 read notifications that aren't in the live
   * slice, grouped by day. Hidden entirely when empty.
   */
  pastGroups = computed<{ label: string; items: Notif[] }[]>(() => {
    const dis = this.dismissed();
    const liveIds = new Set(this.liveItems().map((n) => n.id));
    const cf = this.contentFilter();
    const past = this.notifications.items()
      .filter((n) => !dis.has(n.id) && n.isRead && !liveIds.has(n.id) && (cf === 'all' || toContentFilter(n.type) === cf))
      .slice(0, 10);

    if (past.length === 0) return [];

    const groups: { label: string; items: Notif[] }[] = [];
    const today = new Date();
    const todayStr = today.toDateString();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();

    for (const n of past) {
      const d = new Date(n.createdAt);
      const ds = d.toDateString();
      let label: string;
      if (ds === todayStr) label = 'Today';
      else if (ds === yesterdayStr) label = 'Yesterday';
      else label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      const existing = groups.find((g) => g.label === label);
      if (existing) {
        existing.items.push(n);
      } else {
        groups.push({ label, items: [n] });
      }
    }
    return groups;
  });

  label(type: string): string {
    return TYPE_LABELS[type] ?? 'Notification';
  }

  iconName(type: string): string {
    return TYPE_ICON_NAMES[type] ?? 'bell';
  }

  /** Maps raw type to the icon-colouring bucket (for [data-type]). */
  iconType(type: string): string {
    const bucket = toContentFilter(type);
    // map content filter buckets back to the CSS data-type names used for icon colours
    if (bucket === 'orders') return 'orders';
    if (bucket === 'promos') return 'promos';
    if (bucket === 'system') return 'queues';
    return type;
  }

  /** Compact relative time (Facebook-style): "just now", "2m", "1h", "3d", "2w". */
  ago(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d`;
    const w = Math.floor(d / 7);
    if (w < 5) return `${w}w`;
    return new Date(iso).toLocaleDateString();
  }

  markAll(ev: Event): void {
    ev.stopPropagation();
    this.notifications.markAllRead();
  }

  /** B2 - optimistically remove a notification from the panel. */
  dismissItem(ev: Event, id: string): void {
    ev.stopPropagation();
    this.dismissed.update((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
  }

  open(n: Notif): void {
    if (!n.isRead) this.notifications.markRead(n.id);
    const route = this.notifications.routeFor(n);
    this.panel.close();
    if (route) this.router.navigateByUrl(route);
  }

  viewAll(): void {
    const role = this.auth.principal()?.role;
    this.panel.close();
    this.router.navigateByUrl(
      role === 'servicer' ? '/servicer/notifications' : '/customer/notifications',
    );
  }
}
