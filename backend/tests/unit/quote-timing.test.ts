import { SLOT_START_HOUR, slotStartHour } from '../../src/lib/time-slots';

describe('slot start hours (MYT)', () => {
  it('maps every bucket to its agreed start hour (matches the UI ranges)', () => {
    expect(SLOT_START_HOUR).toEqual({ morning: 9, noon: 11, afternoon: 13, evening: 15, night: 17 });
  });
  it('slotStartHour returns the hour for a slot', () => {
    expect(slotStartHour('afternoon')).toBe(13);
  });
});
