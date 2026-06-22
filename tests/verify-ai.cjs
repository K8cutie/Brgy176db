const { _electron: electron } = require('@playwright/test');
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox'] });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(()=>{ localStorage.setItem('churchos_setup_complete','true'); localStorage.setItem('churchos_user', JSON.stringify({username:'fr.demo',role:'parish_priest',roleLabel:'Parish Priest',loginAt:'x'})); });
  await win.evaluate(()=>{ window.location.hash='#/'; }); await win.reload(); await win.waitForLoadState('domcontentloaded'); await win.waitForTimeout(1500);

  // 1) Compute Q1 exactly as ai.cjs would, from the live DB connection
  const q1 = await win.evaluate(async () => {
    const all = await window.churchos.db.getAll();
    const ds = (suf) => { const k = Object.keys(all).find(x=>x.endsWith('_'+suf)); return k?JSON.parse(all[k]):[]; };
    const months=['2026-01','2026-02','2026-03']; const inP=(d)=>months.includes((d||'').slice(0,7));
    const cols=ds('collections').filter(c=>inP(c.date));
    const jrnl=ds('journal_entries').filter(j=>inP(j.date));
    const income=cols.reduce((s,c)=>s+(c.total||0),0);
    let expenses=0; const exp={};
    for(const j of jrnl) for(const l of (j.lines||[])){ if(l.debit>0 && String(l.accountCode).startsWith('5')){ expenses+=l.debit; exp[l.accountName]=(exp[l.accountName]||0)+l.debit; } }
    const top=Object.entries(exp).sort((a,b)=>b[1]-a[1]).map(([n,v])=>n+'=₱'+v.toLocaleString());
    return { income:'₱'+income.toLocaleString(), expenses:'₱'+expenses.toLocaleString(), net:'₱'+(income-expenses).toLocaleString(), top };
  });
  console.log('Q1_INCOME', q1.income, '| EXPENSES', q1.expenses, '| NET', q1.net);
  console.log('Q1_TOP_EXPENSES:', q1.top.join('  |  '));

  // 2) AI status via the real bridge
  const status = await win.evaluate(async () => await window.churchos.ai.status());
  console.log('AI_STATUS', JSON.stringify(status));

  // 3) Assistant widget renders + key-entry state
  await win.getByRole('button', { name: /Open ChurchOS Assistant/i }).click();
  await win.waitForTimeout(600);
  const keyPrompt = await win.getByText(/Add your Anthropic API key/i).count();
  const launcher = await win.getByRole('button', { name: /Open ChurchOS Assistant/i }).count();
  console.log('ASSISTANT_LAUNCHER', launcher, '| KEY_ENTRY_SHOWN', keyPrompt);

  await app.close();
  console.log('VERIFY_AI_DONE');
})().catch(e => { console.log('VERIFY_AI_FAIL:', e.message); process.exit(1); });
