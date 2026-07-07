import { describe, it, expect } from 'vitest';
import {
  computeEaster,
  ashWednesday,
  holySaturday,
  lentRange,
  isDuringLent,
  isTriduum,
  epiphany,
  adventStart,
  getLiturgicalDay,
  getLiturgicalSeason,
  getLiturgicalDaysInRange,
  getNotableDays,
} from './liturgicalCalendar';

describe('computus (anonymous Gregorian)', () => {
  it('matches the real Easter dates 2024-2030', () => {
    expect(computeEaster(2024)).toBe('2024-03-31');
    expect(computeEaster(2025)).toBe('2025-04-20');
    expect(computeEaster(2026)).toBe('2026-04-05');
    expect(computeEaster(2027)).toBe('2027-03-28');
    expect(computeEaster(2028)).toBe('2028-04-16');
    expect(computeEaster(2029)).toBe('2029-04-01');
    expect(computeEaster(2030)).toBe('2030-04-21');
  });

  it('derives Ash Wednesday and Holy Saturday from the event year', () => {
    expect(ashWednesday(2024)).toBe('2024-02-14');
    expect(ashWednesday(2025)).toBe('2025-03-05');
    expect(ashWednesday(2026)).toBe('2026-02-18');
    expect(ashWednesday(2027)).toBe('2027-02-10');
    expect(holySaturday(2024)).toBe('2024-03-30');
    expect(holySaturday(2026)).toBe('2026-04-04');
  });
});

describe('Lent range (wedding-block window)', () => {
  it('is Ash Wednesday through Holy Saturday of the SAME year', () => {
    expect(lentRange(2027)).toEqual({ start: '2027-02-10', end: '2027-03-27' });
    expect(lentRange(2024)).toEqual({ start: '2024-02-14', end: '2024-03-30' });
  });

  it('2027: Feb 10-13 ARE Lent (the old fixed 02-14 window missed them)', () => {
    expect(isDuringLent('2027-02-10')).toBe(true);
    expect(isDuringLent('2027-02-13')).toBe(true);
    expect(isDuringLent('2027-02-09')).toBe(false);
  });

  it('2024: Easter Sunday and after are NOT Lent (old window wrongly blocked to Apr 5)', () => {
    expect(isDuringLent('2024-03-30')).toBe(true); // Holy Saturday
    expect(isDuringLent('2024-03-31')).toBe(false); // Easter Sunday
    expect(isDuringLent('2024-04-05')).toBe(false);
  });

  it('season boundaries hold across years', () => {
    // Day before Ash Wednesday is Ordinary Time; Ash Wednesday starts Lent.
    expect(getLiturgicalSeason('2026-02-17')).toBe('Ordinary Time');
    expect(getLiturgicalSeason('2026-02-18')).toBe('Lent');
    expect(getLiturgicalSeason('2026-04-02')).toBe('Triduum'); // Holy Thursday 2026
    expect(getLiturgicalSeason('2026-04-05')).toBe('Easter');
    expect(getLiturgicalSeason('2026-05-24')).toBe('Easter'); // Pentecost 2026
    expect(getLiturgicalSeason('2026-05-25')).toBe('Ordinary Time');
    expect(getLiturgicalSeason('2026-12-25')).toBe('Christmas');
    expect(getLiturgicalSeason('2026-01-04')).toBe('Christmas'); // before Baptism of the Lord
  });
});

describe('Triduum and notable days', () => {
  it('flags exactly Holy Thursday..Holy Saturday as Triduum', () => {
    expect(isTriduum('2026-04-01')).toBe(false); // Wed of Holy Week
    expect(isTriduum('2026-04-02')).toBe(true);
    expect(isTriduum('2026-04-03')).toBe(true);
    expect(isTriduum('2026-04-04')).toBe(true);
    expect(isTriduum('2026-04-05')).toBe(false); // Easter Sunday
  });

  it('getLiturgicalDay finds fixed and movable days', () => {
    expect(getLiturgicalDay('2026-12-08')?.name).toBe('Immaculate Conception');
    expect(getLiturgicalDay('2026-04-03')?.rank).toBe('triduum');
    expect(getLiturgicalDay('2026-04-05')?.name).toBe('Easter Sunday');
    expect(getLiturgicalDay('2026-05-06')).toBeNull();
  });

  it('Philippine Sunday transfers: Epiphany is the Sunday of Jan 2-8', () => {
    expect(epiphany(2026)).toBe('2026-01-04');
    expect(epiphany(2027)).toBe('2027-01-03');
  });

  it('Advent starts on the 4th Sunday before Christmas', () => {
    expect(adventStart(2025)).toBe('2025-11-30');
    expect(adventStart(2026)).toBe('2026-11-29');
    expect(adventStart(2028)).toBe('2028-12-03'); // Christmas 2028 is a Monday
  });

  it('range query spans a year boundary', () => {
    const days = getLiturgicalDaysInRange('2026-12-20', '2027-01-10');
    const names = days.map((d) => d.name);
    expect(names).toContain('Christmas (Nativity of the Lord)');
    expect(names).toContain('Mary, Mother of God');
    expect(names).toContain('Epiphany of the Lord');
    expect(days.every((d) => d.date >= '2026-12-20' && d.date <= '2027-01-10')).toBe(true);
  });

  it('notable days are date-sorted local ISO strings (no UTC drift)', () => {
    const days = getNotableDays(2026);
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    expect(days).toEqual(sorted);
    expect(days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date))).toBe(true);
  });
});
