// ═══════════════════════════════════════════════════════════
// Clergy — the parish's managed list of priests
//
// Clergy are managed PEOPLE, not free text. The officiant field on
// events/registry records is populated from this list, so scheduling and
// per-priest schedule export (lib/icsGenerator.ts) can scope reliably by
// a canonical full name rather than fragile surname-substring matching.
//
// Persistence goes through the standard storage seam: one list per parish
// under KEYS.clergy. In cloud mode 'clergy' is a SINGLETON_KEYS entry, so
// the whole list is stored as a single jsonb row in parish_settings
// (see lib/cloudStore.ts).
// ═══════════════════════════════════════════════════════════

import { getJSON, setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';
import { getPriestName } from './parishConfig';

export interface Clergy {
  id: string;
  /** Honorific, e.g. 'Fr.', 'Msgr.', 'Rev.'. */
  title: string;
  /** Person name without the honorific, e.g. 'Antonio Reyes'. */
  name: string;
  active: boolean;
}

/** Full display name, e.g. 'Fr. Antonio Reyes'. */
export function clergyFullName(c: Clergy): string {
  return `${c.title} ${c.name}`.trim();
}

function genId(): string {
  return `clg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Leading honorifics we recognise when parsing a free-text priest name into
// title + name. Longest-first so 'Rev. Fr.' style prefixes peel cleanly.
const TITLE_PREFIXES = ['Msgr.', 'Msgr', 'Rev.', 'Rev', 'Fr.', 'Fr', 'Bp.', 'Bp', 'Deacon'];

/**
 * Split a free-text priest name like 'Fr. Antonio Reyes' into
 * { title: 'Fr.', name: 'Antonio Reyes' }. If no known honorific leads the
 * string, defaults the title to 'Fr.' and keeps the whole string as the name.
 */
function parsePriestName(full: string): { title: string; name: string } {
  const trimmed = (full || '').trim();
  for (const p of TITLE_PREFIXES) {
    if (trimmed.toLowerCase().startsWith(p.toLowerCase() + ' ') || trimmed.toLowerCase() === p.toLowerCase()) {
      const rest = trimmed.slice(p.length).trim();
      // Normalise the stored honorific to a dotted form ('Fr' → 'Fr.').
      const title = p.endsWith('.') || p === 'Deacon' ? p : p + '.';
      return { title, name: rest };
    }
  }
  return { title: 'Fr.', name: trimmed };
}

/** The single seed clergy entry, derived from the configured parish priest. */
function seedClergy(): Clergy {
  const { title, name } = parsePriestName(getPriestName());
  return { id: genId(), title, name, active: true };
}

/**
 * All clergy for the current parish. Seeds and persists ONE entry (from the
 * configured parish priest) the first time it is read for a parish that has
 * none, so callers never have to special-case the empty state.
 */
export function getClergy(): Clergy[] {
  const list = getJSON<Clergy[]>(KEYS.clergy, []);
  if (!Array.isArray(list) || list.length === 0) {
    const seeded = [seedClergy()];
    setJSON(KEYS.clergy, seeded);
    return seeded;
  }
  return list;
}

/** Persist the clergy list. Returns false if the write failed (e.g. quota). */
export function saveClergy(list: Clergy[]): boolean {
  return setJSON(KEYS.clergy, list);
}

/** Active clergy only (inactive stay on record but aren't pickable). */
export function getActiveClergy(): Clergy[] {
  return getClergy().filter((c) => c.active);
}

/** Full display names of the active clergy — the officiant picker's options. */
export function clergyNames(): string[] {
  return getActiveClergy().map(clergyFullName);
}

/** Add a clergy member. Returns the created record. */
export function addClergy(input: Omit<Clergy, 'id'>): Clergy {
  const list = getClergy();
  const clergy: Clergy = {
    id: genId(),
    title: input.title,
    name: input.name,
    active: input.active,
  };
  const next = list.slice();
  next.push(clergy);
  saveClergy(next);
  return clergy;
}

/** Update a clergy member by id. Returns the updated record, or null if absent. */
export function updateClergy(id: string, patch: Partial<Omit<Clergy, 'id'>>): Clergy | null {
  const list = getClergy();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const next = list.map((c, i) => (i === idx ? { ...c, ...patch, id: c.id } : c));
  saveClergy(next);
  return next[idx];
}

/**
 * Delete a clergy member by id. Refuses to delete the LAST remaining entry
 * (a parish must always have at least one priest to scope schedules to).
 * Returns true if a record was removed.
 */
export function deleteClergy(id: string): boolean {
  const list = getClergy();
  if (list.length <= 1) return false; // never delete the last clergy member
  if (!list.some((c) => c.id === id)) return false;
  saveClergy(list.filter((c) => c.id !== id));
  return true;
}
