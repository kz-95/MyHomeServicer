import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { SocketService } from './socket.service';

export interface Notif {
  id: string;
  type: string;
  message: string;
  linkUrl?: string | null;
  linkQuoteList?: string | null;
  linkReorder?: string | null;
  category?: string | null;
  isRead: boolean;
  createdAt: string;
}

const POLL_MS = 45_000;
const TOAST_MS = 5_000;   // matches the 5s `toastlife` CSS animation
const MAX_TOASTS = 5;     // cap simultaneous toasts to avoid off-screen stacking

/**
 * Keeps the notification list current and surfaces new arrivals as transient
 * toasts. Combines two update paths:
 *   1. Real-time - the server emits `notification.new` over Socket.io and this
 *      service calls refresh() immediately.
 *   2. Periodic fallback - a 45-second poll catches any events missed while the
 *      socket was reconnecting.
 *
 * Tab-visibility: the interval is suspended while the tab is hidden and
 * restarted (with an immediate refresh) when the tab becomes visible again.
 * `pollError` is set to true on poll failure and cleared on the next success.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private socketSvc = inject(SocketService);

  /** Full notification list (most recent first). */
  items = signal<Notif[]>([]);
  /** Unread count - drives the nav badge. */
  unread = signal(0);
  /** Currently visible snackbar toasts. */
  toasts = signal<Notif[]>([]);
  /** True when the most recent poll returned an error; cleared on next success. */
  pollError = signal(false);

  private seen = new Set<string>();
  private primed = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private socketSub: Subscription | null = null;
  /** Tracks whether start() has been called; survives timer=null when tab is hidden. */
  private polling = false;
  /** Whether the notification chime should be played (loaded from admin settings). */
  soundEnabled = signal(true);

  /** Suspends/resumes the poll interval as the tab is hidden/shown. */
  private readonly visibilityHandler = (): void => {
    if (!this.polling) return;
    if (document.visibilityState === 'hidden') {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
    } else {
      this.refresh();
      if (!this.timer) this.timer = setInterval(() => this.refresh(), POLL_MS);
    }
  };

  /** Loads the notification sound setting from admin settings. */
  checkSoundSetting(): void {
    this.api.get<{ data: { key: string; value: unknown }[] }>('/admin/settings')
      .subscribe({
        next: (r) => {
          const setting = r.data.find(s => s.key === 'notification_sound_enabled');
          if (setting) this.soundEnabled.set(setting.value === true);
        },
        error: () => {},
      });
  }

  /** Begins polling and opens the real-time socket subscription. Safe to call repeatedly. */
  start(): void {
    if (this.polling) return;
    this.polling = true;
    this.checkSoundSetting();
    // Only start the timer if the tab is currently visible.
    if (document.visibilityState !== 'hidden') {
      this.refresh();
      this.timer = setInterval(() => this.refresh(), POLL_MS);
    }
    document.addEventListener('visibilitychange', this.visibilityHandler);
    // Real-time path: server pushes notification.new → refresh immediately.
    this.socketSub = this.socketSvc
      .on<{ type?: string }>('notification.new')
      .subscribe((payload) => {
        this.refresh();
        this.playNotificationSound(payload?.type);
      });
  }

  /** Stops polling, closes the socket subscription, and clears state - call on logout. */
  stop(): void {
    this.polling = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.socketSub?.unsubscribe();
    this.socketSub = null;
    this.seen.clear();
    this.primed = false;
    this.items.set([]);
    this.unread.set(0);
    this.toasts.set([]);
    this.pollError.set(false);
  }

  private playNotificationSound(notifType?: string): void {
    if (!this.soundEnabled()) return;
    const file = this.pickSoundFile(notifType);
    try {
      const audio = new Audio(file);
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {
      // Audio not available - silently ignore
    }
  }

  /** Returns the sound file path for a notification type. Tiered: jobs, orders, payments get distinct sounds. */
  private pickSoundFile(notifType?: string): string {
    if (notifType === 'jobs')      return 'assets/sounds/Notification_Job.wav';
    if (notifType === 'orders')    return 'assets/sounds/Notification_Order.wav';
    if (notifType === 'payments')  return 'assets/sounds/Notification_Topup.wav';
    // Servicer accounts get a distinct chime so they can tell their job
    // notifications apart from customer ones by sound alone.
    return this.auth.isMerchantAccount()
      ? 'assets/sounds/Notification_Chat.wav'
      : 'assets/sounds/NotificationCard.wav';
  }

  /** Fetches the latest notifications; toasts anything new since priming. */
  refresh(): void {
    if (!this.auth.isLoggedIn()) return;
    this.api.get<{ data: Notif[]; unread: number }>('/notifications').subscribe({
      next: (r) => {
        this.pollError.set(false);
        this.items.set(r.data);
        this.unread.set(r.unread);
        if (!this.primed) {
          // First load - record everything, don't toast the backlog.
          r.data.forEach((n) => this.seen.add(n.id));
          this.primed = true;
          return;
        }
        const fresh = r.data.filter((n) => !this.seen.has(n.id));
        fresh.forEach((n) => this.seen.add(n.id));
        // Show unread arrivals oldest-first so the newest sits on top.
        for (const n of fresh.filter((x) => !x.isRead).reverse()) {
          // Drop new toasts silently when the cap is reached; they stay in the panel.
          this.toasts.update((t) => t.length >= MAX_TOASTS ? t : [...t, n]);
          setTimeout(() => this.dismiss(n.id), TOAST_MS);
        }
      },
      error: () => {
        this.pollError.set(true);
      },
    });
  }

  dismiss(id: string): void {
    this.toasts.update((t) => t.filter((n) => n.id !== id));
  }

  markRead(id: string): void {
    this.api.patch(`/notifications/${id}/read`, {}).subscribe({ next: () => this.refresh() });
  }

  markAllRead(): void {
    this.api.patch('/notifications/read-all', {}).subscribe({
      next: () => {
        // Optimistic local update - read-all marks everything, so no server
        // state can differ; avoids a redundant network round-trip.
        this.items.update((list) => list.map((n) => ({ ...n, isRead: true })));
        this.unread.set(0);
      },
    });
  }

  /** Resolves the in-app route a notification should open, or null. */
  routeFor(n: Notif): string | null {
    if (n.linkUrl) return n.linkUrl;
    if (n.linkQuoteList) return '/customer/quotes';
    if (n.linkReorder) return '/customer/history';
    return null;
  }
}
