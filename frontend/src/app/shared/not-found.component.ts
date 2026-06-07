import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * 404 Not Found page - shown for any URL that doesn't match a known route.
 * Provides a clear message and a link back to the home page.
 */
@Component({
    selector: 'app-not-found',
    imports: [RouterLink],
    template: `
    <div class="wrap">
      <div class="card panel">
        <span class="code">404</span>
        <h1>Page not found</h1>
        <p class="muted">
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <a routerLink="/" class="btn-primary">← Back to home</a>
      </div>
    </div>
  `,
    styles: [
        `
      .wrap {
        min-height: 100dvh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem 1rem;
        background: var(--color-bg);
      }
      .panel {
        text-align: center;
        max-width: 420px;
        width: 100%;
        padding: 3rem 2rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.8rem;
      }
      .code {
        font-size: 4rem;
        font-weight: 800;
        line-height: 1;
        color: var(--color-primary);
        letter-spacing: -0.04em;
      }
      h1 {
        margin: 0;
        font-size: 1.5rem;
      }
      p {
        margin: 0;
        max-width: 300px;
        line-height: 1.5;
      }
      a.btn-primary {
        margin-top: 0.5rem;
        text-decoration: none;
      }
    `,
    ]
})
export class NotFoundComponent {}
