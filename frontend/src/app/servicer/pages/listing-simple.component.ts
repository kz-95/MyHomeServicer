import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { switchMap } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { IconComponent } from '../../shared/icon.component';
import { ToastService } from '../../core/services/toast.service';

interface CategoryQuestion {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string; active?: boolean }[];
}

/**
 * SP-3 Simple listing — one screen, publish fast. Photo (opt), title*, short
 * desc (opt), price type, base price*, est. duration, and "What jobs do you
 * want?" rendered as offered/N-A toggles over the account's category questions.
 * Saves a listing with no modules and no auto-accept (manual quoting). The
 * offered map is stored in `modifiers` as { price: null, notOffered } per spec.
 */
@Component({
  selector: 'app-listing-simple',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="page-enter wrap">
      <button class="btn-ghost back" (click)="cancel()">← Back</button>
      <h1>New simple listing</h1>
      <p class="muted">
        Under <strong>{{ categoryName() || '…' }}</strong>. Publish fast — you'll quote each
        request manually.
      </p>

      @if (error()) {
        <p class="err-banner">{{ error() }}</p>
      }

      <div class="card form">
        <!-- Photo -->
        <div class="photo-row">
          <div class="photo-frame">
            @if (f.imageUrl) {
              <img [src]="f.imageUrl" alt="Listing photo" />
            } @else {
              <span class="ph"><app-icon name="image" sizeToken="lg" strokeWidth="1.5" /></span>
            }
          </div>
          <div class="photo-ctl">
            <label class="btn-ghost file-btn">
              {{ uploading() ? uploadStatus() : f.imageUrl ? 'Replace photo' : 'Add photo (optional)' }}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                (change)="onPhoto($event)"
                [disabled]="uploading()"
                hidden
              />
            </label>
            @if (f.imageUrl) {
              <button class="btn-ghost small" (click)="f.imageUrl = null" [disabled]="uploading()">Remove</button>
            }
            @if (photoError()) {
              <span class="err">{{ photoError() }}</span>
            }
          </div>
        </div>

        <label>
          <span>Title<span class="req"> *</span></span>
          <input type="text" [(ngModel)]="f.title" name="title" maxlength="120" placeholder="e.g. Aircon Servicing — Wall Unit" />
        </label>

        <label>
          <span>Short description (optional)</span>
          <input type="text" [(ngModel)]="f.description" name="desc" maxlength="200" placeholder="One line customers see on the card" />
        </label>

        <div class="row-3">
          <label>
            <span>Price type</span>
            <select [(ngModel)]="f.priceType" name="ptype">
              <option value="fixed">Fixed</option>
              <option value="hourly">Hourly</option>
              <option value="quote">By quote</option>
            </select>
          </label>
          <label>
            <span>Base price (RM)<span class="req"> *</span></span>
            <input type="number" [(ngModel)]="f.basePrice" name="bprice" min="0" step="0.01" />
          </label>
          <label>
            <span>Est. duration (min)</span>
            <input type="number" [(ngModel)]="f.duration" name="dur" min="1" step="5" />
          </label>
        </div>

        <!-- What jobs do you want? -->
        @if (questions().length) {
          <div class="jobs">
            <div class="jobs-head">
              <strong>What jobs do you want?</strong>
              <p class="muted small">
                Toggle the options you'll take. Anything set to N/A won't be sent to you.
              </p>
            </div>
            @for (q of questions(); track q.key) {
              <div class="q-block">
                <div class="q-label">{{ q.label }}</div>
                <div class="opts">
                  @for (o of q.options; track o.value) {
                    <button
                      type="button"
                      class="opt"
                      [class.off]="!isOffered(q.key, o.value)"
                      (click)="toggleOffered(q.key, o.value)"
                    >
                      {{ o.label }}
                      <span class="opt-state">{{ isOffered(q.key, o.value) ? 'Offered' : 'N/A' }}</span>
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        }

        <div class="modal-actions">
          <button class="btn-ghost" (click)="cancel()">Cancel</button>
          <button class="btn-primary" (click)="save()" [disabled]="saving() || uploading()">
            {{ saving() ? 'Publishing…' : 'Publish listing' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .wrap {
        max-width: 680px;
        margin: 0 auto;
      }
      .back {
        margin-bottom: 0.8rem;
      }
      h1 {
        margin-bottom: 0.2rem;
      }
      .err-banner {
        color: var(--color-danger);
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger);
        border-radius: var(--radius);
        padding: 0.5rem 0.8rem;
        font-size: 0.85rem;
        margin: 0.8rem 0;
      }
      .form {
        display: flex;
        flex-direction: column;
        gap: 0.9rem;
        margin-top: 1rem;
      }
      .form label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-size: 0.88rem;
        font-weight: 500;
      }
      .row-3 {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 0.7rem;
      }
      @media (max-width: 560px) {
        .row-3 {
          grid-template-columns: 1fr;
        }
      }
      .req {
        color: var(--color-danger);
      }
      .photo-row {
        display: flex;
        gap: 1rem;
        align-items: center;
      }
      .photo-frame {
        width: 84px;
        height: 84px;
        border-radius: var(--radius);
        background: var(--color-bg);
        border: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        flex-shrink: 0;
      }
      .photo-frame img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .ph {
        color: var(--color-muted);
      }
      .photo-ctl {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        align-items: flex-start;
      }
      .file-btn {
        cursor: pointer;
        display: inline-flex;
        align-items: center;
      }
      .small {
        font-size: 0.78rem;
        padding: 0.25rem 0.6rem;
      }
      .jobs {
        display: flex;
        flex-direction: column;
        gap: 0.7rem;
        border-top: 1px solid var(--color-border);
        padding-top: 0.9rem;
      }
      .jobs-head strong {
        font-size: 0.95rem;
      }
      .small {
        font-size: 0.8rem;
      }
      .q-block {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
      }
      .q-label {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--color-muted);
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .opts {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .opt {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.35rem 0.7rem;
        border-radius: 999px;
        border: 1px solid var(--color-primary);
        background: var(--color-primary-light);
        color: var(--color-text);
        font-size: 0.85rem;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .opt .opt-state {
        font-size: 0.68rem;
        font-weight: 600;
        color: var(--color-primary);
        text-transform: uppercase;
      }
      .opt.off {
        border-color: var(--color-border);
        background: var(--color-bg);
        color: var(--color-muted);
        opacity: 0.7;
      }
      .opt.off .opt-state {
        color: var(--color-muted);
      }
    `,
  ],
})
export class ListingSimpleComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private router = inject(Router);

  categoryName = signal<string>('');
  categoryId = signal<string>('');
  questions = signal<CategoryQuestion[]>([]);

  saving = signal(false);
  uploading = signal(false);
  uploadStatus = signal('');
  error = signal('');
  photoError = signal('');

  // offered[qKey][optValue] = true (offered) | false (N/A). Default offered.
  private offered: Record<string, Record<string, boolean>> = {};

  f = {
    imageUrl: null as string | null,
    title: '',
    description: '',
    priceType: 'fixed',
    basePrice: null as number | null,
    duration: 60,
  };

  ngOnInit(): void {
    this.api
      .get<{ category: { id: string; name: string } }>('/servicer/me/subcategories')
      .pipe(
        switchMap((r) => {
          this.categoryName.set(r.category.name);
          this.categoryId.set(r.category.id);
          return this.api.get<{
            data: { id: string; questionSchema?: CategoryQuestion[] | null }[];
          }>('/categories');
        }),
      )
      .subscribe({
        next: (r) => {
          const cat = r.data.find((c) => c.id === this.categoryId());
          const qs = (cat?.questionSchema ?? []).filter(
            (q) => Array.isArray(q.options) && (q.options as unknown[]).length > 0,
          );
          // Drop inactive options; default every offered option to true.
          const cleaned = qs.map((q) => ({
            ...q,
            options: (q.options ?? []).filter((o) => o.active !== false),
          }));
          this.questions.set(cleaned);
          for (const q of cleaned) {
            this.offered[q.key] = {};
            for (const o of q.options) this.offered[q.key][o.value] = true;
          }
        },
        error: () => this.error.set('Could not load your service questions.'),
      });
  }

  isOffered(qKey: string, optValue: string): boolean {
    return this.offered[qKey]?.[optValue] ?? true;
  }

  toggleOffered(qKey: string, optValue: string): void {
    if (!this.offered[qKey]) this.offered[qKey] = {};
    this.offered[qKey][optValue] = !this.isOffered(qKey, optValue);
  }

  onPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.photoError.set('');
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      this.photoError.set('Photo must be under 5 MB.');
      input.value = '';
      return;
    }
    this.uploading.set(true);
    this.uploadStatus.set('Requesting…');
    this.api
      .post<{ uploadUrl: string; fileId: string }>('/files/presign', {
        purpose: 'listing_photo',
        mimeType: file.type || 'image/jpeg',
        sizeBytes: file.size,
      })
      .pipe(
        switchMap(({ uploadUrl, fileId }) => {
          this.uploadStatus.set('Uploading…');
          return this.http
            .put(uploadUrl, file, { headers: { 'Content-Type': file.type || 'image/jpeg' } })
            .pipe(
              switchMap(() => {
                this.uploadStatus.set('Confirming…');
                return this.api.post<{ fileUrl: string }>(`/files/${fileId}/confirm`, {});
              }),
            );
        }),
      )
      .subscribe({
        next: ({ fileUrl }) => {
          this.f.imageUrl = fileUrl;
          this.uploading.set(false);
          input.value = '';
        },
        error: (e) => {
          this.uploading.set(false);
          this.photoError.set(e.message ?? 'Photo upload failed.');
          input.value = '';
        },
      });
  }

  save(): void {
    if (!this.f.title.trim()) {
      this.error.set('Title is required.');
      return;
    }
    if (this.f.basePrice == null || this.f.basePrice < 0) {
      this.error.set('A valid base price is required.');
      return;
    }
    this.error.set('');
    this.saving.set(true);

    // Offered map → modifiers (price null; notOffered = !offered) per spec §10.1.
    const modifiers: Record<string, Record<string, { price: null; notOffered: boolean }>> = {};
    for (const q of this.questions()) {
      modifiers[q.key] = {};
      for (const o of q.options ?? []) {
        modifiers[q.key][o.value] = { price: null, notOffered: !this.isOffered(q.key, o.value) };
      }
    }

    const body: Record<string, unknown> = {
      title: this.f.title.trim(),
      description: this.f.description.trim() || undefined,
      imageUrl: this.f.imageUrl || undefined,
      priceType: this.f.priceType,
      basePrice: Number(this.f.basePrice),
      taxMode: 'none',
      estimatedDurationMinutes: Number(this.f.duration) || 60,
      autoAccept: false,
      published: true,
      modifiers,
    };

    this.api.post<{ id: string }>('/servicer/me/services', body).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Listing published.');
        this.router.navigate(['/servicer/services/listings']);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(e.message ?? 'Could not publish the listing');
      },
    });
  }

  cancel(): void {
    this.router.navigate(['/servicer/services/listings']);
  }
}
