import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";

@Component({
  selector: "app-admin-footer",
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="af">
      <div class="af-inner">
        <span class="af-brand">MyServicer Admin</span>
        <nav class="af-links">
          <a routerLink="/">Home</a>
          <a routerLink="/admin">Dashboard</a>
          <a routerLink="/admin/settings">Settings</a>
        </nav>
        <span class="af-copy">&copy; {{ year }} MyServicer. All rights reserved.</span>
      </div>
    </footer>
  `,
  styles: [
    `
    .af { margin-top: 3rem; border-top: 1px solid var(--color-border); background: var(--color-surface); }
    .af-inner { max-width: 1200px; margin: 0 auto; padding: 1rem 1.25rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; color: var(--color-muted); flex-wrap: wrap; gap: 0.5rem; }
    .af-brand { font-weight: 600; }
    .af-links { display: flex; gap: 1rem; }
    .af-links a { color: var(--color-muted); text-decoration: none; transition: color 0.15s ease; }
    .af-links a:hover { color: var(--color-primary); }
    @media (max-width: 500px) { .af-inner { flex-direction: column; gap: 0.3rem; text-align: center; } .af-links { justify-content: center; } }
  `,
  ],
})
export class AdminFooterComponent {
  year = new Date().getFullYear();
}
