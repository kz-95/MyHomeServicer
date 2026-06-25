/**
 * Regression guard - Quote time-slot enum (2026-06-01)
 *
 * A quote submission with the Noon or Afternoon time slot 400'd because the
 * backend enum/validators had drifted to a stale 4-slot set
 * (morning/lunch/evening/night) while the frontend sends the 5-slot canonical
 * set (morning/noon/afternoon/evening/night). Commit 3b423a4 "fixed" the route
 * the wrong way, toward the stale `lunch` value.
 *
 * These tests pin every backend layer to the canonical list so the divergence
 * cannot silently return:
 *   1. the shared TIME_SLOTS constant,
 *   2. the generated Prisma `TimeSlot` enum (the DB source of truth),
 *   3. the Zod time-slot enum used for JSONB validation.
 *
 * If anyone reverts the schema enum or a validator to `lunch`, one of these
 * fails. Keep in lock-step with frontend/src/app/shared/constants/time-slots.ts.
 */
import { TimeSlot } from '@prisma/client';
import { TIME_SLOTS } from '../../src/lib/time-slots';
import { autoAcceptConditionsSchema } from '../../src/lib/json-schemas';

const CANONICAL = ['morning', 'noon', 'afternoon', 'evening', 'night'];

describe('TimeSlot canonical set', () => {
  it('the shared TIME_SLOTS constant is exactly the 5-slot canonical set, in order', () => {
    expect([...TIME_SLOTS]).toEqual(CANONICAL);
  });

  it('the generated Prisma TimeSlot enum matches the canonical set (no stale `lunch`)', () => {
    expect(Object.values(TimeSlot).sort()).toEqual([...CANONICAL].sort());
    expect(Object.values(TimeSlot)).not.toContain('lunch');
  });
});

describe('Zod time-slot enum (via autoAcceptConditions.match_time_slot)', () => {
  it('accepts the regression slots noon + afternoon', () => {
    const result = autoAcceptConditionsSchema.safeParse({ match_time_slot: ['noon', 'afternoon'] });
    expect(result.success).toBe(true);
  });

  it('accepts every canonical slot value', () => {
    const result = autoAcceptConditionsSchema.safeParse({ match_time_slot: CANONICAL });
    expect(result.success).toBe(true);
  });

  it('rejects the removed `lunch` value', () => {
    const result = autoAcceptConditionsSchema.safeParse({ match_time_slot: ['lunch'] });
    expect(result.success).toBe(false);
  });
});
