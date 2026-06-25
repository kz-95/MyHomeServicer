# Financial System - Consolidated Spec

> 2026-06-23 · Merged from `deposit-credit-promotions` (2026-05-28) + `admin-dashboard-financial-redesign` (2026-06-23)

## Goal

Unify the platform's financial architecture into a single coherent system covering:
- **Two-balance system** (Deposit + Credit) for servicers
- **Wallet model** replacing inline `creditBalance` across User + Servicer
- **Fee engine** replacing hardcoded `computePlatformFee`
- **Stripe top-ups** for both customers and servicers
- **Transfer & withdrawal flows**
- **Promotion engine** with admin management
- **Admin dashboard** with real financial metrics
- **Escrow automation** (auto-release, dispute holding)
- **Saved payment methods** + auto top-up

---

## Architecture

```
                     ┌─────────────────────┐
                     │   Stripe Connect     │
                     └────────┬────────────┘
                              │
     ┌────────────────────────┼────────────────────────┐
     │                        │                        │
     ▼                        ▼                        ▼
┌────────────┐    ┌──────────────────┐    ┌──────────────────────┐
│ User Wallet│    │ Servicer Wallet  │    │   Platform Wallet    │
│ (customer) │    │ (servicer)       │    │   (admin)            │
├────────────┤    ├──────────────────┤    ├──────────────────────┤
│ balance    │    │ depositBalance   │    │ totalFees            │
│ available  │    │ creditBalance    │    │ totalTopUps          │
│ pending    │    │ available        │    │ totalEscrow          │
└─────┬──────┘    │ pending          │    │ pendingPayouts       │
      │           └────────┬─────────┘    └──────────────────────┘
      │                    │
      ▼                    ▼
┌──────────────────────────────────────────────┐
│             BalanceCheckpoint                │
│  (every mutation records pre/post balance)   │
└──────────────────────────────────────────────┘
      │                    │
      ▼                    ▼
┌──────────────────────────────────────────────┐
│               Transaction Log                │
│  topup / escrow_hold / escrow_release /      │
│  platform_fee / refund / withdrawal /        │
│  deposit_transfer / credit_transfer /        │
│  promotion / penalty / gateway_payment       │
└──────────────────────────────────────────────┘
```

---

## Part 1: Two-Balance System (Servicer)

### Deposit (ServicerDeposit.currentBalance)

| Property | Value |
|----------|-------|
| Purpose | Security buffer. Locked - cannot be spent or withdrawn directly. |
| Source | Job earnings land here first |
| Minimum | RM 100 (configurable via `minimum_required` on `ServicerDeposit`) |
| Drained by | Platform fees on cash/pay-later jobs, penalties, refunds |
| Overflow | Excess above minimum can be transferred to Credit |

### Credit (Servicer.creditBalance)

| Property | Value |
|----------|-------|
| Purpose | Withdrawable earnings |
| Source | Stripe top-up, transfers from Deposit |
| Minimum | RM 0 (no minimum) |
| Drained by | Withdrawal to bank |
| Can top up? | ✅ Yes - via Stripe Checkout (same flow as customer) |

### Money flow

```
Job completed (pay_now / pay_later / cash)
  │
  ├─ Platform fee (20%) → Platform revenue
  │
  └─ Remaining 80% → Deposit
                        │
                        ├─ Minimum RM 100 stays
                        │
                        └─ Excess → Transfer to Credit (servicer-initiated)
                                        │
                                        ├─ Stripe top-up → Credit (direct)
                                        │
                                        └─ Withdraw Credit → bank account
                                              (PIN-gated, admin-approved)
```

---

## Part 2: Wallet Model (Phase 1)

Replaces inline `creditBalance` on User and Servicer with a proper Wallet model.

```
Wallet
  id, ownerId, ownerType (user|servicer), currency (MYR),
  balance, available, pending, createdAt, updatedAt

BalanceCheckpoint
  id, walletId, delta, balanceBefore, balanceAfter,
  transactionId?, reason, createdAt
```

**Migration:** Create Wallet + BalanceCheckpoint → seed one Wallet per existing User/Servicer → rewrite `adjustCredit` to use Wallet + enforce non-negative → update all code paths → drop old `creditBalance` columns.

---

## Part 3: Fee Engine (Phase 2)

Replaces hardcoded `computePlatformFee()` with a configurable FeeRule model.

```
FeeRule
  id, name, type (flat|percentage|tiered), rate,
  minAmount?, maxAmount?, capAmount?,
  appliesTo (booking|withdrawal|deposit),
  categoryId?, activeFrom, activeTo?, priority
```

Admin CRUD for fee rules in Admin Settings. Can set per-category rates (e.g. Training = 5%, Plumbing = 12%).

---

## Part 4: Promotion Engine

### Model

```
Promotion
  id, label, description, active
  triggerType (topup_min_amount | order_percent | first_booking | signup_bonus | seasonal_fixed | ...)
  valueType (percent | fixed), value (Decimal)
  conditions (Json - minAmount, categoryId, nthNumber, etc.)
  targetRole (customer | servicer | all)
  startDate?, endDate?
  maxUses?, usedCount, maxPerUser?
```

### Full trigger set

| Trigger | valueType | Conditions | Example |
|---------|-----------|------------|---------|
| `topup_any` | fixed | `{}` | "Top up any amount → get RM 5 free" |
| `topup_min_amount` | fixed | `{ minAmount: 100 }` | "Top up ≥ RM 100 → get RM 10 free" |
| `first_topup` | fixed | `{}` | "First top-up → double bonus" |
| `order_percent` | percent | `{}` | "5% off all orders" |
| `order_fixed_discount` | fixed | `{}` | "RM 10 off every order" |
| `first_booking` | percent | `{}` | "50% off your first booking" |
| `nth_booking` | fixed | `{ nthNumber: 5 }` | "Free RM 50 on your 5th booking" |
| `booking_min_amount` | percent | `{ minBookingAmount: 200 }` | "10% off bookings ≥ RM 200" |
| `category_booking` | percent | `{ categoryId }` | "10% off aircon servicing" |
| `signup_bonus` | fixed | `{}` | "Welcome! Here's RM 10 credit" |
| `referral_giver` | fixed | `{}` | "Refer a friend → get RM 15" |
| `referral_receiver` | fixed | `{}` | "You were referred → get RM 10" |
| `seasonal_percent` | percent | startDate/endDate | "Merdeka Month: 15% off" |
| `seasonal_fixed` | fixed | startDate/endDate | "Hari Raya: RM 30 off" |

### Endpoints

```
GET  /admin/promotions              → list
POST /admin/promotions              → create (PIN-gated)
PATCH /admin/promotions/:id         → update (PIN-gated)
DELETE /admin/promotions/:id        → deactivate (PIN-gated)

GET  /promotions/active?role=       → public: list active
POST /promotions/apply              → evaluate + apply
```

### Evaluation engine

```
evaluatePromotions(triggerType, context { userId, amount?, categoryId?, bookingCount? })
  → AppliedPromotion[]  // evaluates conditions, usage limits, returns discount
```

### Customer reward UX (quote form / checkout)

**Flow:**
1. Customer earns rewards automatically via promotions (signup bonus, top-up bonus, referral, etc.)
2. On the **quote form** (or payment step), a "Use reward" button appears if the customer has any claimable rewards
3. Clicking it opens a **reward picker dropdown** showing each reward with:
   - Reward name (e.g. "Welcome Bonus RM 10")
   - Discount value (e.g. "RM 10 off" or "5% off")
   - Expiry date (e.g. "Expires 30 July 2026")
   - Requirements (e.g. "Min. spend RM 100" or "Applies to Plumbing only")
4. Customer selects one reward → it's applied to the current transaction
5. If they change their mind, they can un-apply it before submitting

**Frontend:**
```
┌── Quote Review ────────────────────────────────────┐
│  Install:                            RM  80.00     │
│  Bathtub:                            RM  30.00     │
│  ──────────────────────────────────────────────────│
│  Total:                              RM 110.00     │
│                                                     │
│  [Use reward 🎁]                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  ☐ Welcome Bonus              -RM 10.00      │  │
│  │    Expires 30 Jul 2026 · No minimum spend    │  │
│  │                                               │  │
│  │  ☐ 5% Off Any Order           -RM  5.50      │  │
│  │    Expires 15 Aug 2026 · No minimum spend    │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ──────────────────────────────────────────────────│
│  After reward:                       RM 104.50     │
│                                                     │
│  [Submit quote]                                     │
└────────────────────────────────────────────────────┘
```

**Backend:**
- `GET /promotions/active?role=customer` - returns active promotions
- `POST /promotions/claim` - customer claims a promotion (creates a `ClaimedReward` record)
- `GET /customer/rewards` - returns claimed rewards with status (available/used/expired), expiry date, requirements
- `POST /quotes/:id/apply-reward` - applies a claimed reward to a quote (validates conditions + expiry)
- Rewards that auto-trigger (e.g. `first_booking`, `signup_bonus`) are claimed automatically when the customer meets the condition

**Model:**
```prisma
model ClaimedReward {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  promotionId  String   @map("promotion_id") @db.Uuid
  status       String   @default("available")  // available | used | expired
  discount     Decimal  @db.Decimal(10, 2)     // actual RM value at claim time
  expiresAt    DateTime? @map("expires_at")
  usedAt       DateTime? @map("used_at")
  createdAt    DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])
  promotion Promotion @relation(fields: [promotionId], references: [id])
  @@map("claimed_rewards")
}
```

---

## Part 5: Admin Dashboard

### Layout

```
[Admin Dashboard]
├── [Category chips] All | Plumbing | Electrical | Repair | ...
├── [Quick Links] Open Reports | Withdrawals | Appeals | Category Requests
├── [Stats grid]  Servicers | Bookings | Completed | Revenue
├── [Financial cards]  Top-ups | Fees | Escrow | Payouts | Net revenue | Conversion
├── [Revenue chart]  [From] [To] | [Q1][Q2][Q3][Q4] [Year] | [30d][7d][Today]
│   └── Candle chart (open/close/high/low per day)
└── [Admin footer] - simplified, no category listing
```

### Financial endpoint

```
GET /admin/dashboard/financial?categoryId=
  → { totalTopUps, totalFees, totalEscrow, pendingPayouts,
      todayTopUps, todayFees, categoryBreakdown?[] }
```

### Category filter

Wires into ALL dashboard widgets: servicers count, bookings, completed, revenue, reports, revenue chart. Already done this session.

---

## Part 6: Servicer Financial Operations

### Stripe top-up

Reuse existing `createTopUpSession()` from `stripe.ts`. New endpoint `POST /servicer/me/topup`. Webhook handler branches on servicer vs user to credit the correct balance.

### Deposit ↔ Credit transfer

`POST /servicer/me/transfer` with direction + amount + PIN. Validates minimum deposit balance + creates transaction records.

### Withdrawal

`POST /servicer/me/withdrawal` - PIN-gated, records bank details from profile. Admin approves via existing `POST /admin/withdrawals/:id/mark-paid`.

### Bank account

Add `bankName` + `bankAccount` to `Servicer` model. Section in servicer account settings. Required before taking jobs.

### Onboarding gate

`requireOnboarded()` checks bank account + KYC before allowing job-taking. Returns modal with missing fields + redirect URL.

### Deposit page redesign

Single page combining: balance overview (deposit/credit/total), transfer interface, top-up form, withdrawal request, transaction history.

---

## Part 7: Payment Methods + Escrow Automation

### Saved payment methods (Phase 3)

SavedPaymentMethod model (Stripe SetupIntents). Auto top-up configurable threshold.

### Escrow automation (Phase 4)

Scheduled job: auto-release N days after completion with no dispute. Dispute flag freezes escrow. Partial release support.

---

## Implementation order

| Step | Phase | What | Effort | Depends on |
|------|-------|------|--------|-----------|
| 1 | P1 | Wallet model + BalanceCheckpoint | 3h | - |
| 2 | P1 | Seed wallets + migrate creditBalance | 2h | 1 |
| 3 | P1 | Rewrite adjustCredit to use Wallet | 4h | 2 |
| 4 | P1 | Remove old creditBalance columns | 1h | 3 |
| 5 | - | Add bankName/bankAccount/onboarded to Servicer | 1h | - |
| 6 | - | Promotion model + CRUD (admin) | 3h | - |
| 7 | - | Promotion evaluation engine | 3h | 6 |
| 8 | P2 | FeeRule model + admin CRUD | 3h | 1 |
| 9 | P2 | Replace computePlatformFee with FeeRule | 2h | 8 |
| 10 | - | Servicer Stripe top-up endpoint | 1h | - |
| 11 | - | Deposit↔Credit transfer endpoint | 2h | - |
| 12 | - | Deposit page redesign (frontend) | 4h | 10, 11 |
| 13 | - | Onboarding gate | 1h | 5 |
| 14 | P3 | SavedPaymentMethod + SetupIntent flow | 4h | - |
| 15 | P4 | Escrow auto-release + dispute | 4h | 1 |
| 16 | P5 | Financial dashboard widgets + candle chart | 5h | 1, 9 |
| 17 | P5 | CSV export | 2h | 1 |

---

## Schema changes summary

| Model | Action | Fields |
|-------|--------|--------|
| Wallet | NEW | ownerId, ownerType, currency, balance, available, pending, ts |
| BalanceCheckpoint | NEW | walletId, delta, balanceBefore, balanceAfter, transactionId, reason |
| FeeRule | NEW | name, type, rate, min/max/capAmount, appliesTo, categoryId, active, priority |
| Promotion | NEW | label, description, active, triggerType, valueType/value, conditions, targetRole, dates, usage limits |
| SavedPaymentMethod | NEW | userId, stripePaymentMethodId, brand, last4, expMonth/Year, isDefault |
| Servicer | MODIFY | +bankName, +bankAccount, +onboarded, -creditBalance (after migration) |
| User | MODIFY | -creditBalance (after migration) |

## Already done this session

- Category filter chips + dropdown on all admin pages
- Dashboard revenue chart date modes + Prisma groupBy
- Admin footer component created
- Reports tab in queues with category filter
- `/admin/users/all` + `/admin/users/servicers` routes
