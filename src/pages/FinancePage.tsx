import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign, ChevronRight, ChevronDown, Plus, X, Upload,
  CheckCircle2, AlertCircle, FileText, Download, Eye,
  TrendingUp, Calendar, Clock, User, Search,
  Check, Trash2, Edit3, BookOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import StatCard from '@/components/StatCard';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import EmptyState from '@/components/EmptyState';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import { getLabel } from '@/lib/friendlyLabels';
import {
  chartOfAccounts, journalEntries, collectionsData, budgetData, approvalItems,
  getLeafAccounts, formatPeso, formatPesoWhole,
  getAmountApprovalLevel,
} from '@/lib/financeData';
import type { Account, JournalEntry, JournalLine, Collection, BudgetItem, ApprovalItem } from '@/lib/financeData';
import { usePersistedState } from '@/hooks/usePersistedState';
import { KEYS } from '@/lib/storageKeys';
import { getCurrentUserName } from '@/lib/session';

// ============================================
// Types
// ============================================
type TabId = 'coa' | 'journal' | 'collections' | 'budget' | 'analytics' | 'approvals';

interface ExpandedState { [key: string]: boolean }

// ============================================
// FinancePage — Main Component
// ============================================
export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<TabId>('coa');

  // KPI Card data
  const kpiCards = [
    { title: 'Total Assets', value: '₱2,456,789', icon: DollarSign, trend: { value: '+3.2%', direction: 'up' as const }, onClick: () => setActiveTab('coa') },
    { title: 'Cash on Hand', value: '₱245,680', icon: DollarSign, trend: { value: '+1.8%', direction: 'up' as const, isAlert: true }, onClick: () => setActiveTab('collections') },
    { title: 'YTD Income', value: '₱1,847,350', icon: TrendingUp, trend: { value: '+8.5%', direction: 'up' as const }, onClick: () => setActiveTab('budget') },
    { title: 'Pending Approvals', value: '3', icon: AlertCircle, trend: { value: '₱180K council review, ₱320K consent needed, ₱650K bishop approval', direction: 'neutral' as const, isAlert: true }, onClick: () => setActiveTab('approvals') },
  ];

  const tabs: { id: TabId; label: string }[] = [
    { id: 'coa', label: 'Chart of Accounts' },
    { id: 'journal', label: 'Journal' },
    { id: 'collections', label: 'Collections' },
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

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
        >
          {activeTab === 'coa' && <ChartOfAccountsTab />}
          {activeTab === 'journal' && <JournalTab />}
          {activeTab === 'collections' && <CollectionsTab />}
          {activeTab === 'budget' && <BudgetTab />}
          {activeTab === 'analytics' && <AnalyticsDashboard />}
          {activeTab === 'approvals' && <ApprovalsTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Tab 1 — Chart of Accounts (Tree View)
// ============================================
function ChartOfAccountsTab() {
  const [expanded, setExpanded] = useState<ExpandedState>({
    '1000': true, '1100': true, '1200': false,
    '2000': false, '3000': false, '4000': false, '5000': false,
  });
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const toggle = (code: string) => setExpanded((prev) => ({ ...prev, [code]: !prev[code] }));

  const expandAll = () => {
    const all: ExpandedState = {};
    function mark(accs: Account[]) {
      for (const a of accs) {
        if (a.children) { all[a.code] = true; mark(a.children); }
      }
    }
    mark(chartOfAccounts);
    setExpanded(all);
  };

  const collapseAll = () => setExpanded({});

  // Filter accounts by search
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return chartOfAccounts;
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
    return filter(chartOfAccounts);
  }, [searchQuery]);

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
        </div>
      </div>

      {/* Detail Panel */}
      <div className="lg:col-span-1">
        <AnimatePresence mode="wait">
          {selectedAccount ? (
            <motion.div
              key={selectedAccount.code}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
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
                    {journalEntries
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
                    {journalEntries.filter((je) => je.lines.some((l) => l.accountCode === selectedAccount.code || l.accountName === selectedAccount.name)).length === 0 && (
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
function JournalTab() {
  const [showModal, setShowModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [entries, setEntries] = usePersistedState<JournalEntry[]>(KEYS.journalEntries, journalEntries);

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
          <button className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Journal Entries List */}
      <div className="space-y-3">
        {tableData.map((row, i) => (
          <JournalEntryCard key={row.id} entry={row.raw} index={i} />
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
            onPost={(entry) => setEntries((prev) => [entry, ...prev])}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function JournalEntryCard({ entry, index }: { entry: JournalEntry; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="cos-card p-0 overflow-hidden border-l-4 border-l-success"
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
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">{entry.status}</span>
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
                <button className="text-xs px-3 py-1.5 rounded-lg bg-cream-dark text-warm-gray hover:bg-parchment transition-all flex items-center gap-1">
                  <Eye className="w-3 h-3" /> View
                </button>
                <button className="text-xs px-3 py-1.5 rounded-lg bg-cream-dark text-warm-gray hover:bg-parchment transition-all flex items-center gap-1">
                  <Edit3 className="w-3 h-3" /> Edit
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Transaction Entry Modal (800px wide)
function TransactionModal({ onClose, onPost }: { onClose: () => void; onPost: (entry: JournalEntry) => void }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<JournalLine[]>([
    { accountCode: '', accountName: '', debit: 0, credit: 0 },
    { accountCode: '', accountName: '', debit: 0, credit: 0 },
  ]);

  const leafAccounts = useMemo(() => getLeafAccounts(), []);

  const totalDr = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCr = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0;
  const diff = Math.abs(totalDr - totalCr);

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
      return { ...l, [field]: value };
    }));
  };

  const handlePost = () => {
    if (!isBalanced) {
      toast.error('Cannot post unbalanced entry');
      return;
    }
    const entry: JournalEntry = {
      id: `JE-${Date.now()}`,
      date,
      reference: reference.trim() || `REF-${Date.now()}`,
      description: description.trim(),
      lines: lines.filter((l) => l.accountCode),
      status: 'Posted',
      postedBy: getCurrentUserName(),
      totalDr,
      totalCr,
    };
    onPost(entry);
    toast.success('Transaction posted to ledger');
    onClose();
  };

  const handleSaveDraft = () => {
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
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="h-10 w-full px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
            </div>
            <div>
              <label className="label text-warm-gray mb-1 block">Reference #</label>
              <input type="text" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Auto: JV-2025-0026"
                className="h-10 w-full px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
            </div>
          </div>
          <div className="mb-5">
            <label className="label text-warm-gray mb-1 block">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Transaction description..."
              className="h-10 w-full px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
          </div>

          {/* Document upload area */}
          <div className="mb-5 p-4 border-2 border-dashed border-parchment rounded-lg text-center hover:border-gold/50 transition-colors cursor-pointer">
            <Upload className="w-6 h-6 text-warm-gray mx-auto mb-2" />
            <p className="text-sm text-warm-gray">Drop supporting documents here or click to browse</p>
          </div>

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
function CollectionsTab() {
  const [collectionDate, setCollectionDate] = useState('2025-01-05');
  const [massTime, setMassTime] = useState('8:00 AM');
  const [cashAmount, setCashAmount] = useState('');
  const [checksAmount, setChecksAmount] = useState('');
  const [digitalAmount, setDigitalAmount] = useState('');
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [collections, setCollections] = usePersistedState<Collection[]>(KEYS.collections, collectionsData);

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
          <button className="cos-btn cos-btn-secondary text-sm flex items-center gap-1.5">
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
function BudgetTab() {
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAccount, setEditAccount] = useState<BudgetItem | null>(null);
  const [items, setItems] = usePersistedState<BudgetItem[]>(KEYS.budgetItems, budgetData);

  const incomeItems = items.filter((b) => b.category === 'Income');
  const expenseItems = items.filter((b) => b.category === 'Expense');

  const totalBudget = items.reduce((s, b) => s + b.budgetYTD, 0);
  const totalActual = items.reduce((s, b) => s + b.actualYTD, 0);
  const totalVariance = totalBudget - totalActual;

  const handleSaveBudget = (accountCode: string, budgetYTD: number) => {
    setItems((prev) =>
      prev.map((b) =>
        b.accountCode === accountCode
          ? { ...b, budgetYTD, variance: budgetYTD - b.actualYTD, variancePercent: budgetYTD > 0 ? ((budgetYTD - b.actualYTD) / budgetYTD) * 100 : 0 }
          : b,
      ),
    );
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
          <BudgetEditModal account={editAccount} onSave={handleSaveBudget} onClose={() => { setShowEditModal(false); setEditAccount(null); }} />
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

function BudgetEditModal({ account, onClose, onSave }: { account: BudgetItem | null; onClose: () => void; onSave: (accountCode: string, budgetYTD: number) => void }) {
  const [budgetAmount, setBudgetAmount] = useState(account ? String(account.budgetYTD) : '');
  const leafAccounts = useMemo(() => getLeafAccounts(), []);

  const handleSave = () => {
    if (account) {
      onSave(account.accountCode, parseFloat(budgetAmount) || 0);
      toast.success('Budget updated successfully');
    } else {
      toast.info('Select an existing budget line to edit its amount.');
    }
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
              <select className="h-10 w-full px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text">
                <option value="">Select account...</option>
                {leafAccounts.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                ))}
              </select>
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
            <textarea rows={3} placeholder="Optional notes..."
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
function ApprovalsTab() {
  const [filter, setFilter] = useState<'All' | 'Council Review' | 'Council Consent' | 'Bishop Approval'>('All');
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);

  const filteredItems = useMemo(() => {
    if (filter === 'All') return approvalItems;
    return approvalItems.filter((a) => a.category === filter);
  }, [filter]);

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
          <ApprovalCard key={item.id} item={item} onView={() => setSelectedApproval(item)} />
        ))}
        {filteredItems.length === 0 && (
          <div className="cos-card p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-success/30 mx-auto mb-3" />
            <p className="text-warm-gray">No pending approvals in this category.</p>
          </div>
        )}
      </div>

      {/* Approval Detail Modal */}
      <AnimatePresence>
        {selectedApproval && (
          <ApprovalDetailModal item={selectedApproval} onClose={() => setSelectedApproval(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function ApprovalCard({ item, onView }: { item: ApprovalItem; onView: () => void }) {
  const badgeColor =
    item.category === 'Council Review' ? 'bg-warning/15 text-[#9A7B3D]' :
    item.category === 'Council Consent' ? 'bg-orange-100 text-orange-700' :
    'bg-purple-100 text-purple-700';

  const [status, setStatus] = useState(item.status);

  const handleApprove = () => {
    setStatus('Approved');
    toast.success(`${item.title} approved`);
  };

  const handleReject = () => {
    setStatus('Rejected');
    toast.error(`${item.title} rejected`);
  };

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

function ApprovalDetailModal({ item, onClose }: { item: ApprovalItem; onClose: () => void }) {
  const badgeColor =
    item.category === 'Council Review' ? 'bg-warning/15 text-[#9A7B3D]' :
    item.category === 'Council Consent' ? 'bg-orange-100 text-orange-700' :
    'bg-purple-100 text-purple-700';

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
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}>{item.category.toUpperCase()}</span>
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
            <textarea rows={2} placeholder="Enter your comment..."
              className="w-full px-3 py-2 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold resize-none dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
          <button onClick={onClose} className="cos-btn cos-btn-secondary text-sm">Close</button>
          <button onClick={() => { toast.success('Approved'); onClose(); }} className="cos-btn bg-success text-white hover:bg-forest-green text-sm flex items-center gap-1">
            <Check className="w-4 h-4" /> Approve
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
