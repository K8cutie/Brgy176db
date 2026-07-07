import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Plus,
  MapPin,
  Phone,
  Mail,
  ChevronDown,
  ChevronUp,
  Pencil,
  Eye,
  X,
  Save,
  Grid3X3,
  List,
  Droplets,
  Heart,
  Flame,
  PartyPopper,
  User,
  Tag,
  GitMerge,
  Archive,
  RotateCcw,
  Check,
} from 'lucide-react';
import DataTable, { type Column } from '@/components/DataTable';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import EmptyState from '@/components/EmptyState';
import { getLabel } from '@/lib/friendlyLabels';
import {
  type Family,
  type Parishioner,
  type RegistryLinkRewrite,
  families as initialFamilies,
  barangays,
  getFullName,
  getAge,
  getInitials,
  getSacramentBadges,
  mergeFamilies,
  mergeParishioners,
} from '@/lib/directoryData';
import {
  type BaptismRecord,
  type MarriageRecord,
  type ConfirmationRecord,
  type DeathRecord,
  liveOnly,
  softDelete,
} from '@/lib/registryData';
import { celebrateFirstAction } from '@/components/FirstRunDetector';
import { usePersistedState } from '@/hooks/usePersistedState';
import { KEYS } from '@/lib/storageKeys';
import * as ns from '@/lib/storageNamespaced';
import { getCurrentUserName } from '@/lib/session';
import type { AuditLogEntry } from '@/lib/settingsData';

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */
const sacramentColors: Record<string, string> = {
  Baptism: '#2D6A4F',
  Confirmation: '#C9963B',
  Marriage: '#6B2737',
  Death: '#3D3A36',
};

function formatDate(d: string) {
  if (!d) return '';
  const x = new Date(d + 'T00:00:00');
  return x.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Safe age display: blank / invalid / future DOB renders as "—" instead of NaN or a negative number. */
function formatAge(dob: string): string {
  if (!dob) return '—';
  const birth = new Date(dob + 'T00:00:00');
  if (isNaN(birth.getTime())) return '—';
  if (birth.getTime() > Date.now()) return '—';
  const age = getAge(dob);
  if (!Number.isFinite(age) || age < 0) return '—';
  return String(age);
}

/** Normalize a phone string to just its digits for format-agnostic matching. */
function normalizePhone(v: string): string {
  return (v || '').replace(/\D/g, '');
}

/** PH-friendly phone check: 7–15 digits (mobile or landline), any formatting allowed. */
function isValidPhone(v: string): boolean {
  const digits = normalizePhone(v);
  return digits.length >= 7 && digits.length <= 15;
}

/** Basic email format check. */
function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/* Grid view renders this many family cards at a time ("Load more" reveals the
   next batch) so a 10k-family parish doesn't mount thousands of cards. */
const GRID_PAGE_SIZE = 24;

/* ------------------------------------------------------------------ */
/*  Audit trail — same persisted 'audit_log' key/shape FinancePage uses */
/* ------------------------------------------------------------------ */
function appendDirectoryAudit(action: string, recordId: string, details: string): void {
  const log = ns.getJSON<AuditLogEntry[]>('audit_log', []);
  const entry: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    user: getCurrentUserName(),
    action,
    table: 'Directory',
    recordId,
    details,
    ipAddress: 'local',
  };
  ns.setJSON('audit_log', [entry, ...log]);
}

/* ------------------------------------------------------------------ */
/*  Registry link rewrites — repoint every *ParishionerId that referenced
    an absorbed (merged-away) parishioner to the surviving one. Stores that
    were never written are left alone: writing [] would clobber the seed
    data RegistryPage falls back to, and unseeded registers hold no links. */
/* ------------------------------------------------------------------ */
function applyRegistryRewrites(rewrites: RegistryLinkRewrite[]): void {
  if (!rewrites.length) return;
  const map = new Map(rewrites.map((r) => [r.fromParishionerId, r.toParishionerId]));
  const fix = (id: string | undefined) => (id && map.has(id) ? map.get(id) : id);
  const rewriteStore = <T,>(key: string, rewrite: (r: T) => T) => {
    const arr = ns.getJSON<T[]>(key, []);
    if (arr.length) ns.setJSON(key, arr.map(rewrite));
  };
  rewriteStore<BaptismRecord>(KEYS.baptismRecords, (r) => ({
    ...r,
    childParishionerId: fix(r.childParishionerId),
    fatherParishionerId: fix(r.fatherParishionerId),
    motherParishionerId: fix(r.motherParishionerId),
    godfatherParishionerId: fix(r.godfatherParishionerId),
    godmotherParishionerId: fix(r.godmotherParishionerId),
  }));
  rewriteStore<MarriageRecord>(KEYS.marriageRecords, (r) => ({
    ...r,
    groomParishionerId: fix(r.groomParishionerId),
    brideParishionerId: fix(r.brideParishionerId),
    witness1ParishionerId: fix(r.witness1ParishionerId),
    witness2ParishionerId: fix(r.witness2ParishionerId),
  }));
  rewriteStore<ConfirmationRecord>(KEYS.confirmationRecords, (r) => ({
    ...r,
    confirmandParishionerId: fix(r.confirmandParishionerId),
    sponsorParishionerId: fix(r.sponsorParishionerId),
  }));
  rewriteStore<DeathRecord>(KEYS.deathRecords, (r) => ({
    ...r,
    deceasedParishionerId: fix(r.deceasedParishionerId),
  }));
}

/* Fields the merge modal lets the user pick side-by-side. */
const FAMILY_MERGE_FIELDS: { key: string; label: string }[] = [
  { key: 'familyName', label: 'Family Name' },
  { key: 'status', label: 'Status' },
  { key: 'street', label: 'Street' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'sitio', label: 'Sitio' },
  { key: 'city', label: 'City' },
  { key: 'province', label: 'Province' },
  { key: 'primaryPhone', label: 'Primary Phone' },
  { key: 'secondaryPhone', label: 'Secondary Phone' },
  { key: 'email', label: 'Email' },
];

const MEMBER_MERGE_FIELDS: { key: string; label: string }[] = [
  { key: 'firstName', label: 'First Name' },
  { key: 'middleName', label: 'Middle Name' },
  { key: 'lastName', label: 'Last Name' },
  { key: 'dateOfBirth', label: 'Date of Birth' },
  { key: 'gender', label: 'Gender' },
  { key: 'relationship', label: 'Relationship' },
];

function getAvatarColor(name: string) {
  const colors = ['#C9963B', '#2D6A4F', '#6B2737', '#5B3A73', '#3B6BC9', '#1B2A4A', '#8C8374', '#B8322F'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/* ------------------------------------------------------------------ */
/*  Avatar Component                                                   */
/* ------------------------------------------------------------------ */
function MemberAvatar({ member, size = 32, showName }: { member: Parishioner; size?: number; showName?: boolean }) {
  const bg = getAvatarColor(getFullName(member));
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0"
        style={{ width: size, height: size, fontSize: size * 0.35, backgroundColor: bg }}
        title={getFullName(member)}
      >
        {getInitials(member)}
      </div>
      {showName && <span className="text-[10px] text-warm-gray text-center leading-tight max-w-[60px] truncate">{member.firstName}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */
export default function DirectoryPage() {
  const [families, setFamilies] = usePersistedState<Family[]>(KEYS.families, initialFamilies);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [familyModal, setFamilyModal] = useState<'add' | 'edit' | null>(null);
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; familyId: string }>({ open: false, familyId: '' });
  const [showArchived, setShowArchived] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  /* Merge-duplicates flow: pick 2 families, then compare side by side. */
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);

  /* Lightweight notice toast (this page has no toast stack). */
  const [notice, setNotice] = useState('');
  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 3500);
  };

  /* Soft-deleted families only show in the Archived view. */
  const liveFamilies = useMemo(() => liveOnly(families), [families]);
  const archivedFamilies = useMemo(() => families.filter((f) => f.isDeleted), [families]);
  const baseFamilies = showArchived ? archivedFamilies : liveFamilies;

  /* All tags in use across live families — drives the tag filter row. */
  const allTags = useMemo(
    () => Array.from(new Set(liveFamilies.flatMap((f) => f.tags ?? []))).sort(),
    [liveFamilies],
  );

  /* sitios from selected barangay */
  const availableSitios = useMemo(() => {
    const sitios = new Set<string>();
    baseFamilies.forEach((f) => { if (f.barangay === selectedBarangay || selectedBarangay === 'All') sitios.add(f.sitio); });
    return Array.from(sitios).sort();
  }, [baseFamilies, selectedBarangay]);

  const [selectedSitio, setSelectedSitio] = useState('All');

  /* Filter families */
  const filteredFamilies = useMemo(() => {
    return baseFamilies.filter((f) => {
      if (selectedBarangay !== 'All' && f.barangay !== selectedBarangay) return false;
      if (selectedSitio !== 'All' && f.sitio !== selectedSitio) return false;
      if (selectedTags.length && !selectedTags.every((t) => f.tags?.includes(t))) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      if (f.familyName.toLowerCase().includes(q)) return true;
      if (f.primaryPhone.includes(q)) return true;
      // Phone: match ignoring formatting so "09175550202" and "0917-555-0202" both hit.
      const qDigits = normalizePhone(searchQuery);
      if (qDigits && (normalizePhone(f.primaryPhone).includes(qDigits) || normalizePhone(f.secondaryPhone || '').includes(qDigits))) return true;
      if (f.barangay.toLowerCase().includes(q)) return true;
      if (f.sitio.toLowerCase().includes(q)) return true;
      return f.members.some((m) => getFullName(m).toLowerCase().includes(q));
    });
  }, [baseFamilies, searchQuery, selectedBarangay, selectedSitio, selectedTags]);

  const totalMembers = filteredFamilies.reduce((sum, f) => sum + f.members.length, 0);

  /* Grid pagination (load-more). Resets whenever the filter/search results
     change (adjusted during render — filteredFamilies is memoized, so a new
     identity means the results really changed). */
  const [visibleCount, setVisibleCount] = useState(GRID_PAGE_SIZE);
  const [prevFiltered, setPrevFiltered] = useState(filteredFamilies);
  if (prevFiltered !== filteredFamilies) {
    setPrevFiltered(filteredFamilies);
    setVisibleCount(GRID_PAGE_SIZE);
  }
  const visibleFamilies = useMemo(
    () => filteredFamilies.slice(0, visibleCount),
    [filteredFamilies, visibleCount]
  );

  const handleEditFamily = (family: Family) => {
    setEditingFamily(family);
    setFamilyModal('edit');
  };

  const handleDeleteFamily = (id: string) => setDeleteDialog({ open: true, familyId: id });
  const confirmDelete = () => {
    const id = deleteDialog.familyId;
    const target = families.find((f) => f.id === id);
    setFamilies((prev) => prev.map((f) => (f.id === id ? softDelete(f, getCurrentUserName()) : f)));
    setDeleteDialog({ open: false, familyId: '' });
    appendDirectoryAudit('Deleted', id, `Archived family${target ? ` "${target.familyName}"` : ''} (soft delete)`);
    showNotice('Family archived — restore it from the Archived view');
  };

  const handleRestoreFamily = (id: string) => {
    const target = families.find((f) => f.id === id);
    // A merge-absorbed family's members already live on the kept family —
    // restoring it verbatim would resurrect duplicate people.
    if (target?.mergedInto) {
      const keptName = families.find((f) => f.id === target.mergedInto)?.familyName ?? 'another family';
      showNotice(`This family was merged into ${keptName} — restore is disabled to prevent duplicates`);
      return;
    }
    setFamilies((prev) => prev.map((f) => {
      if (f.id !== id) return f;
      const copy = { ...f };
      delete copy.isDeleted;
      delete copy.deletedAt;
      delete copy.deletedBy;
      return copy;
    }));
    appendDirectoryAudit('Restored', id, `Restored family${target ? ` "${target.familyName}"` : ''} from archive`);
    showNotice('Family restored');
  };

  const handleSaveFamily = (family: Family) => {
    if (familyModal === 'edit' && editingFamily) {
      setFamilies((prev) => prev.map((f) => (f.id === family.id ? family : f)));
      appendDirectoryAudit('Edited', family.id, `Edited family "${family.familyName}"`);
    } else {
      setFamilies((prev) => [family, ...prev]);
      appendDirectoryAudit('Created', family.id, `Created family "${family.familyName}" with ${family.members.length} member${family.members.length === 1 ? '' : 's'}`);
      // Celebrate first family added
      celebrateFirstAction('family');
    }
    setFamilyModal(null);
    setEditingFamily(null);
  };

  /* Called by FamilyCard after an in-card member merge. */
  const handleUpdateFamily = (family: Family) => {
    setFamilies((prev) => prev.map((f) => (f.id === family.id ? family : f)));
  };

  /* ── Merge duplicates ── */
  const toggleMergeSelect = (id: string) => {
    setMergeSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? prev : [...prev, id],
    );
  };

  const mergeA = families.find((f) => f.id === mergeSelection[0]);
  const mergeB = families.find((f) => f.id === mergeSelection[1]);

  const applyFamilyMerge = (primary: 'left' | 'right', chosen: Record<string, 'left' | 'right'>) => {
    if (!mergeA || !mergeB) return;
    const keep = primary === 'left' ? mergeA : mergeB;
    const absorb = primary === 'left' ? mergeB : mergeA;
    // Per-field winners: overriding `keep`'s fields makes the chosen side win
    // inside mergeFamilies (keep wins on conflicts, absorb fills gaps).
    const keepAdjusted = { ...keep } as Family;
    for (const fld of FAMILY_MERGE_FIELDS) {
      const source = (chosen[fld.key] ?? primary) === 'left' ? mergeA : mergeB;
      (keepAdjusted as unknown as Record<string, unknown>)[fld.key] = (source as unknown as Record<string, unknown>)[fld.key];
    }
    const { merged, rewrites } = mergeFamilies(keepAdjusted, absorb);
    // Stamp the absorbed family with the merge target: its members now live on
    // the kept family, so a verbatim restore would resurrect duplicates.
    setFamilies((prev) => prev.map((f) =>
      f.id === keep.id ? merged : f.id === absorb.id ? { ...softDelete(f, getCurrentUserName()), mergedInto: keep.id } : f,
    ));
    applyRegistryRewrites(rewrites);
    appendDirectoryAudit(
      'Merged',
      keep.id,
      `Merged family "${absorb.familyName}" (${absorb.id}) into "${merged.familyName}" (${keep.id})${rewrites.length ? `; repointed ${rewrites.length} registry link${rewrites.length === 1 ? '' : 's'}` : ''}`,
    );
    setMergeOpen(false);
    setMergeMode(false);
    setMergeSelection([]);
    showNotice('Families merged — the duplicate was archived');
  };

  /* List view columns */
  const listColumns: Column<Family>[] = [
    {
      key: 'familyName',
      header: 'Family Name',
      width: '220px',
      sortable: true,
      render: (f) => (
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {f.members.slice(0, 3).map((m) => (
              <MemberAvatar key={m.id} member={m} size={28} />
            ))}
            {f.members.length > 3 && (
              <div className="w-7 h-7 rounded-full bg-gold text-white text-[10px] font-semibold flex items-center justify-center border-2 border-white">
                +{f.members.length - 3}
              </div>
            )}
          </div>
          <span className="font-medium text-charcoal dark:text-dm-text">{f.familyName} Family</span>
        </div>
      ),
    },
    {
      key: 'headName',
      header: 'Head of Family',
      width: '180px',
      sortable: true,
      render: (f) => {
        const head = f.members.find((m) => m.relationship === 'Head');
        return head ? getFullName(head) : '—';
      },
    },
    {
      key: 'memberCount',
      header: 'Members',
      width: '80px',
      sortable: true,
      render: (f) => (
        <span className="cos-badge cos-badge-default">{f.members.length}</span>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      width: '250px',
      sortable: false,
      render: (f) => (
        <div className="flex items-start gap-1.5 text-warm-gray dark:text-dm-text-muted">
          <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span className="text-sm">{f.street}, {f.barangay}, {f.sitio}</span>
        </div>
      ),
    },
    {
      key: 'barangay',
      header: 'Barangay',
      width: '130px',
      sortable: true,
    },
    {
      key: 'contact',
      header: 'Contact',
      width: '150px',
      sortable: false,
      render: (f) => (
        <div className="flex items-center gap-1.5 text-warm-gray dark:text-dm-text-muted">
          <Phone className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-sm">{f.primaryPhone}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '100px',
      sortable: true,
      render: (f) => (
        <span className={`cos-badge ${f.status === 'Active' ? 'cos-badge-success' : f.status === 'Inactive' ? 'cos-badge-warning' : f.status === 'Deceased' ? 'cos-badge-error' : 'cos-badge-info'}`}>
          {f.status}
        </span>
      ),
    },
  ];

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
          <Users className="w-7 h-7 text-gold" />
          <h1 className="display-md text-charcoal dark:text-dm-text font-playfair">Parishioner Directory</h1>
        </div>
        <p className="body-md text-warm-gray dark:text-dm-text-muted max-w-2xl">
          Family-centric directory with sacramental history.
        </p>
        <div className="mt-3 h-[3px] w-24 bg-gold rounded-full" />
      </div>

      {/* ── Search & Filter Bar ─────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-warm-gray" />
          <input
            type="text"
            placeholder="Search by family name, member name, barangay, phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 w-full pl-12 pr-10 rounded-xl border border-parchment bg-white text-base text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold focus:shadow-[0_0_0_3px_rgba(201,150,59,0.15)] transition-all dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-warm-gray hover:text-charcoal transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-3 flex-wrap">
            {/* Barangay filter */}
            <div className="relative">
              <select
                value={selectedBarangay}
                onChange={(e) => { setSelectedBarangay(e.target.value); setSelectedSitio('All'); }}
                className="h-9 pl-3 pr-8 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold appearance-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text cursor-pointer"
              >
                <option value="All">All Barangays</option>
                {barangays.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-gray pointer-events-none" />
            </div>

            {/* Sitio filter */}
            <div className="relative">
              <select
                value={selectedSitio}
                onChange={(e) => setSelectedSitio(e.target.value)}
                className="h-9 pl-3 pr-8 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold appearance-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text cursor-pointer"
              >
                <option value="All">All Sitios</option>
                {availableSitios.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-gray pointer-events-none" />
            </div>

            {/* Archived (soft-deleted) families */}
            <button
              onClick={() => { setShowArchived(!showArchived); setMergeMode(false); setMergeSelection([]); }}
              className={`cos-btn h-9 px-4 text-sm ${showArchived ? 'cos-btn-primary' : 'cos-btn-secondary'}`}
              title="Show archived (deleted) families"
            >
              <Archive className="w-4 h-4" />
              Archived ({archivedFamilies.length})
            </button>

            {/* Merge duplicates */}
            {!showArchived && (
              <button
                onClick={() => {
                  setMergeMode(!mergeMode);
                  setMergeSelection([]);
                  if (!mergeMode) setViewMode('grid');
                }}
                className={`cos-btn h-9 px-4 text-sm ${mergeMode ? 'cos-btn-primary' : 'cos-btn-secondary'}`}
                title="Pick two duplicate families and merge them"
              >
                <GitMerge className="w-4 h-4" />
                Merge Duplicates
              </button>
            )}

            {/* Counts */}
            <div className="flex items-center gap-4 text-sm text-warm-gray dark:text-dm-text-muted">
              <span>{filteredFamilies.length} famil{filteredFamilies.length !== 1 ? 'ies' : 'y'}</span>
              <span>{totalMembers} members</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex bg-cream-dark dark:bg-dm-surface-raised rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-dm-surface shadow-sm text-gold' : 'text-warm-gray hover:text-charcoal dark:text-dm-text-muted'}`}
                title="Grid View"
              >
                <Grid3X3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setViewMode('list'); setMergeMode(false); setMergeSelection([]); }}
                className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-dm-surface shadow-sm text-gold' : 'text-warm-gray hover:text-charcoal dark:text-dm-text-muted'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Add Family */}
            <button
              onClick={() => { setEditingFamily(null); setFamilyModal('add'); }}
              className="cos-btn cos-btn-primary h-9 px-5 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Family
            </button>
          </div>
        </div>

        {/* Tag filter row */}
        {allTags.length > 0 && !showArchived && (
          <div className="flex items-center gap-2 flex-wrap">
            <Tag className="w-3.5 h-3.5 text-warm-gray flex-shrink-0" />
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedTags.includes(t)
                    ? 'bg-gold text-white border-gold'
                    : 'bg-white text-warm-gray border-parchment hover:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text-muted'
                }`}
              >
                {t}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button onClick={() => setSelectedTags([])} className="text-xs text-gold hover:underline">
                Clear tags
              </button>
            )}
          </div>
        )}

        {/* Merge-mode helper bar */}
        {mergeMode && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gold-glow/60 border border-gold/30 flex-wrap">
            <GitMerge className="w-4 h-4 text-gold flex-shrink-0" />
            <span className="body-sm text-charcoal dark:text-dm-text">
              Click the two duplicate families to select them ({mergeSelection.length}/2 selected)
            </span>
            {mergeSelection.length === 2 && (
              <button onClick={() => setMergeOpen(true)} className="cos-btn cos-btn-primary h-8 px-4 text-xs">
                <GitMerge className="w-3.5 h-3.5" />
                Compare & Merge
              </button>
            )}
            <button
              onClick={() => { setMergeMode(false); setMergeSelection([]); }}
              className="text-xs text-warm-gray hover:underline ml-auto"
            >
              Cancel
            </button>
          </div>
        )}
      </motion.div>

      {/* ── Grid View ───────────────────────────────── */}
      <AnimatePresence>
        {viewMode === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
          >
            {visibleFamilies.map((family, idx) => (
              <FamilyCard
                key={family.id}
                family={family}
                index={idx}
                expanded={expandedFamily === family.id}
                onToggleExpand={() => setExpandedFamily(expandedFamily === family.id ? null : family.id)}
                onEdit={() => handleEditFamily(family)}
                onDelete={() => handleDeleteFamily(family.id)}
                archived={showArchived}
                onRestore={() => handleRestoreFamily(family.id)}
                mergeMode={mergeMode}
                mergeSelected={mergeSelection.includes(family.id)}
                onToggleMergeSelect={() => toggleMergeSelect(family.id)}
                onUpdateFamily={handleUpdateFamily}
                onNotice={showNotice}
              />
            ))}
            {filteredFamilies.length > visibleCount && (
              <div className="col-span-full flex flex-col items-center gap-2 py-2">
                <button
                  onClick={() => setVisibleCount((c) => c + GRID_PAGE_SIZE)}
                  className="cos-btn cos-btn-secondary h-9 px-5 text-sm"
                >
                  <ChevronDown className="w-4 h-4" />
                  Load more families
                </button>
                <span className="text-xs text-warm-gray dark:text-dm-text-muted">
                  Showing {visibleFamilies.length} of {filteredFamilies.length} families
                </span>
              </div>
            )}
            {filteredFamilies.length === 0 && (
              <div className="col-span-full">
                {showArchived ? (
                  <EmptyState
                    icon={Archive}
                    title="No archived families"
                    description="Deleted families are kept here and can be restored at any time."
                  />
                ) : (
                  <EmptyState
                    icon={Users}
                    title={getLabel('directory.empty.title', 'Your parishioner directory is empty')}
                    description={getLabel('directory.empty.description', "Add families to keep track of who's in your parish. You can search by name, barangay, or phone number.")}
                    tip={getLabel('directory.empty.tip', 'Start with the families who attend Mass regularly.')}
                    actionLabel="Add Family"
                    actionIcon={Plus}
                    onAction={() => { setEditingFamily(null); setFamilyModal('add'); }}
                  />
                )}
              </div>
            )}
          </motion.div>
        ) : (
          /* ── List View ────────────────────────────── */
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <DataTable
              columns={listColumns}
              data={filteredFamilies}
              actionsColumn={(row) => (
                <div className="flex items-center gap-1">
                  {showArchived ? (
                    <button
                      onClick={() => handleRestoreFamily(row.id)}
                      className="p-1.5 rounded-md text-warm-gray hover:text-success hover:bg-success/10 transition-colors"
                      title="Restore"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEditFamily(row)}
                        className="p-1.5 rounded-md text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-colors dark:text-dm-text-muted dark:hover:text-dm-text"
                        title="View"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleEditFamily(row)}
                        className="p-1.5 rounded-md text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-colors dark:text-dm-text-muted dark:hover:text-dm-text"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteFamily(row.id)}
                        className="p-1.5 rounded-md text-warm-gray hover:text-error hover:bg-error/10 transition-colors"
                        title="Delete"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add/Edit Family Modal ──────────────────── */}
      <AnimatePresence>
        {familyModal && (
          <FamilyModal
            type={familyModal}
            family={editingFamily}
            onClose={() => { setFamilyModal(null); setEditingFamily(null); }}
            onSave={handleSaveFamily}
          />
        )}
      </AnimatePresence>

      {/* ── Delete Confirmation ────────────────────── */}
      <ConfirmationDialog
        isOpen={deleteDialog.open}
        title="Delete Family"
        message="Are you sure you want to delete this family? It will be moved to the Archived view, where it can be restored."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog({ open: false, familyId: '' })}
      />

      {/* ── Family Merge Modal ─────────────────────── */}
      <AnimatePresence>
        {mergeOpen && mergeA && mergeB && (
          <MergeChooserModal
            title="Merge Duplicate Families"
            leftTitle={`${mergeA.familyName} Family`}
            rightTitle={`${mergeB.familyName} Family`}
            fields={FAMILY_MERGE_FIELDS.map((f) => ({
              key: f.key,
              label: f.label,
              left: String((mergeA as unknown as Record<string, unknown>)[f.key] ?? ''),
              right: String((mergeB as unknown as Record<string, unknown>)[f.key] ?? ''),
            }))}
            note="Members are combined automatically (the same person is de-duplicated and their sacramental history merged); notes are joined and tags unioned. Registry links that pointed at a merged-away member are repointed. The duplicate family is archived, not destroyed."
            onApply={applyFamilyMerge}
            onClose={() => setMergeOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Notice toast ───────────────────────────── */}
      <AnimatePresence>
        {notice && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className="fixed top-4 right-4 z-toast flex items-start gap-3 p-4 rounded-xl shadow-lg border-l-4 border-l-success bg-white dark:bg-dm-surface w-[360px]"
          >
            <Check className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
            <p className="body-sm text-charcoal dark:text-dm-text flex-1">{notice}</p>
            <button onClick={() => setNotice('')} className="text-warm-gray hover:text-charcoal dark:text-dm-text-muted">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* =====================================================================
   MergeChooserModal — side-by-side field chooser for merging duplicates
   ===================================================================== */
interface MergeFieldRow {
  key: string;
  label: string;
  left: string;
  right: string;
}

function MergeChooserModal({
  title,
  leftTitle,
  rightTitle,
  fields,
  note,
  onApply,
  onClose,
}: {
  title: string;
  leftTitle: string;
  rightTitle: string;
  fields: MergeFieldRow[];
  note?: string;
  onApply: (primary: 'left' | 'right', chosen: Record<string, 'left' | 'right'>) => void;
  onClose: () => void;
}) {
  const [primary, setPrimary] = useState<'left' | 'right'>('left');
  const [chosen, setChosen] = useState<Record<string, 'left' | 'right'>>(() => {
    const init: Record<string, 'left' | 'right'> = {};
    for (const f of fields) init[f.key] = f.left ? 'left' : 'right';
    return init;
  });

  const pick = (key: string, side: 'left' | 'right') => setChosen((prev) => ({ ...prev, [key]: side }));

  const cell = (f: MergeFieldRow, side: 'left' | 'right') => {
    const value = side === 'left' ? f.left : f.right;
    const active = chosen[f.key] === side;
    return (
      <button
        type="button"
        onClick={() => pick(f.key, side)}
        className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg border text-sm transition-all ${
          active
            ? 'border-gold bg-gold-glow text-charcoal dark:text-dm-text'
            : 'border-parchment bg-white text-warm-gray hover:border-gold/50 dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text-muted'
        }`}
      >
        <span className="truncate block">{value || '—'}</span>
      </button>
    );
  };

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
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[700px] overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div className="flex items-center gap-3">
            <GitMerge className="w-5 h-5 text-gold" />
            <h2 className="heading-lg text-charcoal dark:text-dm-text">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto space-y-4">
          {/* Which record survives */}
          <div>
            <label className="label block text-warm-gray mb-1">Keep which record?</label>
            <div className="flex gap-2">
              {(['left', 'right'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setPrimary(side)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    primary === side
                      ? 'border-gold bg-gold-glow text-charcoal dark:text-dm-text'
                      : 'border-parchment bg-white text-warm-gray hover:border-gold/50 dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text-muted'
                  }`}
                >
                  {side === 'left' ? leftTitle : rightTitle}
                </button>
              ))}
            </div>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-1">
              The kept record's ID survives; the other one is merged into it.
            </p>
          </div>

          {/* Column headers */}
          <div className="flex gap-2 items-center">
            <span className="w-32 flex-shrink-0" />
            <span className="flex-1 text-xs font-semibold text-charcoal dark:text-dm-text truncate">{leftTitle}</span>
            <span className="flex-1 text-xs font-semibold text-charcoal dark:text-dm-text truncate">{rightTitle}</span>
          </div>

          {/* Field chooser rows */}
          <div className="space-y-2">
            {fields.map((f) => (
              <div key={f.key} className="flex gap-2 items-center">
                <span className="w-32 flex-shrink-0 label text-warm-gray">{f.label}</span>
                {cell(f, 'left')}
                {cell(f, 'right')}
              </div>
            ))}
          </div>

          {note && (
            <p className="body-xs text-warm-gray dark:text-dm-text-muted p-3 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50">
              {note}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
          <button onClick={onClose} className="cos-btn cos-btn-secondary px-5 py-2 text-sm">Cancel</button>
          <button onClick={() => onApply(primary, chosen)} className="cos-btn cos-btn-primary px-6 py-2 text-sm">
            <GitMerge className="w-4 h-4" />
            Merge
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* =====================================================================
   FamilyCard — Individual family card (grid view)
   ===================================================================== */
function FamilyCard({
  family,
  index,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  archived = false,
  onRestore,
  mergeMode = false,
  mergeSelected = false,
  onToggleMergeSelect,
  onUpdateFamily,
  onNotice,
}: {
  family: Family;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Archived view: show Restore instead of Edit/Delete. */
  archived?: boolean;
  onRestore?: () => void;
  /** Family-merge selection mode (card click selects instead of expanding). */
  mergeMode?: boolean;
  mergeSelected?: boolean;
  onToggleMergeSelect?: () => void;
  onUpdateFamily: (f: Family) => void;
  onNotice: (msg: string) => void;
}) {
  const navigate = useNavigate();
  const head = family.members.find((m) => m.relationship === 'Head');
  const spouse = family.members.find((m) => m.relationship === 'Spouse');
  const children = family.members.filter((m) => m.relationship === 'Son' || m.relationship === 'Daughter');

  /* In-card "merge duplicate members" flow */
  const [memberSelecting, setMemberSelecting] = useState(false);
  const [memberSelection, setMemberSelection] = useState<string[]>([]);
  const [memberMergeOpen, setMemberMergeOpen] = useState(false);
  const memberA = family.members.find((m) => m.id === memberSelection[0]);
  const memberB = family.members.find((m) => m.id === memberSelection[1]);

  const toggleMemberSelect = (id: string) => {
    setMemberSelection((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 2 ? prev : [...prev, id],
    );
  };

  const applyMemberMerge = (primary: 'left' | 'right', chosen: Record<string, 'left' | 'right'>) => {
    if (!memberA || !memberB) return;
    const keep = primary === 'left' ? memberA : memberB;
    const absorb = primary === 'left' ? memberB : memberA;
    const keepAdjusted = { ...keep } as Parishioner;
    for (const fld of MEMBER_MERGE_FIELDS) {
      const source = (chosen[fld.key] ?? primary) === 'left' ? memberA : memberB;
      (keepAdjusted as unknown as Record<string, unknown>)[fld.key] = (source as unknown as Record<string, unknown>)[fld.key];
    }
    const { merged, rewrites } = mergeParishioners(keepAdjusted, absorb);
    onUpdateFamily({
      ...family,
      members: family.members.filter((m) => m.id !== absorb.id).map((m) => (m.id === keep.id ? merged : m)),
    });
    applyRegistryRewrites(rewrites);
    appendDirectoryAudit(
      'Merged',
      keep.id,
      `Merged member "${getFullName(absorb)}" into "${getFullName(merged)}" in the ${family.familyName} family${rewrites.length ? '; repointed registry links' : ''}`,
    );
    setMemberMergeOpen(false);
    setMemberSelecting(false);
    setMemberSelection([]);
    onNotice('Members merged');
  };

  /* Sacramental summary badges */
  const familySacraments = useMemo(() => {
    const hasBaptism = family.members.some((m) => m.sacraments.some((s) => s.type === 'Baptism'));
    const hasConfirmation = family.members.some((m) => m.sacraments.some((s) => s.type === 'Confirmation'));
    const hasMarriage = family.members.some((m) => m.sacraments.some((s) => s.type === 'Marriage'));
    return [
      { label: 'Baptized', active: hasBaptism, icon: Droplets },
      { label: 'Confirmed', active: hasConfirmation, icon: Flame },
      { label: 'Married', active: hasMarriage, icon: Heart },
    ];
  }, [family]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      // Stagger within the current load-more batch only, capped so late batches
      // (index ≥ GRID_PAGE_SIZE) don't wait seconds before appearing.
      transition={{ duration: 0.3, delay: Math.min(index % GRID_PAGE_SIZE, 11) * 0.05, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
      className={`cos-card cos-card-hover cursor-pointer flex flex-col overflow-hidden ${mergeSelected ? 'ring-2 ring-gold' : ''} ${archived ? 'opacity-80' : ''}`}
      onClick={mergeMode ? onToggleMergeSelect : onToggleExpand}
      style={{ borderTopWidth: 4, borderTopColor: family.color }}
    >
      {/* Merge-mode selection indicator */}
      {mergeMode && (
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
              mergeSelected ? 'bg-gold border-gold text-white' : 'border-parchment dark:border-dm-border'
            }`}
          >
            {mergeSelected && <Check className="w-3.5 h-3.5" />}
          </span>
          <span className="text-xs text-warm-gray dark:text-dm-text-muted">
            {mergeSelected ? 'Selected for merge' : 'Click to select for merge'}
          </span>
        </div>
      )}

      {/* Card Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar stack */}
        <div className="flex -space-x-2 flex-shrink-0">
          {family.members.slice(0, 3).map((m) => (
            <MemberAvatar key={m.id} member={m} size={36} />
          ))}
          {family.members.length > 3 && (
            <div className="w-9 h-9 rounded-full bg-gold text-white text-[11px] font-semibold flex items-center justify-center border-2 border-white flex-shrink-0">
              +{family.members.length - 3}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="heading-md text-charcoal dark:text-dm-text truncate">{family.familyName} Family</h3>
          <span className="cos-badge cos-badge-default mt-1">{family.members.length} members</span>
        </div>
      </div>

      {/* Address */}
      <div className="flex items-start gap-1.5 text-warm-gray dark:text-dm-text-muted mb-2">
        <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span className="body-sm">
          {family.street ? `${family.street}, ` : ''}Brgy. {family.barangay}, {family.sitio}, {family.city}
        </span>
      </div>

      {/* Contact */}
      <div className="flex items-center gap-1.5 text-warm-gray dark:text-dm-text-muted mb-3">
        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="body-sm">{family.primaryPhone}</span>
        {family.email && (
          <>
            <span className="mx-1 text-parchment">|</span>
            <Mail className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="body-sm truncate">{family.email}</span>
          </>
        )}
      </div>

      {/* Tags */}
      {(family.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {family.tags!.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cream-dark dark:bg-dm-surface-raised text-[10px] font-medium text-warm-gray dark:text-dm-text-muted"
            >
              <Tag className="w-2.5 h-2.5" />
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Sacramental history badges */}
      <div className="flex flex-wrap gap-2 mb-3">
        {familySacraments.map((s) => {
          const Icon = s.icon;
          return s.active ? (
            <span key={s.label} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium" style={{ backgroundColor: `${sacramentColors[s.label === 'Baptized' ? 'Baptism' : s.label === 'Confirmed' ? 'Confirmation' : 'Marriage']}18`, color: sacramentColors[s.label === 'Baptized' ? 'Baptism' : s.label === 'Confirmed' ? 'Confirmation' : 'Marriage'] }}>
              <Icon className="w-3 h-3" />
              {s.label} ✓
            </span>
          ) : null;
        })}
      </div>

      {/* Divider */}
      <div className="border-t border-parchment dark:border-dm-border my-3" />

      {/* Actions + Expand */}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {archived ? (
            <button
              onClick={onRestore}
              className="cos-btn cos-btn-secondary h-8 px-3 text-xs"
              title="Restore this family"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Restore
            </button>
          ) : (
            <>
              <button
                onClick={onEdit}
                className="cos-btn cos-btn-secondary h-8 px-3 text-xs"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={onDelete}
                className="p-2 rounded-lg text-warm-gray hover:text-error hover:bg-error/10 transition-colors"
                title="Delete"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
        <button
          onClick={onToggleExpand}
          className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-colors dark:text-dm-text-muted dark:hover:text-dm-text"
          title={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* ── Expanded Member List ───────────────────── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-parchment dark:border-dm-border" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h4 className="heading-sm text-charcoal dark:text-dm-text">Family Members</h4>
                {!archived && family.members.length >= 2 && (
                  <div className="flex items-center gap-2">
                    {memberSelecting && memberSelection.length === 2 && (
                      <button
                        onClick={() => setMemberMergeOpen(true)}
                        className="cos-btn cos-btn-primary h-7 px-3 text-xs"
                      >
                        <GitMerge className="w-3 h-3" />
                        Compare & Merge
                      </button>
                    )}
                    <button
                      onClick={() => { setMemberSelecting(!memberSelecting); setMemberSelection([]); }}
                      className={`cos-btn h-7 px-3 text-xs ${memberSelecting ? 'cos-btn-primary' : 'cos-btn-secondary'}`}
                      title="Pick two duplicate members and merge them"
                    >
                      <GitMerge className="w-3 h-3" />
                      {memberSelecting ? 'Cancel merge' : 'Merge duplicates'}
                    </button>
                  </div>
                )}
              </div>
              {memberSelecting && (
                <p className="body-xs text-warm-gray dark:text-dm-text-muted mb-2">
                  Tick the two duplicate members ({memberSelection.length}/2 selected).
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left">Name</th>
                      <th className="text-left">Relationship</th>
                      <th className="text-left">DOB</th>
                      <th className="text-left">Age</th>
                      <th className="text-left">Sacramental History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {family.members.map((member) => {
                      const badges = getSacramentBadges(member);
                      return (
                        <tr key={member.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              {memberSelecting && (
                                <input
                                  type="checkbox"
                                  checked={memberSelection.includes(member.id)}
                                  onChange={() => toggleMemberSelect(member.id)}
                                  className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold flex-shrink-0"
                                  aria-label={`Select ${getFullName(member)} for merge`}
                                />
                              )}
                              <MemberAvatar member={member} size={28} />
                              <span className="text-sm font-medium text-charcoal dark:text-dm-text">{getFullName(member)}</span>
                            </div>
                          </td>
                          <td>
                            <span className="text-sm text-warm-gray dark:text-dm-text-muted">{member.relationship}</span>
                          </td>
                          <td>
                            <span className="text-sm text-warm-gray dark:text-dm-text-muted">{formatDate(member.dateOfBirth)}</span>
                          </td>
                          <td>
                            <span className="text-sm text-warm-gray dark:text-dm-text-muted">{formatAge(member.dateOfBirth)}</span>
                          </td>
                          <td>
                            <div className="flex gap-1.5 flex-wrap">
                              {badges.map((b) => {
                                // Click-through: jump to the registry record when this
                                // sacrament entry is linked to the register.
                                const registryId = member.sacraments.find(
                                  (s) => s.type === b.type && s.registryRecordId,
                                )?.registryRecordId;
                                const style = {
                                  backgroundColor: b.active ? `${sacramentColors[b.type]}18` : '#F2EFE8',
                                  color: b.active ? sacramentColors[b.type] : '#8C8374',
                                };
                                return b.active && registryId ? (
                                  <button
                                    key={b.type}
                                    onClick={(e) => { e.stopPropagation(); navigate(`/registry?id=${registryId}`); }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium underline-offset-2 hover:underline"
                                    style={style}
                                    title="Open the linked registry record"
                                  >
                                    ✓ {b.label}
                                  </button>
                                ) : (
                                  <span
                                    key={b.type}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                                    style={style}
                                  >
                                    {b.active ? '✓' : '○'} {b.label}
                                  </span>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Member Merge Modal ─────────────────────── */}
      <AnimatePresence>
        {memberMergeOpen && memberA && memberB && (
          <div onClick={(e) => e.stopPropagation()}>
            <MergeChooserModal
              title="Merge Duplicate Members"
              leftTitle={getFullName(memberA)}
              rightTitle={getFullName(memberB)}
              fields={MEMBER_MERGE_FIELDS.map((f) => ({
                key: f.key,
                label: f.label,
                left: String((memberA as unknown as Record<string, unknown>)[f.key] ?? ''),
                right: String((memberB as unknown as Record<string, unknown>)[f.key] ?? ''),
              }))}
              note="Sacramental histories are combined (same sacrament on the same date is de-duplicated) and registry links that pointed at the merged-away member are repointed."
              onApply={applyMemberMerge}
              onClose={() => setMemberMergeOpen(false)}
            />
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* =====================================================================
   FamilyModal — Add/Edit family
   ===================================================================== */
function FamilyModal({
  type,
  family,
  onClose,
  onSave,
}: {
  type: 'add' | 'edit';
  family: Family | null;
  onClose: () => void;
  onSave: (f: Family) => void;
}) {
  const isEdit = type === 'edit';
  const [form, setForm] = useState<Partial<Family>>({
    familyName: family?.familyName || '',
    street: family?.street || '',
    barangay: family?.barangay || barangays[0],
    sitio: family?.sitio || '',
    city: family?.city || 'Mabalacat',
    province: family?.province || 'Pampanga',
    primaryPhone: family?.primaryPhone || '',
    secondaryPhone: family?.secondaryPhone || '',
    email: family?.email || '',
    notes: family?.notes || '',
    status: family?.status || 'Active',
  });
  const [tagsText, setTagsText] = useState((family?.tags ?? []).join(', '));

  const [members, setMembers] = useState<Partial<Parishioner>[]>(
    family?.members.map((m) => ({ ...m })) || [
      { id: `p-${Date.now()}`, firstName: '', middleName: '', lastName: '', dateOfBirth: '', gender: 'Male', relationship: 'Head', sacraments: [] },
    ]
  );

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateForm = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  const addMember = () => {
    setMembers((prev) => [
      ...prev,
      { id: `p-${Date.now()}-${Math.random()}`, firstName: '', middleName: '', lastName: '', dateOfBirth: '', gender: 'Male', relationship: 'Son', sacraments: [] },
    ]);
  };

  const removeMember = (idx: number) => {
    if (members.length <= 1) return;
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateMember = (idx: number, field: string, value: string) => {
    setMembers((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      return updated;
    });
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.familyName) e.familyName = 'Family name is required';
    if (!form.barangay) e.barangay = 'Barangay is required';
    if (!form.primaryPhone) {
      e.primaryPhone = 'Phone number is required';
    } else if (!isValidPhone(form.primaryPhone)) {
      e.primaryPhone = 'Enter a valid phone number (e.g. 0917-555-0101)';
    }
    if (form.email && !isValidEmail(form.email)) {
      e.email = 'Enter a valid email address (e.g. name@email.com)';
    }
    if (members.some((m) => !m.firstName || !m.lastName)) e.members = 'All members must have a name';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
    const newFamily: Family = {
      // Spread first so soft-delete flags and any future optional fields on an
      // existing family survive an edit; explicit fields below win.
      ...(family ?? {}),
      id: family?.id || `f-${Date.now()}`,
      familyName: form.familyName || '',
      color: family?.color || '#C9963B',
      status: (form.status as 'Active') || 'Active',
      street: form.street || '',
      barangay: form.barangay || barangays[0],
      sitio: form.sitio || '',
      city: form.city || 'Mabalacat',
      province: form.province || 'Pampanga',
      primaryPhone: form.primaryPhone || '',
      secondaryPhone: form.secondaryPhone || '',
      email: form.email || '',
      notes: form.notes || '',
      tags: tags.length ? tags : undefined,
      members: members as Parishioner[],
    };
    onSave(newFamily);
  };

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
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[600px] overflow-hidden my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-gold" />
            <h2 className="heading-lg text-charcoal dark:text-dm-text">{isEdit ? 'Edit' : 'Add'} Family</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto space-y-6">
          {/* Family Information */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-gold" />
              <h3 className="label uppercase text-warm-gray">Family Information</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label block text-warm-gray mb-1">Family Name *</label>
                <input
                  value={form.familyName || ''}
                  onChange={(e) => updateForm('familyName', e.target.value)}
                  placeholder="e.g., Dela Cruz"
                  className="w-full h-10 rounded-md border border-parchment bg-white px-3 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                />
                {errors.familyName && <span className="text-xs text-error mt-1 block">{errors.familyName}</span>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block text-warm-gray mb-1">Street Address</label>
                  <input
                    value={form.street || ''}
                    onChange={(e) => updateForm('street', e.target.value)}
                    className="w-full h-10 rounded-md border border-parchment bg-white px-3 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                </div>
                <div>
                  <label className="label block text-warm-gray mb-1">Barangay *</label>
                  <select
                    value={form.barangay || ''}
                    onChange={(e) => updateForm('barangay', e.target.value)}
                    className="w-full h-10 rounded-md border border-parchment bg-white px-3 text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  >
                    {barangays.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block text-warm-gray mb-1">Sitio</label>
                  <input
                    value={form.sitio || ''}
                    onChange={(e) => updateForm('sitio', e.target.value)}
                    className="w-full h-10 rounded-md border border-parchment bg-white px-3 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                </div>
                <div>
                  <label className="label block text-warm-gray mb-1">City</label>
                  <input
                    value={form.city || ''}
                    onChange={(e) => updateForm('city', e.target.value)}
                    className="w-full h-10 rounded-md border border-parchment bg-white px-3 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block text-warm-gray mb-1">Primary Phone *</label>
                  <input
                    value={form.primaryPhone || ''}
                    onChange={(e) => updateForm('primaryPhone', e.target.value)}
                    placeholder="09XX XXX XXXX"
                    className="w-full h-10 rounded-md border border-parchment bg-white px-3 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                  {errors.primaryPhone && <span className="text-xs text-error mt-1 block">{errors.primaryPhone}</span>}
                </div>
                <div>
                  <label className="label block text-warm-gray mb-1">Email</label>
                  <input
                    value={form.email || ''}
                    onChange={(e) => updateForm('email', e.target.value)}
                    placeholder="family@email.com"
                    className="w-full h-10 rounded-md border border-parchment bg-white px-3 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                  />
                  {errors.email && <span className="text-xs text-error mt-1 block">{errors.email}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Members Section */}
          <div className="border-t border-parchment dark:border-dm-border pt-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gold" />
                <h3 className="label uppercase text-warm-gray">Family Members</h3>
              </div>
              <button
                onClick={addMember}
                className="cos-btn cos-btn-secondary h-7 px-3 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Member
              </button>
            </div>

            {errors.members && <span className="text-xs text-error mb-2 block">{errors.members}</span>}

            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {members.map((member, idx) => (
                  <motion.div
                    key={member.id ?? idx}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="bg-cream-dark/50 dark:bg-dm-surface-raised rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-charcoal dark:text-dm-text">Member {idx + 1}</span>
                        {members.length > 1 && (
                          <button
                            onClick={() => removeMember(idx)}
                            className="p-1 rounded text-warm-gray hover:text-error hover:bg-error/10 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          value={member.firstName || ''}
                          onChange={(e) => updateMember(idx, 'firstName', e.target.value)}
                          placeholder="First Name"
                          className="h-9 rounded-md border border-parchment bg-white px-2 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                        />
                        <input
                          value={member.middleName || ''}
                          onChange={(e) => updateMember(idx, 'middleName', e.target.value)}
                          placeholder="Middle Name"
                          className="h-9 rounded-md border border-parchment bg-white px-2 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                        />
                        <input
                          value={member.lastName || ''}
                          onChange={(e) => updateMember(idx, 'lastName', e.target.value)}
                          placeholder="Last Name"
                          className="h-9 rounded-md border border-parchment bg-white px-2 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="date"
                          value={member.dateOfBirth || ''}
                          onChange={(e) => updateMember(idx, 'dateOfBirth', e.target.value)}
                          className="h-9 rounded-md border border-parchment bg-white px-2 text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                        />
                        <select
                          value={member.gender || 'Male'}
                          onChange={(e) => updateMember(idx, 'gender', e.target.value)}
                          className="h-9 rounded-md border border-parchment bg-white px-2 text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                        </select>
                        <select
                          value={member.relationship || 'Son'}
                          onChange={(e) => updateMember(idx, 'relationship', e.target.value)}
                          className="h-9 rounded-md border border-parchment bg-white px-2 text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                        >
                          <option value="Head">Head</option>
                          <option value="Spouse">Spouse</option>
                          <option value="Son">Son</option>
                          <option value="Daughter">Daughter</option>
                          <option value="Relative">Relative</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Tags */}
          <div className="border-t border-parchment dark:border-dm-border pt-5">
            <label className="label block text-warm-gray mb-1">Tags</label>
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g., choir, benefactor, catechist"
              className="w-full h-10 rounded-md border border-parchment bg-white px-3 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
            />
            <span className="text-xs text-warm-gray dark:text-dm-text-muted mt-1 block">
              Separate tags with commas — they appear as chips on the family card and can be filtered.
            </span>
          </div>

          {/* Notes */}
          <div className="border-t border-parchment dark:border-dm-border pt-5">
            <label className="label block text-warm-gray mb-1">Notes</label>
            <textarea
              value={form.notes || ''}
              onChange={(e) => updateForm('notes', e.target.value)}
              placeholder="General notes about the family..."
              rows={3}
              className="w-full rounded-md border border-parchment bg-white px-3 py-2 text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
          <button onClick={onClose} className="cos-btn cos-btn-secondary px-5 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} className="cos-btn cos-btn-primary px-6 py-2 text-sm">
            <Save className="w-4 h-4" />
            Save Family
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
