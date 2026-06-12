import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconComponent } from './icon.component';
import type { NavItem } from './shell.component';

@Component({
    selector: 'app-shell-nav',
    imports: [RouterLink, RouterLinkActive, IconComponent],
    template: `
    <aside class="sidebar">
      <nav>
        @for (item of navItems; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: !!item.exact }"
          >
            @if (item.icon) {
              <span class="nav-ic"><app-icon [name]="item.icon" sizeToken="sm" /></span>
            }
            <span class="nav-label">{{ item.label }}</span></a
          >
        }
      </nav>
    </aside>
  `,
    styles: [`
    /* §15.4 - the host is the flex item of .body; it must stretch to the full
       body height AND be a flex column so .sidebar can fill it. Without this the
       sidebar collapses to its content height and stops short of the viewport. */
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .sidebar {
      width: 220px;
      flex: 1;                /* fill the host's full (viewport) height */
      background: var(--color-surface);
      border-right: 1px solid var(--color-border);
      padding: 1rem 0.75rem;
      border-radius: 0 var(--radius) var(--radius) 0;
      /* §15.4 - flex column so nav can scroll internally; no fixed height */
      display: flex;
      flex-direction: column;
      min-height: 0;
    }
    .sidebar nav {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      /* §15.4 - nav links scroll inside sidebar; page never scrolls for sidebar */
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }
    .sidebar a {
      padding: 0.55rem 0.8rem;
      border-radius: var(--radius);
      color: var(--color-text);
      font-size: 0.92rem;
      font-weight: 500;
      transition:
        background 0.15s ease,
        color 0.15s ease,
        transform 0.12s ease;
      display: block;
    }
    .sidebar a:hover {
      background: var(--color-bg);
      transform: translateX(2px);
    }
    .sidebar a.active {
      background: var(--color-primary);
      background: var(--gradient-sidebar);
      color: #fff;
      transform: none;
      box-shadow: 0 1px 6px rgba(201, 90, 60, 0.2);
    }
    .nav-ic {
      margin-right: 0.5rem;
      display: inline-flex;
      align-items: center;
    }
    @media (max-width: 1024px) and (min-width: 761px) {
      .sidebar { width: 180px; }
    }
    @media (max-width: 760px) {
      .sidebar {
        width: 100%;
        flex: none;            /* mobile: short horizontal row, don't grow tall */
        border-right: none;
        border-bottom: 1px solid var(--color-border);
        padding: 0.4rem 0.5rem;
      }
      .sidebar nav {
        flex-direction: row;
        overflow-x: auto;
        gap: 0.3rem;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      .sidebar nav::-webkit-scrollbar { display: none; }
      .sidebar a {
        white-space: nowrap;
        padding: 0.45rem 0.75rem;
        font-size: 0.85rem;
        transform: none !important;
      }
      .sidebar a:hover { transform: none !important; }
      .nav-label { display: none; }
      .nav-ic { margin-right: 0; }
    }
  `]
})
export class ShellNavComponent {
  @Input({ required: true }) navItems: NavItem[] = [];
}
