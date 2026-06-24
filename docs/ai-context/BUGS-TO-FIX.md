# Bugs To Fix — Consolidated

> 2026-06-24 | Sources: 7-QA, 8-QA, 2026-05-31 bug-dump
> **ALL 11 FIXED 2026-06-24** on `feat/sp3-dispatch-cards` (12 commits)
> Fix order: CRITICAL → HIGH → MEDIUM → LOW

---

## CRITICAL (5) — ALL FIXED ✅

### ✅ QA-005 — Dispatch accept bypasses escrow/payment
**Fixed:** `0ea3dbd` — Mirrored `selectProposal()` payment logic inside `handleDispatchAccept()` $transaction.

### ✅ BE-007 — Service-area filter neutered by `|| true`
**Fixed:** `1d58af0` — Removed `|| true` from `quote.service.ts:118`.

### ✅ BE-001 — `buildSystemPrompt()` unawaited async → "[object Promise]"
**Fixed:** `c094f18` — Added `await` before `buildSystemPrompt()` call at `chat.service.ts:271`.

### ✅ BE-008 — `quote.no_response` double-refund on concurrent runs
**Fixed:** `75e008c` — Wrapped refund in `$transaction` + idempotency guard.

### ✅ BE-011 — No-show counter outside `$transaction` silently desyncs
**Fixed:** `e04b29d` — Moved counter increment + auto-ban inside `$transaction`.

---

## HIGH (2) — ALL FIXED ✅

### ✅ BE-013 — Demo-login accepts arbitrary email
**Fixed:** `5379ff0` — Removed `directEmail`, locked to `DEMO_ACCOUNTS` map only.

### ✅ BE-019 — Chat verify-pin token leak
**Fixed:** `a59ad59` — Added 10-min success TTL + `consumePinSuccess()` one-shot consumption.

---

## MEDIUM (2) — ALL FIXED ✅

### ✅ QA-003 — Platform fee double-recorded per pay_now booking
**Fixed:** `18b17cc` — Removed booking-time `platform_fee` reserve.

### ✅ QA-004 — `splitUrgentFee()` never called
**Fixed:** `8cb084d` + `2288b73` — Wired split into escrow release; new `urgent_fee` transaction type.

---

## LOW (2) — ALL FIXED ✅

### ✅ QA-001 — Frontend countdown hardcoded
**Fixed:** `777cffb` — Added `timeoutSeconds` to socket payload; frontend reads from event data.

### ✅ QA-002 — No log for individually skipped servicers
**Fixed:** `3e558d9` — Added `logger.info` for offline, out-of-hours, and no-schedule skips.

---

## Commits (in order)

```
3e558d9 fix(dispatch): add per-servicer skip log for offline and out-of-hours
777cffb fix(dispatch): sync frontend countdown with backend timeout setting
2288b73 chore(backend): update session log for QA-004
8cb084d fix(fees): enforce urgent_fee 20/80 split in escrow release
18b17cc fix(fees): remove duplicate platform_fee booking-time reserve
a59ad59 fix(chat): add TTL and consume guard on verify-pin token state
5379ff0 fix(auth): lock demo-login to known demo accounts only
e04b29d fix(jobs): move no-show counter increment inside $transaction block
75e008c fix(jobs): add idempotency guard against double-refund in quote.no_response
c094f18 fix(chat): await buildSystemPrompt to prevent [object Promise] in AI context
1d58af0 fix(quote): remove || true neutering service-area filter
0ea3dbd fix(dispatch): wire escrow/payment into handleDispatchAccept for pay_now
```

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
**Fix (initial):** `5379ff0` — removed `directEmail`, locked to `DEMO_ACCOUNTS` map only (3 accounts).
**Fix (regression):** Over-hardened — broke frontend's email-based demo login for 80+ accounts. Re-fixed 2026-06-25: accept both `role` + `email`; email gated to `@demo.local` domain.

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
