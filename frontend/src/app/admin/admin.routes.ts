import { Routes } from '@angular/router';
import { AdminShellComponent } from './admin-shell.component';
import { adminActionPinGuard } from '../core/guards/auth.guards';

/**
 * Admin portal routes. Lazy-loaded so the admin bundle never ships to
 * customer or servicer sessions. Phase 1 ships the shell + Dashboard;
 * Phase 4 adds the management pages.
 */
export const adminRoutes: Routes = [
  {
    path: '',
    component: AdminShellComponent,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'servicers',
        loadComponent: () =>
          import('./pages/servicers.component').then((m) => m.AdminServicersComponent),
      },
      {
        path: 'users',
        canActivate: [adminActionPinGuard],
        loadComponent: () => import('./pages/users.component').then((m) => m.AdminUsersComponent),
      },
      {
        path: 'users/all',
        canActivate: [adminActionPinGuard],
        loadComponent: () => import('./pages/users.component').then((m) => m.AdminUsersComponent),
      },
      {
        path: 'users/servicers',
        canActivate: [adminActionPinGuard],
        loadComponent: () => import('./pages/users.component').then((m) => m.AdminUsersComponent),
      },
      {
        path: 'queues',
        canActivate: [adminActionPinGuard],
        loadComponent: () =>
          import('./pages/queues.component').then((m) => m.AdminQueuesComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings.component').then((m) => m.AdminSettingsComponent),
      },
      {
        path: 'money-settings',
        loadComponent: () =>
          import('./pages/money-settings.component').then((m) => m.AdminMoneySettingsComponent),
      },
      {
        path: 'uiux-settings',
        loadComponent: () =>
          import('./pages/uiux-settings.component').then((m) => m.AdminUiuxSettingsComponent),
      },
      {
        path: 'ai-chat-settings',
        loadComponent: () =>
          import('./pages/ai-chat-settings.component').then((m) => m.AdminAiChatSettingsComponent),
      },
      {
        path: 'category-settings',
        loadComponent: () =>
          import('./pages/category-settings.component').then((m) => m.AdminCategorySettingsComponent),
      },
      {
        path: 'setup',
        loadComponent: () =>
          import('./pages/setup-wizard.component').then((m) => m.SetupWizardComponent),
      },
      {
        path: 'onboarding',
        loadComponent: () =>
          import('./pages/onboarding-wizard/onboarding-wizard.component').then((m) => m.OnboardingWizardComponent),
      },
      {
        path: 'settings/api-keys',
        canActivate: [adminActionPinGuard],
        loadComponent: () =>
          import('./pages/api-keys.component').then((m) => m.ApiKeysComponent),
      },
    ],
  },
];
