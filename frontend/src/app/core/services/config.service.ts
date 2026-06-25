import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Public client-side config fetched from the backend at startup.
 *
 * Only non-sensitive values live here - the backend serves what's safe for
 * browser exposure (googleClientId, googleMapsApiKey). The APP_INITIALIZER
 * in app.config.ts calls `load()` before the app boots, so every component
 * sees the resolved values synchronously.
 */
export interface PublicConfig {
  googleClientId: string;
  googleMapsApiKey: string;
  condoEntryNote: string;
  notificationSoundEnabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private http = inject(HttpClient);

  private config: PublicConfig = { googleClientId: '', googleMapsApiKey: '', condoEntryNote: '', notificationSoundEnabled: true };
  private _hasDemoData = false;

  /** Fetch /config/public from the API. Called once by APP_INITIALIZER. */
  async load(): Promise<PublicConfig> {
    try {
      const [cfg, demoStatus] = await Promise.all([
        lastValueFrom(this.http.get<PublicConfig>(`${environment.apiBase}/config/public`)),
        lastValueFrom(this.http.get<{ hasDemoData: boolean }>(`${environment.apiBase}/config/demo-status?_=${Date.now()}`)).catch(() => ({ hasDemoData: false })),
      ]);
      this.config = cfg;
      this._hasDemoData = demoStatus.hasDemoData;
    } catch {
      this.config = { googleClientId: '', googleMapsApiKey: '', condoEntryNote: '', notificationSoundEnabled: true };
    }
    return this.config;
  }

  get hasDemoData(): boolean { return this._hasDemoData; }

  get googleClientId(): string {
    return this.config.googleClientId;
  }

  get googleMapsApiKey(): string {
    return this.config.googleMapsApiKey;
  }

  get condoEntryNote(): string {
    return this.config.condoEntryNote;
  }

  get notificationSoundEnabled(): boolean {
    return this.config.notificationSoundEnabled;
  }
}
