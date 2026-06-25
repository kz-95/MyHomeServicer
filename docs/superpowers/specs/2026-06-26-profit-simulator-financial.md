# Provable Financial Correctness + Profit Simulator

> 2026-06-26. Status: spec (not built). Goal: **actual-proven**, not demo-proven.
> Decisions locked: full stack on a proven base; revive BOTH promotions (marketing)
> and points (loyalty) for real; platform fee 20% (`platform_fee_rate`=0.20).

## Philosophy

A number is only "actual proven" if it **reconciles against the real ledger**. We do
not ship a simulator on assumption data, then hope the engine is right. We fix the
money engine until one invariant holds for every real booking, prove it with tests,
then build the dashboard, budget gate, and simulator on top of numbers we trust.

## The reconciliation invariant (the proof gate)

For every completed booking, and summed across all bookings in a period:

```
customerPaid  =  servicerReceived  +  platformKept  +  govtSST  +  gatewayTook
platformKept  =  platformFee  −  promoCost  −  registeredDiscount  −  gatewayFee  (+ urgentShare)
SUM(platformKept) over period  ==  platform balance change in the ledger (transactions)
```

Points are accounted separately as a **liability booked at issuance** (Σ points
issued × `1/redemption_rate`), a period-level cost line in `netMargin`. Redemption
of a points voucher is NEUTRAL to per-booking `platformKept` — it draws down the
already-booked liability, so it is never counted twice. (Promos, by contrast, are
realized per-booking at payback.)

When this passes in an automated test against seeded real bookings (including tipped,
urgent, promo-applied, points-redeemed, gateway-paid, SST-registered cases), the
financials are actual-proven. Everything else (dashboard, simulator) is a view on it.

## Verified current state — why the invariant fails today (2026-06-26 forensic trace, 2 rounds)

| Gap | Evidence | Effect on invariant | Severity |
|-----|----------|---------------------|----------|
| Tip double-counted on pay-now payout | `servicerPayout = amount − fee + tip − urgent`, `amount` already includes tip (booking.jobs.ts:243; escrow set booking.service.ts:222) | `platformKept` wrong; platform fee leaks on tipped jobs | CRITICAL |
| Urgent fee double-dip | `platformFee` computed on `afterPromo` which includes urgent fee (line-item at booking.service.ts:150-157). Then `splitUrgentFee()` takes ADDITIONAL 20% (booking.jobs.ts:238). Platform collects (X% + 20%) not 20%. | Platform overcharges on every urgent booking. At 20% fee rate, platform takes 40% of urgent fees | CRITICAL |
| `platform_fee_rate` silent default conflict | Seed data sets 0.20 (static.ts:2408). In-code default is 0.05 (settings.service.ts:10). Tests mock 0.05 (noshow-jobs.test.ts:72). Seed runs at 0.20 = 4x tested rate. | All tested fee math runs at 5%; production silently runs at 20%. Booking fees 4x higher than tests assert | CRITICAL |
| Promo engine inert | `evaluatePromotions()` never called (promotion.service.ts:31; zero imports across codebase) | `promoCost` = 0 (unprovable; flow never runs) | HIGH |
| Promo discount stubbed at booking | `resolveProposalPromo()` returns 0 (booking.service.ts:1429) | promo/points discounts never apply | HIGH |
| Promo payback on wrong table | writes `servicerCreditLog` type `promo_payback` (admin.jobs.ts:67), not `transactions` | `promoCost` won't SUM from the ledger | HIGH |
| Gateway cost untracked | full `gateway_payment` recorded, no fee deducted (booking.service.ts:1173) | `gatewayFee` invisible; `platformKept` overstated | HIGH |
| `registered_customer_discount` not a tracked cost | applied at quote.service.ts:280 (~15%, live) but never recorded as platform cost | `platformKept` overstated | HIGH |
| Dashboard urgent fee timing mismatch | `urgentFeeRevenue` FROM `booking.createdAt` vs `urgentFeePlatformShare` FROM `transaction.created_at` (admin.service.ts:116-139). Days apart on slow escrow release. | Urgent fee numbers never reconcile in single period. Estimate fallback masks real values | HIGH |
| Budget display-only | `spentAmount` incremented post-payout, no pre-check (admin.jobs.ts:78) | spend unbounded | HIGH |
| Two fee engines | escrow release = `computeFees` FeeRule (booking.jobs.ts:226); gateway/credit = flat `computePlatformFee` (booking.service.ts:976) | fee math inconsistent across paths | HIGH |
| computeFees ignores activeFrom/activeTo | FeeRule schema has temporal fields but `getApplicableFeeRules` query ignores them (fee-engine.service.ts:41-52). Future-dated rules activate immediately. | FeeRules can't be scheduled; admin changes hit live instantly | MEDIUM |
| Points silently lost on DB failure | Points awarded fire-and-forget outside $transaction (booking.service.ts:502,510). `.catch()` logs but never retries. | Points permanently lost if DB write fails after booking marked complete | MEDIUM |
| Points config cache never invalidates | `getPointsConfig()` module-scoped cache (points.service.ts:64-76). Admin changes require server restart. | Point rate changes don't take effect until restart | MEDIUM |
| 4 dashboard cost lines missing | `promoCost`, `gatewayFee`, `pointsCost`, `registeredDiscount` absent from `getDashboardFinancial` return (admin.service.ts:342-357) | Dashboard only sees revenue, never costs. Net margin unprovable | MEDIUM |

## Money formula (validated, reused by sim + reconciliation)

Both the engine and the simulator use the SAME functions (money.ts `computeTotal`,
`computePlatformFee`) plus the FeeRule engine where it applies.

```
servicerPrice   = orderValue − servicerDiscount               (servicer-funded; no platform cost)
afterPromo      = servicerPrice − platformCoupon − registeredDiscount   (platform-funded; clamp ≥ 0)
platformFee     = computeFees(afterPromo, 'booking', categoryId)  (FeeRule; flat fallback = feePct × afterPromo)
escrowTotal     = afterPromo + serviceCharge + sst + tip       (= computeTotal().total)
customerPays    = escrowTotal
gatewayFee      = gatewayPct × customerPays + gatewayFixed      (Stripe cut; pay-now/gateway only)
platformRevenue = platformFee + urgentShare
platformCost    = platformCoupon + registeredDiscount + gatewayFee   (points NOT here — booked as issuance liability, separate period line)
platformKept    = platformRevenue − platformCost
servicerReceived= escrowTotal − platformFee − urgentShare      (tip+SST inside escrowTotal; matches booking.jobs.ts:243 AFTER tip fix)
breakEvenFeePct = platformCost / afterPromo                    (closed form; guard afterPromo > 0)
```
Platform-funded reductions (`platformCoupon`, `registeredDiscount`) are BOTH platform
cost AND shrink the fee base. `servicerDiscount` is servicer-funded (no platform cost,
still lowers fee base). SC/SST/tip are pass-through to servicer/govt.

## Phases (dependency-ordered)

```
P1 Foundation fixes ─┬─> P2 Revive promo + points (real, ledger-routed)
                     │
                     └─> P3 Reconciliation test harness ──> PROOF GATE
                                                              │
                                  ┌───────────────────────────┤
                                  ▼                           ▼
                          P4 Real-data dashboard      P5 Budget enforcement
                                  │                           │
                                  └─────────────┬─────────────┘
                                                ▼
                                       P6 Profit simulator (side-by-side)
```

### P1 — Foundation correctness (~8h, expanded after 2-round forensic audit)
- Fix tip double-count: `booking.jobs.ts:243` drop `+ tip` (amount already includes tip from escrow creation). Also fix refund paths: `booking.jobs.ts:71` and `booking.service.ts:1362`.
- **Fix urgent fee double-dip**: back out urgent fee from `feeBase` before computing `platformFee`, so platform only gets the 20% split, not regular-rate PLUS 20%.
- **Fix `platform_fee_rate` default conflict**: align seed data (static.ts:2408) with in-code default (0.05) OR align tests to 0.20. Decision needed — current state is silent drift.
- Add `computeFees` unit tests (fee-engine.test.ts: fallback, single rule, category scope, cap, priority, NaN/Infinity guards).
- Unify ALL 4 flat fee sites onto `computeFees` (booking.service.ts:976, dispatch.service.ts:278, invoice.service.ts:97+225). Remove redundant `getPlatformFeeRate()` calls. Deprecate `computePlatformFee` (@deprecated + ESLint). Add try/catch in `computeFees` for graceful DB error fallback.
- Fix `computeFees` to honor `activeFrom`/`activeTo` in `getApplicableFeeRules` query.
- Add `gateway_fee` + `registered_customer_discount` + `promo_cost` + `points_liability` to TransactionType enum.
- Seed `gateway_fee_pct` (0.034) + `gateway_fee_fixed` (1.00) settings.
- Record `gateway_fee` txn at settlement (booking.service.ts).
- Record `registered_customer_discount` txn at quote.service.ts:280.
- Record `points_liability` txn at 3 award sites (points.service.ts). Move points award inside $transaction (booking.service.ts:502,510).
- Fix promo payback: add `recordTransaction` at admin.jobs.ts:67.
- Fix points config cache: invalidate on admin settings change.
- Add `evaluatePromotions` unit tests (6-8 cases covering trigger types + condition matching + usage limits).
- Reconciliation harness: cases 1-4,7,8 (baseline, tip, urgent, gateway, SST, pay_later).
- Fix dashboard `urgentFeePlatformShare` to use consistent time anchor with `urgentFeeRevenue`.
- Add 4 cost-line fields to `getDashboardFinancial` return: `promoCost`, `gatewayFee`, `pointsCost`, `registeredDiscount`.

### P2 — Revive promotions + points (both real)
- Call `evaluatePromotions()` at trigger points (signup, first booking, topup); promo discount actually applied; cost routed to `transactions` (new type `promo_cost`), not `servicerCreditLog`.
- Un-stub `resolveProposalPromo` / `resolvePromoDiscount` so promo + points vouchers apply real RM at checkout and at invoice.
- Points: **full-liability at ISSUANCE** — when points granted (welcome/earn/review/referral), record liability = points × `1/redemption_rate` to `transactions` (type `points_liability`); budget reserves at issuance. Redemption voucher discounts the real bill but draws DOWN the booked liability — neutral to per-booking margin, never double-counted.
- Enforce existing `maxUses`/`maxPerUser` (currently dead code in the inert engine).

### P3 — Reconciliation test harness (THE PROOF)
- Seed bookings covering every case: plain, tipped, urgent, SST-registered, tax-inclusive, promo-applied, points-redeemed, gateway-paid, registered-discount.
- Automated test asserts the invariant per booking AND in aggregate, reconciling to the `transactions` ledger within RM0.01.
- This test is the gate: P4/P5/P6 do not start until it passes.

### P4 — Real-data dashboard (actuals)
- `GET /admin/financial/actuals` extends `getDashboardFinancial`: real `platformRevenue`, `promoCost`, `pointsCost`, `registeredDiscount`, `gatewayFee`, `netMargin`, `avgOrderValue`, `orderVolume` — all now backed by real ledger rows (no `tracked:false` placeholders once P2 lands).
- Dashboard surfaces a Net Margin card + cost lines.

### P5 — Budget enforcement (unified promotional-spend budget)
- Make `PlatformMarketingBudget` a real gate: atomic `reserveAndCommit(cost)` checks `spent + cost ≤ total` BEFORE granting (promo payout, points issuance valued at `1/redemption_rate`, voucher redemption). Global pool + optional per-promo `maxBudget`.
- Exhaustion: stop granting, promo flips `active=false`. Welcome points gated (grant 0 when budget dry).

### P6 — Profit simulator (side-by-side, on proven base)
- `GET /admin/financial/simulate` pure function over the validated formula.
- Side-by-side REAL (locked actuals from P4) | SIMULATE (live sliders), delta on every move:

```
PROFIT SIMULATOR
┌─ REAL (this month) ──────────┬─ SIMULATE (what-if) ─────────────┐
│ Avg order      RM 100        │ Order value  [======·····] 100   │
│ Platform fee   20%           │ Platform fee [=======····] 25%   │
│ Gateway        3.4% + RM1    │ Gateway      [==·········] 3.4%  │
│ Promo spend    RM 1,850      │ Coupon       [===········] RM 10 │
│ Points cost    RM 600        │ Servicer disc[====·······] RM 15 │
│ Reg. discount  RM 2,100      │ Reg. disc    [====·······] 15%   │
│ Volume         312 orders    │ Volume       [======·····] 312   │
│ ───────────────────────────  │ ──────────────────────────────  │
│ Net margin     RM 3,790      │ Net margin   RM 5,350  ▲ +1,560  │
│                              │ Break-even fee: 16.2%            │
└──────────────────────────────┴──────────────────────────────────┘
   Sankey / sensitivity heatmap / campaign sim render full-width below, driven by SIMULATE
```
- "Load actuals" seeds sliders from P4. Slider changes debounced ~300ms. Sandbox only — never writes settings.

## Acceptance criteria (per phase)
- **P1**: tipped pay-now booking keeps platform fee (reconciles); `gateway_fee` + `registered_customer_discount` txns recorded; one fee path.
- **P2**: a promo and a points voucher each take real RM off a real booking; cost lands in `transactions`; maxUses/maxPerUser enforced.
- **P3**: reconciliation test passes for all seeded cases, per-booking and aggregate, within RM0.01. **Gate.**
- **P4**: dashboard net margin = ledger-summed revenue − all costs; reconciles to P3.
- **P5**: budget RM100 grants exactly RM100 then stops (atomic, no race past cap); welcome points gate at exhaustion.
- **P6**: simulate == engine for matching inputs (flat path, or FeeRule banner); break-even correct; "Load actuals" seeds from real data.
- All: `npx tsc --noEmit` clean (backend+frontend); money fields `Decimal`; sim never persists; inputs clamped.

## Testing
| Layer | What | Count |
|-------|------|-------|
| Unit | formula, break-even, fee paths, points→RM, budget cap | +10 |
| Integration | promo applies real RM; points applies real RM; budget refuses at cap; tip payout correct | +6 |
| **Reconciliation** | the invariant, all seeded cases, per-booking + aggregate | +1 harness |
| E2E | admin sees true margin; runs promo within budget; simulator loads actuals | +2 |

## Rollback
P1/P2 touch live money paths — ship behind care, each independently revertable. New txn types + settings are additive. Budget gate disabled by leaving `promo_budget_total` unset (treats as unlimited = current behavior). Simulator is read-only.

## Effort (honest — this is an epic)
- P1 foundation: ~8h
- P2 revive promo + points: ~10h (two subsystems, real money paths)
- P3 reconciliation harness: ~5h
- P4 real dashboard: ~5h
- P5 budget enforcement: ~6h
- P6 simulator (per-order + break-even + Sankey + heatmap + campaign): ~10h
- Total ~42h (~1.5-2 weeks solo). Proof gate (P1-P3) ~21h delivers "our numbers are actually correct" before any UI.

## Risks
- P1/P2 alter live payout + discount logic — regression risk on real money. The reconciliation harness (P3) is the safety net; build it alongside, not after.
- Reviving promo/points means real platform spend starts flowing — P5 budget gate should land close behind P2 so spend isn't unbounded in the interim.

## Out of scope
- `/rewards/tiers` 404 fix (one-liner, money-settings.component.ts:672) — do separately.
- Top-up promo-bar UX polish — separate spec.
- CLV / CAC / conversion modeling — no data source.

## Decisions resolved (2026-06-26)
1. **Fee path** → unify all 5 call sites onto `computeFees` (flat fallback = no behavior change today; one provable engine).
2. **Points cost timing** → issuance-only (full liability); redemption draws down the liability, neutral per-booking.
3. **Gateway rate** → settings keys `gateway_fee_pct` + `gateway_fee_fixed` (editable in money-settings).

No open decisions remain. P1 is executable.

## Decisions resolved (2026-06-26 plan-eng-review)

All 10 review findings resolved via interactive plan-eng-review. P1 scope expanded.

### P1 revised scope (was ~6h, now ~5h)
| # | Task | Files |
|---|------|-------|
| 1 | Fix tip double-count: `booking.jobs.ts:243` drop `+ tip` | 1 line |
| 2 | Add `fee-engine.test.ts` (5-6 cases: fallback, single rule, category, cap, priority) | new file |
| 3 | Unify 4 flat fee sites -> `computeFees` (booking.service.ts:976, dispatch.service.ts:278, invoice.service.ts:97+225) | 3 files |
| 4 | Remove redundant `getPlatformFeeRate()` calls; deprecate `computePlatformFee` (@deprecated + ESLint) | money.ts + .eslintrc |
| 5 | Add `gateway_fee` + `registered_customer_discount` + `promo_cost` + `points_liability` to TransactionType enum | schema.prisma |
| 6 | Seed `gateway_fee_pct` (0.034) + `gateway_fee_fixed` (1.00) settings | seed.ts |
| 7 | Record `gateway_fee` txn at settlement (booking.service.ts) | 1 file |
| 8 | Record `registered_customer_discount` txn at quote.service.ts:280 | 1 file |
| 9 | Record `points_liability` txn in 3 award functions (points.service.ts) | 1 file |
| 10 | Fix promo payback: add `recordTransaction` at admin.jobs.ts:67 | 1 file |
| 11 | Add `evaluatePromotions` unit tests (6-8 cases) | new/modified test file |
| 12 | Reconciliation harness: cases 1-4,7,8 (~5 integration tests) | new file |

### Decisions locked
| # | Finding | Decision |
|---|---------|----------|
| A1 | Tip double-count | Fix now |
| A2 | 4 flat fee sites | Unify all 5 onto computeFees |
| A3 | Gateway fee untracked | Full: enum + settings (3.4%+RM1) + txn |
| A4 | Promo payback routing | Add recordTransaction now |
| A5 | Registered discount untracked | New enum value + txn |
| CQ1 | computePlatformFee importable | @deprecated + ESLint rule |
| CQ2 | evaluatePromotions 0 tests | 6-8 unit tests in P1 |
| CQ3 | Points liability unspecified | Full issuance liability |
| T1 | computeFees 0 tests | fee-engine.test.ts before migration |
| T2 | Reconciliation harness unspecified | 8 cases incremental (P1: 1-4,7,8) |

Review conducted by CEO/Orchestrator (read-only). Full review in `docs/ai-context/logs/ceo-log.md` Session 2026-06-26 01:02.

### Forensic audit findings (2026-06-26 rounds 1-2)
Round 1 (plan-eng-review): 5 structural gaps confirmed — tip double-count, dead promo engine, promo payback routing, registered discount untracked, gateway fee untracked.
Round 2 (adversarial code audit): 7 additional gaps found — urgent fee double-dip (CRITICAL), platform_fee_rate silent drift (CRITICAL), dashboard urgent fee timing mismatch (HIGH), 4 dashboard cost lines missing (MEDIUM), points fire-and-forget loss (MEDIUM), points config cache stale (MEDIUM), computeFees ignoring activeFrom/activeTo (MEDIUM).

Full audit logged in `docs/ai-context/logs/ceo-log.md` Session 2026-06-26.
