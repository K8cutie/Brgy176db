// ═══════════════════════════════════════════════════════════
// Donors, Pledges & Official Receipts
// The parish donor book: who gives, what they pledged, every
// contribution received — and the Official Receipt (OR) series
// that numbers each one. Recording a contribution issues the next
// OR number and posts a balanced Posted journal entry to the SAME
// ledger stores FinancePage derives every report from
// (Dr 1000 Cash on Hand / Cr 4100 Donations), mirroring the
// massIntentions stipend pattern.
//
// All reads/writes go through the parish-namespaced storage seam so
// the module works identically on desktop (SQLite), browser
// (localStorage) and cloud. Money arithmetic is done in INTEGER
// CENTAVOS (ledger.ts convention); storage stays peso numbers.
// ═══════════════════════════════════════════════════════════

import { getJSON, setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';
import { journalEntries as JOURNAL_SEED, formatPeso, getAmountApprovalLevel } from './financeData';
import type { JournalEntry } from './financeData';
import { toCentavos } from './ledger';
import { todayISO } from './massIntentions';
import { getCurrentUserName } from './session';
import type { AuditLogEntry } from './settingsData';

// ── Model ──
export interface Donor {
  id: string;
  name: string;
  contact?: string;
  address?: string;
  /** Optional link into the parishioner directory (ParishionerLookup.id). */
  parishionerId?: string;
  notes?: string;
}

export interface Campaign {
  id: string;
  name: string;
  /** Target in pesos. */
  goal?: number;
  startDate?: string;
  endDate?: string;
  active: boolean;
}

export type PledgeFrequency = 'one-time' | 'weekly' | 'monthly';

export interface Pledge {
  id: string;
  donorId: string;
  campaignId?: string;
  /** Total pledged, in pesos. */
  amount: number;
  frequency?: PledgeFrequency;
  notes?: string;
}

export type ContributionMethod = 'cash' | 'check' | 'digital';

export interface Contribution {
  id: string;
  donorId: string;
  campaignId?: string;
  /** YYYY-MM-DD. */
  date: string;
  /** Pesos. */
  amount: number;
  method: ContributionMethod;
  /** Official Receipt number issued when the contribution was recorded. */
  orNumber?: string;
  /** Set once the contribution has been posted to the ledger (idempotency flag). */
  journalEntryId?: string;
}

// ── Small helpers ──
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const cleanStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

const isISODate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Positive finite pesos rounded to centavos, else undefined. */
function cleanAmount(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0
    ? Math.round(v * 100) / 100
    : undefined;
}

/**
 * Audit trail — SAME 'audit_log' key + entry shape FinancePage.appendFinanceAudit
 * writes, so donor actions show up in the Settings audit view alongside
 * finance ones (identical to massIntentions' appendIntentionAudit).
 */
function appendDonorAudit(action: string, recordId: string, details: string, table = 'Donors'): void {
  const log = getJSON<AuditLogEntry[]>('audit_log', []);
  const entry: AuditLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    user: getCurrentUserName(),
    action,
    table,
    recordId,
    details,
    ipAddress: 'local',
  };
  setJSON('audit_log', [entry, ...log]);
}

// ── Store CRUD (donors / campaigns / pledges / contributions) ──
function readList<T extends { id?: unknown }>(key: string): T[] {
  const list = getJSON<T[]>(key, []);
  return Array.isArray(list) ? list.filter((x) => x && typeof x.id === 'string') : [];
}

export function getDonors(): Donor[] { return readList<Donor>(KEYS.donors); }
export function saveDonors(list: Donor[]): boolean { return setJSON(KEYS.donors, list); }

export function getCampaigns(): Campaign[] { return readList<Campaign>(KEYS.donationCampaigns); }
export function saveCampaigns(list: Campaign[]): boolean { return setJSON(KEYS.donationCampaigns, list); }

export function getPledges(): Pledge[] { return readList<Pledge>(KEYS.pledges); }
export function savePledges(list: Pledge[]): boolean { return setJSON(KEYS.pledges, list); }

export function getContributions(): Contribution[] { return readList<Contribution>(KEYS.contributions); }
export function saveContributions(list: Contribution[]): boolean { return setJSON(KEYS.contributions, list); }

export function addDonor(input: Omit<Donor, 'id'>): Donor | null {
  const name = cleanStr(input?.name);
  if (!name) return null;
  const donor: Donor = {
    id: genId('dnr'),
    name,
    contact: cleanStr(input.contact),
    address: cleanStr(input.address),
    parishionerId: cleanStr(input.parishionerId),
    notes: cleanStr(input.notes),
  };
  saveDonors([donor, ...getDonors()]);
  appendDonorAudit('Created', donor.id, `Donor "${donor.name}" added`);
  return donor;
}

export function updateDonor(id: string, patch: Partial<Donor>): Donor | null {
  const list = getDonors();
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const updated: Donor = { ...list[idx], ...patch, id: list[idx].id };
  const next = [...list];
  next[idx] = updated;
  saveDonors(next);
  return updated;
}

export function addCampaign(input: Omit<Campaign, 'id' | 'active'> & { active?: boolean }): Campaign | null {
  const name = cleanStr(input?.name);
  if (!name) return null;
  const campaign: Campaign = {
    id: genId('cmp'),
    name,
    goal: cleanAmount(input.goal),
    startDate: isISODate(input.startDate) ? input.startDate : undefined,
    endDate: isISODate(input.endDate) ? input.endDate : undefined,
    active: input.active !== false,
  };
  saveCampaigns([campaign, ...getCampaigns()]);
  appendDonorAudit('Created', campaign.id, `Campaign "${campaign.name}" added${campaign.goal ? ` (goal ${formatPeso(campaign.goal)})` : ''}`);
  return campaign;
}

export function addPledge(input: Omit<Pledge, 'id'>): Pledge | null {
  const amount = cleanAmount(input?.amount);
  const donor = getDonors().find((d) => d.id === input?.donorId);
  if (!amount || !donor) return null;
  const pledge: Pledge = {
    id: genId('plg'),
    donorId: donor.id,
    campaignId: cleanStr(input.campaignId),
    amount,
    frequency: input.frequency === 'weekly' || input.frequency === 'monthly' ? input.frequency : 'one-time',
    notes: cleanStr(input.notes),
  };
  savePledges([pledge, ...getPledges()]);
  appendDonorAudit('Created', pledge.id, `Pledge ${formatPeso(amount)} (${pledge.frequency}) by ${donor.name}`);
  return pledge;
}

// ── OFFICIAL RECEIPT numbering ──
// Per-parish sequential series stored via the seam. One series per year;
// a year rollover STARTS a new series and PRESERVES the old one, so within
// normal operation a number, once issued, is not reused — even if a late entry
// is receipted into a prior year. Single-writer desktop model: read-modify-write
// through the synchronous seam is atomic enough (no concurrent writers per parish).
//
// LIMITATION (client-side): the counter lives in local storage, so RESTORING AN
// OLDER BACKUP rewinds lastNumber and the next issue can re-emit a number that
// was already printed. This cannot be prevented purely client-side. Operator
// guidance after any restore: reconcile against the printed OR log and, if the
// series regressed, bump lastNumber past the highest number already issued
// before recording new contributions.
export interface OrSeries {
  prefix: string;
  year: number;
  lastNumber: number;
}

export const OR_PREFIX = 'OR';

export function getOrSeriesList(): OrSeries[] {
  const list = getJSON<OrSeries[]>(KEYS.orSeries, []);
  return Array.isArray(list)
    ? list.filter((s) => s && typeof s.year === 'number' && typeof s.lastNumber === 'number')
    : [];
}

export function formatOrNumber(series: Pick<OrSeries, 'prefix' | 'year' | 'lastNumber'>): string {
  return `${series.prefix}-${series.year}-${String(series.lastNumber).padStart(6, '0')}`;
}

/** Issue the next OR number for the given date's year (default: today). */
export function issueOrNumber(now: Date = new Date()): string {
  const year = now.getFullYear();
  const list = getOrSeriesList();
  const idx = list.findIndex((s) => s.prefix === OR_PREFIX && s.year === year);
  let series: OrSeries;
  if (idx === -1) {
    series = { prefix: OR_PREFIX, year, lastNumber: 1 };
    list.push(series);
  } else {
    series = { ...list[idx], lastNumber: list[idx].lastNumber + 1 };
    list[idx] = series;
  }
  setJSON(KEYS.orSeries, list);
  return formatOrNumber(series);
}

// ── Contribution → OR + Finance ──
export interface RecordContributionInput {
  donorId: string;
  campaignId?: string;
  /** YYYY-MM-DD; defaults to today. */
  date?: string;
  /** Pesos. */
  amount: number;
  method: ContributionMethod;
  postedBy?: string;
}

/**
 * FinancePage holds the journal in lifted usePersistedState which
 * WRITE-THROUGHS the same storage key on every state change — a direct seam
 * write from here would be silently clobbered by the next state write. When
 * mounted inside FinancePage, pass the live journal + a setEntries-backed
 * appender so the page state stays the single journal writer; every other
 * caller (tests, portal) omits deps and the seam is written directly.
 */
export interface JournalDeps {
  journal: JournalEntry[];
  appendJournalEntry: (entry: JournalEntry) => void;
}

export type PostContributionResult =
  | { status: 'posted'; entry: JournalEntry; contribution: Contribution }
  | { status: 'already_posted' | 'not_found' };

/**
 * Post a contribution's journal entry (Dr 1000 Cash on Hand / Cr 4100
 * Donations, OR number in the reference). Idempotent: the journalEntryId flag
 * plus a reference scan of the journal guarantee at most one entry per
 * contribution even across stale UI state.
 */
export function ensureContributionPosted(
  contributionId: string,
  postedBy?: string,
  deps?: JournalDeps,
): PostContributionResult {
  const target = getContributions().find((c) => c.id === contributionId);
  if (!target) return { status: 'not_found' };
  const amount = cleanAmount(target.amount);
  if (!amount) return { status: 'not_found' };

  // Seed matches FinancePage's usePersistedState default, so posting before
  // Finance has ever persisted doesn't replace the book with one row.
  const journal = deps ? deps.journal : getJSON<JournalEntry[]>(KEYS.journalEntries, JOURNAL_SEED);
  const reference = target.orNumber ?? `CTB-${target.id}`;
  if (target.journalEntryId || journal.some((e) => e && e.reference === reference)) {
    return { status: 'already_posted' };
  }

  const donor = getDonors().find((d) => d.id === target.donorId);
  const campaign = target.campaignId ? getCampaigns().find((c) => c.id === target.campaignId) : undefined;
  const entry: JournalEntry = {
    id: `JV-OR-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    date: target.date,
    reference,
    description: `Donation — ${donor?.name ?? 'donor'}${campaign ? ` (${campaign.name})` : ''} [${target.method}]`,
    lines: [
      { accountCode: '1000', accountName: 'Cash on Hand', debit: amount, credit: 0 },
      { accountCode: '4100', accountName: 'Donations', debit: 0, credit: amount },
    ],
    status: 'Posted',
    postedBy: postedBy || getCurrentUserName(),
    totalDr: amount,
    totalCr: amount,
  };
  if (deps) deps.appendJournalEntry(entry);
  else setJSON(KEYS.journalEntries, [entry, ...journal]);

  const contribution =
    updateContribution(target.id, { journalEntryId: entry.id })
    ?? { ...target, journalEntryId: entry.id };
  appendDonorAudit('Created', entry.id,
    `Official Receipt ${reference} — donation ${formatPeso(amount)} from ${donor?.name ?? 'donor'} posted to ledger`, 'Finance');
  // A receipt is cash already in hand, so it posts immediately rather than
  // waiting on approval (approval routing is for disbursements — the canonical
  // "extraordinary administration" control). But a large receipt is flagged in
  // the audit log for the finance council, using the same ≥₱100k threshold that
  // routes a manual journal entry to Council Review.
  if (getAmountApprovalLevel(amount).label !== 'Direct Post') {
    appendDonorAudit('Flagged', entry.id,
      `Large receipt for council review — ${formatPeso(amount)} donation (OR ${reference}) recorded and posted; review recommended`, 'Finance');
  }
  return { status: 'posted', entry, contribution };
}

function updateContribution(id: string, patch: Partial<Contribution>): Contribution | null {
  const list = getContributions();
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const updated: Contribution = { ...list[idx], ...patch, id: list[idx].id };
  const next = [...list];
  next[idx] = updated;
  saveContributions(next);
  return updated;
}

export type RecordContributionResult =
  | { status: 'recorded'; contribution: Contribution; entry: JournalEntry }
  | { status: 'donor_not_found' | 'invalid_amount' };

/**
 * The single write path for receiving a donation: issues the next OR number,
 * appends the contribution, and posts exactly one balanced journal entry.
 */
export function recordContribution(
  input: RecordContributionInput,
  deps?: JournalDeps,
): RecordContributionResult {
  const donor = getDonors().find((d) => d.id === input?.donorId);
  if (!donor) return { status: 'donor_not_found' };
  const amount = cleanAmount(input.amount);
  if (!amount) return { status: 'invalid_amount' };

  const date = isISODate(input.date) ? input.date : todayISO();
  const orNumber = issueOrNumber(new Date(`${date}T00:00:00`));
  const contribution: Contribution = {
    id: genId('ctb'),
    donorId: donor.id,
    campaignId: cleanStr(input.campaignId),
    date,
    amount,
    method: input.method === 'check' || input.method === 'digital' ? input.method : 'cash',
    orNumber,
  };
  saveContributions([contribution, ...getContributions()]);
  appendDonorAudit('Created', contribution.id,
    `Contribution ${formatPeso(amount)} (${contribution.method}) from ${donor.name} — ${orNumber}`);

  const posted = ensureContributionPosted(contribution.id, input.postedBy, deps);
  // A freshly issued OR number cannot already exist in the journal, so this is
  // always 'posted'; the guard keeps the type honest.
  const entry = posted.status === 'posted' ? posted.entry : undefined;
  const final = posted.status === 'posted' ? posted.contribution : contribution;
  if (!entry) return { status: 'invalid_amount' };
  return { status: 'recorded', contribution: final, entry };
}

// ── Pledge-vs-given progress (integer centavos) ──
export interface PledgeProgress {
  pledgedCent: number;
  givenCent: number;
  /** null when the donor has no pledges (nothing to progress against). */
  percent: number | null;
}

export function donorPledgeProgress(
  donorId: string,
  data?: { pledges?: Pledge[]; contributions?: Contribution[] },
): PledgeProgress {
  const pledges = data?.pledges ?? getPledges();
  const contributions = data?.contributions ?? getContributions();
  const pledgedCent = pledges
    .filter((p) => p.donorId === donorId)
    .reduce((s, p) => s + toCentavos(p.amount), 0);
  const givenCent = contributions
    .filter((c) => c.donorId === donorId)
    .reduce((s, c) => s + toCentavos(c.amount), 0);
  return {
    pledgedCent,
    givenCent,
    percent: pledgedCent > 0 ? (givenCent / pledgedCent) * 100 : null,
  };
}

// ── Campaign summary (raised vs goal) ──
export interface CampaignSummary {
  campaign: Campaign;
  raisedCent: number;
  goalCent: number | null;
  percent: number | null;
}

export function summarizeCampaigns(
  data?: { campaigns?: Campaign[]; contributions?: Contribution[] },
): CampaignSummary[] {
  const campaigns = data?.campaigns ?? getCampaigns();
  const contributions = data?.contributions ?? getContributions();
  return campaigns.map((campaign) => {
    const raisedCent = contributions
      .filter((c) => c.campaignId === campaign.id)
      .reduce((s, c) => s + toCentavos(c.amount), 0);
    const goal = cleanAmount(campaign.goal);
    const goalCent = goal ? toCentavos(goal) : null;
    return {
      campaign,
      raisedCent,
      goalCent,
      percent: goalCent ? (raisedCent / goalCent) * 100 : null,
    };
  });
}

// ── Donor statement (per donor, date range) ──
export interface DonorStatement {
  donor: Donor;
  from?: string;
  to?: string;
  rows: Contribution[];
  totalCent: number;
}

export function buildDonorStatement(
  donorId: string,
  period?: { from?: string; to?: string },
): DonorStatement | null {
  const donor = getDonors().find((d) => d.id === donorId);
  if (!donor) return null;
  const rows = getContributions()
    .filter((c) => c.donorId === donorId)
    .filter((c) => (!period?.from || c.date >= period.from) && (!period?.to || c.date <= period.to))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    donor,
    from: period?.from,
    to: period?.to,
    rows,
    totalCent: rows.reduce((s, c) => s + toCentavos(c.amount), 0),
  };
}

// ═══════════════════════════════════════════════════════════
// Fee waivers — appends to the SAME tamper-evident hash chain
// RegistryPage's fee-override audit writes (key KEYS.feeOverrideAudit,
// identical entry shape + hash algorithm — see RegistryPage.tsx:254-313).
// Both surfaces read/verify ONE chain; entries appended here verify under
// RegistryPage.verifyFeeOverrideAudit and vice versa. Duplicated (not
// imported) only because the chain helpers live module-private inside the
// RegistryPage component file, which W1 does not own — if that mechanism is
// ever extracted to a lib, THIS is the second consumer to point at it.
// ═══════════════════════════════════════════════════════════
export interface FeeOverrideChainEntry {
  id: string;
  timestamp: string;
  sacrament: string;
  registryId: string;
  personName: string;
  overrideType: 'collected' | 'waived' | 'bill_later';
  amount: number;
  reason: string;
  recordedBy: string;
  prevHash: string;
  hash: string;
  /** Waiver-UI extras (absent on RegistryPage-written entries). */
  originalFee?: number;
  approvedBy?: string;
}

// Lightweight non-cryptographic hash — MUST stay byte-identical to
// RegistryPage's auditHash or the shared chain stops verifying.
function auditHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function getFeeOverrideChain(): FeeOverrideChainEntry[] {
  const list = getJSON<FeeOverrideChainEntry[]>(KEYS.feeOverrideAudit, []);
  return Array.isArray(list) ? list : [];
}

/**
 * Verify the audit chain. Returns the index of the first tampered/removed
 * entry, or -1 if the trail is intact (same algorithm as
 * RegistryPage.verifyFeeOverrideAudit).
 */
export function verifyFeeOverrideChain(
  entries: FeeOverrideChainEntry[] = getFeeOverrideChain(),
): { intact: boolean; brokenAt: number } {
  let prevHash = 'genesis';
  for (let i = 0; i < entries.length; i++) {
    const { hash, ...rest } = entries[i];
    if (rest.prevHash !== prevHash) return { intact: false, brokenAt: i };
    const expected = auditHash(prevHash + JSON.stringify(rest));
    if (expected !== hash) return { intact: false, brokenAt: i };
    prevHash = hash;
  }
  return { intact: true, brokenAt: -1 };
}

export interface ServerAuditVerdict {
  /** true only when the server RPC actually ran and returned a result to judge. */
  checked: boolean;
  /** true when every row the server holds validates against its HMAC + linkage. */
  allOk: boolean;
  /** client_ids the server flagged as tampered / back-dated / injected (ok = false). */
  failedClientIds: string[];
}

/**
 * Authoritative, server-side verification of the waiver chain (cloud mode only).
 * The in-app {@link verifyFeeOverrideChain} recomputes an UNKEYED djb2 that the
 * client both writes and verifies — so anyone who can write the store can forge a
 * self-consistent chain and the local check still says "intact". This instead calls
 * the verify_audit RPC, which recomputes each row's KEYED HMAC (key never leaves the
 * DB) and walks genesis→tip linkage server-side. Returns null off cloud mode or on
 * any error, so callers fall back to the local advisory check.
 */
export async function serverVerifyFeeOverrideChain(): Promise<ServerAuditVerdict | null> {
  try {
    const { isCloud } = await import('./cloudStore');
    if (!isCloud()) return null;
    const { getSupabase } = await import('./supabaseClient');
    const supa = await getSupabase();
    // No argument: the RPC derives scope from the caller's own parish (auth_parish_id).
    const { data, error } = await (supa as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
    }).rpc('verify_audit', {});
    if (error || !Array.isArray(data)) return null;
    const rows = data as Array<{ client_id?: unknown; ok?: unknown }>;
    const failedClientIds = rows.filter((r) => r && r.ok === false).map((r) => String(r.client_id));
    return { checked: true, allOk: failedClientIds.length === 0, failedClientIds };
  } catch {
    return null;
  }
}

export interface FeeWaiverInput {
  /** Sacrament / service type the fee belongs to (e.g. "Baptism"). */
  sacrament: string;
  /** Whom the waiver is for (family/person), shown in the trail. */
  personName?: string;
  /** Full scheduled fee in pesos. */
  originalFee: number;
  /** Amount waived in pesos (≤ original fee). */
  waivedAmount: number;
  /** Justification — minimum 5 characters. */
  reason: string;
  /** Who authorized the waiver (priest/administrator). */
  approvedBy: string;
  recordedBy?: string;
}

export type RecordWaiverResult =
  | { ok: true; entry: FeeOverrideChainEntry }
  | { ok: false; error: string };

export function recordFeeWaiver(input: FeeWaiverInput): RecordWaiverResult {
  const sacrament = cleanStr(input?.sacrament);
  if (!sacrament) return { ok: false, error: 'Sacrament type is required' };
  const reason = cleanStr(input?.reason);
  if (!reason || reason.length < 5) return { ok: false, error: 'Reason must be at least 5 characters' };
  const approvedBy = cleanStr(input?.approvedBy);
  if (!approvedBy) return { ok: false, error: 'Approved by is required' };
  const originalFee = cleanAmount(input?.originalFee);
  if (!originalFee) return { ok: false, error: 'Original fee must be greater than zero' };
  const waivedAmount = cleanAmount(input?.waivedAmount);
  if (!waivedAmount) return { ok: false, error: 'Waived amount must be greater than zero' };
  if (waivedAmount > originalFee) return { ok: false, error: 'Waived amount cannot exceed the original fee' };

  const existing = getFeeOverrideChain();
  const prevHash = existing.length ? existing[existing.length - 1].hash : 'genesis';
  const base = {
    sacrament,
    registryId: genId('waiver'),
    personName: cleanStr(input.personName) ?? '—',
    overrideType: 'waived' as const,
    amount: waivedAmount,
    reason,
    originalFee,
    approvedBy,
    recordedBy: cleanStr(input.recordedBy) || getCurrentUserName(),
    id: `foa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    prevHash,
  };
  const hash = auditHash(prevHash + JSON.stringify(base));
  const entry: FeeOverrideChainEntry = { ...base, hash };
  setJSON(KEYS.feeOverrideAudit, [...existing, entry]);
  appendDonorAudit('Created', entry.id,
    `Fee waiver ${formatPeso(waivedAmount)} of ${formatPeso(originalFee)} (${sacrament}) approved by ${approvedBy} — ${reason}`, 'Finance');
  return { ok: true, entry };
}

// ── Self-approval flags (diocese cockpit semantics) ──
// The cockpit reviews waivers a priest approved for HIMSELF (approver =
// recorder) totaling ≥ ₱3,000 per approver — aggregated across entries so
// splitting one big waiver into small ones cannot evade the flag.
export const SELF_APPROVAL_FLAG_THRESHOLD = 3000;

export function isSelfApprovedWaiver(e: FeeOverrideChainEntry): boolean {
  return e.overrideType === 'waived'
    && !!e.approvedBy
    && e.approvedBy.trim().toLowerCase() === (e.recordedBy || '').trim().toLowerCase();
}

export interface SelfApprovalFlag {
  by: string;
  /** Total self-approved waived pesos. */
  total: number;
  count: number;
}

export function flagSelfApprovals(
  entries: FeeOverrideChainEntry[] = getFeeOverrideChain(),
  thresholdPesos: number = SELF_APPROVAL_FLAG_THRESHOLD,
): SelfApprovalFlag[] {
  const agg = new Map<string, { by: string; totalCent: number; count: number }>();
  for (const e of entries) {
    if (!isSelfApprovedWaiver(e)) continue;
    const key = e.approvedBy!.trim().toLowerCase();
    const cur = agg.get(key) ?? { by: e.approvedBy!.trim(), totalCent: 0, count: 0 };
    cur.totalCent += toCentavos(e.amount);
    cur.count += 1;
    agg.set(key, cur);
  }
  return [...agg.values()]
    .filter((a) => a.totalCent >= toCentavos(thresholdPesos))
    .map((a) => ({ by: a.by, total: a.totalCent / 100, count: a.count }))
    .sort((a, b) => b.total - a.total);
}
