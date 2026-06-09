import { Injectable } from "@angular/core";

/**
 * Bridge between the chat-QA harness (which lives in the chat widget) and the live
 * quote-form component (a separate route). When a quote form mounts it registers a
 * `walkAndVerify` callback here; after the harness presses "Review & submit" and lands
 * on /quote/new, it calls `walk()` to step the form through to the Summary and collect a
 * per-page report — without needing a direct component reference.
 *
 * providedIn root → one shared instance; only one quote form is ever active at a time.
 */
@Injectable({ providedIn: "root" })
export class QaFormBridge {
  private walker: (() => Promise<string[]>) | null = null;

  /** A quote-form component registers its walk callback on init. */
  register(fn: () => Promise<string[]>): void {
    this.walker = fn;
  }

  /** Unregister on destroy — only if it's still the same callback (avoid clobbering a
   *  newer form that mounted before this one tore down). */
  unregister(fn: () => Promise<string[]>): void {
    if (this.walker === fn) this.walker = null;
  }

  /** True once a quote form has registered (poll this after navigating to /quote/new). */
  active(): boolean {
    return this.walker !== null;
  }

  /** Drive the registered form to the Summary and return its per-page report. */
  async walk(): Promise<string[]> {
    return this.walker ? this.walker() : ["(no quote form registered to walk)"];
  }
}
