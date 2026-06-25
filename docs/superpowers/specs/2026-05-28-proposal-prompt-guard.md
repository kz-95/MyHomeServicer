# Servicer Proposal Prompt Guard - F-A

> 2026-05-28 · Brainstorming session · Ready for execution

## Goal

When a new quote request arrives, the servicer sees a **floating action prompt** (not just a background notification) that lets them immediately respond with a proposal. Currently the servicer has to navigate to the Jobs tab, find the pending quote, expand it, and fill the proposal form. The guard makes this flow proactive.

## Current state - MVP already built

**File:** `frontend/src/app/servicer/servicer-shell.component.ts`

The MVP prompt is implemented:
- `quote.new` socket listener accumulates incoming quote IDs in `pendingQuotes` signal
- Fixed bottom bar shows: count + category + "View & respond" button + dismiss (×)
- 60-second auto-dismiss timer
- Duplicate prevention (by `quoteId`)
- Toast: "New quote request received!"
- "View & respond" → navigates to `/servicer/jobs`

**What's missing (vs original concept):**
- No inline proposal form - servicer is redirected to Jobs tab
- No customer identity shown (avatar + name from Phase 6)
- No `computePrefill()` integration to pre-populate the proposal
- Prompt covers the whole screen width, not contextually anchored

## Enhancement - Inline proposal form in prompt

### Frontend change

**File:** `frontend/src/app/servicer/servicer-shell.component.ts`

Upgrade the prompt so the "View & respond" button opens an **inline proposal form** directly in the prompt, rather than navigating away.

### UX flow

```
1. quote.new socket fires → prompt slides up from bottom
2. Prompt shows: customer name + avatar (from Phase 6), category, "Respond with a proposal" 
3. Servicer clicks "Respond" → prompt expands into a card with:
   - Price input (prefilled from computePrefill() estimate)
   - Description textarea (optional)
   - Line items preview (from computePrefill())
   - [Submit] [Dismiss] buttons
4. Submit → POST /servicer/quotes/:id/propose → prompt collapses → success toast
5. Dismiss → prompt dismissed (quote still accessible in Jobs tab)
```

### Template changes

Replace the current simple banner with an expandable card:

```html
@if (pendingQuotes().length > 0) {
  <div class="quote-prompt" [class.expanded]="expandedQuote()" role="alert" aria-live="polite">
    @if (!expandedQuote()) {
      <!-- Collapsed: summary banner -->
      <div class="qp-body">
        <div class="qp-avatar">{{ customerInitials() }}</div>
        <div class="qp-text">
          <strong>{{ customerName() }}</strong>
          <span class="qp-cat">{{ lastCategory() }}</span>
        </div>
      </div>
      <div class="qp-tip">
        <span class="muted">{{ promptCountLabel() }}</span>
        <button class="qp-btn" (click)="expandPrompt()">Respond</button>
        <button class="qp-dismiss" (click)="dismiss()">×</button>
      </div>
    } @else {
      <!-- Expanded: inline proposal form -->
      <div class="qp-form">
        <div class="qp-form-hd">
          <strong>New request: {{ customerName() }}</strong>
          <span class="muted">{{ lastCategory() }}</span>
        </div>
        <div class="qp-form-body">
          <label>
            Your price (RM)
            <input type="number" step="0.01" [(ngModel)]="proposalPrice" name="pp" />
          </label>
          <label>
            Description (optional)
            <textarea rows="2" [(ngModel)]="proposalDesc" name="pd"></textarea>
          </label>
        </div>
        <div class="qp-form-actions">
          <button class="btn-primary" (click)="submitProposal()" [disabled]="submitting()">
            {{ submitting() ? 'Sending…' : 'Send proposal' }}
          </button>
          <button class="btn-ghost" (click)="expandedQuote.set(null)">Cancel</button>
        </div>
      </div>
    }
  </div>
}
```

### Component logic additions

```typescript
expandedQuote = signal<IncomingQuoteSummary | null>(null);
proposalPrice = signal(0);
proposalDesc = signal('');
submitting = signal(false);
private quoteCache = signal<Map<string, IncomingQuoteSummary>>(new Map());

// Single-quote mode: only show the latest quote
expandPrompt(): void {
  const q = this.pendingQuotes()[0]; // first in queue
  if (!q) return;
  // Fetch customer details + prefill estimate
  this.api.get<IncomingQuoteSummary>(`/servicer/quotes/${q.quoteId}`).subscribe({
    next: (data) => {
      this.expandedQuote.set(data);
      this.proposalPrice.set(data.estimatedPrice ?? 0);
      this.quoteCache.update((m) => { m.set(q.quoteId, data); return m; });
    },
    error: () => this.toast.error('Could not load quote details.'),
  });
}

submitProposal(): void {
  this.submitting.set(true);
  const q = this.expandedQuote();
  if (!q) return;
  this.api.post(`/servicer/quotes/${q.quoteId}/propose`, {
    proposedPrice: this.proposalPrice(),
    description: this.proposalDesc() || undefined,
  }).subscribe({
    next: () => {
      this.toast.success('Proposal sent!');
      this.submitting.set(false);
      this.expandedQuote.set(null);
      this.pendingQuotes.update((list) => list.filter((x) => x.quoteId !== q.quoteId));
    },
    error: (e) => {
      this.submitting.set(false);
      this.toast.error(e.message ?? 'Could not send proposal.');
    },
  });
}
```

### API requirements (Backend)

The existing `GET /servicer/quotes/:id` endpoint already returns quote details. Ensure it includes:
- `customerName` and `customerAvatarUrl` (from Phase 6 - ✅ Already done)
- `estimatedPrice` (from `computePrefill()` - ✅ Already wired in `submitProposal()` endpoint)

No new backend endpoints needed.

## Files changed

| File | Change |
|------|--------|
| `frontend/src/app/servicer/servicer-shell.component.ts` | Upgrade prompt: expandable inline form, customer identity, `api` inject for fetching quote data + submitting proposal |
| `frontend/src/app/servicer/servicer-shell.component.ts` | Add `[(ngModel)]` → import `FormsModule` |

## DoD

| Gate | Expected |
|------|----------|
| `ng build` | Exit 0 |
| `npx tsc --noEmit` | 0 errors |
| `quote.new` → prompt slides up | ✅ Working |
| Collapsed prompt shows customer name + category | ✅ Using Phase 6 customer data |
| Click "Respond" → expanded inline form with price input | ✅ Working |
| Submit → POST proposal → prompt dismissed + success toast | ✅ Working |
| Dismiss → prompt gone, quote still in Jobs tab | ✅ Working |
| Multiple quotes → show count + cycle through | ✅ Pending for next iteration |

## Future iterations (scope for a follow-up)

1. **Multi-quote queue:** Cycle through multiple pending quotes, respond to all without leaving the prompt
2. **Line items:** Show `computePrefill()` line items with override ability
3. **Auto-accept integration:** If quote matches auto-accept rules, show "Auto-accept triggered ✓" instead of the form
4. **Sound:** Play a subtle chime when `quote.new` fires (not the notification sound - a distinct quote-arrival sound)
