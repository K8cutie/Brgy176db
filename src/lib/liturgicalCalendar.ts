// ═══════════════════════════════════════════════════════════
// Liturgical Calendar — computus and the liturgical year
//
// Single source of truth for movable feasts. Everything is
// DERIVED from the event's own year via the anonymous Gregorian
// computus — never hardcoded MM-DD windows (Ash Wednesday moves
// by more than a month between years).
//
// All dates are handled as LOCAL dates (new Date(y, m-1, d)) and
// plain YYYY-MM-DD strings so UTC+8 parishes never see an
// off-by-one day. Lexicographic compare on ISO strings is safe.
// ═══════════════════════════════════════════════════════════

// ── Local-date helpers (no UTC anywhere) ──
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1); // local midnight, never UTC
}

function addDays(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

function yearOf(iso: string): number {
  return parseInt(iso.slice(0, 4), 10);
}

/** Human-friendly "March 31, 2024" for messages (local, date-only). */
export function formatLiturgicalDate(iso: string): string {
  return fromISO(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
}

/* ═══════════════════════════════════════════════════════════
   COMPUTUS — anonymous Gregorian algorithm (Meeus/Jones/Butcher)
   Pure function: year → Easter Sunday as YYYY-MM-DD.
   ═══════════════════════════════════════════════════════════ */

export function computeEaster(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// ── Movable days derived from Easter ──
export function ashWednesday(year: number): string {
  return addDays(computeEaster(year), -46);
}

export function holyThursday(year: number): string {
  return addDays(computeEaster(year), -3);
}

export function goodFriday(year: number): string {
  return addDays(computeEaster(year), -2);
}

export function holySaturday(year: number): string {
  return addDays(computeEaster(year), -1);
}

export function palmSunday(year: number): string {
  return addDays(computeEaster(year), -7);
}

export function pentecost(year: number): string {
  return addDays(computeEaster(year), 49);
}

/** Lent for scheduling purposes: Ash Wednesday through Holy Saturday
 *  (inclusive) — the traditional "no weddings" window. Both bounds are
 *  YYYY-MM-DD in the given year. */
export function lentRange(year: number): { start: string; end: string } {
  return { start: ashWednesday(year), end: holySaturday(year) };
}

/** Is this date inside Lent (Ash Wednesday → Holy Saturday) of ITS OWN year? */
export function isDuringLent(dateISO: string): boolean {
  const { start, end } = lentRange(yearOf(dateISO));
  return dateISO >= start && dateISO <= end;
}

/** Is this date one of the three days of the Easter Triduum
 *  (Holy Thursday, Good Friday, Holy Saturday)? */
export function isTriduum(dateISO: string): boolean {
  const y = yearOf(dateISO);
  return dateISO >= holyThursday(y) && dateISO <= holySaturday(y);
}

/* ═══════════════════════════════════════════════════════════
   ADVENT / EPIPHANY anchors (Philippine practice: Epiphany,
   Ascension and Corpus Christi are celebrated on Sundays)
   ═══════════════════════════════════════════════════════════ */

/** First Sunday of Advent: the 4th Sunday before Christmas. */
export function adventStart(year: number): string {
  const christmas = fromISO(`${year}-12-25`);
  const dow = christmas.getDay(); // 0 = Sunday
  // The Sunday strictly before Christmas (4th Sunday of Advent), minus 3 weeks.
  const daysBack = dow === 0 ? 7 : dow;
  return addDays(`${year}-12-25`, -(daysBack + 21));
}

/** Epiphany in the Philippines: the Sunday between Jan 2 and Jan 8. */
export function epiphany(year: number): string {
  const jan2 = fromISO(`${year}-01-02`);
  const dow = jan2.getDay();
  return addDays(`${year}-01-02`, dow === 0 ? 0 : 7 - dow);
}

/** Baptism of the Lord: the Sunday after Epiphany (ends the Christmas season). */
export function baptismOfTheLord(year: number): string {
  return addDays(epiphany(year), 7);
}

/* ═══════════════════════════════════════════════════════════
   NOTABLE DAYS — solemnities, the Triduum, and key feasts
   ═══════════════════════════════════════════════════════════ */

export type LiturgicalRank = 'solemnity' | 'triduum' | 'feast';

export interface LiturgicalDay {
  date: string; // YYYY-MM-DD
  name: string;
  rank: LiturgicalRank;
  movable: boolean;
}

/** All notable liturgical days for a calendar year (Philippine usage).
 *  NOTE: the rare Holy-Week transfers of St. Joseph / the Annunciation
 *  are not modelled — they surface as informational warnings only. */
export function getNotableDays(year: number): LiturgicalDay[] {
  const easter = computeEaster(year);
  const days: LiturgicalDay[] = [
    // Fixed
    { date: `${year}-01-01`, name: 'Mary, Mother of God', rank: 'solemnity', movable: false },
    { date: epiphany(year), name: 'Epiphany of the Lord', rank: 'solemnity', movable: true },
    { date: `${year}-03-19`, name: 'St. Joseph', rank: 'solemnity', movable: false },
    { date: `${year}-03-25`, name: 'Annunciation of the Lord', rank: 'solemnity', movable: false },
    { date: `${year}-06-29`, name: 'Sts. Peter and Paul', rank: 'solemnity', movable: false },
    { date: `${year}-08-15`, name: 'Assumption of Mary', rank: 'solemnity', movable: false },
    { date: `${year}-11-01`, name: 'All Saints', rank: 'solemnity', movable: false },
    { date: `${year}-12-08`, name: 'Immaculate Conception', rank: 'solemnity', movable: false },
    { date: `${year}-12-25`, name: 'Christmas (Nativity of the Lord)', rank: 'solemnity', movable: false },
    // Movable — derived from Easter
    { date: ashWednesday(year), name: 'Ash Wednesday', rank: 'feast', movable: true },
    { date: palmSunday(year), name: 'Palm Sunday', rank: 'feast', movable: true },
    { date: holyThursday(year), name: 'Holy Thursday', rank: 'triduum', movable: true },
    { date: goodFriday(year), name: 'Good Friday', rank: 'triduum', movable: true },
    { date: holySaturday(year), name: 'Holy Saturday (Easter Vigil)', rank: 'triduum', movable: true },
    { date: easter, name: 'Easter Sunday', rank: 'solemnity', movable: true },
    { date: addDays(easter, 42), name: 'Ascension of the Lord', rank: 'solemnity', movable: true }, // PH: 7th Sunday of Easter
    { date: pentecost(year), name: 'Pentecost', rank: 'solemnity', movable: true },
    { date: addDays(easter, 56), name: 'Most Holy Trinity', rank: 'solemnity', movable: true },
    { date: addDays(easter, 63), name: 'Corpus Christi', rank: 'solemnity', movable: true }, // PH: Sunday
    { date: addDays(easter, 68), name: 'Sacred Heart of Jesus', rank: 'solemnity', movable: true },
    { date: addDays(adventStart(year), -7), name: 'Christ the King', rank: 'solemnity', movable: true },
  ];
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

/** The notable day falling on a specific date, if any. When several coincide
 *  the highest rank wins (triduum > solemnity > feast). */
export function getLiturgicalDay(dateISO: string): LiturgicalDay | null {
  const matches = getNotableDays(yearOf(dateISO)).filter((d) => d.date === dateISO);
  if (matches.length === 0) return null;
  const order: Record<LiturgicalRank, number> = { triduum: 0, solemnity: 1, feast: 2 };
  return matches.sort((a, b) => order[a.rank] - order[b.rank])[0];
}

/** Notable days inside [startISO, endISO] inclusive (spans year boundaries). */
export function getLiturgicalDaysInRange(startISO: string, endISO: string): LiturgicalDay[] {
  const days: LiturgicalDay[] = [];
  for (let y = yearOf(startISO); y <= yearOf(endISO); y++) {
    days.push(...getNotableDays(y));
  }
  return days.filter((d) => d.date >= startISO && d.date <= endISO);
}

/* ═══════════════════════════════════════════════════════════
   SEASONS
   ═══════════════════════════════════════════════════════════ */

export type LiturgicalSeason = 'Advent' | 'Christmas' | 'Lent' | 'Triduum' | 'Easter' | 'Ordinary Time';

/** Vestment-inspired accent colors for UI chips/legends. */
export const SEASON_COLORS: Record<LiturgicalSeason, string> = {
  Advent: '#5B3A73', // violet
  Christmas: '#C9963B', // gold (white/gold)
  Lent: '#7C3AED', // purple
  Triduum: '#B8322F', // red
  Easter: '#C9963B', // gold (white/gold)
  'Ordinary Time': '#2D6A4F', // green
};

/** Season for a local YYYY-MM-DD date, computed for that date's own year. */
export function getLiturgicalSeason(dateISO: string): LiturgicalSeason {
  const y = yearOf(dateISO);
  const easter = computeEaster(y);

  // Christmastide bleeding in from the PREVIOUS liturgical year (early January).
  if (dateISO <= baptismOfTheLord(y) && dateISO < `${y}-02-01`) return 'Christmas';
  if (dateISO >= `${y}-12-25`) return 'Christmas';
  if (dateISO >= adventStart(y)) return 'Advent';
  if (dateISO >= holyThursday(y) && dateISO <= holySaturday(y)) return 'Triduum';
  if (dateISO >= ashWednesday(y) && dateISO < holyThursday(y)) return 'Lent';
  if (dateISO >= easter && dateISO <= pentecost(y)) return 'Easter';
  return 'Ordinary Time';
}
