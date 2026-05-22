import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  GraduationCap,
  Stethoscope,
  Utensils,
  Briefcase,
  AlertCircle,
  Search,
  Plus,
  X,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Download,
  ChevronRight,
  User,
  DollarSign,
  Eye,
  Upload,
} from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import { getLabel } from '@/lib/friendlyLabels';
import DataTable from '@/components/DataTable';
import {
  programs,
  applications,
  beneficiaries,
  disbursements,
  getStatusBadgeClasses,
} from '@/lib/ssdmData';
import type {
  ProgramType,
  Application,
  Beneficiary,
  ReviewerVote,
} from '@/lib/ssdmData';

/* ─── Program Icons Map ─── */
const programIcons: Record<ProgramType, typeof GraduationCap> = {
  Scholarship: GraduationCap,
  Medical: Stethoscope,
  Feeding: Utensils,
  Livelihood: Briefcase,
  Emergency: AlertCircle,
};

/* ─── Reviewer Vote Badge ─── */
function VoteBadge({ vote }: { vote: ReviewerVote['vote'] }) {
  const classes: Record<string, string> = {
    Approve: 'cos-badge cos-badge-success',
    Reject: 'cos-badge cos-badge-error',
    Abstain: 'cos-badge cos-badge-warning',
    Pending: 'cos-badge cos-badge-default',
  };
  return <span className={classes[vote] || classes.Pending}>{vote}</span>;
}

/* ─── Main Component ─── */
export default function SsdmPage() {
  const [activeTab, setActiveTab] = useState<'Programs' | 'Applications' | 'Beneficiaries' | 'Disbursements'>('Programs');
  const [selectedProgram, setSelectedProgram] = useState<ProgramType | null>(null);
  const [detailTab, setDetailTab] = useState<'Applications' | 'Beneficiaries' | 'Disbursements'>('Applications');

  /* Filters */
  const [appStatusFilter, setAppStatusFilter] = useState<string>('All');
  const [appProgramFilter, setAppProgramFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  /* Modals */
  const [viewApplication, setViewApplication] = useState<Application | null>(null);
  const [viewBeneficiary, setViewBeneficiary] = useState<Beneficiary | null>(null);
  const [showNewApp, setShowNewApp] = useState(false);
  const [showNewDisbursement, setShowNewDisbursement] = useState(false);

  /* New application form state */
  const [newAppProgram, setNewAppProgram] = useState<ProgramType>('Scholarship');
  const [newAppName, setNewAppName] = useState('');
  const [newAppAddress, setNewAppAddress] = useState('');
  const [newAppContact, setNewAppContact] = useState('');
  const [newAppFamilySize, setNewAppFamilySize] = useState('');
  const [newAppIncome, setNewAppIncome] = useState('');
  const [newAppAmount, setNewAppAmount] = useState('');
  const [newAppNotes, setNewAppNotes] = useState('');
  /* Program-specific */
  const [newAppSchool, setNewAppSchool] = useState('');
  const [newAppGrade, setNewAppGrade] = useState('');
  const [newAppGPA, setNewAppGPA] = useState('');
  const [newAppCourse, setNewAppCourse] = useState('');
  const [newAppDiagnosis, setNewAppDiagnosis] = useState('');
  const [newAppHospital, setNewAppHospital] = useState('');
  const [newAppEstCost, setNewAppEstCost] = useState('');
  const [newAppBusiness, setNewAppBusiness] = useState('');
  const [newAppEmergency, setNewAppEmergency] = useState('');

  /* New disbursement form */
  const [newDisbBeneficiary, setNewDisbBeneficiary] = useState('');
  const [newDisbAmount, setNewDisbAmount] = useState('');
  const [newDisbType, setNewDisbType] = useState<'Cash' | 'Check' | 'Bank Transfer'>('Cash');
  const [newDisbNotes, setNewDisbNotes] = useState('');

  /* Filtered applications */
  const filteredApplications = useMemo(() => {
    return applications.filter((a) => {
      if (appStatusFilter !== 'All' && a.status !== appStatusFilter) return false;
      if (appProgramFilter !== 'All' && a.programType !== appProgramFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          a.applicantName.toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q) ||
          a.programType.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [appStatusFilter, appProgramFilter, searchQuery]);

  /* Filtered beneficiaries */
  const filteredBeneficiaries = useMemo(() => {
    if (!searchQuery) return beneficiaries;
    const q = searchQuery.toLowerCase();
    return beneficiaries.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.program.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  /* Filtered disbursements */
  const filteredDisbursements = useMemo(() => {
    if (!searchQuery) return disbursements;
    const q = searchQuery.toLowerCase();
    return disbursements.filter(
      (d) =>
        d.beneficiary.toLowerCase().includes(q) ||
        d.program.toLowerCase().includes(q) ||
        d.reference.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  /* Program-specific filtered data */
  const programApplications = useMemo(() => {
    if (!selectedProgram) return [];
    return applications.filter((a) => a.programType === selectedProgram);
  }, [selectedProgram]);

  const programBeneficiaries = useMemo(() => {
    if (!selectedProgram) return [];
    return beneficiaries.filter((b) => b.program === selectedProgram);
  }, [selectedProgram]);

  const programDisbursements = useMemo(() => {
    if (!selectedProgram) return [];
    return disbursements.filter((d) => d.program === selectedProgram);
  }, [selectedProgram]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  /* Application columns */
  const appColumns: any[] = [
    { key: 'id', header: 'ID', width: '80px' },
    { key: 'applicantName', header: 'Applicant Name' },
    { key: 'dateApplied', header: 'Date Applied', render: (r: Application) => formatDate(r.dateApplied) },
    { key: 'programType', header: 'Program' },
    {
      key: 'status',
      header: 'Status',
      render: (r: Application) => {
        const cls = getStatusBadgeClasses(r.status);
        return <span className={cls.badge}>{r.status}</span>;
      },
    },
    { key: 'assignedReviewer', header: 'Reviewer' },
    {
      key: 'amountRequested',
      header: 'Amount',
      render: (r: Application) => (r.amountRequested > 0 ? formatPeso(r.amountRequested) : 'N/A'),
    },
  ];

  /* Beneficiary columns */
  const benColumns: any[] = [
    { key: 'id', header: 'ID', width: '80px' },
    { key: 'name', header: 'Name' },
    { key: 'program', header: 'Program' },
    { key: 'dateApproved', header: 'Date Approved', render: (r: Beneficiary) => formatDate(r.dateApproved) },
    {
      key: 'amountAwarded',
      header: 'Amount Awarded',
      render: (r: Beneficiary) => (r.amountAwarded > 0 ? formatPeso(r.amountAwarded) : 'N/A'),
    },
    {
      key: 'disbursementStatus',
      header: 'Status',
      render: (r: Beneficiary) => {
        const map: Record<string, string> = {
          Ongoing: 'cos-badge cos-badge-success',
          Complete: 'cos-badge cos-badge-info',
          Pending: 'cos-badge cos-badge-warning',
        };
        return <span className={map[r.disbursementStatus] || 'cos-badge cos-badge-default'}>{r.disbursementStatus}</span>;
      },
    },
    {
      key: 'lastDisbursementDate',
      header: 'Last Disbursement',
      render: (r: Beneficiary) => (r.lastDisbursementDate ? formatDate(r.lastDisbursementDate) : '—'),
    },
  ];

  /* Disbursement columns */
  const disbColumns: any[] = [
    { key: 'date', header: 'Date', render: (r: { date: string }) => formatDate(r.date) },
    { key: 'beneficiary', header: 'Beneficiary' },
    { key: 'program', header: 'Program' },
    { key: 'amount', header: 'Amount', render: (r: { amount: number }) => formatPeso(r.amount) },
    { key: 'type', header: 'Type' },
    { key: 'reference', header: 'Reference #' },
    { key: 'approvedBy', header: 'Approved By' },
  ];

  const handleNewAppSubmit = () => {
    setShowNewApp(false);
    resetNewAppForm();
  };

  const resetNewAppForm = () => {
    setNewAppName('');
    setNewAppAddress('');
    setNewAppContact('');
    setNewAppFamilySize('');
    setNewAppIncome('');
    setNewAppAmount('');
    setNewAppNotes('');
    setNewAppSchool('');
    setNewAppGrade('');
    setNewAppGPA('');
    setNewAppCourse('');
    setNewAppDiagnosis('');
    setNewAppHospital('');
    setNewAppEstCost('');
    setNewAppBusiness('');
    setNewAppEmergency('');
  };

  const handleNewDisbSubmit = () => {
    setShowNewDisbursement(false);
    setNewDisbBeneficiary('');
    setNewDisbAmount('');
    setNewDisbType('Cash');
    setNewDisbNotes('');
  };

  return (
    <div className="space-y-6">
      {/* ─── Module Header ─── */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gold-glow flex items-center justify-center">
          <Heart className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="display-md font-playfair text-charcoal dark:text-dm-text">SSDM &amp; Assistance Programs</h1>
          <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-1">
            Social services and development ministry. Manage scholarships, medical aid, feeding programs, livelihood support, and emergency assistance.
          </p>
        </div>
      </div>

      {/* ─── Sub-Tab Bar ─── */}
      <div className="flex items-center gap-1 border-b border-parchment dark:border-dm-border">
        {(['Programs', 'Applications', 'Beneficiaries', 'Disbursements'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setSelectedProgram(null);
            }}
            className={
              'px-5 py-2.5 text-sm font-medium transition-all relative ' +
              (activeTab === tab
                ? 'text-gold'
                : 'text-warm-gray dark:text-dm-text-muted hover:text-charcoal dark:hover:text-dm-text')
            }
          >
            {tab}
            {activeTab === tab && (
              <motion.div
                layoutId="ssdm-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold"
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ─── TAB: Programs ─── */}
      {activeTab === 'Programs' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-6"
        >
          {/* Program Cards Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {programs.map((prog, i) => {
              const Icon = programIcons[prog.id];
              return (
                <motion.div
                  key={prog.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.08, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
                  className={`cos-card cos-card-hover p-5 border-t-4 ${prog.borderClass.replace('border-t-', 'border-t-')}`}
                  style={{ borderTopColor: prog.color }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: prog.color }}
                    >
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <h3 className="heading-sm text-charcoal dark:text-dm-text mb-1">{prog.name}</h3>
                  <p className="text-2xl font-bold text-charcoal dark:text-dm-text mb-1">
                    {prog.id === 'Feeding' ? '120' : prog.id === 'Scholarship' ? '24' : prog.id === 'Medical' ? '18' : prog.id === 'Livelihood' ? '8' : '3'}
                  </p>
                  <p className="body-sm text-warm-gray dark:text-dm-text-muted mb-3">
                    {prog.id === 'Feeding' ? 'beneficiaries' : prog.id === 'Scholarship' ? 'active scholars' : prog.id === 'Medical' ? 'pending applications' : prog.id === 'Livelihood' ? 'active grants' : 'active cases'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedProgram(prog.id);
                        setActiveTab('Programs');
                        setDetailTab('Applications');
                      }}
                      className="cos-btn cos-btn-secondary text-xs py-1.5 px-3"
                    >
                      View Details
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Selected Program Detail */}
          <AnimatePresence>
            {selectedProgram && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35 }}
                className="overflow-hidden"
              >
                <div className="cos-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="heading-lg text-charcoal dark:text-dm-text">
                      {programs.find((p) => p.id === selectedProgram)?.name} — Details
                    </h2>
                    <button
                      onClick={() => setSelectedProgram(null)}
                      className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors"
                    >
                      <X className="w-5 h-5 text-warm-gray" />
                    </button>
                  </div>

                  {/* Detail Tabs */}
                  <div className="flex items-center gap-1 border-b border-parchment dark:border-dm-border mb-4">
                    {(['Applications', 'Beneficiaries', 'Disbursements'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setDetailTab(tab)}
                        className={
                          'px-4 py-2 text-sm font-medium transition-all relative ' +
                          (detailTab === tab
                            ? 'text-gold'
                            : 'text-warm-gray dark:text-dm-text-muted hover:text-charcoal dark:hover:text-dm-text')
                        }
                      >
                        {tab}
                        {detailTab === tab && (
                          <motion.div
                            layoutId="detail-tab"
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold"
                            transition={{ duration: 0.2 }}
                          />
                        )}
                      </button>
                    ))}
                  </div>

                  {detailTab === 'Applications' && (
                    <DataTable
                      columns={appColumns}
                      data={programApplications as unknown as Record<string, unknown>[]}
                      onRowClick={(row) => setViewApplication(row as unknown as Application)}
                      pageSize={8}
                    />
                  )}
                  {detailTab === 'Beneficiaries' && (
                    <DataTable
                      columns={benColumns}
                      data={programBeneficiaries as unknown as Record<string, unknown>[]}
                      onRowClick={(row) => setViewBeneficiary(row as unknown as Beneficiary)}
                      pageSize={8}
                    />
                  )}
                  {detailTab === 'Disbursements' && (
                    <DataTable
                      columns={disbColumns}
                      data={programDisbursements as unknown as Record<string, unknown>[]}
                      pageSize={8}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ─── TAB: Applications ─── */}
      {activeTab === 'Applications' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-4"
        >
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={appStatusFilter}
              onChange={(e) => setAppStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal dark:bg-dm-surface dark:border-dm-border dark:text-dm-text focus:outline-none focus:border-gold"
            >
              <option value="All">All Statuses</option>
              <option value="Pending Review">Pending Review</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="On Hold">On Hold</option>
            </select>
            <select
              value={appProgramFilter}
              onChange={(e) => setAppProgramFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal dark:bg-dm-surface dark:border-dm-border dark:text-dm-text focus:outline-none focus:border-gold"
            >
              <option value="All">All Programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
              <input
                type="text"
                placeholder="Search applications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full pl-9 pr-3 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
              />
            </div>
            <button
              onClick={() => setShowNewApp(true)}
              className="cos-btn cos-btn-primary text-sm py-2 px-4 ml-auto"
            >
              <Plus className="w-4 h-4" />
              New Application
            </button>
          </div>

          {filteredApplications.length === 0 ? (
            <EmptyState
              icon={Heart}
              title={getLabel('ssdm.empty.title', 'No assistance applications yet')}
              description={getLabel('ssdm.empty.description', 'Record scholarship, medical, feeding, and livelihood program applications here.')}
              tip={getLabel('ssdm.empty.tip', 'Applications go through a review process before approval.')}
              actionLabel="New Application"
              actionIcon={Plus}
              onAction={() => setShowNewApp(true)}
            />
          ) : (
            <DataTable
              columns={appColumns}
              data={filteredApplications as unknown as Record<string, unknown>[]}
              onRowClick={(row) => setViewApplication(row as unknown as Application)}
              pageSize={10}
            />
          )}
        </motion.div>
      )}

      {/* ─── TAB: Beneficiaries ─── */}
      {activeTab === 'Beneficiaries' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
              <input
                type="text"
                placeholder="Search beneficiaries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full pl-9 pr-3 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
              />
            </div>
          </div>

          {filteredBeneficiaries.length === 0 ? (
            <EmptyState
              icon={Heart}
              title="No beneficiaries yet"
              description="Once applications are approved, beneficiaries will appear here."
              tip="Check the Applications tab to review pending applications."
            />
          ) : (
            <DataTable
              columns={benColumns}
              data={filteredBeneficiaries as unknown as Record<string, unknown>[]}
              onRowClick={(row) => setViewBeneficiary(row as unknown as Beneficiary)}
              pageSize={10}
            />
          )}
        </motion.div>
      )}

      {/* ─── TAB: Disbursements ─── */}
      {activeTab === 'Disbursements' && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
              <input
                type="text"
                placeholder="Search disbursements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-full pl-9 pr-3 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
              />
            </div>
            <button
              onClick={() => setShowNewDisbursement(true)}
              className="cos-btn cos-btn-primary text-sm py-2 px-4 ml-auto"
            >
              <Plus className="w-4 h-4" />
              New Disbursement
            </button>
          </div>

          {/* Monthly Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="cos-card p-4 text-center">
              <p className="label text-warm-gray dark:text-dm-text-muted mb-1">Total Disbursed (Jan)</p>
              <p className="text-xl font-bold text-charcoal dark:text-dm-text">{formatPeso(36500)}</p>
            </div>
            <div className="cos-card p-4 text-center">
              <p className="label text-warm-gray dark:text-dm-text-muted mb-1">Total Disbursed (Feb)</p>
              <p className="text-xl font-bold text-charcoal dark:text-dm-text">{formatPeso(32900)}</p>
            </div>
            <div className="cos-card p-4 text-center">
              <p className="label text-warm-gray dark:text-dm-text-muted mb-1">Total Disbursed (Mar-May)</p>
              <p className="text-xl font-bold text-charcoal dark:text-dm-text">{formatPeso(43550)}</p>
            </div>
          </div>

          {filteredDisbursements.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No disbursements yet"
              description="When beneficiaries receive aid, disbursements will be recorded here."
              tip="Approved applications will be processed for disbursement."
              actionLabel="New Disbursement"
              actionIcon={Plus}
              onAction={() => setShowNewDisbursement(true)}
            />
          ) : (
            <DataTable
              columns={disbColumns}
              data={filteredDisbursements as unknown as Record<string, unknown>[]}
              pageSize={10}
            />
          )}
        </motion.div>
      )}

      {/* ═══════════════════════════════════════════════
          MODAL: View Application
      ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {viewApplication && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal flex items-center justify-center p-4 modal-overlay"
            onClick={() => setViewApplication(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-3xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <div>
                  <h3 className="heading-lg text-charcoal dark:text-dm-text">Application {viewApplication.id}</h3>
                  <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-0.5">
                    {viewApplication.programType} — Applied {formatDate(viewApplication.dateApplied)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusBadgeClasses(viewApplication.status).badge && (
                    <span className={getStatusBadgeClasses(viewApplication.status).badge}>
                      {viewApplication.status}
                    </span>
                  )}
                  <button
                    onClick={() => setViewApplication(null)}
                    className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors"
                  >
                    <X className="w-5 h-5 text-warm-gray" />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 space-y-6">
                {/* Applicant Info */}
                <div>
                  <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3 flex items-center gap-2">
                    <User className="w-4 h-4 text-gold" />
                    Applicant Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <InfoField label="Full Name" value={viewApplication.applicantName} />
                    <InfoField label="Age" value={`${viewApplication.age} years old`} />
                    <InfoField label="Address" value={viewApplication.address} colSpan={2} />
                    <InfoField label="Contact" value={viewApplication.contact} />
                    <InfoField label="Family Size" value={`${viewApplication.familySize} members`} />
                    <InfoField label="Monthly Income" value={formatPeso(viewApplication.monthlyIncome)} />
                    <InfoField label="Amount Requested" value={viewApplication.amountRequested > 0 ? formatPeso(viewApplication.amountRequested) : 'N/A'} />
                  </div>
                </div>

                {/* Program-Specific Details */}
                {viewApplication.programType === 'Scholarship' && viewApplication.school && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3 flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-gold" />
                      Scholarship Details
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <InfoField label="School" value={viewApplication.school} />
                      <InfoField label="Grade Level" value={viewApplication.gradeLevel || '—'} />
                      <InfoField label="GPA" value={viewApplication.gpa || '—'} />
                      <InfoField label="Course/Strand" value={viewApplication.course || '—'} />
                    </div>
                  </div>
                )}
                {viewApplication.programType === 'Medical' && viewApplication.diagnosis && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3 flex items-center gap-2">
                      <Stethoscope className="w-4 h-4 text-gold" />
                      Medical Details
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <InfoField label="Diagnosis" value={viewApplication.diagnosis} />
                      <InfoField label="Estimated Cost" value={formatPeso(viewApplication.estimatedCost || 0)} />
                      <InfoField label="Hospital" value={viewApplication.hospital || '—'} />
                      <InfoField label="Doctor" value={viewApplication.doctorName || '—'} />
                    </div>
                  </div>
                )}
                {viewApplication.programType === 'Livelihood' && viewApplication.businessProposal && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-gold" />
                      Livelihood Proposal
                    </h4>
                    <div className="cos-card p-4 bg-cream dark:bg-dm-surface-raised">
                      <p className="body-md text-charcoal dark:text-dm-text">{viewApplication.businessProposal}</p>
                    </div>
                  </div>
                )}
                {viewApplication.programType === 'Emergency' && viewApplication.emergencyType && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-gold" />
                      Emergency Details
                    </h4>
                    <InfoField label="Emergency Type" value={viewApplication.emergencyType} />
                  </div>
                )}

                {/* Documents */}
                <div>
                  <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-gold" />
                    Supporting Documents
                  </h4>
                  <div className="space-y-2">
                    {viewApplication.documents.map((doc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-3 rounded-lg border border-parchment dark:border-dm-border hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-gold" />
                          <span className="body-sm text-charcoal dark:text-dm-text">{doc.name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-warm-gray dark:text-dm-text-muted">{doc.size}</span>
                          <Eye className="w-4 h-4 text-warm-gray hover:text-gold transition-colors" />
                          <Download className="w-4 h-4 text-warm-gray hover:text-gold transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                {viewApplication.notes && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-2">Notes</h4>
                    <p className="body-md text-charcoal dark:text-dm-text">{viewApplication.notes}</p>
                  </div>
                )}

                {/* Review Workflow */}
                <div>
                  <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-gold" />
                    Committee Review
                  </h4>
                  <div className="space-y-3">
                    {viewApplication.reviewers.map((reviewer, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg border border-parchment dark:border-dm-border"
                      >
                        <div className="w-9 h-9 rounded-full bg-deep-navy flex items-center justify-center text-white text-xs font-semibold shrink-0">
                          {reviewer.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="body-sm font-medium text-charcoal dark:text-dm-text">{reviewer.name}</span>
                            <VoteBadge vote={reviewer.vote} />
                          </div>
                          {reviewer.comment && (
                            <p className="body-sm text-warm-gray dark:text-dm-text-muted">{reviewer.comment}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Overall Status */}
                  <div className="mt-3 p-3 rounded-lg bg-cream-dark dark:bg-dm-surface-raised">
                    <div className="flex items-center gap-2">
                      <span className="body-sm text-warm-gray dark:text-dm-text-muted">Overall Status:</span>
                      <span className="body-sm font-medium text-charcoal dark:text-dm-text">
                        {viewApplication.overallStatus}
                      </span>
                      {viewApplication.status === 'Approved' && (
                        <CheckCircle className="w-4 h-4 text-success" />
                      )}
                      {viewApplication.status === 'Rejected' && (
                        <XCircle className="w-4 h-4 text-error" />
                      )}
                      {(viewApplication.status === 'Pending Review' || viewApplication.status === 'On Hold') && (
                        <Clock className="w-4 h-4 text-warning" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Disbursement Schedule (if approved) */}
                {viewApplication.status === 'Approved' && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-gold" />
                      Disbursement Schedule
                    </h4>
                    <div className="cos-card p-4 bg-cream dark:bg-dm-surface-raised">
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="label text-warm-gray dark:text-dm-text-muted">Amount Approved</p>
                          <p className="heading-md text-success">{formatPeso(viewApplication.amountRequested)}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-warm-gray" />
                        <div className="text-center">
                          <p className="label text-warm-gray dark:text-dm-text-muted">Released</p>
                          <p className="heading-md text-gold">{formatPeso(viewApplication.amountRequested * 0.6)}</p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-warm-gray" />
                        <div className="text-center">
                          <p className="label text-warm-gray dark:text-dm-text-muted">Remaining</p>
                          <p className="heading-md text-charcoal dark:text-dm-text">{formatPeso(viewApplication.amountRequested * 0.4)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
                {viewApplication.status === 'Pending Review' && (
                  <>
                    <button className="cos-btn cos-btn-secondary text-sm py-2 px-4">
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                    <button className="cos-btn cos-btn-primary text-sm py-2 px-4">
                      <CheckCircle className="w-4 h-4" />
                      Approve
                    </button>
                  </>
                )}
                <button
                  onClick={() => setViewApplication(null)}
                  className="cos-btn cos-btn-secondary text-sm py-2 px-4"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════
          MODAL: View Beneficiary
      ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {viewBeneficiary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal flex items-center justify-center p-4 modal-overlay"
            onClick={() => setViewBeneficiary(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <h3 className="heading-lg text-charcoal dark:text-dm-text">{viewBeneficiary.name}</h3>
                <button
                  onClick={() => setViewBeneficiary(null)}
                  className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors"
                >
                  <X className="w-5 h-5 text-warm-gray" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <InfoField label="Program" value={viewBeneficiary.program} />
                  <InfoField label="Date Approved" value={formatDate(viewBeneficiary.dateApproved)} />
                  <InfoField label="Amount Awarded" value={viewBeneficiary.amountAwarded > 0 ? formatPeso(viewBeneficiary.amountAwarded) : 'N/A'} />
                  <InfoField label="Total Disbursed" value={formatPeso(viewBeneficiary.totalDisbursed)} />
                  <InfoField label="Status" value={viewBeneficiary.disbursementStatus} />
                  <InfoField label="Last Disbursement" value={viewBeneficiary.lastDisbursementDate ? formatDate(viewBeneficiary.lastDisbursementDate) : '—'} />
                  <InfoField label="Address" value={viewBeneficiary.address} colSpan={2} />
                  <InfoField label="Contact" value={viewBeneficiary.contact} />
                </div>

                {viewBeneficiary.history.length > 0 && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Disbursement History</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {viewBeneficiary.history.map((h, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-parchment dark:border-dm-border">
                          <div>
                            <p className="body-sm font-medium text-charcoal dark:text-dm-text">{formatDate(h.date)}</p>
                            <p className="text-xs text-warm-gray dark:text-dm-text-muted">{h.type} — Ref: {h.reference}</p>
                          </div>
                          <p className="body-sm font-medium text-charcoal dark:text-dm-text">{formatPeso(h.amount)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
                <button
                  onClick={() => setViewBeneficiary(null)}
                  className="cos-btn cos-btn-secondary text-sm py-2 px-4"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════
          MODAL: New Application
      ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {showNewApp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal flex items-center justify-center p-4 modal-overlay"
            onClick={() => setShowNewApp(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-2xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <h3 className="heading-lg text-charcoal dark:text-dm-text">New Application</h3>
                <button
                  onClick={() => setShowNewApp(false)}
                  className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors"
                >
                  <X className="w-5 h-5 text-warm-gray" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-5">
                {/* Program Selector */}
                <div>
                  <label className="label text-warm-gray dark:text-dm-text-muted mb-2 block">Select Program</label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {programs.map((prog) => {
                      const Icon = programIcons[prog.id];
                      return (
                        <button
                          key={prog.id}
                          onClick={() => setNewAppProgram(prog.id)}
                          className={
                            'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all ' +
                            (newAppProgram === prog.id
                              ? 'border-gold bg-gold-glow scale-[1.02]'
                              : 'border-parchment dark:border-dm-border hover:bg-cream-dark dark:hover:bg-dm-surface-raised')
                          }
                        >
                          <Icon className="w-5 h-5" style={{ color: prog.color }} />
                          <span className="text-xs text-center text-charcoal dark:text-dm-text">{prog.id}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Applicant Info */}
                <div>
                  <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Applicant Information</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <FormInput label="Full Name" value={newAppName} onChange={setNewAppName} placeholder="Enter full name" />
                    <FormInput label="Address" value={newAppAddress} onChange={setNewAppAddress} placeholder="Barangay, City" />
                    <FormInput label="Contact Number" value={newAppContact} onChange={setNewAppContact} placeholder="09XX XXX XXXX" />
                    <FormInput label="Family Size" value={newAppFamilySize} onChange={setNewAppFamilySize} placeholder="Number of members" />
                    <FormInput label="Monthly Income" value={newAppIncome} onChange={setNewAppIncome} placeholder="₱0.00" />
                    <FormInput label="Amount Requested" value={newAppAmount} onChange={setNewAppAmount} placeholder="₱0.00" />
                  </div>
                </div>

                {/* Program-Specific Fields */}
                {newAppProgram === 'Scholarship' && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Scholarship Details</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput label="School Name" value={newAppSchool} onChange={setNewAppSchool} placeholder="School name" />
                      <FormInput label="Grade Level" value={newAppGrade} onChange={setNewAppGrade} placeholder="e.g. Grade 11" />
                      <FormInput label="GPA / Average" value={newAppGPA} onChange={setNewAppGPA} placeholder="e.g. 90%" />
                      <FormInput label="Course / Strand" value={newAppCourse} onChange={setNewAppCourse} placeholder="e.g. STEM" />
                    </div>
                  </div>
                )}
                {newAppProgram === 'Medical' && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Medical Details</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <FormInput label="Diagnosis" value={newAppDiagnosis} onChange={setNewAppDiagnosis} placeholder="Medical condition" />
                      <FormInput label="Hospital / Clinic" value={newAppHospital} onChange={setNewAppHospital} placeholder="Hospital name" />
                      <FormInput label="Estimated Cost" value={newAppEstCost} onChange={setNewAppEstCost} placeholder="₱0.00" colSpan={2} />
                    </div>
                  </div>
                )}
                {newAppProgram === 'Livelihood' && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Business Proposal</h4>
                    <textarea
                      value={newAppBusiness}
                      onChange={(e) => setNewAppBusiness(e.target.value)}
                      placeholder="Describe your business proposal..."
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text resize-none"
                    />
                  </div>
                )}
                {newAppProgram === 'Emergency' && (
                  <div>
                    <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Emergency Details</h4>
                    <FormInput label="Emergency Type" value={newAppEmergency} onChange={setNewAppEmergency} placeholder="e.g. Fire, Calamity" />
                  </div>
                )}

                {/* Documents Upload */}
                <div>
                  <label className="label text-warm-gray dark:text-dm-text-muted mb-2 block">Supporting Documents</label>
                  <div className="border-2 border-dashed border-parchment dark:border-dm-border rounded-lg p-6 text-center hover:border-gold transition-colors cursor-pointer">
                    <Upload className="w-6 h-6 text-warm-gray mx-auto mb-2" />
                    <p className="body-sm text-warm-gray dark:text-dm-text-muted">
                      Click to upload or drag and drop files here
                    </p>
                    <p className="text-xs text-warm-gray dark:text-dm-text-muted mt-1">PDF, JPG, PNG up to 10MB each</p>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="label text-warm-gray dark:text-dm-text-muted mb-2 block">Additional Notes</label>
                  <textarea
                    value={newAppNotes}
                    onChange={(e) => setNewAppNotes(e.target.value)}
                    placeholder="Any additional information or committee remarks..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text resize-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
                <button
                  onClick={() => setShowNewApp(false)}
                  className="cos-btn cos-btn-secondary text-sm py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNewAppSubmit}
                  className="cos-btn cos-btn-primary text-sm py-2 px-4"
                >
                  Submit Application
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════
          MODAL: New Disbursement
      ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {showNewDisbursement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal flex items-center justify-center p-4 modal-overlay"
            onClick={() => setShowNewDisbursement(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <h3 className="heading-lg text-charcoal dark:text-dm-text">New Disbursement</h3>
                <button
                  onClick={() => setShowNewDisbursement(false)}
                  className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors"
                >
                  <X className="w-5 h-5 text-warm-gray" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <FormInput label="Beneficiary Name" value={newDisbBeneficiary} onChange={setNewDisbBeneficiary} placeholder="Search beneficiary..." />
                <FormInput label="Amount" value={newDisbAmount} onChange={setNewDisbAmount} placeholder="₱0.00" />
                <div>
                  <label className="label text-warm-gray dark:text-dm-text-muted mb-2 block">Disbursement Type</label>
                  <div className="flex gap-2">
                    {(['Cash', 'Check', 'Bank Transfer'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setNewDisbType(type)}
                        className={
                          'flex-1 py-2 px-3 rounded-lg border text-sm transition-all ' +
                          (newDisbType === type
                            ? 'border-gold bg-gold-glow text-gold'
                            : 'border-parchment dark:border-dm-border text-charcoal dark:text-dm-text hover:bg-cream-dark dark:hover:bg-dm-surface-raised')
                        }
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label text-warm-gray dark:text-dm-text-muted mb-2 block">Notes</label>
                  <textarea
                    value={newDisbNotes}
                    onChange={(e) => setNewDisbNotes(e.target.value)}
                    placeholder="Any notes about this disbursement..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text resize-none"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
                <button
                  onClick={() => setShowNewDisbursement(false)}
                  className="cos-btn cos-btn-secondary text-sm py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  onClick={handleNewDisbSubmit}
                  className="cos-btn cos-btn-primary text-sm py-2 px-4"
                >
                  Record Disbursement
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Helpers ─── */
function formatDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPeso(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function InfoField({ label, value, colSpan }: { label: string; value: string | number; colSpan?: number }) {
  return (
    <div className={colSpan ? 'col-span-2' : ''}>
      <p className="label text-warm-gray dark:text-dm-text-muted mb-0.5">{label}</p>
      <p className="body-sm text-charcoal dark:text-dm-text font-medium">{value}</p>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  colSpan,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  colSpan?: number;
}) {
  return (
    <div className={colSpan ? 'col-span-2' : ''}>
      <label className="label text-warm-gray dark:text-dm-text-muted mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
      />
    </div>
  );
}
