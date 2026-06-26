# Security & Coding Style Anti-Patterns

> 2026-06-25 — Documented during SP-3 seed consolidation session.
> This file records coding patterns that cause security bugs, fragile logic, or
> silent bypasses. Every engineer working on this codebase must read this.

---

## Rule 1 — No boolean "skip" flags on security gates

### Anti-pattern
```typescript
// BAD: a boolean flag that disables a security check
function createQuote(userId: string, input: CreateQuoteInput, options?: { skipCreditCheck?: boolean }) {
  // ...
  if (creditHold > 0 && !options?.skipCreditCheck) {
    const user = await findUser(userId);
    if (user.balance < creditHold) throw Error('Insufficient');
  }
}

// Called for guests with the flag set
createQuote(guestId, input, { skipCreditCheck: true });
```

### Why it's wrong
1. `skipCreditCheck` is a **negative gate**. It says "skip this" instead of "do this."
2. The caller must remember to pass `skipCreditCheck: true` — if forgotten, the gate fires incorrectly.
3. The function body reads "if NOT skip, do the check" — double negative, easy to misread.
4. Adding a THIRD payment method requires adding more boolean flags. Exponentially fragile.

### Fix
```typescript
// GOOD: settlementMethod IS the decision point. No extra flags.
function createQuote(input: CreateQuoteInput) {
  const settlement = input.settlementMethod ?? 'credit';

  if (settlement === 'credit') {
    // Registered user paying with wallet → check balance
    if (user.balance < hold) throw Error('Insufficient');
  }
  // gateway: pays via Stripe → no wallet check needed
}

// Guest pay_now explicitly sends gateway
createQuote({ ..., settlementMethod: 'gateway' });
```

### Refactored in
- `backend/src/services/quote.service.ts:createQuote()` — removed `skipCreditCheck` option
- Guest quotes now set `settlementMethod: 'gateway'` explicitly (line 1099)
- Credit hold check uses `input.settlementMethod !== 'gateway'` (line 301)
- Discount check uses `input.settlementMethod !== 'gateway'` (line 281)

### Audit rule
`grep -r "skip[A-Z]" backend/src/services/` — any `skip*` boolean parameter is suspect.
`grep -r "!options\?." backend/src/services/` — any negated option check is suspect.

---

## Rule 2 — Payment mode + settlement method must travel together

### Anti-pattern
```typescript
// BAD: settlementMethod is sometimes not sent, depending on paymentMode
if (this.f.paymentTiming === 'pay_later' || this.f.settlementMethod === 'gateway') {
  payload['settlementMethod'] = this.f.settlementMethod;
}
// pay_now + credit → settlementMethod NOT sent → backend receives undefined
```

### Why it's wrong
When `settlementMethod` is undefined, the backend must GUESS the intent.
`undefined !== 'gateway'` → true → wallet credit check fires.
But the intent was never explicitly stated.

### Fix
Always send `settlementMethod`. Make it required in the Zod schema or give it an explicit default.
Backend: `settlementMethod: z.enum(['credit','gateway','cash']).default('credit')`

---

## Rule 3 — No `document.querySelector` in Angular components

### Anti-pattern
```typescript
// BAD: queries the ENTIRE document, grabs first match
const container = document.querySelector('.map-container');
new google.maps.Map(container, { ... });
```

### Why it's wrong
When 2+ instances of the same component exist, all grab the FIRST element.
2nd component renders on 1st component's div → overwrites → silent data loss.

### Fix
```typescript
// GOOD: per-component template reference
@ViewChild('mapContainer') containerRef!: ElementRef;
new google.maps.Map(this.containerRef.nativeElement, { ... });
```

### Refactored in
- `frontend/src/app/shared/map-view.component.ts:187`

### Audit rule
`grep -r "document.querySelector" frontend/src/` — every hit is a bug if the component can be instantiated more than once.

---

## Rule 4 — Script injection must be idempotent

### Anti-pattern
```typescript
// BAD: every component instance creates its own <script> tag
ngOnInit() {
  const script = document.createElement('script');
  script.src = 'https://maps.googleapis.com/maps/api/js?key=XXX';
  document.head.appendChild(script);
}
```

### Why it's wrong
2 component instances = 2 script tags = Google Maps loaded twice.
Console: "API loaded multiple times", "Element already defined".

### Fix
```typescript
// GOOD: static shared Promise — only one script tag ever
private static _mapsLoading: Promise<void> | null = null;

loadMapsApi() {
  if (!MapViewComponent._mapsLoading) {
    MapViewComponent._mapsLoading = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = '...';
      script.onload = () => {
        // Poll until google.maps is ACTUALLY available
        const check = setInterval(() => {
          if (google?.maps) { clearInterval(check); resolve(); }
        }, 200);
      };
      document.head.appendChild(script);
    });
  }
  MapViewComponent._mapsLoading.then(() => this.initMap());
}
```

### Refactored in
- `frontend/src/app/shared/map-view.component.ts:loadMapsApi()`

---

## Rule 5 — Data pipelines: verify both creation AND deletion

### Anti-pattern
Only updating `seed.ts` when schema grows, forgetting `clear.ts`.

### Why it's wrong
Stale data in uncleared tables causes:
- FK constraint violations
- Phantom data surviving across reseeds
- "Where did this data come from?" confusion

### Fix
Every time a model is added to the Prisma schema, `clear.ts` MUST be updated.
The clear order must match FK dependency order (children before parents).

### Audit rule
```bash
# Compare schema models vs clear.ts coverage
grep "^model " backend/prisma/schema.prisma | wc -l   # total models
grep "deleteMany" backend/prisma/seed/clear.ts | wc -l  # cleared models
# These numbers MUST match (minus config-only tables like PlatformSettings)
```

---

## Rule 6 — Express middleware changes always need restart

### Anti-pattern
Editing `app.ts` helmet/CSP configuration and assuming `ts-node-dev --respawn` picks it up.

### Why it's wrong
Express middleware is registered at app startup. ts-node-dev watches `src/` for
route/service changes but may not re-initialize the Express middleware stack
when `app.ts` changes.

### Fix
After any `app.ts` edit: manual backend restart (Ctrl+C, re-run `scripts/bat/Run.bat`).
Or verify with `curl -I localhost:4000 | grep -i content-security-policy`.

---

## Rule 7 — Shell dialect: NO `&&` in PowerShell

### Anti-pattern
```bash
git add -A && git commit -m "msg"    # CRASHES in PowerShell
```

### Why it's wrong
PowerShell uses `;` for sequential, `; if ($?) { }` for conditional.
`&&` causes a parse error. Every single time.

### Fix
```powershell
git add -A; if ($?) { git commit -m "msg" }
```
Or use separate bash tool calls for each command.

---

## Rule 8 — "Done" is a runtime claim, not an edit claim

### Anti-pattern
"I fixed the bug" after editing the file but BEFORE:
- Restarting the server
- Clearing browser cache
- Testing the actual flow in the browser

### Why it's wrong
"Code changed" ≠ "behavior changed." The user tests runtime, not source code.

### Fix
Never say "done." Say:
```
Code changed. tsc clean.
NOT verified: [list what wasn't tested]
Need restart: [backend/frontend/both]
Need reseed: [yes/no]
```
