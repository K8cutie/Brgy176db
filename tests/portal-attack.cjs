// ════════════════════════════════════════════════════════════════════════
// ChurchOS — parishioner portal intake break-test
// Models the normalize_request trigger + public-submit RLS (churchos-saas-portal.sql)
// and fires the abuse vectors at the public-write surface.
//   node tests/portal-attack.cjs
// ════════════════════════════════════════════════════════════════════════

// Parish published fees + intake opt-in (parishes.public_config)
const FEES = { p1: { mass_intention: 200, certificate: 150 }, p2: { mass_intention: 250 } };
const INTAKE = { p1: true, p2: true, p3: false };   // p3 exists but hasn't enabled online intake
const VALID_TYPES = ['mass_intention', 'certificate', 'donation', 'event_booking'];

// The authoritative server path: a public submit is normalized by the trigger,
// which IGNORES any client-set status/payment/amount/ref.
function publicSubmit(parishId, type, payload = {}) {
  if (!VALID_TYPES.includes(type)) throw new Error('invalid type');                   // CHECK
  if (payload.details && typeof payload.details !== 'object') throw new Error('details must be object');
  if (!INTAKE[parishId]) throw new Error('parish not accepting online requests');     // #4 opt-in (secure default off)
  const row = { parish_id: parishId, type };
  row.status = 'submitted'; row.payment_status = 'unpaid'; row.payment_ref = null;    // forced
  row.public_token = 'tok-' + Math.random().toString(36).slice(2);
  if (type === 'donation') {
    const a = (payload.details || {}).amount;                                         // #3 must be a real JSON number
    row.amount = (typeof a === 'number' && Number.isFinite(a)) ? Math.min(Math.max(a, 0), 1000000) : 0;
  } else {
    row.amount = (FEES[parishId] && FEES[parishId][type]) || 0;                       // parish's fee, server-set
  }
  row.requester_name = String(payload.requester_name || '').replace(/[\r\n]/g, ' ').slice(0, 120);   // #14 CRLF-strip
  row.requester_email = String(payload.requester_email || '').replace(/[\r\n]/g, '').slice(0, 200);
  return row;
}

// request_status(token) — what anon gets back (NO PII)
function requestStatus(row) {
  return { type: row.type, status: row.status, requested_date: row.requested_date, amount: row.amount, payment_status: row.payment_status };
}

let pass = 0, fail = 0; const fails = [];
const check = (id, ok) => { (ok ? pass++ : (fail++, fails.push(id))); console.log(`  ${ok ? '✅' : '❌'} ${id}`); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

console.log('\n⛪  Parishioner portal intake attacks\n');

// (b) forged privileged fields are neutralized
{
  const r = publicSubmit('p1', 'mass_intention', { status: 'confirmed', payment_status: 'paid', amount: 999999, payment_ref: 'xnd_hack' });
  check('forged-status-ignored', r.status === 'submitted');
  check('forged-payment-ignored', r.payment_status === 'unpaid' && r.payment_ref === null);
  check('forged-amount-ignored (fee server-set)', r.amount === 200);
}
// non-donation amount is the parish's published fee, never the requester's
check('fee-from-parish-config', publicSubmit('p1', 'certificate').amount === 150 && publicSubmit('p2', 'mass_intention').amount === 250);
check('fee-known-parish-no-fee-zero', publicSubmit('p2', 'certificate').amount === 0);

// (#4) parish must exist AND have enabled online intake (secure default: off)
check('unknown-parish-rejected', throws(() => publicSubmit('p9', 'certificate')));
check('intake-not-enabled-rejected', throws(() => publicSubmit('p3', 'certificate')));

// (i/#3) donation amount: real number only, bounded
check('donation-giver-amount', publicSubmit('p1', 'donation', { details: { amount: 500 } }).amount === 500);
check('donation-negative-clamped', publicSubmit('p1', 'donation', { details: { amount: -50 } }).amount === 0);
check('donation-huge-capped', publicSubmit('p1', 'donation', { details: { amount: 1e9 } }).amount === 1000000);
check('donation-nan-zero', publicSubmit('p1', 'donation', { details: { amount: 'NaN' } }).amount === 0);
check('donation-string-amount-rejected', publicSubmit('p1', 'donation', { details: { amount: '500' } }).amount === 0);
check('contact-crlf-stripped', !/[\r\n]/.test(publicSubmit('p1', 'mass_intention', { requester_email: 'a@x.test\r\nbcc:victim@y' }).requester_email));

// (a)/(f) input hygiene
check('name-truncated', publicSubmit('p1', 'mass_intention', { requester_name: 'x'.repeat(500) }).requester_name.length === 120);
check('invalid-type-rejected', throws(() => publicSubmit('p1', 'hacker_type')));
check('details-must-be-object', throws(() => publicSubmit('p1', 'mass_intention', { details: 'not-an-object' })));

// (d) the status lookup returns NO PII
{
  const r = publicSubmit('p1', 'mass_intention', { requester_name: 'Juan Cruz', requester_email: 'juan@x.test' });
  r.requested_date = '2026-07-01';
  const s = requestStatus(r);
  check('status-lookup-no-pii', !('requester_name' in s) && !('requester_email' in s) && !('requester_phone' in s));
  check('status-lookup-has-status', s.status === 'submitted' && s.type === 'mass_intention');
}

// (c)/(k) cross-parish: the staff inbox only shows the staffer's own parish
function inbox(staffParish, rows) { return rows.filter((r) => r.parish_id === staffParish); }
{
  const rows = [publicSubmit('p1', 'mass_intention'), publicSubmit('p2', 'mass_intention'), publicSubmit('p1', 'donation', { details: { amount: 100 } })];
  check('parish-inbox-scoped', inbox('p1', rows).length === 2 && inbox('p1', rows).every((r) => r.parish_id === 'p1'));
}

console.log(`\n${'─'.repeat(58)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed${fail ? '  →  ' + fails.join(', ') : ''}`);
console.log(`${'─'.repeat(58)}`);
console.log('\nSQL-level (verify live): RLS public-submit WITH CHECK, parish_id FK rejects');
console.log('non-existent parishes, request_status definer scoping, + rate-limiting on');
console.log('the anon insert (see red-team / churchos-saas-security-prep.sql).');
process.exit(fail ? 1 : 0);
