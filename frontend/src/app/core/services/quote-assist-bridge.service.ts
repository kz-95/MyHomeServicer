import { Injectable, signal } from '@angular/core';

/** Snapshot of the live quote form, read by the chat assistant. */
export interface QuoteFormContext {
  /** 1-based step number. */
  step: number;
  /** Human step name: 'service' | 'contact' | 'summary' | 'confirmation'. */
  stepName: string;
  /** Selected category name, if chosen. */
  categoryName?: string;
  /** Field keys already filled (e.g. categoryId, preferredDate, contactName). */
  filled: string[];
  /** Field keys still required for the current step. */
  missing: string[];
}

/** Applies a single field value into the live form. */
export type QuoteFieldSetter = (key: string, value: string) => void;

/**
 * Bridge between a mounted quote form and the chat widget. The form registers
 * itself on init (providing a context reader + a field setter) and unregisters
 * on destroy. The chat reads `context()` to tailor its help to the current step
 * and calls `setField()` to fill fields on the user's behalf.
 *
 * Single active form at a time (only one quote form is ever mounted).
 */
@Injectable({ providedIn: 'root' })
export class QuoteAssistBridge {
  /** True while a quote form is mounted and listening. */
  readonly active = signal(false);

  private ctxFn: (() => QuoteFormContext) | null = null;
  private setter: QuoteFieldSetter | null = null;

  register(ctxFn: () => QuoteFormContext, setter: QuoteFieldSetter): void {
    this.ctxFn = ctxFn;
    this.setter = setter;
    this.active.set(true);
  }

  unregister(): void {
    this.ctxFn = null;
    this.setter = null;
    this.active.set(false);
  }

  /** Current form snapshot, or null when no form is mounted. */
  context(): QuoteFormContext | null {
    return this.ctxFn ? this.ctxFn() : null;
  }

  /** Fill one field in the live form. No-op when no form is mounted. */
  setField(key: string, value: string): void {
    this.setter?.(key, value);
  }
}
