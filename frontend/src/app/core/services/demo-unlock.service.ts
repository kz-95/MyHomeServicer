import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ToastService } from './toast.service';
import { ApiService } from './api.service';

const STORAGE_KEY = 'demoUnlock';

function readStored(): boolean {
  try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

function writeStored(v: boolean): void {
  try { v ? sessionStorage.setItem(STORAGE_KEY, '1') : sessionStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}

/**
 * Hidden gate for all demo/QA UI. Typing the secret phrase toggles
 * visibility on/off. The phrase is fetched from the backend
 * (/config/public → demoUnlockPhrase) and falls back to the build-time
 * environment default on error or before the API responds.
 *
 * State persists across refreshes (sessionStorage). Production builds
 * keep their own environment.production gate on top.
 */
@Injectable({ providedIn: 'root' })
export class DemoUnlockService {
  private readonly toast = inject(ToastService);
  private readonly api = inject(ApiService);

  /** True after the secret phrase has been typed anywhere on the page. */
  readonly unlocked = signal(readStored());

  /**
   * The unlock phrase. Starts with the environment default, then updated
   * to the backend value once the /config/public response arrives.
   */
  readonly phrase = signal(environment.demoUnlockPhrase);

  /** Expected next character position in the secret phrase. 0 = waiting for first char. */
  private pos = 0;

  constructor() {
    // Fetch the live phrase from the backend so it can be changed without a frontend rebuild
    this.api.get<{ demoUnlockPhrase?: string }>('/config/public').subscribe({
      next: (r) => {
        if (r.demoUnlockPhrase) this.phrase.set(r.demoUnlockPhrase);
      },
      error: () => { /* keep environment default */ },
    });
  }

  /** Feed every keydown to this method - call from a global @HostListener. */
  handleKey(e: KeyboardEvent): void {
    const phrase = this.phrase();
    if (!phrase) return;

    const k = e.key;
    if (k.length !== 1) return;

    if (k === phrase[this.pos]) {
      this.pos++;
      if (this.pos === phrase.length) {
        const next = !this.unlocked();
        this.unlocked.set(next);
        writeStored(next);
        this.toast.info(next ? 'Demo UI on' : 'Demo UI off');
        this.pos = 0;
      }
    } else {
      this.pos = (k === phrase[0]) ? 1 : 0;
    }
  }
}
