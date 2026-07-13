import { useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  X, Save, Type, Palette, Heading, AlignLeft, ListChecks, PenLine,
  FileText, Plus, Trash2, Upload, ImageOff, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  type CertificateDesign,
  defaultDesign,
  designToHtml,
  previewFill,
  FONT_OPTIONS,
  BORDER_PRESETS,
  ACCENT_SWATCHES,
} from '@/lib/certificateDesign';
import {
  type CertificateTemplate,
  type CertificateSacrament,
  certificateTokensByType,
  templateFromDesign,
  loadCertificateTemplates,
  saveCertificateTemplates,
} from '@/lib/registryData';

/* ═══════════════════════════════════════════════════════════════════
   GUIDED VISUAL CERTIFICATE EDITOR

   A non-technical secretary edits structured sections + a handful of
   style controls with a LIVE PREVIEW, and never touches HTML. Output is
   the same {{token}} HTML the shipped templates use, so generation /
   print / PDF keep working unchanged.
   ═══════════════════════════════════════════════════════════════════ */

interface CertificateDesignEditorProps {
  template: CertificateTemplate | null;
  sacrament: CertificateSacrament;
  onClose: () => void;
  onSaved: (t: CertificateTemplate) => void;
  onToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const SACRAMENT_LABEL: Record<CertificateSacrament, string> = {
  baptism: 'Baptism',
  marriage: 'Marriage',
  confirmation: 'Confirmation',
  death: 'Death',
};

const MAX_SEAL_BYTES = 1024 * 1024; // 1MB

// Shared input styling (matches SettingsPage inputs).
const inputCls =
  'w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text';
const labelCls = 'block body-xs font-medium text-warm-gray dark:text-dm-text-muted mb-1';

export default function CertificateDesignEditor({
  template,
  sacrament,
  onClose,
  onSaved,
  onToast,
}: CertificateDesignEditorProps) {
  const [design, setDesign] = useState<CertificateDesign>(
    () => template?.design ?? defaultDesign(sacrament),
  );
  const [name, setName] = useState<string>(
    () => template?.name ?? `My ${SACRAMENT_LABEL[sacrament]} Certificate`,
  );
  const [zoom, setZoom] = useState(75); // preview scale % (matches the 75/100/125 controls)

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Tracks which detail-row value input last had focus, so token chips insert there.
  const focusedRowRef = useRef<number | null>(null);
  const sealInputRef = useRef<HTMLInputElement>(null);

  const tokens = certificateTokensByType[sacrament];

  // Live preview HTML — recomputed only when the design changes.
  const previewHtml = useMemo(() => previewFill(designToHtml(design)), [design]);

  /* ── Generic field setter ── */
  const set = useCallback(
    <K extends keyof CertificateDesign>(key: K, value: CertificateDesign[K]) => {
      setDesign((d) => ({ ...d, [key]: value }));
    },
    [],
  );

  /* ── Insert a token into a textarea/input at the caret ── */
  const insertAtCaret = useCallback(
    (
      el: HTMLTextAreaElement | HTMLInputElement | null,
      current: string,
      token: string,
      commit: (next: string) => void,
    ) => {
      if (!el) {
        commit(current + token);
        return;
      }
      const start = el.selectionStart ?? current.length;
      const end = el.selectionEnd ?? current.length;
      const next = current.slice(0, start) + token + current.slice(end);
      commit(next);
      // Restore caret just after the inserted token on the next tick.
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        try {
          el.setSelectionRange(pos, pos);
        } catch {
          /* input types without range support — ignore */
        }
      });
    },
    [],
  );

  const insertBodyToken = useCallback(
    (token: string) => {
      insertAtCaret(bodyRef.current, design.bodyText, token, (next) => set('bodyText', next));
    },
    [design.bodyText, insertAtCaret, set],
  );

  /* ── Detail rows ── */
  const updateRow = useCallback(
    (idx: number, patch: Partial<{ label: string; value: string }>) => {
      setDesign((d) => ({
        ...d,
        detailRows: d.detailRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)),
      }));
    },
    [],
  );
  const addRow = useCallback(() => {
    setDesign((d) => ({ ...d, detailRows: [...d.detailRows, { label: 'Label', value: '' }] }));
  }, []);
  const removeRow = useCallback((idx: number) => {
    setDesign((d) => ({ ...d, detailRows: d.detailRows.filter((_, i) => i !== idx) }));
  }, []);
  const insertRowToken = useCallback(
    (token: string) => {
      const idx = focusedRowRef.current;
      if (idx == null) {
        onToast('Click a detail value field first, then tap a token', 'info');
        return;
      }
      const row = design.detailRows[idx];
      if (!row) return;
      updateRow(idx, { value: row.value + token });
    },
    [design.detailRows, onToast, updateRow],
  );

  /* ── Seal image upload ── */
  const onSealFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        onToast('Please choose an image file', 'warning');
        return;
      }
      if (file.size > MAX_SEAL_BYTES) {
        onToast('Seal image is too large — please use one under 1MB', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => set('sealImage', String(reader.result || ''));
      reader.onerror = () => onToast('Could not read that image', 'error');
      reader.readAsDataURL(file);
    },
    [onToast, set],
  );

  /* ── Save ── */
  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      onToast('Please give the certificate a name', 'warning');
      return;
    }
    // Editing an existing CUSTOM template overwrites it (reuse id). Editing a
    // SYSTEM template or creating new mints a fresh tcustom- id — never
    // overwrite a shipped system template.
    const reuseId = template && !template.isSystem ? template.id : undefined;
    const tmpl = templateFromDesign(design, trimmed, sacrament, reuseId);

    const list = loadCertificateTemplates();
    const existing = list.some((t) => t.id === tmpl.id);
    const next = existing ? list.map((t) => (t.id === tmpl.id ? tmpl : t)) : [...list, tmpl];

    if (!saveCertificateTemplates(next)) {
      onToast('Could not save — storage is full', 'error');
      return;
    }
    onToast('Certificate saved', 'success');
    onSaved(tmpl);
  }, [name, template, design, sacrament, onToast, onSaved]);

  /* ── Small helpers for repeated UI bits ── */
  const SectionHeading = ({ icon: Icon, children }: { icon: typeof Type; children: React.ReactNode }) => (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-gold" />
      <h3 className="heading-sm text-charcoal dark:text-dm-text">{children}</h3>
    </div>
  );

  const Toggle = ({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
  }) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold accent-gold"
      />
      <span className="body-sm text-charcoal dark:text-dm-text">{label}</span>
    </label>
  );

  const ColorField = ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-9 rounded border border-parchment dark:border-dm-border bg-transparent cursor-pointer p-0.5"
          aria-label={label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 h-9 px-2 rounded-md border border-parchment bg-white text-xs font-mono text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
        />
      </div>
    </div>
  );

  const TokenChips = ({ onInsert }: { onInsert: (token: string) => void }) => (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {tokens.map((t) => (
        <button
          key={t.token}
          type="button"
          onClick={() => onInsert(t.token)}
          title={`Insert ${t.token}`}
          className="cos-badge text-[11px] px-2 py-0.5 rounded-full border border-parchment dark:border-dm-border text-warm-gray dark:text-dm-text-muted hover:text-charcoal hover:border-gold hover:bg-gold-glow dark:hover:text-dm-text transition-colors"
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-start justify-center p-4 pt-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[1100px] overflow-hidden my-4 flex flex-col max-h-[calc(100vh-3rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-parchment dark:border-dm-border shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg bg-deep-navy flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Certificate name"
                className="w-full max-w-md h-9 px-2 rounded-md border border-transparent hover:border-parchment focus:border-gold bg-transparent heading-md text-charcoal dark:text-dm-text focus:outline-none dark:hover:border-dm-border"
                aria-label="Certificate name"
              />
              <p className="body-xs text-warm-gray dark:text-dm-text-muted px-2">
                {SACRAMENT_LABEL[sacrament]} certificate — guided visual editor
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleSave} className="cos-btn cos-btn-primary text-sm gap-1.5">
              <Save className="w-4 h-4" />
              Save
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Body: two columns ── */}
        <div className="flex flex-col md:flex-row min-h-0 flex-1">
          {/* LEFT: controls */}
          <div className="w-full md:w-[46%] md:max-w-[500px] overflow-y-auto p-5 space-y-4 border-b md:border-b-0 md:border-r border-parchment dark:border-dm-border">
            {/* Style */}
            <div className="cos-card p-4 space-y-3">
              <SectionHeading icon={Palette}>Style</SectionHeading>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className={labelCls}>Font</span>
                  <select
                    value={design.fontFamily}
                    onChange={(e) => set('fontFamily', e.target.value)}
                    className={inputCls}
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className={labelCls}>Border</span>
                  <select
                    value={design.borderStyle}
                    onChange={(e) =>
                      set('borderStyle', e.target.value as CertificateDesign['borderStyle'])
                    }
                    className={inputCls}
                  >
                    {BORDER_PRESETS.map((b) => (
                      <option key={b.value} value={b.value}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Accent quick-pick swatches */}
              <div>
                <span className={labelCls}>Accent quick-pick</span>
                <div className="flex flex-wrap gap-1.5">
                  {ACCENT_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set('accentColor', c)}
                      title={c}
                      aria-label={`Accent ${c}`}
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                        design.accentColor.toLowerCase() === c.toLowerCase()
                          ? 'border-charcoal dark:border-dm-text ring-2 ring-gold'
                          : 'border-white dark:border-dm-border shadow-sm'
                      }`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <ColorField
                  label="Accent"
                  value={design.accentColor}
                  onChange={(v) => set('accentColor', v)}
                />
                <ColorField label="Text" value={design.textColor} onChange={(v) => set('textColor', v)} />
                <ColorField
                  label="Background"
                  value={design.bgColor}
                  onChange={(v) => set('bgColor', v)}
                />
                <ColorField
                  label="Border"
                  value={design.borderColor}
                  onChange={(v) => set('borderColor', v)}
                />
              </div>
            </div>

            {/* Header */}
            <div className="cos-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <SectionHeading icon={Heading}>Header</SectionHeading>
                <Toggle
                  checked={design.showHeader}
                  onChange={(v) => set('showHeader', v)}
                  label="Show"
                />
              </div>
              {design.showHeader && (
                <>
                  <div>
                    <span className={labelCls}>Parish name line</span>
                    <input
                      type="text"
                      value={design.headerText}
                      onChange={(e) => set('headerText', e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <span className={labelCls}>Sub-line (address)</span>
                    <input
                      type="text"
                      value={design.headerSubText}
                      onChange={(e) => set('headerSubText', e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Title */}
            <div className="cos-card p-4 space-y-3">
              <SectionHeading icon={Type}>Title</SectionHeading>
              <div>
                <span className={labelCls}>Title text</span>
                <input
                  type="text"
                  value={design.title}
                  onChange={(e) => set('title', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <span className={labelCls}>Title size — {design.titleSize}px</span>
                <input
                  type="range"
                  min={20}
                  max={54}
                  value={design.titleSize}
                  onChange={(e) => set('titleSize', Number(e.target.value))}
                  className="w-full accent-gold"
                />
              </div>
            </div>

            {/* Body */}
            <div className="cos-card p-4 space-y-3">
              <SectionHeading icon={AlignLeft}>Body</SectionHeading>
              <div>
                <span className={labelCls}>
                  Body text — each new line is its own centered line
                </span>
                <textarea
                  ref={bodyRef}
                  value={design.bodyText}
                  onChange={(e) => set('bodyText', e.target.value)}
                  rows={7}
                  className="w-full px-3 py-2 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text resize-y leading-relaxed"
                />
              </div>
              <div>
                <span className={labelCls}>Body size — {design.bodySize}px</span>
                <input
                  type="range"
                  min={11}
                  max={26}
                  value={design.bodySize}
                  onChange={(e) => set('bodySize', Number(e.target.value))}
                  className="w-full accent-gold"
                />
              </div>
              <div>
                <span className={labelCls}>Insert a field</span>
                <TokenChips onInsert={insertBodyToken} />
              </div>
            </div>

            {/* Details */}
            <div className="cos-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <SectionHeading icon={ListChecks}>Details</SectionHeading>
                <Toggle
                  checked={design.showDetails}
                  onChange={(v) => set('showDetails', v)}
                  label="Show"
                />
              </div>
              {design.showDetails && (
                <>
                  <div className="space-y-2">
                    {design.detailRows.map((row, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <input
                          type="text"
                          value={row.label}
                          onChange={(e) => updateRow(idx, { label: e.target.value })}
                          placeholder="Label"
                          className="w-1/3 h-9 px-2 rounded-md border border-parchment bg-white text-xs text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                        />
                        <input
                          type="text"
                          value={row.value}
                          onFocus={() => (focusedRowRef.current = idx)}
                          onChange={(e) => updateRow(idx, { value: e.target.value })}
                          placeholder="Value (e.g. {{officiant}})"
                          className="flex-1 h-9 px-2 rounded-md border border-parchment bg-white text-xs text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="p-2 rounded-md text-warm-gray hover:text-error hover:bg-error/10 transition-colors shrink-0"
                          aria-label="Remove row"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={addRow}
                      className="cos-btn cos-btn-secondary text-xs py-1.5 px-3 gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add row
                    </button>
                  </div>
                  <div>
                    <span className={labelCls}>Insert into focused value</span>
                    <TokenChips onInsert={insertRowToken} />
                  </div>
                </>
              )}
            </div>

            {/* Signatures & seal */}
            <div className="cos-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <SectionHeading icon={PenLine}>Signatures &amp; Seal</SectionHeading>
                <Toggle
                  checked={design.showSignatures}
                  onChange={(v) => set('showSignatures', v)}
                  label="Show"
                />
              </div>
              {design.showSignatures && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className={labelCls}>Left value</span>
                      <input
                        type="text"
                        value={design.leftSignToken}
                        onChange={(e) => set('leftSignToken', e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <span className={labelCls}>Left caption</span>
                      <input
                        type="text"
                        value={design.leftSignLabel}
                        onChange={(e) => set('leftSignLabel', e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <span className={labelCls}>Right value</span>
                      <input
                        type="text"
                        value={design.rightSignToken}
                        onChange={(e) => set('rightSignToken', e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <span className={labelCls}>Right caption</span>
                      <input
                        type="text"
                        value={design.rightSignLabel}
                        onChange={(e) => set('rightSignLabel', e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>

                  {/* Seal */}
                  <div>
                    <span className={labelCls}>Seal</span>
                    {design.sealImage ? (
                      <div className="flex items-center gap-3">
                        <img
                          src={design.sealImage}
                          alt="Seal preview"
                          className="w-14 h-14 object-contain rounded border border-parchment dark:border-dm-border bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => set('sealImage', '')}
                          className="cos-btn cos-btn-secondary text-xs py-1.5 px-3 gap-1"
                        >
                          <ImageOff className="w-3.5 h-3.5" />
                          Remove image
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => sealInputRef.current?.click()}
                            className="cos-btn cos-btn-secondary text-xs py-1.5 px-3 gap-1"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            Upload seal image
                          </button>
                          <span className="body-xs text-warm-gray dark:text-dm-text-muted">
                            or use text below
                          </span>
                        </div>
                        <input
                          ref={sealInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            onSealFile(e.target.files?.[0]);
                            e.target.value = '';
                          }}
                        />
                        <input
                          type="text"
                          value={design.sealText}
                          onChange={(e) => set('sealText', e.target.value)}
                          placeholder="OFFICIAL SEAL"
                          className={inputCls}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Registry line */}
            <div className="cos-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <SectionHeading icon={FileText}>Registry line</SectionHeading>
                <Toggle
                  checked={design.showRegistryRef}
                  onChange={(v) => set('showRegistryRef', v)}
                  label="Show"
                />
              </div>
              {design.showRegistryRef && (
                <div>
                  <span className={labelCls}>Footer text</span>
                  <input
                    type="text"
                    value={design.registryRefText}
                    onChange={(e) => set('registryRefText', e.target.value)}
                    className={inputCls}
                  />
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: live preview */}
          <div className="flex-1 min-w-0 bg-cream-dark/40 dark:bg-dm-surface-raised/30 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-parchment dark:border-dm-border shrink-0">
              <span className="body-xs font-medium text-warm-gray dark:text-dm-text-muted uppercase tracking-wide">
                Live preview
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(75, z - 25))}
                  className="p-1.5 rounded text-warm-gray hover:text-charcoal hover:bg-cream-dark dark:text-dm-text-muted dark:hover:text-dm-text disabled:opacity-40"
                  aria-label="Zoom out"
                  disabled={zoom <= 75}
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1">
                  {[75, 100, 125].map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => setZoom(z)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        zoom === z
                          ? 'bg-gold text-white'
                          : 'text-warm-gray hover:text-charcoal dark:text-dm-text-muted dark:hover:text-dm-text'
                      }`}
                    >
                      {z}%
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(125, z + 25))}
                  className="p-1.5 rounded text-warm-gray hover:text-charcoal hover:bg-cream-dark dark:text-dm-text-muted dark:hover:text-dm-text disabled:opacity-40"
                  aria-label="Zoom in"
                  disabled={zoom >= 125}
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {/* A4-ish page (794px ~ 210mm @ 96dpi) scaled to fit. */}
              <div
                style={{
                  width: 794 * (zoom / 100),
                  margin: '0 auto',
                }}
              >
                <div
                  style={{
                    width: 794,
                    transform: `scale(${zoom / 100})`,
                    transformOrigin: 'top left',
                  }}
                  className="bg-white shadow-lg"
                >
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
