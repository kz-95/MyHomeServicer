# Test Seed Redesign

> 2026-05-28 · brainstorming session · approved

## Goal

Two seed modes: one full dataset for demo deployment, one lean dataset for development iteration. Exhaustive coverage of all 8 payment timing × settlement paths across 4 tax configurations.

## Architecture

```
npm run reseed       → full dataset (demo + test, one command, deploy-and-show)
npm run reseed-test  → clear → demo seed → test seed (dev iteration, repeatable)

seed.ts              → demo layer (existing, slimmed)
seed-test.ts         → test layer (new file)
```

`seed-test.ts` is imported by `seed.ts` when the `--test` flag or `RESEED_MODE=test` env is set. `npm run reseed-test` passes that flag. Single entry point, no duplication.

## Demo layer (seed.ts)

Unchanged core — only modifications:
- M5, M9, M10 service areas: add `'KL'` to each (already done, `25691c2`)
- Remove stale `platform_charge` ref in seed-plan.md (doc sync only)
- Trim M9's 60 bulk auto-generated service listings to 3-5 (speed)

### Accounts kept

| Type | Count | Purpose |
|------|-------|---------|
| Customers | 3 | fresh, active, loyal personas |
| Admin | 1 | full access |
| Servicers | 19 | all 11 categories, varied scenarios |

### What stays

- Revenue charts (all 19 servicers + admin platform chart)
- Invoices + escrow releases for completed bookings
- Promotions (servicer + platform)
- Penalties, appeals, withdrawals, category requests
- FAQ knowledge base (56+ entries)
- Chat session (loyal customer)
- Geographic spread (KL + PJ areas)

## Test layer (seed-test.ts)

### Actors

**1 test customer:**
- Email: `test.customer@demo.internal` (backend-only, no login — `isDemo: false`)
- Address: generic KL address for service area matching

**4 test servicers:**

| Ref | SST Registered | Tax Inclusive | Service Charge | Category |
|-----|---------------|---------------|----------------|----------|
| test-s1 | false | false | 0% | plumbing |
| test-s2 | true (6%) | false | 0% | plumbing |
| test-s3 | false | true | 0% | plumbing |
| test-s4 | true (6%) | true | 0% | plumbing |

All in `plumbing` category for service area compatibility. Each has one active service listing.

### Booking matrix (8 paths × 4 servicers = 32 bookings)

| Path | Timing | Settlement | Promo |
|------|--------|-----------|-------|
| P1 | pay_now | credit | no |
| P2 | pay_now | gateway | no |
| P3 | pay_later | credit | no |
| P4 | pay_later | cash | no |
| P5 | pay_later | gateway | no |
| P6 | pay_now | credit | yes |
| P7 | pay_later | credit | yes |
| P8 | pay_later | cash | yes |

All 32 bookings go through full lifecycle:

```
open quote → proposal submitted → proposal selected (booking created)
  → pending_confirm → confirmed → in_progress → done (completed)
  → invoice generated → settlement (where applicable) → transaction records
```

### Booking states across the 32

| State | Count | Purpose |
|-------|-------|---------|
| open_quote | 4 | Test quote broadcast + matching |
| pending_confirm | 4 | Test booking creation, escrow (pay_now), lineItems snapshot |
| confirmed | 4 | Test status transition |
| in_progress | 4 | Test mark-in-progress |
| completed + invoiced | 16 | Test invoice generation + invariant assertion |

16 completed covers all 8 paths × 2 servicers (s1 baseline, s4 all-on). The other 16 are lifecycle state samples.

### SST rate

Platform `sst_rate` setting = 6% (standard Malaysian SST). Test servicers s2 and s4 use the platform rate.

### What this matrix proves

| Test | Covered by |
|------|-----------|
| SST not applied when not registered | s1, s3 |
| SST applied at 6%, exclusive (added on top) | s2 |
| SST applied at 6%, inclusive (embedded in price) | s3, s4 |
| Tax-inclusive prices correctly extracted | s3, s4 |
| `computeTotal()` canonical path | All completed |
| `computePlatformFee()` on afterPromo | All completed |
| Escrow charged == invoice total (pay_now) | P1, P2, P6 |
| No escrow for pay_later | P3, P4, P5, P7, P8 |
| Credit settlement deducts wallet | P1, P3, P6, P7 |
| Cash settlement deducts servicer deposit | P4, P8 |
| Gateway settlement creates pending record | P2, P5 |
| Promo applied to charged amount | P6, P7, P8 |
| Pay_later soft enforcement (unpaid blocks) | P3, P4, P5, P7, P8 |
| Invoice due date = now + 14 days | All completed |
| Settlement validation (cash only for cash-tagged) | P4, P8 |

## Files to create/modify

| File | Action |
|------|--------|
| `backend/prisma/seed/seed-test.ts` | **New** — test data seeding function |
| `backend/prisma/seed/seed.ts` | **Modify** — import and call test seed when `--test` flag present |
| `backend/package.json` | **Modify** — add `reseed-test` script |
| `scripts/fresh-start.*` | **Modify** — add test variant |
| `docs/ai-context/seed-plan.md` | **Modify** — document test layer + remove stale refs |
| `TODO.md` | **Modify** — tick remaining seed items |

## Non-goals (deferred)

- Admin-configurable service duration — separate feature
- SST per-listing override — already supported by schema, not seeded
- Service charge rate seeding — kept at 0% for simplicity in test matrix
- Tip seeding — omitted from test matrix (tip is user-input, not calculation path dependent)
