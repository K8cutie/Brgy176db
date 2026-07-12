// Parishioner self-service portal — the PUBLIC, mobile-first website.
// A parishioner opens /portal/<parish-slug> on their phone, reads exactly what
// each sacrament needs, picks a service, fills a short form, and submits — or
// prints the checklist and processes everything at the office. No login.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getParishBySlug, submitRequest, reserveSlot, getSlots, checkStatus, type ParishPublic, type RequestStatus, type Slot } from '@/lib/portal';
import { getSacramentInfo, buildAckSummary, EVENT_TYPE_TO_SACRAMENT, type SacramentInfo, type RequirementKind } from '@/lib/sacramentRequirements';

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

// Sacraments shown in the home-page "Sacrament Requirements" accordion.
const HOME_SACRAMENTS = ['baptism', 'wedding', 'confirmation', 'first_communion', 'funeral', 'certificate'];

// Small colored chips that tag each requirement by kind.
const KIND_META: Record<RequirementKind, { label: string; bg: string; fg: string }> = {
  document: { label: 'Document', bg: '#EEF3F8', fg: '#3D6285' },
  preparation: { label: 'Preparation', bg: '#EFF6F1', fg: '#2D6A4F' },
  eligibility: { label: 'Who can', bg: '#FAF3E4', fg: '#96690F' },
  sponsor: { label: 'Sponsors', bg: '#F6EFF6', fg: '#7A4E7E' },
};
const KIND_ORDER: RequirementKind[] = ['document', 'preparation', 'sponsor', 'eligibility'];

// One-line guidance shown under the status checker result.
const STATUS_HINT: Record<string, string> = {
  submitted: 'The parish is reviewing your request.',
  in_review: 'The parish is reviewing your request — they may contact you for details.',
  scheduled: 'Your date is on the calendar — the parish will confirm the final details.',
  confirmed: "You're booked — see you there!",
  completed: 'This request is done. Thank you!',
  rejected: 'Please contact the parish office — they can explain and help you re-apply.',
  cancelled: 'This request was cancelled. You may submit a new one anytime.',
};

// Printing from the booking checklist: hide everything except .printable-root
// (parish name + checklist), reveal .print-only headers. Mounted ONLY on the
// requirements step so normal pages still print normally.
const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  .printable-root, .printable-root * { visibility: visible !important; }
  .printable-root { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; }
  .print-only { display: block !important; }
  .no-print { display: none !important; }
}`;

// ── DEV-ONLY DEMO MODE ──────────────────────────────────────────────────────
// Open /portal/demo while running `vite dev` to explore the whole portal with
// NO backend: the parish is hardcoded, slots are generated locally, and
// submit / reserve / status-check resolve to a fake token after 400ms.
// Every use below is guarded by DEMO_BUILD — true in dev, and in a
// VITE_CHURCHOS_DEMO web build (the public showcase). Both are compile-time
// constants, so a normal production build folds it to false and tree-shakes
// all of this out.
const DEMO_BUILD = import.meta.env.DEV || import.meta.env.VITE_CHURCHOS_DEMO === 'true';
const DEMO_TOKEN = 'DEMO-REF-12345';
const DEMO_PARISH: ParishPublic = {
  id: 'demo-parish-id',
  name: 'Demo Parish of St. Agnes',
  slug: 'demo',
  public_config: {
    services: ['mass_intention', 'certificate', 'donation', 'event_booking'],
    fees: { certificate: 100, event_booking: 500 },
    contact: {
      phone: '+63 2 8123 4567',
      email: 'office@stagnes-demo.ph',
      address: '123 Rosal St., Barangay San Roque, Quezon City',
      hours: 'Mon–Sat 8:00 AM–5:00 PM (closed 12–1 PM)',
    } as ParishPublic['public_config']['contact'],
    intake_enabled: true,
  },
};
function demoSlots(type: string): Slot[] {
  const base = Date.now() + 7 * 86400000; // a week out
  return [0, 3, 10].map((days, i) => ({
    id: `demo-slot-${type}-${i}`,
    type,
    slot_at: new Date(base + days * 86400000).toISOString(),
    duration_min: 60,
  }));
}
// ────────────────────────────────────────────────────────────────────────────

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
  // Self-service additions:
  const [bookStep, setBookStep] = useState<1 | 2 | 3>(1); // event-booking wizard step
  const [checkedReqs, setCheckedReqs] = useState<Record<string, boolean>>({}); // requirement id → "I have this"
  const [showOffice, setShowOffice] = useState(false); // office/print panel in booking step 1
  const [showOfficeCert, setShowOfficeCert] = useState(false); // office panel in certificate form
  const [openSac, setOpenSac] = useState<string | null>(null); // home requirements accordion

  const isDemo = DEMO_BUILD && slug === 'demo';

  useEffect(() => {
    if (DEMO_BUILD && slug === 'demo') { setParish(DEMO_PARISH); return; } // demo: no network
    if (slug) getParishBySlug(slug).then(setParish);
  }, [slug]);

  // For an event booking, load the parish's open slots for the chosen sacrament.
  const slotType = service === 'event_booking' ? SLOT_TYPE[form.event_type || ''] : undefined;
  useEffect(() => {
    setSelectedSlot(null); setSlots([]);
    if (!parish || !slotType) return;
    if (DEMO_BUILD && isDemo) { setSlots(demoSlots(slotType)); return; } // demo: no network
    setLoadingSlots(true);
    getSlots(parish.id, slotType).then((s) => setSlots(s)).finally(() => setLoadingSlots(false));
  }, [parish, slotType, isDemo]);

  const fees = parish?.public_config?.fees || {};
  const services = useMemo(() => {
    const allowed = parish?.public_config?.services;
    return SERVICES.filter((s) => !allowed || allowed.includes(s.id));
  }, [parish]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const openService = (id: string) => {
    setService(id); setForm({}); setError('');
    setBookStep(1); setCheckedReqs({}); setShowOffice(false); setShowOfficeCert(false);
  };

  if (parish === undefined) return <Shell><p style={{ color: C.sub }}>Loading…</p></Shell>;
  if (parish === null) return <Shell><h2 style={{ color: C.ink }}>Parish not found</h2><p style={{ color: C.sub }}>Please check the link from your parish.</p></Shell>;

  // public_config is operator-edited JSON — coerce values to strings so a
  // malformed entry (e.g. address saved as an object) degrades to "field not
  // shown" instead of crashing the whole portal via the ErrorBoundary.
  const asStr = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);
  const rawContact = parish.public_config?.contact as Record<string, unknown> | undefined;
  const contact = rawContact ? { phone: asStr(rawContact.phone), email: asStr(rawContact.email), address: asStr(rawContact.address) } : undefined;
  // Optional NEW config key — parishes may add contact.hours; render fine without it.
  const officeHours = asStr(rawContact?.hours);

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
    // Sacrament catalog entry for the chosen event type (undefined for "Other").
    const sacKey = service === 'event_booking' ? EVENT_TYPE_TO_SACRAMENT[form.event_type || ''] : undefined;
    const bookInfo = sacKey ? getSacramentInfo(sacKey, parish.public_config) : undefined;
    const checkedIds = bookInfo ? bookInfo.requirements.filter((r) => checkedReqs[r.id]).map((r) => r.id) : [];

    const submit = async () => {
      setError(''); setSubmitting(true);
      const details: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) if (!['name', 'email', 'phone', 'date'].includes(k)) details[k] = v;
      if (service === 'donation') details.amount = Number(form.amount || 0);
      // Flat strings only — the staff RequestsPage renders details generically.
      if (service === 'event_booking' && bookInfo) {
        const ack = buildAckSummary(bookInfo, checkedIds);
        details.requirements_ready = ack.ready;
        details.requirements_missing = ack.missing;
        details.requirements_ack = `${checkedIds.length}/${bookInfo.requirements.length}`;
      }
      if (DEMO_BUILD && isDemo) { // demo: resolve locally, no network
        await new Promise((r) => setTimeout(r, 400));
        setSubmitting(false); setDone(DEMO_TOKEN); return;
      }
      const res = selectedSlot
        ? await reserveSlot(selectedSlot, { name: form.name, email: form.email, phone: form.phone, details })
        : await submitRequest(parish.id, service, {
            requester_name: form.name, requester_email: form.email, requester_phone: form.phone,
            requested_date: form.date || null, details,
          });
      setSubmitting(false);
      if (res.ok && res.token) setDone(res.token);
      else setError(/too large/i.test(res.error || '') ? 'Your message is a bit too long — please shorten it and try again, or contact the parish office.' : res.error || 'Could not submit. Please try again.');
    };
    const def = SERVICES.find((s) => s.id === service)!;

    // ── event booking: 3-step wizard (Requirements → Date → Your details) ──
    if (service === 'event_booking') {
      const chosen = slots.find((s) => s.id === selectedSlot);
      return (
        <Shell parish={parish}>
          <button style={{ ...linkBtn, marginBottom: 8 }} className="no-print" onClick={() => {
            if (bookStep > 1) setBookStep((s) => (s === 3 ? 2 : 1));
            else { setService(null); setError(''); }
          }}>← Back</button>
          <h2 style={{ color: C.ink, margin: '4px 0' }} className="no-print">{def.icon} {def.label}</h2>
          {typeof fee === 'number' && fee > 0 && <p style={{ color: C.gold, fontWeight: 600 }} className="no-print">Fee: {peso(fee)}</p>}
          <Steps current={bookStep} />

          {bookStep === 1 && (
            <>
              <style>{PRINT_CSS}</style>
              <label style={label}>Event Type</label>
              <select style={input} value={form.event_type || ''} onChange={(e) => { set('event_type', e.target.value); setCheckedReqs({}); }}>
                <option value="">Choose…</option><option>Baptism</option><option>Wedding</option><option>Funeral</option><option>Blessing</option><option>Other</option>
              </select>

              {bookInfo && (
                <div className="printable-root">
                  {/* Print-only header so the printed page says which parish + checklist */}
                  <p className="print-only" style={{ display: 'none', fontWeight: 700, fontSize: 16 }}>{parish.name} — {bookInfo.title} requirements</p>
                  <p style={{ fontSize: 13, color: C.sub, margin: '14px 0 8px' }}>
                    Tick what you already have — <b style={{ color: C.ink }}>you can continue either way</b>. This just helps the parish prepare for you.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bookInfo.requirements.map((r) => (
                      <label key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, border: checkedReqs[r.id] ? `2px solid ${C.gold}` : `1px solid ${C.line}`, background: checkedReqs[r.id] ? 'rgba(201,150,59,0.06)' : '#FFF', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!checkedReqs[r.id]} onChange={() => setCheckedReqs((m) => ({ ...m, [r.id]: !m[r.id] }))} style={{ marginTop: 3, width: 18, height: 18, accentColor: C.gold, flexShrink: 0 }} />
                        <span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: C.ink }}>{r.label}</span>
                            <KindBadge kind={r.kind} />
                          </span>
                          {r.detail && <span style={{ display: 'block', fontSize: 12, color: C.sub, marginTop: 2 }}>{r.detail}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                  {bookInfo.leadTime && <p style={{ fontSize: 12, color: C.sub, marginTop: 10 }}><b style={{ color: C.ink }}>⏰ Book ahead:</b> {bookInfo.leadTime}</p>}
                  {bookInfo.sponsorRules && bookInfo.sponsorRules !== 'Not applicable.' && (
                    <p style={{ fontSize: 12, color: C.sub, marginTop: 6 }}><b style={{ color: C.ink }}>Sponsors:</b> {bookInfo.sponsorRules}</p>
                  )}
                </div>
              )}
              {!bookInfo && form.event_type && (
                <p style={{ fontSize: 13, color: C.sub, marginTop: 14 }}>No specific checklist for this — just continue and tell the parish what you need. They'll guide you.</p>
              )}

              <button style={btn(false)} className="no-print" disabled={!form.event_type} onClick={() => setBookStep(2)}>Continue</button>
              <button style={{ ...linkBtn, display: 'block', margin: '14px auto 0', fontSize: 13 }} className="no-print" onClick={() => setShowOffice((v) => !v)}>
                🖨️ Print this checklist / process at the office instead
              </button>
              {showOffice && (
                <div className="no-print">
                  <OfficeCard contact={contact} hours={officeHours} />
                  {bookInfo && (
                    <button style={{ ...btn(false), marginTop: 10, background: '#FFF', color: C.gold, border: `1px solid ${C.gold}` }} onClick={() => window.print()}>🖨️ Print checklist</button>
                  )}
                </div>
              )}
            </>
          )}

          {bookStep === 2 && (
            <>
              {slotType ? (
                <>
                  <label style={label}>Choose an Available Date</label>
                  {loadingSlots ? (
                    <p style={{ color: C.sub, fontSize: 13 }}>Loading open dates…</p>
                  ) : slots.length === 0 ? (
                    <p style={{ color: C.sub, fontSize: 13 }}>No open dates posted right now — continue below and the parish will reach out.</p>
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
              ) : (
                <>
                  <label style={label}>Preferred Date</label>
                  <input style={input} type="date" value={form.date || ''} onChange={(e) => set('date', e.target.value)} />
                </>
              )}
              <button style={btn(false)} disabled={needSlot && !selectedSlot} onClick={() => setBookStep(3)}>Continue</button>
              {needSlot && !selectedSlot && <p style={{ color: C.sub, fontSize: 12, marginTop: 8, textAlign: 'center' }}>Pick a date above to continue.</p>}
            </>
          )}

          {bookStep === 3 && (
            <>
              {/* Recap of what they chose so far */}
              <div style={{ background: 'rgba(201,150,59,0.08)', border: `1px solid ${C.gold}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, color: C.ink, marginTop: 8 }}>
                <b>{form.event_type}</b>
                {chosen ? ` · ${new Date(chosen.slot_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}` : form.date ? ` · ${form.date}` : ''}
                {bookInfo ? ` · ${checkedIds.length}/${bookInfo.requirements.length} requirements ready` : ''}
              </div>
              <label style={label}>Notes</label>
              <textarea style={{ ...input, minHeight: 70 }} maxLength={1500} value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="Anything the parish should know" />
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
            </>
          )}
        </Shell>
      );
    }

    // ── mass intention / certificate / donation: single screen ──
    return (
      <Shell parish={parish}>
        <button style={{ ...linkBtn, marginBottom: 8 }} onClick={() => { setService(null); setError(''); }}>← Back</button>
        <h2 style={{ color: C.ink, margin: '4px 0' }}>{def.icon} {def.label}</h2>
        {typeof fee === 'number' && fee > 0 && service !== 'donation' && <p style={{ color: C.gold, fontWeight: 600 }}>Fee: {peso(fee)}</p>}

        <ServiceFields service={service} form={form} set={set} />

        {service === 'certificate' && (
          <>
            <p style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>
              If this is "for marriage purposes", the certificate is usually only valid for a few months — request it close to when you need it.
            </p>
            <p style={{ fontSize: 12, color: C.sub, marginTop: 8 }}>
              📦 Pickup: usually ready in 1–5 working days. Claim at the office, or send a representative with a signed authorization letter and both IDs.
            </p>
            <button style={{ ...linkBtn, fontSize: 13, marginTop: 6 }} onClick={() => setShowOfficeCert((v) => !v)}>
              {showOfficeCert ? 'Hide office details' : '🏛️ Prefer to request at the office? See details'}
            </button>
            {showOfficeCert && <OfficeCard contact={contact} hours={officeHours} />}
          </>
        )}
        {service === 'mass_intention' && (
          <p style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>
            🕯️ Intentions are usually arranged a few days ahead and offered at the parish's scheduled Masses. The offering is a voluntary donation.
          </p>
        )}

        <label style={label}>Your Name</label>
        <input style={input} value={form.name || ''} onChange={(e) => set('name', e.target.value)} placeholder="Full name" />
        <label style={label}>Email or Phone</label>
        <input style={input} value={form.email || ''} onChange={(e) => set('email', e.target.value)} placeholder="So the parish can reach you" />
        <input style={{ ...input, marginTop: 8 }} value={form.phone || ''} onChange={(e) => set('phone', e.target.value)} placeholder="Mobile number (optional)" inputMode="tel" />

        {error && <p style={{ color: '#B8322F', marginTop: 12 }}>{error}</p>}
        <button style={btn(submitting)} disabled={submitting || !form.name} onClick={submit}>
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
        <p style={{ color: C.sub, fontSize: 12, marginTop: 10, textAlign: 'center' }}>
          You can pay at the parish office, or online when they confirm.
        </p>
      </Shell>
    );
  }

  // ── HOME: contact strip, service menu, requirements, office card, status ──
  return (
    <Shell parish={parish}>
      {contact && (contact.phone || contact.email || contact.address) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12, color: C.sub, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.line}` }}>
          {contact.phone && <a href={`tel:${contact.phone}`} style={{ color: C.sub, textDecoration: 'none' }}>📞 {contact.phone}</a>}
          {contact.email && <a href={`mailto:${contact.email}`} style={{ color: C.sub, textDecoration: 'none' }}>✉️ {contact.email}</a>}
          {contact.address && <span>📍 {contact.address}</span>}
        </div>
      )}

      <p style={{ color: C.sub, marginTop: 0 }}>What would you like to do?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {services.map((s) => (
          <button key={s.id} onClick={() => openService(s.id)} style={tile}>
            <span style={{ fontSize: 26 }}>{s.icon}</span>
            <span style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', fontWeight: 700, color: C.ink }}>{s.label}{typeof fees[s.id] === 'number' && fees[s.id] > 0 && s.id !== 'donation' ? ` · ${peso(fees[s.id])}` : ''}</span>
              <span style={{ display: 'block', fontSize: 13, color: C.sub }}>{s.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Sacrament requirements — read before you book, or just come prepared */}
      <div style={{ marginTop: 24 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.sub, margin: '0 0 8px' }}>📋 Sacrament Requirements</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {HOME_SACRAMENTS.map((k) => {
            const info = getSacramentInfo(k, parish.public_config);
            if (!info) return null;
            return <SacramentAccordion key={k} info={info} open={openSac === k} onToggle={() => setOpenSac(openSac === k ? null : k)} />;
          })}
        </div>
      </div>

      <OfficeCard contact={contact} hours={officeHours} />

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>Already submitted? Check your status</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...input, marginTop: 0 }} value={statusToken} onChange={(e) => setStatusToken(e.target.value)} placeholder="Paste your reference" />
          <button style={{ ...btn(false), width: 'auto', marginTop: 0, padding: '0 16px' }} onClick={async () => {
            if (DEMO_BUILD && isDemo) { // demo: no network
              await new Promise((r) => setTimeout(r, 400));
              setStatusRes(statusToken.trim() === DEMO_TOKEN ? { type: 'event_booking', status: 'in_review', requested_date: null, amount: 500, payment_status: 'unpaid' } : null);
              return;
            }
            setStatusRes(await checkStatus(statusToken.trim()));
          }}>Check</button>
        </div>
        {statusRes === null && <p style={{ color: C.sub, fontSize: 13 }}>No request found for that reference.</p>}
        {statusRes && (
          <div style={{ marginTop: 10, background: C.bg, borderRadius: 10, padding: 12, fontSize: 14, color: C.ink }}>
            <div><b>Status:</b> {statusRes.status}</div>
            {statusRes.amount != null && <div><b>Amount:</b> {peso(statusRes.amount)} · {statusRes.payment_status}</div>}
            <div style={{ color: C.sub, fontSize: 13, marginTop: 4 }}>{STATUS_HINT[statusRes.status] || 'The parish will update this as it moves along.'}</div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function ServiceFields({ service, form, set }: { service: string; form: Record<string, string>; set: (k: string, v: string) => void }) {
  if (service === 'mass_intention') return (<>
    <label style={label}>Mass Intention</label>
    <textarea style={{ ...input, minHeight: 80 }} maxLength={1500} value={form.intention || ''} onChange={(e) => set('intention', e.target.value)} placeholder="e.g. For the soul of Maria Santos" />
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
    <input style={input} maxLength={300} value={form.dedication || ''} onChange={(e) => set('dedication', e.target.value)} placeholder="In memory of…" />
  </>);
  return null; // event_booking renders its own wizard
}

// Small colored chip labeling a requirement's kind.
function KindBadge({ kind }: { kind: RequirementKind }) {
  const meta = KIND_META[kind];
  return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', background: meta.bg, color: meta.fg, borderRadius: 6, padding: '2px 6px' }}>{meta.label}</span>;
}

// Home-page accordion entry: everything a parishioner needs for one sacrament.
function SacramentAccordion({ info, open, onToggle }: { info: SacramentInfo; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, padding: '12px 14px', background: open ? C.bg : '#FFF', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 20 }}>{info.icon}</span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: C.ink }}>{info.title}</span>
        <span style={{ color: C.sub, fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '2px 14px 14px', background: '#FFF' }}>
          {KIND_ORDER.map((kind) => {
            const items = info.requirements.filter((r) => r.kind === kind);
            if (items.length === 0) return null;
            return (
              <div key={kind} style={{ marginTop: 10 }}>
                <KindBadge kind={kind} />
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {items.map((r) => (
                    <li key={r.id} style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>
                      <b>{r.label}</b>
                      {r.detail && <span style={{ color: C.sub }}> — {r.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {info.sponsorRules && info.sponsorRules !== 'Not applicable.' && (
            <p style={{ fontSize: 12, color: C.sub, marginTop: 10 }}><b style={{ color: C.ink }}>Sponsors:</b> {info.sponsorRules}</p>
          )}
          {info.leadTime && <p style={{ fontSize: 12, color: C.sub, marginTop: 6 }}><b style={{ color: C.ink }}>⏰ Book ahead:</b> {info.leadTime}</p>}
          {info.phNotes && <p style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>💡 {info.phNotes}</p>}
          {info.canonicalRefs && <p style={{ fontSize: 11, color: C.sub, marginTop: 6, fontStyle: 'italic' }}>{info.canonicalRefs}</p>}
        </div>
      )}
    </div>
  );
}

// The "process it in person" card — office contact, hours, and directions.
function OfficeCard({ contact, hours }: { contact?: { phone?: string; email?: string; address?: string }; hours?: string }) {
  return (
    <div style={{ marginTop: 16, background: C.bg, borderRadius: 12, padding: 14 }}>
      <p style={{ margin: 0, fontWeight: 700, color: C.ink, fontSize: 14 }}>🏛️ Visit the Parish Office</p>
      <p style={{ margin: '4px 0 8px', fontSize: 12, color: C.sub }}>Prefer to process in person? The office is happy to help.</p>
      {contact?.address && <p style={{ margin: '4px 0', fontSize: 13, color: C.ink }}>📍 {contact.address}</p>}
      {contact?.phone && <p style={{ margin: '4px 0', fontSize: 13 }}><a href={`tel:${contact.phone}`} style={{ color: C.ink, textDecoration: 'none' }}>📞 {contact.phone}</a></p>}
      {contact?.email && <p style={{ margin: '4px 0', fontSize: 13 }}><a href={`mailto:${contact.email}`} style={{ color: C.ink, textDecoration: 'none' }}>✉️ {contact.email}</a></p>}
      <p style={{ margin: '4px 0', fontSize: 13, color: C.ink }}>🕐 {hours || 'Ask the parish for office hours'}</p>
      {contact?.address && (
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`} target="_blank" rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: 6, fontSize: 13, color: C.gold, fontWeight: 600, textDecoration: 'none' }}>🧭 Get directions →</a>
      )}
    </div>
  );
}

// Step indicator for the event-booking wizard.
function Steps({ current }: { current: 1 | 2 | 3 }) {
  const names = ['Requirements', 'Date', 'Your details'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0 4px' }} className="no-print">
      {names.map((n, i) => {
        const step = i + 1; const active = step === current; const done = step < current;
        return (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: i < names.length - 1 ? 1 : undefined }}>
            <span style={{ width: 22, height: 22, borderRadius: 11, background: active || done ? C.gold : C.line, color: active || done ? '#FFF' : C.sub, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{done ? '✓' : step}</span>
            <span style={{ fontSize: 11, color: active ? C.ink : C.sub, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap' }}>{n}</span>
            {i < names.length - 1 && <span style={{ flex: 1, height: 1, background: C.line, minWidth: 8 }} />}
          </div>
        );
      })}
    </div>
  );
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
