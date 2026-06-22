const { _electron: electron } = require('@playwright/test');
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox'] });
  const win = await app.firstWindow(); await win.waitForLoadState('domcontentloaded');
  await win.evaluate(()=>{localStorage.setItem('churchos_setup_complete','true');localStorage.setItem('churchos_user',JSON.stringify({username:'x',role:'x',roleLabel:'x',loginAt:'x'}));});
  await win.waitForTimeout(600);
  const r = await win.evaluate(async () => {
    const d = await window.churchos.db.getAll();
    const get = (s) => { const k=Object.keys(d).find(x=>x.endsWith(s)); return k?JSON.parse(d[k]):[]; };
    const cols = get('_collections'), jrnl = get('_journal_entries');
    const baptisms=get('_baptism_records').length, marriages=get('_marriage_records').length, confs=get('_confirmation_records').length, deaths=get('_death_records').length;
    const totalCollections = cols.reduce((s,c)=>s+(c.total||0),0);
    // by month
    const byMonth={}; for(const c of cols){ const m=c.date.slice(0,7); byMonth[m]=(byMonth[m]||0)+c.total; }
    // by mass time
    const byMass={}; for(const c of cols){ byMass[c.massTime]=(byMass[c.massTime]||0)+c.total; }
    // expenses by account (Pareto)
    const exp={}; let totalExp=0;
    for(const j of jrnl) for(const l of j.lines){ if(l.debit>0 && String(l.accountCode).startsWith('5')){ exp[l.accountName]=(exp[l.accountName]||0)+l.debit; totalExp+=l.debit; } }
    const expSorted = Object.entries(exp).sort((a,b)=>b[1]-a[1]);
    let cum=0; const pareto = expSorted.map(([n,v])=>{ cum+=v; return {name:n, amount:v, cumPct:+(cum/totalExp*100).toFixed(1)}; });
    return { totalCollections, totalExpenses: totalExp, net: totalCollections-totalExp, byMonth, byMass, pareto, baptisms, marriages, confs, deaths, nCollections: cols.length };
  });
  console.log('FIN_JSON_START'); console.log(JSON.stringify(r,null,1)); console.log('FIN_JSON_END');
  await app.close();
})().catch(e=>{console.log('FAIL:'+e.message);process.exit(1);});
