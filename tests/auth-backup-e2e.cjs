// ════════════════════════════════════════════════════════════════════════
// ChurchOS — REAL Electron end-to-end for auth + backup.
// Launches the actual app in an isolated user-data dir (fresh install), then
// drives the live IPC bridges exactly as the UI would.
//   node tests/auth-backup-e2e.cjs
// ════════════════════════════════════════════════════════════════════════

const { _electron: electron } = require('@playwright/test');
const os = require('os'), path = require('path'), fs = require('fs');

(async () => {
  const UD = fs.mkdtempSync(path.join(os.tmpdir(), 'churchos-e2e-'));
  const app = await electron.launch({ args: ['.', '--no-sandbox', '--user-data-dir=' + UD] });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!(window.churchos && window.churchos.auth && window.churchos.backup), null, { timeout: 20000 });

  const r = await page.evaluate(async () => {
    const a = window.churchos.auth, b = window.churchos.backup;
    const o = {};
    o.freshNoUsers = await a.hasUsers();
    o.create = await a.create({ username: 'fr.test', password: 'Passw0rd!', role: 'parish_priest', fullName: 'Fr. Test' });
    o.hasUsersAfter = await a.hasUsers();
    o.login = await a.login('fr.test', 'Passw0rd!');
    o.current = await a.current();
    o.staffByAdmin = await a.create({ username: 'sec.test', password: 'Passw0rd!', role: 'secretary' });
    o.backupNow = await b.now();
    o.backupCount = (await b.list()).length;
    await a.logout();
    o.afterLogout = await a.current();
    o.createWhenLoggedOut = await a.create({ username: 'x.test', password: 'Passw0rd!', role: 'secretary' });
    let lock = null; for (let i = 0; i < 5; i++) lock = await a.login('fr.test', 'bad' + i);
    o.lockout = lock;
    // auto-update bridge: present, and reports 'dev' in this unpackaged run
    // (proves the fail-safe path — it never tries to update a dev build).
    o.appVersion = await window.churchos.appVersion();
    o.updateStatus = await window.churchos.update.status();
    o.updateCheckSafe = await window.churchos.update.check();
    return o;
  });

  await app.close();
  try { fs.rmSync(UD, { recursive: true, force: true }); } catch { /* ignore */ }

  let pass = 0, fail = 0; const fails = [];
  const check = (id, ok) => { (ok ? pass++ : (fail++, fails.push(id))); console.log(`  ${ok ? '✅' : '❌'} ${id}`); };

  console.log('\n🖥️  Electron end-to-end (auth + backup over real IPC)\n');
  check('fresh-install-has-no-users', r.freshNoUsers === false);
  check('bootstrap-admin-created', r.create && r.create.ok === true);
  check('has-users-after-create', r.hasUsersAfter === true);
  check('admin-login-succeeds', r.login && r.login.ok === true && r.login.user.role === 'parish_priest');
  check('main-session-is-real', r.current && r.current.username === 'fr.test');
  check('admin-can-create-staff', r.staffByAdmin && r.staffByAdmin.ok === true);
  check('backup-now-writes-file', r.backupNow && r.backupNow.ok === true && !!r.backupNow.path);
  check('backup-listed', r.backupCount >= 1);
  check('logout-clears-main-session', r.afterLogout === null);
  check('create-blocked-when-logged-out', r.createWhenLoggedOut && r.createWhenLoggedOut.error === 'not_authorized');
  check('lockout-after-5-bad-logins', r.lockout && r.lockout.error === 'locked');
  check('app-version-exposed', typeof r.appVersion === 'string' && r.appVersion.length > 0);
  check('updater-failsafe-in-dev', r.updateStatus && r.updateStatus.state === 'dev');
  check('update-check-never-throws', r.updateCheckSafe && r.updateCheckSafe.state === 'dev');

  console.log(`\n${'─'.repeat(56)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed${fail ? '  →  ' + fails.join(', ') : ''}`);
  console.log(`${'─'.repeat(56)}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('E2E crashed:', e); process.exit(1); });
