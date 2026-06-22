const { _electron: electron } = require('@playwright/test');
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox'] });
  const win = await app.firstWindow(); await win.waitForLoadState('domcontentloaded');
  await win.evaluate(()=>{ localStorage.setItem('churchos_setup_complete','true'); localStorage.setItem('churchos_user', JSON.stringify({username:'fr.reyes',role:'parish_priest',roleLabel:'Parish Priest',loginAt:'x'})); });
  await win.waitForTimeout(700);

  const out = await win.evaluate(async () => {
    const all = await window.churchos.db.getAll();
    const pid = localStorage.getItem('churchos_parish_id');
    const ds = (suf) => { const k = Object.keys(all).find(x=>x.endsWith('_'+suf)); return k?JSON.parse(all[k]):[]; };

    // ---- financials (6 months) ----
    const cols = ds('collections'); const jrnl = ds('journal_entries');
    const income = cols.reduce((s,c)=>s+(c.total||0),0);
    const exp = {}; let expenses = 0;
    for (const j of jrnl) for (const l of (j.lines||[])) { if (l.debit>0 && String(l.accountCode).startsWith('5')) { expenses+=l.debit; exp[l.accountName]=(exp[l.accountName]||0)+l.debit; } }
    const pareto = Object.entries(exp).sort((a,b)=>b[1]-a[1]).map(([n,v])=>({name:n,amount:v}));
    const sacraments = { baptisms: ds('baptism_records').length, marriages: ds('marriage_records').length, confirmations: ds('confirmation_records').length, deaths: ds('death_records').length };

    // ---- seed a realistic fee-override audit trail (tamper-evident hash chain) ----
    const auditHash = (input) => { let h=0; for (let i=0;i<input.length;i++){ h=((h<<5)-h)+input.charCodeAt(i); h|=0; } return Math.abs(h).toString(36); };
    const raw = [
      { sacrament:'Baptism', registryId:'2026-0003', personName:'Mateo Dela Cruz', overrideType:'waived', amount:500, reason:'Financial hardship — family verified by barangay certificate', recordedBy:'parish.secretary' },
      { sacrament:'Baptism', registryId:'2026-0007', personName:'Sofia Ramos', overrideType:'waived', amount:500, reason:'Financial hardship — single mother, SSDM beneficiary', recordedBy:'parish.secretary' },
      { sacrament:'Marriage', registryId:'2026-0102', personName:'Jericho & Maria Angelica', overrideType:'bill_later', amount:4000, reason:'Couple to pay after the ceremony; promissory note on file', recordedBy:'parish.secretary' },
      { sacrament:'Baptism', registryId:'2026-0011', personName:'Gabriel Santos', overrideType:'collected', amount:500, reason:'Already collected at the parish office, OR# 4821', recordedBy:'parish.secretary' },
      { sacrament:'Marriage', registryId:'2026-0105', personName:'Carlo & Elena', overrideType:'waived', amount:5000, reason:'Waived — close to the parish', recordedBy:'fr.reyes' },
      { sacrament:'Death', registryId:'2026-0303', personName:'Crisostomo Bautista', overrideType:'waived', amount:1500, reason:'Pauper burial — indigent, no family means', recordedBy:'parish.secretary' },
      { sacrament:'Confirmation', registryId:'2026-0205', personName:'Joshua Dela Cruz', overrideType:'bill_later', amount:300, reason:'Sponsor to settle next week', recordedBy:'parish.secretary' },
      { sacrament:'Marriage', registryId:'2026-0108', personName:'Ramon & Teresita', overrideType:'waived', amount:5000, reason:'Father approved', recordedBy:'fr.reyes' },
    ];
    let prevHash = 'genesis'; const chain = [];
    for (let i=0;i<raw.length;i++) {
      const base = { ...raw[i], id:'foa-seed-'+i, timestamp:new Date(2026, i%6, 12+i).toISOString(), prevHash };
      const hash = auditHash(prevHash + JSON.stringify(base));
      chain.push({ ...base, hash }); prevHash = hash;
    }
    const auditKey = Object.keys(all).find(k=>k.endsWith('_fee_override_audit')) || `churchos_parish_${pid}_fee_override_audit`;
    await window.churchos.db.set(auditKey, JSON.stringify(chain));

    const totalWaived = chain.filter(e=>e.overrideType==='waived').reduce((s,e)=>s+e.amount,0);
    return { income, expenses, net: income-expenses, pareto, sacraments,
      audit: { count: chain.length, totalWaived, totalBillLater: chain.filter(e=>e.overrideType==='bill_later').reduce((s,e)=>s+e.amount,0), entries: chain.map(e=>({type:e.overrideType, amount:e.amount, person:e.personName, reason:e.reason, by:e.recordedBy})) } };
  });

  console.log('AUDIT_SEEDED_AND_EXTRACTED');
  console.log(JSON.stringify(out, null, 1));
  await app.close();
})().catch(e => { console.log('FAIL:', e.message); process.exit(1); });
