# ChatQA Agent Log

> Single-writer log — only the **ChatQA** agent writes here.
> Scope: Chat booking QA harness + booking-flow hardening.

## Session 2026-06-09 — Dedup filter bug: extracted contactNumber blocked

### Audit of `ChatQA_Log_134609062601.log` (10 runs)

**Result:** 2/10 PASS, 8 FAIL. All gates pass (tsc, ng build).

#### Top failures (by frequency)
1. **`contactNumber` not stored** — 7 of 8 failures. Bot acknowledges phone in text,
   but phone never reaches prefill or quote form.
2. **Address card looping** — Bot shows `quote_field:address` 4x without advancing.
3. **Bot invents dates/property types** — e.g. "this saturday" → "14 June 2026"
   (wrong date from model hallucination).
4. **Language mismatch** — Bot replies in English when user is in zh/ms.
5. **Flow order wrong** — Budget/date/time asked after already confirmed.

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
