import {
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  Renderer2,
  inject,
} from '@angular/core';

/**
 * Facebook/Twitter-style pull-to-refresh for the scrollable `<main class="content">`.
 *
 * No surface "bar" - just a floating circular spinner that fades/rotates in as
 * you pull, while the page content rubber-bands down to follow your finger.
 * Releasing past the threshold reloads the page.
 */
const THRESHOLD = 70; // px (after resistance) needed to trigger a refresh
const MAX_PULL = 110; // px cap on how far the content travels
const RESISTANCE = 0.5; // finger-to-content travel ratio (rubber-band feel)

@Directive({
  selector: '[appPullToRefresh]',
  standalone: true,
})
export class PullToRefreshDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private r = inject(Renderer2);
  private zone = inject(NgZone);

  private spinHost!: HTMLElement;
  private spinner!: HTMLElement;
  private ring!: HTMLElement;
  private content: HTMLElement | null = null;

  private startY = 0;
  private pull = 0;
  private pulling = false;
  private refreshing = false;
  private cleanup: Array<() => void> = [];

  ngOnInit(): void {
    this.build();
    this.zone.runOutsideAngular(() => {
      const el = this.el.nativeElement;
      const ts = (e: TouchEvent) => this.onStart(e);
      const tm = (e: TouchEvent) => this.onMove(e);
      const te = () => this.onEnd();
      el.addEventListener('touchstart', ts, { passive: true });
      el.addEventListener('touchmove', tm, { passive: false });
      el.addEventListener('touchend', te, { passive: true });
      el.addEventListener('touchcancel', te, { passive: true });
      this.cleanup.push(
        () => el.removeEventListener('touchstart', ts),
        () => el.removeEventListener('touchmove', tm),
        () => el.removeEventListener('touchend', te),
        () => el.removeEventListener('touchcancel', te),
      );
    });
  }

  ngOnDestroy(): void {
    this.cleanup.forEach((fn) => fn());
  }

  private build(): void {
    this.spinHost = this.r.createElement('div');
    this.r.setAttribute(this.spinHost, 'class', 'ptr-spin-host');

    this.spinner = this.r.createElement('div');
    this.r.setAttribute(this.spinner, 'class', 'ptr-spin');

    this.ring = this.r.createElement('div');
    this.r.setAttribute(this.ring, 'class', 'ptr-spin-ring');

    this.r.appendChild(this.spinner, this.ring);
    this.r.appendChild(this.spinHost, this.spinner);

    const host = this.el.nativeElement;
    if (host.firstChild) {
      this.r.insertBefore(host, this.spinHost, host.firstChild);
    } else {
      this.r.appendChild(host, this.spinHost);
    }
    this.content = host.querySelector('.content-main');
  }

  private onStart(e: TouchEvent): void {
    if (this.refreshing || this.el.nativeElement.scrollTop > 2) {
      this.pulling = false;
      return;
    }
    this.pulling = true;
    this.pull = 0;
    this.startY = e.touches[0].clientY;
    this.setSnap(false);
  }

  private onMove(e: TouchEvent): void {
    if (!this.pulling) return;
    const raw = e.touches[0].clientY - this.startY;
    if (raw <= 0) {
      this.pull = 0;
      this.apply(0);
      return;
    }
    this.pull = Math.min(raw * RESISTANCE, MAX_PULL);
    this.apply(this.pull);
    // Only swallow the gesture once it's clearly a downward pull from the top,
    // so normal scrolling is never blocked.
    if (raw > 8 && e.cancelable) e.preventDefault();
  }

  private onEnd(): void {
    if (!this.pulling) return;
    this.pulling = false;
    this.setSnap(true);

    if (this.pull >= THRESHOLD && !this.refreshing) {
      this.refreshing = true;
      this.apply(THRESHOLD);
      this.r.addClass(this.ring, 'ptr-spin-ring--spinning');
      setTimeout(() => window.location.reload(), 450);
    } else {
      this.apply(0);
    }
  }

  /** Move the content + spinner to reflect the current pull distance. */
  private apply(px: number): void {
    const progress = Math.min(px / THRESHOLD, 1);
    if (this.content) {
      this.r.setStyle(this.content, 'transform', `translateY(${px}px)`);
    }
    this.r.setStyle(this.spinner, 'opacity', String(progress));
    this.r.setStyle(this.spinner, 'transform', `translate(-50%, ${px - 38}px)`);
    if (!this.refreshing) {
      this.r.setStyle(this.ring, 'transform', `rotate(${progress * 270}deg)`);
    }
  }

  /** Toggle the smooth snap-back transition (off while the finger drives it). */
  private setSnap(on: boolean): void {
    const t = on ? 'transform 0.25s ease' : 'none';
    if (this.content) this.r.setStyle(this.content, 'transition', t);
    this.r.setStyle(this.spinner, 'transition', on ? 'opacity 0.2s ease, transform 0.25s ease' : 'none');
  }
}
