# Dispatch Backend Foundation - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Rework quote timing so the response timer runs now → job time, reject past-dated bookings, and add an admin-configurable same-day "urgent" surcharge - the backend foundation the redesigned dispatch card renders.

**Architecture:** Derive the job datetime from `preferredDate` + the `timeSlot` bucket's start hour (MYT), mirroring the existing `slotEndTime` helper. `servicerDeadline` becomes `jobDatetime − buffer` instead of a customer-entered deadline. Same-calendar-day jobs (MYT) are flagged `isUrgent` and carry a snapshotted `urgentFee` read from a new `urgent_same_day_fee` platform setting. The fee is included in the pay-now credit hold so escrow always covers it.

**Tech Stack:** TypeScript, Prisma (Postgres), Jest 29, Express. Money = `Prisma.Decimal`. Settings via `getSetting<T>('key')`.

**Spec:** `docs/superpowers/specs/2026-06-23-dispatch-card-timing-urgent.md` (Streams B + C). Stream A (card visual) and Stream D (quote images) are separate plans.

---

## File Structure

- `backend/prisma/schema.prisma` - add `isUrgent`, `urgentFee`, `images` to `QuoteRequest`; `isUrgent`, `urgentFee` to `Booking`.
- `backend/prisma/migrations/<ts>_dispatch_urgent_images/` - generated migration.
- `backend/src/lib/time-slots.ts` - add `SLOT_START_HOUR` map + `slotStartHour()` (pure, shared).
- `backend/src/services/quote-timing.service.ts` - **new** small module: `jobDatetime()`, `isPastJob()`, `isSameDayMYT()`, `resolveUrgentFee()`. Keeps timing logic out of the already-large `quote.service.ts` and unit-testable.
- `backend/src/services/quote.service.ts` - `createQuote` derives deadlines from job time, rejects past jobs, sets urgent fields; include urgent fee in credit hold.
- `backend/src/routes/quotes.routes.ts` - make `proposalDeadline` optional in validators (deadline now derived).
- `backend/src/services/servicer-quote.service.ts` - surface `isUrgent`, `urgentFee` in `listIncomingQuotes`.
- `backend/prisma/seed/data/*` + seed - seed `urgent_same_day_fee` platform setting.
- Tests: `backend/tests/unit/quote-timing.test.ts` (new).

Run tests with `npm test` (jest) from `backend/`. Type-gate every edit: `rtk proxy npx tsc --noEmit` (plain `rtk npx tsc` hides source errors - see project memory).

---

## Task 1: Schema - urgent + images fields and the platform setting

**Files:**
- Modify: `backend/prisma/schema.prisma` (QuoteRequest ~`812-857`, Booking model)
- Create: migration folder via `prisma migrate dev`

- [x] **Step 1: Stop the running backend.** The server holds a lock on
  `query_engine-windows.dll.node`; `prisma generate` fails silently while it runs
  (P2022 on next login). Stop the backend terminal / `Run.bat` window before migrating.

- [x] **Step 2: Add fields to `QuoteRequest`** (after `lng Float?`, ~line 840):

```prisma
  isUrgent   Boolean  @default(false) @map("is_urgent")
  urgentFee  Decimal? @db.Decimal(10, 2) @map("urgent_fee")
  images     String[] @default([]) @map("images")
```

- [x] **Step 3: Add carry-through fields to `Booking`** (alongside its other money fields):

```prisma
  isUrgent   Boolean  @default(false) @map("is_urgent")
  urgentFee  Decimal? @db.Decimal(10, 2) @map("urgent_fee")
```

- [x] **Step 4: Create + apply the migration**

Run (from `backend/`): `npm run db:migrate -- --name dispatch_urgent_images`
Expected: prisma creates `prisma/migrations/<ts>_dispatch_urgent_images/`, applies it, regenerates the client. No P2022.

- [x] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(quote): schema for urgent surcharge + quote images"
```

---

## Task 2: `slotStartHour` - bucket → start hour (MYT)

**Files:**
- Modify: `backend/src/lib/time-slots.ts`
- Test: `backend/tests/unit/quote-timing.test.ts` (new)

- [x] **Step 1: Write the failing test**

```typescript
import { SLOT_START_HOUR, slotStartHour } from '../../src/lib/time-slots';

describe('slot start hours (MYT)', () => {
  it('maps every bucket to its agreed start hour (matches the UI ranges)', () => {
    expect(SLOT_START_HOUR).toEqual({ morning: 9, noon: 11, afternoon: 13, evening: 15, night: 17 });
  });
  it('slotStartHour returns the hour for a slot', () => {
    expect(slotStartHour('afternoon')).toBe(13);
  });
});
```

- [x] **Step 2: Run it, verify it fails**

Run: `npx jest tests/unit/quote-timing.test.ts -t "slot start hours"`
Expected: FAIL - `SLOT_START_HOUR` is not exported.

- [x] **Step 3: Add to `backend/src/lib/time-slots.ts`** (after the existing `TIME_SLOTS` / `TimeSlotValue`):

```typescript
/** Start hour (MYT, 24h) for each quote time-slot bucket. Mirrors SLOT_END_HOUR
 *  in booking.service.ts; used to derive a concrete job datetime + response timer. */
export const SLOT_START_HOUR: Record<TimeSlotValue, number> = {
  morning: 9,
  noon: 11,
  afternoon: 13,
  evening: 15,
  night: 17,
};

export function slotStartHour(slot: TimeSlotValue): number {
  return SLOT_START_HOUR[slot];
}
```

- [x] **Step 4: Run it, verify it passes**

Run: `npx jest tests/unit/quote-timing.test.ts -t "slot start hours"`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add backend/src/lib/time-slots.ts backend/tests/unit/quote-timing.test.ts
git commit -m "feat(quote): slot start-hour map for job-time derivation"
```

---

## Task 3: `quote-timing.service.ts` - job datetime, past check, same-day urgent

**Files:**
- Create: `backend/src/services/quote-timing.service.ts`
- Test: `backend/tests/unit/quote-timing.test.ts` (append)

- [x] **Step 1: Write the failing tests** (append to the file)

```typescript
import { jobDatetime, isPastJob, isSameDayMYT } from '../../src/services/quote-timing.service';

const MYT = 8 * 60 * 60 * 1000;

describe('jobDatetime', () => {
  it('returns the slot-start instant in real UTC for a MYT calendar day', () => {
    // afternoon (13:00 MYT) on 2026-06-15 → 05:00 UTC
    const d = new Date('2026-06-15T00:00:00Z');
    expect(jobDatetime(d, 'afternoon').toISOString()).toBe('2026-06-15T05:00:00.000Z');
  });
});

describe('isPastJob', () => {
  it('true when job instant is before now', () => {
    const past = new Date(Date.now() - 60_000);
    expect(isPastJob(past)).toBe(true);
  });
  it('false when job instant is in the future', () => {
    const future = new Date(Date.now() + 3 * 60 * 60_000);
    expect(isPastJob(future)).toBe(false);
  });
});

describe('isSameDayMYT', () => {
  it('true when two instants fall on the same MYT calendar day', () => {
    const a = new Date('2026-06-15T20:00:00Z'); // 2026-06-16 04:00 MYT
    const b = new Date('2026-06-15T23:00:00Z'); // 2026-06-16 07:00 MYT
    expect(isSameDayMYT(a, b)).toBe(true);
  });
  it('false across a MYT day boundary', () => {
    const a = new Date('2026-06-15T10:00:00Z'); // 2026-06-15 18:00 MYT
    const b = new Date('2026-06-15T17:00:00Z'); // 2026-06-16 01:00 MYT
    expect(isSameDayMYT(a, b)).toBe(false);
  });
});
```

- [x] **Step 2: Run, verify fail**

Run: `npx jest tests/unit/quote-timing.test.ts -t "jobDatetime"`
Expected: FAIL - module not found.

- [x] **Step 3: Create `backend/src/services/quote-timing.service.ts`**

```typescript
import { TimeSlotValue, slotStartHour } from '../lib/time-slots';

/** MYT is UTC+8. */
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Concrete job start instant (real UTC) for a quote's preferred date + slot.
 * Mirrors booking.service.ts slotEndTime: take the MYT calendar day of `date`,
 * place the slot start hour on it in MYT, convert to UTC.
 */
export function jobDatetime(preferredDate: Date, slot: TimeSlotValue): Date {
  const myt = new Date(preferredDate.getTime() + MYT_OFFSET_MS);
  return new Date(
    Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate(), slotStartHour(slot), 0, 0, 0) -
      MYT_OFFSET_MS,
  );
}

/** True when the job instant is already in the past. */
export function isPastJob(job: Date, now: Date = new Date()): boolean {
  return job.getTime() <= now.getTime();
}

/** True when two instants land on the same MYT calendar day. */
export function isSameDayMYT(a: Date, b: Date): boolean {
  const am = new Date(a.getTime() + MYT_OFFSET_MS);
  const bm = new Date(b.getTime() + MYT_OFFSET_MS);
  return (
    am.getUTCFullYear() === bm.getUTCFullYear() &&
    am.getUTCMonth() === bm.getUTCMonth() &&
    am.getUTCDate() === bm.getUTCDate()
  );
}
```

- [x] **Step 4: Run, verify pass**

Run: `npx jest tests/unit/quote-timing.test.ts`
Expected: PASS (all describes).

- [x] **Step 5: Commit**

```bash
git add backend/src/services/quote-timing.service.ts backend/tests/unit/quote-timing.test.ts
git commit -m "feat(quote): job-datetime + past + same-day MYT helpers"
```

---

## Task 4: `resolveUrgentFee` - read setting, snapshot amount + split

**Files:**
- Modify: `backend/src/services/quote-timing.service.ts`
- Test: `backend/tests/unit/quote-timing.test.ts` (append)
- Seed: `backend/prisma/seed/*` - add the setting

- [x] **Step 1: Seed the platform setting.** Find where existing settings like
  `platform_fee_rate` / `quote_buffer_minutes` are seeded (grep
  `platform_fee_rate` under `backend/prisma/seed/`) and add a sibling row:

```typescript
{ key: 'urgent_same_day_fee', value: { amount: 150, platform_share: 0.20 } },
```

- [x] **Step 2: Write the failing test** (append)

```typescript
import { splitUrgentFee } from '../../src/services/quote-timing.service';

describe('splitUrgentFee', () => {
  it('splits a fee into platform + servicer shares', () => {
    expect(splitUrgentFee(150, 0.2)).toEqual({ platform: 30, servicer: 120 });
  });
  it('rounds to cents', () => {
    expect(splitUrgentFee(99.99, 0.2)).toEqual({ platform: 20, servicer: 79.99 });
  });
});
```

- [x] **Step 3: Run, verify fail**

Run: `npx jest tests/unit/quote-timing.test.ts -t "splitUrgentFee"`
Expected: FAIL - not exported.

- [x] **Step 4: Add to `quote-timing.service.ts`**

```typescript
import { getSetting } from './settings.service';

export interface UrgentFeeConfig { amount: number; platform_share: number; }

/** Reads the admin-configurable urgent fee. Returns null if unset/zero. */
export async function resolveUrgentFee(): Promise<UrgentFeeConfig | null> {
  const cfg = await getSetting<UrgentFeeConfig>('urgent_same_day_fee').catch(() => null);
  if (!cfg || !cfg.amount || cfg.amount <= 0) return null;
  return cfg;
}

/** Split a fee into platform + servicer shares, rounded to cents. */
export function splitUrgentFee(amount: number, platformShare: number): { platform: number; servicer: number } {
  const platform = Math.round(amount * platformShare * 100) / 100;
  return { platform, servicer: Math.round((amount - platform) * 100) / 100 };
}
```

- [x] **Step 5: Run, verify pass**

Run: `npx jest tests/unit/quote-timing.test.ts -t "splitUrgentFee"`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add backend/src/services/quote-timing.service.ts backend/tests/unit/quote-timing.test.ts backend/prisma/seed
git commit -m "feat(quote): urgent-fee resolver + split + seed setting"
```

---

## Task 5: `createQuote` - derive deadline from job time, reject past, set urgent

**Files:**
- Modify: `backend/src/services/quote.service.ts` (`createQuote`, `200-340`)

- [x] **Step 1: Add imports** (top of `quote.service.ts`, with the other `./` imports):

```typescript
import { jobDatetime, isPastJob, isSameDayMYT, resolveUrgentFee } from './quote-timing.service';
```

- [x] **Step 2: Replace the deadline block** (`quote.service.ts:207-214`). Old code:

```typescript
  const proposalDeadline = new Date(input.proposalDeadline);
  if (Number.isNaN(proposalDeadline.getTime()) || proposalDeadline <= new Date()) {
    throw badRequest('proposalDeadline must be a valid future timestamp');
  }
  const servicerDeadline = new Date(proposalDeadline.getTime() - SERVICER_DEADLINE_OFFSET_MS);
  if (servicerDeadline <= new Date()) {
    throw badRequest('proposalDeadline must be at least 15 minutes in the future');
  }
```

Replace with (deadline derived from the job time, not customer-entered):

```typescript
  // Timing model (2026-06-23): the job's own start time drives the response
  // window. No customer-chosen deadline; no past-dated jobs.
  const preferred = new Date(input.preferredDate);
  if (Number.isNaN(preferred.getTime())) throw badRequest('preferredDate must be a valid date');
  const jobAt = jobDatetime(preferred, input.timeSlot);
  if (isPastJob(jobAt)) throw badRequest('Cannot request a job in the past - pick a current or future time.');

  // Servicers must respond before the job starts (buffer-trimmed); proposal
  // deadline == job start. Reuse the existing 15-min buffer constant.
  const servicerDeadline = new Date(jobAt.getTime() - SERVICER_DEADLINE_OFFSET_MS);
  const proposalDeadline = jobAt;

  // Same MYT calendar day → urgent surcharge (snapshot fee so later setting
  // changes never rewrite history).
  const urgentCfg = isSameDayMYT(jobAt, new Date()) ? await resolveUrgentFee() : null;
  const isUrgent = urgentCfg !== null;
  const urgentFee = urgentCfg ? urgentCfg.amount : null;
```

- [x] **Step 3: Persist the urgent fields.** In the `prisma.quoteRequest.create({ data: { ... } })`
  block (`quote.service.ts:308-340`), add after `servicerDeadline,`:

```typescript
      isUrgent,
      urgentFee,
```

- [x] **Step 4: Make `proposalDeadline` optional on the input type.** In
  `CreateQuoteInput` (`quote.service.ts:24-47`) change:

```typescript
  proposalDeadline: string;
```
to
```typescript
  /** @deprecated Deadline is now derived from the job time; ignored if passed. */
  proposalDeadline?: string;
```

This keeps existing callers (repost, guest, seed, route) compiling while the value is ignored.

- [x] **Step 5: Type-gate**

Run: `rtk proxy npx tsc --noEmit` (from `backend/`)
Expected: zero errors. (If callers reference `input.proposalDeadline`, they still compile - it's optional now.)

- [x] **Step 6: Smoke test the rejection.** Add a focused test
  `backend/tests/unit/quote-timing.test.ts` (append) that the helper rejects past:
  already covered by `isPastJob`. No new test needed here; integration is covered by E2E.

- [x] **Step 7: Commit**

```bash
git add backend/src/services/quote.service.ts
git commit -m "feat(quote): derive deadline from job time, reject past, flag urgent"
```

---

## Task 6: Include urgent fee in the pay-now credit hold

**Files:**
- Modify: `backend/src/services/quote.service.ts` (`creditHold`, `286-300`)

- [x] **Step 1: Add the urgent fee to the hold.** Old (`quote.service.ts:286-289`):

```typescript
  const creditHold =
    input.paymentMode === 'pay_now' && input.settlementMethod !== 'gateway'
      ? computeHoldAmount(input.budgetMax ?? null, input.tipAmount ?? 0)
      : 0;
```

Replace with (escrow must cover the surcharge so it can't be bypassed):

```typescript
  const baseHold =
    input.paymentMode === 'pay_now' && input.settlementMethod !== 'gateway'
      ? computeHoldAmount(input.budgetMax ?? null, input.tipAmount ?? 0)
      : 0;
  const creditHold = baseHold > 0 && urgentFee ? Math.round((baseHold + urgentFee) * 100) / 100 : baseHold;
```

- [x] **Step 2: Type-gate**

Run: `rtk proxy npx tsc --noEmit`
Expected: zero errors.

- [x] **Step 3: Commit**

```bash
git add backend/src/services/quote.service.ts
git commit -m "feat(quote): include urgent fee in pay-now credit hold"
```

> Note: full escrow reconciliation (accepted price + urgent fee > held → block + top-up)
> is TODO #3 / a later plan. This task only ensures the hold *captures* the urgent fee at
> request time.

---

## Task 7: Make `proposalDeadline` optional in route validators

**Files:**
- Modify: `backend/src/routes/quotes.routes.ts` (`146`, `236` area)

- [x] **Step 1: Find the validators.** Grep `proposalDeadline` in `quotes.routes.ts`.
  For each `body('proposalDeadline')...` chain that is required, add `.optional()`:

```typescript
    body('proposalDeadline').optional().isISO8601(),
```

(Keep whatever format check exists; just prepend `.optional()`.) The value is now
ignored by `createQuote`, so a missing one must not 400.

- [x] **Step 2: Type-gate + commit**

Run: `rtk proxy npx tsc --noEmit`
```bash
git add backend/src/routes/quotes.routes.ts
git commit -m "fix(quote): proposalDeadline optional (deadline now derived)"
```

---

## Task 8: Surface `isUrgent` + `urgentFee` to the servicer feed

**Files:**
- Modify: `backend/src/services/servicer-quote.service.ts` (`listIncomingQuotes`, `243-308`)

- [x] **Step 1: Select the fields.** The query already does
  `include: { quoteRequest: { ... } }`. `isUrgent`/`urgentFee` are scalar columns on
  `quoteRequest`, so they're already loaded - no `select` change needed.

- [x] **Step 2: Add to the returned object** (in the `.map`, after `paymentMode: q.paymentMode,`):

```typescript
        isUrgent: q.isUrgent,
        urgentFee: q.urgentFee != null ? Number(q.urgentFee) : null,
```

- [x] **Step 3: Type-gate**

Run: `rtk proxy npx tsc --noEmit`
Expected: zero errors.

- [x] **Step 4: Commit**

```bash
git add backend/src/services/servicer-quote.service.ts
git commit -m "feat(servicer): surface urgent flag + fee on incoming quotes"
```

---

## Task 9: Reseed + manual verification

- [x] **Step 1: Reseed** (server stopped during migrate; restart after).

Run (from `backend/`): `npm run db:reset` (migrate reset + reseed) then start the backend.
Expected: seed completes, `urgent_same_day_fee` row present.

- [x] **Step 2: Run the full unit suite**

Run: `npm test`
Expected: all green, including the new `quote-timing.test.ts`.

- [x] **Step 3: Manual check - same-day urgent.** Create a quote (customer.fresh) with
  `preferredDate` = today and an afternoon slot via the quote form. Expected: quote
  persists with `isUrgent = true`, `urgentFee = 150`; the servicer feed
  (`GET /servicer/quotes` as M9) returns `isUrgent: true`.

- [x] **Step 4: Manual check - past rejection.** Attempt a quote with a past date.
  Expected: 400 "Cannot request a job in the past".

- [x] **Step 5: Commit any seed tweaks**

```bash
git add backend/prisma/seed
git commit -m "chore(seed): urgent fee setting verified in reseed"
```

---

## Self-Review notes

- Spec Stream B (timing) → Tasks 2,3,5,7. Stream C (urgent) → Tasks 1,4,5,6,8. Schema → Task 1. Stream A (card) + Stream D (images) are out of scope (separate plans).
- `images` column is added in Task 1 (cheap to migrate once) but consumed only by the Stream D plan - intentional, avoids a second migration.
- MYT `getUTCDay` auto-accept bug (TODO #2) is NOT fixed here - it lives in the auto-accept gate, a separate plan. Timing helpers here are MYT-correct by construction (mirror `slotEndTime`).
- Type names consistent: `jobDatetime`, `isPastJob`, `isSameDayMYT`, `resolveUrgentFee`, `splitUrgentFee`, `slotStartHour`, `SLOT_START_HOUR` used identically across tasks.
- `splitUrgentFee` is defined (Task 4) but its consumer (booking settlement: route servicer 80% / platform 20% at escrow_release) is deferred to the escrow-integrity plan - flagged so it isn't mistaken for dead code.
