import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { routeFor } from '../../core/route-for';
import { IconComponent } from '../../shared/icon.component';

/**
 * SP-3: listing create mode chooser — Simple (publish fast) vs Advanced
 * (modules + per-option pricing + auto-accept, Phase 2). Advanced is stubbed.
 */
@Component({
  selector: 'app-listing-create',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="page-enter wrap">
      <button class="btn-ghost back" (click)="cancel()">← Back to listings</button>
      <h1>New listing</h1>
      <p class="muted">Pick how you want to set this up. You can switch later from Edit.</p>

      <div class="choices">
        <button class="choice" (click)="simple()">
          <span class="ico"><app-icon name="zap" sizeToken="lg" /></span>
          <span class="ct">Simple</span>
          <span class="cd">
            One screen. Title, price, duration and which jobs you want. Publish in under a minute —
            you quote each request manually.
          </span>
          <span class="go">Start simple →</span>
        </button>

        <button class="choice" (click)="advanced()">
          <span class="ico"><app-icon name="settings" sizeToken="lg" /></span>
          <span class="ct">Advanced</span>
          <span class="cd">
            Add reusable modules, per-option pricing and auto-accept rules. More power for
            established services.
          </span>
          <span class="go">Set up advanced →</span>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .wrap {
        max-width: 720px;
        margin: 0 auto;
      }
      .back {
        margin-bottom: 0.8rem;
      }
      h1 {
        margin-bottom: 0.2rem;
      }
      .choices {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-top: 1.2rem;
      }
      @media (max-width: 560px) {
        .choices {
          grid-template-columns: 1fr;
        }
      }
      .choice {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        text-align: left;
        padding: 1.4rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        cursor: pointer;
        font-family: inherit;
        transition: box-shadow var(--transition), transform var(--transition), border-color var(--transition);
      }
      .choice:hover {
        box-shadow: var(--shadow-md);
        transform: translateY(-2px);
        border-color: var(--color-primary-light);
      }
      .ico {
        color: var(--color-primary);
      }
      .ct {
        font-size: 1.1rem;
        font-weight: 700;
        color: var(--color-text);
      }
      .cd {
        font-size: 0.85rem;
        color: var(--color-muted);
        line-height: 1.45;
      }
      .go {
        margin-top: 0.3rem;
        font-size: 0.85rem;
        font-weight: 600;
        color: var(--color-primary);
      }
    `,
  ],
})
export class ListingCreateComponent {
  private router = inject(Router);

  simple(): void {
    this.router.navigate([routeFor('servicer.services.new.simple')]);
  }

  advanced(): void {
    this.router.navigate([routeFor('servicer.services.new.advanced')]);
  }

  cancel(): void {
    this.router.navigate([routeFor('servicer.services.listings')]);
  }
}
