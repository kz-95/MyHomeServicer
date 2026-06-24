import { Component, ElementRef, OnInit, OnDestroy, ViewChild, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';
import { ConfigService } from '../core/services/config.service';
import { SocketService } from '../core/services/socket.service';
import { ToastService } from '../core/services/toast.service';
import { IconComponent } from './icon.component';
import { Subscription } from 'rxjs';

interface DispatchPrompt {
  broadcastId: string;
  quoteId: string;
  category: { name: string; icon: string | null };
  timeSlot: string;
  preferredDate: string;
  budgetMin: number;
  budgetMax: number;
  propertyType: string | null;
  customerName: string;
  customerAvatarUrl: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  area: string | null;
  questions: unknown;
  timeoutSeconds?: number;
}

@Component({
  selector: 'app-dispatch-prompt-guard',
  standalone: true,
  imports: [FormsModule, IconComponent, DatePipe],
  template: `
    <dialog #dlg class="dp-dialog" (cancel)="$event.preventDefault()">
      @if (prompt(); as p) {
        <div class="dp-overlay" role="dialog" aria-modal="true">
          <!-- Header -->
          <div class="dp-hd">
            <div class="dp-hd-left">
              <app-icon name="bell-ringing" sizeToken="lg" strokeWidth="2" />
              <div>
                <strong>New dispatch: {{ p.category.name }}</strong>
                <span class="muted small">Review the job details below</span>
              </div>
            </div>
            <div class="dp-countdown" [class.urgent]="countdownSecs() <= 3">
              <span class="dp-countdown-num">{{ countdownSecs() }}</span>
              <span class="small">sec</span>
            </div>
          </div>

          <div class="dp-body">
            <!-- Customer info -->
            <div class="dp-section">
              <div class="dp-customer">
                @if (p.customerAvatarUrl) {
                  <img [src]="p.customerAvatarUrl" class="dp-avatar" alt="" />
                } @else {
                  <div class="dp-avatar-fallback">{{ p.customerName.charAt(0) }}</div>
                }
                <div>
                  <strong>{{ p.customerName }}</strong>
                  @if (p.area) {
                    <span class="muted small">{{ p.area }}</span>
                  }
                </div>
              </div>
            </div>

            <!-- Job details -->
            <div class="dp-section">
              <div class="dp-detail-grid">
                <div class="dp-detail-item">
                  <span class="dp-label">Service</span>
                  <span>{{ p.category.name }}</span>
                </div>
                <div class="dp-detail-item">
                  <span class="dp-label">Date</span>
                  <span>{{ p.preferredDate | date:'mediumDate' }}</span>
                </div>
                <div class="dp-detail-item">
                  <span class="dp-label">Time</span>
                  <span>{{ p.timeSlot }}</span>
                </div>
                <div class="dp-detail-item">
                  <span class="dp-label">Budget</span>
                  <span>RM {{ p.budgetMin }} â€“ RM {{ p.budgetMax }}</span>
                </div>
                @if (p.propertyType) {
                  <div class="dp-detail-item">
                    <span class="dp-label">Property</span>
                    <span>{{ p.propertyType }}</span>
                  </div>
                }
                @if (p.address) {
                  <div class="dp-detail-item dp-full">
                    <span class="dp-label">Location</span>
                    <span>{{ p.address }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Map preview (when coordinates available) -->
            @if (p.lat != null && p.lng != null) {
              <div class="dp-section">
                <label class="map-label">ðŸ“ Job Location</label>
                <img
                  class="map-preview"
                  [src]="staticMapUrl(p.lat!, p.lng!)"
                  alt="Job location on map"
                  loading="lazy"
                  (click)="openMaps(p.lat!, p.lng!)"
                />
              </div>
            }
          </div>

          <!-- Actions -->
          <div class="dp-actions">
            <button class="btn-primary dp-btn-accept" (click)="accept()" [disabled]="actioning()">
              <app-icon name="check-circle" sizeToken="sm" />
              {{ actioning() ? 'Processingâ€¦' : 'Accept job' }}
            </button>
            <button class="btn-ghost dp-btn-decline" (click)="decline()" [disabled]="actioning()">
              <app-icon name="x-circle" sizeToken="sm" />
              Decline
            </button>
          </div>

          @if (error()) {
            <p class="err">{{ error() }}</p>
          }
        </div>
      }
    </dialog>
  `,
  styles: [`
    :host { display: contents; }
    /* Native <dialog> + showModal() renders in the top layer â€” immune to
       ancestor transform/overflow clipping and always viewport-centered.
       See frontend/STYLE-RULES.md "Overlays & modals". Do NOT revert to a
       position:fixed backdrop. */
    .dp-dialog {
      padding: 0;
      border: none;
      background: transparent;
      max-width: min(520px, calc(100vw - 2rem));
      max-height: calc(100dvh - 4rem);
      width: 100%;
      overflow: visible;
      color: var(--color-text);
    }
    .dp-dialog::backdrop {
      background: rgba(0,0,0,0.6);
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    .dp-overlay {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 16px;
      width: 100%;
      max-height: calc(100dvh - 4rem);
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
      animation: slideUp 0.25s ease;
    }
    @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

    .dp-hd {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid var(--color-border);
      background: var(--color-primary);
      color: #fff;
      border-radius: 16px 16px 0 0;
    }
    .dp-hd-left { display: flex; align-items: center; gap: 0.6rem; }
    .dp-hd-left .muted { color: rgba(255,255,255,0.7); }
    .dp-countdown {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      background: rgba(255,255,255,0.2);
      border-radius: 999px;
      padding: 0.25rem 0.75rem;
      font-weight: 700;
      font-size: 1.1rem;
    }
    .dp-countdown.urgent {
      background: var(--color-danger);
      animation: pulse 1s ease infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

    .dp-body { padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .dp-section { }
    .dp-customer {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.75rem;
      background: var(--color-bg);
      border-radius: var(--radius);
      border: 1px solid var(--color-border);
    }
    .dp-avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }
    .dp-avatar-fallback {
      width: 44px; height: 44px; border-radius: 50%;
      background: var(--color-primary);
      color: #fff;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: 1.2rem;
    }
    .dp-customer div { display: flex; flex-direction: column; gap: 0.1rem; }

    .dp-detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
    .dp-detail-item {
      display: flex; flex-direction: column; gap: 0.1rem;
      padding: 0.5rem 0.75rem;
      background: var(--color-bg);
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border);
      font-size: 0.85rem;
    }
    .dp-full { grid-column: 1 / -1; }
    .dp-label { font-size: 0.7rem; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.03em; }

    .map-label { display: block; font-size: 0.75rem; font-weight: 600; color: var(--color-muted); margin-bottom: 0.4rem; }
    .map-preview { width: 100%; max-width: 400px; border-radius: var(--radius); border: 1px solid var(--color-border); cursor: pointer; }
    .map-preview:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.1); }

    .dp-actions {
      display: flex; gap: 0.75rem;
      padding: 1rem 1.25rem;
      border-top: 1px solid var(--color-border);
    }
    .dp-btn-accept {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.4rem;
      font-size: 1rem; padding: 0.75rem;
    }
    .dp-btn-decline {
      flex-shrink: 0; display: flex; align-items: center; gap: 0.4rem;
      color: var(--color-muted);
    }
    .dp-btn-decline:hover { color: var(--color-danger); }

    .err { color: var(--color-danger); padding: 0 1.25rem 1rem; font-size: 0.85rem; }
    .small { font-size: 0.78rem; }
  `],
})
export class DispatchPromptGuardComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private socket = inject(SocketService);
  private toast = inject(ToastService);
  private config = inject(ConfigService);

  @ViewChild('dlg') private dlgRef?: ElementRef<HTMLDialogElement>;

  prompt = signal<DispatchPrompt | null>(null);
  countdownSecs = signal<number>(10);
  actioning = signal(false);
  error = signal('');

  constructor() {
    // Drive the native top-layer dialog from the prompt signal: open when a
    // dispatch arrives, close when it's cleared (accept/decline/timeout).
    effect(() => {
      const dlg = this.dlgRef?.nativeElement;
      if (!dlg) return;
      const hasPrompt = this.prompt() !== null;
      if (hasPrompt && !dlg.open) dlg.showModal();
      else if (!hasPrompt && dlg.open) dlg.close();
    });
  }

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private socketSub: Subscription | null = null;
  private broadcastId: string | null = null;

  ngOnInit(): void {
    this.socketSub = this.socket.on<DispatchPrompt>('dispatch.prompt').subscribe((data) => {
      // Online servicers get the center guard (interrupt-to-accept); offline
      // servicers keep the unobtrusive corner toast and act from the jobs board.
      if (this.auth.principal()?.isOnline) {
        this.showPrompt(data);
      } else {
        this.toast.info(`New dispatch: ${data.category.name}. Open Jobs to respond.`);
      }
    });
  }

  ngOnDestroy(): void {
    this.socketSub?.unsubscribe();
    this.clearTimer();
    const dlg = this.dlgRef?.nativeElement;
    if (dlg?.open) dlg.close();
  }

  private showPrompt(data: DispatchPrompt): void {
    this.broadcastId = data.broadcastId;
    this.prompt.set(data);
    this.error.set('');
    this.actioning.set(false);
    this.countdownSecs.set(data.timeoutSeconds ?? 10);
    this.startTimer();
  }

  private startTimer(): void {
    this.clearTimer();
    this.timerInterval = setInterval(() => {
      this.countdownSecs.update((s) => {
        if (s <= 1) {
          this.clearTimer();
          this.handleTimeout();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }

  private clearTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private handleTimeout(): void {
    const bid = this.broadcastId;
    if (!bid) return;
    this.prompt.set(null);
    this.broadcastId = null;
    this.toast.info('Dispatch prompt expired.');
    // Auto-decline on timeout.
    this.api.post(`/servicer/dispatch/${bid}/decline`, {}).subscribe({
      error: () => {},
    });
  }

  accept(): void {
    const bid = this.broadcastId;
    if (!bid || this.actioning()) return;
    this.actioning.set(true);
    this.error.set('');
    this.clearTimer();

    this.api.post<{ bookingId: string }>(`/servicer/dispatch/${bid}/accept`, {}).subscribe({
      next: (r) => {
        this.toast.success('Job accepted! Booking confirmed.');
        this.prompt.set(null);
        this.broadcastId = null;
      },
      error: (e) => {
        this.actioning.set(false);
        this.error.set(e.message ?? 'Failed to accept job');
        if (e.message?.includes('already been accepted')) {
          this.prompt.set(null);
          this.broadcastId = null;
        }
      },
    });
  }

  decline(): void {
    const bid = this.broadcastId;
    if (!bid || this.actioning()) return;
    this.actioning.set(true);
    this.error.set('');
    this.clearTimer();

    this.api.post(`/servicer/dispatch/${bid}/decline`, {}).subscribe({
      next: () => {
        this.toast.info('Job declined.');
        this.prompt.set(null);
        this.broadcastId = null;
      },
      error: (e) => {
        this.actioning.set(false);
        this.error.set(e.message ?? 'Failed to decline job');
      },
    });
  }

  staticMapUrl(lat: number, lng: number): string {
    const key = this.config.googleMapsApiKey;
    if (!key) return '';
    return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=14&size=400x200&markers=color:red%7C${lat},${lng}&key=${key}`;
  }

  openMaps(lat: number, lng: number): void {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, '_blank');
  }
}
