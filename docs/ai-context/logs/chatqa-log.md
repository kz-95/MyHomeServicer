# ChatQA Agent Log

> Single-writer log - only the **ChatQA** agent writes here.
> Scope: Chat booking QA harness + booking-flow hardening.

## Session 2026-06-09 - Dedup filter bug: extracted contactNumber blocked

### Audit of `ChatQA_Log_134609062601.log` (10 runs)

**Result:** 2/10 PASS, 8 FAIL. All gates pass (tsc, ng build).

#### Top failures (by frequency)
1. **`contactNumber` not stored** - 7 of 8 failures. Bot acknowledges phone in text,
   but phone never reaches prefill or quote form.
2. **Address card looping** - Bot shows `quote_field:address` 4x without advancing.
3. **Bot invents dates/property types** - e.g. "this saturday" → "14 June 2026"
   (wrong date from model hallucination).
4. **Language mismatch** - Bot replies in English when user is in zh/ms.
5. **Flow order wrong** - Budget/date/time asked after already confirmed.

#### Root cause: contactNumber blocked by dedup filter

**File:** `backend/src/services/chat.service.ts:2263-2285`

The flow:
1. User types phone as free text (e.g. "my number is 01124751853")
2. `extractPhone()` correctly returns "+601124751853"
3. `fillField("contactNumber", value)` adds `quote_field:contactNumber` with value to `outBlocks`
4. `confirmedFields` set includes the just-extracted `contactNumber` (line 2263-2268)
5. Dedup filter (line 2279-2286) REMOVES ALL `quote_field` blocks whose key is in `confirmedFields`, REGARDLESS of whether they carry a value

**Effect:** The `quote_field:contactNumber` block with the extracted phone value is REMOVED from the response. The frontend NEVER receives it. The phone is never stored in `prefillData`. The quote form shows `phone=-`.

The filter is correct for empty cards (model re-emitting contactNumber after it was confirmed) but WRONG for valued cards (deterministically extracted by `fillField`).

**Fix:** Preserve blocks that carry a non-empty value through the dedup filter.

### Fix applied - `1c8c177` (2026-06-09)

**Change:** `backend/src/services/chat.service.ts:2282-2288`

The filter now checks `b.data.value`: blocks with a non-null non-empty value pass through
regardless of `confirmedFields` membership. Empty cards the model re-emitted after the
field was already collected still get dropped.

**Verification:** `tsc --noEmit` - zero errors.

**Remaining work:**
1. Push to `feat/ux-polish` when GitHub is reachable (3 commits local now).
2. Restart BE server for the code change to take effect.
3. Run QA with `count=10` - expect `contactNumber` to appear in most successful runs.
   Previous 7/8 failures had `incomplete prefill: missing contactNumber`.
4. After QA passes (expect 7-8/10 or better), merge `feat/ux-polish` → `master`.

**Still-open QA issues after this fix:**
- Address card looping (4x) - likely QA harness or model issue with structured address form.
- Bot invents dates ("this saturday" → wrong day) - model hallucination, prompt fix needed.
- Language mismatch - bot replies in English to zh/ms users. Needs stronger lang directive.

### Session 2026-06-09 17:07 - Rate-limit fix + contactNumber verification

#### QA re-run audit (`ChatQA_Log_170109062601.log`, 5 runs)

**contactNumber fix verified:** Run 1 (English, Roof) PASSED with `phone=+60149631295` stored -
the dedup filter fix works. Form check reached page 3 (Summary).

**Runs 2–5 all failed** with "Could not send message" on the FIRST user message. Root cause:
`guestChatLimiter` at 10 req/min. The QA harness sends 50-100 requests in rapid succession
across 5 scenarios. After the first ~10 requests (mid-run 1 to early run 2), the rate
limiter returns 429, and the frontend error handler shows "Could not send message".

Direct API test confirmed backend is healthy for all 3 failing input types (Tamil text,
out-of-catalog service). All return 200 OK with valid responses.

**Fix:** Raised dev-mode rate limit from 10 → 100/min (`chat.routes.ts:65`). Production
stays at 10/min.

#### Remaining
- Restart BE server for both fixes to take effect.
- Re-run QA with `count=10` - should now run all scenarios without rate-limiting.
- Expect contactNumber to pass in most runs; address looping + date hallucination remain.
- Merge `feat/ux-polish` → `master` after QA passes.

