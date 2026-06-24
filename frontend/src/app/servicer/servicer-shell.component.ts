import { Component } from '@angular/core';
import { ShellComponent, NavItem } from '../shared/shell.component';
import { routeFor } from '../core/route-for';

@Component({
    selector: 'app-servicer-shell',
    imports: [ShellComponent],
    template: `<app-shell portalTitle="Servicer" [navItems]="nav" [narrow]="true" />`
})
export class ServicerShellComponent {
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
