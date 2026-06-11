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

  /** Preset greetings per tier (anonymous / returning / customer / servicer / admin). */
  private greetingPools: Record<string, string[]> = {};

  /** Track used greeting indices for round-robin, per tier. */
  private usedByTier: Record<string, Set<number>> = {};

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

  /** Load the anonymous greeting pool (backward-compatible). */
  setGreetings(greetings: string[]): void {
    if (greetings.length >= 10) this.greetingPools['anonymous'] = greetings;
  }

  /** Load every tier's pool at once. Anonymous keeps its >=10 requirement. */
  setGreetingTiers(pools: Record<string, string[]>): void {
    if ((pools['anonymous']?.length ?? 0) >= 10) this.greetingPools['anonymous'] = pools['anonymous'];
    for (const tier of ['returning', 'customer', 'servicer', 'admin']) {
      if (Array.isArray(pools[tier])) this.greetingPools[tier] = pools[tier];
    }
  }

  /**
   * Pick a greeting for a tier, filling the {name} placeholder. Falls back to the
   * anonymous pool when a tier is empty so behaviour never regresses.
   */
  getGreeting(tier: string, name?: string): string {
    let pool = this.greetingPools[tier] ?? [];
    let poolTier = tier;
    if (pool.length === 0) { pool = this.greetingPools['anonymous'] ?? []; poolTier = 'anonymous'; }
    if (pool.length === 0) return '';
    return this.applyName(pool[this.pickIndex(poolTier, pool.length)], name);
  }

  /** Anonymous-pool greeting (legacy callers). */
  getNextGreeting(): string {
    return this.getGreeting('anonymous');
  }

  /** Round-robin index within a tier. */
  private pickIndex(tier: string, len: number): number {
    const used = this.usedByTier[tier] ?? new Set<number>();
    for (let i = 0; i < len; i++) {
      if (!used.has(i)) { used.add(i); this.usedByTier[tier] = used; return i; }
    }
    used.clear(); used.add(0); this.usedByTier[tier] = used;
    return 0;
  }

  /** Fill {name}; if no name, drop the placeholder and tidy stray punctuation. */
  private applyName(text: string, name?: string): string {
    if (name && name.trim()) return text.replace(/\{name\}/gi, name.trim());
    return text
      .replace(/,?\s*\{name\}/gi, '')
      .replace(/\{name\}/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  hasGreeting(): boolean {
    return (this.greetingPools['anonymous']?.length ?? 0) > 0;
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

  /** Play the chat notification sound. Safe to call from any component. */
  playNotificationSound(): void {
    try {
      new Audio('assets/sounds/Chat_Reply.wav').play().catch(() => {});
    } catch { /* noop */ }
  }
}
