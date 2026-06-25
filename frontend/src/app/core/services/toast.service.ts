import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export type ToastLevel = 'success' | 'error' | 'info';

export interface ActionToast {
  id: string;
  message: string;
  level: ToastLevel;
}

const DEFAULT_DURATION_MS = 4_500;

/**
 * Lightweight service for in-app action feedback toasts (success / error /
 * info). Distinct from NotificationService which polls backend notifications.
 *
 * Usage:
 *   inject(ToastService).success('Listing saved.');
 *   inject(ToastService).error('Could not save - please retry.');
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly api = inject(ApiService);

  /** Currently visible action toasts - read by SnackbarComponent. */
  readonly toasts = signal<ActionToast[]>([]);

  /** Whether notification sounds are enabled (loaded from admin settings). */
  readonly soundEnabled = signal(true);

  /** Audio context unlocked flag - browsers block autoplay before first user gesture. */
  private audioUnlocked = false;

  constructor() {
    this.loadSoundSetting();
    this.unlockAudio();
  }

  private loadSoundSetting(): void {
    this.api.get<{ data: { key: string; value: unknown }[] }>('/admin/settings')
      .subscribe({
        next: (r) => {
          const setting = r.data.find(s => s.key === 'notification_sound_enabled');
          if (setting != null) this.soundEnabled.set(setting.value === true);
        },
        error: () => {},
      });
  }

  /** Unlock the Audio API on the first user gesture (browser autoplay policy). */
  private unlockAudio(): void {
    const handler = () => {
      if (this.audioUnlocked) return;
      const ctx = new AudioContext();
      // create a silent buffer to unlock the audio context
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      ctx.resume();
      this.audioUnlocked = true;
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
    document.addEventListener('click', handler, { once: false });
    document.addEventListener('touchstart', handler, { once: false });
  }

  show(message: string, level: ToastLevel = 'info', durationMs = DEFAULT_DURATION_MS): void {
    const id = crypto.randomUUID();
    this.toasts.update((t) => [...t, { id, message, level }]);
    setTimeout(() => this.dismiss(id), durationMs);
    this.playSound(level);
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  dismiss(id: string): void {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }

  /** Plays a short chime for success/error action toasts when sound is enabled. */
  private playSound(level: ToastLevel): void {
    if (!this.soundEnabled()) return;
    // Info toasts are silent - only success and error get audio feedback.
    if (level === 'info') return;
    const file = level === 'error'
      ? 'assets/sounds/Notification_Job.wav'
      : 'assets/sounds/NotificationCard.wav';
    try {
      const audio = new Audio(file);
      audio.volume = 0.4;
      audio.play().catch(() => {});
    } catch {
      // Audio not available - silently ignore
    }
  }
}
