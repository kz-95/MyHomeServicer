import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { PinService } from '../services/pin.service';

/**
 * Route guards. Each portal requires a logged-in principal of the matching
 * role; unauthorised visitors are redirected to the login page.
 *
 * DEMO-ONLY action-PIN gate: for demo accounts (`principal.isDemo`) the route
 * does NOT activate (and its lazy bundle does NOT load) until the PIN is
 * verified against the backend. It runs BEFORE entry - a cancelled/failed PIN
 * bounces to home, so the demo portal can't be reached directly without the
 * PIN. Real (non-demo) users skip the gate entirely.
 */
function guardForRole(required: 'customer' | 'servicer' | 'admin'): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const principal = auth.principal();
    // No stored principal or no access token = no viable session.
    // A stale hs_user with a dead/deleted token must not bypass the guard.
    if (!principal || !auth.accessToken) {
      return router.createUrlTree(['/login']);
    }
    if (principal.role !== required) {
      // Logged in but wrong portal - send them to their own.
      return router.createUrlTree([`/${principal.role}`]);
    }
    // Demo-bar login gate. Applies ONLY to sessions created via the demo-bar
    // quick-login (auth.requiresDemoGate()), NOT to a real email+password login
    // of the same demo account. requireGatePin() opens the PIN dialog and
    // resolves with the backend-verified demo gate PIN (POST /config/demo-gate,
    // fixed 5201314 - distinct from the action PIN), or null on cancel. It is
    // NEVER cached, so every entry into a restricted portal re-validates. The
    // route does not activate (and its lazy bundle is not loaded) until the PIN
    // is confirmed.
    //
    // On cancel we LOG OUT before bouncing home: the demo-bar session was
    // already issued before the gate, so without this the user is left logged
    // in and home's "redirect logged-in users to their portal" sends them
    // straight back into the gate - an infinite loop.
    if (auth.requiresDemoGate()) {
      const pin = inject(PinService);
      return pin.requireGatePin().pipe(
        map((p) => {
          if (p) return true;
          void auth.logout();
          return router.createUrlTree(['/']);
        }),
      );
    }
    return true;
  };
}

export const customerGuard = guardForRole('customer');
export const servicerGuard = guardForRole('servicer');
export const adminGuard = guardForRole('admin');

/**
 * Admin action-PIN VIEW guard for sensitive admin pages (Accounts = /admin/users,
 * Review Queues = /admin/queues). Prompts for the admin action PIN (`1234`, via
 * POST /admin/verify-pin) before the page activates. This is the per-account
 * action PIN - distinct from the demo login gate (`5201314`). `clear()` first so
 * opening either tab always re-prompts; cancel bounces to the admin dashboard.
 * Applies to all admins (demo and real).
 */
export const adminActionPinGuard: CanActivateFn = () => {
  const router = inject(Router);
  const pin = inject(PinService);
  pin.clear();
  return pin.requirePin().pipe(map((p) => (p ? true : router.createUrlTree(['/admin']))));
};
