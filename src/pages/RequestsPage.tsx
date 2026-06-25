// Requests — the parishioner-portal "inbox" (ticketing). Each row is a request a
// parishioner submitted on the public website; the secretary moves it through its
// lifecycle. All parishioner text is rendered as TEXT (React escapes) — never
// dangerouslySetInnerHTML — so a crafted submission can't run script here.
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

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

function AvailabilityConfig() {
  const bridge = useMemo(() => slotsBridge(), []);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { bridge?.getRules().then((r) => setRules(r || [])).catch(() => {}); }, [bridge]);
  if (!bridge) return null;

  const update = (i: number, patch: Partial<AvailabilityRule>) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const inp = 'h-9 px-2 rounded-md border border-parchment bg-white text-sm text-charcoal dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text';

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

export default function RequestsPage() {
  const bridge = useMemo(() => requestsBridge(), []);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDone, setShowDone] = useState(false);

  const load = async () => {
    if (!bridge) { setLoading(false); return; }
    setLoading(true); setError('');
    const r = await bridge.list();
    if (r.ok && r.requests) setRequests(r.requests);
    else setError(r.error || 'Could not load requests.');
    setLoading(false);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setStatus = async (id: string, status: string) => {
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    await bridge?.update(id, { status });
  };
  const markPaid = async (id: string) => {
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, payment_status: 'paid' } : r)));
    await bridge?.update(id, { payment_status: 'paid' });
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
                  className="h-9 px-2 rounded-md border border-parchment bg-white text-sm text-charcoal dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                >
                  {STATES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                {r.payment_status !== 'paid' && r.amount != null && r.amount > 0 && (
                  <button onClick={() => markPaid(r.id)} className="cos-btn cos-btn-secondary text-sm">Mark paid</button>
                )}
                {r.status !== 'rejected' && r.status !== 'completed' && (
                  <button onClick={() => setStatus(r.id, 'rejected')} className="cos-btn cos-btn-secondary text-sm text-error">Reject</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
