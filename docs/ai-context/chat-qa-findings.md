# Chat QA — findings from ChatQA_Log_192409062601 (2026-06-09)

Run was **with** the new deterministic card-confirm change (the "Ok, got it." acks are the
new fixed ack). The booking still reached the review card (PASS, 14 steps), so card-confirm
did not regress the flow. But the run surfaced real issues. Ranked by what's safe to fix vs
what needs your decision / live reproduction.

Scenario: `slang/impatient/reject_first/address_first/rojak` — "I want to repaint my living
room", address front-loaded, budget low, this Sunday evening.

---

## A. RESOLVED — chose A-full + C (2026-06-09)

Added **Painting, Moving, Gardening** as real categories, each with its own question schema
(non-essential questions `required: false` = C, deterministic skippable). repaint→Painting,
movers→Moving, lawn→Gardening now map by name and ask relevant questions. Apply with
`npm run db:reset`. Original analysis kept below for reference.

## A (original). Needs a PRODUCT decision (not a code bug)

### A1 — Repaint maps to Renovation, then asks demolition questions (judge HIGH + MED)
The prompt's disambiguation rule maps "repaint" → **Renovation**. But Renovation's
`questionSchema` asks `project_type (Full home)`, `scope (Hacking/Demolition)`,
`property_status`, `size` — all wrong for a simple wall repaint. The customer ("nothing
fancy, just the standard job") is funnelled through demolition questions.

**Options (your call):**
1. Add a **Painting / Repaint** child category with its own short questionSchema (repaint
   color, room count, wall condition). Cleanest; repaint stops borrowing Renovation's form.
2. Make Renovation questions **conditional** on `project_type` (repaint path skips
   hacking/demolition). More schema work.
3. Re-map repaint to a better-fitting existing service.

Recommend **option 1** (new Repaint category) — matches how customers think and removes the
mismatch at the source.

---

## B. Real flow bugs — need LIVE reproduction before a safe fix

These touch the fragile quote flow; per "reproduce, don't theorize" I did NOT blind-patch
while away. Reproduce with one run, then fix.

### B1 — Budget shows 0 on the /quote/new form (judge HIGH)
User picked "RM 300–1000" on the budget card (`confirmBudget` should set
`budgetMin:300, budgetMax:1000`), but the FORM CHECK shows `budget=0`. The value is lost
between the chat prefill and the /quote/new form.
- **Traced (code read, needs runtime confirm):** chat `confirmBudget` accumulates
  `budgetMin/budgetMax/budgetIndex`; `submitPrefill` encodes them into the `?prefill=`
  query param. The form (`quote-form.component.ts`) decodes it, copies `budgetMin/budgetMax`
  into `reorderPrefill` ([:1424](../../frontend/src/app/customer/pages/quote-form.component.ts#L1424)),
  then `matchPrefillBudget()` ([:1447](../../frontend/src/app/customer/pages/quote-form.component.ts#L1447))
  re-derives the slider index by `ranges.findIndex(r => r.min===budgetMin && r.max===budgetMax)`.
  budget=0 ⇒ one of: (a) prefill lacked budgetMin/Max, (b) the exact range no longer exists
  in the form's `budgetRanges` (so findIndex = -1, index stays default/empty), or (c)
  `budgetRanges` hadn't loaded at the form (the budget group then doesn't render at all).
  Note: `quote-form.component.ts` was modified by the code-simplifier in the working tree —
  check whether that pass altered `matchPrefillBudget`/`loadBudgetRanges`.
- **Fastest fix candidate:** carry the chosen `budgetIndex` straight through instead of
  re-matching by min/max (the index is already in the prefill from `confirmBudget`). Confirm
  with a live run first.
- Repro: book any service, pick a budget, submit review, inspect the `?prefill=` param +
  the form's budget slider.

### B2 — Free-text address up front leaves structured fields empty → form blocked
`address_first` persona gave "6 jalan ss15/4, subang jaya, 47500" in the first message. It
was captured as `street` only; `addressNo`, `postcode`, `propertyType` stayed empty, so
/quote/new is **blocked at page 2** ("Please fill in all required fields").
- The chat address CARD requires all four sub-fields, but a free-text address never fills
  them. Either parse the free-text address into no/postcode/type (hard, geocode), or always
  show the address card so the structured fields are collected even if a raw string exists.
- Repro: start with the full address in the opening message, drive to review, open the form.

### B3 — contactNumber card re-shown after a free-text number (judge MED, COSMETIC)
User typed the phone in free text mid-card; the number **was** captured (form shows
`phone=+601809635364`), but the card re-appeared because the free-text value isn't marked
collected client-side until the backend echoes a valued card. Value is correct → cosmetic.
Low priority.

---

---

## Update — second run (ChatQA_Log_210509062601, 3 scenarios, all FAIL)

Stronger evidence. The richer log (timestamp + SENT/RECV + DATA per turn) is now shipped
(see C2) so the NEXT run will show these at the data level.

### B1 confirmed — the form reads the budget INDEX, not the amount
Run 1 picked "RM 100–200" and the form showed **`budget=1`** — that's the slider **index
(1)**, not the ringgit value. Runs 2 & 3 showed `budget=0` (index 0 / unset). So the budget
amount is being represented by its bracket index and the value is lost. Strongly supports
the **carry `budgetIndex` straight through** fix — and confirms it's a real, consistent bug
(every run), not a one-off.

### NEW — language leaks between scenarios (HIGH)
Run 3's persona is **English**, but the bot replied entirely in **Chinese** (好的…, full
Chinese prose) — Run 2 (zh) ran just before it. The conversation language (`convoLang` /
the pinned `lang`) is not reset between QA scenarios, so Chinese bled into the English run.
- Likely: `convoLang` is computed from message history and state isn't fully cleared, or the
  pinned `lang` persists. Reproduce, then ensure language resets on `clear()` / new scenario.
- Real-user impact: if a session's language can stick wrongly, a real customer could get
  answered in the wrong language. Worth fixing beyond the harness.

### `unconfirmed: timeSlot` is mostly a HARNESS false-positive
Runs 1 & 3 failed on "timeSlot in review but never collected via a card." But the user gave
the time as free text ("tonight" → night) and the form shows `time=night` correctly. The
value is legit; the harness only credits card confirms + the 35% free-text-field path, so a
time captured via the opening/date free-text isn't credited. Fix the CHECK: credit a field
that matches the scenario's intended value even if it arrived by free text.

### Service mismatch is broader than painting (the A1 family)
movers → **Carpenter**, lawn trimming → **Renovation**, repaint → **Renovation** — each then
asks that category's irrelevant questions. This is the same A1 decision: either add real
categories (Moving, Gardening, Painting) or stop force-matching tenuous services / make
questions skippable. Product call.

> **RESOLVED (2026-06-09):** chose A-full + C — added Painting/Moving/Gardening categories
> with their own skippable question schemas. Plus the **reject/stall** case (run 3: rejected
> Moving → bot looped in text) is fixed: a selection-phase reply that names a service but
> emits no card now gets that service's `quote_options` injected server-side.

---

## C. Done this session (safe, verified)

### C1 — Harness: sometimes TYPE a custom answer to service questions
`chat-qa-harness.ts` now answers service questions by **typing a natural sentence** ~40% of
the time (routed through the LLM) instead of always tapping the option — exercises the bot's
free-text→question mapping and better mimics real customers ("nothing fancy"). Ramblers keep
the random-option behaviour. Compile-verified; behaviour needs a harness run to confirm.

### C2 — Richer QA log: timestamp + frontend↔backend REST + actual data per turn
The log now shows, per turn:
```
[HH:MM:SS] USER: ... [cards]
[HH:MM:SS] BOT : ... [cards]
  > SENT collected=[...] data={...} cardConfirm=… cat=… lang=…   (what the FRONTEND sent)
  < RECV reply="…" cards=[…]                                       (what the BACKEND returned)
  = DATA cat= date= time= addr= no= postcode= type= budgetMax= budgetIndex= name= phone=  (actual prefill)
```
The widget records each `/chat` request body + response into `qaRestLog` (QA-runs only,
capped, cleared per scenario); `QaHost.restLog()` exposes it; the harness `flush()` emits the
trace. This makes B1 (budgetMax vs budgetIndex), the language leak, and the timeSlot
false-positive visible at the data level on the next run — no more guessing. Compile-verified.

---

## Update — run ChatQA_Log_000810062601 (10 scenarios, 9 FAIL) + fixes (2026-06-10)

9/10 FAIL looked catastrophic, but the SENT/RECV/DATA trace (C2) pinned the causes —
~half were harness artifacts, ~half real chat bugs. Two real bugs fixed this session.

### FIXED — language pinned across customers (the dominant failure)
`clear()` wiped quote state + prefill but NOT `convoLang`, so a fresh scenario inherited
the previous thread's language. Scenario 8 (English persona) sent `lang=zh` on its FIRST
message → bot replied 100% Chinese, looped 4× on the address card, FAIL. Real production
bug, not just harness: any customer following a zh/ta user got the wrong language.
- **Fix (`chat-widget`):** `clear()` and a "no, not me" identity answer reset `convoLang`
  to `en`; "yes it's me" / "continue last session" re-derive it from the restored thread
  (`deriveConvoLang`). Build-verified.

### FIXED — typed "yes" never locked the category (killed the typing-only personas)
`maybeTextConfirmCategory` (the deterministic text-confirm backstop) already existed but its
regex was **English-only and anchored to the first word**. So `yes pls go ahead` locked fine
(scenario 8, `cat=set`) but `对，就是这个` / `ya correct lah` / `ya that one` did not — the
typing_shortcut / typing_adhd personas (who never tap) looped forever while the bot kept
saying "please tap the card" and even hallucinated "confirmed" without setting `categoryId`
(scenarios 1, 7, 10).
- **Fix:** widened the regex to multilingual affirmatives (zh 对/没错/就是这个, ms ya/betul/
  boleh, ta ஆம்/சரி), de-anchored it (tolerates a leading "eh boss," / "ya"), added negation
  + short-message guards (so "yes but I need a plumber" can't mis-lock), and routed the
  typed lock through the same card-confirm short-circuit as a tap (deterministic ack + next
  cards, no LLM). Only fires when exactly ONE service card is pending. Build-verified.

### Still open (known, not fixed this run)
- **B1 budget=0 on the form** — every FORM CHECK still shows `budget=0` (form reads the
  slider `budgetIndex`, not the amount). Next.
- **i18n card labels** — `quote_question` labels render English-only in zh/ta runs
  ("What are you moving?", "Gate/door type?"). Booking still progressed; cosmetic-ish.
- **Harness `no-transcript` (10/10)** — the LLM judge got no transcript so every JUDGE line
  is empty; inflated the FAIL count. Harness-reporting gap, not chat quality. The
  SENT/RECV/DATA trace already answers "why" without the judge.
- **2 cards + typing-only** — when the bot offers two services, a type-only user can't
  disambiguate by affirmation (correctly not auto-locked). Edge; deprioritized.

---

## Suggested order when you're back
1. Decide **A1** (new Repaint category vs conditional questions).
2. Run the harness once (now with C1) to reproduce **B1** + **B2** deterministically.
3. Fix B1 (budget) and B2 (structured address) with the live evidence.
4. B3 only if it still annoys after B1/B2.
