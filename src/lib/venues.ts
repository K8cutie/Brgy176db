// ═══════════════════════════════════════════════════════════
// Venues — bookable spaces for a parish
//
// A parish has one or more venues (Main Church, a chapel, the parish
// hall, a cemetery chapel, …). Bookings hold a time window in a venue;
// the scheduling engine (lib/scheduling.ts) treats two ceremonies as a
// conflict when they overlap in the SAME venue (or share the same
// officiant). A one-venue parish therefore behaves like a single
// bookable space — every overlap conflicts.
//
// Persistence goes through the standard storage seam: one list per
// parish under KEYS.venues. In cloud mode 'venues' is a SINGLETON_KEYS
// entry, so the whole list is stored as a single jsonb row in
// parish_settings (see lib/cloudStore.ts).
// ═══════════════════════════════════════════════════════════

import { getJSON, setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';

export interface Venue {
  id: string;
  name: string;
  /** Seats. 0 = "unspecified / no cap" (capacity checks treat it as always fitting). */
  capacity: number;
  location: string;
  active: boolean;
  isDefault: boolean;
}

function genId(): string {
  return `ven-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The single seed venue every parish ships with. */
export function defaultVenue(): Venue {
  return { id: genId(), name: 'Main Church', capacity: 0, location: '', active: true, isDefault: true };
}

/**
 * All venues for the current parish. Seeds and persists ONE default
 * ("Main Church") the first time it is read for a parish that has none,
 * so callers never have to special-case the empty state.
 */
export function getVenues(): Venue[] {
  const list = getJSON<Venue[]>(KEYS.venues, []);
  if (!Array.isArray(list) || list.length === 0) {
    const seeded = [defaultVenue()];
    setJSON(KEYS.venues, seeded);
    return seeded;
  }
  return list;
}

/** Persist the venue list. Returns false if the write failed (e.g. quota). */
export function saveVenues(list: Venue[]): boolean {
  return setJSON(KEYS.venues, list);
}

/** Active venues only (inactive venues stay on record but aren't bookable). */
export function getActiveVenues(): Venue[] {
  return getVenues().filter((v) => v.active);
}

/** True when the parish has more than one venue — drives the booking UI's
 *  venue picker (hidden when there is only one venue). */
export function isMultiVenue(): boolean {
  return getVenues().length > 1;
}

/**
 * Add a venue. A first-ever venue is forced to be the default; if the new
 * venue asks to be default, the previous default is demoted.
 */
export function addVenue(input: Omit<Venue, 'id' | 'isDefault'> & { isDefault?: boolean }): Venue {
  const list = getVenues();
  const wantDefault = input.isDefault === true || list.length === 0;
  const venue: Venue = {
    id: genId(),
    name: input.name,
    capacity: input.capacity,
    location: input.location,
    active: input.active,
    isDefault: wantDefault,
  };
  const next = wantDefault ? list.map((v) => ({ ...v, isDefault: false })) : list.slice();
  next.push(venue);
  saveVenues(next);
  return venue;
}

/**
 * Update a venue by id. Promoting one to default demotes all others; a patch
 * that clears the last remaining default is ignored so the parish always has
 * exactly one default venue. Returns the updated venue, or null if not found.
 */
export function updateVenue(id: string, patch: Partial<Omit<Venue, 'id'>>): Venue | null {
  const list = getVenues();
  const idx = list.findIndex((v) => v.id === id);
  if (idx === -1) return null;

  const promotingToDefault = patch.isDefault === true;
  const clearingDefault = patch.isDefault === false && list[idx].isDefault;

  let next = list.map((v, i) => {
    if (i === idx) return { ...v, ...patch, id: v.id };
    // Promoting this venue to default demotes every other venue.
    return promotingToDefault ? { ...v, isDefault: false } : v;
  });

  // Never leave the parish with zero default venues.
  if (clearingDefault && !next.some((v) => v.isDefault)) {
    const promote = next.find((v) => v.id !== id) ?? next[idx];
    next = next.map((v) => (v.id === promote.id ? { ...v, isDefault: true } : v));
  }

  saveVenues(next);
  return next[idx];
}

/**
 * Delete a venue by id. Refuses to delete the LAST remaining venue (a parish
 * must always have at least one). If the deleted venue was the default, another
 * venue is promoted to default. Returns true if a venue was removed.
 */
export function deleteVenue(id: string): boolean {
  const list = getVenues();
  if (list.length <= 1) return false; // never delete the last venue
  const target = list.find((v) => v.id === id);
  if (!target) return false;

  let next = list.filter((v) => v.id !== id);
  if (target.isDefault && !next.some((v) => v.isDefault) && next.length > 0) {
    next = next.map((v, i) => (i === 0 ? { ...v, isDefault: true } : v));
  }
  saveVenues(next);
  return true;
}
