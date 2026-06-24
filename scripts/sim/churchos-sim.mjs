// ════════════════════════════════════════════════════════════════════════════
// ChurchOS Verifier — 2-month persona simulation + correctness assertions
// LOCAL THROWAWAY Supabase only (127.0.0.1). Seeds a presentable dataset for ONE
// focal parish across 8 weeks AND asserts DB correctness to surface bugs.
//
// Run:  node scripts/sim/churchos-sim.mjs
// Requires the local stack up (npx supabase start) + the 8 SaaS SQL applied.
//
// Reads connection details from the environment (NO secrets are hardcoded).
// Grab the local values from `npx supabase status -o env` and export them, e.g.:
//   export SUPABASE_URL="$(npx supabase status -o env | grep '^API_URL=' | cut -d= -f2-)"
//   export SUPABASE_ANON_KEY="<ANON_KEY from npx supabase status>"
//   export SUPABASE_SERVICE_ROLE_KEY="<SERVICE_ROLE_KEY from npx supabase status>"
// (these are LOCAL throwaway demo keys; never commit them).
// ════════════════════════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

const URL     = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const ANON    = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!ANON || !SERVICE) {
  console.error('Missing env: set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (see header; from `npx supabase status`).');
  process.exit(1);
}

// Fixed seed UUIDs (from churchos-saas-seed.sql)
const MANILA = '11111111-1111-1111-1111-111111111111';
const CUBAO  = '22222222-2222-2222-2222-222222222222';
const ST_MARY  = 'a1111111-1111-1111-1111-111111111111'; // FOCAL parish (Manila)
const SAN_ROQUE= 'a2222222-2222-2222-2222-222222222222'; // other Manila parish
const STO_NINO = 'b1111111-1111-1111-1111-111111111111'; // Cubao parish (cross-diocese)
const AIDA = { email: 'aida@churchos.test', password: 'Test1234!' }; // secretary @ St. Mary
const BEN  = { email: 'ben@churchos.test',  password: 'Test1234!' }; // secretary @ San Roque

const svc  = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON,    { auth: { persistSession: false } });

// ── Filipino name pools ──
const SUR = ['Santos','Reyes','Cruz','Bautista','Ocampo','Garcia','Mendoza','Torres','Flores','Villanueva','Ramos','Aquino','del Rosario','Castillo','Salazar','Navarro','Domingo','Pascual','Gonzales','Tolentino'];
const GIV = ['Maria','Jose','Juan','Ana','Pedro','Rosa','Antonio','Luz','Ramon','Carmen','Manuel','Teresa','Eduardo','Lourdes','Ricardo','Gloria','Andres','Cristina','Fernando','Imelda'];
const BRGY = ['Brgy. San Isidro','Brgy. Poblacion','Brgy. Sta. Cruz','Brgy. Maligaya','Brgy. Bagong Silang','Brgy. San Antonio'];
const rnd = (a) => a[Math.floor(Math.random()*a.length)];
const fullName = () => `${rnd(GIV)} ${rnd(SUR)}`;
const peso = (lo,hi) => Math.round((lo + Math.random()*(hi-lo))/50)*50;

// 8-week window: Mon 2026-05-04 .. Sun 2026-06-28
const WK0 = new Date('2026-05-04T00:00:00Z');
const dayISO = (weekIdx, dayOffset=0) => {
  const d = new Date(WK0); d.setUTCDate(d.getUTCDate() + weekIdx*7 + dayOffset);
  return d.toISOString().slice(0,10);
};
const tsISO = (weekIdx, dayOffset, hour) => {
  const d = new Date(WK0); d.setUTCDate(d.getUTCDate()+weekIdx*7+dayOffset); d.setUTCHours(hour,0,0,0);
  return d.toISOString();
};

// ── Assertion log ──
const findings = []; // {id, persona, action, expected, actual, severity, evidence, ok}
let nF = 0;
function assert({persona, action, expected, actual, pass, severity='medium', evidence=''}) {
  nF++;
  const rec = { n:nF, persona, action, expected, actual, pass, severity, evidence };
  findings.push(rec);
  console.log(`${pass?'PASS':'**BUG**'} [${persona}] ${action} :: exp=${expected} got=${actual}${pass?'':'  EVID:'+evidence}`);
  return pass;
}
const counts = {};
const bump = (k,n=1)=> counts[k]=(counts[k]||0)+n;

// helper: did a write get rejected? returns {rejected, msg}
async function tryInsert(client, table, row) {
  const { error } = await client.from(table).insert(row);
  return { rejected: !!error, msg: error?.message || '' };
}

async function main() {
  console.log('=== ChurchOS 2-month simulation (focal: St. Mary Magdalene) ===\n');

  // ──────────────────────────────────────────────────────────────────────────
  // SETUP: focal parish needs an event_booking fee for reserve_slot; add via svc
  // ──────────────────────────────────────────────────────────────────────────
  {
    const { data: p } = await svc.from('parishes').select('public_config').eq('id', ST_MARY).single();
    const cfg = p.public_config || {};
    cfg.fees = { ...(cfg.fees||{}), event_booking: 1500 };
    await svc.from('parishes').update({ public_config: cfg }).eq('id', ST_MARY);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PARISHIONERS — ~50 families (svc seeds directory) + portal submissions (anon)
  // ──────────────────────────────────────────────────────────────────────────
  const families = [];
  for (let i=0;i<50;i++){
    const sur = rnd(SUR);
    families.push({
      parish_id: ST_MARY, client_id:`FAM-${String(i+1).padStart(3,'0')}`,
      family_name:`${sur} Family`, barangay: rnd(BRGY),
      data:{ familyName:`${sur} Family`, head: `${rnd(GIV)} ${sur}`, barangay: rnd(BRGY), members: 2+Math.floor(Math.random()*6) }
    });
  }
  {
    const { error } = await svc.from('families').insert(families);
    assert({persona:'Parishioners', action:'seed 50 families', expected:'inserted', actual: error?('error: '+error.message):'inserted', pass:!error, severity:'high', evidence:error?.message});
    if(!error) bump('families',50);
  }

  // Portal service_requests as ANON (RLS-respecting public intake path).
  // Valid types only: mass_intention, certificate, donation, event_booking.
  const reqTypes = ['mass_intention','certificate','donation'];
  let submitted=0;
  for (let i=0;i<40;i++){
    const t = rnd(reqTypes);
    const wk = Math.floor(Math.random()*8);
    const row = {
      parish_id: ST_MARY, type: t,
      requester_name: fullName(),
      requester_email: `req${i}@mail.test`,
      requester_phone: `0917${Math.floor(1000000+Math.random()*8999999)}`,
      requested_date: dayISO(wk, Math.floor(Math.random()*6)),
      details: t==='donation' ? { amount: peso(200,3000), note:'Pamisa para sa yumao' }
              : t==='mass_intention' ? { intention:'Thanksgiving', forWhom: fullName() }
              : { certType:'Baptismal certificate', forWhom: fullName() },
    };
    const { error } = await anon.from('service_requests').insert(row);
    if(!error) submitted++;
    else if(i<3) console.log('   (anon submit err sample):', error.message);
  }
  assert({persona:'Parishioners', action:'submit service_requests via anon portal', expected:'~40 accepted', actual:`${submitted} accepted`, pass: submitted>=30, severity:'high', evidence:`only ${submitted}/40`});
  bump('service_requests', submitted);

  // ASSERT: anon cannot read back others' requests (no SELECT policy for anon)
  {
    const { data, error } = await anon.from('service_requests').select('id').limit(5);
    assert({persona:'Verifier/RLS', action:'anon SELECT service_requests', expected:'0 rows (no read policy)', actual:`${(data||[]).length} rows`, pass:(data||[]).length===0, severity:'critical', evidence:error?.message||JSON.stringify(data)});
  }
  // ASSERT: anon cannot set its own price/status (policy req_public_submit forbids)
  {
    const { rejected } = await tryInsert(anon,'service_requests',{ parish_id:ST_MARY, type:'mass_intention', amount:0, status:'completed', payment_status:'paid' });
    assert({persona:'Parishioners (malicious)', action:'anon submit pre-paid/completed request', expected:'rejected', actual: rejected?'rejected':'ACCEPTED', pass:rejected, severity:'critical', evidence:'self-priced request slipped through'});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCHEDULING — publish availability_slots (svc) + parishioners reserve (anon RPC)
  // ──────────────────────────────────────────────────────────────────────────
  const slots = [];
  const slotTypes=['baptism','wedding','funeral'];
  for (let wk=0; wk<8; wk++){
    for (const t of slotTypes){
      // Sat slots at 9/11/14h
      for (const h of [9,11,14]){
        slots.push({ parish_id:ST_MARY, type:t, slot_at: tsISO(wk,5,h), duration_min:60, status:'open' });
      }
    }
  }
  {
    const { error } = await svc.from('availability_slots').insert(slots);
    assert({persona:'Secretary', action:`publish ${slots.length} availability slots`, expected:'inserted', actual:error?('err:'+error.message):'inserted', pass:!error, severity:'medium', evidence:error?.message});
    if(!error) bump('availability_slots', slots.length);
  }
  // Parishioners reserve a handful atomically via reserve_slot RPC (anon).
  let reserved=0, reserveTokens=[];
  {
    const { data: openSlots } = await svc.from('availability_slots').select('id,slot_at').eq('parish_id',ST_MARY).eq('status','open').gt('slot_at', new Date().toISOString()).limit(8);
    let ei=0;
    for (const s of (openSlots||[])){
      const email = `book${ei++}@mail.test`;
      const { data, error } = await anon.rpc('reserve_slot', { p_slot:s.id, p_name:fullName(), p_email:email, p_phone:'09170000000', p_details:{ note:'Online booking' }});
      if(!error && data){ reserved++; reserveTokens.push(data); } else if(ei<=2) console.log('   (reserve err sample):', error?.message);
    }
    assert({persona:'Parishioners', action:'reserve_slot via anon RPC', expected:'>=1 reserved (atomic)', actual:`${reserved} reserved`, pass:reserved>=1, severity:'high', evidence:'reserve_slot produced no bookings'});
    bump('event_booking_requests', reserved);
  }
  // ASSERT: double-book the SAME slot must fail (atomic claim)
  {
    const { data: oneOpen } = await svc.from('availability_slots').select('id').eq('parish_id',ST_MARY).eq('status','open').gt('slot_at', new Date().toISOString()).limit(1).single();
    if (oneOpen){
      const r1 = await anon.rpc('reserve_slot',{p_slot:oneOpen.id,p_name:'First Caller',p_email:'race1@mail.test',p_phone:'1',p_details:{}});
      const r2 = await anon.rpc('reserve_slot',{p_slot:oneOpen.id,p_name:'Second Caller',p_email:'race2@mail.test',p_phone:'2',p_details:{}});
      const firstOK = !r1.error && r1.data;
      const secondBlocked = !!r2.error;
      assert({persona:'Verifier', action:'double-reserve same slot', expected:'1st ok, 2nd blocked', actual:`1st=${firstOK?'ok':'fail'} 2nd=${secondBlocked?'blocked':'ALSO BOOKED'}`, pass:firstOK&&secondBlocked, severity:'critical', evidence:'slot double-booked'});
      if(firstOK) bump('event_booking_requests',1);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CLUMSY SECRETARY — process requests into sacrament records WITH blunders
  // ──────────────────────────────────────────────────────────────────────────
  // Good baptisms across weeks
  let baptisms=0, marriages=0, confirmations=0, deaths=0;
  for (let wk=0;wk<8;wk++){
    for (let k=0;k<2;k++){
      const r = await svc.from('baptism_records').insert({ parish_id:ST_MARY, client_id:`SM-BAP-${wk}-${k}`, registry_number:`B-2026-${100+wk*2+k}`, date_of_baptism:dayISO(wk,6), data:{ childName: fullName(), father: fullName(), mother: fullName(), godparents:[fullName(),fullName()] }});
      if(!r.error){baptisms++; bump('baptism_records');}
    }
  }
  for (let wk=0;wk<8;wk+=2){
    const r = await svc.from('marriage_records').insert({ parish_id:ST_MARY, client_id:`SM-MAR-${wk}`, registry_number:`M-2026-${50+wk}`, date_of_marriage:dayISO(wk,5), data:{ groom:fullName(), bride:fullName() }});
    if(!r.error){marriages++; bump('marriage_records');}
  }
  for (let wk=1;wk<8;wk+=3){
    const r = await svc.from('confirmation_records').insert({ parish_id:ST_MARY, client_id:`SM-CON-${wk}`, registry_number:`C-2026-${20+wk}`, date_of_confirmation:dayISO(wk,6), data:{ confirmand:fullName() }});
    if(!r.error){confirmations++; bump('confirmation_records');}
  }
  for (let wk=0;wk<8;wk+=2){
    const r = await svc.from('death_records').insert({ parish_id:ST_MARY, client_id:`SM-DTH-${wk}`, registry_number:`D-2026-${10+wk}`, date_of_burial:dayISO(wk,3), data:{ deceased:fullName(), age:60+Math.floor(Math.random()*30) }});
    if(!r.error){deaths++; bump('death_records');}
  }
  console.log(`   sacraments: baptisms=${baptisms} marriages=${marriages} confirmations=${confirmations} deaths=${deaths}`);

  // BLUNDER 1: duplicate registry (same client_id) — unique(parish_id,client_id) must catch
  {
    const dup = { parish_id:ST_MARY, client_id:'SM-BAP-0-0', registry_number:'B-DUP', date_of_baptism:dayISO(0,6), data:{childName:'Dupe'} };
    const { rejected, msg } = await tryInsert(svc,'baptism_records',dup);
    assert({persona:'Clumsy secretary', action:'duplicate baptism (same client_id)', expected:'rejected by unique idx', actual:rejected?'rejected':'DUPLICATE PERSISTED', pass:rejected, severity:'high', evidence:msg||'duplicate row persisted'});
  }
  // BLUNDER 2: collection with NEGATIVE cash — derive_collections must reject
  {
    const { rejected, msg } = await tryInsert(svc,'collections',{ parish_id:ST_MARY, client_id:'SM-BAD-NEG', data:{ date:dayISO(2,0), massTime:'9:00 AM', cash:-5000, checks:0, digital:0, postedBy:'Aida' }});
    assert({persona:'Clumsy secretary', action:'collection with negative cash', expected:'rejected (>=0 guard)', actual:rejected?'rejected':'NEGATIVE PERSISTED', pass:rejected, severity:'critical', evidence:msg||'negative money persisted'});
  }
  // BLUNDER 3: collection with non-numeric (typo) cash 's12000'
  {
    const { rejected, msg } = await tryInsert(svc,'collections',{ parish_id:ST_MARY, client_id:'SM-BAD-TYPO', data:{ date:dayISO(2,0), massTime:'9:00 AM', cash:'12oo0', checks:0, digital:0, postedBy:'Aida' }});
    assert({persona:'Clumsy secretary', action:'collection with typo (non-numeric) cash', expected:'rejected (cast error)', actual:rejected?'rejected':'GARBAGE PERSISTED', pass:rejected, severity:'high', evidence:msg||'non-numeric cash persisted'});
  }
  // BLUNDER 4: out-of-range / unparseable date in collection
  {
    const { rejected, msg } = await tryInsert(svc,'collections',{ parish_id:ST_MARY, client_id:'SM-BAD-DATE', data:{ date:'2026-13-45', massTime:'9:00 AM', cash:1000, checks:0, digital:0, postedBy:'Aida' }});
    assert({persona:'Clumsy secretary', action:'collection with impossible date 2026-13-45', expected:'rejected (date cast)', actual:rejected?'rejected':'BAD DATE PERSISTED', pass:rejected, severity:'medium', evidence:msg||'invalid date persisted'});
  }
  // BLUNDER 5: unbalanced journal entry (dr != cr) — derive_journal must reject
  {
    const { rejected, msg } = await tryInsert(svc,'journal_entries',{ parish_id:ST_MARY, client_id:'SM-BAD-JE', data:{ date:dayISO(3,1), reference:'JE-BAD', totalDr:10000, totalCr:9000, status:'Posted', lines:[{accountCode:'5100',accountName:'Utilities',debit:10000,credit:0}] }});
    assert({persona:'Clumsy secretary', action:'unbalanced journal (dr 10000 != cr 9000)', expected:'rejected (balance guard)', actual:rejected?'rejected':'UNBALANCED PERSISTED', pass:rejected, severity:'critical', evidence:msg||'unbalanced books persisted'});
  }
  // BLUNDER 6: journal lines as object not array — derive_journal must reject
  {
    const { rejected, msg } = await tryInsert(svc,'journal_entries',{ parish_id:ST_MARY, client_id:'SM-BAD-JE2', data:{ date:dayISO(3,1), reference:'JE-BAD2', totalDr:0, totalCr:0, lines:{ not:'an array' } }});
    assert({persona:'Clumsy secretary', action:'journal lines as object (not array)', expected:'rejected (array guard)', actual:rejected?'rejected':'NON-ARRAY PERSISTED', pass:rejected, severity:'medium', evidence:msg||'non-array lines persisted'});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIEST — calendar_events: daily/Sunday masses + sacramental events + meetings
  //          + DELIBERATE overlaps to test conflict detection.
  // ──────────────────────────────────────────────────────────────────────────
  let events=0;
  for (let wk=0;wk<8;wk++){
    // Sunday masses (day 6 = Sunday since WK0 is Monday)
    for (const mt of ['6:00 AM','9:00 AM','6:00 PM']){
      const r=await svc.from('calendar_events').insert({ parish_id:ST_MARY, client_id:`EV-SUN-${wk}-${mt}`, date:dayISO(wk,6), type:'mass', officiant:'Fr. Reyes', location:'Main Church', data:{ title:`Sunday Mass ${mt}`, start:tsISO(wk,6, parseInt(mt)+(mt.includes('PM')&&!mt.startsWith('12')?12:0)), massTime:mt }});
      if(!r.error){events++; bump('calendar_events');}
    }
    // a weekday meeting
    const r2=await svc.from('calendar_events').insert({ parish_id:ST_MARY, client_id:`EV-MTG-${wk}`, date:dayISO(wk,2), type:'meeting', officiant:'Fr. Reyes', location:'Parish Office', data:{ title:'Parish Pastoral Council', start:tsISO(wk,2,19) }});
    if(!r2.error){events++; bump('calendar_events');}
  }
  // DELIBERATE OVERLAP: two events, same parish, same date/time/location/officiant
  {
    const base = { parish_id:ST_MARY, date:dayISO(4,1), type:'mass', officiant:'Fr. Reyes', location:'Main Church' };
    const a = await svc.from('calendar_events').insert({ ...base, client_id:'EV-OVL-A', data:{ title:'Wedding A', start:tsISO(4,1,10), end:tsISO(4,1,11) }});
    const b = await svc.from('calendar_events').insert({ ...base, client_id:'EV-OVL-B', data:{ title:'Wedding B (CONFLICT)', start:tsISO(4,1,10), end:tsISO(4,1,11) }});
    const bothPersisted = !a.error && !b.error;
    if(!a.error) bump('calendar_events'); if(!b.error) bump('calendar_events');
    // Expectation: schema has NO conflict trigger → both persist silently (= a gap to report).
    assert({persona:'Priest', action:'create two fully-overlapping calendar_events', expected:'conflict detected/blocked OR flagged', actual: bothPersisted?'BOTH PERSISTED silently':'one blocked', pass: !bothPersisted, severity:'medium', evidence:'No DB-level conflict detection on calendar_events; double-booking persists silently. App layer must guard.'});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FINANCE OFFICER — weekly collections, budget_items, journal entries, waivers
  // ──────────────────────────────────────────────────────────────────────────
  let coll=0; const massTimes=['6:00 AM','9:00 AM','6:00 PM'];
  for (let wk=0;wk<8;wk++){
    for (const mt of massTimes){
      const cash=peso(4000,16000), checks=Math.random()<0.4?peso(0,3000):0, digital=peso(500,4000);
      const r=await svc.from('collections').insert({ parish_id:ST_MARY, client_id:`SM-WK${wk}-${mt.replace(/[^0-9A-Z]/g,'')}`, data:{ date:dayISO(wk,6), massTime:mt, cash, checks, digital, postedBy:'Aida', status:'Posted' }});
      if(!r.error){coll++; bump('collections');}
    }
  }
  // budget_items
  const budgets=[
    {code:'5100',name:'Utilities',monthly:12000},{code:'5200',name:'Clergy stipend',monthly:6500},
    {code:'5300',name:'Building repairs',monthly:8000},{code:'5400',name:'Catechetical materials',monthly:3000},
    {code:'5500',name:'Charity / SSDM',monthly:5000},
  ];
  let bi=0;
  for (const b of budgets){
    const r=await svc.from('budget_items').insert({ parish_id:ST_MARY, client_id:`BUD-${b.code}`, account_code:b.code, data:{ accountCode:b.code, accountName:b.name, monthlyBudget:b.monthly, period:'2026-Q2' }});
    if(!r.error){bi++; bump('budget_items');}
  }
  // weekly journal entries (balanced)
  let je=0;
  for (let wk=0;wk<8;wk++){
    const util=peso(8000,14000), stip=6500;
    const tot=util+stip;
    const r=await svc.from('journal_entries').insert({ parish_id:ST_MARY, client_id:`SM-JE-WK${wk}`, data:{ date:dayISO(wk,1), reference:`JE-${1000+wk}`, description:`Week ${wk+1} operating expenses`, status:'Posted', totalDr:tot, totalCr:tot, postedBy:'Aida', lines:[ {accountCode:'5100',accountName:'Utilities',debit:util,credit:0},{accountCode:'5200',accountName:'Clergy stipend',debit:stip,credit:0},{accountCode:'1000',accountName:'Cash',debit:0,credit:tot} ]}});
    if(!r.error){je++; bump('journal_entries');}
  }
  console.log(`   finance: collections=${coll} budget_items=${bi} journals=${je}`);

  // Fee waivers → fee_override_audit. Build a HASH CHAIN per parish (prev_hash linkage).
  // Two small/reasonable + ONE large suspicious (priest self-approved).
  let prev='GENESIS', waivers=0;
  const waiverPlan=[
    { who:'Aida', amt:200, sac:'Baptism', reason:'Indigent family', susp:false },
    { who:'Aida', amt:150, sac:'Certificate', reason:'Senior citizen', susp:false },
    { who:'Fr. Delgado', amt:8000, sac:'Wedding', reason:'(no reason given)', susp:true }, // LARGE, self-approved
  ];
  for (let i=0;i<waiverPlan.length;i++){
    const w=waiverPlan[i];
    const row={ parish_id:ST_MARY, client_id:`SM-WV-${i}`, data:{ timestamp:tsISO(i+1,2,10), sacrament:w.sac, registryId:`R-${i}`, personName:fullName(), overrideType:'waived', amount:w.amt, reason:w.reason, recordedBy:w.who, prevHash:prev, hash:'client-advisory' }};
    const { data, error } = await svc.from('fee_override_audit').insert(row).select('hash').single();
    if(!error){ waivers++; bump('fee_override_audit'); prev = data.hash; } // chain on the SERVER-computed hash
    else console.log('   (waiver insert err):', error.message);
  }
  assert({persona:'Finance officer', action:'record 3 fee waivers (chained)', expected:'3 inserted', actual:`${waivers} inserted`, pass:waivers===3, severity:'high', evidence:'waiver insert failed'});

  // ASSERT: audit append-only — UPDATE must fail
  {
    const { data: a } = await svc.from('fee_override_audit').select('id').eq('parish_id',ST_MARY).eq('client_id','SM-WV-2').single();
    // service_role bypasses the append-only guard (by design). Test the PUBLIC API path: authenticated user.
    const aidaC = createClient(URL, ANON, { auth:{persistSession:false} });
    await aidaC.auth.signInWithPassword(AIDA);
    const upd = await aidaC.from('fee_override_audit').update({ amount: 0 }).eq('id', a.id);
    const del = await aidaC.from('fee_override_audit').delete().eq('id', a.id);
    // Either RLS blocks it (0 rows, no error) OR the trigger raises. Both = tamper-proof.
    const { data: after } = await svc.from('fee_override_audit').select('amount').eq('id',a.id).single();
    const stillLarge = Number(after.amount)===8000;
    assert({persona:'Verifier', action:'authenticated UPDATE/DELETE fee_override_audit (tamper)', expected:'blocked, row unchanged', actual: stillLarge?'unchanged (good)':'TAMPERED amount='+after.amount, pass:stillLarge, severity:'critical', evidence:`upd.err=${upd.error?.message} del.err=${del.error?.message}`});
    await aidaC.auth.signOut();
  }
  // ASSERT: HMAC chain verifies for the focal parish (verify_audit is granted to
  // 'authenticated', so call it as Aida — the intended caller path).
  {
    const aidaC = createClient(URL, ANON, { auth:{persistSession:false} });
    await aidaC.auth.signInWithPassword(AIDA);
    const { data, error } = await aidaC.rpc('verify_audit', { p_parish: ST_MARY });
    const allOk = !error && (data||[]).length>0 && data.every(r=>r.ok===true);
    assert({persona:'Verifier', action:'verify_audit HMAC chain (St. Mary)', expected:'all rows ok=true', actual: error?('err:'+error.message):`${(data||[]).filter(r=>r.ok).length}/${(data||[]).length} ok`, pass:allOk, severity:'high', evidence:JSON.stringify(data)});
    await aidaC.auth.signOut();
  }
  // ASSERT: large self-approved waiver is detectable (>= flag threshold, recorder is priest)
  {
    const { data } = await svc.from('fee_override_audit').select('amount,recorded_by,person_name').eq('parish_id',ST_MARY).gte('amount',5000);
    const flagged=(data||[]).filter(r=>/fr\.?|delgado|priest/i.test(r.recorded_by||''));
    assert({persona:'Verifier', action:'detect suspicious large self-approved waiver', expected:'>=1 flagged (>=5000, priest)', actual:`${flagged.length} flagged`, pass:flagged.length>=1, severity:'medium', evidence:JSON.stringify(data)});
  }

  // ──────────────────────────────────────────────────────────────────────────
  // VERIFIER — cross-parish RLS isolation + derived totals + diocese report
  // ──────────────────────────────────────────────────────────────────────────
  // Aida (St. Mary) must NOT read San Roque or Sto. Niño rows.
  {
    const aidaC = createClient(URL, ANON, { auth:{persistSession:false} });
    const { error: signErr } = await aidaC.auth.signInWithPassword(AIDA);
    if(signErr){ assert({persona:'Verifier', action:'Aida login', expected:'ok', actual:'LOGIN FAIL: '+signErr.message, pass:false, severity:'critical', evidence:signErr.message}); }
    else {
      const ownC = await aidaC.from('collections').select('parish_id');
      const ownParishes = new Set((ownC.data||[]).map(r=>r.parish_id));
      const leak = [...ownParishes].some(p=>p!==ST_MARY);
      assert({persona:'Verifier/RLS', action:'Aida reads collections', expected:'only St. Mary parish_id', actual: leak?('LEAK: '+[...ownParishes].join(',')):`${ownC.data?.length} rows, all St. Mary`, pass: !leak && (ownC.data||[]).length>0, severity:'critical', evidence:[...ownParishes].join(',')});
      // explicit cross-parish probe: try to read San Roque
      const cross = await aidaC.from('collections').select('id').eq('parish_id',SAN_ROQUE);
      assert({persona:'Verifier/RLS', action:'Aida reads San Roque collections (cross-parish)', expected:'0 rows', actual:`${(cross.data||[]).length} rows`, pass:(cross.data||[]).length===0, severity:'critical', evidence:JSON.stringify(cross.data)});
      // cross-parish WRITE: Aida tries to insert into San Roque (force_parish_id should rewrite to her parish OR block)
      const w = await aidaC.from('collections').insert({ parish_id:SAN_ROQUE, client_id:'EVIL-1', data:{date:dayISO(0,0),massTime:'x',cash:1,checks:0,digital:0} }).select('parish_id').single();
      const landedInSanRoque = !w.error && w.data?.parish_id===SAN_ROQUE;
      assert({persona:'Verifier/RLS', action:'Aida writes into San Roque (forged parish_id)', expected:'blocked or forced to own parish', actual: w.error?('blocked: '+w.error.message): (landedInSanRoque?'LANDED IN SAN ROQUE':'forced to '+w.data?.parish_id), pass: !landedInSanRoque, severity:'critical', evidence:JSON.stringify(w)});
      // self-elevation: Aida tries to promote herself to bishop
      const prom = await aidaC.from('profiles').update({ role:'bishop' }).eq('email',AIDA.email);
      const { data: meAfter } = await svc.from('profiles').select('role').eq('email',AIDA.email).single();
      assert({persona:'Verifier/RLS', action:'Aida self-promotes to bishop', expected:'role stays secretary', actual: meAfter.role, pass: meAfter.role==='secretary', severity:'critical', evidence:`role=${meAfter.role} updErr=${prom.error?.message}`});
      await aidaC.auth.signOut();
    }
  }
  // Bishop Tomas (Manila) must read Manila reports but NOT Cubao's.
  {
    // bishop has no password in seed for sign-in? seed sets pw Test1234! for all 4. login as bishop.
    const bC = createClient(URL, ANON, { auth:{persistSession:false} });
    const { error } = await bC.auth.signInWithPassword({ email:'bishop.manila@churchos.test', password:'Test1234!' });
    if(error){ assert({persona:'Verifier', action:'Bishop Tomas login', expected:'ok', actual:'FAIL '+error.message, pass:false, severity:'high', evidence:error.message}); }
    else {
      const { data } = await bC.from('diocese_reports').select('parish_id');
      const pids=new Set((data||[]).map(r=>r.parish_id));
      const sawCubao = pids.has(STO_NINO);
      assert({persona:'Verifier/RLS', action:'Bishop Tomas reads diocese_reports', expected:'Manila parishes only, NOT Sto.Niño', actual: sawCubao?'LEAK: saw Cubao parish':`${data?.length} reports, Manila only`, pass: !sawCubao && (data||[]).length>0, severity:'critical', evidence:[...pids].join(',')});
      await bC.auth.signOut();
    }
  }
  // Derived totals: collections.total == cash+checks+digital for every focal row
  {
    const { data } = await svc.from('collections').select('cash,checks,digital,total').eq('parish_id',ST_MARY);
    const bad=(data||[]).filter(r=>Number(r.total)!==Number(r.cash)+Number(r.checks)+Number(r.digital));
    assert({persona:'Verifier', action:'collections.total == cash+checks+digital (derived)', expected:'0 mismatches', actual:`${bad.length} mismatches of ${data?.length}`, pass:bad.length===0, severity:'high', evidence:JSON.stringify(bad.slice(0,3))});
  }
  // Build/refresh St. Mary's diocese report for the period and confirm net derivation
  {
    const { data: cAgg } = await svc.from('collections').select('total').eq('parish_id',ST_MARY).gte('date','2026-06-01').lte('date','2026-06-30');
    const cTotal=(cAgg||[]).reduce((s,r)=>s+Number(r.total||0),0);
    const { data: jAgg } = await svc.from('journal_entries').select('total_dr').eq('parish_id',ST_MARY).gte('date','2026-06-01').lte('date','2026-06-30');
    const eTotal=(jAgg||[]).reduce((s,r)=>s+Number(r.total_dr||0),0);
    const r=await svc.from('diocese_reports').upsert({ parish_id:ST_MARY, period:'2026-06', collections_total:cTotal, expense_total:eTotal, by_mass_time:{}, by_category:{}, sacrament_counts:{baptisms,marriages,confirmations,deaths}, flagged_waivers:[{by:'Fr. Delgado',amount:8000}] }, { onConflict:'parish_id,period' }).select('net,collections_total,expense_total').single();
    const expectNet = cTotal-eTotal;
    assert({persona:'Diocese report', action:'derive_report net = collections - expense', expected:`net=${expectNet}`, actual: r.error?('err:'+r.error.message):`net=${r.data?.net}`, pass: !r.error && Number(r.data?.net)===expectNet, severity:'high', evidence:JSON.stringify(r.data)});
  }

  // ── SUMMARY ──
  console.log('\n=== COUNTS (focal parish + global) ===');
  console.log(JSON.stringify(counts,null,2));
  const bugs=findings.filter(f=>!f.pass);
  console.log(`\n=== ASSERTIONS: ${findings.length} total, ${findings.length-bugs.length} PASS, ${bugs.length} BUG ===`);
  for(const b of bugs) console.log(`  **BUG** [${b.severity}] (${b.persona}) ${b.action} :: expected ${b.expected}, got ${b.actual} | ${b.evidence}`);

  // write machine-readable results for the report step
  const fs = await import('node:fs');
  fs.writeFileSync('C:/app/scripts/sim/sim-results.json', JSON.stringify({ counts, findings }, null, 2));
  console.log('\nwrote scripts/sim/sim-results.json');
}
main().catch(e=>{ console.error('FATAL', e); process.exit(1); });
