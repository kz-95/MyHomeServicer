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

### FIXED — budget=0 on the form for a free-text amount
B1 root cause found: a budget given as free text ("rm1580") carries `budgetMax` but no
bracket `budgetIndex`, and the guest form's exact min/max match failed → it silently fell
to bracket 0 (the lowest) and submitted the wrong budget (scenario 3: RM1580 → `budget=0`).
- **Fix (`guest-quote`):** `matchChatBudgetBracket` resolves the bracket against the loaded
  ranges — explicit in-range index if the chat carried one, else the bracket that CONTAINS
  the amount (or the highest open-ended bracket if it exceeds them all), else bracket 0.
  Replaces the old `applyChatBudget` (which only carried a raw index and couldn't validate
  it). Build-verified. NOTE: the authed `quote-form.component.ts` has the same exact-match
  bug (`matchPrefillBudget`) — apply the same contains-fallback there.

### FIXED — harness flagged every run "no-transcript"
The judge-gate tested `/^(USER|BOT)\b/`, but transcript lines are timestamped
(`[HH:MM:SS] USER: ...`) since the C2 trace landed — so the marker is never at column 0 and
EVERY run was flagged "no-transcript", the LLM judge was skipped, and the FAIL count
inflated. Fixed the regex to `/^\[\d{2}:\d{2}:\d{2}\]\s+(USER|BOT)\b/`. Build-verified.

### Still open (known, not fixed this run)
- **i18n card labels** — `quote_question` labels render English-only in zh/ta runs
  ("What are you moving?", "Gate/door type?"). Booking still progressed; cosmetic-ish.
- **2 cards + typing-only** — when the bot offers two services, a type-only user can't
  disambiguate by affirmation (correctly not auto-locked). Edge; deprioritized.

---

## Update — run ChatQA_Log_025110062601 (1 scenario, typing_adhd) + fixes (2026-06-10)

The prior fixes verified live: JUDGE now produces real verdicts (no-transcript gone),
`budgetMax` captured, `lang=en` held, "ya that one" locked the category. But this run
exposed three serious bugs in the field-collection flow.

### FIXED — free-text address never registered → address card looped forever (鬼打墙)
The backend DELIBERATELY refused to extract a free-text address (`chat.service.ts`: "Address
is NOT pre-filled from text extraction"). So a typing-only customer who typed their address
5× never had it registered — `nextStepBlocks` kept returning the address card, the bot
re-emitted it every turn and lied "I've noted that address" while `addr=-`.
- **Fix:** new `extractAddress()` (conservative — needs a 5-digit postcode or a street
  marker + number) credits the typed address as a valued `quote_field:address` card; the
  frontend accumulates it into prefill so it registers and the card stops. Unit-tested
  (5 cases). The structured sub-fields (No./postcode/type) are still the known B2 gap
  (form-side), but the LOOP is gone.

### FIXED — cards stacked / out-of-order (3-4 cards per turn)
The reconciliation INJECTED the deterministic next card but kept the model's stacked future
cards too (e.g. `contactName + contactNumber` emitted while the address was still pending →
4 cards at once, flow looks stuck). Added a **deterministic collapse**: during field
collection, keep a `quote_field`/`quote_question` card only if it's the actual next step OR
carries a just-captured value; show the review only when base fields + questions are done.
Card-confirm turns are unaffected (they short-circuit earlier). The existing valid-key filter
also drops hallucinated questions (e.g. a stray "area" card for a Plumber job).

### FIXED — harness checks: added "not-registered" (the "not picking up info" signal)
`duplicate` and `looping` detectors already existed; added **`not-registered`** — a field the
user PROVIDED (tapped or typed, so it's in `confirmedKeys`) that never landed in the prefill.
This is the precise signal for the address-loop class and now FAILs the run + tallies in the
SUMMARY breakdown (which auto-counts any `kind:` prefix).

## Update — run ChatQA_Log_031110062601 (1 scenario, zh) + i18n fix (2026-06-10)

Booking COMPLETED end-to-end (reached review + FORM page 3). All prior fixes verified live:
address registered after ONE typed line (`addr=set`, loop gone), budget mapped correctly
("RM 350+" → `budgetIndex=3`, form `budget=3`, no more `budget=0`), no card stacking,
JUDGE produced real verdicts. The ONLY structural FAIL was untranslated zh question labels.

### FIXED — quote_question card labels now localized (ms/zh/ta)
Root: category `questionSchema` had no `labelI18n`, so `pickI18n` fell back to English and
the harness flagged `language: card label not in zh`. Added `labelI18n` to the seed
question/option types, a central `QUESTION_I18N` dictionary (`prisma/seed/data/question-i18n.ts`,
561 distinct labels × ms/zh/ta), and `localizeQuestions()` wired into `seed.ts` so every
question + option carries translations. Missing entry → graceful English fallback. Applied
via `npm run db:reset`. NOTE: db:reset also wipes the LLM keys (no .env fallback) — re-add
via the admin demo.

## Update — run ChatQA_Log_103510062601 (10 scenarios) + fixes (2026-06-10)

The new `not-registered` detector earned its keep — it pinpointed the dominant failure.

### FIXED — typed contact name never registered → contactName card looped
Same class as the address loop: name was DISABLED in free-text extraction (old false
positives like "From" from "I'm from KL"), so "name's Lina" / "I'm Hafiz" / a bare "Hafiz"
never entered `collected`. The bot said "Got it, Lina!" but `name=-` and re-emitted the
name card every turn (scenarios 1 & 4 — scenario 4 FAILed `not-registered: contactName`).
- **Fix:** new `extractName` — an explicit lead-in ("my name is / name's / I'm / call me /
  saya X") always, plus a bare token ONLY once every other base field is in (the bot has
  asked for the name). First token can't be a stopword; a trailing filler ("lah") is
  dropped. Unit-tested incl. the "I'm from KL" → reject case.

### FIXED — free-text address stored with the rojak wrapper → form blocked
My earlier `extractAddress` returned the whole line, so the value became
`"eh boss, 18 jalan tempua 5 … 47100 lor, can help anot?"` and the quote form couldn't
parse a street → blocked at page 2 (scenarios 1, 2). Now it trims leading filler (up to the
first house-number/street-marker) and trailing filler (rojak particles / "can help anot"
after the postcode). Unit-tested. NOTE: structured sub-fields (No./postcode/type) still need
the **B2 frontend geocode-on-prefill** to populate from a free-text address.

### Still open after this run
- **Unsupported-service first reply not localized** — "I need a car wash" in ms/zh got the
  hardcoded English/rojak "we don't offer that" reply (scenarios 2, 4 first turn). The
  no-match fallback text needs the conversation language.
- **Category drift / prose hallucination** — bot invented "party / Event Planner" for an
  electrical job (sc.1) and drifted kitchen-sink → bathtub → Renovation (sc.3). Cards are
  deterministic now, but the prose still wanders. Prompt-level.
- **B2 structured address** — credited free-text address still needs frontend geocode to
  fill No./postcode/type for the form.

## Update — run ChatQA_Log_124410062601 + fix (2026-06-10)

### FIXED — checkbox service-question free-text never credited → card looped
`matchQuestionAnswer` only handled `number`/`quantity`/`radio`; it returned `undefined` for
`type: "checkbox"`. So a typed answer to a checkbox question (`heavy_items` for Moving,
`aircon_service` for Aircond Servicer) was never credited → `unansweredQ[0]` stayed on that
card → the bot re-emitted the SAME `quote_question` card 4+ turns → `looping` FAIL. Hit run 1
(`heavy_items`, "冰箱") and run 3 (`aircon_service`, "Unit Dinding — Pencucian Kimia"), both
FRESH runs — independent of the harness state-bleed below. Now checkbox matches like radio
across `value` + every `labelI18n` lang and returns the matched values as an **array**
(checkbox `serviceDetails` shape, e.g. `['wall_chemical']`; multi-mention "fridge and sofa"
credits both). Client already array-ready (`answerDisplay`, `isAnswered`) — backend-only.
Unit-tested (zh label, exact en label, ms label, multi-select, no-match).

### FIXED — cross-guest state leak on "not me" + harness refresh confirmed a different person
Two halves, runs 2/4/5:
- **App leak (real bug):** `confirmIdentity(false)` ("no, different person on this device")
  only cleared name/phone/address + the persisted prefill copy. The previous guest's LOCKED
  category, date, time, budget and service answers live in memory (`resolvedCards` +
  `prefillData`) and were left behind → the new person inherited a stale locked service and
  the flow looped on its card. Now it calls `resetQuoteFlowState()` for a full in-memory wipe
  (every signal + shared prefill) before `clearGuestPrefill()`. The chat thread is kept.
- **Harness (invalid test):** the ~30% "returning-guest refresh" path always tapped
  `confirmIdentity(true)`, adopting the PREVIOUS scenario's completed booking as the new
  persona. Now it compares the restored name to `scn.name`: same name → confirm + continue
  (valid same-guest restore); different → DECLINE ("not me") so the new persona starts fresh,
  and asserts the prior category did NOT leak (`categoryId` cleared). Realistic, since each
  scenario is a different customer. AOT build clean.

## Update — run ChatQA_Log_112410062601 + fix (2026-06-10)

### FIXED — typed service-question answer couldn't confirm → question card looped
`matchQuestionAnswer` compared a typed radio answer only to the option's English `value` /
`label`. After the i18n seed the cards (and customers) answer in-language ("浴缸", "Tandas",
"一间房"), which matched nothing → the `quote_question` card re-asked forever (sc.2
`area`, sc.5 `paint_scope`). Now it matches the option `value` AND every localized label
(en/ms/zh/ta), and tolerates a rojak wrapper ("eh boss, bathtub sia"). Length cap 40 → 60.
Unit-tested (zh/ms/wrapped/number). NOTE: sc.2 & sc.5 also suffered category drift (bot
re-confirming / guessing the wrong service) — that's the separate prose-hallucination issue
below; this fix only addresses the answer-can't-confirm half.

### Prose hallucination — the model still NAMES wrong services in text ("Moving"/
  "Renovation" for a plumbing job) even though the CARDS are now correct/deterministic.
  Prompt-level, not card-level. Deferred.
- **Free-text answer to a radio question** — "bathtub" typed for an "area" radio question
  isn't matched by `matchQuestionAnswer` (number/radio only) → that one question can still
  re-ask. The collapse limits it to a single card, but the match gap remains.
- **B2 structured address** — a credited free-text address still leaves No./postcode/type
  empty for the /quote form (needs frontend geocode-on-prefill).

---

## Suggested order when you're back
1. Decide **A1** (new Repaint category vs conditional questions).
2. Run the harness once (now with C1) to reproduce **B1** + **B2** deterministically.
3. Fix B1 (budget) and B2 (structured address) with the live evidence.
4. B3 only if it still annoys after B1/B2.
