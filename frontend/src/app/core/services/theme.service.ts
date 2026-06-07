import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'warm' | 'cool';

const STORAGE_KEY = 'hs_theme';

/**
 * Manages the warm (day) / cool (night) theme toggle.
 * Persists the choice to localStorage and applies `data-theme` on <html>.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.load());

  constructor() {
    this.apply(this.theme());
    effect(() => {
      this.apply(this.theme());
      this.save(this.theme());
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'warm' ? 'cool' : 'warm'));
  }

  private load(): Theme {
    if (typeof window === 'undefined') return 'warm';
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'warm';
  }

  private save(t: Theme): void {
    localStorage.setItem(STORAGE_KEY, t);
  }

  private apply(t: Theme): void {
    document.documentElement.setAttribute('data-theme', t);
  }
}
