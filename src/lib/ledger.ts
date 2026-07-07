// ═══════════════════════════════════════════════════════════
// ChurchOS Ledger — pure derivation of financial reports from the
// SAME persisted stores FinancePage writes (journal entries,
// collections, budget items). Reports must never read hardcoded
// report fixtures again: post an entry → every report moves.
//
// All money arithmetic is done in INTEGER CENTAVOS internally
// (storage stays peso numbers) so float accumulation can never
// unbalance a trial balance.
// ═══════════════════════════════════════════════════════════

import { chartOfAccounts } from './financeData';
import type { Account, AccountType, JournalEntry, Collection, BudgetItem } from './financeData';

// Inclusive ISO date range (YYYY-MM-DD). Omitted bounds are open.
export interface Period { from?: string; to?: string }

export function toCentavos(pesos: number): number {
  return Math.round(pesos * 100);
}

export function fromCentavos(centavos: number): number {
  return centavos / 100;
}

// Entries the app persists always carry a status; GL-booked entries from other
// modules may not. Consistent with analyticsEngine: only an EXPLICIT
// non-Posted status (Pending/Draft/Rejected) excludes an entry from reports.
function isPosted(e: JournalEntry): boolean {
  return !e.status || e.status === 'Posted';
}

function inPeriod(date: string, p?: Period): boolean {
  if (!p) return true;
  if (p.from && date < p.from) return false;
  if (p.to && date > p.to) return false;
  return true;
}

// ── Collections → implicit journal postings ──
// Collections posted from the Collections tab never create a journal entry,
// so book each as an implicit Dr 1000 Cash on Hand / Cr 4000 Sunday
// Collections posting. The SEED data journalizes the same Sundays it seeds as
// collections, so a collection that is ALREADY journalized must be skipped —
// counting both would double-book the same money.
//
// Dedupe is at ENTRY granularity, not date granularity: an unrelated journal
// entry that happens to credit 4000 on the same date (a special second
// collection, typhoon relief, a correcting entry) must NOT silently swallow
// the day's regular collections. A collection counts as journalized when:
//   (a) a posted journal entry credits 4000 on that date for EXACTLY the
//       collection's total (per-Mass mirror entries) — each such amount is
//       consumed by at most one collection; or
//   (b) a posted journal entry on that date is explicitly a collection
//       posting for this Mass or for "all Masses" (reference/description
//       match), covering aggregate day entries even if totals differ.
export function collectionsAsEntries(entries: JournalEntry[], collections: Collection[]): JournalEntry[] {
  interface DayJournal { amounts: number[]; collectionTexts: string[] }
  const byDate = new Map<string, DayJournal>();
  for (const e of entries) {
    if (!isPosted(e)) continue;
    const cent = e.lines.reduce((s, l) => s + (l.accountCode === '4000' ? toCentavos(l.credit) : 0), 0);
    if (cent <= 0) continue;
    const day = byDate.get(e.date) ?? { amounts: [], collectionTexts: [] };
    day.amounts.push(cent);
    const text = `${e.reference} ${e.description}`.toLowerCase();
    if (text.includes('collection')) day.collectionTexts.push(text);
    byDate.set(e.date, day);
  }

  const alreadyJournalized = (c: Collection): boolean => {
    const day = byDate.get(c.date);
    if (!day) return false;
    // (a) exact-amount match — consume it so two identical collections cannot
    // both dedupe against the same single journal entry.
    const idx = day.amounts.indexOf(toCentavos(c.total));
    if (idx !== -1) {
      day.amounts.splice(idx, 1);
      return true;
    }
    // (b) reference match: '6:00 AM' also matches the compact '6AM' spelling.
    const massTime = c.massTime.toLowerCase();
    const compact = massTime.replace(':00', '').replace(/\s+/g, '');
    return day.collectionTexts.some(
      (t) => t.includes('all masses') || t.includes(massTime) || t.includes(compact),
    );
  };

  return collections
    .filter((c) => c.status === 'Posted' && !alreadyJournalized(c))
    .map((c) => ({
      id: `COL-JE-${c.id}`,
      date: c.date,
      reference: `Sunday Collection — ${c.massTime}`,
      description: `Sunday collection — ${c.massTime} Mass`,
      status: 'Posted' as const,
      postedBy: c.postedBy,
      totalDr: c.total,
      totalCr: c.total,
      lines: [
        { accountCode: '1000', accountName: 'Cash on Hand', debit: c.total, credit: 0 },
        { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: c.total },
      ],
    }));
}

// Net posting per account code in centavos (positive = net debit).
function postingsByAccount(entries: JournalEntry[], collections: Collection[], period?: Period): Map<string, number> {
  const map = new Map<string, number>();
  const all = [...entries.filter(isPosted), ...collectionsAsEntries(entries, collections)];
  for (const e of all) {
    if (!inPeriod(e.date, period)) continue;
    for (const l of e.lines) {
      map.set(l.accountCode, (map.get(l.accountCode) ?? 0) + toCentavos(l.debit) - toCentavos(l.credit));
    }
  }
  return map;
}

// Account name lookup for codes that appear in postings but not in the chart.
function nameByCode(entries: JournalEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of entries) {
    for (const l of e.lines) {
      if (l.accountCode && !map.has(l.accountCode)) map.set(l.accountCode, l.accountName);
    }
  }
  return map;
}

function leafAccountsOf(accounts: Account[]): Account[] {
  const result: Account[] = [];
  const walk = (accs: Account[]) => {
    for (const a of accs) {
      if (a.children && a.children.length > 0) walk(a.children);
      else result.push(a);
    }
  };
  walk(accounts);
  return result;
}

// ── Chart of accounts with derived balances ──
// The static chart 'balance' is the documented OPENING balance;
// current = opening + postings. Parents roll up from their children.
export function deriveAccountBalances(
  entries: JournalEntry[],
  collections: Collection[],
  accounts: Account[] = chartOfAccounts,
  period?: Period,
): Account[] {
  const postings = postingsByAccount(entries, collections, period);
  const walk = (accs: Account[]): Account[] =>
    accs.map((a) => {
      if (a.children && a.children.length > 0) {
        const children = walk(a.children);
        const totalCent = children.reduce((s, c) => s + toCentavos(c.balance), 0);
        return { ...a, children, balance: fromCentavos(totalCent) };
      }
      const drcr = postings.get(a.code) ?? 0;
      const openingCent = toCentavos(a.balance);
      const currentCent = a.normalBalance === 'debit' ? openingCent + drcr : openingCent - drcr;
      return { ...a, balance: fromCentavos(currentCent) };
    });
  return walk(accounts);
}

// ── Trial Balance ──
export interface TrialBalanceRow {
  code: string;
  name: string;
  type: 'Assets' | 'Liabilities' | 'Equity' | 'Income' | 'Expenses';
  debit: number;
  credit: number;
}

export interface TrialBalanceResult {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

const TYPE_LABEL: Record<AccountType, TrialBalanceRow['type']> = {
  ASSET: 'Assets', LIABILITY: 'Liabilities', EQUITY: 'Equity', INCOME: 'Income', EXPENSE: 'Expenses',
};

// Balance-sheet accounts carry opening + all postings up to period end.
// Income/expense are PERIOD accounts: postings within the period only — their
// static chart 'balance' is demo YTD with no journal detail behind it, so
// including it would double count and break the Dr=Cr tie.
export function deriveTrialBalance(
  entries: JournalEntry[],
  collections: Collection[],
  period?: Period,
): TrialBalanceResult {
  const asOf = postingsByAccount(entries, collections, period?.to ? { to: period.to } : undefined);
  const activity = postingsByAccount(entries, collections, period);
  const names = nameByCode([...entries, ...collectionsAsEntries(entries, collections)]);
  const leaves = leafAccountsOf(chartOfAccounts);
  const chartCodes = new Set(leaves.map((a) => a.code));

  const rows: TrialBalanceRow[] = [];
  let totalDebitCent = 0;
  let totalCreditCent = 0;

  const push = (code: string, name: string, type: TrialBalanceRow['type'], drcrCent: number) => {
    if (drcrCent === 0) {
      rows.push({ code, name, type, debit: 0, credit: 0 });
      return;
    }
    if (drcrCent > 0) {
      totalDebitCent += drcrCent;
      rows.push({ code, name, type, debit: fromCentavos(drcrCent), credit: 0 });
    } else {
      totalCreditCent += -drcrCent;
      rows.push({ code, name, type, debit: 0, credit: fromCentavos(-drcrCent) });
    }
  };

  for (const a of leaves) {
    const isPeriodAccount = a.type === 'INCOME' || a.type === 'EXPENSE';
    const openingCent = isPeriodAccount
      ? 0
      : a.normalBalance === 'debit' ? toCentavos(a.balance) : -toCentavos(a.balance);
    const postedCent = isPeriodAccount ? (activity.get(a.code) ?? 0) : (asOf.get(a.code) ?? 0);
    push(a.code, a.name, TYPE_LABEL[a.type], openingCent + postedCent);
  }

  // Defensive: codes posted against but missing from the chart still count,
  // otherwise the tie (and the balance sheet equation) silently breaks.
  // Same period semantics as chart leaves: 4xxx/5xxx are period accounts
  // (period activity only), anything else carries through period end.
  const extraCodes = new Set([...asOf.keys(), ...activity.keys()].filter((c) => !chartCodes.has(c)));
  for (const code of extraCodes) {
    const isPeriodCode = code.startsWith('4') || code.startsWith('5');
    const cent = isPeriodCode ? (activity.get(code) ?? 0) : (asOf.get(code) ?? 0);
    if (cent === 0) continue;
    const type: TrialBalanceRow['type'] =
      code.startsWith('4') ? 'Income' : code.startsWith('5') ? 'Expenses' :
      code.startsWith('2') ? 'Liabilities' : code.startsWith('3') ? 'Equity' : 'Assets';
    push(code, names.get(code) ?? `Account ${code}`, type, cent);
  }

  // ── Retained earnings for a from-bounded period ──
  // Balance-sheet rows carry ALL postings up to period end, but income/expense
  // rows show period activity only — so pre-period net income would sit in the
  // asset rows with no matching credit and the trial balance could never tie.
  // Fold that prior net income into a derived equity row, exactly like a real
  // closing entry rolls prior-year income into retained earnings.
  if (period?.from) {
    let priorCent = 0; // net debit of prior-period income/expense postings
    for (const a of leaves) {
      if (a.type !== 'INCOME' && a.type !== 'EXPENSE') continue;
      priorCent += (asOf.get(a.code) ?? 0) - (activity.get(a.code) ?? 0);
    }
    for (const code of extraCodes) {
      if (!code.startsWith('4') && !code.startsWith('5')) continue;
      priorCent += (asOf.get(code) ?? 0) - (activity.get(code) ?? 0);
    }
    if (priorCent !== 0) {
      push('3900', 'Net Income — Prior Periods (derived)', 'Equity', priorCent);
    }
  }

  return {
    rows,
    totalDebit: fromCentavos(totalDebitCent),
    totalCredit: fromCentavos(totalCreditCent),
    balanced: totalDebitCent === totalCreditCent,
  };
}

// ── Income Statement ──
export interface StatementLine { code: string; name: string; amount: number }

export interface IncomeStatementResult {
  revenue: StatementLine[];
  expenses: StatementLine[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
}

// Internal centavo version so the balance sheet can fold exact net income
// into equity without float round-tripping.
function incomeStatementCent(entries: JournalEntry[], collections: Collection[], period?: Period) {
  const activity = postingsByAccount(entries, collections, period);
  const names = nameByCode([...entries, ...collectionsAsEntries(entries, collections)]);
  const leaves = leafAccountsOf(chartOfAccounts);
  const chartCodes = new Set(leaves.map((a) => a.code));

  const revenue: { code: string; name: string; cent: number }[] = [];
  const expenses: { code: string; name: string; cent: number }[] = [];

  for (const a of leaves) {
    const drcr = activity.get(a.code) ?? 0;
    if (a.type === 'INCOME') revenue.push({ code: a.code, name: a.name, cent: -drcr });
    else if (a.type === 'EXPENSE') expenses.push({ code: a.code, name: a.name, cent: drcr });
  }
  for (const [code, cent] of activity) {
    if (chartCodes.has(code) || cent === 0) continue;
    if (code.startsWith('4')) revenue.push({ code, name: names.get(code) ?? `Account ${code}`, cent: -cent });
    else if (code.startsWith('5')) expenses.push({ code, name: names.get(code) ?? `Account ${code}`, cent });
  }

  const totalRevenueCent = revenue.reduce((s, r) => s + r.cent, 0);
  const totalExpensesCent = expenses.reduce((s, e) => s + e.cent, 0);
  return { revenue, expenses, totalRevenueCent, totalExpensesCent };
}

export function deriveIncomeStatement(
  entries: JournalEntry[],
  collections: Collection[],
  period?: Period,
): IncomeStatementResult {
  const { revenue, expenses, totalRevenueCent, totalExpensesCent } = incomeStatementCent(entries, collections, period);
  return {
    revenue: revenue.map((r) => ({ code: r.code, name: r.name, amount: fromCentavos(r.cent) })),
    expenses: expenses.map((e) => ({ code: e.code, name: e.name, amount: fromCentavos(e.cent) })),
    totalRevenue: fromCentavos(totalRevenueCent),
    totalExpenses: fromCentavos(totalExpensesCent),
    netIncome: fromCentavos(totalRevenueCent - totalExpensesCent),
  };
}

// ── Balance Sheet ──
export interface BalanceSheetResult {
  assets: { current: StatementLine[]; fixed: StatementLine[] };
  liabilities: StatementLine[];
  equity: StatementLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
}

// As of period end. Equity = opening equity + cumulative derived net income
// (income/expense openings are excluded everywhere), so within the model
// assets = liabilities + equity holds whenever every posting balances.
export function deriveBalanceSheet(
  entries: JournalEntry[],
  collections: Collection[],
  period?: Period,
): BalanceSheetResult {
  const asOfPeriod = period?.to ? { to: period.to } : undefined;
  const asOf = postingsByAccount(entries, collections, asOfPeriod);
  const { totalRevenueCent, totalExpensesCent } = incomeStatementCent(entries, collections, asOfPeriod);
  const netIncomeCent = totalRevenueCent - totalExpensesCent;

  const currentAssets: StatementLine[] = [];
  const fixedAssets: StatementLine[] = [];
  const liabilities: StatementLine[] = [];
  const equity: StatementLine[] = [];
  let totalAssetsCent = 0;
  let totalLiabilitiesCent = 0;
  let totalEquityCent = 0;

  const balanceCentOf = (a: Account): number => {
    const drcr = asOf.get(a.code) ?? 0;
    const openingCent = toCentavos(a.balance);
    return a.normalBalance === 'debit' ? openingCent + drcr : openingCent - drcr;
  };

  for (const root of chartOfAccounts) {
    if (root.type === 'ASSET') {
      for (const group of root.children ?? []) {
        // Bucket by group: '1100' Current Assets vs '1200' Fixed Assets.
        const bucket = group.code === '1200' || group.name.toLowerCase().includes('fixed') ? fixedAssets : currentAssets;
        for (const leaf of group.children ?? [group]) {
          const cent = balanceCentOf(leaf);
          totalAssetsCent += cent;
          bucket.push({ code: leaf.code, name: leaf.name, amount: fromCentavos(cent) });
        }
      }
    } else if (root.type === 'LIABILITY') {
      for (const leaf of root.children ?? []) {
        const cent = balanceCentOf(leaf);
        totalLiabilitiesCent += cent;
        liabilities.push({ code: leaf.code, name: leaf.name, amount: fromCentavos(cent) });
      }
    } else if (root.type === 'EQUITY') {
      for (const leaf of root.children ?? []) {
        const cent = balanceCentOf(leaf);
        totalEquityCent += cent;
        equity.push({ code: leaf.code, name: leaf.name, amount: fromCentavos(cent) });
      }
    }
  }

  totalEquityCent += netIncomeCent;
  equity.push({ code: '', name: 'Net Surplus / (Deficit) — derived', amount: fromCentavos(netIncomeCent) });

  return {
    assets: { current: currentAssets, fixed: fixedAssets },
    liabilities,
    equity,
    totalAssets: fromCentavos(totalAssetsCent),
    totalLiabilities: fromCentavos(totalLiabilitiesCent),
    totalEquity: fromCentavos(totalEquityCent),
    balanced: totalAssetsCent === totalLiabilitiesCent + totalEquityCent,
  };
}

// ── Budget vs Actual ──
// Budget targets stay as stored (user-editable); actuals/variance/status are
// ALWAYS derived — the stored actualYTD is ignored by design.
export function deriveBudgetActuals<T extends BudgetItem>(
  entries: JournalEntry[],
  collections: Collection[],
  budgetItems: T[],
  period?: Period,
): T[] {
  const activity = postingsByAccount(entries, collections, period);
  return budgetItems.map((b) => {
    const drcr = activity.get(b.accountCode) ?? 0;
    const actualCent = b.category === 'Income' ? -drcr : drcr;
    const budgetCent = toCentavos(b.budgetYTD);
    // Sign convention matches the original fixture: income variance is
    // budget - actual (positive = shortfall vs target), expense variance is
    // actual - budget (negative = under budget).
    const varianceCent = b.category === 'Income' ? budgetCent - actualCent : actualCent - budgetCent;
    const status: BudgetItem['status'] = b.category === 'Income'
      ? (actualCent >= budgetCent ? 'On Track' : 'Under Budget')
      : (actualCent > budgetCent ? 'Over Budget' : 'On Track');
    return {
      ...b,
      actualYTD: fromCentavos(actualCent),
      variance: fromCentavos(varianceCent),
      variancePercent: budgetCent !== 0 ? (varianceCent / budgetCent) * 100 : 0,
      status,
    };
  });
}

// ── Collection Summary ──
export interface CollectionSummaryRow {
  date: string;
  mass6am: number;
  mass8am: number;
  mass10am: number;
  mass6pm: number;
  other: number;
  cashTotal: number;
  checkTotal: number;
  digitalTotal: number;
  total: number;
}

const MASS_BUCKET: Record<string, keyof Pick<CollectionSummaryRow, 'mass6am' | 'mass8am' | 'mass10am' | 'mass6pm'>> = {
  '6:00 AM': 'mass6am', '8:00 AM': 'mass8am', '10:00 AM': 'mass10am', '6:00 PM': 'mass6pm',
};

export function deriveCollectionSummary(collections: Collection[], period?: Period): CollectionSummaryRow[] {
  const byDate = new Map<string, Record<string, number>>();
  for (const c of collections) {
    if (c.status !== 'Posted' || !inPeriod(c.date, period)) continue;
    const acc = byDate.get(c.date) ?? { mass6am: 0, mass8am: 0, mass10am: 0, mass6pm: 0, other: 0, cashTotal: 0, checkTotal: 0, digitalTotal: 0 };
    const totalCent = toCentavos(c.cash) + toCentavos(c.checks) + toCentavos(c.digital);
    acc[MASS_BUCKET[c.massTime] ?? 'other'] += totalCent;
    acc.cashTotal += toCentavos(c.cash);
    acc.checkTotal += toCentavos(c.checks);
    acc.digitalTotal += toCentavos(c.digital);
    byDate.set(c.date, acc);
  }
  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, acc]) => ({
      date,
      mass6am: fromCentavos(acc.mass6am),
      mass8am: fromCentavos(acc.mass8am),
      mass10am: fromCentavos(acc.mass10am),
      mass6pm: fromCentavos(acc.mass6pm),
      other: fromCentavos(acc.other),
      cashTotal: fromCentavos(acc.cashTotal),
      checkTotal: fromCentavos(acc.checkTotal),
      digitalTotal: fromCentavos(acc.digitalTotal),
      total: fromCentavos(acc.cashTotal + acc.checkTotal + acc.digitalTotal),
    }));
}
