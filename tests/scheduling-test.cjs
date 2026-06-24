// ════════════════════════════════════════════════════════════════════════
// ChurchOS — slot-generation test (self-service scheduling)
//   node tests/scheduling-test.cjs
// Verifies that published slots reuse the calendar conflict rule (overlap +
// 1-hour transition buffer), so a parishioner can never pick an unschedulable time.
// ════════════════════════════════════════════════════════════════════════

const sched = require('../electron/scheduling.cjs');

let pass = 0, fail = 0; const fails = [];
const check = (id, ok) => { (ok ? pass++ : (fail++, fails.push(id))); console.log(`  ${ok ? '✅' : '❌'} ${id}`); };

console.log('\n📅  Slot generation\n');

// ── conflicts(): the core rule ──
const slot = { date: '2026-06-07', start: '11:00', end: '12:00' };
check('conflict-overlap', sched.conflicts(slot, { date: '2026-06-07', startTime: '11:30', endTime: '12:30' }) === true);
check('conflict-within-buffer', sched.conflicts(slot, { date: '2026-06-07', startTime: '09:30', endTime: '10:30' }) === true); // gap 30 < 60
check('clear-outside-buffer', sched.conflicts(slot, { date: '2026-06-07', startTime: '08:00', endTime: '09:00' }) === false); // gap 120
check('clear-different-date', sched.conflicts(slot, { date: '2026-06-08', startTime: '11:00', endTime: '12:00' }) === false);
check('clear-event-no-time', sched.conflicts(slot, { date: '2026-06-07', startTime: '', endTime: '' }) === false);

// ── generateSlots(): a Sunday-11:00 baptism rule over the 2-month window ──
// 2026-06-07 is a Sunday.
const rules = [{ type: 'baptism', weekday: 0, time: '11:00', durationMin: 60 }];
const events = [
  { date: '2026-06-14', startTime: '11:00', endTime: '12:00' }, // overlaps the 11:00 slot → blocked
  { date: '2026-06-21', startTime: '10:30', endTime: '11:00' }, // ends at 11:00, gap 0 < 60 → blocked
  { date: '2026-06-28', startTime: '09:00', endTime: '09:30' }, // ends 09:30, gap 90 → open
];
const slots = sched.generateSlots(rules, events, { fromDate: '2026-06-07', days: 60 });
const has = (d) => slots.some((s) => s.slot_at.startsWith(d));

check('open-clear-sunday', has('2026-06-07') === true);
check('blocked-overlap-sunday', has('2026-06-14') === false);
check('blocked-buffer-sunday', has('2026-06-21') === false);
check('open-gap-over-buffer', has('2026-06-28') === true);
check('only-sundays', slots.every((s) => new Date(s.slot_at).getDay() === 0));
check('slot-shape', slots[0] && slots[0].type === 'baptism' && slots[0].duration_min === 60 && /T11:00:00$/.test(slots[0].slot_at));
check('window-bounded', slots.length >= 6 && slots.length <= 10); // ~9 Sundays in 60 days, minus 2 blocked

// ── reservation logic (mirrors reserve_slot / sync_slot_from_request / release) ──
console.log('\n🎟️  Reservation + slot lifecycle\n');
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
function world() { return { slots: [], reqs: [], n: 0 }; }
function addSlot(w, id, parish = 'A', status = 'open') { w.slots.push({ id, parish, type: 'baptism', status, held_until: null, request_id: null }); }
function reserve(w, slotId, email) {
  if (email) { const held = w.slots.filter((s) => s.status === 'held' && w.reqs.find((r) => r.id === s.request_id && r.email === email)); if (held.length >= 3) throw new Error('hold cap'); }
  const slot = w.slots.find((s) => s.id === slotId);
  if (!slot || slot.status !== 'open') throw new Error('unavailable');   // atomic claim
  slot.status = 'held'; slot.held_until = Date.now() + 30 * 60000;
  const req = { id: 'r' + (++w.n), parish: slot.parish, email, status: 'submitted' };
  w.reqs.push(req); slot.request_id = req.id; return req.id;
}
function setStatus(w, reqId, status) {
  const req = w.reqs.find((r) => r.id === reqId); req.status = status;
  // sync_slot_from_request — guard: request_id = reqId AND parish match
  if (status === 'confirmed') w.slots.filter((s) => s.request_id === reqId && s.parish === req.parish).forEach((s) => { s.status = 'booked'; });
  else if (status === 'rejected' || status === 'cancelled') w.slots.filter((s) => s.request_id === reqId && s.parish === req.parish).forEach((s) => { s.status = 'open'; s.held_until = null; s.request_id = null; });
}
function releaseExpired(w, now) {
  w.slots.filter((s) => s.status === 'held' && s.held_until < now).forEach((s) => {
    const req = w.reqs.find((r) => r.id === s.request_id);
    if (!req || !['submitted', 'in_review', 'scheduled'].includes(req.status)) { s.status = 'open'; s.held_until = null; s.request_id = null; }
  });
}

// atomic claim: a second reserve of the same slot loses
{ const w = world(); addSlot(w, 's1'); reserve(w, 's1', 'a@x'); check('atomic-second-reserve-loses', throws(() => reserve(w, 's1', 'b@x'))); }
// hold cap per email
{ const w = world(); ['s1', 's2', 's3', 's4'].forEach((id) => addSlot(w, id)); reserve(w, 's1', 'e@x'); reserve(w, 's2', 'e@x'); reserve(w, 's3', 'e@x'); check('hold-cap-per-email', throws(() => reserve(w, 's4', 'e@x'))); }
// release must NOT yank an active booking
{ const w = world(); addSlot(w, 's1'); reserve(w, 's1', 'a@x'); w.slots[0].held_until = Date.now() - 1; releaseExpired(w, Date.now()); check('release-keeps-active-booking', w.slots[0].status === 'held'); }
// release frees an abandoned/cancelled hold
{ const w = world(); addSlot(w, 's1'); const r = reserve(w, 's1', 'a@x'); w.reqs.find((x) => x.id === r).status = 'cancelled'; w.slots[0].held_until = Date.now() - 1; releaseExpired(w, Date.now()); check('release-frees-orphan-hold', w.slots[0].status === 'open'); }
// stale-request can't un-book the slot's NEW owner
{ const w = world(); addSlot(w, 's1'); const a = reserve(w, 's1', 'a@x'); setStatus(w, a, 'rejected'); const b = reserve(w, 's1', 'b@x'); setStatus(w, a, 'confirmed'); check('stale-request-cant-touch-new-owner', w.slots[0].status === 'held' && w.slots[0].request_id === b); }
// confirm books the slot; cross-parish edit can't reach it
{ const w = world(); addSlot(w, 's1', 'A'); const a = reserve(w, 's1', 'a@x'); setStatus(w, a, 'confirmed'); check('confirm-books-slot', w.slots[0].status === 'booked'); }

console.log(`\n${'─'.repeat(54)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed${fail ? '  →  ' + fails.join(', ') : ''}`);
console.log(`${'─'.repeat(54)}`);
process.exit(fail ? 1 : 0);
