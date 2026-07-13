// ═══════════════════════════════════════════════════════════
// Cloud store bridge (SaaS / online edition)
//
// The third storage backend behind the same seam as localStorage and
// SQLite. In cloud mode (VITE_CHURCHOS_MODE=cloud), the parish's data is
// hydrated from Supabase into an in-memory cache at login, so the rest of
// the app keeps reading storage *synchronously* — the UI never changed.
// Writes update the cache and reconcile to the parish's Supabase tables.
//
// Inert (and never imports Supabase) unless cloud mode is on, so the
// desktop/offline build is completely unaffected.
// ═══════════════════════════════════════════════════════════

import { KEYS } from './storageKeys';

type Row = Record<string, unknown>;
type Item = Record<string, unknown> & { id?: string };

// short dataset key (== Supabase table name) → flat columns to denormalize
// for analytics/oversight queries. The full record always lives in `data`.
const FLAT: Record<string, (i: Item) => Row> = {
  [KEYS.collections]: (i) => ({ date: i.date, mass_time: i.massTime, cash: i.cash, checks: i.checks, digital: i.digital, total: i.total, posted_by: i.postedBy, status: i.status }),
  [KEYS.journalEntries]: (i) => ({ date: i.date, reference: i.reference, description: i.description, status: i.status, total_dr: i.totalDr, total_cr: i.totalCr, posted_by: i.postedBy, lines: i.lines }),
  [KEYS.feeOverrideAudit]: (i) => ({ ts: i.timestamp, sacrament: i.sacrament, registry_id: i.registryId, person_name: i.personName, override_type: i.overrideType, amount: i.amount, reason: i.reason, recorded_by: i.recordedBy, prev_hash: i.prevHash, hash: i.hash }),
  [KEYS.baptismRecords]: (i) => ({ registry_number: i.registryNumber, date_of_baptism: i.dateOfBaptism }),
  [KEYS.marriageRecords]: (i) => ({ registry_number: i.registryNumber, date_of_marriage: i.dateOfMarriage }),
  [KEYS.confirmationRecords]: (i) => ({ registry_number: i.registryNumber, date_of_confirmation: i.dateOfConfirmation }),
  [KEYS.deathRecords]: (i) => ({ registry_number: i.registryNumber, date_of_burial: i.dateOfBurial }),
  [KEYS.families]: (i) => ({ family_name: i.familyName, barangay: i.barangay }),
  [KEYS.ministries]: (i) => ({ name: i.name }),
  [KEYS.ssdmApplications]: (i) => ({ program_type: i.programType, status: i.status }),
  [KEYS.ssdmBeneficiaries]: (i) => ({ program: i.program }),
  [KEYS.ssdmDisbursements]: (i) => ({ date: i.date, amount: i.amount }),
  [KEYS.calendarEvents]: (i) => ({ date: i.date, type: i.type, officiant: i.officiant, location: i.location }),
  [KEYS.budgetItems]: (i) => ({ account_code: i.accountCode }),
  // ── Donors, pledges & Official Receipts (lib/donors.ts) ──
  [KEYS.donors]: (i) => ({ name: i.name }),
  [KEYS.donationCampaigns]: (i) => ({ name: i.name, active: i.active }),
  [KEYS.pledges]: (i) => ({ donor_id: i.donorId, amount: i.amount }),
  [KEYS.contributions]: (i) => ({ donor_id: i.donorId, date: i.date, amount: i.amount, method: i.method, or_number: i.orNumber }),
  [KEYS.orSeries]: (i) => ({ prefix: i.prefix, year: i.year, last_number: i.lastNumber }),
  // ── Accounts receivable (unpaid / bill-later sacramental fees) ──
  [KEYS.accountsReceivable]: (i) => ({ date: i.date, description: i.description }),
  // ── Mass attendance / headcount ──
  [KEYS.attendance]: (i) => ({ event_id: i.eventId, date: i.date, count: i.count }),
  // Bare keys (no KEYS constant — kept as string literals to avoid importing the
  // page/lib modules that define them, which would create an import cycle back
  // through storageNamespaced → cloudStore).
  // Mass Intention register (Canon 958) — lib/massIntentions.ts MASS_INTENTIONS_KEY.
  ['mass_intentions']: (i) => ({ status: i.status, mass_date: i.massDate, stipend: i.stipend }),
  // Certificate template editor — RegistryPage CERT_TEMPLATES_KEY.
  ['certificate_templates']: (i) => ({ name: i.name, sacrament: i.sacrament }),
  // Import history — lib/importEngine.ts IMPORT_HISTORY_KEY.
  ['import_history']: (i) => ({ date: i.date, target_module: i.targetModule, status: i.status }),
  // App-wide audit trail — shared 'audit_log' key written by Finance/Registry/
  // Directory/Intentions/Donors/Import (`table` is a reserved word → table_name).
  ['audit_log']: (i) => ({ ts: i.timestamp, action: i.action, table_name: i.table }),
};
const TABLE_KEYS = Object.keys(FLAT);

// Tables added by churchos-saas-feature-tables.sql. Because CODE ships on redeploy
// but the SQL is applied separately, these may not yet exist when the new code first
// runs. A read against a not-yet-created table must be treated as "empty", NOT as a
// hydration failure — otherwise the whole app would fail-closed until the migration
// is applied. This ONLY relaxes the *missing relation* case for THESE keys; any other
// read error (RLS/JWT/network) on ANY table still fail-closes, preserving the
// data-loss protection on the pre-existing tables. Remove a key here once the
// migration is guaranteed applied everywhere.
const OPTIONAL_KEYS = new Set<string>([
  KEYS.donors, KEYS.donationCampaigns, KEYS.pledges, KEYS.contributions, KEYS.orSeries,
  KEYS.accountsReceivable, KEYS.attendance,
  'mass_intentions', 'certificate_templates', 'import_history', 'audit_log',
]);

// ── Singleton (per-parish key/value) settings ──
// Some keys hold ONE value per parish (an object, array, or scalar), not an array
// of records — e.g. module toggles, the fee schedule, calendar prefs. They can't
// use the row-per-item tables above, so they persist as a single jsonb row in
// parish_settings keyed by (parish_id, setting_key).
const SETTINGS_TABLE = 'parish_settings';
const SINGLETON_KEYS = new Set<string>([
  'module_overrides',        // lib/moduleRegistry.ts — feature enable/disable
  'fee_schedule',            // lib/feeSchedule.ts — ceremony/certificate fees
  'mass_schedule',           // Settings → Mass Schedule / ICS sync
  'request_stamps',          // RequestsPage — de-dupe stamps map
  'calendar_show_liturgical',// CalendarPage — liturgical overlay toggle
  'ai_context_optout',       // lib/aiContext.ts — AI parish-context opt-out
  'notify_outbox',           // lib/notify.ts — SMS/email outbox log
]);

/** Distinguish a not-yet-created table from a real (RLS/JWT/network) read error. */
function isMissingRelation(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();
  return code === '42P01'      // Postgres: undefined_table
    || code === 'PGRST205'      // PostgREST: table not found in schema cache
    || code === 'PGRST202'
    || msg.includes('does not exist')
    || msg.includes('could not find the table')
    || msg.includes('schema cache');
}

const env = (import.meta as unknown as { env: Record<string, string | undefined> }).env;
export function isCloud(): boolean {
  return env?.VITE_CHURCHOS_MODE === 'cloud' && !!env?.VITE_SUPABASE_URL && !!env?.VITE_SUPABASE_ANON_KEY;
}

// Map a full namespaced key (churchos_parish_…_collections) → its table key.
function tableFor(fullKey: string): string | null {
  return TABLE_KEYS.find((k) => fullKey.endsWith('_' + k)) ?? null;
}

// Map a full namespaced key → its singleton settings key, if any.
function singletonFor(fullKey: string): string | null {
  for (const k of SINGLETON_KEYS) if (fullKey.endsWith('_' + k)) return k;
  return null;
}

let onWriteError: (() => void) | null = null;
export function setCloudWriteErrorHandler(fn: (() => void) | null) { onWriteError = fn; }

// ── shared Supabase client (data + auth share one session) ──
import { getSupabase } from './supabaseClient';
type SupabaseLike = {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};
async function sb(): Promise<SupabaseLike> {
  return (await getSupabase()) as unknown as SupabaseLike;
}

const cache: Record<string, Item[]> = {};
// Singleton settings values (one per SINGLETON_KEYS entry) — any JSON shape.
const settingsCache: Record<string, unknown> = {};
let parishId: string | null = null;
let hydrated = false;
// hydrationOk is true ONLY when EVERY read succeeded — i.e. the cache is a FAITHFUL
// copy of the parish's data. A failed read (RLS/JWT/network blip) leaves it FALSE,
// which fail-closes every write-through below, so a load failure can never be mistaken
// for an empty parish and delete real rows. (THE data-loss bug: `error` was ignored on
// the reads, the cache went empty, and the first mount write-through reconciled [] →
// a full DELETE of the parish's records, with no user action.)
let hydrationOk = false;
// A diocese-level user (bishop / diocese_admin) has NO parish_id: they read
// cross-parish data through the diocese cockpit and never write parish tables.
// That is a VALID state, not a hydration failure — it must NOT fail-closed or
// raise the "could not save" warning on every page's mount write-through.
let noParishUser = false;

/** Load this parish's data from Supabase into the cache. Call once before render. */
export async function hydrateCloudStore(): Promise<void> {
  if (!isCloud()) return;
  let ok = true;
  noParishUser = false;
  try {
    const supa = await sb();
    const { data: userData } = await supa.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      ok = false; // not signed in → cannot have loaded this parish's data
    } else {
      const prof = await supa.from('profiles').select('parish_id').eq('id', uid).single();
      if (prof.error) {
        ok = false;
      } else if (!prof.data?.parish_id) {
        noParishUser = true;   // diocese-level user: nothing to load, nothing to write
        parishId = null;
      } else {
        parishId = prof.data.parish_id as string;
      }
    }
    if (ok && !noParishUser) {
      for (const key of TABLE_KEYS) {
        const { data, error } = await supa.from(key).select('*');
        if (error) {
          // A not-yet-migrated OPTIONAL table reads as empty (see OPTIONAL_KEYS);
          // any other read error must NOT look like an empty table → fail-closed.
          if (OPTIONAL_KEYS.has(key) && isMissingRelation(error)) { cache[key] = []; continue; }
          ok = false; break;
        }
        cache[key] = ((data as Row[]) || []).map((row) => ({ ...(row.data as Item), id: (row.client_id as string) ?? (row.id as string) }));
      }
      // Singleton settings live in one shared table (may not be migrated yet).
      if (ok) {
        const { data, error } = await supa.from(SETTINGS_TABLE).select('setting_key,data');
        if (error) {
          if (!isMissingRelation(error)) ok = false;
        } else {
          for (const row of (data as Row[]) || []) {
            settingsCache[row.setting_key as string] = row.data;
          }
        }
      }
    }
  } catch {
    ok = false;
  }
  hydrated = true;     // hydration was ATTEMPTED → the app may render
  hydrationOk = ok && !noParishUser;  // a diocese user has no writable parish cache
  // Warn ONLY on a genuine failure — never for a legitimate no-parish diocese user.
  if (!ok && onWriteError) onWriteError(); // surface the degraded / read-only state to the UI
}
export function isCloudHydrated(): boolean { return hydrated; }
export function isCloudHydrationOk(): boolean { return hydrationOk; }

export function cloudGet(fullKey: string): string | null {
  const key = tableFor(fullKey);
  if (key) return Object.prototype.hasOwnProperty.call(cache, key) ? JSON.stringify(cache[key]) : null;
  const skey = singletonFor(fullKey);
  if (skey) return Object.prototype.hasOwnProperty.call(settingsCache, skey) ? JSON.stringify(settingsCache[skey]) : null;
  return null;
}

export function cloudSet(fullKey: string, value: string): boolean {
  const key = tableFor(fullKey);
  if (key) {
    let arr: Item[];
    try { arr = JSON.parse(value); } catch { return false; }
    cache[key] = arr;
    void reconcile(key, arr);
    return true;
  }
  const skey = singletonFor(fullKey);
  if (skey) {
    let parsed: unknown;
    try { parsed = JSON.parse(value); } catch { return false; }
    settingsCache[skey] = parsed;
    void reconcileSingleton(skey, parsed);
    return true;
  }
  return true; // genuinely unmapped keys are a no-op in cloud mode
}

export function cloudRemove(fullKey: string): void {
  const key = tableFor(fullKey);
  if (key) { cache[key] = []; void reconcile(key, []); return; }
  const skey = singletonFor(fullKey);
  if (skey) { delete settingsCache[skey]; void removeSingleton(skey); }
}

export function cloudKeys(): string[] { return [...Object.keys(cache), ...Object.keys(settingsCache)]; }

// Write-through: upsert the array's rows by (parish_id, client_id), and delete
// any rows that are no longer present.
async function reconcile(key: string, arr: Item[]): Promise<void> {
  // A diocese-level user owns no parish data — silently skip any write-through
  // (e.g. a page's mount write-back) without warning; there is nothing to save.
  if (noParishUser) return;
  // FAIL-CLOSED: never write through — and ABOVE ALL never DELETE — unless hydration
  // actually succeeded and the parish is known. If the cache is not a faithful copy,
  // reconciling it would delete real rows that merely failed to load. Refuse and surface
  // the failure rather than destroy data. (Closes the data-loss bug: a failed hydrate
  // could otherwise reconcile [] and wipe the parish.)
  if (!hydrationOk || !parishId) {
    if (onWriteError) onWriteError();
    return;
  }
  // fee_override_audit is a server-enforced APPEND-ONLY ledger (trg_audit_no_mutate
  // raises on any UPDATE/DELETE). Re-sending the whole array with a normal upsert
  // executes ON CONFLICT DO UPDATE on already-persisted rows → the trigger throws and
  // the whole write is abandoned, so only the FIRST waiver ever persisted. For this
  // table: INSERT unseen rows only (ON CONFLICT DO NOTHING, which never UPDATEs) and
  // NEVER issue the reconcile DELETE.
  const appendOnly = key === KEYS.feeOverrideAudit;
  try {
    const supa = await sb();
    const rows = arr.map((i) => ({ parish_id: parishId, client_id: i.id, data: i, ...FLAT[key](i) }));
    if (rows.length) {
      const up = appendOnly
        ? await supa.from(key).upsert(rows, { onConflict: 'parish_id,client_id', ignoreDuplicates: true })
        : await supa.from(key).upsert(rows, { onConflict: 'parish_id,client_id' });
      if (up.error) throw up.error;
    }
    if (!appendOnly) {
      const ids = arr.map((i) => i.id).filter(Boolean);
      let del = supa.from(key).delete().eq('parish_id', parishId);
      del = ids.length ? del.not('client_id', 'in', `(${ids.join(',')})`) : del;
      const res = await del;
      if (res.error) throw res.error;
    }
  } catch {
    if (onWriteError) onWriteError();
  }
}

// Write-through for a singleton settings value: upsert the one (parish_id,
// setting_key) row. Same fail-closed guard as reconcile() — never write when the
// cache isn't a faithful copy of the parish's data. There is no DELETE here (one
// value, upserted in place), so this can never wipe other keys.
async function reconcileSingleton(skey: string, value: unknown): Promise<void> {
  if (noParishUser) return;
  if (!hydrationOk || !parishId) {
    if (onWriteError) onWriteError();
    return;
  }
  try {
    const supa = await sb();
    const res = await supa.from(SETTINGS_TABLE).upsert(
      [{ parish_id: parishId, setting_key: skey, data: value }],
      { onConflict: 'parish_id,setting_key' },
    );
    if (res.error) throw res.error;
  } catch {
    if (onWriteError) onWriteError();
  }
}

async function removeSingleton(skey: string): Promise<void> {
  if (noParishUser) return;
  if (!hydrationOk || !parishId) { if (onWriteError) onWriteError(); return; }
  try {
    const supa = await sb();
    const res = await supa.from(SETTINGS_TABLE).delete().eq('parish_id', parishId).eq('setting_key', skey);
    if (res.error) throw res.error;
  } catch {
    if (onWriteError) onWriteError();
  }
}
