# Admin Dashboard & Financial Redesign

> 2026-06-23 Initial. 2026-06-25 Full rewrite. 2026-06-26 Sticky toolbar + charts + discount line.

## Dashboard layout (final 2026-06-26)

Sticky top bar (edge-to-edge, `position: sticky; top: 0; z-index: 10`), split into 3 sub-sections:

| Section | Content |
|---------|---------|
| **A** (darker bg) | Category marquee: Row 1 = parent cats, Row 2 = child cats (filtered by parent selection). Draggable, hidden scrollbar. |
| **A** (continued) | Search bar + sort buttons (cycle field + reverse toggle). Filters all 3 tables in real-time. |
| **B** (lighter bg) | Section pills: [All] [Queues] [Cards] [Chart] [Breakdown] [Customers] [Servicers]. Multi-select — shows/hides content sections below. |

Content sections (scroll below sticky bar, 2rem side padding):

| # | Section | Content |
|---|---------|---------|
| 1 | **Pending queues** | Withdrawals, Appeals, Category Requests, Open Reports (4 linked cards) |
| 2 | **Financial cards (4)** | [Cashflow: IN/OUT/GROSS/Cashflow] [Revenue: Fees/Tops/Discs/Rewards/GW] [Escrow: Held/Pending] [Urgent: Fee/Plat] |
| 3 | **Revenue & Fees chart** | Date controls + quick selects (Today/7d/30d/90d/All) + Q1-Q4 (highlight on active quarter) + year input + chart filter pills + 5-line SVG chart |
| 4 | **Category breakdown** | Bar chart (top 5) + Donut pie (top 5 + other) + sortable table with search |
| 5 | **Customer leaderboard** | Bar chart (top 5) + Donut pie (top 5 + other) + sortable table (top 50) |
| 6 | **Servicer leaderboard** | Bar chart (top 5) + Donut pie (top 5 + other) + sortable table (top 50) |

All section titles and metric labels have `(?)` tooltip (native `title` attribute).
Bar + donut charts hidden on mobile (`max-width: 760px`).
Charts hidden on mobile (`@media (max-width: 760px) { display: none; }`).

## Chart filter pills

```
[● Revenue] [● Fees] [○ Escrow Held] [○ Pending Payouts] [○ Discounts]
```

5 independently toggleable lines. Revenue+Fees default ON, others default OFF.
Lines: Revenue=solid primary blue, Fees=dashed orange, Escrow=solid green, Payouts=dashed green, Discounts=dashed red.
All lines: `stroke-width: 1`, `vector-effect: non-scaling-stroke`.
Discount pill wired: `dailyDiscount` backend query → `discountLine` signal → SVG `<polyline>`.

```
[? Revenue] [? Fees] [? Escrow Held] [? Pending Payouts]
```

Revenue + Fees ON by default. Escrow + Payouts OFF by default. Each pill toggles a line on the same SVG chart.

Lines: Revenue=solid primary, Fees=dashed warning, Escrow=solid success-green, Payouts=dashed success-green.

## Date controls

```
[Jun 1, 2026] -- to -- [Jun 25, 2026]
[Today] [7d] [30d] [90d] [All]       [Q1] [Q2] [Q3] [Q4] [2026]  (quarter visual only)
```

## Financial metrics (GET /admin/dashboard/financial)

| Field | Source | What |
|-------|--------|------|
| `totalTopUps` | `deposit_topup` txs | Total customer top-ups |
| `totalFees` | `platform_fee` txs JOIN bookings | Platform fee revenue |
| `totalEscrow` | `escrow_hold` txs JOIN bookings | Funds in escrow |
| `pendingPayouts` | `Escrow` table where `status='held'` | Unreleased escrow |
| `todayTopUps` | Same as totalTopUps, today only | Today's top-ups |
| `todayFees` | Same as totalFees, today only | Today's fees |
| `urgentFeeRevenue` | `booking.urgentFee` where `isUrgent=true` | Urgent surcharge (customer charge) |
| `urgentFeePlatformShare` | `urgent_fee` txs (or 20% fallback) | Platform's 20% cut |
| `categoryBreakdown` | GROUP BY category: count, SUM(price), SUM(fees) | Per-category stats |
| `dailyRevenue` | GROUP BY date: revenue + fees per day | Chart data |
| `dailyEscrow` | `escrow_hold` per day (NEW 2026-06-25) | Escrow time series |
| `dailyPayouts` | `escrow_release` per day (NEW 2026-06-25) | Payout time series |
| `customerLeaderboard` | Top 20 customers by spend (NEW 2026-06-25) | #, name, bookings, spent, last booking |
| `servicerLeaderboard` | Top 20 servicers by revenue (NEW 2026-06-25) | #, name, jobs, revenue, rating, reports |

## Source queries (admin.service.ts)

### Category breakdown (lines 141-154)
```sql
SELECT c.id, c.name,
       COUNT(DISTINCT b.id)::bigint AS booking_count,
       COALESCE(SUM(COALESCE(b.price, 0)), 0)::numeric AS revenue,
       COALESCE(SUM(ft.amount), 0)::numeric AS fees
FROM categories c
LEFT JOIN quote_requests qr ON qr.category_id = c.id
LEFT JOIN bookings b ON b.quote_request_id = qr.id AND b.created_at >= $1
LEFT JOIN transactions ft ON ft.booking_id = b.id
  AND ft.type = 'platform_fee' AND ft.status = 'completed' AND ft.created_at >= $1
WHERE c.deleted_at IS NULL
GROUP BY c.id ORDER BY fees DESC
```

### Daily escrow (NEW, lines 232-255)
```sql
SELECT t.created_at::date::text AS day, SUM(t.amount) AS amount
FROM transactions t
INNER JOIN bookings b ON t.booking_id = b.id
WHERE t.type = 'escrow_hold' AND t.status = 'completed' AND t.created_at >= $1
GROUP BY t.created_at::date ORDER BY day
```

### Daily payouts (NEW, lines 258-281)
```sql
SELECT t.created_at::date::text AS day, SUM(t.amount) AS amount
FROM transactions t
INNER JOIN bookings b ON t.booking_id = b.id
WHERE t.type = 'escrow_release' AND t.status = 'completed' AND t.created_at >= $1
GROUP BY t.created_at::date ORDER BY day
```

### Customer leaderboard (NEW, lines 284-307)
```sql
SELECT u.id, u.name, u.email,
       COUNT(DISTINCT b.id)::bigint AS booking_count,
       SUM(COALESCE(b.price, 0))::numeric AS total_spent,
       MAX(b.created_at) AS last_booking
FROM users u
INNER JOIN bookings b ON b.user_id = u.id AND b.status = 'completed'
WHERE u.role = 'customer' AND b.created_at >= $1
GROUP BY u.id, u.name, u.email
ORDER BY total_spent DESC LIMIT 20
```

### Servicer leaderboard (NEW, lines 309-335)
```sql
SELECT s.id, s.name, s.business_name, s.rating,
       COUNT(DISTINCT b.id)::bigint AS job_count,
       SUM(COALESCE(b.price, 0))::numeric AS revenue,
       COUNT(DISTINCT r.id)::bigint AS report_count
FROM servicers s
LEFT JOIN bookings b ON b.servicer_id = s.id AND b.status = 'completed' AND b.created_at >= $1
LEFT JOIN reports r ON r.booking_id = b.id AND r.status = 'open'
GROUP BY s.id, s.name, s.business_name, s.rating
ORDER BY revenue DESC LIMIT 20
```

## Seed gaps (all fixed ? 2026-06-25)

| # | Gap | Metric | Fix |
|---|------|--------|-----|
| D1 | Zero Escrow rows | pendingPayouts = 0 | 20 rows, 3 held for demo |
| D2 | escrow_hold no bookingId | totalEscrow = 0 | Linked to completed bookings |
| D3 | platform_fee all on plumber | Breakdown fees = only plumber | Cycled across 28 categories |
| D4 | No urgent bookings | Urgent cards = 0 | 3 bookings, isUrgent=true, RM 150 |
| D5 | Revenue = SUM(urgent_fee) | Chart line flat zero | Changed to SUM(booking.price) |
| D6 | Schedule 96 misses M97-M105 | 9 servicers no hours | Extended to 105 |

## Template

`frontend/src/app/admin/pages/dashboard.component.ts` ? rewritten 2026-06-25 with 7 collapsible sections, 5-card financial row, multi-line chart with filter pills, customer + servicer leaderboards, hint tooltips.

## Fintech roadmap

P1 Wallet + BalanceCheckpoint. P2 Fee engine (FeeRule CRUD). P3 Saved payment methods. P4 Escrow automation. P5 Financial reporting (P&L, CSV export).
