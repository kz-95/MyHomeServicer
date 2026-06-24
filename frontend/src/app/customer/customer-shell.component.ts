import { Component } from '@angular/core';
import { ShellComponent, NavItem } from '../shared/shell.component';
import { routeFor } from '../core/route-for';

/**
 * Maps logical nav-icon names to Lucide icon names for <app-icon>.
 * shell.component.ts renders each NavItem.icon via <app-icon [name]="item.icon" />.
 */
@Component({
    selector: 'app-customer-shell',
    imports: [ShellComponent],
    template: `<app-shell portalTitle="Customer" [navItems]="nav" />`
})
export class CustomerShellComponent {
  protected readonly routeFor = routeFor;

  nav: NavItem[] = [
    { label: 'Find a Service', path: routeFor('customer.findService'), icon: 'search' },
    { label: 'My Quotes', path: routeFor('customer.quotes'), icon: 'clipboard-list' },
    { label: 'Upcoming', path: routeFor('customer.bookings.upcoming'), icon: 'calendar' },
    { label: 'History', path: routeFor('customer.history'), icon: 'archive' },
    { label: 'Payments', path: routeFor('customer.transactions'), icon: 'credit-card' },
    { label: 'Rewards', path: routeFor('customer.rewards'), icon: 'gift' },
    { label: 'Notifications', path: routeFor('customer.notifications'), icon: 'bell' },
    { label: 'Account', path: routeFor('customer.account'), icon: 'user' },
  ];
}
