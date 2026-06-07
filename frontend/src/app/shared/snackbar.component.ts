import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService, Notif } from '../core/services/notification.service';
import { ToastService, ActionToast } from '../core/services/toast.service';

/**
 * Global notification snackbar - bottom-left toasts that pop up and fade away
 * (Facebook-style). Rendered once at the app root.
 *
 * Renders two kinds of toasts:
 *   1. Backend notifications (NotificationService) - link to a page on click.
 *   2. Action toasts (ToastService) - success / error / info feedback from
 *      CRUD operations, replacing ad-hoc per-page <p> messages.
 */
@Component({
  selector: 'app-snackbar',
  standalone: true,
  template: `
    <div class="snackbar" role="status" aria-live="polite">
      <!-- ── Backend notification toasts ─────────────────────────────────── -->
      @for (t of notifications.toasts(); track t.id) {
        <div
          class="toast notif"
          [class.clickable]="!!notifications.routeFor(t)"
          [class.important]="isImportant(t.type)"
          (click)="open(t)"
        >
          <span class="t-dot" [attr.data-type]="t.type"></span>
          <div class="t-body">
            <span class="t-type">
              {{ label(t.type) }}
              @if (isImportant(t.type)) {
                <span class="t-important" title="Important">! Important</span>
              }
            </span>
            <span class="t-msg">{{ t.message }}</span>
          </div>
          <button class="t-x" (click)="dismiss($event, t.id)" aria-label="Dismiss">✕</button>
        </div>
      }

      <!-- ── Action toasts (success / error / info) ─────────────────────── -->
      @for (t of toastSvc.toasts(); track t.id) {
        <div class="toast action" [attr.data-level]="t.level" (click)="toastSvc.dismiss(t.id)">
          <span class="a-icon">{{ actionIcon(t.level) }}</span>
          <span class="t-msg">{{ t.message }}</span>
          <button class="t-x" (click)="toastSvc.dismiss(t.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .snackbar {
        position: fixed;
        left: 1.25rem;
        bottom: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        z-index: 2000;
        pointer-events: none;
      }
      .toast {
        pointer-events: auto;
        display: flex;
        align-items: flex-start;
        gap: 0.6rem;
        width: 330px;
        max-width: calc(100vw - 2.5rem);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 10px;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.22);
        padding: 0.7rem 0.8rem;
        animation: toastlife 5s ease forwards;
        cursor: default;
      }
      /* Action toasts use their own shorter animation */
      .toast.action {
        animation: toastlife-action 4.5s ease forwards;
      }
      .toast.clickable {
        cursor: pointer;
      }
      .toast.clickable:hover {
        border-color: var(--color-primary);
      }
      /* Important (order-lifecycle) notifications - accent bar + pill. */
      .toast.notif.important {
        border-left: 3px solid var(--color-danger);
      }
      .t-important {
        display: inline-block;
        margin-left: 0.35rem;
        font-size: 0.6rem;
        font-weight: 700;
        letter-spacing: 0.03em;
        color: var(--color-danger);
        border: 1px solid var(--color-danger);
        border-radius: 999px;
        padding: 0 0.35rem;
        vertical-align: middle;
      }

      /* Action toast level colours */
      .toast.action[data-level='success'] {
        border-color: var(--color-success);
      }
      .toast.action[data-level='error'] {
        border-color: var(--color-danger);
      }
      .toast.action {
        cursor: pointer;
        align-items: center;
      }

      /* Notification toasts - 5 s (they are dismissed by the backend polling). */
      @keyframes toastlife {
        0% {
          opacity: 0;
          transform: translateY(14px);
        }
        8% {
          opacity: 1;
          transform: translateY(0);
        }
        88% {
          opacity: 1;
          transform: translateY(0);
        }
        100% {
          opacity: 0;
          transform: translateY(14px);
        }
      }
      /* Action toasts - 4.5 s, matching ToastService.DEFAULT_DURATION_MS. */
      @keyframes toastlife-action {
        0% {
          opacity: 0;
          transform: translateY(10px);
        }
        10% {
          opacity: 1;
          transform: translateY(0);
        }
        85% {
          opacity: 1;
          transform: translateY(0);
        }
        100% {
          opacity: 0;
          transform: translateY(6px);
        }
      }
      .t-dot {
        flex-shrink: 0;
        width: 0.6rem;
        height: 0.6rem;
        border-radius: 999px;
        margin-top: 0.25rem;
        background: var(--color-primary);
      }
      .t-dot[data-type='queues'] {
        background: var(--color-warning);
      }
      .t-dot[data-type='promos'] {
        background: var(--color-promo);
      }
      .t-dot[data-type='orders'] {
        background: var(--color-success);
      }
      .a-icon {
        font-size: 1rem;
        flex-shrink: 0;
      }
      .t-body {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        flex: 1;
        min-width: 0;
      }
      .t-type {
        font-size: 0.7rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-muted);
      }
      .t-msg {
        font-size: 0.88rem;
        color: var(--color-text);
        flex: 1;
      }
      .t-x {
        flex-shrink: 0;
        background: transparent;
        border: none;
        color: var(--color-muted);
        font-size: 0.8rem;
        cursor: pointer;
        padding: 0 0.2rem;
      }
      .t-x:hover {
        color: var(--color-text);
      }
    `,
  ],
})
export class SnackbarComponent {
  notifications = inject(NotificationService);
  toastSvc = inject(ToastService);
  private router = inject(Router);

  private readonly labels: Record<string, string> = {
    orders: 'Order update',
    jobs: 'Job',
    listings: 'Listing',
    promos: 'Promotion',
    queues: 'Needs review',
  };

  label(type: string): string {
    return this.labels[type] ?? 'Notification';
  }

  /** Order-lifecycle notifications (new quote / proposal, booking, job) get an
   *  "Important" marker + accent on the snackbar. */
  isImportant(type: string): boolean {
    return type === 'orders' || type === 'jobs';
  }

  actionIcon(level: string): string {
    if (level === 'success') return '✓';
    if (level === 'error') return '✕';
    return 'ℹ';
  }

  open(t: Notif): void {
    const route = this.notifications.routeFor(t);
    this.notifications.markRead(t.id);
    this.notifications.dismiss(t.id);
    if (route) this.router.navigateByUrl(route);
  }

  dismiss(ev: Event, id: string): void {
    ev.stopPropagation();
    this.notifications.dismiss(id);
  }
}
