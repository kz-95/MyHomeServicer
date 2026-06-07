import { Component } from '@angular/core';
import { ShellComponent, NavItem } from '../shared/shell.component';

@Component({
    selector: 'app-servicer-shell',
    imports: [ShellComponent],
    template: `<app-shell portalTitle="Servicer" [navItems]="nav" />`
})
export class ServicerShellComponent {
  nav: NavItem[] = [
    { label: 'Dashboard', path: '/servicer', icon: 'bar-chart', exact: true },
    { label: 'My Jobs', path: '/servicer/jobs', icon: 'toolbox' },
    { label: 'Calendar', path: '/servicer/calendar', icon: 'calendar' },
    { label: 'Service Listings', path: '/servicer/services', icon: 'clipboard-list' },
    { label: 'Promotions', path: '/servicer/promotions', icon: 'tag' },
    { label: 'Deposit', path: '/servicer/deposit', icon: 'credit-card' },
    { label: 'Account', path: '/servicer/account', icon: 'settings' },
    { label: 'Notifications', path: '/servicer/notifications', icon: 'bell' },
  ];
}
