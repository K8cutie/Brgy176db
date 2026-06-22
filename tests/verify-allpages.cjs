const { _electron: electron } = require('@playwright/test');
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox'] });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', e => errors.push('PAGEERROR @' + cur + ': ' + e.message.split('\n')[0]));
  win.on('console', m => { if (m.type()==='error') { const t=m.text(); if(!/Download the React DevTools|Autofocus|favicon/i.test(t)) errors.push('CONSOLE @' + cur + ': ' + t.slice(0,140)); } });
  let cur = 'boot';
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(() => { localStorage.setItem('churchos_setup_complete','true'); localStorage.setItem('churchos_user', JSON.stringify({username:'parish.secretary',role:'secretary',roleLabel:'Secretary',loginAt:'x'})); });

  const routes = [
    ['Dashboard','#/'],['Registry','#/registry'],['Directory','#/directory'],['Calendar','#/calendar'],
    ['Finance','#/finance'],['Ministries','#/ministries'],['SSDM','#/ssdm'],['Reports','#/reports'],['Settings','#/settings'],
  ];
  const report = [];
  for (const [name, hash] of routes) {
    cur = name;
    await win.evaluate((h)=>{ window.location.hash=h; }, hash);
    await win.reload(); await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(1400);
    const rootKids = await win.locator('#root *').count();
    const h1 = await win.locator('h1, h2').first().innerText().catch(()=>'(none)');
    const crashed = await win.getByText(/Something went wrong|Reload ChurchOS/i).count() > 0;
    report.push(`${crashed?'CRASH':(rootKids>3?'OK  ':'EMPTY')} | ${name.padEnd(10)} | root=${rootKids} | ${h1.replace(/\n/g,' ').slice(0,40)}`);
  }
  // Registry sub-tabs + Finance sub-tabs (where aggregation bugs hide)
  cur='Registry-tabs';
  await win.evaluate(()=>{window.location.hash='#/registry';}); await win.reload(); await win.waitForTimeout(1000);
  for (const t of ['Baptism','Marriage','Confirmation','Death']) { try{ await win.getByRole('button',{name:new RegExp(t)}).first().click(); await win.waitForTimeout(500);}catch(e){} }
  cur='Finance-tabs';
  await win.evaluate(()=>{window.location.hash='#/finance';}); await win.reload(); await win.waitForTimeout(1000);
  for (const t of ['Journal','Collections','Budget','Analytics','Approvals']) { try{ await win.getByRole('button',{name:new RegExp('^'+t+'$')}).first().click(); await win.waitForTimeout(700);}catch(e){} }

  console.log('--- ROUTE REPORT ---'); report.forEach(r=>console.log(r));
  console.log('--- ERRORS ('+errors.length+') ---'); [...new Set(errors)].slice(0,25).forEach(e=>console.log(e));
  await app.close(); console.log('VERIFY_DONE');
})().catch(e => { console.log('VERIFY_FAIL: ' + e.message); process.exit(1); });
