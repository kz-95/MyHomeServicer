import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { ConfigService } from './core/services/config.service';
import { AuthService } from './core/services/auth.service';
import { provideAppLucideIcons } from './core/lucide-icons.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    // Order matters: errorInterceptor is outermost so authInterceptor sees the
    // raw HttpErrorResponse (and can act on a 401) before the error is
    // normalised for components.
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
    provideAnimations(),
    provideCharts(withDefaultRegisterables()),
    provideAppLucideIcons(),
    {
      provide: APP_INITIALIZER,
      useFactory: (config: ConfigService) => () => config.load(),
      deps: [ConfigService],
      multi: true,
    },
    // Validate any stored session against the backend BEFORE the app renders,
    // so logged-in UI is never shown on a cached/forged localStorage principal.
    {
      provide: APP_INITIALIZER,
      useFactory: (auth: AuthService) => () => auth.verifySession(),
      deps: [AuthService],
      multi: true,
    },
  ],
};
