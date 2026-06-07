# Bill Step Redesign — Honest Hold & Refund

> **Date:** 2026-06-02
> **Status:** Design approved, awaiting implementation plan
> **Scope:** Frontend quote-form bill step + TnC page

## Problem

The current Bill step misleads the customer:

| Shown | Actual | Customer thinks |
|-------|--------|----------------|
| Estimated total: RM 100 | Hold: RM 150 (budget-max) | "Why charge me 150 when it says 100?" |
| "Midpoint estimate" disclaimer | Budget-ceiling hold + refund | "What does midpoint mean?" |
| "I agree to platform terms" | No link to actual TnC | "What terms?" |

The hold mechanism is correct but the messaging is wrong.

## Design

### 1. Bill step — customer-perspective wording

```
┌────────────────────────────────────────┐
│  Price Summary                         │
│                                        │
│  Service estimate     RM 100.00        │
│  Travel fee           RM  20.00        │
│  Inspection fee         —              │
│  ───────────────────────               │
│  We'll hold          RM 150.00         │  ← only number that matters
│                                        │
│  To secure your booking, we hold       │
│  your chosen budget ceiling upfront.   │
│  The servicer's final price may be     │
│  lower — any unused portion is         │
│  returned to you automatically.        │
│                                        │
│  Refundable            ~RM 50.00       │  ← shows estimated return
│  Non‑refundable       RM 20.00 +       │  ← travel + inspection
│  (travel & inspection)                   │
│────────────────────────────────────────│
│  Payment                               │
│                                        │
│  ○ Pay now — RM 150 held now           │
│    via card or wallet                  │
│                                        │
│  ○ Pay later — settle after job done   │
│    via card, wallet, or cash           │
│────────────────────────────────────────│
│  ☐ I've read and agree to the          │
│    Terms & Conditions  (link)          │
│                                        │
│     [ Confirm & Submit ]               │
└────────────────────────────────────────┘
```

### 2. Key copy principles

- Always show the **hold amount** (what's actually taken), never just "estimated total"
- Always show the **refund estimate** so the customer knows most of it comes back
- Mark **non-refundable** line items clearly
- "I've read and agree to the Terms & Conditions" with hyperlink (legal requirement)
- Payment options describe what happens — "RM 150 held now" vs "settle after job done"

### 3. Terms & Conditions page

New route: `/terms` — public page, no auth. Linked from bill step checkbox label and from site footer.

**Content sections:**

| Section | Content |
|---------|---------|
| 1. Platform Role | HomeServices connects customers with servicers. We do not employ servicers. We facilitate booking, payment, and dispute resolution. |
| 2. Quotes & Pricing | Quotes are estimates. Budget range = what you're willing to spend. We hold your budget ceiling to secure the booking. Servicer's final proposal = actual price. Difference refunded. |
| 3. Holds & Refunds | Pay-now = full hold on budget ceiling upfront. Refund = unused portion returned automatically when booking confirms. Non-refundable: travel fees, inspection fees once inspection is completed. |
| 4. Payments | Card payments processed via Stripe. Wallet = prepaid credit balance. Cash = settled directly with servicer. |
| 5. Cancellations | Customer may cancel before servicer accepts. Servicer penalties for no-show (RM 50 deduction). After job marked done, no cancellation — use dispute resolution. |
| 6. Data & Privacy | Contact details shared with matched servicers after booking confirmed. Payment data handled by Stripe (PCI-DSS). Chats stored for dispute resolution. |
| 7. Disputes | Contact support within 7 days of job completion. We review chat logs, job photos, and payment records. Decision final and binding. |
| 8. Amendments | Terms updated with 14 days notice. Continued use = acceptance. |

### 4. Component changes

| File | Change |
|------|--------|
| `quote-form.component.ts` | Replace Bill step template with new layout; add `holdAmount`, `refundEstimate`, `nonRefundableFees` computed signals; `agreeTerms` checkbox with TnC link |
| `app.routes.ts` | Add `/terms` route (public, no auth) |
| `frontend/src/app/public/terms.component.ts` | NEW — standalone component rendering TnC sections |
| `site-footer.component.ts` | Add Terms & Conditions link in footer |
| `backend/src/services/quote.service.ts` | Hold amount = budgetMax (unchanged); add inventory of non-refundable items in response |
| `backend/src/routes/quotes.routes.ts` | Add non-refundable line items to estimate response |

### 5. Non-refundable fee logic

Travel fee and inspection fee are **non-refundable** once the servicer has acted on them:
- **Travel fee**: non-refundable after servicer arrives at site
- **Inspection fee**: non-refundable after inspection completed

At quote-creation time (before booking), these are displayed as "non-refundable" line items so the customer is aware. No deduction happens at quote stage — only after booking + servicer action.

### 6. Frontend state changes

```ts
// New computed signals in quote-form.component.ts
holdAmount(): number          // budgetMax + tip (what we actually hold)
estimatedReturn(): number    // holdAmount - (subtotal + fees)
nonRefundableFees(): number  // travelFeeBaseline + any inspection fee
```

### 7. Backend changes (minimal)

`GET /quotes/estimate` response already includes subtotal, serviceCharge, sst, total. Add:
```json
{
  "travelFee": { "amount": 20, "nonRefundable": true },
  "inspectionFee": { "amount": 0, "nonRefundable": true },
  "holdAmount": 150,
  "estimatedReturn": 50
}
```

### 8. Gates

| Gate | Target |
|------|--------|
| `frontend npx tsc --noEmit` | 0 errors |
| `frontend ng build` | exit 0 |
| `backend npx tsc --noEmit` | 0 errors |
| `backend npx jest` | 298+ pass, 0 fail |

---

## Appendix — TnC full text

Saved separately to `docs/legal/terms-and-conditions.md` for versioning.
