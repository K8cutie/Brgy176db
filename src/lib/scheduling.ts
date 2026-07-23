// ═══════════════════════════════════════════════════════════
// Scheduling — the booking conflict engine (pure, unit-testable)
//
// A booking holds a TIME WINDOW (start + duration) in a VENUE, with an
// OFFICIANT. Another calendar event is a CONFLICT when it is on the same
// date, its window OVERLAPS, AND it shares the same VENUE or the same
// OFFICIANT. Checked against ALL calendar events (Masses, ministries,
// every sacrament), not just weddings.
//
//  • One-venue parish  → everything shares the single venue, so ANY
//    overlap conflicts.
//  • Multi-venue parish → two ceremonies may run at once in different
//    venues, UNLESS they share the same priest.
//
// This module has NO storage/UI dependencies — it takes events in and
// returns conflicts out — so the whole rule set is exercised by
// scheduling.test.ts. Liturgical checks reuse lib/liturgicalCalendar.ts.
// ═══════════════════════════════════════════════════════════

import { isDuringLent, isTriduum, getLiturgicalDay, lentRange, formatLiturgicalDate } from './liturgicalCalendar';
import type { Venue } from './venues';

/* ── Default booking durations (minutes), editable per booking ── */
export const SACRAMENT_DURATIONS: Record<string, number> = {
  wedding: 90,
  baptism: 45,
  death: 60,
  funeral: 60,
  confirmation: 60,
  default: 60,
};

/** Default duration for a sacrament/event kind (falls back to 60). Case-insensitive. */
export function durationFor(kind?: string): number {
  if (!kind) return SACRAMENT_DURATIONS.default;
  const k = kind.trim().toLowerCase();
  return SACRAMENT_DURATIONS[k] ?? SACRAMENT_DURATIONS.default;
}

/* ═══════════════════════════════════════════════════════════
   TIME PARSING
   ═══════════════════════════════════════════════════════════ */

/**
 * Parse a clock time to minutes-from-midnight. Tolerant of:
 *   '14:00', '2:00 PM', '10:00 AM', '9 AM', '9:30', '2pm', '12:00 AM'.
 * Returns null when the string cannot be understood.
 */
export function parseTimeToMinutes(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === '') return null;

  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;

  let hours = parseInt(m[1], 10);
  const minutes = m[2] != null ? parseInt(m[2], 10) : 0;
  const mer = m[3];

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (minutes > 59) return null;

  if (mer) {
    // 12-hour clock
    if (hours < 1 || hours > 12) return null;
    if (mer === 'pm' && hours !== 12) hours += 12;
    if (mer === 'am' && hours === 12) hours = 0;
  } else {
    // 24-hour clock
    if (hours > 23) return null;
  }
  return hours * 60 + minutes;
}

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

/** A candidate slot being validated (the booking-in-progress). */
export interface ScheduledSlot {
  date: string;        // YYYY-MM-DD
  startMin: number;    // minutes from midnight
  durationMin: number; // window length in minutes
  venueId?: string;    // venue id OR a venue name/location token (see venue matching)
  officiant?: string;
  /** When editing an existing record, its own event id — excluded from conflicts. */
  excludeId?: string;
}

/** A normalized, comparable busy window derived from a calendar event. */
export interface BusyInterval {
  id: string;
  date: string;
  start: number; // minutes from midnight
  end: number;   // minutes from midnight (exclusive)
  venueId?: string;
  location?: string;
  officiant?: string;
  title: string;
}

/** Loosely-typed calendar event — this engine only reads a few fields and
 *  tolerates the app's two shapes (`time` or `startTime`/`endTime`). */
export interface CalendarEventLike {
  id?: string;
  title?: string;
  date?: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  durationMin?: number;
  venueId?: string;
  location?: string;
  officiant?: string;
  type?: string;
  [k: string]: unknown;
}

/* ═══════════════════════════════════════════════════════════
   NORMALIZATION
   ═══════════════════════════════════════════════════════════ */

/**
 * Map calendar events to comparable busy windows. Reads the event's `time`
 * (or legacy `startTime`); a window's length comes from `endTime` when
 * present, else `durationMin`, else a 60-minute default. Events with no
 * parseable time are skipped (they can't participate in a time conflict).
 */
export function toBusyIntervals(events: CalendarEventLike[]): BusyInterval[] {
  const out: BusyInterval[] = [];
  for (const e of events || []) {
    if (!e || !e.date) continue;
    const start = parseTimeToMinutes(e.time ?? e.startTime);
    if (start == null) continue;

    let end: number | null = null;
    const parsedEnd = parseTimeToMinutes(e.endTime);
    if (parsedEnd != null && parsedEnd > start) {
      end = parsedEnd;
    } else if (typeof e.durationMin === 'number' && e.durationMin > 0) {
      end = start + e.durationMin;
    } else {
      end = start + SACRAMENT_DURATIONS.default;
    }

    out.push({
      id: (e.id as string) ?? `${e.date}-${start}-${out.length}`,
      date: e.date,
      start,
      end,
      venueId: e.venueId,
      location: e.location,
      officiant: e.officiant,
      title: e.title ?? '',
    });
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════
   CONFLICT DETECTION
   ═══════════════════════════════════════════════════════════ */

function norm(s?: string): string {
  return (s ?? '').trim().toLowerCase();
}

/** Do two half-open windows [aStart,aEnd) and [bStart,bEnd) overlap? */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * A candidate venue token matches a busy interval's venue when it equals the
 * interval's venueId OR its location string. This lets an id-based new booking
 * and a legacy location-named event ('Main Church') both be compared.
 */
function sameVenue(candidateVenue: string | undefined, busy: BusyInterval): boolean {
  const c = norm(candidateVenue);
  if (c === '') return false;
  return c === norm(busy.venueId) || c === norm(busy.location);
}

function sameOfficiant(candidateOfficiant: string | undefined, busy: BusyInterval): boolean {
  const c = norm(candidateOfficiant);
  if (c === '') return false;
  return c === norm(busy.officiant);
}

/**
 * The events that conflict with `candidate`: same date, overlapping window,
 * AND sharing the venue OR the officiant. An event whose id === candidate.excludeId
 * is skipped (so editing a record doesn't conflict with itself).
 */
export function findConflicts(candidate: ScheduledSlot, events: CalendarEventLike[]): BusyInterval[] {
  const start = candidate.startMin;
  const end = candidate.startMin + candidate.durationMin;
  const busy = toBusyIntervals(events);

  return busy.filter((b) => {
    if (candidate.excludeId != null && b.id === candidate.excludeId) return false;
    if (b.date !== candidate.date) return false;
    if (!overlaps(start, end, b.start, b.end)) return false;
    return sameVenue(candidate.venueId, b) || sameOfficiant(candidate.officiant, b);
  });
}

/** Convenience: does the candidate hard-conflict with any event? */
export function hasConflict(candidate: ScheduledSlot, events: CalendarEventLike[]): boolean {
  return findConflicts(candidate, events).length > 0;
}

/* ═══════════════════════════════════════════════════════════
   FREE-VENUE SUGGESTIONS (multi-venue parishes)
   ═══════════════════════════════════════════════════════════ */

export interface VenueSuggestion {
  venue: Venue;
  /** Whether the venue is big enough for the expected guests. Unknown guests
   *  (null) or an uncapped venue (capacity 0) are always considered to fit. */
  fits: boolean;
}

/**
 * The venues with NO conflict at the candidate's slot (same officiant still
 * conflicts everywhere — a double-booked priest frees no venue). Each is
 * flagged with capacity `fits`; fitting venues are returned before too-small
 * ones. Only active venues are offered.
 */
export function suggestFreeVenues(
  candidate: ScheduledSlot,
  venues: Venue[],
  events: CalendarEventLike[],
  expectedGuests?: number | null,
): VenueSuggestion[] {
  const free: VenueSuggestion[] = [];
  for (const v of venues) {
    if (!v.active) continue;
    // Test the venue by each of its identifying tokens so both id-based and
    // location-named events are caught.
    const tokens = [v.id, v.name, v.location].filter((t): t is string => !!t && t.trim() !== '');
    const conflicted = tokens.some(
      (t) => findConflicts({ ...candidate, venueId: t }, events).length > 0,
    );
    if (conflicted) continue;
    const fits = expectedGuests == null || v.capacity === 0 || v.capacity >= expectedGuests;
    free.push({ venue: v, fits });
  }
  // Fitting venues first; preserve input order within each group.
  free.sort((a, b) => Number(b.fits) - Number(a.fits));
  return free;
}

/* ═══════════════════════════════════════════════════════════
   LITURGICAL ADVISORY (reuses lib/liturgicalCalendar.ts)
   ═══════════════════════════════════════════════════════════
   NOTE: the Save HARD-BLOCK is driven purely by TIME/VENUE/OFFICIANT
   conflicts above. This is an advisory layer built on the parish's
   existing computus (isDuringLent / isTriduum) — NOT a reinvented
   Easter calculation. The UI may surface `note` as a caution.
*/
export function isLiturgicallyBlocked(
  dateStr: string,
  sacrament?: string,
): { blocked: boolean; note: string } {
  const kind = norm(sacrament);

  // The Easter Triduum blocks every sacrament celebration.
  if (isTriduum(dateStr)) {
    const lit = getLiturgicalDay(dateStr);
    return {
      blocked: true,
      note: `${lit?.name ?? 'Easter Triduum'} — sacrament celebrations are not scheduled during the Easter Triduum.`,
    };
  }

  // Weddings are prohibited during Lent (Ash Wednesday → Holy Saturday).
  if ((kind === 'wedding' || kind === 'marriage') && isDuringLent(dateStr)) {
    const range = lentRange(parseInt(dateStr.slice(0, 4), 10));
    return {
      blocked: true,
      note: `Weddings are prohibited during Lent — Ash Wednesday (${formatLiturgicalDate(range.start)}) to Holy Saturday (${formatLiturgicalDate(range.end)}).`,
    };
  }

  // A solemnity is not a hard block, but parish Masses take priority — advise.
  const lit = getLiturgicalDay(dateStr);
  if (lit && lit.rank === 'solemnity') {
    return {
      blocked: false,
      note: `${formatLiturgicalDate(dateStr)} is ${lit.name} (solemnity) — parish Masses take priority; please confirm with the parish office.`,
    };
  }

  return { blocked: false, note: '' };
}
