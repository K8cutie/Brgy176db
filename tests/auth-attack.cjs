// ════════════════════════════════════════════════════════════════════════
// ChurchOS — local-auth break-test
//
// Exercises the REAL electron/auth.cjs logic (via its injected in-memory store
// seam) against the red-team threat model: credential/lockout, privilege
// escalation, session integrity, hashing, audit attribution.
//
//   node tests/auth-attack.cjs
//
// Renderer-gate vectors (c1/c2/e1/e2 — forged localStorage, unauth db bridge)
// are defended in session.ts (reconcileSession) + documented as the local-first
// posture; they are out of scope for this main-process harness and noted below.
// ════════════════════════════════════════════════════════════════════════

const auth = require('../electron/auth.cjs');

// in-memory app_meta store
const mem = {};
auth.__setStore({ metaGet: (k) => (k in mem ? mem[k] : null), metaSet: (k, v) => { mem[k] = String(v); } });
function fresh() { for (const k of Object.keys(mem)) delete mem[k]; auth.__reset(); }
const accounts = () => JSON.parse(mem.accounts || '[]');

const PW = 'Passw0rd!';
let pass = 0, fail = 0; const fails = [];
function check(id, group, desc, ok) { (ok ? pass++ : (fail++, fails.push(id))); console.log(`  ${ok ? '✅' : '❌'} [${group}] ${id} — ${desc}`); }

console.log('\n🔐  Local-auth attacks\n');

// ── (B) privilege escalation & user management ──
fresh();
check('b5-bootstrap-role-bypass', 'B', 'first account must be admin (secretary rejected)',
  auth.createUser({ username: 'sec', password: PW, role: 'secretary' }).error === 'first_user_must_be_admin');
fresh();
const boot = auth.createUser({ username: 'fr.admin', password: PW, role: 'parish_priest', fullName: 'Fr. A' });
check('bootstrap-admin-ok', 'B', 'first admin created on empty store', boot.ok === true);
check('b2-second-bootstrap-admin', 'B', 'create while logged out (users exist) → not_authorized',
  auth.createUser({ username: 'x', password: PW, role: 'secretary' }).error === 'not_authorized');
check('login-admin', 'B', 'admin can log in', auth.login('fr.admin', PW).ok === true);
check('admin-creates-staff', 'B', 'admin creates a bookkeeper', auth.createUser({ username: 'booky', password: PW, role: 'bookkeeper' }).ok === true);
auth.logout(); auth.login('booky', PW);
check('b1-staff-creates-admin', 'B', 'staff creating a parish_priest → not_authorized',
  auth.createUser({ username: 'evil', password: PW, role: 'parish_priest' }).error === 'not_authorized');
auth.changePassword({ username: 'booky', oldPassword: PW, newPassword: 'Newpass12' });
check('b3-staff-self-role-elevation', 'B', 'self password change cannot flip role',
  accounts().find((a) => a.username === 'booky').role === 'bookkeeper');

// ── (C) session / identity ──
auth.logout();
check('c3-stale-session-after-logout', 'C', 'after logout, privileged op → not_authorized',
  auth.createUser({ username: 'z', password: PW, role: 'secretary' }).error === 'not_authorized');
auth.__reset();
check('c4-no-session-persistence', 'C', 'fresh boot starts with no session', auth.currentUser() === null);

// ── (A) credential / lockout ──
fresh();
auth.createUser({ username: 'fr.admin', password: PW, role: 'parish_priest' });
let lockErr = null;
for (let i = 1; i <= 5; i++) lockErr = auth.login('fr.admin', 'wrong' + i).error;
check('a1-online-guessing-lockout', 'A', '5th wrong attempt → locked', lockErr === 'locked');
check('a1b-locked-blocks-correct', 'A', 'correct password while locked still → locked',
  auth.login('fr.admin', PW).error === 'locked');
auth.__reset();
check('a4-restart-resets-lockout', 'A', 'after app restart, correct password works (self-heal vs admin-DoS)',
  auth.login('fr.admin', PW).ok === true);
auth.logout();
check('a5-username-case-trim', 'A', '"  FR.Admin " logs in (normalized)', auth.login('  FR.Admin ', PW).ok === true);
fresh();
auth.createUser({ username: 'fr.admin', password: PW, role: 'parish_priest' });
check('a3-decoy-unknown-user', 'A', 'unknown username → same invalid_credentials (no enumeration)',
  auth.login('ghost', 'whatever').error === 'invalid_credentials');

// ── (D) hashing / storage ──
fresh();
auth.createUser({ username: 'alpha', password: 'SamePass12', role: 'parish_priest' });
auth.login('alpha', 'SamePass12');
auth.createUser({ username: 'bravo', password: 'SamePass12', role: 'secretary' });
const A = accounts().find((x) => x.username === 'alpha'); const B = accounts().find((x) => x.username === 'bravo');
check('d3-salt-uniqueness', 'D', 'same password → different salt & hash', A.salt !== B.salt && A.hash !== B.hash);
check('d1-no-hash-leak-in-list', 'D', 'listUsers exposes no salt/hash/password',
  auth.listUsers().every((u) => !('hash' in u) && !('salt' in u) && !('password' in u)));
check('d2-weak-password-min', 'D', 'admin creating a 5-char password → weak_password',
  auth.createUser({ username: 'carol', password: 'short', role: 'secretary' }).error === 'weak_password');
check('d4-oversized-password-create', 'D', '2000-char password rejected (no scrypt DoS)',
  auth.createUser({ username: 'dave', password: 'p'.repeat(2000), role: 'secretary' }).error === 'weak_password');
check('d4b-oversized-password-login', 'D', '2000-char login rejected fast',
  auth.login('alpha', 'p'.repeat(2000)).error === 'invalid_credentials');

// ── changePassword authorization ──
fresh();
auth.createUser({ username: 'fr.admin', password: PW, role: 'parish_priest' });
auth.login('fr.admin', PW);
auth.createUser({ username: 'booky', password: PW, role: 'bookkeeper' });
auth.logout(); auth.login('booky', PW);
check('cp-self-wrong-old', 'CP', 'self change with wrong old password → invalid_credentials',
  auth.changePassword({ oldPassword: 'nope', newPassword: 'Whatever12' }).error === 'invalid_credentials');
check('cp-staff-reset-other', 'CP', 'staff resetting another user → not_authorized',
  auth.changePassword({ username: 'fr.admin', newPassword: 'Hacked123' }).error === 'not_authorized');
auth.logout(); auth.login('fr.admin', PW);
check('cp-admin-reset-other', 'CP', "admin resets staff password without old (logged)",
  auth.changePassword({ username: 'booky', newPassword: 'Reset1234' }).ok === true);
auth.logout();
check('cp-admin-reset-takes-effect', 'CP', 'staff can log in with the reset password',
  auth.login('booky', 'Reset1234').ok === true);

console.log(`\n${'─'.repeat(60)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed${fail ? '  →  ' + fails.join(', ') : ''}`);
console.log(`${'─'.repeat(60)}`);
console.log('\nDefended elsewhere / documented (not in this harness):');
console.log('  c1 forged-localStorage gate + c2 unauth db-bridge + e1/e2 audit-actor →');
console.log('    session.ts reconcileSession() makes the MAIN session the source of truth;');
console.log('    getCurrentUserName()/isAuthenticated() trust it, not localStorage.');
console.log('  d1 at-rest: DB is plaintext on the parish PC — weak passwords are crackable');
console.log('    offline. Mitigation: 8-char min + scrypt; future: full at-rest encryption.');
process.exit(fail ? 1 : 0);
