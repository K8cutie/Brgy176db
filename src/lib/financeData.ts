// ============================================
// ChurchOS Financial Management — Hardcoded Data
// ============================================

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  balance: number;
  children?: Account[];
  normalBalance: 'debit' | 'credit';
}

export interface JournalEntry {
  id: string;
  date: string;
  reference: string;
  description: string;
  lines: JournalLine[];
  status: 'Posted' | 'Pending' | 'Draft';
  postedBy: string;
  totalDr: number;
  totalCr: number;
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface Collection {
  id: string;
  date: string;
  massTime: string;
  cash: number;
  checks: number;
  digital: number;
  total: number;
  postedBy: string;
  status: 'Posted' | 'Draft';
}

export interface BudgetItem {
  accountCode: string;
  accountName: string;
  category: 'Income' | 'Expense';
  budgetYTD: number;
  actualYTD: number;
  variance: number;
  variancePercent: number;
  status: 'On Track' | 'Over Budget' | 'Under Budget';
}

export interface ApprovalItem {
  id: string;
  title: string;
  amount: number;
  requester: string;
  date: string;
  category: 'Council Review' | 'Council Consent' | 'Bishop Approval';
  description: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approvalsNeeded?: number;
  approvalsCurrent?: number;
  attachments?: string[];
  history?: ApprovalHistoryStep[];
}

export interface ApprovalHistoryStep {
  action: string;
  by: string;
  date: string;
  comment?: string;
}

// ============================================
// Chart of Accounts
// ============================================

export const chartOfAccounts: Account[] = [
  {
    code: '1000', name: 'ASSETS', type: 'ASSET', balance: 2456789, normalBalance: 'debit',
    children: [
      {
        code: '1100', name: 'Current Assets', type: 'ASSET', balance: 290680, normalBalance: 'debit',
        children: [
          { code: '1000', name: 'Cash on Hand', type: 'ASSET', balance: 125340, normalBalance: 'debit' },
          { code: '1010', name: 'Cash in Bank (BPI)', type: 'ASSET', balance: 120340, normalBalance: 'debit' },
          { code: '1100', name: 'Accounts Receivable', type: 'ASSET', balance: 45000, normalBalance: 'debit' },
        ]
      },
      {
        code: '1200', name: 'Fixed Assets', type: 'ASSET', balance: 2166109, normalBalance: 'debit',
        children: [
          { code: '1200', name: 'Land & Building', type: 'ASSET', balance: 1850000, normalBalance: 'debit' },
          { code: '1210', name: 'Furniture & Equipment', type: 'ASSET', balance: 215789, normalBalance: 'debit' },
          { code: '1220', name: 'Vehicle', type: 'ASSET', balance: 100320, normalBalance: 'debit' },
        ]
      },
    ]
  },
  {
    code: '2000', name: 'LIABILITIES', type: 'LIABILITY', balance: 185000, normalBalance: 'credit',
    children: [
      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', balance: 35000, normalBalance: 'credit' },
      { code: '2100', name: 'Notes Payable', type: 'LIABILITY', balance: 150000, normalBalance: 'credit' },
    ]
  },
  {
    code: '3000', name: 'EQUITY', type: 'EQUITY', balance: 2271789, normalBalance: 'credit',
    children: [
      { code: '3000', name: 'Net Assets', type: 'EQUITY', balance: 2271789, normalBalance: 'credit' },
    ]
  },
  {
    code: '4000', name: 'INCOME', type: 'INCOME', balance: 1847350, normalBalance: 'credit',
    children: [
      { code: '4000', name: 'Sunday Collections', type: 'INCOME', balance: 856400, normalBalance: 'credit' },
      { code: '4100', name: 'Donations', type: 'INCOME', balance: 345200, normalBalance: 'credit' },
      { code: '4200', name: 'Fees & Permits', type: 'INCOME', balance: 245750, normalBalance: 'credit' },
      { code: '4300', name: 'Fundraising', type: 'INCOME', balance: 400000, normalBalance: 'credit' },
    ]
  },
  {
    code: '5000', name: 'EXPENSES', type: 'EXPENSE', balance: 1000950, normalBalance: 'debit',
    children: [
      { code: '5000', name: 'Personnel Costs', type: 'EXPENSE', balance: 425000, normalBalance: 'debit' },
      { code: '5100', name: 'Utilities', type: 'EXPENSE', balance: 185400, normalBalance: 'debit' },
      { code: '5200', name: 'Maintenance', type: 'EXPENSE', balance: 125000, normalBalance: 'debit' },
      { code: '5300', name: 'Supplies', type: 'EXPENSE', balance: 87350, normalBalance: 'debit' },
      { code: '5400', name: 'Ministry Expenses', type: 'EXPENSE', balance: 178200, normalBalance: 'debit' },
    ]
  },
];

// Flattened account list for dropdowns
export function getFlattenedAccounts(): { code: string; name: string; type: AccountType; balance: number; normalBalance: 'debit' | 'credit' }[] {
  const result: { code: string; name: string; type: AccountType; balance: number; normalBalance: 'debit' | 'credit' }[] = [];
  function traverse(accounts: Account[]) {
    for (const a of accounts) {
      result.push({ code: a.code, name: a.name, type: a.type, balance: a.balance, normalBalance: a.normalBalance });
      if (a.children) traverse(a.children);
    }
  }
  traverse(chartOfAccounts);
  return result;
}

// Get leaf accounts (those without children)
export function getLeafAccounts(): { code: string; name: string; type: AccountType }[] {
  const result: { code: string; name: string; type: AccountType }[] = [];
  function traverse(accounts: Account[]) {
    for (const a of accounts) {
      if (!a.children || a.children.length === 0) {
        result.push({ code: a.code, name: a.name, type: a.type });
      } else {
        traverse(a.children);
      }
    }
  }
  traverse(chartOfAccounts);
  return result;
}

// ============================================
// Journal Entries (25 rows)
// ============================================

export const journalEntries: JournalEntry[] = [
  {
    id: 'JV-2025-0001', date: '2025-01-05', reference: 'Sunday Collection — 6AM Mass',
    description: 'Jan 5 Sunday collection — 6:00 AM Mass', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 28450, totalCr: 28450,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 28450, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 28450 }],
  },
  {
    id: 'JV-2025-0002', date: '2025-01-05', reference: 'Sunday Collection — 8AM Mass',
    description: 'Jan 5 Sunday collection — 8:00 AM Mass', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 45680, totalCr: 45680,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 45680, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 45680 }],
  },
  {
    id: 'JV-2025-0003', date: '2025-01-05', reference: 'Sunday Collection — 10AM Mass',
    description: 'Jan 5 Sunday collection — 10:00 AM Mass', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 38900, totalCr: 38900,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 38900, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 38900 }],
  },
  {
    id: 'JV-2025-0004', date: '2025-01-05', reference: 'Sunday Collection — 6PM Mass',
    description: 'Jan 5 Sunday collection — 6:00 PM Mass', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 22300, totalCr: 22300,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 22300, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 22300 }],
  },
  {
    id: 'JV-2025-0005', date: '2025-01-08', reference: 'MERALCO Payment — Jan',
    description: 'MERALCO electricity bill payment — January', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 12400, totalCr: 12400,
    lines: [{ accountCode: '5100', accountName: 'Utilities', debit: 12400, credit: 0 }, { accountCode: '1010', accountName: 'Cash in Bank (BPI)', debit: 0, credit: 12400 }],
  },
  {
    id: 'JV-2025-0006', date: '2025-01-10', reference: 'Maynilad Payment — Jan',
    description: 'Maynilad water bill payment — January', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 3500, totalCr: 3500,
    lines: [{ accountCode: '5100', accountName: 'Utilities', debit: 3500, credit: 0 }, { accountCode: '1010', accountName: 'Cash in Bank (BPI)', debit: 0, credit: 3500 }],
  },
  {
    id: 'JV-2025-0007', date: '2025-01-10', reference: 'Internet — PLDT Jan',
    description: 'PLDT internet & communications — January', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 2800, totalCr: 2800,
    lines: [{ accountCode: '5100', accountName: 'Utilities', debit: 2800, credit: 0 }, { accountCode: '1010', accountName: 'Cash in Bank (BPI)', debit: 0, credit: 2800 }],
  },
  {
    id: 'JV-2025-0008', date: '2025-01-12', reference: 'Sunday Collection — 6AM Mass',
    description: 'Jan 12 Sunday collection — 6:00 AM Mass', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 31200, totalCr: 31200,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 31200, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 31200 }],
  },
  {
    id: 'JV-2025-0009', date: '2025-01-12', reference: 'Sunday Collection — 8AM Mass',
    description: 'Jan 12 Sunday collection — 8:00 AM Mass', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 52300, totalCr: 52300,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 52300, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 52300 }],
  },
  {
    id: 'JV-2025-0010', date: '2025-01-12', reference: 'Sunday Collection — 10AM Mass',
    description: 'Jan 12 Sunday collection — 10:00 AM Mass', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 41200, totalCr: 41200,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 41200, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 41200 }],
  },
  {
    id: 'JV-2025-0011', date: '2025-01-12', reference: 'Sunday Collection — 6PM Mass',
    description: 'Jan 12 Sunday collection — 6:00 PM Mass', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 25100, totalCr: 25100,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 25100, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 25100 }],
  },
  {
    id: 'JV-2025-0012', date: '2025-01-15', reference: 'Personnel Salary — Jan 1-15',
    description: 'Semi-monthly salary — January 1-15', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 85000, totalCr: 85000,
    lines: [
      { accountCode: '5000', accountName: 'Personnel Costs', debit: 85000, credit: 0 },
      { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: 35000 },
      { accountCode: '1010', accountName: 'Cash in Bank (BPI)', debit: 0, credit: 50000 },
    ],
  },
  {
    id: 'JV-2025-0013', date: '2025-01-15', reference: 'Donation — Mr. & Mrs. Reyes',
    description: 'Cash donation from Mr. & Mrs. Antonio Reyes', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 25000, totalCr: 25000,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 25000, credit: 0 }, { accountCode: '4100', accountName: 'Donations', debit: 0, credit: 25000 }],
  },
  {
    id: 'JV-2025-0014', date: '2025-01-16', reference: 'Office Supplies Purchase',
    description: 'Office supplies from National Book Store', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 8750, totalCr: 8750,
    lines: [{ accountCode: '5300', accountName: 'Supplies', debit: 8750, credit: 0 }, { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: 8750 }],
  },
  {
    id: 'JV-2025-0015', date: '2025-01-18', reference: 'SSDM Medical Assistance — J. Cruz',
    description: 'Medical assistance for Juan Dela Cruz', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 8000, totalCr: 8000,
    lines: [{ accountCode: '5400', accountName: 'Ministry Expenses', debit: 8000, credit: 0 }, { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: 8000 }],
  },
  {
    id: 'JV-2025-0016', date: '2025-01-19', reference: 'Sunday Collection — All Masses',
    description: 'Jan 19 Sunday collections — all 4 Masses', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 138200, totalCr: 138200,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 138200, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 138200 }],
  },
  {
    id: 'JV-2025-0017', date: '2025-01-20', reference: 'Building Maintenance — Roof Repair',
    description: 'Emergency roof repair — north wing', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 18500, totalCr: 18500,
    lines: [{ accountCode: '5200', accountName: 'Maintenance', debit: 18500, credit: 0 }, { accountCode: '1010', accountName: 'Cash in Bank (BPI)', debit: 0, credit: 18500 }],
  },
  {
    id: 'JV-2025-0018', date: '2025-01-22', reference: 'Fundraising — Bake Sale',
    description: 'Proceeds from parish bake sale', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 32150, totalCr: 32150,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 32150, credit: 0 }, { accountCode: '4300', accountName: 'Fundraising', debit: 0, credit: 32150 }],
  },
  {
    id: 'JV-2025-0019', date: '2025-01-25', reference: 'Fees & Permits — Wedding Jan 25',
    description: 'Wedding fees and permit processing', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 8750, totalCr: 8750,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 8750, credit: 0 }, { accountCode: '4200', accountName: 'Fees & Permits', debit: 0, credit: 8750 }],
  },
  {
    id: 'JV-2025-0020', date: '2025-01-28', reference: 'Personnel Salary — Jan 16-31',
    description: 'Semi-monthly salary — January 16-31', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 85000, totalCr: 85000,
    lines: [
      { accountCode: '5000', accountName: 'Personnel Costs', debit: 85000, credit: 0 },
      { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: 35000 },
      { accountCode: '1010', accountName: 'Cash in Bank (BPI)', debit: 0, credit: 50000 },
    ],
  },
  {
    id: 'JV-2025-0021', date: '2025-01-28', reference: 'Bank Deposit — Jan Collections',
    description: 'Deposit of January collections to BPI', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 120340, totalCr: 120340,
    lines: [{ accountCode: '1010', accountName: 'Cash in Bank (BPI)', debit: 120340, credit: 0 }, { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: 120340 }],
  },
  {
    id: 'JV-2025-0022', date: '2025-02-02', reference: 'Sunday Collection — All Masses',
    description: 'Feb 2 Sunday collections — all 4 Masses', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 142800, totalCr: 142800,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 142800, credit: 0 }, { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 142800 }],
  },
  {
    id: 'JV-2025-0023', date: '2025-02-05', reference: 'Donation — Anonymous — Feeding',
    description: 'Anonymous donation for feeding program', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 15000, totalCr: 15000,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 15000, credit: 0 }, { accountCode: '4100', accountName: 'Donations', debit: 0, credit: 15000 }],
  },
  {
    id: 'JV-2025-0024', date: '2025-02-10', reference: 'SSDM Feeding Program — Supplies',
    description: 'Feeding program food and supply expenses', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 12500, totalCr: 12500,
    lines: [{ accountCode: '5400', accountName: 'Ministry Expenses', debit: 12500, credit: 0 }, { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: 12500 }],
  },
  {
    id: 'JV-2025-0025', date: '2025-02-12', reference: 'Baptismal Fees & Certificates',
    description: 'Baptismal fees and certificate processing', status: 'Posted', postedBy: 'Maria Santos',
    totalDr: 5400, totalCr: 5400,
    lines: [{ accountCode: '1000', accountName: 'Cash on Hand', debit: 5400, credit: 0 }, { accountCode: '4200', accountName: 'Fees & Permits', debit: 0, credit: 5400 }],
  },
];

// ============================================
// Sunday Collections (24 rows — 6 months)
// ============================================

export const collectionsData: Collection[] = [
  // January 2025
  { id: 'SC-001', date: '2025-01-05', massTime: '6:00 AM', cash: 22450, checks: 5000, digital: 1000, total: 28450, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-002', date: '2025-01-05', massTime: '8:00 AM', cash: 32450, checks: 8200, digital: 5030, total: 45680, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-003', date: '2025-01-05', massTime: '10:00 AM', cash: 28900, checks: 8000, digital: 2000, total: 38900, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-004', date: '2025-01-05', massTime: '6:00 PM', cash: 17300, checks: 3000, digital: 2000, total: 22300, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-005', date: '2025-01-12', massTime: '6:00 AM', cash: 25200, checks: 5000, digital: 1000, total: 31200, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-006', date: '2025-01-12', massTime: '8:00 AM', cash: 38300, checks: 10000, digital: 4000, total: 52300, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-007', date: '2025-01-12', massTime: '10:00 AM', cash: 30200, checks: 9000, digital: 2000, total: 41200, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-008', date: '2025-01-12', massTime: '6:00 PM', cash: 19100, checks: 4000, digital: 2000, total: 25100, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-009', date: '2025-01-19', massTime: '6:00 AM', cash: 28200, checks: 6000, digital: 1000, total: 35200, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-010', date: '2025-01-19', massTime: '8:00 AM', cash: 42300, checks: 12000, digital: 5000, total: 59300, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-011', date: '2025-01-19', massTime: '10:00 AM', cash: 30200, checks: 8500, digital: 3500, total: 42200, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-012', date: '2025-01-19', massTime: '6:00 PM', cash: 1500, checks: 0, digital: 0, total: 1500, postedBy: 'Maria Santos', status: 'Posted' },
  // February 2025
  { id: 'SC-013', date: '2025-02-02', massTime: '6:00 AM', cash: 30200, checks: 8000, digital: 2000, total: 40200, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-014', date: '2025-02-02', massTime: '8:00 AM', cash: 42500, checks: 15000, digital: 3500, total: 61000, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-015', date: '2025-02-02', massTime: '10:00 AM', cash: 28300, checks: 8000, digital: 2300, total: 38600, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-016', date: '2025-02-02', massTime: '6:00 PM', cash: 2100, checks: 0, digital: 0, total: 2100, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-017', date: '2025-02-09', massTime: '6:00 AM', cash: 28400, checks: 6000, digital: 1500, total: 35900, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-018', date: '2025-02-09', massTime: '8:00 AM', cash: 38500, checks: 11000, digital: 4500, total: 54000, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-019', date: '2025-02-09', massTime: '10:00 AM', cash: 29200, checks: 7500, digital: 2000, total: 38700, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-020', date: '2025-02-09', massTime: '6:00 PM', cash: 1850, checks: 0, digital: 0, total: 1850, postedBy: 'Maria Santos', status: 'Posted' },
  // March 2025 (partial)
  { id: 'SC-021', date: '2025-03-02', massTime: '6:00 AM', cash: 32400, checks: 7000, digital: 2000, total: 41400, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-022', date: '2025-03-02', massTime: '8:00 AM', cash: 45200, checks: 13000, digital: 3500, total: 61700, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-023', date: '2025-03-02', massTime: '10:00 AM', cash: 31800, checks: 9000, digital: 2500, total: 43300, postedBy: 'Maria Santos', status: 'Posted' },
  { id: 'SC-024', date: '2025-03-02', massTime: '6:00 PM', cash: 2250, checks: 0, digital: 0, total: 2250, postedBy: 'Maria Santos', status: 'Posted' },
];

// ============================================
// Budget Data
// ============================================

export const budgetData: BudgetItem[] = [
  // Income
  { accountCode: '4000', accountName: 'Sunday Collections', category: 'Income', budgetYTD: 1200000, actualYTD: 856400, variance: 343600, variancePercent: 28.6, status: 'Under Budget' },
  { accountCode: '4100', accountName: 'Donations', category: 'Income', budgetYTD: 400000, actualYTD: 345200, variance: 54800, variancePercent: 13.7, status: 'Under Budget' },
  { accountCode: '4200', accountName: 'Fees & Permits', category: 'Income', budgetYTD: 300000, actualYTD: 245750, variance: 54250, variancePercent: 18.1, status: 'Under Budget' },
  { accountCode: '4300', accountName: 'Fundraising', category: 'Income', budgetYTD: 500000, actualYTD: 400000, variance: 100000, variancePercent: 20.0, status: 'Under Budget' },
  // Expenses
  { accountCode: '5000', accountName: 'Personnel Costs', category: 'Expense', budgetYTD: 900000, actualYTD: 425000, variance: -475000, variancePercent: -52.8, status: 'On Track' },
  { accountCode: '5100', accountName: 'Utilities', category: 'Expense', budgetYTD: 240000, actualYTD: 185400, variance: -54600, variancePercent: -22.8, status: 'On Track' },
  { accountCode: '5200', accountName: 'Maintenance', category: 'Expense', budgetYTD: 200000, actualYTD: 125000, variance: -75000, variancePercent: -37.5, status: 'On Track' },
  { accountCode: '5300', accountName: 'Supplies', category: 'Expense', budgetYTD: 120000, actualYTD: 87350, variance: -32650, variancePercent: -27.2, status: 'On Track' },
  { accountCode: '5400', accountName: 'Ministry Expenses', category: 'Expense', budgetYTD: 200000, actualYTD: 178200, variance: -21800, variancePercent: -10.9, status: 'On Track' },
];

// ============================================
// Approval Queue Items
// ============================================

export const approvalItems: ApprovalItem[] = [
  {
    id: 'AP-001', title: 'Air conditioning repair for Parish Hall', amount: 180000,
    requester: 'Maria Santos', date: '2025-02-10', category: 'Council Review', description: 'Air conditioning units in the parish hall need repair. 4 units not cooling properly. Quote from AC Technicians Inc.',
    status: 'Pending', approvalsNeeded: 1, approvalsCurrent: 0,
    attachments: ['quote_ac_repair.pdf'],
    history: [
      { action: 'Submitted', by: 'Maria Santos', date: '2025-02-10 09:30', comment: 'Urgent — summer heat approaching' },
      { action: 'Under Review', by: 'Council Secretary', date: '2025-02-11 14:00', comment: 'Scheduled for council meeting Feb 15' },
    ],
  },
  {
    id: 'AP-002', title: 'Roof repair — north wing leak', amount: 320000,
    requester: 'Fr. Jose Reyes', date: '2025-02-08', category: 'Council Consent', description: 'Roof repair needed for persistent leak in north wing. Includes replacement of damaged ceiling panels.',
    status: 'Pending', approvalsNeeded: 3, approvalsCurrent: 2,
    attachments: ['roof_inspection.pdf', 'contractor_quote.pdf'],
    history: [
      { action: 'Submitted', by: 'Fr. Jose Reyes', date: '2025-02-08 10:00', comment: 'Leak worsening after recent rains' },
      { action: 'Reviewed', by: 'Council Member A. Cruz', date: '2025-02-09 11:00', comment: 'Approved — necessary repair' },
      { action: 'Reviewed', by: 'Council Member B. Lim', date: '2025-02-10 09:00', comment: 'Approved — within reasonable budget' },
      { action: 'Pending', by: 'Council Member C. Tan', date: '2025-02-10', comment: 'Awaiting vote' },
    ],
  },
  {
    id: 'AP-003', title: 'Chapel renovation — interior restoration', amount: 650000,
    requester: 'Fr. Jose Reyes', date: '2025-05-01', category: 'Bishop Approval', description: 'Interior restoration of St. Joseph Chapel including new pews, altar refinishing, and lighting upgrade.',
    status: 'Pending', approvalsNeeded: 1, approvalsCurrent: 0,
    attachments: ['renovation_plan.pdf', 'bishop_letter.pdf', 'contractor_bid.pdf'],
    history: [
      { action: 'Submitted', by: 'Fr. Jose Reyes', date: '2025-05-01 08:00', comment: 'Bishop requested chapel upgrade before confirmation season' },
      { action: 'Forwarded', by: 'Diocesan Office', date: '2025-05-03 16:00', comment: 'Under bishop review' },
    ],
  },
];

// ============================================
// Helper functions
// ============================================

export function formatPeso(value: number): string {
  const absVal = Math.abs(value);
  const formatted = '₱' + absVal.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value < 0 ? '-' + formatted : formatted;
}

export function formatPesoWhole(value: number): string {
  const absVal = Math.abs(value);
  const formatted = '₱' + absVal.toLocaleString('en-PH');
  return value < 0 ? '-' + formatted : formatted;
}

export function getApprovalBadgeColor(category: ApprovalItem['category']): string {
  switch (category) {
    case 'Council Review': return 'bg-warning/15 text-[#9A7B3D]';
    case 'Council Consent': return 'bg-orange-100 text-orange-700';
    case 'Bishop Approval': return 'bg-purple-100 text-purple-700';
    default: return 'bg-cream-dark text-warm-gray';
  }
}

export function getAmountApprovalLevel(amount: number): { label: string; color: string; bgColor: string } {
  if (amount < 100000) return { label: 'Direct Post', color: 'text-success', bgColor: 'bg-success/10' };
  if (amount < 200000) return { label: 'Council Review Required', color: 'text-warning', bgColor: 'bg-warning/10' };
  if (amount < 500000) return { label: 'Council Consent Required', color: 'text-orange-600', bgColor: 'bg-orange-50' };
  return { label: 'Bishop Approval Required', color: 'text-error', bgColor: 'bg-error/10' };
}
