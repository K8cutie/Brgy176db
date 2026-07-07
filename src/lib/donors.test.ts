import { describe, it, expect, beforeEach } from 'vitest';
import {
  addDonor,
  addCampaign,
  addPledge,
  getDonors,
  getContributions,
  getOrSeriesList,
  issueOrNumber,
  formatOrNumber,
  recordContribution,
  ensureContributionPosted,
  donorPledgeProgress,
  summarizeCampaigns,
  buildDonorStatement,
  recordFeeWaiver,
  getFeeOverrideChain,
  verifyFeeOverrideChain,
  isSelfApprovedWaiver,
  flagSelfApprovals,
} from './donors';
import type { Donor } from './donors';
import { getJSON, setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';
import { journalEntries as JOURNAL_SEED } from './financeData';
import type { JournalEntry } from './financeData';
import type { AuditLogEntry } from './settingsData';

beforeEach(() => {
  localStorage.clear();
});

function makeDonor(name = 'Aling Nena'): Donor {
  const donor = addDonor({ name });
  expect(donor).not.toBeNull();
  return donor!;
}

// ── OFFICIAL RECEIPT numbering ──
describe('OR numbering', () => {
  it('issues zero-padded sequential numbers within a year', () => {
    const d = new Date('2026-03-01T10:00:00');
    expect(issueOrNumber(d)).toBe('OR-2026-000001');
    expect(issueOrNumber(d)).toBe('OR-2026-000002');
    expect(issueOrNumber(d)).toBe('OR-2026-000003');
  });

  it('starts a NEW series on year rollover and preserves the old one', () => {
    issueOrNumber(new Date('2026-12-31T23:00:00'));
    issueOrNumber(new Date('2026-12-31T23:30:00'));
    expect(issueOrNumber(new Date('2027-01-01T08:00:00'))).toBe('OR-2027-000001');

    const series = getOrSeriesList();
    expect(series).toHaveLength(2);
    expect(series.find((s) => s.year === 2026)?.lastNumber).toBe(2);
    expect(series.find((s) => s.year === 2027)?.lastNumber).toBe(1);
  });

  it('never reuses a number — a late entry into the old year continues its series', () => {
    issueOrNumber(new Date('2026-06-01T00:00:00')); // OR-2026-000001
    issueOrNumber(new Date('2027-01-05T00:00:00')); // OR-2027-000001
    // Backdated receipt into 2026 must NOT restart at 000001.
    expect(issueOrNumber(new Date('2026-12-30T00:00:00'))).toBe('OR-2026-000002');
    expect(issueOrNumber(new Date('2027-01-06T00:00:00'))).toBe('OR-2027-000002');
  });

  it('formatOrNumber pads to six digits', () => {
    expect(formatOrNumber({ prefix: 'OR', year: 2026, lastNumber: 123 })).toBe('OR-2026-000123');
  });
});

// ── Contribution → OR + journal ──
describe('recordContribution', () => {
  it('issues an OR, saves the contribution, and posts ONE balanced Posted entry', () => {
    const donor = makeDonor();
    const res = recordContribution({ donorId: donor.id, amount: 1500, method: 'cash', date: '2026-07-08' });
    expect(res.status).toBe('recorded');
    if (res.status !== 'recorded') return;

    expect(res.contribution.orNumber).toBe('OR-2026-000001');
    expect(res.contribution.journalEntryId).toBe(res.entry.id);
    expect(getContributions()).toHaveLength(1);

    // Balanced Posted entry, Dr 1000 / Cr 4100, OR number in the reference.
    expect(res.entry.status).toBe('Posted');
    expect(res.entry.reference).toBe('OR-2026-000001');
    expect(res.entry.totalDr).toBe(1500);
    expect(res.entry.totalCr).toBe(1500);
    expect(res.entry.lines).toEqual([
      { accountCode: '1000', accountName: 'Cash on Hand', debit: 1500, credit: 0 },
      { accountCode: '4100', accountName: 'Donations', debit: 0, credit: 1500 },
    ]);

    const journal = getJSON<JournalEntry[]>(KEYS.journalEntries, JOURNAL_SEED);
    expect(journal.filter((e) => e.reference === 'OR-2026-000001')).toHaveLength(1);
    // Seed preserved — the donation is ADDED to the book, not replacing it.
    expect(journal.length).toBe(JOURNAL_SEED.length + 1);
  });

  it('is idempotent — re-posting the same contribution never creates a second entry', () => {
    const donor = makeDonor();
    const res = recordContribution({ donorId: donor.id, amount: 500, method: 'digital' });
    expect(res.status).toBe('recorded');
    if (res.status !== 'recorded') return;

    const again = ensureContributionPosted(res.contribution.id);
    expect(again.status).toBe('already_posted');

    // Even with the journalEntryId flag wiped (stale UI state), the
    // reference scan still blocks a duplicate.
    const stored = getContributions().map((c) =>
      c.id === res.contribution.id ? { ...c, journalEntryId: undefined } : c);
    setJSON(KEYS.contributions, stored);
    expect(ensureContributionPosted(res.contribution.id).status).toBe('already_posted');

    const journal = getJSON<JournalEntry[]>(KEYS.journalEntries, JOURNAL_SEED);
    expect(journal.filter((e) => e.reference === res.contribution.orNumber)).toHaveLength(1);
  });

  it('routes the entry through caller-provided journal deps instead of the seam', () => {
    const donor = makeDonor();
    const appended: JournalEntry[] = [];
    const res = recordContribution(
      { donorId: donor.id, amount: 250, method: 'check' },
      { journal: [], appendJournalEntry: (e) => appended.push(e) },
    );
    expect(res.status).toBe('recorded');
    expect(appended).toHaveLength(1);
    // Seam untouched — the caller (FinancePage state) owns the write.
    expect(getJSON<JournalEntry[] | null>(KEYS.journalEntries, null)).toBeNull();
  });

  it('rejects unknown donors and junk amounts', () => {
    expect(recordContribution({ donorId: 'nope', amount: 100, method: 'cash' }).status).toBe('donor_not_found');
    const donor = makeDonor();
    expect(recordContribution({ donorId: donor.id, amount: 0, method: 'cash' }).status).toBe('invalid_amount');
    expect(recordContribution({ donorId: donor.id, amount: -5, method: 'cash' }).status).toBe('invalid_amount');
    expect(recordContribution({ donorId: donor.id, amount: NaN, method: 'cash' }).status).toBe('invalid_amount');
    // No OR numbers burned on rejected inputs.
    expect(getOrSeriesList()).toHaveLength(0);
  });

  it('writes audit entries in the shared audit_log shape', () => {
    const donor = makeDonor();
    recordContribution({ donorId: donor.id, amount: 100, method: 'cash' });
    const log = getJSON<AuditLogEntry[]>('audit_log', []);
    // donor added + contribution recorded + journal posted
    expect(log.length).toBe(3);
    expect(log.every((l) => l.timestamp && l.user && l.ipAddress === 'local')).toBe(true);
    expect(log.some((l) => l.table === 'Finance' && l.details.includes('Official Receipt'))).toBe(true);
  });
});

// ── Pledge progress (centavo math) ──
describe('donorPledgeProgress', () => {
  it('sums pledges and contributions in integer centavos (no float drift)', () => {
    const donor = makeDonor();
    addPledge({ donorId: donor.id, amount: 0.1 });
    addPledge({ donorId: donor.id, amount: 0.2 });
    recordContribution({ donorId: donor.id, amount: 0.1, method: 'cash' });
    recordContribution({ donorId: donor.id, amount: 0.2, method: 'cash' });

    const p = donorPledgeProgress(donor.id);
    // 0.1 + 0.2 in floats is 0.30000000000000004 — centavos must be exact.
    expect(p.pledgedCent).toBe(30);
    expect(p.givenCent).toBe(30);
    expect(p.percent).toBe(100);
  });

  it('reports partial progress and null percent when nothing was pledged', () => {
    const donor = makeDonor();
    addPledge({ donorId: donor.id, amount: 1000 });
    recordContribution({ donorId: donor.id, amount: 250, method: 'cash' });
    const p = donorPledgeProgress(donor.id);
    expect(p.pledgedCent).toBe(100000);
    expect(p.givenCent).toBe(25000);
    expect(p.percent).toBe(25);

    const other = makeDonor('Mang Kanor');
    recordContribution({ donorId: other.id, amount: 50, method: 'cash' });
    const q = donorPledgeProgress(other.id);
    expect(q.percent).toBeNull();
    expect(q.givenCent).toBe(5000);
  });

  it('does not leak other donors or campaigns into a donor total', () => {
    const a = makeDonor('A');
    const b = makeDonor('B');
    addPledge({ donorId: a.id, amount: 100 });
    recordContribution({ donorId: b.id, amount: 999, method: 'cash' });
    expect(donorPledgeProgress(a.id).givenCent).toBe(0);
  });
});

// ── Campaign summary ──
describe('summarizeCampaigns', () => {
  it('tallies raised vs goal per campaign', () => {
    const donor = makeDonor();
    const campaign = addCampaign({ name: 'Roof Repair', goal: 1000 })!;
    addCampaign({ name: 'No Goal Drive' });
    recordContribution({ donorId: donor.id, amount: 400, method: 'cash', campaignId: campaign.id });
    recordContribution({ donorId: donor.id, amount: 100, method: 'cash' }); // general, no campaign

    const summaries = summarizeCampaigns();
    const roof = summaries.find((s) => s.campaign.id === campaign.id)!;
    expect(roof.raisedCent).toBe(40000);
    expect(roof.goalCent).toBe(100000);
    expect(roof.percent).toBe(40);

    const open = summaries.find((s) => s.campaign.name === 'No Goal Drive')!;
    expect(open.goalCent).toBeNull();
    expect(open.percent).toBeNull();
  });
});

// ── Donor statement ──
describe('buildDonorStatement', () => {
  it('filters by inclusive date range and totals in centavos', () => {
    const donor = makeDonor();
    recordContribution({ donorId: donor.id, amount: 100, method: 'cash', date: '2026-01-15' });
    recordContribution({ donorId: donor.id, amount: 200, method: 'check', date: '2026-02-15' });
    recordContribution({ donorId: donor.id, amount: 400, method: 'cash', date: '2026-03-15' });

    const stmt = buildDonorStatement(donor.id, { from: '2026-02-15', to: '2026-03-15' })!;
    expect(stmt.rows.map((r) => r.date)).toEqual(['2026-02-15', '2026-03-15']);
    expect(stmt.totalCent).toBe(60000);

    expect(buildDonorStatement('missing')).toBeNull();
  });
});

// ── Waiver hash chain ──
describe('fee waiver chain', () => {
  const waiver = (over: Partial<Parameters<typeof recordFeeWaiver>[0]> = {}) =>
    recordFeeWaiver({
      sacrament: 'Baptism',
      personName: 'Dela Cruz family',
      originalFee: 500,
      waivedAmount: 500,
      reason: 'Indigent family, endorsed by barangay',
      approvedBy: 'Fr. Antonio Reyes',
      ...over,
    });

  it('appends chained entries that verify intact', () => {
    const first = waiver();
    expect(first.ok).toBe(true);
    const second = waiver({ sacrament: 'Marriage', waivedAmount: 250 });
    expect(second.ok).toBe(true);

    const chain = getFeeOverrideChain();
    expect(chain).toHaveLength(2);
    expect(chain[0].prevHash).toBe('genesis');
    expect(chain[1].prevHash).toBe(chain[0].hash);
    expect(chain[0].overrideType).toBe('waived');
    expect(verifyFeeOverrideChain()).toEqual({ intact: true, brokenAt: -1 });
  });

  it('detects tampering (edited amount) at the right index', () => {
    waiver();
    waiver({ waivedAmount: 100 });
    waiver({ waivedAmount: 200 });
    const chain = getFeeOverrideChain();
    chain[1] = { ...chain[1], amount: 1 }; // silent edit outside the app
    setJSON(KEYS.feeOverrideAudit, chain);
    expect(verifyFeeOverrideChain()).toEqual({ intact: false, brokenAt: 1 });
  });

  it('detects a deleted entry (broken prevHash link)', () => {
    waiver();
    waiver();
    waiver();
    const chain = getFeeOverrideChain();
    setJSON(KEYS.feeOverrideAudit, [chain[0], chain[2]]);
    expect(verifyFeeOverrideChain().intact).toBe(false);
    expect(verifyFeeOverrideChain().brokenAt).toBe(1);
  });

  it('interops with RegistryPage-shaped entries already in the chain', () => {
    // Simulate an entry written by RegistryPage's logFeeOverride (no
    // originalFee/approvedBy extras) sitting at the head of the chain.
    const base = {
      sacrament: 'baptism',
      registryId: 'B-2025-001',
      personName: 'Juan Santos',
      overrideType: 'collected' as const,
      amount: 500,
      reason: 'paid in full',
      recordedBy: 'Maria Santos',
      id: 'foa-1751900000000',
      timestamp: '2026-07-01T00:00:00.000Z',
      prevHash: 'genesis',
    };
    // Same hash algorithm as both writers.
    let h = 0;
    const s = 'genesis' + JSON.stringify(base);
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    setJSON(KEYS.feeOverrideAudit, [{ ...base, hash: Math.abs(h).toString(36) }]);

    expect(verifyFeeOverrideChain().intact).toBe(true);
    const res = waiver();
    expect(res.ok).toBe(true);
    expect(getFeeOverrideChain()).toHaveLength(2);
    expect(verifyFeeOverrideChain()).toEqual({ intact: true, brokenAt: -1 });
  });

  it('validates inputs (reason ≥ 5 chars, amounts sane)', () => {
    expect(waiver({ reason: 'meh' })).toEqual({ ok: false, error: 'Reason must be at least 5 characters' });
    expect(waiver({ reason: '        ' }).ok).toBe(false);
    expect(waiver({ waivedAmount: 0 }).ok).toBe(false);
    expect(waiver({ waivedAmount: 600 }).ok).toBe(false); // exceeds original fee
    expect(waiver({ originalFee: 0 }).ok).toBe(false);
    expect(waiver({ approvedBy: '' }).ok).toBe(false);
    expect(getFeeOverrideChain()).toHaveLength(0); // nothing appended on rejects
  });

  it('flags self-approvals aggregating to ≥ ₱3,000 (split-evasion safe)', () => {
    // Fr. Reyes records AND approves his own waivers: 2,000 + 1,500 = 3,500.
    waiver({ approvedBy: 'Fr. Reyes', recordedBy: 'Fr. Reyes', originalFee: 2000, waivedAmount: 2000 });
    waiver({ approvedBy: 'fr. reyes', recordedBy: 'Fr. Reyes', originalFee: 1500, waivedAmount: 1500 });
    // Independently approved — never flagged regardless of size.
    waiver({ approvedBy: 'Bishop Cruz', recordedBy: 'Secretary Ana', originalFee: 9000, waivedAmount: 9000 });
    // Self-approved but under threshold.
    waiver({ approvedBy: 'Fr. Cruz', recordedBy: 'Fr. Cruz', originalFee: 500, waivedAmount: 500 });

    const chain = getFeeOverrideChain();
    expect(chain.filter(isSelfApprovedWaiver)).toHaveLength(3);

    const flags = flagSelfApprovals();
    expect(flags).toHaveLength(1);
    expect(flags[0].by.toLowerCase()).toBe('fr. reyes');
    expect(flags[0].total).toBe(3500);
    expect(flags[0].count).toBe(2);
  });
});
