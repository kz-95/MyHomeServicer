import { countSlotJobs } from '../../src/services/servicer-quote.service';

describe('countSlotJobs', () => {
  const bookings = [
    { scheduledDate: new Date('2026-06-15T00:00:00Z'), timeSlot: 'afternoon' },
    { scheduledDate: new Date('2026-06-15T00:00:00Z'), timeSlot: 'afternoon' },
    { scheduledDate: new Date('2026-06-16T00:00:00Z'), timeSlot: 'morning' },
  ];

  it('counts jobs for a matching date+slot', () => {
    expect(countSlotJobs(bookings, new Date('2026-06-15T00:00:00Z'), 'afternoon'))
      .toEqual({ count: 2 });
  });

  it('returns zero for a slot with no jobs', () => {
    expect(countSlotJobs(bookings, new Date('2026-06-17T00:00:00Z'), 'night'))
      .toEqual({ count: 0 });
  });

  it('returns zero when date matches but slot differs', () => {
    expect(countSlotJobs(bookings, new Date('2026-06-15T00:00:00Z'), 'morning'))
      .toEqual({ count: 0 });
  });
});
