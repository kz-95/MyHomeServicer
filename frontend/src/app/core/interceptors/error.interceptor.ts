import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Surfaces the backend error envelope ({ error: { code, message } }) as a
 * consistent Error so components can show a clean message.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      const apiError = err.error?.error;
      const message = apiError?.message ?? err.message ?? 'Request failed';
      const code = apiError?.code ?? 'INTERNAL_ERROR';
      console.warn(`API error [${code}]`, message);
      return throwError(() => ({ code, message, status: err.status }));
    }),
  );
};
