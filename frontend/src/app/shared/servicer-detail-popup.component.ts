import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../core/services/api.service';
import { ModalComponent } from './modal.component';

interface ServicerContact {
  id: string;
  contactPerson: string | null;
  number: string | null;
  email: string | null;
  isPrimary: boolean;
}

interface ServicerProfile {
  id: string;
  businessName: string;
  bio: string | null;
  logoUrl: string | null;
  rating: number;
  serviceAreas: string[] | null;
  isCompany: boolean;
  contacts: ServicerContact[];
}

/**
 * Dismissible popup showing a servicer's basic profile + contact details.
 * Reused wherever a servicer name is shown (bookings, history, proposals).
 *
 * Usage:
 *   <app-servicer-detail-popup [servicerId]="openId()" (closed)="openId.set(null)" />
 *
 * The parent owns a `servicerId` signal; set it to open, clear it to close.
 * Follows STYLE-RULES §7.0/§7.8 via the shared <app-modal> (Esc + backdrop +
 * ✕ all dismiss - read-only info, so non-blocking is intentional).
 */
@Component({
  selector: 'app-servicer-detail-popup',
  standalone: true,
  imports: [CommonModule, ModalComponent],
  template: `
    <app-modal [open]="!!servicerId" title="Servicer details" (closed)="closed.emit()">
      @if (loading()) {
        <p class="muted">Loading details…</p>
      } @else if (error()) {
        <p class="err">{{ error() }}</p>
      } @else if (profile(); as p) {
        <div class="sd">
          <div class="sd-head">
            <span class="sd-avatar">
              @if (p.logoUrl) {
                <img [src]="p.logoUrl" [alt]="p.businessName" />
              } @else {
                <span class="sd-initials">{{ initials(p.businessName) }}</span>
              }
            </span>
            <div class="sd-id">
              <strong class="sd-name">{{ p.businessName }}</strong>
              <div class="sd-meta">
                <span class="badge" [class.badge-accepted]="p.isCompany" [class.badge-open]="!p.isCompany">
                  {{ p.isCompany ? 'Company' : 'Individual' }}
                </span>
                <span class="sd-rating">★ {{ p.rating | number: '1.1-1' }}</span>
              </div>
            </div>
          </div>

          @if (p.bio) {
            <p class="sd-bio">{{ p.bio }}</p>
          }

          @if (p.serviceAreas && p.serviceAreas.length > 0) {
            <div class="sd-section">
              <span class="sd-label">Service areas</span>
              <div class="sd-areas">
                @for (a of p.serviceAreas; track a) {
                  <span class="sd-area">{{ a }}</span>
                }
              </div>
            </div>
          }

          <div class="sd-section">
            <span class="sd-label">Contact</span>
            @if (p.contacts.length === 0) {
              <p class="muted small">No contact details shared.</p>
            } @else {
              <ul class="sd-contacts">
                @for (c of p.contacts; track c.id) {
                  <li class="sd-contact">
                    @if (c.contactPerson) {
                      <span class="sd-person">
                        {{ c.contactPerson }}
                        @if (c.isPrimary) {
                          <span class="sd-primary">Primary</span>
                        }
                      </span>
                    }
                    @if (c.number) {
                      <a class="sd-link" [href]="'tel:' + c.number">📞 {{ c.number }}</a>
                    }
                    @if (c.email) {
                      <a class="sd-link" [href]="'mailto:' + c.email">✉ {{ c.email }}</a>
                    }
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }
    </app-modal>
  `,
  styles: [
    `
      .sd {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .sd-head {
        display: flex;
        align-items: center;
        gap: 0.85rem;
      }
      .sd-avatar {
        width: 56px;
        height: 56px;
        border-radius: 999px;
        background: var(--color-primary);
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .sd-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .sd-initials {
        color: #fff;
        font-weight: 600;
        font-size: 1.1rem;
      }
      .sd-id {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        min-width: 0;
      }
      .sd-name {
        font-size: 1.1rem;
      }
      .sd-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .sd-rating {
        font-size: 0.85rem;
        color: var(--color-muted);
      }
      .sd-bio {
        margin: 0;
        color: var(--color-text);
        font-size: 0.92rem;
        line-height: 1.5;
      }
      .sd-section {
        display: flex;
        flex-direction: column;
        gap: 0.45rem;
      }
      .sd-label {
        font-size: 0.78rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--color-muted);
      }
      .sd-areas {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .sd-area {
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        border-radius: 999px;
        padding: 0.2rem 0.65rem;
        font-size: 0.82rem;
      }
      .sd-contacts {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.65rem;
      }
      .sd-contact {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }
      .sd-person {
        font-weight: 600;
        font-size: 0.9rem;
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }
      .sd-primary {
        font-size: 0.68rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        background: var(--color-primary-light);
        color: var(--color-primary);
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
      }
      .sd-link {
        color: var(--color-primary);
        text-decoration: none;
        font-size: 0.9rem;
        width: fit-content;
      }
      .sd-link:hover {
        text-decoration: underline;
      }
      .err {
        color: var(--color-danger);
      }
      .small {
        font-size: 0.82rem;
      }
    `,
  ],
})
export class ServicerDetailPopupComponent {
  private api = inject(ApiService);

  loading = signal(false);
  error = signal('');
  profile = signal<ServicerProfile | null>(null);

  private _servicerId: string | null = null;
  /** Set to a servicer id to open + fetch; set to null to close. */
  @Input() set servicerId(id: string | null) {
    if (id === this._servicerId) return;
    this._servicerId = id;
    if (id) this.fetch(id);
  }
  get servicerId(): string | null {
    return this._servicerId;
  }

  @Output() closed = new EventEmitter<void>();

  private fetch(id: string): void {
    this.profile.set(null);
    this.error.set('');
    this.loading.set(true);
    this.api.get<ServicerProfile>(`/servicers/${id}`).subscribe({
      next: (p) => {
        this.profile.set(p);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e.message ?? 'Could not load servicer details.');
        this.loading.set(false);
      },
    });
  }

  initials(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }
}
