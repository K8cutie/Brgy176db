// ════════════════════════════════════════════════════════════════════════
// ChurchOS SaaS — onboarding RPC break-test
// Models the SECURITY DEFINER onboarding RPCs (churchos-saas-onboarding.sql)
// AFTER hardening, and fires the red-team's privilege/tenant-hop attacks.
//   node tests/onboarding-attack.cjs
// (search_path pinned + REVOKE FROM PUBLIC + advisory lock are SQL-level and
//  verified by reading the file / live; this harness covers the authz logic.)
// ════════════════════════════════════════════════════════════════════════

const ALLOWED = ['secretary', 'priest', 'finance_council'];
const low = (s) => String(s || '').trim().toLowerCase();

function world() { return { profiles: {}, dioceses: {}, parishes: {}, invites: [], authEmail: {}, _n: 0 }; }

function onboardNewAdmin(w, uid, diocese, parish) {
  if (!uid) throw new Error('not authenticated');
  if (!String(diocese || '').trim() || !String(parish || '').trim()) throw new Error('names required');
  const p = w.profiles[uid];
  if (p && (p.diocese_id || p.parish_id)) throw new Error('already belongs to a diocese'); // gate: no diocese AND no parish
  const did = 'd' + (++w._n); w.dioceses[did] = { name: diocese };
  const pid = 'p' + (++w._n); w.parishes[pid] = { diocese_id: did, name: parish };
  w.profiles[uid] = { ...(p || { email: w.authEmail[uid] }), role: 'diocese_admin', diocese_id: did, parish_id: pid };
  return { diocese_id: did, parish_id: pid };
}
function provisionParish(w, uid, name) {
  const p = w.profiles[uid];
  if (!p || !['diocese_admin', 'bishop'].includes(p.role) || !p.diocese_id) throw new Error('only a diocese admin');
  if (!String(name || '').trim()) throw new Error('name required');
  const pid = 'p' + (++w._n); w.parishes[pid] = { diocese_id: p.diocese_id, name }; return pid;
}
function inviteMember(w, uid, parishId, email, role) {
  const p = w.profiles[uid];
  if (!p || !['diocese_admin', 'bishop'].includes(p.role) || !p.diocese_id) throw new Error('only a diocese admin');
  const parish = w.parishes[parishId];
  if (!parish || parish.diocese_id !== p.diocese_id) throw new Error('parish not in your diocese');
  if (!String(email || '').trim()) throw new Error('email required');
  if (!ALLOWED.includes(role)) throw new Error('invalid role');
  if (low(email) === low(p.email)) throw new Error('cannot invite yourself');
  const inv = { id: 'i' + (++w._n), token: 'tok' + w._n, diocese_id: p.diocese_id, parish_id: parishId, email: low(email), role, status: 'pending' };
  w.invites.push(inv); return inv.token;
}
function acceptInvite(w, uid, token) {
  if (!uid) throw new Error('not authenticated');
  const p = w.profiles[uid] || {};
  if (p.diocese_id) throw new Error('already belongs to a diocese'); // unaffiliated only → no tenant-hop
  const email = low(w.authEmail[uid]);
  const inv = w.invites.find((i) => i.token === token && i.status === 'pending' && low(i.email) === email);
  if (!inv) throw new Error('invite not found / used / wrong email');
  if (!ALLOWED.includes(inv.role)) throw new Error('invalid invite role');
  inv.status = 'accepted';
  w.profiles[uid] = { ...p, role: inv.role, diocese_id: inv.diocese_id, parish_id: inv.parish_id, email: w.authEmail[uid] };
  return { parish_id: inv.parish_id, role: inv.role };
}

let pass = 0, fail = 0; const fails = [];
const check = (id, ok) => { (ok ? pass++ : (fail++, fails.push(id))); console.log(`  ${ok ? '✅' : '❌'} ${id}`); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

console.log('\n🏛️  Onboarding / invite RPC attacks\n');

// happy path: a fresh signup creates a diocese and becomes its admin
{
  const w = world(); w.authEmail['u1'] = 'admin@arch.test'; w.profiles['u1'] = { role: 'secretary', email: 'admin@arch.test' };
  const r = onboardNewAdmin(w, 'u1', 'Archdiocese of Manila', 'St. Mary');
  check('onboard-happy-path (fresh signup → diocese_admin)', w.profiles['u1'].role === 'diocese_admin' && !!r.diocese_id);
}
// a1: already in a diocese → blocked
{
  const w = world(); w.profiles['u1'] = { role: 'diocese_admin', diocese_id: 'dA', parish_id: 'pA', email: 'a@x' };
  check('onboard-already-in-diocese-blocked', throws(() => onboardNewAdmin(w, 'u1', 'X', 'Y')));
}
// a2: a member assigned to a parish (parish_id set, diocese maybe null) → blocked
{
  const w = world(); w.profiles['u2'] = { role: 'secretary', diocese_id: null, parish_id: 'pA', email: 'm@x' };
  check('onboard-null-diocese-but-has-parish-blocked', throws(() => onboardNewAdmin(w, 'u2', 'Sneaky', 'Diocese')));
}
check('onboard-unauthenticated-blocked', throws(() => onboardNewAdmin(world(), null, 'A', 'B')));

// provision_parish
{
  const w = world(); w.profiles['adm'] = { role: 'diocese_admin', diocese_id: 'dA', parish_id: 'pA', email: 'a@x' };
  check('provision-by-admin-ok', !throws(() => provisionParish(w, 'adm', 'San Roque')));
  w.profiles['sec'] = { role: 'secretary', diocese_id: 'dA', parish_id: 'pA', email: 's@x' };
  check('provision-by-secretary-blocked', throws(() => provisionParish(w, 'sec', 'Evil Parish')));
  w.profiles['orphan'] = { role: 'diocese_admin', diocese_id: null, parish_id: null, email: 'o@x' };
  check('provision-null-diocese-blocked', throws(() => provisionParish(w, 'orphan', 'Orphan Parish')));
}

// invite_member
function dioceseWorld() {
  const w = world();
  w.authEmail['adm'] = 'adm@a.test';
  w.profiles['adm'] = { role: 'diocese_admin', diocese_id: 'dA', parish_id: 'pA1', email: 'adm@a.test' };
  w.parishes['pA1'] = { diocese_id: 'dA', name: 'A1' };
  w.parishes['pB1'] = { diocese_id: 'dB', name: 'B1 (other diocese)' };
  return w;
}
{
  const w = dioceseWorld();
  check('invite-valid-ok', !throws(() => inviteMember(w, 'adm', 'pA1', 'Aida@a.test', 'secretary')));
  check('invite-self-blocked', throws(() => inviteMember(w, 'adm', 'pA1', 'adm@a.test', 'secretary')));
  check('invite-cross-diocese-parish-blocked', throws(() => inviteMember(w, 'adm', 'pB1', 'x@a.test', 'secretary')));
  check('invite-elevated-role-blocked', throws(() => inviteMember(w, 'adm', 'pA1', 'x@a.test', 'diocese_admin')));
  w.profiles['sec'] = { role: 'secretary', diocese_id: 'dA', parish_id: 'pA1', email: 's@a.test' };
  check('invite-by-non-admin-blocked', throws(() => inviteMember(w, 'sec', 'pA1', 'y@a.test', 'secretary')));
}

// accept_invite
{
  const w = dioceseWorld();
  const tok = inviteMember(w, 'adm', 'pA1', 'aida@a.test', 'secretary');
  w.authEmail['aida'] = 'aida@a.test'; w.profiles['aida'] = { role: 'secretary', email: 'aida@a.test' }; // unaffiliated
  check('accept-happy-path', acceptInvite(w, 'aida', tok).role === 'secretary' && w.profiles['aida'].diocese_id === 'dA');

  // a4: an already-affiliated user accepting an invite → blocked (no tenant hop)
  const w2 = dioceseWorld();
  const tok2 = inviteMember(w2, 'adm', 'pA1', 'member@a.test', 'secretary');
  w2.authEmail['mem'] = 'member@a.test'; w2.profiles['mem'] = { role: 'priest', diocese_id: 'dOTHER', parish_id: 'pOther', email: 'member@a.test' };
  check('accept-tenant-hop-blocked', throws(() => acceptInvite(w2, 'mem', tok2)));

  // a7: wrong-email caller can't use someone else's token
  const w3 = dioceseWorld();
  const tok3 = inviteMember(w3, 'adm', 'pA1', 'intended@a.test', 'secretary');
  w3.authEmail['attacker'] = 'attacker@evil.test'; w3.profiles['attacker'] = { role: 'secretary', email: 'attacker@evil.test' };
  check('accept-wrong-email-blocked', throws(() => acceptInvite(w3, 'attacker', tok3)));

  // a8: replay / already-used token → blocked
  const w4 = dioceseWorld();
  const tok4 = inviteMember(w4, 'adm', 'pA1', 'once@a.test', 'secretary');
  w4.authEmail['once'] = 'once@a.test'; w4.profiles['once'] = { role: 'secretary', email: 'once@a.test' };
  acceptInvite(w4, 'once', tok4);
  // second account, same token (already accepted) → blocked
  w4.authEmail['twice'] = 'once@a.test'; w4.profiles['twice'] = { role: 'secretary', email: 'once@a.test' };
  check('accept-replay-used-token-blocked', throws(() => acceptInvite(w4, 'twice', tok4)));

  check('accept-unknown-token-blocked', throws(() => acceptInvite(dioceseWorld(), 'x', 'no-such-token')));
}

console.log(`\n${'─'.repeat(58)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed${fail ? '  →  ' + fails.join(', ') : ''}`);
console.log(`${'─'.repeat(58)}`);
console.log('\nSQL-level defenses (verify on the live project): search_path pinned on all');
console.log('definer fns, REVOKE EXECUTE FROM PUBLIC, advisory lock on onboard, atomic');
console.log('accept (UPDATE…WHERE status=pending RETURNING).');
process.exit(fail ? 1 : 0);
