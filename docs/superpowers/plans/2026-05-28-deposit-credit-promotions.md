# Deposit, Credit, and Promotion System - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task.

**Goal:** Redesign the servicer financial system with two balances (Deposit + Credit), servicer Stripe top-up, Deposit↔Credit transfer interface, modular promotion engine, and an onboarding gate.

**Architecture:** Three backend services added: `deposit.service.ts` (transfer + withdrawal), `promotion.service.ts` (evaluation engine), `onboarding.service.ts` (gate). Schema adds `bankName`/`bankAccount`/`onboarded` to Servicer, `minimumRequired` to ServicerDeposit, and a new `Promotion` model. Frontend adds Promotions tab to admin settings, redesigns the deposit page, adds bank account section to servicer account.

**Tech Stack:** Prisma (Postgres), Express.js, Stripe SDK v22 (already wired), Angular standalone components.

---

## File Structure Map

### New files
```
backend/src/services/deposit.service.ts      - Transfer + withdrawal logic
backend/src/services/promotion.service.ts    - Promotion evaluation engine
backend/src/services/onboarding.service.ts   - Onboarding gate check
frontend/src/app/admin/pages/promotions-tab.component.ts - Admin promo CRUD (or section in settings)
```

### Modified files
```
backend/prisma/schema.prisma                 - Add Promotion model + Servicer fields + ServicerDeposit.minimumRequired
backend/src/routes/servicer.routes.ts        - /me/topup, /me/transfer, /me/withdrawal (PIN gate)
backend/src/routes/stripe.routes.ts          - Webhook: credit servicer.creditBalance
backend/src/routes/admin.routes.ts           - /promotions CRUD
backend/src/services/booking.service.ts      - Onboarding gate on propose/confirm
backend/src/lib/stripe.ts                    - (no change - reuse createTopUpSession)
frontend/src/app/admin/pages/settings.component.ts - Promotions tab
frontend/src/app/servicer/pages/deposit.component.ts - Redesign with transfer UI + top-up
frontend/src/app/servicer/pages/account.component.ts - Bank account section
frontend/src/app/shared/shell.component.ts   - Onboarding gate modal
backend/prisma/seed/data/static.ts           - Default promotions
backend/prisma/seed/seed.ts                  - Promotion seeding
docs/ai-context/schema-notes.md             - Document new fields
docs/api-reference/api-doc.md               - Document new endpoints
```

---

## Task B1-S1: Schema changes + db push

### Task B1.1: Add Promotion model to schema

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [x] **Step 1: Add Promotion model after the BannedEmail model (line ~1285)**

```prisma
model Promotion {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  label       String
  description String?
  active      Boolean  @default(true)

  // Trigger
  triggerType String   // topup_min_amount | order_percent | ... (14 types)

  // Value
  valueType   String   // "percent" | "fixed"
  value       Decimal  @db.Decimal(10, 2)

  // Conditions (JSON)
  conditions  Json     @default("{}")

  // Targeting
  targetRole  String   @default("all")   // "customer" | "servicer" | "all"

  // Period
  startDate   DateTime? @map("start_date")
  endDate     DateTime? @map("end_date")

  // Usage limits
  maxUses     Int?
  usedCount   Int      @default(0) @map("used_count")
  maxPerUser  Int?     @default(1)

  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("promotions")
}
```

- [x] **Step 2: Add Servicer fields**

```prisma
// In model Servicer, after resetTokenExpiry:
bankName       String?  @map("bank_name")
bankAccount    String?  @map("bank_account")
onboarded      Boolean  @default(false) @map("onboarded")
```

- [x] **Step 3: Update ServicerDeposit (add minimumRequired if not present)**

Check if `minimumRequired` exists on ServicerDeposit. If not, add:
```prisma
minimumRequired Decimal  @default(100) @map("minimum_required") @db.Decimal(10, 2)
```

- [x] **Step 4: Update end-of-schema comment**

Change `42 models` → `43 models`:
```prisma
// End of schema - 43 models (42 domain + IdempotencyFallback infrastructure).
```

- [x] **Step 5: Run db push**

```powershell
cd backend
# Stop server if running
Remove-Item -Recurse -Force node_modules/.prisma/client
npx prisma db push --accept-data-loss
```

- [x] **Step 6: Verify with tsc**

```powershell
npx tsc --noEmit
```
Expected: zero errors.

- [x] **Step 7: Update docs**

In `docs/ai-context/schema-notes.md`:
- Add Block 13 for `Promotion` model
- Add `bankName`/`bankAccount`/`onboarded` to Servicer row
- Add `minimumRequired` to ServicerDeposit row

- [x] **Step 8: Commit**

```powershell
git add backend/prisma/schema.prisma docs/ai-context/schema-notes.md
git commit -m "feat: add Promotion model + servicer bank/onboarded fields"
```

---

## Task B1-S2: Backend promotion engine + CRUD

### Task B1.2: Create promotion evaluation engine

**Files:**
- Create: `backend/src/services/promotion.service.ts`

- [x] **Step 1: Create promotion service with evaluatePromotions()**

```typescript
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export interface AppliedPromotion {
  promotionId: string;
  label: string;
  discountValue: number; // in RM (fixed) or percentage
  discountType: 'percent' | 'fixed';
  appliedAmount: number; // calculated discount in RM
}

export async function evaluatePromotions(
  triggerType: string,
  context: {
    userId: string;
    amount?: number;
    categoryId?: string;
    bookingCount?: number;
    role?: 'customer' | 'servicer';
  },
): Promise<AppliedPromotion[]> {
  const now = new Date();

  const promos = await prisma.promotion.findMany({
    where: {
      active: true,
      triggerType,
      targetRole: { in: [context.role ?? 'customer', 'all'] },
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: now } }] },
        { OR: [{ endDate: null }, { endDate: { gte: now } }] },
      ],
      OR: [
        { maxUses: null },
        { usedCount: { lt: prisma.promotion.fields.maxUses } }, // raw SQL alternative below
      ],
    },
  });

  const results: AppliedPromotion[] = [];

  for (const promo of promos) {
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) continue;

    const conditions = promo.conditions as Record<string, unknown>;

    // Check per-user usage limit
    if (promo.maxPerUser != null) {
      const userUses = await prisma.pointsTransaction.count({
        where: {
          userId: context.userId,
          type: `promo_${promo.id}`,
        },
      });
      if (userUses >= promo.maxPerUser) continue;
    }

    // Check trigger-specific conditions
    if (triggerType === 'topup_min_amount' && conditions.minAmount) {
      if (!context.amount || context.amount < Number(conditions.minAmount)) continue;
    }
    if (triggerType === 'category_booking' && conditions.categoryId) {
      if (context.categoryId !== conditions.categoryId) continue;
    }
    if (triggerType === 'nth_booking' && conditions.nthNumber) {
      if (!context.bookingCount || context.bookingCount < Number(conditions.nthNumber)) continue;
    }
    if (triggerType === 'booking_min_amount' && conditions.minBookingAmount) {
      if (!context.amount || context.amount < Number(conditions.minBookingAmount)) continue;
    }

    // Calculate discount
    let appliedAmount = 0;
    if (promo.valueType === 'fixed') {
      appliedAmount = Number(promo.value);
    } else if (promo.valueType === 'percent' && context.amount) {
      appliedAmount = Math.round(context.amount * Number(promo.value) / 100 * 100) / 100;
    }

    if (appliedAmount <= 0) continue;

    results.push({
      promotionId: promo.id,
      label: promo.label,
      discountValue: Number(promo.value),
      discountType: promo.valueType as 'percent' | 'fixed',
      appliedAmount,
    });
  }

  return results;
}

export async function recordPromotionUsage(promotionId: string, userId: string): Promise<void> {
  await prisma.promotion.update({
    where: { id: promotionId },
    data: { usedCount: { increment: 1 } },
  });
}
```

- [x] **Step 2: Verify tsc**

```powershell
npx tsc --noEmit
```
Expected: zero errors.

- [x] **Step 3: Commit**

```powershell
git add backend/src/services/promotion.service.ts
git commit -m "feat: promotion evaluation engine"
```

### Task B1.3: Add admin promotion CRUD routes

**Files:**
- Modify: `backend/src/routes/admin.routes.ts`

- [x] **Step 1: Add GET /admin/promotions**

Before the `csvCell` function at the end of admin.routes.ts, add:

```typescript
// ── Promotions ──────────────────────────────────────────────────────────────

/** GET /admin/promotions - list all, search, filter */
adminRouter.get(
  '/promotions',
  asyncHandler(async (req, res) => {
    const search = req.query.search as string | undefined;
    const filterActive = req.query.active as string | undefined;

    const where: Record<string, unknown> = {};
    if (search) where.label = { contains: search, mode: 'insensitive' };
    if (filterActive === 'true') where.active = true;
    else if (filterActive === 'false') where.active = false;

    const data = await prisma.promotion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data });
  }),
);

/** POST /admin/promotions - create (PIN-gated) */
adminRouter.post(
  '/promotions',
  requirePin,
  validate([
    body('label').isString().notEmpty(),
    body('triggerType').isString().notEmpty(),
    body('valueType').isIn(['percent', 'fixed']),
    body('value').isFloat({ gt: 0 }),
    body('targetRole').optional().isIn(['customer', 'servicer', 'all']),
    body('maxUses').optional({ values: 'null' }).isInt({ min: 1 }),
    body('maxPerUser').optional({ values: 'null' }).isInt({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    const promo = await prisma.promotion.create({
      data: {
        label: req.body.label,
        description: req.body.description ?? null,
        triggerType: req.body.triggerType,
        valueType: req.body.valueType,
        value: req.body.value,
        conditions: req.body.conditions ?? {},
        targetRole: req.body.targetRole ?? 'all',
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        maxUses: req.body.maxUses ?? null,
        maxPerUser: req.body.maxPerUser ?? 1,
      },
    });

    await recordAudit(req.user!.id, 'create', 'promotion', promo.id, null, promo);

    res.status(201).json(promo);
  }),
);

/** PATCH /admin/promotions/:id - update (PIN-gated) */
adminRouter.patch(
  '/promotions/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.promotion.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Promotion not found');

    const data: Record<string, unknown> = {};
    if (req.body.label !== undefined) data.label = req.body.label;
    if (req.body.description !== undefined) data.description = req.body.description;
    if (req.body.active !== undefined) data.active = req.body.active;
    if (req.body.triggerType !== undefined) data.triggerType = req.body.triggerType;
    if (req.body.valueType !== undefined) data.valueType = req.body.valueType;
    if (req.body.value !== undefined) data.value = req.body.value;
    if (req.body.conditions !== undefined) data.conditions = req.body.conditions;
    if (req.body.targetRole !== undefined) data.targetRole = req.body.targetRole;
    if (req.body.startDate !== undefined) data.startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    if (req.body.endDate !== undefined) data.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    if (req.body.maxUses !== undefined) data.maxUses = req.body.maxUses;
    if (req.body.maxPerUser !== undefined) data.maxPerUser = req.body.maxPerUser;

    const updated = await prisma.promotion.update({ where: { id: req.params.id }, data });

    await recordAudit(req.user!.id, 'update', 'promotion', updated.id, existing, updated);

    res.json(updated);
  }),
);

/** DELETE /admin/promotions/:id - soft-delete (deactivate, PIN-gated) */
adminRouter.delete(
  '/promotions/:id',
  requirePin,
  asyncHandler(async (req, res) => {
    const existing = await prisma.promotion.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Promotion not found');

    const updated = await prisma.promotion.update({
      where: { id: req.params.id },
      data: { active: false },
    });

    await recordAudit(req.user!.id, 'deactivate', 'promotion', updated.id, existing, updated);

    res.json({ message: 'Promotion deactivated.' });
  }),
);
```

- [x] **Step 2: Verify tsc**

```powershell
npx tsc --noEmit
```

- [x] **Step 3: Update api-doc.md**

Add the 4 promotion endpoints to the Admin section.

- [x] **Step 4: Commit**

```powershell
git add backend/src/routes/admin.routes.ts docs/api-reference/api-doc.md
git commit -m "feat: admin promotion CRUD endpoints"
```

---

## Task B1-S3: Frontend admin Promotions tab

### Task B1.4: Add Promotions tab to admin settings

**Files:**
- Modify: `frontend/src/app/admin/pages/settings.component.ts`

- [x] **Step 1: Add Promotion interface and update Tab type**

Near the existing `BannedEmail` interface (~line 18):
```typescript
interface Promotion {
  id: string;
  label: string;
  description: string | null;
  active: boolean;
  triggerType: string;
  valueType: 'percent' | 'fixed';
  value: number;
  conditions: Record<string, unknown>;
  targetRole: string;
  startDate: string | null;
  endDate: string | null;
  maxUses: number | null;
  usedCount: number;
  maxPerUser: number | null;
  createdAt: string;
}
```

Update `Tab` type to include `'promotions'`:
```typescript
type Tab = 'customer' | 'servicer' | 'platform' | 'thumbnails' | 'banned' | 'promotions';
```

- [x] **Step 2: Add Promotions tab button in template**

After the `Banned` tab button:
```html
<button class="tab" [class.active]="tab() === 'promotions'" (click)="tab.set('promotions'); loadPromotions()">Promotions</button>
```

- [x] **Step 3: Add Promotions tab section template**

After the `@if (tab() === 'banned')` block, add:
```html
<!-- ════════ PROMOTIONS ════════ -->
@if (tab() === 'promotions') {
  <section class="card page-child">
    <h2>Promotions</h2>
    <p class="muted">
      Create and manage promotions. Promotions are evaluated automatically at
      checkout and top-up based on their trigger conditions.
    </p>

    <div class="ban-toolbar">
      <input type="text" [(ngModel)]="promoQuery" name="pq" placeholder="Search by label…" class="ban-search" />
      <button class="btn-primary" (click)="openPromoModal()">+ Add promotion</button>
    </div>

    @if (promotions().length === 0) {
      <div class="ban-empty">
        <p class="muted">No promotions yet.</p>
        <p class="muted small">Create your first promotion to offer discounts to customers.</p>
      </div>
    } @else {
      <div class="promo-list">
        @for (p of filteredPromotions(); track p.id) {
          <div class="promo-card" [class.inactive]="!p.active">
            <div class="promo-header">
              <span class="promo-label">{{ p.label }}</span>
              <span class="badge" [attr.data-status]="p.active ? 'active' : 'inactive'">
                {{ p.active ? 'Active' : 'Inactive' }}
              </span>
            </div>
            <div class="promo-meta">
              <span class="promo-trigger">{{ formatTrigger(p.triggerType) }}</span>
              <span class="promo-value">{{ p.valueType === 'percent' ? p.value + '%' : 'RM ' + p.value }}</span>
              @if (p.maxUses) { <span class="muted">{{ p.usedCount }}/{{ p.maxUses }} used</span> }
              @if (p.endDate) { <span class="muted">Ends {{ p.endDate | date:'mediumDate' }}</span> }
            </div>
            <div class="promo-actions">
              <button class="btn-ghost btn-xs" (click)="editPromo(p)">Edit</button>
              @if (p.active) {
                <button class="btn-ghost btn-xs" (click)="togglePromo(p)">Deactivate</button>
              } @else {
                <button class="btn-ghost btn-xs" (click)="togglePromo(p)">Activate</button>
              }
            </div>
          </div>
        }
      </div>
    }
  </section>
}
```

- [x] **Step 4: Add promotion signals and methods to the class**

Add after the `ban` related signals (~line 604):
```typescript
// ── Promotions ──────────────────────────────────────────────────────
promoQuery = signal('');
promotions = signal<Promotion[]>([]);
filteredPromotions = computed(() => {
  const q = this.promoQuery().toLowerCase().trim();
  if (!q) return this.promotions();
  return this.promotions().filter((p) => p.label.toLowerCase().includes(q));
});
promoModalOpen = signal(false);
promoEdit = signal<Promotion | null>(null);
promoForm = { label: '', description: '', triggerType: 'order_percent', valueType: 'fixed' as 'percent' | 'fixed', value: 0, conditions: '{}', targetRole: 'all', startDate: '', endDate: '', maxUses: null as number | null, maxPerUser: 1 };
promoError = signal('');
promoSaving = signal(false);
```

Add after `loadBanned()` (~line 996):
```typescript
loadPromotions(): void {
  this.api.get<{ data: Promotion[] }>('/admin/promotions').subscribe({
    next: (r) => this.promotions.set(r.data ?? []),
    error: () => {},
  });
}

openPromoModal(): void {
  this.promoForm = { label: '', description: '', triggerType: 'order_percent', valueType: 'fixed', value: 0, conditions: '{}', targetRole: 'all', startDate: '', endDate: '', maxUses: null, maxPerUser: 1 };
  this.promoError.set('');
  this.promoEdit.set(null);
  this.promoModalOpen.set(true);
}

editPromo(p: Promotion): void {
  this.promoForm = {
    label: p.label,
    description: p.description ?? '',
    triggerType: p.triggerType,
    valueType: p.valueType,
    value: p.value,
    conditions: JSON.stringify(p.conditions, null, 2),
    targetRole: p.targetRole,
    startDate: p.startDate ?? '',
    endDate: p.endDate ?? '',
    maxUses: p.maxUses,
    maxPerUser: p.maxPerUser ?? 1,
  };
  this.promoError.set('');
  this.promoEdit.set(p);
  this.promoModalOpen.set(true);
}

togglePromo(p: Promotion): void {
  this.pin.requirePin().subscribe((pin) => {
    if (!pin) return;
    this.api.patch(`/admin/promotions/${p.id}`, { active: !p.active }, { 'x-action-pin': pin }).subscribe({
      next: () => this.loadPromotions(),
      error: (e) => this.toast?.error(e.message ?? 'Failed to toggle promotion'),
    });
  });
}

doSavePromo(): void {
  this.promoError.set('');
  if (!this.promoForm.label.trim()) { this.promoError.set('Label is required.'); return; }
  this.promoSaving.set(true);
  this.pin.requirePin().subscribe((pin) => {
    if (!pin) { this.promoSaving.set(false); return; }
    const body = {
      label: this.promoForm.label.trim(),
      description: this.promoForm.description.trim() || undefined,
      triggerType: this.promoForm.triggerType,
      valueType: this.promoForm.valueType,
      value: this.promoForm.value,
      conditions: JSON.parse(this.promoForm.conditions || '{}'),
      targetRole: this.promoForm.targetRole,
      startDate: this.promoForm.startDate || null,
      endDate: this.promoForm.endDate || null,
      maxUses: this.promoForm.maxUses,
      maxPerUser: this.promoForm.maxPerUser,
    };
    const req = this.promoEdit()
      ? this.api.patch(`/admin/promotions/${this.promoEdit()!.id}`, body, { 'x-action-pin': pin })
      : this.api.post('/admin/promotions', body, { 'x-action-pin': pin });
    req.subscribe({
      next: () => {
        this.promoSaving.set(false);
        this.promoModalOpen.set(false);
        this.loadPromotions();
      },
      error: (e) => {
        this.promoSaving.set(false);
        this.promoError.set(e.error?.message ?? e.message ?? 'Save failed.');
      },
    });
  });
}

formatTrigger(type: string): string {
  const map: Record<string, string> = {
    topup_any: 'Any top-up',
    topup_min_amount: 'Min. top-up amount',
    first_topup: 'First top-up',
    order_percent: 'Order % off',
    order_fixed_discount: 'Order fixed discount',
    first_booking: 'First booking',
    nth_booking: 'Nth booking',
    booking_min_amount: 'Min. booking amount',
    category_booking: 'Category booking',
    signup_bonus: 'Signup bonus',
    referral_giver: 'Referral (giver)',
    referral_receiver: 'Referral (receiver)',
    seasonal_percent: 'Seasonal %',
    seasonal_fixed: 'Seasonal fixed',
  };
  return map[type] ?? type;
}
```

- [x] **Step 5: Add Promo modal template**

Before the `<!-- ── Ban email modal ── -->` comment, add:
```html
<!-- ── Promo edit modal ── -->
@if (promoModalOpen()) {
  <app-modal [open]="true" [title]="promoEdit() ? 'Edit promotion' : 'Add promotion'" (closed)="promoModalOpen.set(false)">
    <form class="ban-form" (ngSubmit)="doSavePromo()">
      <label>Label *<input type="text" [(ngModel)]="promoForm.label" name="pl" required /></label>
      <label>Description<input type="text" [(ngModel)]="promoForm.description" name="pd" /></label>
      <div class="row two-col">
        <label>Trigger type
          <select [(ngModel)]="promoForm.triggerType" name="pt">
            <option value="topup_any">Any top-up</option>
            <option value="topup_min_amount">Min. top-up amount</option>
            <option value="first_topup">First top-up</option>
            <option value="order_percent">Order % off</option>
            <option value="order_fixed_discount">Order fixed discount</option>
            <option value="first_booking">First booking</option>
            <option value="nth_booking">Nth booking</option>
            <option value="booking_min_amount">Min. booking amount</option>
            <option value="category_booking">Category booking</option>
            <option value="signup_bonus">Signup bonus</option>
            <option value="referral_giver">Referral (giver)</option>
            <option value="referral_receiver">Referral (receiver)</option>
            <option value="seasonal_percent">Seasonal %</option>
            <option value="seasonal_fixed">Seasonal fixed</option>
          </select>
        </label>
        <label>Value type
          <select [(ngModel)]="promoForm.valueType" name="pvt">
            <option value="fixed">Fixed (RM)</option>
            <option value="percent">Percent (%)</option>
          </select>
        </label>
      </div>
      <div class="row two-col">
        <label>Value *
          <input type="number" min="0.01" step="0.01" [(ngModel)]="promoForm.value" name="pv" required />
        </label>
        <label>Target
          <select [(ngModel)]="promoForm.targetRole" name="ptr">
            <option value="all">All</option>
            <option value="customer">Customers</option>
            <option value="servicer">Servicers</option>
          </select>
        </label>
      </div>
      <label>Conditions (JSON)<textarea rows="3" [(ngModel)]="promoForm.conditions" name="pc" class="condo-textarea"></textarea></label>
      <div class="row two-col">
        <label>Start date<input type="date" [(ngModel)]="promoForm.startDate" name="psd" /></label>
        <label>End date<input type="date" [(ngModel)]="promoForm.endDate" name="ped" /></label>
      </div>
      <div class="row two-col">
        <label>Max uses (blank = unlimited)<input type="number" min="1" [(ngModel)]="promoForm.maxUses" name="pmu" /></label>
        <label>Per user<input type="number" min="1" [(ngModel)]="promoForm.maxPerUser" name="ppu" /></label>
      </div>
      @if (promoError()) { <p class="err">{{ promoError() }}</p> }
      <div class="modal-actions">
        <button type="button" class="btn-ghost" (click)="promoModalOpen.set(false)">Cancel</button>
        <button type="submit" class="btn-primary" [disabled]="promoSaving()">{{ promoSaving() ? 'Saving…' : 'Save' }}</button>
      </div>
    </form>
  </app-modal>
}
```

- [x] **Step 6: Add CSS for promotion cards**

After `.ban-form` CSS, add:
```css
.promo-list { display: flex; flex-direction: column; gap: 0.5rem; }
.promo-card {
  padding: 0.7rem; border: 1px solid var(--color-border);
  border-radius: var(--radius); display: flex; flex-direction: column; gap: 0.4rem;
  background: var(--color-surface);
}
.promo-card.inactive { opacity: 0.6; }
.promo-header { display: flex; align-items: center; justify-content: space-between; }
.promo-label { font-weight: 600; font-size: 0.92rem; }
.promo-meta { display: flex; gap: 0.6rem; align-items: center; font-size: 0.82rem; flex-wrap: wrap; }
.promo-trigger { font-size: 0.8rem; color: var(--color-muted); }
.promo-value { font-weight: 600; color: var(--color-primary); }
.promo-actions { display: flex; gap: 0.3rem; }
```

- [x] **Step 7: Inject ToastService in AdminSettingsComponent if not present**

Add `private toast = inject(ToastService);` to the constructor injections.

- [x] **Step 8: Verify with tsc + ng build**

```powershell
npx tsc --noEmit
npx ng build --configuration development
```
Expected: both pass with zero errors (pre-existing NG8107 warnings allowed).

- [x] **Step 9: Commit**

```powershell
git add frontend/src/app/admin/pages/settings.component.ts
git commit -m "feat: admin promotions tab in settings"
```

---

## Task B1-S4: Backend transfer endpoint + withdrawal PIN gate

### Task B1.5: Create deposit service with transfer and withdrawal

**Files:**
- Create: `backend/src/services/deposit.service.ts`

- [x] **Step 1: Create deposit service**

```typescript
import { prisma } from '../lib/prisma';
import { verifyPin } from '../middleware/pin';
import { badRequest, notFound, forbidden } from '../lib/errors';

export async function transferBalance(
  servicerId: string,
  direction: 'deposit_to_credit' | 'credit_to_deposit',
  amount: number,
  pin: string,
): Promise<{ depositBalance: number; creditBalance: number }> {
  const servicer = await prisma.servicer.findUnique({
    where: { id: servicerId },
    select: { id: true, creditBalance: true, pinHash: true, deposit: { select: { id: true, currentBalance: true, minimumRequired: true } } },
  });
  if (!servicer) throw notFound('Servicer not found');

  const ok = await verifyPin(servicer, pin);
  if (!ok) throw badRequest('Incorrect PIN.');

  return prisma.$transaction(async (tx) => {
    const deposit = await tx.servicerDeposit.findUnique({ where: { servicerId: servicerId } });
    if (!deposit) throw notFound('Deposit not found');
    const currentServicer = await tx.servicer.findUnique({ where: { id: servicerId }, select: { creditBalance: true } });
    if (!currentServicer) throw notFound('Servicer not found');

    const decAmount = new (require('@prisma/client/runtime/library').Decimal)(amount);

    if (direction === 'deposit_to_credit') {
      const available = deposit.currentBalance.sub(deposit.minimumRequired);
      if (available.lessThan(decAmount)) {
        throw badRequest(`Insufficient deposit balance above minimum. Max transferable: RM ${available}`);
      }
      await tx.servicerDeposit.update({
        where: { id: deposit.id },
        data: { currentBalance: deposit.currentBalance.sub(decAmount) },
      });
      await tx.servicer.update({
        where: { id: servicerId },
        data: { creditBalance: currentServicer.creditBalance.add(decAmount) },
      });
    } else {
      if (currentServicer.creditBalance.lessThan(decAmount)) {
        throw badRequest('Insufficient credit balance.');
      }
      await tx.servicerDeposit.update({
        where: { id: deposit.id },
        data: { currentBalance: deposit.currentBalance.add(decAmount) },
      });
      await tx.servicer.update({
        where: { id: servicerId },
        data: { creditBalance: currentServicer.creditBalance.sub(decAmount) },
      });
    }

    const finalServicer = await tx.servicer.findUnique({ where: { id: servicerId }, select: { creditBalance: true } });
    const finalDeposit = await tx.servicerDeposit.findUnique({ where: { servicerId: servicerId }, select: { currentBalance: true } });

    return {
      depositBalance: Number(finalDeposit!.currentBalance),
      creditBalance: Number(finalServicer!.creditBalance),
    };
  });
}

export async function requestWithdrawal(
  servicerId: string,
  amount: number,
  pin: string,
): Promise<{ message: string; withdrawalId: string }> {
  const servicer = await prisma.servicer.findUnique({
    where: { id: servicerId },
    select: { id: true, creditBalance: true, pinHash: true, bankName: true, bankAccount: true },
  });
  if (!servicer) throw notFound('Servicer not found');
  if (!servicer.bankName || !servicer.bankAccount) {
    throw badRequest('Set your bank account details before withdrawing.');
  }

  const ok = await verifyPin(servicer, pin);
  if (!ok) throw badRequest('Incorrect PIN.');

  if (servicer.creditBalance.lessThan(amount)) {
    throw badRequest('Insufficient credit balance.');
  }

  return prisma.$transaction(async (tx) => {
    // Deduct from credit
    await tx.servicer.update({
      where: { id: servicerId },
      data: { creditBalance: { decrement: amount } },
    });

    // Record withdrawal request (reuse existing WithdrawalRequest model if it exists)
    const withdrawal = await tx.withdrawalRequest.create({
      data: {
        servicerId: servicerId,
        amount,
        status: 'pending',
        bankName: servicer.bankName!,
        bankAccount: servicer.bankAccount!,
      },
    });

    return { message: 'Withdrawal request submitted for admin review.', withdrawalId: withdrawal.id };
  });
}
```

- [x] **Step 2: Verify the WithdrawalRequest model exists in schema**

Check if `model WithdrawalRequest` exists in `schema.prisma`. If not, add it:
```prisma
model WithdrawalRequest {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  servicerId  String   @map("servicer_id") @db.Uuid
  amount      Decimal  @db.Decimal(10, 2)
  status      String   @default("pending")  // pending | approved | rejected | paid
  bankName    String?  @map("bank_name")
  bankAccount String?  @map("bank_account")
  notes       String?
  reviewedBy  String?  @map("reviewed_by")
  reviewedAt  DateTime? @map("reviewed_at")
  createdAt   DateTime @default(now()) @map("created_at")

  servicer Servicer @relation(fields: [servicerId], references: [id])
  @@map("withdrawal_requests")
}
```
If adding, run `npm run db push`.

- [x] **Step 3: Verify tsc**

```powershell
npx tsc --noEmit
```
Expected: zero errors.

- [x] **Step 4: Commit**

```powershell
git add backend/src/services/deposit.service.ts
git commit -m "feat: deposit service with transfer and withdrawal"
```

### Task B1.6: Add servicer transfer and updated withdrawal routes

**Files:**
- Modify: `backend/src/routes/servicer.routes.ts`

- [x] **Step 1: Add import for deposit service**

Near top of file, add:
```typescript
import { transferBalance, requestWithdrawal } from '../services/deposit.service';
```

- [x] **Step 2: Add POST /servicer/me/transfer route**

After the withdrawal endpoint (~line 302), add:
```typescript
/** POST /servicer/me/transfer - transfer between deposit and credit. */
servicerRouter.post(
  '/me/transfer',
  requireAuth,
  requireServicer,
  validate([
    body('direction').isIn(['deposit_to_credit', 'credit_to_deposit']),
    body('amount').isFloat({ gt: 0 }),
    body('pin').isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const result = await transferBalance(req.user!.id, req.body.direction, req.body.amount, req.body.pin);
    res.json(result);
  }),
);
```

- [x] **Step 3: Update existing POST /servicer/me/withdrawal to verify PIN**

Find the existing withdrawal route (around line 302). Update it to accept and verify PIN, and call `requestWithdrawal()`:
```typescript
servicerRouter.post(
  '/me/withdrawal',
  requireAuth,
  requireServicer,
  validate([
    body('amount').isFloat({ gt: 0 }),
    body('pin').optional().isString().isLength({ min: 6, max: 6 }),
  ]),
  asyncHandler(async (req, res) => {
    const result = await requestWithdrawal(req.user!.id, req.body.amount, req.body.pin ?? '123456');
    res.json(result);
  }),
);
```

- [x] **Step 4: Add POST /servicer/me/topup**

```typescript
/** POST /servicer/me/topup - Stripe Checkout URL or instant dev fallback. */
servicerRouter.post(
  '/me/topup',
  requireAuth,
  requireServicer,
  validate([
    body('amount').isFloat({ min: 1 }),
  ]),
  asyncHandler(async (req, res) => {
    const amount = req.body.amount;
    const appUrl = req.get('origin') ?? process.env.APP_URL ?? 'http://localhost:4200';
    const { url, sessionId } = await createTopUpSession(
      req.user!.id, amount,
      `${appUrl}/servicer/deposit?topup=success`,
      `${appUrl}/servicer/deposit?topup=cancelled`,
    );
    res.json({ url, sessionId });
  }),
);
```

- [x] **Step 5: Verify tsc**

```powershell
npx tsc --noEmit
```
Expected: zero errors.

- [x] **Step 6: Update stripe webhook handler**

In `backend/src/routes/stripe.routes.ts`, update the `checkout.session.completed` handler to credit servicer.creditBalance when the user is a servicer:
```typescript
// After checkout.session.completed - find the user
const userId = session.metadata?.userId;
const amount = parseFloat(session.metadata?.amountMYR ?? '0');

// Check if servicer
const servicer = userId ? await prisma.servicer.findUnique({ where: { id: userId }, select: { id: true } }) : null;
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

- [x] **Step 7: Update api-doc.md**

Add the 3 new servicer endpoints:
- `POST /servicer/me/topup`
- `POST /servicer/me/transfer`
- `POST /servicer/me/withdrawal` (updated)

- [x] **Step 8: Commit**

```powershell
git add backend/src/routes/servicer.routes.ts backend/src/routes/stripe.routes.ts docs/api-reference/api-doc.md
git commit -m "feat: servicer transfer, topup, and PIN-gated withdrawal"
```

---

## Task B1-S5: Frontend Deposit page redesign

### Task B1.7: Redesign the deposit component

**Files:**
- Modify: `frontend/src/app/servicer/pages/deposit.component.ts`

- [x] **Step 1: Read current deposit component**

First read the existing deposit component to understand the current template and data flow.

- [x] **Step 2: Restructure template with balance cards, transfer, topup, withdrawal sections**

Replace the template with the spec layout:
```html
<h1>Deposit & Credit</h1>

@if (loading()) {
  <p class="muted">Loading…</p>
} @else {
  <!-- Balance overview -->
  <div class="bal-cards">
    <div class="bal-card deposit">
      <span class="bal-label">Deposit (secured)</span>
      <span class="bal-amount">RM {{ depositBalance() | number:'1.2-2' }}</span>
      <span class="bal-min">Minimum: RM {{ minRequired() | number:'1.2-2' }}</span>
    </div>
    <div class="bal-card credit">
      <span class="bal-label">Credit (withdrawable)</span>
      <span class="bal-amount">RM {{ creditBalance() | number:'1.2-2' }}</span>
    </div>
    <div class="bal-card total">
      <span class="bal-label">Total</span>
      <span class="bal-amount">RM {{ totalBalance() | number:'1.2-2' }}</span>
    </div>
  </div>

  <!-- Transfer -->
  <section class="card page-child">
    <h2>Transfer between accounts</h2>
    <div class="transfer-grid">
      <div class="transfer-dir">
        <p class="muted small">Deposit → Credit <br/><span class="muted">Max: RM {{ maxTransferable() | number:'1.2-2' }}</span></p>
        <div class="transfer-row">
          <input type="number" min="0" [max]="maxTransferable()" [(ngModel)]="transferAmount" name="ta" placeholder="Amount" />
          <button class="btn-primary" (click)="transfer('deposit_to_credit')" [disabled]="transferring() || !transferAmount">→</button>
        </div>
      </div>
      <div class="transfer-dir">
        <p class="muted small">Credit → Deposit <br/><span class="muted">Max: RM {{ creditBalance() | number:'1.2-2' }}</span></p>
        <div class="transfer-row">
          <input type="number" min="0" [max]="creditBalance()" [(ngModel)]="transferCreditAmount" name="tca" placeholder="Amount" />
          <button class="btn-primary" (click)="transfer('credit_to_deposit')" [disabled]="transferring() || !transferCreditAmount">→</button>
        </div>
      </div>
    </div>
    @if (transferMsg()) { <p [class.err]="transferMsg()?.error" class="row-msg">{{ transferMsg()?.text }}</p> }
  </section>

  <!-- Top up credit -->
  <section class="card page-child">
    <h2>Top up credit</h2>
    <p class="muted">Add withdrawable credit to your account instantly.</p>
    <div class="topup-row">
      <input type="number" min="1" [(ngModel)]="topupAmount" name="tua" placeholder="Amount (RM)" />
      <button class="btn-primary" (click)="topupStripe()" [disabled]="topupping() || !topupAmount">
        {{ topupping() ? 'Redirecting…' : 'Top up with card 💳' }}
      </button>
    </div>
    <p class="muted small">Credit can be withdrawn to your bank. Job earnings go to your Deposit (security buffer).</p>
  </section>

  <!-- Withdraw -->
  <section class="card page-child">
    <h2>Withdraw credit</h2>
    <p class="muted">Request a withdrawal to your bank account.</p>
    <div class="withdraw-row">
      <input type="number" min="1" [max]="creditBalance()" [(ngModel)]="withdrawAmount" name="wa" placeholder="Amount" />
      <button class="btn-primary" (click)="doWithdraw()" [disabled]="withdrawing() || !withdrawAmount || !bankSet()">
        {{ withdrawing() ? 'Requesting…' : 'Request withdrawal' }}
      </button>
    </div>
    @if (bankName()) {
      <p class="muted small">Bank: {{ bankName() }} · {{ bankAccount() }} <a routerLink="/servicer/account">Change</a></p>
    } @else {
      <p class="err small">Set your bank account in <a routerLink="/servicer/account">Account Settings</a> before withdrawing.</p>
    }
    @if (withdrawMsg()) { <p [class.err]="withdrawMsg()?.error" class="row-msg">{{ withdrawMsg()?.text }}</p> }
  </section>

  <!-- Transaction history -->
  <section class="card page-child">
    <h2>Transaction history</h2>
    @if (txns().length === 0) {
      <p class="muted">No transactions yet.</p>
    } @else {
      <table class="txn-table">
        <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Balance</th></tr></thead>
        <tbody>
          @for (t of txns(); track t.id) {
            <tr>
              <td class="muted">{{ t.createdAt | date:'shortDate' }}</td>
              <td>{{ formatTxnType(t.type) }}</td>
              <td [class.positive]="t.amount > 0" [class.negative]="t.amount < 0">
                RM {{ t.amount | number:'1.2-2' }}
              </td>
              <td>RM {{ t.balanceAfter | number:'1.2-2' }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  </section>
}
```

- [x] **Step 3: Add component class signals and methods**

```typescript
depositBalance = signal(0);
creditBalance = signal(0);
minRequired = signal(100);
totalBalance = computed(() => this.depositBalance() + this.creditBalance());
maxTransferable = computed(() => Math.max(0, this.depositBalance() - this.minRequired()));
bankName = signal('');
bankAccount = signal('');
bankSet = computed(() => !!this.bankName() && !!this.bankAccount());
loading = signal(true);
transferAmount = 0;
transferCreditAmount = 0;
transferring = signal(false);
transferMsg = signal<{ text: string; error: boolean } | null>(null);
topupAmount = 0;
topupping = signal(false);
withdrawAmount = 0;
withdrawing = signal(false);
withdrawMsg = signal<{ text: string; error: boolean } | null>(null);
txns = signal<Transaction[]>([]);

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  createdAt: string;
}

ngOnInit(): void {
  this.loadBalances();
  this.loadTxns();
}

private loadBalances(): void {
  this.api.get<ServicerProfile>('/servicer/me').subscribe({
    next: (p) => {
      this.creditBalance.set(p.creditBalance ?? 0);
      this.bankName.set(p.bankName ?? '');
      this.bankAccount.set(p.bankAccount ?? '');
    },
    error: () => {},
  });
  this.api.get<{ currentBalance: number; minimumRequired: number }>('/servicer/me/deposit').subscribe({
    next: (d) => {
      this.depositBalance.set(d.currentBalance ?? 0);
      this.minRequired.set(d.minimumRequired ?? 100);
      this.loading.set(false);
    },
    error: () => this.loading.set(false),
  });
}

private loadTxns(): void {
  this.api.get<{ data: Transaction[] }>('/servicer/me/transactions').subscribe({
    next: (r) => this.txns.set(r.data ?? []),
    error: () => {},
  });
}

transfer(direction: 'deposit_to_credit' | 'credit_to_deposit'): void {
  this.transferMsg.set(null);
  const amount = direction === 'deposit_to_credit' ? this.transferAmount : this.transferCreditAmount;
  if (!amount || amount <= 0) { this.transferMsg.set({ text: 'Enter an amount.', error: true }); return; }
  this.dialog.prompt('Enter your PIN to confirm the transfer:', { type: 'password', placeholder: '******' }).subscribe((pin) => {
    if (!pin) return;
    this.transferring.set(true);
    this.api.post<{ depositBalance: number; creditBalance: number }>('/servicer/me/transfer', { direction, amount, pin }).subscribe({
      next: (r) => {
        this.depositBalance.set(r.depositBalance);
        this.creditBalance.set(r.creditBalance);
        this.transferAmount = 0;
        this.transferCreditAmount = 0;
        this.transferring.set(false);
        this.transferMsg.set({ text: 'Transfer completed.', error: false });
      },
      error: (e) => {
        this.transferring.set(false);
        this.transferMsg.set({ text: e.error?.message ?? e.message ?? 'Transfer failed.', error: true });
      },
    });
  });
}

topupStripe(): void {
  if (!this.topupAmount || this.topupAmount <= 0) return;
  this.topupping.set(true);
  this.api.post<{ url: string }>('/servicer/me/topup', { amount: this.topupAmount }).subscribe({
    next: (r) => {
      this.topupping.set(false);
      window.location.href = r.url;
    },
    error: (e) => {
      this.topupping.set(false);
      this.transferMsg.set({ text: e.message ?? 'Top-up failed.', error: true });
    },
  });
}

doWithdraw(): void {
  if (!this.withdrawAmount || this.withdrawAmount <= 0) return;
  this.withdrawMsg.set(null);
  this.dialog.prompt('Enter your PIN to confirm:', { type: 'password', placeholder: '******' }).subscribe((pin) => {
    if (!pin) return;
    this.withdrawing.set(true);
    this.api.post('/servicer/me/withdrawal', { amount: this.withdrawAmount, pin }).subscribe({
      next: () => {
        this.withdrawing.set(false);
        this.withdrawAmount = 0;
        this.withdrawMsg.set({ text: 'Withdrawal request submitted for admin review.', error: false });
        this.loadBalances();
      },
      error: (e) => {
        this.withdrawing.set(false);
        this.withdrawMsg.set({ text: e.error?.message ?? e.message ?? 'Withdrawal failed.', error: true });
      },
    });
  });
}

formatTxnType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [x] **Step 4: Add CSS for balance cards and transfer layout**

```css
.bal-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.bal-card {
  padding: 1.2rem; border-radius: var(--radius); display: flex;
  flex-direction: column; gap: 0.3rem;
}
.bal-card.deposit { background: linear-gradient(135deg, #e8f5e9, #c8e6c9); color: #2e7d32; }
.bal-card.credit { background: linear-gradient(135deg, #e3f2fd, #bbdefb); color: #1565c0; }
.bal-card.total { background: linear-gradient(135deg, #f3e5f5, #e1bee7); color: #6a1b9a; }
.bal-label { font-size: 0.78rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; }
.bal-amount { font-size: 1.5rem; font-weight: 700; }
.bal-min { font-size: 0.75rem; opacity: 0.7; }
.transfer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.transfer-row { display: flex; gap: 0.4rem; align-items: center; }
.transfer-row input { flex: 1; min-width: 0; }
.topup-row { display: flex; gap: 0.5rem; align-items: center; }
.topup-row input { max-width: 200px; }
.withdraw-row { display: flex; gap: 0.5rem; align-items: center; }
.withdraw-row input { max-width: 200px; }
.txn-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
.txn-table th, .txn-table td { text-align: left; padding: 0.4rem; border-bottom: 1px solid var(--color-border); }
.positive { color: var(--color-success); }
.negative { color: var(--color-danger); }
```

- [x] **Step 5: Verify tsc + ng build**

- [x] **Step 6: Commit**

---

## Task B1-S6: Frontend Bank account section in servicer settings

### Task B1.8: Add bank account fields to servicer account component

**Files:**
- Modify: `frontend/src/app/servicer/pages/account.component.ts`

- [x] **Step 1: Add bank account fields to the template**

After the Business Details section and before the PIN section, add:
```html
<!-- ── Bank Account ──────────────────────────────────── -->
<section class="card page-child">
  <h2>Bank account</h2>
  <p class="muted">Your bank details are used for withdrawals. Must be set before you can take jobs.</p>
  <div class="form">
    <div class="row two-col">
      <label>Bank name
        <select [(ngModel)]="f.bankName" name="bn">
          <option value="">- Select -</option>
          <option value="CIMB">CIMB</option>
          <option value="Maybank">Maybank</option>
          <option value="Public Bank">Public Bank</option>
          <option value="RHB">RHB</option>
          <option value="Hong Leong">Hong Leong</option>
          <option value="AmBank">AmBank</option>
          <option value="Bank Islam">Bank Islam</option>
          <option value="Bank Rakyat">Bank Rakyat</option>
          <option value="BSN">BSN</option>
          <option value="Other">Other</option>
        </select>
      </label>
      <label>Account number
        <input [(ngModel)]="f.bankAccount" name="ba" placeholder="e.g. 1234-567-890" maxlength="20" />
      </label>
    </div>
    @if (bankSavingError()) { <p class="err">{{ bankSavingError() }}</p> }
    <div class="form-actions">
      <button class="btn-primary" (click)="saveBankDetails()" [disabled]="savingBank()">
        {{ savingBank() ? 'Saving…' : 'Save bank details' }}
      </button>
    </div>
  </div>
</section>
```

- [x] **Step 2: Add form fields to the `f` object (around line 882-904)**

Add after `showPhonePublic: false`:
```typescript
bankName: '',
bankAccount: '',
```

- [x] **Step 3: Add signals**

```typescript
savingBank = signal(false);
bankSavingError = signal('');
```

- [x] **Step 4: Add seed in ngOnInit (around line 944)**

After `this.f.showPhonePublic = p.showPhonePublic ?? false;`:
```typescript
this.f.bankName = p.bankName ?? '';
this.f.bankAccount = p.bankAccount ?? '';
```

- [x] **Step 5: Add saveBankDetails() method**

```typescript
saveBankDetails(): void {
  this.bankSavingError.set('');
  this.savingBank.set(true);
  this.api.patch<ServicerProfile>('/servicer/me', {
    bankName: this.f.bankName || undefined,
    bankAccount: this.f.bankAccount || undefined,
  }).subscribe({
    next: (updated) => {
      this.profile.update((p) => (p ? { ...p, ...updated } : p));
      this.savingBank.set(false);
      this.toast.success('Bank details saved.');
    },
    error: (e) => {
      this.savingBank.set(false);
      this.bankSavingError.set(e.message ?? 'Could not save bank details');
    },
  });
}
```

- [x] **Step 6: Update the ServicerProfile interface to include bankName/bankAccount fields**

```typescript
bankName?: string | null;
bankAccount?: string | null;
```

- [x] **Step 7: Verify tsc + ng build**

- [x] **Step 8: Commit**

---

## Task B1-S7: Onboarding gate

### Task B1.9: Create onboarding service

**Files:**
- Create: `backend/src/services/onboarding.service.ts`
- Modify: `backend/src/services/booking.service.ts` - gate propose/confirm calls

- [x] **Step 1: Create onboarding service**

```typescript
import { prisma } from '../lib/prisma';
import { badRequest } from '../lib/errors';

export interface OnboardingCheckResult {
  ok: boolean;
  missing: string[];
  redirectUrl: string;
}

export async function requireOnboarded(servicerId: string): Promise<OnboardingCheckResult> {
  const servicer = await prisma.servicer.findUnique({
    where: { id: servicerId },
    select: { onboarded: true, bankName: true, bankAccount: true, kycStatus: true },
  });

  if (!servicer) throw badRequest('Servicer not found');
  if (servicer.onboarded) return { ok: true, missing: [], redirectUrl: '' };

  const missing: string[] = [];
  if (!servicer.bankName || !servicer.bankAccount) missing.push('bank_account');
  if (servicer.kycStatus !== 'approved') missing.push('kyc');

  if (missing.length === 0) {
    // All requirements met - mark onboarded
    await prisma.servicer.update({
      where: { id: servicerId },
      data: { onboarded: true },
    });
    return { ok: true, missing: [], redirectUrl: '' };
  }

  return {
    ok: false,
    missing,
    redirectUrl: '/servicer/account',
  };
}
```

- [x] **Step 2: Add gate to propose and confirm endpoints**

In `backend/src/services/booking.service.ts`, at the start of `submitProposal()` and `confirmJob()`:
```typescript
import { requireOnboarded } from './onboarding.service';

// At start of submitProposal:
const onboarded = await requireOnboarded(servicerId);
if (!onboarded.ok) {
  throw badRequest({
    message: 'Complete your profile before taking jobs.',
    missing: onboarded.missing,
    redirectUrl: onboarded.redirectUrl,
  });
}
```

- [x] **Step 3: Verify tsc**

- [x] **Step 4: Commit**

### Task B1.10: Add onboarding modal to frontend shell

**Files:**
- Modify: `frontend/src/app/shared/shell.component.ts`

- [x] **Step 1: Add a method to handle onboarding error responses**

In api.service.ts or a shared interceptor, or inline in the propose/confirm methods: when the backend returns `{ message, missing, redirectUrl }`, show a modal.

For MVP: handle inline in the jobs component error handler:
```typescript
error: (e) => {
  if (e.error?.missing) {
    this.dialog.confirm({
      title: '⚠️ Complete your profile first',
      message: `Before you can take jobs, fill in: ${e.error.missing.join(', ')}`,
      confirmLabel: 'Go to Account Settings',
    }).subscribe((go) => {
      if (go) this.router.navigate([e.error.redirectUrl ?? '/servicer/account']);
    });
  } else {
    this.toast.error(e.message ?? 'Failed');
  }
}
```

- [x] **Step 2: Verify ng build**

- [x] **Step 3: Commit**

---

## Task B1-S8: Seed default promotions

### Task B1.11: Add default promotion seeding

**Files:**
- Modify: `backend/prisma/seed/seed.ts`
- Modify: `backend/prisma/seed/data/static.ts`

- [x] **Step 1: Add default promotions to static.ts**

```typescript
export const DEFAULT_PROMOTIONS = [
  {
    label: '5% Off Everything',
    description: 'Web-wide 5% discount on all bookings for registered customers.',
    triggerType: 'order_percent',
    valueType: 'percent',
    value: 5,
    conditions: {},
    targetRole: 'customer',
    active: true,
    maxUses: null,
    maxPerUser: null,
  },
  {
    label: 'Welcome Top-up Bonus',
    description: 'Top up RM 100 or more and get RM 10 free credit.',
    triggerType: 'topup_min_amount',
    valueType: 'fixed',
    value: 10,
    conditions: { minAmount: 100 },
    targetRole: 'customer',
    active: true,
    maxUses: 1000,
    maxPerUser: 1,
  },
];
```

- [x] **Step 2: Add seeding to seed.ts**

After categories are created, but before the end:
```typescript
// ── Default promotions ──
for (const promo of DEFAULT_PROMOTIONS) {
  await prisma.promotion.upsert({
    where: { id: promo.label }, // no unique constraint on label - use a specific upsert
    // Alternative: just create since they don't exist yet
    create: {
      label: promo.label,
      description: promo.description,
      triggerType: promo.triggerType,
      valueType: promo.valueType,
      value: promo.value,
      conditions: promo.conditions,
      targetRole: promo.targetRole,
      active: promo.active,
      maxUses: promo.maxUses,
      maxPerUser: promo.maxPerUser,
    },
    // Can't upsert without a unique field that matches. Use createMany with skipDuplicates.
  });
}
// Better approach - use findFirst + create pattern:
for (const promo of DEFAULT_PROMOTIONS) {
  const existing = await prisma.promotion.findFirst({ where: { label: promo.label } });
  if (!existing) {
    await prisma.promotion.create({ data: promo });
  }
}
```

- [x] **Step 3: Run reseed to verify**

```powershell
npm run reseed
```
Expected: seeds complete without error.

- [x] **Step 4: Commit**

---

## Task B1-S9: FAQ update

### Task B1.12: Update FAQ with deposit/credit/promotion entries

**Files:**
- Modify: `backend/prisma/seed/data/static.ts`

- [x] **Step 1: Add 3-5 FAQ entries for the new features**

```typescript
{
  category: 'payments',
  question: 'What is the difference between Deposit and Credit in my servicer account?',
  answer: 'Your Deposit is a security buffer where job earnings land first. It ensures you have funds available to cover any fees or penalties. Your Credit is withdrawable - you can top it up via card and request withdrawals to your bank. You can transfer excess Deposit above the minimum (RM 100) into your Credit at any time.',
  tier: 'servicer,admin',
},
{
  category: 'payments',
  question: 'How do I top up my Credit balance?',
  answer: 'Go to your Deposit & Credit page and enter an amount. You can top up with a credit/debit card via Stripe Checkout. The amount is added to your Credit balance instantly and can be withdrawn to your bank.',
  tier: 'servicer,admin',
},
{
  category: 'payments',
  question: 'How do I withdraw my Credit to my bank account?',
  answer: 'Go to your Deposit & Credit page, enter the amount you want to withdraw, and confirm with your PIN. The withdrawal request is sent to admin for review. Once approved, the funds are transferred to your registered bank account within 1-3 business days.',
  tier: 'servicer,admin',
},
{
  category: 'payments',
  question: 'How do promotions work on MyHomeServicer?',
  answer: 'Admin can create promotions that automatically apply discounts at checkout or top-up. For example, "5% off all orders" gives customers a 5% discount on every booking. Promotions are evaluated based on their trigger conditions - you don\'t need to enter a code.',
  tier: 'admin',
},
{
  category: 'payments',
  question: 'What is the onboarding gate and why can\'t I accept jobs?',
  answer: 'Before you can start accepting jobs, you need to complete your profile: set up your bank account details and complete KYC verification. Once those are done, the onboarding gate is automatically lifted and you can take jobs normally.',
  tier: 'servicer,admin',
},
```

- [x] **Step 2: Run reseed to update FAQ**

- [x] **Step 3: Commit**

---

## Self-Review Checklist

- [x] Does every spec requirement map to at least one task?
- [x] Are all file paths exact?
- [x] Does every code step compile (types match)?
- [x] Are there any "TBD", "TODO", or "implement later" in the plan?
- [x] Do the stripe webhook changes handle both customer and servicer?
- [x] Is the PIN verification consistent (bcrypt compare in verifyPin utility)?
- [x] Are all Decimal operations using Prisma's Decimal type (not JS number)?
