import { describe, it, expect } from 'vitest';
import {
  parseTimeToMinutes,
  durationFor,
  toBusyIntervals,
  findConflicts,
  hasConflict,
  suggestFreeVenues,
  isLiturgicallyBlocked,
  SACRAMENT_DURATIONS,
  type ScheduledSlot,
  type CalendarEventLike,
} from './scheduling';
import type { Venue } from './venues';

/* ── helpers ── */
function ev(o: Partial<CalendarEventLike>): CalendarEventLike {
  return { id: 'e', date: '2026-06-20', ...o };
}
function venue(o: Partial<Venue> & { id: string; name: string }): Venue {
  return { capacity: 0, location: '', active: true, isDefault: false, ...o };
}

describe('parseTimeToMinutes', () => {
  it('parses 24-hour clock', () => {
    expect(parseTimeToMinutes('14:00')).toBe(14 * 60);
    expect(parseTimeToMinutes('09:30')).toBe(9 * 60 + 30);
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('23:59')).toBe(23 * 60 + 59);
  });
  it('parses 12-hour clock with meridiem', () => {
    expect(parseTimeToMinutes('2:00 PM')).toBe(14 * 60);
    expect(parseTimeToMinutes('10:00 AM')).toBe(10 * 60);
    expect(parseTimeToMinutes('12:00 AM')).toBe(0);      // midnight
    expect(parseTimeToMinutes('12:00 PM')).toBe(12 * 60); // noon
    expect(parseTimeToMinutes('9 am')).toBe(9 * 60);
    expect(parseTimeToMinutes('2pm')).toBe(14 * 60);
  });
  it('returns null on garbage / out-of-range', () => {
    expect(parseTimeToMinutes('')).toBeNull();
    expect(parseTimeToMinutes(null)).toBeNull();
    expect(parseTimeToMinutes(undefined)).toBeNull();
    expect(parseTimeToMinutes('noon')).toBeNull();
    expect(parseTimeToMinutes('25:00')).toBeNull();
    expect(parseTimeToMinutes('10:70')).toBeNull();
    expect(parseTimeToMinutes('13:00 PM')).toBeNull(); // 13 invalid on 12h clock
  });
});

describe('durationFor / SACRAMENT_DURATIONS', () => {
  it('uses the agreed defaults, case-insensitive, with 60 fallback', () => {
    expect(durationFor('wedding')).toBe(90);
    expect(durationFor('Baptism')).toBe(45);
    expect(durationFor('death')).toBe(60);
    expect(durationFor('funeral')).toBe(60);
    expect(durationFor('confirmation')).toBe(60);
    expect(durationFor('mass')).toBe(SACRAMENT_DURATIONS.default);
    expect(durationFor(undefined)).toBe(60);
  });
});

describe('toBusyIntervals', () => {
  it('reads time or startTime and defaults a 60-min window', () => {
    const [a] = toBusyIntervals([ev({ time: '10:00', title: 'A' })]);
    expect(a.start).toBe(600);
    expect(a.end).toBe(660); // +60 default
  });
  it('derives duration from endTime when present', () => {
    const [a] = toBusyIntervals([ev({ startTime: '10:00', endTime: '11:30' })]);
    expect(a.end - a.start).toBe(90);
  });
  it('skips events with no parseable time', () => {
    expect(toBusyIntervals([ev({ time: 'whenever' })])).toHaveLength(0);
    expect(toBusyIntervals([ev({ date: undefined, time: '10:00' })])).toHaveLength(0);
  });
});

const slot = (o: Partial<ScheduledSlot> = {}): ScheduledSlot => ({
  date: '2026-06-20',
  startMin: 10 * 60,
  durationMin: 90,
  venueId: 'Main Church',
  officiant: 'Fr. Reyes',
  ...o,
});

describe('findConflicts — time windows', () => {
  it('flags an overlapping same-venue event', () => {
    const events = [ev({ id: 'x', time: '10:30', endTime: '11:00', location: 'Main Church', officiant: 'Fr. Santos' })];
    expect(findConflicts(slot(), events).map((c) => c.id)).toEqual(['x']);
  });
  it('does NOT flag a non-overlapping window', () => {
    const events = [ev({ id: 'x', time: '13:00', endTime: '14:00', location: 'Main Church' })];
    expect(findConflicts(slot(), events)).toHaveLength(0);
  });
  it('treats touching windows [start,end) as non-overlapping', () => {
    // candidate 10:00–11:30 ; other 11:30–12:30 → back-to-back, no overlap
    const events = [ev({ id: 'x', time: '11:30', endTime: '12:30', location: 'Main Church' })];
    expect(findConflicts(slot(), events)).toHaveLength(0);
  });
});

describe('findConflicts — venue vs officiant', () => {
  it('same venue, overlapping, different priest → conflict', () => {
    const events = [ev({ id: 'x', time: '10:30', location: 'Main Church', officiant: 'Fr. Santos' })];
    expect(hasConflict(slot({ officiant: 'Fr. Reyes' }), events)).toBe(true);
  });
  it('different venue, overlapping, different priest → NO conflict', () => {
    const events = [ev({ id: 'x', time: '10:30', location: 'Chapel', officiant: 'Fr. Santos' })];
    expect(hasConflict(slot({ venueId: 'Main Church', officiant: 'Fr. Reyes' }), events)).toBe(false);
  });
  it('same officiant across DIFFERENT venues, overlapping → conflict', () => {
    const events = [ev({ id: 'x', time: '10:30', location: 'Chapel', officiant: 'Fr. Reyes' })];
    expect(hasConflict(slot({ venueId: 'Main Church', officiant: 'Fr. Reyes' }), events)).toBe(true);
  });
  it('matches a venue by id token as well as by location name', () => {
    const events = [ev({ id: 'x', time: '10:30', venueId: 'ven-1', officiant: 'Fr. Santos' })];
    expect(hasConflict(slot({ venueId: 'ven-1', officiant: 'Fr. Reyes' }), events)).toBe(true);
  });
});

describe('findConflicts — excludeId (self-edit)', () => {
  it('excludes the record being edited from its own conflicts', () => {
    const events = [ev({ id: 'self', time: '10:00', endTime: '11:30', location: 'Main Church', officiant: 'Fr. Reyes' })];
    expect(hasConflict(slot(), events)).toBe(true); // without exclude, it collides
    expect(hasConflict(slot({ excludeId: 'self' }), events)).toBe(false);
  });
});

describe('suggestFreeVenues', () => {
  const venues: Venue[] = [
    venue({ id: 'v-main', name: 'Main Church', capacity: 300, isDefault: true }),
    venue({ id: 'v-chapel', name: 'Chapel', capacity: 40 }),
    venue({ id: 'v-hall', name: 'Parish Hall', capacity: 150 }),
  ];
  // Main Church is busy 10:00–11:30 with a different priest.
  const events = [ev({ id: 'busy', time: '10:00', endTime: '11:30', venueId: 'v-main', location: 'Main Church', officiant: 'Fr. Santos' })];

  it('omits the busy venue and returns the free ones', () => {
    const s = slot({ venueId: 'v-main', officiant: 'Fr. Reyes' });
    const ids = suggestFreeVenues(s, venues, events).map((r) => r.venue.id);
    expect(ids).not.toContain('v-main');
    expect(ids).toEqual(expect.arrayContaining(['v-chapel', 'v-hall']));
  });

  it('flags capacity fit and orders fitting venues first', () => {
    const s = slot({ venueId: 'v-main', officiant: 'Fr. Reyes' });
    const res = suggestFreeVenues(s, venues, events, 100);
    // Chapel (40) too small, Hall (150) fits → Hall must come before Chapel.
    const hall = res.find((r) => r.venue.id === 'v-hall')!;
    const chapel = res.find((r) => r.venue.id === 'v-chapel')!;
    expect(hall.fits).toBe(true);
    expect(chapel.fits).toBe(false);
    expect(res.findIndex((r) => r.venue.id === 'v-hall')).toBeLessThan(
      res.findIndex((r) => r.venue.id === 'v-chapel'),
    );
  });

  it('capacity 0 (uncapped) and unknown guests always fit', () => {
    const uncapped: Venue[] = [venue({ id: 'v-x', name: 'Big Field', capacity: 0 })];
    expect(suggestFreeVenues(slot({ venueId: 'v-x' }), uncapped, [], 5000)[0].fits).toBe(true);
    expect(suggestFreeVenues(slot({ venueId: 'v-x' }), uncapped, [])[0].fits).toBe(true);
  });

  it('a double-booked officiant frees NO venue', () => {
    const s = slot({ venueId: 'v-main', officiant: 'Fr. Reyes' });
    const priestBusy = [ev({ id: 'p', time: '10:00', endTime: '11:00', location: 'Somewhere', officiant: 'Fr. Reyes' })];
    expect(suggestFreeVenues(s, venues, priestBusy)).toHaveLength(0);
  });

  it('skips inactive venues', () => {
    const withInactive = [...venues, venue({ id: 'v-old', name: 'Old Chapel', capacity: 20, active: false })];
    const ids = suggestFreeVenues(slot({ venueId: 'v-main' }), withInactive, []).map((r) => r.venue.id);
    expect(ids).not.toContain('v-old');
  });
});

describe('isLiturgicallyBlocked (reuses liturgicalCalendar)', () => {
  it('blocks weddings during Lent 2026', () => {
    // 2026: Ash Wednesday Feb 18 → Holy Saturday Apr 4.
    const r = isLiturgicallyBlocked('2026-03-01', 'wedding');
    expect(r.blocked).toBe(true);
    expect(r.note).toMatch(/Lent/i);
  });
  it('does NOT block a baptism during Lent', () => {
    expect(isLiturgicallyBlocked('2026-03-01', 'baptism').blocked).toBe(false);
  });
  it('blocks every sacrament on Good Friday 2026 (Triduum)', () => {
    expect(isLiturgicallyBlocked('2026-04-03', 'baptism').blocked).toBe(true);
    expect(isLiturgicallyBlocked('2026-04-03', 'wedding').blocked).toBe(true);
  });
  it('an ordinary weekday is not blocked', () => {
    const r = isLiturgicallyBlocked('2026-06-24', 'wedding');
    expect(r.blocked).toBe(false);
  });
});
