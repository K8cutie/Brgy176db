// Requests — the parishioner-portal "inbox" (ticketing). Each row is a request a
// parishioner submitted on the public website; the secretary moves it through its
// lifecycle. All parishioner text is rendered as TEXT (React escapes) — never
// dangerouslySetInnerHTML — so a crafted submission can't run script here.
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getJSON, setJSON } from '@/lib/storageNamespaced';
import { KEYS } from '@/lib/storageKeys';
import { getCurrentUserName } from '@/lib/session';
import { getParishConfig } from '@/lib/parishConfig';
import type { AuditLogEntry } from '@/lib/settingsData';
import {
  SAMPLE_EVENTS, PRIESTS, LOCATIONS,
  checkEventConflicts, validateSchedulingRules, eventTypeToRuleKey,
  type CalendarEvent, type EventType,
} from '@/lib/calendarData';
import { addIntentionFromRequest } from '@/lib/massIntentions';
import {
  buildSmsHref, buildMailtoHref, STATUS_TEMPLATES, fillTemplate,
  appendOutbox, listOutbox, type OutboxEntry,
} from '@/lib/notify';

interface ServiceRequest {
  id: string; type: string; status: string;
  requester_name?: string; requester_email?: string; requester_phone?: string;
  requested_date?: string | null; details?: Record<string, unknown>;
  amount?: number | null; payment_status: string; created_at: string;
}
interface RequestsBridge {
  list(): Promise<{ ok: boolean; requests?: ServiceRequest[]; error?: string }>;
  update(id: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string }>;
}
function requestsBridge(): RequestsBridge | null {
  const w = window as unknown as { churchos?: { requests?: RequestsBridge } };
  return w.churchos?.requests ?? null;
}

interface AvailabilityRule { type: string; weekday: number; time: string; durationMin: number }
interface SlotsBridge {
  getRules(): Promise<AvailabilityRule[]>;
  setRules(rules: AvailabilityRule[]): Promise<{ ok: boolean }>;
  publish(): Promise<{ ok: boolean; published?: number; removed?: number; error?: string }>;
}
function slotsBridge(): SlotsBridge | null {
  const w = window as unknown as { churchos?: { slots?: SlotsBridge } };
  return w.churchos?.slots ?? null;
}
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const INPUT_CLS = 'h-9 px-2 rounded-md border border-parchment bg-white text-sm text-charcoal dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text';

function AvailabilityConfig() {
  const bridge = useMemo(() => slotsBridge(), []);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { bridge?.getRules().then((r) => setRules(r || [])).catch(() => {}); }, [bridge]);
  if (!bridge) return null;

  const update = (i: number, patch: Partial<AvailabilityRule>) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const inp = INPUT_CLS;

  return (
    <div className="cos-card">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between">
        <span className="font-semibold text-sm text-charcoal dark:text-dm-text">Booking availability</span>
        <span className="text-xs text-warm-gray">{rules.length} rule{rules.length === 1 ? '' : 's'} · {open ? 'hide' : 'edit'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-warm-gray">When can parishioners book each sacrament? Open slots are your calendar minus a 1-hour buffer.</p>
          {rules.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={r.type} onChange={(e) => update(i, { type: e.target.value })} className={inp}>
                <option value="baptism">Baptism</option><option value="wedding">Wedding</option><option value="funeral">Funeral</option>
              </select>
              <select value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })} className={inp}>
                {WEEKDAYS.map((d, n) => <option key={n} value={n}>{d}</option>)}
              </select>
              <input type="time" value={r.time} onChange={(e) => update(i, { time: e.target.value })} className={inp} />
              <input type="number" value={r.durationMin} onChange={(e) => update(i, { durationMin: Number(e.target.value) })} className={`${inp} w-20`} title="minutes" />
              <button onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))} className="text-error text-sm">Remove</button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={() => setRules((rs) => [...rs, { type: 'baptism', weekday: 0, time: '11:00', durationMin: 60 }])} className="cos-btn cos-btn-secondary text-sm">Add rule</button>
            <button disabled={busy} onClick={async () => { setBusy(true); await bridge.setRules(rules); setMsg('Saved.'); setBusy(false); }} className="cos-btn cos-btn-secondary text-sm">Save</button>
            <button disabled={busy} onClick={async () => { setBusy(true); setMsg('Publishing…'); const r = await bridge.publish(); setMsg(r.ok ? `Published ${r.published ?? 0} open slot(s).` : `Could not publish: ${r.error}`); setBusy(false); }} className="cos-btn cos-btn-primary text-sm">Publish availability</button>
            {msg && <span className="text-sm text-warm-gray self-center">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  mass_intention: 'Mass Intention', certificate: 'Certificate', donation: 'Donation', event_booking: 'Event Booking',
};
const FLOW = ['submitted', 'in_review', 'scheduled', 'confirmed', 'completed'];
const STATES = [...FLOW, 'rejected', 'cancelled'];
const peso = (n: number) => '₱' + Math.round(n).toLocaleString();
const badge = (s: string) =>
  s === 'submitted' ? 'cos-badge-warning' : s === 'completed' || s === 'confirmed' ? 'cos-badge-success'
    : s === 'rejected' || s === 'cancelled' ? 'cos-badge-default' : 'cos-badge-info';

// ============================================
// Audit trail — appends to the SAME persisted 'audit_log' store (and entry
// shape) that FinancePage.appendFinanceAudit uses, through the storage seam.
// ============================================
function appendRequestsAudit(action: string, recordId: string, details: string): void {
  const log = getJSON<AuditLogEntry[]>('audit_log', []);
  const entry: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    user: getCurrentUserName(),
    action,
    table: 'Requests',
    recordId,
    details,
    ipAddress: 'local',
  };
  setJSON('audit_log', [entry, ...log]);
}

// ============================================
// Local workflow stamps — the requests bridge whitelists status / amount /
// payment_status only (see electron/sync.cjs requestUpdate), so a details
// patch would be silently dropped. Stamps like "calendar event created"
// therefore persist LOCALLY through the seam, keyed by request id, and are
// merged into each row's details for display.
// ============================================
type StampMap = Record<string, Record<string, string>>;
const STAMPS_KEY = 'request_stamps';
function stampRequest(id: string, field: string, value: string): void {
  const map = getJSON<StampMap>(STAMPS_KEY, {});
  map[id] = { ...(map[id] || {}), [field]: value };
  setJSON(STAMPS_KEY, map);
}
function mergeStamps(rows: ServiceRequest[]): ServiceRequest[] {
  const map = getJSON<StampMap>(STAMPS_KEY, {});
  return rows.map((r) => (map[r.id] ? { ...r, details: { ...(r.details || {}), ...map[r.id] } } : r));
}

// ============================================
// Booking → calendar helpers
// ============================================

// Portal event types → calendar event types (a Funeral books the Death lane).
const PORTAL_EVENT_TYPE: Record<string, EventType> = {
  Baptism: 'Baptism', Wedding: 'Wedding', Funeral: 'Death', Blessing: 'General', Other: 'General',
};
// Scheduling-rule key → CalendarEvent sacrament link type (wedding ≠ marriage).
const SACRAMENT_LINK: Record<string, 'baptism' | 'marriage' | 'confirmation' | 'death'> = {
  baptism: 'baptism', wedding: 'marriage', confirmation: 'confirmation', death: 'death',
};
const EVENT_TYPE_OPTIONS: EventType[] = ['Baptism', 'Wedding', 'Confirmation', 'Death', 'Mass', 'Ministry', 'SSDM', 'General'];

// requested_date may be a plain date ("2026-07-20") or an ISO timestamp from a
// reserved slot ("2026-07-20T01:00:00+00:00") — split into LOCAL date + time.
function splitRequestedDate(raw?: string | null): { date: string; time: string; hasTime: boolean } {
  if (!raw) return { date: '', time: '09:00', hasTime: false };
  if (raw.includes('T')) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        hasTime: true,
      };
    }
  }
  return { date: raw.slice(0, 10), time: '09:00', hasTime: false };
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Friendly date for parishioner messages: "Sat, Jul 18" (+ time when known).
function fmtForMessage(raw?: string | null): string {
  if (!raw) return 'the date we will arrange with you';
  const { date, time, hasTime } = splitRequestedDate(raw);
  const d = new Date(`${date}T${time}:00`);
  if (Number.isNaN(d.getTime())) return raw;
  const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return hasTime ? `${day} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : day;
}

// ============================================
// "Create calendar event" step — opens when staff schedules/confirms an event
// booking. Prefills from the request, validates against the live calendar with
// the calendarData conflict + scheduling-rule helpers (read-only imports), and
// appends the exact CalendarEvent shape to KEYS.calendarEvents via the seam.
// Plain overlay on purpose — no animation wrapper around the dialog.
// ============================================
function CreateCalendarEventModal({ request, onClose, onCreated }: {
  request: ServiceRequest;
  onClose: () => void;
  onCreated: (eventDate: string) => void;
}) {
  const rawType = String(request.details?.event_type ?? '');
  const prefill = splitRequestedDate(request.requested_date);
  const [type, setType] = useState<EventType>(PORTAL_EVENT_TYPE[rawType] || 'General');
  const [title, setTitle] = useState(`${rawType || 'Parish event'}${request.requester_name ? `: ${request.requester_name}` : ''}`);
  const [date, setDate] = useState(prefill.date);
  const [startTime, setStartTime] = useState(prefill.time);
  const [endTime, setEndTime] = useState(addMinutes(prefill.time, 60));
  const [location, setLocation] = useState<string>(LOCATIONS[0]);
  const [officiant, setOfficiant] = useState<string>(PRIESTS[0].name);
  // Privacy: the title carries the requester's name, so publishing to the
  // public calendar is opt-in — default OFF.
  const [isPublic, setIsPublic] = useState(false);

  // Existing calendar — same seed CalendarPage uses, so appends never drop it.
  const events = useMemo(() => getJSON<CalendarEvent[]>(KEYS.calendarEvents, SAMPLE_EVENTS), []);

  const complete = !!(date && startTime && endTime && title.trim());
  const conflicts = complete
    ? checkEventConflicts(events, { title, type, date, startTime, endTime, location, officiant, isPublic })
    : [];
  const blocks = conflicts.filter((c) => c.severity === 'block');
  const ruleKey = eventTypeToRuleKey(type);
  const rules = ruleKey && date && startTime
    ? validateSchedulingRules(ruleKey, date, startTime, location)
    : { valid: true, errors: [] as string[], warnings: [] as string[] };
  const timeOrderOk = startTime < endTime;
  const canSave = complete && timeOrderOk && blocks.length === 0;

  const save = () => {
    const ruleNotes = [...rules.errors, ...rules.warnings].join(' ');
    const ev: CalendarEvent = {
      id: `evt-req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: title.trim(), type, date, startTime, endTime, location, officiant,
      description: `From portal request${request.requester_name ? ` by ${request.requester_name}` : ''}${request.details?.notes ? ` — ${String(request.details.notes)}` : ''}`,
      isPublic,
      ...(ruleKey ? { sacramentRecordType: SACRAMENT_LINK[ruleKey], sacramentSummary: request.requester_name || title.trim() } : {}),
      ruleEnforced: !!ruleKey && rules.errors.length === 0,
      ruleNotes: ruleNotes || undefined,
    };
    const current = getJSON<CalendarEvent[]>(KEYS.calendarEvents, SAMPLE_EVENTS);
    setJSON(KEYS.calendarEvents, [...current, ev]);
    onCreated(date);
  };

  const inp = INPUT_CLS;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="cos-card w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-charcoal dark:text-dm-text">Create calendar event</h2>
            <p className="text-xs text-warm-gray mt-0.5">
              Put this booking on the parish calendar{request.requester_name ? ` — ${request.requester_name}` : ''}. You can also do this later.
            </p>
          </div>
          <button onClick={onClose} className="text-warm-gray text-sm" aria-label="Close">✕</button>
        </div>

        <div className="mt-3 space-y-2">
          <label className="block text-xs text-warm-gray">Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inp} w-full mt-1`} />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="block text-xs text-warm-gray">Type
              <select value={type} onChange={(e) => setType(e.target.value as EventType)} className={`${inp} block mt-1`}>
                {EVENT_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t === 'Death' ? 'Death / Funeral' : t}</option>)}
              </select>
            </label>
            <label className="block text-xs text-warm-gray">Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inp} block mt-1`} />
            </label>
            <label className="block text-xs text-warm-gray">Start
              <input type="time" value={startTime} onChange={(e) => { setStartTime(e.target.value); setEndTime(addMinutes(e.target.value, 60)); }} className={`${inp} block mt-1`} />
            </label>
            <label className="block text-xs text-warm-gray">End
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={`${inp} block mt-1`} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="block text-xs text-warm-gray">Officiant
              <select value={officiant} onChange={(e) => setOfficiant(e.target.value)} className={`${inp} block mt-1`}>
                {PRIESTS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-warm-gray">Location
              <select value={location} onChange={(e) => setLocation(e.target.value)} className={`${inp} block mt-1`}>
                {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-warm-gray">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            Show on public calendar (the event title includes the requester's name)
          </label>

          {!timeOrderOk && complete && (
            <p className="text-sm text-error">End time must be after the start time.</p>
          )}
          {blocks.map((c, i) => (
            <p key={`b${i}`} className="text-sm text-error">⛔ {c.message}</p>
          ))}
          {conflicts.filter((c) => c.severity === 'warn').map((c, i) => (
            <p key={`w${i}`} className="text-sm text-warning">⚠ {c.message}</p>
          ))}
          {[...rules.errors, ...rules.warnings].map((m, i) => (
            <p key={`r${i}`} className="text-sm text-warning">⚠ {m} You can still save — the note is kept on the event.</p>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={save} disabled={!canSave} className={cn('cos-btn cos-btn-primary text-sm', !canSave && 'opacity-50 cursor-not-allowed')}>
            Save to calendar
          </button>
          <button onClick={onClose} className="cos-btn cos-btn-secondary text-sm">Create later</button>
        </div>
      </div>
    </div>
  );
}

export default function RequestsPage() {
  const bridge = useMemo(() => requestsBridge(), []);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [calFor, setCalFor] = useState<ServiceRequest | null>(null);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [showLog, setShowLog] = useState(false);

  const load = async () => {
    if (!bridge) { setLoading(false); return; }
    setLoading(true); setError('');
    const r = await bridge.list();
    if (r.ok && r.requests) setRequests(mergeStamps(r.requests));
    else setError(r.error || 'Could not load requests.');
    setLoading(false);
  };
  useEffect(() => { void load(); setOutbox(listOutbox()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setStatus = async (id: string, status: string) => {
    const req = requests.find((r) => r.id === id);
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    await bridge?.update(id, { status });
    // Scheduling an event booking → offer to put it on the parish calendar.
    if (req && req.type === 'event_booking' && (status === 'scheduled' || status === 'confirmed')
        && !(req.details && req.details.calendar_event_created)) {
      setCalFor({ ...req, status });
    }
  };
  const markPaid = async (id: string) => {
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, payment_status: 'paid' } : r)));
    await bridge?.update(id, { payment_status: 'paid' });
  };

  // Persist a workflow stamp and reflect it in the visible details right away.
  const applyStamp = (id: string, field: string, value: string) => {
    stampRequest(id, field, value);
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, details: { ...(r.details || {}), [field]: value } } : r)));
  };

  // Mass intention → the intention register (shared massIntentions helper).
  const addToRegister = (r: ServiceRequest) => {
    addIntentionFromRequest({
      intention: String(r.details?.intention ?? '').trim() || `Mass intention from ${r.requester_name || 'the parish website'}`,
      requestedBy: r.requester_name || undefined,
      contact: r.requester_email || r.requester_phone || undefined,
      preferredDate: r.requested_date ? r.requested_date.slice(0, 10) : undefined, // plain YYYY-MM-DD
      source: 'portal',
    });
    applyStamp(r.id, 'added_to_register', `yes — ${new Date().toISOString().slice(0, 10)}`);
    appendRequestsAudit('Registered', r.id, `Mass intention from ${r.requester_name || 'portal'} added to the intention register`);
    toast.success('Added to the intention register');
  };

  // Device-native notify: open the prefilled sms:/mailto: href — the staff
  // member's own phone/mail app does the sending (zero cost, works offline).
  const notify = (r: ServiceRequest, channel: 'sms' | 'email') => {
    const to = channel === 'sms' ? (r.requester_phone || '') : (r.requester_email || '');
    if (!to) return;
    const cfg = getParishConfig();
    const parish = cfg.parishShortName || cfg.parishName;
    const typeLabel = TYPE_LABEL[r.type] || r.type.replace(/_/g, ' ');
    const template = STATUS_TEMPLATES[r.status] ? r.status : 'submitted';
    const text = fillTemplate(STATUS_TEMPLATES[template], {
      parish,
      type: typeLabel.toLowerCase(),
      date: fmtForMessage(r.requested_date),
      amount: r.amount != null && r.amount > 0 ? peso(r.amount) : '',
    });
    const href = channel === 'sms'
      ? buildSmsHref(to, text)
      : buildMailtoHref(to, `${parish} — your ${typeLabel} request`, text);
    window.open(href, '_blank');
    appendOutbox({ requestId: r.id, channel, to, template, by: getCurrentUserName() });
    setOutbox(listOutbox());
    appendRequestsAudit('Notified', r.id, `${channel === 'sms' ? 'SMS' : 'Email'} "${template}" notification to ${to}`);
  };

  const visible = requests.filter((r) => showDone || !['completed', 'rejected', 'cancelled'].includes(r.status));
  const openCount = requests.filter((r) => !['completed', 'rejected', 'cancelled'].includes(r.status)).length;

  if (!bridge) {
    return (
      <div className="space-y-6">
        <h1 className="display-md text-charcoal dark:text-dm-text">Requests</h1>
        <div className="cos-card">
          <p className="body-sm text-warm-gray">Online parishioner requests arrive through Cloud Sync. Set it up in <b>Settings → Backup → Cloud Sync</b> to receive them here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-md text-charcoal dark:text-dm-text">Requests</h1>
          <p className="body-sm text-warm-gray mt-0.5">{openCount} open · from your parish website</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-warm-gray flex items-center gap-1.5">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show closed
          </label>
          <button onClick={load} className="cos-btn cos-btn-secondary text-sm">Refresh</button>
        </div>
      </div>

      <AvailabilityConfig />

      {error && <div className="cos-card text-error text-sm">{error}</div>}
      {loading ? (
        <div className="cos-card text-warm-gray text-sm">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="cos-card text-warm-gray text-sm">No requests right now. New submissions from your website will appear here.</div>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <div key={r.id} className="cos-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-charcoal dark:text-dm-text">{TYPE_LABEL[r.type] || r.type}</span>
                    <span className={cn('cos-badge', badge(r.status))}>{r.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-sm text-warm-gray mt-0.5">
                    {r.requester_name || 'Someone'}{r.requester_email ? ` · ${r.requester_email}` : ''}{r.requester_phone ? ` · ${r.requester_phone}` : ''}
                  </p>
                </div>
                <div className="text-right text-sm">
                  {r.amount != null && r.amount > 0 && <div className="font-mono text-charcoal dark:text-dm-text">{peso(r.amount)}</div>}
                  <div className={cn('text-xs', r.payment_status === 'paid' ? 'text-success' : 'text-warm-gray')}>{r.payment_status}</div>
                </div>
              </div>

              {(r.requested_date || (r.details && Object.keys(r.details).length > 0)) && (
                <div className="mt-2 text-sm text-charcoal dark:text-dm-text border-t border-parchment/40 pt-2 space-y-0.5">
                  {r.requested_date && <div><span className="text-warm-gray">Requested date:</span> {r.requested_date}</div>}
                  {r.details && Object.entries(r.details).map(([k, v]) => (
                    <div key={k}><span className="text-warm-gray">{k.replace(/_/g, ' ')}:</span> {String(v)}</div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={STATES.includes(r.status) ? r.status : 'submitted'}
                  onChange={(e) => setStatus(r.id, e.target.value)}
                  className={INPUT_CLS}
                >
                  {STATES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                {r.payment_status !== 'paid' && r.amount != null && r.amount > 0 && (
                  <button onClick={() => markPaid(r.id)} className="cos-btn cos-btn-secondary text-sm">Mark paid</button>
                )}
                {r.type === 'event_booking' && (r.status === 'scheduled' || r.status === 'confirmed')
                  && !(r.details && r.details.calendar_event_created) && (
                  <button onClick={() => setCalFor(r)} className="cos-btn cos-btn-secondary text-sm">Create calendar event</button>
                )}
                {r.type === 'mass_intention' && !(r.details && r.details.added_to_register) && (
                  <button onClick={() => addToRegister(r)} className="cos-btn cos-btn-secondary text-sm">Add to intention register</button>
                )}
                {r.requester_phone && (
                  <button onClick={() => notify(r, 'sms')} className="cos-btn cos-btn-secondary text-sm" title={`Opens your messaging app — text ${r.requester_phone}`}>Notify by SMS</button>
                )}
                {r.requester_email && (
                  <button onClick={() => notify(r, 'email')} className="cos-btn cos-btn-secondary text-sm" title={`Opens your mail app — email ${r.requester_email}`}>Notify by email</button>
                )}
                {!r.requester_phone && !r.requester_email && (
                  <button disabled title="No phone or email on this request" className="cos-btn cos-btn-secondary text-sm opacity-50 cursor-not-allowed">Notify</button>
                )}
                {r.status !== 'rejected' && r.status !== 'completed' && (
                  <button onClick={() => setStatus(r.id, 'rejected')} className="cos-btn cos-btn-secondary text-sm text-error">Reject</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Notification log — every sms:/mailto: opened from here, newest first. */}
      <div className="cos-card">
        <button onClick={() => { if (!showLog) setOutbox(listOutbox()); setShowLog((v) => !v); }} className="w-full flex items-center justify-between">
          <span className="font-semibold text-sm text-charcoal dark:text-dm-text">Notification log</span>
          <span className="text-xs text-warm-gray">{outbox.length} sent · {showLog ? 'hide' : 'show'}</span>
        </button>
        {showLog && (
          outbox.length === 0 ? (
            <p className="mt-3 text-sm text-warm-gray">Nothing sent yet. Use a request's Notify button and it will be logged here.</p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {outbox.slice(0, 50).map((e) => (
                <div key={e.id} className="text-sm text-charcoal dark:text-dm-text flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs text-warm-gray whitespace-nowrap">{new Date(e.at).toLocaleString()}</span>
                  <span className="text-xs uppercase font-semibold text-warm-gray">{e.channel}</span>
                  <span>{e.to}</span>
                  <span className="text-xs text-warm-gray">"{e.template.replace('_', ' ')}" · by {e.by}</span>
                </div>
              ))}
              {outbox.length > 50 && <p className="text-xs text-warm-gray">…and {outbox.length - 50} older</p>}
            </div>
          )
        )}
      </div>

      {calFor && (
        <CreateCalendarEventModal
          request={calFor}
          onClose={() => setCalFor(null)}
          onCreated={(eventDate) => {
            applyStamp(calFor.id, 'calendar_event_created', `yes — ${eventDate}`);
            appendRequestsAudit('Scheduled', calFor.id,
              `Calendar event created for ${TYPE_LABEL[calFor.type] || calFor.type}${calFor.requester_name ? ` (${calFor.requester_name})` : ''} on ${eventDate}`);
            toast.success('Added to the parish calendar');
            setCalFor(null);
          }}
        />
      )}
    </div>
  );
}
