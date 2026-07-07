import { describe, it, expect, beforeEach } from 'vitest';
import {
  MASS_INTENTIONS_KEY,
  addIntentionFromRequest,
  getIntentions,
  saveIntentions,
  updateIntention,
  scheduleIntention,
  markIntentionOffered,
  cancelIntention,
  recordStipendForIntention,
  getUpcomingMasses,
  to24h,
  to12h,
} from './massIntentions';
import type { IntentionRequestInput, MassIntention } from './massIntentions';
import { getJSON, setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';
import { journalEntries as JOURNAL_SEED } from './financeData';
import type { JournalEntry } from './financeData';
import type { AuditLogEntry } from './settingsData';
import type { CalendarEvent } from './calendarData';

beforeEach(() => {
  localStorage.clear();
});

const baseInput: IntentionRequestInput = {
  intention: 'For the repose of the soul of Juan Dela Cruz',
  requestedBy: 'Maria Dela Cruz',
  contact: '0917 123 4567',
  source: 'portal',
};

describe('addIntentionFromRequest (shared contract)', () => {
  it('appends to the register store and returns the new entry', () => {
    const entry = addIntentionFromRequest(baseInput);
    expect(entry.id).toBeTruthy();
    expect(entry.intention).toBe(baseInput.intention);
    expect(entry.requestedBy).toBe('Maria Dela Cruz');
    expect(entry.contact).toBe('0917 123 4567');
    expect(entry.status).toBe('requested');
    expect(entry.source).toBe('portal');
    expect(entry.dateRequested).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const stored = getIntentions();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(entry.id);
  });

  it('keeps a well-formed preferredDate and drops a malformed one', () => {
    const good = addIntentionFromRequest({ ...baseInput, preferredDate: '2026-08-15' });
    expect(good.preferredDate).toBe('2026-08-15');
    const bad = addIntentionFromRequest({ ...baseInput, preferredDate: 'next Sunday' });
    expect(bad.preferredDate).toBeUndefined();
  });

  it('is defensive against missing/malformed fields (portal input is untrusted)', () => {
    const entry = addIntentionFromRequest({
      intention: '   ',
      requestedBy: 42,
      contact: null,
      preferredDate: 12345,
      source: 'weird',
    } as unknown as IntentionRequestInput);
    expect(entry.intention).toBe('(no intention text provided)');
    expect(entry.requestedBy).toBeUndefined();
    expect(entry.contact).toBeUndefined();
    expect(entry.preferredDate).toBeUndefined();
    expect(entry.source).toBe('office'); // unknown source degrades to office
    expect(getIntentions()).toHaveLength(1);
  });

  it('trims whitespace and accumulates entries newest-first', () => {
    addIntentionFromRequest({ ...baseInput, intention: '  First  ' });
    const second = addIntentionFromRequest({ ...baseInput, intention: 'Second' });
    const stored = getIntentions();
    expect(stored).toHaveLength(2);
    expect(stored[0].id).toBe(second.id);
    expect(stored[1].intention).toBe('First');
  });

  it('sanitizes the office-side stipend extra (rounded to centavos, junk dropped)', () => {
    expect(addIntentionFromRequest({ ...baseInput, stipend: 500.505 }).stipend).toBe(500.51);
    expect(addIntentionFromRequest({ ...baseInput, stipend: -20 }).stipend).toBeUndefined();
    expect(addIntentionFromRequest({ ...baseInput, stipend: NaN }).stipend).toBeUndefined();
  });

  it('writes an audit entry in the shared audit_log shape', () => {
    const entry = addIntentionFromRequest(baseInput);
    const log = getJSON<AuditLogEntry[]>('audit_log', []);
    expect(log.length).toBe(1);
    expect(log[0].recordId).toBe(entry.id);
    expect(log[0].action).toBe('Created');
    expect(log[0].table).toBe('Intentions');
    expect(log[0].timestamp).toBeTruthy();
    expect(log[0].user).toBeTruthy();
    expect(log[0].ipAddress).toBe('local');
  });
});

describe('register CRUD', () => {
  it('updateIntention patches and persists, keeping the id immutable', () => {
    const entry = addIntentionFromRequest(baseInput);
    const updated = updateIntention(entry.id, { notes: 'Novena', id: 'hack' } as Partial<MassIntention>);
    expect(updated?.id).toBe(entry.id);
    expect(updated?.notes).toBe('Novena');
    expect(getIntentions()[0].notes).toBe('Novena');
  });

  it('updateIntention returns null for an unknown id and leaves the store unchanged', () => {
    addIntentionFromRequest(baseInput);
    const before = getIntentions();
    expect(updateIntention('missing', { notes: 'x' })).toBeNull();
    expect(getIntentions()).toEqual(before);
  });

  it('scheduleIntention assigns the Mass (normalizing 12h times) and flips status', () => {
    const entry = addIntentionFromRequest(baseInput);
    const scheduled = scheduleIntention(entry.id, {
      date: '2026-08-16',
      time: '8:00 AM',
      celebrant: 'Fr. Reyes',
      calendarEventId: 'evt-1',
    });
    expect(scheduled?.status).toBe('scheduled');
    expect(scheduled?.massDate).toBe('2026-08-16');
    expect(scheduled?.massTime).toBe('08:00');
    expect(scheduled?.celebrant).toBe('Fr. Reyes');
    expect(scheduled?.calendarEventId).toBe('evt-1');
  });

  it('scheduleIntention rejects a malformed date', () => {
    const entry = addIntentionFromRequest(baseInput);
    expect(scheduleIntention(entry.id, { date: 'soon', time: '08:00' })).toBeNull();
    expect(getIntentions()[0].status).toBe('requested');
  });

  it('markIntentionOffered stamps dateOffered; cancelIntention flips status', () => {
    const a = addIntentionFromRequest(baseInput);
    const offered = markIntentionOffered(a.id);
    expect(offered?.status).toBe('offered');
    expect(offered?.dateOffered).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const b = addIntentionFromRequest(baseInput);
    const explicit = markIntentionOffered(b.id, '2026-07-01');
    expect(explicit?.dateOffered).toBe('2026-07-01');

    const cancelled = cancelIntention(b.id);
    expect(cancelled?.status).toBe('cancelled');
    expect(markIntentionOffered('missing')).toBeNull();
  });

  it('survives a corrupt store shape by returning an empty register', () => {
    setJSON(MASS_INTENTIONS_KEY, { not: 'an array' });
    expect(getIntentions()).toEqual([]);
  });
});

describe('stipend → finance journal', () => {
  function addWithStipend(stipend = 200): MassIntention {
    return addIntentionFromRequest({ ...baseInput, source: 'office', stipend });
  }

  it('posts a balanced Posted entry (Dr 1000 Cash / Cr 4100 Donations)', () => {
    const intention = addWithStipend(250);
    const result = recordStipendForIntention(intention.id, 'Tester');
    expect(result.status).toBe('recorded');
    if (result.status !== 'recorded') return;

    const { entry } = result;
    expect(entry.status).toBe('Posted');
    expect(entry.postedBy).toBe('Tester');
    expect(entry.totalDr).toBe(250);
    expect(entry.totalCr).toBe(250);
    const dr = entry.lines.reduce((s, l) => s + l.debit, 0);
    const cr = entry.lines.reduce((s, l) => s + l.credit, 0);
    expect(dr).toBe(cr);
    expect(entry.lines).toEqual([
      { accountCode: '1000', accountName: 'Cash on Hand', debit: 250, credit: 0 },
      { accountCode: '4100', accountName: 'Donations', debit: 0, credit: 250 },
    ]);

    // Persisted to the journal store WITHOUT clobbering the Finance seed book.
    const journal = getJSON<JournalEntry[]>(KEYS.journalEntries, []);
    expect(journal).toHaveLength(JOURNAL_SEED.length + 1);
    expect(journal.find((e) => e.reference === `MI-${intention.id}`)?.id).toBe(entry.id);

    // Intention flagged so the button can disable.
    const stored = getIntentions().find((i) => i.id === intention.id);
    expect(stored?.stipendRecorded).toBe(true);
    expect(stored?.stipendJournalId).toBe(entry.id);

    // Audited in the shared log under Finance.
    const log = getJSON<AuditLogEntry[]>('audit_log', []);
    expect(log.some((l) => l.table === 'Finance' && l.recordId === entry.id)).toBe(true);
  });

  it('is idempotent — a second call records nothing new', () => {
    const intention = addWithStipend(100);
    expect(recordStipendForIntention(intention.id).status).toBe('recorded');
    expect(recordStipendForIntention(intention.id).status).toBe('already_recorded');
    const journal = getJSON<JournalEntry[]>(KEYS.journalEntries, []);
    expect(journal.filter((e) => e.reference === `MI-${intention.id}`)).toHaveLength(1);
  });

  it('stays idempotent even if the stipendRecorded flag is lost (reference scan)', () => {
    const intention = addWithStipend(100);
    expect(recordStipendForIntention(intention.id).status).toBe('recorded');
    // Simulate stale/rolled-back UI state that dropped the flag.
    saveIntentions(getIntentions().map((i) =>
      i.id === intention.id ? { ...i, stipendRecorded: undefined, stipendJournalId: undefined } : i));
    expect(recordStipendForIntention(intention.id).status).toBe('already_recorded');
    const journal = getJSON<JournalEntry[]>(KEYS.journalEntries, []);
    expect(journal.filter((e) => e.reference === `MI-${intention.id}`)).toHaveLength(1);
  });

  it('refuses when there is no stipend or no such intention', () => {
    const noStipend = addIntentionFromRequest(baseInput);
    expect(recordStipendForIntention(noStipend.id).status).toBe('no_stipend');
    expect(recordStipendForIntention('missing').status).toBe('not_found');
    expect(getJSON<JournalEntry[]>(KEYS.journalEntries, [])).toHaveLength(0);
  });
});

describe('getUpcomingMasses', () => {
  // Monday 2026-07-06, local midnight — deterministic anchor for the range.
  const from = new Date('2026-07-06T00:00:00');

  it('expands the recurring schedule read through the storage seam', () => {
    setJSON('mass_schedule', [{ day: 'Monday', time: '5:30 PM', type: 'Novena Mass' }]);
    const masses = getUpcomingMasses(14, { events: [], from });
    expect(masses.map((m) => m.date)).toEqual(['2026-07-06', '2026-07-13', '2026-07-20']);
    expect(masses.every((m) => m.time === '17:30' && m.title === 'Novena Mass')).toBe(true);
    expect(masses.every((m) => m.calendarEventId === undefined)).toBe(true);
  });

  it('prefers a calendar Mass event over the schedule slot it overlaps', () => {
    const event: CalendarEvent = {
      id: 'evt-sun', title: 'Sunday Mass', type: 'Mass', date: '2026-07-12',
      startTime: '06:00', endTime: '07:00', location: 'Main Church',
      officiant: 'Fr. Reyes', isPublic: true,
    };
    const masses = getUpcomingMasses(7, {
      events: [event],
      schedule: [{ day: 'Sunday', time: '6:00 AM', type: 'Solemn Mass' }],
      from,
    });
    expect(masses).toHaveLength(1);
    expect(masses[0].calendarEventId).toBe('evt-sun');
    expect(masses[0].celebrant).toBe('Fr. Reyes');
    expect(masses[0].time).toBe('06:00');
  });

  it('excludes events outside the range and sorts ascending', () => {
    const mk = (id: string, date: string, startTime: string): CalendarEvent => ({
      id, title: 'Mass', type: 'Mass', date, startTime, endTime: '07:00',
      location: 'Main Church', isPublic: true,
    });
    const masses = getUpcomingMasses(7, {
      events: [
        mk('late', '2026-07-10', '18:00'),
        mk('early', '2026-07-10', '06:00'),
        mk('past', '2026-07-01', '06:00'),
        mk('far', '2026-09-01', '06:00'),
      ],
      schedule: [],
      from,
    });
    expect(masses.map((m) => m.calendarEventId)).toEqual(['early', 'late']);
  });
});

describe('time helpers', () => {
  it('to24h normalizes 12h strings and passes 24h through', () => {
    expect(to24h('6:00 PM')).toBe('18:00');
    expect(to24h('12:15 AM')).toBe('00:15');
    expect(to24h('12:00 PM')).toBe('12:00');
    expect(to24h('06:00')).toBe('06:00');
  });

  it('to12h renders register-friendly times', () => {
    expect(to12h('18:30')).toBe('6:30 PM');
    expect(to12h('00:15')).toBe('12:15 AM');
    expect(to12h('12:00')).toBe('12:00 PM');
  });
});
