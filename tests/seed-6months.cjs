// Master 6-month seeder for ChurchOS.
// Builds a coherent Jan–Jun 2026 parish dataset by cloning the app's own
// record shapes, then writes it through the real SQLite path (window.churchos.db).
const { _electron: electron } = require('@playwright/test');

// ---------- helpers ----------
let SEQ = 1; const uid = (p) => `${p}-${String(SEQ++).padStart(4, '0')}`;
const SUR = ['Dela Cruz','Santos','Reyes','Bautista','Garcia','Lim','Aquino','Mendoza','Villanueva','Ramos','Torres','Gonzales','Rivera','Castillo','Flores','Mercado','Tan','Ocampo','Domingo','Pineda','Macaraeg','Salonga','Lacson','Magsaysay','Aguinaldo'];
const MN = ['Jose','Juan','Pedro','Carlo','Miguel','Antonio','Ramon','Eduardo','Manuel','Roberto','Marvin','Jericho','Joshua','Mateo','Gabriel','Rafael','Emilio','Andres','Fernando','Ricardo'];
const FN = ['Maria','Ana','Sofia','Lucia','Elena','Carmen','Rosario','Teresa','Jhoanna','Angelica','Corazon','Cristina','Grace','Divina','Liwayway','Imelda','Josefa','Pilar','Remedios','Concepcion'];
const BRGY = ['San Roque','Santa Maria','San Francisco','Poblacion','Holy Spirit','San Jose','Santo Niño','Mabiga','Dau','Camachiles'];
const pick = (a, i) => a[i % a.length];
const rnd = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const fullName = (i) => `${pick(MN, i)} ${pick(SUR, i + 3)}`;
const femName = (i) => `${pick(FN, i)} ${pick(SUR, i + 5)}`;

// 26 Sundays of Jan–Jun 2026
const SUNDAYS = [
  '2026-01-04','2026-01-11','2026-01-18','2026-01-25',
  '2026-02-01','2026-02-08','2026-02-15','2026-02-22',
  '2026-03-01','2026-03-08','2026-03-15','2026-03-22','2026-03-29',
  '2026-04-05','2026-04-12','2026-04-19','2026-04-26',
  '2026-05-03','2026-05-10','2026-05-17','2026-05-24','2026-05-31',
  '2026-06-07','2026-06-14','2026-06-21','2026-06-28',
];
const MONTH_MULT = { '01':1.15, '02':0.95, '03':1.0, '04':1.2, '05':1.05, '06':0.95 };
const MASS = [['6:00 AM',26000],['8:00 AM',38000],['10:00 AM',44000],['6:00 PM',24000]];

function buildDataset() {
  const collections = [], journal = [];

  // --- Sunday collections + matching journal entries ---
  for (const d of SUNDAYS) {
    const mult = MONTH_MULT[d.slice(5, 7)];
    for (const [mt, base] of MASS) {
      const total = Math.round(base * mult * (0.85 + Math.random() * 0.3));
      const cash = Math.round(total * 0.78), checks = Math.round(total * 0.14), digital = total - cash - checks;
      collections.push({ id: uid('SC'), date: d, massTime: mt, cash, checks, digital, total, postedBy: 'Maria Santos', status: 'Posted' });
      journal.push({ id: uid('JV'), date: d, reference: `Sunday Collection — ${mt} Mass`, description: `${d} collection — ${mt}`, status: 'Posted', postedBy: 'Maria Santos', totalDr: total, totalCr: total,
        lines: [ { accountCode: '1000', accountName: 'Cash on Hand', debit: total, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: total } ] });
    }
  }

  // --- Monthly expenses (Pareto-shaped: salaries + a repair spike + charity dominate) ---
  const EXP = [
    ['5100','Salaries & Wages', () => rnd(43000, 47000)],
    ['5210','Electricity', () => rnd(11000, 17000)],
    ['5220','Water', () => rnd(2000, 3500)],
    ['5300','Office & Liturgical Supplies', () => rnd(4000, 9000)],
    ['5600','Charity & Social Services', () => rnd(12000, 22000)],
    ['5700','Diocesan Assessment', () => 8000],
  ];
  for (const m of ['01','02','03','04','05','06']) {
    const day = `2026-${m}-15`;
    for (const [code, name, amt] of EXP) {
      const a = amt();
      journal.push({ id: uid('JV'), date: day, reference: `${name} — ${m}/2026`, description: `Monthly ${name.toLowerCase()}`, status: 'Posted', postedBy: 'Maria Santos', totalDr: a, totalCr: a,
        lines: [ { accountCode: code, accountName: name, debit: a, credit: 0 }, { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: a } ] });
    }
  }
  // One big repair spike in March (roof) — makes the Pareto interesting
  journal.push({ id: uid('JV'), date: '2026-03-18', reference: 'Church Roof Repair', description: 'Major roof repair after storm', status: 'Posted', postedBy: 'Maria Santos', totalDr: 185000, totalCr: 185000,
    lines: [ { accountCode: '5400', accountName: 'Repairs & Maintenance', debit: 185000, credit: 0 }, { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: 185000 } ] });

  // --- Sacraments spread across the months ---
  const baptisms = [], marriages = [], confirmations = [], deaths = [];
  const months = ['01','02','03','04','05','06'];
  let bn = 1, mn = 1, cn = 1, dn = 1, book = 1, page = 40;
  months.forEach((m, mi) => {
    // 4 baptisms / month
    for (let k = 0; k < 4; k++) {
      const i = bn; const day = `2026-${m}-${String(7 + k * 6).padStart(2, '0')}`;
      const lastN = pick(SUR, i), fa = pick(MN, i + 1), mo = pick(FN, i + 2), childF = (i % 2 ? pick(MN, i + 5) : pick(FN, i + 5));
      baptisms.push({ id: `bx${i}`, registryNumber: `2026-${String(bn).padStart(4,'0')}`, childLastName: lastN, childFirstName: childF, childMiddleName: pick(SUR, i+7),
        dateOfBirth: `2025-${pick(['10','11','12'],i)}-${String(rnd(1,28)).padStart(2,'0')}`, placeOfBirthCity: 'Mabalacat', placeOfBirthProvince: 'Pampanga', gender: i % 2 ? 'Male' : 'Female',
        fatherLastName: lastN, fatherFirstName: fa, fatherMiddleName: pick(SUR,i+9), motherLastName: pick(SUR,i+11), motherFirstName: mo, motherMiddleName: pick(SUR,i+13), motherMaidenName: pick(SUR,i+11),
        godfatherLastName: pick(SUR,i+2), godfatherFirstName: pick(MN,i+3), godmotherLastName: pick(SUR,i+4), godmotherFirstName: pick(FN,i+4),
        addressStreet: `${rnd(1,300)} ${pick(['Mango','Narra','Acacia','Sampaguita'],i)} St.`, addressBarangay: pick(BRGY,i), addressSitio: 'Maligaya', addressCity: 'Mabalacat', addressProvince: 'Pampanga',
        dateOfBaptism: day, timeOfBaptism: '9:00 AM', officiant: 'Fr. Reyes', bookNumber: book, pageNumber: page++, notations: '', status: 'Active',
        scheduledDate: day, scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Baptistry' });
      bn++;
    }
    // 2 marriages / month
    for (let k = 0; k < 2; k++) {
      const i = mn; const day = `2026-${m}-${String(10 + k * 12).padStart(2, '0')}`;
      marriages.push({ id: `mx${i}`, registryNumber: `2026-${String(100+mn).padStart(4,'0')}`, groomLastName: pick(SUR,i), groomFirstName: pick(MN,i), groomMiddleName: pick(SUR,i+2), groomAge: rnd(24,34), groomStatus: 'Single', groomFather: fullName(i+1), groomMother: femName(i+1),
        brideLastName: pick(SUR,i+6), brideFirstName: pick(FN,i), brideMiddleName: pick(SUR,i+8), brideAge: rnd(22,32), brideStatus: 'Single', brideFather: fullName(i+3), brideMother: femName(i+3),
        witness1Name: fullName(i+10), witness2Name: femName(i+10), dateOfMarriage: day, timeOfMarriage: '10:00 AM', officiant: 'Fr. Reyes', bookNumber: book, pageNumber: page++, notations: '', status: 'Active',
        scheduledDate: day, scheduledTime: '10:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Main Church' });
      mn++;
    }
    // confirmations: a batch in April & May
    if (m === '04' || m === '05') {
      for (let k = 0; k < 5; k++) {
        const i = cn; const day = `2026-${m}-${m === '04' ? '25' : '23'}`;
        confirmations.push({ id: `cx${i}`, registryNumber: `2026-${String(200+cn).padStart(4,'0')}`, confirmandLastName: pick(SUR,i), confirmandFirstName: i%2?pick(MN,i):pick(FN,i), confirmandMiddleName: pick(SUR,i+2),
          dateOfBirth: `${2010 - (i%3)}-0${rnd(1,9)}-${String(rnd(10,28)).padStart(2,'0')}`, parishOfBaptism: 'St. Michael the Archangel Parish', dateOfBaptism: `${2010-(i%3)}-06-15`, officiant: 'Fr. Reyes', bishop: 'Bishop Florentino Lavarias',
          sponsorLastName: pick(SUR,i+5), sponsorFirstName: pick(FN,i+5), dateOfConfirmation: day, timeOfConfirmation: '9:00 AM', bookNumber: book, pageNumber: page++, notations: '', status: 'Active',
          scheduledDate: day, scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Main Church' });
        cn++;
      }
    }
    // 2 deaths / month
    for (let k = 0; k < 2; k++) {
      const i = dn; const dd = `2026-${m}-${String(8 + k * 14).padStart(2, '0')}`; const burial = `2026-${m}-${String(11 + k * 14).padStart(2, '0')}`;
      deaths.push({ id: `dx${i}`, registryNumber: `2026-${String(300+dn).padStart(4,'0')}`, deceasedLastName: pick(SUR,i), deceasedFirstName: i%2?pick(MN,i):pick(FN,i), deceasedMiddleName: pick(SUR,i+2),
        age: rnd(55,92), gender: i%2?'Male':'Female', dateOfDeath: dd, dateOfBurial: burial, timeOfBurial: '9:00 AM', causeOfDeath: pick(['Natural causes','Cardiac arrest','Pneumonia','Prolonged illness'],i), cemetery: 'San Lorenzo Cemetery', officiant: i%3?'Fr. Reyes':'Fr. Santos', bookNumber: book, pageNumber: page++, notations: '', status: 'Active',
        scheduledDate: burial, scheduledTime: '9:00 AM', scheduledOfficiant: 'Fr. Reyes', scheduledLocation: 'Main Church' });
      dn++;
    }
  });

  // --- Calendar events for each sacrament (correctly typed + linked) ---
  const calAdds = [];
  const evt = (rec, type, rt, date, time, summary) => calAdds.push({ id: uid('EV'), title: `${type} — ${summary}`, type, date, startTime: time, endTime: time.replace(/^(\d+)/, (x)=>String(+x+1)), location: 'Main Church', officiant: rec.officiant || 'Fr. Reyes', description: '', isPublic: true, sacramentRecordId: rec.id, sacramentRecordType: rt, sacramentSummary: summary });
  baptisms.forEach(r => evt(r, 'Baptism', 'baptism', r.dateOfBaptism, '09:00', `${r.childFirstName} ${r.childLastName}`));
  marriages.forEach(r => evt(r, 'Wedding', 'marriage', r.dateOfMarriage, '10:00', `${r.groomFirstName} ${r.groomLastName} & ${r.brideFirstName} ${r.brideLastName}`));
  confirmations.forEach(r => evt(r, 'Confirmation', 'confirmation', r.dateOfConfirmation, '09:00', `${r.confirmandFirstName} ${r.confirmandLastName}`));
  deaths.forEach(r => evt(r, 'Death', 'death', r.dateOfBurial, '09:00', `${r.deceasedFirstName} ${r.deceasedLastName}`));

  // --- Directory: ~22 families ---
  const families = [];
  for (let i = 1; i <= 22; i++) {
    const sn = pick(SUR, i);
    families.push({ id: `fx${i}`, familyName: sn, color: pick(['#C9963B','#2D6A4F','#6B2737','#5B3A73','#3B6BC9'], i), status: 'Active',
      street: `${rnd(1,300)} ${pick(['Mango','Narra','Acacia','Rizal'],i)} St.`, barangay: pick(BRGY,i), sitio: 'Maligaya', city: 'Mabalacat', province: 'Pampanga',
      primaryPhone: `0917-555-${String(1000+i).slice(-4)}`, secondaryPhone: '', email: `${sn.toLowerCase().replace(/ /g,'')}${i}@gmail.com`, notes: 'Registered parishioner.',
      members: [
        { id: `px${i}a`, firstName: pick(MN,i), middleName: pick(SUR,i+2), lastName: sn, dateOfBirth: `19${rnd(60,85)}-0${rnd(1,9)}-1${rnd(0,8)}`, gender: 'Male', relationship: 'Head', sacraments: [] },
        { id: `px${i}b`, firstName: pick(FN,i), middleName: pick(SUR,i+4), lastName: sn, dateOfBirth: `19${rnd(62,88)}-0${rnd(1,9)}-2${rnd(0,8)}`, gender: 'Female', relationship: 'Spouse', sacraments: [] },
      ] });
  }

  return { collections, journal, baptisms, marriages, confirmations, deaths, calAdds, families };
}

(async () => {
  const app = await electron.launch({ args: ['.', '--no-sandbox'] }); // REAL data dir
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await win.evaluate(() => {
    localStorage.setItem('churchos_setup_complete', 'true');
    localStorage.setItem('churchos_user', JSON.stringify({ username: 'parish.secretary', role: 'secretary', roleLabel: 'Secretary', loginAt: new Date().toISOString() }));
  });
  // seed defaults (masses, ministries, ssdm, budget, chart) by visiting pages
  for (const h of ['#/calendar','#/ministries','#/ssdm','#/finance']) { await win.evaluate((hh)=>{window.location.hash=hh;}, h); await win.waitForTimeout(700);
    if (h==='#/finance'){ for(const t of ['Journal','Collections','Budget']){ await win.getByRole('button',{name:new RegExp('^'+t+'$')}).first().click().catch(()=>{}); await win.waitForTimeout(300);} } }
  await win.waitForTimeout(500);

  const pid = await win.evaluate(() => localStorage.getItem('churchos_parish_id'));
  const existing = await win.evaluate(async () => await window.churchos.db.getAll());
  const ds = buildDataset();

  // recompute budget actuals from generated journal
  const actuals = {};
  for (const je of ds.journal) for (const l of je.lines) {
    if (l.debit > 0 && l.accountCode.startsWith('5')) actuals[l.accountCode] = (actuals[l.accountCode]||0) + l.debit;
    if (l.credit > 0 && l.accountCode.startsWith('4')) actuals[l.accountCode] = (actuals[l.accountCode]||0) + l.credit;
  }
  const budKey = Object.keys(existing).find(k => k.endsWith('_budget_items'));
  let budget = budKey ? JSON.parse(existing[budKey]) : [];
  budget = budget.map(b => { const act = actuals[b.accountCode] ?? b.actualYTD; const v = b.budgetYTD - act; return { ...b, actualYTD: act, variance: v, variancePercent: b.budgetYTD ? +(v / b.budgetYTD * 100).toFixed(1) : 0, status: v >= 0 ? 'Under Budget' : 'Over Budget' }; });

  // merge calendar (keep existing masses, add sacrament events)
  const calKey = Object.keys(existing).find(k => k.endsWith('_calendar_events'));
  const masses = (calKey ? JSON.parse(existing[calKey]) : []).filter(e => e.type === 'Mass' || e.type === 'Ministry' || e.type === 'General');
  const calendar = [...masses, ...ds.calAdds];

  const payload = {
    collections: ds.collections, journal_entries: ds.journal,
    baptism_records: ds.baptisms, marriage_records: ds.marriages, confirmation_records: ds.confirmations, death_records: ds.deaths,
    calendar_events: calendar, families: ds.families, budget_items: budget,
  };

  const res = await win.evaluate(async ({ payload, pid }) => {
    const out = {};
    for (const [k, v] of Object.entries(payload)) {
      await window.churchos.db.set(`churchos_parish_${pid}_${k}`, JSON.stringify(v));
      out[k] = Array.isArray(v) ? v.length : 1;
    }
    return out;
  }, { payload, pid });

  console.log('SEEDED ' + JSON.stringify(res));
  await app.close();

  // verify after restart
  const a2 = await electron.launch({ args: ['.', '--no-sandbox'] });
  const w2 = await a2.firstWindow(); await w2.waitForLoadState('domcontentloaded'); await w2.waitForTimeout(800);
  const d2 = await w2.evaluate(async () => await window.churchos.db.getAll());
  const counts = {};
  for (const k of Object.keys(d2)) { const s = k.replace(/^churchos_parish_[^_]+_[a-z0-9]+_/, ''); try { const v = JSON.parse(d2[k]); if (Array.isArray(v)) counts[s] = v.length; } catch {} }
  console.log('AFTER_RESTART ' + JSON.stringify(counts));
  await a2.close();
  console.log('SEED6_DONE');
})().catch(e => { console.log('SEED6_FAIL: ' + e.message); process.exit(1); });
