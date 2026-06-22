// ════════════════════════════════════════════════════════════════════════
// ChurchOS — database-structure / integrity break-test
//
// Models the structural invariants now enforced in churchos-saas-setup.sql
// (§5c derive triggers + constraints) and the desktop fail-safe getJSON
// (storageNamespaced.ts), then runs the red-team's integrity attacks against
// them. Faithful JS mirrors — the live proof is running the SQL on Supabase.
//   node tests/db-structure.cjs
// ════════════════════════════════════════════════════════════════════════

let pass = 0, fail = 0; const fails = [];
const check = (id, ok) => { (ok ? pass++ : (fail++, fails.push(id))); console.log(`  ${ok ? '✅' : '❌'} ${id}`); };
const num = (x) => (x == null ? 0 : Number(x));
const finiteOk = (x) => Number.isFinite(x);

// ── CLOUD: derive_collections (flat = derived projection of data) ──
function writeCollection(row) {
  const d = row.data;
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new Error('data must be a JSON object');
  if (row.client_id == null) throw new Error('client_id NOT NULL');
  const cash = num(d.cash), checks = num(d.checks), digital = num(d.digital);
  const total = cash + checks + digital;                    // derived, client flat ignored
  if (!(finiteOk(cash) && finiteOk(checks) && finiteOk(digital) && cash >= 0 && checks >= 0 && digital >= 0 && total <= 100000000)) {
    throw new Error('amounts must be finite, >= 0, in range');
  }
  return { client_id: row.client_id, cash, checks, digital, total, mass_time: d.massTime,
           status: d.status ?? 'Posted', data: { ...d, total } };
}

// ── CLOUD: derive_journal (balanced, lines is an array) ──
function writeJournal(row) {
  const d = row.data;
  if (typeof d !== 'object' || d === null || Array.isArray(d)) throw new Error('data must be a JSON object');
  if (row.client_id == null) throw new Error('client_id NOT NULL');
  if (d.lines !== undefined && !Array.isArray(d.lines)) throw new Error('lines must be an array');
  const dr = num(d.totalDr), cr = num(d.totalCr);
  if (dr !== cr) throw new Error('journal not balanced');
  return { total_dr: dr, total_cr: cr, lines: d.lines ?? [] };
}

// ── CLOUD: audit chain — no forks (unique parish_id, prev_hash) ──
const auditIdx = new Set();
function writeAudit(parish, data) {
  if (typeof data !== 'object' || data === null) throw new Error('data must be a JSON object');
  const prev = data.prevHash;
  if (prev && prev !== 'GENESIS') { const k = parish + '|' + prev; if (auditIdx.has(k)) throw new Error('chain fork'); auditIdx.add(k); }
  return { amount: num(data.amount), recorded_by: data.recordedBy, hash: data.hash };
}

const throws = (fn) => { try { fn(); return false; } catch { return true; } };

console.log('\n🧱  Database structure / integrity attacks\n');

// (a) denormalization drift — client sends flat total=0 but data.total=99999
{
  const r = writeCollection({ client_id: 'c1', total: 0, data: { cash: 100, checks: 0, digital: 0, total: 99999, massTime: '6:00 AM' } });
  check('drift-flat-ignored (flat derived from data parts)', r.total === 100 && r.data.total === 100);
}
// inflated total with no component backing → recomputed to 0
{
  const r = writeCollection({ client_id: 'c2', data: { cash: 0, checks: 0, digital: 0, total: 999999 } });
  check('inflated-total-recomputed-to-sum', r.total === 0 && r.data.total === 0);
}
// null flat columns can't underreport — derived from data
{
  const r = writeCollection({ client_id: 'c3', cash: null, total: null, data: { cash: 500, checks: 100, digital: 0 } });
  check('null-flat-no-underreport', r.total === 600);
}
check('client_id-null-rejected', throws(() => writeCollection({ client_id: null, data: { cash: 1 } })));
check('data-scalar-rejected', throws(() => writeCollection({ client_id: 'c4', data: 5 })));
check('negative-amount-rejected', throws(() => writeCollection({ client_id: 'c5', data: { cash: -100 } })));
check('NaN-amount-rejected', throws(() => writeCollection({ client_id: 'c6', data: { cash: 'NaN' } })));
check('overflow-amount-rejected', throws(() => writeCollection({ client_id: 'c7', data: { cash: 1e12 } })));

// (c) journal invariants
check('journal-unbalanced-rejected', throws(() => writeJournal({ client_id: 'j1', data: { totalDr: 100, totalCr: 50 } })));
check('journal-balanced-ok', !throws(() => writeJournal({ client_id: 'j2', data: { totalDr: 100, totalCr: 100, lines: [] } })));
check('journal-lines-nonarray-rejected', throws(() => writeJournal({ client_id: 'j3', data: { totalDr: 0, totalCr: 0, lines: { a: 1 } } })));

// (e) audit chain — fork blocked, parallel GENESIS roots allowed
writeAudit('p1', { prevHash: 'h1', hash: 'h2' });
check('audit-chain-fork-blocked', throws(() => writeAudit('p1', { prevHash: 'h1', hash: 'h2b' })));
check('audit-genesis-roots-allowed', !throws(() => { writeAudit('p1', { prevHash: 'GENESIS', hash: 'g1' }); writeAudit('p1', { prevHash: 'GENESIS', hash: 'g2' }); }));

// ── DESKTOP: fail-safe getJSON (no silent blanking) ──
function getJSON(raw, fallback) {
  let quarantined = false, preserved = null;
  if (raw === null) return { value: fallback, quarantined };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(fallback) && !Array.isArray(parsed)) throw new Error('shape');
    return { value: parsed, quarantined };
  } catch {
    quarantined = true; preserved = raw;   // corrupt bytes kept, not silently dropped
    return { value: fallback, quarantined, preserved };
  }
}
{
  const r = getJSON(null, []);
  check('kv-absent-key-uses-default', r.value.length === 0 && !r.quarantined);
}
{
  const r = getJSON('[1,2,3]', []);
  check('kv-valid-json-returned', JSON.stringify(r.value) === '[1,2,3]' && !r.quarantined);
}
{
  const r = getJSON('{bad json', []);
  check('kv-corrupt-quarantined-not-blanked', r.quarantined === true && r.preserved === '{bad json' && Array.isArray(r.value));
}
{
  const r = getJSON('{"a":1}', []);    // valid JSON but wrong shape for an array dataset
  check('kv-shape-mismatch-quarantined', r.quarantined === true && Array.isArray(r.value));
}

console.log(`\n${'─'.repeat(58)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed${fail ? '  →  ' + fails.join(', ') : ''}`);
console.log(`${'─'.repeat(58)}`);
console.log('\nDeeper follow-ups (documented, not in this harness):');
console.log('  • audit hash is still client djb2 (advisory) — true tamper-evidence needs a');
console.log('    server-side HMAC trigger. • desktop KV remains schemaless by design (offline);');
console.log('    auto-backup is the safety net behind quarantine.');
process.exit(fail ? 1 : 0);
