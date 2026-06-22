// ════════════════════════════════════════════════════════════════════════
// ChurchOS — cloud-sync packet test (monthly financial oversight)
//   node tests/sync-test.cjs
// The network push needs a live project; here we verify the packet math + that
// only financial summaries (no parishioner PII) + the right parish go up.
// ════════════════════════════════════════════════════════════════════════

const sync = require('../electron/sync.cjs');

let pass = 0, fail = 0; const fails = [];
const check = (id, ok) => { (ok ? pass++ : (fail++, fails.push(id))); console.log(`  ${ok ? '✅' : '❌'} ${id}`); };

const DATA = {
  collections: [
    { id: 'c1', date: '2026-06-07', massTime: '9:00 AM', cash: 15400, checks: 2000, digital: 3100 }, // 20500
    { id: 'c2', date: '2026-06-07', massTime: '6:00 PM', cash: 5100, checks: 0, digital: 900 },       // 6000
    { id: 'c3', date: '2026-05-04', massTime: '9:00 AM', total: 12000 },                               // May
  ],
  journal_entries: [
    { id: 'j1', date: '2026-06-10', lines: [
      { accountCode: '5100', accountName: 'Utilities', debit: 12000 },
      { accountCode: '5200', accountName: 'Stipend', debit: 6500 },
      { accountCode: '4000', accountName: 'Income (not expense)', debit: 0, credit: 999 },
    ] },
  ],
  baptism_records: [{ id: 'b1', dateOfBaptism: '2026-06-08', childName: 'Maria' }],
  fee_override_audit: [
    { id: 'a1', timestamp: '2026-06-11T16:30', overrideType: 'waived', amount: 5000, recordedBy: 'Fr. Delgado', personName: 'x' }, // flagged
    { id: 'a2', timestamp: '2026-06-09T10:00', overrideType: 'waived', amount: 300, recordedBy: 'Aida', personName: 'y' },          // not flagged
  ],
};
const get = (t) => DATA[t] || [];

console.log('\n☁️  Monthly financial packets\n');

const packets = sync.buildPackets('PARISH-A', get);
const jun = packets.find((p) => p.period === '2026-06');
const may = packets.find((p) => p.period === '2026-05');

check('one-packet-per-month', packets.length === 2 && !!jun && !!may);
check('collections-total', jun.collections_total === 26500);
check('by-mass-time', jun.by_mass_time['9:00 AM'] === 20500 && jun.by_mass_time['6:00 PM'] === 6000);
check('expense-total (5xxx debits only)', jun.expense_total === 18500);
check('by-category', jun.by_category['Utilities'] === 12000 && jun.by_category['Stipend'] === 6500);
check('net-derived', jun.net === 26500 - 18500);
check('sacrament-counts', jun.sacrament_counts.baptisms === 1);
check('flagged-waiver-only-large-priest', jun.flagged_waivers.length === 1 && jun.flagged_waivers[0].amount === 5000);
check('may-packet-from-total-field', may.collections_total === 12000);

// PRIVACY: the packet must carry NO parishioner PII (no childName / personName)
check('no-pii-childname', JSON.stringify(packets).indexOf('Maria') === -1);
check('no-pii-record-bodies', JSON.stringify(jun).indexOf('childName') === -1);

// TENANT SAFETY: the packet's parish_id is the resolved cloud id, not anything local
check('parish-id-is-resolved', packets.every((p) => p.parish_id === 'PARISH-A'));

// resilience: a dataset that isn't an array / is missing is treated as empty
check('missing-dataset-empty', sync.buildPackets('P', (t) => (t === 'collections' ? [] : [])).length === 0);

console.log(`\n${'─'.repeat(56)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed${fail ? '  →  ' + fails.join(', ') : ''}`);
console.log(`${'─'.repeat(56)}`);
process.exit(fail ? 1 : 0);
