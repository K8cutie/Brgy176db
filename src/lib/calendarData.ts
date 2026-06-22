export type EventType = 'Mass' | 'Baptism' | 'Wedding' | 'Confirmation' | 'Death' | 'Ministry' | 'SSDM' | 'General';

export interface CalendarEvent {
  id: string;
  title: string;
  type: EventType;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24h)
  endTime: string;
  location: string;
  officiant?: string;
  description?: string;
  isPublic: boolean;
  recurring?: boolean;
  // --- NEW: Sacrament linkage ---
  sacramentRecordId?: string;       // links to registry record
  sacramentRecordType?: 'baptism' | 'marriage' | 'confirmation' | 'death';
  sacramentSummary?: string;        // e.g., "Garcia, Candice Marie"
  // --- NEW: Scheduling rules info ---
  ruleEnforced?: boolean;           // whether this event was created with rule enforcement
  ruleNotes?: string;               // e.g., "Saturday preferred", "Not during Lent"
}

export const EVENT_COLORS: Record<EventType, { bg: string; border: string; text: string; bgOpacity: string }> = {
  Mass:           { bg: '#3B6BC9', border: '#3B6BC9', text: '#FFFFFF', bgOpacity: 'rgba(59,107,201,0.12)' },
  Baptism:        { bg: '#2D6A4F', border: '#2D6A4F', text: '#FFFFFF', bgOpacity: 'rgba(45,106,79,0.12)' },
  Wedding:        { bg: '#6B2737', border: '#6B2737', text: '#FFFFFF', bgOpacity: 'rgba(107,39,55,0.12)' },
  Confirmation:   { bg: '#14B8A6', border: '#0D9488', text: '#FFFFFF', bgOpacity: 'rgba(20,184,166,0.12)' },
  Death:          { bg: '#78716C', border: '#57534E', text: '#FFFFFF', bgOpacity: 'rgba(120,113,108,0.12)' },
  Ministry:       { bg: '#C9963B', border: '#C9963B', text: '#FFFFFF', bgOpacity: 'rgba(201,150,59,0.12)' },
  SSDM:           { bg: '#5B3A73', border: '#5B3A73', text: '#FFFFFF', bgOpacity: 'rgba(91,58,115,0.12)' },
  General:        { bg: '#8C8374', border: '#8C8374', text: '#FFFFFF', bgOpacity: 'rgba(140,131,116,0.12)' },
};

export const LOCATIONS = ['Main Church', 'Baptistry', 'Rectory', 'Parish Hall', 'Chapel', 'Cemetery'] as const;

export const PRIESTS = [
  { name: 'Fr. Reyes',  avatar: 'FR' },
  { name: 'Fr. Santos', avatar: 'FS' },
  { name: 'Fr. Cruz',   avatar: 'FC' },
] as const;

function fmtDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/* ═══════════════════════════════════════════════════════════════════
   BUSINESS RULES for sacrament scheduling
   ═══════════════════════════════════════════════════════════════════ */

export const SCHEDULING_RULES = {
  baptism: {
    allowedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    blockedDays: ['Sunday'],
    allowedTimes: ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'],
    locations: ['Baptistry', 'Main Church'],
    notes: 'Baptisms held Monday–Saturday, 9:00 AM – 3:00 PM. Not on Sundays.',
  },
  wedding: {
    allowedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    preferredDays: ['Saturday'],
    blockedPeriods: [{ name: 'Lent', start: '02-14', end: '04-05' }], // Ash Wed to Holy Saturday (approx)
    allowedTimes: ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'],
    locations: ['Main Church', 'Parish Hall'],
    notes: 'Saturdays preferred. Weddings prohibited during Lent (Ash Wednesday to Holy Saturday).',
  },
  confirmation: {
    allowedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    blockedDays: ['Sunday'],
    allowedTimes: ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00'],
    locations: ['Main Church'],
    notes: 'Confirmations held Monday–Saturday, 9:00 AM – 3:00 PM. Not on Sundays.',
  },
  death: {
    allowedDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    allowedTimes: ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'],
    locations: ['Main Church', 'Cemetery'],
    notes: 'Burial services may be held any day including Sundays.',
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════
   SAMPLE EVENTS  (30+ events with sacrament linkage)
   ═══════════════════════════════════════════════════════════════════ */

export const SAMPLE_EVENTS: CalendarEvent[] = [
  /* ── Daily weekday Masses (6AM, 6PM) — May ── */
  ...[1,2,4,5,6,7,8,9,11,12,13,14,15].flatMap(d => [
    { id: `m${d}a`, title: 'Daily Mass', type: 'Mass' as EventType, date: fmtDate(2026,5,d), startTime: '06:00', endTime: '07:00', location: 'Main Church', officiant: 'Fr. Reyes', description: 'Morning Mass', isPublic: true, recurring: true },
    { id: `m${d}p`, title: 'Evening Mass', type: 'Mass' as EventType, date: fmtDate(2026,5,d), startTime: '18:00', endTime: '19:00', location: 'Main Church', officiant: 'Fr. Santos', description: 'Evening Mass', isPublic: true, recurring: true },
  ]),
  /* ── Sunday Masses May 3, 10, 17, 24, 31 ── */
  ...[3,10,17,24,31].flatMap((d, i) => [
    { id: `sun${d}6`,  title: 'Sunday Mass', type: 'Mass' as EventType, date: fmtDate(2026,5,d), startTime: '06:00', endTime: '07:00',   location: 'Main Church', officiant: PRIESTS[i % 3].name, isPublic: true, recurring: true },
    { id: `sun${d}8`,  title: 'Sunday Mass', type: 'Mass' as EventType, date: fmtDate(2026,5,d), startTime: '08:00', endTime: '09:00',   location: 'Main Church', officiant: PRIESTS[(i+1) % 3].name, isPublic: true, recurring: true },
    { id: `sun${d}10`, title: 'Sunday Mass', type: 'Mass' as EventType, date: fmtDate(2026,5,d), startTime: '10:00', endTime: '11:00',  location: 'Main Church', officiant: PRIESTS[(i+2) % 3].name, isPublic: true, recurring: true },
    { id: `sun${d}18`, title: 'Sunday Mass', type: 'Mass' as EventType, date: fmtDate(2026,5,d), startTime: '18:00', endTime: '19:00',  location: 'Main Church', officiant: PRIESTS[i % 3].name, isPublic: true, recurring: true },
  ]),

  /* ── Baptisms (3) — linked to sacramental registry ── */
  {
    id: 'evt-b1', title: 'Baptism: Garcia, Candice Marie', type: 'Baptism', date: fmtDate(2026,5,10), startTime: '09:00', endTime: '10:00',
    location: 'Baptistry', officiant: 'Fr. Reyes', description: 'Baptism of Candice Marie Garcia, daughter of Carlos & Diana Garcia',
    isPublic: true,
    sacramentRecordId: 'bap-001', sacramentRecordType: 'baptism', sacramentSummary: 'Garcia, Candice Marie',
    ruleEnforced: true, ruleNotes: 'Saturday preferred for baptisms',
  },
  {
    id: 'evt-b2', title: 'Baptism: Cruz, Gabriel', type: 'Baptism', date: fmtDate(2026,5,17), startTime: '09:00', endTime: '10:00',
    location: 'Baptistry', officiant: 'Fr. Santos', description: 'Baptism of Gabriel Cruz, son of Roberto & Elena Cruz',
    isPublic: true,
    sacramentRecordId: 'bap-002', sacramentRecordType: 'baptism', sacramentSummary: 'Cruz, Gabriel',
    ruleEnforced: true, ruleNotes: 'Sunday baptism — special pastoral dispensation granted',
  },
  {
    id: 'evt-b3', title: 'Baptism: Reyes, Sofia', type: 'Baptism', date: fmtDate(2026,5,24), startTime: '09:00', endTime: '10:00',
    location: 'Baptistry', officiant: 'Fr. Cruz', description: 'Baptism of Sofia Reyes, daughter of Miguel & Carmen Reyes',
    isPublic: true,
    sacramentRecordId: 'bap-003', sacramentRecordType: 'baptism', sacramentSummary: 'Reyes, Sofia',
    ruleEnforced: true, ruleNotes: 'Saturday schedule',
  },

  /* ── Weddings (2) — linked to sacramental registry ── */
  {
    id: 'evt-w1', title: 'Wedding: Santos & Bautista', type: 'Wedding', date: fmtDate(2026,5,16), startTime: '14:00', endTime: '15:30',
    location: 'Main Church', officiant: 'Fr. Reyes', description: 'Wedding of Jose Santos and Maria Bautista',
    isPublic: true,
    sacramentRecordId: 'wed-001', sacramentRecordType: 'marriage', sacramentSummary: 'Santos & Bautista',
    ruleEnforced: true, ruleNotes: 'Saturday — preferred wedding day',
  },
  {
    id: 'evt-w2', title: 'Wedding: Reyes & Cruz', type: 'Wedding', date: fmtDate(2026,5,30), startTime: '14:00', endTime: '15:30',
    location: 'Main Church', officiant: 'Fr. Santos', description: 'Wedding of Carlo Reyes and Lucia Cruz',
    isPublic: true,
    sacramentRecordId: 'wed-002', sacramentRecordType: 'marriage', sacramentSummary: 'Reyes & Cruz',
    ruleEnforced: true, ruleNotes: 'Saturday — preferred wedding day',
  },

  /* ── Confirmations (2) — linked to sacramental registry ── */
  {
    id: 'evt-c1', title: 'Confirmation: Dela Cruz, Jose Antonio', type: 'Confirmation', date: fmtDate(2026,5,13), startTime: '10:00', endTime: '11:30',
    location: 'Main Church', officiant: 'Fr. Reyes', description: 'Confirmation of Jose Antonio Dela Cruz',
    isPublic: true,
    sacramentRecordId: 'cnf-001', sacramentRecordType: 'confirmation', sacramentSummary: 'Dela Cruz, Jose Antonio',
    ruleEnforced: true, ruleNotes: 'Wednesday confirmation schedule',
  },
  {
    id: 'evt-c2', title: 'Confirmation: Group Confirmation (12 candidates)', type: 'Confirmation', date: fmtDate(2026,5,27), startTime: '09:00', endTime: '12:00',
    location: 'Main Church', officiant: 'Fr. Cruz', description: 'Group confirmation ceremony for 12 candidates from catechism class',
    isPublic: true,
    sacramentRecordId: 'cnf-002', sacramentRecordType: 'confirmation', sacramentSummary: 'Group — 12 Candidates',
    ruleEnforced: true, ruleNotes: 'Wednesday group confirmation',
  },

  /* ── Burials (2) — linked to sacramental registry ── */
  {
    id: 'evt-d1', title: 'Burial Service: Flores, Diego Lorenzo', type: 'Death', date: fmtDate(2026,5,14), startTime: '09:00', endTime: '10:00',
    location: 'Main Church', officiant: 'Fr. Reyes', description: 'Funeral Mass for Diego Lorenzo Flores, 78',
    isPublic: true,
    sacramentRecordId: 'dth-001', sacramentRecordType: 'death', sacramentSummary: 'Flores, Diego Lorenzo',
    ruleEnforced: true, ruleNotes: 'Thursday burial service',
  },
  {
    id: 'evt-d2', title: 'Burial Service: Aquino, Rafael Joseph', type: 'Death', date: fmtDate(2026,5,21), startTime: '14:00', endTime: '15:00',
    location: 'Cemetery', officiant: 'Fr. Santos', description: 'Interment of Rafael Joseph Aquino, 65',
    isPublic: true,
    sacramentRecordId: 'dth-002', sacramentRecordType: 'death', sacramentSummary: 'Aquino, Rafael Joseph',
    ruleEnforced: true, ruleNotes: 'Thursday interment at cemetery',
  },

  /* ── Ministry meetings (4) ── */
  { id: 'evt-m1', title: 'Eucharistic Ministers Meeting', type: 'Ministry', date: fmtDate(2026,5,5),  startTime: '19:00', endTime: '20:30', location: 'Parish Hall', officiant: 'Fr. Reyes',  description: 'Monthly meeting for Eucharistic Ministers', isPublic: true },
  { id: 'evt-m2', title: 'Altar Servers Practice',        type: 'Ministry', date: fmtDate(2026,5,12), startTime: '16:00', endTime: '17:30', location: 'Main Church', officiant: 'Fr. Cruz',   description: 'Training session for new altar servers', isPublic: true },
  { id: 'evt-m3', title: 'Choir Rehearsal',               type: 'Ministry', date: fmtDate(2026,5,14), startTime: '19:00', endTime: '20:30', location: 'Chapel',      officiant: 'Fr. Santos', description: 'Weekly choir practice for Sunday Masses', isPublic: true },
  { id: 'evt-m4', title: 'Lectors Meeting',               type: 'Ministry', date: fmtDate(2026,5,19), startTime: '19:00', endTime: '20:00', location: 'Rectory',     officiant: 'Fr. Reyes',  description: 'Monthly lectors meeting and reading assignments', isPublic: true },

  /* ── SSDM events (3) ── */
  { id: 'evt-s1', title: 'SSDM Outreach Program',      type: 'SSDM', date: fmtDate(2026,5,9),  startTime: '08:00', endTime: '12:00', location: 'Parish Hall', officiant: 'Fr. Cruz',   description: 'Monthly outreach to Barangay San Isidro', isPublic: false },
  { id: 'evt-s2', title: 'SSDM Food Distribution',     type: 'SSDM', date: fmtDate(2026,5,23), startTime: '07:00', endTime: '11:00', location: 'Parish Hall', officiant: 'Fr. Santos', description: 'Weekly food distribution to indigent families', isPublic: false },
  { id: 'evt-s3', title: 'SSDM Medical Mission',       type: 'SSDM', date: fmtDate(2026,5,25), startTime: '08:00', endTime: '16:00', location: 'Parish Hall', officiant: 'Fr. Reyes',  description: 'Free medical and dental mission for the community', isPublic: true },

  /* ── General meetings (2) ── */
  { id: 'evt-g1', title: 'Parish Council Meeting',    type: 'General', date: fmtDate(2026,5,8),  startTime: '19:00', endTime: '21:00', location: 'Rectory',     officiant: 'Fr. Reyes',  description: 'Monthly parish council meeting', isPublic: true },
  { id: 'evt-g2', title: 'Finance Committee Meeting', type: 'General', date: fmtDate(2026,5,22), startTime: '19:00', endTime: '20:30', location: 'Rectory',     officiant: 'Fr. Santos', description: 'Quarterly financial review meeting', isPublic: true },

  /* ── Early June events to show cross-month ── */
  { id: 'jun1', title: 'Sunday Mass', type: 'Mass', date: fmtDate(2026,6,1), startTime: '06:00', endTime: '07:00', location: 'Main Church', officiant: 'Fr. Reyes', isPublic: true, recurring: true },
  { id: 'jun2', title: 'Daily Mass',  type: 'Mass', date: fmtDate(2026,6,1), startTime: '18:00', endTime: '19:00', location: 'Main Church', officiant: 'Fr. Santos', isPublic: true, recurring: true },
  {
    id: 'evt-b4', title: 'Baptism: Lim, Miguel Angelo', type: 'Baptism', date: fmtDate(2026,6,7), startTime: '09:00', endTime: '10:00',
    location: 'Baptistry', officiant: 'Fr. Cruz', description: 'Baptism of Miguel Angelo Lim, son of Pedro & Sofia Lim',
    isPublic: true,
    sacramentRecordId: 'bap-004', sacramentRecordType: 'baptism', sacramentSummary: 'Lim, Miguel Angelo',
    ruleEnforced: true,
  },
  { id: 'jun4', title: 'Choir Rehearsal', type: 'Ministry', date: fmtDate(2026,6,4), startTime: '19:00', endTime: '20:30', location: 'Chapel', officiant: 'Fr. Santos', description: 'Weekly choir practice', isPublic: true },
  { id: 'jun5', title: 'Parish Fiesta Planning', type: 'General', date: fmtDate(2026,6,6), startTime: '14:00', endTime: '17:00', location: 'Parish Hall', officiant: 'Fr. Reyes', description: 'Planning meeting for annual parish fiesta', isPublic: true },
  { id: 'jun6', title: 'SSDM Educational Support', type: 'SSDM', date: fmtDate(2026,6,13), startTime: '09:00', endTime: '12:00', location: 'Parish Hall', officiant: 'Fr. Cruz', description: 'Scholarship distribution to students', isPublic: true },
  {
    id: 'evt-d3', title: 'Burial Service: Torres, Miguel Angelo', type: 'Death', date: fmtDate(2026,6,3), startTime: '09:00', endTime: '10:00',
    location: 'Main Church', officiant: 'Fr. Reyes', description: 'Funeral Mass for Miguel Angelo Torres, 82',
    isPublic: true,
    sacramentRecordId: 'dth-003', sacramentRecordType: 'death', sacramentSummary: 'Torres, Miguel Angelo',
    ruleEnforced: true,
  },
];

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/** Get a public-safe title (hides personal names) */
export function getPublicTitle(event: CalendarEvent): string {
  switch (event.type) {
    case 'Baptism':      return event.sacramentSummary ? `Baptism (Private)` : 'Baptism (Private)';
    case 'Wedding':      return 'Wedding (Private)';
    case 'Confirmation': return 'Confirmation (Private)';
    case 'Death':        return 'Burial Service (Private)';
    case 'SSDM':         return 'SSDM Activity';
    default:             return event.title;
  }
}

/** Check for conflicts (legacy — kept for compat) */
export function findConflicts(event: CalendarEvent, allEvents: CalendarEvent[]): CalendarEvent[] {
  return allEvents.filter(e => {
    if (e.id === event.id) return false;
    if (e.date !== event.date) return false;
    const eStart = timeToMinutes(e.startTime);
    const eEnd   = timeToMinutes(e.endTime);
    const nStart = timeToMinutes(event.startTime);
    const nEnd   = timeToMinutes(event.endTime);
    const overlap = nStart < eEnd && nEnd > eStart;
    if (!overlap) return false;
    return (event.officiant && e.officiant && event.officiant === e.officiant) ||
           (event.location === e.location);
  });
}

/** Minimum minutes between a priest's activities. A full hour — our priests can be
 *  elderly (some in their 70s), and they need time to rest as well as to travel. */
export const TRANSITION_BUFFER_MIN = 60;

export type EventConflict = {
  type: 'priest' | 'location' | 'time' | 'transition';
  /** 'block' makes the event un-saveable; 'warn' is a caution the user can accept. */
  severity: 'block' | 'warn';
  message: string;
  conflictingEvent: CalendarEvent;
};

/** Enhanced conflict checker — returns rich conflict objects */
export function checkEventConflicts(
  events: CalendarEvent[],
  newEvent: Omit<CalendarEvent, 'id'>,
): EventConflict[] {
  const conflicts: EventConflict[] = [];
  events.forEach(e => {
    if (e.id === (newEvent as Partial<CalendarEvent>).id) return; // skip self
    if (e.date !== newEvent.date) return;
    const eStart = timeToMinutes(e.startTime);
    const eEnd   = timeToMinutes(e.endTime);
    const nStart = timeToMinutes(newEvent.startTime);
    const nEnd   = timeToMinutes(newEvent.endTime);
    const overlap = nStart < eEnd && nEnd > eStart;

    if (overlap) {
      if (newEvent.officiant && e.officiant && newEvent.officiant === e.officiant) {
        conflicts.push({
          type: 'priest', severity: 'block',
          message: `${e.officiant} is already booked at this time: "${e.title}" (${e.startTime} – ${e.endTime})`,
          conflictingEvent: e,
        });
      }
      if (newEvent.location && e.location && newEvent.location === e.location) {
        conflicts.push({
          type: 'location', severity: 'block',
          message: `${e.location} is already booked at this time: "${e.title}" (${e.startTime} – ${e.endTime})`,
          conflictingEvent: e,
        });
      }
      return;
    }

    // No overlap — but is the same priest scheduled too tightly between activities?
    // Applies whether or not the location changes: an elderly priest needs time to
    // rest, not only to travel.
    if (newEvent.officiant && e.officiant && newEvent.officiant === e.officiant) {
      // gap = minutes between the end of the earlier event and the start of the later one
      const gap = nStart >= eEnd ? nStart - eEnd : eStart - nEnd;
      if (gap >= 0 && gap < TRANSITION_BUFFER_MIN) {
        const [first, second] = nStart >= eEnd ? [e, newEvent] : [newEvent, e];
        const sameLocation = first.location === second.location;
        const message = sameLocation
          ? `Too soon after "${first.title}" (ends ${first.endTime}) — only ${gap} min before "${second.title}" (starts ${second.startTime}). ${newEvent.officiant} needs at least an hour between activities to rest. Please choose a later time.`
          : `Too soon after "${first.title}" at ${first.location} (ends ${first.endTime}) — only ${gap} min to reach ${second.location} for "${second.title}" (starts ${second.startTime}). ${newEvent.officiant} needs at least an hour to travel and rest. Please choose a later time.`;
        conflicts.push({ type: 'transition', severity: 'block', message, conflictingEvent: e });
      }
    }
  });
  return conflicts;
}

/** Validate sacrament scheduling rules */
export function validateSchedulingRules(
  type: 'baptism' | 'wedding' | 'confirmation' | 'death',
  date: string,
  time: string,
  location: string,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const rules = SCHEDULING_RULES[type];
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!rules) return { valid: true, errors, warnings };

  const jsDate = new Date(date + 'T00:00:00');
  const dayName = jsDate.toLocaleDateString('en-US', { weekday: 'long' });

  // Day-of-week checks
  if ('blockedDays' in rules && rules.blockedDays && rules.blockedDays.includes(dayName as never)) {
    const label = type === 'baptism' ? 'Baptisms' : type === 'confirmation' ? 'Confirmations' : type.charAt(0).toUpperCase() + type.slice(1) + 's';
    errors.push(`${label} are not held on ${dayName}s.`);
  }
  if ('allowedDays' in rules && rules.allowedDays && !rules.allowedDays.includes(dayName as never)) {
    errors.push(`This sacrament is not typically scheduled on ${dayName}s.`);
  }
  if ('preferredDays' in rules && rules.preferredDays && !rules.preferredDays.includes(dayName as never)) {
    warnings.push(`${rules.preferredDays.join(' / ')} is the preferred day for ${type === 'death' ? 'burial services' : type + 's'}.`);
  }

  // Lent check for weddings
  if (type === 'wedding' && 'blockedPeriods' in rules && rules.blockedPeriods) {
    const mmdd = date.slice(5); // "MM-DD"
    for (const period of rules.blockedPeriods) {
      if (mmdd >= period.start && mmdd <= period.end) {
        errors.push(`Weddings are prohibited during ${period.name} (${period.start} to ${period.end}).`);
      }
    }
  }

  // Time checks
  if (rules.allowedTimes && !rules.allowedTimes.includes(time as never)) {
    const timeLabel = rules.allowedTimes[0] + ' – ' + rules.allowedTimes[rules.allowedTimes.length - 1];
    warnings.push(`Recommended times are ${timeLabel}. Selected time ${time} is outside the usual range.`);
  }

  // Location checks
  if (rules.locations && !rules.locations.includes(location as never)) {
    warnings.push(`Typical locations: ${rules.locations.join(', ')}.`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Get registry display label for a sacrament-linked event */
export function getRegistryLabel(event: CalendarEvent): string | null {
  if (!event.sacramentRecordId || !event.sacramentRecordType) return null;
  const prefixMap: Record<string, string> = {
    baptism: 'B', marriage: 'M', confirmation: 'C', death: 'D',
  };
  const prefix = prefixMap[event.sacramentRecordType] || 'R';
  const typeLabel = event.sacramentRecordType.charAt(0).toUpperCase() + event.sacramentRecordType.slice(1);
  return `${typeLabel} #${prefix}-2026-${event.sacramentRecordId.split('-')[1]?.padStart(4, '0') || '0000'}`;
}

/** Map CalendarEvent type to scheduling rule key */
export function eventTypeToRuleKey(type: EventType): 'baptism' | 'wedding' | 'confirmation' | 'death' | null {
  switch (type) {
    case 'Baptism':      return 'baptism';
    case 'Wedding':      return 'wedding';
    case 'Confirmation': return 'confirmation';
    case 'Death':        return 'death';
    default:             return null;
  }
}

/** Check if an event type is a sacrament that can be linked to registry */
export function isSacramentEventType(type: EventType): boolean {
  return type === 'Baptism' || type === 'Wedding' || type === 'Confirmation' || type === 'Death';
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Get the next available valid day for a sacrament type */
export function getNextAvailableDay(
  type: 'baptism' | 'wedding' | 'confirmation' | 'death',
  fromDate: string,
): string {
  const rules = SCHEDULING_RULES[type];
  if (!rules) return fromDate;
  let d = new Date(fromDate + 'T00:00:00');
  for (let i = 0; i < 30; i++) {
    d.setDate(d.getDate() + 1);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
    const blocked = 'blockedDays' in rules ? ((rules.blockedDays as readonly string[] || [])).includes(dayName) : false;
    if (!blocked) {
      const mmdd = formatMMDD(d);
      let inBlockedPeriod = false;
      if ('blockedPeriods' in rules && rules.blockedPeriods) {
        for (const p of rules.blockedPeriods as ReadonlyArray<{ name: string; start: string; end: string }>) {
          if (mmdd >= p.start && mmdd <= p.end) { inBlockedPeriod = true; break; }
        }
      }
      if (!inBlockedPeriod) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
  }
  return fromDate; // fallback
}

function formatMMDD(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
