const { _electron: electron } = require('@playwright/test');
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox'] });
  const win = await app.firstWindow(); await win.waitForLoadState('domcontentloaded');
  await win.evaluate(()=>{ localStorage.setItem('churchos_setup_complete','true'); localStorage.setItem('churchos_user', JSON.stringify({username:'sec',role:'secretary',roleLabel:'Secretary',loginAt:'x'})); });
  await win.evaluate(()=>{ window.location.hash='#/calendar'; }); await win.reload(); await win.waitForTimeout(1500);

  await win.getByRole('button', { name: /New Event/i }).first().click(); await win.waitForTimeout(600);
  await win.getByPlaceholder('Event title').fill('EdgeTest');
  await win.locator('input[type="date"]:visible').first().fill('2026-10-14');
  const sels = win.locator('select:visible');
  await sels.nth(0).selectOption({ label: 'Chapel' }).catch(()=>{});

  async function setTimes(s,e){ const t=win.locator('input[type="time"]:visible'); await t.nth(0).fill(s); await t.nth(1).fill(e); }
  async function read(){ await win.waitForTimeout(400);
    const disabled = await win.getByRole('button', { name: /Create Event|Resolve Conflicts|Save Changes/i }).isDisabled().catch(()=>null);
    const timeErr = await win.getByText(/end.*(before|after)|invalid time|must be after|end time/i).count();
    return { disabled, timeErr };
  }
  // D: end BEFORE start (backwards)
  await setTimes('14:00','09:00'); const D = await read();
  console.log('D_END_BEFORE_START:', JSON.stringify(D), '->', (D.disabled || D.timeErr>0) ? 'OK (rejected)' : 'BUG: backwards event saveable');
  // E: zero-duration (start==end)
  await setTimes('10:00','10:00'); const E = await read();
  console.log('E_ZERO_DURATION:', JSON.stringify(E), '->', (E.disabled || E.timeErr>0) ? 'OK (rejected)' : 'allowed (instantaneous event)');
  await app.close(); console.log('EDGES_DONE');
})().catch(e => { console.log('EDGES_FAIL:', e.message); process.exit(1); });
