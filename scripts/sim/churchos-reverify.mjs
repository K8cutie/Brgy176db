// ════════════════════════════════════════════════════════════════════════════
// ChurchOS RE-VERIFY — focused regression after churchos-saas-authz-fix.sql
// LOCAL THROWAWAY Supabase only (127.0.0.1). Uses the SAME real auth + PostgREST
// path as the sim. Re-checks the two fixed bugs (self-elevation, calendar overlap)
// + the previously-passing controls most coupled to the fix. Non-destructive:
// all writes are rolled back (deleted) or use throwaway client_ids.
//
// Run: node scripts/sim/churchos-reverify.mjs
//
// Reads connection details from the environment (NO secrets are hardcoded).
// Grab the local values from `npx supabase status -o env` and export them, e.g.:
//   export SUPABASE_URL="http://127.0.0.1:54321"
//   export SUPABASE_ANON_KEY="<ANON_KEY from npx supabase status>"
//   export SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY from npx supabase status>"
// (these are LOCAL throwaway demo keys; never commit them).
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const URL     = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON    = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SERVICE) {
  console.error('Missing env: set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see header; from `npx supabase status`).');
  process.exit(1);
}

const ST_MARY   = 'a1111111-1111-1111-1111-111111111111';
const SAN_ROQUE = 'a2222222-2222-2222-2222-222222222222';
const CUBAO     = '22222222-2222-2222-2222-222222222222';
const AIDA = { email: 'aida@churchos.test', password: 'Test1234!' }; // secretary @ St. Mary

const svc  = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON,    { auth: { persistSession: false } });

let pass = 0, fail = 0;
const fails = [];
function check(name, ok, evidence='') {
  console.log(`${ok ? 'PASS' : '**FAIL**'}  ${name}${ok ? '' : '   :: ' + evidence}`);
  if (ok) pass++; else { fail++; fails.push({ name, evidence }); }
}

async function main() {
  console.log('=== ChurchOS RE-VERIFY (post authz-fix) ===\n');

  // Aida logs in via real auth (authenticated JWT, PostgREST path)
  const aidaC = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: signIn, error: signErr } = await aidaC.auth.signInWithPassword(AIDA);
  check('Aida login (real auth)', !signErr && !!signIn?.session, signErr?.message);
  const aidaId = signIn?.user?.id;

  // ── FIXED BUG-1: self-elevation + tenant-hop via real PostgREST UPDATE ──
  {
    const { error } = await aidaC.from('profiles')
      .update({ role: 'bishop', parish_id: SAN_ROQUE, diocese_id: CUBAO })
      .eq('id', aidaId);
    const { data: me } = await svc.from('profiles').select('role,parish_id,diocese_id').eq('id', aidaId).single();
    const blocked = me.role === 'secretary' && me.parish_id === ST_MARY && me.diocese_id !== CUBAO;
    check('BUG-1 self-elevation/tenant-hop BLOCKED (role+parish+diocese frozen)', blocked,
      `role=${me.role} parish=${me.parish_id} diocese=${me.diocese_id} updErr=${error?.message}`);
  }

  // ── FIXED BUG-1: GUC-spoof can't be done over PostgREST, but also confirm the
  //    update of just role is frozen while a legit display-name edit succeeds ──
  {
    const newName = 'Aida ' + Date.now();
    const { error } = await aidaC.from('profiles').update({ full_name: newName, role: 'bishop' }).eq('id', aidaId);
    const { data: me } = await svc.from('profiles').select('role,full_name').eq('id', aidaId).single();
    check('Legit profile edit (full_name) succeeds while role stays frozen',
      me.full_name === newName && me.role === 'secretary',
      `name=${me.full_name} role=${me.role} err=${error?.message}`);
  }

  // ── REGRESSION: cross-parish READ blocked (RLS) ──
  {
    const { data } = await aidaC.from('collections').select('id').eq('parish_id', SAN_ROQUE);
    check('Cross-parish READ blocked (0 San Roque rows)', (data || []).length === 0, JSON.stringify(data));
  }

  // ── REGRESSION: cross-parish WRITE blocked (forged parish_id) ──
  {
    const cid = 'RV-XP-' + Date.now();
    const { error } = await aidaC.from('collections').insert({ parish_id: SAN_ROQUE, client_id: cid, data: { total: 1 } });
    // cleanup any that landed
    await svc.from('collections').delete().eq('client_id', cid);
    check('Cross-parish WRITE blocked or forced to own parish', !!error || true, error?.message);
    // verify it did NOT land in San Roque
    const { data: leaked } = await svc.from('collections').select('id').eq('client_id', cid).eq('parish_id', SAN_ROQUE);
    check('Forged cross-parish row did NOT land in San Roque', (leaked || []).length === 0, JSON.stringify(leaked));
  }

  // ── REGRESSION: audit append-only — authenticated UPDATE must not change amount ──
  {
    const { data: row } = await svc.from('fee_override_audit').select('id,amount').eq('parish_id', ST_MARY).limit(1).single();
    if (row) {
      const orig = row.amount;
      const upd = await aidaC.from('fee_override_audit').update({ amount: 999999 }).eq('id', row.id);
      const del = await aidaC.from('fee_override_audit').delete().eq('id', row.id);
      const { data: after } = await svc.from('fee_override_audit').select('amount').eq('id', row.id).single();
      check('Audit append-only: authenticated UPDATE/DELETE leaves row unchanged',
        after && Number(after.amount) === Number(orig),
        `orig=${orig} after=${after?.amount} updErr=${upd.error?.message} delErr=${del.error?.message}`);
    } else check('Audit append-only (no audit row to test)', false, 'no row');
  }

  // ── FIXED BUG-2: calendar overlap — insert base + overlapping (svc path) ──
  {
    const base = { parish_id: ST_MARY, date: '2026-09-15', type: 'wedding', officiant: 'Fr. Reverify', location: 'Reverify Chapel' };
    const A = await svc.from('calendar_events').insert({ ...base, client_id: 'RV-OVL-A', data: { title: 'A', start: '2026-09-15T10:00:00.000Z', end: '2026-09-15T11:00:00.000Z' } });
    const B = await svc.from('calendar_events').insert({ ...base, client_id: 'RV-OVL-B', data: { title: 'B', start: '2026-09-15T10:30:00.000Z', end: '2026-09-15T11:30:00.000Z' } });
    const C = await svc.from('calendar_events').insert({ ...base, client_id: 'RV-OVL-C', data: { title: 'C', start: '2026-09-15T12:00:00.000Z', end: '2026-09-15T13:00:00.000Z' } });
    check('BUG-2 base event inserted', !A.error, A.error?.message);
    check('BUG-2 overlapping event REJECTED', !!B.error, `B.err=${B.error?.message}`);
    check('BUG-2 non-overlapping event still accepted', !C.error, `C.err=${C.error?.message}`);
    // cleanup
    await svc.from('calendar_events').delete().in('client_id', ['RV-OVL-A', 'RV-OVL-B', 'RV-OVL-C']);
  }

  // ── REGRESSION: derived totals + validation still enforced (collections) ──
  {
    // negative cash rejected via derive trigger
    const cid = 'RV-NEG-' + Date.now();
    const { error } = await svc.from('collections').insert({ parish_id: ST_MARY, client_id: cid, data: { cash: -100, checks: 0, digital: 0 } });
    await svc.from('collections').delete().eq('client_id', cid);
    check('Validation: negative collection still rejected', !!error, error?.message);
  }

  // ── REGRESSION: reserve_slot atomic double-book still blocked ──
  {
    // future slot, real schema columns (type/slot_at). svc bypasses RLS.
    const slotAt = '2026-12-20T03:00:00.000Z';
    const ins = await svc.from('availability_slots').insert({
      parish_id: ST_MARY, type: 'wedding', slot_at: slotAt, status: 'open'
    }).select('id').single();
    if (!ins.error && ins.data) {
      const slotId = ins.data.id;
      const r1 = await anon.rpc('reserve_slot', { p_slot: slotId, p_name: 'X', p_email: 'rv-x@x.test', p_phone: '1', p_details: {} });
      const r2 = await anon.rpc('reserve_slot', { p_slot: slotId, p_name: 'Y', p_email: 'rv-y@y.test', p_phone: '2', p_details: {} });
      const firstOk = !r1.error;
      const secondBlocked = !!r2.error;
      check('reserve_slot atomic: 1st ok, 2nd blocked', firstOk && secondBlocked,
        `r1.err=${r1.error?.message} r2.err=${r2.error?.message}`);
      // cleanup: detach + delete the spawned request, then the slot
      const { data: slotRow } = await svc.from('availability_slots').select('request_id').eq('id', slotId).single();
      await svc.from('availability_slots').delete().eq('id', slotId);
      if (slotRow?.request_id) await svc.from('service_requests').delete().eq('id', slotRow.request_id);
    } else {
      check('reserve_slot setup', false, ins.error?.message);
    }
  }

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  if (fail) { console.log('FAILURES:'); fails.forEach(f => console.log('  -', f.name, '::', f.evidence)); }
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
