import { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Church, Clock, FileText, Users, ClipboardList,
  Upload, Image, Save, RotateCcw, Plus, Trash2, Edit, Copy,
  X, Check, Search, Lock, Unlock, Printer,
  GripVertical, DollarSign, HelpCircle, Play, RotateCcw as ResetIcon,
  Database, Download, FolderOpen,
} from 'lucide-react';
import DataTable, { type Column } from '@/components/DataTable';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { getParishConfig, setParishConfig } from '@/lib/parishConfig';
import {
  getFeeSchedule,
  setFeeSchedule,
  canEditFeeSchedule,
  DEFAULT_FEE_SCHEDULE,
  type FeeScheduleItem,
} from '@/lib/feeSchedule';
import type { ParishConfig } from '@/lib/parishConfig';
import {
  defaultParishInfo,
  currencyOptions,
  languageOptions,
  defaultMassSchedule,
  daysOfWeek,
  massLanguages,
  massTypes,
  defaultTemplates,
  defaultBaptismHTML,
  defaultTemplateCSS,
  sampleData,
  certificateTokens,
  defaultUsers,
  roleDescriptions,
  roleBadgeColors,
  auditLogData,
  actionBadgeColors,
} from '@/lib/settingsData';
import type { ParishInfo, MassTime, CertificateTemplate, User, AuditLogEntry } from '@/lib/settingsData';
import {
  getAvailableTours,
  getTourStatus,
  resetTourProgress,
  areAllToursDisabled,
  setAllToursDisabled,
  type TourConfig,
} from '@/lib/tours';
import type { Step } from 'react-joyride';

// ── Helpers ──────────────────────────────────────────────────────

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function replaceTokens(html: string, css: string, data: Record<string, string>) {
  let result = html;
  Object.entries(data).forEach(([key, value]) => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });
  // Also replace any remaining tokens with sample text
  result = result.replace(/{{(\w+)}}/g, (_, key) => data[key] || `[${key}]`);
  return `<style>${css}</style>${result}`;
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 10; i++) pw += chars.charAt(Math.floor(Math.random() * chars.length));
  return pw;
}

// ── Animation variants ───────────────────────────────────────────

const contentVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

// ═════════════════════════════════════════════════════════════════
//  SECTION 1: PARISH INFORMATION
// ═════════════════════════════════════════════════════════════════

function ParishInfoSection({ data, onChange }: { data: ParishInfo; onChange: (d: ParishInfo) => void }) {
  const [form, setForm] = useState<ParishInfo>({ ...data });
  const [saved, setSaved] = useState(false);

  const update = (field: keyof ParishInfo, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    onChange(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setForm({ ...data });
  };

  const hasChanges = JSON.stringify(form) !== JSON.stringify(data);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="heading-lg text-charcoal dark:text-dm-text">Parish Information</h2>
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
          <button onClick={handleReset} className="cos-btn cos-btn-secondary text-sm">
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className={cn(
              'cos-btn text-sm text-white flex items-center gap-2',
              hasChanges ? 'cos-btn-primary' : 'bg-warm-gray/30 cursor-not-allowed'
            )}
          >
            <Save className="w-4 h-4" /> Save Changes
          </button>
        </div>
      </div>

      {/* Form Grid */}
      <div className="cos-card">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            <div>
              <label className="label text-warm-gray block mb-1.5">Parish Name *</label>
              <input
                type="text"
                value={form.parishName}
                onChange={(e) => update('parishName', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                placeholder="Enter parish name"
              />
            </div>
            <div>
              <label className="label text-warm-gray block mb-1.5">Diocese *</label>
              <input
                type="text"
                value={form.diocese}
                onChange={(e) => update('diocese', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
            <div>
              <label className="label text-warm-gray block mb-1.5">Parish Priest *</label>
              <input
                type="text"
                value={form.parishPriest}
                onChange={(e) => update('parishPriest', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
            <div>
              <label className="label text-warm-gray block mb-1.5">Feast Day</label>
              <input
                type="text"
                value={form.feastDay}
                onChange={(e) => update('feastDay', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
            <div>
              <label className="label text-warm-gray block mb-1.5">Year Established</label>
              <input
                type="text"
                value={form.yearEstablished}
                onChange={(e) => update('yearEstablished', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <div>
              <label className="label text-warm-gray block mb-1.5">Complete Address</label>
              <textarea
                value={form.address}
                onChange={(e) => update('address', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold resize-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                placeholder="Street, Barangay, City, Province, ZIP"
              />
            </div>
            <div>
              <label className="label text-warm-gray block mb-1.5">Contact Number</label>
              <input
                type="text"
                value={form.contactNumber}
                onChange={(e) => update('contactNumber', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
            <div>
              <label className="label text-warm-gray block mb-1.5">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update('email', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
            <div>
              <label className="label text-warm-gray block mb-1.5">Parish Website</label>
              <input
                type="text"
                value={form.website}
                onChange={(e) => update('website', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
            <div>
              <label className="label text-warm-gray block mb-1.5">Facebook Page</label>
              <input
                type="text"
                value={form.facebook}
                onChange={(e) => update('facebook', e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Logo & Seal Upload */}
      <div className="cos-card">
        <h3 className="heading-sm text-charcoal dark:text-dm-text mb-4">Logo & Seal</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Logo Upload */}
          <div>
            <label className="label text-warm-gray block mb-2">Parish Logo</label>
            <div className="border-2 border-dashed border-parchment rounded-xl p-6 text-center hover:border-gold transition-colors cursor-pointer bg-cream/50 dark:bg-dm-surface-raised">
              <div className="w-20 h-20 mx-auto mb-3 rounded-lg bg-gold/10 flex items-center justify-center">
                <Image className="w-8 h-8 text-gold" />
              </div>
              <p className="text-sm text-warm-gray mb-1">Click to browse or drag and drop</p>
              <p className="text-xs text-warm-gray/70">PNG with transparent background, 400x400</p>
              <Upload className="w-5 h-5 mx-auto mt-3 text-gold" />
            </div>
          </div>
          {/* Seal Upload */}
          <div>
            <label className="label text-warm-gray block mb-2">Official Seal</label>
            <div className="border-2 border-dashed border-parchment rounded-xl p-6 text-center hover:border-gold transition-colors cursor-pointer bg-cream/50 dark:bg-dm-surface-raised">
              <div className="w-20 h-20 mx-auto mb-3 rounded-full bg-gold/10 flex items-center justify-center">
                <Church className="w-8 h-8 text-gold" />
              </div>
              <p className="text-sm text-warm-gray mb-1">Click to browse or drag and drop</p>
              <p className="text-xs text-warm-gray/70">PNG with transparent background, 400x400</p>
              <Upload className="w-5 h-5 mx-auto mt-3 text-gold" />
            </div>
          </div>
        </div>
      </div>

      {/* Currency & Regional */}
      <div className="cos-card">
        <h3 className="heading-sm text-charcoal dark:text-dm-text mb-4">Currency & Regional Settings</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="label text-warm-gray block mb-1.5">Currency</label>
            <select
              value={form.currency}
              onChange={(e) => update('currency', e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
            >
              {currencyOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-warm-gray block mb-1.5">Timezone</label>
            <select
              value={form.timezone}
              disabled
              className="w-full h-10 px-3 rounded-md border border-parchment bg-cream-dark text-sm text-warm-gray cursor-not-allowed dark:bg-dm-surface dark:border-dm-border"
            >
              <option value="Asia/Manila">Asia/Manila (PST, UTC+8)</option>
            </select>
            <p className="text-xs text-warm-gray mt-1">Locked for Philippines</p>
          </div>
          <div>
            <label className="label text-warm-gray block mb-1.5">Language</label>
            <select
              value={form.language}
              onChange={(e) => update('language', e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
            >
              {languageOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label text-warm-gray block mb-3">Date Format</label>
            <div className="space-y-2">
              {[
                { value: 'MDY', label: 'May 20, 2026' },
                { value: 'DMY', label: '20 May 2026' },
                { value: 'YMD', label: '2026-05-20' },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="dateFormat"
                    value={opt.value}
                    checked={form.dateFormat === opt.value}
                    onChange={() => update('dateFormat', opt.value)}
                    className="accent-gold"
                  />
                  <span className="text-sm text-charcoal dark:text-dm-text">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
//  SECTION 2: MASS SCHEDULE
// ═════════════════════════════════════════════════════════════════

function MassScheduleSection() {
  const [schedule, setSchedule] = useState<MassTime[]>([...defaultMassSchedule]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<MassTime | null>(null);
  const [saved, setSaved] = useState(false);

  const groupedByDay = useMemo(() => {
    const map: Record<string, MassTime[]> = {};
    daysOfWeek.forEach((d) => { map[d] = []; });
    schedule.forEach((s) => {
      if (!map[s.day]) map[s.day] = [];
      map[s.day].push(s);
    });
    return map;
  }, [schedule]);

  const addMassTime = (day: string) => {
    const newItem: MassTime = {
      id: `new-${Date.now()}`,
      day,
      time: '7:00 AM',
      language: 'Tagalog',
      type: 'Regular',
      notes: '',
    };
    setSchedule((prev) => [...prev, newItem]);
    setEditingId(newItem.id);
    setEditForm(newItem);
  };

  const removeMassTime = (id: string) => {
    setSchedule((prev) => prev.filter((s) => s.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setEditForm(null);
    }
  };

  const startEdit = (item: MassTime) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const saveEdit = () => {
    if (!editForm) return;
    setSchedule((prev) => prev.map((s) => (s.id === editForm.id ? editForm : s)));
    setEditingId(null);
    setEditForm(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleSaveAll = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="heading-lg text-charcoal dark:text-dm-text">Mass Schedule</h2>
        <div className="flex items-center gap-2">
          {saved && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-success flex items-center gap-1">
              <Check className="w-4 h-4" /> Saved
            </motion.span>
          )}
          <button onClick={handleSaveAll} className="cos-btn cos-btn-primary text-sm">
            <Save className="w-4 h-4" /> Save Schedule
          </button>
        </div>
      </div>

      <div className="cos-card p-0 overflow-hidden">
        {daysOfWeek.map((day) => (
          <div key={day} className="border-b border-parchment/40 dark:border-dm-border last:border-b-0">
            {/* Day Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-cream-dark/50 dark:bg-dm-surface-raised">
              <span className="heading-sm text-charcoal dark:text-dm-text">{day}</span>
              <button
                onClick={() => addMassTime(day)}
                className="text-xs flex items-center gap-1 text-gold hover:text-gold-light transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Mass Time
              </button>
            </div>

            {/* Mass Times for this day */}
            {groupedByDay[day]?.length === 0 ? (
              <div className="px-5 py-3 text-sm text-warm-gray italic">No Mass times set</div>
            ) : (
              <div className="divide-y divide-parchment/30 dark:divide-dm-border">
                {groupedByDay[day]?.map((item) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="px-5 py-3"
                  >
                    {editingId === item.id && editForm ? (
                      /* Edit Mode */
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
                        <div>
                          <label className="text-xs text-warm-gray block mb-1">Time</label>
                          <input
                            type="text"
                            value={editForm.time}
                            onChange={(e) => setEditForm((p) => p && { ...p, time: e.target.value })}
                            className="w-full h-9 px-2 rounded border border-parchment text-sm focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-warm-gray block mb-1">Language</label>
                          <select
                            value={editForm.language}
                            onChange={(e) => setEditForm((p) => p && { ...p, language: e.target.value })}
                            className="w-full h-9 px-2 rounded border border-parchment text-sm focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                          >
                            {massLanguages.map((l) => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-warm-gray block mb-1">Type</label>
                          <select
                            value={editForm.type}
                            onChange={(e) => setEditForm((p) => p && { ...p, type: e.target.value })}
                            className="w-full h-9 px-2 rounded border border-parchment text-sm focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                          >
                            {massTypes.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-warm-gray block mb-1">Notes</label>
                          <input
                            type="text"
                            value={editForm.notes}
                            onChange={(e) => setEditForm((p) => p && { ...p, notes: e.target.value })}
                            className="w-full h-9 px-2 rounded border border-parchment text-sm focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                            placeholder="Optional notes"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={saveEdit} className="cos-btn cos-btn-primary text-xs py-1.5 px-3">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={cancelEdit} className="cos-btn cos-btn-secondary text-xs py-1.5 px-3">
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => removeMassTime(item.id)} className="cos-btn bg-error/10 text-error hover:bg-error/20 text-xs py-1.5 px-3">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* View Mode */
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <GripVertical className="w-4 h-4 text-warm-gray/40 cursor-grab" />
                          <span className="text-sm font-medium text-charcoal dark:text-dm-text w-20">{item.time}</span>
                          <span className="cos-badge cos-badge-default text-xs">{item.language}</span>
                          <span className={cn(
                            'cos-badge text-xs',
                            item.type === 'Sunday' && 'cos-badge-warning',
                            item.type === 'Regular' && 'cos-badge-info',
                            item.type === 'Anticipated' && 'cos-badge-success',
                            !['Sunday', 'Regular', 'Anticipated'].includes(item.type) && 'cos-badge-default',
                          )}>
                            {item.type}
                          </span>
                          {item.notes && <span className="text-xs text-warm-gray">{item.notes}</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(item)} className="p-1.5 rounded-md text-warm-gray hover:text-gold hover:bg-gold/10 transition-all">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button onClick={() => removeMassTime(item.id)} className="p-1.5 rounded-md text-warm-gray hover:text-error hover:bg-error/10 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════
//  SECTION 3: FEE SCHEDULE
// ═════════════════════════════════════════════════════════════════

function FeeScheduleSection() {
  const [fees, setFees] = useState<FeeScheduleItem[]>(getFeeSchedule);
  const [saved, setSaved] = useState(false);
  const canEdit = canEditFeeSchedule();

  const updateFee = (index: number, field: keyof FeeScheduleItem, value: string | number) => {
    setFees((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = () => {
    setFeeSchedule(fees);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setFees([...DEFAULT_FEE_SCHEDULE]);
  };

  const hasChanges = JSON.stringify(fees) !== JSON.stringify(getFeeSchedule());

  const formatPeso = (n: number) => `\u20b1${n.toLocaleString()}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="heading-lg text-charcoal dark:text-dm-text">Fee Schedule</h2>
        {canEdit && (
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
            <button onClick={handleReset} className="cos-btn cos-btn-secondary text-sm">
              <RotateCcw className="w-4 h-4" /> Reset to Defaults
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges}
              className={cn(
                'cos-btn text-sm text-white flex items-center gap-2',
                hasChanges ? 'cos-btn-primary' : 'bg-warm-gray/30 cursor-not-allowed'
              )}
            >
              <Save className="w-4 h-4" /> Save Changes
            </button>
          </div>
        )}
      </div>

      {/* RBAC notice */}
      {!canEdit && (
        <div className="p-3 rounded-lg bg-info/10 border border-info/20 flex items-center gap-2">
          <Lock className="w-4 h-4 text-info flex-shrink-0" />
          <span className="text-sm text-info">
            Only Parish Priest and Bookkeeper can edit fees.
          </span>
        </div>
      )}

      <div className="cos-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-parchment/40 dark:border-dm-border bg-cream-dark/50 dark:bg-dm-surface-raised">
              <th className="text-left px-5 py-3 font-medium text-warm-gray">Sacrament</th>
              <th className="text-left px-5 py-3 font-medium text-warm-gray">Ceremony Fee</th>
              <th className="text-left px-5 py-3 font-medium text-warm-gray">Certificate Fee</th>
              <th className="text-left px-5 py-3 font-medium text-warm-gray">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-parchment/30 dark:divide-dm-border">
            {fees.map((fee, i) => (
              <tr key={fee.sacramentType} className="hover:bg-cream-dark/30 dark:hover:bg-dm-surface-raised/50 transition-colors">
                <td className="px-5 py-3">
                  <span className="font-medium text-charcoal dark:text-dm-text">{fee.sacramentType}</span>
                </td>
                <td className="px-5 py-3">
                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <span className="text-warm-gray">\u20b1</span>
                      <input
                        type="number"
                        value={fee.ceremonyFee}
                        onChange={(e) => updateFee(i, 'ceremonyFee', parseInt(e.target.value) || 0)}
                        className="w-28 h-9 px-2 rounded border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                        min={0}
                        step={1}
                      />
                    </div>
                  ) : (
                    <span className="mono-md text-charcoal dark:text-dm-text">{formatPeso(fee.ceremonyFee)}</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {canEdit ? (
                    <div className="flex items-center gap-2">
                      <span className="text-warm-gray">\u20b1</span>
                      <input
                        type="number"
                        value={fee.certificateFee}
                        onChange={(e) => updateFee(i, 'certificateFee', parseInt(e.target.value) || 0)}
                        className="w-28 h-9 px-2 rounded border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                        min={0}
                        step={1}
                      />
                    </div>
                  ) : (
                    <span className="mono-md text-charcoal dark:text-dm-text">{formatPeso(fee.certificateFee)}</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {canEdit ? (
                    <input
                      type="text"
                      value={fee.description || ''}
                      onChange={(e) => updateFee(i, 'description', e.target.value)}
                      className="w-full h-9 px-2 rounded border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                      placeholder="Description..."
                    />
                  ) : (
                    <span className="text-warm-gray dark:text-dm-text-muted">{fee.description}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
//  SECTION 4: CERTIFICATE TEMPLATES
// ═════════════════════════════════════════════════════════════════

function CertificateTemplatesSection() {
  const [templates, setTemplates] = useState<CertificateTemplate[]>([...defaultTemplates]);
  const [activeSubTab, setActiveSubTab] = useState<'manage' | 'edit'>('manage');
  const [editingTemplate, setEditingTemplate] = useState<CertificateTemplate | null>(null);
  const [editHtml, setEditHtml] = useState('');
  const [editCss, setEditCss] = useState('');
  const [codeTab, setCodeTab] = useState<'html' | 'css'>('html');
  const [previewZoom, setPreviewZoom] = useState(75);
  const [paperSize, setPaperSize] = useState<'A4' | 'Letter' | 'Legal'>('A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = (tmpl: CertificateTemplate) => {
    setEditingTemplate(tmpl);
    setEditHtml(tmpl.html);
    setEditCss(tmpl.css);
    setEditName(tmpl.name);
    setActiveSubTab('edit');
  };

  const handleDuplicate = (tmpl: CertificateTemplate) => {
    const dup: CertificateTemplate = {
      ...tmpl,
      id: `tmpl-${Date.now()}`,
      name: `${tmpl.name} (Copy)`,
      type: 'Custom',
      isDefault: false,
      lastModified: 'Just now',
    };
    setTemplates((prev) => [...prev, dup]);
  };

  const handleDelete = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setShowDeleteConfirm(null);
  };

  const handleSave = () => {
    if (!editingTemplate) return;
    setTemplates((prev) =>
      prev.map((t) =>
        t.id === editingTemplate.id
          ? { ...t, name: editName, html: editHtml, css: editCss, lastModified: 'Just now' }
          : t
      )
    );
    setActiveSubTab('manage');
    setEditingTemplate(null);
  };

  const handleSaveAs = () => {
    const newTmpl: CertificateTemplate = {
      id: `tmpl-${Date.now()}`,
      name: `${editName} (Copy)`,
      sacrament: editingTemplate?.sacrament || 'Baptism',
      type: 'Custom',
      isDefault: false,
      lastModified: 'Just now',
      html: editHtml,
      css: editCss,
    };
    setTemplates((prev) => [...prev, newTmpl]);
    setActiveSubTab('manage');
    setEditingTemplate(null);
  };

  const insertToken = (token: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = codeTab === 'html' ? editHtml : editCss;
    const newValue = current.slice(0, start) + token + current.slice(end);
    if (codeTab === 'html') setEditHtml(newValue);
    else setEditCss(newValue);
    setTimeout(() => {
      ta.selectionStart = ta.selectionEnd = start + token.length;
      ta.focus();
    }, 0);
  };

  const previewHtml = useMemo(() => {
    return replaceTokens(editHtml, editCss, sampleData);
  }, [editHtml, editCss]);

  const handleTestPrint = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(
      `<!DOCTYPE html><html><head><title>${editName || 'Certificate'} — Test Print</title>` +
      `<style>@page{size:${paperSize} ${orientation};margin:0}html,body{margin:0;padding:0}</style>` +
      `</head><body onload="window.focus();window.print();">${previewHtml}</body></html>`
    );
    w.document.close();
  };

  const paperSizeMap = {
    A4: { w: 210, h: 297 },
    Letter: { w: 216, h: 279 },
    Legal: { w: 216, h: 356 },
  };

  const paperDims = paperSizeMap[paperSize];
  const previewW = orientation === 'portrait' ? paperDims.w : paperDims.h;
  const previewH = orientation === 'portrait' ? paperDims.h : paperDims.w;

  // ── Manage View ──
  if (activeSubTab === 'manage') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="heading-lg text-charcoal dark:text-dm-text">Certificate Templates</h2>
          <button
            onClick={() => {
              const newTmpl: CertificateTemplate = {
                id: `tmpl-${Date.now()}`,
                name: 'New Baptismal Template',
                sacrament: 'Baptism',
                type: 'Custom',
                isDefault: false,
                lastModified: 'Just now',
                html: defaultBaptismHTML,
                css: defaultTemplateCSS,
              };
              setTemplates((prev) => [...prev, newTmpl]);
              startEdit(newTmpl);
            }}
            className="cos-btn cos-btn-primary text-sm"
          >
            <Plus className="w-4 h-4" /> Create New Template
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {templates.map((tmpl, i) => (
            <motion.div
              key={tmpl.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="cos-card cos-card-hover p-0 overflow-hidden"
            >
              {/* Preview Thumbnail */}
              <div className="h-[200px] bg-cream-dark/30 dark:bg-dm-surface-raised overflow-hidden relative border-b border-parchment/40 dark:border-dm-border">
                <div
                  className="w-full h-full overflow-hidden"
                  style={{ transform: 'scale(0.35)', transformOrigin: 'top left', width: '285%', height: '285%' }}
                  dangerouslySetInnerHTML={{
                    __html: replaceTokens(tmpl.html, tmpl.css, sampleData),
                  }}
                />
                {tmpl.isDefault && (
                  <div className="absolute top-2 right-2 bg-gold text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    Default
                  </div>
                )}
              </div>

              {/* Card Info */}
              <div className="p-4">
                <h3 className="heading-sm text-charcoal dark:text-dm-text mb-1">{tmpl.name}</h3>
                <div className="flex items-center gap-2 mb-2">
                  <span className={cn(
                    'cos-badge text-xs',
                    tmpl.sacrament === 'Baptism' && 'bg-forest-green/10 text-forest-green',
                    tmpl.sacrament === 'Marriage' && 'bg-maroon/10 text-maroon',
                    tmpl.sacrament === 'Confirmation' && 'bg-purple/10 text-purple',
                  )}>
                    {tmpl.sacrament}
                  </span>
                  <span className={cn(
                    'cos-badge text-xs',
                    tmpl.type === 'System' ? 'cos-badge-default' : 'cos-badge-info',
                  )}>
                    {tmpl.type}
                  </span>
                </div>
                <p className="text-xs text-warm-gray mb-3">Modified: {tmpl.lastModified}</p>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(tmpl)}
                    className="flex-1 cos-btn cos-btn-primary text-xs py-1.5"
                  >
                    <Edit className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDuplicate(tmpl)}
                    className="cos-btn cos-btn-secondary text-xs py-1.5 px-2"
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => tmpl.type === 'System' ? null : setShowDeleteConfirm(tmpl.id)}
                    disabled={tmpl.type === 'System'}
                    title={tmpl.type === 'System' ? 'System templates cannot be deleted' : 'Delete'}
                    className={cn(
                      'cos-btn text-xs py-1.5 px-2',
                      tmpl.type === 'System'
                        ? 'bg-warm-gray/10 text-warm-gray/40 cursor-not-allowed'
                        : 'bg-error/10 text-error hover:bg-error/20',
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <ConfirmationDialog
          isOpen={!!showDeleteConfirm}
          title="Delete Template"
          message="Are you sure you want to delete this template? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
          onCancel={() => setShowDeleteConfirm(null)}
        />
      </div>
    );
  }

  // ── Editor View ──
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="heading-lg text-charcoal dark:text-dm-text">Template Editor</h2>
        <button
          onClick={() => { setActiveSubTab('manage'); setEditingTemplate(null); }}
          className="cos-btn cos-btn-secondary text-sm"
        >
          <X className="w-4 h-4" /> Close Editor
        </button>
      </div>

      {/* Split Pane Editor */}
      <div className="cos-card p-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}>
          {/* Left Pane: Code Editor (40%) */}
          <div className="w-full lg:w-[40%] flex flex-col border-r border-parchment/40 dark:border-dm-border">
            {/* Code Tabs */}
            <div className="flex border-b border-parchment/40 dark:border-dm-border">
              {(['html', 'css'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setCodeTab(tab)}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium border-b-2 transition-all',
                    codeTab === tab
                      ? 'border-gold text-gold'
                      : 'border-transparent text-warm-gray hover:text-charcoal dark:hover:text-dm-text',
                  )}
                >
                  {tab.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Code Area */}
            <div className="flex-1 overflow-auto bg-[#1E1E1E] relative">
              <textarea
                ref={textareaRef}
                value={codeTab === 'html' ? editHtml : editCss}
                onChange={(e) => codeTab === 'html' ? setEditHtml(e.target.value) : setEditCss(e.target.value)}
                spellCheck={false}
                className="w-full h-full p-4 font-mono text-[13px] leading-6 text-[#D4D4D4] bg-transparent resize-none focus:outline-none"
                style={{ tabSize: 2 }}
              />
            </div>

            {/* Token Insertion Panel */}
            <div className="border-t border-parchment/40 dark:border-dm-border bg-cream-dark/30 dark:bg-dm-surface-raised p-3 max-h-[160px] overflow-y-auto">
              <p className="text-xs text-warm-gray mb-2 font-medium">Insert Token</p>
              <div className="space-y-2">
                {Object.entries(certificateTokens).map(([category, tokens]) => (
                  <div key={category}>
                    <span className="text-[10px] uppercase tracking-wider text-warm-gray/70">{category}</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {tokens.map((token) => (
                        <button
                          key={token}
                          onClick={() => insertToken(token)}
                          className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-dm-surface border border-parchment dark:border-dm-border text-gold hover:bg-gold/10 transition-colors"
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Pane: Live Preview (60%) */}
          <div className="w-full lg:w-[60%] flex flex-col bg-cream-dark/30 dark:bg-dm-bg">
            {/* Preview Toolbar */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-parchment/40 dark:border-dm-border bg-white dark:bg-dm-surface">
              <div className="flex items-center gap-3">
                <span className="text-xs text-warm-gray font-medium">Zoom:</span>
                {[50, 75, 100, 125, 150].map((z) => (
                  <button
                    key={z}
                    onClick={() => setPreviewZoom(z)}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded transition-colors',
                      previewZoom === z ? 'bg-gold text-white' : 'text-warm-gray hover:bg-cream-dark dark:hover:bg-dm-surface-raised',
                    )}
                  >
                    {z}%
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {(['A4', 'Letter', 'Legal'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => setPaperSize(size)}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded transition-colors',
                      paperSize === size ? 'bg-gold text-white' : 'text-warm-gray hover:bg-cream-dark dark:hover:bg-dm-surface-raised',
                    )}
                  >
                    {size}
                  </button>
                ))}
                <div className="w-px h-4 bg-parchment dark:bg-dm-border mx-1" />
                {(['portrait', 'landscape'] as const).map((ori) => (
                  <button
                    key={ori}
                    onClick={() => setOrientation(ori)}
                    className={cn(
                      'text-xs px-2 py-0.5 rounded transition-colors capitalize',
                      orientation === ori ? 'bg-gold text-white' : 'text-warm-gray hover:bg-cream-dark dark:hover:bg-dm-surface-raised',
                    )}
                  >
                    {ori}
                  </button>
                ))}
              </div>
            </div>

            {/* Preview Frame */}
            <div className="flex-1 overflow-auto flex items-start justify-center p-6">
              <div
                className="bg-white shadow-lg border border-parchment/60 origin-top"
                style={{
                  width: `${previewW}mm`,
                  height: `${previewH}mm`,
                  transform: `scale(${previewZoom / 100})`,
                  transformOrigin: 'top center',
                  minWidth: `${previewW}mm`,
                  minHeight: `${previewH}mm`,
                }}
              >
                <div
                  className="w-full h-full"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-parchment/40 dark:border-dm-border bg-white dark:bg-dm-surface">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="h-9 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold w-64 dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
          />
          <div className="flex items-center gap-2">
            <button onClick={() => { setActiveSubTab('manage'); setEditingTemplate(null); }} className="cos-btn cos-btn-secondary text-sm">
              Cancel
            </button>
            <button onClick={handleSaveAs} className="cos-btn cos-btn-secondary text-sm">
              Save As
            </button>
            <button onClick={handleSave} className="cos-btn cos-btn-primary text-sm">
              <Save className="w-4 h-4" /> Save
            </button>
            <button onClick={handleTestPrint} className="cos-btn text-sm bg-deep-navy text-white hover:bg-deep-navy-light">
              <Printer className="w-4 h-4" /> Test Print
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════
//  SECTION 5: USER MANAGEMENT
// ═════════════════════════════════════════════════════════════════

function UserManagementSection() {
  const [users, setUsers] = useState<User[]>([...defaultUsers]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<Partial<User>>({ status: 'Active', role: 'Secretary' });
  const [showResetDialog, setShowResetDialog] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState<string | null>(null);
  const [copiedPw, setCopiedPw] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState<User | null>(null);

  const openAdd = () => {
    setEditingUser(null);
    setUserForm({ name: '', username: '', email: '', role: 'Secretary', status: 'Active' });
    setShowUserModal(true);
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setUserForm({ ...user });
    setShowUserModal(true);
  };

  const saveUser = () => {
    if (!userForm.name || !userForm.username || !userForm.email || !userForm.role) return;
    if (editingUser) {
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, ...userForm } as User : u))
      );
    } else {
      const newUser: User = {
        id: `usr-${Date.now()}`,
        name: userForm.name || '',
        username: userForm.username || '',
        email: userForm.email || '',
        role: (userForm.role as User['role']) || 'Secretary',
        status: (userForm.status as User['status']) || 'Active',
        lastLogin: 'Never',
      };
      setUsers((prev) => [...prev, newUser]);
    }
    setShowUserModal(false);
  };

  const handleResetPassword = () => {
    if (!showResetDialog) return;
    setResetPassword(generateTempPassword());
    setShowResetDialog(null);
  };

  const handleToggleStatus = (user: User) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, status: u.status === 'Active' ? 'Inactive' : 'Active' } : u))
    );
    setShowDeactivateDialog(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPw(true);
    setTimeout(() => setCopiedPw(false), 2000);
  };

  const columns = [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'username', header: 'Username', sortable: true },
    {
      key: 'role',
      header: 'Role',
      render: (row: User) => (
        <span className={cn('cos-badge text-xs', roleBadgeColors[row.role] || 'cos-badge-default')}>
          {row.role}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: User) => (
        <span className={cn(
          'cos-badge text-xs',
          row.status === 'Active' ? 'cos-badge-success' : 'cos-badge-default',
        )}>
          {row.status}
        </span>
      ),
    },
    { key: 'lastLogin', header: 'Last Login', sortable: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="heading-lg text-charcoal dark:text-dm-text">User Management</h2>
        <button onClick={openAdd} className="cos-btn cos-btn-primary text-sm">
          <Plus className="w-4 h-4" /> Add User
        </button>
      </div>

      <DataTable
        columns={columns as Column<Record<string, unknown>>[]}
        data={users as unknown as Record<string, unknown>[]}
        pageSize={10}
        actionsColumn={(row) => {
          const user = row as unknown as User;
          return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => openEdit(user)}
              className="p-1.5 rounded-md text-warm-gray hover:text-gold hover:bg-gold/10 transition-all"
              title="Edit"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowResetDialog(user)}
              className="p-1.5 rounded-md text-warm-gray hover:text-info hover:bg-info/10 transition-all"
              title="Reset Password"
            >
              <Lock className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowDeactivateDialog(user)}
              className={cn(
                'p-1.5 rounded-md transition-all',
                user.status === 'Active'
                  ? 'text-warm-gray hover:text-error hover:bg-error/10'
                  : 'text-warm-gray hover:text-success hover:bg-success/10',
              )}
              title={user.status === 'Active' ? 'Deactivate' : 'Activate'}
            >
              {user.status === 'Active' ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
          </div>
          );
        }}
      />

      {/* Add/Edit User Modal */}
      <AnimatePresence>
        {showUserModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
            onClick={() => setShowUserModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[600px] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <h2 className="heading-md text-charcoal dark:text-dm-text">
                  {editingUser ? 'Edit User' : 'Add New User'}
                </h2>
                <button
                  onClick={() => setShowUserModal(false)}
                  className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:hover:bg-dm-surface-raised"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label text-warm-gray block mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      value={userForm.name || ''}
                      onChange={(e) => setUserForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                      placeholder="Enter full name"
                    />
                  </div>
                  <div>
                    <label className="label text-warm-gray block mb-1.5">Username *</label>
                    <input
                      type="text"
                      value={userForm.username || ''}
                      onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))}
                      className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                      placeholder="Unique username"
                    />
                  </div>
                </div>

                <div>
                  <label className="label text-warm-gray block mb-1.5">Email *</label>
                  <input
                    type="email"
                    value={userForm.email || ''}
                    onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                    placeholder="user@church.ph"
                  />
                </div>

                <div>
                  <label className="label text-warm-gray block mb-1.5">Role *</label>
                  <select
                    value={userForm.role || 'Secretary'}
                    onChange={(e) => setUserForm((p) => ({ ...p, role: e.target.value as User['role'] }))}
                    className="w-full h-10 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  >
                    {Object.keys(roleDescriptions).map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  {userForm.role && (
                    <p className="text-xs text-warm-gray mt-1.5 leading-relaxed">{roleDescriptions[userForm.role]}</p>
                  )}
                </div>

                {!editingUser && (
                  <div>
                    <label className="label text-warm-gray block mb-1.5">Password</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={userForm.username ? `${userForm.username}123` : 'Auto-generated'}
                        readOnly
                        className="flex-1 h-10 px-3 rounded-md border border-parchment bg-cream-dark text-sm text-warm-gray dark:bg-dm-surface dark:border-dm-border"
                      />
                      <span className="text-xs text-warm-gray">User must change on first login</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="label text-warm-gray block mb-1.5">Status</label>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={userForm.status === 'Active'}
                        onChange={() => setUserForm((p) => ({ ...p, status: 'Active' }))}
                        className="accent-gold"
                      />
                      <span className="text-sm text-charcoal dark:text-dm-text">Active</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={userForm.status === 'Inactive'}
                        onChange={() => setUserForm((p) => ({ ...p, status: 'Inactive' }))}
                        className="accent-gold"
                      />
                      <span className="text-sm text-charcoal dark:text-dm-text">Inactive</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
                <button onClick={() => setShowUserModal(false)} className="cos-btn cos-btn-secondary text-sm">
                  Cancel
                </button>
                <button onClick={saveUser} className="cos-btn cos-btn-primary text-sm">
                  <Save className="w-4 h-4" /> {editingUser ? 'Update' : 'Create'} User
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Password Confirmation */}
      <ConfirmationDialog
        isOpen={!!showResetDialog}
        title="Reset Password"
        message={showResetDialog ? `Reset password for ${showResetDialog.name}? A temporary password will be generated.` : ''}
        confirmLabel="Reset Password"
        variant="warning"
        onConfirm={handleResetPassword}
        onCancel={() => setShowResetDialog(null)}
      />

      {/* Show Temporary Password Modal */}
      <AnimatePresence>
        {resetPassword && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
            onClick={() => setResetPassword(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-sm overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-parchment dark:border-dm-border">
                <h2 className="heading-md text-charcoal dark:text-dm-text">Temporary Password</h2>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-warm-gray">The temporary password has been generated. Share it securely with the user.</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-cream-dark dark:bg-dm-surface-rounded px-3 py-2 rounded-lg font-mono text-sm text-charcoal dark:text-dm-text">
                    {resetPassword}
                  </code>
                  <button
                    onClick={() => copyToClipboard(resetPassword)}
                    className="cos-btn cos-btn-primary text-xs"
                  >
                    {copiedPw ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedPw ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-warning">User must change this password on next login.</p>
              </div>
              <div className="px-6 py-4 border-t border-parchment dark:border-dm-border flex justify-end">
                <button onClick={() => setResetPassword(null)} className="cos-btn cos-btn-secondary text-sm">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Deactivate/Activate Confirmation */}
      <ConfirmationDialog
        isOpen={!!showDeactivateDialog}
        title={showDeactivateDialog?.status === 'Active' ? 'Deactivate User' : 'Activate User'}
        message={showDeactivateDialog
          ? `${showDeactivateDialog.status === 'Active' ? 'Deactivate' : 'Activate'} user "${showDeactivateDialog.name}"?`
          : ''}
        confirmLabel={showDeactivateDialog?.status === 'Active' ? 'Deactivate' : 'Activate'}
        variant={showDeactivateDialog?.status === 'Active' ? 'warning' : 'info'}
        onConfirm={() => showDeactivateDialog && handleToggleStatus(showDeactivateDialog)}
        onCancel={() => setShowDeactivateDialog(null)}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
//  SECTION 6: AUDIT LOG
// ═════════════════════════════════════════════════════════════════

function AuditLogSection() {
  const [filters, setFilters] = useState({
    user: '',
    action: '',
    table: '',
    search: '',
  });
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  const allUsers = useMemo(() => {
    const names = new Set(auditLogData.map((l) => l.user));
    return Array.from(names);
  }, []);

  const allActions = useMemo(() => {
    const acts = new Set(auditLogData.map((l) => l.action));
    return Array.from(acts);
  }, []);

  const allTables = useMemo(() => {
    const tables = new Set(auditLogData.map((l) => l.table));
    return Array.from(tables);
  }, []);

  const filteredLogs = useMemo(() => {
    return auditLogData.filter((log) => {
      if (filters.user && log.user !== filters.user) return false;
      if (filters.action && log.action !== filters.action) return false;
      if (filters.table && log.table !== filters.table) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        return (
          log.user.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.details.toLowerCase().includes(q) ||
          log.recordId.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [filters]);

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const columns = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      sortable: true,
      width: '140px',
      render: (row: AuditLogEntry) => (
        <span className="mono-sm text-warm-gray">{formatTimestamp(row.timestamp)}</span>
      ),
    },
    {
      key: 'user',
      header: 'User',
      render: (row: AuditLogEntry) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center text-[10px] font-semibold text-gold">
            {row.user.split(' ').map((n) => n[0]).join('').slice(0, 2)}
          </div>
          <span className="text-sm text-charcoal dark:text-dm-text">{row.user}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '100px',
      render: (row: AuditLogEntry) => (
        <span className={cn('cos-badge text-xs', actionBadgeColors[row.action] || 'cos-badge-default')}>
          {row.action}
        </span>
      ),
    },
    {
      key: 'table',
      header: 'Table',
      width: '100px',
    },
    {
      key: 'recordId',
      header: 'Record ID',
      width: '120px',
      render: (row: AuditLogEntry) => (
        <span className="mono-sm text-info">{row.recordId}</span>
      ),
    },
    {
      key: 'details',
      header: 'Details',
      render: (row: AuditLogEntry) => (
        <span className="text-sm text-charcoal dark:text-dm-text">{row.details}</span>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP Address',
      width: '110px',
      render: (row: AuditLogEntry) => (
        <span className="mono-sm text-warm-gray">{row.ipAddress}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="heading-lg text-charcoal dark:text-dm-text">Audit Log</h2>
        <span className="text-xs text-warm-gray">{filteredLogs.length} entries</span>
      </div>

      {/* Filters Toolbar */}
      <div className="cos-card py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
            <input
              type="text"
              placeholder="Search..."
              value={filters.search}
              onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
              className="h-9 w-48 pl-9 pr-3 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
            />
          </div>

          <select
            value={filters.user}
            onChange={(e) => setFilters((p) => ({ ...p, user: e.target.value }))}
            className="h-9 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
          >
            <option value="">All Users</option>
            {allUsers.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>

          <select
            value={filters.action}
            onChange={(e) => setFilters((p) => ({ ...p, action: e.target.value }))}
            className="h-9 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
          >
            <option value="">All Actions</option>
            {allActions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          <select
            value={filters.table}
            onChange={(e) => setFilters((p) => ({ ...p, table: e.target.value }))}
            className="h-9 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
          >
            <option value="">All Tables</option>
            {allTables.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {(filters.user || filters.action || filters.table || filters.search) && (
            <button
              onClick={() => setFilters({ user: '', action: '', table: '', search: '' })}
              className="text-xs text-gold hover:text-gold-light transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns as Column<Record<string, unknown>>[]}
        data={filteredLogs as unknown as Record<string, unknown>[]}
        pageSize={25}
        onRowClick={(row) => setSelectedLog(row as unknown as AuditLogEntry)}
      />

      {/* Log Detail Modal */}
      <AnimatePresence>
        {selectedLog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
            onClick={() => setSelectedLog(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <h2 className="heading-md text-charcoal dark:text-dm-text">Log Entry Details</h2>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:hover:bg-dm-surface-raised"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="label text-warm-gray">Timestamp</span>
                    <p className="mono-sm text-charcoal dark:text-dm-text">{formatTimestamp(selectedLog.timestamp)}</p>
                  </div>
                  <div>
                    <span className="label text-warm-gray">User</span>
                    <p className="text-charcoal dark:text-dm-text">{selectedLog.user}</p>
                  </div>
                  <div>
                    <span className="label text-warm-gray">Action</span>
                    <span className={cn('cos-badge text-xs mt-1 inline-block', actionBadgeColors[selectedLog.action] || 'cos-badge-default')}>
                      {selectedLog.action}
                    </span>
                  </div>
                  <div>
                    <span className="label text-warm-gray">Table</span>
                    <p className="text-charcoal dark:text-dm-text">{selectedLog.table}</p>
                  </div>
                  <div>
                    <span className="label text-warm-gray">Record ID</span>
                    <p className="mono-sm text-info">{selectedLog.recordId}</p>
                  </div>
                  <div>
                    <span className="label text-warm-gray">IP Address</span>
                    <p className="mono-sm text-warm-gray">{selectedLog.ipAddress}</p>
                  </div>
                </div>

                <div>
                  <span className="label text-warm-gray">Details</span>
                  <p className="text-sm text-charcoal dark:text-dm-text mt-1 bg-cream dark:bg-dm-surface-raised p-3 rounded-lg">
                    {selectedLog.details}
                  </p>
                </div>

                {/* Show changes if update */}
                {selectedLog.changes && selectedLog.changes.length > 0 && (
                  <div>
                    <span className="label text-warm-gray">Changes</span>
                    <div className="mt-1 space-y-2">
                      {selectedLog.changes.map((change, i) => (
                        <div key={i} className="bg-cream dark:bg-dm-surface-raised p-3 rounded-lg">
                          <p className="text-sm font-medium text-charcoal dark:text-dm-text mb-1">{change.field}</p>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-error line-through">{change.oldValue}</span>
                            <span className="text-warm-gray">→</span>
                            <span className="text-success font-medium">{change.newValue}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-parchment dark:border-dm-border flex justify-end">
                <button onClick={() => setSelectedLog(null)} className="cos-btn cos-btn-secondary text-sm">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════
//  SECTION 7: GUIDED TOURS
// ═════════════════════════════════════════════════════════════════

function GuidedToursSection() {
  const [toursDisabled, setToursDisabled] = useState(() => areAllToursDisabled());
  const [resetting, setResetting] = useState(false);

  // Get current user's role from parish config
  const userRole = 'Secretary'; // Default; in a real app this comes from auth context
  const availableTours = getAvailableTours(userRole);

  const handleToggleTours = () => {
    const newValue = !toursDisabled;
    setAllToursDisabled(newValue);
    setToursDisabled(newValue);
  };

  const handleResetAll = () => {
    resetTourProgress();
    setResetting(true);
    setTimeout(() => setResetting(false), 2000);
  };

  const handleStartTour = (tour: TourConfig) => {
    // Start the tour via the global handler set up in App.tsx.
    // App.tsx defines it as (steps, id) — pass in that order.
    const startFn = (window as unknown as Record<string, unknown>).__startChurchOSTour;
    if (typeof startFn === 'function') {
      (startFn as (steps: Step[], id: string) => void)(tour.steps, tour.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="heading-lg text-charcoal dark:text-dm-text">Guided Tours</h2>
      </div>

      {/* Description Card */}
      <div className="cos-card bg-gold-glow/50 border border-gold/20">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center shrink-0">
            <HelpCircle className="w-5 h-5 text-gold" />
          </div>
          <div>
            <h3 className="heading-sm text-charcoal dark:text-dm-text mb-1">
              Interactive Step-by-Step Guides
            </h3>
            <p className="body-sm text-warm-gray dark:text-dm-text-muted leading-relaxed">
              These friendly walkthroughs help new staff members learn the system at their own pace.
              Think of them like having a patient colleague sitting right beside you. Perfect for
              anyone who\u2019s feeling a bit nervous about using new technology!
            </p>
          </div>
        </div>
      </div>

      {/* Master Toggle */}
      <div className="cos-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
              <Settings className="w-4 h-4 text-success" />
            </div>
            <div>
              <h3 className="font-medium text-charcoal dark:text-dm-text">Enable Guided Tours</h3>
              <p className="body-sm text-warm-gray">
                {toursDisabled
                  ? 'Tours are turned off. New staff won\u2019t see walkthroughs.'
                  : 'Tours are on. Staff will see walkthroughs for new features.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleTours}
            className={cn(
              'relative w-14 h-7 rounded-full transition-colors duration-200',
              toursDisabled ? 'bg-warm-gray/30' : 'bg-gold'
            )}
            role="switch"
            aria-checked={!toursDisabled}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow-sm transition-transform duration-200',
                toursDisabled ? 'translate-x-0' : 'translate-x-7'
              )}
            />
          </button>
        </div>
      </div>

      {/* Restart All Tours */}
      <div className="cos-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-info/10 flex items-center justify-center">
              <ResetIcon className="w-4 h-4 text-info" />
            </div>
            <div>
              <h3 className="font-medium text-charcoal dark:text-dm-text">Restart All Tours</h3>
              <p className="body-sm text-warm-gray">
                Reset all tour progress. Every tour will show again as if it\u2019s the first time.
              </p>
            </div>
          </div>
          <button
            onClick={handleResetAll}
            className="cos-btn cos-btn-secondary text-sm"
          >
            {resetting ? (
              <>
                <Check className="w-4 h-4" /> Reset Done
              </>
            ) : (
              <>
                <ResetIcon className="w-4 h-4" /> Reset All
              </>
            )}
          </button>
        </div>
      </div>

      {/* Available Tours List */}
      <h3 className="heading-sm text-charcoal dark:text-dm-text pt-2">Available Tours</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {availableTours.map((tour) => {
          const status = getTourStatus(tour.id);
          const isCompleted = status.completed;
          const isSkipped = status.skipped;

          return (
            <motion.div
              key={tour.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="cos-card cos-card-hover"
            >
              <div className="flex items-start justify-between mb-3">
                <h4 className="font-semibold text-charcoal dark:text-dm-text text-sm">
                  {tour.title}
                </h4>
                {isCompleted && (
                  <span className="cos-badge cos-badge-success text-[10px]">Completed</span>
                )}
                {isSkipped && (
                  <span className="cos-badge cos-badge-default text-[10px]">Skipped</span>
                )}
                {!isCompleted && !isSkipped && (
                  <span className="cos-badge cos-badge-info text-[10px]">New</span>
                )}
              </div>
              <p className="body-sm text-warm-gray dark:text-dm-text-muted mb-4 leading-relaxed">
                {tour.description}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-warm-gray/70">
                  {tour.steps.length} steps &middot; For: {tour.targetRoles.join(', ')}
                </span>
                <button
                  onClick={() => handleStartTour(tour)}
                  disabled={toursDisabled}
                  className={cn(
                    'cos-btn text-sm flex items-center gap-1.5',
                    toursDisabled
                      ? 'bg-warm-gray/20 text-warm-gray/50 cursor-not-allowed'
                      : 'cos-btn-primary'
                  )}
                >
                  <Play className="w-3.5 h-3.5" />
                  {isCompleted ? 'Retake Tour' : 'Take Tour'}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════
//  MAIN SETTINGS PAGE
// ═════════════════════════════════════════════════════════════════

// ── Backup & restore (desktop only) ──
interface BackupFile { name: string; path: string; size: number; mtime: number }
interface BackupBridge {
  now(): Promise<{ ok: boolean; path?: string; error?: string }>;
  list(): Promise<BackupFile[]>;
  openFolder(): Promise<{ ok: boolean }>;
  export(): Promise<{ ok: boolean; path?: string; error?: string }>;
  restore(): Promise<{ ok: boolean; error?: string }>;
}
function backupBridge(): BackupBridge | null {
  const w = window as unknown as { churchos?: { backup?: BackupBridge } };
  return w.churchos?.backup ?? null;
}

interface UpdateStatus { state: string; version?: string; percent?: number; message?: string }
interface SysBridge {
  appVersion(): Promise<string>;
  update: {
    check(): Promise<unknown>;
    status(): Promise<UpdateStatus>;
    install(): Promise<unknown>;
    onEvent(cb: (d: UpdateStatus) => void): () => void;
  };
}
function sysBridge(): SysBridge | null {
  const w = window as unknown as { churchos?: SysBridge & { update?: unknown } };
  return w.churchos?.update ? (w.churchos as unknown as SysBridge) : null;
}
interface SyncStatus { configured: boolean; url: string; email: string; lastSyncAt: string | null; state: string; message?: string }
interface SyncBridge {
  status(): Promise<SyncStatus>;
  config(patch: Record<string, string>): Promise<SyncStatus>;
  now(): Promise<SyncStatus>;
}
function syncBridge(): SyncBridge | null {
  const w = window as unknown as { churchos?: { sync?: SyncBridge } };
  return w.churchos?.sync ?? null;
}

const UPDATE_TEXT: Record<string, string> = {
  idle: 'ChurchOS checks for updates automatically.',
  dev: 'Updates run only in the installed app.',
  checking: 'Checking for updates…',
  available: 'Update found — downloading…',
  downloading: 'Downloading update…',
  'up-to-date': 'You have the latest version.',
  downloaded: 'An update is ready — restart to apply it.',
  error: "Couldn't check for updates (no connection?).",
  unavailable: 'Auto-update is not available in this build.',
};
const fmtSize = (n: number) => (n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
const fmtWhen = (ms: number) => new Date(ms).toLocaleString();

function BackupSection() {
  const bridge = useMemo(() => backupBridge(), []);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const sys = useMemo(() => sysBridge(), []);
  const [version, setVersion] = useState('');
  const [upd, setUpd] = useState<UpdateStatus>({ state: 'idle' });

  const refresh = async () => { if (bridge) setBackups(await bridge.list()); };
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => {
    if (!sys) return;
    sys.appVersion().then(setVersion).catch(() => {});
    sys.update.status().then(setUpd).catch(() => {});
    const off = sys.update.onEvent((d) => setUpd(d));
    return () => { if (off) off(); };
  }, [sys]);

  const sync = useMemo(() => syncBridge(), []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncForm, setSyncForm] = useState({ url: '', anonKey: '', email: '', password: '' });
  useEffect(() => {
    if (!sync) return;
    sync.status().then((s) => { setSyncStatus(s); setSyncForm((f) => ({ ...f, url: s.url || '', email: s.email || '' })); }).catch(() => {});
  }, [sync]);
  const inp = 'h-9 px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text';

  if (!bridge) {
    return (
      <div className="cos-card">
        <h2 className="heading-lg text-charcoal dark:text-dm-text mb-2">Data Backup</h2>
        <p className="body-sm text-warm-gray">Automatic backups are available in the ChurchOS desktop app.</p>
      </div>
    );
  }

  const run = async (fn: () => Promise<{ ok: boolean; error?: string; path?: string }>, okText: string) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fn();
      if (r.ok) { setMsg({ kind: 'ok', text: r.path ? `${okText} → ${r.path}` : okText }); await refresh(); }
      else if (r.error !== 'canceled') setMsg({ kind: 'err', text: `Could not complete: ${r.error}` });
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="heading-lg text-charcoal dark:text-dm-text">Data Backup</h2>
        <p className="body-sm text-warm-gray mt-0.5">
          Your whole parish is one file. ChurchOS backs it up automatically each day it runs — and you can make a copy any time.
        </p>
      </div>

      {msg && (
        <div className={cn('rounded-md px-3 py-2.5 text-sm', msg.kind === 'ok' ? 'bg-success/10 text-success' : 'bg-error/10 text-error')}>
          {msg.text}
        </div>
      )}

      <div className="cos-card flex flex-wrap gap-3">
        <button disabled={busy} onClick={() => run(() => bridge.now(), 'Backup saved')} className="cos-btn cos-btn-primary text-sm">
          <Save className="w-4 h-4" /> Back Up Now
        </button>
        <button disabled={busy} onClick={() => run(() => bridge.export(), 'Copy saved')} className="cos-btn cos-btn-secondary text-sm">
          <Download className="w-4 h-4" /> Save a Copy (USB…)
        </button>
        <button disabled={busy} onClick={() => run(() => bridge.restore(), 'Restoring…')} className="cos-btn cos-btn-secondary text-sm">
          <Upload className="w-4 h-4" /> Restore from Backup…
        </button>
        <button disabled={busy} onClick={() => bridge.openFolder()} className="cos-btn cos-btn-secondary text-sm">
          <FolderOpen className="w-4 h-4" /> Open Backup Folder
        </button>
      </div>

      <div className="cos-card">
        <h3 className="font-semibold text-sm text-charcoal dark:text-dm-text mb-3">
          Recent backups {backups.length > 0 && <span className="text-warm-gray font-normal">({backups.length})</span>}
        </h3>
        {backups.length === 0 ? (
          <p className="body-sm text-warm-gray">No backups yet — click “Back Up Now”.</p>
        ) : (
          <div className="space-y-1.5">
            {backups.map((b) => (
              <div key={b.path} className="flex items-center justify-between text-sm border-t border-parchment/40 first:border-0 py-1.5">
                <span className="text-charcoal dark:text-dm-text">{fmtWhen(b.mtime)}</span>
                <span className="text-warm-gray font-mono text-xs">{fmtSize(b.size)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-warm-gray mt-3">
          Restoring replaces today’s data with the chosen backup. ChurchOS snapshots the current data first, then restarts.
        </p>
      </div>

      <div className="cos-card">
        <h3 className="font-semibold text-sm text-charcoal dark:text-dm-text mb-1">App Version &amp; Updates</h3>
        <p className="body-sm text-warm-gray mb-3">
          {version ? `ChurchOS v${version}` : 'ChurchOS'} — {UPDATE_TEXT[upd.state] || ''}
          {upd.state === 'downloading' && typeof upd.percent === 'number' ? ` ${upd.percent}%` : ''}
          {(upd.state === 'available' || upd.state === 'downloaded') && upd.version ? ` (v${upd.version})` : ''}
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            disabled={upd.state === 'checking' || upd.state === 'downloading'}
            onClick={() => { setUpd({ state: 'checking' }); sys?.update.check(); }}
            className="cos-btn cos-btn-secondary text-sm"
          >
            <RotateCcw className="w-4 h-4" /> Check for Updates
          </button>
          {upd.state === 'downloaded' && (
            <button onClick={() => sys?.update.install()} className="cos-btn cos-btn-primary text-sm">
              <Download className="w-4 h-4" /> Restart &amp; Update
            </button>
          )}
        </div>
      </div>

      {sync && (
        <div className="cos-card">
          <h3 className="font-semibold text-sm text-charcoal dark:text-dm-text mb-1">Cloud Sync (Diocese)</h3>
          <p className="body-sm text-warm-gray mb-3">
            ChurchOS works fully offline. Connect your diocese cloud account to send this parish’s data up for the diocese roll-up — it syncs whenever you’re online.
            {syncStatus?.lastSyncAt && <span className="text-success"> Last synced {new Date(syncStatus.lastSyncAt).toLocaleString()}.</span>}
          </p>
          {syncStatus?.message && (
            <div className={cn('rounded-md px-3 py-2 text-sm mb-3', syncStatus.state === 'ok' ? 'bg-success/10 text-success' : syncStatus.state === 'error' ? 'bg-error/10 text-error' : 'bg-gold/10 text-charcoal dark:text-dm-text')}>
              {syncStatus.message}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <input value={syncForm.url} onChange={(e) => setSyncForm((f) => ({ ...f, url: e.target.value }))} placeholder="Cloud URL (https://…supabase.co)" className={inp} />
            <input value={syncForm.anonKey} onChange={(e) => setSyncForm((f) => ({ ...f, anonKey: e.target.value }))} placeholder="Anon key" className={inp} />
            <input value={syncForm.email} onChange={(e) => setSyncForm((f) => ({ ...f, email: e.target.value }))} placeholder="Parish cloud email" className={inp} autoCapitalize="none" />
            <input type="password" value={syncForm.password} onChange={(e) => setSyncForm((f) => ({ ...f, password: e.target.value }))} placeholder="Parish cloud password" className={inp} />
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={async () => { const s = await sync.config(syncForm); setSyncStatus(s); }} className="cos-btn cos-btn-secondary text-sm">Save Connection</button>
            <button
              disabled={!syncStatus?.configured || syncStatus?.state === 'syncing'}
              onClick={async () => { setSyncStatus((s) => (s ? { ...s, state: 'syncing', message: 'Syncing…' } : s)); setSyncStatus(await sync.now()); }}
              className="cos-btn cos-btn-primary text-sm"
            >
              <Database className="w-4 h-4" /> Sync Now
            </button>
          </div>
          <p className="text-xs text-warm-gray mt-3">Your records stay on this PC. Sync only sends them up — the diocese sees the roll-up and can’t edit your parish’s records.</p>
        </div>
      )}
    </div>
  );
}

const settingsNavItems = [
  { id: 'parish', label: 'Parish Info', icon: Church },
  { id: 'mass', label: 'Mass Schedule', icon: Clock },
  { id: 'fees', label: 'Fee Schedule', icon: DollarSign },
  { id: 'templates', label: 'Certificate Templates', icon: FileText },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'data', label: 'Backup', icon: Database },
  { id: 'audit', label: 'Audit Log', icon: ClipboardList },
  { id: 'tours', label: 'Guided Tours', icon: HelpCircle },
];

type SettingsTab = 'parish' | 'mass' | 'fees' | 'templates' | 'users' | 'data' | 'audit' | 'tours';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('parish');
  const [parishInfo, setParishInfo] = useState<ParishInfo>(() => {
    const cfg = getParishConfig();
    return {
      parishName: cfg.parishName || defaultParishInfo.parishName,
      diocese: cfg.diocese || defaultParishInfo.diocese,
      parishPriest: cfg.parishPriest || defaultParishInfo.parishPriest,
      feastDay: cfg.feastDay || defaultParishInfo.feastDay,
      yearEstablished: cfg.yearEstablished || defaultParishInfo.yearEstablished,
      address: cfg.address || defaultParishInfo.address,
      contactNumber: cfg.contactNumber || defaultParishInfo.contactNumber,
      email: cfg.email || defaultParishInfo.email,
      website: cfg.website || defaultParishInfo.website,
      facebook: cfg.facebook || defaultParishInfo.facebook,
      currency: cfg.currency || defaultParishInfo.currency,
      timezone: cfg.timezone || defaultParishInfo.timezone,
      // dateFormat is not part of the shared ParishConfig type, but it is
      // persisted alongside it in the same config blob; read it back here so
      // the saved choice survives reloads instead of always resetting.
      dateFormat: (cfg as { dateFormat?: string }).dateFormat || defaultParishInfo.dateFormat,
      language: cfg.language || defaultParishInfo.language,
    };
  });

  const handleParishInfoChange = (info: ParishInfo) => {
    setParishInfo(info);
    // Persist to global config
    const configUpdate: Partial<ParishConfig> = {
      parishName: info.parishName,
      diocese: info.diocese,
      parishPriest: info.parishPriest,
      feastDay: info.feastDay,
      yearEstablished: info.yearEstablished,
      address: info.address,
      contactNumber: info.contactNumber,
      email: info.email,
      website: info.website,
      facebook: info.facebook,
      currency: info.currency,
      timezone: info.timezone,
      language: info.language,
    };
    // dateFormat isn't in the ParishConfig type but is persisted in the same
    // blob (getParishConfig spreads any extra keys back out), so the user's
    // Date Format selection is actually saved rather than silently discarded.
    setParishConfig({ ...configUpdate, dateFormat: info.dateFormat } as Partial<ParishConfig>);
  };

  const renderSection = () => {
    switch (activeTab) {
      case 'parish':
        return <ParishInfoSection data={parishInfo} onChange={handleParishInfoChange} />;
      case 'mass':
        return <MassScheduleSection />;
      case 'fees':
        return <FeeScheduleSection />;
      case 'templates':
        return <CertificateTemplatesSection />;
      case 'users':
        return <UserManagementSection />;
      case 'data':
        return <BackupSection />;
      case 'audit':
        return <AuditLogSection />;
      case 'tours':
        return <GuidedToursSection />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="display-md text-charcoal dark:text-dm-text">Settings</h1>
          <p className="body-sm text-warm-gray mt-0.5">
            Configure parish information, manage users, edit certificate templates, and view audit logs.
          </p>
        </div>
      </div>

      {/* Settings Layout: Sub-nav + Content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sub-Navigation */}
        <nav className="w-full lg:w-[200px] flex-shrink-0">
          <div className="cos-card p-2 space-y-1">
            {/* Section: General */}
            <div className="px-3 py-1.5">
              <span className="label text-warm-gray/60">General</span>
            </div>
            {settingsNavItems.slice(0, 3).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsTab)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left',
                  activeTab === item.id
                    ? 'bg-gold-glow text-gold border-l-[3px] border-gold'
                    : 'text-charcoal hover:bg-cream-dark dark:text-dm-text dark:hover:bg-dm-surface-raised border-l-[3px] border-transparent',
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}

            {/* Divider */}
            <div className="my-1 border-t border-parchment/40 dark:border-dm-border" />

            {/* Section: Sacraments */}
            <div className="px-3 py-1.5">
              <span className="label text-warm-gray/60">Sacraments</span>
            </div>
            {settingsNavItems.slice(3, 4).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsTab)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left',
                  activeTab === item.id
                    ? 'bg-gold-glow text-gold border-l-[3px] border-gold'
                    : 'text-charcoal hover:bg-cream-dark dark:text-dm-text dark:hover:bg-dm-surface-raised border-l-[3px] border-transparent',
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}

            {/* Divider */}
            <div className="my-1 border-t border-parchment/40 dark:border-dm-border" />

            {/* Section: Administration */}
            <div className="px-3 py-1.5">
              <span className="label text-warm-gray/60">Administration</span>
            </div>
            {settingsNavItems.slice(4).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as SettingsTab)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left',
                  activeTab === item.id
                    ? 'bg-gold-glow text-gold border-l-[3px] border-gold'
                    : 'text-charcoal hover:bg-cream-dark dark:text-dm-text dark:hover:bg-dm-surface-raised border-l-[3px] border-transparent',
                )}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          <AnimatePresence>
            <motion.div
              key={activeTab}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
            >
              {renderSection()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
