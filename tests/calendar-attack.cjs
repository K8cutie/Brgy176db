const { _electron: electron } = require('@playwright/test');
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox'] });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(()=>{ localStorage.setItem('churchos_setup_complete','true'); localStorage.setItem('churchos_user', JSON.stringify({username:'sec',role:'secretary',roleLabel:'Secretary',loginAt:'x'})); });
  // Inject a baseline event: Fr. Reyes, 2026-10-13, 09:00-10:00, Baptistry
  await win.evaluate(async () => {
    const all = await window.churchos.db.getAll();
    const key = Object.keys(all).find(k => k.endsWith('_calendar_events'));
    const events = key ? JSON.parse(all[key]) : [];
    if (!events.find(e=>e.id==='attack-baseline'))
      events.push({ id:'attack-baseline', title:'Baseline', type:'General', date:'2026-10-13', startTime:'09:00', endTime:'10:00', location:'Baptistry', officiant:'Fr. Reyes', isPublic:true });
    await window.churchos.db.set(key, JSON.stringify(events));
  });
  await win.evaluate(()=>{ window.location.hash='#/calendar'; }); await win.reload(); await win.waitForTimeout(1500);

  await win.getByRole('button', { name: /New Event/i }).first().click();
  await win.waitForTimeout(600);
  await win.getByPlaceholder('Event title').fill('Attack');
  await win.locator('input[type="date"]:visible').first().fill('2026-10-13');
  const sels = win.locator('select:visible');
  await sels.nth(1).selectOption({ label: 'Fr. Reyes' }).catch(()=>{}); // priest

  async function setTimes(s, e) { const t = win.locator('input[type="time"]:visible'); await t.nth(0).fill(s); await t.nth(1).fill(e); }
  async function setLoc(l) { await sels.nth(0).selectOption({ label: l }).catch(()=>{}); }
  async function read() {
    await win.waitForTimeout(450);
    const block = await win.getByText(/Cannot Save -- Conflicts Detected/i).count();
    const warn = await win.getByText(/Tight schedule/i).count();
    const disabled = await win.getByRole('button', { name: /Create Event|Resolve Conflicts to Save|Save Changes/i }).isDisabled().catch(()=>null);
    return { block, warn, disabled };
  }

  // A: overlap, same priest + same location -> hard block
  await setTimes('09:30','10:30'); await setLoc('Baptistry');
  const A = await read();
  console.log('A_OVERLAP(block):', JSON.stringify(A), '->', (A.block>0 && A.disabled) ? 'PASS (blocked)' : 'FAIL');

  // B: tight transition (gap 5min), different location -> HARD BLOCK
  await setTimes('10:05','11:00'); await setLoc('Main Church');
  const B = await read();
  console.log('B_TRANSITION(block):', JSON.stringify(B), '->', (B.block>0 && B.disabled===true) ? 'PASS (blocked)' : 'FAIL');

  // C: tight gap (gap 5min), SAME location -> HARD BLOCK (rest between services)
  await setLoc("Baptistry");
  const C = await read();
  console.log("C_SAME_LOCATION(block):", JSON.stringify(C), "->", (C.block>0 && C.disabled===true) ? "PASS (blocked)" : "FAIL");
  // D: 90-min gap (>1hr) -> allowed
  await setTimes("11:30","12:30"); await setLoc("Main Church");
  const D = await read();
  console.log("D_AMPLE_GAP(allowed):", JSON.stringify(D), "->", (D.block===0 && D.disabled===false) ? "PASS (enough time)" : "FAIL");

  await app.close(); console.log('CAL_ATTACK_DONE');
})().catch(e => { console.log('CAL_ATTACK_FAIL:', e.message); process.exit(1); });
