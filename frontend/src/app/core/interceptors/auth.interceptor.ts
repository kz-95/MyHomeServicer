import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, tap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { SocketService } from '../services/socket.service';
import { environment } from '../../../environments/environment';

/**
 * Auth interceptor (auth day).
 *
 * Attaches `Authorization: Bearer <accessToken>` to API calls. On a 401
 * TOKEN_EXPIRED it performs one silent refresh and retries the request once.
 * The refresh endpoint itself is never intercepted to avoid a loop.
 *
 * Any other 401 (Invalid access token, etc.) means the token is permanently
 * dead — clear the session immediately so the user can recover without
 * manually clearing localStorage.
 *
 * After a successful token refresh the SocketService is notified so it can
 * reconnect with the new credential - without this the WebSocket handshake
 * would still carry the old (rotated) token after a disconnect/reconnect.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const socket = inject(SocketService);

  const isApi = req.url.startsWith(environment.apiBase) || req.url.startsWith('/api');
  if (!isApi || req.url.includes('/auth/')) {
    return next(req);
  }

  const withToken = () => {
    const token = auth.accessToken;
    return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  };

  return next(withToken()).pipe(
    catchError((err: HttpErrorResponse) => {
      const code = err.error?.error?.code;
      if (err.status === 401 && code === 'TOKEN_EXPIRED' && auth.accessToken) {
        // One silent refresh + retry. After the refresh, update the socket
        // so it reconnects with the new access token.
        return auth.refresh().pipe(
          tap(() => socket.updateToken()),
          switchMap(() => next(withToken())),
          catchError(() => {
            auth.logout();
            window.location.href = '/login';
            return throwError(() => err);
          }),
        );
      }
      // Non-TOKEN_EXPIRED 401 (Invalid access token, forged token, etc.) -
      // the token is permanently dead. Clear the session and redirect.
      if (err.status === 401 && auth.accessToken) {
        auth.logout();
        window.location.href = '/login';
      }
      return throwError(() => err);
    }),
  );
};
