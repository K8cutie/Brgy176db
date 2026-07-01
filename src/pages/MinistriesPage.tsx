import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import EmptyState from '@/components/EmptyState';
import { getLabel } from '@/lib/friendlyLabels';
import {
  UserCheck,
  Users,
  Plus,
  X,
  Save,
  Edit3,
  UserX,
  Check,
  ChevronRight,
  Music,
  BookOpen,
  Hand,
  Cross,
  Baby,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { MINISTRIES, getAccentColor } from '@/lib/ministryData';
import type { Ministry, MinistryMember, ScheduleAssignment, AttendanceRecord } from '@/lib/ministryData';
import DataTable from '@/components/DataTable';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { usePersistedState } from '@/hooks/usePersistedState';
import { KEYS } from '@/lib/storageKeys';

type DetailTab = 'roster' | 'schedule' | 'attendance';

const MINISTRY_ICONS: Record<string, React.ReactNode> = {
  eucharistic: <Cross className="w-6 h-6" />,
  altar: <Baby className="w-6 h-6" />,
  choir: <Music className="w-6 h-6" />,
  lectors: <BookOpen className="w-6 h-6" />,
  ushers: <Hand className="w-6 h-6" />,
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MASS_TIMES = ['6:00 AM', '8:00 AM', '10:00 AM', '6:00 PM'];

export default function MinistriesPage() {
  const [ministries, setMinistries] = usePersistedState<Ministry[]>(KEYS.ministries, MINISTRIES);
  const [selectedMinistryId, setSelectedMinistryId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('roster');
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<MinistryMember | null>(null);
  const [deleteMemberDialog, setDeleteMemberDialog] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);

  const selectedMinistry = useMemo(() =>
    ministries.find(m => m.id === selectedMinistryId) || null
  , [ministries, selectedMinistryId]);

  // Active assignments = distinct scheduled slots that actually have a member assigned.
  const activeAssignmentCount = useMemo(() =>
    (selectedMinistry?.scheduleAssignments ?? []).filter(a => a.memberName.trim() !== '').length
  , [selectedMinistry]);

  // Member modal handlers
  const openAddMember = useCallback(() => {
    setEditingMember(null);
    setMemberModalOpen(true);
  }, []);

  const openEditMember = useCallback((member: MinistryMember) => {
    setEditingMember(member);
    setMemberModalOpen(true);
  }, []);

  const handleSaveMember = useCallback((member: MinistryMember) => {
    if (!selectedMinistry) return;
    setMinistries(prev => prev.map(m => {
      if (m.id !== selectedMinistry.id) return m;
      const exists = m.members.find(mm => mm.id === member.id);
      const newMembers = exists
        ? m.members.map(mm => mm.id === member.id ? member : mm)
        : [...m.members, member];
      return { ...m, members: newMembers, memberCount: newMembers.length };
    }));
    setMemberModalOpen(false);
    toast.success(editingMember ? 'Member updated' : 'Member added');
  }, [selectedMinistry, editingMember]);

  const handleDeleteMember = useCallback(() => {
    if (!selectedMinistry || !memberToDelete) return;
    setMinistries(prev => prev.map(m => {
      if (m.id !== selectedMinistry.id) return m;
      const newMembers = m.members.filter(mm => mm.id !== memberToDelete);
      return { ...m, members: newMembers, memberCount: newMembers.length };
    }));
    setDeleteMemberDialog(false);
    setMemberToDelete(null);
    toast.success('Member removed');
  }, [selectedMinistry, memberToDelete]);

  const handleUpdateAssignments = useCallback((ministryId: string, assignments: ScheduleAssignment[]) => {
    setMinistries(prev => prev.map(m =>
      m.id === ministryId ? { ...m, scheduleAssignments: assignments } : m
    ));
    toast.success('Schedule saved');
  }, []);

  const handleUpdateAttendance = useCallback((ministryId: string, attendance: AttendanceRecord[]) => {
    setMinistries(prev => prev.map(m =>
      m.id === ministryId ? { ...m, attendance } : m
    ));
    toast.success('Attendance saved');
  }, []);

  return (
    <div className="space-y-6">
      <Toaster position="top-right" richColors />

      {/* Module Title */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-gold" />
          </div>
          <h1 className="display-md font-playfair text-charcoal dark:text-dm-text">Ministries</h1>
        </div>
        <p className="body-md text-warm-gray dark:text-dm-text-muted ml-[52px]">
          Manage Eucharistic ministers, altar servers, choirs, lectors, and ushers. Track assignments and attendance.
        </p>
      </div>

      {/* Ministry Cards Row */}
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
        {ministries.map((ministry, idx) => {
          const accent = getAccentColor(ministry.accent);
          return (
            <motion.button
              key={ministry.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: idx * 0.06 }}
              onClick={() => { setSelectedMinistryId(ministry.id); setDetailTab('roster'); }}
              className={`flex-shrink-0 w-[220px] cos-card p-5 text-left transition-all ${
                selectedMinistryId === ministry.id
                  ? 'ring-2 ring-offset-2 cos-card-hover'
                  : 'cos-card-hover'
              }`}
              style={
                selectedMinistryId === ministry.id
                  ? { '--tw-ring-color': accent.bg, '--tw-ring-offset-color': 'var(--cream)' } as React.CSSProperties
                  : undefined
              }
            >
              {/* Icon */}
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
                style={{ backgroundColor: accent.light, color: accent.bg }}
              >
                {MINISTRY_ICONS[ministry.id] || <Users className="w-6 h-6" />}
              </div>

              {/* Name */}
              <h3 className="heading-sm text-charcoal dark:text-dm-text mb-1">
                {ministry.name}
              </h3>

              {/* Member count */}
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="cos-badge"
                  style={{ backgroundColor: accent.light, color: accent.bg }}
                >
                  {ministry.memberCount} members
                </span>
              </div>

              {/* Coordinator */}
              <p className="body-sm text-warm-gray dark:text-dm-text-muted mb-3">
                Coordinated by {ministry.coordinator}
              </p>

              {/* Schedule */}
              <p className="text-xs text-warm-gray/70 dark:text-dm-text-muted/70 mb-4">
                {ministry.schedule}
              </p>

              {/* View Roster button */}
              <span
                className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
                style={{ color: accent.bg }}
              >
                View Roster
                <ChevronRight className="w-4 h-4" />
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Ministry Detail View */}
      <AnimatePresence mode="wait">
        {selectedMinistry && (
          <motion.div
            key={selectedMinistry.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {/* Detail Header */}
            <div className="cos-card p-5 mb-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: getAccentColor(selectedMinistry.accent).light,
                      color: getAccentColor(selectedMinistry.accent).bg,
                    }}
                  >
                    {MINISTRY_ICONS[selectedMinistry.id] || <Users className="w-7 h-7" />}
                  </div>
                  <div>
                    <h2 className="heading-lg text-charcoal dark:text-dm-text">
                      {selectedMinistry.name}
                    </h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="body-sm text-warm-gray dark:text-dm-text-muted">
                        {selectedMinistry.memberCount} members
                      </span>
                      <span className="w-1 h-1 rounded-full bg-warm-gray/40" />
                      <span className="body-sm text-warm-gray dark:text-dm-text-muted">
                        {activeAssignmentCount} active assignments
                      </span>
                      <span className="w-1 h-1 rounded-full bg-warm-gray/40" />
                      <span className="body-sm text-warm-gray dark:text-dm-text-muted">
                        Coord: {selectedMinistry.coordinator}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={openAddMember}
                  className="cos-btn cos-btn-primary text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add Member
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 mt-5 border-b border-parchment dark:border-dm-border">
                {(['roster', 'schedule', 'attendance'] as DetailTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setDetailTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium capitalize transition-all border-b-2 -mb-px ${
                      detailTab === tab
                        ? 'border-gold text-gold'
                        : 'border-transparent text-warm-gray dark:text-dm-text-muted hover:text-charcoal dark:hover:text-dm-text'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              {detailTab === 'roster' && (
                <motion.div
                  key="roster"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <RosterTab
                    ministry={selectedMinistry}
                    onAddMember={openAddMember}
                    onEditMember={openEditMember}
                    onDeleteMember={(id) => { setMemberToDelete(id); setDeleteMemberDialog(true); }}
                  />
                </motion.div>
              )}
              {detailTab === 'schedule' && (
                <motion.div
                  key="schedule"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ScheduleTab
                    ministry={selectedMinistry}
                    onUpdate={(assignments) => handleUpdateAssignments(selectedMinistry.id, assignments)}
                  />
                </motion.div>
              )}
              {detailTab === 'attendance' && (
                <motion.div
                  key="attendance"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <AttendanceTab
                    ministry={selectedMinistry}
                    onUpdate={(attendance) => handleUpdateAttendance(selectedMinistry.id, attendance)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Member Modal */}
      <AnimatePresence>
        {memberModalOpen && selectedMinistry && (
          <MemberModal
            onClose={() => setMemberModalOpen(false)}
            onSave={handleSaveMember}
            member={editingMember}
            ministryId={selectedMinistry.id}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={deleteMemberDialog}
        title="Remove Member"
        message="Are you sure you want to remove this member from the ministry?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={handleDeleteMember}
        onCancel={() => { setDeleteMemberDialog(false); setMemberToDelete(null); }}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// Roster Tab
// ------------------------------------------------------------------
function RosterTab({
  ministry,
  onAddMember,
  onEditMember,
  onDeleteMember,
}: {
  ministry: Ministry;
  onAddMember: () => void;
  onEditMember: (m: MinistryMember) => void;
  onDeleteMember: (id: string) => void;
}) {
  const columns = useMemo(() => [
    { key: 'name', header: 'Name', sortable: true },
    { key: 'role', header: 'Role', sortable: true, render: (row: Record<string, unknown>) => (
      <span className={`cos-badge ${
        String(row.role).includes('Head') ? 'cos-badge-warning' :
        String(row.role).includes('Trainee') ? 'cos-badge-info' :
        'cos-badge-success'
      }`}>
        {String(row.role)}
      </span>
    )},
    { key: 'contact', header: 'Contact', sortable: true },
    { key: 'dateJoined', header: 'Date Joined', sortable: true },
    { key: 'status', header: 'Status', sortable: true, render: (row: Record<string, unknown>) => (
      <span className={`cos-badge ${
        row.status === 'Active' ? 'cos-badge-success' :
        row.status === 'On Leave' ? 'cos-badge-warning' :
        'cos-badge-default'
      }`}>
        {String(row.status)}
      </span>
    )},
  ], []);

  const memberData = ministry.members as unknown as Record<string, unknown>[];

  if (memberData.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={getLabel('ministries.empty.title', 'No ministry members yet')}
        description={getLabel('ministries.empty.description', 'Add Eucharistic ministers, altar servers, choir members, and more. Track attendance and assignments.')}
        tip={getLabel('ministries.empty.tip', 'Tap any ministry card above to start adding members.')}
        actionLabel="Add Member"
        actionIcon={Plus}
        onAction={onAddMember}
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={memberData}
      actionsColumn={(row: Record<string, unknown>) => (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEditMember(row as unknown as MinistryMember)}
            className="p-1.5 rounded-lg text-warm-gray hover:text-gold hover:bg-gold/10 transition-all"
            title="Edit"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDeleteMember(String(row.id))}
            className="p-1.5 rounded-lg text-warm-gray hover:text-error hover:bg-error/10 transition-all"
            title="Remove"
          >
            <UserX className="w-4 h-4" />
          </button>
        </div>
      )}
      emptyMessage="No members in this ministry yet."
    />
  );
}

// ------------------------------------------------------------------
// Schedule Tab
// ------------------------------------------------------------------
function ScheduleTab({
  ministry,
  onUpdate,
}: {
  ministry: Ministry;
  onUpdate: (assignments: ScheduleAssignment[]) => void;
}) {
  const [localAssignments, setLocalAssignments] = useState<ScheduleAssignment[]>(ministry.scheduleAssignments);

  const handleCellChange = useCallback((day: string, massTime: string, value: string) => {
    setLocalAssignments(prev => {
      const idx = prev.findIndex(a => a.day === day && a.massTime === massTime);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], memberName: value };
        return next;
      }
      return [...prev, { id: `sa-${Date.now()}`, day, massTime, memberName: value }];
    });
  }, []);

  const handleSave = useCallback(() => {
    onUpdate(localAssignments);
  }, [localAssignments, onUpdate]);

  const getCellValue = useCallback((day: string, massTime: string): string => {
    const found = localAssignments.find(a => a.day === day && a.massTime === massTime);
    return found?.memberName || '';
  }, [localAssignments]);

  const memberOptions = useMemo(() =>
    ministry.members.filter(m => m.status === 'Active' || m.status === 'On Leave').map(m => m.name)
  , [ministry.members]);

  return (
    <div className="cos-card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-parchment/40 dark:border-dm-border">
        <h3 className="heading-sm text-charcoal dark:text-dm-text">
          Mass Assignment Schedule
        </h3>
        <button onClick={handleSave} className="cos-btn cos-btn-primary text-sm">
          <Save className="w-4 h-4" />
          Save Schedule
        </button>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full">
          <thead>
            <tr>
              <th className="w-24">Day / Mass</th>
              {MASS_TIMES.map(mt => (
                <th key={mt} className="text-center">{mt}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map(day => (
              <tr key={day}>
                <td className="font-medium text-charcoal dark:text-dm-text">{day}</td>
                {MASS_TIMES.map(mt => (
                  <td key={mt}>
                    <select
                      value={getCellValue(day, mt)}
                      onChange={e => handleCellChange(day, mt, e.target.value)}
                      className="w-full h-9 px-2 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                    >
                      <option value="">—</option>
                      {memberOptions.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Attendance Tab
// ------------------------------------------------------------------
function AttendanceTab({
  ministry,
  onUpdate,
}: {
  ministry: Ministry;
  onUpdate: (attendance: AttendanceRecord[]) => void;
}) {
  const [attendance, setAttendance] = useState(ministry.attendance);

  const dates = useMemo(() => {
    if (attendance.length === 0) return [];
    return attendance[0].dates.map(d => d.date);
  }, [attendance]);

  const toggleAttendance = useCallback((memberId: string, dateIdx: number) => {
    setAttendance(prev => prev.map(rec => {
      if (rec.memberId !== memberId) return rec;
      const newDates = [...rec.dates];
      newDates[dateIdx] = { ...newDates[dateIdx], present: !newDates[dateIdx].present };
      return { ...rec, dates: newDates };
    }));
  }, []);

  const markAllPresent = useCallback((memberId: string) => {
    setAttendance(prev => prev.map(rec => {
      if (rec.memberId !== memberId) return rec;
      return { ...rec, dates: rec.dates.map(d => ({ ...d, present: true })) };
    }));
  }, []);

  const handleSave = useCallback(() => {
    onUpdate(attendance);
  }, [attendance, onUpdate]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
  };

  return (
    <div className="cos-card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-parchment/40 dark:border-dm-border">
        <h3 className="heading-sm text-charcoal dark:text-dm-text">
          Attendance Tracking — Last {dates.length} Dates
        </h3>
        <button onClick={handleSave} className="cos-btn cos-btn-primary text-sm">
          <Save className="w-4 h-4" />
          Save Attendance
        </button>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full">
          <thead>
            <tr>
              <th className="min-w-[160px]">Name</th>
              {dates.map((date, i) => (
                <th key={i} className="text-center min-w-[60px]">{formatDate(date)}</th>
              ))}
              <th className="text-center min-w-[80px]">Total</th>
              <th className="w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {attendance.map(rec => {
              const presentCount = rec.dates.filter(d => d.present).length;
              const percentage = Math.round((presentCount / rec.dates.length) * 100);
              return (
                <tr key={rec.memberId}>
                  <td className="font-medium text-charcoal dark:text-dm-text">{rec.memberName}</td>
                  {rec.dates.map((d, i) => (
                    <td key={i} className="text-center">
                      <button
                        onClick={() => toggleAttendance(rec.memberId, i)}
                        className={`w-6 h-6 rounded border-2 flex items-center justify-center mx-auto transition-all ${
                          d.present
                            ? 'bg-success border-success'
                            : 'border-parchment dark:border-dm-border hover:border-warm-gray'
                        }`}
                      >
                        {d.present && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    </td>
                  ))}
                  <td className="text-center">
                    <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                      percentage >= 80 ? 'text-success' :
                      percentage >= 60 ? 'text-warning' :
                      'text-error'
                    }`}>
                      {presentCount}/{rec.dates.length}
                      <span className="text-xs text-warm-gray">({percentage}%)</span>
                    </span>
                  </td>
                  <td>
                    <button
                      onClick={() => markAllPresent(rec.memberId)}
                      className="text-xs text-gold hover:text-gold-light font-medium transition-colors"
                    >
                      Mark All
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Member Modal (Add/Edit)
// ------------------------------------------------------------------
function MemberModal({
  onClose,
  onSave,
  member,
  ministryId,
}: {
  onClose: () => void;
  onSave: (m: MinistryMember) => void;
  member: MinistryMember | null;
  ministryId: string;
}) {
  const isAltar = ministryId === 'altar';
  const isChoir = ministryId === 'choir';

  const [name, setName] = useState(member?.name || '');
  const [role, setRole] = useState(member?.role || 'Member');
  const [contact, setContact] = useState(member?.contact || '');
  const [dateJoined, setDateJoined] = useState(member?.dateJoined || new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState<'Active' | 'Inactive' | 'On Leave' | 'Trainee'>(member?.status || 'Active');
  const [notes, setNotes] = useState(member?.notes || '');
  const [age, setAge] = useState(member?.age?.toString() || '');
  const [section, setSection] = useState(member?.section || '');
  const [ageError, setAgeError] = useState<string | null>(null);

  const AGE_MIN = 10;
  const AGE_MAX = 17;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Altar server age must be within the allowed range when provided.
    if (isAltar && age.trim() !== '') {
      const parsedAge = parseInt(age, 10);
      if (Number.isNaN(parsedAge) || parsedAge < AGE_MIN || parsedAge > AGE_MAX) {
        setAgeError(`Age must be between ${AGE_MIN} and ${AGE_MAX}.`);
        return;
      }
    }
    setAgeError(null);
    const newMember: MinistryMember = {
      id: member?.id || `${ministryId}-${Date.now()}`,
      name: name || 'New Member',
      role,
      contact,
      dateJoined,
      status,
      notes: notes || undefined,
      age: isAltar && age ? parseInt(age) : undefined,
      section: isChoir && section ? section : undefined,
    };
    onSave(newMember);
  };

  const isEditing = !!member;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-modal modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[480px] overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <h2 className="heading-md text-charcoal dark:text-dm-text">
            {isEditing ? 'Edit Member' : 'Add Member'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-all">
            <X className="w-5 h-5 text-warm-gray" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Juan dela Cruz"
              className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Role</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              >
                {isAltar && (
                  <>
                    <option>Head Server</option>
                    <option>Senior Server</option>
                    <option>Server</option>
                    <option>Trainee</option>
                  </>
                )}
                {isChoir && (
                  <>
                    <option>Choirmaster</option>
                    <option>Soprano Lead</option>
                    <option>Soprano</option>
                    <option>Alto Lead</option>
                    <option>Alto</option>
                    <option>Tenor Lead</option>
                    <option>Tenor</option>
                    <option>Bass</option>
                  </>
                )}
                {!isAltar && !isChoir && (
                  <>
                    <option>Head</option>
                    <option>Coordinator</option>
                    <option>Member</option>
                    <option>Trainee</option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Contact</label>
              <input
                type="text"
                value={contact}
                onChange={e => setContact(e.target.value)}
                placeholder="09XX XXX XXXX"
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Date Joined</label>
              <input
                type="date"
                value={dateJoined}
                onChange={e => setDateJoined(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as 'Active' | 'Inactive' | 'On Leave' | 'Trainee')}
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              >
                <option>Active</option>
                <option>Inactive</option>
                <option>On Leave</option>
                <option>Trainee</option>
              </select>
            </div>
          </div>

          {isAltar && (
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Age</label>
              <input
                type="number"
                value={age}
                onChange={e => { setAge(e.target.value); if (ageError) setAgeError(null); }}
                placeholder={`Age (${AGE_MIN}-${AGE_MAX})`}
                min={AGE_MIN}
                max={AGE_MAX}
                aria-invalid={!!ageError}
                className={`w-full h-10 px-3 rounded-lg border bg-white text-charcoal placeholder:text-warm-gray focus:outline-none dark:bg-dm-surface-raised dark:text-dm-text ${
                  ageError
                    ? 'border-error focus:border-error'
                    : 'border-parchment focus:border-gold dark:border-dm-border'
                }`}
              />
              {ageError && (
                <p className="mt-1 text-xs text-error">{ageError}</p>
              )}
            </div>
          )}

          {isChoir && (
            <div>
              <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Voice Section</label>
              <select
                value={section}
                onChange={e => setSection(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              >
                <option value="">None</option>
                <option>Soprano</option>
                <option>Alto</option>
                <option>Tenor</option>
                <option>Bass</option>
              </select>
            </div>
          )}

          <div>
            <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 rounded-lg border border-parchment bg-white text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-parchment dark:border-dm-border">
            <button
              type="button"
              onClick={onClose}
              className="cos-btn cos-btn-secondary text-sm px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cos-btn cos-btn-primary text-sm px-4 py-2"
            >
              <Save className="w-4 h-4" />
              {isEditing ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
