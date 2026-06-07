import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { SocketService } from '../../core/services/socket.service';
import { ToastService } from '../../core/services/toast.service';
import { ListToolbarComponent } from '../../shared/list-toolbar.component';

interface Notification {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

/** In-app notifications panel with live updates and mark-all-read. */
@Component({
  selector: 'app-notifications',
  standalone: true,
  host: { class: 'page-enter' },
  imports: [CommonModule, FormsModule, ListToolbarComponent],
  template: `
    <div class="head">
      <h1>Notifications</h1>
      @if (unread() > 0) {
        <button class="btn-ghost" (click)="markAll()">Mark all read ({{ unread() }})</button>
      }
    </div>
    @if (loading()) {
      <p class="muted">Loading notifications…</p>
    } @else if (loadFailed()) {
      <p class="muted">Could not load notifications. Please refresh the page.</p>
    } @else if (notifications().length === 0) {
      <p class="muted">No notifications yet.</p>
    } @else {
      <app-list-toolbar>
        <input class="search" type="text" placeholder="Search notifications…" [(ngModel)]="search" name="ns" toolbar-search />
        <div class="chips" toolbar-filters>
          <button class="chip" [class.on]="readFilter() === 'all'" (click)="readFilter.set('all')">All</button>
          <button class="chip" [class.on]="readFilter() === 'unread'" (click)="readFilter.set('unread')">Unread</button>
          <button class="chip" [class.on]="readFilter() === 'read'" (click)="readFilter.set('read')">Read</button>
        </div>
        <select [(ngModel)]="sort" name="nsort" toolbar-sort>
          <option value="newest">Most recent</option>
          <option value="oldest">Oldest first</option>
        </select>
      </app-list-toolbar>
      @for (n of displayNotifications(); track n.id) {
        <div
          class="card note page-child"
          role="button"
          tabindex="0"
          [class.unread]="!n.isRead"
          (click)="markOne(n)"
          (keydown.enter)="markOne(n)"
          (keydown.space)="markOne(n)"
        >
          <strong>{{ label(n.type) }}</strong>
          <p>{{ n.message }}</p>
          <span class="muted">{{ n.createdAt | date: 'short' }}</span>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid var(--color-border); margin-bottom: 1rem; }
      .search { min-width: 180px; max-width: 260px; border-radius: 999px; padding: 0.45rem 0.85rem; border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text); font-size: 0.88rem; outline: none; }
      .search:focus { border-color: var(--color-primary); }
      .chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
      .chip { background: transparent; border: 1px solid var(--color-border); border-radius: 999px; padding: 0.625rem 0.75rem; font-size: 0.82rem; cursor: pointer; color: var(--color-muted); }
      .chip.on { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
      select { border: 1px solid var(--color-border); border-radius: var(--radius); background: var(--color-surface); padding: 0.4rem 0.6rem; font-size: 0.85rem; outline: none; cursor: pointer; }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.4rem;
        flex-wrap: wrap;
        gap: 0.5rem;
      }
      .head h1 {
        margin: 0;
      }
      .note {
        margin-bottom: 0.6rem;
        cursor: pointer;
        transition: box-shadow var(--transition), transform var(--transition), border-color var(--transition);
        outline-offset: 2px;
      }
      .note:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.09);
        transform: translateY(-1px);
      }
      .note:focus-visible {
        outline: 2px solid var(--color-primary);
        box-shadow: 0 0 0 4px rgba(201, 90, 60, 0.1);
      }
      .note.unread {
        border-left: 3px solid var(--color-primary);
      }
      .note.unread:hover {
        border-left-color: var(--color-primary);
        box-shadow: 0 4px 14px rgba(201, 90, 60, 0.12);
      }
      .note p {
        margin: 0.3rem 0;
        font-size: 0.92rem;
        line-height: 1.5;
      }
    `,
  ],
})
export class NotificationsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private socket = inject(SocketService);
  private toast = inject(ToastService);
  notifications = signal<Notification[]>([]);
  loading = signal(true);
  loadFailed = signal(false);

  search = signal('');
  readFilter = signal<'all' | 'unread' | 'read'>('all');
  sort = signal<'newest' | 'oldest'>('newest');
  displayNotifications = computed(() => {
    let list = this.notifications();
    const q = this.search().toLowerCase();
    if (q) list = list.filter((n) => n.message.toLowerCase().includes(q));
    const rf = this.readFilter();
    if (rf === 'unread') list = list.filter((n) => !n.isRead);
    else if (rf === 'read') list = list.filter((n) => n.isRead);
    const s = this.sort();
    if (s === 'newest') list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return list;
  });

  private sub?: Subscription;

  unread = (): number => this.notifications().filter((n) => !n.isRead).length;

  ngOnInit(): void {
    this.load();
    this.sub = this.socket.on('notification.new').subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private load(): void {
    this.loadFailed.set(false);
    this.api.get<{ data: Notification[] }>('/user/me/notifications').subscribe({
      next: (r) => {
        this.notifications.set(r.data);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.loadFailed.set(true);
      },
    });
  }

  label(type: string): string {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  markOne(n: Notification): void {
    if (n.isRead) return;
    this.api.patch(`/user/me/notifications/${n.id}/read`, {}).subscribe({
      next: () => this.load(),
      error: () => this.toast.error('Could not mark notification as read'),
    });
  }

  markAll(): void {
    this.api.patch('/user/me/notifications/read-all', {}).subscribe({
      next: () => this.load(),
      error: () => this.toast.error('Could not mark notifications as read'),
    });
  }
}
