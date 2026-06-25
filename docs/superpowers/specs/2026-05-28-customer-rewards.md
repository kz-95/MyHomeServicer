# Customer Rewards System

> 2026-05-28 · Brainstorming session · Ready for execution

## Goal

Replace the static demo rewards page with a full backend-driven loyalty program. Points are earned through spending, reviews, and referrals. Rewards are redeemed as **top-up discounts** (not free credit) - driving both top-up habit and first-booking conversion.

Welcome points at signup give new users an immediate incentive to explore the rewards system and learn the platform.

---

## 1. Admin Settings Restructure

Split the current monolithic "Platform Settings" into **three separate admin pages**, each with its own nav item:

```
Admin Sidebar:
  Dashboard
  Accounts
  AI Chat Settings
  Money Settings     ← NEW (financial rules + rewards)
  UI/UX Settings     ← NEW (content, text, sounds, branding)
  User Settings      ← NEW (budget ranges, banned users, KYC, demos)
```

### Money Settings page

```
┌── Platform Fee ───────────────────────────────────────┐
│  Platform fee rate:  [20]%                            │
│                                                       │
│  Fee breakdown (shown to servicers):                  │
│  Marketing:     [5]%   (of the 20%)                   │
│  Rewards:       [8]%                                  │
│  Operations:    [4]%                                  │
│  Margin:        [3]%                                  │
│  (Must total 20 - validated on save)                  │
└──────────────────────────────────────────────────────┘

┌── Rewards Program ───────────────────────────────────┐
│  Points per RM 1 spent: [1]                          │
│  Points per review:     [50]                         │
│  Points per referral:   [200]                        │
│  Welcome points:        [500]                        │
│  Redemption rate:       [100] pts = RM [5]           │
│                                                       │
│  ┌── Tiers (CRUD table) ──────────────────────────┐  │
│  │  Name       Min pts  Bonus %  Color      Order │  │
│  │  Bronze     0        +0%       #cd7f32   1     │  │
│  │  Silver     500      +10%      #c0c0c0   2     │  │
│  │  Gold       2,000    +25%      #ffd700   3     │  │
│  │  Platinum   5,000    +50%      #e5e4e2   4     │  │
│  │  [Add tier]  [Edit]  [Delete]  [Reorder]       │  │
│  └─────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘

┌── Reward Catalog ────────────────────────────────────┐
│  [Name]         [Cost (pts)]  [Discount]  [Active]   │
│  RM 5 discount      100        RM 5 off top-up   ✅  │
│  RM 10 discount     200        RM 10 off top-up  ✅  │
│  RM 25 discount     500        RM 25 off top-up  ✅  │
│  10% off booking    600        Max RM 30         ✅  │
│  Free call-out      800        Waiver            ✅  │
│  RM 50 discount    1000        RM 50 off top-up  ✅  │
│                                                       │
│  [Add reward]  [Edit]  [Deactivate]                  │
│                                                       │
│  ┌── Redemption Log ─────────────────────────────┐   │
│  │  User · Reward · Date · Status                │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘

┌── Servicer Rules ────────────────────────────────────┐
│  (existing: min charge, deposit, withdrawal, no-show) │
└──────────────────────────────────────────────────────┘

┌── Tax & Fees ────────────────────────────────────────┐
│  SST rate · Quote buffer · Customer discount          │
└──────────────────────────────────────────────────────┘

┌── Deposit Rules ─────────────────────────────────────┐
│  Minimum deposit (RM 100) · Transfer limits           │
└──────────────────────────────────────────────────────┘
```

### UI/UX Settings page

```
┌── Notifications ────────────────────────────────────┐
│  Notification sounds: [on/off]                        │
│  Chat message sounds: [on/off]                        │
│  Typing sounds:       [on/off]                        │
└──────────────────────────────────────────────────────┘

┌── Content ──────────────────────────────────────────┐
│  Condo entry note: [textarea]                        │
│  Landing page text: [textarea]                       │
│  Rewards page header: "Earn points on every booking" │
└──────────────────────────────────────────────────────┘
```

### User Settings page

```
┌── Customer Budget Ranges ───────────────────────────┐
│  (per-category ranges, existing)                     │
└──────────────────────────────────────────────────────┘

┌── Banned Emails ────────────────────────────────────┐
│  (existing from deactivate-account spec)             │
└──────────────────────────────────────────────────────┘

┌── KYC Rules ────────────────────────────────────────┐
│  (document requirements per tier)                    │
└──────────────────────────────────────────────────────┘
```

---

### Tier model (admin-managed)

```prisma
model LoyaltyTier {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String   @unique            // "Bronze", "Silver", "Gold", "Platinum"
  minPoints   Int      @map("min_points") // 0, 500, 2000, 5000
  bonusPercent Int     @default(0) @map("bonus_percent")  // 0, 10, 25, 50
  badgeColor  String?  @map("badge_color")  // hex color for the tier badge
  sortOrder   Int      @default(0) @map("sort_order")
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("loyalty_tiers")
}
```

Tiers are **not hardcoded**. Admin can add, edit, delete, reorder tiers via CRUD in Money Settings. The tier computation reads from this table, sorted by `minPoints`:

```typescript
function computeTier(lifetimeEarned: number, tiers: LoyaltyTier[]): { name: string; bonusPercent: number; progress: number; next: string | null } {
  const sorted = [...tiers].sort((a, b) => b.minPoints - a.minPoints);
  const current = sorted.find((t) => lifetimeEarned >= t.minPoints);
  const next = [...tiers].sort((a, b) => a.minPoints - b.minPoints).find((t) => t.minPoints > lifetimeEarned);
  return {
    name: current?.name ?? 'Bronze',
    bonusPercent: current?.bonusPercent ?? 0,
    progress: next ? ((lifetimeEarned - (current?.minPoints ?? 0)) / (next.minPoints - (current?.minPoints ?? 0))) * 100 : 100,
    next: next?.name ?? null,
  };
}
```

**API endpoints for tiers:**
```
GET    /rewards/tiers           → LoyaltyTier[] (sorted by minPoints)
POST   /admin/rewards/tiers     → Create tier (PIN-gated)
PATCH  /admin/rewards/tiers/:id → Update tier (PIN-gated)
DELETE /admin/rewards/tiers/:id → Delete tier (PIN-gated)
```

## 2. Points System

### Earning rules

| Action | Points | Frequency |
|--------|--------|-----------|
| RM 1 spent on booking | 1 pt | Per booking |
| Submit a review | 50 pts | Once per booking |
| Refer a friend who books | 200 pts | Per referral (max 10/month) |
| Welcome bonus (signup) | 500 pts | One-time |

### Points model

```prisma
model CustomerPoints {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @unique @map("user_id") @db.Uuid
  balance   Int      @default(0)
  lifetimeEarned Int @default(0) @map("lifetime_earned")
  lifetimeSpent  Int @default(0) @map("lifetime_spent")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id])
  @@map("customer_points")
}
```

### Points transaction log

```prisma
model PointsTransaction {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  type      String   // "earn_booking" | "earn_review" | "earn_referral" | "earn_welcome" | "redeem" | "expire"
  amount    Int      // positive = earned, negative = spent
  balance   Int      // running balance after this transaction
  reference String?  // bookingId, reviewId, rewardId, etc.
  note      String?
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])
  @@index([userId, createdAt])
  @@map("points_transactions")
}
```

### Points awarded on booking completion

In `doneJob()` handler (booking.service.ts), add:

```typescript
const pointsEarned = Math.floor(Number(booking.price));
await prisma.customerPoints.upsert({
  where: { userId: booking.userId },
  update: {
    balance: { increment: pointsEarned },
    lifetimeEarned: { increment: pointsEarned },
  },
  create: {
    userId: booking.userId,
    balance: pointsEarned,
    lifetimeEarned: pointsEarned,
  },
});
await prisma.pointsTransaction.create({
  data: {
    userId: booking.userId,
    type: 'earn_booking',
    amount: pointsEarned,
    balance: /* recalculate */,
    reference: booking.id,
    note: `Earned from booking #${booking.id.slice(-8)}`,
  },
});
```

---

## 3. Voucher-Based Rewards

### How redemption works

Rewards are **vouchers that discount a top-up**, not free credit added directly.

```
User redeems 500 pts → gets "Top-up RM 100, pay RM 75" voucher
                          │
                          ├─ User goes to top-up page
                          ├─ Enters voucher code (or auto-selected)
                          ├─ Pays RM 75 via Stripe
                          ├─ Gets RM 100 credit added to wallet
                          └─ Platform effectively paid RM 25 discount
```

### Reward model

```prisma
model Reward {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String                             // "RM 10 Top-up Discount"
  description String?
  pointCost   Int                                // 200
  discountType String   // "topup_fixed" | "booking_percent" | "waiver"
  discountValue Decimal @db.Decimal(10, 2)       // RM 10 or 10%
  maxDiscount  Decimal? @db.Decimal(10, 2)       // max cap (e.g. RM 30 for 10% off)
  minTopup     Decimal? @db.Decimal(10, 2)       // minimum top-up required (for topup discount)
  active       Boolean  @default(true)
  sortOrder    Int      @default(0) @map("sort_order")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("rewards")
}
```

### Redemption model

```prisma
model Redemption {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String   @map("user_id") @db.Uuid
  rewardId   String   @map("reward_id") @db.Uuid
  voucherCode String  @unique @map("voucher_code")  // auto-generated, e.g. "RWD-A3B8C"
  status     String   @default("active")  // "active" | "used" | "expired"
  usedAt     DateTime? @map("used_at")
  expiresAt  DateTime? @map("expires_at")  // 30 days from redemption
  createdAt  DateTime @default(now()) @map("created_at")

  user   User   @relation(fields: [userId], references: [id])
  reward Reward @relation(fields: [rewardId], references: [id])

  @@map("redemptions")
}
```

### Reward catalog (seed)

| Name | Cost (pts) | Discount | Min top-up | Type |
|------|-----------|----------|-----------|------|
| RM 5 top-up discount | 100 | RM 5 off | RM 20 | `topup_fixed` |
| RM 10 top-up discount | 200 | RM 10 off | RM 25 | `topup_fixed` |
| RM 25 top-up discount | 500 | RM 25 off | RM 75 | `topup_fixed` |
| 10% off next booking | 600 | 10% off, max RM 30 | - | `booking_percent` |
| Free call-out waiver | 800 | Waive call-out fee (up to RM 30) | - | `waiver` |
| RM 50 top-up discount | 1,000 | RM 50 off | RM 150 | `topup_fixed` |

### Voucher auto-apply at top-up

When a user goes to the top-up page and enters an amount:

1. Frontend calls `GET /rewards/active-vouchers?topupAmount=100`
2. Backend checks all active redemptions for this user with `status: 'active'` and `discountType: 'topup_fixed'`
3. Returns valid vouchers that apply: e.g. `[{ voucherCode: "RWD-A3B8C", discount: 25, finalAmount: 75 }]`
4. Frontend shows: "You have a voucher! Pay RM 75 instead of RM 100"
5. User confirms → Stripe Checkout with reduced amount
6. On successful payment, mark voucher as `used`

---

## 4. Welcome Points Flow

### At registration

```typescript
// In POST /auth/register or POST /auth/register/servicer:
// After account creation:
if (role === 'customer') {
  await prisma.customerPoints.create({
    data: { userId: newUser.id, balance: 500, lifetimeEarned: 500 },
  });
  await prisma.pointsTransaction.create({
    data: {
      userId: newUser.id,
      type: 'earn_welcome',
      amount: 500,
      balance: 500,
      note: '🎉 Welcome! Here are 500 free points to get started.',
    },
  });
}
```

### Post-registration experience

```
1. User logs in for the first time
2. Navigates to Rewards tab
3. Sees active balance + "Try redeeming" banner
4. Redeems a low-cost reward (e.g. 100 pts → RM 5 top-up discount)
5. Goes to top-up page, sees voucher auto-applied
6. Tops up RM 20 for RM 15 → feels good
7. Books first service → earns real points → loop continues
```

**First-visit banner on Rewards page:**

```
┌───────────────────────────────────────────────────────┐
│  🎉 Welcome! You have 500 free points.                 │
│  Try redeeming one - pick a reward below to start.    │
│                                                       │
│  [Got it, show me rewards]                            │
└───────────────────────────────────────────────────────┘
```

### Idle re-engagement banner (home page)

If a user has unspent points AND hasn't visited the rewards page in ≥ 3 days, show a banner on the **home page** (`browse.component.ts`) and **customer shell** prompting them to check their points:

```
┌───────────────────────────────────────────────────────────────────┐
│  💎 You have 500 points waiting!  Redeem them for top-up discounts  │
│  and save on your next booking.     [Check rewards →]  [×]         │
└───────────────────────────────────────────────────────────────────┘
```

**Backend endpoint:**
```
GET /user/me/rewards/prompt → { show: boolean, points: number, lastVisitDays: number }
```

Checks:
- User has `CustomerPoints.balance > 0`
- User's last `GET /rewards` visit was > 3 days ago (tracked via a simple `lastRewardsVisit` timestamp on `CustomerPoints` or a lightweight analytics table)
- If true, returns `{ show: true, points: 500 }`

**Frontend:**

In `customer-shell.component.ts` (persistent across all customer pages), after the FAB stack:

```html
@if (rewardsPrompt()) {
  <div class="rewards-banner" role="alert">
    <span>💎 You have {{ rewardsPrompt().points }} points waiting!</span>
    <a routerLink="/customer/rewards" (click)="dismissRewardsPrompt()">Check rewards →</a>
    <button (click)="dismissRewardsPrompt()">×</button>
  </div>
}
```

Dismissed on × or click-through. Re-appears after another 3 days if points remain unspent.

**Dismiss expiry tracking:** Store `rewardsPromptDismissedAt` on the user profile or in localStorage. If dismissed, don't show again for 3 days.

Post-registration experience updated:

```
1. User signs up → gets 500 welcome points
2. First time: manually visits Rewards tab → sees welcome banner
3. Idle for 3+ days → home page shows re-engagement banner
4. Clicks banner → back to Rewards → redeems voucher
5. Voucher auto-applies at top-up → pays less → feels good
6. Books first service → earns real points → loop continues
```

---

## 5. Tier System

Tiers are computed from `lifetimeEarned` (not current balance), so spent points still count toward tier progression.

```typescript
function computeTier(lifetimeEarned: number): { name: string; progress: number; next: string | null } {
  const tiers = [
    { name: 'Bronze', min: 0 },
    { name: 'Silver', min: 500 },
    { name: 'Gold', min: 2000 },
    { name: 'Platinum', min: 5000 },
  ];
  // Same logic as current static implementation - just data-driven
}
```

### Per-tier benefits

| Tier | Benefit |
|------|---------|
| Bronze | Standard points earning |
| Silver | +10% bonus points on bookings |
| Gold | +25% bonus points + priority support |
| Platinum | +50% bonus points + exclusive rewards |

---

## 6. Frontend - Rewards Page

The current `rewards.component.ts` already has search/filter (from F-D uncommitted changes). Replace static data with API calls:

### Backend API

```
GET  /user/me/points          → { balance, lifetimeEarned, tier, tierProgress, nextTier }
GET  /user/me/points/history  → PointsTransaction[] (paginated)
GET  /rewards                 → Reward[] (active catalog)
GET  /user/me/rewards         → Redemption[] (user's redemptions + status)
POST /user/me/rewards/:rewardId/redeem  → { voucherCode, redemption }
GET  /rewards/active-vouchers?topupAmount=X  → valid vouchers for this top-up
POST /rewards/voucher/:code/apply  → apply voucher to current transaction
```

### Template changes

The static data is replaced with API responses:

```typescript
// New signals:
points = signal<PointsData | null>(null);
history = signal<PointsTransaction[]>([]);
rewards = signal<Reward[]>([]);
myRedemptions = signal<Redemption[]>([]);
```

The existing search/filter (from F-D) stays - it works on the API-loaded data instead of static arrays.

### Loyalty points multiplier display

```
┌── Points + tier ──────────────────────────────────────┐
│  [Points balance]  [Tier badge]  [Progress bar]       │
│                                                        │
│  You earn 1 point per RM 1 spent on bookings.          │
│  Silver tier: +10% bonus. Gold: +25%. Platinum: +50%. │
└──────────────────────────────────────────────────────┘
```

---

## 7. Servicer Fee Transparency

**File:** `servicer/pages/account.component.ts` or `dashboard.component.ts`

New info card:

```
┌── Platform Fee Breakdown ─────────────────────────────┐
│                                                        │
│  We charge 20% on every completed booking.             │
│  Here's where it goes:                                 │
│                                                        │
│  8%  → Rewards & promotions  (customers earn points)  │
│  5%  → Marketing & customer acquisition                │
│  4%  → Platform operations  (payment processing, etc.)│
│  3%  → Platform margin                                 │
│  ─────────────────────────────────────                 │
│  20%  Total                                            │
│                                                        │
│  These rates are set by the platform admin.            │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Data sourced from `GET /servicer/me/fee-breakdown`:

```typescript
servicerRouter.get('/me/fee-breakdown', requireAuth, requireServicer, async (req, res) => {
  const settings = await getSettings();
  res.json({
    totalRate: settings.platform_fee_rate.current_rate * 100, // 20
    breakdown: [
      { label: 'Rewards & promotions', percent: 8 },
      { label: 'Marketing & acquisition', percent: 5 },
      { label: 'Platform operations', percent: 4 },
      { label: 'Platform margin', percent: 3 },
    ],
  });
});
```

---

## 8. Seed Data Strategy

### Customer points seed (realistic personas)

| Persona | Welcome | Earned | Spent | Balance | Lifetime | Tier |
|---------|---------|--------|-------|---------|----------|------|
| **Customer.fresh** (new) | 500 | 0 | 0 | 500 | 500 | Bronze |
| **Customer.active** (returning) | 500 | 450 (3 bookings) | 0 | 950 | 950 | Silver |
| **Customer.loyal** (regular) | 500 | 2,100 (14 bookings + reviews + referral) | RM 25 discount (500 pts) | 2,100 | 2,600 | Gold |

### Points transaction seeds

For **Customer.loyal**:

| Type | Amount | Note |
|------|--------|------|
| `earn_welcome` | +500 | Welcome bonus |
| `earn_booking` | +150 | Bathroom cleaning |
| `earn_review` | +50 | Review for bathroom cleaning |
| `earn_booking` | +200 | Aircon servicing |
| `earn_review` | +50 | Review for aircon servicing |
| `earn_booking` | +180 | Kitchen plumbing |
| `earn_review` | +50 | Review for kitchen plumbing |
| `earn_booking` | +300 | Full house cleaning |
| `earn_review` | +50 | Review for full house cleaning |
| `earn_booking` | +120 | Electrical repair |
| `earn_review` | +50 | Review for electrical repair |
| `earn_referral` | +200 | Referred a friend |
| `earn_booking` | +250 | Door gate installation |
| `earn_review` | +50 | Review for door gate |
| `earn_booking` | +220 | Roof repair |
| `earn_review` | +50 | Review for roof repair |
| `earn_booking` | +180 | Renovation consultation |
| `earn_review` | +50 | Review for renovation |
| `earn_booking` | +160 | Interior design consult |
| `earn_review` | +50 | Review for interior design |
| `earn_booking` | +140 | Wedding planning session |
| `earn_review` | +50 | Review for wedding planning |
| `redeem` | -500 | Redeemed RM 25 top-up discount |
| | | **Total: 2,600 lifetime / 2,100 balance** |

### Reward seeds

6 rewards as specified in §3 Reward catalog.

### Welcome bonus config

Default: 500 pts. Stored in platform settings under `welcome_points` key.

---

## 9. Backend API Summary

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `GET` | `/user/me/points` | Customer | Points balance, tier, progress |
| `GET` | `/user/me/points/history` | Customer | Points transaction log (paginated) |
| `GET` | `/rewards` | Any | Active reward catalog |
| `GET` | `/user/me/rewards` | Customer | User's redemptions |
| `POST` | `/user/me/rewards/:id/redeem` | Customer | Redeem points for a voucher |
| `GET` | `/rewards/active-vouchers` | Customer | Check valid vouchers for top-up |
| `POST` | `/rewards/voucher/:code/apply` | Customer | Apply voucher to transaction |
| `GET` | `/servicer/me/fee-breakdown` | Servicer | Platform fee breakdown |
| `GET` | `/admin/rewards` | Admin | List all rewards (CRUD) |
| `POST` | `/admin/rewards` | Admin | Create reward (PIN-gated) |
| `PATCH` | `/admin/rewards/:id` | Admin | Update reward (PIN-gated) |
| `DELETE` | `/admin/rewards/:id` | Admin | Deactivate reward (PIN-gated) |
| `GET` | `/admin/rewards/redemptions` | Admin | Redemption log |
| `POST` | `/admin/rewards/redemptions/:id/void` | Admin | Void a redemption (PIN-gated) |

---

## 10. Build Order

```
1. Schema: CustomerPoints, PointsTransaction, Reward, Redemption models + db push
2. Backend: points earning (welcome bonus at signup, booking completion, review)
3. Backend: reward catalog CRUD (admin endpoints)
4. Backend: redemption + voucher system
5. Backend: servicer fee-breakdown endpoint
6. Frontend: admin rewards catalog management (Money Settings page)
7. Frontend: rewards page (replace static with API calls)
8. Frontend: welcome banner + first-redemption prompt
9. Frontend: voucher auto-apply at top-up
10. Frontend: servicer fee transparency card
11. Seed: 6 rewards, 3 customer point profiles, 20+ transactions
12. Admin Settings split: Money / UI/UX / User pages (restructure)
13. FAQ update
```

## DoD

| Gate | Expected |
|------|----------|
| `db push` | 4 new models created |
| `npx tsc --noEmit` backend | 0 errors |
| `ng build` frontend | Exit 0 |
| New user gets 500 welcome points | ✅ |
| Points earned on completed bookings | ✅ |
| Points earned on review submission | ✅ |
| Reward redemption creates active voucher | ✅ |
| Voucher auto-applies at top-up (reduces Stripe amount) | ✅ |
| Fee transparency card visible in servicer account | ✅ |
| Admin manages reward catalog via Money Settings | ✅ |
| Admin views redemption log | ✅ |
| Seed data: 3 customer personas with realistic point activity | ✅ |
| Admin Settings split into 3 separate pages | ✅ |
| FAQ entries updated for rewards, vouchers, fee breakdown | ✅ |
