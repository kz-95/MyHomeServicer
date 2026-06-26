import { Component, input, output, signal, effect, viewChild, afterNextRender } from '@angular/core';
import { LerpNumberDirective } from '../../../shared/lerp-number.directive';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [LerpNumberDirective],
  template: `
    <div class="stat-card" [class.visible]="active()" [class.finished]="cardDone()">
      <div class="stat-icon">{{ icon() }}</div>
      <div class="stat-label">{{ label() }}</div>
      <div class="stat-value"
        [appLerpNumber]="value()"
        [lerpDuration]="duration()"
        (lerpDone)="onDone()"></div>
      @if (hint()) {
        <div class="stat-hint">{{ hint() }}</div>
      }
    </div>
  `,
  styles: [`
    .stat-card {
      opacity: 0;
      transform: translateY(12px) scale(0.97);
      transition: opacity 0.45s ease, transform 0.45s ease;
      text-align: center;
      padding: 1.5rem 1rem;
      border-radius: var(--radius, 12px);
      background: var(--color-surface, #fff);
      border: 1px solid var(--color-border, #e8e0d8);
      box-shadow: var(--shadow, 0 1px 3px rgba(0,0,0,0.06));
      cursor: default;
    }
    .stat-card.visible {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .stat-card.finished {
      border-color: var(--color-primary-light, #f5e0d0);
      box-shadow: 0 2px 12px rgba(201, 90, 60, 0.1);
    }
    .stat-icon { font-size: 1.8rem; margin-bottom: 0.3rem; }
    .stat-label {
      font-size: 0.8rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--color-muted, #6b6258); margin-bottom: 0.4rem;
    }
    .stat-value {
      font-family: var(--font-display, Georgia, serif);
      font-size: 2.2rem; font-weight: 700;
      color: var(--color-text, #2c2420);
      transition: color 0.3s ease;
    }
    .stat-value.lerping {
      color: var(--color-primary, #e07a3a);
      text-shadow: 0 0 12px var(--color-primary, #e07a3a), 0 0 24px rgba(224, 122, 58, 0.4);
    }
    .stat-value.complete {
      color: var(--color-success, #4a8c5c);
      text-shadow: 0 0 14px var(--color-success, #4a8c5c);
    }
    .stat-value.skipped {
      color: var(--color-warning, #c4903a);
      text-shadow: 0 0 10px rgba(196, 144, 58, 0.3);
    }
    .stat-hint { margin-top: 0.25rem; font-size: 0.7rem; color: var(--color-muted, #6b6258); }
  `],
})
export class StatCardComponent {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly hint = input<string>('');
  readonly active = input<boolean>(false);
  readonly duration = input<number>(1200);
  readonly done = output<void>();

  protected cardDone = signal(false);

  private lerpDir = viewChild(LerpNumberDirective);

  constructor() {
    effect(() => {
      if (this.active()) {
        const dir = this.lerpDir();
        if (dir) {
          // Small delay so the card fade-in completes before the number starts lerping
          setTimeout(() => dir.run(), 300);
        }
      }
    });
  }

  protected onDone(): void {
    this.cardDone.set(true);
    this.done.emit();
  }
}
