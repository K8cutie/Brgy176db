// Regression test for the data-loss bug: a FAILED cloud hydrate (an RLS/JWT/network
// error on a read) must NEVER look like an empty parish and let a write-through delete
// the parish's real rows. The fix fail-closes every reconcile unless hydration actually
// succeeded. (1) failed hydrate → hydrationOk false AND a write-through issues ZERO
// deletes; (2) healthy hydrate → writes still reconcile (no regression).
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
// exact RLS/JWT failure that triggered the data-loss bug.
function makeSupa({ selectError = false }: { selectError?: boolean }) {
  const deleteSpy = vi.fn();
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
      single: vi.fn(() => Promise.resolve(result)),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
      delete: vi.fn(() => { deleteSpy(table); return b; }),
      then: (resolve: (v: unknown) => void) => resolve(result), // `await b` resolves to result
    };
    return b;
  });
  const auth = { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'u1' } } })) };
  return { supa: { from, auth }, deleteSpy };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe.runIf(store.isCloud())('cloudStore — fail-closed data-loss guard (cloud mode)', () => {
  beforeEach(() => {
    mockGetSupabase.mockReset();
  });

  it('a FAILED hydrate leaves hydrationOk=false AND a write-through deletes NOTHING (the parish survives)', async () => {
    const { supa, deleteSpy } = makeSupa({ selectError: true });
    mockGetSupabase.mockResolvedValue(supa);

    await store.hydrateCloudStore();
    expect(store.isCloudHydrationOk()).toBe(false);

    // the unconditional mount write-through of the (empty, because hydrate failed) state:
    store.cloudSet('parish_x_' + KEYS.collections, JSON.stringify([]));
    await flush();

    expect(deleteSpy).not.toHaveBeenCalled(); // ← the bug was: this issued DELETE-all
  });

  it('a SUCCESSFUL hydrate sets hydrationOk=true and a write-through still reconciles (no regression)', async () => {
    const { supa, deleteSpy } = makeSupa({ selectError: false });
    mockGetSupabase.mockResolvedValue(supa);

    await store.hydrateCloudStore();
    expect(store.isCloudHydrationOk()).toBe(true);

    store.cloudSet('parish_x_' + KEYS.collections, JSON.stringify([{ id: 'a' }]));
    await flush();

    expect(deleteSpy).toHaveBeenCalled(); // a healthy write-through reconciles normally
  });
});
