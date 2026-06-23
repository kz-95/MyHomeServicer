import { SLOT_START_HOUR, slotStartHour } from '../../src/lib/time-slots';

describe('slot start hours (MYT)', () => {
  it('maps every bucket to its agreed start hour (matches the UI ranges)', () => {
    expect(SLOT_START_HOUR).toEqual({ morning: 9, noon: 11, afternoon: 13, evening: 15, night: 17 });
  });
  it('slotStartHour returns the hour for a slot', () => {
    expect(slotStartHour('afternoon')).toBe(13);
  });
});

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

import { splitUrgentFee } from '../../src/services/quote-timing.service';

describe('splitUrgentFee', () => {
  it('splits a fee into platform + servicer shares', () => {
    expect(splitUrgentFee(150, 0.2)).toEqual({ platform: 30, servicer: 120 });
  });
  it('rounds to cents', () => {
    expect(splitUrgentFee(99.99, 0.2)).toEqual({ platform: 20, servicer: 79.99 });
  });
});
