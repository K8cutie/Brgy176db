// Regression tests for the cloud write path. Two properties:
// (1) a FAILED cloud hydrate must NEVER let a write-through delete real rows — a
//     failed read must not look like an empty parish (fail-closed).
// (2) the DIFF-based reconcile writes ONLY what changed: adding a row upserts just
//     that row and deletes nothing; removing a row deletes only the removed row
//     (targeted, never a blanket "delete everything not in my array" that both
//     414'd past ~215 rows and wiped rows other staff added); an unchanged mount
//     write-through sends nothing at all.
//
// Cloud mode is keyed off import.meta.env, which this vitest setup only resolves at
// config time (not via vi.stubEnv). So this suite RUNS in cloud mode and cleanly SKIPS
// otherwise — run it with the cloud env via `npm run test:cloud`.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KEYS } from './storageKeys';

const { mockGetSupabase } = vi.hoisted(() => ({ mockGetSupabase: vi.fn() }));
vi.mock('./supabaseClient', () => ({ getSupabase: mockGetSupabase }));

import * as store from './cloudStore';

// A chainable Supabase query-builder fake. `selectError` makes table reads error — the
// exact RLS/JWT failure that triggered the original data-loss bug.
type UpsertRow = { client_id: string };
type UpsertError = { code?: string; message: string } | null;
function makeSupa({ selectError = false, upsertError = () => null }: { selectError?: boolean; upsertError?: (rows: UpsertRow[]) => UpsertError }) {
  const deleteSpy = vi.fn();
  const upsertSpy = vi.fn();
  const from = vi.fn((table: string) => {
    const result =
      table === 'profiles'
        ? { data: { parish_id: 'p1' }, error: null }
        : selectError
          ? { data: null, error: { message: 'RLS denied / JWT expired' } }
          : { data: [], error: null };
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      not: vi.fn(() => b),
      in: vi.fn(() => b),
      range: vi.fn(() => b),
      single: vi.fn(() => Promise.resolve(result)),
      upsert: vi.fn((rows: UpsertRow[]) => { upsertSpy(table, rows); return Promise.resolve({ error: upsertError(rows) }); }),
      delete: vi.fn(() => { deleteSpy(table); return b; }),
      then: (resolve: (v: unknown) => void) => resolve(result), // `await b` resolves to result
    };
    return b;
  });
  const auth = { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) };
  return { supa: { from, auth }, deleteSpy, upsertSpy };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const K = 'parish_x_' + KEYS.collections;

describe.runIf(store.isCloud())('cloudStore — cloud write path (cloud mode)', () => {
  beforeEach(() => {
    mockGetSupabase.mockReset();
  });

  it('a FAILED hydrate → a write-through deletes AND upserts NOTHING (the parish survives)', async () => {
    const { supa, deleteSpy, upsertSpy } = makeSupa({ selectError: true });
    mockGetSupabase.mockResolvedValue(supa);

    await store.hydrateCloudStore();
    expect(store.isCloudHydrationOk()).toBe(false);

    store.cloudSet(K, JSON.stringify([{ id: 'a' }]));
    await flush();

    expect(deleteSpy).not.toHaveBeenCalled(); // the bug was: this issued DELETE-all
    expect(upsertSpy).not.toHaveBeenCalled(); // fail-closed: no write at all
  });

  it('adding a row upserts only that row and deletes NOTHING', async () => {
    const { supa, deleteSpy, upsertSpy } = makeSupa({ selectError: false });
    mockGetSupabase.mockResolvedValue(supa);

    await store.hydrateCloudStore(); // healthy hydrate → cache = [] per table
    expect(store.isCloudHydrationOk()).toBe(true);

    store.cloudSet(K, JSON.stringify([{ id: 'a' }]));
    await flush();

    expect(upsertSpy).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled(); // nothing removed → no blanket wipe
  });

  it('removing a row deletes ONLY the removed row (targeted, not a whole-table wipe)', async () => {
    const { supa, deleteSpy } = makeSupa({ selectError: false });
    mockGetSupabase.mockResolvedValue(supa);

    await store.hydrateCloudStore();

    store.cloudSet(K, JSON.stringify([{ id: 'a' }, { id: 'b' }])); // add a, b → no delete
    await flush();
    store.cloudSet(K, JSON.stringify([{ id: 'a' }]));              // remove b → one delete
    await flush();

    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('an UNCHANGED write-through (page mount rewriting identical data) writes nothing', async () => {
    const { supa, deleteSpy, upsertSpy } = makeSupa({ selectError: false });
    mockGetSupabase.mockResolvedValue(supa);

    await store.hydrateCloudStore();
    store.cloudSet(K, JSON.stringify([{ id: 'a' }])); // seed
    await flush();
    upsertSpy.mockClear();
    deleteSpy.mockClear();

    store.cloudSet(K, JSON.stringify([{ id: 'a' }])); // identical → nothing to do
    await flush();

    expect(upsertSpy).not.toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  // Two secretaries book Fr. Reyes at Main Church for the same 10:00. The database keeps one
  // and refuses the other (23P01 from the overlap trigger / EXCLUDE). The one it refused must be
  // TOLD so — not shown the wedding on her calendar and asked to "check your connection".
  it('a booking the DATABASE refuses is reported as not saved, dropped from the cache, and never queued for retry', async () => {
    const KC = 'parish_x_' + KEYS.calendarEvents;
    const refuse = (rows: UpsertRow[]): UpsertError =>
      rows.some((r) => r.client_id === 'b')
        ? { code: '23P01', message: 'calendar conflict: Wedding #2 overlaps existing event 11111111-2222-3333-4444-555555555555 (officiant/location busy at that time)' }
        : null;
    const { supa, upsertSpy } = makeSupa({ selectError: false, upsertError: refuse });
    mockGetSupabase.mockResolvedValue(supa);
    const conflicts = vi.fn();
    const errors = vi.fn();

    await store.hydrateCloudStore();
    await store.retryPendingCloudWrites(); // drain anything an earlier test left queued
    store.setCloudWriteConflictHandler(conflicts);
    store.setCloudWriteErrorHandler(errors);
    try {
      store.cloudSet(KC, JSON.stringify([{ id: 'a', type: 'wedding' }, { id: 'b', type: 'wedding' }]));
      await flush();
      await flush();

      expect(conflicts).toHaveBeenCalledWith(['Wedding #2 overlaps another event (officiant/location busy at that time)']);
      expect(errors).not.toHaveBeenCalled(); // NOT "your changes are only on this device"
      expect(store.hasPendingCloudWrites()).toBe(false); // retrying a refused booking can never succeed
      expect(JSON.parse(store.cloudGet(KC)!).map((i: { id: string }) => i.id)).toEqual(['a']); // b no longer shows as booked
      const savedAlone = upsertSpy.mock.calls.some(([, rows]) => (rows as UpsertRow[]).length === 1 && (rows as UpsertRow[])[0].client_id === 'a');
      expect(savedAlone).toBe(true); // the booking that did NOT conflict still saved
    } finally {
      store.setCloudWriteConflictHandler(null);
      store.setCloudWriteErrorHandler(null);
    }
  });

  // A save that failed (offline) must not be erased by the NEXT save succeeding. The next diff
  // has to be taken against what is actually persisted, or the earlier row is never sent and
  // "All changes saved" is a lie.
  it('a failed save is carried into the next save instead of being silently dropped', async () => {
    let offline = true;
    const { supa, upsertSpy } = makeSupa({ selectError: false, upsertError: () => (offline ? { message: 'Failed to fetch' } : null) });
    mockGetSupabase.mockResolvedValue(supa);

    await store.hydrateCloudStore();
    offline = false;
    await store.retryPendingCloudWrites(); // drain anything an earlier test left queued
    offline = true;

    store.cloudSet(K, JSON.stringify([{ id: 'x1' }]));
    await flush();
    expect(store.hasPendingCloudWrites()).toBe(true);

    offline = false;
    upsertSpy.mockClear();
    store.cloudSet(K, JSON.stringify([{ id: 'x1' }, { id: 'x2' }]));
    await flush();

    const sent = upsertSpy.mock.calls.flatMap(([, rows]) => (rows as UpsertRow[]).map((r) => r.client_id));
    expect(sent).toEqual(expect.arrayContaining(['x1', 'x2'])); // x1 was NOT dropped
    expect(store.hasPendingCloudWrites()).toBe(false);
  });
});
