import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
} from 'lucide-react';
import DataTable from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import HelpTooltip from '@/components/HelpTooltip';
import { getLabel } from '@/lib/friendlyLabels';
import EmptyState from '@/components/EmptyState';
import {
  type BaptismRecord,
  type MarriageRecord,
  type ConfirmationRecord,
  type DeathRecord,
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
  certificateTokens,
  replaceTokens,
} from '@/lib/registryData';
import { getCertificateTokens, getCurrencySymbol } from '@/lib/parishConfig';
import {
  BARANGAYS,
  SITIOS,
  CITIES,
  PROVINCES,
  parishionerLookupList,
  type ParishionerLookup,
} from '@/lib/directoryData';
import type { FeeScheduleItem } from '@/lib/feeSchedule';
import { getFeeForSacrament } from '@/lib/feeSchedule';
import { celebrateFirstAction, celebrateMilestone } from '@/components/FirstRunDetector';

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
  { key: 'baptism', label: 'Baptism', icon: Droplets, color: '#2D6A4F', count: b },
  { key: 'marriage', label: 'Marriage', icon: Heart, color: '#6B2737', count: m },
  { key: 'confirmation', label: 'Confirmation', icon: Flame, color: '#C9963B', count: c },
  { key: 'death', label: 'Death / Funeral', icon: Cross, color: '#3D3A36', count: d },
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

function genId(prefix: string) {
  return `${prefix}-${Date.now()}`;
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
const JOURNAL_KEY = 'churchos_journal';

function addToJournal(entry: JournalEntry) {
  try {
    const existing = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]') as JournalEntry[];
    existing.push(entry);
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(existing));
  } catch { /* ignore */ }
}

function addToAccountsReceivable(entry: AccountsReceivableEntry) {
  try {
    const AR_KEY = 'churchos_accounts_receivable';
    const existing = JSON.parse(localStorage.getItem(AR_KEY) || '[]') as (AccountsReceivableEntry & { id: string; createdAt: string })[];
    existing.push({ ...entry, id: `ar-${Date.now()}`, createdAt: new Date().toISOString() });
    localStorage.setItem(AR_KEY, JSON.stringify(existing));
  } catch { /* ignore */ }
}

/* ── Fee Override Audit Log ── */
const FEE_OVERRIDE_AUDIT_KEY = 'churchos_fee_override_audit';

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
}

function logFeeOverride(entry: Omit<FeeOverrideAuditEntry, 'id' | 'timestamp'>) {
  try {
    const existing = JSON.parse(localStorage.getItem(FEE_OVERRIDE_AUDIT_KEY) || '[]') as FeeOverrideAuditEntry[];
    existing.push({
      ...entry,
      id: `foa-${Date.now()}`,
      timestamp: new Date().toISOString(),
    });
    localStorage.setItem(FEE_OVERRIDE_AUDIT_KEY, JSON.stringify(existing));
  } catch { /* ignore */ }
}

export function getFeeOverrideAudit(): FeeOverrideAuditEntry[] {
  try {
    return JSON.parse(localStorage.getItem(FEE_OVERRIDE_AUDIT_KEY) || '[]') as FeeOverrideAuditEntry[];
  } catch { return []; }
}

function getPersonName(record: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord, sacrament: SacramentTab): string {
  switch (sacrament) {
    case 'baptism': return `${(record as BaptismRecord).childFirstName} ${(record as BaptismRecord).childLastName}`;
    case 'marriage': return `${(record as MarriageRecord).groomFirstName} ${(record as MarriageRecord).groomLastName} & ${(record as MarriageRecord).brideFirstName} ${(record as MarriageRecord).brideLastName}`;
    case 'confirmation': return `${(record as ConfirmationRecord).confirmandFirstName} ${(record as ConfirmationRecord).confirmandLastName}`;
    case 'death': return `${(record as DeathRecord).deceasedFirstName} ${(record as DeathRecord).deceasedLastName}`;
  }
}

const defaultPaymentInfo = (ceremonyFee: number): PaymentInfo => ({
  status: 'collect_now', // DEFAULT: always collect now; other options require override
  amount: ceremonyFee,
  method: 'Cash',
  receiptNumber: '',
  date: new Date().toISOString().split('T')[0],
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
  const [certRecord, setCertRecord] = useState<BaptismRecord | null>(null);
  const [templateModal, setTemplateModal] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
  const { toasts, addToast, removeToast } = useToasts();

  /* data state */
  const [bData, setBData] = useState<BaptismRecord[]>(baptismRecords);
  const [mData, setMData] = useState<MarriageRecord[]>(marriageRecords);
  const [cData, setCData] = useState<ConfirmationRecord[]>(confirmationRecords);
  const [dData, setDData] = useState<DeathRecord[]>(deathRecords);

  const tabConfigs = useMemo(() => tabs(bData.length, mData.length, cData.length, dData.length), [bData.length, mData.length, cData.length, dData.length]);
  const activeConfig = tabConfigs.find((t) => t.key === activeTab)!;

  /* filtered data */
  const baptismFiltered = bData.filter((r) => {
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
  });

  const marriageFiltered = mData.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${r.groomFirstName} ${r.groomLastName}`.toLowerCase().includes(q) ||
      `${r.brideFirstName} ${r.brideLastName}`.toLowerCase().includes(q) ||
      r.officiant.toLowerCase().includes(q) ||
      `${r.bookNumber}/${r.pageNumber}`.includes(q) ||
      r.registryNumber.toLowerCase().includes(q)
    );
  });

  const confirmationFiltered = cData.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${r.confirmandFirstName} ${r.confirmandLastName}`.toLowerCase().includes(q) ||
      r.officiant.toLowerCase().includes(q) ||
      `${r.bookNumber}/${r.pageNumber}`.includes(q) ||
      r.registryNumber.toLowerCase().includes(q)
    );
  });

  const deathFiltered = dData.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${r.deceasedFirstName} ${r.deceasedLastName}`.toLowerCase().includes(q) ||
      r.officiant.toLowerCase().includes(q) ||
      `${r.bookNumber}/${r.pageNumber}`.includes(q) ||
      r.registryNumber.toLowerCase().includes(q)
    );
  });

  /* actions */
  const handleEdit = useCallback(
    (record: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord) => {
      setEditingRecord(record);
      setRecordModal('edit');
    }, []
  );

  const handleDelete = (id: string) => setDeleteDialog({ open: true, id });
  const confirmDelete = () => {
    const id = deleteDialog.id;
    if (activeTab === 'baptism') setBData((prev) => prev.filter((r) => r.id !== id));
    if (activeTab === 'marriage') setMData((prev) => prev.filter((r) => r.id !== id));
    if (activeTab === 'confirmation') setCData((prev) => prev.filter((r) => r.id !== id));
    if (activeTab === 'death') setDData((prev) => prev.filter((r) => r.id !== id));
    setDeleteDialog({ open: false, id: '' });
    addToast('Record deleted successfully', 'success');
  };

  const handleGenerateCert = (record: BaptismRecord) => {
    setCertRecord(record);
    setCertModal(true);
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
    { key: 'childName', header: "Child's Name", width: '200px', sortable: true, render: (r) => `${r.childFirstName} ${r.childMiddleName} ${r.childLastName}` },
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
  ];

  const marriageColumns: Column<MarriageRecord>[] = [
    { key: 'registryNumber', header: 'Registry #', width: '110px', sortable: true },
    { key: 'groomName', header: 'Groom', width: '160px', sortable: true, render: (r) => `${r.groomFirstName} ${r.groomLastName}` },
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
  ];

  const confirmationColumns: Column<ConfirmationRecord>[] = [
    { key: 'registryNumber', header: 'Registry #', width: '110px', sortable: true },
    { key: 'name', header: 'Confirmand', width: '200px', sortable: true, render: (r) => `${r.confirmandFirstName} ${r.confirmandMiddleName} ${r.confirmandLastName}` },
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
  ];

  const deathColumns: Column<DeathRecord>[] = [
    { key: 'registryNumber', header: 'Registry #', width: '110px', sortable: true },
    { key: 'deceasedName', header: 'Deceased', width: '200px', sortable: true, render: (r) => `${r.deceasedFirstName} ${r.deceasedMiddleName} ${r.deceasedLastName}` },
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

      {/* ── Tab Bar ─────────────────────────────────── */}
      <div className="flex gap-1 border-b-2 border-parchment dark:border-dm-border pb-0 overflow-x-auto" data-tour="registry-tabs">
        {tabConfigs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { setActiveTab(t.key); setSearchQuery(''); }}
              className="relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all whitespace-nowrap"
              style={{
                color: isActive ? t.color : '#8C8374',
                borderBottom: isActive ? `3px solid ${t.color}` : '3px solid transparent',
                marginBottom: '-2px',
              }}
            >
              <Icon className="w-4 h-4" style={{ color: isActive ? t.color : '#8C8374' }} />
              <span>{t.label}</span>
              <span
                className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  backgroundColor: isActive ? `${t.color}18` : '#F2EFE8',
                  color: isActive ? t.color : '#8C8374',
                }}
              >
                {t.count}
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
                    <select className="w-full h-9 rounded-md border border-parchment bg-white text-sm dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text">
                      <option>All Officiants</option>
                      {officiants.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label block text-warm-gray mb-1">Status</label>
                    <select className="w-full h-9 rounded-md border border-parchment bg-white text-sm dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text">
                      <option>All Statuses</option>
                      <option>Active</option>
                      <option>Cancelled</option>
                      <option>Annotated</option>
                    </select>
                  </div>
                  <div>
                    <label className="label block text-warm-gray mb-1">Year</label>
                    <select className="w-full h-9 rounded-md border border-parchment bg-white text-sm dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text">
                      <option>All Years</option>
                      <option>2024</option>
                      <option>2023</option>
                      <option>2022</option>
                      <option>2021</option>
                      <option>2020</option>
                    </select>
                  </div>
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
                  {['Export as PDF', 'Export as Excel', 'Print List'].map((item) => (
                    <button
                      key={item}
                      className="w-full text-left px-4 py-2.5 text-sm text-charcoal hover:bg-cream-dark dark:text-dm-text dark:hover:bg-dm-surface-raised transition-colors"
                      onClick={() => setExportOpen(false)}
                    >
                      {item}
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

      {/* ── Data Table / Empty State ──────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {(getData() as unknown as Record<string, unknown>[]).length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title={getLabel('registry.empty.title', 'No baptism records yet')}
              description={getLabel('registry.empty.description', "When you start recording baptisms, they'll appear here. Click 'Add New Record' to begin!")}
              tip={getLabel('registry.empty.tip', 'You can also search existing records by name or date.')}
              actionLabel={getLabel('registry.add', 'Add Record')}
              actionIcon={Plus}
              onAction={() => { setEditingRecord(null); setRecordModal('add'); }}
            />
          ) : (
            <DataTable
              columns={getColumns() as unknown as Column<Record<string, unknown>>[]}
              data={getData() as unknown as Record<string, unknown>[]}
              actionsColumn={(row: Record<string, unknown>) => (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEdit(row as unknown as BaptismRecord & MarriageRecord & ConfirmationRecord & DeathRecord)}
                    className="p-1.5 rounded-md text-warm-gray hover:text-charcoal hover:bg-cream-dark dark:text-dm-text-muted dark:hover:text-dm-text dark:hover:bg-dm-surface-raised transition-colors"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {activeTab === 'baptism' && (
                    <button
                      onClick={() => handleGenerateCert(row as unknown as BaptismRecord)}
                      className="p-1.5 rounded-md text-warm-gray hover:text-gold hover:bg-cream-dark transition-colors"
                      title="Generate Certificate"
                      data-tour="registry-certificate"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete((row as unknown as { id: string }).id)}
                    className="p-1.5 rounded-md text-warm-gray hover:text-error hover:bg-error/10 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
            onClose={() => { setRecordModal(null); setEditingRecord(null); }}
            onSave={handleSaveRecord}
            onToast={addToast}
          />
        )}
      </AnimatePresence>

      {/* ── Certificate Modal ──────────────────────── */}
      <AnimatePresence>
        {certModal && certRecord && (
          <CertificateModal record={certRecord} onClose={() => setCertModal(false)} />
        )}
      </AnimatePresence>

      {/* ── Template Editor Modal ──────────────────── */}
      <AnimatePresence>
        {templateModal && <TemplateEditorModal onClose={() => setTemplateModal(false)} />}
      </AnimatePresence>

      {/* ── Delete Confirmation ────────────────────── */}
      <ConfirmationDialog
        isOpen={deleteDialog.open}
        title={`Delete ${activeConfig.label} Record`}
        message={`Are you sure you want to delete this ${activeConfig.label.toLowerCase()} record? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog({ open: false, id: '' })}
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
  value,
  onChange,
  onSelect,
  error,
  placeholder = 'Start typing to search...',
  required = false,
}: {
  label: string;
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
    return parishionerLookupList
      .filter((p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [query]);

  const handleInputChange = (v: string) => {
    setQuery(v);
    onChange(v);
    setOpen(true);
  };

  const handleSelect = (p: ParishionerLookup) => {
    setQuery(p.firstName);
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
        <Field label="Ceremony Date *" type="date" value={date} onChange={onChangeDate} required />
        <Field label="Time *" as="select" value={time} onChange={onChangeTime} required>
          <option value="">Select time...</option>
          {timeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-3">
        <Field label="Officiant *" as="select" value={officiant} onChange={onChangeOfficiant} required>
          <option value="">Select officiant...</option>
          {officiants.map((o) => <option key={o} value={o}>{o}</option>)}
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
   PaymentSection — Sacrament fee collection with GL posting
   ===================================================================== */
function PaymentSection({
  sacrament,
  paymentInfo,
  onChange,
}: {
  sacrament: SacramentTab;
  paymentInfo: PaymentInfo;
  onChange: (p: PaymentInfo) => void;
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
  onClose,
  onSave,
  onToast,
}: {
  type: 'add' | 'edit';
  sacrament: SacramentTab;
  record: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord | null;
  onClose: () => void;
  onSave: (r: BaptismRecord | MarriageRecord | ConfirmationRecord | DeathRecord) => void;
  onToast: (msg: string, type: ToastType) => void;
}) {
  const isEdit = type === 'edit';

  /* ── BAPTISM FORM STATE ── */
  const [bForm, setBForm] = useState<Partial<BaptismRecord>>(() => {
    const r = record as BaptismRecord | null;
    return {
      registryNumber: r?.registryNumber || '',
      childLastName: r?.childLastName || '', childFirstName: r?.childFirstName || '', childMiddleName: r?.childMiddleName || '',
      dateOfBirth: r?.dateOfBirth || '', placeOfBirthCity: r?.placeOfBirthCity || 'Mabalacat', placeOfBirthProvince: r?.placeOfBirthProvince || 'Pampanga', gender: r?.gender || 'Male',
      fatherLastName: r?.fatherLastName || '', fatherFirstName: r?.fatherFirstName || '', fatherMiddleName: r?.fatherMiddleName || '', fatherParishionerId: r?.fatherParishionerId || '',
      motherLastName: r?.motherLastName || '', motherFirstName: r?.motherFirstName || '', motherMiddleName: r?.motherMiddleName || '', motherMaidenName: r?.motherMaidenName || '', motherParishionerId: r?.motherParishionerId || '',
      godfatherLastName: r?.godfatherLastName || '', godfatherFirstName: r?.godfatherFirstName || '',
      godmotherLastName: r?.godmotherLastName || '', godmotherFirstName: r?.godmotherFirstName || '',
      addressStreet: r?.addressStreet || '', addressBarangay: r?.addressBarangay || BARANGAYS[0], addressSitio: r?.addressSitio || '', addressCity: r?.addressCity || CITIES[0], addressProvince: r?.addressProvince || PROVINCES[0],
      dateOfBaptism: r?.dateOfBaptism || '', timeOfBaptism: r?.timeOfBaptism || '9:00 AM', officiant: r?.officiant || '', bookNumber: r?.bookNumber || 1, pageNumber: r?.pageNumber || 1, notations: r?.notations || '', status: r?.status || 'Active',
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
      groomLastName: r?.groomLastName || '', groomFirstName: r?.groomFirstName || '', groomMiddleName: r?.groomMiddleName || '', groomAge: r?.groomAge || 25, groomStatus: r?.groomStatus || 'Single', groomFather: r?.groomFather || '', groomMother: r?.groomMother || '',
      brideLastName: r?.brideLastName || '', brideFirstName: r?.brideFirstName || '', brideMiddleName: r?.brideMiddleName || '', brideAge: r?.brideAge || 25, brideStatus: r?.brideStatus || 'Single', brideFather: r?.brideFather || '', brideMother: r?.brideMother || '',
      witness1Name: r?.witness1Name || '', witness2Name: r?.witness2Name || '',
      dateOfMarriage: r?.dateOfMarriage || '', timeOfMarriage: r?.timeOfMarriage || '10:00 AM', officiant: r?.officiant || '', bookNumber: r?.bookNumber || 1, pageNumber: r?.pageNumber || 1, notations: r?.notations || '', status: r?.status || 'Active',
      scheduledDate: r?.scheduledDate || '', scheduledTime: r?.scheduledTime || '10:00 AM', scheduledOfficiant: r?.scheduledOfficiant || '', scheduledLocation: r?.scheduledLocation || marriageLocations[0], calendarEventId: r?.calendarEventId || '',
    };
  });
  const [mAutoCalendar, setMAutoCalendar] = useState(true);
  const [mErrors, setMErrors] = useState<Record<string, string>>({});

  /* ── CONFIRMATION FORM STATE ── */
  const [cForm, setCForm] = useState<Partial<ConfirmationRecord>>(() => {
    const r = record as ConfirmationRecord | null;
    return {
      registryNumber: r?.registryNumber || '',
      confirmandLastName: r?.confirmandLastName || '', confirmandFirstName: r?.confirmandFirstName || '', confirmandMiddleName: r?.confirmandMiddleName || '',
      dateOfBirth: r?.dateOfBirth || '', parishOfBaptism: r?.parishOfBaptism || 'St. Michael the Archangel Parish', dateOfBaptism: r?.dateOfBaptism || '',
      officiant: r?.officiant || '', bishop: r?.bishop || 'Bishop Florentino Lavarias',
      sponsorLastName: r?.sponsorLastName || '', sponsorFirstName: r?.sponsorFirstName || '',
      dateOfConfirmation: r?.dateOfConfirmation || '', timeOfConfirmation: r?.timeOfConfirmation || '9:00 AM', bookNumber: r?.bookNumber || 1, pageNumber: r?.pageNumber || 1, notations: r?.notations || '', status: r?.status || 'Active',
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
      deceasedLastName: r?.deceasedLastName || '', deceasedFirstName: r?.deceasedFirstName || '', deceasedMiddleName: r?.deceasedMiddleName || '',
      age: r?.age || 0, gender: r?.gender || 'Male',
      dateOfDeath: r?.dateOfDeath || '', dateOfBurial: r?.dateOfBurial || '', timeOfBurial: r?.timeOfBurial || '9:00 AM', causeOfDeath: r?.causeOfDeath || '', cemetery: r?.cemetery || 'San Lorenzo Cemetery',
      officiant: r?.officiant || '', bookNumber: r?.bookNumber || 1, pageNumber: r?.pageNumber || 1, notations: r?.notations || '', status: r?.status || 'Active',
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

  /* ── Update helpers ── */
  const bUpdate = (field: string, value: string | number) => {
    setBForm((prev) => ({ ...prev, [field]: value }));
    if (bErrors[field]) setBErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };
  const mUpdate = (field: string, value: string | number) => {
    setMForm((prev) => ({ ...prev, [field]: value }));
    if (mErrors[field]) setMErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };
  const cUpdate = (field: string, value: string | number) => {
    setCForm((prev) => ({ ...prev, [field]: value }));
    if (cErrors[field]) setCErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };
  const dUpdate = (field: string, value: string | number) => {
    setDForm((prev) => ({ ...prev, [field]: value }));
    if (dErrors[field]) setDErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  /* ── Parishioner select handlers ── */
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
  const handleGroomSelect = (p: ParishionerLookup) => {
    mUpdate('groomFirstName', p.firstName);
    mUpdate('groomLastName', p.lastName);
    mUpdate('groomMiddleName', p.middleName || '');
  };
  const handleBrideSelect = (p: ParishionerLookup) => {
    mUpdate('brideFirstName', p.firstName);
    mUpdate('brideLastName', p.lastName);
    mUpdate('brideMiddleName', p.middleName || '');
  };
  const handleDeceasedSelect = (p: ParishionerLookup) => {
    dUpdate('deceasedFirstName', p.firstName);
    dUpdate('deceasedLastName', p.lastName);
    dUpdate('deceasedMiddleName', p.middleName || '');
  };

  /* ── Fee Override Validation ── */
  const validatePaymentOverride = (): boolean => {
    if (paymentInfo.status === 'collect_now') return true; // default — no validation needed
    const label = paymentInfo.status === 'collected' ? 'Fee already collected'
      : paymentInfo.status === 'waived' ? 'Fee waived'
      : 'Bill later';
    if (!paymentInfo.overrideReason || paymentInfo.overrideReason.trim().length < 5) {
      onToast(`Override reason required: "${label}" needs a detailed explanation (min 5 characters). This protects against fee abuse.`, 'error');
      return false;
    }
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
        recordedBy: paymentInfo.receivedBy,
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
        recordedBy: paymentInfo.receivedBy,
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
        recordedBy: paymentInfo.receivedBy,
      });
      onToast('Record saved with fee marked as already collected. Override logged for audit.', 'info');
    }
  }, [paymentInfo, sacrament, onToast]);

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
        fatherLastName: bForm.fatherLastName!, fatherFirstName: bForm.fatherFirstName!, fatherMiddleName: bForm.fatherMiddleName || '', fatherParishionerId: bForm.fatherParishionerId,
        motherLastName: bForm.motherLastName!, motherFirstName: bForm.motherFirstName!, motherMiddleName: bForm.motherMiddleName || '', motherMaidenName: bForm.motherMaidenName || '', motherParishionerId: bForm.motherParishionerId,
        godfatherLastName: bForm.godfatherLastName || '', godfatherFirstName: bForm.godfatherFirstName || '',
        godmotherLastName: bForm.godmotherLastName || '', godmotherFirstName: bForm.godmotherFirstName || '',
        addressStreet: bForm.addressStreet || '', addressBarangay: bForm.addressBarangay || BARANGAYS[0], addressSitio: bForm.addressSitio || '', addressCity: bForm.addressCity || CITIES[0], addressProvince: bForm.addressProvince || PROVINCES[0],
        dateOfBaptism: bForm.dateOfBaptism!, timeOfBaptism: bForm.timeOfBaptism || '9:00 AM', officiant: bForm.officiant!, bookNumber: Number(bForm.bookNumber) || 1, pageNumber: Number(bForm.pageNumber) || 1,
        notations: bForm.notations || '', status: (bForm.status as 'Active') || 'Active',
        scheduledDate: bForm.scheduledDate || bForm.dateOfBaptism!, scheduledTime: bForm.scheduledTime || '9:00 AM',
        scheduledOfficiant: bForm.scheduledOfficiant || bForm.officiant!, scheduledLocation: bForm.scheduledLocation || baptismLocations[0],
        calendarEventId: bAutoCalendar ? genId('cal') : undefined,
      };
      onSave(newRecord);
      processPayment(newRecord);
      onToast(bAutoCalendar ? 'Baptism recorded and calendar event created' : 'Baptism record saved. You can schedule the ceremony later from the calendar.', bAutoCalendar ? 'success' : 'info');
    } else if (sacrament === 'marriage') {
      if (!validateMarriage()) return;
      const newRecord: MarriageRecord = {
        id: (record as MarriageRecord | null)?.id || genId('m'),
        registryNumber: mForm.registryNumber || `2024-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        groomLastName: mForm.groomLastName!, groomFirstName: mForm.groomFirstName!, groomMiddleName: mForm.groomMiddleName || '',
        groomAge: Number(mForm.groomAge) || 25, groomStatus: mForm.groomStatus || 'Single', groomFather: mForm.groomFather || '', groomMother: mForm.groomMother || '',
        brideLastName: mForm.brideLastName!, brideFirstName: mForm.brideFirstName!, brideMiddleName: mForm.brideMiddleName || '',
        brideAge: Number(mForm.brideAge) || 25, brideStatus: mForm.brideStatus || 'Single', brideFather: mForm.brideFather || '', brideMother: mForm.brideMother || '',
        witness1Name: mForm.witness1Name || '', witness2Name: mForm.witness2Name || '',
        dateOfMarriage: mForm.dateOfMarriage!, timeOfMarriage: mForm.timeOfMarriage || '10:00 AM',
        officiant: mForm.officiant!, bookNumber: Number(mForm.bookNumber) || 1, pageNumber: Number(mForm.pageNumber) || 1,
        notations: mForm.notations || '', status: (mForm.status as 'Active') || 'Active',
        scheduledDate: mForm.scheduledDate || mForm.dateOfMarriage!, scheduledTime: mForm.scheduledTime || '10:00 AM',
        scheduledOfficiant: mForm.scheduledOfficiant || mForm.officiant!, scheduledLocation: mForm.scheduledLocation || marriageLocations[0],
        calendarEventId: mAutoCalendar ? genId('cal') : undefined,
      };
      onSave(newRecord);
      processPayment(newRecord);
      onToast(mAutoCalendar ? 'Marriage recorded and calendar event created' : 'Marriage record saved. You can schedule the ceremony later from the calendar.', mAutoCalendar ? 'success' : 'info');
    } else if (sacrament === 'confirmation') {
      if (!validateConfirmation()) return;
      const newRecord: ConfirmationRecord = {
        id: (record as ConfirmationRecord | null)?.id || genId('c'),
        registryNumber: cForm.registryNumber || `2024-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        confirmandLastName: cForm.confirmandLastName!, confirmandFirstName: cForm.confirmandFirstName!, confirmandMiddleName: cForm.confirmandMiddleName || '',
        dateOfBirth: cForm.dateOfBirth || '', parishOfBaptism: cForm.parishOfBaptism || 'St. Michael the Archangel Parish', dateOfBaptism: cForm.dateOfBaptism || '',
        officiant: cForm.officiant!, bishop: cForm.bishop || 'Bishop Florentino Lavarias',
        sponsorLastName: cForm.sponsorLastName || '', sponsorFirstName: cForm.sponsorFirstName || '',
        dateOfConfirmation: cForm.dateOfConfirmation!, timeOfConfirmation: cForm.timeOfConfirmation || '9:00 AM',
        bookNumber: Number(cForm.bookNumber) || 1, pageNumber: Number(cForm.pageNumber) || 1,
        notations: cForm.notations || '', status: (cForm.status as 'Active') || 'Active',
        scheduledDate: cForm.scheduledDate || cForm.dateOfConfirmation!, scheduledTime: cForm.scheduledTime || '9:00 AM',
        scheduledOfficiant: cForm.scheduledOfficiant || cForm.officiant!, scheduledLocation: cForm.scheduledLocation || confirmationLocations[0],
        calendarEventId: cAutoCalendar ? genId('cal') : undefined,
      };
      onSave(newRecord);
      processPayment(newRecord);
      onToast(cAutoCalendar ? 'Confirmation recorded and calendar event created' : 'Confirmation record saved. You can schedule the ceremony later from the calendar.', cAutoCalendar ? 'success' : 'info');
    } else if (sacrament === 'death') {
      if (!validateDeath()) return;
      const newRecord: DeathRecord = {
        id: (record as DeathRecord | null)?.id || genId('d'),
        registryNumber: dForm.registryNumber || `2024-${String(Math.floor(Math.random() * 9000) + 1000)}`,
        deceasedLastName: dForm.deceasedLastName!, deceasedFirstName: dForm.deceasedFirstName!, deceasedMiddleName: dForm.deceasedMiddleName || '',
        age: Number(dForm.age) || 0, gender: dForm.gender || 'Male',
        dateOfDeath: dForm.dateOfDeath!, dateOfBurial: dForm.dateOfBurial!, timeOfBurial: dForm.timeOfBurial || '9:00 AM',
        causeOfDeath: dForm.causeOfDeath || '', cemetery: dForm.cemetery || 'San Lorenzo Cemetery',
        officiant: dForm.officiant!, bookNumber: Number(dForm.bookNumber) || 1, pageNumber: Number(dForm.pageNumber) || 1,
        notations: dForm.notations || '', status: (dForm.status as 'Active') || 'Active',
        scheduledDate: dForm.scheduledDate || dForm.dateOfBurial!, scheduledTime: dForm.scheduledTime || '9:00 AM',
        scheduledOfficiant: dForm.scheduledOfficiant || dForm.officiant!, scheduledLocation: dForm.scheduledLocation || burialLocations[0],
        calendarEventId: dAutoCalendar ? genId('cal') : undefined,
      };
      onSave(newRecord);
      processPayment(newRecord);
      onToast(dAutoCalendar ? 'Burial recorded and calendar event created' : 'Burial record saved. You can schedule the ceremony later from the calendar.', dAutoCalendar ? 'success' : 'info');
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
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-start justify-center p-4 pt-10 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
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
                        {officiants.map((o) => <option key={o} value={o}>{o}</option>)}
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
                  <Field label="Last Name *" value={bForm.childLastName || ''} onChange={(v) => bUpdate('childLastName', v)} error={bErrors.childLastName} required />
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
                    <Search className="w-3 h-3" /> Type to search directory
                  </span>
                </div>
                {/* Father */}
                <div className="grid grid-cols-3 gap-4 mt-2">
                  <div className="flex items-center">
                    <Field label="Father Last Name *" value={bForm.fatherLastName || ''} onChange={(v) => bUpdate('fatherLastName', v)} error={bErrors.fatherLastName} required />
                    <HelpTooltip text={getLabel('field.fatherName.help')} canonLaw={getLabel('field.godparents.canon')} position="top" />
                  </div>
                  <ParishionerLookupAutocomplete
                    label="Father First Name *"
                    value={bForm.fatherFirstName || ''}
                    onChange={(v) => bUpdate('fatherFirstName', v)}
                    onSelect={handleFatherSelect}
                    error={bErrors.fatherFirstName}
                    required
                    placeholder="Type to search parishioners..."
                  />
                  <Field label="Father Middle Name" value={bForm.fatherMiddleName || ''} onChange={(v) => bUpdate('fatherMiddleName', v)} />
                </div>
                {/* Mother */}
                <div className="grid grid-cols-4 gap-4 mt-3">
                  <div className="flex items-center">
                    <Field label="Mother Maiden Last *" value={bForm.motherLastName || ''} onChange={(v) => bUpdate('motherLastName', v)} error={bErrors.motherLastName} required />
                    <HelpTooltip text={getLabel('field.motherName.help')} position="top" />
                  </div>
                  <ParishionerLookupAutocomplete
                    label="Mother First Name *"
                    value={bForm.motherFirstName || ''}
                    onChange={(v) => bUpdate('motherFirstName', v)}
                    onSelect={handleMotherSelect}
                    error={bErrors.motherFirstName}
                    required
                    placeholder="Type to search parishioners..."
                  />
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
                  <Field label="Godfather Last Name" value={bForm.godfatherLastName || ''} onChange={(v) => bUpdate('godfatherLastName', v)} />
                  <Field label="Godfather First Name" value={bForm.godfatherFirstName || ''} onChange={(v) => bUpdate('godfatherFirstName', v)} />
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Godmother Last Name" value={bForm.godmotherLastName || ''} onChange={(v) => bUpdate('godmotherLastName', v)} />
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
              />

              {/* ═══ PAYMENT ═══ */}
              <PaymentSection sacrament="baptism" paymentInfo={paymentInfo} onChange={setPaymentInfo} />
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
                    {officiants.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Field>
                </div>
              </div>

              {/* ═══ GROOM ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={User} title="Groom Information" color="#2D6A4F" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Last Name *" value={mForm.groomLastName || ''} onChange={(v) => mUpdate('groomLastName', v)} error={mErrors.groomLastName} required />
                  <ParishionerLookupAutocomplete
                    label="First Name *"
                    value={mForm.groomFirstName || ''}
                    onChange={(v) => mUpdate('groomFirstName', v)}
                    onSelect={handleGroomSelect}
                    error={mErrors.groomFirstName}
                    required
                    placeholder="Type to search..."
                  />
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
                  <Field label="Last Name *" value={mForm.brideLastName || ''} onChange={(v) => mUpdate('brideLastName', v)} error={mErrors.brideLastName} required />
                  <ParishionerLookupAutocomplete
                    label="First Name *"
                    value={mForm.brideFirstName || ''}
                    onChange={(v) => mUpdate('brideFirstName', v)}
                    onSelect={handleBrideSelect}
                    error={mErrors.brideFirstName}
                    required
                    placeholder="Type to search..."
                  />
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
                  <Field label="Witness 1 *" value={mForm.witness1Name || ''} onChange={(v) => mUpdate('witness1Name', v)} error={mErrors.witness1Name} required />
                  <Field label="Witness 2 *" value={mForm.witness2Name || ''} onChange={(v) => mUpdate('witness2Name', v)} error={mErrors.witness2Name} required />
                </div>
              </div>

              {/* ═══ NOTATIONS ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={BookOpen} title="Notations" color="#8C8374" />
                <div className="mt-3">
                  <Field label="Canonical Notations / Additional Notes" as="textarea" value={mForm.notations || ''} onChange={(v) => mUpdate('notations', v)} />
                </div>
              </div>

              {/* ═══ SCHEDULE ═══ */}
              <ScheduleSection
                sacrament="marriage"
                date={mForm.scheduledDate || ''}
                time={mForm.scheduledTime || '10:00 AM'}
                officiant={mForm.scheduledOfficiant || ''}
                location={mForm.scheduledLocation || marriageLocations[0]}
                autoCalendar={mAutoCalendar}
                onChangeDate={(v) => mUpdate('scheduledDate', v)}
                onChangeTime={(v) => mUpdate('scheduledTime', v)}
                onChangeOfficiant={(v) => mUpdate('scheduledOfficiant', v)}
                onChangeLocation={(v) => mUpdate('scheduledLocation', v)}
                onChangeAutoCalendar={setMAutoCalendar}
                eventTitle={`Wedding: ${mForm.groomFirstName || ''} ${mForm.groomLastName || ''} & ${mForm.brideFirstName || ''} ${mForm.brideLastName || ''}`}
              />

              {/* ═══ PAYMENT ═══ */}
              <PaymentSection sacrament="marriage" paymentInfo={paymentInfo} onChange={setPaymentInfo} />
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
                    {officiants.map((o) => <option key={o} value={o}>{o}</option>)}
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
              </div>

              {/* ═══ SPONSOR ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={User} title="Sponsor" color="#5B3A73" />
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <Field label="Sponsor Last Name" value={cForm.sponsorLastName || ''} onChange={(v) => cUpdate('sponsorLastName', v)} />
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
              />

              {/* ═══ PAYMENT ═══ */}
              <PaymentSection sacrament="confirmation" paymentInfo={paymentInfo} onChange={setPaymentInfo} />
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
                    {officiants.map((o) => <option key={o} value={o}>{o}</option>)}
                  </Field>
                  <Field label="Cemetery" value={dForm.cemetery || ''} onChange={(v) => dUpdate('cemetery', v)} />
                </div>
              </div>

              {/* ═══ DECEASED ═══ */}
              <div className="border-t border-parchment dark:border-dm-border pt-5">
                <SectionHeader icon={Cross} title="Deceased Information" color="#3D3A36" />
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <Field label="Last Name *" value={dForm.deceasedLastName || ''} onChange={(v) => dUpdate('deceasedLastName', v)} error={dErrors.deceasedLastName} required />
                  <ParishionerLookupAutocomplete
                    label="First Name *"
                    value={dForm.deceasedFirstName || ''}
                    onChange={(v) => dUpdate('deceasedFirstName', v)}
                    onSelect={handleDeceasedSelect}
                    error={dErrors.deceasedFirstName}
                    required
                    placeholder="Type to search..."
                  />
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
              />

              {/* ═══ PAYMENT ═══ */}
              <PaymentSection sacrament="death" paymentInfo={paymentInfo} onChange={setPaymentInfo} />
            </>
          )}
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
   CertificateModal — Generate certificate with template selector
   ===================================================================== */
function CertificateModal({ record, onClose }: { record: BaptismRecord; onClose: () => void }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(certificateTemplates[0].id);
  const [zoom, setZoom] = useState(100);
  const [certFeeStatus, setCertFeeStatus] = useState<'original' | 'reprint'>('original');
  const [certPayment, setCertPayment] = useState<PaymentInfo>(() =>
    defaultPaymentInfo(getFeeForSacrament('Baptism')?.certificateFee ?? 100)
  );
  const previewRef = useRef<HTMLDivElement>(null);

  const selectedTemplate = certificateTemplates.find((t) => t.id === selectedTemplateId)!;
  const parishTokens = getCertificateTokens();
  const recordHTML = replaceTokens(selectedTemplate.html, record);
  const renderedHTML = Object.entries(parishTokens).reduce(
    (html, [key, value]) => html.replace(new RegExp(`{{${key}}}`, 'g'), value),
    recordHTML,
  );

  const currency = getCurrencySymbol();
  const certFee = getFeeForSacrament('Baptism')?.certificateFee ?? 100;
  const canDownload = certFeeStatus === 'original' || certPayment.status === 'collected' || certPayment.status === 'collect_now' || certPayment.status === 'waived';

  const handleDownloadPDF = async () => {
    if (!canDownload) return;
    if (!previewRef.current) return;
    // Process cert payment if collecting now
    if (certFeeStatus === 'reprint' && certPayment.status === 'collect_now') {
      const glEntry: JournalEntry = {
        id: `auto-${Date.now()}`,
        date: certPayment.date,
        reference: certPayment.receiptNumber || `CERT-${record.registryNumber}`,
        description: `Certificate copy fee — ${record.childFirstName} ${record.childLastName}`,
        lines: [
          { accountCode: '1000', accountName: 'Cash on Hand', debit: certPayment.amount, credit: 0 },
          { accountCode: '4200', accountName: 'Fees & Permits', debit: 0, credit: certPayment.amount },
        ],
      };
      addToJournal(glEntry);
    }
    const html2canvas = (await import('html2canvas')).default;
    const jsPDF = (await import('jspdf')).jsPDF;
    const canvas = await html2canvas(previewRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Baptism_${record.childFirstName}_${record.childLastName}_${record.dateOfBaptism}.pdf`);
  };

  const handlePrint = () => {
    if (!canDownload) return;
    // Celebrate first certificate printed
    celebrateFirstAction('certificate');
    if (certFeeStatus === 'reprint' && certPayment.status === 'collect_now') {
      const glEntry: JournalEntry = {
        id: `auto-${Date.now()}`,
        date: certPayment.date,
        reference: certPayment.receiptNumber || `CERT-${record.registryNumber}`,
        description: `Certificate copy fee — ${record.childFirstName} ${record.childLastName}`,
        lines: [
          { accountCode: '1000', accountName: 'Cash on Hand', debit: certPayment.amount, credit: 0 },
          { accountCode: '4200', accountName: 'Fees & Permits', debit: 0, credit: certPayment.amount },
        ],
      };
      addToJournal(glEntry);
    }
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-start justify-center p-4 pt-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[1100px] overflow-hidden my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div>
            <h2 className="heading-lg text-charcoal dark:text-dm-text">Generate Certificate</h2>
            <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-0.5">
              {record.childFirstName} {record.childLastName} — Registry #{record.registryNumber}
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
              {certificateTemplates.map((t) => (
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
          </div>

          {/* Center — Live Preview */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h3 className="heading-sm text-charcoal dark:text-dm-text">Preview</h3>
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
              {certificateTokens.map((t) => (
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
  );
}

/* =====================================================================
   TemplateEditorModal — Edit certificate templates
   ===================================================================== */
function TemplateEditorModal({ onClose }: { onClose: () => void }) {
  const [templates, setTemplates] = useState(certificateTemplates);
  const [activeTmplId, setActiveTmplId] = useState(templates[0].id);
  const [html, setHtml] = useState(templates[0].html);
  const activeTmpl = templates.find((t) => t.id === activeTmplId)!;

  const handleSave = () => {
    setTemplates((prev) => prev.map((t) => (t.id === activeTmplId ? { ...t, html, isSystem: false } : t)));
  };

  const handleReset = () => {
    const original = certificateTemplates.find((t) => t.id === activeTmplId);
    if (original) setHtml(original.html);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-start justify-center p-4 pt-6 overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[1100px] overflow-hidden my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div className="flex items-center gap-3">
            <Code className="w-5 h-5 text-gold" />
            <h2 className="heading-lg text-charcoal dark:text-dm-text">Template Editor</h2>
          </div>
          <div className="flex items-center gap-2">
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
              <button
                key={t.id}
                onClick={() => { setActiveTmplId(t.id); setHtml(t.html); }}
                className={`w-full text-left p-2.5 rounded-lg text-sm transition-all ${
                  activeTmplId === t.id
                    ? 'bg-gold-glow border border-gold text-charcoal dark:text-dm-text'
                    : 'text-warm-gray hover:bg-cream-dark dark:text-dm-text-muted dark:hover:bg-dm-surface-raised'
                }`}
              >
                {t.name}
                {t.isSystem && <span className="ml-1.5 text-[10px] opacity-50">(system)</span>}
              </button>
            ))}
          </div>

          {/* Code Editor */}
          <div className="flex-1 border-r border-parchment dark:border-dm-border flex flex-col min-w-0">
            <div className="px-4 py-2 border-b border-parchment dark:border-dm-border bg-cream-dark dark:bg-dm-surface-raised flex items-center justify-between">
              <span className="label text-warm-gray">HTML/CSS Editor</span>
              <span className="text-[10px] text-warm-gray font-mono">{activeTmpl.isSystem ? 'Read-only' : 'Editable'}</span>
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
          <span className="label text-warm-gray mr-3">Available Tokens:</span>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {certificateTokens.map((t) => (
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
