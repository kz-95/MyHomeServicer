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
