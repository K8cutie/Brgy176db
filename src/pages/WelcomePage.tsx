// ═══════════════════════════════════════════════════════════
// WelcomePage — the AI-powered first-run after a parish signs up (cloud).
//
// Shown once, right after cloud onboarding (LoginPage → onboardNewAdmin) when
// the parish exists and the user is authenticated (so the vision reader works).
// The hook: instead of typing every parish detail, the secretary snaps a photo
// of their letterhead / an old certificate / the parish seal and Cherub reads it
// and fills the form. They just confirm. Saves to parishConfig, then → app.
// ═══════════════════════════════════════════════════════════

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Church, Sparkles, Upload, Loader2, ArrowRight, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabaseClient';
import { setParishConfig, type ParishConfig } from '@/lib/parishConfig';
import { DOC_TYPE_FIELDS, type ScannedExtraction } from '@/lib/scanTypes';

type ScanResult =
  | { ok: true; extraction: ScannedExtraction }
  | { ok: false; error: string };
type SupabaseFunctions = {
  functions: { invoke: (name: string, opts: { body: unknown }) => Promise<{ data: ScanResult | null; error: unknown }> };
};

const FIELDS: { key: string; label: string; type?: string; placeholder?: string }[] = [
  { key: 'parishName', label: 'Parish name', placeholder: 'St. Michael the Archangel Parish' },
  { key: 'diocese', label: 'Diocese', placeholder: 'Diocese of Cubao' },
  { key: 'parishPriest', label: 'Parish priest', placeholder: 'Fr. Antonio Reyes' },
  { key: 'addressStreet', label: 'Street', placeholder: '123 Rizal Street' },
  { key: 'addressBarangay', label: 'Barangay', placeholder: 'San Roque' },
  { key: 'addressCity', label: 'City / Municipality', placeholder: 'Mabalacat' },
  { key: 'addressProvince', label: 'Province', placeholder: 'Pampanga' },
  { key: 'contactNumber', label: 'Contact number', placeholder: '+63 …' },
  { key: 'email', label: 'Email', type: 'email', placeholder: 'parish@…' },
];

// Base64 WITHOUT the data: prefix (what the edge function expects).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = String(reader.result || '');
      const c = r.indexOf(',');
      resolve(c >= 0 ? r.slice(c + 1) : r);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

function goHome() {
  const isDesktop = !!(window as unknown as { churchos?: { isDesktop?: boolean } }).churchos?.isDesktop;
  if (isDesktop) { window.location.hash = '/'; window.location.reload(); }
  else window.location.assign('/');
}

export default function WelcomePage() {
  const seed = (() => {
    try { return JSON.parse(localStorage.getItem('churchos_onboarding_seed') || '{}'); }
    catch { return {}; }
  })() as { parishName?: string; diocese?: string };

  const [form, setForm] = useState<Record<string, string>>({
    parishName: seed.parishName || '',
    diocese: seed.diocese || '',
    parishPriest: '', addressStreet: '', addressBarangay: '',
    addressCity: '', addressProvince: '', contactNumber: '', email: '',
  });
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const autofill = async (file: File) => {
    if (file.type && file.type !== 'image/png' && file.type !== 'image/jpeg') {
      toast.error('Please use a JPG or PNG photo.'); return;
    }
    setReading(true);
    try {
      const image = await fileToBase64(file);
      const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const supa = await getSupabase();
      const { data, error } = await (supa as unknown as SupabaseFunctions).functions.invoke(
        'scan-extract', { body: { image, mimeType, hint: 'parish' } },
      );
      if (error || !data) { toast.error("Couldn't reach the reader — just fill it in below."); return; }
      if (!data.ok) {
        toast.message(
          data.error === 'no_key' ? "The reader isn't switched on yet — fill it in below."
          : data.error === 'rate_limited' ? 'Too many tries at once — wait a moment and retry.'
          : data.error === 'no_parish' ? 'Finish signing up first, then come back to auto-fill.'
          : "Couldn't read that photo — fill it in below.",
        );
        return;
      }
      const f = data.extraction.fields || {};
      setForm((prev) => {
        const next = { ...prev };
        for (const key of DOC_TYPE_FIELDS.parish) if (f[key]) next[key] = f[key];
        return next;
      });
      const filled = DOC_TYPE_FIELDS.parish.filter((k) => f[k]).length;
      toast.success(filled
        ? `Read ${filled} detail${filled === 1 ? '' : 's'} from the photo — check them below.`
        : 'Read the photo but found no parish details — fill in below.');
    } catch {
      toast.error("Couldn't read that file — fill it in below.");
    } finally {
      setReading(false);
    }
  };

  const finish = (save: boolean) => {
    if (save) {
      const address = [
        form.addressStreet,
        form.addressBarangay ? `Barangay ${form.addressBarangay}` : '',
        form.addressCity, form.addressProvince,
      ].filter(Boolean).join(', ');
      const u: Partial<ParishConfig> = {};
      if (form.parishName) { u.parishName = form.parishName; u.parishShortName = form.parishName; }
      if (form.diocese) u.diocese = form.diocese;
      if (form.parishPriest) { u.parishPriest = form.parishPriest; u.priestFullName = form.parishPriest; }
      if (form.addressStreet) u.addressStreet = form.addressStreet;
      if (form.addressBarangay) u.addressBarangay = form.addressBarangay;
      if (form.addressCity) u.addressCity = form.addressCity;
      if (form.addressProvince) u.addressProvince = form.addressProvince;
      if (form.contactNumber) u.contactNumber = form.contactNumber;
      if (form.email) u.email = form.email;
      if (address) u.address = address;
      setParishConfig(u);
      toast.success('Parish set up — welcome to ChurchOS!');
    }
    localStorage.removeItem('churchos_onboarding_seed');
    localStorage.setItem('churchos_welcome_done', 'true');
    goHome();
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{ backgroundColor: '#FAF8F3' }}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-2xl cos-card p-8"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center">
            <Church className="w-5 h-5 text-gold" />
          </div>
          <h1 className="display-xs text-charcoal dark:text-dm-text font-playfair">Welcome to ChurchOS</h1>
        </div>
        <p className="body-sm text-warm-gray dark:text-dm-text-muted mb-6">
          Let's set up your parish. You can type it in — or let Cherub read it off a photo.
        </p>

        {/* AI auto-fill CTA */}
        <div className="rounded-xl border-2 border-dashed border-gold/40 bg-gold/5 p-5 mb-6">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-gold shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-charcoal dark:text-dm-text">Auto-fill from a photo</p>
              <p className="text-xs text-warm-gray dark:text-dm-text-muted mb-3">
                Snap your parish <strong>letterhead</strong>, an old <strong>certificate</strong>, or your
                <strong> seal</strong> — Cherub reads your parish name, diocese, address, and priest for you.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void autofill(f); e.target.value = ''; }}
              />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={reading}
                className="cos-btn cos-btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {reading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {reading ? 'Reading the photo…' : 'Upload a photo to auto-fill'}
              </button>
            </div>
          </div>
        </div>

        {/* Editable form */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {FIELDS.map((fld) => (
            <label key={fld.key} className={fld.key === 'parishName' ? 'sm:col-span-2 block' : 'block'}>
              <span className="text-xs font-medium text-charcoal dark:text-dm-text">{fld.label}</span>
              <input
                type={fld.type || 'text'}
                value={form[fld.key] ?? ''}
                placeholder={fld.placeholder}
                onChange={(e) => set(fld.key, e.target.value)}
                className="mt-1 w-full h-10 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </label>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => finish(false)} className="cos-btn cos-btn-secondary text-sm">
            Skip for now
          </button>
          <button
            onClick={() => finish(true)}
            className="cos-btn cos-btn-primary text-sm flex items-center gap-1.5"
          >
            Save &amp; continue <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-warm-gray dark:text-dm-text-muted mt-3 flex items-center gap-1.5">
          <Upload className="w-3 h-3" /> You can change any of this later in Settings → Parish Info.
        </p>
      </motion.div>
    </div>
  );
}
