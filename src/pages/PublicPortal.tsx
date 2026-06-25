// Parishioner self-service portal — the PUBLIC, mobile-first website.
// A parishioner opens /portal/<parish-slug> on their phone, picks a service,
// fills a short form, and submits (payment optional / later). No login.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getParishBySlug, submitRequest, reserveSlot, getSlots, checkStatus, type ParishPublic, type RequestStatus, type Slot } from '@/lib/portal';

// Event types that book a real calendar slot (vs. a free-form inquiry).
const SLOT_TYPE: Record<string, string> = { Baptism: 'baptism', Wedding: 'wedding', Funeral: 'funeral' };

const C = { bg: '#FAF8F3', card: '#FFFFFF', ink: '#3D3A36', sub: '#8C8374', gold: '#C9963B', line: '#EAE5D9', green: '#2D6A4F' };
const peso = (n: number) => '₱' + Math.round(n).toLocaleString();

const SERVICES = [
  { id: 'mass_intention', icon: '🕯️', label: 'Request a Mass Intention', desc: 'Have a Mass offered for a loved one or an intention.' },
  { id: 'certificate', icon: '📜', label: 'Request a Certificate', desc: 'Get a copy of a baptism or marriage certificate.' },
  { id: 'donation', icon: '💝', label: 'Give a Donation', desc: 'Support your parish online.' },
  { id: 'event_booking', icon: '⛪', label: 'Book an Event', desc: 'Inquire about a baptism, wedding, or other service.' },
];

const input: React.CSSProperties = { width: '100%', minHeight: 44, padding: '10px 12px', fontSize: 16, borderRadius: 10, border: `1px solid ${C.line}`, background: '#FFF', color: C.ink, outline: 'none', boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: C.sub, margin: '14px 0 6px' };

export default function PublicPortal() {
  const { slug } = useParams<{ slug: string }>();
  const [parish, setParish] = useState<ParishPublic | null | undefined>(undefined);
  const [service, setService] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [statusToken, setStatusToken] = useState('');
  const [statusRes, setStatusRes] = useState<RequestStatus | null | undefined>(undefined);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  useEffect(() => { if (slug) getParishBySlug(slug).then(setParish); }, [slug]);

  // For an event booking, load the parish's open slots for the chosen sacrament.
  const slotType = service === 'event_booking' ? SLOT_TYPE[form.event_type || ''] : undefined;
  useEffect(() => {
    setSelectedSlot(null); setSlots([]);
    if (!parish || !slotType) return;
    setLoadingSlots(true);
    getSlots(parish.id, slotType).then((s) => setSlots(s)).finally(() => setLoadingSlots(false));
  }, [parish, slotType]);

  const fees = parish?.public_config?.fees || {};
  const services = useMemo(() => {
    const allowed = parish?.public_config?.services;
    return SERVICES.filter((s) => !allowed || allowed.includes(s.id));
  }, [parish]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (parish === undefined) return <Shell><p style={{ color: C.sub }}>Loading…</p></Shell>;
  if (parish === null) return <Shell><h2 style={{ color: C.ink }}>Parish not found</h2><p style={{ color: C.sub }}>Please check the link from your parish.</p></Shell>;

  // ── confirmation ──
  if (done) {
    return (
      <Shell parish={parish}>
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: 44 }}>✅</div>
          <h2 style={{ color: C.ink, margin: '8px 0' }}>Request received</h2>
          <p style={{ color: C.sub }}>{parish.name} will review it and get back to you.</p>
          <p style={{ color: C.sub, marginTop: 16, fontSize: 13 }}>Your reference (save it to check status):</p>
          <code style={{ display: 'block', wordBreak: 'break-all', background: C.bg, padding: 12, borderRadius: 10, color: C.ink, fontSize: 13, marginTop: 6 }}>{done}</code>
          <button style={btn(false)} onClick={() => { setDone(null); setService(null); setForm({}); }}>Submit another request</button>
        </div>
      </Shell>
    );
  }

  // ── a service form ──
  if (service) {
    const fee = fees[service];
    const needSlot = service === 'event_booking' && !!slotType && slots.length > 0;
    const submit = async () => {
      setError(''); setSubmitting(true);
      const details: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) if (!['name', 'email', 'phone', 'date'].includes(k)) details[k] = v;
      if (service === 'donation') details.amount = Number(form.amount || 0);
      const res = selectedSlot
        ? await reserveSlot(selectedSlot, { name: form.name, email: form.email, phone: form.phone, details })
        : await submitRequest(parish.id, service, {
            requester_name: form.name, requester_email: form.email, requester_phone: form.phone,
            requested_date: form.date || null, details,
          });
      setSubmitting(false);
      if (res.ok && res.token) setDone(res.token);
      else setError(res.error || 'Could not submit. Please try again.');
    };
    const def = SERVICES.find((s) => s.id === service)!;
    return (
      <Shell parish={parish}>
        <button style={{ ...linkBtn, marginBottom: 8 }} onClick={() => { setService(null); setError(''); }}>← Back</button>
        <h2 style={{ color: C.ink, margin: '4px 0' }}>{def.icon} {def.label}</h2>
        {typeof fee === 'number' && fee > 0 && service !== 'donation' && <p style={{ color: C.gold, fontWeight: 600 }}>Fee: {peso(fee)}</p>}

        <ServiceFields service={service} form={form} set={set} />

        {service === 'event_booking' && slotType && (
          <>
            <label style={label}>Choose an Available Date</label>
            {loadingSlots ? (
              <p style={{ color: C.sub, fontSize: 13 }}>Loading open dates…</p>
            ) : slots.length === 0 ? (
              <p style={{ color: C.sub, fontSize: 13 }}>No open dates posted right now — submit below and the parish will reach out.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {slots.map((s) => {
                  const dt = new Date(s.slot_at); const sel = selectedSlot === s.id;
                  return (
                    <button key={s.id} type="button" onClick={() => setSelectedSlot(sel ? null : s.id)}
                      style={{ textAlign: 'left', padding: '11px 12px', borderRadius: 10, border: sel ? `2px solid ${C.gold}` : `1px solid ${C.line}`, background: sel ? 'rgba(201,150,59,0.06)' : '#FFF', color: C.ink, fontSize: 14, cursor: 'pointer' }}>
                      {dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {service === 'event_booking' && !slotType && form.event_type && (
          <>
            <label style={label}>Preferred Date</label>
            <input style={input} type="date" value={form.date || ''} onChange={(e) => set('date', e.target.value)} />
          </>
        )}

        <label style={label}>Your Name</label>
        <input style={input} value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Full name" />
        <label style={label}>Email or Phone</label>
        <input style={input} value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="So the parish can reach you" />
        <input style={{ ...input, marginTop: 8 }} value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="Mobile number (optional)" inputMode="tel" />

        {error && <p style={{ color: '#B8322F', marginTop: 12 }}>{error}</p>}
        <button style={btn(submitting)} disabled={submitting || !form.name || (needSlot && !selectedSlot)} onClick={submit}>
          {submitting ? 'Submitting…' : selectedSlot ? 'Reserve This Date' : 'Submit Request'}
        </button>
        <p style={{ color: C.sub, fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          {selectedSlot ? 'Your date is held while the parish confirms eligibility.' : 'You can pay at the parish office, or online when they confirm.'}
        </p>
      </Shell>
    );
  }

  // ── service menu + status checker ──
  return (
    <Shell parish={parish}>
      <p style={{ color: C.sub, marginTop: 0 }}>What would you like to do?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {services.map((s) => (
          <button key={s.id} onClick={() => { setService(s.id); setForm({}); }} style={tile}>
            <span style={{ fontSize: 26 }}>{s.icon}</span>
            <span style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', fontWeight: 700, color: C.ink }}>{s.label}{typeof fees[s.id] === 'number' && fees[s.id] > 0 && s.id !== 'donation' ? ` · ${peso(fees[s.id])}` : ''}</span>
              <span style={{ display: 'block', fontSize: 13, color: C.sub }}>{s.desc}</span>
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>Already submitted? Check your status</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...input, marginTop: 0 }} value={statusToken} onChange={(e) => setStatusToken(e.target.value)} placeholder="Paste your reference" />
          <button style={{ ...btn(false), width: 'auto', marginTop: 0, padding: '0 16px' }} onClick={async () => setStatusRes(await checkStatus(statusToken.trim()))}>Check</button>
        </div>
        {statusRes === null && <p style={{ color: C.sub, fontSize: 13 }}>No request found for that reference.</p>}
        {statusRes && (
          <div style={{ marginTop: 10, background: C.bg, borderRadius: 10, padding: 12, fontSize: 14, color: C.ink }}>
            <div><b>Status:</b> {statusRes.status}</div>
            {statusRes.amount != null && <div><b>Amount:</b> {peso(statusRes.amount)} · {statusRes.payment_status}</div>}
          </div>
        )}
      </div>
    </Shell>
  );
}

function ServiceFields({ service, form, set }: { service: string; form: Record<string, string>; set: (k: string, v: string) => void }) {
  if (service === 'mass_intention') return (<>
    <label style={label}>Mass Intention</label>
    <textarea style={{ ...input, minHeight: 80 }} value={form.intention || ''} onChange={(e) => set('intention', e.target.value)} placeholder="e.g. For the soul of Maria Santos" />
    <label style={label}>Preferred Date</label>
    <input style={input} type="date" value={form.date || ''} onChange={(e) => set('date', e.target.value)} />
  </>);
  if (service === 'certificate') return (<>
    <label style={label}>Certificate Type</label>
    <select style={input} value={form.cert_type || ''} onChange={(e) => set('cert_type', e.target.value)}>
      <option value="">Choose…</option><option>Baptism</option><option>Marriage</option><option>Confirmation</option>
    </select>
    <label style={label}>Name on the Record</label>
    <input style={input} value={form.record_name || ''} onChange={(e) => set('record_name', e.target.value)} placeholder="Whose certificate?" />
    <label style={label}>Purpose</label>
    <input style={input} value={form.purpose || ''} onChange={(e) => set('purpose', e.target.value)} placeholder="e.g. school requirement" />
  </>);
  if (service === 'donation') return (<>
    <label style={label}>Amount (₱)</label>
    <input style={input} type="number" inputMode="decimal" value={form.amount || ''} onChange={(e) => set('amount', e.target.value)} placeholder="e.g. 500" />
    <label style={label}>Dedication (optional)</label>
    <input style={input} value={form.dedication || ''} onChange={(e) => set('dedication', e.target.value)} placeholder="In memory of…" />
  </>);
  return (<>
    <label style={label}>Event Type</label>
    <select style={input} value={form.event_type || ''} onChange={(e) => set('event_type', e.target.value)}>
      <option value="">Choose…</option><option>Baptism</option><option>Wedding</option><option>Funeral</option><option>Blessing</option><option>Other</option>
    </select>
    <label style={label}>Notes</label>
    <textarea style={{ ...input, minHeight: 70 }} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Anything the parish should know" />
  </>);
}

function Shell({ parish, children }: { parish?: ParishPublic; children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '24px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 30 }}>⛪</div>
          <h1 style={{ color: C.ink, fontSize: 22, margin: '6px 0 0' }}>{parish?.name || 'ChurchOS'}</h1>
          {parish && <p style={{ color: C.sub, fontSize: 13, margin: '2px 0 0' }}>Parish services — online</p>}
        </div>
        <div style={{ background: C.card, borderRadius: 16, padding: 20, border: `1px solid ${C.line}` }}>{children}</div>
        <p style={{ textAlign: 'center', color: C.sub, fontSize: 11, marginTop: 16 }}>Powered by ChurchOS</p>
      </div>
    </div>
  );
}

const tile: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', padding: 14, borderRadius: 12, border: `1px solid ${C.line}`, background: '#FFF', cursor: 'pointer' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: C.gold, fontSize: 14, cursor: 'pointer', padding: 0 };
function btn(busy: boolean): React.CSSProperties {
  return { width: '100%', minHeight: 48, marginTop: 18, borderRadius: 12, border: 'none', background: busy ? '#DDB86B' : C.gold, color: '#FFF', fontSize: 16, fontWeight: 600, cursor: busy ? 'wait' : 'pointer' };
}
