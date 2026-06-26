import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { ShellComponent, NavItem } from '../shared/shell.component';
import { routeFor } from '../core/route-for';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
    selector: 'app-servicer-shell',
    imports: [ShellComponent],
    template: `<app-shell portalTitle="Servicer" [navItems]="nav" [narrow]="narrow()" />`
})
export class ServicerShellComponent implements OnInit {
  protected readonly routeFor = routeFor;
  private readonly router = inject(Router);
  private readonly urlSig = signal('');

  /** Dashboard (900px) + Jobs (900px) + Calendar (1200px) get full-width; all other pages are narrow (720px). */
  readonly narrow = computed(() => {
    const url = this.urlSig();
    return url !== routeFor('servicer')
      && url !== routeFor('servicer.calendar')
      && !url.startsWith(routeFor('servicer.jobs'));
  });

  ngOnInit(): void {
    this.urlSig.set(this.router.url.split('?')[0]);
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.urlSig.set(this.router.url.split('?')[0]));
  }

  nav: NavItem[] = [
    { label: 'Dashboard', path: routeFor('servicer'), icon: 'bar-chart', exact: true },
    { label: 'My Jobs', path: routeFor('servicer.jobs'), icon: 'toolbox' },
    { label: 'Calendar', path: routeFor('servicer.calendar'), icon: 'calendar' },
    { label: 'Service Listings', path: routeFor('servicer.services'), icon: 'clipboard-list' },
    { label: 'Promotions', path: routeFor('servicer.promotions'), icon: 'tag' },
    { label: 'Deposit', path: routeFor('servicer.deposit'), icon: 'credit-card' },
    { label: 'Account', path: routeFor('servicer.account'), icon: 'settings' },
    { label: 'Notifications', path: routeFor('servicer.notifications'), icon: 'bell' },
  ];
}
