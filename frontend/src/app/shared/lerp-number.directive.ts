import {
  Directive,
  ElementRef,
  Renderer2,
  inject,
  input,
  output,
  signal,
  effect,
  OnInit,
  OnDestroy,
} from '@angular/core';

/**
 * Lerps a number from → target with requestAnimationFrame.
 *
 * Two ways to trigger:
 *   1. `[lerpActive]="true"`  — direct binding; effect auto-calls run() when active goes true.
 *      Best for inline usage in a template without a wrapper component.
 *   2. Call `run()` explicitly  — when the directive is inside a wrapper component
 *      (e.g. app-stat-card) that manages its own timing. Use ViewChild + run().
 *
 * CSS classes applied to host:
 *   .lerping  - while number is animating (use for glow)
 *   .complete - for ~400ms after finish (use for blink/colour change)
 *   .skipped  - if user clicked to skip
 *
 * Clicking the element while lerping skips to the final value.
 */
@Directive({
  selector: '[appLerpNumber]',
  standalone: true,
  host: {
    '[class.lerping]': 'state() === "lerping"',
    '[class.complete]': 'state() === "complete"',
    '[class.skipped]': 'state() === "skipped"',
    '(click)': 'onClick()',
  },
})
export class LerpNumberDirective implements OnInit, OnDestroy {
  /* ── Inputs ─────────────────────────────────────────────── */
  readonly appLerpNumber = input.required<number>();
  readonly lerpActive = input<boolean>(false);
  readonly lerpDuration = input<number>(1200);
  readonly lerpFrom = input<number>(0);
  readonly lerpPrefix = input<string>('');
  readonly lerpSuffix = input<string>('');
  readonly lerpDecimals = input<number>(0);

  /* ── Outputs ────────────────────────────────────────────── */
  readonly lerpDone = output<void>();
  /** Emits current raw number on every animation frame. */
  readonly lerpTick = output<number>();

  /* ── State ──────────────────────────────────────────────── */
  readonly state = signal<'idle' | 'lerping' | 'complete' | 'skipped'>('idle');

  private el = inject(ElementRef<HTMLElement>);
  private r = inject(Renderer2);

  private rafId: number | null = null;
  private startTime = 0;
  private fromVal = 0;
  private toVal = 0;
  private duration = 0;
  private blinkTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    // Auto-trigger path: for inline directive usage where [lerpActive] is
    // a direct binding (no wrapper component in between).
    effect(() => {
      if (this.lerpActive() && this.appLerpNumber() > 0 && this.state() === 'idle') {
        this.run();
      }
    });
  }

  /** Explicit trigger — use from parent component via ViewChild. */
  run(): void {
    this.cancelRaf();
    this.fromVal = this.lerpFrom();
    this.toVal = this.appLerpNumber();
    this.duration = this.lerpDuration();
    this.startTime = 0;
    this.state.set('lerping');
    this.tick(performance.now());
  }

  ngOnDestroy(): void {
    this.cancelRaf();
    if (this.blinkTimer) clearTimeout(this.blinkTimer);
  }

  /* ── Click to skip ──────────────────────────────────────── */
  onClick(): void {
    if (this.state() === 'lerping') {
      this.cancelRaf();
      this.display(this.toVal);
      this.state.set('skipped');
      this.lerpDone.emit();
    }
  }

  /* ── Animation loop ─────────────────────────────────────── */
  private tick = (now: number): void => {
    if (this.startTime === 0) this.startTime = now;
    const elapsed = now - this.startTime;
    let progress = this.duration > 0 ? Math.min(elapsed / this.duration, 1) : 1;
    const eased = easeOutCubic(progress);
    const current = this.fromVal + (this.toVal - this.fromVal) * eased;
    this.display(current);
    this.lerpTick.emit(current);

    if (progress < 1) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.display(this.toVal);
      this.state.set('complete');
      this.lerpDone.emit();
      this.blinkTimer = setTimeout(() => this.state.set('idle'), 400);
    }
  };

  private display(val: number): void {
    const text = this.format(val);
    this.r.setProperty(this.el.nativeElement, 'textContent', text);
  }

  private format(val: number): string {
    const prefix = this.lerpPrefix();
    const suffix = this.lerpSuffix();
    const decimals = this.lerpDecimals();
    const num = Number(val.toFixed(decimals));
    const formatted = decimals > 0
      ? num.toLocaleString('en-MY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : num.toLocaleString('en-MY');
    return `${prefix}${formatted}${suffix}`;
  }

  private cancelRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

