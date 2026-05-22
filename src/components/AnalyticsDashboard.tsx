import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  ResponsiveContainer, Area, AreaChart, Line, LineChart,
  ReferenceLine, Cell as RechartsCell,
} from 'recharts';
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  PieChartIcon, BarChart3, Calendar, Sun,
  Minus, Receipt, Wallet, Activity,
} from 'lucide-react';
import {
  getPareto, getMonthlyComparison, getSundayCollections,
  getSeasonalComparison, getAnalyticsSummary, getAnalyticLines,
  formatPeso, type ParetoItem, REVENUE_SUBS, EXPENSE_SUBS,
} from '@/lib/analyticsEngine';
import ParetoChart from './ParetoChart';
import DataTable from './DataTable';
import EmptyState from './EmptyState';

/* ── Animation ── */
const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

/* ── Custom Tooltip ── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-dm-surface rounded-lg shadow-lg border border-parchment dark:border-dm-border px-3 py-2">
      {label && <p className="body-xs font-semibold text-charcoal dark:text-dm-text mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="body-xs" style={{ color: p.color }}>{p.name}: {formatPeso(p.value)}</p>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   UNIFIED ANALYTICS DASHBOARD
   ═══════════════════════════════════════════════════════════ */

type TabId = 'pareto' | 'trends' | 'sundays' | 'seasonal' | 'transactions';

export default function AnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('pareto');
  const [type, setType] = useState<'revenue' | 'expense'>('expense');
  const [drillCategory, setDrillCategory] = useState<string>('');
  const [drillSub, setDrillSub] = useState<string>('');

  /* ── Data ── */
  const summary = useMemo(() => getAnalyticsSummary(), []);
  const paretoCat = useMemo(() => getPareto(type, 'category'), [type]);
  const paretoSub = useMemo(() => getPareto(type, 'sub'), [type]);
  const monthly = useMemo(() => getMonthlyComparison(type, drillSub ? 'sub' : 'category'), [type, drillSub]);
  const sundays = useMemo(() => getSundayCollections(), []);
  const seasonal = useMemo(() => getSeasonalComparison(type, drillCategory || undefined), [type, drillCategory]);
  const lines = useMemo(() => {
    const all = getAnalyticLines(type);
    if (drillSub) return all.filter(l => l.subCode === drillSub);
    if (drillCategory) return all.filter(l => l.categoryCode === drillCategory);
    return all;
  }, [type, drillCategory, drillSub]);

  /* ── Colors for the type ── */
  const subs = type === 'revenue' ? REVENUE_SUBS : EXPENSE_SUBS;
  const catColors: Record<string, string> = type === 'revenue'
    ? { '4000': '#1A1A2E', '4100': '#C9963B', '4200': '#6B2737', '4300': '#B8322F' }
    : { '5000': '#6B2737', '5100': '#C9963B', '5200': '#2D6A4F', '5300': '#5B3A73', '5400': '#3B6BC9' };

  /* ── Table columns ── */
  const txColumns = useMemo(() => [
    { key: 'date', header: 'Date', width: '95px', sortable: true, render: (r: Record<string, unknown>) => formatDate(r.date as string) },
    { key: 'subName', header: 'Sub-category', width: '140px', sortable: true, render: (r: Record<string, unknown>) => {
      const color = subs.find(s => s.code === r.subCode)?.color || '#8C8374';
      return <span className="cos-badge" style={{ backgroundColor: color + '18', color, border: `1px solid ${color}30` }}>{r.subName as string}</span>;
    }},
    { key: 'categoryName', header: 'Category', width: '120px', sortable: true },
    { key: 'description', header: 'Description', width: '250px', sortable: true },
    { key: 'amount', header: 'Amount', width: '100px', sortable: true, render: (r: Record<string, unknown>) => <span className="font-mono text-sm font-medium">{formatPeso(r.amount as number)}</span> },
    { key: 'reference', header: 'Reference', width: '180px', sortable: true },
  ], [subs]);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'pareto', label: 'Pareto Analysis', icon: PieChartIcon },
    { id: 'trends', label: 'Monthly Trends', icon: BarChart3 },
    { id: 'sundays', label: 'Sunday Collections', icon: Calendar },
    { id: 'seasonal', label: 'Seasonal', icon: Sun },
    { id: 'transactions', label: 'Transactions', icon: Receipt },
  ];

  /* ── Monthly trend data ── */
  const trendData = monthly.map(m => {
    const point: Record<string, string | number> = { name: m.label, month: m.month, Total: m.total };
    if (m.changeFromPrevious !== 0) {
      point.change = Math.round(m.changeFromPrevious * 10) / 10;
    }
    for (const [k, v] of Object.entries(m.breakdown)) {
      point[k] = v;
    }
    return point;
  });

  /* ── Sunday data ── */
  const sundayData = sundays.map(s => {
    const pt: Record<string, string | number> = { name: s.label, date: s.date, Total: s.total };
    for (const [k, v] of Object.entries(s.massBreakdown)) {
      pt[k] = v;
    }
    return pt;
  });
  const massNames = ['6AM Mass Collection', '8AM Mass Collection', '10AM Mass Collection', '5PM Mass Collection'];

  /* ── Seasonal data ── */
  const seasonalColors: Record<string, string> = { Summer: '#C9963B', Rainy: '#3B6BC9', Holiday: '#B8322F' };

  const handleParetoClick = (item: ParetoItem) => {
    // Check if it's a category or sub
    if (item.code.length === 4) {
      setDrillCategory(drillCategory === item.code ? '' : item.code);
      setDrillSub('');
    } else {
      setDrillSub(drillSub === item.code ? '' : item.code);
    }
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-5">

      {/* ═══════ HEADER WITH TYPE TOGGLE ═══════ */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="display-sm font-playfair text-charcoal dark:text-dm-text">Parish Analytics</h2>
          <p className="body-sm text-warm-gray dark:text-dm-text-muted">
            Deep analytics for revenue and expense — Pareto, trends, comparisons
          </p>
        </div>
        <div className="flex items-center bg-cream-dark dark:bg-dm-surface-raised rounded-lg p-1">
          <button
            onClick={() => { setType('revenue'); setDrillCategory(''); setDrillSub(''); }}
            className={`px-4 py-2 rounded-md body-sm font-medium transition-all ${
              type === 'revenue' ? 'bg-forest-green text-white shadow-sm' : 'text-warm-gray hover:text-charcoal dark:text-dm-text-muted'
            }`}
          >
            Revenue
          </button>
          <button
            onClick={() => { setType('expense'); setDrillCategory(''); setDrillSub(''); }}
            className={`px-4 py-2 rounded-md body-sm font-medium transition-all ${
              type === 'expense' ? 'bg-error text-white shadow-sm' : 'text-warm-gray hover:text-charcoal dark:text-dm-text-muted'
            }`}
          >
            Expenses
          </button>
        </div>
      </motion.div>

      {/* ═══════ KPI CARDS ═══════ */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={Wallet} label={`Total ${type === 'revenue' ? 'Revenue' : 'Expenses'}`}
          value={formatPeso(type === 'revenue' ? summary.totalRevenue : summary.totalExpense)}
          accent={type === 'revenue' ? '#2D6A4F' : '#6B2737'}
          hint={`${summary.monthsOfData} months of data`} />
        <KpiCard icon={type === 'expense' && summary.expensePercentUsed > 80 ? TrendingDown : Activity}
          label={type === 'revenue' ? 'Budget Used' : 'Budget Used'}
          value={`${type === 'revenue' ? ((summary.totalRevenue / summary.revenueBudget) * 100).toFixed(1) : summary.expensePercentUsed.toFixed(1)}%`}
          accent={type === 'expense' && summary.expensePercentUsed > 80 ? '#B8322F' : '#C9963B'}
          hint={type === 'expense' && summary.expensePercentUsed > 80 ? 'Over 80% — watch closely' : 'On track'} />
        <KpiCard icon={Receipt} label="Transactions" value={`${type === 'revenue' ? summary.revenueTransactionCount : summary.expenseTransactionCount}`}
          accent="#3B6BC9" hint={`${type === 'revenue' ? summary.revenueCategoryCount : summary.expenseCategoryCount} categories`} />
        <KpiCard icon={type === 'revenue' ? TrendingUp : TrendingDown} label="Monthly Average"
          value={formatPeso(type === 'revenue' ? summary.averageMonthlyRevenue : summary.averageMonthlyExpense)}
          accent="#5B3A73" hint="Per month average" />
      </motion.div>

      {/* ═══════ DRILL BREADCRUMB ═══════ */}
      {(drillCategory || drillSub) && (
        <motion.div variants={itemVariants} className="cos-card p-3 bg-gold-glow/40 border border-gold/20 flex items-center gap-2 flex-wrap">
          <span className="body-sm text-charcoal dark:text-dm-text font-medium capitalize">{type}</span>
          {drillCategory && (
            <>
              <span className="body-sm text-warm-gray">/</span>
              <span className="body-sm text-charcoal dark:text-dm-text font-medium">
                {paretoCat.find(c => c.code === drillCategory)?.name}
              </span>
            </>
          )}
          {drillSub && (
            <>
              <span className="body-sm text-warm-gray">/</span>
              <span className="body-sm text-charcoal dark:text-dm-text font-medium">
                {paretoSub.find(c => c.code === drillSub)?.name}
              </span>
            </>
          )}
          <button
            onClick={() => { setDrillCategory(''); setDrillSub(''); }}
            className="ml-auto body-xs text-warm-gray hover:text-charcoal underline"
          >
            Clear filter
          </button>
        </motion.div>
      )}

      {/* ═══════ SUB-TABS ═══════ */}
      <motion.div variants={itemVariants} className="flex flex-wrap border-b border-parchment dark:border-dm-border gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 body-sm font-medium transition-colors relative ${
              activeTab === tab.id ? 'text-deep-navy dark:text-gold' : 'text-warm-gray hover:text-charcoal dark:text-dm-text-muted'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {activeTab === tab.id && <motion.div layoutId="anTab" className="absolute bottom-0 left-3 right-3 h-0.5 bg-gold rounded-full" />}
          </button>
        ))}
      </motion.div>

      {/* ═══════════════════════════════════════════════════════════
          TAB CONTENT
          ═══════════════════════════════════════════════════════════ */}

      {/* ── PARETO TAB ── */}
      {activeTab === 'pareto' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <motion.div variants={itemVariants} className="cos-card p-5">
            <ParetoChart
              data={drillCategory ? paretoSub.filter(s => {
                const parent = subs.find(sub => sub.code === s.code)?.parentCode;
                return parent === drillCategory;
              }) : paretoCat}
              title={drillCategory ? `${paretoCat.find(c => c.code === drillCategory)?.name} — Sub-categories` : `${type === 'revenue' ? 'Revenue' : 'Expense'} Pareto`}
              subtitle={drillCategory ? 'Click a bar to filter transactions' : 'Bars sorted by amount — line shows cumulative %'}
              onItemClick={handleParetoClick}
              selectedItem={drillCategory || drillSub}
            />
          </motion.div>

          <motion.div variants={itemVariants} className="cos-card p-5">
            <h3 className="heading-md text-charcoal dark:text-dm-text mb-1">{type === 'revenue' ? 'Revenue' : 'Expense'} Summary</h3>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted mb-4">Click any category to drill down</p>
            <div className="space-y-2">
              {(drillCategory ? paretoSub.filter(s => subs.find(sub => sub.code === s.code)?.parentCode === drillCategory) : paretoCat).map(item => (
                <button
                  key={item.code}
                  onClick={() => handleParetoClick(item)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg transition-all text-left ${
                    (drillCategory === item.code || drillSub === item.code)
                      ? 'bg-cream-dark dark:bg-dm-surface-raised shadow-sm'
                      : 'hover:bg-cream-dark/40 dark:hover:bg-dm-surface-raised/40'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.color + '18' }}>
                      <span className="text-lg font-bold" style={{ color: item.color }}>{item.percent >= 10 ? Math.round(item.percent) : item.percent.toFixed(1)}%</span>
                    </div>
                    <div className="min-w-0">
                      <p className="body-sm text-charcoal dark:text-dm-text font-medium truncate">{item.name}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-cream-dark dark:bg-dm-border overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: item.color }} />
                        </div>
                        <span className="body-xs text-warm-gray dark:text-dm-text-muted">{item.count} txns</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <p className="body-sm font-mono font-medium text-charcoal dark:text-dm-text">{formatPeso(item.amount)}</p>
                    <p className="body-xs text-warm-gray dark:text-dm-text-muted">cum. {item.cumulativePercent.toFixed(0)}%</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* ── TRENDS TAB ── */}
      {activeTab === 'trends' && (
        <motion.div variants={itemVariants} className="cos-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="heading-md text-charcoal dark:text-dm-text">Month-over-Month {type === 'revenue' ? 'Revenue' : 'Expenses'}</h3>
              <p className="body-xs text-warm-gray dark:text-dm-text-muted">
                {drillCategory || drillSub ? 'Filtered by selected category' : 'All categories combined'}
              </p>
            </div>
          </div>

          {monthly.length > 0 ? (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {monthly.slice(0, 4).map(m => (
                  <div key={m.month} className="p-2.5 bg-cream-dark/30 dark:bg-dm-surface-raised/30 rounded-lg">
                    <p className="body-xs text-warm-gray dark:text-dm-text-muted">{m.label}</p>
                    <p className="body-sm font-mono font-medium text-charcoal dark:text-dm-text">{formatPeso(m.total)}</p>
                    {m.changeFromPrevious !== 0 && (
                      <p className={`body-xs flex items-center gap-0.5 ${m.changeFromPrevious > 0 ? 'text-forest-green' : 'text-error'}`}>
                        {m.changeFromPrevious > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {Math.abs(m.changeFromPrevious).toFixed(1)}%
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(140,131,116,0.12)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₱' + (v / 1000).toFixed(0) + 'K'} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {Object.keys(monthly[0]?.breakdown || {}).map((name, i) => {
                    const color = subs.find(s => s.name === name)?.color || Object.values(catColors)[i % 5];
                    return (
                      <Area key={name} type="monotone" dataKey={name} stackId="1" stroke={color} fill={color} fillOpacity={0.7} strokeWidth={1.5} />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>

              {/* Month detail table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left">
                  <thead><tr className="border-b border-parchment dark:border-dm-border">
                    <th className="py-2 pr-4 body-xs font-semibold text-warm-gray">Month</th>
                    <th className="py-2 pr-4 body-xs font-semibold text-warm-gray text-right">Total</th>
                    <th className="py-2 pr-4 body-xs font-semibold text-warm-gray text-right">Change</th>
                    {Object.keys(monthly[0]?.breakdown || {}).map(k => (
                      <th key={k} className="py-2 pr-3 body-xs font-semibold text-warm-gray text-right">{k}</th>
                    ))}
                  </tr></thead>
                  <tbody>{monthly.map(m => (
                    <tr key={m.month} className="border-b border-parchment/50 hover:bg-cream-dark/20 transition-colors">
                      <td className="py-2 pr-4 body-sm text-charcoal dark:text-dm-text">{m.label}</td>
                      <td className="py-2 pr-4 body-sm font-mono font-medium text-charcoal dark:text-dm-text text-right">{formatPeso(m.total)}</td>
                      <td className={`py-2 pr-4 body-xs text-right ${m.changeFromPrevious > 0 ? 'text-forest-green' : m.changeFromPrevious < 0 ? 'text-error' : 'text-warm-gray'}`}>
                        {m.changeFromPrevious !== 0 ? `${m.changeFromPrevious > 0 ? '+' : ''}${m.changeFromPrevious.toFixed(1)}%` : <Minus className="w-3 h-3 inline" />}
                      </td>
                      {Object.keys(m.breakdown).map(k => (
                        <td key={k} className="py-2 pr-3 body-xs text-warm-gray dark:text-dm-text-muted text-right">{(m.breakdown[k] || 0) > 0 ? formatPeso(m.breakdown[k]) : '—'}</td>
                      ))}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState icon={BarChart3} title="No monthly data" description="Journal entries will appear here once posted." />
          )}
        </motion.div>
      )}

      {/* ── SUNDAYS TAB ── */}
      {activeTab === 'sundays' && (
        <motion.div variants={itemVariants} className="space-y-5">
          <div className="cos-card p-5">
            <h3 className="heading-md text-charcoal dark:text-dm-text mb-1">Sunday Collection Comparison</h3>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted mb-4">
              Track which Sundays are strong and which are weak — spot patterns
            </p>
            {sundayData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sundayData} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(140,131,116,0.12)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => '₱' + (v / 1000).toFixed(0) + 'K'} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {massNames.map((name, i) => {
                    const colors = ['#1A1A2E', '#3B6BC9', '#5B3A73', '#2D6A4F'];
                    return <Bar key={name} dataKey={name} stackId="1" fill={colors[i]} fillOpacity={0.85} radius={i === 3 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />;
                  })}
                  <ReferenceLine y={sundays.reduce((s, d) => s + d.total, 0) / sundays.length} stroke="#C9963B" strokeDasharray="4 4" label={{ value: 'Avg', fontSize: 10, fill: '#C9963B' }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={Calendar} title="No Sunday data" description="Sunday collection entries will appear here." />
            )}
          </div>

          {/* Sunday ranking */}
          <div className="cos-card p-5">
            <h3 className="heading-md text-charcoal dark:text-dm-text mb-3">Sunday Rankings</h3>
            <div className="space-y-2">
              {[...sundays].sort((a, b) => b.total - a.total).map((s, i) => (
                <div key={s.date} className="flex items-center gap-3 p-2 rounded-lg hover:bg-cream-dark/20 transition-colors">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center body-xs font-bold ${
                    i === 0 ? 'bg-gold text-white' : i === 1 ? 'bg-warm-gray text-white' : i === 2 ? 'bg-[#CD7F32] text-white' : 'bg-cream-dark text-warm-gray'
                  }`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="body-sm text-charcoal dark:text-dm-text font-medium">{s.label}</p>
                    <div className="flex gap-2 mt-0.5">
                      {Object.entries(s.massBreakdown).map(([k, v]) => (
                        <span key={k} className="body-xs text-warm-gray dark:text-dm-text-muted">{k.replace(' Collection', '')}: {formatPeso(v)}</span>
                      ))}
                    </div>
                  </div>
                  <span className="body-sm font-mono font-medium text-charcoal dark:text-dm-text">{formatPeso(s.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* ── SEASONAL TAB ── */}
      {activeTab === 'seasonal' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <motion.div variants={itemVariants} className="cos-card p-5">
            <h3 className="heading-md text-charcoal dark:text-dm-text mb-1">Seasonal {type === 'revenue' ? 'Revenue' : 'Expense'} Comparison</h3>
            <p className="body-xs text-warm-gray dark:text-dm-text-muted mb-4">
              {drillCategory ? `Filtered: ${paretoCat.find(c => c.code === drillCategory)?.name}` : 'Summer vs Rainy vs Holiday seasons'}
            </p>
            {seasonal.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={seasonal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(140,131,116,0.12)" />
                  <XAxis dataKey="season" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => '₱' + (v / 1000).toFixed(0) + 'K'} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                    {seasonal.map((s, i) => (
                      <RechartsCell key={i} fill={seasonalColors[s.season] || '#8C8374'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={Sun} title="No seasonal data" description="Post journal entries across different months to see seasonal patterns." />
            )}
          </motion.div>

          <motion.div variants={itemVariants} className="cos-card p-5">
            <h3 className="heading-md text-charcoal dark:text-dm-text mb-3">Season Breakdown</h3>
            <div className="space-y-3">
              {seasonal.map(s => (
                <div key={s.season} className="p-3 rounded-lg" style={{ backgroundColor: (seasonalColors[s.season] || '#8C8374') + '10' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: seasonalColors[s.season] }} />
                      <span className="body-sm text-charcoal dark:text-dm-text font-medium">{s.season}</span>
                    </div>
                    <span className="body-sm font-mono font-medium text-charcoal dark:text-dm-text">{formatPeso(s.total)}</span>
                  </div>
                  <div className="flex items-center justify-between body-xs text-warm-gray dark:text-dm-text-muted">
                    <span>{s.count} transactions</span>
                    <span>Avg: {formatPeso(s.average)}</span>
                  </div>
                  {/* Sub-category breakdown within season */}
                  <div className="mt-2 space-y-1">
                    {Object.entries(s.breakdown).sort(([, a], [, b]) => (b as number) - (a as number)).slice(0, 5).map(([name, amount]) => (
                      <div key={name} className="flex items-center justify-between body-xs">
                        <span className="text-warm-gray dark:text-dm-text-muted">{name}</span>
                        <span className="font-mono text-charcoal dark:text-dm-text">{formatPeso(amount as number)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* ── TRANSACTIONS TAB ── */}
      {activeTab === 'transactions' && (
        <motion.div variants={itemVariants} className="cos-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="heading-md text-charcoal dark:text-dm-text">
                {drillSub ? `${paretoSub.find(c => c.code === drillSub)?.name} Transactions`
                  : drillCategory ? `${paretoCat.find(c => c.code === drillCategory)?.name} Transactions`
                  : `All ${type === 'revenue' ? 'Revenue' : 'Expense'} Transactions`}
              </h3>
              <p className="body-xs text-warm-gray dark:text-dm-text-muted">{lines.length} entries</p>
            </div>
            {(drillCategory || drillSub) && (
              <button onClick={() => { setDrillCategory(''); setDrillSub(''); }} className="body-xs text-warm-gray hover:text-charcoal underline">Show all</button>
            )}
          </div>
          {lines.length > 0 ? (
            <DataTable columns={txColumns} data={lines as unknown as Record<string, unknown>[]} pageSize={10} />
          ) : (
            <EmptyState icon={Receipt} title="No transactions" description="Post journal entries to see transactions here." />
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════
   KPI Card
   ═══════════════════════════════════════════════════════════ */
function KpiCard({ icon: Icon, label, value, accent, hint }: { icon: React.ElementType; label: string; value: string; accent: string; hint: string }) {
  return (
    <div className="cos-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accent + '14' }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <span className="body-xs text-warm-gray dark:text-dm-text-muted uppercase tracking-wide">{label}</span>
      </div>
      <p className="heading-xl text-charcoal dark:text-dm-text" style={{ fontSize: '1.35rem' }}>{value}</p>
      <p className="body-xs mt-0.5" style={{ color: accent }}>{hint}</p>
    </div>
  );
}

function formatDate(d: string): string {
  if (!d) return '';
  const x = new Date(d + 'T00:00:00');
  return x.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}
