import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface FooterLink {
  label: string;
  path: string;
}

interface FooterSection {
  heading: string;
  links: FooterLink[];
}

@Component({
  selector: 'app-site-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="sf">
      <div class="sf-inner">
        <div class="sf-cols">
          @for (section of sections; track section.heading) {
            <div class="sf-col">
              <strong class="sf-h">{{ section.heading }}</strong>
              <nav class="sf-nav">
                @for (link of section.links; track link.label) {
                  <a class="sf-link" [routerLink]="link.path">{{ link.label }}</a>
                }
              </nav>
            </div>
          }
        </div>

        <div class="sf-meta">
          <span class="sf-copy">&copy; {{ year }} <a class="sf-github" href="https://github.com/AllergicToAnything" target="_blank" rel="noopener noreferrer">AllergicToAnything</a>. All rights reserved.</span>
          <span class="sf-brand">My Home Servicer</span>
        </div>
      </div>
    </footer>
  `,
  styles: [`
    :host {
      display: block;
    }
    /* §7.17: ≥300px clear band above the footer on every page. Do not shrink/zero per-page. */
    .sf {
      margin-top: 300px;
      background: var(--color-surface);
      border-top: 1px solid var(--color-border);
      color: var(--color-text);
    }
    .sf-inner {
      max-width: var(--content-max, 1200px);
      margin: 0 auto;
      padding: 2.5rem 1.5rem 0;
    }
    .sf-cols {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 2rem;
    }
    .sf-h {
      display: block;
      font-size: 0.82rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-muted);
      margin-bottom: 0.75rem;
    }
    .sf-nav {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }
    .sf-link {
      font-size: 0.9rem;
      color: var(--color-text);
      text-decoration: none;
      transition: color var(--transition, 0.15s);
    }
    .sf-link:hover {
      color: var(--color-primary);
    }
    .sf-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1.75rem 0 1.25rem;
      margin-top: 1.5rem;
      border-top: 1px solid var(--color-border);
      font-size: 0.82rem;
      color: var(--color-muted);
    }
    .sf-github {
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 2px;
      text-decoration-color: var(--color-border);
    }
    .sf-github:hover {
      color: var(--color-primary);
      text-decoration-color: currentColor;
    }
    .sf-brand {
      font-family: var(--font-display);
    }
    @media (max-width: 560px) {
      .sf-inner {
        padding: 1.5rem 1rem 0;
      }
      .sf-cols {
        grid-template-columns: 1fr 1fr;
        gap: 1.25rem;
      }
      .sf-meta {
        flex-direction: column;
        text-align: center;
        gap: 0.25rem;
      }
    }
  `],
})
export class SiteFooterComponent {
  readonly year = new Date().getFullYear();

  // Service columns mirror the seed category taxonomy (7 parents + their
  // children in backend/prisma/seed/data/static.ts). Each child links to its
  // parent browse page `/services/:parentSlug` (ChildrenBrowseComponent) - the
  // only public category route; there is no per-child page.
  readonly sections: FooterSection[] = [
    {
      heading: 'Cleaning',
      links: [
        { label: 'Home Cleaning', path: '/services/cleaning-service' },
        { label: 'Sofa / Mattress Cleaning', path: '/services/cleaning-service' },
        { label: 'Carpet Cleaning', path: '/services/cleaning-service' },
        { label: 'Curtain Cleaning', path: '/services/cleaning-service' },
      ],
    },
    {
      heading: 'Repair',
      links: [
        { label: 'Washing Machine & Dryer', path: '/services/appliance-repair' },
        { label: 'Refrigerator Repair', path: '/services/appliance-repair' },
        { label: 'TV Repair', path: '/services/appliance-repair' },
        { label: 'Oven Repair', path: '/services/appliance-repair' },
        { label: 'Water Heater Repair', path: '/services/appliance-repair' },
        { label: 'Ceiling Fan Repair', path: '/services/appliance-repair' },
        { label: 'Aircond Repair', path: '/services/appliance-repair' },
      ],
    },
    {
      heading: 'Event',
      links: [
        { label: 'Event Planner', path: '/services/events-weddings' },
        { label: 'Catering Service', path: '/services/events-weddings' },
      ],
    },
    {
      heading: 'Improvement',
      links: [
        { label: 'Professional Organizer', path: '/services/home-improvement' },
        { label: 'Aircond Installer', path: '/services/home-improvement' },
        { label: 'Carpenter', path: '/services/home-improvement' },
        { label: 'Renovation', path: '/services/home-improvement' },
        { label: 'Interior Design', path: '/services/home-improvement' },
        { label: 'Door Gate', path: '/services/home-improvement' },
        { label: 'Roof', path: '/services/home-improvement' },
      ],
    },
    {
      heading: 'Maintenance',
      links: [
        { label: 'Aircond Servicer', path: '/services/home-maintenance' },
        { label: 'Plumber', path: '/services/home-maintenance' },
        { label: 'Electrical & Wiring', path: '/services/home-maintenance' },
      ],
    },
    {
      heading: 'Training',
      links: [
        { label: 'Art Class', path: '/services/training-classes' },
        { label: 'Language Class', path: '/services/training-classes' },
        { label: 'Music Class', path: '/services/training-classes' },
        { label: 'Home Tutoring', path: '/services/training-classes' },
        { label: 'Cooking Class', path: '/services/training-classes' },
        { label: 'Private Gym Trainer', path: '/services/training-classes' },
        { label: '3D Modeling Class', path: '/services/training-classes' },
      ],
    },
    {
      heading: 'Tech & IT',
      links: [
        { label: 'Alarm & CCTV Services', path: '/services/tech-it' },
      ],
    },
    {
      heading: 'Company',
      links: [
        { label: 'Home', path: '/' },
        { label: 'Join as Servicer', path: '/register/servicer' },
      ],
    },
    {
      heading: 'Support',
      links: [
        { label: 'Contact Us', path: '/' },
        { label: 'Help Center', path: '/' },
      ],
    },
    {
      heading: 'Legal',
      links: [
        { label: 'Terms & Conditions', path: '/terms' },
        { label: 'Privacy Policy', path: '/' },
      ],
    },
  ];
}
