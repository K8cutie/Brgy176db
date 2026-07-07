import { Fragment, useState, useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Scale,
  TrendingUp,
  BookOpen,
  BarChart3,
  DollarSign,
  X,
  Download,
  Printer,
  Eye,
  CheckCircle,
  ChevronDown,
  Calendar,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { reports, sacramentalStatsData } from '@/lib/reportData';
import type { ReportType } from '@/lib/reportData';
// Financial reports derive LIVE from the same persisted stores FinancePage
// writes (same KEYS + same seed fallbacks, so the two pages always agree).
import { journalEntries, collectionsData, budgetData } from '@/lib/financeData';
import type { JournalEntry, Collection, BudgetItem } from '@/lib/financeData';
import {
  deriveTrialBalance,
  deriveIncomeStatement,
  deriveBalanceSheet,
  deriveBudgetActuals,
  deriveCollectionSummary,
} from '@/lib/ledger';
import type {
  Period,
  TrialBalanceResult,
  IncomeStatementResult,
  BalanceSheetResult,
  CollectionSummaryRow,
} from '@/lib/ledger';
import { usePersistedState } from '@/hooks/usePersistedState';
import { KEYS } from '@/lib/storageKeys';
import EmptyState from '@/components/EmptyState';
import { getLabel } from '@/lib/friendlyLabels';

/* ─── Report Icons Map ─── */
const reportIconMap: Record<string, typeof Scale> = {
  Scale,
  TrendingUp,
  BookOpen,
  BarChart3,
  DollarSign,
};

/* ─── Period Options ─── */
const periodOptions = [
  'All Time',
  'This Month',
  'Last Month',
  'This Quarter',
  'This Year',
  'Custom Range',
];

function localISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Resolve a period option to an inclusive date range; undefined = all time.
function resolvePeriod(option: string, customFrom: string, customTo: string): Period | undefined {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (option) {
    case 'This Month': return { from: localISO(new Date(y, m, 1)), to: localISO(new Date(y, m + 1, 0)) };
    case 'Last Month': return { from: localISO(new Date(y, m - 1, 1)), to: localISO(new Date(y, m, 0)) };
    case 'This Quarter': {
      const qStart = Math.floor(m / 3) * 3;
      return { from: localISO(new Date(y, qStart, 1)), to: localISO(new Date(y, qStart + 3, 0)) };
    }
    case 'This Year': return { from: `${y}-01-01`, to: `${y}-12-31` };
    case 'Custom Range': return customFrom && customTo ? { from: customFrom, to: customTo } : undefined;
    default: return undefined; // All Time
  }
}

/* ─── Pie chart colors ─── */
const PIE_COLORS = ['#C9963B', '#1B2A4A', '#2D6A4F'];

/* ─── Main Component ─── */
export default function ReportsPage() {
  const [activeFilter, setActiveFilter] = useState<'All' | 'Financial' | 'Sacramental'>('All');
  const [genReport, setGenReport] = useState<ReportType | null>(null);
  const [previewReport, setPreviewReport] = useState<ReportType | null>(null);
  const [previewPeriod, setPreviewPeriod] = useState('All Time');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customError, setCustomError] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);

  // The same stores FinancePage writes; seeds match so both pages agree.
  const [entries] = usePersistedState<JournalEntry[]>(KEYS.journalEntries, journalEntries);
  const [collections] = usePersistedState<Collection[]>(KEYS.collections, collectionsData);
  const [budgetItems] = usePersistedState<BudgetItem[]>(KEYS.budgetItems, budgetData);

  const period = useMemo(() => resolvePeriod(previewPeriod, customFrom, customTo), [previewPeriod, customFrom, customTo]);
  const trialBalance = useMemo(() => deriveTrialBalance(entries, collections, period), [entries, collections, period]);
  const incomeStatement = useMemo(() => deriveIncomeStatement(entries, collections, period), [entries, collections, period]);
  const balanceSheet = useMemo(() => deriveBalanceSheet(entries, collections, period), [entries, collections, period]);
  const budgetActuals = useMemo(() => deriveBudgetActuals(entries, collections, budgetItems, period), [entries, collections, budgetItems, period]);
  const collectionRows = useMemo(() => deriveCollectionSummary(collections, period), [collections, period]);

  // "As of" label for point-in-time statements.
  const asOfLabel = formatDate(period?.to ?? localISO(new Date()));

  const filteredReports = reports.filter((r) => {
    if (activeFilter === 'All') return true;
    return r.category === activeFilter;
  });

  const handleGenerate = (reportId: ReportType) => {
    // Validate custom range before opening the preview.
    if (previewPeriod === 'Custom Range') {
      if (!customFrom || !customTo) {
        setCustomError('Select both a start and end date.');
        return;
      }
      if (customFrom > customTo) {
        setCustomError('Start date must be on or before the end date.');
        return;
      }
    }
    setCustomError('');
    setGenReport(null);
    setPreviewReport(reportId);
  };

  // Human-readable label for the period shown in the preview header.
  const periodLabel =
    previewPeriod === 'Custom Range' && customFrom && customTo
      ? `${formatDate(customFrom)} — ${formatDate(customTo)}`
      : previewPeriod;

  const handleDownloadCSV = useCallback(() => {
    if (!previewReport) return;
    let csv = '';
    switch (previewReport) {
      case 'trial-balance':
        csv = generateTrialBalanceCSV(trialBalance);
        break;
      case 'income-statement':
        csv = generateIncomeStatementCSV(incomeStatement);
        break;
      case 'balance-sheet':
        csv = generateBalanceSheetCSV(balanceSheet);
        break;
      case 'budget-vs-actual':
        csv = generateBudgetActualCSV(budgetActuals);
        break;
      case 'sacramental-statistics':
        csv = generateSacramentalCSV();
        break;
      case 'collection-summary':
        csv = generateCollectionCSV(collectionRows);
        break;
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${previewReport.replace(/-/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [previewReport, trialBalance, incomeStatement, balanceSheet, budgetActuals, collectionRows]);

  const handlePrint = useCallback(() => {
    const content = previewRef.current;
    if (!content) return;
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Print was blocked. Please allow pop-ups for this site and try again.');
      return;
    }
    w.document.write(`
      <html><head><title>ChurchOS Report</title>
      <style>
        body { font-family: Inter, sans-serif; padding: 24px; color: #3D3A36; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #EAE5D9; }
        th { background: #F2EFE8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
        .header { text-align: center; margin-bottom: 24px; }
        .header h1 { font-family: 'Playfair Display', serif; font-size: 20px; margin: 0; }
        .header p { margin: 4px 0; font-size: 13px; color: #8C8374; }
        .total-row { font-weight: 600; background: #F2EFE8; }
        .section-header { font-weight: 600; background: #FAF8F3; }
        .text-right { text-align: right; }
        @media print { body { padding: 0; } }
      </style></head><body>${content.innerHTML}</body></html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 200);
  }, []);

  return (
    <div className="space-y-6">
      {/* ─── Module Header ─── */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-full bg-gold-glow flex items-center justify-center">
          <FileText className="w-5 h-5 text-gold" />
        </div>
        <div>
          <h1 className="display-md font-playfair text-charcoal dark:text-dm-text">Reports</h1>
          <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-1">
            Generate financial statements, sacramental statistics, and parish reports in CBCP-compliant formats. Export to CSV or print.
          </p>
        </div>
      </div>

      {/* ─── Filter Tabs ─── */}
      <div className="flex items-center gap-1 border-b border-parchment dark:border-dm-border">
        {(['All', 'Financial', 'Sacramental'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={
              'px-5 py-2.5 text-sm font-medium transition-all relative ' +
              (activeFilter === tab
                ? 'text-gold'
                : 'text-warm-gray dark:text-dm-text-muted hover:text-charcoal dark:hover:text-dm-text')
            }
          >
            {tab}
            {activeFilter === tab && (
              <motion.div
                layoutId="report-filter-tab"
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold"
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ─── Report Cards Grid ─── */}
      {filteredReports.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={getLabel('reports.empty.title', 'Not enough data for reports')}
          description={getLabel('reports.empty.description', 'Once you have sacrament records and financial entries, reports will be generated automatically.')}
          tip={getLabel('reports.empty.tip', 'Try adding some records in the Registry and Finance modules first.')}
        />
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredReports.map((report, i) => {
          const Icon = reportIconMap[report.icon] || FileText;
          const iconBg = report.category === 'Financial' ? 'bg-deep-navy' : 'bg-forest-green';
          return (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.06, ease: [0, 0, 0.2, 1] as [number, number, number, number] }}
              className="cos-card cos-card-hover flex flex-col"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="heading-md text-charcoal dark:text-dm-text">{report.title}</h3>
                  <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-1 line-clamp-2">{report.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="cos-badge cos-badge-default">CSV</span>
                <span className="cos-badge cos-badge-default">Print</span>
              </div>
              <div className="flex items-center gap-2 mt-auto pt-3 border-t border-parchment/40 dark:border-dm-border">
                <button
                  onClick={() => setGenReport(report.id)}
                  className="cos-btn cos-btn-secondary text-xs py-2 px-4"
                >
                  Preview Report
                </button>
                <button
                  onClick={() => handleGenerate(report.id)}
                  className="cos-btn text-xs py-2 px-4 text-warm-gray hover:text-charcoal hover:bg-parchment/50 dark:text-dm-text-muted dark:hover:text-dm-text transition-all"
                >
                  <Eye className="w-4 h-4" />
                  Quick Preview
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>
      )}

      {/* ═══════════════════════════════════════════════
          MODAL: Generate Report Parameters
      ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {genReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-modal flex items-center justify-center p-4 modal-overlay"
            onClick={() => setGenReport(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <h3 className="heading-lg text-charcoal dark:text-dm-text">
                  Preview {reports.find((r) => r.id === genReport)?.title}
                </h3>
                <button
                  onClick={() => setGenReport(null)}
                  className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors"
                >
                  <X className="w-5 h-5 text-warm-gray dark:text-dm-text-muted" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                {/* Period */}
                <div>
                  <label className="label text-warm-gray dark:text-dm-text-muted mb-2 block">Report Period</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
                    <select
                      value={previewPeriod}
                      onChange={(e) => {
                        setPreviewPeriod(e.target.value);
                        setCustomError('');
                      }}
                      className="w-full h-10 pl-9 pr-8 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text appearance-none"
                    >
                      {periodOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray pointer-events-none" />
                  </div>
                </div>

                {/* Custom Range date pickers */}
                {previewPeriod === 'Custom Range' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-warm-gray dark:text-dm-text-muted mb-2 block">From</label>
                      <input
                        type="date"
                        value={customFrom}
                        max={customTo || undefined}
                        onChange={(e) => {
                          setCustomFrom(e.target.value);
                          setCustomError('');
                        }}
                        className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                      />
                    </div>
                    <div>
                      <label className="label text-warm-gray dark:text-dm-text-muted mb-2 block">To</label>
                      <input
                        type="date"
                        value={customTo}
                        min={customFrom || undefined}
                        onChange={(e) => {
                          setCustomTo(e.target.value);
                          setCustomError('');
                        }}
                        className="w-full h-10 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface dark:border-dm-border dark:text-dm-text"
                      />
                    </div>
                  </div>
                )}
                {customError && (
                  <p className="text-xs text-error font-medium">{customError}</p>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
                <button
                  onClick={() => setGenReport(null)}
                  className="cos-btn cos-btn-secondary text-sm py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleGenerate(genReport)}
                  className="cos-btn cos-btn-primary text-sm py-2 px-4"
                >
                  <CheckCircle className="w-4 h-4" />
                  Preview
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════
          MODAL: Report Preview (XL)
      ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {previewReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-modal flex items-start justify-center pt-6 pb-6 px-4 modal-overlay overflow-y-auto"
            onClick={() => setPreviewReport(null)}
          >
            <motion.div
              initial={{ opacity: 0, x: 30, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
              className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full"
              style={{ maxWidth: 1100 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Preview Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
                <div>
                  <h3 className="heading-lg text-charcoal dark:text-dm-text">
                    {reports.find((r) => r.id === previewReport)?.title}
                  </h3>
                  <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-0.5">
                    {periodLabel} — Generated {new Date().toLocaleDateString('en-PH')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownloadCSV}
                    className="cos-btn cos-btn-secondary text-xs py-2 px-3"
                  >
                    <Download className="w-4 h-4" />
                    Download CSV
                  </button>
                  <button
                    onClick={handlePrint}
                    className="cos-btn cos-btn-secondary text-xs py-2 px-3"
                  >
                    <Printer className="w-4 h-4" />
                    Print
                  </button>
                  <button
                    onClick={() => setPreviewReport(null)}
                    className="p-1.5 rounded-lg hover:bg-cream-dark dark:hover:bg-dm-surface-raised transition-colors"
                  >
                    <X className="w-5 h-5 text-warm-gray dark:text-dm-text-muted" />
                  </button>
                </div>
              </div>

              {/* Preview Body */}
              <div className="px-6 py-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                <div ref={previewRef}>
                  {previewReport === 'trial-balance' && <TrialBalancePreview data={trialBalance} asOfLabel={asOfLabel} />}
                  {previewReport === 'income-statement' && <IncomeStatementPreview data={incomeStatement} periodLabel={periodLabel} />}
                  {previewReport === 'balance-sheet' && <BalanceSheetPreview data={balanceSheet} asOfLabel={asOfLabel} />}
                  {previewReport === 'budget-vs-actual' && <BudgetVsActualPreview data={budgetActuals} periodLabel={periodLabel} />}
                  {previewReport === 'sacramental-statistics' && <SacramentalPreview />}
                  {previewReport === 'collection-summary' && <CollectionPreview rows={collectionRows} periodLabel={periodLabel} />}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   REPORT PREVIEW COMPONENTS
   ═══════════════════════════════════════════════ */

function ReportHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center mb-6 pb-4 border-b-2 border-deep-navy">
      <div className="w-16 h-1.5 bg-gold mx-auto mb-3" />
      <h2 className="font-playfair text-2xl font-bold text-deep-navy dark:text-dm-text">{title}</h2>
      <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-1">St. Agnes Parish, Mabalacat, Pampanga</p>
      {subtitle && <p className="body-sm text-warm-gray dark:text-dm-text-muted">{subtitle}</p>}
      <p className="text-xs text-warm-gray dark:text-dm-text-muted mt-1">
        Generated by ChurchOS — {new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
  );
}

/* ─── 1. Trial Balance ─── */
function TrialBalancePreview({ data, asOfLabel }: { data: TrialBalanceResult; asOfLabel: string }) {
  const nonZero = data.rows.filter((r) => r.debit !== 0 || r.credit !== 0);
  const grouped = groupBy(nonZero, 'type');

  return (
    <div>
      <ReportHeader title="TRIAL BALANCE" subtitle={`As of ${asOfLabel}`} />
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Code</th>
            <th className="text-left">Account Name</th>
            <th className="text-right">Debit</th>
            <th className="text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {(['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'] as const).map((type) => (
            <Fragment key={type}>
              <tr className="section-header">
                <td colSpan={4} className="font-semibold text-deep-navy dark:text-dm-text py-2">{type}</td>
              </tr>
              {grouped[type]?.map((a, idx) => (
                <tr key={`${type}-${a.code}-${idx}`}>
                  <td className="font-mono text-xs">{a.code}</td>
                  <td>{a.name}</td>
                  <td className="text-right font-mono">{a.debit > 0 ? formatPeso(a.debit) : ''}</td>
                  <td className="text-right font-mono">{a.credit > 0 ? formatPeso(a.credit) : ''}</td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr className="total-row">
            <td colSpan={2} className="text-right pr-4">TOTAL</td>
            <td className="text-right font-mono">{formatPeso(data.totalDebit)}</td>
            <td className="text-right font-mono">{formatPeso(data.totalCredit)}</td>
          </tr>
          <tr>
            <td colSpan={4} className="text-center py-3">
              {data.balanced ? (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <CheckCircle className="w-4 h-4" />
                  <span className="font-medium">Balanced — Debits equal Credits</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-error">
                  <X className="w-4 h-4" />
                  <span className="font-medium">Unbalanced — Difference: {formatPeso(Math.abs(data.totalDebit - data.totalCredit))}</span>
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      {/* Signature Lines */}
      <div className="grid grid-cols-2 gap-16 mt-8 pt-8">
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Prepared by</p>
        </div>
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Reviewed by</p>
        </div>
      </div>
    </div>
  );
}

/* ─── 2. Income Statement ─── */
function IncomeStatementPreview({ data, periodLabel }: { data: IncomeStatementResult; periodLabel: string }) {
  const revenue = data.revenue.filter((r) => r.amount !== 0);
  const expenses = data.expenses.filter((e) => e.amount !== 0);

  return (
    <div>
      <ReportHeader title="INCOME STATEMENT" subtitle={periodLabel} />
      {/* Revenue */}
      <h3 className="heading-sm text-deep-navy dark:text-dm-text mb-2">REVENUE</h3>
      <table className="w-full text-sm mb-4">
        <tbody>
          {revenue.map((r, idx) => (
            <tr key={idx}>
              <td className="pl-4">{r.name}</td>
              <td className="text-right font-mono">{formatPeso(r.amount)}</td>
            </tr>
          ))}
          {revenue.length === 0 && (
            <tr><td className="pl-4 text-warm-gray italic" colSpan={2}>No revenue posted in this period</td></tr>
          )}
          <tr className="total-row">
            <td className="font-semibold">Total Revenue</td>
            <td className="text-right font-mono font-semibold">{formatPeso(data.totalRevenue)}</td>
          </tr>
        </tbody>
      </table>

      {/* Expenses */}
      <h3 className="heading-sm text-deep-navy dark:text-dm-text mb-2">EXPENSES</h3>
      <table className="w-full text-sm mb-4">
        <tbody>
          {expenses.map((e, idx) => (
            <tr key={idx}>
              <td className="pl-4">{e.name}</td>
              <td className="text-right font-mono">{formatPeso(e.amount)}</td>
            </tr>
          ))}
          {expenses.length === 0 && (
            <tr><td className="pl-4 text-warm-gray italic" colSpan={2}>No expenses posted in this period</td></tr>
          )}
          <tr className="total-row">
            <td className="font-semibold">Total Expenses</td>
            <td className="text-right font-mono font-semibold">{formatPeso(data.totalExpenses)}</td>
          </tr>
        </tbody>
      </table>

      {/* Net Income */}
      <div className="cos-card p-4 bg-cream dark:bg-dm-surface-raised mt-4">
        <div className="flex items-center justify-between">
          <span className="heading-sm text-charcoal dark:text-dm-text">
            {data.netIncome >= 0 ? 'Net Surplus' : 'Net Deficit'}
          </span>
          <span className={`text-2xl font-bold font-mono ${data.netIncome >= 0 ? 'text-success' : 'text-error'}`}>
            {formatPeso(Math.abs(data.netIncome))}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-16 mt-8 pt-8">
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Prepared by</p>
        </div>
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Reviewed by</p>
        </div>
      </div>
    </div>
  );
}

/* ─── 3. Balance Sheet ─── */
function BalanceSheetPreview({ data, asOfLabel }: { data: BalanceSheetResult; asOfLabel: string }) {
  const totalCurrentAssets = data.assets.current.reduce((s, a) => s + a.amount, 0);
  const totalFixedAssets = data.assets.fixed.reduce((s, a) => s + a.amount, 0);
  const liabilitiesPlusEquity = data.totalLiabilities + data.totalEquity;

  return (
    <div>
      <ReportHeader title="BALANCE SHEET" subtitle={`As of ${asOfLabel}`} />
      {/* Assets */}
      <h3 className="heading-sm text-deep-navy dark:text-dm-text mb-2">ASSETS</h3>
      <p className="text-xs text-warm-gray dark:text-dm-text-muted uppercase tracking-wide mb-1">Current Assets</p>
      <table className="w-full text-sm mb-2">
        <tbody>
          {data.assets.current.map((a, idx) => (
            <tr key={idx}><td className="pl-4">{a.name}</td><td className="text-right font-mono">{formatPeso(a.amount)}</td></tr>
          ))}
          <tr className="font-medium"><td className="pl-8">Total Current Assets</td><td className="text-right font-mono font-semibold">{formatPeso(totalCurrentAssets)}</td></tr>
        </tbody>
      </table>
      <p className="text-xs text-warm-gray dark:text-dm-text-muted uppercase tracking-wide mb-1 mt-3">Fixed Assets</p>
      <table className="w-full text-sm mb-2">
        <tbody>
          {data.assets.fixed.map((a, idx) => (
            <tr key={idx}><td className="pl-4">{a.name}</td><td className="text-right font-mono">{formatPeso(a.amount)}</td></tr>
          ))}
          <tr className="font-medium"><td className="pl-8">Total Fixed Assets</td><td className="text-right font-mono font-semibold">{formatPeso(totalFixedAssets)}</td></tr>
        </tbody>
      </table>
      <div className="cos-card p-3 bg-cream dark:bg-dm-surface-raised mb-4">
        <div className="flex justify-between font-semibold">
          <span>TOTAL ASSETS</span>
          <span className="font-mono">{formatPeso(data.totalAssets)}</span>
        </div>
      </div>

      {/* Liabilities */}
      <h3 className="heading-sm text-deep-navy dark:text-dm-text mb-2 mt-6">LIABILITIES</h3>
      <table className="w-full text-sm mb-2">
        <tbody>
          {data.liabilities.map((l, idx) => (
            <tr key={idx}><td className="pl-4">{l.name}</td><td className="text-right font-mono">{formatPeso(l.amount)}</td></tr>
          ))}
          <tr className="font-medium"><td className="pl-8">Total Liabilities</td><td className="text-right font-mono font-semibold">{formatPeso(data.totalLiabilities)}</td></tr>
        </tbody>
      </table>

      {/* Equity */}
      <h3 className="heading-sm text-deep-navy dark:text-dm-text mb-2 mt-4">EQUITY</h3>
      <table className="w-full text-sm mb-2">
        <tbody>
          {data.equity.map((e, idx) => (
            <tr key={idx}><td className="pl-4">{e.name}</td><td className="text-right font-mono">{formatPeso(e.amount)}</td></tr>
          ))}
          <tr className="font-medium"><td className="pl-8">Total Equity</td><td className="text-right font-mono font-semibold">{formatPeso(data.totalEquity)}</td></tr>
        </tbody>
      </table>
      <div className="cos-card p-3 bg-cream dark:bg-dm-surface-raised mb-4">
        <div className="flex justify-between font-semibold">
          <span>TOTAL LIABILITIES + EQUITY</span>
          <span className="font-mono">{formatPeso(liabilitiesPlusEquity)}</span>
        </div>
      </div>

      {/* Check */}
      <div className="text-center py-2">
        {data.balanced ? (
          <span className="inline-flex items-center gap-1.5 text-success">
            <CheckCircle className="w-4 h-4" />
            <span className="font-medium">Assets = Liabilities + Equity — Balanced</span>
          </span>
        ) : (
          <span className="text-error font-medium">Imbalance: {formatPeso(Math.abs(data.totalAssets - liabilitiesPlusEquity))}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-16 mt-8 pt-8">
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Prepared by</p>
        </div>
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Reviewed by</p>
        </div>
      </div>
    </div>
  );
}

/* ─── 4. Budget vs Actual ─── */
function BudgetVsActualPreview({ data, periodLabel }: { data: BudgetItem[]; periodLabel: string }) {
  const income = data.filter((b) => b.category === 'Income');
  const expense = data.filter((b) => b.category === 'Expense');

  const renderRows = (rows: BudgetItem[]) =>
    rows.map((row) => {
      const overBudget = row.status === 'Over Budget';
      const underBudget = row.status === 'Under Budget';
      return (
        <tr key={row.accountCode}>
          <td><span className="font-mono text-xs mr-2">{row.accountCode}</span>{row.accountName}</td>
          <td className="text-right font-mono">{formatPeso(row.budgetYTD)}</td>
          <td className="text-right font-mono">{formatPeso(row.actualYTD)}</td>
          <td className={`text-right font-mono ${overBudget ? 'text-error' : underBudget ? 'text-warm-gray' : 'text-success'}`}>
            {row.variance >= 0 ? '+' : ''}{formatPeso(row.variance)}
          </td>
          <td className={`text-right font-mono ${overBudget ? 'text-error' : underBudget ? 'text-warm-gray' : 'text-success'}`}>
            {row.variancePercent >= 0 ? '+' : ''}{row.variancePercent.toFixed(1)}%
          </td>
          <td className="text-center">{row.status}</td>
        </tr>
      );
    });

  return (
    <div>
      <ReportHeader title="BUDGET VS ACTUAL REPORT" subtitle={periodLabel} />
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Account</th>
            <th className="text-right">Budget (YTD)</th>
            <th className="text-right">Actual (derived)</th>
            <th className="text-right">Variance (₱)</th>
            <th className="text-right">Variance (%)</th>
            <th className="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr className="section-header">
            <td colSpan={6} className="font-semibold text-deep-navy dark:text-dm-text py-2">Income</td>
          </tr>
          {renderRows(income)}
          <tr className="section-header">
            <td colSpan={6} className="font-semibold text-deep-navy dark:text-dm-text py-2">Expenses</td>
          </tr>
          {renderRows(expense)}
        </tbody>
      </table>

      {/* Progress bars */}
      <div className="space-y-3 mt-4">
        {data.slice(0, 6).map((row) => {
          const pct = row.budgetYTD > 0 ? (row.actualYTD / row.budgetYTD) * 100 : 0;
          return (
            <div key={row.accountCode}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-charcoal dark:text-dm-text">{row.accountName}</span>
                <span className="text-warm-gray dark:text-dm-text-muted">{pct.toFixed(0)}% of budget</span>
              </div>
              <div className="w-full h-2 rounded-full bg-parchment dark:bg-dm-border overflow-hidden">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-16 mt-8 pt-8">
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Prepared by</p>
        </div>
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Reviewed by</p>
        </div>
      </div>
    </div>
  );
}

/* ─── 5. Sacramental Statistics (CBCP) ─── */
function SacramentalPreview() {
  return (
    <div>
      {/* CBCP Header */}
      <div className="text-center mb-6">
        <div className="w-full h-20 bg-gold/20 rounded-lg flex items-center justify-center mb-3">
          <div>
            <p className="text-sm font-semibold text-deep-navy dark:text-dm-text">CBCP QUARTERLY SACRAMENTAL REPORT</p>
            <p className="text-xs text-warm-gray dark:text-dm-text-muted">Catholic Bishops' Conference of the Philippines</p>
          </div>
        </div>
        <h2 className="font-playfair text-xl font-bold text-deep-navy dark:text-dm-text">SACRAMENTAL STATISTICS</h2>
        <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-1">{sacramentalStatsData.quarter} 2026</p>
        {/* Registry-derived statistics live in the Registry module; this CBCP form is illustrative. */}
        <span className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold bg-warning/15 text-[#9A7B3D]">
          SAMPLE DATA — not derived from your registry records yet
        </span>
      </div>

      {/* Parish Info */}
      <div className="cos-card p-4 bg-cream dark:bg-dm-surface-raised mb-6">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-warm-gray">Parish:</span> <span className="font-medium text-charcoal dark:text-dm-text">{sacramentalStatsData.parish}</span></div>
          <div><span className="text-warm-gray">Diocese:</span> <span className="font-medium text-charcoal dark:text-dm-text">{sacramentalStatsData.diocese}</span></div>
          <div><span className="text-warm-gray">City:</span> <span className="font-medium text-charcoal dark:text-dm-text">{sacramentalStatsData.city}</span></div>
          <div><span className="text-warm-gray">Province:</span> <span className="font-medium text-charcoal dark:text-dm-text">{sacramentalStatsData.province}</span></div>
          <div className="col-span-2"><span className="text-warm-gray">Parish Priest:</span> <span className="font-medium text-charcoal dark:text-dm-text">{sacramentalStatsData.priest}</span></div>
        </div>
      </div>

      {/* Main Table */}
      <table className="w-full text-sm mb-6">
        <thead>
          <tr>
            <th className="text-left">Sacrament</th>
            <th className="text-right">Previous Qtr</th>
            <th className="text-right">This Quarter</th>
            <th className="text-right">Cumulative</th>
            <th className="text-left">Notes</th>
          </tr>
        </thead>
        <tbody>
          {sacramentalStatsData.records.map((r, idx) => (
            <tr key={idx}>
              <td className="font-medium">{r.sacrament}</td>
              <td className="text-right font-mono">{r.previousQuarter}</td>
              <td className="text-right font-mono">{r.thisQuarter}</td>
              <td className="text-right font-mono font-semibold">{r.cumulative}</td>
              <td className="body-sm text-warm-gray dark:text-dm-text-muted">{r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Age/Gender Breakdown */}
      <h3 className="heading-sm text-charcoal dark:text-dm-text mb-3">Age & Gender Breakdown — Baptisms</h3>
      <table className="w-full text-sm mb-6">
        <thead>
          <tr>
            <th className="text-left">Age Group</th>
            <th className="text-right">Male</th>
            <th className="text-right">Female</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {sacramentalStatsData.ageBreakdown.baptisms.map((row, idx) => (
            <tr key={idx}>
              <td>{row.ageGroup}</td>
              <td className="text-right font-mono">{row.male}</td>
              <td className="text-right font-mono">{row.female}</td>
              <td className="text-right font-mono font-semibold">{row.male + row.female}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="heading-sm text-charcoal dark:text-dm-text mb-3">Age & Gender Breakdown — Confirmations</h3>
      <table className="w-full text-sm mb-6">
        <thead>
          <tr>
            <th className="text-left">Age Group</th>
            <th className="text-right">Male</th>
            <th className="text-right">Female</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {sacramentalStatsData.ageBreakdown.confirmations.map((row, idx) => (
            <tr key={idx}>
              <td>{row.ageGroup}</td>
              <td className="text-right font-mono">{row.male}</td>
              <td className="text-right font-mono">{row.female}</td>
              <td className="text-right font-mono font-semibold">{row.male + row.female}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Signature */}
      <div className="grid grid-cols-2 gap-16 mt-8 pt-8">
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Parish Priest</p>
          <p className="text-xs text-charcoal dark:text-dm-text font-medium">{sacramentalStatsData.priest}</p>
        </div>
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Date</p>
        </div>
      </div>
    </div>
  );
}

/* ─── 6. Collection Summary ─── */
function CollectionPreview({ rows, periodLabel }: { rows: CollectionSummaryRow[]; periodLabel: string }) {
  const totalCash = rows.reduce((s, r) => s + r.cashTotal, 0);
  const totalChecks = rows.reduce((s, r) => s + r.checkTotal, 0);
  const totalDigital = rows.reduce((s, r) => s + r.digitalTotal, 0);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  const pieData = [
    { name: 'Cash', value: totalCash },
    { name: 'Checks', value: totalChecks },
    { name: 'Digital', value: totalDigital },
  ];

  // Monthly subtotals derived from the same rows so they always tie to the
  // Weekly-Total column and the Grand Total (no hardcoded drift).
  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthlyMap = new Map<string, { month: string; cash: number; checks: number; digital: number }>();
  rows.forEach((r) => {
    const key = r.date.slice(0, 7); // YYYY-MM
    const monthName = `${MONTH_NAMES[Number(r.date.slice(5, 7)) - 1]} ${r.date.slice(0, 4)}`;
    const entry = monthlyMap.get(key) ?? { month: monthName, cash: 0, checks: 0, digital: 0 };
    entry.cash += r.cashTotal;
    entry.checks += r.checkTotal;
    entry.digital += r.digitalTotal;
    monthlyMap.set(key, entry);
  });
  const monthlySubtotals = Array.from(monthlyMap.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);

  return (
    <div>
      <ReportHeader title="SUNDAY COLLECTION SUMMARY" subtitle={periodLabel} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="cos-card p-4 text-center bg-cream dark:bg-dm-surface-raised">
          <p className="label text-warm-gray dark:text-dm-text-muted mb-1">Total Cash</p>
          <p className="text-lg font-bold font-mono text-charcoal dark:text-dm-text">{formatPeso(totalCash)}</p>
        </div>
        <div className="cos-card p-4 text-center bg-cream dark:bg-dm-surface-raised">
          <p className="label text-warm-gray dark:text-dm-text-muted mb-1">Total Checks</p>
          <p className="text-lg font-bold font-mono text-charcoal dark:text-dm-text">{formatPeso(totalChecks)}</p>
        </div>
        <div className="cos-card p-4 text-center bg-cream dark:bg-dm-surface-raised">
          <p className="label text-warm-gray dark:text-dm-text-muted mb-1">Total Digital</p>
          <p className="text-lg font-bold font-mono text-charcoal dark:text-dm-text">{formatPeso(totalDigital)}</p>
        </div>
        <div className="cos-card p-4 text-center bg-gold-glow border-gold/30">
          <p className="label text-warm-gray mb-1">Grand Total</p>
          <p className="text-lg font-bold font-mono text-gold">{formatPeso(grandTotal)}</p>
        </div>
      </div>

      {/* Collection Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left">Date</th>
              <th className="text-right">6AM</th>
              <th className="text-right">8AM</th>
              <th className="text-right">10AM</th>
              <th className="text-right">6PM</th>
              <th className="text-right font-semibold">Weekly Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{formatDate(r.date)}</td>
                <td className="text-right font-mono">{formatPeso(r.mass6am)}</td>
                <td className="text-right font-mono">{formatPeso(r.mass8am)}</td>
                <td className="text-right font-mono">{formatPeso(r.mass10am)}</td>
                <td className="text-right font-mono">{formatPeso(r.mass6pm)}</td>
                <td className="text-right font-mono font-semibold">{formatPeso(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-warm-gray italic py-4">No posted collections in this period</td></tr>
            )}
            <tr className="total-row">
              <td className="font-semibold">Grand Total</td>
              <td className="text-right font-mono font-semibold">{formatPeso(rows.reduce((s, r) => s + r.mass6am, 0))}</td>
              <td className="text-right font-mono font-semibold">{formatPeso(rows.reduce((s, r) => s + r.mass8am, 0))}</td>
              <td className="text-right font-mono font-semibold">{formatPeso(rows.reduce((s, r) => s + r.mass10am, 0))}</td>
              <td className="text-right font-mono font-semibold">{formatPeso(rows.reduce((s, r) => s + r.mass6pm, 0))}</td>
              <td className="text-right font-mono font-semibold">{formatPeso(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Monthly Subtotals */}
      <h3 className="heading-sm text-charcoal dark:text-dm-text mt-6 mb-3">Monthly Subtotals</h3>
      <table className="w-full text-sm mb-6">
        <thead>
          <tr>
            <th className="text-left">Month</th>
            <th className="text-right">Cash</th>
            <th className="text-right">Checks</th>
            <th className="text-right">Digital</th>
            <th className="text-right">Monthly Total</th>
          </tr>
        </thead>
        <tbody>
          {monthlySubtotals.map((m, idx) => (
            <tr key={idx}>
              <td>{m.month}</td>
              <td className="text-right font-mono">{formatPeso(m.cash)}</td>
              <td className="text-right font-mono">{formatPeso(m.checks)}</td>
              <td className="text-right font-mono">{formatPeso(m.digital)}</td>
              <td className="text-right font-mono font-semibold">{formatPeso(m.cash + m.checks + m.digital)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td className="font-semibold">Grand Total</td>
            <td className="text-right font-mono font-semibold">{formatPeso(totalCash)}</td>
            <td className="text-right font-mono font-semibold">{formatPeso(totalChecks)}</td>
            <td className="text-right font-mono font-semibold">{formatPeso(totalDigital)}</td>
            <td className="text-right font-mono font-semibold">{formatPeso(grandTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* Pie Chart */}
      <h3 className="heading-sm text-charcoal dark:text-dm-text mb-3">Payment Method Breakdown</h3>
      <div className="flex items-center gap-8">
        <div className="w-48 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatPeso(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          {pieData.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[idx] }} />
              <span className="body-sm text-charcoal dark:text-dm-text w-16">{entry.name}</span>
              <span className="body-sm font-mono font-medium text-charcoal dark:text-dm-text">{formatPeso(entry.value)}</span>
              <span className="text-xs text-warm-gray dark:text-dm-text-muted">
                ({(grandTotal > 0 ? (entry.value / grandTotal) * 100 : 0).toFixed(1)}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-16 mt-8 pt-8">
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Prepared by</p>
        </div>
        <div className="text-center">
          <div className="border-b border-charcoal dark:border-dm-border pb-1 mb-1" />
          <p className="text-xs text-warm-gray dark:text-dm-text-muted">Reviewed by</p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CSV GENERATORS
   ═══════════════════════════════════════════════ */

function generateTrialBalanceCSV(data: TrialBalanceResult) {
  let csv = 'Account Code,Account Name,Type,Debit,Credit\n';
  data.rows.filter((a) => a.debit !== 0 || a.credit !== 0).forEach((a) => {
    csv += `${a.code},"${a.name}",${a.type},${a.debit},${a.credit}\n`;
  });
  csv += `,TOTAL,,${data.totalDebit},${data.totalCredit}\n`;
  return csv;
}

function generateIncomeStatementCSV(data: IncomeStatementResult) {
  let csv = 'Category,Item,Amount\n';
  data.revenue.filter((r) => r.amount !== 0).forEach((r) => {
    csv += `Revenue,"${r.name}",${r.amount}\n`;
  });
  data.expenses.filter((e) => e.amount !== 0).forEach((e) => {
    csv += `Expense,"${e.name}",${e.amount}\n`;
  });
  csv += `Total,"Total Revenue",${data.totalRevenue}\n`;
  csv += `Total,"Total Expenses",${data.totalExpenses}\n`;
  csv += `Total,"Net ${data.netIncome >= 0 ? 'Surplus' : 'Deficit'}",${data.netIncome}\n`;
  return csv;
}

function generateBalanceSheetCSV(data: BalanceSheetResult) {
  let csv = 'Category,Item,Amount\n';
  data.assets.current.forEach((a) => { csv += `Current Assets,"${a.name}",${a.amount}\n`; });
  data.assets.fixed.forEach((a) => { csv += `Fixed Assets,"${a.name}",${a.amount}\n`; });
  data.liabilities.forEach((l) => { csv += `Liabilities,"${l.name}",${l.amount}\n`; });
  data.equity.forEach((e) => { csv += `Equity,"${e.name}",${e.amount}\n`; });
  csv += `Total,"Total Assets",${data.totalAssets}\n`;
  csv += `Total,"Total Liabilities + Equity",${data.totalLiabilities + data.totalEquity}\n`;
  return csv;
}

function generateBudgetActualCSV(data: BudgetItem[]) {
  let csv = 'Account Code,Account,Category,Budget YTD,Actual YTD,Variance,Variance %,Status\n';
  data.forEach((r) => {
    csv += `${r.accountCode},"${r.accountName}",${r.category},${r.budgetYTD},${r.actualYTD},${r.variance},${r.variancePercent.toFixed(1)},"${r.status}"\n`;
  });
  return csv;
}

function generateSacramentalCSV() {
  let csv = 'Sacrament,Previous Quarter,This Quarter,Cumulative,Notes\n';
  sacramentalStatsData.records.forEach((r) => {
    csv += `"${r.sacrament}",${r.previousQuarter},${r.thisQuarter},${r.cumulative},"${r.notes}"\n`;
  });
  return csv;
}

function generateCollectionCSV(rows: CollectionSummaryRow[]) {
  let csv = 'Date,6AM Mass,8AM Mass,10AM Mass,6PM Mass,Cash,Checks,Digital,Total\n';
  rows.forEach((r) => {
    csv += `${r.date},${r.mass6am},${r.mass8am},${r.mass10am},${r.mass6pm},${r.cashTotal},${r.checkTotal},${r.digitalTotal},${r.total}\n`;
  });
  return csv;
}

/* ═══════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════ */

function formatPeso(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
