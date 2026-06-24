import { Component } from '@angular/core';
import { ShellComponent, NavItem } from '../shared/shell.component';

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
  nav: NavItem[] = [
    { label: 'Find a Service', path: '/customer/findService', icon: 'search' },
    { label: 'My Quotes', path: '/customer/quotes', icon: 'clipboard-list' },
    { label: 'Upcoming', path: '/customer/bookings/upcoming', icon: 'calendar-clock' },
    { label: 'In Progress', path: '/customer/bookings/inProgress', icon: 'loader' },
    { label: 'History', path: '/customer/history', icon: 'archive' },
    { label: 'Payments', path: '/customer/transactions', icon: 'credit-card' },
    { label: 'Rewards', path: '/customer/rewards', icon: 'gift' },
    { label: 'Notifications', path: '/customer/notifications', icon: 'bell' },
    { label: 'Account', path: '/customer/account', icon: 'user' },
  ];
}
