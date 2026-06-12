import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent } from '../../shared/icon.component';

/**
 * SP-3 Phase 1: Advanced listing wizard placeholder. The real 3-step wizard
 * (modules + per-option pricing + auto-accept, spec §10.2) lands in Phase 2.
 */
@Component({
  selector: 'app-listing-advanced-stub',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="page-enter wrap">
      <button class="btn-ghost back" (click)="back()">← Back</button>
      <div class="card stub">
        <span class="ico"><app-icon name="settings" sizeToken="lg" /></span>
        <h1>Advanced listing — coming soon</h1>
        <p class="muted">
          The advanced wizard (reusable modules, per-option pricing and auto-accept rules) is in
          build. For now, create a <strong>Simple</strong> listing — you can upgrade it to advanced
          later from Edit.
        </p>
        <div class="acts">
          <button class="btn-primary" (click)="simple()">Create a Simple listing instead</button>
          <button class="btn-ghost" (click)="back()">Back to listings</button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .wrap {
        max-width: 560px;
        margin: 0 auto;
      }
      .back {
        margin-bottom: 0.8rem;
      }
      .stub {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.6rem;
        padding: 2rem 1.5rem;
      }
      .ico {
        color: var(--color-primary);
      }
      h1 {
        margin: 0;
      }
      .acts {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        justify-content: center;
        margin-top: 0.8rem;
      }
    `,
  ],
})
export class ListingAdvancedStubComponent {
  private router = inject(Router);

  simple(): void {
    this.router.navigate(['/servicer/services/new/simple']);
  }

  back(): void {
    this.router.navigate(['/servicer/services/listings']);
  }
}
