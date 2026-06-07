import { Injectable, signal } from '@angular/core';

export interface ActionBlock {
  type: string;
  data: Record<string, unknown>;
}

export interface PrefillData {
  categoryId?: string;
  contactName?: string;
  contactNumber?: string;
  address?: string;
  preferredDate?: string;
  timeSlot?: string;
  notes?: string;
  budgetMin?: number;
  budgetMax?: number;
  paymentMode?: string;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class ChatWidgetService {
  private isOpenSig = signal(false);
  readonly isOpen = this.isOpenSig.asReadonly();

  // The AI assistant is reachable over HTTP whenever the app is loaded, so it is
  // "active" by default. (It used to start 'offline' and only flip to 'active' on a
  // socket connect, which left the status stuck grey when no socket connected.)
  chatStatus = signal<'active' | 'offline' | 'typing'>('active');
  chatUnread = signal(0);

  /** Holds a question to auto-send when the chat panel opens (`?q=` support). */
  readonly pendingQuestion = signal('');

  /** Active action blocks from the latest AI reply. */
  readonly actionBlocks = signal<ActionBlock[]>([]);

  /** Accumulated prefill data from quote_field actions (chat-only path). */
  readonly prefillData = signal<PrefillData>({});

  /** Whether a greeting has been shown in this session. */
  private greetingSeen = false;

  /** Preset greetings loaded from admin settings. */
  private greetingPool: string[] = [];

  /** Track used greeting indices for round-robin. */
  private usedGreetingIndices = new Set<number>();

  open(): void {
    this.isOpenSig.set(true);
    this.markGreetingSeen();
    this.chatUnread.set(0);
  }

  /** Opens the chat panel with a pre-filled question auto-sent on connect. */
  openWithQuestion(q: string): void {
    if (q) this.pendingQuestion.set(q);
    this.isOpenSig.set(true);
    this.markGreetingSeen();
    this.chatUnread.set(0);
  }

  close(): void {
    this.isOpenSig.set(false);
    this.actionBlocks.set([]);
  }

  toggle(): void {
    this.isOpenSig.update((v) => !v);
    if (this.isOpenSig()) {
      this.markGreetingSeen();
      this.chatUnread.set(0);
    }
  }

  setGreetings(greetings: string[]): void {
    if (greetings.length >= 10) {
      this.greetingPool = greetings;
    }
  }

  getNextGreeting(): string {
    if (this.greetingPool.length === 0) return '';
    // Round-robin: find first unused index
    for (let i = 0; i < this.greetingPool.length; i++) {
      if (!this.usedGreetingIndices.has(i)) {
        this.usedGreetingIndices.add(i);
        return this.greetingPool[i];
      }
    }
    // All used - reset and use the first one
    this.usedGreetingIndices.clear();
    this.usedGreetingIndices.add(0);
    return this.greetingPool[0];
  }

  getRandomGreeting(): string {
    if (this.greetingPool.length === 0) return '';
    const idx = Math.floor(Math.random() * this.greetingPool.length);
    return this.greetingPool[idx];
  }

  hasGreeting(): boolean {
    return this.greetingPool.length > 0;
  }

  markGreetingSeen(): void {
    this.greetingSeen = true;
  }

  isGreetingSeen(): boolean {
    return this.greetingSeen;
  }

  setUnreadCount(n: number): void {
    this.chatUnread.set(Math.min(n, 99));
  }

  accumulatePrefill(data: Partial<PrefillData>): void {
    this.prefillData.update((prev) => ({ ...prev, ...data }));
  }

  resetPrefill(): void {
    this.prefillData.set({});
  }
}
