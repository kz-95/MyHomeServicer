import { Component, OnInit, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService, Principal } from '../core/services/auth.service';

@Component({
  selector: 'app-auth-callback',
  standalone: true,
  template: `<p>Signing you in...</p>`,
  styles: [`
    :host { display: flex; justify-content: center; align-items: center; min-height: 100vh; color: var(--color-muted); }
  `],
})
export class AuthCallbackComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const userRaw = params.get('user');

    if (!accessToken || !refreshToken || !userRaw) {
      this.router.navigate(['/login'], { queryParams: { error: 'google_auth_failed' } });
      return;
    }

    try {
      const user = JSON.parse(decodeURIComponent(userRaw)) as Principal;
      this.auth.completeGoogleAuth({ accessToken, refreshToken, user });
      // `next` (e.g. servicer-intent sign-in) overrides the role-based landing.
      const next = params.get('next');
      if (next && next.startsWith('/')) {
        this.router.navigateByUrl(next);
        return;
      }
      const target = user.role === 'admin' ? '/admin' : user.role === 'servicer' ? '/servicer' : '/customer';
      this.router.navigate([target]);
    } catch {
      this.router.navigate(['/login'], { queryParams: { error: 'google_auth_failed' } });
    }
  }
}
