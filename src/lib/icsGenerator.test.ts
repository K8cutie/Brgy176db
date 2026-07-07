import { describe, it, expect, beforeEach } from 'vitest';
import { generatePriestIcs, generateTextSummary } from './icsGenerator';
import type { PriestScheduleOptions } from './icsGenerator';
import { setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';
import type { CalendarEvent } from './calendarData';

// The generator must read ONLY through the parish-namespaced storage seam (or
// take live data as parameters) — bare churchos_* keys were the original bug.

function futureDate(daysAhead: number): string {
  // Local-date arithmetic: the generator compares against local midnight, so
  // a UTC-derived (toISOString) date string can land in the past on UTC+ zones.
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-test-1',
    title: 'Parish Fiesta Planning',
    type: 'General',
    date: futureDate(1),
    startTime: '14:00',
    endTime: '15:00',
    location: 'Parish Hall',
    officiant: 'Fr. Reyes',
    isPublic: true,
    ...overrides,
  };
}

const baseOpts: PriestScheduleOptions = {
  days: 7,
  includeMass: false,
  includeSacraments: false,
  includeEvents: false,
  priestName: 'Fr. Reyes',
};

beforeEach(() => {
  localStorage.clear();
});

describe('generatePriestIcs — calendar events', () => {
  it('includes events passed as live data', () => {
    const ics = generatePriestIcs(
      { ...baseOpts, includeEvents: true },
      { events: [makeEvent()] },
    );
    expect(ics).toContain('SUMMARY:Parish Fiesta Planning');
    expect(ics).toContain('BEGIN:VEVENT');
  });

  it('falls back to the parish-NAMESPACED store, never the bare key', () => {
    // Real data lives under the namespaced key…
    setJSON(KEYS.calendarEvents, [makeEvent({ id: 'ns-1', title: 'Namespaced Event' })]);
    // …while a stale bare key holds something else entirely.
    localStorage.setItem(
      'churchos_calendar_events',
      JSON.stringify([makeEvent({ id: 'bare-1', title: 'Stale Bare-Key Event' })]),
    );

    const ics = generatePriestIcs({ ...baseOpts, includeEvents: true });
    expect(ics).toContain('SUMMARY:Namespaced Event');
    expect(ics).not.toContain('Stale Bare-Key Event');
  });

  it('filters out events outside the range and for other priests', () => {
    const ics = generatePriestIcs(
      { ...baseOpts, includeEvents: true },
      {
        events: [
          makeEvent({ id: 'e1', title: 'In Range' }),
          makeEvent({ id: 'e2', title: 'Too Far Out', date: futureDate(30) }),
          makeEvent({ id: 'e3', title: 'Other Priest', officiant: 'Fr. Santos' }),
        ],
      },
    );
    expect(ics).toContain('SUMMARY:In Range');
    expect(ics).not.toContain('Too Far Out');
    expect(ics).not.toContain('Other Priest');
  });
});

describe('generatePriestIcs — mass schedule', () => {
  it('produces well-formed DTSTART for 12h "6:00 AM" style times', () => {
    const ics = generatePriestIcs(
      { ...baseOpts, days: 14, includeMass: true },
      { massSchedule: [{ day: 'Sunday', time: '6:00 AM', type: 'Solemn Mass' }] },
    );
    const starts = ics.match(/DTSTART:(.+)/g) || [];
    expect(starts.length).toBeGreaterThan(0);
    for (const line of starts) {
      expect(line.trim()).toMatch(/^DTSTART:\d{8}T\d{6}Z$/);
    }
    expect(ics).not.toContain('NaN');
  });

  it('reads a persisted mass schedule through the storage seam', () => {
    setJSON('mass_schedule', [{ day: 'Monday', time: '5:30 PM', type: 'Novena Mass' }]);
    const ics = generatePriestIcs({ ...baseOpts, days: 14, includeMass: true });
    expect(ics).toContain('Novena Mass');
    expect(ics).not.toContain('NaN');
  });

  it('dates a recurring Monday Mass on that local Monday (no UTC off-by-one)', () => {
    // Regression: the recurring date was derived via toISOString().split('T')[0]
    // on a LOCAL-midnight Date, which shifts back a day on UTC+ zones (e.g.
    // Asia/Manila), moving every recurring Mass to the previous calendar day.
    // The first upcoming Monday computed with LOCAL getters (as the generator now
    // does) is the date that must appear in the SUMMARY / uid.
    const pad = (n: number) => String(n).padStart(2, '0');
    const mon = new Date();
    while (mon.getDay() !== 1) mon.setDate(mon.getDate() + 1); // next Monday, local
    const monLocal = `${mon.getFullYear()}-${pad(mon.getMonth() + 1)}-${pad(mon.getDate())}`;

    const ics = generatePriestIcs(
      { ...baseOpts, days: 14, includeMass: true },
      { massSchedule: [{ day: 'Monday', time: '6:00 AM', type: 'Daily Mass' }] },
    );

    // The per-occurrence uid embeds the resolved local date verbatim.
    expect(ics).toContain(`churchos-mass-Monday-0600-${monLocal}@churchos.local`);
    // And never the day-before that the toISOString bug produced.
    const dayBefore = new Date(mon);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeLocal = `${dayBefore.getFullYear()}-${pad(dayBefore.getMonth() + 1)}-${pad(dayBefore.getDate())}`;
    expect(ics).not.toContain(`churchos-mass-Monday-0600-${dayBeforeLocal}@churchos.local`);
  });
});

describe('generatePriestIcs — sacraments', () => {
  it('includes registry records passed as live data with 12h times normalized', () => {
    const ics = generatePriestIcs(
      { ...baseOpts, includeSacraments: true },
      {
        registryRecords: {
          baptism: [{
            id: 'bap-t1',
            registryNumber: 'B-2026-099',
            childFirstName: 'Ana',
            childLastName: 'Santos',
            scheduledOfficiant: 'Fr. Reyes',
            scheduledDate: futureDate(2),
            scheduledTime: '10:00 AM',
            scheduledLocation: 'Baptistry',
          }],
          marriage: [], confirmation: [], death: [],
        },
      },
    );
    expect(ics).toContain('SUMMARY:Baptism: Ana Santos');
    expect(ics).toContain('LOCATION:Baptistry');
    expect(ics).not.toContain('NaN');
  });

  it('excludes soft-deleted registry records (archived wedding stays off the schedule)', () => {
    setJSON(KEYS.marriageRecords, [
      {
        id: 'wed-live',
        registryNumber: 'M-2026-050',
        groomFirstName: 'Juan', groomLastName: 'Cruz',
        brideFirstName: 'Maria', brideLastName: 'Lopez',
        scheduledOfficiant: 'Fr. Reyes',
        scheduledDate: futureDate(3),
        scheduledTime: '14:00',
      },
      {
        id: 'wed-gone',
        registryNumber: 'M-2026-051',
        groomFirstName: 'Archived', groomLastName: 'Groom',
        brideFirstName: 'Archived', brideLastName: 'Bride',
        scheduledOfficiant: 'Fr. Reyes',
        scheduledDate: futureDate(3),
        scheduledTime: '15:00',
        isDeleted: true,
        deletedAt: '2026-07-01T00:00:00.000Z',
        deletedBy: 'Secretary',
      },
    ]);
    setJSON(KEYS.baptismRecords, []);
    setJSON(KEYS.confirmationRecords, []);
    setJSON(KEYS.deathRecords, []);

    const ics = generatePriestIcs({ ...baseOpts, includeSacraments: true });
    expect(ics).toContain('Juan Cruz & Maria Lopez');
    expect(ics).not.toContain('Archived Groom');
  });

  it('excludes soft-deleted records passed as live data too', () => {
    const ics = generatePriestIcs(
      { ...baseOpts, includeSacraments: true },
      {
        registryRecords: {
          baptism: [{
            id: 'bap-gone',
            registryNumber: 'B-2026-100',
            childFirstName: 'Deleted',
            childLastName: 'Child',
            scheduledOfficiant: 'Fr. Reyes',
            scheduledDate: futureDate(2),
            scheduledTime: '10:00',
            isDeleted: true,
          }],
          marriage: [], confirmation: [], death: [],
        },
      },
    );
    expect(ics).not.toContain('Deleted Child');
  });

  it('reads registry records through the namespaced seam when not passed', () => {
    setJSON(KEYS.marriageRecords, [{
      id: 'wed-t1',
      registryNumber: 'M-2026-042',
      groomFirstName: 'Juan', groomLastName: 'Cruz',
      brideFirstName: 'Maria', brideLastName: 'Lopez',
      scheduledOfficiant: 'Fr. Reyes',
      scheduledDate: futureDate(3),
      scheduledTime: '14:00',
    }]);
    // Empty the others so seeds don't add noise to the assertion.
    setJSON(KEYS.baptismRecords, []);
    setJSON(KEYS.confirmationRecords, []);
    setJSON(KEYS.deathRecords, []);

    const ics = generatePriestIcs({ ...baseOpts, includeSacraments: true });
    expect(ics).toContain('SUMMARY:Marriage: Juan Cruz & Maria Lopez');
  });
});

describe('generateTextSummary', () => {
  it('threads live data through to the text output', () => {
    const text = generateTextSummary(
      { ...baseOpts, includeEvents: true },
      { events: [makeEvent()] },
    );
    expect(text).toContain('Parish Fiesta Planning');
  });
});
