import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Hidden gate for all demo/QA UI. Everything is hidden until the user types
 * the secret phrase (from environment.demoUnlockPhrase) anywhere on the page.
 *
 * Once unlocked it stays unlocked for the session. Production builds keep
 * their own environment.production gate on top.
 */
@Injectable({ providedIn: 'root' })
export class DemoUnlockService {
  /** True after the secret phrase has been typed anywhere on the page. */
  readonly unlocked = signal(false);

  /** Expected next character position in the secret phrase. 0 = waiting for first char. */
  private pos = 0;

  /** Feed every keydown to this method — call from a global @HostListener. */
  handleKey(e: KeyboardEvent): void {
    if (this.unlocked()) return;

    const phrase = environment.demoUnlockPhrase;
    if (!phrase) return;

    const k = e.key;
    // Only track single printable characters (skip modifiers, arrows, etc.)
    if (k.length !== 1) return;

    if (k === phrase[this.pos]) {
      this.pos++;
      if (this.pos === phrase.length) {
        this.unlocked.set(true);
        this.pos = 0;
      }
    } else {
      // Reset, but re-check: this key might start a fresh sequence
      this.pos = (k === phrase[0]) ? 1 : 0;
    }
  }
}
