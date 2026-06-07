import { Routes } from '@angular/router';
import { customerGuard, servicerGuard, adminGuard } from './core/guards/auth.guards';
// Eagerly imported so the tiny component is always available without a chunk split.
import { NotFoundComponent } from './shared/not-found.component';
// Eager (not lazy): public deep route /services/:parentSlug is direct-loadable;
// a lazy chunk for it resolves relative to the deep URL on Cloudflare and 404s →
// text/html → MIME boot failure. Bundling it into main avoids the extra chunk.
import { ChildrenBrowseComponent } from './public/children-browse.component';

/**
 * Root routes. Each portal is lazy-loaded and protected by a role guard so
 * the admin bundle is never shipped to customer or merchant sessions
 * (tech-stack.md §Frontend).
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./auth/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
  {
    path: 'register/servicer',
    loadComponent: () =>
      import('./auth/merchant-register.component').then((m) => m.MerchantRegisterComponent),
  },
  {
    path: 'guest/quote/new',
    loadComponent: () =>
      import('./guest/guest-quote.component').then((m) => m.GuestQuoteComponent),
  },
  {
    path: 'customer',
    canActivate: [customerGuard],
    loadChildren: () => import('./customer/customer.routes').then((m) => m.customerRoutes),
  },
  {
    path: 'servicer',
    canActivate: [servicerGuard],
    loadChildren: () => import('./servicer/servicer.routes').then((m) => m.servicerRoutes),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('./admin/admin.routes').then((m) => m.adminRoutes),
  },
  {
    path: 'services/:parentSlug',
    component: ChildrenBrowseComponent,
  },
  { path: 'auth/forgot', loadComponent: () => import('./auth/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  { path: 'auth/reset', loadComponent: () => import('./auth/reset-password.component').then(m => m.ResetPasswordComponent) },
  { path: 'terms', loadComponent: () => import('./public/terms.component').then(m => m.TermsComponent) },
  { path: '**', component: NotFoundComponent },
];
