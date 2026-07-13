import { useState, useMemo, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, ChevronRight, ChevronDown, Plus, X, Upload,
  CheckCircle2, AlertCircle, FileText, Download, Eye,
  TrendingUp, Calendar, Clock, User, Search,
  Check, Trash2, Edit3, BookOpen,
  Users, Printer, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import StatCard from '@/components/StatCard';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import EmptyState from '@/components/EmptyState';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import DataTable, { type Column } from '@/components/DataTable';
import { getLabel } from '@/lib/friendlyLabels';
import {
  journalEntries, collectionsData, budgetData,
  getLeafAccounts, formatPeso, formatPesoWhole,
  getAmountApprovalLevel, canApproveLevel,
} from '@/lib/financeData';
import type { Account, JournalEntry, JournalLine, Collection, BudgetItem, ApprovalItem, ApprovalHistoryStep } from '@/lib/financeData';
import { deriveAccountBalances, deriveIncomeStatement, deriveBudgetActuals } from '@/lib/ledger';
import { usePersistedState } from '@/hooks/usePersistedState';
import { KEYS } from '@/lib/storageKeys';
import { getJSON, setJSON } from '@/lib/storageNamespaced';
import { getCurrentUserName, getCurrentUserRole } from '@/lib/session';
import { todayISO } from '@/lib/massIntentions';
import type { AuditLogEntry } from '@/lib/settingsData';
import {
  getDonors, addDonor, getCampaigns, addCampaign, getPledges, addPledge,
  getContributions, recordContribution, donorPledgeProgress, summarizeCampaigns,
  buildDonorStatement, recordFeeWaiver, getFeeOverrideChain, verifyFeeOverrideChain, serverVerifyFeeOverrideChain,
  isSelfApprovedWaiver, flagSelfApprovals, SELF_APPROVAL_FLAG_THRESHOLD,
} from '@/lib/donors';
import type { Donor, Campaign, Pledge, Contribution, ContributionMethod, PledgeFrequency, FeeOverrideChainEntry } from '@/lib/donors';
import { fromCentavos } from '@/lib/ledger';
import { getParishConfig } from '@/lib/parishConfig';
import { buildParishionerLookupFrom, families as seedFamilies, type Family, type ParishionerLookup } from '@/lib/directoryData';
import { liveOnly } from '@/lib/registryData';

// ============================================
// Types
// ============================================
type TabId = 'coa' | 'journal' | 'collections' | 'donors' | 'waivers' | 'budget' | 'analytics' | 'approvals';

interface ExpandedState { [key: string]: boolean }

// ============================================
// CSV export helper — builds and downloads a real .csv file client-side.
// ============================================
function escapeCsv(value: string | number): string {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers, ...rows].map((r) => r.map(escapeCsv).join(','));
  const csv = lines.join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================
// Audit trail — append finance actions to the persisted 'audit_log' store
// (the key parishIdentity migrates) through the storage seam.
// ============================================
function appendFinanceAudit(action: string, recordId: string, details: string): void {
  const log = getJSON<AuditLogEntry[]>('audit_log', []);
  const entry: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    user: getCurrentUserName(),
    action,
    table: 'Finance',
    recordId,
    details,
    ipAddress: 'local',
  };
  setJSON('audit_log', [entry, ...log]);
}

// ============================================
// Approve/Reject a Pending journal entry — THE single decision path shared by
// the Journal tab and the Approvals tab. Transitions the status, appends to
// the entry's approval history, and records the decision in the audit log.
// Returns true when a decision was actually recorded.
// ============================================
function decideJournalEntry(
  entries: JournalEntry[],
  setEntries: Dispatch<SetStateAction<JournalEntry[]>>,
  role: string,
  id: string,
  decision: 'Approved' | 'Rejected',
  comment?: string,
): boolean {
  const target = entries.find((e) => e.id === id);
  if (!target || target.status !== 'Pending') return false;
  if (!canApproveLevel(role, target.requiredApproval)) {
    toast.error('Your role cannot approve this entry');
    return false;
  }
  const step: ApprovalHistoryStep = {
    action: decision,
    by: getCurrentUserName(),
    date: new Date().toISOString().slice(0, 16).replace('T', ' '),
    comment: comment?.trim() || undefined,
  };
  setEntries((prev) => prev.map((e) => e.id === id
    ? { ...e, status: decision === 'Approved' ? 'Posted' : 'Rejected', approvalHistory: [...(e.approvalHistory ?? []), step] }
    : e));
  appendFinanceAudit(decision, id,
    `${decision} journal entry ${formatPeso(target.totalDr)} (${target.requiredApproval})${step.comment ? ` — "${step.comment}"` : ''}`);
  if (decision === 'Approved') toast.success('Entry approved and posted to ledger');
  else toast.error('Entry rejected');
  return true;
}

// ============================================
// FinancePage — Main Component
// ============================================
const VALID_TABS: TabId[] = ['coa', 'journal', 'collections', 'donors', 'waivers', 'budget', 'analytics', 'approvals'];

export default function FinancePage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>('coa');
  // Single source of truth for every tab AND the KPI cards — lifted here so a
  // post in one tab immediately updates all derived views on this page.
  const [entries, setEntries] = usePersistedState<JournalEntry[]>(KEYS.journalEntries, journalEntries);
  const [collections, setCollections] = usePersistedState<Collection[]>(KEYS.collections, collectionsData);

  // Honor an inbound ?tab=<name> (e.g. ?tab=collections) on mount / when it changes.
  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested && (VALID_TABS as string[]).includes(requested)) {
      setActiveTab(requested as TabId);
    }
  }, [searchParams]);

  // KPI Card data — derived live from the ledger, never hardcoded.
  const kpi = useMemo(() => {
    const accounts = deriveAccountBalances(entries, collections);
    const leafBalance = (code: string): number => {
      let found = 0;
      const walk = (accs: Account[]) => {
        for (const a of accs) {
          if (a.children && a.children.length > 0) walk(a.children);
          else if (a.code === code) found = a.balance;
        }
      };
      walk(accounts);
      return found;
    };
    const income = deriveIncomeStatement(entries, collections);
    const pending = entries.filter((e) => e.status === 'Pending');
    return {
      totalAssets: accounts.find((a) => a.type === 'ASSET')?.balance ?? 0,
      cash: leafBalance('1000') + leafBalance('1010'),
      totalIncome: income.totalRevenue,
      pendingCount: pending.length,
      pendingTotal: pending.reduce((s, e) => s + e.totalDr, 0),
    };
  }, [entries, collections]);

  const kpiCards = [
    { title: 'Total Assets', value: formatPesoWhole(kpi.totalAssets), icon: DollarSign, onClick: () => setActiveTab('coa') },
    { title: 'Cash & Bank', value: formatPesoWhole(kpi.cash), icon: DollarSign, onClick: () => setActiveTab('collections') },
    { title: 'Total Income', value: formatPesoWhole(kpi.totalIncome), icon: TrendingUp, onClick: () => setActiveTab('budget') },
    {
      title: 'Pending Approvals', value: String(kpi.pendingCount), icon: AlertCircle,
      trend: { value: kpi.pendingCount > 0 ? `${formatPesoWhole(kpi.pendingTotal)} awaiting approval` : 'Approval queue clear', direction: 'neutral' as const, isAlert: kpi.pendingCount > 0 },
      onClick: () => setActiveTab('journal'),
    },
  ];

  const tabs: { id: TabId; label: string }[] = [
    { id: 'coa', label: 'Chart of Accounts' },
    { id: 'journal', label: 'Journal' },
    { id: 'collections', label: 'Collections' },
    { id: 'donors', label: 'Donors' },
    { id: 'waivers', label: 'Waivers' },
    { id: 'budget', label: 'Budget' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'approvals', label: 'Approvals' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gold-glow flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="display-md font-playfair text-charcoal dark:text-dm-text">Financial Management</h1>
          <p className="body-sm text-warm-gray dark:text-dm-text-muted">
            Double-entry bookkeeping, Sunday collections, budget management, and approval workflows.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => (
          <StatCard key={card.title} {...card} delay={i * 0.06} />
        ))}
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap gap-2 pb-2 border-b border-parchment dark:border-dm-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={
              'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ' +
              (activeTab === tab.id
                ? 'bg-gold text-white shadow-md'
                : 'bg-cream-dark text-warm-gray hover:bg-parchment dark:bg-dm-surface-raised dark:text-dm-text-muted dark:hover:bg-dm-border')
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content — no mode="wait"/exit: under React 19 + framer-motion 12 the
          exit hangs, so the outgoing tab never unmounts and the incoming tab never
          shows (tab switch appears dead). Keyed enter-only animation instead. */}
      <AnimatePresence>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
        >
          {activeTab === 'coa' && <ChartOfAccountsTab entries={entries} collections={collections} />}
          {activeTab === 'journal' && <JournalTab entries={entries} setEntries={setEntries} />}
          {activeTab === 'collections' && <CollectionsTab collections={collections} setCollections={setCollections} />}
          {activeTab === 'donors' && <DonorsTab entries={entries} setEntries={setEntries} />}
          {activeTab === 'waivers' && <WaiversTab />}
          {activeTab === 'budget' && <BudgetTab entries={entries} collections={collections} />}
          {activeTab === 'analytics' && <AnalyticsDashboard />}
          {activeTab === 'approvals' && <ApprovalsTab entries={entries} setEntries={setEntries} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Tab 1 — Chart of Accounts (Tree View)
// ============================================
function ChartOfAccountsTab({ entries, collections }: { entries: JournalEntry[]; collections: Collection[] }) {
  const [expanded, setExpanded] = useState<ExpandedState>({
    '1000': true, '1100': true, '1200': false,
    '2000': false, '3000': false, '4000': false, '5000': false,
  });
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Static chart balances are opening balances; show current = opening + postings.
  const derivedChart = useMemo(() => deriveAccountBalances(entries, collections), [entries, collections]);

  const toggle = (code: string) => setExpanded((prev) => ({ ...prev, [code]: !prev[code] }));

  const expandAll = () => {
    const all: ExpandedState = {};
    function mark(accs: Account[]) {
      for (const a of accs) {
        if (a.children) { all[a.code] = true; mark(a.children); }
      }
    }
    mark(derivedChart);
    setExpanded(all);
  };

  const collapseAll = () => setExpanded({});

  // Filter accounts by search
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return derivedChart;
    const q = searchQuery.toLowerCase();
    function filter(accs: Account[]): Account[] {
      return accs.map((a) => {
        const match = a.name.toLowerCase().includes(q) || a.code.includes(q);
        const filteredChildren = a.children ? filter(a.children) : undefined;
        const hasChildMatch = filteredChildren && filteredChildren.length > 0;
        if (match || hasChildMatch) {
          return { ...a, children: filteredChildren };
        }
        return null;
      }).filter(Boolean) as Account[];
    }
    return filter(derivedChart);
  }, [searchQuery, derivedChart]);

  // Show all expanded when searching
  if (searchQuery.trim()) {
    // Auto-expand all during search
    const allExpanded: ExpandedState = {};
    function markAll(accs: Account[]) {
      for (const a of accs) {
        if (a.children) { allExpanded[a.code] = true; markAll(a.children); }
      }
    }
    markAll(filteredAccounts);
    // Merge with current but keep search-expanded
    for (const k of Object.keys(allExpanded)) {
      if (!(k in expanded)) expanded[k] = true;
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Tree View */}
      <div className="lg:col-span-2 cos-card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-parchment/40">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
              <input
                type="text" placeholder="Search accounts..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-48 pl-9 pr-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={expandAll} className="text-xs px-3 py-1.5 rounded-lg bg-cream-dark text-warm-gray hover:bg-parchment transition-all dark:bg-dm-surface-raised dark:text-dm-text-muted">Expand All</button>
            <button onClick={collapseAll} className="text-xs px-3 py-1.5 rounded-lg bg-cream-dark text-warm-gray hover:bg-parchment transition-all dark:bg-dm-surface-raised dark:text-dm-text-muted">Collapse All</button>
          </div>
        </div>
        <div className="p-4">
          {filteredAccounts.map((acc) => (
            <AccountTreeNode
              key={acc.code} account={acc} depth={0} expanded={expanded}
              onToggle={toggle} onSelect={setSelectedAccount}
            />
          ))}
          {filteredAccounts.length === 0 && (
            <div className="py-12 text-center">
              <Search className="w-10 h-10 text-warm-gray/30 mx-auto mb-3" />
              <p className="body-md text-warm-gray">No accounts found</p>
              <p className="text-sm text-warm-gray/70 mt-1">No accounts match "{searchQuery}". Try a different code or name.</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="lg:col-span-1">
        <AnimatePresence>
          {selectedAccount ? (
            <motion.div
              key={selectedAccount.code}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="cos-card"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="heading-md text-charcoal dark:text-dm-text">Account Details</h3>
                <button onClick={() => setSelectedAccount(null)} className="p-1 rounded-lg text-warm-gray hover:bg-cream-dark dark:hover:bg-dm-surface-raised">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="label text-warm-gray">Account Code</p>
                  <p className="font-mono text-lg text-charcoal dark:text-dm-text">{selectedAccount.code}</p>
                </div>
                <div>
                  <p className="label text-warm-gray">Account Name</p>
                  <p className="body-lg text-charcoal dark:text-dm-text font-medium">{selectedAccount.name}</p>
                </div>
                <div>
                  <p className="label text-warm-gray">Type</p>
                  <span className={
                    'inline-block px-2 py-0.5 rounded-full text-xs font-medium ' +
                    (selectedAccount.type === 'ASSET' ? 'bg-info/10 text-info dark:bg-info/20 dark:text-blue-300' :
                     selectedAccount.type === 'LIABILITY' ? 'bg-warning/10 text-warning dark:bg-warning/20 dark:text-yellow-300' :
                     selectedAccount.type === 'EQUITY' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                     selectedAccount.type === 'INCOME' ? 'bg-success/10 text-success dark:bg-success/20 dark:text-green-300' :
                     'bg-error/10 text-error dark:bg-error/20 dark:text-red-300')
                  }>
                    {selectedAccount.type}
                  </span>
                </div>
                <div>
                  <p className="label text-warm-gray">Current Balance</p>
                  <p className="font-mono text-xl text-charcoal dark:text-dm-text">{formatPeso(selectedAccount.balance)}</p>
                </div>
                <div>
                  <p className="label text-warm-gray">Normal Balance</p>
                  <p className="body-md text-charcoal dark:text-dm-text capitalize">{selectedAccount.normalBalance}</p>
                </div>

                {/* Recent transactions */}
                <div className="pt-3 border-t border-parchment/40">
                  <p className="label text-warm-gray mb-2">Recent Transactions</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {entries
                      .filter((je) => je.lines.some((l) => l.accountCode === selectedAccount.code || l.accountName === selectedAccount.name))
                      .slice(0, 5)
                      .map((je) => (
                        <div key={je.id} className="p-2 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-gold">{je.id}</span>
                            <span className="text-warm-gray">{je.date}</span>
                          </div>
                          <p className="text-charcoal dark:text-dm-text mt-0.5 truncate">{je.reference}</p>
                          <div className="flex justify-between mt-1">
                            <span className={je.lines.find((l) => l.accountCode === selectedAccount.code)?.debit ? 'text-success' : 'text-charcoal dark:text-dm-text'}>
                              {je.lines.find((l) => l.accountCode === selectedAccount.code)?.debit
                                ? formatPeso(je.lines.find((l) => l.accountCode === selectedAccount.code)!.debit) + ' Dr'
                                : formatPeso(je.lines.find((l) => l.accountCode === selectedAccount.code)?.credit || 0) + ' Cr'}
                            </span>
                          </div>
                        </div>
                      ))}
                    {entries.filter((je) => je.lines.some((l) => l.accountCode === selectedAccount.code || l.accountName === selectedAccount.name)).length === 0 && (
                      <p className="text-xs text-warm-gray italic">No recent transactions</p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="cos-card p-8 text-center">
              <FileText className="w-12 h-12 text-warm-gray/30 mx-auto mb-3" />
              <p className="body-md text-warm-gray">Click an account to view details and recent transactions.</p>
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Recursive tree node component
function AccountTreeNode({
  account, depth, expanded, onToggle, onSelect,
}: {
  account: Account; depth: number; expanded: ExpandedState;
  onToggle: (code: string) => void; onSelect: (a: Account) => void;
}) {
  const hasChildren = account.children && account.children.length > 0;
  const isExpanded = expanded[account.code] || false;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-gold-glow/50 cursor-pointer transition-colors"
        style={{ paddingLeft: `${depth * 24 + 12}px` }}
        onClick={() => hasChildren ? onToggle(account.code) : onSelect(account)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(account.code); }}
            className="p-0.5 rounded text-warm-gray hover:text-charcoal transition-colors"
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <span className="font-mono text-sm text-warm-gray w-16 shrink-0">{account.code}</span>
        <span className={`body-md flex-1 ${hasChildren ? 'font-semibold text-charcoal dark:text-dm-text' : 'text-charcoal dark:text-dm-text'}`}>
          {account.name}
        </span>
        <span className={`font-mono text-sm text-right ${account.balance >= 0 ? 'text-charcoal dark:text-dm-text' : 'text-error'}`}>
          {formatPeso(account.balance)}
        </span>
      </div>
      {hasChildren && isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.25 }}
        >
          {account.children!.map((child) => (
            <AccountTreeNode
              key={child.code} account={child} depth={depth + 1}
              expanded={expanded} onToggle={onToggle} onSelect={onSelect}
            />
          ))}
        </motion.div>
      )}
    </div>
  );
}

// ============================================
// Tab 2 — Journal (General Ledger)
// ============================================
function JournalTab({ entries, setEntries }: { entries: JournalEntry[]; setEntries: Dispatch<SetStateAction<JournalEntry[]>> }) {
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  // Draft entries persist separately so an interrupted "Save as Draft" is not lost.
  const [drafts, setDrafts] = usePersistedState<JournalEntry[]>('finance_journal_drafts', []);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);

  const role = getCurrentUserRole();

  // Approve/Reject a Pending entry via the shared decision path.
  const decideEntry = (id: string, decision: 'Approved' | 'Rejected', comment?: string) => {
    if (decideJournalEntry(entries, setEntries, role, id, decision, comment)) {
      setViewEntry(null);
    }
  };

  const handleExport = () => {
    const headers = ['Entry ID', 'Date', 'Reference', 'Description', 'Total Debits', 'Total Credits', 'Status', 'Posted By'];
    const rows = filteredEntries.map((je) => [
      je.id, je.date, je.reference, je.description, je.totalDr, je.totalCr, je.status, je.postedBy,
    ]);
    if (rows.length === 0) {
      toast.error('No journal entries to export');
      return;
    }
    downloadCsv(`journal-entries-${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast.success(`Exported ${rows.length} journal ${rows.length === 1 ? 'entry' : 'entries'}`);
  };

  const filteredEntries = useMemo(() => {
    if (!searchQuery) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter((je) =>
      je.id.toLowerCase().includes(q) ||
      je.reference.toLowerCase().includes(q) ||
      je.description.toLowerCase().includes(q) ||
      je.lines.some((l) => l.accountName.toLowerCase().includes(q))
    );
  }, [searchQuery, entries]);

  // Flatten entries for DataTable
  const tableData = useMemo(() => {
    return filteredEntries.map((je) => ({
      id: je.id,
      date: je.date,
      reference: je.reference,
      description: je.description,
      debits: formatPeso(je.totalDr),
      credits: formatPeso(je.totalCr),
      balance: formatPeso(je.totalDr),
      status: je.status,
      postedBy: je.postedBy,
      raw: je,
    }));
  }, [filteredEntries]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
          <input
            type="text" placeholder="Search journal entries..." value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-64 pl-9 pr-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
          />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowModal(true)} className="cos-btn cos-btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> New Entry
          </button>
          <button onClick={handleExport} className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Saved Drafts */}
      {drafts.length > 0 && (
        <div className="space-y-2">
          <p className="label text-warm-gray">Saved Drafts</p>
          {drafts.map((d) => (
            <div key={d.id} className="cos-card p-0 overflow-hidden border-l-4 border-l-warning">
              <div className="flex flex-wrap items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm text-gold font-medium">{d.id}</span>
                  <span className="text-sm text-warm-gray">{d.date}</span>
                  <span className="body-sm text-charcoal dark:text-dm-text font-medium">{d.reference || d.description || 'Untitled draft'}</span>
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">Draft</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-charcoal dark:text-dm-text">{formatPeso(d.totalDr)}</span>
                  <button
                    onClick={() => setDrafts((prev) => prev.filter((x) => x.id !== d.id))}
                    className="p-1 rounded text-warm-gray hover:text-error transition-colors"
                    aria-label="Discard draft"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Journal Entries List */}
      <div className="space-y-3">
        {tableData.map((row, i) => (
          <JournalEntryCard
            key={row.id} entry={row.raw} index={i} onView={() => setViewEntry(row.raw)}
            canDecide={row.raw.status === 'Pending' && canApproveLevel(role, row.raw.requiredApproval)}
            onDecide={(decision) => decideEntry(row.raw.id, decision)}
          />
        ))}
        {tableData.length === 0 && (
          <EmptyState
            icon={BookOpen}
            title={getLabel('finance.empty.title', 'No finance records yet')}
            description={getLabel('finance.empty.description', 'Record Sunday collections, expenses, and fees here. This helps track your parish finances.')}
            tip={getLabel('finance.empty.tip', "Start by recording this Sunday's collection.")}
            actionLabel="New Entry"
            actionIcon={Plus}
            onAction={() => setShowModal(true)}
          />
        )}
      </div>

      {/* Add Transaction Modal */}
      <AnimatePresence>
        {showModal && (
          <TransactionModal
            onClose={() => setShowModal(false)}
            onPost={(entry) => {
              setEntries((prev) => [entry, ...prev]);
              if (entry.status === 'Pending') {
                appendFinanceAudit('Submitted', entry.id, `Journal entry ${formatPeso(entry.totalDr)} awaiting ${entry.requiredApproval} — ${entry.description}`);
              } else {
                appendFinanceAudit('Created', entry.id, `Posted journal entry ${formatPeso(entry.totalDr)} — ${entry.description}`);
              }
            }}
            onSaveDraft={(draft) => setDrafts((prev) => [draft, ...prev])}
          />
        )}
      </AnimatePresence>

      {/* View Entry Detail Modal */}
      <AnimatePresence>
        {viewEntry && (
          <JournalViewModal
            entry={viewEntry}
            onClose={() => setViewEntry(null)}
            canDecide={viewEntry.status === 'Pending' && canApproveLevel(role, viewEntry.requiredApproval)}
            onDecide={(decision, comment) => decideEntry(viewEntry.id, decision, comment)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

const STATUS_BADGE: Record<JournalEntry['status'], string> = {
  Posted: 'bg-success/10 text-success',
  Pending: 'bg-warning/10 text-warning',
  Draft: 'bg-cream-dark text-warm-gray',
  Rejected: 'bg-error/10 text-error',
};

const STATUS_BORDER: Record<JournalEntry['status'], string> = {
  Posted: 'border-l-success',
  Pending: 'border-l-warning',
  Draft: 'border-l-warm-gray',
  Rejected: 'border-l-error',
};

// Detail view of a journal entry; approvers can decide Pending entries here.
function JournalViewModal({ entry, onClose, canDecide, onDecide }: {
  entry: JournalEntry;
  onClose: () => void;
  canDecide: boolean;
  onDecide: (decision: 'Approved' | 'Rejected', comment?: string) => void;
}) {
  const [comment, setComment] = useState('');
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full overflow-hidden flex flex-col"
        style={{ maxWidth: 700, maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border shrink-0">
          <div>
            <span className="font-mono text-sm text-gold font-medium">{entry.id}</span>
            <h2 className="heading-md text-charcoal dark:text-dm-text">{entry.reference}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label text-warm-gray mb-1">Date</p>
              <p className="body-md text-charcoal dark:text-dm-text">{entry.date}</p>
            </div>
            <div>
              <p className="label text-warm-gray mb-1">Status</p>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[entry.status]}`}>{entry.status}</span>
              {entry.requiredApproval && entry.status === 'Pending' && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">{entry.requiredApproval}</span>
              )}
            </div>
            <div>
              <p className="label text-warm-gray mb-1">Posted By</p>
              <p className="body-md text-charcoal dark:text-dm-text">{entry.postedBy}</p>
            </div>
            <div>
              <p className="label text-warm-gray mb-1">Reference</p>
              <p className="body-md text-charcoal dark:text-dm-text">{entry.reference}</p>
            </div>
          </div>
          {entry.description && (
            <div>
              <p className="label text-warm-gray mb-1">Description</p>
              <p className="body-md text-charcoal dark:text-dm-text">{entry.description}</p>
            </div>
          )}
          <div className="border border-parchment rounded-lg overflow-hidden dark:border-dm-border">
            <table className="w-full text-sm">
              <thead className="bg-cream-dark dark:bg-dm-surface-raised">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-warm-gray text-xs">Account</th>
                  <th className="text-right px-3 py-2 font-medium text-warm-gray text-xs">Debit</th>
                  <th className="text-right px-3 py-2 font-medium text-warm-gray text-xs">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((line, li) => (
                  <tr key={li} className="border-b border-parchment/40 last:border-0">
                    <td className="px-3 py-2 text-charcoal dark:text-dm-text">{line.accountCode} — {line.accountName}</td>
                    <td className="px-3 py-2 text-right font-mono">{line.debit > 0 ? formatPeso(line.debit) : ''}</td>
                    <td className="px-3 py-2 text-right font-mono">{line.credit > 0 ? formatPeso(line.credit) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-parchment bg-cream-dark/40 dark:bg-dm-surface-raised/40">
                  <td className="px-3 py-2 font-medium text-charcoal dark:text-dm-text">Total</td>
                  <td className="px-3 py-2 text-right font-mono font-medium">{formatPeso(entry.totalDr)}</td>
                  <td className="px-3 py-2 text-right font-mono font-medium">{formatPeso(entry.totalCr)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Approval history */}
          {entry.approvalHistory && entry.approvalHistory.length > 0 && (
            <div>
              <p className="label text-warm-gray mb-2">Approval History</p>
              <div className="space-y-2">
                {entry.approvalHistory.map((step, si) => (
                  <div key={si} className="p-2 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-charcoal dark:text-dm-text">{step.action}</span>
                      <span className="text-warm-gray">{step.date}</span>
                    </div>
                    <p className="text-warm-gray mt-0.5 flex items-center gap-1"><User className="w-3 h-3" /> {step.by}</p>
                    {step.comment && <p className="text-warm-gray mt-0.5 italic">"{step.comment}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decision comment (approvers only) */}
          {canDecide && (
            <div>
              <label className="label text-warm-gray mb-1 block">Decision Comment</label>
              <textarea rows={2} placeholder="Optional comment recorded with your decision..." value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold resize-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border shrink-0">
          <button onClick={onClose} className="cos-btn cos-btn-secondary text-sm">Close</button>
          {canDecide && (
            <>
              <button
                onClick={() => onDecide('Rejected', comment)}
                className="cos-btn bg-error text-white hover:bg-[#991B1B] text-sm flex items-center gap-1"
              >
                <X className="w-4 h-4" /> Reject
              </button>
              <button
                onClick={() => onDecide('Approved', comment)}
                className="cos-btn bg-success text-white hover:bg-forest-green text-sm flex items-center gap-1"
              >
                <Check className="w-4 h-4" /> Approve
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function JournalEntryCard({ entry, index, onView, canDecide, onDecide }: {
  entry: JournalEntry;
  index: number;
  onView: () => void;
  canDecide: boolean;
  onDecide: (decision: 'Approved' | 'Rejected') => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className={`cos-card p-0 overflow-hidden border-l-4 ${STATUS_BORDER[entry.status]}`}
    >
      {/* Header */}
      <div
        className="flex flex-wrap items-center justify-between px-5 py-3 cursor-pointer hover:bg-cream-dark/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono text-sm text-gold font-medium">{entry.id}</span>
          <span className="text-sm text-warm-gray">{entry.date}</span>
          <span className="body-sm text-charcoal dark:text-dm-text font-medium">{entry.reference}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[entry.status]}`}>{entry.status}</span>
          {entry.status === 'Pending' && entry.requiredApproval && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">{entry.requiredApproval}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-warm-gray">By: {entry.postedBy}</span>
          <button className="p-1 rounded text-warm-gray hover:text-charcoal">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded Lines */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-3 border-t border-parchment/40 pt-3">
              <table className="w-full text-sm">
                <tbody>
                  {entry.lines.map((line, li) => (
                    <tr key={li} className="border-b border-parchment/20 last:border-0">
                      <td className="py-1.5 pl-4">
                        <span className={line.debit > 0 ? '' : 'pl-8'}>
                          {line.accountCode} — {line.accountName}
                        </span>
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {line.debit > 0 ? formatPeso(line.debit) : ''}
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {line.credit > 0 ? formatPeso(line.credit) + ' Cr' : ''}
                      </td>
                      <td className="py-1.5 text-right text-xs text-warm-gray">
                        {line.debit > 0 ? 'Dr' : 'Cr'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-parchment">
                    <td className="py-2 font-medium text-charcoal dark:text-dm-text">Total</td>
                    <td className="py-2 text-right font-mono font-medium text-charcoal dark:text-dm-text">{formatPeso(entry.totalDr)}</td>
                    <td className="py-2 text-right font-mono font-medium text-charcoal dark:text-dm-text">{formatPeso(entry.totalCr)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={(e) => { e.stopPropagation(); onView(); }}
                  className="text-xs px-3 py-1.5 rounded-lg bg-cream-dark text-warm-gray hover:bg-parchment transition-all flex items-center gap-1"
                >
                  <Eye className="w-3 h-3" /> View
                </button>
                {canDecide && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDecide('Approved'); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-success text-white hover:bg-forest-green transition-all flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Approve
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDecide('Rejected'); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-error text-white hover:bg-[#991B1B] transition-all flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Transaction Entry Modal (800px wide)
function TransactionModal({ onClose, onPost, onSaveDraft }: { onClose: () => void; onPost: (entry: JournalEntry) => void; onSaveDraft: (draft: JournalEntry) => void }) {
  const today = todayISO(); // local date — UTC would be yesterday before 8 AM PH time
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ date?: string; description?: string }>({});
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<JournalLine[]>([
    { accountCode: '', accountName: '', debit: 0, credit: 0 },
    { accountCode: '', accountName: '', debit: 0, credit: 0 },
  ]);

  const leafAccounts = useMemo(() => getLeafAccounts(), []);

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const names = Array.from(files).map((f) => f.name);
    setAttachments((prev) => [...prev, ...names]);
  };

  // Balance is validated in INTEGER CENTAVOS — the exact arithmetic every
  // derived report (trial balance, balance sheet) uses. A float "< 0.01"
  // tolerance here let entries through that the reports then flagged as
  // permanently Unbalanced.
  const toCent = (v: number) => Math.round((v || 0) * 100);
  const totalDrCent = lines.reduce((s, l) => s + toCent(l.debit), 0);
  const totalCrCent = lines.reduce((s, l) => s + toCent(l.credit), 0);
  const totalDr = totalDrCent / 100;
  const totalCr = totalCrCent / 100;
  const isBalanced = totalDrCent === totalCrCent && totalDrCent > 0;
  const diff = Math.abs(totalDrCent - totalCrCent) / 100;

  const approvalLevel = getAmountApprovalLevel(Math.max(totalDr, totalCr));

  const addLine = () => setLines([...lines, { accountCode: '', accountName: '', debit: 0, credit: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));

  const updateLine = (i: number, field: keyof JournalLine, value: string | number) => {
    setLines(lines.map((l, idx) => {
      if (idx !== i) return l;
      if (field === 'accountCode') {
        const acct = leafAccounts.find((a) => a.code === value);
        return { ...l, accountCode: value as string, accountName: acct?.name || '' };
      }
      // Amounts are stored rounded to the centavo so the posted lines are
      // exactly what the ledger's per-line centavo rounding will see.
      if (field === 'debit' || field === 'credit') {
        return { ...l, [field]: Math.round(((value as number) || 0) * 100) / 100 };
      }
      return { ...l, [field]: value } as JournalLine;
    }));
  };

  // Validate the header fields (date + description). Returns true if valid.
  const validate = (): boolean => {
    const next: { date?: string; description?: string } = {};
    if (!date) {
      next.date = 'Date is required.';
    } else if (date > today) {
      next.date = 'Date cannot be in the future.';
    }
    if (!description.trim()) {
      next.description = 'Description is required.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handlePost = () => {
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    if (!isBalanced) {
      toast.error('Cannot post unbalanced entry');
      return;
    }
    // Amounts at/above the approval thresholds are saved as Pending and are
    // excluded from all derived reports until an approver posts them.
    const requiresApproval = approvalLevel.label !== 'Direct Post';
    const entry: JournalEntry = {
      id: `JE-${Date.now()}`,
      date,
      reference: reference.trim() || `REF-${Date.now()}`,
      description: description.trim(),
      lines: lines.filter((l) => l.accountCode),
      status: requiresApproval ? 'Pending' : 'Posted',
      postedBy: getCurrentUserName(),
      totalDr,
      totalCr,
      ...(requiresApproval
        ? {
            requiredApproval: approvalLevel.label,
            approvalHistory: [{
              action: 'Submitted',
              by: getCurrentUserName(),
              date: new Date().toISOString().slice(0, 16).replace('T', ' '),
              comment: `Requires ${approvalLevel.label}`,
            }],
          }
        : {}),
    };
    onPost(entry);
    if (requiresApproval) toast(`Entry saved as Pending — ${approvalLevel.label}`);
    else toast.success('Transaction posted to ledger');
    onClose();
  };

  const handleSaveDraft = () => {
    const draft: JournalEntry = {
      id: `DRAFT-${Date.now()}`,
      date,
      reference: reference.trim(),
      description: description.trim(),
      lines: lines.filter((l) => l.accountCode),
      status: 'Draft',
      postedBy: getCurrentUserName(),
      totalDr,
      totalCr,
    };
    onSaveDraft(draft);
    toast.success('Draft saved');
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full overflow-hidden flex flex-col"
        style={{ maxWidth: 800, maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border shrink-0">
          <h2 className="heading-md text-charcoal dark:text-dm-text">New Journal Entry</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div>
              <label className="label text-warm-gray mb-1 block">Date</label>
              <input type="date" value={date} max={today}
                onChange={(e) => { setDate(e.target.value); if (errors.date) setErrors((p) => ({ ...p, date: undefined })); }}
                className={'h-10 w-full px-3 rounded-lg border bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:text-dm-text ' + (errors.date ? 'border-error' : 'border-parchment dark:border-dm-border')} />
              {errors.date && <p className="text-xs text-error mt-1">{errors.date}</p>}
            </div>
            <div>
              <label className="label text-warm-gray mb-1 block">Reference #</label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Auto: JV-2025-0026"
                className="h-10 w-full px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
            </div>
          </div>
          <div className="mb-5">
            <label className="label text-warm-gray mb-1 block">Description</label>
            <input type="text" value={description}
              onChange={(e) => { setDescription(e.target.value); if (errors.description) setErrors((p) => ({ ...p, description: undefined })); }}
              placeholder="Transaction description..."
              className={'h-10 w-full px-3 rounded-lg border bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:text-dm-text ' + (errors.description ? 'border-error' : 'border-parchment dark:border-dm-border')} />
            {errors.description && <p className="text-xs text-error mt-1">{errors.description}</p>}
          </div>

          {/* Document upload area */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <div
            className="mb-3 p-4 border-2 border-dashed border-parchment rounded-lg text-center hover:border-gold/50 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
          >
            <Upload className="w-6 h-6 text-warm-gray mx-auto mb-2" />
            <p className="text-sm text-warm-gray">Drop supporting documents here or click to browse</p>
          </div>
          {attachments.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {attachments.map((name, ai) => (
                <span key={ai} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-cream-dark text-warm-gray dark:bg-dm-surface-raised dark:text-dm-text-muted">
                  <FileText className="w-3 h-3" /> {name}
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== ai))}
                    className="ml-1 hover:text-error"
                    aria-label={`Remove ${name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Accounting Lines */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="label text-warm-gray">Accounting Lines</label>
            </div>
            <div className="border border-parchment rounded-lg overflow-hidden dark:border-dm-border">
              <table className="w-full text-sm">
                <thead className="bg-cream-dark dark:bg-dm-surface-raised">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-warm-gray text-xs">Account</th>
                    <th className="text-right px-3 py-2 font-medium text-warm-gray text-xs w-32">Debit</th>
                    <th className="text-right px-3 py-2 font-medium text-warm-gray text-xs w-32">Credit</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-b border-parchment/40 last:border-0">
                      <td className="px-2 py-2">
                        <select
                          value={line.accountCode}
                          onChange={(e) => updateLine(i, 'accountCode', e.target.value)}
                          className="w-full h-8 px-2 rounded border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                        >
                          <option value="">Select account...</option>
                          {leafAccounts.map((a) => (
                            <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number" min="0" step="0.01"
                          value={line.debit || ''}
                          onChange={(e) => updateLine(i, 'debit', parseFloat(e.target.value) || 0)}
                          className="w-full h-8 px-2 rounded border border-parchment bg-white text-sm text-charcoal text-right font-mono focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number" min="0" step="0.01"
                          value={line.credit || ''}
                          onChange={(e) => updateLine(i, 'credit', parseFloat(e.target.value) || 0)}
                          className="w-full h-8 px-2 rounded border border-parchment bg-white text-sm text-charcoal text-right font-mono focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
                        />
                      </td>
                      <td className="px-2 py-2">
                        {lines.length > 2 && (
                          <button onClick={() => removeLine(i)} className="p-1 rounded text-warm-gray hover:text-error transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addLine} className="mt-2 text-sm text-gold hover:text-gold-light font-medium flex items-center gap-1 transition-colors">
              <Plus className="w-4 h-4" /> Add Line
            </button>
          </div>

          {/* Totals & Balance Check */}
          <div className="border-t border-parchment pt-4 mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="body-sm text-warm-gray">Total Debits</span>
              <span className="font-mono text-charcoal dark:text-dm-text">{formatPeso(totalDr)}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="body-sm text-warm-gray">Total Credits</span>
              <span className="font-mono text-charcoal dark:text-dm-text">{formatPeso(totalCr)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="body-sm font-medium text-charcoal dark:text-dm-text">Difference</span>
              {isBalanced ? (
                <span className="flex items-center gap-1 font-mono text-success font-medium">
                  <CheckCircle2 className="w-4 h-4" /> Balanced
                </span>
              ) : (
                <span className="flex items-center gap-1 font-mono text-error font-medium">
                  <AlertCircle className="w-4 h-4" /> Unbalanced: {formatPeso(diff)}
                </span>
              )}
            </div>
          </div>

          {/* Approval workflow indicator */}
          {totalDr > 0 && (
            <div className={`p-3 rounded-lg ${approvalLevel.bgColor} mb-4`}>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${approvalLevel.color}`}>{approvalLevel.label}</span>
                {totalDr >= 100000 && <span className="text-xs opacity-70">({formatPesoWhole(totalDr)})</span>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border shrink-0">
          <button onClick={handleSaveDraft} className="cos-btn cos-btn-secondary text-sm">Save as Draft</button>
          <button
            onClick={handlePost}
            disabled={!isBalanced}
            className={'cos-btn text-sm text-white ' + (isBalanced ? 'bg-gold hover:bg-gold-light' : 'bg-warm-gray/50 cursor-not-allowed')}
          >
            Post to Ledger
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================
// Tab 3 — Sunday Collections
// ============================================
function CollectionsTab({ collections, setCollections }: { collections: Collection[]; setCollections: Dispatch<SetStateAction<Collection[]>> }) {
  const [collectionDate, setCollectionDate] = useState('2025-01-05');
  const [massTime, setMassTime] = useState('8:00 AM');
  const [cashAmount, setCashAmount] = useState('');
  const [checksAmount, setChecksAmount] = useState('');
  const [digitalAmount, setDigitalAmount] = useState('');
  const [showPostDialog, setShowPostDialog] = useState(false);

  const total = (parseFloat(cashAmount) || 0) + (parseFloat(checksAmount) || 0) + (parseFloat(digitalAmount) || 0);

  const handlePost = () => {
    if (total <= 0) {
      toast.error('Collection total must be greater than zero');
      return;
    }
    setShowPostDialog(true);
  };

  const confirmPost = () => {
    const entry: Collection = {
      id: `COL-${Date.now()}`,
      date: collectionDate,
      massTime,
      cash: parseFloat(cashAmount) || 0,
      checks: parseFloat(checksAmount) || 0,
      digital: parseFloat(digitalAmount) || 0,
      total,
      postedBy: getCurrentUserName(),
      status: 'Posted',
    };
    setCollections((prev) => [entry, ...prev]);
    toast.success('Collection posted successfully');
    setCashAmount('');
    setChecksAmount('');
    setDigitalAmount('');
    setShowPostDialog(false);
  };

  const handleExportCollections = () => {
    if (collections.length === 0) {
      toast.error('No collections to export');
      return;
    }
    const headers = ['ID', 'Date', 'Mass Time', 'Cash', 'Checks', 'Digital', 'Total', 'Posted By', 'Status'];
    const rows = collections.map((c) => [
      c.id, c.date, c.massTime, c.cash, c.checks, c.digital, c.total, c.postedBy, c.status,
    ]);
    downloadCsv(`collections-${new Date().toISOString().split('T')[0]}.csv`, headers, rows);
    toast.success(`Exported ${rows.length} collection ${rows.length === 1 ? 'record' : 'records'}`);
  };

  // Group collections by month for display
  const groupedCollections = useMemo(() => {
    const groups: { month: string; year: string; items: Collection[] }[] = [];
    for (const c of collections) {
      const [year] = c.date.split('-');
      const monthName = new Date(c.date).toLocaleString('en-US', { month: 'long' });
      const existing = groups.find((g) => g.month === monthName && g.year === year);
      if (existing) {
        existing.items.push(c);
      } else {
        groups.push({ month: monthName, year, items: [c] });
      }
    }
    return groups;
  }, [collections]);

  return (
    <div className="space-y-6">
      {/* Collection Entry Form */}
      <div className="cos-card">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-gold" />
          <h3 className="heading-md text-charcoal dark:text-dm-text">New Collection Entry</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="label text-warm-gray mb-1 block">Date</label>
            <input type="date" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)}
              className="h-10 w-full px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
          </div>
          <div>
            <label className="label text-warm-gray mb-1 block">Mass Time</label>
            <select value={massTime} onChange={(e) => setMassTime(e.target.value)}
              className="h-10 w-full px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text">
              <option>6:00 AM</option>
              <option>8:00 AM</option>
              <option>10:00 AM</option>
              <option>6:00 PM</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Cash */}
          <div className="p-4 bg-cream-dark/50 rounded-lg dark:bg-dm-surface-raised/50">
            <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Cash</h4>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray">₱</span>
              <input type="number" min="0" step="0.01" value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 w-full pl-8 pr-3 rounded-lg border border-parchment bg-white text-sm text-charcoal font-mono text-right focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
            </div>
          </div>

          {/* Checks */}
          <div className="p-4 bg-cream-dark/50 rounded-lg dark:bg-dm-surface-raised/50">
            <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Checks</h4>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray">₱</span>
              <input type="number" min="0" step="0.01" value={checksAmount}
                onChange={(e) => setChecksAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 w-full pl-8 pr-3 rounded-lg border border-parchment bg-white text-sm text-charcoal font-mono text-right focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
            </div>
          </div>

          {/* Digital */}
          <div className="p-4 bg-cream-dark/50 rounded-lg dark:bg-dm-surface-raised/50">
            <h4 className="heading-sm text-charcoal dark:text-dm-text mb-3">Digital (GCash/Bank)</h4>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray">₱</span>
              <input type="number" min="0" step="0.01" value={digitalAmount}
                onChange={(e) => setDigitalAmount(e.target.value)}
                placeholder="0.00"
                className="h-10 w-full pl-8 pr-3 rounded-lg border border-parchment bg-white text-sm text-charcoal font-mono text-right focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
            </div>
          </div>
        </div>

        {/* Total & Post */}
        <div className="flex flex-wrap items-center justify-between mt-6 pt-4 border-t border-parchment">
          <div>
            <p className="label text-warm-gray">Total Collection</p>
            <p className="text-2xl font-bold text-gold font-mono">{formatPeso(total)}</p>
          </div>
          <button
            onClick={handlePost}
            disabled={total <= 0}
            className={'cos-btn text-white ' + (total > 0 ? 'bg-gold hover:bg-gold-light' : 'bg-warm-gray/50 cursor-not-allowed')}
          >
            Post to Ledger
          </button>
        </div>
      </div>

      {/* Collections History */}
      <div className="cos-card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-parchment/40">
          <h3 className="heading-md text-charcoal dark:text-dm-text">Collections History</h3>
          <button onClick={handleExportCollections} className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export to Excel
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-dark dark:bg-dm-surface-raised">
                <th className="text-left px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Mass Time</th>
                <th className="text-right px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Cash</th>
                <th className="text-right px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Checks</th>
                <th className="text-right px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Digital</th>
                <th className="text-right px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Total</th>
                <th className="text-left px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Posted By</th>
                <th className="text-left px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {groupedCollections.map((group) => (
                <>
                  {/* Month header */}
                  <tr key={group.month + group.year} className="bg-parchment/30 dark:bg-dm-surface-raised/30">
                    <td colSpan={8} className="px-4 py-2 font-semibold text-charcoal dark:text-dm-text text-sm">
                      {group.month} {group.year}
                    </td>
                  </tr>
                  {/* Items */}
                  {group.items.map((c, i) => (
                    <tr key={c.id} className={`border-b border-parchment/20 ${i % 2 === 0 ? 'bg-white dark:bg-dm-surface' : 'bg-off-white dark:bg-dm-surface/50'} hover:bg-gold-glow/30 transition-colors`}>
                      <td className="px-4 py-2.5">{c.date}</td>
                      <td className="px-4 py-2.5">{c.massTime}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatPeso(c.cash)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatPeso(c.checks)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{formatPeso(c.digital)}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium">{formatPeso(c.total)}</td>
                      <td className="px-4 py-2.5">{c.postedBy}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">{c.status}</span>
                      </td>
                    </tr>
                  ))}
                  {/* Monthly total */}
                  <tr className="border-b-2 border-parchment dark:border-dm-border bg-cream-dark/30 dark:bg-dm-surface-raised/30 font-medium">
                    <td colSpan={2} className="px-4 py-2 text-right text-sm text-warm-gray">{group.month} Total:</td>
                    <td className="px-4 py-2 text-right font-mono">{formatPeso(group.items.reduce((s, c) => s + c.cash, 0))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatPeso(group.items.reduce((s, c) => s + c.checks, 0))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatPeso(group.items.reduce((s, c) => s + c.digital, 0))}</td>
                    <td className="px-4 py-2 text-right font-mono text-gold">{formatPeso(group.items.reduce((s, c) => s + c.total, 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showPostDialog}
        title="Post Collection to Ledger?"
        message={`This will create a journal entry: DR Cash on Hand ${formatPeso(total)}, CR Sunday Collections Income ${formatPeso(total)}. This action cannot be undone.`}
        confirmLabel="Post to Ledger"
        variant="info"
        onConfirm={confirmPost}
        onCancel={() => setShowPostDialog(false)}
      />
    </div>
  );
}

// ============================================
// Tab 4 — Budget
// ============================================
// Page-local extension of BudgetItem that also carries the user's notes.
type BudgetItemExt = BudgetItem & { notes?: string };

function BudgetTab({ entries, collections }: { entries: JournalEntry[]; collections: Collection[] }) {
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAccount, setEditAccount] = useState<BudgetItemExt | null>(null);
  const [items, setItems] = usePersistedState<BudgetItemExt[]>(KEYS.budgetItems, budgetData);

  // Budget TARGETS are stored and editable; actual/variance/status are ALWAYS
  // derived from the live ledger (the stored actualYTD is ignored by design).
  const derivedItems = useMemo(() => deriveBudgetActuals(entries, collections, items), [entries, collections, items]);

  const incomeItems = derivedItems.filter((b) => b.category === 'Income');
  const expenseItems = derivedItems.filter((b) => b.category === 'Expense');

  const totalBudget = derivedItems.reduce((s, b) => s + b.budgetYTD, 0);
  const totalActual = derivedItems.reduce((s, b) => s + b.actualYTD, 0);
  const totalVariance = totalBudget - totalActual;

  const handleSaveBudget = (accountCode: string, budgetYTD: number, notes?: string) => {
    setItems((prev) =>
      prev.map((b) =>
        b.accountCode === accountCode
          ? { ...b, budgetYTD, ...(notes !== undefined ? { notes } : {}) }
          : b,
      ),
    );
  };

  // Create a brand-new budget line for an account that has none yet.
  const handleCreateBudget = (accountCode: string, accountName: string, budgetYTD: number, notes?: string) => {
    const leaf = getLeafAccounts().find((a) => a.code === accountCode);
    const category: BudgetItem['category'] = leaf?.type === 'INCOME' ? 'Income' : 'Expense';
    const newItem: BudgetItemExt = {
      accountCode,
      accountName,
      category,
      budgetYTD,
      actualYTD: 0,
      variance: budgetYTD,
      variancePercent: budgetYTD > 0 ? 100 : 0,
      status: 'On Track',
      ...(notes ? { notes } : {}),
    };
    setItems((prev) => [...prev, newItem]);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="cos-card p-5">
          <p className="label text-warm-gray mb-1">Total Budget</p>
          <p className="text-2xl font-bold text-charcoal dark:text-dm-text font-mono">{formatPeso(totalBudget)}</p>
        </div>
        <div className="cos-card p-5">
          <p className="label text-warm-gray mb-1">Actual Spent</p>
          <p className="text-2xl font-bold text-charcoal dark:text-dm-text font-mono">{formatPeso(totalActual)}</p>
        </div>
        <div className="cos-card p-5">
          <p className="label text-warm-gray mb-1">Budget Remaining</p>
          <p className="text-2xl font-bold text-success font-mono">{formatPeso(totalVariance)}</p>
        </div>
        <div className="cos-card p-5">
          <p className="label text-warm-gray mb-1">Variance</p>
          <p className="text-2xl font-bold text-success font-mono">
            {totalBudget > 0 ? ((totalVariance / totalBudget) * 100).toFixed(1) : '0'}%
          </p>
        </div>
      </div>

      {/* Budget vs Actual Table */}
      <div className="cos-card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-parchment/40">
          <h3 className="heading-md text-charcoal dark:text-dm-text">Budget vs Actual</h3>
          <button onClick={() => setShowEditModal(true)} className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5">
            <Edit3 className="w-4 h-4" /> Edit Budget
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-cream-dark dark:bg-dm-surface-raised">
                <th className="text-left px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Account</th>
                <th className="text-right px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Budget YTD</th>
                <th className="text-right px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Actual YTD</th>
                <th className="text-right px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Variance (₱)</th>
                <th className="text-right px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Variance %</th>
                <th className="text-left px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider w-40">Progress</th>
                <th className="text-center px-4 py-2.5 font-medium text-warm-gray text-xs uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {/* Income Section */}
              <tr className="bg-parchment/40 dark:bg-dm-surface-raised/40">
                <td colSpan={7} className="px-4 py-2 font-semibold text-success text-sm uppercase tracking-wider">Income</td>
              </tr>
              {incomeItems.map((item, i) => (
                <BudgetRow key={item.accountCode} item={item} index={i} onEdit={() => { setEditAccount(item); setShowEditModal(true); }} />
              ))}
              {/* Expense Section */}
              <tr className="bg-parchment/40 dark:bg-dm-surface-raised/40">
                <td colSpan={7} className="px-4 py-2 font-semibold text-error text-sm uppercase tracking-wider">Expenses</td>
              </tr>
              {expenseItems.map((item, i) => (
                <BudgetRow key={item.accountCode} item={item} index={i} onEdit={() => { setEditAccount(item); setShowEditModal(true); }} />
              ))}
              {/* Summary Row */}
              <tr className="border-t-2 border-parchment dark:border-dm-border bg-cream-dark/50 dark:bg-dm-surface-raised/50 font-semibold">
                <td className="px-4 py-3 text-charcoal dark:text-dm-text">Net Total</td>
                <td className="px-4 py-3 text-right font-mono">{formatPeso(totalBudget)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatPeso(totalActual)}</td>
                <td className="px-4 py-3 text-right font-mono">{formatPeso(totalVariance)}</td>
                <td className="px-4 py-3 text-right font-mono">{totalBudget > 0 ? ((totalVariance / totalBudget) * 100).toFixed(1) : '0'}%</td>
                <td colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Budget Modal */}
      <AnimatePresence>
        {showEditModal && (
          <BudgetEditModal
            account={editAccount}
            existingCodes={items.map((b) => b.accountCode)}
            onSave={handleSaveBudget}
            onCreate={handleCreateBudget}
            onClose={() => { setShowEditModal(false); setEditAccount(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function BudgetRow({ item, index, onEdit }: { item: BudgetItem; index: number; onEdit: () => void }) {
  const pctUsed = item.budgetYTD > 0 ? (item.actualYTD / item.budgetYTD) * 100 : 0;
  const barColor = pctUsed > 100 ? 'bg-error' : pctUsed > 90 ? 'bg-warning' : 'bg-success';

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.02 }}
      className="border-b border-parchment/20 hover:bg-gold-glow/20 transition-colors cursor-pointer"
      onClick={onEdit}
    >
      <td className="px-4 py-2.5">
        <span className="font-mono text-xs text-warm-gray mr-2">{item.accountCode}</span>
        <span className="text-charcoal dark:text-dm-text">{item.accountName}</span>
      </td>
      <td className="px-4 py-2.5 text-right font-mono">{formatPeso(item.budgetYTD)}</td>
      <td className="px-4 py-2.5 text-right font-mono">{formatPeso(item.actualYTD)}</td>
      <td className={`px-4 py-2.5 text-right font-mono ${item.variance >= 0 ? 'text-success' : 'text-error'}`}>
        {formatPeso(item.variance)}
      </td>
      <td className={`px-4 py-2.5 text-right font-mono ${item.variancePercent >= 0 ? 'text-success' : 'text-error'}`}>
        {item.variancePercent.toFixed(1)}%
      </td>
      <td className="px-4 py-2.5">
        <div className="w-full h-2 bg-cream-dark rounded-full overflow-hidden dark:bg-dm-border">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(pctUsed, 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${barColor}`}
          />
        </div>
        <span className="text-xs text-warm-gray mt-0.5 block">{pctUsed.toFixed(0)}%</span>
      </td>
      <td className="px-4 py-2.5 text-center">
        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
          item.status === 'On Track' ? 'bg-success/10 text-success' :
          item.status === 'Over Budget' ? 'bg-error/10 text-error' :
          'bg-info/10 text-info'
        }`}>
          {item.status}
        </span>
      </td>
    </motion.tr>
  );
}

function BudgetEditModal({ account, existingCodes, onClose, onSave, onCreate }: {
  account: BudgetItemExt | null;
  existingCodes: string[];
  onClose: () => void;
  onSave: (accountCode: string, budgetYTD: number, notes?: string) => void;
  onCreate: (accountCode: string, accountName: string, budgetYTD: number, notes?: string) => void;
}) {
  const [budgetAmount, setBudgetAmount] = useState(account ? String(account.budgetYTD) : '');
  const [notes, setNotes] = useState(account?.notes ?? '');
  const [newAccountCode, setNewAccountCode] = useState('');
  const [error, setError] = useState('');
  const leafAccounts = useMemo(() => getLeafAccounts(), []);

  // In create mode, only offer accounts that don't already have a budget line.
  const availableAccounts = useMemo(
    () => leafAccounts.filter((a) =>
      (a.type === 'INCOME' || a.type === 'EXPENSE') && !existingCodes.includes(a.code)),
    [leafAccounts, existingCodes],
  );

  const handleSave = () => {
    const amount = parseFloat(budgetAmount) || 0;
    if (account) {
      onSave(account.accountCode, amount, notes.trim() || undefined);
      toast.success('Budget updated successfully');
      onClose();
      return;
    }
    // Create path
    if (!newAccountCode) {
      setError('Please select an account.');
      return;
    }
    const acct = leafAccounts.find((a) => a.code === newAccountCode);
    if (!acct) {
      setError('Please select a valid account.');
      return;
    }
    onCreate(acct.code, acct.name, amount, notes.trim() || undefined);
    toast.success('Budget line added');
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <h2 className="heading-md text-charcoal dark:text-dm-text">{account ? 'Edit Budget' : 'Add Budget Line'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {!account && (
            <div>
              <label className="label text-warm-gray mb-1 block">Account</label>
              <select
                value={newAccountCode}
                onChange={(e) => { setNewAccountCode(e.target.value); if (error) setError(''); }}
                className={'h-10 w-full px-3 rounded-lg border bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:text-dm-text ' + (error ? 'border-error' : 'border-parchment dark:border-dm-border')}
              >
                <option value="">Select account...</option>
                {availableAccounts.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                ))}
              </select>
              {error && <p className="text-xs text-error mt-1">{error}</p>}
              {availableAccounts.length === 0 && (
                <p className="text-xs text-warm-gray mt-1">Every account already has a budget line.</p>
              )}
            </div>
          )}
          {account && (
            <div>
              <label className="label text-warm-gray mb-1 block">Account</label>
              <p className="body-md text-charcoal dark:text-dm-text font-medium">{account.accountCode} — {account.accountName}</p>
            </div>
          )}
          <div>
            <label className="label text-warm-gray mb-1 block">Annual Budget Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-gray">₱</span>
              <input type="number" min="0" step="0.01" value={budgetAmount}
                onChange={(e) => setBudgetAmount(e.target.value)}
                className="h-10 w-full pl-8 pr-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal font-mono text-right focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
            </div>
          </div>
          <div>
            <label className="label text-warm-gray mb-1 block">Notes</label>
            <textarea rows={3} placeholder="Optional notes..." value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold resize-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
          <button onClick={onClose} className="cos-btn cos-btn-secondary text-sm">Cancel</button>
          <button onClick={handleSave} className="cos-btn bg-gold text-white hover:bg-gold-light text-sm">Save</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================
// Tab 5 — Approvals
// ============================================
// Driven by the SAME live journal entries as the Journal tab: it lists the
// real Pending entries and routes every decision through decideJournalEntry,
// so an approval here posts to the ledger and hits the audit log. (It used to
// render a static fixture whose "decisions" touched nothing.)

// Map an entry's required approval level onto the display category.
function approvalCategoryOf(requiredApproval?: string): ApprovalItem['category'] {
  if (requiredApproval === 'Bishop Approval Required') return 'Bishop Approval';
  if (requiredApproval === 'Council Consent Required') return 'Council Consent';
  return 'Council Review';
}

function ApprovalsTab({ entries, setEntries }: { entries: JournalEntry[]; setEntries: Dispatch<SetStateAction<JournalEntry[]>> }) {
  const [filter, setFilter] = useState<'All' | 'Council Review' | 'Council Consent' | 'Bishop Approval'>('All');
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const role = getCurrentUserRole();

  // Present the live Pending entries in the approval-card shape.
  const pendingItems = useMemo<ApprovalItem[]>(() =>
    entries
      .filter((e) => e.status === 'Pending')
      .map((e) => ({
        id: e.id,
        title: e.description,
        amount: e.totalDr,
        requester: e.postedBy,
        date: e.date,
        category: approvalCategoryOf(e.requiredApproval),
        description: `${e.reference} — ${e.lines.filter((l) => l.accountCode).map((l) => l.accountName).join(', ')}`,
        status: 'Pending' as const,
        history: e.approvalHistory,
      })),
  [entries]);

  const filteredItems = useMemo(() => {
    if (filter === 'All') return pendingItems;
    return pendingItems.filter((a) => a.category === filter);
  }, [filter, pendingItems]);

  const decide = (id: string, status: 'Approved' | 'Rejected', comment?: string) => {
    decideJournalEntry(entries, setEntries, role, id, status, comment);
  };

  const selectedApproval = selectedApprovalId
    ? filteredItems.find((a) => a.id === selectedApprovalId) ?? null
    : null;

  const filterTabs: ('All' | 'Council Review' | 'Council Consent' | 'Bishop Approval')[] = ['All', 'Council Review', 'Council Consent', 'Bishop Approval'];

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {filterTabs.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              'px-4 py-2 rounded-lg text-sm font-medium transition-all ' +
              (filter === f
                ? 'bg-deep-navy text-white'
                : 'bg-cream-dark text-warm-gray hover:bg-parchment dark:bg-dm-surface-raised dark:text-dm-text-muted dark:hover:bg-dm-border')
            }
          >
            {f}
          </button>
        ))}
      </div>

      {/* Approval Cards */}
      <div className="space-y-4">
        {filteredItems.map((item) => (
          <ApprovalCard
            key={item.id}
            item={item}
            status={item.status}
            onView={() => setSelectedApprovalId(item.id)}
            onDecision={(status) => decide(item.id, status)}
          />
        ))}
        {filteredItems.length === 0 && (
          <div className="cos-card p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-success/30 mx-auto mb-3" />
            <p className="text-warm-gray">No pending approvals in this category.</p>
            <p className="text-xs text-warm-gray/70 mt-1">Journal entries of ₱100,000 and above appear here until an approver decides them.</p>
          </div>
        )}
      </div>

      {/* Approval Detail Modal */}
      <AnimatePresence>
        {selectedApproval && (
          <ApprovalDetailModal
            item={selectedApproval}
            status={selectedApproval.status}
            existingComment=""
            onDecision={(status, comment) => decide(selectedApproval.id, status, comment)}
            onClose={() => setSelectedApprovalId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ApprovalCard({ item, status, onView, onDecision }: {
  item: ApprovalItem;
  status: ApprovalItem['status'];
  onView: () => void;
  onDecision: (status: 'Approved' | 'Rejected') => void;
}) {
  const badgeColor =
    item.category === 'Council Review' ? 'bg-warning/15 text-[#9A7B3D]' :
    item.category === 'Council Consent' ? 'bg-orange-100 text-orange-700' :
    'bg-purple-100 text-purple-700';

  // Success/failure feedback comes from the shared decision path
  // (decideJournalEntry) — no local toasts, so a role-blocked decision
  // cannot claim success.
  const handleApprove = () => onDecision('Approved');
  const handleReject = () => onDecision('Rejected');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="cos-card p-0 overflow-hidden"
    >
      <div className="p-5">
        {/* Status badge */}
        <div className="flex items-center justify-between mb-3">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${badgeColor}`}>
            {item.category.toUpperCase()}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            status === 'Approved' ? 'bg-success/10 text-success' :
            status === 'Rejected' ? 'bg-error/10 text-error' :
            'bg-warning/10 text-warning'
          }`}>
            {status}
          </span>
        </div>

        {/* Title & Amount */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
          <div>
            <p className="font-mono text-xs text-gold mb-1">{item.id}</p>
            <h3 className="heading-md text-charcoal dark:text-dm-text">{item.title}</h3>
          </div>
          <p className="text-2xl font-bold text-charcoal dark:text-dm-text font-mono">{formatPeso(item.amount)}</p>
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap gap-4 text-sm text-warm-gray mb-4">
          <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {item.requester}</span>
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {item.date}</span>
          {item.approvalsNeeded && item.approvalsNeeded > 1 && (
            <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {item.approvalsCurrent} of {item.approvalsNeeded} approved</span>
          )}
        </div>

        {/* Attachments */}
        {item.attachments && item.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {item.attachments.map((att) => (
              <span key={att} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-cream-dark text-warm-gray dark:bg-dm-surface-raised dark:text-dm-text-muted">
                <FileText className="w-3 h-3" /> {att}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        {status === 'Pending' && (
          <div className="flex items-center gap-2 pt-3 border-t border-parchment/40">
            <button onClick={onView} className="text-sm px-3 py-1.5 rounded-lg bg-cream-dark text-warm-gray hover:bg-parchment transition-all flex items-center gap-1 dark:bg-dm-surface-raised dark:text-dm-text-muted">
              <Eye className="w-3.5 h-3.5" /> View Details
            </button>
            <button onClick={handleApprove} className="text-sm px-3 py-1.5 rounded-lg bg-success text-white hover:bg-forest-green transition-all flex items-center gap-1">
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button onClick={handleReject} className="text-sm px-3 py-1.5 rounded-lg bg-error text-white hover:bg-[#991B1B] transition-all flex items-center gap-1">
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ApprovalDetailModal({ item, status, existingComment, onDecision, onClose }: {
  item: ApprovalItem;
  status: ApprovalItem['status'];
  existingComment: string;
  onDecision: (status: 'Approved' | 'Rejected', comment?: string) => void;
  onClose: () => void;
}) {
  const badgeColor =
    item.category === 'Council Review' ? 'bg-warning/15 text-[#9A7B3D]' :
    item.category === 'Council Consent' ? 'bg-orange-100 text-orange-700' :
    'bg-purple-100 text-purple-700';

  const [comment, setComment] = useState(existingComment);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>{item.category.toUpperCase()}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                status === 'Approved' ? 'bg-success/10 text-success' :
                status === 'Rejected' ? 'bg-error/10 text-error' :
                'bg-warning/10 text-warning'
              }`}>
                {status}
              </span>
            </div>
            <h2 className="heading-md text-charcoal dark:text-dm-text mt-1">{item.title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Amount */}
          <div>
            <p className="label text-warm-gray mb-1">Amount</p>
            <p className="text-3xl font-bold text-charcoal dark:text-dm-text font-mono">{formatPeso(item.amount)}</p>
          </div>

          {/* Description */}
          <div>
            <p className="label text-warm-gray mb-1">Description</p>
            <p className="body-md text-charcoal dark:text-dm-text">{item.description}</p>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="label text-warm-gray mb-1">Requested By</p>
              <p className="body-md text-charcoal dark:text-dm-text flex items-center gap-1"><User className="w-4 h-4" /> {item.requester}</p>
            </div>
            <div>
              <p className="label text-warm-gray mb-1">Date Submitted</p>
              <p className="body-md text-charcoal dark:text-dm-text flex items-center gap-1"><Calendar className="w-4 h-4" /> {item.date}</p>
            </div>
          </div>

          {/* Attachments */}
          {item.attachments && item.attachments.length > 0 && (
            <div>
              <p className="label text-warm-gray mb-2">Attachments</p>
              <div className="space-y-2">
                {item.attachments.map((att) => (
                  <div key={att} className="flex items-center gap-2 p-2 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50">
                    <FileText className="w-4 h-4 text-warm-gray" />
                    <span className="text-sm text-charcoal dark:text-dm-text">{att}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approval History Timeline */}
          {item.history && item.history.length > 0 && (
            <div>
              <p className="label text-warm-gray mb-3">Approval History</p>
              <div className="space-y-0">
                {item.history.map((step, i) => (
                  <div key={i} className="flex gap-3 relative">
                    {i < item.history!.length - 1 && (
                      <div className="absolute left-[7px] top-6 bottom-0 w-0.5 bg-parchment dark:bg-dm-border" />
                    )}
                    <div className="w-4 h-4 rounded-full bg-gold mt-1 shrink-0" />
                    <div className="pb-4">
                      <p className="text-sm font-medium text-charcoal dark:text-dm-text">{step.action}</p>
                      <p className="text-xs text-warm-gray flex items-center gap-1">
                        <User className="w-3 h-3" /> {step.by} · <Clock className="w-3 h-3" /> {step.date}
                      </p>
                      {step.comment && (
                        <p className="text-xs text-warm-gray mt-1 italic">"{step.comment}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comment field */}
          <div>
            <label className="label text-warm-gray mb-1 block">Add Comment</label>
            <textarea rows={2} placeholder="Enter your comment..." value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold resize-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
          <button onClick={onClose} className="cos-btn cos-btn-secondary text-sm">Close</button>
          <button
            onClick={() => { onDecision('Rejected', comment); onClose(); }}
            className="cos-btn bg-error text-white hover:bg-[#991B1B] text-sm flex items-center gap-1"
          >
            <X className="w-4 h-4" /> Reject
          </button>
          <button
            onClick={() => { onDecision('Approved', comment); onClose(); }}
            className="cos-btn bg-success text-white hover:bg-forest-green text-sm flex items-center gap-1"
          >
            <Check className="w-4 h-4" /> Approve
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================
// Tab — Donors (donor book, pledges, contributions, Official Receipts)
// ============================================
const FIELD_CLS = 'h-10 w-full px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text';

function escHtml(s: string | number): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pesoHtml(amount: number): string {
  return `&#8369;${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Shared print-window scaffold — same new-window + print CSS pattern as
// IntentionsPage's register and RegistryPage's certificates.
function openPrintWindow(title: string, bodyHtml: string): void {
  const win = window.open('', '_blank');
  if (!win) {
    toast.error('Unable to open print window — please allow pop-ups');
    return;
  }
  const parish = getParishConfig();
  win.document.write(`
    <html><head><title>${escHtml(title)}</title>
    <style>
      body{font-family:Georgia,serif;margin:32px;color:#3D3A36;}
      .head h1{font-size:20px;margin:0 0 2px;}
      .head div{font-size:12px;color:#5B5649;}
      h2{font-size:15px;letter-spacing:2px;margin:18px 0 8px;}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-top:8px;}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top;}
      th{background:#F2EFE8;}
      .meta{font-size:12px;color:#8C8374;margin-bottom:8px;}
      .or{font-family:monospace;font-size:16px;font-weight:bold;color:#8B0000;}
      .amount{font-size:18px;font-weight:bold;}
      .sig{margin-top:48px;font-size:13px;}
      .sig .line{display:inline-block;min-width:220px;border-top:1px solid #3D3A36;padding-top:4px;text-align:center;}
      @media print{body{margin:12mm;}}
    </style></head>
    <body>
      <div class="head">
        <h1>${escHtml(parish.parishName)}</h1>
        <div>${escHtml(parish.address)}</div>
        <div>${escHtml(parish.contactNumber)}${parish.email ? ' &middot; ' + escHtml(parish.email) : ''}</div>
      </div>
      ${bodyHtml}
    </body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}

function printReceipt(contribution: Contribution, donor: Donor, campaignName?: string): void {
  openPrintWindow(`Official Receipt ${contribution.orNumber ?? ''}`, `
    <h2>OFFICIAL RECEIPT</h2>
    <div class="or">No. ${escHtml(contribution.orNumber ?? '—')}</div>
    <table>
      <tr><th style="width:180px">Date</th><td>${escHtml(contribution.date)}</td></tr>
      <tr><th>Received from</th><td>${escHtml(donor.name)}${donor.address ? '<br/><span style="color:#8C8374">' + escHtml(donor.address) + '</span>' : ''}</td></tr>
      <tr><th>Amount</th><td class="amount">${pesoHtml(contribution.amount)}</td></tr>
      <tr><th>Payment method</th><td>${escHtml(contribution.method)}</td></tr>
      <tr><th>Purpose</th><td>${escHtml(campaignName ?? 'General donation')}</td></tr>
    </table>
    <div class="sig"><span class="line">${escHtml(getCurrentUserName())}<br/>Received by</span></div>
  `);
}

function printStatement(
  stmt: { donor: Donor; from?: string; to?: string; rows: Contribution[]; totalCent: number },
  campaignName: (id?: string) => string | undefined,
): void {
  const range = `${stmt.from ?? 'beginning'} to ${stmt.to ?? 'present'}`;
  openPrintWindow(`Donor Statement — ${stmt.donor.name}`, `
    <h2>DONOR STATEMENT</h2>
    <div class="meta">${escHtml(stmt.donor.name)} &middot; ${escHtml(range)} &middot; printed ${escHtml(new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }))}</div>
    <table>
      <thead><tr><th>Date</th><th>OR No.</th><th>Purpose</th><th>Method</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>
        ${stmt.rows.map((r) => `<tr><td>${escHtml(r.date)}</td><td>${escHtml(r.orNumber ?? '—')}</td><td>${escHtml(campaignName(r.campaignId) ?? 'General donation')}</td><td>${escHtml(r.method)}</td><td style="text-align:right">${pesoHtml(r.amount)}</td></tr>`).join('')}
        <tr><th colspan="4">Total</th><th style="text-align:right">${pesoHtml(fromCentavos(stmt.totalCent))}</th></tr>
      </tbody>
    </table>
  `);
}

interface DonorRow extends Donor {
  pledged: number;
  given: number;
  percent: number | null;
  lastGift: string;
  [key: string]: unknown;
}

function DonorsTab({ entries, setEntries }: { entries: JournalEntry[]; setEntries: Dispatch<SetStateAction<JournalEntry[]>> }) {
  // The donors module writes through the seam; a version counter re-reads
  // after every mutation (same reread pattern as IntentionsPage).
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const donors = useMemo(() => getDonors(), [version]);
  const campaigns = useMemo(() => getCampaigns(), [version]);
  const pledges = useMemo(() => getPledges(), [version]);
  const contributions = useMemo(() => getContributions(), [version]);

  const [showDonorModal, setShowDonorModal] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [selectedDonorId, setSelectedDonorId] = useState<string | null>(null);
  const selectedDonor = donors.find((d) => d.id === selectedDonorId) ?? null;

  const campaignSummaries = useMemo(
    () => summarizeCampaigns({ campaigns, contributions }),
    [campaigns, contributions],
  );
  const campaignName = (id?: string) => campaigns.find((c) => c.id === id)?.name;

  // FinancePage's lifted journal state stays the single journal writer while
  // this page is mounted — the donors module posts THROUGH it (see JournalDeps).
  const journalDeps = {
    journal: entries,
    appendJournalEntry: (e: JournalEntry) => setEntries((prev) => [e, ...prev]),
  };

  const tableData: DonorRow[] = useMemo(() => donors.map((d) => {
    const progress = donorPledgeProgress(d.id, { pledges, contributions });
    const lastGift = contributions
      .filter((c) => c.donorId === d.id)
      .reduce((latest, c) => (c.date > latest ? c.date : latest), '');
    return {
      ...d,
      pledged: fromCentavos(progress.pledgedCent),
      given: fromCentavos(progress.givenCent),
      percent: progress.percent,
      lastGift,
    };
  }), [donors, pledges, contributions]);

  const columns: Column<DonorRow>[] = [
    { key: 'name', header: 'Donor' },
    { key: 'contact', header: 'Contact', render: (r) => r.contact || <span className="text-warm-gray">—</span>, searchValue: (r) => r.contact },
    { key: 'pledged', header: 'Pledged', width: '120px', render: (r) => <span className="font-mono">{formatPeso(r.pledged)}</span> },
    { key: 'given', header: 'Given', width: '120px', render: (r) => <span className="font-mono">{formatPeso(r.given)}</span> },
    {
      key: 'percent', header: 'Pledge Progress', width: '160px', sortable: false,
      render: (r) => r.percent === null
        ? <span className="text-warm-gray text-xs">No pledge</span>
        : (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 rounded-full bg-cream-dark dark:bg-dm-surface-raised overflow-hidden">
              <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, r.percent)}%` }} />
            </div>
            <span className="text-xs text-warm-gray w-10 text-right">{Math.round(r.percent)}%</span>
          </div>
        ),
      searchValue: () => '',
    },
    { key: 'lastGift', header: 'Last Gift', width: '110px', render: (r) => r.lastGift || <span className="text-warm-gray">—</span> },
  ];

  return (
    <div className="space-y-4">
      {/* Campaign summary cards */}
      {campaignSummaries.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaignSummaries.map(({ campaign, raisedCent, goalCent, percent }) => (
            <div key={campaign.id} className="cos-card">
              <div className="flex items-center justify-between mb-1">
                <p className="body-md font-medium text-charcoal dark:text-dm-text">{campaign.name}</p>
                {!campaign.active && <span className="px-2 py-0.5 rounded-full text-xs bg-cream-dark text-warm-gray dark:bg-dm-surface-raised">Closed</span>}
              </div>
              <p className="font-mono text-lg text-charcoal dark:text-dm-text">{formatPeso(fromCentavos(raisedCent))}
                {goalCent !== null && <span className="text-sm text-warm-gray"> / {formatPeso(fromCentavos(goalCent))}</span>}
              </p>
              {percent !== null ? (
                <div className="mt-2 h-2 rounded-full bg-cream-dark dark:bg-dm-surface-raised overflow-hidden">
                  <div className={`h-full rounded-full ${percent >= 100 ? 'bg-success' : 'bg-gold'}`} style={{ width: `${Math.min(100, percent)}%` }} />
                </div>
              ) : (
                <p className="text-xs text-warm-gray mt-2">No goal set — open-ended drive</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="body-sm text-warm-gray dark:text-dm-text-muted">
          {donors.length} donor{donors.length !== 1 ? 's' : ''} · {contributions.length} contribution{contributions.length !== 1 ? 's' : ''} receipted
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCampaignModal(true)} className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" /> New Campaign
          </button>
          <button onClick={() => setShowDonorModal(true)} className="cos-btn cos-btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Donor
          </button>
        </div>
      </div>

      {/* Donor list */}
      {donors.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No donors yet"
          description="Add donors to track pledges and contributions, and issue Official Receipts for every donation."
          actionLabel="Add Donor"
          actionIcon={Plus}
          onAction={() => setShowDonorModal(true)}
        />
      ) : (
        <DataTable columns={columns} data={tableData} onRowClick={(row) => setSelectedDonorId(row.id)} emptyMessage="No donors found" />
      )}

      <AnimatePresence>
        {showDonorModal && (
          <AddDonorModal onClose={() => setShowDonorModal(false)} onAdded={() => { bump(); setShowDonorModal(false); }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showCampaignModal && (
          <AddCampaignModal onClose={() => setShowCampaignModal(false)} onAdded={() => { bump(); setShowCampaignModal(false); }} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedDonor && (
          <DonorDetailModal
            donor={selectedDonor}
            campaigns={campaigns}
            pledges={pledges.filter((p) => p.donorId === selectedDonor.id)}
            contributions={contributions.filter((c) => c.donorId === selectedDonor.id)}
            campaignName={campaignName}
            journalDeps={journalDeps}
            onChanged={bump}
            onClose={() => setSelectedDonorId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Shared modal chrome for the small donor forms.
function SmallModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-lg overflow-hidden flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border shrink-0">
          <h2 className="heading-md text-charcoal dark:text-dm-text">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </motion.div>
    </motion.div>
  );
}

function AddDonorModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [parishionerQuery, setParishionerQuery] = useState('');
  const [parishionerId, setParishionerId] = useState('');

  /* Live parishioner directory — same lookup RegistryPage's pickers search,
     built from the persisted families store so archived families never appear. */
  const parishioners = useMemo(
    () => buildParishionerLookupFrom(liveOnly(getJSON<Family[]>(KEYS.families, seedFamilies))),
    [],
  );
  const matches = useMemo(() => {
    const q = parishionerQuery.trim().toLowerCase();
    if (!q || parishionerId) return [];
    return parishioners.filter((p) => p.fullName.toLowerCase().includes(q)).slice(0, 8);
  }, [parishionerQuery, parishionerId, parishioners]);

  const pickParishioner = (p: ParishionerLookup) => {
    setParishionerId(p.id);
    setParishionerQuery(p.fullName);
    if (!name.trim()) setName(`${p.firstName} ${p.lastName}`);
    if (!address.trim()) setAddress(p.address);
    if (!contact.trim() && p.contact) setContact(p.contact);
  };

  const handleAdd = () => {
    if (!name.trim()) {
      toast.error('Donor name is required');
      return;
    }
    const donor = addDonor({
      name, contact, address, notes,
      parishionerId: parishionerId || undefined,
    });
    if (donor) {
      toast.success(`Donor "${donor.name}" added`);
      onAdded();
    } else {
      toast.error('Could not add donor');
    }
  };

  return (
    <SmallModal title="Add Donor" onClose={onClose}>
      <div className="space-y-4">
        <div className="relative">
          <label className="label text-warm-gray mb-1 block">Link to parishioner (optional)</label>
          <input
            type="text" value={parishionerQuery}
            onChange={(e) => { setParishionerQuery(e.target.value); setParishionerId(''); }}
            placeholder="Type to search parishioners..."
            className={FIELD_CLS}
          />
          {parishionerId && (
            <p className="text-xs text-success mt-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Linked to the parishioner directory</p>
          )}
          {matches.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-dm-surface border border-parchment dark:border-dm-border rounded-lg shadow-modal max-h-48 overflow-y-auto">
              {matches.map((p) => (
                <button
                  key={p.id}
                  onClick={() => pickParishioner(p)}
                  className="w-full text-left px-3 py-2 text-sm text-charcoal dark:text-dm-text hover:bg-gold-glow/50 transition-colors"
                >
                  {p.fullName}
                  <span className="block text-xs text-warm-gray">{p.familyName} family · {p.address}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="label text-warm-gray mb-1 block">Name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className={FIELD_CLS} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label text-warm-gray mb-1 block">Contact</label>
            <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone / email" className={FIELD_CLS} />
          </div>
          <div>
            <label className="label text-warm-gray mb-1 block">Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address" className={FIELD_CLS} />
          </div>
        </div>
        <div>
          <label className="label text-warm-gray mb-1 block">Notes</label>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" className={FIELD_CLS} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="cos-btn cos-btn-secondary text-sm">Cancel</button>
          <button onClick={handleAdd} className="cos-btn cos-btn-primary text-sm">Add Donor</button>
        </div>
      </div>
    </SmallModal>
  );
}

function AddCampaignModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleAdd = () => {
    if (!name.trim()) {
      toast.error('Campaign name is required');
      return;
    }
    const campaign = addCampaign({
      name,
      goal: parseFloat(goal) || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    if (campaign) {
      toast.success(`Campaign "${campaign.name}" created`);
      onAdded();
    } else {
      toast.error('Could not create campaign');
    }
  };

  return (
    <SmallModal title="New Campaign" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="label text-warm-gray mb-1 block">Name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Church Roof Repair" className={FIELD_CLS} />
        </div>
        <div>
          <label className="label text-warm-gray mb-1 block">Goal (₱, optional)</label>
          <input type="number" min="0" step="0.01" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="0.00" className={FIELD_CLS} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label text-warm-gray mb-1 block">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD_CLS} />
          </div>
          <div>
            <label className="label text-warm-gray mb-1 block">End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={FIELD_CLS} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="cos-btn cos-btn-secondary text-sm">Cancel</button>
          <button onClick={handleAdd} className="cos-btn cos-btn-primary text-sm">Create Campaign</button>
        </div>
      </div>
    </SmallModal>
  );
}

function DonorDetailModal({ donor, campaigns, pledges, contributions, campaignName, journalDeps, onChanged, onClose }: {
  donor: Donor;
  campaigns: Campaign[];
  pledges: Pledge[];
  contributions: Contribution[];
  campaignName: (id?: string) => string | undefined;
  journalDeps: { journal: JournalEntry[]; appendJournalEntry: (e: JournalEntry) => void };
  onChanged: () => void;
  onClose: () => void;
}) {
  const progress = useMemo(
    () => donorPledgeProgress(donor.id, { pledges, contributions }),
    [donor.id, pledges, contributions],
  );

  // Record-contribution form
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ContributionMethod>('cash');
  const [campaignId, setCampaignId] = useState('');
  // Local-timezone default: toISOString() is UTC and lands on YESTERDAY before
  // 8 AM in the Philippines — on Jan 1 that issues the OR into last year's series.
  const [date, setDate] = useState(todayISO());

  // Pledge form
  const [pledgeAmount, setPledgeAmount] = useState('');
  const [pledgeFrequency, setPledgeFrequency] = useState<PledgeFrequency>('one-time');
  const [pledgeCampaignId, setPledgeCampaignId] = useState('');

  // Statement range
  const [stmtFrom, setStmtFrom] = useState('');
  const [stmtTo, setStmtTo] = useState('');

  const handleRecord = () => {
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      toast.error('Contribution amount must be greater than zero');
      return;
    }
    const res = recordContribution(
      { donorId: donor.id, campaignId: campaignId || undefined, date, amount: value, method },
      journalDeps,
    );
    if (res.status !== 'recorded') {
      toast.error('Could not record the contribution');
      return;
    }
    toast.success(`Official Receipt ${res.contribution.orNumber} issued and posted to the ledger`);
    setAmount('');
    onChanged();
    printReceipt(res.contribution, donor, campaignName(res.contribution.campaignId));
  };

  const handleAddPledge = () => {
    const value = parseFloat(pledgeAmount);
    if (!value || value <= 0) {
      toast.error('Pledge amount must be greater than zero');
      return;
    }
    const pledge = addPledge({
      donorId: donor.id,
      campaignId: pledgeCampaignId || undefined,
      amount: value,
      frequency: pledgeFrequency,
    });
    if (pledge) {
      toast.success('Pledge recorded');
      setPledgeAmount('');
      onChanged();
    } else {
      toast.error('Could not record the pledge');
    }
  };

  const statement = () => buildDonorStatement(donor.id, {
    from: stmtFrom || undefined,
    to: stmtTo || undefined,
  });

  const handleStatementPrint = () => {
    const stmt = statement();
    if (!stmt || stmt.rows.length === 0) {
      toast.error('No contributions in the selected range');
      return;
    }
    printStatement(stmt, campaignName);
  };

  const handleStatementCsv = () => {
    const stmt = statement();
    if (!stmt || stmt.rows.length === 0) {
      toast.error('No contributions in the selected range');
      return;
    }
    downloadCsv(
      `donor-statement-${donor.name.replace(/\W+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.csv`,
      ['Date', 'OR Number', 'Purpose', 'Method', 'Amount'],
      [
        ...stmt.rows.map((r) => [r.date, r.orNumber ?? '', campaignName(r.campaignId) ?? 'General donation', r.method, r.amount]),
        ['', '', '', 'Total', fromCentavos(stmt.totalCent)],
      ],
    );
    toast.success(`Exported ${stmt.rows.length} contribution${stmt.rows.length === 1 ? '' : 's'}`);
  };

  const sortedContributions = useMemo(
    () => [...contributions].sort((a, b) => b.date.localeCompare(a.date)),
    [contributions],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
      className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full overflow-hidden flex flex-col"
        style={{ maxWidth: 780, maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border shrink-0">
          <div>
            <h2 className="heading-md text-charcoal dark:text-dm-text flex items-center gap-2">
              {donor.name}
              {donor.parishionerId && (
                <span title="Linked to the parishioner directory" className="inline-flex"><CheckCircle2 className="w-4 h-4 text-success" /></span>
              )}
            </h2>
            <p className="text-xs text-warm-gray">{[donor.contact, donor.address].filter(Boolean).join(' · ') || 'No contact details'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-6">
          {/* Pledge vs given */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="label text-warm-gray">Pledge Progress</p>
              <p className="text-sm font-mono text-charcoal dark:text-dm-text">
                {formatPeso(fromCentavos(progress.givenCent))}
                {progress.pledgedCent > 0 && <span className="text-warm-gray"> of {formatPeso(fromCentavos(progress.pledgedCent))} pledged</span>}
              </p>
            </div>
            {progress.percent !== null ? (
              <div className="h-2.5 rounded-full bg-cream-dark dark:bg-dm-surface-raised overflow-hidden">
                <div className={`h-full rounded-full ${progress.percent >= 100 ? 'bg-success' : 'bg-gold'}`} style={{ width: `${Math.min(100, progress.percent)}%` }} />
              </div>
            ) : (
              <p className="text-xs text-warm-gray">No pledges yet — total given is shown above.</p>
            )}
          </div>

          {/* Record contribution */}
          <div className="p-4 rounded-lg border border-parchment dark:border-dm-border bg-cream-dark/30 dark:bg-dm-surface-raised/30">
            <p className="label text-warm-gray mb-3">Record Contribution (issues Official Receipt)</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="label text-warm-gray mb-1 block">Amount (₱)</label>
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={FIELD_CLS} />
              </div>
              <div>
                <label className="label text-warm-gray mb-1 block">Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value as ContributionMethod)} className={FIELD_CLS}>
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="digital">Digital</option>
                </select>
              </div>
              <div>
                <label className="label text-warm-gray mb-1 block">Campaign</label>
                <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className={FIELD_CLS}>
                  <option value="">General donation</option>
                  {campaigns.filter((c) => c.active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-warm-gray mb-1 block">Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD_CLS} />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <button onClick={handleRecord} className="cos-btn cos-btn-primary text-sm flex items-center gap-1.5">
                <Printer className="w-4 h-4" /> Record &amp; Print Receipt
              </button>
            </div>
          </div>

          {/* Pledges */}
          <div>
            <p className="label text-warm-gray mb-2">Pledges</p>
            {pledges.length === 0
              ? <p className="text-sm text-warm-gray italic mb-2">No pledges recorded.</p>
              : (
                <div className="space-y-1.5 mb-3">
                  {pledges.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-cream-dark/50 dark:bg-dm-surface-raised/50 text-sm">
                      <span className="text-charcoal dark:text-dm-text">
                        {campaignName(p.campaignId) ?? 'General'} · <span className="text-warm-gray">{p.frequency}</span>
                      </span>
                      <span className="font-mono text-charcoal dark:text-dm-text">{formatPeso(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="label text-warm-gray mb-1 block">Pledge (₱)</label>
                <input type="number" min="0" step="0.01" value={pledgeAmount} onChange={(e) => setPledgeAmount(e.target.value)} placeholder="0.00" className={FIELD_CLS} />
              </div>
              <div>
                <label className="label text-warm-gray mb-1 block">Frequency</label>
                <select value={pledgeFrequency} onChange={(e) => setPledgeFrequency(e.target.value as PledgeFrequency)} className={FIELD_CLS}>
                  <option value="one-time">One-time</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="label text-warm-gray mb-1 block">Campaign</label>
                <select value={pledgeCampaignId} onChange={(e) => setPledgeCampaignId(e.target.value)} className={FIELD_CLS}>
                  <option value="">General</option>
                  {campaigns.filter((c) => c.active).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={handleAddPledge} className="cos-btn cos-btn-secondary text-sm h-10">Add Pledge</button>
            </div>
          </div>

          {/* Contributions */}
          <div>
            <p className="label text-warm-gray mb-2">Contributions</p>
            {sortedContributions.length === 0
              ? <p className="text-sm text-warm-gray italic">No contributions yet.</p>
              : (
                <div className="border border-parchment rounded-lg overflow-hidden dark:border-dm-border">
                  <table className="w-full text-sm">
                    <thead className="bg-cream-dark dark:bg-dm-surface-raised">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-warm-gray text-xs">Date</th>
                        <th className="text-left px-3 py-2 font-medium text-warm-gray text-xs">OR No.</th>
                        <th className="text-left px-3 py-2 font-medium text-warm-gray text-xs">Purpose</th>
                        <th className="text-left px-3 py-2 font-medium text-warm-gray text-xs">Method</th>
                        <th className="text-right px-3 py-2 font-medium text-warm-gray text-xs">Amount</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortedContributions.map((c) => (
                        <tr key={c.id} className="border-b border-parchment/40 last:border-0">
                          <td className="px-3 py-2 text-charcoal dark:text-dm-text">{c.date}</td>
                          <td className="px-3 py-2 font-mono text-gold">{c.orNumber ?? '—'}</td>
                          <td className="px-3 py-2 text-charcoal dark:text-dm-text">{campaignName(c.campaignId) ?? 'General'}</td>
                          <td className="px-3 py-2 text-warm-gray capitalize">{c.method}</td>
                          <td className="px-3 py-2 text-right font-mono text-charcoal dark:text-dm-text">{formatPeso(c.amount)}</td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => printReceipt(c, donor, campaignName(c.campaignId))}
                              className="p-1 rounded text-warm-gray hover:text-gold transition-colors"
                              title="Reprint receipt"
                              aria-label={`Reprint receipt ${c.orNumber ?? ''}`}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>

          {/* Donor statement */}
          <div className="p-4 rounded-lg border border-parchment dark:border-dm-border">
            <p className="label text-warm-gray mb-3">Donor Statement</p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label text-warm-gray mb-1 block">From</label>
                <input type="date" value={stmtFrom} onChange={(e) => setStmtFrom(e.target.value)} className={FIELD_CLS} />
              </div>
              <div>
                <label className="label text-warm-gray mb-1 block">To</label>
                <input type="date" value={stmtTo} onChange={(e) => setStmtTo(e.target.value)} className={FIELD_CLS} />
              </div>
              <button onClick={handleStatementPrint} className="cos-btn cos-btn-secondary text-sm h-10 flex items-center gap-1.5">
                <Printer className="w-4 h-4" /> Print
              </button>
              <button onClick={handleStatementCsv} className="cos-btn cos-btn-secondary text-sm h-10 flex items-center gap-1.5">
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================
// Tab — Waivers (fee-override hash chain UI)
// ============================================
const WAIVER_SACRAMENTS = ['Baptism', 'Marriage', 'Confirmation', 'Funeral', 'Mass Intention', 'Certificate', 'Other'];

interface WaiverRow extends FeeOverrideChainEntry {
  chainIndex: number;
  [key: string]: unknown;
}

function WaiversTab() {
  const [version, setVersion] = useState(0);
  const chain = useMemo(() => getFeeOverrideChain(), [version]);
  const localVerdict = useMemo(() => verifyFeeOverrideChain(chain), [chain]);
  const flags = useMemo(() => flagSelfApprovals(chain), [chain]);

  // AUTHORITATIVE verification: in cloud mode the local djb2 is forgeable (the client
  // both writes and recomputes it), so trust the server verify_audit RPC (keyed HMAC +
  // linkage walk) when it answers; fall back to the local advisory check otherwise.
  const [serverVerdict, setServerVerdict] = useState<Awaited<ReturnType<typeof serverVerifyFeeOverrideChain>>>(null);
  useEffect(() => {
    let alive = true;
    serverVerifyFeeOverrideChain().then((v) => { if (alive) setServerVerdict(v); });
    return () => { alive = false; };
  }, [version]);
  const serverChecked = !!serverVerdict?.checked;
  const verdict = serverChecked
    ? { intact: serverVerdict!.allOk, brokenAt: serverVerdict!.allOk ? -1 : 0 }
    : localVerdict;
  const flaggedApprovers = useMemo(() => new Set(flags.map((f) => f.by.toLowerCase())), [flags]);

  const [sacrament, setSacrament] = useState(WAIVER_SACRAMENTS[0]);
  const [personName, setPersonName] = useState('');
  const [originalFee, setOriginalFee] = useState('');
  const [waivedAmount, setWaivedAmount] = useState('');
  const [reason, setReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('');

  const handleRecord = () => {
    const res = recordFeeWaiver({
      sacrament,
      personName,
      originalFee: parseFloat(originalFee),
      waivedAmount: parseFloat(waivedAmount),
      reason,
      approvedBy,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success('Waiver recorded in the tamper-evident audit chain');
    setPersonName('');
    setOriginalFee('');
    setWaivedAmount('');
    setReason('');
    setApprovedBy('');
    setVersion((v) => v + 1);
  };

  // Newest first for display; chainIndex keeps the verification position.
  const rows: WaiverRow[] = useMemo(
    () => chain.map((e, i) => ({ ...e, chainIndex: i })).reverse(),
    [chain],
  );

  const columns: Column<WaiverRow>[] = [
    { key: 'timestamp', header: 'When', width: '110px', render: (r) => r.timestamp.split('T')[0] },
    { key: 'sacrament', header: 'Sacrament', width: '120px', render: (r) => <span className="capitalize">{r.sacrament}</span> },
    { key: 'personName', header: 'For' },
    {
      key: 'overrideType', header: 'Type', width: '100px',
      render: (r) => (
        <span className={
          'px-2 py-0.5 rounded-full text-xs font-medium ' +
          (r.overrideType === 'waived' ? 'bg-warning/10 text-warning'
            : r.overrideType === 'bill_later' ? 'bg-info/10 text-info'
            : 'bg-success/10 text-success')
        }>
          {r.overrideType === 'bill_later' ? 'bill later' : r.overrideType}
        </span>
      ),
    },
    {
      key: 'amount', header: 'Amount', width: '130px',
      render: (r) => (
        <span className="font-mono">
          {formatPeso(r.amount)}
          {typeof r.originalFee === 'number' && r.originalFee !== r.amount && (
            <span className="text-xs text-warm-gray"> / {formatPeso(r.originalFee)}</span>
          )}
        </span>
      ),
    },
    { key: 'reason', header: 'Reason', render: (r) => <span className="block max-w-[220px] truncate" title={r.reason}>{r.reason}</span>, searchValue: (r) => r.reason },
    {
      key: 'approvedBy', header: 'Approved By', width: '150px',
      render: (r) => {
        const self = isSelfApprovedWaiver(r);
        const flagged = self && !!r.approvedBy && flaggedApprovers.has(r.approvedBy.toLowerCase());
        return (
          <span className="flex items-center gap-1">
            {r.approvedBy ?? r.recordedBy}
            {flagged && (
              <span title={`Self-approved — this approver's self-approved waivers total ≥ ${formatPesoWhole(SELF_APPROVAL_FLAG_THRESHOLD)}`}>
                <ShieldAlert className="w-3.5 h-3.5 text-error" />
              </span>
            )}
            {self && !flagged && (
              <span title="Self-approved (recorded and approved by the same person)">
                <AlertCircle className="w-3.5 h-3.5 text-warning" />
              </span>
            )}
          </span>
        );
      },
      searchValue: (r) => r.approvedBy ?? r.recordedBy,
    },
    {
      key: 'chainIndex', header: 'Chain', width: '70px', sortable: false,
      render: (r) => verdict.intact || r.chainIndex < verdict.brokenAt
        ? <span title="Entry verified against the hash chain"><ShieldCheck className="w-4 h-4 text-success" /></span>
        : <span title="At or after the break point — history was edited or deleted outside the app"><ShieldAlert className="w-4 h-4 text-error" /></span>,
      searchValue: () => '',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Chain verification banner */}
      <div className={
        'flex items-center gap-3 p-4 rounded-lg border ' +
        (verdict.intact
          ? 'border-success/30 bg-success/5 text-success'
          : 'border-error/30 bg-error/5 text-error')
      }>
        {verdict.intact ? <ShieldCheck className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
        <div>
          <p className="text-sm font-medium">
            {verdict.intact
              ? `Audit chain intact — ${chain.length} entr${chain.length === 1 ? 'y' : 'ies'} verified`
              : serverChecked
                ? `Audit chain BROKEN — the server flagged ${serverVerdict!.failedClientIds.length} tampered or back-dated entr${serverVerdict!.failedClientIds.length === 1 ? 'y' : 'ies'}`
                : `Audit chain BROKEN at entry #${verdict.brokenAt + 1} — history was edited or deleted outside the app`}
          </p>
          <p className="text-xs opacity-80">
            {serverChecked
              ? 'Verified on the server: each waiver carries a keyed HMAC (key never leaves the database) and is linked genesis-to-tip, so forged or back-dated entries are detectable.'
              : 'Every waiver is hash-chained to the one before it (shared with the Registry fee-override trail), so silent edits are detectable.'}
          </p>
        </div>
      </div>

      {/* Self-approval flags (diocese cockpit semantics) */}
      {flags.length > 0 && (
        <div className="p-4 rounded-lg border border-warning/40 bg-warning/5">
          <p className="text-sm font-medium text-warning flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4" /> Waivers to review — self-approved totaling ≥ {formatPesoWhole(SELF_APPROVAL_FLAG_THRESHOLD)}
          </p>
          <ul className="space-y-1">
            {flags.map((f) => (
              <li key={f.by} className="text-sm text-charcoal dark:text-dm-text">
                {f.count} waiver{f.count > 1 ? 's' : ''} approved by <span className="font-medium">{f.by}</span> for themselves, totaling <span className="font-mono">{formatPeso(f.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Record waiver form */}
      <div className="cos-card">
        <p className="label text-warm-gray mb-3">Record Fee Waiver</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label text-warm-gray mb-1 block">Sacrament / service</label>
            <select value={sacrament} onChange={(e) => setSacrament(e.target.value)} className={FIELD_CLS}>
              {WAIVER_SACRAMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label text-warm-gray mb-1 block">For (person / family)</label>
            <input type="text" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="e.g. Dela Cruz family" className={FIELD_CLS} />
          </div>
          <div>
            <label className="label text-warm-gray mb-1 block">Original fee (₱)</label>
            <input type="number" min="0" step="0.01" value={originalFee} onChange={(e) => setOriginalFee(e.target.value)} placeholder="0.00" className={FIELD_CLS} />
          </div>
          <div>
            <label className="label text-warm-gray mb-1 block">Waived amount (₱)</label>
            <input type="number" min="0" step="0.01" value={waivedAmount} onChange={(e) => setWaivedAmount(e.target.value)} placeholder="0.00" className={FIELD_CLS} />
          </div>
          <div className="col-span-2">
            <label className="label text-warm-gray mb-1 block">Reason (min 5 characters)</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this fee being waived?" className={FIELD_CLS} />
          </div>
          <div className="col-span-2">
            <label className="label text-warm-gray mb-1 block">Approved by</label>
            <input type="text" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Who authorized this waiver" className={FIELD_CLS} />
          </div>
        </div>
        <div className="flex justify-end mt-3">
          <button onClick={handleRecord} className="cos-btn cos-btn-primary text-sm">Record Waiver</button>
        </div>
      </div>

      {/* Past waivers */}
      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No fee overrides recorded"
          description="Waivers recorded here (and fee overrides from the Registry) appear in one shared tamper-evident audit trail."
        />
      ) : (
        <DataTable columns={columns} data={rows} emptyMessage="No waivers found" />
      )}
    </div>
  );
}
