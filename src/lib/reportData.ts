export interface TrialBalanceAccount {
  code: string;
  name: string;
  type: 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses';
  debit: number;
  credit: number;
}

export const trialBalanceData: TrialBalanceAccount[] = [
  { code: '1110', name: 'Cash on Hand', type: 'Assets', debit: 45200.00, credit: 0 },
  { code: '1120', name: 'Cash in Bank - BPI', type: 'Assets', debit: 128450.00, credit: 0 },
  { code: '1121', name: 'Cash in Bank - BDO', type: 'Assets', debit: 85600.00, credit: 0 },
  { code: '1130', name: 'Petty Cash Fund', type: 'Assets', debit: 5000.00, credit: 0 },
  { code: '1210', name: 'Accounts Receivable', type: 'Assets', debit: 12500.00, credit: 0 },
  { code: '1310', name: 'Building & Improvements', type: 'Assets', debit: 150000.00, credit: 0 },
  { code: '1320', name: 'Furniture & Equipment', type: 'Assets', debit: 48500.00, credit: 0 },
  { code: '1330', name: 'Vehicle - Church Van', type: 'Assets', debit: 65000.00, credit: 0 },
  { code: '1340', name: 'Sound System', type: 'Assets', debit: 32000.00, credit: 0 },
  { code: '2110', name: 'Accounts Payable', type: 'Liabilities', debit: 0, credit: 18500.00 },
  { code: '2120', name: 'Notes Payable', type: 'Liabilities', debit: 0, credit: 45000.00 },
  { code: '2130', name: 'SSS Payable', type: 'Liabilities', debit: 0, credit: 8500.00 },
  { code: '2140', name: 'Withholding Tax Payable', type: 'Liabilities', debit: 0, credit: 6200.00 },
  { code: '3110', name: 'Parish Net Assets', type: 'Equity', debit: 0, credit: 180550.00 },
  { code: '3120', name: 'Restricted Donations', type: 'Equity', debit: 0, credit: 35000.00 },
  { code: '4110', name: 'Sunday Collections', type: 'Income', debit: 0, credit: 185000.00 },
  { code: '4120', name: 'Donations & Offerings', type: 'Income', debit: 0, credit: 42500.00 },
  { code: '4130', name: 'Sacramental Fees', type: 'Income', debit: 0, credit: 28500.00 },
  { code: '4140', name: 'Fundraising Events', type: 'Income', debit: 0, credit: 32000.00 },
  { code: '5110', name: 'Personnel Expenses', type: 'Expenses', debit: 98000.00, credit: 0 },
  { code: '5120', name: 'Utilities', type: 'Expenses', debit: 28500.00, credit: 0 },
  { code: '5130', name: 'Maintenance & Repairs', type: 'Expenses', debit: 18200.00, credit: 0 },
  { code: '5140', name: 'Office Supplies', type: 'Expenses', debit: 8500.00, credit: 0 },
  { code: '5150', name: 'Ministry Expenses', type: 'Expenses', debit: 22400.00, credit: 0 },
  { code: '5160', name: 'SSDM Programs', type: 'Expenses', debit: 12500.00, credit: 0 },
];

export interface IncomeStatementItem {
  category: string;
  items: { name: string; amount: number }[];
  isExpense?: boolean;
}

export const incomeStatementData = {
  revenue: [
    { name: 'Sunday Collections', amount: 185000 },
    { name: 'Donations & Offerings', amount: 42500 },
    { name: 'Sacramental Fees', amount: 28500 },
    { name: 'Fundraising Events', amount: 32000 },
    { name: 'Rental Income', amount: 12000 },
    { name: 'Interest Income', amount: 3500 },
  ],
  expenses: [
    { name: 'Personnel Salaries & Benefits', amount: 98000 },
    { name: 'Utilities (Electric, Water)', amount: 28500 },
    { name: 'Maintenance & Repairs', amount: 18200 },
    { name: 'Office Supplies', amount: 8500 },
    { name: 'Ministry Programs', amount: 22400 },
    { name: 'SSDM Programs', amount: 12500 },
    { name: 'Communication', amount: 4800 },
    { name: 'Miscellaneous', amount: 6200 },
  ],
  period: 'January 1 - May 31, 2026',
};

export interface BalanceSheetItem {
  category: string;
  items: { name: string; amount: number }[];
}

export const balanceSheetData = {
  assets: {
    current: [
      { name: 'Cash on Hand', amount: 45200 },
      { name: 'Cash in Bank - BPI', amount: 128450 },
      { name: 'Cash in Bank - BDO', amount: 85600 },
      { name: 'Petty Cash Fund', amount: 5000 },
      { name: 'Accounts Receivable', amount: 12500 },
    ],
    fixed: [
      { name: 'Building & Improvements', amount: 150000 },
      { name: 'Furniture & Equipment', amount: 48500 },
      { name: 'Vehicle - Church Van', amount: 65000 },
      { name: 'Sound System', amount: 32000 },
    ],
  },
  liabilities: [
    { name: 'Accounts Payable', amount: 18500 },
    { name: 'Notes Payable', amount: 45000 },
    { name: 'SSS Payable', amount: 8500 },
    { name: 'Withholding Tax Payable', amount: 6200 },
  ],
  equity: [
    { name: 'Parish Net Assets', amount: 180550 },
    { name: 'Restricted Donations', amount: 35000 },
  ],
  date: 'May 31, 2026',
};

export interface BudgetVsActualItem {
  account: string;
  annualBudget: number;
  ytdBudget: number;
  ytdActual: number;
}

export const budgetVsActualData: BudgetVsActualItem[] = [
  { account: 'Sunday Collections', annualBudget: 420000, ytdBudget: 175000, ytdActual: 185000 },
  { account: 'Donations', annualBudget: 100000, ytdBudget: 41667, ytdActual: 42500 },
  { account: 'Sacramental Fees', annualBudget: 70000, ytdBudget: 29167, ytdActual: 28500 },
  { account: 'Fundraising', annualBudget: 80000, ytdBudget: 33333, ytdActual: 32000 },
  { account: 'Personnel', annualBudget: 240000, ytdBudget: 100000, ytdActual: 98000 },
  { account: 'Utilities', annualBudget: 72000, ytdBudget: 30000, ytdActual: 28500 },
  { account: 'Maintenance', annualBudget: 48000, ytdBudget: 20000, ytdActual: 18200 },
  { account: 'Office Supplies', annualBudget: 24000, ytdBudget: 10000, ytdActual: 8500 },
  { account: 'Ministry', annualBudget: 60000, ytdBudget: 25000, ytdActual: 22400 },
  { account: 'SSDM', annualBudget: 35000, ytdBudget: 14583, ytdActual: 12500 },
];

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

export interface CollectionRecord {
  date: string;
  mass6am: number;
  mass8am: number;
  mass10am: number;
  mass6pm: number;
  cashTotal: number;
  checkTotal: number;
  digitalTotal: number;
}

export const collectionSummaryData: CollectionRecord[] = [
  { date: '2026-01-04', mass6am: 3200, mass8am: 6800, mass10am: 5200, mass6pm: 4100, cashTotal: 13500, checkTotal: 1200, digitalTotal: 4600 },
  { date: '2026-01-11', mass6am: 3500, mass8am: 7200, mass10am: 5800, mass6pm: 4300, cashTotal: 14200, checkTotal: 1800, digitalTotal: 5800 },
  { date: '2026-01-18', mass6am: 3100, mass8am: 6900, mass10am: 5400, mass6pm: 3900, cashTotal: 13100, checkTotal: 1500, digitalTotal: 6500 },
  { date: '2026-01-25', mass6am: 3800, mass8am: 7500, mass10am: 6100, mass6pm: 4500, cashTotal: 15200, checkTotal: 2000, digitalTotal: 6300 },
  { date: '2026-02-01', mass6am: 3400, mass8am: 7000, mass10am: 5600, mass6pm: 4200, cashTotal: 13800, checkTotal: 1600, digitalTotal: 7200 },
  { date: '2026-02-08', mass6am: 3600, mass8am: 7400, mass10am: 5900, mass6pm: 4400, cashTotal: 14500, checkTotal: 2100, digitalTotal: 6900 },
  { date: '2026-02-15', mass6am: 3300, mass8am: 7100, mass10am: 5500, mass6pm: 4000, cashTotal: 13400, checkTotal: 1400, digitalTotal: 7500 },
  { date: '2026-02-22', mass6am: 3700, mass8am: 7600, mass10am: 6200, mass6pm: 4600, cashTotal: 15100, checkTotal: 1900, digitalTotal: 7100 },
  { date: '2026-03-01', mass6am: 3500, mass8am: 7300, mass10am: 5700, mass6pm: 4300, cashTotal: 14100, checkTotal: 1700, digitalTotal: 6800 },
  { date: '2026-03-08', mass6am: 3900, mass8am: 7800, mass10am: 6400, mass6pm: 4700, cashTotal: 15600, checkTotal: 2200, digitalTotal: 7400 },
  { date: '2026-03-15', mass6am: 3600, mass8am: 7200, mass10am: 5800, mass6pm: 4400, cashTotal: 14300, checkTotal: 1800, digitalTotal: 7800 },
  { date: '2026-03-22', mass6am: 4000, mass8am: 7900, mass10am: 6500, mass6pm: 4800, cashTotal: 15800, checkTotal: 2400, digitalTotal: 7600 },
  { date: '2026-04-05', mass6am: 3700, mass8am: 7500, mass10am: 6000, mass6pm: 4500, cashTotal: 14700, checkTotal: 1600, digitalTotal: 8200 },
  { date: '2026-04-12', mass6am: 4100, mass8am: 8000, mass10am: 6600, mass6pm: 4900, cashTotal: 16200, checkTotal: 2300, digitalTotal: 7900 },
  { date: '2026-04-19', mass6am: 4200, mass8am: 8200, mass10am: 6800, mass6pm: 5100, cashTotal: 16500, checkTotal: 2500, digitalTotal: 8100 },
  { date: '2026-04-26', mass6am: 3800, mass8am: 7700, mass10am: 6200, mass6pm: 4600, cashTotal: 15300, checkTotal: 2000, digitalTotal: 8500 },
  { date: '2026-05-03', mass6am: 4300, mass8am: 8400, mass10am: 6900, mass6pm: 5200, cashTotal: 16800, checkTotal: 2600, digitalTotal: 8800 },
  { date: '2026-05-10', mass6am: 4000, mass8am: 7900, mass10am: 6400, mass6pm: 4800, cashTotal: 15500, checkTotal: 2100, digitalTotal: 9100 },
  { date: '2026-05-17', mass6am: 3900, mass8am: 7600, mass10am: 6100, mass6pm: 4700, cashTotal: 15100, checkTotal: 1800, digitalTotal: 8700 },
  { date: '2026-05-24', mass6am: 4100, mass8am: 8100, mass10am: 6700, mass6pm: 5000, cashTotal: 16400, checkTotal: 2400, digitalTotal: 9300 },
  { date: '2026-05-31', mass6am: 4500, mass8am: 8600, mass10am: 7100, mass6pm: 5400, cashTotal: 17300, checkTotal: 2800, digitalTotal: 9500 },
];

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
