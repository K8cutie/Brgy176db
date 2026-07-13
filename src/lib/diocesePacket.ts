// ═══════════════════════════════════════════════════════════
// Diocese Packet Generator
// Creates the minimal, privacy-safe data packet that a parish
// uploads to the diocese hub for quarterly meetings and
// bishop-level analytics.
// ═══════════════════════════════════════════════════════════

import { getParishIdentity, type ParishIdentity, type DioceseConnection, type SyncRecord } from './parishIdentity';
import { getModuleRegistry } from './moduleRegistry';
import { getAttendanceSummary } from './attendance';
import * as ns from './storageNamespaced';
import { KEYS } from './storageKeys';
import { recordStatus, type RecordLifecycleStatus } from './registryData';

// Soft-deleted records (shared contract: optional isDeleted flag) must not
// inflate diocese-facing counts.
function liveRecords(key: string): unknown[] {
  const list = JSON.parse(ns.getItem(key) || '[]') as Array<{ isDeleted?: boolean }>;
  return list.filter((r) => !r?.isDeleted);
}

export type SyncScope = 'financial_summary' | 'sacramental_counts' | 'collection_summary' | 'parish_status' | 'attendance_summary';

// ── The packet sent to diocese ──
export interface DiocesePacket {
  packetId: string;
  parishId: string;
  parishName: string;
  parishShortName: string;
  dioceseId: string;
  timestamp: string;
  period: string; // "2026-Q1" or "2026-05"
  scope: SyncScope[];
  version: string;
  financialSummary?: FinancialSummary;
  sacramentalCounts?: SacramentalCounts;
  collectionSummary?: CollectionSummary;
  parishStatus?: ParishStatus;
  attendanceSummary?: AttendanceSummaryPacket;
  // Digital integrity check (not cryptographic — just a basic hash)
  checksum: string;
}

interface FinancialSummary {
  currency: string;
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
  categories: Array<{
    code: string;
    name: string;
    revenue: number;
    expense: number;
    budget: number;
    variance: number;
    percentUsed: number;
  }>;
}

interface SacramentalCounts {
  baptisms: number;
  weddings: number;
  confirmations: number;
  burials: number;
  firstCommunions?: number;
  quinceaneras?: number;
}

interface CollectionSummary {
  totalSundayCollections: number;
  byMassTime: Record<string, number>;
  monthlyAverage: number;
  trendDirection: 'up' | 'down' | 'stable';
}

interface ParishStatus {
  priest: string;
  activeModules: string[];
  fiscalYearEnd: string;
  lastUpdated: string;
  sacramentalRegistryTotal: number;
  parishionerCount?: number;
}

// Privacy-safe Mass attendance rollup — counts only, never names.
interface AttendanceSummaryPacket {
  eventsCounted: number;
  totalHeadcount: number;
  averageHeadcount: number;
  byMonth: Record<string, { events: number; total: number }>;
}

// ── Generate packet ──
export function generateDiocesePacket(
  scope: SyncScope[],
  period?: string
): DiocesePacket {
  const identity = getParishIdentity();
  const conn = identity.dioceseConnection;
  const packetId = `pkt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;

  const packet: DiocesePacket = {
    packetId,
    parishId: identity.parishId,
    parishName: identity.name,
    parishShortName: identity.shortName,
    dioceseId: conn.dioceseId || 'unknown',
    timestamp: now.toISOString(),
    period: period || defaultPeriod,
    scope,
    version: '1.0',
    checksum: '',
  };

  if (scope.includes('financial_summary')) {
    packet.financialSummary = buildFinancialSummary(identity);
  }
  if (scope.includes('sacramental_counts')) {
    packet.sacramentalCounts = buildSacramentalCounts();
  }
  if (scope.includes('collection_summary')) {
    packet.collectionSummary = buildCollectionSummary();
  }
  if (scope.includes('parish_status')) {
    packet.parishStatus = buildParishStatus(identity);
  }
  if (scope.includes('attendance_summary')) {
    packet.attendanceSummary = getAttendanceSummary();
  }

  packet.checksum = generateChecksum(packet);
  return packet;
}

// ── Build financial summary from journal ──
function buildFinancialSummary(identity: ParishIdentity): FinancialSummary {
  const entries = JSON.parse(ns.getItem(KEYS.journalEntries) || '[]');
  const budgets = JSON.parse(ns.getItem(KEYS.budgetItems) || '[]');

  const categories: FinancialSummary['categories'] = [];
  const catTotals: Record<string, { revenue: number; expense: number; name: string; code: string }> = {};

  for (const entry of entries) {
    if (entry.status !== 'Posted') continue;
    for (const line of entry.lines) {
      const code = line.accountCode;
      const catCode = code.slice(0, 2) + '00';

      if (!catTotals[catCode]) {
        catTotals[catCode] = { revenue: 0, expense: 0, name: line.accountName, code: catCode };
      }
      if (line.debit > 0 && code.startsWith('5')) {
        catTotals[catCode].expense += line.debit;
      }
      if (line.credit > 0 && code.startsWith('4')) {
        catTotals[catCode].revenue += line.credit;
      }
    }
  }

  for (const [code, data] of Object.entries(catTotals)) {
    const budget = budgets.find((b: Record<string, unknown>) => (b.accountCode as string)?.startsWith(code.slice(0, 2)))?.budgetYTD || 0;
    const isRevenue = code.startsWith('4');
    const actual = isRevenue ? data.revenue : data.expense;
    categories.push({
      code,
      name: data.name,
      revenue: data.revenue,
      expense: data.expense,
      budget,
      variance: budget - actual,
      percentUsed: budget > 0 ? (actual / budget) * 100 : 0,
    });
  }

  const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);
  const totalExpense = categories.reduce((s, c) => s + c.expense, 0);

  return {
    currency: identity.currency,
    totalRevenue,
    totalExpense,
    netIncome: totalRevenue - totalExpense,
    categories,
  };
}

// ── Build sacramental counts ──
// These are CONFERRED-sacrament counts reported to the diocese, so only
// SOLEMNIZED records count — scheduled (not yet performed) and cancelled (didn't
// push through) records are excluded. recordStatus() treats legacy records (no
// lifecycleStatus) as solemnized, so historical counts are unchanged.
function solemnizedCount(key: string): number {
  return liveRecords(key).filter(
    (r) => recordStatus(r as { lifecycleStatus?: RecordLifecycleStatus }) === 'solemnized',
  ).length;
}

function buildSacramentalCounts(): SacramentalCounts {
  const baptisms = solemnizedCount(KEYS.baptismRecords);
  const weddings = solemnizedCount(KEYS.marriageRecords);
  const confirmations = solemnizedCount(KEYS.confirmationRecords);
  const burials = solemnizedCount(KEYS.deathRecords);

  return { baptisms, weddings, confirmations, burials };
}

// ── Build collection summary ──
function buildCollectionSummary(): CollectionSummary {
  const collections = JSON.parse(ns.getItem(KEYS.collections) || '[]');
  const sundayTotal = collections
    .filter((c: Record<string, unknown>) => c.type === 'Sunday Collection')
    .reduce((s: number, c: Record<string, unknown>) => s + ((c.amount as number) || 0), 0);

  const byMassTime: Record<string, number> = {};
  for (const c of collections) {
    if (c.type === 'Sunday Collection' && c.massTime) {
      byMassTime[c.massTime] = (byMassTime[c.massTime] || 0) + (c.amount || 0);
    }
  }

  return {
    totalSundayCollections: sundayTotal,
    byMassTime,
    monthlyAverage: 0,
    trendDirection: 'stable',
  };
}

// ── Build parish status ──
function buildParishStatus(identity: ParishIdentity): ParishStatus {
  const registryTotal = [
    ...liveRecords(KEYS.baptismRecords),
    ...liveRecords(KEYS.marriageRecords),
    ...liveRecords(KEYS.confirmationRecords),
    ...liveRecords(KEYS.deathRecords),
  ].length;

  return {
    priest: identity.priest,
    // Single source of truth: the toggleable module registry (Settings →
    // Modules), NOT parishIdentity's legacy hardcoded module list — that copy
    // never reflected user toggles and was missing newer modules entirely.
    activeModules: getModuleRegistry().filter(m => m.enabled).map(m => m.id),
    fiscalYearEnd: identity.fiscalYearEnd,
    lastUpdated: identity.updatedAt,
    sacramentalRegistryTotal: registryTotal,
  };
}

// ── Basic integrity checksum ──
function generateChecksum(packet: DiocesePacket): string {
  const payload = JSON.stringify({
    parishId: packet.parishId,
    timestamp: packet.timestamp,
    period: packet.period,
    scope: packet.scope,
  });
  // Simple hash — not cryptographic, just for basic integrity
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

// ── Validate a packet ──
export function validatePacket(packet: DiocesePacket): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!packet.parishId) errors.push('Missing parish ID');
  if (!packet.dioceseId) errors.push('Missing diocese ID');
  if (!packet.timestamp) errors.push('Missing timestamp');
  if (!packet.scope?.length) errors.push('No sync scope specified');
  if (!packet.checksum) errors.push('Missing checksum');

  return { valid: errors.length === 0, errors };
}

// ── Serialize packet for upload ──
export function serializePacket(packet: DiocesePacket): string {
  return JSON.stringify(packet, null, 0);
}

// ── Get packet size estimate ──
export function getPacketSize(packet: DiocesePacket): number {
  return new Blob([serializePacket(packet)]).size;
}

// ── Create sync record ──
export function createSyncRecord(
  packet: DiocesePacket,
  status: 'success' | 'failed' | 'partial',
  error?: string
): SyncRecord {
  return {
    id: packet.packetId,
    timestamp: packet.timestamp,
    scope: packet.scope,
    recordsUploaded: 1,
    status,
    error,
  };
}
