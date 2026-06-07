/**
 * Shared time slot definitions used across quote forms.
 * Single source of truth - import this instead of duplicating the array.
 */
export interface TimeSlot {
  value: string;
  label: string;
}

export const TIME_SLOTS: TimeSlot[] = [
  { value: 'morning', label: 'Morning (9:00–11:00)' },
  { value: 'noon', label: 'Noon (11:00–13:00)' },
  { value: 'afternoon', label: 'Afternoon (13:00–15:00)' },
  { value: 'evening', label: 'Evening (15:00–17:00)' },
  { value: 'night', label: 'Night (17:00–22:00)' },
];
