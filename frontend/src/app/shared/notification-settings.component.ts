import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/services/api.service';

interface Category {
  id: string;
  name: string;
}
interface Prefs {
  types: Record<string, boolean>;
  followedCategoryIds: string[];
}

const TYPE_LABELS: Record<string, string> = {
  orders: 'Order updates',
  jobs: 'Job & quote activity',
  listings: 'Listing updates',
  promos: 'Promotions & offers',
  queues: 'Review-queue alerts',
};

/**
 * Notification settings - shared by the customer and servicer portals. Lets a
 * user switch each notification type on/off and follow specific service
 * categories (only followed categories produce category-tagged notifications).
 */
@Component({
    selector: 'app-notification-settings',
    host: { class: 'page-enter page-narrow' },
    imports: [FormsModule],
    template: `
    <h1>Notification settings</h1>
    <p class="muted">Choose what you get notified about and which snackbars pop up.</p>

    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else {
      <div class="card page-child">
        <h2>Notification types</h2>
        @for (t of typeKeys(); track t) {
          <label class="row">
            <input type="checkbox" [(ngModel)]="prefs.types[t]" [name]="'t_' + t" />
            <span>{{ labelFor(t) }}</span>
          </label>
        }
      </div>

      <div class="card page-child">
        <h2>Followed categories</h2>
        <p class="muted small">
          Leave all unticked to be notified about every category. Tick some to
          only get category-related notifications for those.
        </p>
        @for (c of categories(); track c.id) {
          <label class="row">
            <input
              type="checkbox"
              [checked]="isFollowed(c.id)"
              (change)="toggleCategory(c.id)"
            />
            <span>{{ c.name }}</span>
          </label>
        } @empty {
          <p class="muted">No categories available.</p>
        }
      </div>

      @if (message()) {
        <p [class]="messageIsError() ? 'err' : 'ok'">{{ message() }}</p>
      }
      <button class="btn-primary" (click)="save()" [disabled]="saving()">
        {{ saving() ? 'Saving…' : 'Save settings' }}
      </button>
    }
  `,
    styles: [
        `
      h2 {
        margin: 0 0 0.6rem;
        font-size: 1rem;
      }
      .card {
        margin-bottom: 1rem;
        max-width: 540px;
      }
      .row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        padding: 0.35rem 0;
        font-size: 0.92rem;
        cursor: pointer;
      }
      .row input {
        width: auto;
      }
      .small {
        font-size: 0.82rem;
        margin-top: 0;
      }
      .ok {
        color: var(--color-success);
        font-weight: 600;
      }
      .err {
        color: var(--color-danger);
        font-weight: 600;
      }
    `,
    ]
})
export class NotificationSettingsComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  saving = signal(false);
  message = signal('');
  messageIsError = signal(false);
  typeKeys = signal<string[]>([]);
  categories = signal<Category[]>([]);

  prefs: Prefs = { types: {}, followedCategoryIds: [] };

  ngOnInit(): void {
    this.api.get<{ data: Category[] }>('/categories').subscribe({
      next: (r) => this.categories.set(r.data ?? []),
      error: () => {/* categories stay empty - toggles still work */},
    });
    this.api
      .get<{ prefs: Prefs; types: string[] }>('/notifications/prefs')
      .subscribe({
        next: (r) => {
          this.prefs = {
            types: { ...r.prefs.types },
            followedCategoryIds: [...(r.prefs.followedCategoryIds ?? [])],
          };
          this.typeKeys.set(r.types);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  labelFor(type: string): string {
    return TYPE_LABELS[type] ?? type;
  }

  isFollowed(id: string): boolean {
    return this.prefs.followedCategoryIds.includes(id);
  }
  toggleCategory(id: string): void {
    const i = this.prefs.followedCategoryIds.indexOf(id);
    if (i >= 0) this.prefs.followedCategoryIds.splice(i, 1);
    else this.prefs.followedCategoryIds.push(id);
  }

  save(): void {
    this.saving.set(true);
    this.message.set('');
    this.api
      .put('/notifications/prefs', {
        types: this.prefs.types,
        followedCategoryIds: this.prefs.followedCategoryIds,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.messageIsError.set(false);
          this.message.set('Settings saved.');
          setTimeout(() => this.message.set(''), 4000);
        },
        error: (e) => {
          this.saving.set(false);
          this.messageIsError.set(true);
          this.message.set(e.message ?? 'Could not save settings.');
        },
      });
  }
}
