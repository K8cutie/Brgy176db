const { _electron: electron } = require('@playwright/test');
const path = require('path'); const os = require('os');
const USER_DATA = path.join(os.tmpdir(), 'churchos-test-persist');
require('fs').rmSync(USER_DATA, { recursive: true, force: true });
const NASTY = `O'Brien <script>alert(1)</script> 🙏 Niño`;

function launch(){ return electron.launch({ args: ['.', '--no-sandbox', '--user-data-dir='+USER_DATA] }); }
async function seed(win){
  await win.evaluate(() => {
    localStorage.setItem('churchos_setup_complete','true');
    localStorage.setItem('churchos_user', JSON.stringify({username:'test.secretary',role:'secretary',roleLabel:'Secretary',loginAt:new Date().toISOString()}));
  });
}
(async () => {
  // --- Launch 1: add a family via the real UI ---
  let app = await launch();
  let win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await seed(win);
  await win.evaluate(()=>{ window.location.hash='#/directory'; }); await win.reload(); await win.waitForTimeout(1200);

  await win.getByRole('button', { name: /Add Family/i }).first().click();
  await win.waitForTimeout(500);
  await win.getByPlaceholder('e.g., Dela Cruz').fill(NASTY);
  await win.getByPlaceholder('09XX XXX XXXX').fill('0917 555 1234');
  await win.getByPlaceholder('First Name').first().fill('Juan');
  await win.getByPlaceholder('Last Name').first().fill(NASTY);
  await win.getByRole('button', { name: /Save Family/i }).click();
  await win.waitForTimeout(1000);

  // Read what's actually in SQLite via the real IPC path
  const dump1 = await win.evaluate(async () => await window.churchos.db.getAll());
  const famKey = Object.keys(dump1).find(k => k.endsWith('_families'));
  const savedToSqlite = famKey ? dump1[famKey].includes("O'Brien") : false;
  console.log('T1a SAVED_TO_SQLITE:', savedToSqlite, '| key:', famKey);
  await app.close();

  // --- Launch 2: same data dir -> must still be there (read from SQLite) ---
  app = await launch();
  win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(()=>{ window.location.hash='#/directory'; }); await win.reload(); await win.waitForTimeout(1500);
  const dump2 = await win.evaluate(async () => await window.churchos.db.getAll());
  const famKey2 = Object.keys(dump2).find(k => k.endsWith('_families'));
  const exact = famKey2 ? dump2[famKey2].includes("O'Brien <script>alert(1)</script> 🙏 Niño") : false;
  const bodyHasNoCrash = await win.locator('#root *').count() > 0;
  // Does the UI actually render the persisted family name?
  const shownInUI = await win.getByText(/O'Brien/).count() > 0;
  console.log('T1b PERSISTED_AFTER_RESTART:', !!famKey2 && dump2[famKey2].includes("O'Brien"));
  console.log('T1c EXACT_ROUNDTRIP (no corruption):', exact);
  console.log('T1d RENDERS_IN_UI_AFTER_RESTART:', shownInUI);
  console.log('T1e NO_WHITE_SCREEN:', bodyHasNoCrash);
  await app.close();
  console.log('DONE');
})().catch(e => { console.log('T1_FAIL:', e.message); process.exit(1); });
