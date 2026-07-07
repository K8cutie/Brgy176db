// ═══════════════════════════════════════════════════════════
// Mass Attendance — headcounts recorded per calendar event
//
// Persisted through the namespaced storage seam (KEYS.attendance)
// so the Calendar sidebar summary and the diocese packet's
// attendance_summary scope read the exact same dataset.
// ═══════════════════════════════════════════════════════════

import * as ns from './storageNamespaced';
import { KEYS } from './storageKeys';
import { todayISO } from './massIntentions';

export interface AttendanceRecord {
  id: string;
  /** Calendar event this headcount belongs to. */
  eventId: string;
  eventTitle: string;
  /** Event date, local YYYY-MM-DD. */
  date: string;
  /** People counted — whole, non-negative. */
  count: number;
  /** When the count was recorded (ISO timestamp). */
  recordedAt: string;
}

const isISODate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function genId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** All headcount records (seed fallback: empty list, never throws). */
export function listAttendance(): AttendanceRecord[] {
  return ns.getJSON<AttendanceRecord[]>(KEYS.attendance, []);
}

/** The recorded headcount for one calendar event, if any. */
export function getHeadcountForEvent(eventId: string): AttendanceRecord | undefined {
  return listAttendance().find((r) => r.eventId === eventId);
}

/**
 * A single Mass cannot plausibly seat more than this. A fat-fingered figure
 * (e.g. 250,000,000) would otherwise poison every aggregate and the diocese
 * packet, so counts above the ceiling are rejected rather than stored.
 */
export const MAX_HEADCOUNT = 100000;

/**
 * Record (or correct) the headcount for a calendar event.
 * One count per event — re-recording replaces the previous value.
 * Returns null on invalid input (negative / non-finite count, or above MAX_HEADCOUNT).
 */
export function recordHeadcount(input: {
  eventId: string;
  eventTitle: string;
  date?: string;
  count: number;
}): AttendanceRecord | null {
  const count = Math.floor(Number(input.count));
  if (!input.eventId || !Number.isFinite(count) || count < 0 || count > MAX_HEADCOUNT) return null;

  const record: AttendanceRecord = {
    id: genId(),
    eventId: input.eventId,
    eventTitle: input.eventTitle || 'Mass',
    date: isISODate(input.date) ? input.date : todayISO(),
    count,
    recordedAt: new Date().toISOString(),
  };

  const records = listAttendance();
  const idx = records.findIndex((r) => r.eventId === input.eventId);
  const next = idx >= 0
    ? records.map((r, i) => (i === idx ? { ...record, id: r.id } : r))
    : [...records, record];
  ns.setJSON(KEYS.attendance, next);
  return idx >= 0 ? { ...record, id: records[idx].id } : record;
}

export interface AttendanceSummary {
  eventsCounted: number;
  totalHeadcount: number;
  averageHeadcount: number;
  /** Totals per month, keyed YYYY-MM. */
  byMonth: Record<string, { events: number; total: number }>;
}

/**
 * Aggregate summary — privacy-safe (counts only, no names).
 *
 * `liveEventIds`, when supplied, is the set of calendar-event ids that still
 * exist; records whose event has been hard-deleted are skipped so an orphaned
 * headcount can't silently inflate the sidebar summary or the diocese packet.
 * Omitting it keeps back-compat (every record counts).
 *
 * Defensive: a malformed record (e.g. a corrupt blob without a string `date`)
 * is skipped rather than allowed to throw — one bad record must not blank the
 * whole summary (this is also read from aiContext's outer try/catch).
 */
export function getAttendanceSummary(
  records: AttendanceRecord[] = listAttendance(),
  liveEventIds?: ReadonlySet<string>,
): AttendanceSummary {
  const byMonth: AttendanceSummary['byMonth'] = {};
  let total = 0;
  let counted = 0;
  for (const r of records) {
    if (!r || typeof r.date !== 'string' || !Number.isFinite(r.count)) continue;
    if (liveEventIds && !liveEventIds.has(r.eventId)) continue; // event was deleted
    counted += 1;
    total += r.count;
    const month = r.date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { events: 0, total: 0 };
    byMonth[month].events += 1;
    byMonth[month].total += r.count;
  }
  return {
    eventsCounted: counted,
    totalHeadcount: total,
    averageHeadcount: counted > 0 ? Math.round(total / counted) : 0,
    byMonth,
  };
}

/**
 * Cascade-remove the headcount(s) for a deleted calendar event. Calendar events
 * have no soft-delete, so when an event is hard-deleted its attendance record
 * must be dropped too — otherwise the count persists and inflates the summary
 * and the diocese attendance_summary. Returns the number of records removed.
 */
export function removeAttendanceForEvent(eventId: string): number {
  if (!eventId) return 0;
  const records = listAttendance();
  const next = records.filter((r) => r.eventId !== eventId);
  if (next.length === records.length) return 0; // nothing to remove
  ns.setJSON(KEYS.attendance, next);
  return records.length - next.length;
}

/** Most recent headcounts first (by recording time). */
export function recentAttendance(limit = 5, records: AttendanceRecord[] = listAttendance()): AttendanceRecord[] {
  return [...records]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, limit);
}
