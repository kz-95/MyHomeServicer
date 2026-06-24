# Admin Dashboard & Financial Redesign

> 2026-06-23 · Consolidation session

## Dashboard layout

Category chips ? Quick Links ? Stats grid ? Revenue chart (candle, date range/quarter/days toggle) ? Admin footer (no category listing).

## Financial metrics (new endpoint)

GET /admin/dashboard/financial returns: totalTopUps, totalFees, totalEscrow, pendingPayouts, todayTopUps, todayFees, categoryBreakdown. Filterable by categoryId.

## Fintech roadmap

P1 Wallet model + BalanceCheckpoint (migrate inline creditBalance, enforce non-negative)
P2 Fee engine (FeeRule model + admin CRUD, replace hardcoded computePlatformFee)
P3 Saved payment methods + auto top-up (Stripe SetupIntents)
P4 Escrow automation (auto-release, dispute holding, partial release)
P5 Financial reporting (P&L, reconciliation, CSV export)

## Schema changes

Wallet, BalanceCheckpoint, FeeRule models as designed. Migration sequence: create tables ? seed existing balances ? rewrite adjustCredit ? update all code paths ? drop old creditBalance columns.

## Already done this session

Category filter on all admin pages, dashboard revenue date modes + Prisma groupBy, admin footer component, reports tab in queues, route-based user tabs.
