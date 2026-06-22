import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService, Notif } from '../core/services/notification.service';
import { ModalComponent } from './modal.component';
import { NotificationSettingsComponent } from './notification-settings.component';

const TYPE_LABELS: Record<string, string> = {
  orders: 'Order update',
  jobs: 'Job',
  listings: 'Listing',
  promos: 'Promotion',
  queues: 'Needs review',
};

/**
 * Notifications list - shared by the customer and servicer portals. Reads the
 * polled list from NotificationService, supports a type filter, mark-read, and
 * click-to-open (routes by the notification's link).
 */
@Component({
    selector: 'app-notifications',
    host: { class: 'page-narrow' },
    imports: [ModalComponent, NotificationSettingsComponent],
    template: `
    <div class="page-enter">
    <div class="head">
      <h1>Notifications</h1>
      <div class="head-acts">
        @if (notifications.unread() > 0) {
          <button class="btn-ghost" (click)="notifications.markAllRead()">
            Mark all read ({{ notifications.unread() }})
          </button>
        }
        <button class="btn-ghost" (click)="settingsOpen.set(true)">⚙️ Settings</button>
      </div>
    </div>

    <div class="filters">
      @for (f of filters; track f) {
        <button class="chip" [class.on]="filter() === f" (click)="filter.set(f)">
          {{ f === 'all' ? 'All' : labelFor(f) }}
        </button>
      }
    </div>

    @for (n of filtered(); track n.id) {
      <div
        class="card note"
        [class.unread]="!n.isRead"
        [class.clickable]="!!notifications.routeFor(n)"
        (click)="open(n)"
      >
        <div class="n-body">
          <span class="n-type">{{ labelFor(n.type) }}</span>
          <span class="n-msg">{{ n.message }}</span>
          <span class="muted small">{{ when(n.createdAt) }}</span>
        </div>
        @if (!n.isRead) {
          <span class="dot"></span>
        }
      </div>
    } @empty {
      <p class="muted">No notifications{{ filter() === 'all' ? '' : ' in this category' }}.</p>
    }

    </div>

    <app-modal
      [open]="settingsOpen()"
      title="Notification settings"
      (closed)="settingsOpen.set(false)"
    >
      <app-notification-settings />
    </app-modal>`,
    styles: [
        `
      :host {
        display: block;
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }
      .head h1 { margin: 0; }
      .head-acts {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }
      @media (max-width: 600px) {
        .head {
          gap: 0.4rem;
          flex-wrap: nowrap;
        }
        .head h1 {
          font-size: 1.1rem;
        }
        .head-acts {
          flex-shrink: 0;
        }
      }
      .filters {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
        margin: 0.8rem 0 1rem;
      }
      .chip {
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.3rem 0.8rem;
        cursor: pointer;
        transition: background var(--transition), color var(--transition), border-color var(--transition),
                    box-shadow var(--transition), transform 0.12s ease;
      }
      .chip:hover:not(.on) {
        background: var(--color-surface);
        border-color: var(--color-primary);
        color: var(--color-primary);
        transform: translateY(-1px);
      }
      .chip.on {
        background: var(--color-primary);
        color: #fff;
        border-color: var(--color-primary);
        box-shadow: 0 2px 8px rgba(201, 90, 60, 0.25);
      }
      .note {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        margin-bottom: 0.5rem;
        transition: box-shadow var(--transition), transform var(--transition);
      }
      .note.clickable {
        cursor: pointer;
      }
      .note.clickable:hover {
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
      }
      .n-body {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        flex: 1;
        min-width: 0;
      }
      .n-type {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-muted);
      }
      .n-msg {
        font-size: 0.92rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .small {
        font-size: 0.78rem;
      }
      /* Pulsing dot draws attention to unread items */
      .dot {
        flex-shrink: 0;
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 999px;
        background: var(--color-primary);
        animation: dot-pulse 2s ease-in-out infinite;
      }
      @keyframes dot-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: 0.5; transform: scale(0.75); }
      }
      /* Mobile: header wraps, note message wraps instead of clipping */
      @media (max-width: 600px) {
        .head { flex-direction: column; align-items: flex-start; }
        .n-msg { white-space: normal; }
      }
    `,
    ]
})
export class NotificationsComponent implements OnInit {
  notifications = inject(NotificationService);
  private router = inject(Router);

  readonly filters = ['all', 'orders', 'jobs', 'listings', 'promos', 'queues'];
  filter = signal('all');
  settingsOpen = signal(false);

  filtered = computed<Notif[]>(() => {
    const f = this.filter();
    const all = this.notifications.items();
    return f === 'all' ? all : all.filter((n) => n.type === f);
  });

  ngOnInit(): void {
    // Make sure the list is current when the page opens.
    this.notifications.refresh();
  }

  labelFor(type: string): string {
    return TYPE_LABELS[type] ?? 'Notification';
  }

  when(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  open(n: Notif): void {
    const route = this.notifications.routeFor(n);
    if (!n.isRead) this.notifications.markRead(n.id);
    if (route) this.router.navigateByUrl(route);
  }
}
