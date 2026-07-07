import { describe, it, expect } from "vitest"
import {
  toCentavos,
  fromCentavos,
  collectionsAsEntries,
  deriveAccountBalances,
  deriveTrialBalance,
  deriveIncomeStatement,
  deriveBalanceSheet,
  deriveBudgetActuals,
  deriveCollectionSummary,
} from "./ledger"
import { journalEntries, collectionsData, budgetData } from "./financeData"
import type { JournalEntry, Collection, BudgetItem } from "./financeData"

// ── helpers ──
let seq = 0
function mkEntry(
  date: string,
  lines: { code: string; name?: string; debit?: number; credit?: number }[],
  status: JournalEntry["status"] = "Posted",
): JournalEntry {
  const full = lines.map((l) => ({
    accountCode: l.code,
    accountName: l.name ?? `Account ${l.code}`,
    debit: l.debit ?? 0,
    credit: l.credit ?? 0,
  }))
  return {
    id: `T-${++seq}`,
    date,
    reference: "test",
    description: "test entry",
    lines: full,
    status,
    postedBy: "Tester",
    totalDr: full.reduce((s, l) => s + l.debit, 0),
    totalCr: full.reduce((s, l) => s + l.credit, 0),
  }
}

function mkCollection(date: string, massTime: string, cash: number, checks = 0, digital = 0): Collection {
  return {
    id: `C-${++seq}`, date, massTime, cash, checks, digital,
    total: cash + checks + digital, postedBy: "Tester", status: "Posted",
  }
}

describe("centavo helpers", () => {
  it("round-trips pesos exactly through integer centavos", () => {
    expect(toCentavos(0.1) + toCentavos(0.2)).toBe(30) // 0.1+0.2 !== 0.3 in floats
    expect(fromCentavos(30)).toBe(0.3)
    expect(toCentavos(1234.56)).toBe(123456)
    expect(toCentavos(19.99)).toBe(1999) // 19.99*100 = 1998.9999… without rounding
  })
})

describe("deriveTrialBalance", () => {
  it("ties (Dr = Cr) on the full seed data", () => {
    const tb = deriveTrialBalance(journalEntries, collectionsData)
    expect(tb.balanced).toBe(true)
    expect(tb.totalDebit).toBe(tb.totalCredit)
    expect(tb.totalDebit).toBeGreaterThan(0)
  })

  it("stays tied after posting new entries with centavo-hostile amounts", () => {
    // Three lines of 0.10 + 0.20 + 0.30 against a 0.60 credit: float summation
    // of these famously drifts; integer centavos must not.
    const entries = [
      ...journalEntries,
      mkEntry("2025-06-01", [
        { code: "5300", debit: 0.1 },
        { code: "5300", debit: 0.2 },
        { code: "5300", debit: 0.3 },
        { code: "1000", credit: 0.6 },
      ]),
    ]
    const tb = deriveTrialBalance(entries, collectionsData)
    expect(tb.balanced).toBe(true)
  })

  it("excludes Pending, Draft and Rejected entries", () => {
    const base = deriveTrialBalance(journalEntries, [])
    const withPending = deriveTrialBalance(
      [
        ...journalEntries,
        mkEntry("2025-06-01", [{ code: "5000", debit: 150000 }, { code: "1010", credit: 150000 }], "Pending"),
        mkEntry("2025-06-02", [{ code: "5000", debit: 999 }, { code: "1010", credit: 999 }], "Draft"),
        mkEntry("2025-06-03", [{ code: "5000", debit: 555 }, { code: "1010", credit: 555 }], "Rejected"),
      ],
      [],
    )
    expect(withPending.totalDebit).toBe(base.totalDebit)
    expect(withPending.totalCredit).toBe(base.totalCredit)
  })

  it("filters by period (income/expense are period accounts)", () => {
    const entries = [
      mkEntry("2025-01-10", [{ code: "1000", debit: 100 }, { code: "4100", credit: 100 }]),
      mkEntry("2025-03-10", [{ code: "1000", debit: 900 }, { code: "4100", credit: 900 }]),
    ]
    const tb = deriveTrialBalance(entries, [], { from: "2025-03-01", to: "2025-03-31" })
    const donations = tb.rows.find((r) => r.code === "4100")
    expect(donations?.credit).toBe(900) // Jan activity outside the period
    // Cash carries opening + everything up to period end (both entries)
    const cash = tb.rows.find((r) => r.code === "1000" && r.type === "Assets")
    expect(cash?.debit).toBe(125340 + 100 + 900)
    // Pre-period net income rolls into a derived retained-earnings equity row,
    // so the trial balance ties for EVERY period — not just All Time.
    const retained = tb.rows.find((r) => r.code === "3900")
    expect(retained?.type).toBe("Equity")
    expect(retained?.credit).toBe(100) // Jan net income prior to the period
    expect(tb.balanced).toBe(true)
    expect(tb.totalDebit).toBe(tb.totalCredit)
  })

  it("ties for a from-bounded period on the full seed data", () => {
    // Seed data is entirely 2025; picking 'this year 2026' used to show a red
    // Unbalanced banner exactly equal to all-time net income.
    const tb = deriveTrialBalance(journalEntries, collectionsData, { from: "2026-01-01", to: "2026-12-31" })
    expect(tb.balanced).toBe(true)
    const retained = tb.rows.find((r) => r.code === "3900")
    expect(retained?.credit).toBeGreaterThan(0)
  })

  it("carries off-chart balance-sheet codes through period end (asOf, not activity)", () => {
    // 1999/2999 are not in the chart of accounts; the pre-period posting must
    // still show on a from-bounded period — balance-sheet codes are asOf.
    const entries = [
      mkEntry("2025-01-10", [{ code: "1999", debit: 500 }, { code: "2999", credit: 500 }]),
      mkEntry("2025-03-10", [{ code: "1999", debit: 100 }, { code: "2999", credit: 100 }]),
    ]
    const tb = deriveTrialBalance(entries, [], { from: "2025-03-01", to: "2025-03-31" })
    expect(tb.rows.find((r) => r.code === "1999")?.debit).toBe(600)
    expect(tb.rows.find((r) => r.code === "1999")?.type).toBe("Assets")
    expect(tb.rows.find((r) => r.code === "2999")?.credit).toBe(600)
    expect(tb.balanced).toBe(true)
  })

  it("limits off-chart income/expense codes to period activity", () => {
    const entries = [
      mkEntry("2025-01-10", [{ code: "1000", debit: 500 }, { code: "4999", credit: 500 }]),
      mkEntry("2025-03-10", [{ code: "1000", debit: 100 }, { code: "4999", credit: 100 }]),
    ]
    const tb = deriveTrialBalance(entries, [], { from: "2025-03-01", to: "2025-03-31" })
    expect(tb.rows.find((r) => r.code === "4999")?.credit).toBe(100)
    expect(tb.balanced).toBe(true)
  })

  it("adds no retained-earnings row when the period has no lower bound", () => {
    const tb = deriveTrialBalance(journalEntries, collectionsData)
    expect(tb.rows.find((r) => r.code === "3900")).toBeUndefined()
    expect(tb.balanced).toBe(true)
  })
})

describe("deriveIncomeStatement", () => {
  it("computes revenue, expenses and net income from posted entries", () => {
    const entries = [
      mkEntry("2025-05-01", [{ code: "1000", debit: 1000 }, { code: "4100", credit: 1000 }]),
      mkEntry("2025-05-02", [{ code: "5100", debit: 400 }, { code: "1000", credit: 400 }]),
    ]
    const is = deriveIncomeStatement(entries, [])
    expect(is.totalRevenue).toBe(1000)
    expect(is.totalExpenses).toBe(400)
    expect(is.netIncome).toBe(600)
    expect(is.revenue.find((r) => r.code === "4100")?.amount).toBe(1000)
    expect(is.expenses.find((e) => e.code === "5100")?.amount).toBe(400)
  })

  it("sums centavo amounts without float drift", () => {
    const entries = Array.from({ length: 10 }, () =>
      mkEntry("2025-05-01", [{ code: "1000", debit: 0.1 }, { code: "4100", credit: 0.1 }]),
    )
    const is = deriveIncomeStatement(entries, [])
    expect(is.totalRevenue).toBe(1) // 10 × 0.1 would be 0.9999999999999999 in floats
  })

  it("excludes pending entries until posted", () => {
    const entries = [
      mkEntry("2025-05-01", [{ code: "1000", debit: 1000 }, { code: "4100", credit: 1000 }]),
      mkEntry("2025-05-02", [{ code: "1000", debit: 500000 }, { code: "4100", credit: 500000 }], "Pending"),
    ]
    expect(deriveIncomeStatement(entries, []).totalRevenue).toBe(1000)
    // approve it → it counts
    const approved = entries.map((e) => (e.status === "Pending" ? { ...e, status: "Posted" as const } : e))
    expect(deriveIncomeStatement(approved, []).totalRevenue).toBe(501000)
  })
})

describe("deriveBalanceSheet", () => {
  it("satisfies assets = liabilities + equity on seed data", () => {
    const bs = deriveBalanceSheet(journalEntries, collectionsData)
    expect(bs.balanced).toBe(true)
    expect(bs.totalAssets).toBeCloseTo(bs.totalLiabilities + bs.totalEquity, 10)
  })

  it("keeps the equation after arbitrary balanced postings", () => {
    const entries = [
      ...journalEntries,
      mkEntry("2025-06-15", [{ code: "1010", debit: 77777.77 }, { code: "4300", credit: 77777.77 }]),
      mkEntry("2025-06-16", [{ code: "5400", debit: 1234.56 }, { code: "1000", credit: 1234.56 }]),
      mkEntry("2025-06-17", [{ code: "2000", debit: 5000 }, { code: "1010", credit: 5000 }]),
    ]
    const bs = deriveBalanceSheet(entries, collectionsData)
    expect(bs.balanced).toBe(true)
  })

  it("moves cash when an expense is posted", () => {
    const before = deriveBalanceSheet(journalEntries, [])
    const after = deriveBalanceSheet(
      [...journalEntries, mkEntry("2025-06-01", [{ code: "5100", debit: 5000 }, { code: "1000", credit: 5000 }])],
      [],
    )
    const cash = (bs: typeof before) => bs.assets.current.find((a) => a.code === "1000")!.amount
    expect(cash(after)).toBe(cash(before) - 5000)
  })
})

describe("deriveAccountBalances", () => {
  it("adds postings to the documented opening balance", () => {
    const entries = [mkEntry("2025-06-01", [{ code: "1000", debit: 10000 }, { code: "4100", credit: 10000 }])]
    const derived = deriveAccountBalances(entries, [])
    const assets = derived.find((a) => a.type === "ASSET")!
    const cash = assets.children![0].children!.find((c) => c.code === "1000")!
    expect(cash.balance).toBe(125340 + 10000)
    const income = derived.find((a) => a.type === "INCOME")!
    expect(income.children!.find((c) => c.code === "4100")!.balance).toBe(345200 + 10000)
  })

  it("rolls parents up from children", () => {
    const entries = [mkEntry("2025-06-01", [{ code: "1000", debit: 10000 }, { code: "4100", credit: 10000 }])]
    const derived = deriveAccountBalances(entries, [])
    const assets = derived.find((a) => a.type === "ASSET")!
    const childSum = assets.children!.reduce((s, g) => s + g.balance, 0)
    expect(assets.balance).toBeCloseTo(childSum, 10)
    expect(assets.balance).toBe(2456789 + 10000)
  })
})

describe("deriveBudgetActuals", () => {
  it("aggregates actuals per account code and derives variance/status", () => {
    const items: BudgetItem[] = [
      { accountCode: "4100", accountName: "Donations", category: "Income", budgetYTD: 1000, actualYTD: 999999, variance: 0, variancePercent: 0, status: "On Track" },
      { accountCode: "5100", accountName: "Utilities", category: "Expense", budgetYTD: 500, actualYTD: 999999, variance: 0, variancePercent: 0, status: "On Track" },
    ]
    const entries = [
      mkEntry("2025-02-01", [{ code: "1000", debit: 300 }, { code: "4100", credit: 300 }]),
      mkEntry("2025-02-02", [{ code: "1000", debit: 400 }, { code: "4100", credit: 400 }]),
      mkEntry("2025-02-03", [{ code: "5100", debit: 600 }, { code: "1000", credit: 600 }]),
    ]
    const [income, expense] = deriveBudgetActuals(entries, [], items)
    // stored actualYTD (999999) must be ignored — actuals come from the ledger
    expect(income.actualYTD).toBe(700)
    expect(income.variance).toBe(300) // budget - actual for income
    expect(income.status).toBe("Under Budget")
    expect(expense.actualYTD).toBe(600)
    expect(expense.variance).toBe(100) // actual - budget for expense
    expect(expense.status).toBe("Over Budget")
  })

  it("matches the seed sign conventions on real budget data", () => {
    const derived = deriveBudgetActuals(journalEntries, collectionsData, budgetData)
    for (const item of derived) {
      if (item.category === "Income") expect(item.variance).toBeCloseTo(item.budgetYTD - item.actualYTD, 6)
      else expect(item.variance).toBeCloseTo(item.actualYTD - item.budgetYTD, 6)
    }
  })
})

describe("collectionsAsEntries (no double counting)", () => {
  it("skips collections the journal already books", () => {
    const implicit = collectionsAsEntries(journalEntries, collectionsData)
    // 2025-01-05/12 are journalized per Mass (exact-amount match) and
    // 2025-01-19 / 2025-02-02 via an 'All Masses' aggregate entry — none may
    // produce an implicit posting.
    for (const date of ["2025-01-05", "2025-01-12", "2025-01-19", "2025-02-02"]) {
      expect(implicit.some((e) => e.date === date)).toBe(false)
    }
    // 2025-02-09 / 2025-03-02 exist only as collections → implicit postings appear.
    expect(implicit.some((e) => e.date === "2025-02-09")).toBe(true)
    expect(implicit.some((e) => e.date === "2025-03-02")).toBe(true)
  })

  it("does NOT swallow a collection when an unrelated 4000-credit entry posts on the same date", () => {
    // A special second collection (e.g. typhoon relief) journalized directly
    // must not make the day's regular posted collection vanish from income.
    const col = mkCollection("2025-07-06", "8:00 AM", 50000)
    const special = mkEntry("2025-07-06", [
      { code: "1000", debit: 5000 },
      { code: "4000", name: "Sunday Collections", credit: 5000 },
    ])
    const is = deriveIncomeStatement([special], [col])
    expect(is.totalRevenue).toBe(55000) // both count — previously only 5000 survived
  })

  it("dedupes by exact amount, consuming each journal amount once", () => {
    const cols = [
      mkCollection("2025-07-06", "8:00 AM", 50000),
      mkCollection("2025-07-06", "10:00 AM", 50000),
    ]
    // ONE journal entry mirrors ONE of the two identical collections.
    const mirror = mkEntry("2025-07-06", [
      { code: "1000", debit: 50000 },
      { code: "4000", name: "Sunday Collections", credit: 50000 },
    ])
    const implicit = collectionsAsEntries([mirror], cols)
    expect(implicit).toHaveLength(1) // second identical collection still books
    const is = deriveIncomeStatement([mirror], cols)
    expect(is.totalRevenue).toBe(100000)
  })

  it("dedupes via an explicit collection reference even when totals differ", () => {
    const cols = [
      mkCollection("2025-07-06", "8:00 AM", 40000),
      mkCollection("2025-07-06", "6:00 PM", 2000),
    ]
    const aggregate: JournalEntry = {
      ...mkEntry("2025-07-06", [
        { code: "1000", debit: 42500 },
        { code: "4000", name: "Sunday Collections", credit: 42500 },
      ]),
      reference: "Sunday Collection — All Masses",
    }
    expect(collectionsAsEntries([aggregate], cols)).toHaveLength(0)
  })

  it("books an un-journalized posted collection as Dr Cash / Cr Sunday Collections", () => {
    const col = mkCollection("2025-07-06", "8:00 AM", 100.1, 0.2, 0.3)
    const [e] = collectionsAsEntries([], [col])
    expect(e.lines[0]).toMatchObject({ accountCode: "1000", debit: 100.6 })
    expect(e.lines[1]).toMatchObject({ accountCode: "4000", credit: 100.6 })
    // and it flows into revenue
    const is = deriveIncomeStatement([], [col])
    expect(is.totalRevenue).toBe(100.6)
  })
})

describe("deriveCollectionSummary", () => {
  it("groups by date, buckets by mass time, and ties methods to the total", () => {
    const cols = [
      mkCollection("2025-07-06", "6:00 AM", 100, 10, 1),
      mkCollection("2025-07-06", "8:00 AM", 200, 20, 2),
      mkCollection("2025-07-13", "10:00 AM", 300, 30, 3),
    ]
    const rows = deriveCollectionSummary(cols)
    expect(rows).toHaveLength(2)
    expect(rows[0].date).toBe("2025-07-06")
    expect(rows[0].mass6am).toBe(111)
    expect(rows[0].mass8am).toBe(222)
    expect(rows[0].total).toBe(333)
    expect(rows[0].cashTotal + rows[0].checkTotal + rows[0].digitalTotal).toBe(rows[0].total)
    expect(rows[1].mass10am).toBe(333)
  })

  it("applies the period filter and skips drafts", () => {
    const cols = [
      mkCollection("2025-07-06", "6:00 AM", 100),
      { ...mkCollection("2025-07-13", "6:00 AM", 999), status: "Draft" as const },
      mkCollection("2025-08-03", "6:00 AM", 500),
    ]
    const rows = deriveCollectionSummary(cols, { from: "2025-07-01", to: "2025-07-31" })
    expect(rows).toHaveLength(1)
    expect(rows[0].total).toBe(100)
  })
})
