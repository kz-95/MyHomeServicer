import { Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

export type IconSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_MAP: Record<IconSize, number> = { sm: 14, md: 18, lg: 22, xl: 26 };

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `
    <svg lucideIcon [lucideIcon]="resolvedName()" [size]="sizePx()" [color]="stroke()" [strokeWidth]="strokeWidth()" />
  `,
  styles: [`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
  `],
  imports: [LucideDynamicIcon],
})
export class IconComponent {
  name = input.required<string>();
  sizeToken = input<IconSize>('md');
  stroke = input('currentColor');
  strokeWidth = input('2');

  protected sizePx = computed(() => SIZE_MAP[this.sizeToken()] ?? 18);

  /** Fallback to 'x' when icon name isn't registered. */
  protected resolvedName = computed(() => this.name() || 'x');
}
