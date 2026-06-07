# Deposit, Credit, and Promotion System

> 2026-05-28 · Brainstorming session · Ready for execution

## Goal

Redesign the servicer financial system around two separate balances (Deposit + Credit), add Stripe top-up for servicers, add a transfer interface, add a modular promotion engine for admin, and add an onboarding gate that checks requirements before a servicer can take jobs.

---

## 1. Two-Balance Architecture

### Deposit (ServicerDeposit.currentBalance)

| Property | Value |
|----------|-------|
| Purpose | Security buffer. Locked — cannot be spent or withdrawn directly. |
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
| Can top up? | ✅ Yes — via Stripe Checkout (same flow as customer) |

### Money flow diagram

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

### Schema changes

**ServicerDeposit** model — already exists, add `creditTransferable`:

```prisma
model ServicerDeposit {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  servicerId      String   @unique @map("servicer_id") @db.Uuid
  totalDeposited  Decimal  @default(0) @map("total_deposited") @db.Decimal(10, 2)
  currentBalance  Decimal  @default(0) @map("current_balance") @db.Decimal(10, 2)
  minimumRequired Decimal  @default(100) @map("minimum_required") @db.Decimal(10, 2)
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  servicer Servicer @relation(fields: [servicerId], references: [id])
  @@map("servicer_deposits")
}
```

**Servicer model** — add bank account fields (reusable):

```prisma
model Servicer {
  // existing fields...
  bankName       String?  @map("bank_name")
  bankAccount    String?  @map("bank_account")
  onboarded      Boolean  @default(false) @map("onboarded")  // has completed all requirements
}
```

The `onboarded` flag is set to `true` once the servicer has filled all required fields (bank account, business details, KYC, etc.). Until then, they cannot take jobs.

### Backend enforcement

**Job-take gate** — in every endpoint that leads to accepting a job (`POST /servicer/quotes/:id/propose`, `POST /servicer/jobs/:id/confirm`):

```typescript
async function requireOnboarded(servicerId: string): Promise<void> {
  const servicer = await prisma.servicer.findUnique({
    where: { id: servicerId },
    select: { onboarded: true, bankName: true, bankAccount: true, kycStatus: true },
  });
  if (!servicer) throw notFound('Servicer not found');
  if (servicer.onboarded) return;

  // Check what's missing
  const missing: string[] = [];
  if (!servicer.bankName || !servicer.bankAccount) missing.push('bank_account');
  if (servicer.kycStatus !== 'approved') missing.push('kyc');

  if (missing.length > 0) {
    throw badRequest({
      message: 'Complete your profile before taking jobs.',
      missing,
      redirectUrl: '/servicer/account',
    });
  }

  // All good → mark onboarded
  await prisma.servicer.update({
    where: { id: servicerId },
    data: { onboarded: true },
  });
}
```

**Frontend behavior:** When the backend returns `{ message, missing, redirectUrl }`, the frontend shows a modal:

```
┌────────────────────────────────────────────┐
│  ⚠️ Complete your profile first            │
│                                            │
│  Before you can take jobs, fill in:        │
│  • Bank account details  ← missing        │
│  • KYC documents         ← missing        │
│                                            │
│  [Go to Account Settings]  [Cancel]       │
└────────────────────────────────────────────┘
```

---

## 2. Servicer Stripe Top-up → Credit

**Reuse existing `createTopUpSession()` from `backend/src/lib/stripe.ts`.** The function already creates a Stripe Checkout Session. Changes needed:

1. **New endpoint** `POST /servicer/me/topup` (mirrors customer `POST /user/me/topup`):
   ```typescript
   servicerRouter.post('/me/topup', requireAuth, requireServicer, validate([
     body('amount').isFloat({ min: 1 }),
   ]), asyncHandler(async (req, res) => {
     const amount = req.body.amount;
     const appUrl = req.get('origin') ?? process.env.APP_URL ?? 'http://localhost:4200';
     const { url, sessionId } = await createTopUpSession(
       req.user!.id, amount,
       `${appUrl}/servicer/deposit?topup=success`,
       `${appUrl}/servicer/deposit?topup=cancelled`,
     );
     res.json({ url, sessionId });
   }));
   ```

2. **Webhook update** — the `checkout.session.completed` handler currently credits `user.creditBalance`. Add a branch: if the session metadata indicates a servicer, credit `servicer.creditBalance` instead:
   ```typescript
   // In stripe webhook handler, after checkout.session.completed:
   const userId = session.metadata?.userId;
   const amount = parseFloat(session.metadata?.amountMYR ?? '0');
   
   // Check if this is a servicer
   const servicer = await prisma.servicer.findUnique({ where: { id: userId } });
   if (servicer) {
     await prisma.servicer.update({
       where: { id: userId },
       data: { creditBalance: { increment: amount } },
     });
   } else {
     await prisma.user.update({
       where: { id: userId },
       data: { creditBalance: { increment: amount } },
     });
   }
   ```

3. **Dev fallback** — same as customer: `POST /user/me/topup` has an instant +RM 100 fallback in dev mode. Add same for servicer.

4. **Deposit page update** — add a "Top up with card" button using the Stripe Checkout URL:

```
┌── Top up credit ──────────────────────────────────────┐
│                                                        │
│  Add withdrawable credit to your account instantly.    │
│                                                        │
│  Amount: RM [______]                                   │
│                                                        │
│  [Top up with card 💳]    [Submit bank transfer]      │
│                                                        │
│  Note: Credit can be withdrawn to your bank.            │
│  Job earnings go to your Deposit (security buffer).    │
└────────────────────────────────────────────────────────┘
```

---

## 3. Transfer Interface (Deposit ↔ Credit)

### Frontend

New section on the deposit page, below the balance cards:

```
┌── Transfer between accounts ──────────────────────────┐
│                                                        │
│  Deposit balance:  RM 350.00                           │
│  Credit balance:    RM 200.00                          │
│                                                        │
│  Transfer from Deposit to Credit                        │
│  Amount: RM [_____]   [→ Transfer to Credit]           │
│  (Max: RM 250 — RM 100 minimum must stay)              │
│                                                        │
│  Transfer from Credit to Deposit                        │
│  Amount: RM [_____]   [→ Transfer to Deposit]          │
│  (Max: RM 200 — your full credit balance)              │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Backend

**POST /servicer/me/transfer**

```typescript
validate([
  body('direction').isIn(['deposit_to_credit', 'credit_to_deposit']),
  body('amount').isFloat({ gt: 0 }),
  body('pin').isString().isLength({ min: 6, max: 6 }),
])

1. Verify PIN
2. If deposit_to_credit:
   - Check deposit.currentBalance - amount >= minimumRequired (RM 100)
   - Decrement deposit.currentBalance
   - Increment servicer.creditBalance
3. If credit_to_deposit:
   - Check servicer.creditBalance >= amount
   - Increment deposit.currentBalance
   - Decrement servicer.creditBalance
4. Create transaction records in ServicerCreditLog for both sides
5. Return updated balances

All operations in a Prisma $transaction.
```

---

## 4. Bank Account in Servicer Settings

**File:** `frontend/src/app/servicer/pages/account.component.ts`

Add a new section:

```
┌── Bank Account ───────────────────────────────────────┐
│                                                        │
│  Your bank details are used for withdrawals.            │
│  Must be set before you can take jobs.                 │
│                                                        │
│  Bank name      [________]                             │
│  Account number [________]                             │
│                                                        │
│  [Save bank details]                                    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Fields on `Servicer`:** `bankName` (String?), `bankAccount` (String?) — add these.

**Backend:** Include in `PATCH /servicer/me` validation, return in `GET /servicer/me`.

---

## 5. Withdrawal Flow

**File:** `frontend/src/app/servicer/pages/withdrawals.component.ts` (new page, or modal on deposit page)

```
┌── Withdraw Credit ────────────────────────────────────┐
│                                                        │
│  Available credit:  RM 200.00                          │
│  Withdraw to:       CIMB · 1234-567-890 (Ahmad B)     │
│                                                        │
│  Amount: RM [_____]                                    │
│                                                        │
│  Enter your PIN to confirm                             │
│  PIN: [••••]                                            │
│                                                        │
│  Note: Withdrawals are reviewed by admin and           │
│  processed within 1-3 business days.                   │
│                                                        │
│  [Request withdrawal]    [Cancel]                      │
└────────────────────────────────────────────────────────┘
```

**Backend:**

`POST /servicer/me/withdrawal` — already exists at `servicer.routes.ts:302`. Update to verify PIN and record with bank details from profile.

`GET /servicer/me/withdrawals` — already exists, list withdrawal history.

Admin approves via `POST /admin/withdrawals/:id/mark-paid` (already exists).

---

## 6. Modular Promotion Engine

### Data model

New model `Promotion`:

```prisma
model Promotion {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  label       String                                             // "Welcome top-up bonus"
  description String?                                            // "New users get RM 10 free"
  active      Boolean  @default(true)
  
  // Trigger
  triggerType String   // topup_min_amount | order_percent | order_fixed_discount | first_booking | signup_bonus | category_booking | seasonal_fixed | seasonal_percent | referral_giver | referral_receiver | first_topup | nth_booking | booking_min_amount | topup_any
  
  // Value
  valueType   String   // "percent" | "fixed"                   // percent = %, fixed = RM
  value       Decimal  @db.Decimal(10, 2)                       // e.g. 10.00 means RM 10 or 10%
  
  // Conditions (JSON)
  conditions  Json     @default("{}")
  // Example: { "minAmount": 100 } for topup_min_amount
  //          { "categoryId": "uuid" } for category_booking
  //          { "nthNumber": 5 } for nth_booking
  //          { "minBookingAmount": 200 } for booking_min_amount
  
  // Targeting
  targetRole  String   @default("all")   // "customer" | "servicer" | "all"
  
  // Period
  startDate   DateTime? @map("start_date")
  endDate     DateTime? @map("end_date")
  
  // Usage limits
  maxUses     Int?     @default(null)    // null = unlimited
  usedCount   Int      @default(0) @map("used_count")
  maxPerUser  Int?     @default(1)       // how many times one user can benefit
  
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")
  
  @@map("promotions")
}
```

### All trigger types (full set)

| Trigger | valueType | conditions | Example |
|---------|-----------|------------|---------|
| `topup_any` | fixed | `{}` | "Top up any amount → get RM 5 free" |
| `topup_min_amount` | fixed | `{ "minAmount": 100 }` | "Top up ≥ RM 100 → get RM 10 free" |
| `first_topup` | fixed | `{}` | "First top-up → double bonus" |
| `order_percent` | percent | `{}` | "5% off all orders" |
| `order_fixed_discount` | fixed | `{}` | "RM 10 off every order" |
| `first_booking` | percent | `{}` | "50% off your first booking" |
| `nth_booking` | fixed | `{ "nthNumber": 5 }` | "Free RM 50 on your 5th booking" |
| `booking_min_amount` | percent | `{ "minBookingAmount": 200 }` | "10% off bookings ≥ RM 200" |
| `category_booking` | percent | `{ "categoryId": "uuid" }` | "10% off aircon servicing" |
| `signup_bonus` | fixed | `{}` | "Welcome! Here's RM 10 credit" |
| `referral_giver` | fixed | `{}` | "Refer a friend → get RM 15" |
| `referral_receiver` | fixed | `{}` | "You were referred → get RM 10" |
| `seasonal_percent` | percent | `{}` | "Merdeka Month: 15% off" (uses startDate/endDate) |
| `seasonal_fixed` | fixed | `{}` | "Hari Raya: RM 30 off" (uses startDate/endDate) |

### Backend API

```
GET  /admin/promotions              → list all, search, filter by active/trigger
POST /admin/promotions              → create (PIN-gated)
PATCH /admin/promotions/:id         → update (PIN-gated)
DELETE /admin/promotions/:id        → soft delete / deactivate (PIN-gated)

GET  /promotions/active?role=customer  → public: list active promos for current user
POST /promotions/apply               → evaluate + apply a promo, return discount
```

### Evaluation engine

**New file:** `backend/src/services/promotion.service.ts`

```typescript
async function evaluatePromotions(
  triggerType: string,
  context: { userId: string; amount?: number; categoryId?: string; bookingCount?: number },
): Promise<AppliedPromotion[]> {
  // 1. Find all active promotions matching trigger type + period
  // 2. Check conditions (minAmount, categoryId, nthNumber, etc.)
  // 3. Check usage limits (maxUses, maxPerUser)
  // 4. Calculate discount based on valueType + value
  // 5. Record usage in Promotion.usedCount + user-specific log
  // 6. Return applied promotions with discount amounts
}
```

### Frontend — admin promo management

**New tab under Admin → Platform Settings:**

```
┌──────────┬──────────────┬───────────┬─────────────┬──────────────┬──────────┬──────────────┐
│ General  │  Categories  │ Servicer  │  Location   │  Thumbnails  │  Banned  │  Promotions  │
└──────────┴──────────────┴───────────┴─────────────┴──────────────┴──────────┴──────────────┘
```

**File:** `admin/pages/settings.component.ts` — add "Promotions" tab.

**UI:**

```
┌── Promotions ─────────────────────────────────────────┐
│  [Search by label…]                     [+ Add promo] │
│                                                       │
│  ┌── Active ───────────────────────────────────────┐  │
│  │  🏷️ Welcome Bonus          topup_min    100 RM │  │
│  │  Active · 42 used/1000 max · Ends 30 Jun       │  │
│  │  [Edit]  [Deactivate]  [Duplicate]             │  │
│  ├────────────────────────────────────────────────┤  │
│  │  🏷️ 5% Off Everything     order_percent   5%  │  │
│  │  Active · No limit · No end date              │  │
│  │  [Edit]  [Deactivate]                         │  │
│  └────────────────────────────────────────────────┘  │
│                                                       │
│  ┌── Inactive ─────────────────────────────────────┐  │
│  │  🏷️ Hari Raya Promo        seasonal      30 RM │  │
│  │  Ended 15 Apr · 128 used                       │  │
│  │  [Activate]  [Duplicate]                        │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

**Add/Edit promo modal:**

```
┌────────────────────────────────────────────┐
│  Add Promotion                             │
│                                            │
│  Label *      [____________________]       │
│  Description  [____________________]       │
│                                            │
│  Trigger type *                             │
│  [▼ topup_min_amount       ]               │
│                                            │
│  Value type   ○ Percent  ● Fixed (RM)     │
│  Value *      [_____]                     │
│                                            │
│  Conditions                                │
│  Min amount:  [_____] (for topup_min)     │
│  Category:    [▼ Select...] (for category) │
│  Nth number:  [_____] (for nth_booking)   │
│  (conditions change based on trigger type) │
│                                            │
│  Target       [▼ Customers ]              │
│                                            │
│  Start date   [________]                   │
│  End date     [________]                   │
│                                            │
│  Max uses     [_____] (blank = unlimited)  │
│  Per user     [1]                          │
│                                            │
│  [Save]  [Cancel]                          │
└────────────────────────────────────────────┘
```

### Applying promotions at checkout

When a customer submits a quote or completes a top-up:

1. Frontend sends trigger event (e.g. `{ trigger: 'order_percent', amount: 150 }`)
2. Backend evaluates all active matching promotions
3. Returns applied discounts
4. Frontend displays: "🎉 5% off applied — save RM 7.50!"

For **web-wide 5% off**: admin creates a promotion with trigger `order_percent`, value `5`, no end date, no limits. It's always active.

---

## 7. Deposit Page Redesign

**File:** `frontend/src/app/servicer/pages/deposit.component.ts`

New layout combining all the pieces:

```
┌── Balance Overview ───────────────────────────────────┐
│  [Deposit: RM 350]  [Credit: RM 200]  [Total: RM 550]│
│  Minimum: RM 100 ───  ￬￬￬￬ (progress bar)         │
└──────────────────────────────────────────────────────┘

┌── Transfer between accounts ──────────────────────────┐  ← NEW
│  Deposit → Credit  /  Credit → Deposit                 │
└──────────────────────────────────────────────────────┘

┌── Top up credit ──────────────────────────────────────┐
│  [Amount]  [Top up with card 💳]  [Bank transfer]     │
└──────────────────────────────────────────────────────┘

┌── Withdraw credit ───────────────────────────────────┐  ← NEW
│  [Amount]  [Request withdrawal]                       │
│  Bank: CIMB · 1234-567-890  [Change bank details]    │
└──────────────────────────────────────────────────────┘

┌── Transaction history ────────────────────────────────┐
│  Table: Date · Type · Amount · Balance                │
└──────────────────────────────────────────────────────┘
```

---

## Build order

```
1. Schema: add bankName/bankAccount/onboarded to Servicer + Promotion model + db push
2. Backend: promotion engine + CRUD endpoints
3. Frontend: admin Promotions tab (settings.component.ts)
4. Backend: deposit↔credit transfer endpoint + withdrawal PIN gate
5. Backend: servicer Stripe top-up endpoint
6. Frontend: deposit page redesign (transfer UI, top-up, withdrawal)
7. Frontend: bank account section in servicer settings
8. Frontend: onboarding gate (redirect modal on first job attempt)
9. Seed: create default promotions (5% web-wide, welcome bonus)
10. FAQ: update all entries for deposit, credit, promotions, withdrawals
```

## DoD

| Gate | Expected |
|------|----------|
| `db push` | All new fields + Promotion model created |
| `npx tsc --noEmit` backend | 0 errors |
| `ng build` frontend | Exit 0 |
| Servicer Stripe top-up → creditBalance | ✅ |
| Job earnings → deposit | ✅ |
| Transfer Deposit → Credit (above minimum) | ✅ |
| Transfer Credit → Deposit | ✅ |
| Withdrawal request with PIN | ✅ |
| Admin creates/edits/deactivates promotions | ✅ |
| Promotions evaluate at order/top-up time | ✅ |
| Web-wide 5% off works via promotion | ✅ |
| Welcome bonus works (top-up ≥ RM 100 → +RM 10) | ✅ |
| Bank account saved in servicer settings | ✅ |
| Onboarding gate blocks job-taking until requirements met | ✅ |
| FAQ entries updated for all new features | ✅ |
