// ═══════════════════════════════════════════════════════════
// ChurchOS Analytics Engine — Revenue & Expense Deep Analytics
// Six Sigma-inspired: Pareto analysis, drill-down, comparisons
// ═══════════════════════════════════════════════════════════

import { journalEntries as seedJournalEntries, type JournalEntry } from './financeData';
import { getJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';

// ── Single source of truth ──
// The Journal tab (FinancePage) persists posted entries to the per-parish
// namespaced localStorage key KEYS.journalEntries via usePersistedState.
// Analytics MUST read that same store so a freshly-posted balanced entry
// shows up in Total Revenue / Total Expenses / the Transactions table.
// We fall back to the static seed ONLY when nothing has been persisted yet
// (fresh install with an untouched ledger), and clearly prefer real data.
function getJournalEntries(): JournalEntry[] {
  const stored = getJSON<JournalEntry[]>(KEYS.journalEntries, []);
  if (Array.isArray(stored) && stored.length > 0) return stored;
  return seedJournalEntries;
}

// ── Sub-category classification rules ──
// Maps journal entry descriptions to sub-categories for drill-down

export interface SubCategory {
  code: string;      // e.g. "5110"
  name: string;      // e.g. "Electricity"
  parentCode: string; // e.g. "5100" (Utilities)
  parentName: string; // e.g. "Utilities"
  color: string;
}

// Revenue sub-categories (4xxx)
export const REVENUE_SUBS: SubCategory[] = [
  { code: '4010', name: '6AM Mass Collection', parentCode: '4000', parentName: 'Sunday Collections', color: '#1A1A2E' },
  { code: '4015', name: '8AM Mass Collection', parentCode: '4000', parentName: 'Sunday Collections', color: '#3B6BC9' },
  { code: '4020', name: '10AM Mass Collection', parentCode: '4000', parentName: 'Sunday Collections', color: '#5B3A73' },
  { code: '4025', name: '5PM Mass Collection', parentCode: '4000', parentName: 'Sunday Collections', color: '#2D6A4F' },
  { code: '4030', name: 'Other Collections', parentCode: '4000', parentName: 'Sunday Collections', color: '#8C8374' },
  { code: '4101', name: 'Regular Donations', parentCode: '4100', parentName: 'Donations', color: '#C9963B' },
  { code: '4102', name: 'Special Donations', parentCode: '4100', parentName: 'Donations', color: '#D4A94D' },
  { code: '4103', name: 'Pledges', parentCode: '4100', parentName: 'Donations', color: '#E2C060' },
  { code: '4201', name: 'Baptism Fees', parentCode: '4200', parentName: 'Fees & Permits', color: '#6B2737' },
  { code: '4202', name: 'Wedding Fees', parentCode: '4200', parentName: 'Fees & Permits', color: '#8A3A4A' },
  { code: '4203', name: 'Confirmation Fees', parentCode: '4200', parentName: 'Fees & Permits', color: '#A94D5D' },
  { code: '4204', name: 'Burial Fees', parentCode: '4200', parentName: 'Fees & Permits', color: '#C87080' },
  { code: '4205', name: 'Permits & Others', parentCode: '4200', parentName: 'Fees & Permits', color: '#E795A5' },
  { code: '4301', name: 'Fundraising Events', parentCode: '4300', parentName: 'Fundraising', color: '#B8322F' },
  { code: '4302', name: 'Raffle & Lotto', parentCode: '4300', parentName: 'Fundraising', color: '#D4504A' },
  { code: '4303', name: 'Other Fundraising', parentCode: '4300', parentName: 'Fundraising', color: '#E8746E' },
];

// Expense sub-categories (5xxx)
export const EXPENSE_SUBS: SubCategory[] = [
  { code: '5010', name: 'Salaries & Wages', parentCode: '5000', parentName: 'Personnel Costs', color: '#6B2737' },
  { code: '5015', name: 'Benefits & Contributions', parentCode: '5000', parentName: 'Personnel Costs', color: '#8A3A4A' },
  { code: '5020', name: 'Honoraria', parentCode: '5000', parentName: 'Personnel Costs', color: '#A94D5D' },
  { code: '5110', name: 'Electricity', parentCode: '5100', parentName: 'Utilities', color: '#C9963B' },
  { code: '5115', name: 'Water', parentCode: '5100', parentName: 'Utilities', color: '#D4A94D' },
  { code: '5120', name: 'Internet & Communications', parentCode: '5100', parentName: 'Utilities', color: '#E2C060' },
  { code: '5210', name: 'Building Repairs', parentCode: '5200', parentName: 'Maintenance', color: '#2D6A4F' },
  { code: '5215', name: 'Grounds & Landscaping', parentCode: '5200', parentName: 'Maintenance', color: '#4A8C6F' },
  { code: '5220', name: 'Equipment Repair', parentCode: '5200', parentName: 'Maintenance', color: '#6BAE8F' },
  { code: '5310', name: 'Office Supplies', parentCode: '5300', parentName: 'Supplies', color: '#5B3A73' },
  { code: '5315', name: 'Liturgical Supplies', parentCode: '5300', parentName: 'Supplies', color: '#7A5D92' },
  { code: '5320', name: 'Cleaning Supplies', parentCode: '5300', parentName: 'Supplies', color: '#997DB1' },
  { code: '5410', name: 'Catechism & Formation', parentCode: '5400', parentName: 'Ministry Expenses', color: '#3B6BC9' },
  { code: '5415', name: 'Outreach & Assistance', parentCode: '5400', parentName: 'Ministry Expenses', color: '#5A8DE0' },
  { code: '5420', name: 'Altar & Liturgy', parentCode: '5400', parentName: 'Ministry Expenses', color: '#79AEF7' },
  { code: '5425', name: 'Other Ministry', parentCode: '5400', parentName: 'Ministry Expenses', color: '#98CFFF' },
];

// ── Classifier: determines sub-category from description ──
export function classifySubCategory(description: string, parentCode: string): SubCategory | null {
  const d = description.toLowerCase();
  const subs = parentCode.startsWith('4') ? REVENUE_SUBS : EXPENSE_SUBS;

  // Revenue classification
  if (parentCode === '4000') {
    if (d.includes('6am') || d.includes('6:00 am')) return subs.find(s => s.code === '4010') || null;
    if (d.includes('8am') || d.includes('8:00 am')) return subs.find(s => s.code === '4015') || null;
    if (d.includes('10am') || d.includes('10:00 am')) return subs.find(s => s.code === '4020') || null;
    if (d.includes('6pm') || d.includes('5pm') || d.includes('5:00 pm') || d.includes('6:00 pm')) return subs.find(s => s.code === '4025') || null;
    return subs.find(s => s.code === '4030') || null;
  }
  if (parentCode === '4100') {
    if (d.includes('special') || d.includes('anonymous')) return subs.find(s => s.code === '4102') || null;
    if (d.includes('pledge')) return subs.find(s => s.code === '4103') || null;
    return subs.find(s => s.code === '4101') || null;
  }
  if (parentCode === '4200') {
    if (d.includes('wedding') || d.includes('marriage')) return subs.find(s => s.code === '4202') || null;
    if (d.includes('baptism')) return subs.find(s => s.code === '4201') || null;
    if (d.includes('confirm')) return subs.find(s => s.code === '4203') || null;
    if (d.includes('burial') || d.includes('funeral') || d.includes('death')) return subs.find(s => s.code === '4204') || null;
    return subs.find(s => s.code === '4205') || null;
  }
  if (parentCode === '4300') {
    if (d.includes('raffle') || d.includes('lotto')) return subs.find(s => s.code === '4302') || null;
    if (d.includes('bake') || d.includes('dinner') || d.includes('event') || d.includes('fiesta')) return subs.find(s => s.code === '4301') || null;
    return subs.find(s => s.code === '4303') || null;
  }

  // Expense classification
  if (parentCode === '5000') {
    if (d.includes('benefit') || d.includes('sss') || d.includes('pag-ibig') || d.includes('philhealth')) return subs.find(s => s.code === '5015') || null;
    if (d.includes('honorar')) return subs.find(s => s.code === '5020') || null;
    return subs.find(s => s.code === '5010') || null;
  }
  if (parentCode === '5100') {
    if (d.includes('meralco') || d.includes('electric') || d.includes('kuryente')) return subs.find(s => s.code === '5110') || null;
    if (d.includes('maynilad') || d.includes('water') || d.includes('tubig')) return subs.find(s => s.code === '5115') || null;
    if (d.includes('pld') || d.includes('internet') || d.includes('wifi') || d.includes('communicat')) return subs.find(s => s.code === '5120') || null;
    return subs.find(s => s.code === '5110') || null;
  }
  if (parentCode === '5200') {
    if (d.includes('ground') || d.includes('landscape') || d.includes('garden')) return subs.find(s => s.code === '5215') || null;
    if (d.includes('equipment') || d.includes('machine') || d.includes('computer')) return subs.find(s => s.code === '5220') || null;
    return subs.find(s => s.code === '5210') || null;
  }
  if (parentCode === '5300') {
    if (d.includes('liturg') || d.includes('host') || d.includes('wine') || d.includes('candle') || d.includes('incense')) return subs.find(s => s.code === '5315') || null;
    if (d.includes('clean')) return subs.find(s => s.code === '5320') || null;
    if (d.includes('office') || d.includes('stationery') || d.includes('paper')) return subs.find(s => s.code === '5310') || null;
    return subs.find(s => s.code === '5310') || null;
  }
  if (parentCode === '5400') {
    if (d.includes('catechis') || d.includes('formation') || d.includes('seminar')) return subs.find(s => s.code === '5410') || null;
    if (d.includes('outreach') || d.includes('feeding') || d.includes('medical') || d.includes('assistance')) return subs.find(s => s.code === '5415') || null;
    if (d.includes('altar') || d.includes('liturgy') || d.includes('mass')) return subs.find(s => s.code === '5420') || null;
    return subs.find(s => s.code === '5425') || null;
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// ANALYTICAL LINE ITEM — the atom of all analytics
// ═══════════════════════════════════════════════════════════

export interface AnalyticLine {
  id: string;              // JV id
  date: string;            // YYYY-MM-DD
  month: string;           // YYYY-MM
  year: string;            // YYYY
  quarter: string;         // YYYY-QN
  type: 'revenue' | 'expense';
  categoryCode: string;    // 4000, 5000 etc
  categoryName: string;
  subCode: string;         // 4010, 5110 etc
  subName: string;
  description: string;
  reference: string;
  amount: number;
  postedBy: string;
  dayOfWeek: number;       // 0=Sun, 1=Mon...
  isSunday: boolean;
  season: string;          // 'Summer' | 'Rainy' | 'Holiday' | 'Regular'
}

// Parse journal entries into analytic lines
export function getAnalyticLines(type?: 'revenue' | 'expense'): AnalyticLine[] {
  const lines: AnalyticLine[] = [];

  for (const entry of getJournalEntries()) {
    // Entries in the journal ledger are POSTED by definition — drafts live in a
    // separate store (finance_journal_drafts). Real posted entries (and the app's
    // own GL-booked entries) carry NO `status` field, so a `!== 'Posted'` filter
    // silently dropped every real entry and left analytics at ₱0. Only skip an entry
    // that is EXPLICITLY marked something other than Posted.
    if (entry.status && entry.status !== 'Posted') continue;

    for (const line of entry.lines) {
      // Revenue = credit to 4xxx account
      const isRevenue = line.credit > 0 && line.accountCode.startsWith('4');
      // Expense = debit to 5xxx account
      const isExpense = line.debit > 0 && line.accountCode.startsWith('5');

      if (!isRevenue && !isExpense) continue;
      if (type === 'revenue' && !isRevenue) continue;
      if (type === 'expense' && !isExpense) continue;

      const amount = isRevenue ? line.credit : line.debit;
      const date = new Date(entry.date + 'T00:00:00');
      const month = entry.date.slice(0, 7);
      const year = entry.date.slice(0, 4);
      const quarter = `${year}-Q${Math.ceil(parseInt(entry.date.slice(5, 7)) / 3)}`;
      const dayOfWeek = date.getDay();
      const isSunday = dayOfWeek === 0;
      const monthNum = parseInt(entry.date.slice(5, 7));
      const season = monthNum >= 3 && monthNum <= 5 ? 'Summer'
        : monthNum >= 6 && monthNum <= 10 ? 'Rainy'
        : monthNum >= 11 && monthNum <= 12 ? 'Holiday'
        : 'Holiday'; // Jan-Feb

      const sub = classifySubCategory(entry.description, line.accountCode);

      lines.push({
        id: entry.id,
        date: entry.date,
        month,
        year,
        quarter,
        type: isRevenue ? 'revenue' : 'expense',
        categoryCode: line.accountCode,
        categoryName: line.accountName,
        subCode: sub?.code || line.accountCode,
        subName: sub?.name || line.accountName,
        description: entry.description,
        reference: entry.reference,
        amount,
        postedBy: entry.postedBy,
        dayOfWeek,
        isSunday,
        season,
      });
    }
  }

  return lines.sort((a, b) => b.date.localeCompare(a.date));
}

// ═══════════════════════════════════════════════════════════
// PARETO ANALYSIS
// ═══════════════════════════════════════════════════════════

export interface ParetoItem {
  name: string;
  code: string;
  amount: number;
  percent: number;         // of this item
  cumulativePercent: number; // running total
  color: string;
  count: number;           // transaction count
}

export function getPareto(type: 'revenue' | 'expense', level: 'category' | 'sub'): ParetoItem[] {
  const lines = getAnalyticLines(type);
  const map = new Map<string, { name: string; code: string; amount: number; count: number; color: string }>();

  for (const line of lines) {
    const key = level === 'category' ? line.categoryCode : line.subCode;
    const name = level === 'category' ? line.categoryName : line.subName;
    const color = getColorForCode(key, type);

    const existing = map.get(key);
    if (existing) {
      existing.amount += line.amount;
      existing.count += 1;
    } else {
      map.set(key, { name, code: key, amount: line.amount, count: 1, color });
    }
  }

  const items = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  const total = items.reduce((s, i) => s + i.amount, 0);

  let cumulative = 0;
  return items.map(i => {
    cumulative += i.amount;
    return {
      name: i.name,
      code: i.code,
      amount: i.amount,
      percent: total > 0 ? (i.amount / total) * 100 : 0,
      cumulativePercent: total > 0 ? (cumulative / total) * 100 : 0,
      color: i.color,
      count: i.count,
    };
  });
}

function getColorForCode(code: string, type: 'revenue' | 'expense'): string {
  const subs = type === 'revenue' ? REVENUE_SUBS : EXPENSE_SUBS;
  const sub = subs.find(s => s.code === code);
  if (sub) return sub.color;

  // Parent category colors
  const catColors: Record<string, string> = type === 'revenue' ? {
    '4000': '#1A1A2E', '4100': '#C9963B', '4200': '#6B2737', '4300': '#B8322F',
  } : {
    '5000': '#6B2737', '5100': '#C9963B', '5200': '#2D6A4F', '5300': '#5B3A73', '5400': '#3B6BC9',
  };
  return catColors[code] || '#8C8374';
}

// ═══════════════════════════════════════════════════════════
// TIME COMPARISONS
// ═══════════════════════════════════════════════════════════

export interface MonthComparison {
  month: string;
  label: string;
  total: number;
  changeFromPrevious: number;  // percent
  changeAmount: number;
  breakdown: Record<string, number>;
}

export function getMonthlyComparison(type: 'revenue' | 'expense', level: 'category' | 'sub' = 'category'): MonthComparison[] {
  const lines = getAnalyticLines(type);
  const monthMap = new Map<string, { label: string; total: number; breakdown: Record<string, number> }>();

  for (const line of lines) {
    const key = line.month;
    const catKey = level === 'category' ? line.categoryName : line.subName;

    if (!monthMap.has(key)) {
      const [y, m] = key.split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      monthMap.set(key, {
        label: d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
        total: 0,
        breakdown: {},
      });
    }
    const entry = monthMap.get(key)!;
    entry.total += line.amount;
    entry.breakdown[catKey] = (entry.breakdown[catKey] || 0) + line.amount;
  }

  const sorted = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([, data], index) => {
    const prev = index > 0 ? sorted[index - 1][1].total : 0;
    const changeFromPrevious = prev > 0 ? ((data.total - prev) / prev) * 100 : 0;
    return {
      month: sorted[index][0],
      label: data.label,
      total: data.total,
      changeFromPrevious,
      changeAmount: data.total - (prev || data.total),
      breakdown: data.breakdown,
    };
  });
}

// ── Sunday vs Sunday comparison ──
export interface SundayComparison {
  date: string;
  label: string;
  total: number;
  massBreakdown: Record<string, number>;
}

export function getSundayCollections(): SundayComparison[] {
  const lines = getAnalyticLines('revenue').filter(l => l.isSunday && l.categoryCode === '4000');
  const dateMap = new Map<string, { label: string; total: number; massBreakdown: Record<string, number> }>();

  for (const line of lines) {
    if (!dateMap.has(line.date)) {
      const d = new Date(line.date + 'T00:00:00');
      dateMap.set(line.date, {
        label: d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
        total: 0,
        massBreakdown: {},
      });
    }
    const entry = dateMap.get(line.date)!;
    entry.total += line.amount;
    entry.massBreakdown[line.subName] = (entry.massBreakdown[line.subName] || 0) + line.amount;
  }

  return Array.from(dateMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({ date, ...data }));
}

// ── Seasonal comparison ──
export interface SeasonalComparison {
  season: string;
  total: number;
  count: number;
  average: number;
  breakdown: Record<string, number>;
}

export function getSeasonalComparison(type: 'revenue' | 'expense', categoryCode?: string): SeasonalComparison[] {
  const lines = getAnalyticLines(type).filter(l => !categoryCode || l.categoryCode === categoryCode);
  const map = new Map<string, { total: number; count: number; breakdown: Record<string, number> }>();

  for (const line of lines) {
    if (!map.has(line.season)) {
      map.set(line.season, { total: 0, count: 0, breakdown: {} });
    }
    const entry = map.get(line.season)!;
    entry.total += line.amount;
    entry.count += 1;
    entry.breakdown[line.subName] = (entry.breakdown[line.subName] || 0) + line.amount;
  }

  return Array.from(map.entries()).map(([season, data]) => ({
    season,
    ...data,
    average: data.count > 0 ? data.total / data.count : 0,
  }));
}

// ═══════════════════════════════════════════════════════════
// SUMMARY STATS
// ═══════════════════════════════════════════════════════════

export interface AnalyticsSummary {
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  revenueBudget: number;
  expenseBudget: number;
  expenseBudgetRemaining: number;
  expensePercentUsed: number;
  revenueCategoryCount: number;
  expenseCategoryCount: number;
  revenueTransactionCount: number;
  expenseTransactionCount: number;
  monthsOfData: number;
  averageMonthlyRevenue: number;
  averageMonthlyExpense: number;
}

export function getAnalyticsSummary(): AnalyticsSummary {
  const revLines = getAnalyticLines('revenue');
  const expLines = getAnalyticLines('expense');

  const totalRevenue = revLines.reduce((s, l) => s + l.amount, 0);
  const totalExpense = expLines.reduce((s, l) => s + l.amount, 0);

  // Revenue budget: ~₱1.8M annual (slightly above current)
  const revenueBudget = 1800000;
  // Expense budget: ₱1.2M annual
  const expenseBudget = 1200000;

  const months = new Set([...revLines.map(l => l.month), ...expLines.map(l => l.month)]);

  return {
    totalRevenue,
    totalExpense,
    netIncome: totalRevenue - totalExpense,
    revenueBudget,
    expenseBudget,
    expenseBudgetRemaining: expenseBudget - totalExpense,
    expensePercentUsed: expenseBudget > 0 ? (totalExpense / expenseBudget) * 100 : 0,
    revenueCategoryCount: new Set(revLines.map(l => l.categoryCode)).size,
    expenseCategoryCount: new Set(expLines.map(l => l.categoryCode)).size,
    revenueTransactionCount: revLines.length,
    expenseTransactionCount: expLines.length,
    monthsOfData: months.size,
    averageMonthlyRevenue: months.size > 0 ? totalRevenue / months.size : 0,
    averageMonthlyExpense: months.size > 0 ? totalExpense / months.size : 0,
  };
}

// ── Format helper ──
export function formatPeso(amount: number): string {
  return '\u20B1' + Math.round(amount).toLocaleString('en-PH');
}
