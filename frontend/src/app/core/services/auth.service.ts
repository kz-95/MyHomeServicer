import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, finalize, firstValueFrom, map, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PinService } from './pin.service';

export interface Principal {
  id: string;
  email: string;
  name?: string;
  role: 'customer' | 'admin' | 'servicer';
  creditBalance?: number;
  depositBalance?: number;
  isOnline?: boolean;
  isDemo?: boolean;
}

interface AuthResponse {
  user: Principal;
  accessToken: string;
  refreshToken: string;
}

/** A stashed session - used to hold the servicer session during customer mode. */
interface StashedSession {
  access: string;
  refresh: string;
  user: Principal;
}

const ACCESS_KEY = 'hs_access';
const REFRESH_KEY = 'hs_refresh';
const USER_KEY = 'hs_user';
const STASH_KEY = 'hs_servicer_stash';
const GUEST_KEY = 'hs_guest';
/**
 * Marks a session that was created via the demo-bar quick-login (passwordless
 * `/dev/demo-login`). ONLY these sessions are gated by the shared demo PIN
 * (5201314); a real email+password login of the same demo account is not.
 */
const DEMO_GATE_KEY = 'hs_demo_gate';

export interface GuestQuoteData {
  categoryId?: string;
  contactName?: string;
  contactNumber?: string;
  notes?: string;
  address?: string;
  addressNo?: string;
  streetDetails?: string;
  postcode?: string;
  district?: string;
  state?: string;
  propertyType?: string;
  timeSlot?: string;
  preferredDate?: string;
  budgetIndex?: string;
  paymentMode?: string;
  savedAt?: string;
}

/**
 * Frontend auth service. Holds the JWT pair and current principal. Tokens
 * live in localStorage so a session survives a refresh; no secrets are ever
 * embedded in the bundle (security-notes.md §3 Layer 1).
 *
 * Servicer accounts additionally support "customer mode": the servicer
 * session is stashed and a customer-scoped session takes over, so a servicer
 * can browse and request quotes as a customer. A topbar toggle swaps back.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private pin = inject(PinService);
  private base = environment.apiBase;

  private principalSig = signal<Principal | null>(this.readStoredUser());
  readonly principal = this.principalSig.asReadonly();
  readonly isLoggedIn = computed(() => this.principalSig() !== null);

  /**
   * False until the startup session check (verifySession) has finished. The app
   * blocks on it via APP_INITIALIZER, so by first paint it is always true and
   * the stored principal has been confirmed against the backend (or cleared).
   */
  private authReadySig = signal(false);
  readonly authReady = this.authReadySig.asReadonly();

  /** The servicer session held aside while the servicer is in customer mode. */
  private stashSig = signal<StashedSession | null>(this.readStash());

  /** True when the signed-in account is a servicer (in either mode). */
  readonly isServicerAccount = computed(
    () => this.principalSig()?.role === 'servicer' || this.stashSig() !== null,
  );

  /**
   * Current portal mode for a servicer account: 'servicer' or 'customer'.
   * Returns null for plain customer / admin accounts.
   */
  readonly mode = computed<'servicer' | 'customer' | null>(() => {
    if (this.principalSig()?.role === 'servicer') return 'servicer';
    if (this.stashSig() !== null) return 'customer';
    return null;
  });

  /**
   * The signed-in account's own email. While a servicer is in customer mode
   * the active principal carries a synthetic email, so the stashed servicer
   * email is the one to show.
   */
  readonly accountEmail = computed(() => {
    const stash = this.stashSig();
    return stash ? stash.user.email : this.principalSig()?.email ?? '';
  });

  /**
   * Startup session check. Confirms a stored access token against the backend
   * (GET /session) before any logged-in UI is shown, so a stale or forged
   * localStorage principal can never present as authenticated. On success the
   * principal is refreshed from the server; on failure the session is cleared.
   * Resolves (never rejects) so it is safe to await in an APP_INITIALIZER.
   */
  async verifySession(): Promise<void> {
    try {
      if (!localStorage.getItem(ACCESS_KEY)) return;
      const res = await firstValueFrom(
        this.http.get<{ user: Principal }>(`${this.base}/session`),
      );
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      this.principalSig.set(res.user);
    } catch {
      // Invalid/expired session (the interceptor already tried a silent
      // refresh). Drop the cached principal so the UI renders logged-out.
      this.logout();
    } finally {
      this.authReadySig.set(true);
    }
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/login`, { email, password })
      .pipe(tap((res) => this.store(res)));
  }

  register(payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    pin?: string;
  }): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/register`, payload)
      .pipe(tap((res) => this.store(res)));
  }

  /** Registers a servicer ("servicer") account and signs them straight in. */
  registerServicer(payload: {
    name: string;
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
    businessName: string;
    categoryId: string;
    isCompany?: boolean;
    taxNumber?: string;
    businessRegistrationNumber?: string;
    serviceAreas?: string[];
    pin?: string;
  }): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/auth/register-servicer`, payload)
      .pipe(tap((res) => this.store(res)));
  }

  /**
   * Enters customer mode for a servicer account. Stashes the servicer session,
   * fetches a customer-scoped session from the backend and makes it active.
   */
  switchToCustomerMode(): Observable<void> {
    return this.http.post<AuthResponse>(`${this.base}/servicer/customer-session`, {}).pipe(
      tap((res) => {
        const access = localStorage.getItem(ACCESS_KEY);
        const refresh = localStorage.getItem(REFRESH_KEY);
        const user = this.principalSig();
        if (access && refresh && user) {
          const stash: StashedSession = { access, refresh, user };
          localStorage.setItem(STASH_KEY, JSON.stringify(stash));
          this.stashSig.set(stash);
        }
        this.store(res);
      }),
      map(() => void 0),
    );
  }

  /** Returns to servicer mode by restoring the stashed servicer session. */
  switchToServicerMode(): void {
    const stash = this.stashSig();
    if (!stash) return;
    localStorage.setItem(ACCESS_KEY, stash.access);
    localStorage.setItem(REFRESH_KEY, stash.refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(stash.user));
    localStorage.removeItem(STASH_KEY);
    this.stashSig.set(null);
    this.principalSig.set(stash.user);
  }

  private refreshInFlight: Observable<{ accessToken: string; refreshToken: string }> | null = null;

  /**
   * Refreshes the token pair. Single-flight: concurrent callers (e.g. several
   * requests that all 401 at once) share one HTTP call, so refresh-token
   * rotation never invalidates a sibling request's token.
   */
  refresh(): Observable<{ accessToken: string; refreshToken: string }> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    this.refreshInFlight = this.http
      .post<{ accessToken: string; refreshToken: string }>(`${this.base}/auth/refresh`, {
        refreshToken,
      })
      .pipe(
        tap((res) => {
          localStorage.setItem(ACCESS_KEY, res.accessToken);
          localStorage.setItem(REFRESH_KEY, res.refreshToken);
        }),
        finalize(() => {
          this.refreshInFlight = null;
        }),
        shareReplay(1),
      );
    return this.refreshInFlight;
  }

  /**
   * Sign out. Clears the local session first — so a hung or failed revoke can
   * never leave the user appearing logged in on this device — then awaits the
   * backend refresh-token revoke. Resolves `true` when the revoke is confirmed,
   * `false` when it could not be reached (the token may stay valid server-side
   * until it expires). Callers that don't care can ignore the returned promise.
   */
  async logout(): Promise<boolean> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(STASH_KEY);
    localStorage.removeItem(DEMO_GATE_KEY);
    this.principalSig.set(null);
    this.stashSig.set(null);
    this.pin.clear();
    if (!refreshToken) return true;
    try {
      await firstValueFrom(this.http.post(`${this.base}/auth/logout`, { refreshToken }));
      return true;
    } catch {
      return false;
    }
  }

  /** Instant demo login by role - calls /dev/demo-login, stores tokens. */
  demoLogin(role: 'customer' | 'servicer' | 'admin'): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/dev/demo-login`, { role })
      .pipe(tap((res) => this.storeDemo(res)));
  }

  /** Instant demo login by email for a specific demo account. */
  demoLoginByEmail(email: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.base}/dev/demo-login`, { email })
      .pipe(tap((res) => this.storeDemo(res)));
  }

  /**
   * Store a demo-bar session and, for a genuine demo account, flag it so the
   * route guard applies the shared demo PIN gate. A demo-bar login of a
   * non-demo account (e.g. admin@demo.local, isDemo=false) is not gated.
   */
  private storeDemo(res: AuthResponse): void {
    this.store(res); // clears DEMO_GATE_KEY
    if (res.user.isDemo) localStorage.setItem(DEMO_GATE_KEY, '1');
  }

  get accessToken(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  }

  /** Update the stored credit balance after a pay-now deduction. */
  updateCredit(balance: number): void {
    const p = this.principalSig();
    if (p) {
      const next = { ...p, creditBalance: balance };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      this.principalSig.set(next);
    }
  }

  /** Update any fields on the stored principal and persist to localStorage. */
  updatePrincipal(partial: Partial<Principal>): void {
    const current = this.principalSig();
    if (!current) return;
    const updated = { ...current, ...partial };
    this.principalSig.set(updated);
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
  }

  /** Update the credit balance in the active session and persist to localStorage. */
  updateCreditBalance(newBalance: number): void {
    const current = this.principalSig();
    if (!current) return;
    const updated = { ...current, creditBalance: newBalance };
    this.principalSig.set(updated);
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
  }

  /** Complete Google OAuth: store tokens and user from the callback redirect. */
  completeGoogleAuth(tokens: { accessToken: string; refreshToken: string; user: Principal }): void {
    this.store({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    });
  }

  private store(res: AuthResponse): void {
    localStorage.setItem(ACCESS_KEY, res.accessToken);
    localStorage.setItem(REFRESH_KEY, res.refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    this.principalSig.set(res.user);
    // Any real login (password, register, Google, customer-mode switch) clears
    // the demo-bar gate flag. Demo-bar logins re-set it immediately after.
    localStorage.removeItem(DEMO_GATE_KEY);
  }

  /**
   * True when the active session came from the demo-bar quick-login and is a
   * demo account — the only case the shared demo PIN (5201314) gate applies to.
   * Read by the route guards.
   */
  requiresDemoGate(): boolean {
    return localStorage.getItem(DEMO_GATE_KEY) === '1';
  }

  private readStoredUser(): Principal | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as Principal) : null;
    } catch {
      return null;
    }
  }

  private readStash(): StashedSession | null {
    try {
      const raw = localStorage.getItem(STASH_KEY);
      return raw ? (JSON.parse(raw) as StashedSession) : null;
    } catch {
      return null;
    }
  }

  // ── Guest mode ──────────────────────────────────────────────────────

  readonly isGuest = computed(() => localStorage.getItem(GUEST_KEY) === 'true');

  enterGuestMode(categoryId?: string): void {
    localStorage.setItem(GUEST_KEY, 'true');
    if (categoryId) {
      const data: GuestQuoteData = { categoryId, savedAt: new Date().toISOString() };
      localStorage.setItem(GUEST_KEY + '_data', JSON.stringify(data));
    }
  }

  exitGuestMode(): void {
    localStorage.removeItem(GUEST_KEY);
    localStorage.removeItem(GUEST_KEY + '_data');
  }

  getGuestData(): GuestQuoteData | null {
    try {
      const raw = localStorage.getItem(GUEST_KEY + '_data');
      return raw ? (JSON.parse(raw) as GuestQuoteData) : null;
    } catch {
      return null;
    }
  }

  saveGuestData(data: Partial<GuestQuoteData>): void {
    const existing = this.getGuestData() ?? {};
    const merged = { ...existing, ...data, savedAt: new Date().toISOString() };
    localStorage.setItem(GUEST_KEY + '_data', JSON.stringify(merged));
  }
}
