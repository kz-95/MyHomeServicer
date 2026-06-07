# Orchestration Plan — 1 Claude (plan + QA) + 3 Kilo (execute)

> How the work in `ceo-overview.md`, `money-listing-epic-spec.md`, `calculation-audit.md`,
> and `TODO.md` gets executed. **2 Claude plan + QA; 3 Kilo Code agents edit.**
> Maps onto the CLAUDE.md agent model. Created 2026-05-27.

---

## 1. Roles — 2 Claude + 3 Kilo

| Agent | Tool | Role | Scope | Writes log |
|---|---|---|---|---|
| **Claude-1** | Claude Code | CEO/Orchestrator **+ Money/Backend QA** | plans, dispatches, owns specs/TODO; QA gate for backend + the money invariant + integration | `logs/ceo-log.md` |
| **Claude-2** | Claude Code | **Frontend/UX QA + test matrix** | dogfoods user flows (browse), visual/design QA, frontend build verification, defines the test-case matrix + e2e/integration QA harness | `logs/qa-log.md` |
| **Kilo-1** | Kilo Code | Backend | `backend/` only | `logs/backend-log.md` |
| **Kilo-2** | Kilo Code | Frontend | `frontend/` only | `logs/frontend-log.md` |
| **Kilo-3** | Kilo Code | DevOps | `.github/`, Docker, env, scripts, `db push`, migrations | `logs/devops-log.md` |

Neither Claude does **feature editing** — only TODO/CEO docs, QA verification, and QA-harness/
e2e scripts. Each Kilo edits **only its scope** and writes **only its own log**
(single-writer rule). **Claude-1 owns TODO.md and dispatch; Claude-2 owns the qa-log + the
test matrix.**

---

## 2. Source of truth & coordination

- **Specs (read-only for Kilo):** `money-listing-epic-spec.md` (the epic), `ceo-overview.md`
  (§10–§19 designs), `calculation-audit.md` (money invariants), `frontend/STYLE-RULES.md`.
- **Task assignment:** Claude writes each task into `logs/ceo-log.md` (who / what / which spec
  section / Definition of Done) and provides a copiable prompt. Kilo reads its task there + the
  referenced spec.
- **TODO.md** is the shared status board. To avoid 3-way merge churn, **only Claude ticks
  TODO** (during the QA gate). Kilo reports done in its own log.
- Each Kilo reads `CLAUDE.md` + its `.kilo/agents/<role>.md` + its ceo-log task. Nothing else
  until the task needs it.

---

## 3. Definition of Done + QA gate

A Kilo task is "done" only after the agent runs and reports:
- Backend: `npx tsc --noEmit` clean (+ relevant `backend/tests` for money tasks).
- Frontend: `npx ng build --configuration development` exits 0 (not just tsc — AOT gate).
- DevOps: the script/migration runs clean; `db push` follows the CLAUDE.md DLL-lock protocol.

Then a **Claude runs the QA gate** before accepting — routed by domain:
- **Backend / money tasks → Claude-1:** re-run `tsc` + backend tests; assert the **invariant**
  `escrow-charged == invoice-total == fee-recorded` across pay_now/pay_later/cash × promo on/off
  × SST reg/not × inclusive/exclusive; backend integration QA.
- **Frontend / UX tasks → Claude-2:** re-run `ng build`; dogfood the user flow (browse),
  visual/design QA, accessibility spot-check; confirm against the test matrix.
- Either Claude: **accept** → report to Claude-1, who ticks TODO + merges + dispatches the next;
  or **return with findings** to the same Kilo. The two Claudes can QA different agents'
  output **in parallel**.

---

## 4. Git / scope hygiene

- **Branch per agent** (e.g. `kilo/backend-epic`, `kilo/frontend-indep`, `kilo/devops`). Today
  there is one branch; the moment two agents edit concurrently they MUST be on their own
  branches. Claude-1 reviews + merges at the QA gate.
- **For true parallelism, separate working trees** — `git worktree add ../ms-backend
  kilo/backend-epic` (one folder per agent), or separate clones. A single working directory
  can only sit on one branch, so 3 Kilo in one folder = chaos.
- The money/ledger/escrow code is edited by **Kilo-1 only**, **one step at a time** — never two
  agents in that code at once.
- Shared files (TODO.md, schema.prisma) have a single owner: TODO → Claude-1; schema → Kilo-1
  (Kilo-3/DevOps runs the `db push`).

### Push tool (`Git-Commit-Pusher.bat`) — agent-friendly
Repurposed for non-interactive agent use (auto-rebases so concurrent pushes aren't rejected):
- **Agent on its own branch:** `Git-Commit-Pusher.bat "WIP: <what changed>"` — commits + rebases
  + pushes the current branch, no prompts, no pause.
- **First time / switch branch:** `Git-Commit-Pusher.bat "msg" kilo/backend-epic` — creates or
  checks out the branch, then commits + pushes.
- **Human:** run with no args — it prompts for the message and pauses at the end.
- On rebase conflict it stops and pushes nothing (exit 1) — the agent resolves, then re-runs.
- `Git-Puller.bat` still handles pull/clone for setup.

---

## 5. Phased work assignment (dependency-aware)

### Phase 1 — parallel, no cross-dependencies
- **Kilo-1 (Backend):** epic steps 1–2 — schema additions + the **canonical `computeTotal()` +
  unified `platformFee()`** functions with unit tests (spec §2–§3, §6). Foundation; nothing
  else money-correct can land first.
- **Kilo-2 (Frontend):** the **independent** hand-offs (don't touch the epic money model) —
  P1 UI/UX a11y+touch, P2 icon system, P2 reduced-motion, servicer-logo avatars (§16.1),
  servicer listing **card** redesign (§11).
- **Kilo-3 (DevOps):** stale `/servicer` link fix, time-slots single-source, **Stripe keys/env**
  setup, `db push` support for Kilo-1's schema, keep CI green.
- **Claude:** QA each as it lands; tick TODO; dispatch next.

### Phase 2 — the epic core (Backend leads, Frontend follows contracts)
- **Kilo-1 (Backend):** epic steps 3–8 in order — proposal line items → accept/escrow charge →
  done/settle/release (one fee path) → invoice (itemized, canonical) → pricing modules CRUD →
  Stripe server. Tests at each step.
- **Kilo-2 (Frontend):** epic frontend — §17 sectioned listing form composing modules, §13
  4-step quote form (Bill step), business-details form + tax config, pay-later settlement UI,
  line-item UI — each gated on the matching backend contract landing.
- **Kilo-3 (DevOps):** Stripe webhooks + idempotency infra, migrations, deploy config.
- **Claude:** QA gate with the money invariant after every backend step; integration QA at the end.

### Phase 3 — review-gated finishers
- §17 admin identity-change review queue (Kilo-1 + Kilo-2), final integration QA (Claude),
  then the post-MVP items (admin thumbnails, customer photos) when you greenlight.

---

## 6. The dispatch loop (per task)

```
Claude-1 writes task → ceo-log.md (+ copiable prompt)
        │
   you paste into the target Kilo
        │
   Kilo executes in its branch → runs DoD checks → writes its log "done"
        │
   QA gate (Claude-1 if backend/money, Claude-2 if frontend/UX): rebuild/test + invariant + dogfood
        │
   pass → Claude-1 ticks TODO + merges + dispatches next
   fail → return findings to the same Kilo (loop)
```
Because QA is split, **Claude-2 can verify a frontend task while Claude-1 dispatches/QAs a
backend task** — the two planning agents run concurrently.

---

## 7. Requirements / setup checklist (what YOU need to do)

1. **Author the 3 Kilo role files** `.kilo/agents/{backend,frontend,devops}.md` — each stating:
   its scope (folder), "read your task in `logs/ceo-log.md` + the referenced spec", its
   single-writer log, the Definition of Done, and "edit only your scope; never touch TODO.md
   (Claude owns it)".
2. **Confirm the log paths** — after the docs reorg the logs live in `docs/ai-context/logs/`.
   Point each role file there.
3. **Create the agent branches** (`kilo/backend-epic`, `kilo/frontend-indep`, `kilo/devops`)
   or agree a branch-per-task convention; decide how merges happen (Claude reviews).
4. **Stripe account + test keys** for the gateway (Kilo-3 wires env; needed before epic step 8).
5. **A shared run env** so Claude's QA gate can actually run the app/tests (backend + `ng serve`
   + DB) to verify each task.
6. **Pasting discipline** — one task per Kilo at a time; wait for Claude's QA pass before the
   next, especially in the money epic (sequential).

**Status: ORCHESTRATION PLAN READY.** Phase-1 dispatch prompts are issued by Claude on request.
