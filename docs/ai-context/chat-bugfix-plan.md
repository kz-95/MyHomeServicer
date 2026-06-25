# Chat Assistant Bugfix Plan (2026-06-08)

**Status:** IMPLEMENTED (uncommitted) 2026-06-08 - all three fixes applied, `tsc`
backend + frontend pass. NOT committed: the chat-widget.component.ts edits sit inside
an unrelated uncommitted refactor (+1917/-736) in the same file and can't be isolated
into their own commit. Decide commit strategy before landing.

### What shipped
- **A (name):** frontend `isPlausibleName()` guards the returning-guest greeting; a
  poisoned `contactName` is dropped from sessionStorage on load. Backend `extractName`
  already disabled.
- **B (budget/phone):** `extractBudget` + `extractPhone` now read `userConvo` (user
  words only), not assistant prose - kills the "budget 1000" false positive.
- **C (flow):** `collectingFields` now requires `hasCategoryContext` (locked client-side
  or text-confirmed this reply); premature `quote_field`/`quote_prefill` cards are
  stripped until a service is settled, so "give info first → jump to review" can't happen.

Source: real in-app transcript (guest, Plumber/水pipe flow). Four symptoms, three
root causes.

---

## Symptom → Root cause map

| # | Symptom (from transcript) | Root cause | Status |
|---|---------------------------|-----------|--------|
| 1 | Greeting "Hello there, is this From?" - hallucinated name | `extractName()` regex captured "From" from free text, persisted as `contactName` in `sessionStorage` (`msvc_guest_prefill`); [loadGuest()](../../frontend/src/app/shared/chat-widget.component.ts) greets by it | Code fix already in **uncommitted** working tree (extractName disabled, [chat.service.ts:1115](../../backend/src/services/chat.service.ts)); residual gap: poisoned sessionStorage not purged |
| 2 | "budget 1000" pre-filled, never asked | `extractBudget()` ([chat.service.ts:1144](../../backend/src/services/chat.service.ts)) runs on `allText` = user msgs **+ assistant replies**; grabs a number from assistant prose narrating a bracket ("RM500–1000") and writes `budgetMax` | Open - needs confirmation of exact 1000 source |
| 3 | Loops re-asking "what service"; collects address/phone BEFORE a service is identified | Restored guest prefill (address/phone) makes model think details are done pre-category; model drift; ordering not enforced before category lock | Open |
| 4 | (same root as 3) out-of-order card collection | - | Open |

---

## Fix plan (smallest → largest blast radius)

### Fix A - Name greeting (close residual gap) - SAFE
The extractName disable already exists in working tree. Two small additions:
1. **Purge stale value:** in `loadGuest()` / `readGuestPrefill()`, drop `contactName`
   (and `contactNumber`) that were never confirmed via the contact card. Cleanest:
   stop persisting name/phone to `msvc_guest_prefill` unless set by the explicit
   contact-card confirm path (`accumulatePrefill` from [chat-widget.component.ts:2099/2816](../../frontend/src/app/shared/chat-widget.component.ts)).
2. **Guard the greeting:** before showing "is this {name}?", validate `name` is a
   plausible single capitalised token AND came from a confirmed source; otherwise fall
   back to the anonymous greeting.
- Files: `frontend/src/app/shared/chat-widget.component.ts` only.
- Risk: low. No backend change (disable already staged).

### Fix B - Budget false-positive - SURGICAL
1. Run `extractBudget()` on **user text only**, not `allText` (exclude assistant
   replies) - mirrors the same lesson already applied to name extraction.
2. Optionally require an explicit currency/budget anchor (drop the bare-number
   `1000 budget` alt if too loose).
3. Frontend: do NOT pre-select a budget bracket from an unconfirmed `budgetMax`;
   show the slider neutral until the user picks, so no number reads as "assumed".
- Files: `backend/src/services/chat.service.ts` (extractBudget call site ~line 1679),
  `frontend/.../chat-widget.component.ts` (`loadBudgetRanges` preselect ~line 2386).
- Risk: low-medium. Confirm the 1000 source first (add a one-off log or reproduce).

### Fix C - Flow loop + ordering - LARGER (touches refactor)
1. Enforce **service-first**: while no category is locked, suppress restored
   address/phone/budget cards and don't let the model collect Step 3+ fields.
2. Tighten anti-loop: `nextStepBlocks` already prevents dead-ends post-category; add
   a pre-category guard so a confirmed-service path always advances.
3. Prompt: reinforce "never collect a later step before the service is locked."
- Files: `chat.service.ts` (system prompt + sendToAi gating), `chat-widget.component.ts`
  (card rendering gated on `categoryId`).
- Risk: **higher** - overlaps the in-progress 2598-line chat-widget refactor. Do this
  AFTER that refactor lands/commits, or coordinate to avoid clobber.

---

## Recommended order
1. Commit/land the existing working-tree refactor first (or confirm it's safe).
2. Fix A (name) - ship standalone.
3. Confirm budget-1000 source, then Fix B.
4. Fix C last, on top of the settled refactor.

## Open question before coding
- Confirm exact source of "1000": reproduce with the same transcript, or grep the
  stored session for the budget write. Don't theorize-and-patch (per repo debugging rule).
