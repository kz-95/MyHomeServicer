import { Component, input, output, signal, effect, viewChild } from '@angular/core';
import { LerpNumberDirective } from '../../../shared/lerp-number.directive';

@Component({
  selector: 'app-lerp-bar',
  standalone: true,
  imports: [LerpNumberDirective],
  template: `
    <div class="lb-row" [class.visible]="active()" [class.lb-done]="barDone()">
      <div class="lb-label">{{ label() }}</div>
      <div class="lb-track">
        <div class="lb-fill" [style.width.%]="fillPct()" [style.background]="barColor()"></div>
      </div>
      <div class="lb-pct"
        [appLerpNumber]="value()"
        [lerpDuration]="duration()"
        [lerpSuffix]="'%'"
        (lerpDone)="onDone()">
      </div>
    </div>
  `,
  styles: [`
    .lb-row {
      opacity: 0; transform: translateX(-10px);
      transition: opacity 0.4s ease, transform 0.4s ease;
      display: flex; align-items: center; gap: 0.6rem; padding: 0.45rem 0;
    }
    .lb-row.visible { opacity: 1; transform: translateX(0); }
    .lb-row.lb-done .lb-fill { box-shadow: 0 0 8px rgba(74, 140, 92, 0.35); }
    .lb-label {
      flex: 0 0 120px; font-size: 0.82rem; font-weight: 500;
      color: var(--color-muted, #6b6258); white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .lb-track {
      flex: 1; height: 10px; background: var(--color-surface-alt, #f1ece4);
      border-radius: 5px; overflow: hidden;
    }
    .lb-fill {
      height: 100%; border-radius: 5px; width: 0%;
      transition: width 1.6s cubic-bezier(0.22, 1, 0.36, 1);
    }
    .lb-pct {
      flex: 0 0 50px; text-align: right; font-size: 0.85rem;
      font-weight: 700; color: var(--color-text, #2c2420);
    }
    .lb-pct.lerping { color: var(--color-primary, #e07a3a); text-shadow: 0 0 8px rgba(224, 122, 58, 0.35); }
    .lb-pct.complete { color: var(--color-success, #4a8c5c); }
    .lb-pct.skipped { color: var(--color-warning, #c4903a); }
  `],
})
export class LerpBarComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly barColor = input<string>('var(--color-primary, #e07a3a)');
  readonly active = input<boolean>(false);
  readonly duration = input<number>(1200);
  readonly done = output<void>();

  protected barDone = signal(false);
  private lerpDir = viewChild(LerpNumberDirective);

  constructor() {
    effect(() => {
      if (this.active()) {
        const dir = this.lerpDir();
        if (dir) {
          setTimeout(() => dir.run(), 200);
        }
      }
    });
  }

  protected fillPct(): number {
    return this.active() ? this.value() : 0;
  }

  protected onDone(): void {
    this.barDone.set(true);
    this.done.emit();
  }
}
