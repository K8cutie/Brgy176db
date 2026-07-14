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
function makeSupa({ selectError = false }: { selectError?: boolean }) {
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
      upsert: vi.fn((rows: unknown) => { upsertSpy(table, rows); return Promise.resolve({ error: null }); }),
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
});
