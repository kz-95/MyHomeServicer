import { Component, input, output, signal, effect, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { LerpNumberDirective } from '../../../shared/lerp-number.directive';

const MILESTONES: number[] = [1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000];

function milestoneAt(v: number): number[] {
  return MILESTONES.filter((m) => v >= m);
}

@Component({
  selector: 'app-money-counter',
  standalone: true,
  imports: [LerpNumberDirective, DecimalPipe],
  template: `
    <div class="mc-card" [class.visible]="active()" [class.bump]="bumping()" [class.highlight]="highlighting()">
      <div class="mc-label">{{ label() }}</div>
      <div class="mc-value"
        [appLerpNumber]="value()"
        [lerpDuration]="duration()"
        [lerpPrefix]="'RM '"
        [lerpDecimals]="2"
        (lerpTick)="onTick($event)"
        (lerpDone)="onDone()">
      </div>
      @if (sub()) { <div class="mc-sub">{{ sub() }}</div> }
      @if (latestMilestone()) {
        <div class="mc-milestone" [class.flash]="highlighting()">RM {{ latestMilestone() | number:'1.0-0' }}</div>
      }
    </div>
  `,
  styles: [`
    .mc-card {
      opacity: 0; transform: translateY(12px) scale(0.97);
      transition: opacity 0.45s ease, transform 0.45s ease, border-color 0.3s, box-shadow 0.3s;
      text-align: center; padding: 1.8rem 1.2rem; border-radius: var(--radius, 12px);
      background: var(--color-surface, #fff); border: 2px solid var(--color-border, #e8e0d8);
      box-shadow: var(--shadow, 0 1px 3px rgba(0,0,0,0.06)); position: relative; overflow: hidden;
    }
    .mc-card.visible { opacity: 1; transform: translateY(0) scale(1); }
    .mc-card.bump { animation: mc-bump 0.3s ease-out; }
    @keyframes mc-bump {
      0% { transform: scale(1) rotate(0deg); }
      40% { transform: scale(1.05) rotate(2.5deg); }
      100% { transform: scale(1) rotate(0deg); }
    }
    .mc-card.highlight {
      border-color: var(--color-warning, #c4903a);
      box-shadow: 0 0 20px rgba(196, 144, 58, 0.4), 0 0 40px rgba(196, 144, 58, 0.15);
    }
    .mc-label {
      font-size: 0.8rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--color-muted, #6b6258); margin-bottom: 0.25rem;
    }
    .mc-value {
      font-family: var(--font-display, Georgia, serif);
      font-size: 2.6rem; font-weight: 700; color: var(--color-text, #2c2420);
      transition: color 0.3s ease;
    }
    .mc-value.lerping {
      color: var(--color-primary, #e07a3a);
      text-shadow: 0 0 14px var(--color-primary, #e07a3a), 0 0 28px rgba(224, 122, 58, 0.35);
    }
    .mc-value.complete {
      color: var(--color-success, #4a8c5c);
      text-shadow: 0 0 16px var(--color-success, #4a8c5c);
    }
    .mc-value.skipped {
      color: var(--color-warning, #c4903a);
      text-shadow: 0 0 10px rgba(196, 144, 58, 0.3);
    }
    .mc-sub { margin-top: 0.25rem; font-size: 0.75rem; color: var(--color-muted, #6b6258); }
    .mc-milestone {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) scale(0.5);
      font-weight: 800; font-size: 1.2rem; color: var(--color-warning, #c4903a);
      opacity: 0; pointer-events: none;
    }
    .mc-milestone.flash { animation: mc-flash 0.9s ease-out forwards; }
    @keyframes mc-flash {
      0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
      30% { opacity: 0.9; transform: translate(-50%, -50%) scale(1.2); }
      100% { opacity: 0; transform: translate(-50%, -50%) scale(1.6); }
    }
  `],
})
export class MoneyCounterComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly sub = input<string>('');
  readonly active = input<boolean>(false);
  readonly duration = input<number>(1800);
  readonly done = output<void>();

  protected bumping = signal(false);
  protected highlighting = signal(false);
  protected latestMilestone = signal<number | null>(null);

  private lastMilestones = 0;
  private lerpDir = viewChild(LerpNumberDirective);

  constructor() {
    effect(() => {
      if (this.active()) {
        const dir = this.lerpDir();
        if (dir) {
          setTimeout(() => dir.run(), 350);
        }
      }
    });
  }

  protected onTick(raw: number): void {
    const ms = milestoneAt(raw).length;
    if (ms > this.lastMilestones) {
      this.lastMilestones = ms;
      const hit = MILESTONES[ms - 1];
      this.latestMilestone.set(hit);
      this.bumping.set(true);
      this.highlighting.set(true);
      setTimeout(() => this.bumping.set(false), 350);
      setTimeout(() => this.highlighting.set(false), 900);
    }
  }

  protected onDone(): void { this.done.emit(); }
}
