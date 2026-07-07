// .ics (iCal) calendar file generator for priest phone sync
// Produces standard RFC 5545 output that imports into iPhone/Android calendars

import { getParishConfig, getPriestName } from './parishConfig';
import { getJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';
import { SAMPLE_EVENTS } from './calendarData';
import type { CalendarEvent } from './calendarData';
import { baptismRecords, marriageRecords, confirmationRecords, deathRecords } from './registryData';
import { getFeeForSacrament } from './feeSchedule';

export interface PriestScheduleEvent {
  title: string;
  date: string;        // YYYY-MM-DD
  startTime: string;   // HH:MM (24h)
  endTime: string;     // HH:MM (24h)
  location: string;
  description: string;
  type: string;
  uid?: string;
}

// Registry rows are read defensively field-by-field, so a loose shape suffices.
type RegistryRecord = Record<string, unknown>;
export type SacramentTable = 'baptism' | 'marriage' | 'confirmation' | 'death';

/**
 * Live data for the generator. Callers that already hold the data (e.g.
 * CalendarPage's persisted events) pass it here; anything not provided is
 * read through the parish-namespaced storage seam with the same seeds the
 * pages use. Bare localStorage keys are never read.
 */
export interface PriestScheduleData {
  events?: CalendarEvent[];
  massSchedule?: MassTime[];
  registryRecords?: Partial<Record<SacramentTable, RegistryRecord[]>>;
}

/* ── Mass schedule from parish config ── */
export interface MassTime {
  day: string;       // e.g. "Sunday", "Monday"
  time: string;      // e.g. "6:00 AM"
  type: string;      // e.g. "Solemn Mass", "Daily Mass"
}

const DEFAULT_MASS_SCHEDULE: MassTime[] = [
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

// Short key under the parish namespace (listed in parishIdentity's
// migrateToNamespacedStorage key set).
const MASS_SCHEDULE_KEY = 'mass_schedule';

function getMassSchedule(): MassTime[] {
  return getJSON<MassTime[]>(MASS_SCHEDULE_KEY, DEFAULT_MASS_SCHEDULE);
}

/* ── Normalize "9:00 AM" style times to 24h "09:00" ── */
function normalizeTime(time: string): string {
  return /am|pm/i.test(time) ? convertTo24h(time) : time;
}

/* ── Day name to number (0=Sunday) ── */
const DAY_MAP: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
};

/* ── Escape special chars for ICS ── */
function icsEscape(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/* ── Format date to ICS DTSTART/DTEND (UTC) ── */
function icsDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const d = new Date(year, month - 1, day, hour, minute);
  // Format: YYYYMMDDTHHMMSSZ
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/* ── Generate all dates for a recurring day within a range ── */
function getDatesForDay(dayName: string, startDate: Date, endDate: Date): Date[] {
  const targetDay = DAY_MAP[dayName];
  if (targetDay === undefined) return [];
  const dates: Date[] = [];
  const d = new Date(startDate);
  // Move to first occurrence of target day
  while (d.getDay() !== targetDay) {
    d.setDate(d.getDate() + 1);
  }
  while (d <= endDate) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

/* ── Parse HH:MM and add duration ── */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(2000, 0, 1, h, m + minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ── Build VEVENT block ── */
function buildVEvent(event: PriestScheduleEvent): string {
  const uid = event.uid || `churchos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@churchos.local`;
  const dtStart = icsDateTime(event.date, event.startTime);
  const dtEnd = icsDateTime(event.date, event.endTime);
  const config = getParishConfig();

  const lines: string[] = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(event.title)}`,
    `LOCATION:${icsEscape(event.location || config.parishName)}`,
    `DESCRIPTION:${icsEscape(event.description)}`,
    'STATUS:CONFIRMED',
    `CREATED:${icsDateTime(new Date().toISOString().split('T')[0], '00:00:00')}`,
    'END:VEVENT',
  ];
  return lines.join('\r\n');
}

/* ═══════════════════════════════════════════════════════════
   PUBLIC: Generate .ics string for priest schedule
   ═══════════════════════════════════════════════════════════ */

export interface PriestScheduleOptions {
  days: number;              // How many days ahead (default 30)
  includeMass: boolean;      // Include regular Mass schedule
  includeSacraments: boolean;// Include sacrament ceremonies
  includeEvents: boolean;    // Include parish events
  priestName?: string;       // Filter by priest (default: current parish priest)
}

export function generatePriestIcs(opts: PriestScheduleOptions, data?: PriestScheduleData): string {
  const config = getParishConfig();
  const priestName = opts.priestName || getPriestName();
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(now.getDate() + (opts.days || 30));

  const events: PriestScheduleEvent[] = [];

  /* ── 1. Mass Schedule (recurring) ── */
  if (opts.includeMass) {
    const massSchedule = data?.massSchedule ?? getMassSchedule();
    for (const mass of massSchedule) {
      const start = normalizeTime(mass.time);
      const dates = getDatesForDay(mass.day, now, endDate);
      for (const d of dates) {
        const dateStr = d.toISOString().split('T')[0];
        events.push({
          title: `${mass.type} — ${config.parishShortName}`,
          date: dateStr,
          startTime: start,
          endTime: addMinutes(start, 60),
          location: config.parishName,
          description: `Presider: ${priestName}\nType: ${mass.type}\nParish: ${config.parishName}`,
          type: 'Mass',
          uid: `churchos-mass-${mass.day}-${start.replace(':', '')}-${dateStr}@churchos.local`,
        });
      }
    }
  }

  /* ── 2. Sacrament Ceremonies from Registry ── */
  if (opts.includeSacraments) {
    // Seeds match RegistryPage's usePersistedState defaults, so the export
    // agrees with what the app shows before the registry is first persisted.
    const sacramentSources: { storageKey: string; label: string; feeKey: 'Baptism' | 'Marriage' | 'Confirmation' | 'Death'; table: SacramentTable; seed: RegistryRecord[] }[] = [
      { storageKey: KEYS.baptismRecords, label: 'Baptism', feeKey: 'Baptism', table: 'baptism', seed: baptismRecords as unknown as RegistryRecord[] },
      { storageKey: KEYS.marriageRecords, label: 'Marriage', feeKey: 'Marriage', table: 'marriage', seed: marriageRecords as unknown as RegistryRecord[] },
      { storageKey: KEYS.confirmationRecords, label: 'Confirmation', feeKey: 'Confirmation', table: 'confirmation', seed: confirmationRecords as unknown as RegistryRecord[] },
      { storageKey: KEYS.deathRecords, label: 'Burial', feeKey: 'Death', table: 'death', seed: deathRecords as unknown as RegistryRecord[] },
    ];

    for (const src of sacramentSources) {
      // Soft-deleted records (shared contract: optional isDeleted flag) must
      // not appear on the priest's schedule — same filter diocesePacket uses.
      const records = (data?.registryRecords?.[src.table]
        ?? getJSON<RegistryRecord[]>(src.storageKey, src.seed)).filter((r) => !r.isDeleted);
      for (const r of records) {
        const schedOff = (r.scheduledOfficiant as string) || (r.officiant as string);
        if (!schedOff || !schedOff.includes(priestName.split(' ').pop() || priestName)) continue;

        const schedDate = (r.scheduledDate as string) || (r.dateOfBaptism as string) || (r.dateOfMarriage as string) || (r.dateOfConfirmation as string) || (r.dateOfBurial as string);
        const schedTime = (r.scheduledTime as string) || '09:00';
        if (!schedDate) continue;

        // Only include future events within range
        const eventDate = new Date(schedDate + 'T00:00:00');
        if (eventDate < now || eventDate > endDate) continue;

        const personName = src.table === 'baptism'
          ? `${r.childFirstName || ''} ${r.childLastName || ''}`
          : src.table === 'marriage'
          ? `${r.groomFirstName || ''} ${r.groomLastName || ''} & ${r.brideFirstName || ''} ${r.brideLastName || ''}`
          : src.table === 'confirmation'
          ? `${r.confirmandFirstName || ''} ${r.confirmandLastName || ''}`
          : `${r.deceasedFirstName || ''} ${r.deceasedLastName || ''}`;

        const feeItem = getFeeForSacrament(src.feeKey);
        const fee = feeItem?.ceremonyFee || 0;

        const startTime = normalizeTime(schedTime);
        events.push({
          title: `${src.label}: ${personName.trim()}`,
          date: schedDate,
          startTime,
          endTime: addMinutes(startTime, src.table === 'marriage' ? 90 : src.table === 'death' ? 60 : 45),
          location: (r.scheduledLocation as string) || config.parishName,
          description: `Sacrament: ${src.label}\nCelebrant: ${schedOff}\nCandidate: ${personName.trim()}\nRegistry: ${r.registryNumber || 'N/A'}\nFee: ₱${fee.toLocaleString()}`,
          type: src.label,
          uid: `churchos-${src.table}-${r.id || r.registryNumber}@churchos.local`,
        });
      }
    }
  }

  /* ── 3. Calendar Events ── */
  if (opts.includeEvents) {
    const calEvents = data?.events ?? getJSON<CalendarEvent[]>(KEYS.calendarEvents, SAMPLE_EVENTS);
    for (const evt of calEvents) {
      if (evt.officiant && !evt.officiant.includes(priestName.split(' ').pop() || priestName)) continue;
      const eventDate = new Date(evt.date + 'T00:00:00');
      if (eventDate < now || eventDate > endDate) continue;
      events.push({
        title: evt.title,
        date: evt.date,
        startTime: evt.startTime,
        endTime: evt.endTime,
        location: evt.location,
        description: `${evt.description || ''}\nType: ${evt.type}\n${evt.officiant ? 'Officiant: ' + evt.officiant : ''}`,
        type: evt.type,
        uid: `churchos-cal-${evt.id}@churchos.local`,
      });
    }
  }

  /* ── Sort by date/time ── */
  events.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    return a.startTime.localeCompare(b.startTime);
  });

  /* ── Build .ics ── */
  const icalLines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChurchOS//Parish Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(`${config.parishShortName} — ${priestName}`)}`,
    `X-WR-TIMEZONE:${config.timezone}`,
  ];

  for (const evt of events) {
    icalLines.push(buildVEvent(evt));
  }

  icalLines.push('END:VCALENDAR');

  return icalLines.join('\r\n') + '\r\n';
}

/* ── Convert "9:00 AM" → "09:00" ── */
function convertTo24h(time12: string): string {
  const match = time12.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return time12;
  let h = parseInt(match[1]);
  const m = match[2];
  const period = match[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${m}`;
}

/* ═══════════════════════════════════════════════════════════
   Generate plain-text summary for WhatsApp/SMS copy-paste
   ═══════════════════════════════════════════════════════════ */

export function generateTextSummary(opts: PriestScheduleOptions, data?: PriestScheduleData): string {
  const config = getParishConfig();
  const priestName = opts.priestName || getPriestName();
  const ics = generatePriestIcs(opts, data);

  // Parse events from the .ics for text format
  const eventMatches = ics.match(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g) || [];

  if (eventMatches.length === 0) {
    return `${config.parishShortName} Schedule\n${priestName}\nNo upcoming events for the selected period.`;
  }

  const lines: string[] = [
    `📅 ${config.parishShortName}`,
    `👤 ${priestName}`,
    `📍 ${config.addressCity}, ${config.addressProvince}`,
    `---`,
  ];

  let lastDate = '';

  for (const block of eventMatches.slice(0, 30)) { // limit to 30 events for SMS
    const summaryMatch = block.match(/SUMMARY:(.+)/);
    const dtStartMatch = block.match(/DTSTART:(\d{8})T(\d{4})/);
    const locationMatch = block.match(/LOCATION:(.+)/);

    if (!summaryMatch || !dtStartMatch) continue;

    const dateStr = `${dtStartMatch[1].slice(0, 4)}-${dtStartMatch[1].slice(4, 6)}-${dtStartMatch[1].slice(6, 8)}`;
    const timeStr = `${dtStartMatch[2].slice(0, 2)}:${dtStartMatch[2].slice(2, 4)}`;
    const d = new Date(dateStr + 'T00:00:00');
    const dateLabel = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });

    if (dateStr !== lastDate) {
      lines.push('');
      lines.push(`${dateLabel}:`);
      lastDate = dateStr;
    }

    const time12 = convertTo12h(timeStr);
    const title = summaryMatch[1].replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ');
    const loc = locationMatch ? locationMatch[1].replace(/\\,/g, ',') : '';

    lines.push(`  ${time12} — ${title}${loc ? ' @ ' + loc : ''}`);
  }

  return lines.join('\n');
}

function convertTo12h(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/* ═══════════════════════════════════════════════════════════
   Download helper — triggers browser download of .ics file
   ═══════════════════════════════════════════════════════════ */

export function downloadIcs(icsContent: string, filename?: string) {
  const config = getParishConfig();
  const priestName = getPriestName();
  const safeName = (filename || `${config.parishShortName}-${priestName.split(' ').join('-')}-schedule`).replace(/[^a-zA-Z0-9-]/g, '');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
