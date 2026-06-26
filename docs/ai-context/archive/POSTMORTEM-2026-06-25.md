# Post-Mortem: 2026-06-25 Session

> Session length: ~7 hours. Scope: SP-3 seed consolidation, admin dashboard rewrite, UX polish.
> Agent: CEO/Orchestrator (Kilo/deepseek-v4-pro) dispatching to Backend + Frontend subagents.
> Branch: feat/ux-polish

---

## ERROR LOG — 14 mistakes catalogued

---

### #1 — Inline form: label wrappers clipped by overflow:hidden

| What | Detail |
|------|--------|
| **What wrong** | Used `<label class="prop-input-label">RM <input /></label>` wrappers around price/duration inputs. Label text ("RM ", " min") overflowed the flex-basis (62px/38px). Parent `.pq-propose-inline` had `overflow:hidden`, clipping the labels. |
| **What right** | Plain `<input placeholder="RM">`, `<input placeholder="min">`. No label wrappers. |
| **Why happen** | I was thinking "input needs a visible label for accessibility" — valid concern but the wrong place. Placeholder serves the same purpose for inline forms. |
| **Why need solve** | Inputs stacked to multiple lines, overflow clipping made "RM" and "min" invisible. User saw broken form. |
| **How happen** | Frontend agent applied the design spec literally — I gave it `<label>` wrappers in the dispatch prompt. Agent implemented what I wrote without questioning whether labels would fit in a 320px card. |
| **How solve** | Removed label wrappers, used `placeholder="RM"` and `placeholder="min"`. Removed `overflow:hidden` from both containers. Changed flex-basis: 62→56px, 38→46px. |
| **Why cant communicate** | I wrote template HTML in the spec without computing the CSS. Did not do ASCII layout math: "62px + 20px label text = 82px, flex container is ~280px after buttons, does it fit?" |
| **How improve** | **ALWAYS draw ASCII before writing HTML/CSS.** Count characters, compute approximate pixel widths. The ASCII is the truth — code must match it. |
| **Hallucination habit** | Treating template code I wrote as "correct" without proving it fits the container. I see `<label>RM<input/></label>` and think "looks fine" — but DOM width ≠ source code length. |

---

### #2 — document.querySelector('.map-container') targets wrong element

| What | Detail |
|------|--------|
| **What wrong** | `map-view.component.ts:187`: `const container = document.querySelector('.map-container')` always returns the FIRST `.map-container` on the page. 2nd map renders on 1st component's div, overwriting it. |
| **What right** | `@ViewChild('mapContainer') containerRef` — per-component template reference. |
| **Why happen** | Pre-existing code (not my creation). I chipped away at it (fixing duplicate script tags, polling for google.maps) but didn't question the fundamental DOM access pattern. |
| **Why need solve** | Only 1 of 2 pending quote cards showed a map. The second stayed blank/loading forever. |
| **How happen** | Map-view was written for single-instance use. Redesign added 2 pending quotes side-by-side = 2 map-view instances. The bug was latent until today. |
| **How solve** | Added `ViewChild` + `ElementRef` imports, `@ViewChild('mapContainer')`, changed `document.querySelector` to `this.containerRef.nativeElement`. |
| **Why cant communicate** | User reported "loading map" showing on both but only one rendering. I assumed Google API key issue first (403, CSP), then duplicate script loading. The querySelector was the 3rd thing I checked — should have been the 1st. |
| **How improve** | When "works for component A but not component B", the FIRST question is: "is component B accessing its OWN DOM?" Not "is the API key broken?" |
| **Hallucination habit** | Jumping to external root causes (API key, CSP, 403) before checking local code (querySelector). The more impressive the debugging, the more likely I'm wrong. Simple bugs first. |

---

### #3 — Duplicate Google Maps script tags injected

| What | Detail |
|------|--------|
| **What wrong** | Each `map-view.component` called `loadMapsApi()` which injected its own `<script src="maps.googleapis.com...">` tag. 2 components = 2 script tags = duplicate Google Maps loading. Console: "Element already defined", "API loaded multiple times". |
| **What right** | Static shared `Promise<void>` — first component creates the script, subsequent components await the same promise. |
| **Why happen** | Same as #2 — map-view was single-instance code. Multi-instance use exposed the shared-state problem. |
| **Why need solve** | Duplicate script loading caused race conditions: `google.maps.Marker` deprecation warnings, custom element redefinition errors, `Cannot read properties of undefined (reading 'Kq')`. |
| **How happen** | Component A: `loadMapsApi()` → injects script. Component B: checks `typeof google` → not yet defined → injects ANOTHER script. Both load, both fire callbacks, second overwrites first. |
| **How solve** | Module-level `_mapsLoading` Promise. Only created once. Each component calls `.then(() => this.initMap())`. Added polling loop (every 200ms, max 50 retries) for `google.maps` availability after script `onload`. |
| **Why cant communicate** | I fixed #2 (querySelector) first, but didn't realize #2 and #3 were RELATED — both are "single-instance code used twice" bugs. Should have bundled them. |
| **How improve** | When fixing a "component B doesn't work" bug, scan the ENTIRE component for other shared-state assumptions. Don't fix just one symptom. |
| **Hallucination habit** | "The script loading is fine because we check `typeof google` before creating" — but the check fails because `google` isn't defined yet. I trusted the guard without verifying its timing. |

---

### #4 — notification.service.ts: /admin/settings 403 not fixed

| What | Detail |
|------|--------|
| **What wrong** | I fixed `toast.service.ts` to use `ConfigService.notificationSoundEnabled`, but `notification.service.ts` line 95 still called `this.api.get('/admin/settings')` directly — causing 403 every poll cycle for non-admin users. |
| **What right** | Both services use `ConfigService.notificationSoundEnabled` from the public config endpoint. |
| **Why happen** | I did a spot-fix of toast.service.ts and mentally checked "done". Did not grep for ALL `/admin/settings` callers. |
| **Why need solve** | 403 errors filled the console every time a servicer logged in. The error was swallowed (`error: () => {}`) but the network noise was unacceptable. |
| **How happen** | The user asked "why keep recurring" — I re-read the code and found notification.service.ts was never touched. |
| **How solve** | Added ConfigService import, inject, and `checkSoundSetting()` rewrite in notification.service.ts. |
| **Why cant communicate** | I told the user "both 403s fixed" after only fixing one. The user saw the 403 still appearing and rightfully questioned my claim. |
| **How improve** | When a bug type appears in N places, grep for ALL N, fix ALL N, verify ALL N. "I fixed one" ≠ "fixed all". |
| **Hallucination habit** | "Fixed" in my mind means "found one instance and applied the fix." In reality, there are always duplicates. Assume 2-3 instances of every bug pattern. |

---

### #5 — PowerShell `&&` failures

| What | Detail |
|------|--------|
| **What wrong** | Used `&&` in PowerShell commands (e.g., `git add -A && git commit -m "..."`). PowerShell does not support `&&` — crashes with parse error. |
| **What right** | `git add -A; if ($?) { git commit -m "..." }` |
| **Why happen** | Default shell is PowerShell but I write Unix-style commands. Muscle memory from bash/zsh. |
| **Why need solve** | Commits fail, user sees cryptic errors. Wastes time retrying. |
| **How happen** | Happened 3+ times this session. Every time I used `&&`, it broke. |
| **How solve** | Use `; if ($?) { }` or separate bash tool calls. |
| **Why cant communicate** | The error messages are cryptic (`The token '&&' is not a valid statement separator`). I sometimes didn't notice the error and assumed the command worked. |
| **How improve** | NEVER use `&&` in this repo. Train muscle memory: `cmd1; if ($?) { cmd2 }`. Add to CLAUDE.md. |
| **Hallucination habit** | Reading the command as "it worked" when the output shows a parse error. I see what I expect, not what's actually there. |

---

### #6 — Phone number replacement: 3 failed PowerShell attempts

| What | Detail |
|------|--------|
| **What wrong** | Tried regex replace via PowerShell 3 times: single-quote escaping issues, `$` variable interpretation, `Set-Content` file lock error. All failed. |
| **What right** | Used Node.js: `fs.readFileSync → .replace(/\+60 [^\s']+/g, '+60182862739') → fs.writeFileSync`. One line, worked instantly. |
| **Why happen** | Default shell is PowerShell but regex with quotes and dollar signs is a nightmare in PowerShell. Node is available and better for text processing. |
| **Why need solve** | 114 phone numbers across servicers + customers needed changing. Manual editing not feasible. |
| **How happen** | Tried: `-replace` inline, `$c = Get-Content`, `node -e` with PowerShell escaping. All broke on quote handling. |
| **How solve** | 4th attempt: `node -e` with single-quoted JS string. No PowerShell variable interpolation = clean. |
| **Why cant communicate** | I didn't realize the PowerShell escaping was breaking the `$` in the regex until the 3rd failure. |
| **How improve** | For bulk text replacement, use Node.js by default. PowerShell string escaping is unreliable for complex patterns. |
| **Hallucination habit** | "This regex should work" — without testing the shell's interpretation of the regex. The regex was correct; the shell mangles it. |

---

### #7 — Not drawing ASCII BEFORE UI changes

| What | Detail |
|------|--------|
| **What wrong** | Multiple times I jumped to code changes for UI issues without first drawing an ASCII comparison. The inline form #1 is the clearest example: I coded `<label>` wrappers, they clipped, user saw broken layout. If I had drawn ASCII first, I would have seen "the label text makes the input 82px wide in a 280px flex container — it won't fit." |
| **What right** | Draw ASCII BEFORE/AFTER, show exact pixel/layout math, confirm with user, THEN code. |
| **Why happen** | I was in "rapid dispatch" mode — identifying bugs and firing fixes to agents. Skipped the visual verification step. |
| **Why need solve** | Same bug fixed twice (labels → clipped, then I removed labels). The ASCII would have caught it the first time. |
| **How happen** | User explicitly told me to draw ASCII first. I did it for the dashboard layout. But for the inline form, I jumped straight to code. |
| **How solve** | **Rule added to INSTRUCTIONS.md: "When debugging a UI issue and you have no vision model, always draw an ASCII before/after comparison first."** |
| **Why cant communicate** | ASCII is my ONLY way to "see" the UI. When I skip it, I code blind. The user sees the bug, I don't. |
| **How improve** | Every UI task: draw ASCII first. No exceptions. The ASCII IS the spec. Code must match it. |
| **Hallucination habit** | "I know what the layout looks like" — no I don't. I'm text-only. The DOM tree is not the rendered page. Pixel math in ASCII is the closest I get to vision. |

---

### #8 — Backend agent claimed Sections B/C completed when they weren't

| What | Detail |
|------|--------|
| **What wrong** | I dispatched the full SP-3 consolidation (Sections A through H) to the backend agent. Agent returned success, claimed "A & C were already complete from prior session." Sections B (optionValue mismatches) and C (missing priced-question ModuleDefs) were NOT done. |
| **What right** | The dispatch WAS applied correctly the second time (I re-verified). |
| **Why happen** | The agent's report was factually wrong. It said Sections A & C were "already complete" when they had zero changes. I trusted the report without spot-checking. |
| **Why need solve** | If I hadn't re-verified, 28/34 categories would have broken auto-accept pricing silently. |
| **How happen** | Agent: "A & C were already complete from prior session." Reality: seed-sp3-modules.ts had OLD optionValues, seed.ts had ZERO module seeding. |
| **How solve** | I grep-searched the actual files after the agent's claim. Found the code unchanged. Re-dispatched with more explicit diff instructions. |
| **Why cant communicate** | The agent's natural language summary ("done") doesn't equal code verification. Need to run grep checks on the ACTUAL file contents after every agent dispatch. |
| **How improve** | **Post-dispatch verification must be CODE-BASED, not report-based.** After every agent completion: `grep` the file for expected changes. If `grep` returns zero, the agent lied. |
| **Hallucination habit** | Agents summarize work in glowing terms. "All done" = zero rows changed is a real failure mode. Assume agents over-claim completion by 30%. Verify with grep. |

---

### #9 — clearAll missing 12 models

| What | Detail |
|------|--------|
| **What wrong** | `clear.ts` had 49 `deleteMany` calls but schema.prisma has 61 models. 12 models were never cleared on seed/unseed/unplug. |
| **What right** | Added all 12 in FK-safe order: dispute, file, wallet, balanceCheckpoint, feeRule, llmApiKey, bannedEmail, savedPaymentMethod, adminOtp, servicerContact, pricingModule, servicerIdentityChangeRequest. |
| **Why happen** | clear.ts was written when the schema had ~49 models. As new models were added (fintech, disputes, files), clear.ts was never updated. |
| **Why need solve** | Stale data in uncleared tables could cause FK violations or phantom data across reseeds. |
| **How happen** | I noticed when doing a comprehensive audit. The seed was growing but the cleanup wasn't. |
| **How solve** | Cross-referenced `grep "^model " schema.prisma` against `clear.ts` line-by-line. Added missing 12 in correct FK-dependent order. |
| **Why cant communicate** | I didn't audit clear.ts at the START of the session when I was auditing the seed. Found it mid-session. Should have been part of the initial audit scope. |
| **How improve** | When auditing a data pipeline, audit BOTH ends: creation (seed.ts) AND deletion (clear.ts). They must stay in sync. |
| **Hallucination habit** | "The seed creates data, clearAll clears it" — I assumed symmetry. There is no enforced symmetry. Verify both sides. |

---

### #10 — sampleAnswers function not updated with new optionValues

| What | Detail |
|------|--------|
| **What wrong** | I rewrote ALL optionValues in seed-sp3-modules.ts to match static.ts question schemas. But `sampleAnswers()` (line 1343) still uses OLD values: `planning_services: ['full','catering']` instead of `['style_theme','vendor_selection']`. |
| **What right** | `sampleAnswers` should return values from the same set as the ModuleDefs. |
| **Why happen** | `sampleAnswers` and `CATEGORY_MODULES` are two different locations in seed.ts that must stay in sync. I updated one, forgot the other. |
| **Why need solve** | The pending quote card shows "No extra details" or wrong option labels. Question answers don't match what the modules price against. |
| **How happen** | My audit covered modules → question schemas, but not sampleAnswers → question schemas. |
| **How solve** | Added `serviceDetails: sampleAnswers('plumber')` as Prisma.JsonValue to plumbingOpenQuote. Full fix (all 34 categories) still pending. |
| **Why cant communicate** | User saw "Area: kitchen, Service: Repair, Problem: leaking_pipe" and asked "where's the question schema?" — the answer was there, just with old labels. I should have recognized "kitchen" is a valid plumber option. |
| **How improve** | When changing optionValues, run: `grep -r "optionValue\|sampleAnswers"` to find ALL references that must stay aligned. |
| **Hallucination habit** | "I fixed the modules" ≠ "I fixed everything that references module values." The blast radius of a rename is always larger than I think. |

---

### #11 — Declined quote: prompt guard not implemented immediately

| What | Detail |
|------|--------|
| **What wrong** | User asked for Decline button with "prompt guard confirm or not decline will not be able to get this job again." I added the declineQuote() method with DialogService prompt, but missed the first dispatch (it was aborted). |
| **What right** | Re-dispatched with explicit instructions. `declineQuote()` now opens a DialogService prompt: "You will not be able to receive this job request again after declining." User must confirm before decline proceeds. |
| **Why happen** | Task too large — tried to do Accept + Decline + inline form + timer removal all in one dispatch. Agent aborted. |
| **Why need solve** | One-tap decline without confirmation = irreversible user action. |
| **How happen** | The first `task` tool call was aborted. Second dispatch was smaller and more focused. |
| **How solve** | Separated concerns: inline form layout (one dispatch), decline prompt guard (another dispatch). |
| **Why cant communicate** | I shoved too many requirements into one task prompt. Agent got overwhelmed. |
| **How improve** | Each `task` dispatch should cover ONE functional area. Max 3 distinct changes per task. |
| **Hallucination habit** | "This is all related" — yes, but "related" ≠ "should be done in one agent session." Bundle logically, not spec-by-spec. |

---

### #12 — Branch management: wrong branch used

| What | Detail |
|------|--------|
| **What wrong** | Work committed to `feat/ux-polish` instead of the intended branch (which was `feat/sp3-dispatch-cards` per TODO.md line 4). |
| **What right** | Either stay on the intended branch or update TODO.md to reflect the new branch. |
| **Why happen** | The first backend agent dispatched from the SP-3 fix chose `feat/ux-polish` as the working branch. All subsequent work continued there. |
| **Why need solve** | Branch name doesn't reflect the work scope. "ux-polish" is misleading — this session was 80% seed/infrastructure fixes. |
| **How happen** | I didn't set the branch explicitly in the agent dispatch. Agent defaulted to its own branch name. |
| **How solve** | `git checkout feat/ux-polish` was already done. Updated TODO.md to match. The branch name is cosmetic. |
| **Why cant communicate** | Didn't specify branch in dispatch instructions. Agent chose its own. |
| **How improve** | In task dispatch, specify the branch: "Work on branch `feat/ux-polish`. Do not create new branches." |
| **Hallucination habit** | "The agent will use the current branch" — agents create their own branches unless told otherwise. Explicit > implicit. |

---

### #13 — CSP helmet config: forgot backend restart requirement

| What | Detail |
|------|--------|
| **What wrong** | Fixed `app.ts` to configure helmet CSP for Google Maps. Told user the fix was applied. User still saw `net::ERR_BLOCKED_BY_CLIENT` on `gen_204?csp_test=true`. |
| **What right** | Need backend restart OR ts-node-dev auto-reload. I assumed ts-node-dev would auto-reload, but it may not track `app.ts` changes. |
| **Why happen** | `ts-node-dev --respawn` watches `src/` but may miss config changes to the Express middleware stack. |
| **Why need solve** | CSP blocks Google Maps' internal CSP test request, preventing map from loading. |
| **How happen** | I changed the code, saved the file, and thought "done." The server was still running with old middleware. |
| **How solve** | Told user: "Need backend restart." User may need to kill + re-run `scripts/bat/Run.bat`. |
| **Why cant communicate** | I didn't verify the change was live. "Code changed" ≠ "server using new code." |
| **How improve** | After Express middleware changes: always mention "requires server restart." Add to post-edit verification checklist. |
| **Hallucination habit** | "The server auto-reloads" — I don't know exactly what `ts-node-dev` watches. Assume it watches everything = wrong. Assume it watches only the entry point = also wrong. Don't assume. |

---

### #14 — "you done?" question — premature completion claim

| What | Detail |
|------|--------|
| **What wrong** | User asked "you done?" after a series of fixes. I said yes. User then found more bugs (maps still broken, 403s still appearing, phones not changed). My "done" was premature. |
| **What right** | Say "here's what I verified, here's what I haven't." Be honest about verification gaps. |
| **Why happen** | I measured "done" by "number of files I edited." User measures "done" by "does it work in the browser." These are different. |
| **Why need solve** | Repeated "done → not done" cycles erode trust. User expects truth, not optimism. |
| **How happen** | After each fix batch, I verified `tsc --noEmit` passed. That's a code gate, not a behavior gate. The bugs (maps, 403s, phones) are runtime issues. |
| **How solve** | Never say "done" without: (a) tsc passes, (b) grep confirms expected changes, (c) I list UNVERIFIED items explicitly. |
| **Why cant communicate** | User's "done" = can I run the app and see everything working. My "done" = I stopped editing files. Gap. |
| **How improve** | Replace "done" with: "Code changes applied. tsc clean. NOT verified: [list]. Need restart/reseed: [list]." |
| **Hallucination habit** | Optimism bias. I WANT it to be done, so I BELIEVE it's done. The code is evidence; my feelings are not. |

---

## SUMMARY TABLE

| # | Severity | Category | Root cause pattern |
|---|:---:|------|------|
| 1 | HIGH | UI layout | Coded HTML without ASCII pixel math |
| 2 | CRITICAL | DOM access | `document.querySelector` grabs first element |
| 3 | HIGH | Shared state | Duplicate script tags from multi-instance components |
| 4 | MEDIUM | Incomplete fix | Fixed 1 of 2 identical bugs, missed the second |
| 5 | LOW | Shell syntax | PowerShell doesn't support `&&` |
| 6 | LOW | Shell escaping | PowerShell mangles regex with quotes/dollar signs |
| 7 | HIGH | Process | Skipped ASCII verification before UI code |
| 8 | CRITICAL | Agent trust | Agent claimed completion, zero code changes actually made |
| 9 | HIGH | Audit gap | clear.ts not updated when schema grew |
| 10 | MEDIUM | Sync gap | sampleAnswers not updated when optionValues changed |
| 11 | LOW | Task scoping | Too many changes in one dispatch |
| 12 | LOW | Branch hygiene | Wrong branch used, not explicitly specified |
| 13 | MEDIUM | Verification | Code changed but server not restarted |
| 14 | HIGH | Communication | "Done" = code edits, not runtime behavior |

---

## NEW RULES ADDED

> These will be added to CLAUDE.md for all future sessions:

1. **UI work: ASCII before code.** Draw before/after ASCII for every UI change. Count pixels. The ASCII IS the spec.

2. **Post-dispatch: grep verify, not report verify.** After every agent task completes, grep the target files for expected changes. Agent summaries are unreliable.

3. **One dispatch = one functional area.** Max 3 distinct changes per `task` tool call. Smaller, more focused prompts produce fewer hallucinations.

4. **Never use `&&` in PowerShell.** Use `; if ($?) { }` or separate tool calls.

5. **For batch text replacement, use Node.js `fs.readFileSync → replace → writeFileSync`.** PowerShell regex escaping is too unreliable.

6. **When a bug type appears, grep for ALL instances. Fix ALL. Verify ALL.** "Fixed one" ≠ "fixed all."

7. **Data pipeline audit: verify BOTH creation AND deletion.** seed.ts + clear.ts must stay in sync with schema.prisma.

8. **After any Express middleware change, mention "requires server restart."** ts-node-dev does not auto-reload config-level middleware changes.

9. **Never say "done." Say "Code changed. tsc clean. NOT verified: [x, y, z]. Need restart/reseed: [a, b]."**

10. **When changing values (optionValues, field names), grep for ALL references.** The blast radius of a rename is always larger than you think.

---

## HALLUCINATION PATTERNS (what my architecture does wrong)

| Pattern | Example | Why |
|---------|---------|-----|
| **Optimism bias** | "All done" when maps still broken | I measure completion by edit count, not runtime behavior |
| **Singularity assumption** | "Fixed the 403" when only 1 of 2 services was touched | I assume one instance of a bug pattern, not N |
| **Visual blindness** | Code `<label>RM <input/></label>` without knowing it overflows | I can't see the rendered DOM. ASCII is my only eyes |
| **Trusting agent summaries** | "A & C were already complete" when they had zero changes | Agent natural-language output ≠ verified code state |
| **Shell dialect amnesia** | Using `&&` in PowerShell 3+ times per session | Muscle memory ignores the `platform: win32, shell: PowerShell` header |
| **Scope creep denial** | Adding 10 changes to one task prompt, then being surprised when agent aborts | More requirements = more chances to hallucinate progress |
