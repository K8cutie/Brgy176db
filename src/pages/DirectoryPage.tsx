import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import DataTable, { type Column } from '@/components/DataTable';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import EmptyState from '@/components/EmptyState';
import { getLabel } from '@/lib/friendlyLabels';
import {
  type Family,
  type Parishioner,
  families as initialFamilies,
  barangays,
  getFullName,
  getAge,
  getInitials,
  getSacramentBadges,
} from '@/lib/directoryData';
import { celebrateFirstAction } from '@/components/FirstRunDetector';

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
  const [families, setFamilies] = useState<Family[]>(initialFamilies);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBarangay, setSelectedBarangay] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null);
  const [familyModal, setFamilyModal] = useState<'add' | 'edit' | null>(null);
  const [editingFamily, setEditingFamily] = useState<Family | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; familyId: string }>({ open: false, familyId: '' });

  /* sitios from selected barangay */
  const availableSitios = useMemo(() => {
    const sitios = new Set<string>();
    families.forEach((f) => { if (f.barangay === selectedBarangay || selectedBarangay === 'All') sitios.add(f.sitio); });
    return Array.from(sitios).sort();
  }, [families, selectedBarangay]);

  const [selectedSitio, setSelectedSitio] = useState('All');

  /* Filter families */
  const filteredFamilies = useMemo(() => {
    return families.filter((f) => {
      if (selectedBarangay !== 'All' && f.barangay !== selectedBarangay) return false;
      if (selectedSitio !== 'All' && f.sitio !== selectedSitio) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      if (f.familyName.toLowerCase().includes(q)) return true;
      if (f.primaryPhone.includes(q)) return true;
      if (f.barangay.toLowerCase().includes(q)) return true;
      if (f.sitio.toLowerCase().includes(q)) return true;
      return f.members.some((m) => getFullName(m).toLowerCase().includes(q));
    });
  }, [families, searchQuery, selectedBarangay, selectedSitio]);

  const totalMembers = filteredFamilies.reduce((sum, f) => sum + f.members.length, 0);

  const handleEditFamily = (family: Family) => {
    setEditingFamily(family);
    setFamilyModal('edit');
  };

  const handleDeleteFamily = (id: string) => setDeleteDialog({ open: true, familyId: id });
  const confirmDelete = () => {
    setFamilies((prev) => prev.filter((f) => f.id !== deleteDialog.familyId));
    setDeleteDialog({ open: false, familyId: '' });
  };

  const handleSaveFamily = (family: Family) => {
    if (familyModal === 'edit' && editingFamily) {
      setFamilies((prev) => prev.map((f) => (f.id === family.id ? family : f)));
    } else {
      setFamilies((prev) => [family, ...prev]);
      // Celebrate first family added
      celebrateFirstAction('family');
    }
    setFamilyModal(null);
    setEditingFamily(null);
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
                onClick={() => setViewMode('list')}
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
      </motion.div>

      {/* ── Grid View ───────────────────────────────── */}
      <AnimatePresence mode="wait">
        {viewMode === 'grid' ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
          >
            {filteredFamilies.map((family, idx) => (
              <FamilyCard
                key={family.id}
                family={family}
                index={idx}
                expanded={expandedFamily === family.id}
                onToggleExpand={() => setExpandedFamily(expandedFamily === family.id ? null : family.id)}
                onEdit={() => handleEditFamily(family)}
                onDelete={() => handleDeleteFamily(family.id)}
              />
            ))}
            {filteredFamilies.length === 0 && (
              <div className="col-span-full">
                <EmptyState
                  icon={Users}
                  title={getLabel('directory.empty.title', 'Your parishioner directory is empty')}
                  description={getLabel('directory.empty.description', "Add families to keep track of who's in your parish. You can search by name, barangay, or phone number.")}
                  tip={getLabel('directory.empty.tip', 'Start with the families who attend Mass regularly.')}
                  actionLabel="Add Family"
                  actionIcon={Plus}
                  onAction={() => { setEditingFamily(null); setFamilyModal('add'); }}
                />
              </div>
            )}
          </motion.div>
        ) : (
          /* ── List View ────────────────────────────── */
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <DataTable
              columns={listColumns}
              data={filteredFamilies}
              actionsColumn={(row) => (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { /* view */ }}
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
        message="Are you sure you want to delete this family? All member records and sacramental history will be permanently removed."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteDialog({ open: false, familyId: '' })}
      />
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
}: {
  family: Family;
  index: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const head = family.members.find((m) => m.relationship === 'Head');
  const spouse = family.members.find((m) => m.relationship === 'Spouse');
  const children = family.members.filter((m) => m.relationship === 'Son' || m.relationship === 'Daughter');

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
      transition={{ duration: 0.3, delay: index * 0.05, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
      className="cos-card cos-card-hover cursor-pointer flex flex-col overflow-hidden"
      onClick={onToggleExpand}
      style={{ borderTopWidth: 4, borderTopColor: family.color }}
    >
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
            <div className="mt-4 pt-4 border-t border-parchment dark:border-dm-border">
              <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Family Members</h4>
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
                            <span className="text-sm text-warm-gray dark:text-dm-text-muted">{getAge(member.dateOfBirth)}</span>
                          </td>
                          <td>
                            <div className="flex gap-1.5 flex-wrap">
                              {badges.map((b) => (
                                <span
                                  key={b.type}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                                  style={{
                                    backgroundColor: b.active ? `${sacramentColors[b.type]}18` : '#F2EFE8',
                                    color: b.active ? sacramentColors[b.type] : '#8C8374',
                                  }}
                                >
                                  {b.active ? '✓' : '○'} {b.label}
                                </span>
                              ))}
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
    if (!form.primaryPhone) e.primaryPhone = 'Phone number is required';
    if (members.some((m) => !m.firstName || !m.lastName)) e.members = 'All members must have a name';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const newFamily: Family = {
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
      members: members as Parishioner[],
    };
    onSave(newFamily);
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
                    key={idx}
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
