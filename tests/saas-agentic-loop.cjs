// ════════════════════════════════════════════════════════════════════════
// ChurchOS SaaS — agentic-loop tenancy break-test
//
// A faithful simulation of the multi-tenant RLS policies (churchos-saas-setup.sql)
// and the diocese cockpit (DioceseCockpit.tsx), driven by persona actors who try
// every attack a red-team "sneaky secretary" agent proposed. It mirrors the SQL
// policy logic in JS so it runs with zero infra — the *live* proof is the RLS
// probe SQL at the bottom of churchos-saas-setup notes; this is the reproducible
// regression net + design-gap finder.
//
//   Personas:  Aida (sec, St. Mary)  ·  Ben (sec, San Roque)
//              Bp. Tomas (Manila)    ·  Bp. Cruz (Cubao, other diocese)
//
// Run:  node tests/saas-agentic-loop.cjs
// ════════════════════════════════════════════════════════════════════════

// The two hardenings the red-team surfaced are now in the real code, so they're
// ON by default (this file is a regression net). Run with RAW=1 to reproduce the
// original gaps the loop found: c5 (negative amounts) + d6 (split-waiver evasion).
const RAW = process.env.RAW === '1';
const FIX_AMOUNT_CHECK = !RAW;   // schema CHECK(amount >= 0)  → churchos-saas-setup.sql §4c
const FIX_WAIVER_AGG  = !RAW;    // cockpit aggregates priest waivers → DioceseCockpit.tsx

// ── tenancy (derived ONLY from profiles, never from a client claim) ──
const profiles = {
  'u-aida':  { parish: 'p-stmary',   diocese: 'd-manila', role: 'secretary' },
  'u-ben':   { parish: 'p-sanroque', diocese: 'd-manila', role: 'secretary' },
  'u-tomas': { parish: null,         diocese: 'd-manila', role: 'bishop' },
  'u-cruz':  { parish: null,         diocese: 'd-cubao',  role: 'bishop' },
};
const parishDiocese = { 'p-stmary': 'd-manila', 'p-sanroque': 'd-manila', 'p-stonino': 'd-cubao' };
const isDioceseRole = (r) => r === 'bishop' || r === 'diocese_admin';

// ── seed (mirrors churchos-saas-seed.sql) ──
const db = {
  collections: [
    { id: 'SM-C001', parish_id: 'p-stmary',   mass_time: '6:00 AM', total: 9700 },
    { id: 'SM-C002', parish_id: 'p-stmary',   mass_time: '9:00 AM', total: 20500 },
    { id: 'SM-C003', parish_id: 'p-stmary',   mass_time: '6:00 PM', total: 6000 },
    { id: 'SR-C001', parish_id: 'p-sanroque', mass_time: '7:00 AM', total: 13000 },
    { id: 'SR-C002', parish_id: 'p-sanroque', mass_time: '10:00 AM', total: 26600 },
    { id: 'SR-C003', parish_id: 'p-sanroque', mass_time: '5:00 PM', total: 4500 },
    { id: 'SN-C001', parish_id: 'p-stonino',  mass_time: '8:00 AM', total: 10000 },
  ],
  fee_override_audit: [
    { id: 'SM-A001', parish_id: 'p-stmary',   override_type: 'waived', amount: 300,  recorded_by: 'Aida',        person_name: 'Maria Santos', reason: 'Indigent family' },
    { id: 'SR-A001', parish_id: 'p-sanroque', override_type: 'waived', amount: 5000, recorded_by: 'Fr. Delgado', person_name: '(undisclosed)', reason: 'Family hardship' },
  ],
  profiles: Object.entries(profiles).map(([id, p]) => ({ id, ...p })),
};

// ── RLS engine: every op resolves tenancy from `profiles[asUser]` ──
function select(table, asUser, clientFilter) {
  const me = profiles[asUser];
  let rows = db[table].slice();
  if (table === 'profiles') rows = rows.filter((r) => r.id === asUser);            // profiles_self
  else if (isDioceseRole(me.role)) rows = rows.filter((r) => parishDiocese[r.parish_id] === me.diocese); // diocese read
  else rows = rows.filter((r) => r.parish_id === me.parish);                       // parish read
  if (clientFilter) rows = rows.filter(clientFilter);                              // attacker's own .eq()
  return rows;
}
function insert(table, asUser, row) {
  const me = profiles[asUser];
  // profiles: no client INSERT — the row is created only by the definer trigger
  // with the default role, so nobody self-provisions as bishop.
  if (table === 'profiles') return { error: 'no client insert on profiles (definer-only)' };
  if (isDioceseRole(me.role)) return { error: 'diocese role has no write policy' };
  if (row.parish_id !== me.parish) return { error: 'WITH CHECK failed: parish_id != own' };
  if (FIX_AMOUNT_CHECK && typeof row.amount === 'number' && row.amount < 0) return { error: 'CHECK failed: amount < 0' };
  if (FIX_AMOUNT_CHECK && typeof row.total === 'number' && row.total < 0) return { error: 'CHECK failed: total < 0' };
  db[table].push(row); return { ok: true };
}
function update(table, asUser, id, patch) {
  const me = profiles[asUser];
  if (table === 'profiles') {
    if ('role' in patch || 'parish_id' in patch || 'diocese_id' in patch) return { error: 'role/parish/diocese immutable to user' };
  }
  if (table === 'fee_override_audit') return { error: 'audit is append-only (no UPDATE policy)' };
  const row = db[table].find((r) => r.id === id && r.parish_id === me.parish); // USING parish=own
  if (!row) return { error: 'row not visible / not owned' };
  if ('parish_id' in patch && patch.parish_id !== me.parish) return { error: 'WITH CHECK failed: cannot reassign parish_id' };
  Object.assign(row, patch); return { ok: true };
}
function del(table, asUser, id) {
  if (table === 'fee_override_audit') return { error: 'audit is append-only (no DELETE policy)' };
  if (table === 'profiles') return { error: 'no client delete on profiles' };
  const me = profiles[asUser];
  const i = db[table].findIndex((r) => r.id === id && r.parish_id === me.parish);
  if (i < 0) return { error: 'row not visible / not owned' };
  db[table].splice(i, 1); return { ok: true };
}

// ── the diocese cockpit oversight (mirrors DioceseCockpit.tsx) ──
function cockpit(asUser) {
  const cols = select('collections', asUser);
  const audit = select('fee_override_audit', asUser);
  const byParish = {}, byMass = {};
  for (const c of cols) { byParish[c.parish_id] = (byParish[c.parish_id] || 0) + c.total; byMass[c.mass_time] = (byMass[c.mass_time] || 0) + c.total; }
  const lowestMass = Object.entries(byMass).sort((a, b) => a[1] - b[1])[0];
  const isPriest = (n) => /^fr\.|father|priest/i.test(n || '');

  let flagged;
  if (FIX_WAIVER_AGG) {
    // aggregate per (parish, recorder) so split waivers can't slip under the bar
    const sum = {};
    for (const a of audit) if (a.override_type === 'waived' && isPriest(a.recorded_by)) { const k = a.parish_id + '|' + a.recorded_by; sum[k] = (sum[k] || 0) + a.amount; }
    flagged = Object.entries(sum).filter(([, amt]) => amt >= 3000).map(([k, amt]) => ({ key: k, amount: amt }));
  } else {
    flagged = audit.filter((a) => a.override_type === 'waived' && a.amount >= 3000 && isPriest(a.recorded_by)).map((a) => ({ key: a.parish_id + '|' + a.recorded_by, amount: a.amount }));
  }
  return { parishesSeen: Object.keys(byParish), byParish, lowestMass, flagged };
}

// ── tiny assert harness ──
let pass = 0, fail = 0; const fails = [];
function check(id, group, desc, ok) {
  (ok ? (pass++) : (fail++, fails.push(id)));
  console.log(`  ${ok ? '✅' : '❌'} [${group}] ${id} — ${desc}`);
}

console.log('\n🎭  Personas acting + red-team attacks\n');

// (A) cross-parish reads
check('a1-handcrafted-parish-filter', 'A', 'Aida .eq(parish, San Roque) → empty',
  select('collections', 'u-aida', (r) => r.parish_id === 'p-sanroque').length === 0);
check('a2-unfiltered-select-all', 'A', 'Aida select * → only her parish',
  select('collections', 'u-aida').every((r) => r.parish_id === 'p-stmary') && select('collections', 'u-aida').length === 3);
check('a5-count-leak', 'A', 'Aida count → 3 (own only)',
  select('collections', 'u-aida').length === 3);

// (B) cross-diocese reads
check('b1-cross-diocese-as-secretary', 'B', 'Aida tries Sto. Niño (other diocese) → empty',
  select('collections', 'u-aida', (r) => r.parish_id === 'p-stonino').length === 0);
check('b2-forged-role-claim', 'B', 'Aida forges role=bishop in JWT → ignored, still isolated',
  select('collections', 'u-aida').every((r) => r.parish_id === 'p-stmary')); // engine reads role from profiles, not claim
check('b3-diocese-boundary-hop', 'B', 'Bp. Tomas cannot see Sto. Niño (Cubao)',
  select('collections', 'u-tomas', (r) => r.parish_id === 'p-stonino').length === 0);

// (C) tamper / escalation / forged writes
check('c1-self-escalate-role', 'C', 'Aida sets her role=bishop → blocked',
  !!update('profiles', 'u-aida', 'u-aida', { role: 'bishop' }).error);
check('c1b-profiles-insert-as-bishop', 'C', 'Aida inserts a self-profile as bishop → blocked',
  !!insert('profiles', 'u-aida', { id: 'u-aida', parish_id: 'p-stmary', role: 'bishop' }).error);
check('c1c-profiles-delete-self', 'C', 'Aida deletes her profile (to recreate as bishop) → blocked',
  !!del('profiles', 'u-aida', 'u-aida').error);
check('c2-forged-parish-insert', 'C', 'Aida inserts a row tagged San Roque → blocked',
  !!insert('collections', 'u-aida', { id: 'X1', parish_id: 'p-sanroque', mass_time: '6:00 AM', total: 100 }).error);
check('c3-parish-reassign-update', 'C', 'Aida flips her row to San Roque → blocked',
  !!update('collections', 'u-aida', 'SM-C001', { parish_id: 'p-sanroque' }).error);
check('c5-negative-amount', 'C', 'Aida posts a negative collection → blocked',
  !!insert('collections', 'u-aida', { id: 'X2', parish_id: 'p-stmary', mass_time: '6:00 AM', total: -5000 }).error);

// (D) audit / waiver abuse
const waiverWrite = insert('fee_override_audit', 'u-ben', { id: 'SR-A002', parish_id: 'p-sanroque', override_type: 'waived', amount: 4000, recorded_by: 'Fr. Delgado', person_name: 'x' });
check('d1-self-recorded-large-waiver', 'D', 'Ben/Fr ₱4,000 waiver → allowed + logged',
  waiverWrite.ok === true);
check('d3-audit-row-delete', 'D', 'Ben deletes an audit row → blocked',
  !!del('fee_override_audit', 'u-ben', 'SR-A001').error);
check('d5-cross-parish-audit-insert', 'D', 'Aida frames San Roque with a forged audit → blocked',
  !!insert('fee_override_audit', 'u-aida', { id: 'F1', parish_id: 'p-sanroque', override_type: 'waived', amount: 9000, recorded_by: 'Fr. Delgado' }).error);

// d6: split a ₱5,000 waiver into 2×₱2,500 to dodge the flag
db.fee_override_audit = db.fee_override_audit.filter((r) => r.id !== 'SR-A002'); // reset d1 write
insert('fee_override_audit', 'u-ben', { id: 'SR-S1', parish_id: 'p-sanroque', override_type: 'waived', amount: 2500, recorded_by: 'Fr. Delgado', person_name: 'split' });
insert('fee_override_audit', 'u-ben', { id: 'SR-S2', parish_id: 'p-sanroque', override_type: 'waived', amount: 2500, recorded_by: 'Fr. Delgado', person_name: 'split' });
// remove the single ₱5,000 so we test the SPLIT in isolation
db.fee_override_audit = db.fee_override_audit.filter((r) => r.id !== 'SR-A001');
const ck = cockpit('u-tomas');
check('d6-flag-threshold-evasion', 'D', 'Two ₱2,500 priest waivers (=₱5,000) still get flagged',
  ck.flagged.some((f) => f.key === 'p-sanroque|Fr. Delgado' && f.amount >= 3000));

// ── cockpit correctness ──
db.fee_override_audit.push({ id: 'SR-A001', parish_id: 'p-sanroque', override_type: 'waived', amount: 5000, recorded_by: 'Fr. Delgado', person_name: '(undisclosed)' });
const c = cockpit('u-tomas');
console.log('\n🪙  Bishop Tomas opens the diocese cockpit\n');
check('cockpit-rollup', 'COCKPIT', 'sees St. Mary + San Roque, NOT Sto. Niño',
  c.parishesSeen.sort().join(',') === 'p-sanroque,p-stmary');
check('cockpit-lowest-mass', 'COCKPIT', `lowest Mass diocese-wide = San Roque 5:00 PM ₱4,500 (got ${c.lowestMass[0]} ₱${c.lowestMass[1]})`,
  c.lowestMass[0] === '5:00 PM' && c.lowestMass[1] === 4500);
check('cockpit-flag-real', 'COCKPIT', 'flags San Roque priest waiver(s) for review',
  c.flagged.some((f) => f.key === 'p-sanroque|Fr. Delgado'));
check('cockpit-no-false-flag', 'COCKPIT', "does NOT flag Aida's small ₱300 charity waiver",
  !c.flagged.some((f) => f.key.startsWith('p-stmary')));

// ── report ──
console.log(`\n${'─'.repeat(60)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed${fail ? '  →  ' + fails.join(', ') : ''}`);
console.log(`mode: ${RAW ? 'RAW (as-first-written — shows the 2 gaps)' : 'HARDENED (current code)'}`);
console.log(`${'─'.repeat(60)}`);
console.log('\nNot simulated here (need the live DB / app layer — verify on the real project):');
console.log('  a3 embed-leak, a4 SECURITY DEFINER RPC bypass, d2 waiver-without-audit, d4 hash-chain forgery');
process.exit(fail ? 1 : 0);
