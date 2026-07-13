import { useState, useRef, useCallback, useMemo, useEffect, type ChangeEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Droplets,
  Heart,
  Flame,
  Cross,
  Search,
  Plus,
  Filter,
  Download,
  Printer,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  FileText,
  Save,
  Code,
  RotateCcw,
  Copy,
  Check,
  AlertCircle,
  Calendar,
  PartyPopper,
  User,
  Users,
  Clock,
  MapPin,
  Sparkles,
  Archive,
  Link2,
  Ban,
  ClipboardCheck,
  CheckCircle2,
  Upload,
  Image as ImageIcon,
} from 'lucide-react';
import DataTable from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import CertificateDesignEditor from '@/components/CertificateDesignEditor';
import HelpTooltip from '@/components/HelpTooltip';
import { getLabel } from '@/lib/friendlyLabels';
import EmptyState from '@/components/EmptyState';
import {
  type BaptismRecord,
  type MarriageRecord,
  type ConfirmationRecord,
  type DeathRecord,
  type RegistryRecord,
  type RegistryAnnotation,
  type RegistryAnnotationType,
  type SoftDeletable,
  type RecordLifecycleStatus,
  recordStatus,
  isOverdueScheduled,
  baptismRecords,
  marriageRecords,
  confirmationRecords,
  deathRecords,
  officiants,
  baptismLocations,
  marriageLocations,
  confirmationLocations,
  burialLocations,
  baptismTimes,
  marriageTimes,
  confirmationTimes,
  burialTimes,
  certificateTemplates,
  certificateTokensByType,
  replaceTokens,
  escapeHtml,
  COPY_WATERMARK_HTML,
  liveOnly,
  softDelete,
  addAnnotation,
  buildAutoAnnotation,
  newAnnotationId,
  findBaptismCandidates,
  resolveBaptismForAnnotation,
  annotationReferencesRecord,
  buildArchiveCorrectionAnnotation,
  voidAnnotation,
  newlyVoidedAnnotations,
  buildRegistryCalendarEvent,
  annotateEventWithSchedulingRules,
  templateFromUpload,
  loadCertificateTemplates,
  saveCertificateTemplates,
  appendRegistryAudit,
  type CertificateSacrament,
} from '@/lib/registryData';
import { SAMPLE_EVENTS, type CalendarEvent } from '@/lib/calendarData';
import { getActiveVenues, isMultiVenue, type Venue } from '@/lib/venues';
import {
  findConflicts,
  suggestFreeVenues,
  parseTimeToMinutes,
  isLiturgicallyBlocked,
  type BusyInterval,
  type VenueSuggestion,
  type CalendarEventLike,
} from '@/lib/scheduling';
import { getCertificateTokens, getCurrencySymbol, getParishName } from '@/lib/parishConfig';
import { clergyNames } from '@/lib/clergy';
import {
  BARANGAYS,
  SITIOS,
  CITIES,
  PROVINCES,
  buildParishionerLookupFrom,
  linkSacramentToRegistry,
  families as seedFamilies,
  type Family,
  type ParishionerLookup,
  type SacramentLinkEntry,
} from '@/lib/directoryData';
import type { FeeScheduleItem } from '@/lib/feeSchedule';
import { getFeeForSacrament } from '@/lib/feeSchedule';
import { celebrateFirstAction, celebrateMilestone } from '@/components/FirstRunDetector';
import { usePersistedState } from '@/hooks/usePersistedState';
import { KEYS } from '@/lib/storageKeys';
import * as ns from '@/lib/storageNamespaced';
import { getCurrentUserName } from '@/lib/session';
import { todayISO } from '@/lib/massIntentions';
import { getSacramentInfo, buildAckSummary, type RequirementKind } from '@/lib/sacramentRequirements';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type SacramentTab = 'baptism' | 'marriage' | 'confirmation' | 'death';
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface TabConfig {
  key: SacramentTab;
  label: string;
  icon: React.ElementType;
  color: string;
  /** Lightened accent for dark mode — the raw sacrament colors (charcoal, maroon) are too dark on a dark surface. */
  darkColor: string;
  count: number;
}

interface AvailabilityResult {
  available: boolean;
  conflicts: Array<{ type: 'priest' | 'location' | 'rule'; description: string }>;
}

type PaymentStatus = 'collected' | 'collect_now' | 'waived' | 'bill_later';

interface PaymentInfo {
  status: PaymentStatus;
  amount: number;
  method: 'Cash' | 'Check' | 'GCash' | 'Bank Transfer';
  receiptNumber: string;
  date: string;
  receivedBy: string;
  waiveReason: string;
  waiveApprovedBy: string;
  dueDate: string;
  overrideReason: string; // Required for 'collected' | 'waived' | 'bill_later' — prevents abuse
}

interface JournalEntry {
  id: string;
  date: string;
  reference: string;
  description: string;
  lines: { accountCode: string; accountName: string; debit: number; credit: number }[];
}

interface AccountsReceivableEntry {
  date: string;
  description: string;
  lines: { accountCode: string; accountName: string; debit: number; credit: number }[];
}

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */
const tabs = (b: number, m: number, c: number, d: number): TabConfig[] => [
  { key: 'baptism', label: 'Baptism', icon: Droplets, color: '#2D6A4F', darkColor: '#5FBF95', count: b },
  { key: 'marriage', label: 'Marriage', icon: Heart, color: '#6B2737', darkColor: '#D98BA0', count: m },
  { key: 'confirmation', label: 'Confirmation', icon: Flame, color: '#C9963B', darkColor: '#E3C06B', count: c },
  { key: 'death', label: 'Death / Funeral', icon: Cross, color: '#3D3A36', darkColor: '#B8B2A8', count: d },
];

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */
function formatDate(d: string) {
  if (!d) return '';
  const x = new Date(d + 'T00:00:00');
  return x.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    Active: 'cos-badge-success',
    Cancelled: 'cos-badge-error',
    Annotated: 'cos-badge-warning',
    Annulled: 'cos-badge-error',
    Dispensed: 'cos-badge-info',
  };
  return map[status] || 'cos-badge-default';
}

/* Lifecycle badge — Solemnized (green/official), Scheduled (amber/neutral),
   Cancelled (red, de-emphasized). Reuses the cos-badge palette. Separate from
   the canonical `status` badge above. */
const LIFECYCLE_BADGE: Record<RecordLifecycleStatus, string> = {
  solemnized: 'cos-badge-success',
  scheduled: 'cos-badge-warning',
  cancelled: 'cos-badge-error',
};
const LIFECYCLE_LABEL: Record<RecordLifecycleStatus, string> = {
  solemnized: 'Solemnized',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
};

/** Renders a record's lifecycle badge. An overdue scheduled record (ceremony
 *  date passed, still not closed out) gets a distinct "Needs status" chip rather
 *  than the plain amber Scheduled badge. */
function LifecycleBadge({ record }: { record: RegistryRecord }) {
  const st = recordStatus(record);
  if (st === 'scheduled' && isOverdueScheduled(record)) {
    return (
      <span className="cos-badge cos-badge-error inline-flex items-center gap-1" title="Ceremony date has passed — mark solemnized or cancelled">
        <AlertCircle className="w-3 h-3" />
        Needs status
      </span>
    );
  }
  return (
    <span className={`cos-badge ${LIFECYCLE_BADGE[st]} ${st === 'cancelled' ? 'opacity-70' : ''}`}>
      {LIFECYCLE_LABEL[st]}
    </span>
  );
}

function genId(prefix: string) {
  return `${prefix}-${Date.now()}`;
}

/* Officiant picker options: the active clergy full names (managed in Settings),
   which are exactly the strings the ICS schedule export matches on. TOLERANT:
   if a record/schedule already carries an officiant that isn't in the clergy
   list (a legacy free-text value, or a since-deactivated priest), it is kept as
   a selectable option so editing an old record never blanks or drops it. */
function officiantOptions(current?: string): string[] {
  const names = clergyNames();
  const cur = (current || '').trim();
  if (cur && !names.some((n) => n.toLowerCase() === cur.toLowerCase())) {
    return [cur, ...names];
  }
  return names;
}

function checkAvailability(date: string, time: string, off: string, loc: string, _type: SacramentTab): AvailabilityResult {
  const conflicts: AvailabilityResult['conflicts'] = [];
  const day = new Date(date + 'T00:00:00').getDay();

  // Rule: No baptisms/confirmations on Sundays (day === 0)
  if ((day === 0) && (_type === 'baptism' || _type === 'confirmation')) {
    conflicts.push({ type: 'rule', description: 'Sundays are not allowed for baptisms or confirmations' });
  }

  // Rule: No marriages during Lent (simplified: March 5 - April 19)
  if (_type === 'marriage') {
    const m = new Date(date + 'T00:00:00').getMonth();
    const d = new Date(date + 'T00:00:00').getDate();
    if ((m === 2 && d >= 5) || (m === 3 && d <= 19)) {
      conflicts.push({ type: 'rule', description: 'Weddings are prohibited during the Lenten season' });
    }
    // Preferred: Saturday
    const dow = new Date(date + 'T00:00:00').getDay();
    if (dow === 6) {
      // This is just a positive note, not a conflict
    }
  }

  // Simulated priest conflicts
  if (date && time && off) {
    const seed = date.charCodeAt(date.length - 1) + time.charCodeAt(0) + off.charCodeAt(off.length - 1);
    if (seed % 7 === 0) {
      conflicts.push({ type: 'priest', description: `${off} is already assigned to a ${off === 'Fr. Reyes' ? 'Mass' : 'service'} at ${time}` });
    }
    if (seed % 11 === 0) {
      conflicts.push({ type: 'location', description: `${loc} is booked for another ceremony at ${time}` });
    }
  }

  return { available: conflicts.length === 0, conflicts };
}

/* ------------------------------------------------------------------ */
/*  Toast hook                                                         */
/* ------------------------------------------------------------------ */
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = genId('toast');
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  return { toasts, addToast, removeToast };
}

/* ------------------------------------------------------------------ */
/*  GL / Journal helpers                                               */
/* ------------------------------------------------------------------ */
function addToJournal(entry: JournalEntry) {
  const existing = ns.getJSON<JournalEntry[]>(KEYS.journalEntries, []);
  existing.push(entry);
  ns.setJSON(KEYS.journalEntries, existing);
}

function addToAccountsReceivable(entry: AccountsReceivableEntry) {
  const existing = ns.getJSON<(AccountsReceivableEntry & { id: string; createdAt: string })[]>(KEYS.accountsReceivable, []);
  existing.push({ ...entry, id: `ar-${Date.now()}`, createdAt: new Date().toISOString() });
  ns.setJSON(KEYS.accountsReceivable, existing);
}

/* ── Fee Override Audit Log (tamper-evident hash chain) ── */
interface FeeOverrideAuditEntry {
  id: string;
  timestamp: string;
  sacrament: string;
  registryId: string;
  personName: string;
  overrideType: 'collected' | 'waived' | 'bill_later';
  amount: number;
  reason: string;
  recordedBy: string;
  prevHash: string;
  hash: string;
}

// Lightweight non-cryptographic hash — enough to make silent edits/
// deletions of the audit trail detectable when the chain is verified.
function auditHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function logFeeOverride(entry: Omit<FeeOverrideAuditEntry, 'id' | 'timestamp' | 'prevHash' | 'hash'>) {
  const existing = ns.getJSON<FeeOverrideAuditEntry[]>(KEYS.feeOverrideAudit, []);
  const prevHash = existing.length ? existing[existing.length - 1].hash : 'genesis';
  const base = {
    ...entry,
    recordedBy: entry.recordedBy || getCurrentUserName(),
    id: `foa-${Date.now()}`,
    timestamp: new Date().toISOString(),
    prevHash,
  };
  const hash = auditHash(prevHash + JSON.stringify(base));
  existing.push({ ...base, hash });
  ns.setJSON(KEYS.feeOverrideAudit, existing);
  // Parity with the donor/waiver path (donors.ts appendDonorAudit → 'Finance'):
  // ALSO surface this fee override in the Settings → Audit Log view. The
  // hash-chain write above is the tamper-evident record; this is the readable
  // 'audit_log' mirror. recordId is the chain entry's own id (no double-count:
  // one chain write + one audit_log line per override).
  const overrideLabel =
    base.overrideType === 'waived' ? 'waived'
    : base.overrideType === 'bill_later' ? 'billed later'
    : 'collected';
  appendRegistryAudit(
    'Fee override',
    base.id,
    `Fee ${overrideLabel} — ${getCurrencySymbol()}${base.amount.toLocaleString()} (${base.sacrament}) for ${base.personName} by ${base.recordedBy}${base.reason ? ` — ${base.reason}` : ''}`,
    'Finance',
  );
}

export function getFeeOverrideAudit(): FeeOverrideAuditEntry[] {
  return ns.getJSON<FeeOverrideAuditEntry[]>(KEYS.feeOverrideAudit, []);
}

// Verify the audit chain. Returns the index of the first tampered/removed
// entry, or -1 if the trail is intact. A broken chain means someone edited
// or deleted history outside the app.
export function verifyFeeOverrideAudit(): { intact: boolean; brokenAt: number } {
  const entries = getFeeOverrideAudit();
  let prevHash = 'genesis';
  for (let i = 0; i < entries.length; i++) {
    const { hash, ...rest } = entries[i];
    if (rest.prevHash !== prevHash) return { intact: false, brokenAt: i };
    const expected = auditHash(prevHash + JSON.stringify(rest));
    if (expected !== hash) return { intact: false, brokenAt: i };
    prevHash = hash;
  }
  return { intact: true, brokenAt: -1 };
}

function getPersonName(record: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord, sacrament: SacramentTab): string {
  switch (sacrament) {
    case 'baptism': return `${(record as BaptismRecord).childFirstName} ${(record as BaptismRecord).childLastName}`;
    case 'marriage': return `${(record as MarriageRecord).groomFirstName} ${(record as MarriageRecord).groomLastName} & ${(record as MarriageRecord).brideFirstName} ${(record as MarriageRecord).brideLastName}`;
    case 'confirmation': return `${(record as ConfirmationRecord).confirmandFirstName} ${(record as ConfirmationRecord).confirmandLastName}`;
    case 'death': return `${(record as DeathRecord).deceasedFirstName} ${(record as DeathRecord).deceasedLastName}`;
  }
}

/* ── Directory-link helpers ── */
const PARISHIONER_LINK_FIELDS = [
  'childParishionerId', 'fatherParishionerId', 'motherParishionerId',
  'godfatherParishionerId', 'godmotherParishionerId',
  'groomParishionerId', 'brideParishionerId', 'witness1ParishionerId', 'witness2ParishionerId',
  'confirmandParishionerId', 'sponsorParishionerId',
  'deceasedParishionerId',
] as const;

function isDirectoryLinked(r: RegistryRecord): boolean {
  const rec = r as unknown as Record<string, unknown>;
  return PARISHIONER_LINK_FIELDS.some((k) => !!rec[k]);
}

function LinkedChip() {
  return (
    <span
      title="Linked to the parishioner directory"
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gold-glow text-gold text-[10px] font-medium flex-shrink-0"
    >
      <Link2 className="w-3 h-3" />
      linked
    </span>
  );
}

/** Restore a soft-deleted record — absent flags mean "live" (shared contract). */
function restoreRecord<T extends SoftDeletable>(r: T): T {
  const copy = { ...r };
  delete copy.isDeleted;
  delete copy.deletedAt;
  delete copy.deletedBy;
  return copy;
}

const annotationTypeColors: Record<RegistryAnnotationType, string> = {
  confirmation: '#C9963B',
  marriage: '#6B2737',
  death: '#3D3A36',
  correction: '#B8322F',
  note: '#8C8374',
};

function AnnotationTypeBadge({ type }: { type: RegistryAnnotationType }) {
  const color = annotationTypeColors[type];
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide flex-shrink-0"
      style={{ backgroundColor: `${color}18`, color }}
    >
      {type}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Certificate template type                                           */
/* ------------------------------------------------------------------ */
// Load/save now live in registryData.ts (single source of truth, key
// 'certificate_templates') and are imported above; the guided visual editor
// uses the SAME exports so the Registry and the editor never drift.
type CertificateTemplate = (typeof certificateTemplates)[number];

/* ------------------------------------------------------------------ */
/*  Auto-add to parish calendar                                        */
/* ------------------------------------------------------------------ */
// Writes a REAL CalendarEvent (same store + seed fallback CalendarPage and
// RequestsPage use) and stores its id on the record. An existing link is
// reused, never duplicated; unchecking the box does not delete a previously
// created event — staff manage the calendar itself. Returns true only when
// an event was actually created.
// Add minutes to an "HH:MM" 24-hour clock string (wraps at midnight).
function addMinutes24(hhmm: string, minutes: number): string {
  const [h = 0, m = 0] = (hhmm || '').split(':').map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Graceful wedding calendar title built from SURNAMES (last-name fields).
// Fixes the old "Wedding: & " when names were blank.
function weddingCalendarTitle(groomLast?: string, brideLast?: string): string {
  const g = (groomLast || '').trim();
  const b = (brideLast || '').trim();
  if (g && b) return `Wedding — ${g} & ${b}`;
  if (g || b) return `Wedding — ${g || b}`;
  return 'Wedding';
}

function maybeAddToCalendar(
  record: RegistryRecord,
  autoCalendar: boolean,
  onToast: (message: string, type: ToastType) => void,
  overrides?: { title?: string; durationMin?: number },
): boolean {
  if (!autoCalendar || record.calendarEventId) return false;
  // Run the same liturgical scheduling rules the CalendarPage drag path and the
  // RequestsPage CreateCalendarEventModal enforce, so an auto-added event (e.g.
  // a wedding scheduled in Lent) can't slip in unvalidated. WARN only — a rule
  // conflict is a pastoral-dispensation matter, never a hard block; the event
  // is still created, annotated with ruleEnforced/ruleNotes for the calendar.
  let built = buildRegistryCalendarEvent(record);
  // Carry the booking's real title + time window so future bookings detect this
  // event as busy for the whole ceremony (not a flat 60 min) and so the calendar
  // shows a graceful title. Venue is carried via `location` (a venue token the
  // scheduling engine matches on).
  if (overrides?.title) built = { ...built, title: overrides.title };
  if (overrides?.durationMin && overrides.durationMin > 0) {
    built = { ...built, endTime: addMinutes24(built.startTime, overrides.durationMin) };
  }
  const { event: ev, errors, warnings } = annotateEventWithSchedulingRules(built);
  const current = ns.getJSON<CalendarEvent[]>(KEYS.calendarEvents, SAMPLE_EVENTS);
  ns.setJSON(KEYS.calendarEvents, [...current, ev]);
  record.calendarEventId = ev.id;
  const messages = [...errors, ...warnings];
  if (messages.length) {
    onToast(`Calendar event created with a scheduling note: ${messages.join(' ')}`, 'warning');
  }
  return true;
}

// Honest toast: "calendar event created" is only claimed when one was written.
const calendarSaveToast = (label: string, autoCal: boolean, created: boolean): [string, ToastType] =>
  created
    ? [`${label} recorded and calendar event created`, 'success']
    : autoCal
      ? [`${label} record saved (already linked to a calendar event)`, 'success']
      : [`${label} record saved. You can schedule the ceremony later from the calendar.`, 'info'];

const defaultPaymentInfo = (ceremonyFee: number): PaymentInfo => ({
  status: 'collect_now', // DEFAULT: always collect now; other options require override
  amount: ceremonyFee,
  method: 'Cash',
  receiptNumber: '',
  date: todayISO(), // local date — UTC default is yesterday before 8 AM PH time
  receivedBy: 'Secretary',
  waiveReason: 'Financial hardship',
  waiveApprovedBy: 'Fr. Reyes',
  dueDate: '',
  overrideReason: '',
});

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function RegistryPage() {
  const [activeTab, setActiveTab] = useState<SacramentTab>('baptism');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [recordModal, setRecordModal] = useState<'add' | 'edit' | null>(null);
  const [editingRecord, setEditingRecord] = useState<BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord | null>(null);
  const [certModal, setCertModal] = useState(false);
  const [certRecord, setCertRecord] = useState<RegistryRecord | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [templateModal, setTemplateModal] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [officiantFilter, setOfficiantFilter] = useState('');
  const [highlightId, setHighlightId] = useState('');
  /* "Needs closing out" quick filter — when on, the list shows only overdue
     scheduled records (nudge, never a hard filter of the underlying data). */
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  /* Cancel-a-record confirmation (reuses ConfirmationDialog). */
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const { toasts, addToast, removeToast } = useToasts();
  const [searchParams, setSearchParams] = useSearchParams();

  /* data state (persisted per parish) */
  const [bData, setBData] = usePersistedState<BaptismRecord[]>(KEYS.baptismRecords, baptismRecords);
  const [mData, setMData] = usePersistedState<MarriageRecord[]>(KEYS.marriageRecords, marriageRecords);
  const [cData, setCData] = usePersistedState<ConfirmationRecord[]>(KEYS.confirmationRecords, confirmationRecords);
  const [dData, setDData] = usePersistedState<DeathRecord[]>(KEYS.deathRecords, deathRecords);

  /* Live parishioner directory (same persisted store DirectoryPage writes).
     The pickers search THIS list — never the static seed snapshot — so new,
     edited and merged members appear and archived families never do. */
  const [famData, setFamData] = usePersistedState<Family[]>(KEYS.families, seedFamilies);
  const parishionerLookup = useMemo(() => buildParishionerLookupFrom(liveOnly(famData)), [famData]);

  /* Live (non-deleted) views — soft-deleted records only show in the Archived view. */
  const bLive = useMemo(() => liveOnly(bData), [bData]);
  const mLive = useMemo(() => liveOnly(mData), [mData]);
  const cLive = useMemo(() => liveOnly(cData), [cData]);
  const dLive = useMemo(() => liveOnly(dData), [dData]);

  const bBase = useMemo(() => (showArchived ? bData.filter((r) => r.isDeleted) : bLive), [showArchived, bData, bLive]);
  const mBase = useMemo(() => (showArchived ? mData.filter((r) => r.isDeleted) : mLive), [showArchived, mData, mLive]);
  const cBase = useMemo(() => (showArchived ? cData.filter((r) => r.isDeleted) : cLive), [showArchived, cData, cLive]);
  const dBase = useMemo(() => (showArchived ? dData.filter((r) => r.isDeleted) : dLive), [showArchived, dData, dLive]);

  /* Per-tab COUNT = live records that are NOT cancelled (scheduled + solemnized).
     Cancelled records still show in the list (flagged) but must not inflate the
     count. Distinct from the archived/soft-delete filter. */
  const bCount = useMemo(() => bLive.filter((r) => recordStatus(r) !== 'cancelled').length, [bLive]);
  const mCount = useMemo(() => mLive.filter((r) => recordStatus(r) !== 'cancelled').length, [mLive]);
  const cCount = useMemo(() => cLive.filter((r) => recordStatus(r) !== 'cancelled').length, [cLive]);
  const dCount = useMemo(() => dLive.filter((r) => recordStatus(r) !== 'cancelled').length, [dLive]);

  const tabConfigs = useMemo(() => tabs(bCount, mCount, cCount, dCount), [bCount, mCount, cCount, dCount]);
  const activeConfig = tabConfigs.find((t) => t.key === activeTab)!;

  /* Overdue-scheduled (ceremony date passed, still not closed out) — live rows
     only. Drives the top banner + the "needs closing out" filter. */
  const activeOverdueCount = useMemo(() => {
    const live = activeTab === 'baptism' ? bLive : activeTab === 'marriage' ? mLive : activeTab === 'confirmation' ? cLive : dLive;
    return (live as RegistryRecord[]).filter((r) => isOverdueScheduled(r)).length;
  }, [activeTab, bLive, mLive, cLive, dLive]);

  const archivedCount =
    activeTab === 'baptism' ? bData.length - bLive.length
    : activeTab === 'marriage' ? mData.length - mLive.length
    : activeTab === 'confirmation' ? cData.length - cLive.length
    : dData.length - dLive.length;

  /* Inbound query params: ?action=add opens the Add modal; ?id=<recordId>
     switches to the record's tab and scrolls/highlights it. Params are
     consumed (removed) so navigation/re-renders don't re-trigger. */
  const paramsHandled = useRef(false);
  useEffect(() => {
    if (paramsHandled.current) return;
    const action = searchParams.get('action');
    const id = searchParams.get('id');
    const view = searchParams.get('view');
    if (!action && !id && !view) return;
    paramsHandled.current = true;

    if (action === 'add') {
      setEditingRecord(null);
      setRecordModal('add');
    }

    // ?view=overdue (dashboard "Review") — turn on the "needs closing out"
    // filter and land on the first tab that actually has overdue records.
    if (view === 'overdue') {
      const overdueTab: SacramentTab | null =
        bLive.some((r) => isOverdueScheduled(r)) ? 'baptism'
        : mLive.some((r) => isOverdueScheduled(r)) ? 'marriage'
        : cLive.some((r) => isOverdueScheduled(r)) ? 'confirmation'
        : dLive.some((r) => isOverdueScheduled(r)) ? 'death'
        : null;
      setShowArchived(false);
      setSearchQuery('');
      setShowOverdueOnly(true);
      if (overdueTab) setActiveTab(overdueTab);
    }

    if (id) {
      // Locate which sacrament tab holds this record.
      const inTab: SacramentTab | null =
        bData.some((r) => r.id === id) ? 'baptism'
        : mData.some((r) => r.id === id) ? 'marriage'
        : cData.some((r) => r.id === id) ? 'confirmation'
        : dData.some((r) => r.id === id) ? 'death'
        : null;
      if (inTab) {
        setActiveTab(inTab);
        setSearchQuery('');
        // If the target record is archived, open the Archived view so it's visible.
        const all = [...bData, ...mData, ...cData, ...dData];
        setShowArchived(!!all.find((r) => r.id === id)?.isDeleted);
        setHighlightId(id);
        // Scroll to and briefly highlight the row after it renders.
        setTimeout(() => {
          const el = document.querySelector(`[data-record-id="${id}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
        setTimeout(() => setHighlightId(''), 3000);
      }
    }

    // Consume the params so a re-render or back/forward doesn't reopen.
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    next.delete('id');
    next.delete('view');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, bData, mData, cData, dData]);

  /* Shared filter predicate for the Filters panel (status / year / officiant).
     `primaryDate` is the sacrament's main date used for the Year filter. */
  const matchesFilters = useCallback(
    (r: { status: string; officiant: string }, primaryDate: string) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (officiantFilter && r.officiant !== officiantFilter) return false;
      if (yearFilter) {
        const year = primaryDate ? primaryDate.slice(0, 4) : '';
        if (year !== yearFilter) return false;
      }
      return true;
    },
    [statusFilter, officiantFilter, yearFilter],
  );

  /* filtered data — memoized so identities only change when the rows/filters
     actually change (DataTable resets to page 1 on a new data identity). */
  const baptismFiltered = useMemo(() => bBase.filter((r) => {
    if (!matchesFilters(r, r.dateOfBaptism)) return false;
    if (showOverdueOnly && !isOverdueScheduled(r)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${r.childFirstName} ${r.childLastName}`.toLowerCase().includes(q) ||
      `${r.fatherFirstName} ${r.fatherLastName}`.toLowerCase().includes(q) ||
      `${r.motherFirstName} ${r.motherLastName}`.toLowerCase().includes(q) ||
      r.officiant.toLowerCase().includes(q) ||
      `${r.bookNumber}/${r.pageNumber}`.includes(q) ||
      r.registryNumber.toLowerCase().includes(q)
    );
  }), [bBase, matchesFilters, searchQuery, showOverdueOnly]);

  const marriageFiltered = useMemo(() => mBase.filter((r) => {
    if (!matchesFilters(r, r.dateOfMarriage)) return false;
    if (showOverdueOnly && !isOverdueScheduled(r)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${r.groomFirstName} ${r.groomLastName}`.toLowerCase().includes(q) ||
      `${r.brideFirstName} ${r.brideLastName}`.toLowerCase().includes(q) ||
      r.officiant.toLowerCase().includes(q) ||
      `${r.bookNumber}/${r.pageNumber}`.includes(q) ||
      r.registryNumber.toLowerCase().includes(q)
    );
  }), [mBase, matchesFilters, searchQuery, showOverdueOnly]);

  const confirmationFiltered = useMemo(() => cBase.filter((r) => {
    if (!matchesFilters(r, r.dateOfConfirmation)) return false;
    if (showOverdueOnly && !isOverdueScheduled(r)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${r.confirmandFirstName} ${r.confirmandLastName}`.toLowerCase().includes(q) ||
      r.officiant.toLowerCase().includes(q) ||
      `${r.bookNumber}/${r.pageNumber}`.includes(q) ||
      r.registryNumber.toLowerCase().includes(q)
    );
  }), [cBase, matchesFilters, searchQuery, showOverdueOnly]);

  const deathFiltered = useMemo(() => dBase.filter((r) => {
    if (!matchesFilters(r, r.dateOfDeath)) return false;
    if (showOverdueOnly && !isOverdueScheduled(r)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${r.deceasedFirstName} ${r.deceasedLastName}`.toLowerCase().includes(q) ||
      r.officiant.toLowerCase().includes(q) ||
      `${r.bookNumber}/${r.pageNumber}`.includes(q) ||
      r.registryNumber.toLowerCase().includes(q)
    );
  }), [dBase, matchesFilters, searchQuery, showOverdueOnly]);

  /* actions */
  const handleEdit = useCallback(
    (record: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord) => {
      setEditingRecord(record);
      setRecordModal('edit');
    }, []
  );

  const activeData = (): RegistryRecord[] =>
    activeTab === 'baptism' ? bData : activeTab === 'marriage' ? mData : activeTab === 'confirmation' ? cData : dData;

  const handleDelete = (id: string) => setDeleteDialog({ open: true, id });
  const confirmDelete = () => {
    const id = deleteDialog.id;
    const target = activeData().find((r) => r.id === id);
    const by = getCurrentUserName();
    // NOTE: the linked calendar event (calendarEventId) is deliberately NOT
    // removed here — the ceremony may proceed even when the register entry is
    // archived (e.g. re-entered under a corrected name); staff manage the
    // parish calendar itself.
    if (activeTab === 'baptism') setBData((prev) => prev.map((r) => (r.id === id ? softDelete(r, by) : r)));
    if (activeTab === 'marriage') setMData((prev) => prev.map((r) => (r.id === id ? softDelete(r, by) : r)));
    if (activeTab === 'confirmation') setCData((prev) => prev.map((r) => (r.id === id ? softDelete(r, by) : r)));
    if (activeTab === 'death') setDData((prev) => prev.map((r) => (r.id === id ? softDelete(r, by) : r)));

    // Canonical registers strike through, never erase: if this confirmation/
    // marriage/death record auto-annotated a baptism margin, void that note
    // and append a dated correction instead of deleting history. (Restoring
    // the record does NOT undo this — a fresh note is the canonical fix.)
    if (target && activeTab !== 'baptism') {
      const annType = activeTab; // 'marriage' | 'confirmation' | 'death' — all valid annotation types
      const reg = target.registryNumber;
      const affected = bData.filter(
        (b) => !b.isDeleted && (b.annotations ?? []).some((a) => annotationReferencesRecord(a, annType, reg)),
      );
      if (affected.length) {
        // Corrections are built OUTSIDE the updater so ids/audits stay stable
        // even if React invokes the updater twice (StrictMode).
        const correctionById = new Map(affected.map((b) => [b.id, buildArchiveCorrectionAnnotation(annType, reg)]));
        setBData((prev) => prev.map((b) => {
          const correction = correctionById.get(b.id);
          if (!correction) return b;
          let nextB = b;
          for (const a of (b.annotations ?? []).filter((x) => annotationReferencesRecord(x, annType, reg))) {
            nextB = voidAnnotation(nextB, a.id);
          }
          return addAnnotation(nextB, correction);
        }));
        for (const b of affected) {
          appendRegistryAudit(
            'Annotated',
            b.id,
            `Correction annotation added to baptism record ${b.registryNumber} — ${activeConfig.label.toLowerCase()} record ${reg} archived, previous note voided`,
          );
        }
      }
    }

    setDeleteDialog({ open: false, id: '' });
    appendRegistryAudit('Deleted', id, `Archived ${activeConfig.label.toLowerCase()} record${target ? ` for ${getPersonName(target, activeTab)}` : ''} (soft delete)`);
    addToast('Record archived — restore it any time from the Archived view', 'success');
  };

  const handleRestore = (id: string) => {
    const target = activeData().find((r) => r.id === id);
    if (activeTab === 'baptism') setBData((prev) => prev.map((r) => (r.id === id ? restoreRecord(r) : r)));
    if (activeTab === 'marriage') setMData((prev) => prev.map((r) => (r.id === id ? restoreRecord(r) : r)));
    if (activeTab === 'confirmation') setCData((prev) => prev.map((r) => (r.id === id ? restoreRecord(r) : r)));
    if (activeTab === 'death') setDData((prev) => prev.map((r) => (r.id === id ? restoreRecord(r) : r)));
    appendRegistryAudit('Restored', id, `Restored ${activeConfig.label.toLowerCase()} record${target ? ` for ${getPersonName(target, activeTab)}` : ''} from archive`);
    addToast('Record restored', 'success');
  };

  const handleGenerateCert = (record: RegistryRecord) => {
    // A certificate attests a CONFERRED sacrament. Scheduled (not yet performed)
    // and cancelled (didn't push through) records are never certifiable — this
    // guard makes it impossible even if a caller bypasses the disabled button.
    const st = recordStatus(record);
    if (st !== 'solemnized') {
      addToast(
        st === 'cancelled'
          ? 'This record is cancelled — a certificate cannot be issued.'
          : 'Not yet solemnized — mark the ceremony solemnized before issuing a certificate.',
        'warning',
      );
      return;
    }
    setCertRecord(record);
    setCertModal(true);
  };

  /* ── LIFECYCLE STATUS CHANGES (persist via the record store; audited) ──
     On cancel we deliberately DO NOT touch the calendar event or scheduling —
     the parish keeps the slot; staff free it manually from the Calendar. */
  const applyLifecycle = (id: string, next: RecordLifecycleStatus) => {
    const target = activeData().find((r) => r.id === id);
    if (activeTab === 'baptism') setBData((prev) => prev.map((r) => (r.id === id ? { ...r, lifecycleStatus: next } : r)));
    if (activeTab === 'marriage') setMData((prev) => prev.map((r) => (r.id === id ? { ...r, lifecycleStatus: next } : r)));
    if (activeTab === 'confirmation') setCData((prev) => prev.map((r) => (r.id === id ? { ...r, lifecycleStatus: next } : r)));
    if (activeTab === 'death') setDData((prev) => prev.map((r) => (r.id === id ? { ...r, lifecycleStatus: next } : r)));
    const verb = next === 'solemnized' ? 'Marked solemnized' : next === 'cancelled' ? 'Cancelled' : 'Reset to scheduled';
    appendRegistryAudit(
      'Status changed',
      id,
      `${verb} ${activeConfig.label.toLowerCase()} record${target ? ` for ${getPersonName(target, activeTab)}` : ''}`,
    );
    addToast(
      next === 'solemnized' ? 'Marked as solemnized — now an official record'
      : next === 'cancelled' ? 'Record cancelled — kept for the audit trail, not counted as conferred'
      : 'Reset to scheduled',
      next === 'cancelled' ? 'warning' : 'success',
    );
  };

  const handleCancelRecord = (id: string) => setCancelDialog({ open: true, id });
  const confirmCancelRecord = () => {
    if (cancelDialog.id) applyLifecycle(cancelDialog.id, 'cancelled');
    setCancelDialog({ open: false, id: '' });
  };

  /* Canon 535 behavior: a NEW confirmation/marriage annotates the margin of
     the person's baptism record (when it is linked or safely discoverable). */
  const autoAnnotateBaptisms = (saved: RegistryRecord) => {
    if (activeTab === 'confirmation') {
      const c = saved as ConfirmationRecord;
      if (!c.baptismRecordId) return;
      const target = bData.find((b) => b.id === c.baptismRecordId && !b.isDeleted);
      if (!target) return;
      const ann = buildAutoAnnotation('confirmation', {
        date: c.dateOfConfirmation,
        bishop: c.bishop,
        registryNumber: c.registryNumber,
      });
      setBData((prev) => prev.map((b) => (b.id === target.id ? addAnnotation(b, ann) : b)));
      appendRegistryAudit('Annotated', target.id, `Confirmation annotation added to baptism record ${target.registryNumber}`);
      addToast('Baptism record annotated', 'success');
    } else if (activeTab === 'marriage') {
      const m = saved as MarriageRecord;
      const spouses = [
        { first: m.groomFirstName, last: m.groomLastName, pid: m.groomParishionerId, spouse: `${m.brideFirstName} ${m.brideLastName}` },
        { first: m.brideFirstName, last: m.brideLastName, pid: m.brideParishionerId, spouse: `${m.groomFirstName} ${m.groomLastName}` },
      ];
      let next = bData;
      let annotated = 0;
      for (const s of spouses) {
        // Prefer the explicit directory link; otherwise only an UNAMBIGUOUS
        // exact-name match — with namesakes we cannot know whose baptism this
        // is, so annotation is left to the operator.
        const { target, ambiguous } = resolveBaptismForAnnotation(next, { parishionerId: s.pid, first: s.first, last: s.last });
        if (ambiguous) {
          addToast(`Multiple baptism records match ${s.first} ${s.last} — annotate manually`, 'warning');
          continue;
        }
        if (!target) continue;
        const ann = buildAutoAnnotation('marriage', {
          date: m.dateOfMarriage,
          spouse: s.spouse,
          registryNumber: m.registryNumber,
        });
        next = next.map((b) => (b.id === target.id ? addAnnotation(b, ann) : b));
        appendRegistryAudit('Annotated', target.id, `Marriage annotation added to baptism record ${target.registryNumber}`);
        annotated++;
      }
      if (annotated > 0) {
        setBData(next);
        addToast(annotated === 1 ? 'Baptism record annotated' : 'Baptism records annotated (both spouses)', 'success');
      }
    } else if (activeTab === 'death') {
      const d = saved as DeathRecord;
      // Same rule as the marriage path: the directory link wins; otherwise
      // only an unambiguous exact-name match — namesakes are skipped loudly.
      const { target, ambiguous } = resolveBaptismForAnnotation(bData, {
        parishionerId: d.deceasedParishionerId,
        first: d.deceasedFirstName,
        last: d.deceasedLastName,
      });
      if (ambiguous) {
        addToast(`Multiple baptism records match ${d.deceasedFirstName} ${d.deceasedLastName} — annotate manually`, 'warning');
        return;
      }
      if (!target) return;
      const ann = buildAutoAnnotation('death', {
        date: d.dateOfDeath,
        cemetery: d.cemetery,
        registryNumber: d.registryNumber,
      });
      setBData((prev) => prev.map((b) => (b.id === target.id ? addAnnotation(b, ann) : b)));
      appendRegistryAudit('Annotated', target.id, `Death annotation added to baptism record ${target.registryNumber}`);
      addToast('Baptism record annotated', 'success');
    }
  };

  /* Registry → Directory sync: when the saved record's RECIPIENT is linked to
     a directory member (via the pickers), write registryRecordId onto that
     member's matching sacrament entry so the directory badge click-through
     (DirectoryPage → /registry?id=...) has a target. Non-recipient links
     (parents, sponsors, witnesses) deliberately do not create history. */
  const syncDirectorySacramentLinks = (record: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord) => {
    const links: Array<{ pid?: string; entry: SacramentLinkEntry }> = [];
    const bookPage = `${record.bookNumber}/${record.pageNumber}`;
    const parish = getParishName();
    if (activeTab === 'baptism') {
      const r = record as BaptismRecord;
      links.push({ pid: r.childParishionerId, entry: { type: 'Baptism', date: r.dateOfBaptism, parish, bookPage, registryRecordId: r.id } });
    } else if (activeTab === 'marriage') {
      const r = record as MarriageRecord;
      const entry: SacramentLinkEntry = { type: 'Marriage', date: r.dateOfMarriage, parish, bookPage, registryRecordId: r.id };
      links.push({ pid: r.groomParishionerId, entry }, { pid: r.brideParishionerId, entry });
    } else if (activeTab === 'confirmation') {
      const r = record as ConfirmationRecord;
      links.push({ pid: r.confirmandParishionerId, entry: { type: 'Confirmation', date: r.dateOfConfirmation, parish, bookPage, registryRecordId: r.id } });
    } else {
      const r = record as DeathRecord;
      links.push({ pid: r.deceasedParishionerId, entry: { type: 'Death', date: r.dateOfDeath, parish, bookPage, registryRecordId: r.id } });
    }
    let next = famData;
    let any = false;
    for (const { pid, entry } of links) {
      if (!pid) continue;
      const res = linkSacramentToRegistry(next, pid, entry);
      if (res.changed) { next = res.families; any = true; }
    }
    if (any) setFamData(next);
  };

  const handleSaveRecord = (record: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord) => {
    if (activeTab === 'baptism') {
      const r = record as BaptismRecord;
      if (recordModal === 'edit' && editingRecord) {
        setBData((prev) => prev.map((x) => (x.id === editingRecord.id ? r : x)));
      } else {
        setBData((prev) => [r, ...prev]);
      }
    } else if (activeTab === 'marriage') {
      const r = record as MarriageRecord;
      if (recordModal === 'edit' && editingRecord) {
        setMData((prev) => prev.map((x) => (x.id === editingRecord.id ? r : x)));
      } else {
        setMData((prev) => [r, ...prev]);
      }
    } else if (activeTab === 'confirmation') {
      const r = record as ConfirmationRecord;
      if (recordModal === 'edit' && editingRecord) {
        setCData((prev) => prev.map((x) => (x.id === editingRecord.id ? r : x)));
      } else {
        setCData((prev) => [r, ...prev]);
      }
    } else if (activeTab === 'death') {
      const r = record as DeathRecord;
      if (recordModal === 'edit' && editingRecord) {
        setDData((prev) => prev.map((x) => (x.id === editingRecord.id ? r : x)));
      } else {
        setDData((prev) => [r, ...prev]);
      }
    }
    const isEditSave = recordModal === 'edit' && !!editingRecord;
    appendRegistryAudit(
      isEditSave ? 'Edited' : 'Created',
      record.id,
      `${isEditSave ? 'Edited' : 'Created'} ${activeConfig.label.toLowerCase()} record for ${getPersonName(record, activeTab)}`,
    );
    // Voiding a margin note is an audited action — one line per annotation
    // struck through in this edit (they persist with the record, never erased).
    if (isEditSave && editingRecord) {
      for (const a of newlyVoidedAnnotations(editingRecord.annotations, record.annotations)) {
        appendRegistryAudit(
          'Annotation voided',
          record.id,
          `Voided ${a.type} annotation "${a.text}" on ${activeConfig.label.toLowerCase()} record for ${getPersonName(record, activeTab)}`,
        );
      }
    }
    if (!isEditSave) autoAnnotateBaptisms(record);
    syncDirectorySacramentLinks(record);

    setRecordModal(null);
    setEditingRecord(null);
    addToast(`${activeConfig.label} record saved successfully`, 'success');

    // Check for first-action achievements (only on new records, not edits)
    if (recordModal !== 'edit') {
      const typeMap: Record<string, 'baptism' | 'marriage' | 'confirmation' | 'burial'> = {
        baptism: 'baptism',
        marriage: 'marriage',
        confirmation: 'confirmation',
        death: 'burial',
      };
      const actionType = typeMap[activeTab];
      if (actionType) {
        celebrateFirstAction(actionType);
      }
      // Check milestone (total records across all tabs)
      const totalRecords = bData.length + mData.length + cData.length + dData.length + 1;
      celebrateMilestone(totalRecords);
    }
  };

  /* columns */
  const baptismColumns: Column<BaptismRecord>[] = [
    { key: 'registryNumber', header: 'Registry #', width: '110px', sortable: true },
    {
      key: 'childName', header: "Child's Name", width: '200px', sortable: true,
      searchValue: (r) => `${r.childFirstName} ${r.childMiddleName} ${r.childLastName}`,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          {`${r.childFirstName} ${r.childMiddleName} ${r.childLastName}`}
          {isDirectoryLinked(r) && <LinkedChip />}
        </span>
      ),
    },
    { key: 'dateOfBaptism', header: 'Date', width: '120px', sortable: true, render: (r) => formatDate(r.dateOfBaptism) },
    { key: 'gender', header: 'Gender', width: '70px', sortable: true },
    { key: 'parents', header: 'Parents', width: '220px', sortable: false, render: (r) => `${r.fatherFirstName} ${r.fatherLastName} / ${r.motherFirstName} ${r.motherLastName}` },
    { key: 'officiant', header: 'Officiant', width: '130px', sortable: true },
    { key: 'bookPage', header: 'Book/Page', width: '90px', sortable: true, render: (r) => `${r.bookNumber}/${r.pageNumber}` },
    { key: 'schedule', header: 'Scheduled', width: '120px', sortable: true, render: (r) => formatDate(r.scheduledDate) },
    {
      key: 'status',
      header: 'Status',
      width: '90px',
      sortable: true,
      render: (r) => <span className={`cos-badge ${statusBadge(r.status)}`}>{r.status}</span>,
    },
    {
      key: 'lifecycle',
      header: 'Lifecycle',
      width: '110px',
      sortable: false,
      searchValue: (r) => LIFECYCLE_LABEL[recordStatus(r)],
      render: (r) => <LifecycleBadge record={r} />,
    },
  ];

  const marriageColumns: Column<MarriageRecord>[] = [
    { key: 'registryNumber', header: 'Registry #', width: '110px', sortable: true },
    {
      key: 'groomName', header: 'Groom', width: '160px', sortable: true,
      searchValue: (r) => `${r.groomFirstName} ${r.groomLastName}`,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          {`${r.groomFirstName} ${r.groomLastName}`}
          {isDirectoryLinked(r) && <LinkedChip />}
        </span>
      ),
    },
    { key: 'brideName', header: 'Bride', width: '160px', sortable: true, render: (r) => `${r.brideFirstName} ${r.brideLastName}` },
    { key: 'dateOfMarriage', header: 'Date', width: '120px', sortable: true, render: (r) => formatDate(r.dateOfMarriage) },
    { key: 'officiant', header: 'Officiant', width: '130px', sortable: true },
    { key: 'witnesses', header: 'Witnesses', width: '180px', sortable: false, render: (r) => `${r.witness1Name}, ${r.witness2Name}` },
    { key: 'bookPage', header: 'Book/Page', width: '90px', sortable: true, render: (r) => `${r.bookNumber}/${r.pageNumber}` },
    { key: 'schedule', header: 'Scheduled', width: '120px', sortable: true, render: (r) => formatDate(r.scheduledDate) },
    {
      key: 'status',
      header: 'Status',
      width: '90px',
      sortable: true,
      render: (r) => <span className={`cos-badge ${statusBadge(r.status)}`}>{r.status}</span>,
    },
    {
      key: 'lifecycle',
      header: 'Lifecycle',
      width: '110px',
      sortable: false,
      searchValue: (r) => LIFECYCLE_LABEL[recordStatus(r)],
      render: (r) => <LifecycleBadge record={r} />,
    },
  ];

  const confirmationColumns: Column<ConfirmationRecord>[] = [
    { key: 'registryNumber', header: 'Registry #', width: '110px', sortable: true },
    {
      key: 'name', header: 'Confirmand', width: '200px', sortable: true,
      searchValue: (r) => `${r.confirmandFirstName} ${r.confirmandMiddleName} ${r.confirmandLastName}`,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          {`${r.confirmandFirstName} ${r.confirmandMiddleName} ${r.confirmandLastName}`}
          {(isDirectoryLinked(r) || !!r.baptismRecordId) && <LinkedChip />}
        </span>
      ),
    },
    { key: 'dateOfConfirmation', header: 'Date', width: '120px', sortable: true, render: (r) => formatDate(r.dateOfConfirmation) },
    { key: 'officiant', header: 'Officiant', width: '130px', sortable: true },
    { key: 'bishop', header: 'Bishop', width: '160px', sortable: true },
    { key: 'sponsor', header: 'Sponsor', width: '160px', sortable: false, render: (r) => `${r.sponsorFirstName} ${r.sponsorLastName}` },
    { key: 'bookPage', header: 'Book/Page', width: '90px', sortable: true, render: (r) => `${r.bookNumber}/${r.pageNumber}` },
    { key: 'schedule', header: 'Scheduled', width: '120px', sortable: true, render: (r) => formatDate(r.scheduledDate) },
    {
      key: 'status',
      header: 'Status',
      width: '90px',
      sortable: true,
      render: (r) => <span className={`cos-badge ${statusBadge(r.status)}`}>{r.status}</span>,
    },
    {
      key: 'lifecycle',
      header: 'Lifecycle',
      width: '110px',
      sortable: false,
      searchValue: (r) => LIFECYCLE_LABEL[recordStatus(r)],
      render: (r) => <LifecycleBadge record={r} />,
    },
  ];

  const deathColumns: Column<DeathRecord>[] = [
    { key: 'registryNumber', header: 'Registry #', width: '110px', sortable: true },
    {
      key: 'deceasedName', header: 'Deceased', width: '200px', sortable: true,
      searchValue: (r) => `${r.deceasedFirstName} ${r.deceasedMiddleName} ${r.deceasedLastName}`,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 flex-wrap">
          {`${r.deceasedFirstName} ${r.deceasedMiddleName} ${r.deceasedLastName}`}
          {isDirectoryLinked(r) && <LinkedChip />}
        </span>
      ),
    },
    { key: 'dateOfDeath', header: 'Date of Death', width: '120px', sortable: true, render: (r) => formatDate(r.dateOfDeath) },
    { key: 'dateOfBurial', header: 'Date of Burial', width: '120px', sortable: true, render: (r) => formatDate(r.dateOfBurial) },
    { key: 'age', header: 'Age', width: '50px', sortable: true },
    { key: 'cause', header: 'Cause', width: '130px', sortable: true },
    { key: 'officiant', header: 'Officiant', width: '130px', sortable: true },
    { key: 'bookPage', header: 'Book/Page', width: '90px', sortable: true, render: (r) => `${r.bookNumber}/${r.pageNumber}` },
    { key: 'schedule', header: 'Scheduled', width: '120px', sortable: true, render: (r) => formatDate(r.scheduledDate) },
    {
      key: 'status',
      header: 'Status',
      width: '90px',
      sortable: true,
      render: (r) => <span className={`cos-badge ${statusBadge(r.status)}`}>{r.status}</span>,
    },
    {
      key: 'lifecycle',
      header: 'Lifecycle',
      width: '110px',
      sortable: false,
      searchValue: (r) => LIFECYCLE_LABEL[recordStatus(r)],
      render: (r) => <LifecycleBadge record={r} />,
    },
  ];

  const getColumns = () => {
    switch (activeTab) {
      case 'baptism': return baptismColumns;
      case 'marriage': return marriageColumns;
      case 'confirmation': return confirmationColumns;
      case 'death': return deathColumns;
    }
  };

  const getData = () => {
    switch (activeTab) {
      case 'baptism': return baptismFiltered;
      case 'marriage': return marriageFiltered;
      case 'confirmation': return confirmationFiltered;
      case 'death': return deathFiltered;
    }
  };

  /* Distinct years present in the active tab's data — drives the Year filter
     so it only offers years that actually have records. */
  const availableYears = useMemo(() => {
    const dates: string[] =
      activeTab === 'baptism' ? bBase.map((r) => r.dateOfBaptism)
      : activeTab === 'marriage' ? mBase.map((r) => r.dateOfMarriage)
      : activeTab === 'confirmation' ? cBase.map((r) => r.dateOfConfirmation)
      : dBase.map((r) => r.dateOfDeath);
    const years = new Set<string>();
    for (const d of dates) {
      if (d && d.length >= 4) years.add(d.slice(0, 4));
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [activeTab, bBase, mBase, cBase, dBase]);

  /* ── Export helpers (operate on the currently visible/filtered rows) ── */
  // Build [header row, ...data rows] as plain strings using the active
  // columns' own render logic, so the export matches what's on screen.
  const buildExportRows = useCallback((): string[][] => {
    const cols = getColumns() as unknown as Column<Record<string, unknown>>[];
    const rows = getData() as unknown as Record<string, unknown>[];
    const header = cols.map((c) => c.header);
    const body = rows.map((row) =>
      cols.map((c) => {
        // Prefer render() when it yields text (matches the on-screen cell,
        // e.g. formatted dates and computed names). Skip JSX (status badge)
        // and fall back to the plain field value / searchValue.
        if (c.render) {
          const out = c.render(row);
          if (typeof out === 'string' || typeof out === 'number') return String(out);
        }
        if (c.searchValue) {
          const sv = c.searchValue(row);
          if (sv != null) return String(sv);
        }
        const raw = row[c.key];
        return raw != null && typeof raw !== 'object' ? String(raw) : '';
      }),
    );
    return [header, ...body];
    // getColumns/getData are recreated each render and read the same tab data
    // captured by the deps below; listing them would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, baptismFiltered, marriageFiltered, confirmationFiltered, deathFiltered]);

  const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;

  const handleExportCSV = () => {
    setExportOpen(false);
    const rows = buildExportRows();
    if (rows.length <= 1) { addToast('No records to export', 'warning'); return; }
    const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');
    // BOM so Excel opens UTF-8 (accented names) correctly.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeTab}-registry-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast(`Exported ${rows.length - 1} ${activeConfig.label.toLowerCase()} record${rows.length - 1 === 1 ? '' : 's'} to CSV`, 'success');
  };

  const handlePrintList = () => {
    setExportOpen(false);
    const rows = buildExportRows();
    if (rows.length <= 1) { addToast('No records to print', 'warning'); return; }
    const [header, ...body] = rows;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const win = window.open('', '_blank');
    if (!win) { addToast('Unable to open print window — please allow pop-ups', 'error'); return; }
    win.document.write(`
      <html><head><title>${esc(activeConfig.label)} Registry</title>
      <style>
        body{font-family:Georgia,serif;margin:32px;color:#3D3A36;}
        h1{font-size:20px;margin:0 0 4px;}
        .meta{font-size:12px;color:#8C8374;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}
        th{background:#F2EFE8;}
        @media print{body{margin:12mm;}}
      </style></head>
      <body>
        <h1>${esc(activeConfig.label)} Registry</h1>
        <div class="meta">${body.length} record${body.length === 1 ? '' : 's'} — printed ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <table>
          <thead><tr>${header.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
      className="space-y-6"
    >
      {/* ── Page Header ─────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-7 h-7 text-gold" />
          <h1 className="display-md text-charcoal dark:text-dm-text font-playfair">Sacramental Registry</h1>
        </div>
        <p className="body-md text-warm-gray dark:text-dm-text-muted max-w-2xl">
          Manage baptism, marriage, confirmation, and death records. Generate certificates with customizable templates.
        </p>
        <div className="mt-3 h-[3px] w-24 bg-gold rounded-full" />
      </div>

      {/* ── Sacrament Cards ─────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-tour="registry-tabs">
        {tabConfigs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
          const accent = isDark ? t.darkColor : t.color;
          const iconOnAccent = isDark ? '#26221E' : '#FFFFFF';
          return (
            <button
              key={t.key}
              aria-pressed={isActive}
              onClick={() => { setActiveTab(t.key); setSearchQuery(''); setStatusFilter(''); setYearFilter(''); setOfficiantFilter(''); setShowArchived(false); }}
              className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border p-4 text-left transition-all ${
                isActive
                  ? 'shadow-md -translate-y-0.5'
                  : 'border-parchment bg-white hover:-translate-y-0.5 hover:shadow-sm dark:border-dm-border dark:bg-dm-surface'
              }`}
              style={
                isActive
                  ? { borderColor: accent, backgroundColor: `${accent}14`, boxShadow: `0 6px 16px ${accent}22` }
                  : undefined
              }
            >
              {isActive && (
                <span className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: accent }} />
              )}
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: accent }}
              >
                <Icon className="w-6 h-6" style={{ color: iconOnAccent }} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span
                  className="text-2xl font-bold leading-none"
                  style={{ color: accent }}
                >
                  {t.count}
                </span>
                <span
                  className="mt-1 truncate text-sm font-medium text-warm-gray dark:text-dm-text-muted"
                  style={isActive ? { color: accent } : undefined}
                >
                  {t.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Toolbar ─────────────────────────────────── */}
      <motion.div
        key={`toolbar-${activeTab}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.1, delay: 0.05 }}
        className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between"
      >
        <div className="flex gap-3 flex-wrap">
          {/* Search */}
          <div className="relative" data-tour="registry-search">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
            <input
              type="text"
              placeholder={getLabel('registry.search', 'Search by name, book/page, officiant...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-64 pl-9 pr-3 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
            />
          </div>
          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="cos-btn cos-btn-secondary h-9 px-4 text-sm"
            >
              <Filter className="w-4 h-4" />
              Filters
              <ChevronDown className={`w-3 h-3 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {filterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-dm-surface rounded-xl shadow-lg border border-parchment dark:border-dm-border z-30 p-4 space-y-3"
                >
                  <div>
                    <label className="label block text-warm-gray mb-1">Officiant</label>
                    <select
                      value={officiantFilter}
                      onChange={(e) => setOfficiantFilter(e.target.value)}
                      className="w-full h-9 rounded-md border border-parchment bg-white text-sm dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                    >
                      <option value="">All Officiants</option>
                      {officiants.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label block text-warm-gray mb-1">Status</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full h-9 rounded-md border border-parchment bg-white text-sm dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                    >
                      <option value="">All Statuses</option>
                      <option value="Active">Active</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Annotated">Annotated</option>
                      <option value="Annulled">Annulled</option>
                      <option value="Dispensed">Dispensed</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block text-warm-gray mb-1">Year</label>
                    <select
                      value={yearFilter}
                      onChange={(e) => setYearFilter(e.target.value)}
                      className="w-full h-9 rounded-md border border-parchment bg-white text-sm dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                    >
                      <option value="">All Years</option>
                      {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  {(statusFilter || yearFilter || officiantFilter) && (
                    <button
                      onClick={() => { setStatusFilter(''); setYearFilter(''); setOfficiantFilter(''); }}
                      className="w-full text-xs text-gold hover:underline text-left"
                    >
                      Clear all filters
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Edit Templates */}
          <button
            onClick={() => setTemplateModal(true)}
            className="cos-btn cos-btn-secondary h-9 px-4 text-sm"
          >
            <Code className="w-4 h-4" />
            Edit Templates
          </button>
          {/* Archived (soft-deleted) records */}
          <button
            onClick={() => setShowArchived(!showArchived)}
            className={`cos-btn h-9 px-4 text-sm ${showArchived ? 'cos-btn-primary' : 'cos-btn-secondary'}`}
            title="Show archived (deleted) records for this register"
          >
            <Archive className="w-4 h-4" />
            Archived ({archivedCount})
          </button>
        </div>

        <div className="flex gap-3">
          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setExportOpen(!exportOpen)}
              className="cos-btn cos-btn-secondary h-9 px-4 text-sm"
            >
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className={`w-3 h-3 transition-transform ${exportOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
              {exportOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-dm-surface rounded-xl shadow-lg border border-parchment dark:border-dm-border z-30 py-1"
                >
                  {[
                    { label: 'Export as CSV', onClick: handleExportCSV },
                    { label: 'Export as Excel (CSV)', onClick: handleExportCSV },
                    { label: 'Print List', onClick: handlePrintList },
                  ].map((item) => (
                    <button
                      key={item.label}
                      className="w-full text-left px-4 py-2.5 text-sm text-charcoal hover:bg-cream-dark dark:text-dm-text dark:hover:bg-dm-surface-raised transition-colors"
                      onClick={item.onClick}
                    >
                      {item.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Add */}
          <button
            onClick={() => { setEditingRecord(null); setRecordModal('add'); }}
            className="cos-btn cos-btn-primary h-9 px-4 text-sm"
            data-tour="registry-add"
          >
            <Plus className="w-4 h-4" />
            {getLabel('registry.add', 'Add Record')}
          </button>
        </div>
      </motion.div>

      {/* ── Overdue-scheduled alert banner (nudge — never blocks) ── */}
      {!showArchived && (activeOverdueCount > 0 || showOverdueOnly) && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-error/40 bg-error/[0.08] px-4 py-3">
          <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            {activeOverdueCount > 0 ? (
              <>
                <p className="body-md font-semibold text-charcoal dark:text-dm-text">
                  {activeOverdueCount} {activeConfig.label.toLowerCase()} {activeOverdueCount === 1 ? 'ceremony has' : 'ceremonies have'} passed but {activeOverdueCount === 1 ? "isn't" : "aren't"} closed out
                </p>
                <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-0.5">
                  Mark {activeOverdueCount === 1 ? 'it' : 'them'} solemnized or cancelled to keep the register accurate.
                </p>
              </>
            ) : (
              <p className="body-md text-charcoal dark:text-dm-text">No overdue {activeConfig.label.toLowerCase()} records in this tab.</p>
            )}
          </div>
          <button
            onClick={() => setShowOverdueOnly((v) => !v)}
            className="cos-btn cos-btn-secondary h-8 px-3 text-xs shrink-0"
          >
            {showOverdueOnly ? 'Show all' : 'Show only these'}
          </button>
        </div>
      )}

      {/* ── Data Table / Empty State ──────────────── */}
      <AnimatePresence>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          {(getData() as unknown as Record<string, unknown>[]).length === 0 ? (
            showArchived ? (
              <EmptyState
                icon={Archive}
                title="No archived records"
                description={`Deleted ${activeConfig.label.toLowerCase()} records are kept here and can be restored at any time.`}
              />
            ) : (
            <EmptyState
              icon={BookOpen}
              title={getLabel('registry.empty.title', `No ${activeConfig.label.toLowerCase()} records yet`)}
              description={getLabel('registry.empty.description', `When you start recording ${activeConfig.label.toLowerCase()} records, they'll appear here. Click 'Add New Record' to begin!`)}
              tip={getLabel('registry.empty.tip', 'You can also search existing records by name or date.')}
              actionLabel={getLabel('registry.add', 'Add Record')}
              actionIcon={Plus}
              onAction={() => { setEditingRecord(null); setRecordModal('add'); }}
            />
            )
          ) : (
            <DataTable
              columns={getColumns() as unknown as Column<Record<string, unknown>>[]}
              data={getData() as unknown as Record<string, unknown>[]}
              actionsColumn={(row: Record<string, unknown>) => (
                <div
                  data-record-id={(row as unknown as { id: string }).id}
                  className={`flex items-center gap-1 rounded-md transition-all ${
                    highlightId && highlightId === (row as unknown as { id: string }).id
                      ? 'ring-2 ring-gold bg-gold-glow px-1'
                      : ''
                  }`}
                >
                  {showArchived ? (
                    <button
                      onClick={() => handleRestore((row as unknown as { id: string }).id)}
                      className="p-1.5 rounded-md text-warm-gray hover:text-success hover:bg-success/10 transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  ) : (
                    (() => {
                      const rec = row as unknown as RegistryRecord;
                      const st = recordStatus(rec);
                      const canCert = st === 'solemnized';
                      return (
                        <>
                          <button
                            onClick={() => handleEdit(row as unknown as BaptismRecord & MarriageRecord & ConfirmationRecord & DeathRecord)}
                            className="p-1.5 rounded-md text-warm-gray hover:text-charcoal hover:bg-cream-dark dark:text-dm-text-muted dark:hover:text-dm-text dark:hover:bg-dm-surface-raised transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {/* ── Lifecycle status changes ── */}
                          {st !== 'solemnized' && (
                            <button
                              onClick={() => applyLifecycle(rec.id, 'solemnized')}
                              className="p-1.5 rounded-md text-warm-gray hover:text-success hover:bg-success/10 transition-colors"
                              title="Mark as solemnized"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {st !== 'scheduled' && (
                            <button
                              onClick={() => applyLifecycle(rec.id, 'scheduled')}
                              className="p-1.5 rounded-md text-warm-gray hover:text-charcoal hover:bg-cream-dark dark:text-dm-text-muted dark:hover:text-dm-text dark:hover:bg-dm-surface-raised transition-colors"
                              title="Reset to scheduled"
                            >
                              <Clock className="w-4 h-4" />
                            </button>
                          )}
                          {st !== 'cancelled' && (
                            <button
                              onClick={() => handleCancelRecord(rec.id)}
                              className="p-1.5 rounded-md text-warm-gray hover:text-error hover:bg-error/10 transition-colors"
                              title="Cancel record"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                          {/* ── Certificate — SOLEMNIZED only ── */}
                          <button
                            onClick={() => handleGenerateCert(rec)}
                            disabled={!canCert}
                            className={`p-1.5 rounded-md transition-colors ${canCert ? 'text-warm-gray hover:text-gold hover:bg-cream-dark' : 'text-warm-gray/40 cursor-not-allowed'}`}
                            title={canCert ? 'Generate Certificate' : st === 'cancelled' ? 'This record is cancelled — no certificate' : 'Not yet solemnized — no certificate'}
                            data-tour="registry-certificate"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete((row as unknown as { id: string }).id)}
                            className="p-1.5 rounded-md text-warm-gray hover:text-error hover:bg-error/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      );
                    })()
                  )}
                </div>
              )}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Record Modal ───────────────────────────── */}
      <AnimatePresence>
        {recordModal && (
          <RecordModal
            type={recordModal}
            sacrament={activeTab}
            record={editingRecord}
            baptismRegister={bData}
            parishioners={parishionerLookup}
            onClose={() => { setRecordModal(null); setEditingRecord(null); }}
            onSave={handleSaveRecord}
            onToast={addToast}
          />
        )}
      </AnimatePresence>

      {/* ── Certificate Modal ──────────────────────── */}
      <AnimatePresence>
        {certModal && certRecord && (
          <CertificateModal record={certRecord} sacrament={activeTab} onClose={() => setCertModal(false)} onToast={addToast} />
        )}
      </AnimatePresence>

      {/* ── Template Editor Modal ──────────────────── */}
      <AnimatePresence>
        {templateModal && <TemplateEditorModal onClose={() => setTemplateModal(false)} onToast={addToast} />}
      </AnimatePresence>

      {/* ── Delete Confirmation ────────────────────── */}
      <ConfirmationDialog
        isOpen={deleteDialog.open}
        title={`Delete ${activeConfig.label} Record`}
        message={`Are you sure you want to delete this ${activeConfig.label.toLowerCase()} record? It will be moved to the Archived view, where it can be restored.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog({ open: false, id: '' })}
      />

      {/* ── Cancel-record Confirmation ─────────────── */}
      <ConfirmationDialog
        isOpen={cancelDialog.open}
        title={`Cancel ${activeConfig.label} Record`}
        message={`Mark this ${activeConfig.label.toLowerCase()} record as cancelled? It stays on file for the audit trail (flagged, de-emphasized) but is NOT certifiable and is NOT counted as a conferred sacrament. The calendar slot is kept — free it manually from the Calendar if needed.`}
        confirmLabel="Cancel record"
        cancelLabel="Keep as is"
        variant="warning"
        onConfirm={confirmCancelRecord}
        onCancel={() => setCancelDialog({ open: false, id: '' })}
      />

      {/* ── Toasts ─────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-toast space-y-3 w-[400px]">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
              className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border-l-4 bg-white dark:bg-dm-surface ${
                t.type === 'success' ? 'border-l-success' : t.type === 'error' ? 'border-l-error' : t.type === 'warning' ? 'border-l-warning' : 'border-l-info'
              }`}
            >
              {t.type === 'success' ? <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" /> :
               t.type === 'error' ? <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" /> :
               t.type === 'warning' ? <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" /> :
               <Sparkles className="w-5 h-5 text-info flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="body-sm text-charcoal dark:text-dm-text">{t.message}</p>
              </div>
              <button onClick={() => removeToast(t.id)} className="text-warm-gray hover:text-charcoal dark:text-dm-text-muted">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* =====================================================================
   ParishionerLookupAutocomplete — searchable dropdown for person fields
   ===================================================================== */
function ParishionerLookupAutocomplete({
  label,
  options,
  value,
  onChange,
  onSelect,
  error,
  placeholder = 'Type a name...',
  required = false,
}: {
  label: string;
  /** Live directory lookup (built from the persisted families store). */
  options: ParishionerLookup[];
  value: string;
  onChange: (v: string) => void;
  onSelect: (p: ParishionerLookup) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    return options
      .filter((p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query, options]);

  const handleInputChange = (v: string) => {
    setQuery(v);
    onChange(v);
    setOpen(true);
  };

  const handleSelect = (p: ParishionerLookup) => {
    onSelect(p);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="label block text-warm-gray mb-1">
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-gray pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => { if (query.length >= 1) setOpen(true); }}
          placeholder={placeholder}
          className={`h-9 w-full pl-8 pr-3 rounded-md border bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text ${
            error ? 'border-error' : 'border-parchment focus:border-gold'
          }`}
        />
      </div>
      {error && <p className="text-error text-xs mt-1">{error}</p>}

      <AnimatePresence>
        {open && filtered.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-dm-surface rounded-lg shadow-lg border border-parchment dark:border-dm-border z-dropdown max-h-64 overflow-y-auto"
          >
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelect(p)}
                className="w-full text-left px-3 py-2.5 hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors border-b border-parchment/30 dark:border-dm-border/30 last:border-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-charcoal dark:text-dm-text">{p.fullName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold-glow text-gold font-medium">{p.role}</span>
                </div>
                <div className="text-xs text-warm-gray dark:text-dm-text-muted mt-0.5">
                  {p.familyName} family — {p.address}
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* =====================================================================
   SectionHeader — form section divider
   ===================================================================== */
function SectionHeader({ icon: Icon, title, color }: { icon: React.ElementType; title: string; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <Icon className="w-4 h-4" style={{ color }} />
      <h3 className="heading-sm text-deep-navy dark:text-dm-text uppercase label tracking-wider">{title}</h3>
    </div>
  );
}

/* =====================================================================
   SacramentRequirementsChecklist — STAFF-side "did the family bring the
   papers / do the prep" checklist, reusing the shared sacramentRequirements
   catalog (same source of truth the parishioner portal uses). WARN-ONLY:
   nothing here blocks a save — it just tracks what's submitted and surfaces
   what's still pending. Requirements are grouped by kind with small headers,
   each detail surfaced through the existing HelpTooltip.
   ===================================================================== */
const REQ_KIND_META: Record<RequirementKind, { label: string; bg: string; fg: string }> = {
  document: { label: 'Documents', bg: '#EEF3F8', fg: '#3D6285' },
  preparation: { label: 'Preparation', bg: '#EFF6F1', fg: '#2D6A4F' },
  sponsor: { label: 'Sponsors', bg: '#F6EFF6', fg: '#7A4E7E' },
  eligibility: { label: 'Eligibility', bg: '#FAF3E4', fg: '#96690F' },
};
const REQ_KIND_ORDER: RequirementKind[] = ['document', 'preparation', 'sponsor', 'eligibility'];

function SacramentRequirementsChecklist({
  sacramentKey,
  checkedIds,
  onToggle,
}: {
  sacramentKey: string;
  checkedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  const info = getSacramentInfo(sacramentKey);
  if (!info) return null;

  const checked = new Set(checkedIds);
  const total = info.requirements.length;
  const done = info.requirements.filter((r) => checked.has(r.id)).length;
  const complete = done === total && total > 0;
  const ack = buildAckSummary(info, checkedIds); // reuse the shared summary builder

  return (
    <div className="border-t border-parchment dark:border-dm-border pt-5">
      <SectionHeader icon={ClipboardCheck} title="Requirements Checklist" color="#3D6285" />
      <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">
        Tick off what the family has submitted or completed. This never blocks saving — it only flags what is still pending.
      </p>

      {/* Completion status — green when complete, amber (persistent) when pending */}
      <div
        className={`mt-3 p-3 rounded-lg border flex items-start gap-2 ${
          complete ? 'bg-success/10 border-success/30' : 'bg-warning/10 border-warning/30'
        }`}
      >
        {complete ? (
          <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          {complete ? (
            <p className="body-sm text-success font-semibold">{done} of {total} submitted — all requirements complete</p>
          ) : (
            <>
              <p className="body-sm text-amber-700 dark:text-amber-400 font-semibold">
                {done} of {total} submitted — {total - done} still pending
              </p>
              <p className="body-xs text-amber-600 dark:text-amber-300 mt-0.5">
                Still pending: {ack.missing}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Requirements grouped by kind */}
      <div className="mt-3 space-y-4">
        {REQ_KIND_ORDER.map((kind) => {
          const items = info.requirements.filter((r) => r.kind === kind);
          if (items.length === 0) return null;
          const meta = REQ_KIND_META[kind];
          return (
            <div key={kind}>
              <span
                className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                style={{ backgroundColor: meta.bg, color: meta.fg }}
              >
                {meta.label}
              </span>
              <div className="mt-2 space-y-1">
                {items.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-start gap-2.5 cursor-pointer p-1.5 rounded-lg hover:bg-cream-dark/30 dark:hover:bg-dm-surface-raised/30 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(r.id)}
                      onChange={(e) => onToggle(r.id, e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-parchment text-gold focus:ring-2 focus:ring-gold/30 flex-shrink-0"
                    />
                    <span className="inline-flex items-start gap-0.5 body-sm text-charcoal dark:text-dm-text leading-snug">
                      {r.label}
                      {r.detail && <HelpTooltip text={r.detail} position="right" />}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =====================================================================
   Field — reusable form input
   ===================================================================== */
function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
  error,
  required = false,
  children,
  as,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  children?: React.ReactNode;
  as?: 'select' | 'textarea';
}) {
  const inputClasses = `h-9 w-full px-3 rounded-md border bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text ${
    error ? 'border-error' : 'border-parchment focus:border-gold'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  return (
    <div>
      <label className="label block text-warm-gray mb-1">
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </label>
      {as === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClasses + ' appearance-none'}
        >
          {children}
        </select>
      ) : as === 'textarea' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={3}
          className={`w-full px-3 py-2 rounded-md border bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text ${
            error ? 'border-error' : 'border-parchment focus:border-gold'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={inputClasses}
        />
      )}
      {error && <p className="text-error text-xs mt-1">{error}</p>}
    </div>
  );
}

/* =====================================================================
   ScheduleSection — ceremony scheduling with conflict detection
   ===================================================================== */
function ScheduleSection({
  sacrament,
  date,
  time,
  officiant,
  location,
  autoCalendar,
  onChangeDate,
  onChangeTime,
  onChangeOfficiant,
  onChangeLocation,
  onChangeAutoCalendar,
  eventTitle,
  errors,
}: {
  sacrament: SacramentTab;
  date: string;
  time: string;
  officiant: string;
  location: string;
  autoCalendar: boolean;
  onChangeDate: (v: string) => void;
  onChangeTime: (v: string) => void;
  onChangeOfficiant: (v: string) => void;
  onChangeLocation: (v: string) => void;
  onChangeAutoCalendar: (v: boolean) => void;
  eventTitle: string;
  errors?: { date?: string; time?: string; officiant?: string };
}) {
  const [checked, setChecked] = useState(false);

  const timeOptions = sacrament === 'baptism' ? baptismTimes
    : sacrament === 'marriage' ? marriageTimes
    : sacrament === 'confirmation' ? confirmationTimes
    : burialTimes;

  const locOptions = sacrament === 'baptism' ? baptismLocations
    : sacrament === 'marriage' ? marriageLocations
    : sacrament === 'confirmation' ? confirmationLocations
    : burialLocations;

  const result = checkAvailability(date, time, officiant, location, sacrament);
  const day = date ? new Date(date + 'T00:00:00').getDay() : -1;

  const handleCheck = () => {
    setChecked(true);
  };

  return (
    <div className="border-t border-parchment dark:border-dm-border pt-5">
      <SectionHeader icon={Calendar} title={`Schedule ${sacrament === 'death' ? 'Burial' : sacrament.charAt(0).toUpperCase() + sacrament.slice(1)} Ceremony`} color="#3B6BC9" />

      {/* Scheduling rule notes */}
      {sacrament === 'baptism' && (
        <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">Baptisms are held Monday-Saturday only. Not on Sundays.</p>
      )}
      {sacrament === 'confirmation' && (
        <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">Confirmations are held Monday-Saturday only. Not on Sundays.</p>
      )}
      {sacrament === 'marriage' && (
        <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">Saturday is the preferred day for weddings. Weddings are prohibited during Lent.</p>
      )}
      {sacrament === 'death' && (
        <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">Burial services may be held any day including Sundays.</p>
      )}

      <div className="grid grid-cols-2 gap-4 mt-3">
        <Field label="Ceremony Date *" type="date" value={date} onChange={onChangeDate} error={errors?.date} required />
        <Field label="Time *" as="select" value={time} onChange={onChangeTime} error={errors?.time} required>
          <option value="">Select time...</option>
          {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-3">
        <Field label="Officiant *" as="select" value={officiant} onChange={onChangeOfficiant} error={errors?.officiant} required>
          <option value="">Select officiant...</option>
          {officiantOptions(officiant).map((o) => <option key={o} value={o}>{o}</option>)}
        </Field>
        <Field label="Location *" as="select" value={location} onChange={onChangeLocation} required>
          <option value="">Select location...</option>
          {locOptions.map((l) => <option key={l} value={l}>{l}</option>)}
        </Field>
      </div>

      {/* Conflict detection */}
      <div className="mt-3">
        <button
          onClick={handleCheck}
          type="button"
          className="cos-btn cos-btn-secondary h-8 px-3 text-xs"
        >
          <Clock className="w-3.5 h-3.5" />
          Check Calendar Availability
        </button>

        {checked && (
          <div className="mt-2">
            {result.available ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 text-success text-sm">
                <Check className="w-4 h-4" />
                Available — no conflicts detected
              </div>
            ) : (
              <div className="space-y-1.5">
                {result.conflicts.map((c, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    c.type === 'rule' ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'
                  }`}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {c.description}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {sacrament === 'marriage' && date && day === 6 && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-success/10 text-success text-sm">
            <Check className="w-4 h-4" />
            Saturday — preferred day for weddings
          </div>
        )}
      </div>

      {/* Auto-add to calendar */}
      <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCalendar}
            onChange={(e) => onChangeAutoCalendar(e.target.checked)}
            className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
          />
          <span className="body-sm text-charcoal dark:text-dm-text font-medium">Auto-add to parish calendar</span>
        </label>
      </div>
      {autoCalendar && (
        <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1 ml-6">
          Event: &ldquo;{eventTitle}&rdquo;
        </p>
      )}
    </div>
  );
}

/* =====================================================================
   MARRIAGE BOOKING PANEL — venue + live conflict detection
   =====================================================================
   Replaces the generic ScheduleSection for weddings. A booking holds a
   TIME WINDOW (start + editable duration) in a VENUE with an OFFICIANT.
   Availability is computed LIVE off KEYS.calendarEvents via the pure
   scheduling engine — no manual "check" button — and a real conflict
   HARD-BLOCKS Save (the parent reads schedule.blocked). One-venue parishes
   hide the venue picker entirely; multi-venue parishes get a picker plus
   capacity-aware free-venue suggestions when the chosen venue is busy.
*/
interface MarriageScheduleInfo {
  startMin: number | null;
  canCheck: boolean;
  venue: Venue | undefined;
  conflicts: BusyInterval[];
  freeVenues: VenueSuggestion[];
  lit: { blocked: boolean; note: string };
  blocked: boolean;
}

/** Pure: resolve the wedding's live availability from the current calendar. */
function computeMarriageSchedule(p: {
  date: string;
  time: string;
  officiant: string;
  duration: number;
  venueId: string;
  guests: number | '';
  excludeId?: string;
  venues: Venue[];
  events: CalendarEventLike[];
}): MarriageScheduleInfo {
  const startMin = parseTimeToMinutes(p.time);
  const canCheck = !!p.date && startMin != null;
  const venue =
    p.venues.find((v) => v.id === p.venueId) ??
    p.venues.find((v) => v.isDefault) ??
    p.venues[0];

  let conflicts: BusyInterval[] = [];
  if (canCheck) {
    const base = {
      date: p.date,
      startMin: startMin as number,
      durationMin: p.duration,
      officiant: p.officiant,
      excludeId: p.excludeId,
    };
    // Test each of the chosen venue's identifying tokens (id/name/location) so
    // both id-based bookings and legacy location-named sample events conflict;
    // findConflicts also folds in same-officiant conflicts regardless of venue.
    const tokens = venue
      ? [venue.id, venue.name, venue.location].filter((t): t is string => !!t && t.trim() !== '')
      : [''];
    const map = new Map<string, BusyInterval>();
    for (const tk of tokens.length ? tokens : ['']) {
      for (const c of findConflicts({ ...base, venueId: tk }, p.events)) map.set(c.id, c);
    }
    conflicts = [...map.values()].sort((a, b) => a.start - b.start);
  }

  const lit = p.date ? isLiturgicallyBlocked(p.date, 'wedding') : { blocked: false, note: '' };
  const guests = p.guests === '' ? null : Number(p.guests);
  const freeVenues = canCheck
    ? suggestFreeVenues(
        {
          date: p.date,
          startMin: startMin as number,
          durationMin: p.duration,
          officiant: p.officiant,
          excludeId: p.excludeId,
        },
        p.venues,
        p.events,
        guests,
      )
    : [];

  return { startMin, canCheck, venue, conflicts, freeVenues, lit, blocked: conflicts.length > 0 || lit.blocked };
}

/** Minutes-from-midnight → "2:30 PM". */
function minsToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? 'AM' : 'PM';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function MarriageScheduleSection({
  date,
  time,
  officiant,
  duration,
  expectedGuests,
  venueId,
  autoCalendar,
  multiVenue,
  venues,
  schedule,
  eventTitle,
  errors,
  onChangeDate,
  onChangeTime,
  onChangeOfficiant,
  onChangeDuration,
  onChangeGuests,
  onChangeVenue,
  onChangeAutoCalendar,
}: {
  date: string;
  time: string;
  officiant: string;
  duration: number;
  expectedGuests: number | '';
  venueId: string;
  autoCalendar: boolean;
  multiVenue: boolean;
  venues: Venue[];
  schedule: MarriageScheduleInfo;
  eventTitle: string;
  errors?: { date?: string; time?: string; officiant?: string };
  onChangeDate: (v: string) => void;
  onChangeTime: (v: string) => void;
  onChangeOfficiant: (v: string) => void;
  onChangeDuration: (v: number) => void;
  onChangeGuests: (v: number | '') => void;
  onChangeVenue: (id: string) => void;
  onChangeAutoCalendar: (v: boolean) => void;
}) {
  const { canCheck, venue, conflicts, freeVenues, lit, blocked } = schedule;
  const day = date ? new Date(date + 'T00:00:00').getDay() : -1;
  const venueName = venue?.name || 'the venue';
  const officiantLabel = officiant || 'the officiant';

  // Free venues to OFFER: shown only when the chosen venue is busy and switching
  // could actually help (an officiant double-booking frees none, so this stays
  // empty and we don't mislead the user into thinking a venue swap fixes it).
  const offerVenues =
    multiVenue && conflicts.length > 0 ? freeVenues.filter((s) => s.venue.id !== venue?.id) : [];

  return (
    <div className="border-t border-parchment dark:border-dm-border pt-5">
      <SectionHeader icon={Calendar} title="Schedule Marriage Ceremony" color="#3B6BC9" />
      <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">
        Saturday is the preferred day for weddings. Weddings are prohibited during Lent.
      </p>

      <div className="grid grid-cols-2 gap-4 mt-3">
        <Field label="Ceremony Date *" type="date" value={date} onChange={onChangeDate} error={errors?.date} required />
        <Field label="Time *" as="select" value={time} onChange={onChangeTime} error={errors?.time} required>
          <option value="">Select time...</option>
          {marriageTimes.map((t) => <option key={t} value={t}>{t}</option>)}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4 mt-3">
        <Field
          label="Duration (minutes) *"
          type="number"
          value={String(duration || '')}
          onChange={(v) => onChangeDuration(Math.max(0, parseInt(v) || 0))}
          placeholder="90"
          required
        />
        <Field
          label="Expected Guests"
          type="number"
          value={expectedGuests === '' ? '' : String(expectedGuests)}
          onChange={(v) => onChangeGuests(v === '' ? '' : Math.max(0, parseInt(v) || 0))}
          placeholder="e.g. 120"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 mt-3">
        <Field label="Officiant *" as="select" value={officiant} onChange={onChangeOfficiant} error={errors?.officiant} required>
          <option value="">Select officiant...</option>
          {officiantOptions(officiant).map((o) => <option key={o} value={o}>{o}</option>)}
        </Field>
        {/* One-venue parish → no venue picker (stays simple, uses the single venue). */}
        {multiVenue && (
          <Field label="Venue *" as="select" value={venueId} onChange={onChangeVenue} required>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}{v.capacity ? ` (${v.capacity} seats)` : ''}
              </option>
            ))}
          </Field>
        )}
      </div>

      {/* LIVE availability — computed automatically, no manual check button. */}
      <div className="mt-3">
        {!canCheck ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50 text-warm-gray dark:text-dm-text-muted text-sm">
            <Clock className="w-4 h-4 flex-shrink-0" />
            Enter a date and time to check availability.
          </div>
        ) : conflicts.length > 0 ? (
          <div className="space-y-1.5">
            {conflicts.map((c) => {
              const where = c.location || c.venueId || (c.officiant ? c.officiant : venueName);
              return (
                <div key={c.id} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-error/10 text-error text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Conflict: <strong>{c.title || 'An event'}</strong> is already booked{' '}
                    {minsToLabel(c.start)}–{minsToLabel(c.end)} at {where}
                    {c.officiant && officiant && c.officiant.trim().toLowerCase() === officiant.trim().toLowerCase()
                      ? ` (${c.officiant} is unavailable)` : ''}.
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-success/10 text-success text-sm">
            <Check className="w-4 h-4 flex-shrink-0" />
            No conflict — {venueName} and {officiantLabel} are free at this time.
          </div>
        )}

        {/* Liturgical advisory / block (e.g. weddings in Lent). */}
        {lit.note && (
          <div className={`flex items-start gap-2 mt-2 px-3 py-2 rounded-lg text-sm ${
            lit.blocked ? 'bg-error/10 text-error' : 'bg-warning/10 text-warning'
          }`}>
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {lit.note}
          </div>
        )}

        {/* Multi-venue: offer the venues that ARE free, capacity-aware. */}
        {offerVenues.length > 0 && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50">
            <p className="body-xs font-medium text-charcoal dark:text-dm-text mb-1.5">
              These venues are free for this slot — switch to one:
            </p>
            <div className="flex flex-wrap gap-2">
              {offerVenues.map((s) => (
                <button
                  key={s.venue.id}
                  type="button"
                  onClick={() => onChangeVenue(s.venue.id)}
                  className={`cos-btn cos-btn-secondary h-8 px-3 text-xs ${s.fits ? '' : 'opacity-70'}`}
                  title={s.fits ? '' : `May be too small for ${expectedGuests} guests`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  {s.venue.name}
                  {s.venue.capacity ? ` · ${s.venue.capacity}` : ''}
                  {!s.fits ? ' · too small' : ''}
                </button>
              ))}
            </div>
          </div>
        )}

        {blocked && (
          <p className="body-xs text-error mt-2">
            This record cannot be saved into a scheduling conflict. Adjust the date, time, duration
            {multiVenue ? ', venue' : ''} or officiant.
          </p>
        )}

        {day === 6 && !blocked && (
          <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg bg-success/10 text-success text-sm">
            <Check className="w-4 h-4" />
            Saturday — preferred day for weddings.
          </div>
        )}
      </div>

      {/* Auto-add to calendar */}
      <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCalendar}
            onChange={(e) => onChangeAutoCalendar(e.target.checked)}
            className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
          />
          <span className="body-sm text-charcoal dark:text-dm-text font-medium">Auto-add to parish calendar</span>
        </label>
      </div>
      {autoCalendar && (
        <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1 ml-6">
          Event: &ldquo;{eventTitle}&rdquo;
        </p>
      )}
    </div>
  );
}

/* =====================================================================
   PaymentSection — Sacrament fee collection with GL posting
   ===================================================================== */
function PaymentSection({
  sacrament,
  paymentInfo,
  onChange,
  error,
}: {
  sacrament: SacramentTab;
  paymentInfo: PaymentInfo;
  onChange: (p: PaymentInfo) => void;
  error?: string;
}) {
  const currency = getCurrencySymbol();
  const feeItem = getFeeForSacrament(
    sacrament === 'baptism' ? 'Baptism'
      : sacrament === 'marriage' ? 'Marriage'
      : sacrament === 'confirmation' ? 'Confirmation'
      : 'Death'
  );
  const ceremonyFee = feeItem?.ceremonyFee ?? 0;
  const sacramentLabel = sacrament === 'death' ? 'Death / Funeral'
    : sacrament === 'baptism' ? 'Baptism'
    : sacrament === 'marriage' ? 'Marriage'
    : 'Confirmation';

  const update = (partial: Partial<PaymentInfo>) => {
    onChange({ ...paymentInfo, ...partial });
  };

  /* Show warning when a non-default (override) option is selected */
  const isOverride = paymentInfo.status !== 'collect_now';

  return (
    <div className="border-t border-parchment dark:border-dm-border pt-5">
      <SectionHeader icon={FileText} title="Sacrament Fee" color="#C9963B" />

      {/* Fee display */}
      <div className="mt-2 p-3 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50">
        <p className="body-sm text-charcoal dark:text-dm-text font-medium">
          Standard <span className="capitalize">{sacramentLabel}</span> fee: {currency}{ceremonyFee.toLocaleString()}
        </p>
        <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-0.5">
          Fees are set by the parish. Contact parish office to modify.
        </p>
      </div>

      {/* Override warning banner */}
      {isOverride && (
        <div className="mt-3 p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <p className="body-sm text-amber-700 dark:text-amber-400 font-semibold">Override Required</p>
            <p className="body-xs text-amber-600 dark:text-amber-300 mt-0.5">
              You selected &ldquo;{paymentInfo.status === 'collected' ? 'Fee already collected' : paymentInfo.status === 'waived' ? 'Fee waived' : 'Bill later'}&rdquo; — this is a non-standard fee handling.
              A reason is required below. This will be logged for audit.
            </p>
          </div>
        </div>
      )}

      {/* Radio options */}
      <div className="mt-4 space-y-4">
        {/* Collect now — DEFAULT, no override needed */}
        <label className="flex items-start gap-3 cursor-pointer p-2 rounded-lg hover:bg-cream-dark/30 dark:hover:bg-dm-surface-raised/30 transition-colors">
          <input
            type="radio"
            name={`payment-status-${sacrament}`}
            checked={paymentInfo.status === 'collect_now'}
            onChange={() => update({ status: 'collect_now', amount: ceremonyFee, overrideReason: '' })}
            className="mt-0.5 w-4 h-4 rounded-full border-parchment text-gold focus:ring-gold"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="body-sm text-charcoal dark:text-dm-text font-semibold">Collect now</span>
              <span className="cos-badge cos-badge-success">DEFAULT</span>
            </div>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-0.5">
              Record payment and auto-post to General Ledger. Recommended for all sacraments.
            </p>
            {paymentInfo.status === 'collect_now' && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="label block text-warm-gray mb-1">Amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-warm-gray">{currency}</span>
                    <input
                      type="number"
                      value={paymentInfo.amount}
                      onChange={(e) => update({ amount: parseInt(e.target.value) || 0 })}
                      className="h-9 w-full pl-8 pr-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                    />
                  </div>
                </div>
                <div>
                  <label className="label block text-warm-gray mb-1">Method</label>
                  <select
                    value={paymentInfo.method}
                    onChange={(e) => update({ method: e.target.value as PaymentInfo['method'] })}
                    className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Check">Check</option>
                    <option value="GCash">GCash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="label block text-warm-gray mb-1">Receipt #</label>
                  <input
                    type="text"
                    value={paymentInfo.receiptNumber}
                    onChange={(e) => update({ receiptNumber: e.target.value })}
                    placeholder="e.g., OR-1234"
                    className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                </div>
                <div>
                  <label className="label block text-warm-gray mb-1">Date</label>
                  <input
                    type="date"
                    value={paymentInfo.date}
                    onChange={(e) => update({ date: e.target.value })}
                    className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                </div>
                <div>
                  <label className="label block text-warm-gray mb-1">Received by</label>
                  <select
                    value={paymentInfo.receivedBy}
                    onChange={(e) => update({ receivedBy: e.target.value })}
                    className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
                  >
                    <option>Secretary</option>
                    <option>Fr. Reyes</option>
                    <option>Fr. Santos</option>
                    <option>Treasurer</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </label>

        {/* Fee already collected — OVERRIDE REQUIRED */}
        <label className={`flex items-start gap-3 cursor-pointer p-2 rounded-lg transition-colors ${paymentInfo.status === 'collected' ? 'bg-warning/8 border border-warning/20' : 'hover:bg-cream-dark/30 dark:hover:bg-dm-surface-raised/30 opacity-70'}`}>
          <input
            type="radio"
            name={`payment-status-${sacrament}`}
            checked={paymentInfo.status === 'collected'}
            onChange={() => update({ status: 'collected', amount: ceremonyFee })}
            className="mt-0.5 w-4 h-4 rounded-full border-parchment text-gold focus:ring-gold"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="body-sm text-charcoal dark:text-dm-text font-medium">Fee already collected</span>
              <span className="cos-badge cos-badge-warning">OVERRIDE</span>
            </div>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-0.5">
              Use only when payment was received before this record is being created.
            </p>
            {paymentInfo.status === 'collected' && (
              <div className="mt-2">
                <label className="label block text-amber-700 dark:text-amber-400 mb-1 font-medium">
                  Override reason <span className="text-error">*</span>
                </label>
                <textarea
                  value={paymentInfo.overrideReason}
                  onChange={(e) => update({ overrideReason: e.target.value })}
                  placeholder="Explain when and how the fee was collected before this record..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-md border border-warning/40 bg-warning/5 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-warning dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                />
                <p className="body-xs text-amber-600 dark:text-amber-300 mt-1">
                  This reason will be saved to the audit log. Be specific: date collected, who received it, receipt number if available.
                </p>
                {error && (
                  <p className="text-error text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </label>

        {/* Waived — OVERRIDE REQUIRED */}
        <label className={`flex items-start gap-3 cursor-pointer p-2 rounded-lg transition-colors ${paymentInfo.status === 'waived' ? 'bg-warning/8 border border-warning/20' : 'hover:bg-cream-dark/30 dark:hover:bg-dm-surface-raised/30 opacity-70'}`}>
          <input
            type="radio"
            name={`payment-status-${sacrament}`}
            checked={paymentInfo.status === 'waived'}
            onChange={() => update({ status: 'waived', amount: ceremonyFee })}
            className="mt-0.5 w-4 h-4 rounded-full border-parchment text-gold focus:ring-gold"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="body-sm text-charcoal dark:text-dm-text font-medium">Waived</span>
              <span className="cos-badge cos-badge-warning">OVERRIDE</span>
            </div>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-0.5">
              Fee exemption requires documented reason and priest approval.
            </p>
            {paymentInfo.status === 'waived' && (
              <div className="mt-2 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label block text-warm-gray mb-1">Waiver category</label>
                    <select
                      value={paymentInfo.waiveReason}
                      onChange={(e) => update({ waiveReason: e.target.value })}
                      className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
                    >
                      <option>Financial hardship</option>
                      <option>Parish staff</option>
                      <option>Bishop dispensation</option>
                      <option>Other (specify in reason)</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block text-warm-gray mb-1">Approved by</label>
                    <select
                      value={paymentInfo.waiveApprovedBy}
                      onChange={(e) => update({ waiveApprovedBy: e.target.value })}
                      className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
                    >
                      <option>Fr. Reyes</option>
                      <option>Fr. Santos</option>
                      <option>Bishop</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label block text-amber-700 dark:text-amber-400 mb-1 font-medium">
                    Override reason <span className="text-error">*</span>
                  </label>
                  <textarea
                    value={paymentInfo.overrideReason}
                    onChange={(e) => update({ overrideReason: e.target.value })}
                    placeholder="Document why the fee is being waived and who approved it..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border border-warning/40 bg-warning/5 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-warning dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                  <p className="body-xs text-amber-600 dark:text-amber-300 mt-1">
                    Both category + detailed reason are required. This creates an audit trail.
                  </p>
                  {error && (
                    <p className="text-error text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      {error}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </label>

        {/* Bill later — OVERRIDE REQUIRED */}
        <label className={`flex items-start gap-3 cursor-pointer p-2 rounded-lg transition-colors ${paymentInfo.status === 'bill_later' ? 'bg-warning/8 border border-warning/20' : 'hover:bg-cream-dark/30 dark:hover:bg-dm-surface-raised/30 opacity-70'}`}>
          <input
            type="radio"
            name={`payment-status-${sacrament}`}
            checked={paymentInfo.status === 'bill_later'}
            onChange={() => update({ status: 'bill_later', amount: ceremonyFee })}
            className="mt-0.5 w-4 h-4 rounded-full border-parchment text-gold focus:ring-gold"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="body-sm text-charcoal dark:text-dm-text font-medium">Bill later</span>
              <span className="cos-badge cos-badge-warning">OVERRIDE</span>
            </div>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-0.5">
              Adds to Accounts Receivable. Use only for approved parishioner credit.
            </p>
            {paymentInfo.status === 'bill_later' && (
              <div className="mt-2 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label block text-warm-gray mb-1">Amount</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-warm-gray">{currency}</span>
                      <input
                        type="number"
                        value={paymentInfo.amount}
                        onChange={(e) => update({ amount: parseInt(e.target.value) || 0 })}
                        className="h-9 w-full pl-8 pr-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label block text-warm-gray mb-1">Due date</label>
                    <input
                      type="date"
                      value={paymentInfo.dueDate}
                      onChange={(e) => update({ dueDate: e.target.value })}
                      className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                    />
                  </div>
                </div>
                <div>
                  <label className="label block text-amber-700 dark:text-amber-400 mb-1 font-medium">
                    Override reason <span className="text-error">*</span>
                  </label>
                  <textarea
                    value={paymentInfo.overrideReason}
                    onChange={(e) => update({ overrideReason: e.target.value })}
                    placeholder="Explain why payment is being deferred and when it will be collected..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border border-warning/40 bg-warning/5 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-warning dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                  <p className="body-xs text-amber-600 dark:text-amber-300 mt-1">
                    Both due date + reason are required. This creates an audit trail and AR entry.
                  </p>
                  {error && (
                    <p className="text-error text-xs mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 flex-shrink-0" />
                      {error}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </label>
      </div>
    </div>
  );
}

/* =====================================================================
   RecordModal — Add/Edit sacramental record (all 4 sacraments)
   ===================================================================== */
function RecordModal({
  type,
  sacrament,
  record,
  baptismRegister,
  parishioners,
  onClose,
  onSave,
  onToast,
}: {
  type: 'add' | 'edit';
  sacrament: SacramentTab;
  record: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord | null;
  /** Full baptism register — the confirmation form's "link baptism record" picker searches it. */
  baptismRegister: BaptismRecord[];
  /** Live directory lookup — every parishioner picker searches this. */
  parishioners: ParishionerLookup[];
  onClose: () => void;
  onSave: (r: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord) => void;
  onToast: (msg: string, type: ToastType) => void;
}) {
  const isEdit = type === 'edit';

  /* ── MARGINAL ANNOTATIONS (structured; saved with the record) ── */
  const [annotations, setAnnotations] = useState<RegistryAnnotation[]>(() => (record?.annotations ? [...record.annotations] : []));
  const handleAddAnnotation = (annType: RegistryAnnotationType, text: string) => {
    setAnnotations((prev) => [
      ...prev,
      { id: newAnnotationId(), date: todayISO(), type: annType, text, by: getCurrentUserName() },
    ]);
  };
  // Void = strike through, never erase. Persisted with the record on Save;
  // handleSaveRecord writes one audit line per newly-voided annotation.
  const handleVoidAnnotation = (id: string) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, voided: true } : a)));
  };

  /* ── BAPTISM FORM STATE ── */
  const [bForm, setBForm] = useState<Partial<BaptismRecord>>(() => {
    const r = record as BaptismRecord | null;
    return {
      registryNumber: r?.registryNumber || '',
      childLastName: r?.childLastName || '', childFirstName: r?.childFirstName || '', childMiddleName: r?.childMiddleName || '',
      dateOfBirth: r?.dateOfBirth || '', placeOfBirthCity: r?.placeOfBirthCity || 'Mabalacat', placeOfBirthProvince: r?.placeOfBirthProvince || 'Pampanga', gender: r?.gender || 'Male',
      fatherLastName: r?.fatherLastName || '', fatherFirstName: r?.fatherFirstName || '', fatherMiddleName: r?.fatherMiddleName || '', fatherParishionerId: r?.fatherParishionerId || '',
      motherLastName: r?.motherLastName || '', motherFirstName: r?.motherFirstName || '', motherMiddleName: r?.motherMiddleName || '', motherMaidenName: r?.motherMaidenName || '', motherParishionerId: r?.motherParishionerId || '',
      godfatherLastName: r?.godfatherLastName || '', godfatherFirstName: r?.godfatherFirstName || '', godfatherParishionerId: r?.godfatherParishionerId || '',
      godmotherLastName: r?.godmotherLastName || '', godmotherFirstName: r?.godmotherFirstName || '', godmotherParishionerId: r?.godmotherParishionerId || '',
      childParishionerId: r?.childParishionerId || '',
      addressStreet: r?.addressStreet || '', addressBarangay: r?.addressBarangay || BARANGAYS[0], addressSitio: r?.addressSitio || '', addressCity: r?.addressCity || CITIES[0], addressProvince: r?.addressProvince || PROVINCES[0],
      dateOfBaptism: r?.dateOfBaptism || '', timeOfBaptism: r?.timeOfBaptism || '9:00 AM', officiant: r?.officiant || '', bookNumber: r?.bookNumber || 1, pageNumber: r?.pageNumber || 1, notations: r?.notations || '', status: r?.status || 'Active',
      requirementsMet: r?.requirementsMet ? [...r.requirementsMet] : [],
      scheduledDate: r?.scheduledDate || '', scheduledTime: r?.scheduledTime || '9:00 AM', scheduledOfficiant: r?.scheduledOfficiant || '', scheduledLocation: r?.scheduledLocation || baptismLocations[0], calendarEventId: r?.calendarEventId || '',
    };
  });
  const [bAutoCalendar, setBAutoCalendar] = useState(true);
  const [bErrors, setBErrors] = useState<Record<string, string>>({});

  /* ── MARRIAGE FORM STATE ── */
  const [mForm, setMForm] = useState<Partial<MarriageRecord>>(() => {
    const r = record as MarriageRecord | null;
    return {
      registryNumber: r?.registryNumber || '',
      groomLastName: r?.groomLastName || '', groomFirstName: r?.groomFirstName || '', groomMiddleName: r?.groomMiddleName || '', groomAge: r?.groomAge || 25, groomStatus: r?.groomStatus || 'Single', groomFather: r?.groomFather || '', groomMother: r?.groomMother || '', groomParishionerId: r?.groomParishionerId || '',
      brideLastName: r?.brideLastName || '', brideFirstName: r?.brideFirstName || '', brideMiddleName: r?.brideMiddleName || '', brideAge: r?.brideAge || 25, brideStatus: r?.brideStatus || 'Single', brideFather: r?.brideFather || '', brideMother: r?.brideMother || '', brideParishionerId: r?.brideParishionerId || '',
      witness1Name: r?.witness1Name || '', witness1ParishionerId: r?.witness1ParishionerId || '', witness2Name: r?.witness2Name || '', witness2ParishionerId: r?.witness2ParishionerId || '',
      dateOfMarriage: r?.dateOfMarriage || '', timeOfMarriage: r?.timeOfMarriage || '10:00 AM', officiant: r?.officiant || '', bookNumber: r?.bookNumber || 1, pageNumber: r?.pageNumber || 1, notations: r?.notations || '', status: r?.status || 'Active',
      requirementsMet: r?.requirementsMet ? [...r.requirementsMet] : [],
      scheduledDate: r?.scheduledDate || '', scheduledTime: r?.scheduledTime || '10:00 AM', scheduledOfficiant: r?.scheduledOfficiant || '', scheduledLocation: r?.scheduledLocation || marriageLocations[0], calendarEventId: r?.calendarEventId || '',
    };
  });
  const [mAutoCalendar, setMAutoCalendar] = useState(true);
  const [mErrors, setMErrors] = useState<Record<string, string>>({});

  /* ── MARRIAGE BOOKING (venue + live conflict) ── */
  // Venues + the current calendar are read once per modal open (they don't
  // change while the form is up); availability recomputes on every field edit.
  const mVenues = useMemo(() => getActiveVenues(), []);
  const mMultiVenue = useMemo(() => isMultiVenue(), []);
  const mCalendarEvents = useMemo(
    () => ns.getJSON<CalendarEvent[]>(KEYS.calendarEvents, SAMPLE_EVENTS) as unknown as CalendarEventLike[],
    [],
  );
  const [mDuration, setMDuration] = useState<number>(90);
  const [mExpectedGuests, setMExpectedGuests] = useState<number | ''>('');
  const [mVenueId, setMVenueId] = useState<string>(() => {
    const r = record as MarriageRecord | null;
    if (r?.scheduledLocation) {
      const match = mVenues.find(
        (v) => v.name === r.scheduledLocation || v.location === r.scheduledLocation,
      );
      if (match) return match.id;
    }
    return (mVenues.find((v) => v.isDefault) ?? mVenues[0])?.id ?? '';
  });
  const mSchedule = useMemo(
    () =>
      computeMarriageSchedule({
        date: mForm.scheduledDate || '',
        time: mForm.scheduledTime || '',
        officiant: mForm.scheduledOfficiant || '',
        duration: mDuration,
        venueId: mVenueId,
        guests: mExpectedGuests,
        excludeId: (record as MarriageRecord | null)?.calendarEventId || undefined,
        venues: mVenues,
        events: mCalendarEvents,
      }),
    [
      mForm.scheduledDate,
      mForm.scheduledTime,
      mForm.scheduledOfficiant,
      mDuration,
      mVenueId,
      mExpectedGuests,
      mVenues,
      mCalendarEvents,
      record,
    ],
  );

  /* ── CONFIRMATION FORM STATE ── */
  const [cForm, setCForm] = useState<Partial<ConfirmationRecord>>(() => {
    const r = record as ConfirmationRecord | null;
    return {
      registryNumber: r?.registryNumber || '',
      confirmandLastName: r?.confirmandLastName || '', confirmandFirstName: r?.confirmandFirstName || '', confirmandMiddleName: r?.confirmandMiddleName || '', confirmandParishionerId: r?.confirmandParishionerId || '',
      dateOfBirth: r?.dateOfBirth || '', parishOfBaptism: r?.parishOfBaptism || 'St. Michael the Archangel Parish', dateOfBaptism: r?.dateOfBaptism || '',
      baptismRecordId: r?.baptismRecordId || '',
      officiant: r?.officiant || '', bishop: r?.bishop || 'Bishop Florentino Lavarias',
      sponsorLastName: r?.sponsorLastName || '', sponsorFirstName: r?.sponsorFirstName || '', sponsorParishionerId: r?.sponsorParishionerId || '',
      dateOfConfirmation: r?.dateOfConfirmation || '', timeOfConfirmation: r?.timeOfConfirmation || '9:00 AM', bookNumber: r?.bookNumber || 1, pageNumber: r?.pageNumber || 1, notations: r?.notations || '', status: r?.status || 'Active',
      requirementsMet: r?.requirementsMet ? [...r.requirementsMet] : [],
      scheduledDate: r?.scheduledDate || '', scheduledTime: r?.scheduledTime || '9:00 AM', scheduledOfficiant: r?.scheduledOfficiant || '', scheduledLocation: r?.scheduledLocation || confirmationLocations[0], calendarEventId: r?.calendarEventId || '',
    };
  });
  const [cAutoCalendar, setCAutoCalendar] = useState(true);
  const [cErrors, setCErrors] = useState<Record<string, string>>({});

  /* ── DEATH FORM STATE ── */
  const [dForm, setDForm] = useState<Partial<DeathRecord>>(() => {
    const r = record as DeathRecord | null;
    return {
      registryNumber: r?.registryNumber || '',
      deceasedLastName: r?.deceasedLastName || '', deceasedFirstName: r?.deceasedFirstName || '', deceasedMiddleName: r?.deceasedMiddleName || '', deceasedParishionerId: r?.deceasedParishionerId || '',
      age: r?.age || 0, gender: r?.gender || 'Male',
      dateOfDeath: r?.dateOfDeath || '', dateOfBurial: r?.dateOfBurial || '', timeOfBurial: r?.timeOfBurial || '9:00 AM', causeOfDeath: r?.causeOfDeath || '', cemetery: r?.cemetery || 'San Lorenzo Cemetery',
      officiant: r?.officiant || '', bookNumber: r?.bookNumber || 1, pageNumber: r?.pageNumber || 1, notations: r?.notations || '', status: r?.status || 'Active',
      requirementsMet: r?.requirementsMet ? [...r.requirementsMet] : [],
      scheduledDate: r?.scheduledDate || '', scheduledTime: r?.scheduledTime || '9:00 AM', scheduledOfficiant: r?.scheduledOfficiant || '', scheduledLocation: r?.scheduledLocation || burialLocations[0], calendarEventId: r?.calendarEventId || '',
    };
  });
  const [dAutoCalendar, setDAutoCalendar] = useState(true);
  const [dErrors, setDErrors] = useState<Record<string, string>>({});

  /* ── PAYMENT STATE ── */
  const sacramentLabel = sacrament === 'baptism' ? 'Baptism' : sacrament === 'marriage' ? 'Marriage' : sacrament === 'confirmation' ? 'Confirmation' : 'Death';
  const feeItem = getFeeForSacrament(sacramentLabel);
  const ceremonyFee = feeItem?.ceremonyFee ?? 0;

  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>(() =>
    defaultPaymentInfo(ceremonyFee)
  );
  const [paymentError, setPaymentError] = useState('');

  // Clear the inline override error when the reason or status changes, and
  // re-run PaymentSection with the new value.
  const handlePaymentChange = (p: PaymentInfo) => {
    if (paymentError) setPaymentError('');
    setPaymentInfo(p);
  };

  /* ── Update helpers ── */
  const bUpdate = (field: string, value: string | number | string[]) => {
    setBForm((prev) => ({ ...prev, [field]: value }));
    if (bErrors[field]) setBErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };
  const mUpdate = (field: string, value: string | number | string[]) => {
    setMForm((prev) => ({ ...prev, [field]: value }));
    if (mErrors[field]) setMErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };
  const cUpdate = (field: string, value: string | number | string[]) => {
    setCForm((prev) => ({ ...prev, [field]: value }));
    if (cErrors[field]) setCErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };
  const dUpdate = (field: string, value: string | number | string[]) => {
    setDForm((prev) => ({ ...prev, [field]: value }));
    if (dErrors[field]) setDErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  /* ── Parishioner select handlers ── */
  const handleChildSelect = (p: ParishionerLookup) => {
    bUpdate('childFirstName', p.firstName);
    bUpdate('childLastName', p.lastName);
    bUpdate('childMiddleName', p.middleName || '');
    bUpdate('childParishionerId', p.id);
  };
  const handleFatherSelect = (p: ParishionerLookup) => {
    bUpdate('fatherFirstName', p.firstName);
    bUpdate('fatherLastName', p.lastName);
    bUpdate('fatherMiddleName', p.middleName || '');
    bUpdate('fatherParishionerId', p.id);
  };
  const handleMotherSelect = (p: ParishionerLookup) => {
    bUpdate('motherFirstName', p.firstName);
    bUpdate('motherLastName', p.lastName);
    bUpdate('motherMiddleName', p.middleName || '');
    bUpdate('motherParishionerId', p.id);
  };
  const handleGodfatherSelect = (p: ParishionerLookup) => {
    bUpdate('godfatherFirstName', p.firstName);
    bUpdate('godfatherLastName', p.lastName);
    bUpdate('godfatherParishionerId', p.id);
  };
  const handleGodmotherSelect = (p: ParishionerLookup) => {
    bUpdate('godmotherFirstName', p.firstName);
    bUpdate('godmotherLastName', p.lastName);
    bUpdate('godmotherParishionerId', p.id);
  };
  const handleGroomSelect = (p: ParishionerLookup) => {
    mUpdate('groomFirstName', p.firstName);
    mUpdate('groomLastName', p.lastName);
    mUpdate('groomMiddleName', p.middleName || '');
    mUpdate('groomParishionerId', p.id);
  };
  const handleBrideSelect = (p: ParishionerLookup) => {
    mUpdate('brideFirstName', p.firstName);
    mUpdate('brideLastName', p.lastName);
    mUpdate('brideMiddleName', p.middleName || '');
    mUpdate('brideParishionerId', p.id);
  };
  const handleWitness1Select = (p: ParishionerLookup) => {
    mUpdate('witness1Name', `${p.firstName} ${p.lastName}`);
    mUpdate('witness1ParishionerId', p.id);
  };
  const handleWitness2Select = (p: ParishionerLookup) => {
    mUpdate('witness2Name', `${p.firstName} ${p.lastName}`);
    mUpdate('witness2ParishionerId', p.id);
  };
  const handleSponsorSelect = (p: ParishionerLookup) => {
    cUpdate('sponsorFirstName', p.firstName);
    cUpdate('sponsorLastName', p.lastName);
    cUpdate('sponsorParishionerId', p.id);
  };
  const handleDeceasedSelect = (p: ParishionerLookup) => {
    dUpdate('deceasedFirstName', p.firstName);
    dUpdate('deceasedLastName', p.lastName);
    dUpdate('deceasedMiddleName', p.middleName || '');
    dUpdate('deceasedParishionerId', p.id);
  };

  /* ── Fee Override Validation ── */
  const validatePaymentOverride = (): boolean => {
    if (paymentInfo.status === 'collect_now') return true; // default — no validation needed
    const label = paymentInfo.status === 'collected' ? 'Fee already collected'
      : paymentInfo.status === 'waived' ? 'Fee waived'
      : 'Bill later';
    if (!paymentInfo.overrideReason || paymentInfo.overrideReason.trim().length < 5) {
      const msg = `A detailed reason (min 5 characters) is required for "${label}". This protects against fee abuse.`;
      setPaymentError(msg);
      onToast(`Override reason required: ${msg}`, 'error');
      return false;
    }
    setPaymentError('');
    return true;
  };

  /* ── Validation ── */
  const validateBaptism = (): boolean => {
    const e: Record<string, string> = {};
    if (!bForm.childLastName) e.childLastName = 'Required';
    if (!bForm.childFirstName) e.childFirstName = 'Required';
    if (!bForm.dateOfBirth) e.dateOfBirth = 'Required';
    if (!bForm.placeOfBirthCity) e.placeOfBirthCity = 'Required';
    if (!bForm.fatherLastName) e.fatherLastName = 'Required';
    if (!bForm.fatherFirstName) e.fatherFirstName = 'Required';
    if (!bForm.motherLastName) e.motherLastName = 'Required';
    if (!bForm.motherFirstName) e.motherFirstName = 'Required';
    if (!bForm.dateOfBaptism) e.dateOfBaptism = 'Required';
    if (!bForm.officiant) e.officiant = 'Required';
    if (!bForm.bookNumber || bForm.bookNumber < 1) e.bookNumber = 'Required';
    if (!bForm.pageNumber || bForm.pageNumber < 1) e.pageNumber = 'Required';
    if (!bForm.scheduledDate) e.scheduledDate = 'Required';
    if (!bForm.scheduledTime) e.scheduledTime = 'Required';
    if (!bForm.scheduledOfficiant) e.scheduledOfficiant = 'Required';
    setBErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateMarriage = (): boolean => {
    const e: Record<string, string> = {};
    if (!mForm.groomLastName) e.groomLastName = 'Required';
    if (!mForm.groomFirstName) e.groomFirstName = 'Required';
    if (!mForm.groomAge || mForm.groomAge < 18) e.groomAge = 'Must be 18+';
    if (!mForm.brideLastName) e.brideLastName = 'Required';
    if (!mForm.brideFirstName) e.brideFirstName = 'Required';
    if (!mForm.brideAge || mForm.brideAge < 18) e.brideAge = 'Must be 18+';
    if (!mForm.witness1Name) e.witness1Name = 'Required';
    if (!mForm.witness2Name) e.witness2Name = 'Required';
    if (!mForm.dateOfMarriage) e.dateOfMarriage = 'Required';
    if (!mForm.officiant) e.officiant = 'Required';
    if (!mForm.bookNumber || mForm.bookNumber < 1) e.bookNumber = 'Required';
    if (!mForm.pageNumber || mForm.pageNumber < 1) e.pageNumber = 'Required';
    if (!mForm.scheduledDate) e.scheduledDate = 'Required';
    if (!mForm.scheduledTime) e.scheduledTime = 'Required';
    if (!mForm.scheduledOfficiant) e.scheduledOfficiant = 'Required';
    setMErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateConfirmation = (): boolean => {
    const e: Record<string, string> = {};
    if (!cForm.confirmandLastName) e.confirmandLastName = 'Required';
    if (!cForm.confirmandFirstName) e.confirmandFirstName = 'Required';
    if (!cForm.dateOfConfirmation) e.dateOfConfirmation = 'Required';
    if (!cForm.officiant) e.officiant = 'Required';
    if (!cForm.bookNumber || cForm.bookNumber < 1) e.bookNumber = 'Required';
    if (!cForm.pageNumber || cForm.pageNumber < 1) e.pageNumber = 'Required';
    if (!cForm.scheduledDate) e.scheduledDate = 'Required';
    if (!cForm.scheduledTime) e.scheduledTime = 'Required';
    if (!cForm.scheduledOfficiant) e.scheduledOfficiant = 'Required';
    setCErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateDeath = (): boolean => {
    const e: Record<string, string> = {};
    if (!dForm.deceasedLastName) e.deceasedLastName = 'Required';
    if (!dForm.deceasedFirstName) e.deceasedFirstName = 'Required';
    if (!dForm.dateOfDeath) e.dateOfDeath = 'Required';
    if (!dForm.dateOfBurial) e.dateOfBurial = 'Required';
    if (!dForm.causeOfDeath) e.causeOfDeath = 'Required';
    if (!dForm.officiant) e.officiant = 'Required';
    if (!dForm.bookNumber || dForm.bookNumber < 1) e.bookNumber = 'Required';
    if (!dForm.pageNumber || dForm.pageNumber < 1) e.pageNumber = 'Required';
    if (!dForm.scheduledDate) e.scheduledDate = 'Required';
    if (!dForm.scheduledTime) e.scheduledTime = 'Required';
    if (!dForm.scheduledOfficiant) e.scheduledOfficiant = 'Required';
    setDErrors(e);
    return Object.keys(e).length === 0;
  };

  /* ── Payment processing ── */
  const processPayment = useCallback((savedRecord: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord) => {
    const currency = getCurrencySymbol();
    const sLabel = sacrament === 'baptism' ? 'Baptism'
      : sacrament === 'marriage' ? 'Marriage'
      : sacrament === 'confirmation' ? 'Confirmation'
      : 'Death / Funeral';

    if (paymentInfo.status === 'collect_now') {
      const glEntry: JournalEntry = {
        id: `auto-${Date.now()}`,
        date: paymentInfo.date,
        reference: paymentInfo.receiptNumber || `SAC-${(savedRecord as { registryNumber: string }).registryNumber}`,
        description: `${sLabel} fee — ${getPersonName(savedRecord, sacrament)}`,
        lines: [
          { accountCode: '1000', accountName: 'Cash on Hand', debit: paymentInfo.amount, credit: 0 },
          { accountCode: '4200', accountName: 'Fees & Permits', debit: 0, credit: paymentInfo.amount },
        ],
      };
      addToJournal(glEntry);
      onToast(`Payment of ${currency}${paymentInfo.amount.toLocaleString()} recorded and posted to General Ledger`, 'success');
    } else if (paymentInfo.status === 'bill_later') {
      const arEntry: AccountsReceivableEntry = {
        date: paymentInfo.date,
        description: `AR — ${sLabel} fee for ${getPersonName(savedRecord, sacrament)} (due ${paymentInfo.dueDate || 'N/A'})`,
        lines: [
          { accountCode: '1100', accountName: 'Accounts Receivable', debit: paymentInfo.amount, credit: 0 },
          { accountCode: '4200', accountName: 'Fees & Permits', debit: 0, credit: paymentInfo.amount },
        ],
      };
      addToAccountsReceivable(arEntry);
      // Log override to audit trail
      logFeeOverride({
        sacrament: sLabel,
        registryId: (savedRecord as { registryNumber: string }).registryNumber,
        personName: getPersonName(savedRecord, sacrament),
        overrideType: 'bill_later',
        amount: paymentInfo.amount,
        reason: `[Bill Later] ${paymentInfo.overrideReason} | Due: ${paymentInfo.dueDate || 'N/A'}`,
        recordedBy: getCurrentUserName(),
      });
      onToast(`${currency}${paymentInfo.amount.toLocaleString()} added to Accounts Receivable (due ${paymentInfo.dueDate || 'N/A'})`, 'info');
    } else if (paymentInfo.status === 'waived') {
      // Log override to audit trail
      logFeeOverride({
        sacrament: sLabel,
        registryId: (savedRecord as { registryNumber: string }).registryNumber,
        personName: getPersonName(savedRecord, sacrament),
        overrideType: 'waived',
        amount: paymentInfo.amount,
        reason: `[Waived — ${paymentInfo.waiveReason}, approved by ${paymentInfo.waiveApprovedBy}] ${paymentInfo.overrideReason}`,
        recordedBy: getCurrentUserName(),
      });
      onToast(`Fee waived — ${paymentInfo.waiveReason}. Approved by ${paymentInfo.waiveApprovedBy}`, 'info');
    } else if (paymentInfo.status === 'collected') {
      // Log override to audit trail — "already collected" is also an override from the new default
      logFeeOverride({
        sacrament: sLabel,
        registryId: (savedRecord as { registryNumber: string }).registryNumber,
        personName: getPersonName(savedRecord, sacrament),
        overrideType: 'collected',
        amount: paymentInfo.amount,
        reason: `[Already Collected] ${paymentInfo.overrideReason}`,
        recordedBy: getCurrentUserName(),
      });
      onToast('Record saved with fee marked as already collected. Override logged for audit.', 'info');
    }
  }, [paymentInfo, sacrament, onToast]);

  /* ── Requirements: warn-only ──
     Fired AFTER a successful save. Requirements never block saving (unlike the
     marriage scheduling hard-block); an incomplete checklist just raises a
     prominent warning toast naming what is still pending. */
  const warnRequirementsPending = (sacramentKey: string, checkedIds: string[]) => {
    const info = getSacramentInfo(sacramentKey);
    if (!info) return;
    const checkedSet = new Set(checkedIds);
    const missingLabels = info.requirements.filter((r) => !checkedSet.has(r.id)).map((r) => r.label);
    if (missingLabels.length === 0) return;
    onToast(`Saved — ${missingLabels.length} requirement(s) still pending: ${missingLabels.join(', ')}`, 'warning');
  };

  /* ── Save handler ── */
  const handleSave = () => {
    // Fee override validation: non-default payment options require a reason
    if (!validatePaymentOverride()) return;

    if (sacrament === 'baptism') {
      if (!validateBaptism()) return;
      const newRecord: BaptismRecord = {
        id: (record as BaptismRecord | null)?.id || genId('b'),
        registryNumber: bForm.registryNumber || `2024-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        childLastName: bForm.childLastName!, childFirstName: bForm.childFirstName!, childMiddleName: bForm.childMiddleName || '',
        dateOfBirth: bForm.dateOfBirth || '', placeOfBirthCity: bForm.placeOfBirthCity || 'Mabalacat', placeOfBirthProvince: bForm.placeOfBirthProvince || 'Pampanga', gender: bForm.gender || 'Male',
        fatherLastName: bForm.fatherLastName!, fatherFirstName: bForm.fatherFirstName!, fatherMiddleName: bForm.fatherMiddleName || '', fatherParishionerId: bForm.fatherParishionerId || undefined,
        motherLastName: bForm.motherLastName!, motherFirstName: bForm.motherFirstName!, motherMiddleName: bForm.motherMiddleName || '', motherMaidenName: bForm.motherMaidenName || '', motherParishionerId: bForm.motherParishionerId || undefined,
        godfatherLastName: bForm.godfatherLastName || '', godfatherFirstName: bForm.godfatherFirstName || '', godfatherParishionerId: bForm.godfatherParishionerId || undefined,
        godmotherLastName: bForm.godmotherLastName || '', godmotherFirstName: bForm.godmotherFirstName || '', godmotherParishionerId: bForm.godmotherParishionerId || undefined,
        childParishionerId: bForm.childParishionerId || undefined,
        addressStreet: bForm.addressStreet || '', addressBarangay: bForm.addressBarangay || BARANGAYS[0], addressSitio: bForm.addressSitio || '', addressCity: bForm.addressCity || CITIES[0], addressProvince: bForm.addressProvince || PROVINCES[0],
        dateOfBaptism: bForm.dateOfBaptism!, timeOfBaptism: bForm.timeOfBaptism || '9:00 AM', officiant: bForm.officiant!, bookNumber: Number(bForm.bookNumber) || 1, pageNumber: Number(bForm.pageNumber) || 1,
        notations: bForm.notations || '', status: (bForm.status as 'Active') || 'Active',
        lifecycleStatus: record ? recordStatus(record) : 'scheduled',
        scheduledDate: bForm.scheduledDate || bForm.dateOfBaptism!, scheduledTime: bForm.scheduledTime || '9:00 AM',
        scheduledOfficiant: bForm.scheduledOfficiant || bForm.officiant!, scheduledLocation: bForm.scheduledLocation || baptismLocations[0],
        calendarEventId: record?.calendarEventId || undefined,
        annotations: annotations.length ? annotations : undefined,
        requirementsMet: bForm.requirementsMet && bForm.requirementsMet.length ? bForm.requirementsMet : undefined,
        isDeleted: record?.isDeleted, deletedAt: record?.deletedAt, deletedBy: record?.deletedBy,
      };
      const calCreated = maybeAddToCalendar(newRecord, bAutoCalendar, onToast);
      onSave(newRecord);
      warnRequirementsPending('baptism', bForm.requirementsMet || []);
      processPayment(newRecord);
      onToast(...calendarSaveToast('Baptism', bAutoCalendar, calCreated));
    } else if (sacrament === 'marriage') {
      if (!validateMarriage()) return;
      // HARD-BLOCK: a real venue/officiant/time conflict (or a liturgical block)
      // can never be saved into. Availability is shown live in the panel; this is
      // the enforcing gate for the save action itself.
      if (mSchedule.blocked) {
        const reason = mSchedule.conflicts.length > 0
          ? `${mSchedule.conflicts[0].title || 'Another event'} is already booked at that time.`
          : mSchedule.lit.note;
        onToast(`Cannot save — scheduling conflict. ${reason}`, 'error');
        return;
      }
      // The chosen venue's name is the record's scheduledLocation (the scheduling
      // engine matches events by this venue token).
      const mVenueName = mSchedule.venue?.name || mForm.scheduledLocation || marriageLocations[0];
      const newRecord: MarriageRecord = {
        id: (record as MarriageRecord | null)?.id || genId('m'),
        registryNumber: mForm.registryNumber || `2024-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        groomLastName: mForm.groomLastName!, groomFirstName: mForm.groomFirstName!, groomMiddleName: mForm.groomMiddleName || '',
        groomAge: Number(mForm.groomAge) || 25, groomStatus: mForm.groomStatus || 'Single', groomFather: mForm.groomFather || '', groomMother: mForm.groomMother || '', groomParishionerId: mForm.groomParishionerId || undefined,
        brideLastName: mForm.brideLastName!, brideFirstName: mForm.brideFirstName!, brideMiddleName: mForm.brideMiddleName || '',
        brideAge: Number(mForm.brideAge) || 25, brideStatus: mForm.brideStatus || 'Single', brideFather: mForm.brideFather || '', brideMother: mForm.brideMother || '', brideParishionerId: mForm.brideParishionerId || undefined,
        witness1Name: mForm.witness1Name || '', witness1ParishionerId: mForm.witness1ParishionerId || undefined,
        witness2Name: mForm.witness2Name || '', witness2ParishionerId: mForm.witness2ParishionerId || undefined,
        dateOfMarriage: mForm.dateOfMarriage!, timeOfMarriage: mForm.timeOfMarriage || '10:00 AM',
        officiant: mForm.officiant!, bookNumber: Number(mForm.bookNumber) || 1, pageNumber: Number(mForm.pageNumber) || 1,
        notations: mForm.notations || '', status: (mForm.status as 'Active') || 'Active',
        lifecycleStatus: record ? recordStatus(record) : 'scheduled',
        scheduledDate: mForm.scheduledDate || mForm.dateOfMarriage!, scheduledTime: mForm.scheduledTime || '10:00 AM',
        scheduledOfficiant: mForm.scheduledOfficiant || mForm.officiant!, scheduledLocation: mVenueName,
        calendarEventId: record?.calendarEventId || undefined,
        annotations: annotations.length ? annotations : undefined,
        requirementsMet: mForm.requirementsMet && mForm.requirementsMet.length ? mForm.requirementsMet : undefined,
        isDeleted: record?.isDeleted, deletedAt: record?.deletedAt, deletedBy: record?.deletedBy,
      };
      // Carry a graceful surname-based title + the real time window so the created
      // calendar event is detected as busy for the whole ceremony by future bookings.
      const calCreated = maybeAddToCalendar(newRecord, mAutoCalendar, onToast, {
        title: weddingCalendarTitle(newRecord.groomLastName, newRecord.brideLastName),
        durationMin: mDuration,
      });
      onSave(newRecord);
      warnRequirementsPending('wedding', mForm.requirementsMet || []);
      processPayment(newRecord);
      onToast(...calendarSaveToast('Marriage', mAutoCalendar, calCreated));
    } else if (sacrament === 'confirmation') {
      if (!validateConfirmation()) return;
      const newRecord: ConfirmationRecord = {
        id: (record as ConfirmationRecord | null)?.id || genId('c'),
        registryNumber: cForm.registryNumber || `2024-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        confirmandLastName: cForm.confirmandLastName!, confirmandFirstName: cForm.confirmandFirstName!, confirmandMiddleName: cForm.confirmandMiddleName || '', confirmandParishionerId: cForm.confirmandParishionerId || undefined,
        dateOfBirth: cForm.dateOfBirth || '', parishOfBaptism: cForm.parishOfBaptism || 'St. Michael the Archangel Parish', dateOfBaptism: cForm.dateOfBaptism || '',
        baptismRecordId: cForm.baptismRecordId || undefined,
        officiant: cForm.officiant!, bishop: cForm.bishop || 'Bishop Florentino Lavarias',
        sponsorLastName: cForm.sponsorLastName || '', sponsorFirstName: cForm.sponsorFirstName || '', sponsorParishionerId: cForm.sponsorParishionerId || undefined,
        dateOfConfirmation: cForm.dateOfConfirmation!, timeOfConfirmation: cForm.timeOfConfirmation || '9:00 AM',
        bookNumber: Number(cForm.bookNumber) || 1, pageNumber: Number(cForm.pageNumber) || 1,
        notations: cForm.notations || '', status: (cForm.status as 'Active') || 'Active',
        lifecycleStatus: record ? recordStatus(record) : 'scheduled',
        scheduledDate: cForm.scheduledDate || cForm.dateOfConfirmation!, scheduledTime: cForm.scheduledTime || '9:00 AM',
        scheduledOfficiant: cForm.scheduledOfficiant || cForm.officiant!, scheduledLocation: cForm.scheduledLocation || confirmationLocations[0],
        calendarEventId: record?.calendarEventId || undefined,
        annotations: annotations.length ? annotations : undefined,
        requirementsMet: cForm.requirementsMet && cForm.requirementsMet.length ? cForm.requirementsMet : undefined,
        isDeleted: record?.isDeleted, deletedAt: record?.deletedAt, deletedBy: record?.deletedBy,
      };
      const calCreated = maybeAddToCalendar(newRecord, cAutoCalendar, onToast);
      onSave(newRecord);
      warnRequirementsPending('confirmation', cForm.requirementsMet || []);
      processPayment(newRecord);
      onToast(...calendarSaveToast('Confirmation', cAutoCalendar, calCreated));
    } else if (sacrament === 'death') {
      if (!validateDeath()) return;
      const newRecord: DeathRecord = {
        id: (record as DeathRecord | null)?.id || genId('d'),
        registryNumber: dForm.registryNumber || `2024-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        deceasedLastName: dForm.deceasedLastName!, deceasedFirstName: dForm.deceasedFirstName!, deceasedMiddleName: dForm.deceasedMiddleName || '', deceasedParishionerId: dForm.deceasedParishionerId || undefined,
        age: Number(dForm.age) || 0, gender: dForm.gender || 'Male',
        dateOfDeath: dForm.dateOfDeath!, dateOfBurial: dForm.dateOfBurial!, timeOfBurial: dForm.timeOfBurial || '9:00 AM',
        causeOfDeath: dForm.causeOfDeath || '', cemetery: dForm.cemetery || 'San Lorenzo Cemetery',
        officiant: dForm.officiant!, bookNumber: Number(dForm.bookNumber) || 1, pageNumber: Number(dForm.pageNumber) || 1,
        notations: dForm.notations || '', status: (dForm.status as 'Active') || 'Active',
        lifecycleStatus: record ? recordStatus(record) : 'scheduled',
        scheduledDate: dForm.scheduledDate || dForm.dateOfBurial!, scheduledTime: dForm.scheduledTime || '9:00 AM',
        scheduledOfficiant: dForm.scheduledOfficiant || dForm.officiant!, scheduledLocation: dForm.scheduledLocation || burialLocations[0],
        calendarEventId: record?.calendarEventId || undefined,
        annotations: annotations.length ? annotations : undefined,
        requirementsMet: dForm.requirementsMet && dForm.requirementsMet.length ? dForm.requirementsMet : undefined,
        isDeleted: record?.isDeleted, deletedAt: record?.deletedAt, deletedBy: record?.deletedBy,
      };
      const calCreated = maybeAddToCalendar(newRecord, dAutoCalendar, onToast);
      onSave(newRecord);
      warnRequirementsPending('funeral', dForm.requirementsMet || []);
      processPayment(newRecord);
      onToast(...calendarSaveToast('Burial', dAutoCalendar, calCreated));
    }
  };

  const formTitle = sacrament === 'baptism' ? 'Baptism' : sacrament === 'marriage' ? 'Marriage' : sacrament === 'confirmation' ? 'Confirmation' : 'Death / Funeral';
  const TabIcon = sacrament === 'baptism' ? Droplets : sacrament === 'marriage' ? Heart : sacrament === 'confirmation' ? Flame : Cross;
  const accentColor = sacrament === 'baptism' ? '#2D6A4F' : sacrament === 'marriage' ? '#6B2737' : sacrament === 'confirmation' ? '#C9963B' : '#3D3A36';

  /* Available sitios for selected barangay */
  const availableSitios = bForm.addressBarangay ? (SITIOS[bForm.addressBarangay] || []) : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-start justify-center p-4 pt-10 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[900px] overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div className="flex items-center gap-3">
            <TabIcon className="w-5 h-5" style={{ color: accentColor }} />
            <h2 className="heading-lg text-charcoal dark:text-dm-text">
              {isEdit ? 'Edit' : 'Add'} {formTitle} Record
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[65vh] overflow-y-auto space-y-6">
          {sacrament === 'baptism' && (
            <>
              {/* ═══ RECORD INFO ═══ */}
              <div>
                <SectionHeader icon={FileText} title="Record Information" color="#C9963B" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <div>
                    <div className="flex items-center">
                      <Field label="Registry #" value={bForm.registryNumber || ''} onChange={(v) => bUpdate('registryNumber', v)} placeholder="Auto-generated" disabled />
                      <HelpTooltip text={getLabel('field.registryNumber.help')} position="top" />
                    </div>
                  </div>
                  <Field label="Date of Baptism *" type="date" value={bForm.dateOfBaptism || ''} onChange={(v) => bUpdate('dateOfBaptism', v)} error={bErrors.dateOfBaptism} required />
                  <Field label="Time *" as="select" value={bForm.timeOfBaptism || ''} onChange={(v) => bUpdate('timeOfBaptism', v)} required>
                    {baptismTimes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <div>
                    <div className="flex items-center">
                      <Field label="Book # *" type="number" value={String(bForm.bookNumber || '')} onChange={(v) => bUpdate('bookNumber', parseInt(v) || 1)} error={bErrors.bookNumber} required />
                      <HelpTooltip text={getLabel('field.bookNumber.help')} position="top" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center">
                      <Field label="Page # *" type="number" value={String(bForm.pageNumber || '')} onChange={(v) => bUpdate('pageNumber', parseInt(v) || 1)} error={bErrors.pageNumber} required />
                      <HelpTooltip text={getLabel('field.pageNumber.help')} position="top" />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center">
                      <Field label="Officiant *" as="select" value={bForm.officiant || ''} onChange={(v) => bUpdate('officiant', v)} error={bErrors.officiant} required>
                        <option value="">Select officiant...</option>
                        {officiantOptions(bForm.officiant).map((o) => <option key={o} value={o}>{o}</option>)}
                      </Field>
                      <HelpTooltip text={getLabel('field.officiant.help')} position="top" />
                    </div>
                  </div>
                </div>
              </div>

              {/* ═══ CHILD ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={Droplets} title="Child Information" color="#2D6A4F" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <ParishionerLookupAutocomplete
                    label="Last Name *"
                    options={parishioners}
                    value={bForm.childLastName || ''}
                    onChange={(v) => { bUpdate('childLastName', v); bUpdate('childParishionerId', ''); }}
                    onSelect={handleChildSelect}
                    error={bErrors.childLastName}
                    required
                    placeholder="Type a surname..."
                  />
                  <Field label="First Name *" value={bForm.childFirstName || ''} onChange={(v) => bUpdate('childFirstName', v)} error={bErrors.childFirstName} required />
                  <Field label="Middle Name" value={bForm.childMiddleName || ''} onChange={(v) => bUpdate('childMiddleName', v)} />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Date of Birth *" type="date" value={bForm.dateOfBirth || ''} onChange={(v) => bUpdate('dateOfBirth', v)} error={bErrors.dateOfBirth} required />
                  <Field label="Gender *" as="select" value={bForm.gender || 'Male'} onChange={(v) => bUpdate('gender', v)} required>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Place of Birth (City) *" as="select" value={bForm.placeOfBirthCity || ''} onChange={(v) => bUpdate('placeOfBirthCity', v)} error={bErrors.placeOfBirthCity} required>
                    <option value="">Select city...</option>
                    {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Field>
                  <Field label="Place of Birth (Province) *" as="select" value={bForm.placeOfBirthProvince || ''} onChange={(v) => bUpdate('placeOfBirthProvince', v)} error={bErrors.placeOfBirthProvince} required>
                    <option value="">Select province...</option>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Field>
                </div>
              </div>

              {/* ═══ PARENTS ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <div className="flex items-center justify-between mb-2">
                  <SectionHeader icon={Users} title="Parental Information" color="#6B2737" />
                  <span className="body-xs text-warm-gray dark:text-dm-text-muted flex items-center gap-1">
                    <Search className="w-3 h-3" /> Directory matches appear as you type
                  </span>
                </div>
                {/* Father */}
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div className="flex items-center">
                    <ParishionerLookupAutocomplete
                      label="Father Last Name *"
                      options={parishioners}
                      value={bForm.fatherLastName || ''}
                      onChange={(v) => { bUpdate('fatherLastName', v); bUpdate('fatherParishionerId', ''); }}
                      onSelect={handleFatherSelect}
                      error={bErrors.fatherLastName}
                      required
                      placeholder="Type a surname..."
                    />
                    <HelpTooltip text={getLabel('field.fatherName.help')} canonLaw={getLabel('field.godparents.canon')} position="top" />
                  </div>
                  <Field label="Father First Name *" value={bForm.fatherFirstName || ''} onChange={(v) => bUpdate('fatherFirstName', v)} error={bErrors.fatherFirstName} required />
                  <Field label="Father Middle Name" value={bForm.fatherMiddleName || ''} onChange={(v) => bUpdate('fatherMiddleName', v)} />
                </div>
                {/* Mother */}
                <div className="grid grid-cols-4 gap-4 mt-3">
                  <div className="flex items-center">
                    <ParishionerLookupAutocomplete
                      label="Mother Maiden Last *"
                      options={parishioners}
                      value={bForm.motherLastName || ''}
                      onChange={(v) => { bUpdate('motherLastName', v); bUpdate('motherParishionerId', ''); }}
                      onSelect={handleMotherSelect}
                      error={bErrors.motherLastName}
                      required
                      placeholder="Type a surname..."
                    />
                    <HelpTooltip text={getLabel('field.motherName.help')} position="top" />
                  </div>
                  <Field label="Mother First Name *" value={bForm.motherFirstName || ''} onChange={(v) => bUpdate('motherFirstName', v)} error={bErrors.motherFirstName} required />
                  <Field label="Mother Middle Name" value={bForm.motherMiddleName || ''} onChange={(v) => bUpdate('motherMiddleName', v)} />
                  <div className="flex items-center">
                    <Field label="Mother Maiden Name" value={bForm.motherMaidenName || ''} onChange={(v) => bUpdate('motherMaidenName', v)} placeholder="e.g., Reyes" />
                    <HelpTooltip text={getLabel('help.motherMaiden')} position="top" />
                  </div>
                </div>
              </div>

              {/* ═══ SPONSORS ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <div className="flex items-center gap-2 mb-2">
                  <SectionHeader icon={User} title="Sponsors (Godparents)" color="#C9963B" />
                  <HelpTooltip text={getLabel('field.godfather.help')} canonLaw={getLabel('field.godparents.canon')} position="right" />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <ParishionerLookupAutocomplete
                    label="Godfather Last Name"
                    options={parishioners}
                    value={bForm.godfatherLastName || ''}
                    onChange={(v) => { bUpdate('godfatherLastName', v); bUpdate('godfatherParishionerId', ''); }}
                    onSelect={handleGodfatherSelect}
                    placeholder="Type a surname..."
                  />
                  <Field label="Godfather First Name" value={bForm.godfatherFirstName || ''} onChange={(v) => bUpdate('godfatherFirstName', v)} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <ParishionerLookupAutocomplete
                    label="Godmother Last Name"
                    options={parishioners}
                    value={bForm.godmotherLastName || ''}
                    onChange={(v) => { bUpdate('godmotherLastName', v); bUpdate('godmotherParishionerId', ''); }}
                    onSelect={handleGodmotherSelect}
                    placeholder="Type a surname..."
                  />
                  <Field label="Godmother First Name" value={bForm.godmotherFirstName || ''} onChange={(v) => bUpdate('godmotherFirstName', v)} />
                </div>
              </div>

              {/* ═══ ADDRESS ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={MapPin} title="Family Address" color="#8C8374" />
                <div className="mt-3">
                  <Field label="Street" value={bForm.addressStreet || ''} onChange={(v) => bUpdate('addressStreet', v)} placeholder="e.g., 123 Mango Street" />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Barangay *" as="select" value={bForm.addressBarangay || ''} onChange={(v) => { bUpdate('addressBarangay', v); bUpdate('addressSitio', ''); }} required>
                    {BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </Field>
                  <Field label="Sitio" as="select" value={bForm.addressSitio || ''} onChange={(v) => bUpdate('addressSitio', v)}>
                    <option value="">Select sitio...</option>
                    {availableSitios.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="City *" as="select" value={bForm.addressCity || ''} onChange={(v) => bUpdate('addressCity', v)} required>
                    {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Field>
                  <Field label="Province *" as="select" value={bForm.addressProvince || ''} onChange={(v) => bUpdate('addressProvince', v)} required>
                    {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </Field>
                </div>
              </div>

              {/* ═══ NOTATIONS ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <div className="flex items-center gap-2 mb-2">
                  <SectionHeader icon={BookOpen} title="Notations" color="#8C8374" />
                  <HelpTooltip text={getLabel('field.notations.help')} canonLaw={getLabel('field.notations.canon')} position="right" />
                </div>
                <div className="mt-3">
                  <Field label="Canonical Notations / Additional Notes" as="textarea" value={bForm.notations || ''} onChange={(v) => bUpdate('notations', v)} placeholder="e.g., Condition: Sanate, annotations, corrections..." />
                </div>
              </div>

              {/* ═══ SCHEDULE ═══ */}
              <ScheduleSection
                sacrament="baptism"
                date={bForm.scheduledDate || ''}
                time={bForm.scheduledTime || '9:00 AM'}
                officiant={bForm.scheduledOfficiant || ''}
                location={bForm.scheduledLocation || baptismLocations[0]}
                autoCalendar={bAutoCalendar}
                onChangeDate={(v) => bUpdate('scheduledDate', v)}
                onChangeTime={(v) => bUpdate('scheduledTime', v)}
                onChangeOfficiant={(v) => bUpdate('scheduledOfficiant', v)}
                onChangeLocation={(v) => bUpdate('scheduledLocation', v)}
                onChangeAutoCalendar={setBAutoCalendar}
                eventTitle={`Baptism: ${bForm.childLastName || ''}, ${bForm.childFirstName || ''} ${bForm.childMiddleName || ''}`}
                errors={{ date: bErrors.scheduledDate, time: bErrors.scheduledTime, officiant: bErrors.scheduledOfficiant }}
              />

              {/* ═══ REQUIREMENTS CHECKLIST (warn-only) ═══ */}
              <SacramentRequirementsChecklist
                sacramentKey="baptism"
                checkedIds={bForm.requirementsMet || []}
                onToggle={(id, on) => {
                  const cur = bForm.requirementsMet || [];
                  bUpdate('requirementsMet', on ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id));
                }}
              />

              {/* ═══ PAYMENT ═══ */}
              <PaymentSection sacrament="baptism" paymentInfo={paymentInfo} onChange={handlePaymentChange} error={paymentError} />
            </>
          )}

          {sacrament === 'marriage' && (
            <>
              {/* ═══ RECORD INFO ═══ */}
              <div>
                <SectionHeader icon={FileText} title="Record Information" color="#C9963B" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Registry #" value={mForm.registryNumber || ''} onChange={(v) => mUpdate('registryNumber', v)} disabled />
                  <Field label="Date of Marriage *" type="date" value={mForm.dateOfMarriage || ''} onChange={(v) => mUpdate('dateOfMarriage', v)} error={mErrors.dateOfMarriage} required />
                  <Field label="Time *" as="select" value={mForm.timeOfMarriage || ''} onChange={(v) => mUpdate('timeOfMarriage', v)} required>
                    {marriageTimes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Book # *" type="number" value={String(mForm.bookNumber || '')} onChange={(v) => mUpdate('bookNumber', parseInt(v) || 1)} error={mErrors.bookNumber} required />
                  <Field label="Page # *" type="number" value={String(mForm.pageNumber || '')} onChange={(v) => mUpdate('pageNumber', parseInt(v) || 1)} error={mErrors.pageNumber} required />
                  <Field label="Officiant *" as="select" value={mForm.officiant || ''} onChange={(v) => mUpdate('officiant', v)} error={mErrors.officiant} required>
                    <option value="">Select officiant...</option>
                    {officiantOptions(mForm.officiant).map((o) => <option key={o} value={o}>{o}</option>)}
                  </Field>
                </div>
              </div>

              {/* ═══ GROOM ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={User} title="Groom Information" color="#2D6A4F" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <ParishionerLookupAutocomplete
                    label="Last Name *"
                    options={parishioners}
                    value={mForm.groomLastName || ''}
                    onChange={(v) => { mUpdate('groomLastName', v); mUpdate('groomParishionerId', ''); }}
                    onSelect={handleGroomSelect}
                    error={mErrors.groomLastName}
                    required
                    placeholder="Type a surname..."
                  />
                  <Field label="First Name *" value={mForm.groomFirstName || ''} onChange={(v) => mUpdate('groomFirstName', v)} error={mErrors.groomFirstName} required />
                  <Field label="Middle Name" value={mForm.groomMiddleName || ''} onChange={(v) => mUpdate('groomMiddleName', v)} />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Age *" type="number" value={String(mForm.groomAge || '')} onChange={(v) => mUpdate('groomAge', parseInt(v) || 0)} error={mErrors.groomAge} required />
                  <Field label="Status *" as="select" value={mForm.groomStatus || ''} onChange={(v) => mUpdate('groomStatus', v)} required>
                    <option value="Single">Single</option>
                    <option value="Widower">Widower</option>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Father" value={mForm.groomFather || ''} onChange={(v) => mUpdate('groomFather', v)} placeholder="Groom's father name" />
                  <Field label="Mother" value={mForm.groomMother || ''} onChange={(v) => mUpdate('groomMother', v)} placeholder="Groom's mother name" />
                </div>
              </div>

              {/* ═══ BRIDE ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={User} title="Bride Information" color="#6B2737" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <ParishionerLookupAutocomplete
                    label="Last Name *"
                    options={parishioners}
                    value={mForm.brideLastName || ''}
                    onChange={(v) => { mUpdate('brideLastName', v); mUpdate('brideParishionerId', ''); }}
                    onSelect={handleBrideSelect}
                    error={mErrors.brideLastName}
                    required
                    placeholder="Type a surname..."
                  />
                  <Field label="First Name *" value={mForm.brideFirstName || ''} onChange={(v) => mUpdate('brideFirstName', v)} error={mErrors.brideFirstName} required />
                  <Field label="Middle Name" value={mForm.brideMiddleName || ''} onChange={(v) => mUpdate('brideMiddleName', v)} />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Age *" type="number" value={String(mForm.brideAge || '')} onChange={(v) => mUpdate('brideAge', parseInt(v) || 0)} error={mErrors.brideAge} required />
                  <Field label="Status *" as="select" value={mForm.brideStatus || ''} onChange={(v) => mUpdate('brideStatus', v)} required>
                    <option value="Single">Single</option>
                    <option value="Widow">Widow</option>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Father" value={mForm.brideFather || ''} onChange={(v) => mUpdate('brideFather', v)} placeholder="Bride's father name" />
                  <Field label="Mother" value={mForm.brideMother || ''} onChange={(v) => mUpdate('brideMother', v)} placeholder="Bride's mother name" />
                </div>
              </div>

              {/* ═══ WITNESSES ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={Users} title="Witnesses" color="#3B6BC9" />
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <ParishionerLookupAutocomplete
                    label="Witness 1 *"
                    options={parishioners}
                    value={mForm.witness1Name || ''}
                    onChange={(v) => { mUpdate('witness1Name', v); mUpdate('witness1ParishionerId', ''); }}
                    onSelect={handleWitness1Select}
                    error={mErrors.witness1Name}
                    required
                    placeholder="Type a name..."
                  />
                  <ParishionerLookupAutocomplete
                    label="Witness 2 *"
                    options={parishioners}
                    value={mForm.witness2Name || ''}
                    onChange={(v) => { mUpdate('witness2Name', v); mUpdate('witness2ParishionerId', ''); }}
                    onSelect={handleWitness2Select}
                    error={mErrors.witness2Name}
                    required
                    placeholder="Type a name..."
                  />
                </div>
              </div>

              {/* ═══ NOTATIONS ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={BookOpen} title="Notations" color="#8C8374" />
                <div className="mt-3">
                  <Field label="Canonical Notations / Additional Notes" as="textarea" value={mForm.notations || ''} onChange={(v) => mUpdate('notations', v)} />
                </div>
              </div>

              {/* ═══ SCHEDULE (venue + live conflict detection) ═══ */}
              <MarriageScheduleSection
                date={mForm.scheduledDate || ''}
                time={mForm.scheduledTime || '10:00 AM'}
                officiant={mForm.scheduledOfficiant || ''}
                duration={mDuration}
                expectedGuests={mExpectedGuests}
                venueId={mVenueId}
                autoCalendar={mAutoCalendar}
                multiVenue={mMultiVenue}
                venues={mVenues}
                schedule={mSchedule}
                onChangeDate={(v) => mUpdate('scheduledDate', v)}
                onChangeTime={(v) => mUpdate('scheduledTime', v)}
                onChangeOfficiant={(v) => mUpdate('scheduledOfficiant', v)}
                onChangeDuration={setMDuration}
                onChangeGuests={setMExpectedGuests}
                onChangeVenue={setMVenueId}
                onChangeAutoCalendar={setMAutoCalendar}
                eventTitle={weddingCalendarTitle(mForm.groomLastName, mForm.brideLastName)}
                errors={{ date: mErrors.scheduledDate, time: mErrors.scheduledTime, officiant: mErrors.scheduledOfficiant }}
              />

              {/* ═══ REQUIREMENTS CHECKLIST (warn-only; independent of the scheduling hard-block above) ═══ */}
              <SacramentRequirementsChecklist
                sacramentKey="wedding"
                checkedIds={mForm.requirementsMet || []}
                onToggle={(id, on) => {
                  const cur = mForm.requirementsMet || [];
                  mUpdate('requirementsMet', on ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id));
                }}
              />

              {/* ═══ PAYMENT ═══ */}
              <PaymentSection sacrament="marriage" paymentInfo={paymentInfo} onChange={handlePaymentChange} error={paymentError} />
            </>
          )}

          {sacrament === 'confirmation' && (
            <>
              {/* ═══ RECORD INFO ═══ */}
              <div>
                <SectionHeader icon={FileText} title="Record Information" color="#C9963B" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Registry #" value={cForm.registryNumber || ''} onChange={(v) => cUpdate('registryNumber', v)} disabled />
                  <Field label="Date of Confirmation *" type="date" value={cForm.dateOfConfirmation || ''} onChange={(v) => cUpdate('dateOfConfirmation', v)} error={cErrors.dateOfConfirmation} required />
                  <Field label="Time *" as="select" value={cForm.timeOfConfirmation || ''} onChange={(v) => cUpdate('timeOfConfirmation', v)} required>
                    {confirmationTimes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Field>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Book # *" type="number" value={String(cForm.bookNumber || '')} onChange={(v) => cUpdate('bookNumber', parseInt(v) || 1)} error={cErrors.bookNumber} required />
                  <Field label="Page # *" type="number" value={String(cForm.pageNumber || '')} onChange={(v) => cUpdate('pageNumber', parseInt(v) || 1)} error={cErrors.pageNumber} required />
                  <Field label="Officiant *" as="select" value={cForm.officiant || ''} onChange={(v) => cUpdate('officiant', v)} error={cErrors.officiant} required>
                    <option value="">Select officiant...</option>
                    {officiantOptions(cForm.officiant).map((o) => <option key={o} value={o}>{o}</option>)}
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Bishop" value={cForm.bishop || ''} onChange={(v) => cUpdate('bishop', v)} />
                </div>
              </div>

              {/* ═══ CONFIRMAND ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={Flame} title="Confirmand Information" color="#C9963B" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Last Name *" value={cForm.confirmandLastName || ''} onChange={(v) => cUpdate('confirmandLastName', v)} error={cErrors.confirmandLastName} required />
                  <Field label="First Name *" value={cForm.confirmandFirstName || ''} onChange={(v) => cUpdate('confirmandFirstName', v)} error={cErrors.confirmandFirstName} required />
                  <Field label="Middle Name" value={cForm.confirmandMiddleName || ''} onChange={(v) => cUpdate('confirmandMiddleName', v)} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Date of Birth" type="date" value={cForm.dateOfBirth || ''} onChange={(v) => cUpdate('dateOfBirth', v)} />
                  <Field label="Parish of Baptism" value={cForm.parishOfBaptism || ''} onChange={(v) => cUpdate('parishOfBaptism', v)} />
                </div>
                <div className="mt-3">
                  <Field label="Date of Baptism" type="date" value={cForm.dateOfBaptism || ''} onChange={(v) => cUpdate('dateOfBaptism', v)} />
                </div>
                <BaptismLinkSection
                  firstName={cForm.confirmandFirstName || ''}
                  lastName={cForm.confirmandLastName || ''}
                  dob={cForm.dateOfBirth || ''}
                  records={baptismRegister}
                  linkedId={cForm.baptismRecordId || ''}
                  onLink={(b) => {
                    cUpdate('baptismRecordId', b.id);
                    if (!cForm.dateOfBaptism) cUpdate('dateOfBaptism', b.dateOfBaptism);
                    if (!cForm.dateOfBirth) cUpdate('dateOfBirth', b.dateOfBirth);
                    if (b.childParishionerId) cUpdate('confirmandParishionerId', b.childParishionerId);
                  }}
                  onUnlink={() => cUpdate('baptismRecordId', '')}
                />
              </div>

              {/* ═══ SPONSOR ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={User} title="Sponsor" color="#5B3A73" />
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <ParishionerLookupAutocomplete
                    label="Sponsor Last Name"
                    options={parishioners}
                    value={cForm.sponsorLastName || ''}
                    onChange={(v) => { cUpdate('sponsorLastName', v); cUpdate('sponsorParishionerId', ''); }}
                    onSelect={handleSponsorSelect}
                    placeholder="Type a surname..."
                  />
                  <Field label="Sponsor First Name" value={cForm.sponsorFirstName || ''} onChange={(v) => cUpdate('sponsorFirstName', v)} />
                </div>
              </div>

              {/* ═══ NOTATIONS ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={BookOpen} title="Notations" color="#8C8374" />
                <div className="mt-3">
                  <Field label="Canonical Notations / Additional Notes" as="textarea" value={cForm.notations || ''} onChange={(v) => cUpdate('notations', v)} />
                </div>
              </div>

              {/* ═══ SCHEDULE ═══ */}
              <ScheduleSection
                sacrament="confirmation"
                date={cForm.scheduledDate || ''}
                time={cForm.scheduledTime || '9:00 AM'}
                officiant={cForm.scheduledOfficiant || ''}
                location={cForm.scheduledLocation || confirmationLocations[0]}
                autoCalendar={cAutoCalendar}
                onChangeDate={(v) => cUpdate('scheduledDate', v)}
                onChangeTime={(v) => cUpdate('scheduledTime', v)}
                onChangeOfficiant={(v) => cUpdate('scheduledOfficiant', v)}
                onChangeLocation={(v) => cUpdate('scheduledLocation', v)}
                onChangeAutoCalendar={setCAutoCalendar}
                eventTitle={`Confirmation: ${cForm.confirmandLastName || ''}, ${cForm.confirmandFirstName || ''} ${cForm.confirmandMiddleName || ''}`}
                errors={{ date: cErrors.scheduledDate, time: cErrors.scheduledTime, officiant: cErrors.scheduledOfficiant }}
              />

              {/* ═══ REQUIREMENTS CHECKLIST (warn-only) ═══ */}
              <SacramentRequirementsChecklist
                sacramentKey="confirmation"
                checkedIds={cForm.requirementsMet || []}
                onToggle={(id, on) => {
                  const cur = cForm.requirementsMet || [];
                  cUpdate('requirementsMet', on ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id));
                }}
              />

              {/* ═══ PAYMENT ═══ */}
              <PaymentSection sacrament="confirmation" paymentInfo={paymentInfo} onChange={handlePaymentChange} error={paymentError} />
            </>
          )}

          {sacrament === 'death' && (
            <>
              {/* ═══ RECORD INFO ═══ */}
              <div>
                <SectionHeader icon={FileText} title="Record Information" color="#C9963B" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Registry #" value={dForm.registryNumber || ''} onChange={(v) => dUpdate('registryNumber', v)} disabled />
                  <Field label="Date of Death *" type="date" value={dForm.dateOfDeath || ''} onChange={(v) => dUpdate('dateOfDeath', v)} error={dErrors.dateOfDeath} required />
                  <Field label="Date of Burial *" type="date" value={dForm.dateOfBurial || ''} onChange={(v) => dUpdate('dateOfBurial', v)} error={dErrors.dateOfBurial} required />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Time of Burial *" as="select" value={dForm.timeOfBurial || ''} onChange={(v) => dUpdate('timeOfBurial', v)} required>
                    {burialTimes.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Field>
                  <Field label="Book # *" type="number" value={String(dForm.bookNumber || '')} onChange={(v) => dUpdate('bookNumber', parseInt(v) || 1)} error={dErrors.bookNumber} required />
                  <Field label="Page # *" type="number" value={String(dForm.pageNumber || '')} onChange={(v) => dUpdate('pageNumber', parseInt(v) || 1)} error={dErrors.pageNumber} required />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Officiant *" as="select" value={dForm.officiant || ''} onChange={(v) => dUpdate('officiant', v)} error={dErrors.officiant} required>
                    <option value="">Select officiant...</option>
                    {officiantOptions(dForm.officiant).map((o) => <option key={o} value={o}>{o}</option>)}
                  </Field>
                  <Field label="Cemetery" value={dForm.cemetery || ''} onChange={(v) => dUpdate('cemetery', v)} />
                </div>
              </div>

              {/* ═══ DECEASED ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={Cross} title="Deceased Information" color="#3D3A36" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <ParishionerLookupAutocomplete
                    label="Last Name *"
                    options={parishioners}
                    value={dForm.deceasedLastName || ''}
                    onChange={(v) => { dUpdate('deceasedLastName', v); dUpdate('deceasedParishionerId', ''); }}
                    onSelect={handleDeceasedSelect}
                    error={dErrors.deceasedLastName}
                    required
                    placeholder="Type a surname..."
                  />
                  <Field label="First Name *" value={dForm.deceasedFirstName || ''} onChange={(v) => dUpdate('deceasedFirstName', v)} error={dErrors.deceasedFirstName} required />
                  <Field label="Middle Name" value={dForm.deceasedMiddleName || ''} onChange={(v) => dUpdate('deceasedMiddleName', v)} />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Age" type="number" value={String(dForm.age || '')} onChange={(v) => dUpdate('age', parseInt(v) || 0)} />
                  <Field label="Gender *" as="select" value={dForm.gender || 'Male'} onChange={(v) => dUpdate('gender', v)} required>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </Field>
                  <Field label="Cause of Death *" value={dForm.causeOfDeath || ''} onChange={(v) => dUpdate('causeOfDeath', v)} error={dErrors.causeOfDeath} required />
                </div>
              </div>

              {/* ═══ NOTATIONS ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={BookOpen} title="Notations" color="#8C8374" />
                <div className="mt-3">
                  <Field label="Surviving Family / Additional Notes" as="textarea" value={dForm.notations || ''} onChange={(v) => dUpdate('notations', v)} />
                </div>
              </div>

              {/* ═══ SCHEDULE ═══ */}
              <ScheduleSection
                sacrament="death"
                date={dForm.scheduledDate || ''}
                time={dForm.scheduledTime || '9:00 AM'}
                officiant={dForm.scheduledOfficiant || ''}
                location={dForm.scheduledLocation || burialLocations[0]}
                autoCalendar={dAutoCalendar}
                onChangeDate={(v) => dUpdate('scheduledDate', v)}
                onChangeTime={(v) => dUpdate('scheduledTime', v)}
                onChangeOfficiant={(v) => dUpdate('scheduledOfficiant', v)}
                onChangeLocation={(v) => dUpdate('scheduledLocation', v)}
                onChangeAutoCalendar={setDAutoCalendar}
                eventTitle={`Burial: ${dForm.deceasedFirstName || ''} ${dForm.deceasedMiddleName || ''} ${dForm.deceasedLastName || ''}`}
                errors={{ date: dErrors.scheduledDate, time: dErrors.scheduledTime, officiant: dErrors.scheduledOfficiant }}
              />

              {/* ═══ REQUIREMENTS CHECKLIST (warn-only) ═══ */}
              <SacramentRequirementsChecklist
                sacramentKey="funeral"
                checkedIds={dForm.requirementsMet || []}
                onToggle={(id, on) => {
                  const cur = dForm.requirementsMet || [];
                  dUpdate('requirementsMet', on ? Array.from(new Set([...cur, id])) : cur.filter((x) => x !== id));
                }}
              />

              {/* ═══ PAYMENT ═══ */}
              <PaymentSection sacrament="death" paymentInfo={paymentInfo} onChange={handlePaymentChange} error={paymentError} />
            </>
          )}

          {/* ═══ MARGINAL ANNOTATIONS (all sacraments, existing records) ═══ */}
          {isEdit && <AnnotationsSection annotations={annotations} onAdd={handleAddAnnotation} onVoid={handleVoidAnnotation} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
          <button onClick={onClose} className="cos-btn cos-btn-secondary px-5 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} className="cos-btn cos-btn-primary px-6 py-2 text-sm">
            <Save className="w-4 h-4" />
            Save Record
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* =====================================================================
   BaptismLinkSection — link a confirmation to its baptism register entry
   ===================================================================== */
function BaptismLinkSection({
  firstName,
  lastName,
  dob,
  records,
  linkedId,
  onLink,
  onUnlink,
}: {
  firstName: string;
  lastName: string;
  dob: string;
  records: BaptismRecord[];
  linkedId: string;
  onLink: (b: BaptismRecord) => void;
  onUnlink: () => void;
}) {
  const [open, setOpen] = useState(false);
  const linked = records.find((r) => r.id === linkedId);
  const candidates = useMemo(
    () => (open ? findBaptismCandidates(firstName, lastName, dob || undefined, records).slice(0, 6) : []),
    [open, firstName, lastName, dob, records],
  );

  return (
    <div className="mt-3">
      <label className="label block text-warm-gray mb-1">Baptism Record Link</label>
      {linked ? (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-gold-glow/60 border border-gold/30">
          <Link2 className="w-4 h-4 text-gold flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="body-sm text-charcoal dark:text-dm-text font-medium truncate">
              {linked.childFirstName} {linked.childMiddleName} {linked.childLastName}
            </p>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted">
              Reg. {linked.registryNumber} — Book {linked.bookNumber}, Page {linked.pageNumber} — baptized {formatDate(linked.dateOfBaptism)}
            </p>
          </div>
          <button type="button" onClick={onUnlink} className="p-1 rounded text-warm-gray hover:text-error hover:bg-error/10 transition-colors" title="Unlink baptism record">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setOpen(!open)} className="cos-btn cos-btn-secondary h-8 px-3 text-xs">
            <Search className="w-3.5 h-3.5" />
            Find baptism record
          </button>
          {open && (
            candidates.length === 0 ? (
              <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-2">
                {lastName
                  ? `No matching baptism records found for "${[firstName, lastName].filter(Boolean).join(' ')}".`
                  : 'Enter the confirmand name above first, then search again.'}
              </p>
            ) : (
              <div className="mt-2 border border-parchment dark:border-dm-border rounded-lg divide-y divide-parchment/40 dark:divide-dm-border/40 overflow-hidden">
                {candidates.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => { onLink(b); setOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-charcoal dark:text-dm-text">
                        {b.childFirstName} {b.childMiddleName} {b.childLastName}
                      </span>
                      <span className="text-[10px] font-mono text-warm-gray flex-shrink-0">Book {b.bookNumber}/{b.pageNumber}</span>
                    </div>
                    <div className="text-xs text-warm-gray dark:text-dm-text-muted mt-0.5">
                      Born {formatDate(b.dateOfBirth)} — baptized {formatDate(b.dateOfBaptism)} — Reg. {b.registryNumber}
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>
      )}
      <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">
        Linking lets the baptism register be annotated automatically when this confirmation is saved (Canon 535).
      </p>
    </div>
  );
}

/* =====================================================================
   AnnotationsSection — chronological margin notes + add form
   ===================================================================== */
function AnnotationsSection({
  annotations,
  onAdd,
  onVoid,
}: {
  annotations: RegistryAnnotation[];
  onAdd: (type: RegistryAnnotationType, text: string) => void;
  onVoid: (id: string) => void;
}) {
  const [annType, setAnnType] = useState<RegistryAnnotationType>('note');
  const [annText, setAnnText] = useState('');
  const sorted = useMemo(
    () => [...annotations].sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [annotations],
  );

  const handleAdd = () => {
    const text = annText.trim();
    if (!text) return;
    onAdd(annType, text);
    setAnnText('');
  };

  return (
    <div className="border-t border-parchment dark:border-dm-border pt-5">
      <SectionHeader icon={BookOpen} title="Marginal Annotations" color="#5B3A73" />
      {sorted.length === 0 ? (
        <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-2">
          No annotations yet. Confirmations and marriages linked to this person are noted here automatically (Canon 535); you can also add margin notes manually.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {sorted.map((a) => (
            <div key={a.id} className={`flex items-start gap-2 p-2 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50 ${a.voided ? 'opacity-70' : ''}`}>
              <AnnotationTypeBadge type={a.type} />
              <div className="flex-1 min-w-0">
                <p className={`body-sm ${a.voided ? 'line-through text-warm-gray dark:text-dm-text-muted' : 'text-charcoal dark:text-dm-text'}`}>{a.text}</p>
                <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-0.5">
                  {formatDate(a.date)} — {a.by}{a.voided ? ' — voided' : ''}
                </p>
              </div>
              {!a.voided && (
                <button
                  type="button"
                  onClick={() => onVoid(a.id)}
                  className="p-1 rounded text-warm-gray hover:text-error hover:bg-error/10 transition-colors flex-shrink-0"
                  title="Void this annotation — struck through, never deleted (audited on save)"
                >
                  <Ban className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-2 items-end">
        <div className="w-40 flex-shrink-0">
          <label className="label block text-warm-gray mb-1">Type</label>
          <select
            value={annType}
            onChange={(e) => setAnnType(e.target.value as RegistryAnnotationType)}
            className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
          >
            {(['note', 'correction', 'confirmation', 'marriage', 'death'] as RegistryAnnotationType[]).map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="label block text-warm-gray mb-1">Annotation</label>
          <input
            type="text"
            value={annText}
            onChange={(e) => setAnnText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            placeholder="Add a margin note (saved with the record)..."
            className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={!annText.trim()}
          className={`cos-btn cos-btn-secondary h-9 px-3 text-sm flex-shrink-0 ${!annText.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
    </div>
  );
}

/* =====================================================================
   CertificateModal — Generate certificate with template selector
   ===================================================================== */
function CertificateModal({ record, sacrament, onClose, onToast }: { record: RegistryRecord; sacrament: SacramentTab; onClose: () => void; onToast: (msg: string, type: ToastType) => void }) {
  const feeLabel = sacrament === 'baptism' ? 'Baptism' : sacrament === 'marriage' ? 'Marriage' : sacrament === 'confirmation' ? 'Confirmation' : 'Death';
  const personName = getPersonName(record, sacrament);

  // Use persisted (user-edited) templates so Template Editor changes apply
  // here; only this sacrament's templates are offered.
  const [templates, setTemplates] = useState<CertificateTemplate[]>(() => loadCertificateTemplates().filter((t) => t.sacrament === sacrament));
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => (templates.find((t) => t.isDefault) ?? templates[0]).id);
  const templateFileRef = useRef<HTMLInputElement>(null);
  // Guided visual editor — opened from this modal to design a new template or
  // edit a design-backed one. On save it refreshes this list and selects it.
  const [designEditor, setDesignEditor] = useState<{ template: CertificateTemplate | null } | null>(null);

  // Upload a custom .html certificate template. It persists to the shared store,
  // so it also shows up in the Template Editor for further tweaking.
  const handleUploadTemplate = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked later
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) { onToast('That file is empty', 'error'); return; }
      const name = file.name.replace(/\.[^.]+$/, '') || 'Uploaded Template';
      const tmpl = templateFromUpload(text, name, sacrament);
      const ok = saveCertificateTemplates([...loadCertificateTemplates(), tmpl]);
      if (!ok) { onToast('Could not save — storage is full', 'error'); return; }
      setTemplates(loadCertificateTemplates().filter((t) => t.sacrament === sacrament));
      setSelectedTemplateId(tmpl.id);
      onToast(`Uploaded "${tmpl.name}". Tip: use tokens like {{child_name}} so it fills in data.`, 'success');
    } catch {
      onToast('Could not read that file', 'error');
    }
  };
  const [zoom, setZoom] = useState(100);
  const [isCopy, setIsCopy] = useState(false);
  const [certFeeStatus, setCertFeeStatus] = useState<'original' | 'reprint'>('original');
  const [certPayment, setCertPayment] = useState<PaymentInfo>(() =>
    defaultPaymentInfo(getFeeForSacrament(feeLabel)?.certificateFee ?? 100)
  );
  const previewRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId)!;
  const parishTokens = getCertificateTokens();
  let recordHTML = replaceTokens(selectedTemplate.html, record, { isCopy });
  // Templates without the {{copy_watermark}} token (the original baptism set)
  // still get the overlay when the certificate is marked as a copy.
  if (isCopy && !selectedTemplate.html.includes('{{copy_watermark}}')) {
    recordHTML = `<div style="position: relative;">${recordHTML}${COPY_WATERMARK_HTML}</div>`;
  }
  // Escape parish config values (they land in dangerouslySetInnerHTML) and
  // insert via a replacer FUNCTION so $&, $', $` in values stays literal.
  const renderedHTML = Object.entries(parishTokens).reduce(
    (html, [key, value]) => html.replace(new RegExp(`{{${key}}}`, 'g'), () => escapeHtml(value)),
    recordHTML,
  );

  const currency = getCurrencySymbol();
  const certFee = getFeeForSacrament(feeLabel)?.certificateFee ?? 100;
  const canDownload = certFeeStatus === 'original' || certPayment.status === 'collected' || certPayment.status === 'collect_now' || certPayment.status === 'waived';

  const auditPrint = (how: string) => {
    appendRegistryAudit('Printed', record.id, `Generated ${feeLabel.toLowerCase()} certificate for ${personName}${isCopy ? ' (COPY)' : ''} — ${how}`);
  };

  const postCopyFeeIfDue = () => {
    if (certFeeStatus === 'reprint' && certPayment.status === 'collect_now') {
      const glEntry: JournalEntry = {
        id: `auto-${Date.now()}`,
        date: certPayment.date,
        reference: certPayment.receiptNumber || `CERT-${record.registryNumber}`,
        description: `Certificate copy fee — ${personName}`,
        lines: [
          { accountCode: '1000', accountName: 'Cash on Hand', debit: certPayment.amount, credit: 0 },
          { accountCode: '4200', accountName: 'Fees & Permits', debit: 0, credit: certPayment.amount },
        ],
      };
      addToJournal(glEntry);
    }
  };

  const handleDownloadPDF = async () => {
    if (!canDownload) return;
    if (!previewRef.current) return;
    postCopyFeeIfDue();
    auditPrint('PDF download');
    const html2canvas = (await import('html2canvas')).default;
    const jsPDF = (await import('jspdf')).jsPDF;
    const canvas = await html2canvas(previewRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${feeLabel}_${personName.replace(/[^\w]+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handlePrint = () => {
    if (!canDownload) return;
    // Celebrate first certificate printed
    celebrateFirstAction('certificate');
    postCopyFeeIfDue();
    auditPrint('print');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>Certificate</title>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
      <style>body{margin:0;padding:0;}</style></head>
      <body>${renderedHTML}</body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-start justify-center p-4 pt-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[1100px] overflow-hidden my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div>
            <h2 className="heading-lg text-charcoal dark:text-dm-text">Generate {feeLabel} Certificate</h2>
            <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-0.5">
              {personName} — Registry #{record.registryNumber}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Three-panel layout */}
        <div className="flex flex-col lg:flex-row gap-6 p-6" style={{ minHeight: 500 }}>
          {/* Left — Template Select */}
          <div className="w-full lg:w-56 flex-shrink-0 space-y-3">
            <h3 className="heading-sm text-charcoal dark:text-dm-text">Templates</h3>
            <div className="space-y-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedTemplateId === t.id
                      ? 'border-gold bg-gold-glow'
                      : 'border-parchment bg-white hover:bg-cream-dark dark:border-dm-border dark:bg-dm-surface dark:hover:bg-dm-surface-raised'
                  }`}
                >
                  <div className="text-sm font-medium text-charcoal dark:text-dm-text">{t.name}</div>
                  <div className="text-xs text-warm-gray dark:text-dm-text-muted mt-0.5">{t.description}</div>
                  {t.isDefault && (
                    <span className="cos-badge cos-badge-warning mt-2 inline-block">Default</span>
                  )}
                </button>
              ))}
            </div>
            {/* Design a brand-new template in the guided visual editor. */}
            <button
              onClick={() => setDesignEditor({ template: null })}
              className="w-full cos-btn cos-btn-primary text-xs py-2"
              title="Design a new certificate visually — no HTML"
            >
              <Sparkles className="w-3.5 h-3.5" /> Design new template
            </button>
            {/* When the selected template was built visually, offer to reopen it. */}
            {selectedTemplate?.design && (
              <button
                onClick={() => setDesignEditor({ template: selectedTemplate })}
                className="w-full cos-btn cos-btn-secondary text-xs py-2"
                title="Reopen this template in the guided visual editor"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit visually
              </button>
            )}
            <input ref={templateFileRef} type="file" accept=".html,.htm,text/html" onChange={handleUploadTemplate} className="hidden" />
            <button
              onClick={() => templateFileRef.current?.click()}
              className="w-full cos-btn cos-btn-secondary text-xs py-2"
              title="Upload a custom .html certificate template that uses {{tokens}}"
            >
              <Upload className="w-3.5 h-3.5" /> Upload template
            </button>
            <p className="text-[11px] text-warm-gray dark:text-dm-text-muted leading-snug">
              Design visually, or upload an .html file using tokens like <span className="font-mono">{'{{child_name}}'}</span>. Fine-tune raw HTML later in the Template Editor.
            </p>
          </div>

          {/* Center — Live Preview */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
              <h3 className="heading-sm text-charcoal dark:text-dm-text">Preview</h3>
              <label className="flex items-center gap-2 cursor-pointer" title="Adds a diagonal COPY watermark for duplicate copies">
                <input
                  type="checkbox"
                  checked={isCopy}
                  onChange={(e) => setIsCopy(e.target.checked)}
                  className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
                />
                <span className="body-sm text-charcoal dark:text-dm-text">Mark as COPY</span>
              </label>
              <div className="flex items-center gap-1 bg-cream dark:bg-dm-surface-raised rounded-lg p-0.5">
                {[75, 100, 125].map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoom(z)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      zoom === z ? 'bg-white dark:bg-dm-surface shadow-sm text-charcoal dark:text-dm-text' : 'text-warm-gray'
                    }`}
                  >
                    {z}%
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-auto border border-parchment dark:border-dm-border rounded-lg bg-cream-dark dark:bg-dm-bg p-4 flex justify-center" style={{ maxHeight: 650 }}>
              <div
                ref={previewRef}
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center', width: 794, minHeight: 1123 }}
                className="bg-white shadow-lg"
                dangerouslySetInnerHTML={{ __html: renderedHTML }}
              />
            </div>
          </div>

          {/* Right — Token List */}
          <div className="w-full lg:w-52 flex-shrink-0 space-y-3">
            <h3 className="heading-sm text-charcoal dark:text-dm-text">Tokens</h3>
            <p className="text-xs text-warm-gray dark:text-dm-text-muted">Click to copy</p>
            <div className="space-y-1.5">
              {certificateTokensByType[sacrament].map((t) => (
                <TokenButton key={t.token} token={t.token} label={t.label} />
              ))}
            </div>
          </div>
        </div>

        {/* Certificate Copy Fee */}
        <div className="px-6 py-4 border-t border-parchment dark:border-dm-border bg-cream-dark/30 dark:bg-dm-surface-raised/30">
          <h3 className="heading-sm text-charcoal dark:text-dm-text mb-3">Certificate Copy Fee</h3>
          <p className="body-xs text-warm-gray dark:text-dm-text-muted mb-3">
            Original certificate is included with the sacrament fee. Additional or replacement copies are {currency}{certFee} each.
          </p>

          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="cert-fee-status"
                checked={certFeeStatus === 'original'}
                onChange={() => setCertFeeStatus('original')}
                className="mt-0.5 w-4 h-4 rounded-full border-parchment text-gold focus:ring-gold"
              />
              <span className="body-sm text-charcoal dark:text-dm-text font-medium">Original (first copy) — no additional fee</span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="cert-fee-status"
                checked={certFeeStatus === 'reprint'}
                onChange={() => setCertFeeStatus('reprint')}
                className="mt-0.5 w-4 h-4 rounded-full border-parchment text-gold focus:ring-gold"
              />
              <div className="flex-1">
                <span className="body-sm text-charcoal dark:text-dm-text font-medium">Reprint / additional copy — {currency}{certFee}</span>
              </div>
            </label>
          </div>

          {certFeeStatus === 'reprint' && (
            <div className="mt-3 pl-7 space-y-3">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cert-payment-status"
                    checked={certPayment.status === 'collected'}
                    onChange={() => setCertPayment((p) => ({ ...p, status: 'collected' }))}
                    className="w-4 h-4 rounded-full border-parchment text-gold focus:ring-gold"
                  />
                  <span className="body-sm text-charcoal dark:text-dm-text">Already collected</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cert-payment-status"
                    checked={certPayment.status === 'collect_now'}
                    onChange={() => setCertPayment((p) => ({ ...p, status: 'collect_now' }))}
                    className="w-4 h-4 rounded-full border-parchment text-gold focus:ring-gold"
                  />
                  <span className="body-sm text-charcoal dark:text-dm-text">Collect now</span>
                </label>
                {certPayment.status === 'collect_now' && (
                  <div className="ml-6 grid grid-cols-3 gap-3">
                    <div>
                      <label className="label block text-warm-gray mb-1">Amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-warm-gray">{currency}</span>
                        <input
                          type="number"
                          value={certPayment.amount}
                          onChange={(e) => setCertPayment((p) => ({ ...p, amount: parseInt(e.target.value) || 0 }))}
                          className="h-9 w-full pl-8 pr-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="label block text-warm-gray mb-1">Method</label>
                      <select
                        value={certPayment.method}
                        onChange={(e) => setCertPayment((p) => ({ ...p, method: e.target.value as PaymentInfo['method'] }))}
                        className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Check">Check</option>
                        <option value="GCash">GCash</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                      </select>
                    </div>
                    <div>
                      <label className="label block text-warm-gray mb-1">Receipt #</label>
                      <input
                        type="text"
                        value={certPayment.receiptNumber}
                        onChange={(e) => setCertPayment((p) => ({ ...p, receiptNumber: e.target.value }))}
                        placeholder="e.g., OR-1234"
                        className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                      />
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cert-payment-status"
                    checked={certPayment.status === 'waived'}
                    onChange={() => setCertPayment((p) => ({ ...p, status: 'waived' }))}
                    className="w-4 h-4 rounded-full border-parchment text-gold focus:ring-gold"
                  />
                  <span className="body-sm text-charcoal dark:text-dm-text">Waived</span>
                </label>
                {certPayment.status === 'waived' && (
                  <div className="ml-6 grid grid-cols-2 gap-3">
                    <div>
                      <label className="label block text-warm-gray mb-1">Reason</label>
                      <select
                        value={certPayment.waiveReason}
                        onChange={(e) => setCertPayment((p) => ({ ...p, waiveReason: e.target.value }))}
                        className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
                      >
                        <option>Financial hardship</option>
                        <option>Parish staff</option>
                        <option>Bishop dispensation</option>
                      </select>
                    </div>
                    <div>
                      <label className="label block text-warm-gray mb-1">Approved by</label>
                      <select
                        value={certPayment.waiveApprovedBy}
                        onChange={(e) => setCertPayment((p) => ({ ...p, waiveApprovedBy: e.target.value }))}
                        className="h-9 w-full px-3 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
                      >
                        <option>Fr. Reyes</option>
                        <option>Fr. Santos</option>
                        <option>Bishop</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {!canDownload && certFeeStatus === 'reprint' && (
            <p className="body-xs text-error mt-2">
              Please select a payment option (already collected, collect now, or waived) to enable download/print.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-parchment dark:border-dm-border">
          <button onClick={onClose} className="cos-btn cos-btn-secondary px-5 py-2 text-sm">Cancel</button>
          <div className="flex gap-3">
            <button
              onClick={handlePrint}
              disabled={!canDownload}
              className={`cos-btn cos-btn-secondary px-4 py-2 text-sm ${!canDownload ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={!canDownload}
              className={`cos-btn cos-btn-primary px-5 py-2 text-sm ${!canDownload ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
    {designEditor && (
      <CertificateDesignEditor
        template={designEditor.template}
        sacrament={sacrament}
        onClose={() => setDesignEditor(null)}
        onToast={onToast}
        onSaved={(t) => {
          setTemplates(loadCertificateTemplates().filter((x) => x.sacrament === sacrament));
          setSelectedTemplateId(t.id);
          setDesignEditor(null);
        }}
      />
    )}
    </>
  );
}

/* =====================================================================
   TemplateEditorModal — Edit certificate templates
   ===================================================================== */
function TemplateEditorModal({ onClose, onToast }: { onClose: () => void; onToast: (msg: string, type: ToastType) => void }) {
  // Load persisted (user-edited) templates so prior edits survive reloads.
  const [templates, setTemplates] = useState<CertificateTemplate[]>(() => loadCertificateTemplates());
  const [activeTmplId, setActiveTmplId] = useState(templates[0].id);
  const [html, setHtml] = useState(templates[0].html);
  const activeTmpl = templates.find((t) => t.id === activeTmplId)!;
  const uploadRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  // Guided visual editor — the recommended path. Raw HTML below is the
  // "Advanced" escape hatch. Opened for a design-backed template (Edit
  // visually) or to author a fresh one (Design new).
  const [designEditor, setDesignEditor] = useState<{
    template: CertificateTemplate | null;
    sacrament: CertificateSacrament;
  } | null>(null);

  // Upload a custom .html file as a new editable template (persisted immediately).
  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) { onToast('That file is empty', 'error'); return; }
      const name = file.name.replace(/\.[^.]+$/, '') || 'Uploaded Template';
      const tmpl = templateFromUpload(text, name, activeTmpl.sacrament);
      const next = [...templates, tmpl];
      if (!saveCertificateTemplates(next)) { onToast('Could not save — storage is full', 'error'); return; }
      setTemplates(next);
      setActiveTmplId(tmpl.id);
      setHtml(tmpl.html);
      onToast(`Uploaded "${tmpl.name}" — now editable`, 'success');
    } catch {
      onToast('Could not read that file', 'error');
    }
  };

  // Embed a parish seal/logo as a base64 <img> at the end of the template HTML.
  // Kept small (<1 MB) so the template still fits storage and prints quickly.
  const handleInsertImage = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { onToast('Please choose an image file', 'error'); return; }
    if (file.size > 1_000_000) { onToast('That image is over 1 MB — please use a smaller seal/logo so certificates save and print smoothly', 'warning'); return; }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      setHtml((prev) => `${prev}\n<img src="${dataUrl}" alt="seal" style="max-width:120px; height:auto;" />\n`);
      onToast('Image embedded — reposition it in the HTML, then Save (Duplicate first if this is a system template)', 'success');
    } catch {
      onToast('Could not read that image', 'error');
    }
  };

  const handleSave = () => {
    if (activeTmpl.isSystem) {
      onToast('System templates are read-only. Duplicate or edit a custom template to save changes.', 'warning');
      return;
    }
    const next = templates.map((t) => (t.id === activeTmplId ? { ...t, html } : t));
    setTemplates(next);
    const ok = saveCertificateTemplates(next);
    onToast(ok ? 'Template saved' : 'Could not save template — storage is full', ok ? 'success' : 'error');
  };

  const handleReset = () => {
    // Reset to the module default (factory) HTML for this template.
    const original = certificateTemplates.find((t) => t.id === activeTmplId);
    if (original) setHtml(original.html);
  };

  // The escape hatch the read-only toast promises: copy the active template
  // (including any unsaved editor changes) to a new EDITABLE id. The loader
  // preserves non-default ids, so duplicates survive reloads and appear in
  // the certificate modal for their sacrament.
  const handleDuplicate = () => {
    const copy: CertificateTemplate = {
      ...activeTmpl,
      id: `tcustom-${Date.now()}`,
      name: `${activeTmpl.name} (Custom)`,
      isSystem: false,
      isDefault: false,
      html,
    };
    const next = [...templates, copy];
    const ok = saveCertificateTemplates(next);
    if (!ok) {
      onToast('Could not duplicate template — storage is full', 'error');
      return;
    }
    setTemplates(next);
    setActiveTmplId(copy.id);
    setHtml(copy.html);
    onToast(`Duplicated as "${copy.name}" — this copy is editable`, 'success');
  };

  return (
    <>
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
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[1100px] overflow-hidden my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div className="flex items-center gap-3">
            <Code className="w-5 h-5 text-gold" />
            <div>
              <h2 className="heading-lg text-charcoal dark:text-dm-text">Certificate Templates</h2>
              <p className="body-xs text-warm-gray dark:text-dm-text-muted">Design visually, or edit raw HTML under Advanced.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDesignEditor({ template: null, sacrament: activeTmpl.sacrament })}
              className="cos-btn cos-btn-primary h-8 px-3 text-xs"
              title="Design a new certificate visually — no HTML"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Design new
            </button>
            <input ref={uploadRef} type="file" accept=".html,.htm,text/html" onChange={handleUpload} className="hidden" />
            <button onClick={() => uploadRef.current?.click()} className="cos-btn cos-btn-secondary h-8 px-3 text-xs" title="Upload a custom .html template that uses {{tokens}}">
              <Upload className="w-3.5 h-3.5" />
              Upload
            </button>
            <button onClick={handleDuplicate} className="cos-btn cos-btn-secondary h-8 px-3 text-xs" title="Copy this template to a new editable one">
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </button>
            <button onClick={handleReset} className="cos-btn cos-btn-secondary h-8 px-3 text-xs">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button onClick={handleSave} className="cos-btn cos-btn-primary h-8 px-4 text-xs">
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text ml-2">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-0" style={{ minHeight: 600 }}>
          {/* Template list */}
          <div className="w-full lg:w-48 border-r border-parchment dark:border-dm-border p-4 space-y-2">
            <h3 className="heading-sm text-charcoal dark:text-dm-text text-xs uppercase mb-2">Templates</h3>
            {templates.map((t) => (
              <div
                key={t.id}
                className={`rounded-lg transition-all ${
                  activeTmplId === t.id
                    ? 'bg-gold-glow border border-gold'
                    : 'hover:bg-cream-dark dark:hover:bg-dm-surface-raised'
                }`}
              >
                <button
                  onClick={() => { setActiveTmplId(t.id); setHtml(t.html); }}
                  className={`w-full text-left p-2.5 rounded-lg text-sm ${
                    activeTmplId === t.id ? 'text-charcoal dark:text-dm-text' : 'text-warm-gray dark:text-dm-text-muted'
                  }`}
                >
                  {t.name}
                  {t.isSystem && <span className="ml-1.5 text-[10px] opacity-50">(system)</span>}
                  {t.design && (
                    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-gold">
                      <Sparkles className="w-2.5 h-2.5" /> visual
                    </span>
                  )}
                </button>
                {t.design && (
                  <button
                    onClick={() => setDesignEditor({ template: t, sacrament: t.sacrament })}
                    className="w-full text-left px-2.5 pb-2 -mt-1 text-[11px] text-gold hover:underline inline-flex items-center gap-1"
                    title="Edit this template in the guided visual editor"
                  >
                    <Pencil className="w-3 h-3" /> Edit visually
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Code Editor */}
          <div className="flex-1 border-r border-parchment dark:border-dm-border flex flex-col min-w-0">
            <div className="px-4 py-2 border-b border-parchment dark:border-dm-border bg-cream-dark dark:bg-dm-surface-raised flex items-center justify-between">
              <span className="label text-warm-gray">Advanced (HTML)</span>
              <div className="flex items-center gap-2">
                {activeTmpl.design && (
                  <button
                    onClick={() => setDesignEditor({ template: activeTmpl, sacrament: activeTmpl.sacrament })}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-gold/30 bg-gold-glow text-[10px] text-charcoal dark:text-dm-text hover:bg-gold/20 transition-colors"
                    title="This template was built visually — reopen the guided editor"
                  >
                    <Sparkles className="w-3 h-3" /> Edit visually
                  </button>
                )}
                <input ref={imageRef} type="file" accept="image/*" onChange={handleInsertImage} className="hidden" />
                <button onClick={() => imageRef.current?.click()} className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-gold/30 bg-gold-glow text-[10px] text-charcoal dark:text-dm-text hover:bg-gold/20 transition-colors" title="Embed a parish seal or logo image">
                  <ImageIcon className="w-3 h-3" /> Insert image
                </button>
                <span className="text-[10px] text-warm-gray font-mono">{activeTmpl.isSystem ? 'Read-only' : 'Editable'}</span>
              </div>
            </div>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              readOnly={activeTmpl.isSystem}
              className="flex-1 w-full p-4 font-mono text-[13px] leading-relaxed bg-[#FAFAF7] dark:bg-[#1a1a1a] text-charcoal dark:text-dm-text resize-none focus:outline-none"
              style={{ fontFamily: "'JetBrains Mono', monospace", minHeight: 500 }}
              spellCheck={false}
            />
          </div>

          {/* Preview */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-4 py-2 border-b border-parchment dark:border-dm-border bg-cream-dark dark:bg-dm-surface-raised flex items-center justify-between">
              <span className="label text-warm-gray">Live Preview</span>
            </div>
            <div className="flex-1 overflow-auto bg-cream dark:bg-dm-bg p-4 flex justify-center">
              <div className="bg-white shadow-lg" style={{ width: 420, minHeight: 594, transform: 'scale(0.55)', transformOrigin: 'top center' }}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </div>
        </div>

        {/* Token palette */}
        <div className="px-6 py-3 border-t border-parchment dark:border-dm-border bg-cream-dark/50 dark:bg-dm-surface-raised/50">
          <span className="label text-warm-gray mr-3">Available Tokens ({activeTmpl.sacrament}):</span>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {certificateTokensByType[activeTmpl.sacrament].map((t) => (
              <span
                key={t.token}
                className="inline-flex items-center px-2 py-1 rounded border border-gold/30 bg-gold-glow text-[11px] font-mono text-charcoal dark:text-dm-text cursor-pointer hover:bg-gold/20 transition-colors"
                onClick={() => setHtml((prev) => prev + t.token)}
                title="Click to insert"
              >
                {t.token}
              </span>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
    {designEditor && (
      <CertificateDesignEditor
        template={designEditor.template}
        sacrament={designEditor.sacrament}
        onClose={() => setDesignEditor(null)}
        onToast={onToast}
        onSaved={(t) => {
          const next = loadCertificateTemplates();
          setTemplates(next);
          setActiveTmplId(t.id);
          setHtml(t.html);
          setDesignEditor(null);
        }}
      />
    )}
    </>
  );
}

/* =====================================================================
   TokenButton — copyable token chip
   ===================================================================== */
function TokenButton({ token, label: _label }: { token: string; label: string }) {
  void _label;
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(token).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handleCopy}
      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded border border-gold/20 bg-gold-glow/50 hover:bg-gold-glow transition-colors text-left"
      title="Click to copy"
    >
      <span className="mono-sm text-charcoal dark:text-dm-text">{token}</span>
      {copied ? (
        <Check className="w-3 h-3 text-success flex-shrink-0 ml-1" />
      ) : (
        <Copy className="w-3 h-3 text-warm-gray flex-shrink-0 ml-1" />
      )}
    </button>
  );
}
