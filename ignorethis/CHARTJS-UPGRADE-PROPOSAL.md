# Chart.js + ng2-charts Upgrade Proposal

> 2026-06-26 — Admin Dashboard Chart Migration

## Current Charts (Pure CSS/SVG)

| Chart | Type | Section | Data Source |
|-------|------|---------|-------------|
| SVG Line Chart | 5-line polyline SVG | Revenue & Fees | `GET /admin/dashboard/financial?days=X&categoryId=Y` |
| CSS Bar Chart | Horizontal CSS div bars | Category Breakdown | Same API, categoryBreakdown array |
| CSS Bar Chart | Horizontal CSS div bars | Customer Leaderboard | Same API, customerLeaderboard array |
| CSS Bar Chart | Horizontal CSS div bars | Servicer Leaderboard | Same API, servicerLeaderboard array |
| CSS Donut Pie | conic-gradient mask | Category Breakdown | Same API, categoryBreakdown array |
| CSS Donut Pie | conic-gradient mask | Customer Leaderboard | Same API, customerLeaderboard array |
| CSS Donut Pie | conic-gradient mask | Servicer Leaderboard | Same API, servicerLeaderboard array |

## Limis: 1 SVG chart + 6 CSS-only charts (3 bars + 3 donuts)

**No**:
- Hover tooltips over data points (SVG has mousemove approximation, bars/donuts have none)
- Click-to-filter interaction
- Legend toggle interactivity
- Responsive size adjustment
- Proper keyboard accessibility
- Screen reader support

## API Endpoint

`GET /admin/dashboard/financial?days=30&categoryId=`

Returns:
```typescript
{
  totalBookingRevenue, totalPayouts, totalWithdrawals,
  totalTopUps, totalFees, totalEscrow, pendingPayouts,
  todayTopUps, todayFees, urgentFeeRevenue, urgentFeePlatformShare,
  gatewayFee, registeredDiscount, promoCost, pointsCost,
  categoryBreakdown: [{ name, count, revenue, fees }],
  dailyRevenue: [{ date, revenue, fees }],
  dailyEscrow: [{ day, amount }],
  dailyPayouts: [{ day, amount }],
  dailyDiscount: [{ day, amount }],
  customerLeaderboard: [{ name, bookingCount, totalSpent, lastBooking }],
  servicerLeaderboard: [{ businessName, jobCount, revenue, rating, reportCount }]
}
```

## Related Database Tables

| Table | Used For |
|-------|----------|
| `bookings` | Revenue, booking count |
| `transactions` | Platform fees, escrow, payouts, discounts |
| `categories` | Category names in breakdown |
| `users` | Customer names in leaderboard |
| `servicers` | Servicer names in leaderboard |
| `quote_requests` | Category references for joins |

## Proposed Chart.js + ng2-charts Migration

### Toolchain
- **chart.js** (^4.4.x) — core library
- **chartjs-plugin-datalabels** — optional value labels
- Reuse existing `app-icon` component for legend items

### Chart-by-Chart Proposal

#### Chart 1: Line Chart (Revenue & Fees section)
| Field | Value |
|-------|-------|
| **Current** | SVG polyline (5 lines, mousemove tooltip) |
| **Proposed** | Chart.js `line` type, 5 datasets |
| **Data** | `dailyRevenue[i].date` (x), `dailyRevenue[i].revenue` (y1), `dailyRevenue[i].fees` (y2), gross (computed), discount (dailyDiscount), cashflow (computed) |
| **Interaction** | Hover = tooltip with all values, click = extend date range |
| **Refresh** | On pill toggle, date range change, category filter |
| **Fields** | revenue, fees, payArr (for gross), discArr |

#### Chart 2: Horizontal Bar Chart (Category Breakdown)
| Field | Value |
|-------|-------|
| **Current** | CSS div bars (top 5) |
| **Proposed** | Chart.js `bar` type, indexAxis 'y', 2 datasets (bookings + fees) |
| **Data** | `categoryBreakdown[0..7].name`, `.count`, `.fees` |
| **Interaction** | Click bar = filter dashboard by that category |
| **Refresh** | On category pill select |
| **Fields** | name, count, fees |

#### Chart 3: Donut Chart (Category Breakdown)
| Field | Value |
|-------|-------|
| **Current** | CSS conic-gradient (top 5 + other) |
| **Proposed** | Chart.js `doughnut` type, 6 slices |
| **Data** | `categoryBreakdown[0..5].fees` + other sum |
| **Interaction** | Click slice = filter table by that category |
| **Refresh** | On category pill select or table sort |
| **Fields** | name, fees |

#### Charts 4-5: Bar + Donut for Customer Leaderboard
Same as Category Breakdown but data from `customerLeaderboard` (label=name, value=totalSpent)

#### Charts 6-7: Bar + Donut for Servicer Leaderboard
Same as Category Breakdown but data from `servicerLeaderboard` (label=businessName, value=revenue)

## Design Tokens (must preserve)

```css
/* From existing styles.css + component */
--color-primary: #2563eb
--color-primary-rgb: 37, 99, 235
--color-surface: #1e293b (dark) / #ffffff (light)
--color-bg: #0f172a (dark) / #f8fafc (light)
--color-text: #e2e8f0 (dark) / #1e293b (light)
--color-muted: #94a3b8 (dark) / #64748b (light)
--color-border: #334155 (dark) / #e2e8f0 (light)
--radius: 8px
--radius-input: 6px
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1)
--transition-fast: 150ms ease
```

Chart.js must:
- Use `--color-text` for axis labels
- Use `--color-border` for grid lines (alpha 0.1)
- Match existing line colors: revenue=#2563eb, fees=#f59e0b, gross=#16a34a, discount=#dc2626, cashflow=#9333ea
- Match donut palette: #f59e0b, #16a34a, #2563eb, #dc2626, #9333ea, #94a3b8 (other)
- Border radius: 4px on bars
- Tooltip: match existing `.chart-tooltip` CSS
- Legend: match existing `.donut-legend` CSS

## Interactions

| Interaction | Behavior |
|-------------|----------|
| **Hover line/bar** | Tooltip with date, value, % of total |
| **Click bar** | Filter dashboard by that category/customer/servicer |
| **Click donut slice** | Filter table below by that category |
| **Click legend item** | Toggle dataset visibility |
| **Active filters** | Show as removable chips above charts |
| **Filter change** | Charts animate update (easeOutQuart, 300ms) |
| **Table sync** | Sorting table column updates bar chart order |

## Component Architecture

```
dashboard.component.ts
├── <app-line-chart>       — 5-line time-series
├── <app-bar-chart>        — horizontal bar (reusable)
├── <app-donut-chart>      — donut (reusable)
```

Each chart component:
- `@Input() data: ChartData`
- `@Input() options?: ChartOptions`
- `@Output() filterChange = new EventEmitter<string>()`
- Supports `loading`, `empty`, `error` template states
- Uses `ng2-charts` `baseChart` directive
- Theme-adaptive (CSS variable passthrough to Chart.js options)

## Loading/Empty/Error States

| State | Line Chart | Bar Chart | Donut |
|-------|-----------|-----------|-------|
| **Loading** | Skeleton shimmer matching chart dimensions | Same | Same |
| **Empty** | "No data for this period" with date range suggestion | "No categories with bookings" | Same |
| **Error** | "Failed to load chart data" with retry button | Same | Same |

## Implementation Order

1. Install `chart.js` + `ng2-charts`
2. Create `line-chart.component.ts` (replace SVG)
3. Create `bar-chart.component.ts` (replace CSS bars)
4. Create `donut-chart.component.ts` (replace CSS donuts)
5. Update dashboard to use new components
6. Add click-to-filter interaction
7. Add loading/empty/error states
8. Remove old CSS/SVG code

## Not Changing
- Financial cards (4-card row) — already working, not a chart
- Pending queues — cards, not charts
- Section filter pills — UI control
- Category marquee — UI control
- Search + sort toolbar — UI control
- Table sort + filter — already works
- Backend API — no changes needed, Chart.js consumes same data
