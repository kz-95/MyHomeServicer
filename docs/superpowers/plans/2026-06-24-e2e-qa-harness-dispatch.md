# E2E QA Harness - CEO Dispatch

> Generated: 2026-06-24 19:17 MYT
> Branch: feat/sp3-dispatch-cards
> Working tree: DIRTY - multiple uncommitted changes. Do NOT commit.
>
> **Read first (in order):**
> 1. `docs/superpowers/specs/2026-06-24-e2e-qa-harness.md` - 29-scenario design
> 2. `docs/superpowers/plans/2026-06-24-e2e-qa-harness-build.md` - 32-task build plan
> 3. `docs/superpowers/plans/2026-06-24-remaining-items-dispatch.md` - existing pending work (DO NOT re-dispatch)
> 4. `TODO.md` - current project state

---

## What to Dispatch

The build plan has 32 tasks. Grouped below with ESTIMATE + CUTOFF per task.
CUTOFF = estimate + 5 min. If a task hits its cutoff without completing,
the agent must STOP, report a blocker to the CEO log, and the CEO either
extends the cutoff or flags the task for manual intervention.

### GROUP A - Infrastructure (est. 1h 10m, cutoff 1h 55m)

| Task | Description | Agent | Estimate | Cutoff |
|------|-------------|-------|----------|--------|
| Pre-flight | backend + frontend compile, seed, dev | ALL | 5 min | 10 min |
| 1 | Install Playwright + scaffold config | DevOps | 10 min | 15 min |
| 2 | Build StepLogger | Backend | 20 min | 25 min |
| 3 | Build auth helpers | Frontend | 15 min | 20 min |
| 4 | Build DB check helpers | Backend | 15 min | 20 min |
| 4b | Build seed helpers | DevOps | 5 min | 10 min |

### GROUP B - Wiring (est. 15m, cutoff 25m)

| Task | Description | Agent | Estimate | Cutoff |
|------|-------------|-------|----------|--------|
| 5 | Socket watcher + window.__SOCKET__ expose | Frontend | 15 min | 20 min |

> ⚠ **GROUP B BLOCKER:** If socket watcher cannot intercept events
> after cutoff, use Playwright `network.route()` as fallback. Do NOT
> spend more than 5 extra minutes debugging the `window.__SOCKET__`
> approach.

### GROUP C - Template (est. 45m, cutoff 1h)

| Task | Description | Agent | Estimate | Cutoff |
|------|-------------|-------|----------|--------|
| 6 | Build Scenario 1 (full happy path) | QA | 45 min | 50 min |

> ⚠ **GROUP C BLOCKER:** If Scenario 1 does not pass end-to-end
> within cutoff, the remaining 28 scenarios cannot be built.
> Fix the root cause before proceeding.

### GROUP D - Remaining 28 scenarios (est. 5h 40m, cutoff 7h 25m)

| Sub-group | Scenarios | Agent | Estimate | Cutoff |
|-----------|-----------|-------|----------|--------|
| D1 | 02, 02b, 02c (dispatch variants) | QA | 40 min | 55 min |
| D2 | 03 (urgent same-day) | QA | 15 min | 20 min |
| D3 | 04 (escrow shortfall) | QA | 10 min | 15 min |
| D4 | 05 (admin dashboard financial) | QA | 15 min | 20 min |
| D5 | 06, 07, 08 (offline + cancel + pts) | QA | 40 min | 55 min |
| D6 | 09-15 (auth, validation, reg, PIN) | QA | 80 min | 110 min |
| D7 | 16-20 (guest, autoacc, cal, img, AI) | QA | 70 min | 95 min |
| D8 | 21-28 (hours, multi-svcr, rate-limit) | QA | 80 min | 110 min |
| D9 | 29 (seed integrity) | QA | 10 min | 15 min |

> ⚠ **GROUP D BLOCKER:** If a sub-group's scenarios all fail with
> the same root cause, collate failures into one fixer dispatch
> instead of dispatching per-scenario. The auto-fix loop in
> Group E will catch individual remaining failures.

### GROUP E - Closing (est. 2h, cutoff 4h - AUTOMATED via /e2e-fix)

> **2026-06-26 UPDATE:** Task 31 (auto-fix loop) is now automated via the
> `/e2e-fix` Kilo command. See `.kilo/commands/e2e-fix.md`.
> The manual `auto-fix-loop.ps1` is preserved as fallback.

| Task | Description | Agent | Estimate | Cutoff |
|------|-------------|-------|----------|--------|
| 29 | Self-Review (spec coverage check) | QA | 10 min | 15 min |
| 30 | Full 29-scenario suite run | QA | 15 min | 30 min |
| 31 | `/e2e-fix` pipeline - automated fix loop | Kilo | 90 min | 180 min |

> ⚠ **GROUP E BLOCKER:** If auto-fix loop exceeds 3 hours, flag
> remaining failures for manual review. Do not loop indefinitely.

---

## Cutoff Rules

1. Start a timer when you dispatch each task. Log start time in `ceo-log.md`.
2. When a task hits its CUTOFF, the agent must:
   - Write what was completed so far to the log file
   - Write what is blocking to `ceo-log.md`
   - STOP - do not continue
3. The CEO decides: extend cutoff (if close to done), dispatch fixer, or flag for manual review.
4. Cutoffs are HARD. No task should consume unbounded time.

---

## Overall Timeline

| Phase | Start | End (worst case) |
|-------|-------|------------------|
| Group A | 19:17 | 21:12 |
| Group B | 21:12 | 21:37 |
| Group C | 21:37 | 22:27 |
| Group D | 22:27 | 05:53 (Thu) |
| Group E | 05:53 | 09:53 (Thu) |
| **COMPLETE** | | **09:53 MYT Thu 2026-06-25** (worst case) |

**Best case (all estimate, no fixer loops):** ~04:17 MYT Thu 2026-06-25

---

## Expected Outcome

1. All 29 E2E scenarios passing green (0 failures, 0 warnings).
2. Evidence under `logs/e2e-qa-harness_XXXXX_HHMM/`:
   - Per-scenario `.log` files (incremental, crash-proof)
   - Per-step screenshots (`scenario-XX-step-NN.png`)
   - `.fixer-prompt.txt` per failed scenario
3. All helpers committed and reusable.
4. Playwright config: `workers=1`, chromium, headless.
5. `auto-fix-loop.ps1` tested on at least 1 scenario.

---

## Rules

- Groups A-E are STRICTLY SERIAL.
- Sub-groups D1-D9 are SERIAL (workers=1, shared DB).
- Build plan IS the source of truth. Do NOT let agents invent approaches.
- One fix per dispatch in auto-fix loop. No batching unrelated fixes.
- Track all progress in `docs/ai-context/logs/ceo-log.md`.
- Do NOT commit anything until Group E complete OR explicitly told.
- If any task hits cutoff, log it and move to the next task - do NOT let one stuck task block the entire pipeline. Return to it after the remaining tasks in the group are done.

---

## Pre-Flight (19:17–19:27 MYT, cutoff 19:27)

Run these BEFORE dispatching Group A:

- [ ] backend:  `rtk npx tsc --noEmit` (in `backend/`)
- [ ] frontend: `rtk npx tsc --noEmit` (in `frontend/`)
- [ ] seed:     `npm run db:reset && npm run seed:test` (in `backend/`)
- [ ] dev:      `npm run dev` (in `backend/`)
- [ ] serve:    `ng serve` (in `frontend/`, port 4200)

Any pre-flight failure → fix BEFORE Group A. Log to `ceo-log.md`.
