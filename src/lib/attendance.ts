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
 * Record (or correct) the headcount for a calendar event.
 * One count per event — re-recording replaces the previous value.
 * Returns null on invalid input (negative / non-finite count).
 */
export function recordHeadcount(input: {
  eventId: string;
  eventTitle: string;
  date?: string;
  count: number;
}): AttendanceRecord | null {
  const count = Math.floor(Number(input.count));
  if (!input.eventId || !Number.isFinite(count) || count < 0) return null;

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

/** Aggregate summary — privacy-safe (counts only, no names). */
export function getAttendanceSummary(records: AttendanceRecord[] = listAttendance()): AttendanceSummary {
  const byMonth: AttendanceSummary['byMonth'] = {};
  let total = 0;
  for (const r of records) {
    total += r.count;
    const month = r.date.slice(0, 7);
    if (!byMonth[month]) byMonth[month] = { events: 0, total: 0 };
    byMonth[month].events += 1;
    byMonth[month].total += r.count;
  }
  return {
    eventsCounted: records.length,
    totalHeadcount: total,
    averageHeadcount: records.length > 0 ? Math.round(total / records.length) : 0,
    byMonth,
  };
}

/** Most recent headcounts first (by recording time). */
export function recentAttendance(limit = 5, records: AttendanceRecord[] = listAttendance()): AttendanceRecord[] {
  return [...records]
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    .slice(0, limit);
}
