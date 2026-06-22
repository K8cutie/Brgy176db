const { _electron: electron } = require('@playwright/test');
const path = require('path'); const os = require('os'); const fs = require('fs');
const DIR = path.join(os.tmpdir(), 'churchos-break');
fs.rmSync(DIR, { recursive: true, force: true });
function launch(){ return electron.launch({ args: ['.', '--no-sandbox', '--user-data-dir='+DIR] }); }
async function seed(win){ await win.evaluate(() => {
  localStorage.setItem('churchos_setup_complete','true');
  localStorage.setItem('churchos_user', JSON.stringify({username:'t',role:'secretary',roleLabel:'Secretary',loginAt:'x'}));
}); }
const R = {};
(async () => {
  // boot once to create db + parish id
  let app = await launch(); let win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded'); await seed(win);
  await win.evaluate(()=>{window.location.hash='#/finance';}); await win.reload(); await win.waitForTimeout(1200);
  const pid = await win.evaluate(()=> localStorage.getItem('churchos_parish_id'));

  // T2: MALFORMED JSON in a real key -> reload -> crash?
  await win.evaluate((pid)=> window.churchos.db.set(`churchos_parish_${pid}_collections`, 'this is not json{{{'), pid);
  await win.waitForTimeout(300);
  await win.evaluate(()=>{window.location.hash='#/finance';}); await win.reload(); await win.waitForTimeout(1200);
  R.T2_malformed_no_crash = await win.locator('#root *').count() > 0 && (await win.locator('h1').count()) > 0;

  // T2b: WRONG-SHAPE json (object where array expected) -> ErrorBoundary catches (no white screen)?
  await win.evaluate((pid)=> window.churchos.db.set(`churchos_parish_${pid}_baptism_records`, '{"not":"an array"}'), pid);
  await win.waitForTimeout(300);
  await win.evaluate(()=>{window.location.hash='#/registry';}); await win.reload(); await win.waitForTimeout(1500);
  const rootHasContent = await win.locator('#root *').count() > 0;
  const recoveryShown = await win.getByText(/Something went wrong|Reload ChurchOS/i).count() > 0;
  const registryRendered = await win.getByText(/Sacramental|Registry|Baptism/i).count() > 0;
  R.T2b_wrongshape_handled = rootHasContent && (recoveryShown || registryRendered);
  R.T2b_recovery_screen = recoveryShown;
  R.T2b_registry_rendered = registryRendered;
  await app.close();

  // T4: in-flight write durability — write then IMMEDIATELY close (no wait)
  app = await launch(); win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded'); await seed(win);
  await win.evaluate((pid)=> window.churchos.db.set(`churchos_parish_${pid}_inflight_test`, JSON.stringify({v:'must-survive'})), pid);
  await app.close(); // no wait — does the write land?
  app = await launch(); win = await app.firstWindow(); await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(800);
  const dump = await win.evaluate(async()=> await window.churchos.db.getAll());
  R.T4_inflight_survived = !!Object.keys(dump).find(k=>k.endsWith('_inflight_test'));

  // T3: DOUBLE INSTANCE — launch a 2nd app on same data dir
  let app2=null, secondWindowOpened=false;
  try { app2 = await launch(); const w2 = await app2.firstWindow({ timeout: 8000 }); secondWindowOpened = !!w2; } catch(e){ secondWindowOpened=false; }
  R.T3_second_instance_opened = secondWindowOpened;
  if (app2) await app2.close().catch(()=>{});
  await app.close();

  console.log('RESULTS ' + JSON.stringify(R));
})().catch(e => { console.log('BREAK_FAIL:', e.message, '| partial:', JSON.stringify(R)); process.exit(1); });
