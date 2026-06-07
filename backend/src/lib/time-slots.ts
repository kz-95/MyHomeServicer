/**
 * Canonical service time-slot values — the single source of truth for the
 * backend. Must stay in lock-step with the frontend list in
 * `frontend/src/app/shared/constants/time-slots.ts`.
 *
 * Window reference (MYT): morning 9–11, noon 11–13, afternoon 13–15,
 * evening 15–17, night 17–22.
 *
 * These five values mirror the Prisma `TimeSlot` enum and the category
 * `allowedTimeSlots` default in schema.prisma. A unit test pins the Prisma
 * enum to this list so the two can never silently drift again (the divergence
 * that caused quote submissions with Noon/Afternoon to 400).
 */
export const TIME_SLOTS = ['morning', 'noon', 'afternoon', 'evening', 'night'] as const;

export type TimeSlotValue = (typeof TIME_SLOTS)[number];
