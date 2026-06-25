import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

/**
 * SP-3: Service-listings shell - two tabs (Listings · Modules) rendered as URL
 * segments (`/servicer/services/listings`, `/servicer/services/module`),
 * mirroring the servicer Jobs tabs. Each tab is its own lazy component.
 */
@Component({
  selector: 'app-servicer-services',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page-enter">
      <div class="tabs">
        <a class="tab" routerLink="module" routerLinkActive="active">Modules</a>
        <a class="tab" routerLink="listings" routerLinkActive="active">Listings</a>
      </div>
      <router-outlet />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .tabs {
        display: flex;
        justify-content: center;
        gap: 0;
        border-bottom: 2px solid var(--color-border);
        margin-bottom: 1rem;
      }
      .tab {
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        margin-bottom: -2px;
        padding: 0.6rem 1.2rem;
        font-size: 0.92rem;
        font-weight: 500;
        color: var(--color-muted);
        cursor: pointer;
        text-decoration: none;
        transition: color var(--transition-fast), border-color var(--transition-fast);
      }
      .tab:hover {
        color: var(--color-text);
      }
      .tab.active {
        color: var(--color-primary);
        border-bottom-color: var(--color-primary);
        font-weight: 600;
      }
    `,
  ],
})
export class ServicerServicesComponent {}
