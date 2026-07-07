import { describe, it, expect, beforeEach } from 'vitest';
import {
  listAttendance,
  recordHeadcount,
  getHeadcountForEvent,
  getAttendanceSummary,
  recentAttendance,
} from './attendance';
import { ns } from './storageNamespaced';
import { KEYS } from './storageKeys';

describe('attendance headcounts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records a headcount through the namespaced storage seam', () => {
    const rec = recordHeadcount({ eventId: 'evt-1', eventTitle: 'Sunday Mass', date: '2026-05-10', count: 250 });
    expect(rec).not.toBeNull();
    expect(rec!.count).toBe(250);
    // Persisted under the namespaced key, not a bare literal.
    const raw = localStorage.getItem(ns(KEYS.attendance));
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toHaveLength(1);
    expect(getHeadcountForEvent('evt-1')?.count).toBe(250);
  });

  it('re-recording the same event replaces (one count per event, stable id)', () => {
    const first = recordHeadcount({ eventId: 'evt-1', eventTitle: 'Sunday Mass', date: '2026-05-10', count: 250 });
    const second = recordHeadcount({ eventId: 'evt-1', eventTitle: 'Sunday Mass', date: '2026-05-10', count: 300 });
    expect(listAttendance()).toHaveLength(1);
    expect(getHeadcountForEvent('evt-1')?.count).toBe(300);
    expect(second!.id).toBe(first!.id);
  });

  it('rejects invalid counts and missing event ids', () => {
    expect(recordHeadcount({ eventId: 'evt-1', eventTitle: 'Mass', count: -5 })).toBeNull();
    expect(recordHeadcount({ eventId: 'evt-1', eventTitle: 'Mass', count: NaN })).toBeNull();
    expect(recordHeadcount({ eventId: '', eventTitle: 'Mass', count: 10 })).toBeNull();
    expect(listAttendance()).toHaveLength(0);
  });

  it('floors fractional counts and defaults a bad date to today (local)', () => {
    const rec = recordHeadcount({ eventId: 'evt-2', eventTitle: 'Mass', date: 'not-a-date', count: 10.9 });
    expect(rec!.count).toBe(10);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(rec!.date)).toBe(true);
  });

  it('summary aggregates totals, average, and by-month buckets', () => {
    recordHeadcount({ eventId: 'a', eventTitle: 'Mass', date: '2026-05-03', count: 200 });
    recordHeadcount({ eventId: 'b', eventTitle: 'Mass', date: '2026-05-10', count: 300 });
    recordHeadcount({ eventId: 'c', eventTitle: 'Mass', date: '2026-06-07', count: 100 });
    const s = getAttendanceSummary();
    expect(s.eventsCounted).toBe(3);
    expect(s.totalHeadcount).toBe(600);
    expect(s.averageHeadcount).toBe(200);
    expect(s.byMonth['2026-05']).toEqual({ events: 2, total: 500 });
    expect(s.byMonth['2026-06']).toEqual({ events: 1, total: 100 });
  });

  it('summary of empty data is all zeros (seed fallback holds)', () => {
    expect(getAttendanceSummary()).toEqual({
      eventsCounted: 0,
      totalHeadcount: 0,
      averageHeadcount: 0,
      byMonth: {},
    });
  });

  it('recentAttendance returns newest first, capped', () => {
    localStorage.setItem(ns(KEYS.attendance), JSON.stringify([
      { id: '1', eventId: 'a', eventTitle: 'Mass', date: '2026-05-03', count: 1, recordedAt: '2026-05-03T10:00:00.000Z' },
      { id: '2', eventId: 'b', eventTitle: 'Mass', date: '2026-05-10', count: 2, recordedAt: '2026-05-10T10:00:00.000Z' },
    ]));
    const recent = recentAttendance(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].eventId).toBe('b');
  });
});
