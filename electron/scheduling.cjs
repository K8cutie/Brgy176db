// ChurchOS — slot generation (main process)
//
// Computes the OPEN sacrament slots a parish publishes to the cloud, from:
//   availability rules  −  existing calendar events  −  the 1-hour transition buffer
// It reuses the SAME conflict rule as the calendar UI, so every published slot is
// actually schedulable (no slot the secretary couldn't honor). The calendar never
// leaves the desktop — only the derived open-slot list goes up.

const db = require('./db.cjs');

let store = db;
function __setStore(s) { store = s; }

const TRANSITION_BUFFER_MIN = 60;
const toMin = (t) => { const p = String(t || '').split(':'); return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0); };
const minToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Does a candidate slot conflict with an existing calendar event? Same as the
// calendar UI: overlap, OR a gap smaller than the 1-hour transition buffer.
function conflicts(slot, ev) {
  if (!ev || slot.date !== (ev.date || '')) return false;
  const s1 = toMin(slot.start), e1 = toMin(slot.end);
  const s2 = toMin(ev.startTime || ev.start), e2 = toMin(ev.endTime || ev.end);
  if (!(e2 > s2)) return false;                 // event without a valid time window → ignore
  if (s1 < e2 && s2 < e1) return true;           // overlap
  const gap = s1 >= e2 ? s1 - e2 : s2 - e1;       // distance between the two windows
  return gap < TRANSITION_BUFFER_MIN;
}

// rules: [{ type:'baptism', weekday:0..6, time:'HH:MM', durationMin:60 }]
function generateSlots(rules, events, opts = {}) {
  const days = opts.days || 60;                  // ~2-month window
  const start = opts.fromDate ? new Date(opts.fromDate) : new Date();
  const base = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const ds = isoDate(d);
    for (const r of rules || []) {
      if (Number(r.weekday) !== d.getDay()) continue;
      const dur = Number(r.durationMin) || 60;
      const slot = { date: ds, start: r.time, end: minToTime(toMin(r.time) + dur) };
      if ((events || []).some((ev) => conflicts(slot, ev))) continue;
      out.push({ type: r.type, slot_at: `${ds}T${r.time}:00`, duration_min: dur });
    }
  }
  return out;
}

function localCalendarEvents() {
  const all = store.getAll();
  const key = Object.keys(all).find((k) => k.endsWith('_calendar_events'));
  if (!key) return [];
  try { const v = JSON.parse(all[key]); return Array.isArray(v) ? v : []; } catch { return []; }
}
function getRules() { try { return JSON.parse(store.metaGet('availability_rules') || '[]'); } catch { return []; } }
function setRules(rules) { store.metaSet('availability_rules', JSON.stringify(rules || [])); }
function openSlots(opts) { return generateSlots(getRules(), localCalendarEvents(), opts); }

module.exports = { generateSlots, conflicts, openSlots, getRules, setRules, localCalendarEvents, TRANSITION_BUFFER_MIN, __setStore };
