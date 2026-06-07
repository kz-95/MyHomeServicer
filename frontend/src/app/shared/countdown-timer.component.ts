import { Component, Input, OnInit, OnDestroy, signal } from '@angular/core';

/**
 * Quote countdown timer. Ticks down to a deadline and shows a live
 * HH:MM:SS string; emits nothing - purely presentational.
 */
@Component({
  selector: 'app-countdown',
  standalone: true,
  template: `
    <span class="countdown" [class.urgent]="urgent()" [class.expired]="expired()">
      {{ expired() ? 'Expired' : display() }}
    </span>
  `,
  styles: [
    `
      .countdown {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: var(--color-primary);
      }
      .urgent {
        color: var(--color-warning);
      }
      .expired {
        color: var(--color-danger);
      }
    `,
  ],
})
export class CountdownComponent implements OnInit, OnDestroy {
  @Input({ required: true }) deadline!: string | Date;

  display = signal('--:--:--');
  expired = signal(false);
  urgent = signal(false);
  private handle?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.tick();
    this.handle = setInterval(() => this.tick(), 1000);
  }

  ngOnDestroy(): void {
    if (this.handle) clearInterval(this.handle);
  }

  private tick(): void {
    const end = new Date(this.deadline).getTime();
    const remaining = end - Date.now();
    if (remaining <= 0) {
      this.expired.set(true);
      this.display.set('00:00:00');
      if (this.handle) clearInterval(this.handle);
      return;
    }
    this.urgent.set(remaining < 5 * 60_000);
    const s = Math.floor(remaining / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    this.display.set(`${hh}:${mm}:${ss}`);
  }
}
