import { Routes } from '@angular/router';
import { CustomerShellComponent } from './customer-shell.component';

/**
 * Customer portal routes. Phase 1: shell + Browse. Phase 2: quote form,
 * my-quotes, proposals. Phases 3-4 add bookings, history, chat.
 */
export const customerRoutes: Routes = [
  {
    path: '',
    component: CustomerShellComponent,
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/browse.component').then((m) => m.BrowseComponent),
      },
      {
        path: 'quote/new',
        loadComponent: () =>
          import('./pages/quote-form.component').then((m) => m.QuoteFormComponent),
      },
      {
        path: 'quotes',
        loadComponent: () =>
          import('./pages/my-quotes.component').then((m) => m.MyQuotesComponent),
      },
      {
        path: 'quotes/:id/proposals',
        loadComponent: () =>
          import('./pages/proposals.component').then((m) => m.ProposalsComponent),
      },
      {
        path: 'bookings',
        children: [
          { path: '', redirectTo: 'pending', pathMatch: 'full' },
          {
            path: 'pending',
            loadComponent: () =>
              import('./pages/my-bookings.component').then((m) => m.MyBookingsComponent),
          },
          {
            path: 'inProgress',
            loadComponent: () =>
              import('./pages/my-bookings.component').then((m) => m.MyBookingsComponent),
          },
          {
            path: 'history',
            loadComponent: () =>
              import('./pages/my-bookings.component').then((m) => m.MyBookingsComponent),
          },
        ],
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./pages/order-history.component').then((m) => m.OrderHistoryComponent),
      },
      {
        path: 'rewards',
        loadComponent: () => import('./pages/rewards.component').then((m) => m.RewardsComponent),
      },
      {
        path: 'account',
        loadComponent: () => import('./pages/account.component').then((m) => m.AccountComponent),
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./pages/transactions.component').then((m) => m.TransactionsComponent),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('../shared/notifications.component').then((m) => m.NotificationsComponent),
      },
      {
        path: 'notification-settings',
        loadComponent: () =>
          import('../shared/notification-settings.component').then(
            (m) => m.NotificationSettingsComponent,
          ),
      },
    ],
  },
];
