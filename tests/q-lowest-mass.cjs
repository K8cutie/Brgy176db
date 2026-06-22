const { _electron: electron } = require('@playwright/test');
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox'] });
  const win = await app.firstWindow(); await win.waitForLoadState('domcontentloaded');
  await win.evaluate(()=>{ localStorage.setItem('churchos_setup_complete','true'); localStorage.setItem('churchos_user', JSON.stringify({username:'x',role:'x',roleLabel:'x',loginAt:'x'})); });
  await win.waitForTimeout(700);
  const r = await win.evaluate(async () => {
    const all = await window.churchos.db.getAll();
    const k = Object.keys(all).find(x=>x.endsWith('_collections'));
    const cols = k?JSON.parse(all[k]):[];
    const byMass = {}, cntMass = {};
    for (const c of cols){ byMass[c.massTime]=(byMass[c.massTime]||0)+(c.total||0); cntMass[c.massTime]=(cntMass[c.massTime]||0)+1; }
    const rows = Object.entries(byMass).map(([m,t])=>({mass:m, total:t, avg: Math.round(t/cntMass[m])})).sort((a,b)=>a.total-b.total);
    // lowest single Sunday service instance
    const low = cols.slice().sort((a,b)=>a.total-b.total)[0];
    // 6PM trend by month (depth: cross-tab mass x month)
    const pm = cols.filter(c=>c.massTime==='6:00 PM');
    const pmByMonth = {}; for (const c of pm) pmByMonth[c.date.slice(0,7)]=(pmByMonth[c.date.slice(0,7)]||0)+c.total;
    return { rows, low: low?{date:low.date, mass:low.massTime, total:low.total}:null, pmByMonth };
  });
  console.log('BY_MASS_TIME (lowest first):');
  for (const x of r.rows) console.log('  '+x.mass.padEnd(9)+' total ₱'+x.total.toLocaleString()+'  (avg/Sunday ₱'+x.avg.toLocaleString()+')');
  console.log('LOWEST_SINGLE_SERVICE:', r.low ? r.low.date+' '+r.low.mass+' = ₱'+r.low.total.toLocaleString() : 'n/a');
  console.log('6PM_BY_MONTH:', JSON.stringify(r.pmByMonth));
  await app.close();
})().catch(e=>{ console.log('FAIL:', e.message); process.exit(1); });
