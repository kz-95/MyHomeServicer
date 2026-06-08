# CEO Run Roadmap — execution backlog as orchestrator prompts

> Source of task state stays **TODO.md**. This file is the CEO *sequencing* plan:
> the open backlog cut into runs, the parallel rules, and copy-paste dispatch
> prompts for both orchestrator flavors (Claude/gstack and Kilo).
> Written 2026-06-02. Update as runs land.

## TODO.md is the ledger — this file only sequences

**Rule:** TODO.md is the single source of truth for task state (per CLAUDE.md).
Task status (`[ ]` / `[x]`) is created, changed, and recorded **only in TODO.md**.
This roadmap holds **no** task status — it only says *what order* and *which can
run parallel*. Each run below drains its anchor section in TODO.md and writes its
done-state back there. If this file and TODO.md ever disagree, TODO.md wins; fix
this file.

Run → TODO.md anchor (where each run's tasks live + get marked done):

| Run | TODO.md section to drain + update |
|-----|----------------------------------|
| R1 — BUG-4 | `🔴 BUGS — Remaining` (BUG-4 row) |
| R1 — T&C copy | `SPEC-1: Bill step redesign` → `⬜ 8-section TnC content` |
| R1 — confirmation flow | `🟡 FEATURE — Quote submission confirmation flow` (4 items) |
| R1 — sidebar §15.4 verify | `🔴 UX — Next session` → `§15.4 verify code` |
| R1 — notification UX | `🔴 UX — Next session` → Notification filters/delete/past-activities |
| R2 — pricing pass | `SPEC-2: Pricing pass per category` (+ fold customer seed txns) |
| R3 — rewards/promo | `🟡 FEATURE — Rewards + promo integration` (4 items) |
| R4 — UX polish | `🔴 UX — Next session` → topbar scroll-away, card scanline, §5.4/§7.1, payment-history align |
| R5 — retire /admin/settings | `SPEC-3` → "retire legacy `/admin/settings`" |
| R6 — compliance | `🟢 COMPLIANCE — Queued` (C-1..C-4) |

Dispatch rule both flavors: a run is not "done" until its anchor items are flipped
to `[x]` in TODO.md (with the one-line what-changed), same session as the code.

---

## Sequencing (why this order)

```
R1  →  R2  →  ( R3 ‖ R4 ‖ R5 ‖ R6 )  →  QA → design-review → demo deploy
```

- **R1 first, alone.** Small. Fixes the credit-hold number + ships confirmation
  flow + sidebar/notifications. Its own 3 tracks run parallel (built no-overlap).
- **R2 next, alone.** Pricing pass. Owns the money files (`quote.service`,
  `booking.service`) AND the database (reseed + `db push`). Can't share with R1
  (same money files) or with anything that reseeds.
- **R3–R6 in one wave** after R2 merges. Money logic is locked by then, so they
  stop fighting over the same files.

### Hard blockers (the only reasons full-parallel fails)
1. **R3 needs R2** — promo bill re-validation needs final pricing/hold numbers.
2. **DB single-writer** — only one task may `prisma db push` / reseed at a time
   (Windows DLL lock on `query_engine-windows.dll.node` → stale client → P2022).
   R2 is the sole DB owner; fold any other seed change into R2.
3. **Same-file edits** — two agents editing one file clobber each other even on
   separate branches (merge conflict). Give each shared file ONE owner.

### Shared-file owners (when R3–R6 run together)
| File | Touched by | Assign to |
|------|-----------|-----------|
| `quote-form.component.ts` | R3 (promo), R6 (top-up guard) | one frontend owner, sequence the two edits |
| `STYLE-RULES.md` | R4, R6 | one owner |
| settings components | R5 (rehome), R6 (hex) | R5 lands first, then R6 hex sweep |
| seed data | R2, (R4 customer txns) | R2 only — fold R4 seed into R2 |

---

## Shared gates + protocol (every run)

- backend: `npx tsc --noEmit` 0  +  `npx jest` (298 pass / 0 fail baseline)
- frontend: `npx tsc --noEmit` 0  AND  `ng build` exit 0 (tsc alone hides AOT breaks)
- schema/seed change: stop server → del `node_modules/.prisma/client` →
  `npx prisma db push` → restart. Reseed = `npm run db:reset` + `npm run seed:test`.
- Money = Decimal. UUIDs from Postgres. Never `req.body` → Prisma.
- Docs sync SAME session: feature→TODO.md, schema→schema-notes.md,
  endpoint→api-doc.md, each agent→its `*-log.md`.
- Commit per-task (no blanket `git add -A`), Co-Authored-By trailer. Parallel
  multi-role → own branch (backend/frontend/qa/devops) → merge master.

---

## Orchestrator translation: Claude/gstack ↔ Kilo

| Concept | Claude / gstack session | Kilo CEO orchestrator |
|---------|------------------------|----------------------|
| Who runs it | this Claude Code window | `.kilo/agents/ceo-orchestrator.md` |
| Can edit code? | dispatches agents that do | **No** — read-only, writes only `ceo-log.md` |
| Worker agents | `executor` (model=opus for money/complex) | Backend / Frontend / QA / DevOps cowork |
| Confirm scope | `AskUserQuestion` before dispatch | none — autonomous; dispatch table in `ceo-log.md` |
| Review pass | `code-reviewer` / `verifier` agent | `code-reviewer` agent + QA cowork |
| Gates + commit | the executor agent | the cowork agent on its branch |
| Dispatch record | chat + TODO.md | `ceo-log.md` dispatch table (template below) |

**Same prompt, both flavors:** the WHAT (tasks, acceptance, gates, docs sync) is
identical. Kilo drops the `AskUserQuestion` step, retargets "executor (opus)" →
the named cowork role, and writes the assignment into `ceo-log.md` instead of
chat. Cowork agents run their own gates + commit on their role branch.

Kilo dispatch-table format (per `.kilo/agents/ceo-orchestrator.md`):
```
### Task X — [description]
| Field | Value |
|-------|-------|
| Target | [Backend / Frontend / DevOps / QA] |
| Priority | [High / Medium / Low] |
| Input | [docs/files to read first] |
| Output | [expected deliverable + gates] |
| Status | ⬜ Dispatched |
```

---

## RUN 1 — locked 3-track batch (correctness + confirmation flow)

3 parallel tracks, no file overlap.

**Track 1 — Backend** (Claude: executor model=opus)
- BUG-4: credit hold uses budgetMax not estimated total. Verify the amount held
  at `createQuote()` matches `holdAmount` shown on the Bill step; fix drift.
  Reference: `GET /quotes/estimate` returns holdAmount.
- T&C copy: fill the 8-section Terms & Conditions content on `/terms`
  (route + page exist; copy unverified — SPEC-1 leftover).

**Track 2 — Frontend**
- Customer "Request Confirmed" page after `POST /quotes` (mirror guest
  `/guest/quote/success`): quote/order id, category, summary; 3s countdown →
  `/customer/quotes`.
- Guest: verify 3s countdown auto-redirect to `/` (`guest-quote.component.ts`).
- "Servicer may contact via phone/WhatsApp using the number you provided"
  disclosure on confirm + bill step; add `wa.me/<phone>` deep-link button on
  dispatch overlay / job card.
- Proposal-arrival banner if the new quote already has proposals on confirm:
  "You got N proposal(s) for #<short-id>" → link `/customer/quotes/<quoteId>/proposals`
  (NOT `/customer/proposals` — that route does not exist; see route-redesign completeness §5d).

**Track 3 — Frontend**
- STYLE-RULES §15.4 sidebar verify: `shell.component.ts` sidebar fits viewport
  (100vh − topbar); overflow nav scrolls INSIDE the sidebar
  (`nav { flex:1; min-height:0; overflow-y:auto }`), never page; footer items
  (theme toggle / sign-out) pinned outside the scroll. Fix if non-compliant.
- Notification UX batch: filters → content-type; per-item delete; past-activities
  section.

---

## RUN 2 — SPEC-2 pricing pass (SOLO; DB owner)

Spec: `docs/superpowers/specs/2026-05-31-quote-question-pricing-model-design.md`.
No other work this run. Backend-led (executor model=opus).

- Price the 29 child categories `priced:false` → true. Per-question unit pricing
  via questionSchema (priced flag + optionPriceEntry durationMin). Update seed →
  reseed (db:reset + seed:test both exit 0).
- `computePrefill`: build quantity × unit-price accumulation (qty questions shaped
  `{option: count}`). Not implemented yet.
- Inspection-first booking sub-flow: currently stubbed (TODO marker). Build it —
  `requiresInspection` categories hold the inspection fee, servicer inspects,
  then submits final quote before work proceeds.
- Non-refundable logic: travel fee non-refundable once servicer arrives (arrive
  event); inspection fee non-refundable once booking completed.
- Add/extend unit tests for qty×unit pricing + non-refundable transitions.
- **Fold here:** customer seed transactions (so seed has one writer this run).

---

## RUN 3 — Rewards + promo integration  (needs R2 merged)

Frontend-led + backend validators.

- Voucher search + one-click claim in the rewards page (search by code).
- Grey out non-applicable vouchers (min order / category / expiry vs current
  quote context).
- "Use" on a voucher prefills the promo-code field on the quote bill step.
- Bill-step promo re-validation at pay time — re-check conditions, clear error if
  no longer met.

---

## RUN 4 — UX / polish batch  (low-risk)

- Topbar scroll-away: wire shared `appAutoHide` (§7.13) to the portal topbar
  (scroll source = the scrolling content container, not window).
- Card scanline-on-load: extend the existing `bw-scan` skeleton sweep to the
  other card grids that still pop in all at once.
- STYLE-RULES leftover entries: §5.4 mobile-keyboard-push (CSS already in
  styles.css — document it), §7.1 card-scan animation rule.
- Payment-history dropdown alignment fix.
- (customer seed txns moved to R2.)

---

## RUN 5 — SPEC-3 retire legacy /admin/settings  (investigation-first)

**Phase A (read-only — report before any code):** legacy `/admin/settings` holds
4 unique tabs (Location, Thumbnails, Banned, Promotions). Map each to its
endpoints + target home (Money Settings vs UI/UX Settings vs own page). Output a
rehome plan.
**Phase B (after approval):** rehome the 4 tabs (no feature loss) → remove the
legacy route + dead component + nav entry → verify each moved tab works (PIN
gates, CRUD, search intact).

---

## RUN 6 — Compliance sweep C-1..C-4  (last)

- C-1: raw hex → CSS var in component styles (65+). No raw hex; no `var()`
  fallbacks; add missing tints to `:root` first (§2.7).
- C-2: top-up prompt guard — convert remaining `<app-modal>` to the fixed
  blocking overlay per §7.16 (backdrop no-dismiss, body scroll lock, z-index
  9999, header/footer pinned outside scroll).
- C-3: generate Gemini banner art for the 29 child categories (image-gen tool);
  wire `bannerUrl` per slug.
- C-4: add `.gitattributes` with `* text=auto eol=lf` (stop CRLF churn on Windows).

---

## Closeout (after R6 / backlog drained)

1. Full `/qa` lifecycle sweep — scenarios end-to-end in browser.
2. `/design-review` — visual polish, both themes.
3. Demo deploy — separate Railway env (`NODE_ENV=development`, throwaway DB) so
   investor demo has demo-login + seed; real prod untouched.

---

## Parked tech debt (non-blocking)

- Angular 17 → 19 XSS bump (GHSA-58c5-g7wp-6w37) — 27 high vulns, breaking major.
- Bundle 510 kB vs 500 kB budget.
- No frontend unit tests (all suites backend-only).
