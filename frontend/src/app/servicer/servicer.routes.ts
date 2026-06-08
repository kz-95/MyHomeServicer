import { Routes } from '@angular/router';
import { ServicerShellComponent } from './servicer-shell.component';

export const servicerRoutes: Routes = [
  {
    path: '',
    component: ServicerShellComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/dashboard.component').then((m) => m.ServicerDashboardComponent),
      },
      {
        path: 'jobs',
        children: [
          { path: '', redirectTo: 'pending', pathMatch: 'full' },
          {
            path: 'pending',
            loadComponent: () =>
              import('./pages/jobs.component').then((m) => m.ServicerJobsComponent),
            data: { tab: 'pending' },
          },
          {
            path: 'active',
            loadComponent: () =>
              import('./pages/jobs.component').then((m) => m.ServicerJobsComponent),
            data: { tab: 'active' },
          },
          {
            path: 'history',
            loadComponent: () =>
              import('./pages/jobs.component').then((m) => m.ServicerJobsComponent),
            data: { tab: 'history' },
          },
          // Deep link from calendar / notifications: open the dispatch overlay
          // for a single active job. (history/:id detail page is Phase 5.)
          {
            path: ':id',
            loadComponent: () =>
              import('./pages/jobs.component').then((m) => m.ServicerJobsComponent),
            data: { tab: 'active', detail: true },
          },
        ],
      },
      {
        path: 'services',
        loadComponent: () =>
          import('./pages/services.component').then((m) => m.ServicerServicesComponent),
      },
      {
        path: 'services/new',
        loadComponent: () =>
          import('./pages/listing-wizard.component').then((m) => m.ListingWizardComponent),
      },
      {
        path: 'services/:id/edit',
        loadComponent: () =>
          import('./pages/listing-wizard.component').then((m) => m.ListingWizardComponent),
      },
      {
        path: 'promotions',
        loadComponent: () =>
          import('./pages/promotions.component').then((m) => m.ServicerPromotionsComponent),
      },
      {
        path: 'invoices',
        loadComponent: () =>
          import('./pages/invoices.component').then((m) => m.ServicerInvoicesComponent),
      },
      {
        path: 'deposit',
        loadComponent: () =>
          import('./pages/deposit.component').then((m) => m.ServicerDepositComponent),
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./pages/calendar.component').then((m) => m.ServicerCalendarComponent),
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./pages/account.component').then((m) => m.ServicerAccountComponent),
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
