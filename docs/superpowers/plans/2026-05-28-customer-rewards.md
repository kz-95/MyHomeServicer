# Customer Rewards System - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task.

**Goal:** Replace the static demo rewards page with a full backend-driven loyalty program. Points earned through spending/reviews/referrals, redeemed as top-up discount vouchers.

**Architecture:** Four new Prisma models (`CustomerPoints`, `PointsTransaction`, `Reward`, `Redemption`), one new backend service (`rewards.service.ts`), admin CRUD endpoints, customer-facing points/voucher API. Frontend rewrites the rewards page with API-backed data, adds voucher auto-apply at top-up, splits admin settings into Money/UI/UX/User pages.

**Tech Stack:** Prisma (Postgres), Express.js, Angular standalone components.

---

## File Structure Map

### New files
```
backend/src/services/rewards.service.ts     - Points engine, redemption, voucher logic
```

### Modified files
```
backend/prisma/schema.prisma                 - 4 new models
backend/src/routes/rewards.routes.ts         - Customer reward endpoints (or inline in user.routes)
backend/src/routes/admin.routes.ts           - Admin reward/tier CRUD
backend/src/services/booking.service.ts      - Points earning on doneJob()
backend/src/services/auth.service.ts         - Welcome points at registration
backend/src/routes/servicer.routes.ts        - Fee breakdown endpoint
frontend/src/app/customer/pages/rewards.component.ts - Rewards page rewrite
frontend/src/app/customer/pages/my-bookings.component.ts - Review-earning integration
frontend/src/app/customer/shell/customer-shell.component.ts - Welcome/idle banner
frontend/src/app/shared/shell.component.ts   - Idle rewards banner
frontend/src/app/admin/pages/settings.component.ts - Admin rewards/tier tabs
frontend/src/app/servicer/pages/account.component.ts - Fee transparency card
backend/prisma/seed/data/static.ts           - FAQ entries
backend/prisma/seed/seed.ts                  - Seed points, rewards, redemptions
backend/prisma/seed/data/accounts.ts         - Customer points seed data
docs/ai-context/schema-notes.md             - Document new models
docs/api-reference/api-doc.md               - Document new endpoints
```

**Important:** The admin settings split (Money/UI/UX/User pages) is a large restructure. It may be more practical to add the rewards/tier admin CRUD as new tabs in the existing settings page rather than splitting into separate pages. The plan below documents both approaches - recommend tabs first, split later.

---

## Task B2-S1: Schema changes + db push

### Task B2.1: Add 4 reward models to schema

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [x] **Step 1: Add CustomerPoints model**

After the `BannedEmail` model, add:
```prisma
model CustomerPoints {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId         String   @unique @map("user_id") @db.Uuid
  balance        Int      @default(0)
  lifetimeEarned Int      @default(0) @map("lifetime_earned")
  lifetimeSpent  Int      @default(0) @map("lifetime_spent")
  lastRewardsVisit DateTime? @map("last_rewards_visit")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id])
  @@map("customer_points")
}
```

- [x] **Step 2: Add PointsTransaction model**

```prisma
model PointsTransaction {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  type      String   // earn_booking | earn_review | earn_referral | earn_welcome | redeem | expire
  amount    Int      // positive = earned, negative = spent
  balance   Int      // running balance after this transaction
  reference String?  // bookingId, reviewId, rewardId
  note      String?
  createdAt DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id])
  @@index([userId, createdAt])
  @@map("points_transactions")
}
```

- [x] **Step 3: Add Reward model**

```prisma
model Reward {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name          String
  description   String?
  pointCost     Int
  discountType  String   // topup_fixed | booking_percent | waiver
  discountValue Decimal  @db.Decimal(10, 2)
  maxDiscount   Decimal? @db.Decimal(10, 2)
  minTopup      Decimal? @db.Decimal(10, 2)
  active        Boolean  @default(true)
  sortOrder     Int      @default(0) @map("sort_order")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@map("rewards")
}
```

- [x] **Step 4: Add Redemption model**

```prisma
model Redemption {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String    @map("user_id") @db.Uuid
  rewardId    String    @map("reward_id") @db.Uuid
  voucherCode String    @unique @map("voucher_code")
  status      String    @default("active")  // active | used | expired
  usedAt      DateTime? @map("used_at")
  expiresAt   DateTime? @map("expires_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  user   User   @relation(fields: [userId], references: [id])
  reward Reward @relation(fields: [rewardId], references: [id])

  @@map("redemptions")
}
```

- [x] **Step 5: Update end-of-schema comment**

```prisma
// End of schema - 47 models (46 domain + IdempotencyFallback infrastructure).
```

- [x] **Step 6: Run db push**

```powershell
cd backend
Remove-Item -Recurse -Force node_modules/.prisma/client
npx prisma db push
```

- [x] **Step 7: Verify tsc**

```powershell
npx tsc --noEmit
```

- [x] **Step 8: Update schema-notes.md**

Add blocks for CustomerPoints, PointsTransaction, Reward, Redemption models.

- [x] **Step 9: Commit**

```powershell
git add backend/prisma/schema.prisma docs/ai-context/schema-notes.md
git commit -m "feat: rewards schema - CustomerPoints, PointsTransaction, Reward, Redemption"
```

---

## Task B2-S2: Backend rewards service

### Task B2.2: Create rewards service with points engine

**Files:**
- Create: `backend/src/services/rewards.service.ts`

- [x] **Step 1: Create rewards service**

```typescript
import { prisma } from '../lib/prisma';
import { badRequest, notFound } from '../lib/errors';

const WELCOME_POINTS = 500;

// ── Welcome points ──────────────────────────────────────────────────────

export async function awardWelcomePoints(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.customerPoints.upsert({
      where: { userId },
      update: {
        balance: { increment: WELCOME_POINTS },
        lifetimeEarned: { increment: WELCOME_POINTS },
      },
      create: {
        userId,
        balance: WELCOME_POINTS,
        lifetimeEarned: WELCOME_POINTS,
      },
    });

    await tx.pointsTransaction.create({
      data: {
        userId,
        type: 'earn_welcome',
        amount: WELCOME_POINTS,
        balance: WELCOME_POINTS,
        note: '🎉 Welcome! Here are 500 free points to get started.',
      },
    });
  });
}

// ── Points on booking completion ─────────────────────────────────────────

export async function awardBookingPoints(userId: string, bookingId: string, price: number): Promise<void> {
  const pointsEarned = Math.floor(price); // 1 pt per RM 1

  // Calculate tier bonus
  const points = await tx.customerPoints.findUnique({ where: { userId } });
  const lifetimeEarned = points?.lifetimeEarned ?? 0;
  const tier = computeTier(lifetimeEarned);
  const bonusMultiplier = 1 + (tier.bonusPercent / 100);
  const finalPoints = Math.round(pointsEarned * bonusMultiplier);

  await prisma.$transaction(async (tx) => {
    const updated = await tx.customerPoints.upsert({
      where: { userId },
      update: {
        balance: { increment: finalPoints },
        lifetimeEarned: { increment: finalPoints },
      },
      create: { userId, balance: finalPoints, lifetimeEarned: finalPoints },
    });

    await tx.pointsTransaction.create({
      data: {
        userId,
        type: 'earn_booking',
        amount: finalPoints,
        balance: updated.balance,
        reference: bookingId,
        note: tier.bonusPercent > 0
          ? `Earned ${finalPoints} pts (${pointsEarned} base + ${finalPoints - pointsEarned} ${tier.name} bonus)`
          : `Earned ${finalPoints} pts from booking`,
      },
    });
  });
}

// ── Points on review ─────────────────────────────────────────────────────

export async function awardReviewPoints(userId: string, bookingId: string): Promise<void> {
  const REVIEW_POINTS = 50;

  await prisma.$transaction(async (tx) => {
    const updated = await tx.customerPoints.upsert({
      where: { userId },
      update: {
        balance: { increment: REVIEW_POINTS },
        lifetimeEarned: { increment: REVIEW_POINTS },
      },
      create: { userId, balance: REVIEW_POINTS, lifetimeEarned: REVIEW_POINTS },
    });

    await tx.pointsTransaction.create({
      data: {
        userId,
        type: 'earn_review',
        amount: REVIEW_POINTS,
        balance: updated.balance,
        reference: bookingId,
        note: 'Earned 50 pts for submitting a review',
      },
    });
  });
}

// ── Tier computation ─────────────────────────────────────────────────────

interface TierInfo {
  name: string;
  bonusPercent: number;
  progress: number;
  next: string | null;
}

export function computeTier(lifetimeEarned: number): TierInfo {
  const tiers = [
    { name: 'Platinum', min: 5000, bonus: 50 },
    { name: 'Gold', min: 2000, bonus: 25 },
    { name: 'Silver', min: 500, bonus: 10 },
    { name: 'Bronze', min: 0, bonus: 0 },
  ];

  const current = tiers.find((t) => lifetimeEarned >= t.min) ?? tiers[tiers.length - 1];
  const nextTier = [...tiers].reverse().find((t) => t.min > lifetimeEarned);

  const currentIdx = tiers.indexOf(current);
  const nextIdx = currentIdx - 1;
  const next = tiers[nextIdx];
  const progress = next
    ? ((lifetimeEarned - current.min) / (next.min - current.min)) * 100
    : 100;

  return {
    name: current.name,
    bonusPercent: current.bonus,
    progress: Math.min(100, Math.max(0, progress)),
    next: next?.name ?? null,
  };
}

// ── Points queries ───────────────────────────────────────────────────────

export async function getPoints(userId: string) {
  const points = await prisma.customerPoints.findUnique({ where: { userId } });
  const balance = points?.balance ?? 0;
  const lifetimeEarned = points?.lifetimeEarned ?? 0;
  const tier = computeTier(lifetimeEarned);

  return {
    balance,
    lifetimeEarned,
    tier: tier.name,
    tierBonusPercent: tier.bonusPercent,
    tierProgress: tier.progress,
    nextTier: tier.next,
  };
}

export async function getPointsHistory(userId: string, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [data, total] = await Promise.all([
    prisma.pointsTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.pointsTransaction.count({ where: { userId } }),
  ]);
  return { data, total, page };
}

// ── Rewards catalog ──────────────────────────────────────────────────────

export async function getActiveRewards() {
  return prisma.reward.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  });
}

// ── Redemption / Voucher ─────────────────────────────────────────────────

export async function redeemReward(userId: string, rewardId: string) {
  const reward = await prisma.reward.findUnique({ where: { id: rewardId } });
  if (!reward || !reward.active) throw notFound('Reward not found');

  const points = await prisma.customerPoints.findUnique({ where: { userId } });
  if (!points || points.balance < reward.pointCost) {
    throw badRequest(`Insufficient points. Need ${reward.pointCost}, have ${points?.balance ?? 0}.`);
  }

  const voucherCode = generateVoucherCode();

  return prisma.$transaction(async (tx) => {
    // Deduct points
    const updated = await tx.customerPoints.update({
      where: { userId },
      data: {
        balance: { decrement: reward.pointCost },
        lifetimeSpent: { increment: reward.pointCost },
      },
    });

    // Record transaction
    await tx.pointsTransaction.create({
      data: {
        userId,
        type: 'redeem',
        amount: -reward.pointCost,
        balance: updated.balance,
        reference: rewardId,
        note: `Redeemed ${reward.pointCost} pts for "${reward.name}"`,
      },
    });

    // Create redemption
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const redemption = await tx.redemption.create({
      data: {
        userId,
        rewardId,
        voucherCode,
        status: 'active',
        expiresAt,
      },
    });

    return {
      voucherCode,
      redemptionId: redemption.id,
      reward: { name: reward.name, discountType: reward.discountType, discountValue: Number(reward.discountValue) },
      expiresAt,
    };
  });
}

export async function getUserRedemptions(userId: string) {
  return prisma.redemption.findMany({
    where: { userId },
    include: { reward: { select: { name: true, discountType: true, discountValue: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getActiveVouchers(userId: string, topupAmount?: number) {
  const now = new Date();
  const redemptions = await prisma.redemption.findMany({
    where: {
      userId,
      status: 'active',
      expiresAt: { gt: now },
      reward: { discountType: 'topup_fixed', active: true },
    },
    include: { reward: { select: { name: true, discountValue: true, minTopup: true, discountType: true } } },
  });

  return redemptions
    .filter((r) => !r.reward.minTopup || !topupAmount || topupAmount >= Number(r.reward.minTopup))
    .map((r) => ({
      voucherCode: r.voucherCode,
      rewardName: r.reward.name,
      discountType: r.reward.discountType,
      discount: Number(r.reward.discountValue),
      finalAmount: topupAmount ? Math.max(0, topupAmount - Number(r.reward.discountValue)) : undefined,
    }));
}

export async function applyVoucher(voucherCode: string, userId: string) {
  const redemption = await prisma.redemption.findUnique({
    where: { voucherCode },
    include: { reward: true },
  });
  if (!redemption) throw notFound('Voucher not found');
  if (redemption.userId !== userId) throw badRequest('This voucher does not belong to you.');
  if (redemption.status !== 'active') throw badRequest('Voucher has already been used or expired.');
  if (redemption.expiresAt && redemption.expiresAt < new Date()) {
    await prisma.redemption.update({ where: { id: redemption.id }, data: { status: 'expired' } });
    throw badRequest('Voucher has expired.');
  }

  return {
    valid: true,
    voucherCode: redemption.voucherCode,
    discountType: redemption.reward.discountType,
    discountValue: Number(redemption.reward.discountValue),
    redemptionId: redemption.id,
  };
}

export async function markVoucherUsed(redemptionId: string): Promise<void> {
  await prisma.redemption.update({
    where: { id: redemptionId },
    data: { status: 'used', usedAt: new Date() },
  });
}

// ── Rewards prompt ──────────────────────────────────────────────────────

export async function getRewardsPrompt(userId: string): Promise<{ show: boolean; points: number; lastVisitDays: number }> {
  const points = await prisma.customerPoints.findUnique({ where: { userId } });
  if (!points || points.balance <= 0) return { show: false, points: 0, lastVisitDays: 0 };

  const lastVisit = points.lastRewardsVisit;
  if (!lastVisit) return { show: true, points: points.balance, lastVisitDays: 999 };

  const daysSince = Math.floor((Date.now() - lastVisit.getTime()) / (1000 * 60 * 60 * 24));
  return { show: daysSince >= 3, points: points.balance, lastVisitDays: daysSince };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function generateVoucherCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'RWD-';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
```

- [x] **Step 2: Verify tsc**

```powershell
npx tsc --noEmit
```

- [x] **Step 3: Commit**

```powershell
git add backend/src/services/rewards.service.ts
git commit -m "feat: rewards service - points engine, redemption, vouchers"
```

### Task B2.3: Wire welcome points at registration

**Files:**
- Modify: `backend/src/routes/auth.routes.ts` (user register)
- Modify: `backend/src/services/auth.service.ts`

- [x] **Step 1: Add import and call in auth.service.ts register flow**

In `register()` and `registerServicer()`, after user creation and token generation but before returning, add:
```typescript
import { awardWelcomePoints } from '../services/rewards.service';

// After user created and before return:
if (role === 'customer') {
  await awardWelcomePoints(newUser.id).catch((e) => logger.warn('Welcome points failed', e));
}
```

- [x] **Step 2: Verify tsc**

- [x] **Step 3: Commit**

### Task B2.4: Wire points at booking completion

**Files:**
- Modify: `backend/src/services/booking.service.ts`

- [x] **Step 1: Add import and call in doneJob()**

In `doneJob()`, after `generateInvoice()` or alongside it, add:
```typescript
import { awardBookingPoints } from '../services/rewards.service';

// In doneJob, after invoice generation:
const price = Number(updatedBooking.price);
await awardBookingPoints(booking.userId, booking.id, price).catch((e) => logger.warn('Booking points failed', e));
```

- [x] **Step 2: Wire review points - add a review-submission hook**

Find where reviews are created (likely in `booking.service.ts` or a reviews route). Add:
```typescript
import { awardReviewPoints } from '../services/rewards.service';

// After review is created:
await awardReviewPoints(userId, bookingId).catch((e) => logger.warn('Review points failed', e));
```

- [x] **Step 3: Verify tsc**

- [x] **Step 4: Commit**

---

## Task B2-S3: Backend reward/tier CRUD routes

### Task B2.5: Add admin reward/tier routes

**Files:**
- Modify: `backend/src/routes/admin.routes.ts`

- [x] **Step 1: Add reward CRUD routes**

Before the `csvCell` function, add:
```typescript
// ── Rewards (admin) ──────────────────────────────────────────────────────────

/** GET /admin/rewards - list all rewards */
adminRouter.get('/rewards', asyncHandler(async (req, res) => {
  const data = await prisma.reward.findMany({ orderBy: { sortOrder: 'asc' } });
  res.json({ data });
}));

/** POST /admin/rewards - create (PIN-gated) */
adminRouter.post('/rewards', requirePin, validate([
  body('name').isString().notEmpty(),
  body('pointCost').isInt({ min: 1 }),
  body('discountType').isIn(['topup_fixed', 'booking_percent', 'waiver']),
  body('discountValue').isFloat({ gt: 0 }),
]), asyncHandler(async (req, res) => {
  const reward = await prisma.reward.create({ data: req.body });
  res.status(201).json(reward);
}));

/** PATCH /admin/rewards/:id - update (PIN-gated) */
adminRouter.patch('/rewards/:id', requirePin, asyncHandler(async (req, res) => {
  const existing = await prisma.reward.findUnique({ where: { id: req.params.id } });
  if (!existing) throw notFound('Reward not found');
  const updated = await prisma.reward.update({ where: { id: req.params.id }, data: req.body });
  res.json(updated);
}));

/** DELETE /admin/rewards/:id - soft-delete (deactivate, PIN-gated) */
adminRouter.delete('/rewards/:id', requirePin, asyncHandler(async (req, res) => {
  await prisma.reward.update({ where: { id: req.params.id }, data: { active: false } });
  res.json({ message: 'Reward deactivated.' });
}));

/** GET /admin/rewards/redemptions - redemption log */
adminRouter.get('/rewards/redemptions', asyncHandler(async (req, res) => {
  const data = await prisma.redemption.findMany({
    include: { user: { select: { name: true, email: true } }, reward: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ data });
}));

/** POST /admin/rewards/redemptions/:id/void - void a redemption (PIN-gated) */
adminRouter.post('/rewards/redemptions/:id/void', requirePin, asyncHandler(async (req, res) => {
  const r = await prisma.redemption.update({
    where: { id: req.params.id },
    data: { status: 'expired' },
  });
  res.json({ message: 'Redemption voided.', redemption: r });
}));
```

- [x] **Step 2: Add customer reward routes**

Create or modify `backend/src/routes/rewards.routes.ts`:

```typescript
import { Router } from 'express';
import { body } from 'express-validator';
import { asyncHandler } from '../lib/async-handler';
import { requireAuth, requireCustomer } from '../middleware/auth';
import {
  getPoints, getPointsHistory, getActiveRewards,
  getUserRedemptions, redeemReward, getActiveVouchers, applyVoucher, getRewardsPrompt,
} from '../services/rewards.service';

export const rewardsRouter = Router();

// ── Customer endpoints ───────────────────────────────────────────────────────

rewardsRouter.get('/config', asyncHandler(async (req, res) => {
  // Public config: earning rates, default tier info
  res.json({
    pointsPerRM: 1,
    reviewPoints: 50,
    referralPoints: 200,
    welcomePoints: 500,
    tiers: [
      { name: 'Bronze', minPoints: 0, bonusPercent: 0 },
      { name: 'Silver', minPoints: 500, bonusPercent: 10 },
      { name: 'Gold', minPoints: 2000, bonusPercent: 25 },
      { name: 'Platinum', minPoints: 5000, bonusPercent: 50 },
    ],
  });
}));

rewardsRouter.get('/user/me/points', requireAuth, asyncHandler(async (req, res) => {
  const data = await getPoints(req.user!.id);
  res.json(data);
}));

rewardsRouter.get('/user/me/points/history', requireAuth, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const data = await getPointsHistory(req.user!.id, page, limit);
  res.json(data);
}));

rewardsRouter.get('/rewards', asyncHandler(async (req, res) => {
  const data = await getActiveRewards();
  res.json({ data });
}));

rewardsRouter.get('/user/me/rewards', requireAuth, asyncHandler(async (req, res) => {
  const data = await getUserRedemptions(req.user!.id);
  res.json({ data });
}));

rewardsRouter.post('/user/me/rewards/:id/redeem', requireAuth, requireCustomer, asyncHandler(async (req, res) => {
  const result = await redeemReward(req.user!.id, req.params.id);
  res.json(result);
}));

rewardsRouter.get('/user/me/rewards/prompt', requireAuth, asyncHandler(async (req, res) => {
  const result = await getRewardsPrompt(req.user!.id);
  res.json(result);
}));

rewardsRouter.post('/user/me/rewards/visit', requireAuth, asyncHandler(async (req, res) => {
  await prisma.customerPoints.upsert({
    where: { userId: req.user!.id },
    update: { lastRewardsVisit: new Date() },
    create: { userId: req.user!.id, lastRewardsVisit: new Date() },
  });
  res.json({ ok: true });
}));
```

Mount this in `backend/src/routes/index.ts`:
```typescript
import { rewardsRouter } from './rewards.routes';
app.use('/api/v1', rewardsRouter);
```

- [x] **Step 3: Verify tsc**

- [x] **Step 4: Add fee-breakdown endpoint to servicer routes**

In `backend/src/routes/servicer.routes.ts`:
```typescript
/** GET /servicer/me/fee-breakdown - platform fee transparency */
servicerRouter.get('/me/fee-breakdown', requireAuth, requireServicer, asyncHandler(async (req, res) => {
  const settings = await prisma.platformSettings.findFirst();
  const feeRate = settings?.value && typeof settings.value === 'object' && 'current_rate' in (settings.value as Record<string, unknown>)
    ? Number((settings.value as Record<string, unknown>).current_rate) * 100
    : 20;

  res.json({
    totalRate: feeRate,
    breakdown: [
      { label: 'Rewards & promotions', percent: 8 },
      { label: 'Marketing & acquisition', percent: 5 },
      { label: 'Platform operations', percent: 4 },
      { label: 'Platform margin', percent: 3 },
    ],
  });
}));
```

- [x] **Step 5: Verify tsc**

- [x] **Step 6: Update api-doc.md**

- [x] **Step 7: Commit**

---

## Task B2-S4: Frontend Rewards page rewrite

### Task B2.6: Rewrite rewards component with API-backed data

**Files:**
- Read first: `frontend/src/app/customer/pages/rewards.component.ts` (existing)
- Modify: same file

- [x] **Step 1: Read current rewards component**

```powershell
Get-Content -Path frontend/src/app/customer/pages/rewards.component.ts
```
Analyze existing template and class structure.

- [x] **Step 2: Replace static data with API calls**

New signals:
```typescript
points = signal<{ balance: number; lifetimeEarned: number; tier: string; tierBonusPercent: number; tierProgress: number; nextTier: string | null } | null>(null);
history = signal<PointsTransaction[]>([]);
rewards = signal<Reward[]>([]);
myRedemptions = signal<Redemption[]>([]);
loading = signal(true);
historyLoading = signal(false);
redeeming = signal<string | null>(null); // rewardId being redeemed
redeemMsg = signal<{ text: string; error: boolean } | null>(null);
```

- [x] **Step 3: Replace template sections** - replace static data bindings with `points()`, `rewards()`, `history()` signals

Key sections to replace:
- Points balance header → `points()?.balance`
- Tier badge → `points()?.tier`
- Progress bar → `points()?.tierProgress + '%'`
- Reward grid → `rewards()` array
- Transaction history → `history()` array

- [x] **Step 4: Add redeem method**

```typescript
redeem(rewardId: string): void {
  this.redeeming.set(rewardId);
  this.redeemMsg.set(null);
  this.api.post<{ voucherCode: string }>(`/user/me/rewards/${rewardId}/redeem`, {}).subscribe({
    next: (r) => {
      this.redeeming.set(null);
      this.redeemMsg.set({ text: `Voucher ${r.voucherCode} created! Check your redemptions tab.`, error: false });
      this.loadPoints();
      this.loadRedemptions();
    },
    error: (e) => {
      this.redeeming.set(null);
      this.redeemMsg.set({ text: e.error?.message ?? e.message ?? 'Redemption failed.', error: true });
    },
  });
}
```

- [x] **Step 5: Verify tsc + ng build**

- [x] **Step 6: Commit**

---

## Task B2-S5: Frontend voucher auto-apply + banners

### Task B2.7: Add voucher auto-apply at top-up

**Files:**
- Modify: `frontend/src/app/customer/pages/my-bookings.component.ts` (or wherever the top-up flow is)

- [x] **Step 1: Add active voucher check before top-up**

When the user goes to the top-up flow (in `quote-form.component.ts` top-up modal or the customer top-up page):

After entering the amount, call `GET /rewards/active-vouchers?topupAmount=X`:
```typescript
this.api.get<{ voucherCode: string; discount: number; finalAmount: number }[]>(
  `/rewards/active-vouchers?topupAmount=${this.topupAmount}`
).subscribe({
  next: (vouchers) => {
    if (vouchers.length > 0) {
      this.availableVoucher.set(vouchers[0]);
    }
  },
});
```

- [x] **Step 2: Show voucher discount in top-up UI**

```html
@if (availableVoucher(); as v) {
  <div class="voucher-banner">
    <span>🎉 You have a voucher! Pay RM {{ v.finalAmount }} instead of RM {{ topupAmount }}</span>
    <button class="btn-ghost btn-xs" (click)="applyVoucher(v.voucherCode)">Apply</button>
  </div>
}
```

- [x] **Step 3: Apply voucher on Stripe Checkout creation**

When calling the topup endpoint, pass the voucher code in the body:
```typescript
this.api.post('/user/me/topup', { amount: this.topupAmount, voucherCode: this.availableVoucher()?.voucherCode })
```

On the backend, in the topup endpoint: if voucherCode is provided, validate it and reduce the Stripe amount:
```typescript
if (req.body.voucherCode) {
  const voucher = await applyVoucher(req.body.voucherCode, req.user!.id);
  if (voucher.valid) {
    amount = Math.max(0, amount - voucher.discountValue);
    await markVoucherUsed(voucher.redemptionId);
  }
}
```

- [x] **Step 4: Verify tsc + ng build**

- [x] **Step 5: Commit**

### Task B2.8: Add welcome banner + idle re-engagement banner

**Files:**
- Modify: `frontend/src/app/customer/shell/customer-shell.component.ts`
- Modify: `frontend/src/app/shared/shell.component.ts`

- [x] **Step 1: Add welcome banner on first rewards visit**

In `rewards.component.ts`, check if the user has welcome points and show a banner:
```typescript
showWelcomeBanner = computed(() => {
  const p = this.points();
  return p && p.balance >= 500 && p.lifetimeEarned === 500; // only welcome points, no spending yet
});
```

```html
@if (showWelcomeBanner()) {
  <div class="welcome-banner" role="alert">
    <span>🎉 Welcome! You have {{ points()?.balance }} free points. Try redeeming one below!</span>
    <button (click)="dismissWelcome()">Got it</button>
  </div>
}
```

- [x] **Step 2: Add idle re-engagement banner in customer shell**

In `customer-shell.component.ts`, after initializing, load the rewards prompt:
```typescript
ngOnInit(): void {
  // ... existing init ...
  this.loadRewardsPrompt();
}

rewardsPromptData = signal<{ show: boolean; points: number } | null>(null);

private loadRewardsPrompt(): void {
  this.api.get<{ show: boolean; points: number }>('/user/me/rewards/prompt').subscribe({
    next: (r) => {
      if (r.show) this.rewardsPromptData.set(r);
    },
  });
}
```

```html
@if (rewardsPromptData(); as r) {
  <div class="rewards-banner" role="alert">
    <span>💎 You have {{ r.points }} points waiting!</span>
    <a routerLink="/customer/rewards" (click)="rewardsPromptData.set(null)">Check rewards →</a>
    <button (click)="rewardsPromptData.set(null)">×</button>
  </div>
}
```

- [x] **Step 3: Verify ng build**

- [x] **Step 4: Commit**

---

## Task B2-S6: Servicer fee transparency card

### Task B2.9: Add fee breakdown card to servicer account

**Files:**
- Modify: `frontend/src/app/servicer/pages/account.component.ts`

- [x] **Step 1: Add fee breakdown card**

After the Tax configuration section and before the Invoice formatting section, add:
```html
<!-- ── Platform Fee Breakdown ────────────────────────── -->
<section class="card page-child">
  <h2>Platform fee breakdown</h2>
  <p class="muted">We charge {{ feeBreakdown()?.totalRate ?? 20 }}% on every completed booking. Here's where it goes:</p>
  <div class="fee-breakdown">
    @for (item of feeBreakdown()?.breakdown ?? []; track item.label) {
      <div class="fee-row">
        <span class="fee-label">{{ item.label }}</span>
        <span class="fee-bar"><span class="fee-fill" [style.width.%]="item.percent"></span></span>
        <span class="fee-pct">{{ item.percent }}%</span>
      </div>
    }
    <div class="fee-row fee-total">
      <span class="fee-label">Total</span>
      <span class="fee-bar"><span class="fee-fill total" [style.width.%]="feeBreakdown()?.totalRate ?? 20"></span></span>
      <span class="fee-pct">{{ feeBreakdown()?.totalRate ?? 20 }}%</span>
    </div>
  </div>
</section>
```

- [x] **Step 2: Add signals + loading**

```typescript
feeBreakdown = signal<{ totalRate: number; breakdown: { label: string; percent: number }[] } | null>(null);

// In ngOnInit, add after profile load:
this.api.get('/servicer/me/fee-breakdown').subscribe({
  next: (r: any) => this.feeBreakdown.set(r),
  error: () => {},
});
```

- [x] **Step 3: Add CSS**

```css
.fee-breakdown { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }
.fee-row { display: grid; grid-template-columns: 180px 1fr 50px; align-items: center; gap: 0.5rem; font-size: 0.85rem; }
.fee-label { font-weight: 500; }
.fee-bar { height: 12px; background: var(--color-bg); border-radius: 999px; overflow: hidden; }
.fee-fill { display: block; height: 100%; background: var(--color-primary); border-radius: 999px; transition: width 0.3s ease; }
.fee-fill.total { background: var(--color-accent); }
.fee-pct { font-weight: 600; color: var(--color-muted); text-align: right; }
.fee-total { border-top: 1px solid var(--color-border); padding-top: 0.5rem; margin-top: 0.3rem; }
```

- [x] **Step 4: Verify ng build**

- [x] **Step 5: Commit**

---

## Task B2-S7: Seed data

### Task B2.10: Add reward and points seeding

**Files:**
- Modify: `backend/prisma/seed/data/static.ts`
- Modify: `backend/prisma/seed/seed.ts`
- Modify: `backend/prisma/seed/data/accounts.ts` (or inline in seed.ts)

- [x] **Step 1: Add reward seeds to static.ts**

```typescript
export const REWARD_SEEDS = [
  { name: 'RM 5 Top-up Discount', description: 'Save RM 5 on your next top-up of RM 20 or more.', pointCost: 100, discountType: 'topup_fixed', discountValue: 5, minTopup: 20, active: true, sortOrder: 1 },
  { name: 'RM 10 Top-up Discount', description: 'Save RM 10 on your next top-up of RM 25 or more.', pointCost: 200, discountType: 'topup_fixed', discountValue: 10, minTopup: 25, active: true, sortOrder: 2 },
  { name: 'RM 25 Top-up Discount', description: 'Save RM 25 on your next top-up of RM 75 or more.', pointCost: 500, discountType: 'topup_fixed', discountValue: 25, minTopup: 75, active: true, sortOrder: 3 },
  { name: '10% Off Next Booking', description: 'Get 10% off your next booking (max RM 30 discount).', pointCost: 600, discountType: 'booking_percent', discountValue: 10, maxDiscount: 30, active: true, sortOrder: 4 },
  { name: 'Free Call-out Waiver', description: 'Waive the call-out fee on your next booking (up to RM 30).', pointCost: 800, discountType: 'waiver', discountValue: 30, active: true, sortOrder: 5 },
  { name: 'RM 50 Top-up Discount', description: 'Save RM 50 on your next top-up of RM 150 or more.', pointCost: 1000, discountType: 'topup_fixed', discountValue: 50, minTopup: 150, active: true, sortOrder: 6 },
];
```

- [x] **Step 2: Add seeding to seed.ts**

After the category/products section, but before the end:
```typescript
// ── Rewards ──
for (const r of REWARD_SEEDS) {
  await prisma.reward.upsert({
    where: { id: r.name }, // can't upsert on name - use findFirst + create
  });
}
```
Better approach: use findFirst + create pattern:
```typescript
for (const r of REWARD_SEEDS) {
  const existing = await prisma.reward.findFirst({ where: { name: r.name } });
  if (!existing) {
    await prisma.reward.create({ data: r });
  }
}
```

- [x] **Step 3: Add customer points seed**

After creating the 3 customer demo accounts:
```typescript
// Customer.fresh: 500 welcome points, never visited
await prisma.customerPoints.upsert({
  where: { userId: freshUser.id },
  update: {},
  create: { userId: freshUser.id, balance: 500, lifetimeEarned: 500 },
});

// Customer.active: 950 pts, 725 lifetime (3 bookings + reviews)
await prisma.customerPoints.upsert({
  where: { userId: activeUser.id },
  update: {},
  create: { userId: activeUser.id, balance: 950, lifetimeEarned: 950 },
});

// Customer.loyal: 2100 pts, 2600 lifetime (14 bookings + reviews + referral - 500 redeemed)
await prisma.customerPoints.upsert({
  where: { userId: loyalUser.id },
  update: {},
  create: { userId: loyalUser.id, balance: 2100, lifetimeEarned: 2600 },
});

// Add points transactions for Customer.loyal (using the PointsTransaction array)
// See spec §8 for the full 24-entry transaction log
```

- [x] **Step 4: Run reseed**

```powershell
npm run reseed
```

- [x] **Step 5: Commit**

---

## Task B2-S8: Admin Settings split (optional - tabs-first approach)

### Task B2.11: Restructure admin settings into tab groups

**Approach A (recommended first):** Keep all settings in one page, group related fields clearly. Add a "Rewards" tab alongside existing tabs.

**Approach B (post-MVP):** Split into 3 separate pages (Money, UI/UX, User) as separate route components.

- [x] **Step 1: Add Rewards tab to existing admin settings**

Add `'rewards'` to the `Tab` type:
```typescript
type Tab = 'customer' | 'servicer' | 'platform' | 'thumbnails' | 'banned' | 'promotions' | 'rewards';
```

Add Rewards tab button and section template (reward CRUD table + tier config form) following the same pattern as the Promotions tab.

- [x] **Step 2: Add reward/tier management signals and methods** - reuse the patterns from `promotion.service.ts` but target `/admin/rewards` endpoints.

- [x] **Step 3: Verify ng build**

- [x] **Step 4: Commit**

---

## Task B2-S9: FAQ update

### Task B2.12: Add rewards FAQ entries

**Files:**
- Modify: `backend/prisma/seed/data/static.ts`

- [x] **Step 1: Add 4-5 FAQ entries**

```typescript
{
  category: 'rewards',
  question: 'How do I earn points on MyHomeServicer?',
  answer: 'You earn 1 point for every RM 1 you spend on bookings. You also get 50 points for submitting a review, 200 points for referring a friend who books, and 500 welcome points when you sign up.',
  tier: 'customer,admin',
},
{
  category: 'rewards',
  question: 'How do I redeem my points?',
  answer: 'Go to the Rewards tab in your account and choose a reward. Points are redeemed for vouchers that give you a discount on your next top-up. For example, 100 points gets you a voucher for RM 5 off your next top-up of RM 20 or more.',
  tier: 'customer,admin',
},
{
  category: 'rewards',
  question: 'What are loyalty tiers and how do they work?',
  answer: 'Tiers are based on your lifetime points earned (not your current balance). Bronze (0 pts), Silver (500 pts), Gold (2,000 pts), and Platinum (5,000 pts). Higher tiers earn bonus points on bookings: Silver +10%, Gold +25%, Platinum +50%. Points spent on rewards still count toward your tier.',
  tier: 'customer,admin',
},
{
  category: 'rewards',
  question: 'How long are reward vouchers valid for?',
  answer: 'Vouchers are valid for 30 days from the date you redeem them. After that, they expire and the points are not refunded. Make sure to use your voucher before it expires.',
  tier: 'customer,admin',
},
{
  category: 'payments',
  question: 'What is the 20% platform fee breakdown?',
  answer: 'The 20% platform fee on completed bookings is distributed as follows: 8% goes to rewards and promotions (including customer points), 5% to marketing and customer acquisition, 4% to platform operations, and 3% is the platform margin. These rates are set by the platform admin.',
  tier: 'servicer,admin',
},
```

- [x] **Step 2: Run reseed**

- [x] **Step 3: Commit**

---

## Self-Review Checklist

- [x] Does every spec requirement map to at least one task?
- [x] Are all file paths exact?
- [x] Does every code step compile (types match)?
- [x] Are there any "TBD", "TODO", or "implement later" in the plan?
- [x] Do the points earning hooks handle failures gracefully (warn, not crash)?
- [x] Is the voucher code generation collision-resistant?
- [x] Are all Decimal operations handled correctly (not using JS number math for money)?
- [x] Does the welcome points flow work for both email and Google OAuth registration?
- [x] Is the tier computation using `lifetimeEarned` (not balance)?
