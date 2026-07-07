// ═══════════════════════════════════════════════════════════
// Report catalog + sacramental sample data.
//
// NOTE: the financial report FIXTURES that used to live here
// (trial balance / income statement / balance sheet / budget /
// collection summary) were removed — those reports now derive
// LIVE from the persisted finance stores via src/lib/ledger.ts.
// Only the Sacramental Statistics sample remains (clearly
// labeled as sample data in the UI) until registry-derived
// statistics land.
// ═══════════════════════════════════════════════════════════

export interface SacramentalRecord {
  sacrament: string;
  previousQuarter: number;
  thisQuarter: number;
  cumulative: number;
  notes: string;
}

export const sacramentalStatsData = {
  quarter: 'Q2 2026',
  parish: 'St. Agnes Parish',
  diocese: 'Diocese of San Fernando',
  city: 'Mabalacat',
  province: 'Pampanga',
  priest: 'Fr. Antonio Reyes',
  records: [
    { sacrament: 'Baptisms', previousQuarter: 24, thisQuarter: 31, cumulative: 55, notes: 'Includes 5 adult baptisms' },
    { sacrament: 'Confirmations', previousQuarter: 18, thisQuarter: 22, cumulative: 40, notes: 'Batch confirmation April 15' },
    { sacrament: 'First Communions', previousQuarter: 20, thisQuarter: 28, cumulative: 48, notes: 'Catechism class of 45' },
    { sacrament: 'Marriages', previousQuarter: 6, thisQuarter: 8, cumulative: 14, notes: '2 convalidation ceremonies' },
    { sacrament: 'Deaths / Funerals', previousQuarter: 4, thisQuarter: 7, cumulative: 11, notes: '1 infant, 6 adults' },
  ] as SacramentalRecord[],
  ageBreakdown: {
    baptisms: [
      { ageGroup: 'Infants (0-1)', male: 12, female: 10 },
      { ageGroup: 'Children (2-7)', male: 3, female: 2 },
      { ageGroup: 'Adults (18+)', male: 2, female: 2 },
    ],
    confirmations: [
      { ageGroup: 'Youth (13-17)', male: 10, female: 8 },
      { ageGroup: 'Adults (18+)', male: 2, female: 2 },
    ],
  },
};

export type ReportType =
  | 'trial-balance'
  | 'income-statement'
  | 'balance-sheet'
  | 'budget-vs-actual'
  | 'sacramental-statistics'
  | 'collection-summary';

export interface ReportConfig {
  id: ReportType;
  title: string;
  description: string;
  icon: string;
  category: 'Financial' | 'Sacramental';
}

export const reports: ReportConfig[] = [
  { id: 'trial-balance', title: 'Trial Balance', description: 'Assets, liabilities, and equity summary', icon: 'Scale', category: 'Financial' },
  { id: 'income-statement', title: 'Income Statement', description: 'Revenue and expense summary for period', icon: 'TrendingUp', category: 'Financial' },
  { id: 'balance-sheet', title: 'Balance Sheet', description: 'Financial position at a point in time', icon: 'BookOpen', category: 'Financial' },
  { id: 'budget-vs-actual', title: 'Budget vs Actual', description: 'Compare budgeted vs actual amounts', icon: 'BarChart3', category: 'Financial' },
  { id: 'sacramental-statistics', title: 'Sacramental Statistics', description: 'Quarterly CBCP sacramental report format', icon: 'BookOpen', category: 'Sacramental' },
  { id: 'collection-summary', title: 'Collection Summary', description: 'Sunday collections by Mass time and method', icon: 'DollarSign', category: 'Sacramental' },
];
