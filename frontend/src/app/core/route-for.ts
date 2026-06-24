/**
 * Typed path helper — replaces magic strings like '/customer/quotes' with
 * routeFor('customer.quotes').  Parameters are interpolated safely.
 *
 * Usage:
 *   routeFor('home')                          → '/'
 *   routeFor('servicer.jobs.detail', { id })  → '/servicer/jobs/abc-123'
 *   routeFor('public.services', { parentSlug: 'cleaning-service' })
 *                                             → '/services/cleaning-service'
 */
export type RouteKey =
  // Public / Auth
  | 'home'
  | 'login'
  | 'register'
  | 'register.servicer'
  | 'auth.callback'
  | 'auth.forgot'
  | 'auth.reset'
  | 'guest.quote.new'
  | 'terms'
  | 'public.services'
  // Customer
  | 'customer'
  | 'customer.findService'
  | 'customer.quote'
  | 'customer.quote.new'          // redirect
  | 'customer.quotes'
  | 'customer.quotes.proposals'
  | 'customer.bookings.upcoming'
  | 'customer.bookings.inProgress'
  | 'customer.history'
  | 'customer.rewards'
  | 'customer.account'
  | 'customer.transactions'
  | 'customer.notifications'
  | 'customer.notifications.settings'
  // Servicer
  | 'servicer'
  | 'servicer.jobs'
  | 'servicer.jobs.pending'
  | 'servicer.jobs.active'
  | 'servicer.jobs.history'
  | 'servicer.jobs.detail'
  | 'servicer.services'
  | 'servicer.services.listings'
  | 'servicer.services.modules'
  // SP-3 REDESIGN: old routes scrapped ('servicer.services.new' etc.)
  | 'servicer.promotions'
  | 'servicer.invoices'
  | 'servicer.deposit'
  | 'servicer.calendar'
  | 'servicer.account'
  | 'servicer.notifications'
  | 'servicer.notifications.settings'
  // Admin
  | 'admin'
  | 'admin.servicers'
  | 'admin.users'
  | 'admin.users.all'
  | 'admin.users.servicers'
  | 'admin.queues'
  | 'admin.settings'
  | 'admin.moneySettings'
  | 'admin.uiuxSettings'
  | 'admin.aiChatSettings'
  | 'admin.categorySettings'
  | 'admin.setup'
  | 'admin.apiKeys';

/**
 * Map of every application route path.  Parameterised routes use the `:param`
 * syntax and are substituted by {@link routeFor}.
 */
export const ROUTES: Record<RouteKey, string> = {
  // ── Public / Auth ──────────────────────────────────────────────────────
  home:                     '/',
  login:                    '/login',
  register:                 '/register',
  'register.servicer':      '/register/servicer',
  'auth.callback':          '/auth/callback',
  'auth.forgot':            '/auth/forgot',
  'auth.reset':             '/auth/reset',
  'guest.quote.new':        '/guest/quote/new',
  terms:                    '/terms',
  'public.services':        '/services/:parentSlug',

  // ── Customer ───────────────────────────────────────────────────────────
  customer:                           '/customer',
  'customer.findService':              '/customer/findService',
  'customer.quote':                    '/customer/quote',
  'customer.quote.new':                '/customer/quote/new',
  'customer.quotes':                   '/customer/quotes',
  'customer.quotes.proposals':         '/customer/quotes/:id/proposals',
  'customer.bookings.upcoming':        '/customer/bookings/upcoming',
  'customer.bookings.inProgress':      '/customer/bookings/inProgress',
  'customer.history':                  '/customer/history',
  'customer.rewards':                  '/customer/rewards',
  'customer.account':                  '/customer/account',
  'customer.transactions':             '/customer/transactions',
  'customer.notifications':            '/customer/notifications',
  'customer.notifications.settings':   '/customer/notification-settings',

  // ── Servicer ───────────────────────────────────────────────────────────
  servicer:                       '/servicer',
  'servicer.jobs':                '/servicer/jobs',
  'servicer.jobs.pending':        '/servicer/jobs/pending',
  'servicer.jobs.active':         '/servicer/jobs/active',
  'servicer.jobs.history':        '/servicer/jobs/history',
  'servicer.jobs.detail':         '/servicer/jobs/:id',
  'servicer.services':            '/servicer/services',
  'servicer.services.listings':   '/servicer/services/listings',
  'servicer.services.modules':    '/servicer/services/module',
  // SP-3 REDESIGN 2026-06-25: old create/edit routes scrapped.
  // TODO: new route for unified listing form.
  'servicer.promotions':          '/servicer/promotions',
  'servicer.invoices':            '/servicer/invoices',
  'servicer.deposit':             '/servicer/deposit',
  'servicer.calendar':            '/servicer/calendar',
  'servicer.account':             '/servicer/account',
  'servicer.notifications':       '/servicer/notifications',
  'servicer.notifications.settings':'/servicer/notification-settings',

  // ── Admin ──────────────────────────────────────────────────────────────
  admin:                '/admin',
  'admin.servicers':    '/admin/servicers',
  'admin.users':        '/admin/users',
  'admin.users.all':    '/admin/users/all',
  'admin.users.servicers':'/admin/users/servicers',
  'admin.queues':       '/admin/queues',
  'admin.settings':     '/admin/settings',
  'admin.moneySettings':'/admin/money-settings',
  'admin.uiuxSettings': '/admin/uiux-settings',
  'admin.aiChatSettings':'/admin/ai-chat-settings',
  'admin.categorySettings':'/admin/category-settings',
  'admin.setup':        '/admin/setup',
  'admin.apiKeys':      '/admin/settings/api-keys',
};

/** Parameter bag for routes that contain `:param` segments. */
export type RouteParams = Record<string, string | number>;

/**
 * Resolve a typed route key to its concrete path.
 *
 * Parameter routes (e.g. `servicer.jobs.detail`) require an `:id` param:
 *   routeFor('servicer.jobs.detail', { id: 'abc' }) → '/servicer/jobs/abc'
 *   routeFor('public.services', { parentSlug: 'plumbing' })  → '/services/plumbing'
 */
export function routeFor(key: RouteKey, params?: RouteParams): string {
  let path = ROUTES[key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      path = path.replace(`:${k}`, String(v));
    }
  }
  return path;
}
