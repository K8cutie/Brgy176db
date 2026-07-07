// ═══════════════════════════════════════════════════════════
// Settings → Public Portal / Online Services
//
// The in-app editor for the parishioner self-service portal (/portal/:slug).
// A parish sets which services it offers, the fee per service, its office
// contact, and the master intake switch — the same public_config the public
// portal (PublicPortal.tsx) and the intake trigger read. Closes the gap where
// a parish previously needed an operator to hand-edit JSON in the database.
//
// Cloud-only feature: in desktop/offline mode there is no anon web backend, so
// this shows an explanatory notice (mirroring App.tsx DioceseGate) instead of a
// dead form — and never crashes when isCloud() is false.
// ═══════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Save, Check, RotateCcw, Lock } from 'lucide-react';
import { isCloud } from '@/lib/cloudStore';
import {
  getPortalConfig,
  savePortalConfig,
  validatePortalConfig,
  emptyPortalConfig,
  PORTAL_SERVICES,
  type PortalConfig,
  type PortalService,
} from '@/lib/portalConfig';

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// Display metadata for the four portal services (labels/blurbs match PublicPortal).
const SERVICE_META: Record<PortalService, { label: string; desc: string }> = {
  mass_intention: { label: 'Mass Intention', desc: 'Have a Mass offered for a loved one or an intention.' },
  certificate: { label: 'Certificate Request', desc: 'Baptismal, marriage, or confirmation certificate copies.' },
  donation: { label: 'Donation', desc: 'Let parishioners give online. (No fixed fee — the giver chooses.)' },
  event_booking: { label: 'Event Booking', desc: 'Inquire about a baptism, wedding, or other service.' },
};

const inputCls =
  'w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text';

export default function PortalConfigSection() {
  const cloud = isCloud();
  const [cfg, setCfg] = useState<PortalConfig>(emptyPortalConfig);
  const [loaded, setLoaded] = useState<PortalConfig | null>(null); // baseline for dirty-check
  const [loading, setLoading] = useState(cloud);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    setLoading(true);
    getPortalConfig()
      .then((c) => {
        if (!alive) return;
        const next = c ?? emptyPortalConfig();
        setCfg(next);
        setLoaded(next);
        if (!c) setError('Could not load your current settings. You can still edit and save below.');
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [cloud]);

  // ── Desktop / offline: explanatory state, not a dead form (mirror DioceseGate) ──
  if (!cloud) {
    return (
      <div className="space-y-6">
        <SectionHeader />
        <div className="cos-card text-center py-10">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gold/10 flex items-center justify-center">
            <Globe className="w-6 h-6 text-gold" />
          </div>
          <h3 className="heading-sm text-charcoal dark:text-dm-text mb-1">Online services are part of ChurchOS Cloud</h3>
          <p className="body-sm text-warm-gray max-w-md mx-auto">
            This install runs standalone for a single parish on this computer, so there is no public website to
            configure here. On ChurchOS Cloud, your parish gets a public page where parishioners can request Mass
            intentions, certificates, donations, and bookings — and you set what's offered right here in Settings.
          </p>
        </div>
      </div>
    );
  }

  const issues = validatePortalConfig(cfg);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(loaded);

  const toggleService = (svc: PortalService) => {
    setCfg((c) => {
      const on = c.services.includes(svc);
      return { ...c, services: on ? c.services.filter((s) => s !== svc) : [...c.services, svc] };
    });
  };

  const setFee = (svc: PortalService, raw: string) => {
    setCfg((c) => {
      const fees = { ...c.fees };
      if (raw.trim() === '') delete fees[svc];
      else {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) fees[svc] = n;
      }
      return { ...c, fees };
    });
  };

  const setContact = (field: keyof PortalConfig['contact'], value: string) => {
    setCfg((c) => ({ ...c, contact: { ...c.contact, [field]: value } }));
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    const res = await savePortalConfig(cfg);
    setSaving(false);
    if (res.ok) {
      setLoaded(cfg);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(res.error || 'Could not save. Please try again.');
    }
  };

  const handleReset = () => {
    if (loaded) setCfg(loaded);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeader />
        <div className="flex items-center gap-2">
          {saved && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-sm text-success flex items-center gap-1"
            >
              <Check className="w-4 h-4" /> Saved
            </motion.span>
          )}
          <button onClick={handleReset} disabled={!dirty || saving} className="cos-btn cos-btn-secondary text-sm">
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!dirty || saving || loading}
            className={cn(
              'cos-btn text-sm text-white flex items-center gap-2',
              dirty && !saving ? 'cos-btn-primary' : 'bg-warm-gray/30 cursor-not-allowed',
            )}
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Honesty: changes are only live once the operator has applied the Cloud config. */}
      <div className="p-3 rounded-lg bg-info/10 border border-info/20 text-sm text-info flex items-start gap-2">
        <Globe className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>Changes sync to your public page once your ChurchOS Cloud is set up.</span>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-error/10 border border-error/20 text-sm text-error">{error}</div>
      )}

      {loading ? (
        <div className="cos-card body-sm text-warm-gray">Loading your current settings…</div>
      ) : (
        <>
          {/* Master switch */}
          <div className="cos-card flex items-start justify-between gap-4">
            <div>
              <h3 className="heading-sm text-charcoal dark:text-dm-text mb-1">Accept online requests</h3>
              <p className="body-sm text-warm-gray">
                The master switch for your public page. When off, parishioners can't submit anything online — turn it
                on once your services and contact details below are ready.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={cfg.intake_enabled}
              onClick={() => setCfg((c) => ({ ...c, intake_enabled: !c.intake_enabled }))}
              className={cn(
                'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors',
                cfg.intake_enabled ? 'bg-gold' : 'bg-warm-gray/30',
              )}
            >
              <span
                className={cn(
                  'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                  cfg.intake_enabled ? 'translate-x-5' : 'translate-x-0.5',
                )}
              />
            </button>
          </div>

          {/* Services + fees */}
          <div className="cos-card">
            <h3 className="heading-sm text-charcoal dark:text-dm-text mb-1">Services offered</h3>
            <p className="body-sm text-warm-gray mb-4">
              Tick the services your parish handles online, and set the fee for each (in pesos). Leave a fee blank if it
              varies or is free.
            </p>
            <div className="space-y-2">
              {PORTAL_SERVICES.map((svc) => {
                const on = cfg.services.includes(svc);
                const meta = SERVICE_META[svc];
                return (
                  <div
                    key={svc}
                    className={cn(
                      'flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border p-3 transition-colors',
                      on ? 'border-gold/60 bg-gold/[0.04]' : 'border-parchment dark:border-dm-border',
                    )}
                  >
                    <label className="flex items-start gap-3 flex-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleService(svc)}
                        className="mt-0.5 w-4 h-4 accent-gold flex-shrink-0"
                      />
                      <span>
                        <span className="block text-sm font-medium text-charcoal dark:text-dm-text">{meta.label}</span>
                        <span className="block text-xs text-warm-gray">{meta.desc}</span>
                      </span>
                    </label>
                    {svc !== 'donation' && (
                      <div className="flex items-center gap-2 sm:w-44 sm:justify-end">
                        <span className="text-sm text-warm-gray">Fee</span>
                        <span className="text-warm-gray">{'₱'}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          disabled={!on}
                          value={cfg.fees[svc] ?? ''}
                          onChange={(e) => setFee(svc, e.target.value)}
                          placeholder="0"
                          className={cn(
                            'w-24 h-9 px-2 rounded border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text',
                            !on && 'opacity-50 cursor-not-allowed',
                          )}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Office contact */}
          <div className="cos-card">
            <h3 className="heading-sm text-charcoal dark:text-dm-text mb-1">Office contact</h3>
            <p className="body-sm text-warm-gray mb-4">
              Shown on your public page so parishioners can call, email, or visit the office. All optional.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label text-warm-gray block mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={cfg.contact.phone}
                  onChange={(e) => setContact('phone', e.target.value)}
                  className={inputCls}
                  placeholder="(02) 8123 4567"
                />
                {issues.phone && <p className="text-xs text-error mt-1">{issues.phone}</p>}
              </div>
              <div>
                <label className="label text-warm-gray block mb-1.5">Email</label>
                <input
                  type="email"
                  autoCapitalize="none"
                  value={cfg.contact.email}
                  onChange={(e) => setContact('email', e.target.value)}
                  className={inputCls}
                  placeholder="office@yourparish.ph"
                />
                {issues.email && <p className="text-xs text-error mt-1">{issues.email}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="label text-warm-gray block mb-1.5">Address</label>
                <input
                  type="text"
                  value={cfg.contact.address}
                  onChange={(e) => setContact('address', e.target.value)}
                  className={inputCls}
                  placeholder="123 Rosal St., Barangay San Roque, Quezon City"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label text-warm-gray block mb-1.5">Office hours</label>
                <input
                  type="text"
                  value={cfg.contact.hours}
                  onChange={(e) => setContact('hours', e.target.value)}
                  className={inputCls}
                  placeholder="Mon–Sat 8:00 AM–5:00 PM (closed 12–1 PM)"
                />
              </div>
            </div>
          </div>

          {/* Advanced (coming soon) — the per-sacrament requirements override editor */}
          <div className="cos-card bg-cream-dark/30 dark:bg-dm-surface-raised/40">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-warm-gray" />
              <h3 className="heading-sm text-charcoal dark:text-dm-text">Advanced: requirement checklists</h3>
              <span className="cos-badge cos-badge-default text-xs">Coming soon</span>
            </div>
            <p className="body-sm text-warm-gray">
              Your public page already shows sensible Philippine sacrament requirements (documents, seminars, sponsor
              rules) out of the box. Editing those per-parish is coming soon — the researched defaults are a good
              starting point for now.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function SectionHeader() {
  return (
    <div>
      <h2 className="heading-lg text-charcoal dark:text-dm-text">Public Portal / Online Services</h2>
      <p className="body-sm text-warm-gray mt-0.5">
        Configure the parishioner self-service page — the services you offer online, their fees, and your office
        contact.
      </p>
    </div>
  );
}
