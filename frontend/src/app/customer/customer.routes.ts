import { Routes } from '@angular/router';
import { CustomerShellComponent } from './customer-shell.component';

/**
 * Customer portal routes.
 *
 * Route tree (2026-06-23 restructure):
 *   findService                     → Browse (portal landing)
 *   ''                              → redirect to findService
 *   quote                           → quote form
 *   quote/new                       → redirect to quote (old-path safety)
 *   quotes                          → my-quotes
 *   quotes/:id/proposals            → proposals
 *   bookings/upcoming               → MyBookings (pending + confirmed)
 *   bookings/inProgress             → MyBookings (in_progress)
 *   bookings                        → redirect to bookings/upcoming
 *   history                         → MyBookings (completed + cancelled; "Rebook this servicer")
 *   history/pending                 → redirect to bookings/upcoming (old-path safety)
 *   history/inProgress              → redirect to bookings/inProgress (old-path safety)
 *   transactions / rewards / notifications / account / notification-settings
 */
export const customerRoutes: Routes = [
  {
    path: '',
    component: CustomerShellComponent,
    children: [
      {
        path: '',
        redirectTo: 'findService',
        pathMatch: 'full',
      },
      {
        path: 'findService',
        loadComponent: () => import('./pages/browse.component').then((m) => m.BrowseComponent),
      },
      {
        path: 'quote',
        loadComponent: () =>
          import('./pages/quote-form.component').then((m) => m.QuoteFormComponent),
      },
      {
        path: 'quote/new',
        redirectTo: 'quote',
        pathMatch: 'full',
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
          { path: '', redirectTo: 'upcoming', pathMatch: 'full' },
          {
            path: 'upcoming',
            loadComponent: () =>
              import('./pages/my-bookings.component').then((m) => m.MyBookingsComponent),
          },
          {
            path: 'inProgress',
            loadComponent: () =>
              import('./pages/my-bookings.component').then((m) => m.MyBookingsComponent),
          },
        ],
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./pages/my-bookings.component').then((m) => m.MyBookingsComponent),
      },
      {
        path: 'history/pending',
        redirectTo: 'bookings/upcoming',
        pathMatch: 'full',
      },
      {
        path: 'history/inProgress',
        redirectTo: 'bookings/inProgress',
        pathMatch: 'full',
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
