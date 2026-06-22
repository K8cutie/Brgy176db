// ChurchOS — cloud sync (main process)
//
// Local-first: the secretary works fully OFFLINE on the local SQLite store. The
// diocese↔parish link is MONTHLY and only for FINANCIAL OVERSIGHT, so this pushes
// a compact monthly SUMMARY PACKET per parish — never parishioner records. The
// diocese cockpit rolls these up. Parishioner PII (baptisms, families) NEVER
// leaves the parish.
//
// Auth uses the PARISH'S cloud account (from onboarding). The local scrypt login
// is separate, so daily work never depends on the network.

const db = require('./db.cjs');

const SYNC_KEY = 'sync_config'; // app_meta

// Persistence seam (tests inject an in-memory store).
let store = db;
function __setStore(s) { store = s; }

let lastResult = { state: 'idle' };

function getConfig() { try { return JSON.parse(store.metaGet(SYNC_KEY) || '{}'); } catch { return {}; } }
function setConfig(patch) { const c = { ...getConfig(), ...patch }; store.metaSet(SYNC_KEY, JSON.stringify(c)); return getStatus(); }
function getStatus() {
  const c = getConfig();
  return { configured: !!(c.url && c.anonKey && c.email && c.password), url: c.url || '', email: c.email || '', lastSyncAt: c.lastSyncAt || null, state: lastResult.state, message: lastResult.message };
}

// ── read local records for a dataset ──
function localRecords(table) {
  const all = store.getAll();
  const key = Object.keys(all).find((k) => k.endsWith('_' + table));
  if (!key) return [];
  try { const v = JSON.parse(all[key]); return Array.isArray(v) ? v : []; } catch { return []; }
}

// ── build the monthly financial packets (pure — unit-tested) ──
const monthOf = (d) => { const m = String(d || '').slice(0, 7); return /^\d{4}-\d{2}$/.test(m) ? m : null; };
const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

function buildPackets(parishId, get) {
  const periods = new Map();
  const ensure = (p) => {
    if (!periods.has(p)) periods.set(p, {
      parish_id: parishId, period: p, collections_total: 0, expense_total: 0,
      by_mass_time: {}, by_category: {},
      sacrament_counts: { baptisms: 0, marriages: 0, confirmations: 0, deaths: 0 },
      flagged_waivers: [],
    });
    return periods.get(p);
  };

  for (const c of get('collections')) {
    const m = monthOf(c.date); if (!m) continue;
    const pk = ensure(m);
    const tot = c.total != null ? n(c.total) : n(c.cash) + n(c.checks) + n(c.digital);
    pk.collections_total += tot;
    const mass = c.massTime || '—';
    pk.by_mass_time[mass] = (pk.by_mass_time[mass] || 0) + tot;
  }
  for (const j of get('journal_entries')) {
    const m = monthOf(j.date); if (!m) continue;
    const pk = ensure(m);
    for (const l of j.lines || []) {
      if (n(l.debit) > 0 && String(l.accountCode || '').startsWith('5')) { // 5xxx = expense
        pk.expense_total += n(l.debit);
        const cat = l.accountName || 'Other';
        pk.by_category[cat] = (pk.by_category[cat] || 0) + n(l.debit);
      }
    }
  }
  const SAC = { baptism_records: ['baptisms', 'dateOfBaptism'], marriage_records: ['marriages', 'dateOfMarriage'], confirmation_records: ['confirmations', 'dateOfConfirmation'], death_records: ['deaths', 'dateOfBurial'] };
  for (const [table, [key, dateField]] of Object.entries(SAC)) {
    for (const r of get(table)) { const m = monthOf(r[dateField]); if (m) ensure(m).sacrament_counts[key]++; }
  }
  for (const a of get('fee_override_audit')) {
    const m = monthOf(a.timestamp || a.date); if (!m) continue;
    if (a.overrideType === 'waived' && n(a.amount) >= 3000 && /^fr\.|father|priest/i.test(a.recordedBy || '')) {
      ensure(m).flagged_waivers.push({ person: a.personName, amount: n(a.amount), reason: a.reason, by: a.recordedBy });
    }
  }
  return [...periods.values()].map((pk) => ({ ...pk, net: pk.collections_total - pk.expense_total }));
}

// ── network ──
async function authToken(c) {
  const res = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: c.anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  if (!res.ok) throw new Error('cloud sign-in failed (' + res.status + ') — check the email/password');
  const j = await res.json();
  if (!j.access_token) throw new Error('cloud sign-in returned no token');
  return j.access_token;
}
async function resolveParishId(c, token) {
  const res = await fetch(`${c.url}/rest/v1/profiles?select=parish_id`, { headers: { apikey: c.anonKey, Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('could not read your cloud profile (' + res.status + ')');
  const rows = await res.json();
  const pid = rows && rows[0] && rows[0].parish_id;
  if (!pid) throw new Error('this cloud account is not assigned to a parish yet — accept your invite first');
  return pid;
}
async function pushPackets(c, token, packets) {
  if (!packets.length) return 0;
  const res = await fetch(`${c.url}/rest/v1/diocese_reports?on_conflict=parish_id,period`, {
    method: 'POST',
    headers: { apikey: c.anonKey, Authorization: 'Bearer ' + token, 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(packets),
  });
  if (!res.ok) throw new Error(`reports: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return packets.length;
}

async function syncNow() {
  const c = getConfig();
  if (!c.url || !c.anonKey || !c.email || !c.password) { lastResult = { state: 'error', message: 'Cloud sync is not configured yet.' }; return getStatus(); }
  lastResult = { state: 'syncing' };
  try {
    const token = await authToken(c);
    const parishId = await resolveParishId(c, token);
    const packets = buildPackets(parishId, (t) => localRecords(t));
    const pushed = await pushPackets(c, token, packets);
    const cfg = getConfig(); cfg.lastSyncAt = new Date().toISOString(); store.metaSet(SYNC_KEY, JSON.stringify(cfg));
    lastResult = { state: 'ok', message: `Sent ${pushed} monthly financial report${pushed === 1 ? '' : 's'} to the diocese.` };
  } catch (e) {
    lastResult = { state: 'error', message: String((e && e.message) || e) };
  }
  return getStatus();
}

module.exports = { getStatus, setConfig, syncNow, buildPackets, localRecords, __setStore };
