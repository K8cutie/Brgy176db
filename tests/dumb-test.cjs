const { _electron: electron } = require('@playwright/test');
(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox'] });
  const win = await app.firstWindow();
  const errors = []; let cur='boot';
  win.on('pageerror', e => errors.push('CRASH @'+cur+': '+e.message.split('\n')[0]));
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(()=>{localStorage.setItem('churchos_setup_complete','true');localStorage.setItem('churchos_user',JSON.stringify({username:'noob',role:'secretary',roleLabel:'Secretary',loginAt:'x'}));});
  const find = []; // findings
  async function countKey(suffix){ const d=await win.evaluate(async()=>await window.churchos.db.getAll()); const k=Object.keys(d).find(x=>x.endsWith(suffix)); return k?JSON.parse(d[k]).length:-1; }

  // ---- NOOB TEST 1: Registry baptism — Save with everything blank ----
  cur='Registry/empty-save';
  await win.evaluate(()=>{window.location.hash='#/registry';}); await win.reload(); await win.waitForTimeout(1200);
  const b0 = await countKey('_baptism_records');
  const addBtn = win.getByRole('button',{name:/Add (Baptism|Record)|New (Baptism|Record)|\+ /i}).first();
  if (await addBtn.count()) { await addBtn.click(); await win.waitForTimeout(600);
    const saveBtn = win.getByRole('button',{name:/^(Save|Save Record|Create|Add Record)/i}).last();
    if (await saveBtn.count()) { await saveBtn.click(); await win.waitForTimeout(600);
      const b1 = await countKey('_baptism_records');
      find.push(`empty-save baptism: before=${b0} after=${b1} -> ${b1>b0?'BUG: saved blank record':'OK (blocked)'}`);
      // ---- NOOB TEST 2: garbage in number-ish fields + long text, then save ----
      cur='Registry/garbage';
      const longStr='X'.repeat(600);
      for (const ph of ['First Name','Last Name','Child First Name','Child Last Name']) { const f=win.getByPlaceholder(new RegExp(ph,'i')).first(); if(await f.count()){ await f.fill(longStr).catch(()=>{}); } }
      for (const inp of await win.locator('input[type="number"]:visible').all()) { await inp.fill('-99abc').catch(()=>{}); }
      await win.waitForTimeout(300);
      find.push('garbage-input baptism: no crash = ' + (errors.filter(e=>e.includes('garbage')).length===0));
      // close modal
      const cancel = win.getByRole('button',{name:/Cancel|Close/i}).last(); if(await cancel.count()) await cancel.click().catch(()=>{});
    } else find.push('Registry: no Save button found in modal');
  } else find.push('Registry: no Add button found');

  // ---- NOOB TEST 3: Calendar — New Event, save empty ----
  cur='Calendar/empty-save';
  await win.evaluate(()=>{window.location.hash='#/calendar';}); await win.reload(); await win.waitForTimeout(1200);
  const c0 = await countKey('_calendar_events');
  await win.getByRole('button',{name:/New Event/i}).first().click().catch(()=>{}); await win.waitForTimeout(600);
  await win.getByRole('button',{name:/^(Save|Create|Add Event|Schedule)/i}).last().click().catch(()=>{}); await win.waitForTimeout(600);
  const c1 = await countKey('_calendar_events');
  find.push(`empty-save event: before=${c0} after=${c1} -> ${c1>c0?'saved (check if titled-blank)':'OK (blocked)'}`);
  await win.keyboard.press('Escape').catch(()=>{});

  // ---- NOOB TEST 4: Finance Journal — post UNBALANCED entry ----
  cur='Finance/unbalanced';
  await win.evaluate(()=>{window.location.hash='#/finance';}); await win.reload(); await win.waitForTimeout(1000);
  await win.getByRole('button',{name:/^Journal$/}).first().click().catch(()=>{}); await win.waitForTimeout(500);
  const j0 = await countKey('_journal_entries');
  await win.getByRole('button',{name:/New Entry/i}).first().click().catch(()=>{}); await win.waitForTimeout(600);
  // fill only one debit -> unbalanced
  const numInputs = await win.locator('input[type="number"]:visible').all();
  if (numInputs.length) await numInputs[0].fill('5000').catch(()=>{});
  await win.getByRole('button',{name:/^(Post|Save|Post to Ledger)/i}).last().click().catch(()=>{}); await win.waitForTimeout(600);
  const j1 = await countKey('_journal_entries');
  find.push(`unbalanced journal post: before=${j0} after=${j1} -> ${j1>j0?'BUG: posted unbalanced':'OK (blocked)'}`);
  await win.keyboard.press('Escape').catch(()=>{});

  console.log('--- NOOB FINDINGS ---'); find.forEach(f=>console.log(' • '+f));
  console.log('--- CRASHES ('+errors.length+') ---'); [...new Set(errors)].slice(0,15).forEach(e=>console.log(' ! '+e));
  await app.close(); console.log('DUMB_DONE');
})().catch(e=>{console.log('DUMB_FAIL: '+e.message);process.exit(1);});
