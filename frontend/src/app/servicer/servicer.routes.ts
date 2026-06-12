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
      // SP-3: create flow — chooser → Simple (full) / Advanced (stub). Most
      // specific paths first so the `services` tab shell doesn't swallow them.
      {
        path: 'services/new/simple',
        loadComponent: () =>
          import('./pages/listing-simple.component').then((m) => m.ListingSimpleComponent),
      },
      {
        path: 'services/new/advanced',
        loadComponent: () =>
          import('./pages/listing-advanced-stub.component').then(
            (m) => m.ListingAdvancedStubComponent,
          ),
      },
      {
        path: 'services/new',
        loadComponent: () =>
          import('./pages/listing-create.component').then((m) => m.ListingCreateComponent),
      },
      {
        // Existing 4-step wizard kept for editing legacy listings until the
        // SP-3 Advanced wizard lands in Phase 2.
        path: 'services/:id/edit',
        loadComponent: () =>
          import('./pages/listing-wizard.component').then((m) => m.ListingWizardComponent),
      },
      {
        // SP-3: /servicer/services → 2 tabs (listings · module), jobs-tabs style.
        path: 'services',
        loadComponent: () =>
          import('./pages/services.component').then((m) => m.ServicerServicesComponent),
        children: [
          { path: '', redirectTo: 'listings', pathMatch: 'full' },
          {
            path: 'listings',
            loadComponent: () =>
              import('./pages/services-listings.component').then(
                (m) => m.ServicerListingsComponent,
              ),
          },
          {
            path: 'module',
            loadComponent: () =>
              import('./pages/services-modules.component').then(
                (m) => m.ServicerModulesComponent,
              ),
          },
        ],
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
