# Bugs To Fix — Consolidated

> 2026-06-24 | Sources: 7-QA, 8-QA, 2026-05-31 bug-dump
> Fix order: CRITICAL first, then HIGH, then MEDIUM, then LOW

---

## CRITICAL (5)

### QA-005 — Dispatch accept bypasses escrow/payment
**Severity:** 🔴 CRITICAL | **Source:** 8-QA (2026-06-24)
**File:** `backend/src/services/dispatch.service.ts:197-234`
`handleDispatchAccept()` creates Booking without escrow record, wallet deduction, escrow_hold transaction, or platform_fee reserve. pay_now dispatch bookings: customer never charged, servicer never paid.
**Fix:** Mirror `selectProposal()` payment logic from `booking.service.ts:89-345` inside the existing `$transaction`.

### BE-007 — Service-area filter neutered by `|| true`
**Severity:** 🔴 CRITICAL | **Source:** Bug-dump (2026-05-31)
**File:** `backend/src/services/servicer-quote.service.ts`
`findMatchingServicers()` has an area filter guarded by `|| true` — always matches ALL servicers regardless of service area. Quote broadcast reaches servicers outside the customer's area.
**Fix:** Remove the `|| true` guard. Verify coordinate-based radius matching works correctly.

### BE-001 — `buildSystemPrompt()` unawaited async → "[object Promise]"
**Severity:** 🔴 CRITICAL | **Source:** Bug-dump (2026-05-31)
**File:** `backend/src/services/chat.service.ts`
`buildSystemPrompt()` is called without `await` in the AI send path. The function is async but the caller treats the return as a string. AI receives "[object Promise]" as system prompt — garbage context for every chat message.
**Fix:** Add `await` before `buildSystemPrompt()` call. Verify with TypeScript.

### BE-008 — `quote.no_response` double-refund on concurrent runs
**Severity:** 🔴 CRITICAL | **Source:** Bug-dump (2026-05-31)
**File:** `backend/src/jobs/quote.jobs.ts`
BullMQ `quote.no_response` job handler has no idempotency guard on the refund path. Concurrent execution can refund the customer's credit twice for the same quote expiry.
**Fix:** Add Redis lock (SET NX EX) or DB unique constraint before the `adjustCredit()` refund call.

### ✅ BE-011 — No-show counter outside `$transaction` silently desyncs — FIXED 2026-06-24
**Severity:** 🔴 CRITICAL | **Source:** Bug-dump (2026-05-31)
**File:** `backend/src/jobs/booking.jobs.ts` (corrected from BUGS-TO-FIX which listed `booking.service.ts`)
No-show counter increment happened outside the `$transaction` block. If the transaction succeeded but the counter update failed/retried, the counter desynced from actual no-show count. Used for ban thresholds.
**Fix:** Moved counter increment + auto-ban check inside the same `$transaction` as the booking cancellation + escrow refund. Commit: TBD.

---

## HIGH (2)

### BE-013 — Demo-login accepts arbitrary email (any account with matching password)
**Severity:** 🔴 HIGH | **Source:** Bug-dump (2026-05-31)
**File:** `backend/src/services/auth.service.ts`
In dev mode (NODE_ENV !== 'production'), demo login accepts ANY email as long as the account exists and matches the demo password. An attacker who knows the demo password can log in as any seeded user.
**Fix:** Guard demo-login to only accept known demo email domains (e.g., `*@demo.servicer.local`) or disable in production.

### BE-019 — Chat verify-pin token stored indefinitely, never consumed
**Severity:** 🔴 HIGH | **Source:** Bug-dump (2026-05-31)
**File:** `backend/src/services/chat.service.ts`
The chat PIN verification flow stores a token in memory (or Redis) that is never consumed on next use and never expires. Token leak + replay attack vector.
**Fix:** Add token expiry (TTL). Consume/destroy token after first successful verification.

---

## MEDIUM (2)

### QA-003 — Platform fee double-recorded per pay_now booking
**Severity:** 🟡 MEDIUM | **Source:** 8-QA (2026-06-24)
**Files:** `booking.service.ts:333-344` (reserve) + `booking.jobs.ts:229-238` (release)
A `platform_fee` transaction is created at booking time AND at escrow release. The admin dashboard `totalFees` query (`SUM(type='platform_fee')`) double-counts, inflating reported fees ~2× for pay_now bookings.
**Fix:** Either change the reserve type to `fee_reserve` (new type, excluded from dashboard), OR skip the release-time fee if reserve already exists, OR exclude reserve entries in the dashboard query.

### QA-004 — `splitUrgentFee()` never called — 20/80 split display-only
**Severity:** 🟡 MEDIUM | **Source:** 8-QA (2026-06-24)
**File:** `backend/src/lib/quote-timing.ts`
`splitUrgentFee()` exists but is never imported or called in any service. The 20% platform / 80% servicer split is computed ONLY for the admin dashboard display (`urgentFeePlatformShare`). The actual fee deduction uses the generic `platform_fee_rate` (5%) applied to the full amount including urgent fee.
**Fix:** Call `splitUrgentFee()` inside `doneJob()` or `handleEscrowRelease()`. Deduct the 20% platform share separately from the 80% servicer share.

---

## LOW (2)

### QA-001 — Frontend countdown hardcoded 10s, not synced with backend
**Severity:** 🟢 LOW | **Source:** 7-QA (2026-06-24)
**File:** `frontend/src/app/shared/dispatch-overlay.component.ts:310`
Frontend `countdownSecs.set(10)` is hardcoded. Backend reads configurable `dispatch_prompt_timeout_seconds`. Socket `dispatch.prompt` payload does not include `timeoutSeconds`. Desyncs if admin changes setting.
**Fix:** Add `timeoutSeconds` to the `dispatch.prompt` socket payload. Frontend reads it from the event data instead of hardcoding.

### QA-002 — No log for individually skipped offline servicers
**Severity:** 🟢 LOW | **Source:** 7-QA (2026-06-24)
**File:** `backend/src/services/dispatch.service.ts:48`
`isOnline` check skips servicers silently. Only aggregate `eligibleCount` logged. Spec says log per skipped servicer: "Servicer {id} offline, skipped".
**Fix:** Add `console.log` or proper logger call inside the loop when a servicer is skipped.

---

## PREVIOUSLY FIXED (confirmed)

- ✅ **SEC-001** — `/dev/seed` unguarded. Fixed: commit `a8bd654`.
- ✅ **BE-040/041/042** — Express-validator vs schema mismatches. Fixed 2026-05-25.
- ✅ **BE-043** — `handleNoResponse` expired quotes with proposals. Fixed.
- ✅ **BE-044/045/046/047** — Servicer could quote himself. Fixed.
- ✅ **BE-048** — Chat fallback contradicted cash-only model. Fixed.

---

## Fix Order

```
1. QA-005   (CRITICAL — dispatch, money leak)
2. BE-007   (CRITICAL — service area, all quotes wrong)
3. BE-001   (CRITICAL — AI broken)
4. BE-008   (CRITICAL — double refund)
5. BE-011   (CRITICAL — counter drift)
6. BE-013   (HIGH — security)
7. BE-019   (HIGH — security)
8. QA-003   (MEDIUM — reporting)
9. QA-004   (MEDIUM — fee split)
10. QA-001  (LOW — polish)
11. QA-002  (LOW — polish)
```
