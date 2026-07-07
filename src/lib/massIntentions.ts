// ═══════════════════════════════════════════════════════════
// Mass Intention Register (Canon 958)
// The canonical book of Mass intentions: every intention received
// (at the office or through the parishioner portal), the stipend
// given, and the Mass at which it was offered.
//
// All reads/writes go through the parish-namespaced storage seam so
// the register works identically on desktop (SQLite), browser
// (localStorage) and cloud. Every mutation here is the single code
// path shared by IntentionsPage and the portal intake
// (addIntentionFromRequest — a cross-builder contract, do not change
// its signature), so the audit trail can't be bypassed.
// ═══════════════════════════════════════════════════════════

import { getJSON, setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';
import { journalEntries as JOURNAL_SEED, formatPeso } from './financeData';
import type { JournalEntry } from './financeData';
import { SAMPLE_EVENTS } from './calendarData';
import type { CalendarEvent } from './calendarData';
import { getCurrentUserName } from './session';
import type { AuditLogEntry } from './settingsData';

// ── Model ──
export type MassIntentionStatus = 'requested' | 'scheduled' | 'offered' | 'cancelled';
export type MassIntentionSource = 'office' | 'portal';

export interface MassIntention {
  id: string;
  intention: string;
  requestedBy?: string;
  contact?: string;
  /** Stipend in pesos. */
  stipend?: number;
  /** Date the intention was received (YYYY-MM-DD). */
  dateRequested: string;
  /** Date the donor asked for, if any (YYYY-MM-DD) — used to preselect scheduling. */
  preferredDate?: string;
  massDate?: string;
  /** HH:MM, 24h. */
  massTime?: string;
  calendarEventId?: string;
  celebrant?: string;
  status: MassIntentionStatus;
  source: MassIntentionSource;
  notes?: string;
  /** Set when the intention is marked offered (YYYY-MM-DD). */
  dateOffered?: string;
  /** Set once the stipend has been posted to the ledger (idempotency flag). */
  stipendRecorded?: boolean;
  stipendJournalId?: string;
}

// Short key under the parish namespace, resolved through storageNamespaced —
// same pattern as icsGenerator's 'mass_schedule' and RegistryPage's
// 'certificate_templates'.
export const MASS_INTENTIONS_KEY = 'mass_intentions';

// ── Small helpers ──
function genId(): string {
  return `mi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Local (not UTC) date — toISOString() lands a day off on UTC+ timezones. */
export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const cleanStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const isISODate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Positive finite pesos rounded to centavos, else undefined. */
function cleanStipend(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
    ? Math.round(v * 100) / 100
    : undefined;
}

/** "06:00" / "6:00 AM" → "HH:MM" 24h (mirrors icsGenerator's normalizeTime). */
export function to24h(time: string): string {
  const match = /(\d+):(\d+)\s*(AM|PM)/i.exec(time || '');
  if (!match) return time || '';
  let h = parseInt(match[1], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${match[2]}`;
}

/** "18:30" → "6:30 PM" for display / the printed register. */
export function to12h(time24: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(time24 || '');
  if (!match) return time24 || '';
  const h = parseInt(match[1], 10);
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${match[2]} ${period}`;
}

// ── Register store (CRUD) ──
export function getIntentions(): MassIntention[] {
  const list = getJSON<MassIntention[]>(MASS_INTENTIONS_KEY, []);
  return Array.isArray(list) ? list.filter((i) => i && typeof i.id === 'string') : [];
}

export function saveIntentions(list: MassIntention[]): boolean {
  return setJSON(MASS_INTENTIONS_KEY, list);
}

/**
 * Audit trail — SAME 'audit_log' key + entry shape FinancePage.appendFinanceAudit
 * writes, so intention actions show up in the Settings audit view alongside
 * finance ones.
 */
function appendIntentionAudit(action: string, recordId: string, details: string, table = 'Intentions'): void {
  const log = getJSON<AuditLogEntry[]>('audit_log', []);
  const entry: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    user: getCurrentUserName(),
    action,
    table,
    recordId,
    details,
    ipAddress: 'local',
  };
  setJSON('audit_log', [entry, ...log]);
}

// ── SHARED CONTRACT: portal/office intake ──
export interface IntentionRequestInput {
  intention: string;
  requestedBy?: string;
  contact?: string;
  preferredDate?: string;
  source: 'portal' | 'office';
  /** Office-side extras — the portal contract never sends these. */
  stipend?: number;
  notes?: string;
}

/**
 * Append a new intention to the register and return it. Defensive against
 * missing/malformed fields: portal input is untrusted, so everything except
 * a well-formed intention text degrades to "absent" instead of throwing.
 */
export function addIntentionFromRequest(input: IntentionRequestInput): MassIntention {
  const entry: MassIntention = {
    id: genId(),
    intention: cleanStr(input?.intention) ?? '(no intention text provided)',
    requestedBy: cleanStr(input?.requestedBy),
    contact: cleanStr(input?.contact),
    stipend: cleanStipend(input?.stipend),
    dateRequested: todayISO(),
    preferredDate: isISODate(input?.preferredDate) ? input.preferredDate : undefined,
    status: 'requested',
    source: input?.source === 'portal' ? 'portal' : 'office',
    notes: cleanStr(input?.notes),
  };
  saveIntentions([entry, ...getIntentions()]);
  appendIntentionAudit(
    'Created',
    entry.id,
    `Mass intention received (${entry.source})${entry.requestedBy ? ` from ${entry.requestedBy}` : ''} — "${entry.intention}"`,
  );
  return entry;
}

/** Patch an existing intention (id is immutable). Returns null when not found. */
export function updateIntention(id: string, patch: Partial<MassIntention>): MassIntention | null {
  const list = getIntentions();
  const idx = list.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  const updated: MassIntention = { ...list[idx], ...patch, id: list[idx].id };
  const next = [...list];
  next[idx] = updated;
  saveIntentions(next);
  return updated;
}

/** Assign the intention to a specific Mass. */
export function scheduleIntention(
  id: string,
  mass: { date: string; time: string; celebrant?: string; calendarEventId?: string },
): MassIntention | null {
  if (!isISODate(mass?.date)) return null;
  const updated = updateIntention(id, {
    massDate: mass.date,
    massTime: to24h(mass.time || ''),
    celebrant: cleanStr(mass.celebrant),
    calendarEventId: cleanStr(mass.calendarEventId),
    status: 'scheduled',
  });
  if (updated) {
    appendIntentionAudit('Scheduled', id,
      `Intention "${updated.intention}" scheduled for Mass on ${mass.date} ${to12h(updated.massTime || '')}${updated.celebrant ? ` (${updated.celebrant})` : ''}`);
  }
  return updated;
}

/** Record that the Mass was actually offered for this intention. */
export function markIntentionOffered(id: string, dateOffered?: string): MassIntention | null {
  const updated = updateIntention(id, {
    status: 'offered',
    dateOffered: isISODate(dateOffered) ? dateOffered : todayISO(),
  });
  if (updated) {
    appendIntentionAudit('Offered', id, `Intention "${updated.intention}" marked offered on ${updated.dateOffered}`);
  }
  return updated;
}

export function cancelIntention(id: string): MassIntention | null {
  const updated = updateIntention(id, { status: 'cancelled' });
  if (updated) {
    appendIntentionAudit('Cancelled', id, `Intention "${updated.intention}" cancelled`);
  }
  return updated;
}

// ── Stipend → Finance ──
export type RecordStipendResult =
  | { status: 'recorded'; entry: JournalEntry; intention: MassIntention }
  | { status: 'already_recorded' | 'not_found' | 'no_stipend' };

/**
 * Post the intention's stipend to the ledger as a balanced Posted journal
 * entry (Dr 1000 Cash on Hand / Cr 4100 Donations — stipends are always below
 * the ₱100k approval threshold, so no approval routing). Idempotent: the
 * stipendRecorded flag plus a reference scan of the journal guarantee at most
 * one entry per intention even across stale UI state.
 */
export function recordStipendForIntention(id: string, postedBy?: string): RecordStipendResult {
  const target = getIntentions().find((i) => i.id === id);
  if (!target) return { status: 'not_found' };
  const stipend = cleanStipend(target.stipend);
  if (!stipend) return { status: 'no_stipend' };

  // Seed matches FinancePage's usePersistedState default, so posting a stipend
  // before Finance has ever persisted doesn't replace the book with one row.
  const journal = getJSON<JournalEntry[]>(KEYS.journalEntries, JOURNAL_SEED);
  const reference = `MI-${target.id}`;
  if (target.stipendRecorded || journal.some((e) => e && e.reference === reference)) {
    return { status: 'already_recorded' };
  }

  const entry: JournalEntry = {
    id: `JV-MI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: todayISO(),
    reference,
    description: `Mass intention stipend — "${target.intention}"${target.requestedBy ? ` (${target.requestedBy})` : ''}`,
    lines: [
      { accountCode: '1000', accountName: 'Cash on Hand', debit: stipend, credit: 0 },
      { accountCode: '4100', accountName: 'Donations', debit: 0, credit: stipend },
    ],
    status: 'Posted',
    postedBy: postedBy || getCurrentUserName(),
    totalDr: stipend,
    totalCr: stipend,
  };
  setJSON(KEYS.journalEntries, [entry, ...journal]);

  const intention =
    updateIntention(id, { stipendRecorded: true, stipendJournalId: entry.id })
    ?? { ...target, stipendRecorded: true, stipendJournalId: entry.id };
  appendIntentionAudit('Created', entry.id,
    `Posted Mass-intention stipend ${formatPeso(stipend)} — "${target.intention}" (${reference})`, 'Finance');
  return { status: 'recorded', entry, intention };
}

// ── Upcoming Masses (for the "schedule" picker) ──
export interface UpcomingMass {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM 24h
  title: string;
  celebrant?: string;
  calendarEventId?: string;
  location?: string;
}

interface MassScheduleSlot { day: string; time: string; type: string }

// Same short key + fallback icsGenerator uses (kept in lockstep — the default
// there isn't exported), so the picker agrees with the priest-schedule export.
const MASS_SCHEDULE_KEY = 'mass_schedule';
const DEFAULT_MASS_SCHEDULE: MassScheduleSlot[] = [
  { day: 'Sunday', time: '6:00 AM', type: 'Solemn Mass' },
  { day: 'Sunday', time: '8:00 AM', type: 'Solemn Mass' },
  { day: 'Sunday', time: '10:00 AM', type: 'Solemn Mass' },
  { day: 'Sunday', time: '5:00 PM', type: 'Solemn Mass' },
  { day: 'Monday', time: '6:00 AM', type: 'Daily Mass' },
  { day: 'Tuesday', time: '6:00 AM', type: 'Daily Mass' },
  { day: 'Wednesday', time: '6:00 AM', type: 'Daily Mass' },
  { day: 'Thursday', time: '6:00 AM', type: 'Daily Mass' },
  { day: 'Friday', time: '6:00 AM', type: 'Daily Mass' },
  { day: 'Saturday', time: '6:00 AM', type: 'Daily Mass' },
];

const DAY_MAP: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

/**
 * Concrete Masses in the next `daysAhead` days: explicit calendar Mass events
 * (which carry a celebrant and an event id) take precedence, then the
 * recurring parish mass schedule fills the remaining date+time slots.
 * `data` lets callers/tests inject live data instead of reading the seam.
 */
export function getUpcomingMasses(
  daysAhead = 30,
  data?: { events?: CalendarEvent[]; schedule?: MassScheduleSlot[]; from?: Date },
): UpcomingMass[] {
  const from = data?.from ? new Date(data.from) : new Date();
  from.setHours(0, 0, 0, 0);
  const end = new Date(from);
  end.setDate(end.getDate() + daysAhead);

  const bySlot = new Map<string, UpcomingMass>();

  const events = data?.events ?? getJSON<CalendarEvent[]>(KEYS.calendarEvents, SAMPLE_EVENTS);
  for (const evt of Array.isArray(events) ? events : []) {
    if (!evt || evt.type !== 'Mass' || !isISODate(evt.date)) continue;
    const d = new Date(evt.date + 'T00:00:00');
    if (d < from || d > end) continue;
    const time = to24h(evt.startTime || '06:00');
    bySlot.set(`${evt.date}T${time}`, {
      date: evt.date,
      time,
      title: evt.title || 'Mass',
      celebrant: evt.officiant,
      calendarEventId: evt.id,
      location: evt.location,
    });
  }

  const schedule = data?.schedule ?? getJSON<MassScheduleSlot[]>(MASS_SCHEDULE_KEY, DEFAULT_MASS_SCHEDULE);
  for (const slot of Array.isArray(schedule) ? schedule : []) {
    const dow = DAY_MAP[slot?.day];
    if (dow === undefined) continue;
    const time = to24h(slot.time || '06:00');
    const d = new Date(from);
    while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
    for (; d <= end; d.setDate(d.getDate() + 7)) {
      const date = localISO(d);
      const key = `${date}T${time}`;
      if (!bySlot.has(key)) {
        bySlot.set(key, { date, time, title: slot.type || 'Mass' });
      }
    }
  }

  return [...bySlot.values()].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}
