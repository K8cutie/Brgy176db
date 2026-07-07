// ═══════════════════════════════════════════════════════════
// AI Assistant Context Bridge
//
// Builds the compact, privacy-conscious parish context that is
// prepended to messages sent to the desktop AI assistant, plus
// the persisted opt-out flag. Aggregates only — counts and names
// of modules/pages, never individual parishioner records.
// ═══════════════════════════════════════════════════════════

import * as ns from './storageNamespaced';
import { KEYS } from './storageKeys';
import { getParishIdentity } from './parishIdentity';
import { getModuleRegistry } from './moduleRegistry';
import { getAttendanceSummary } from './attendance';

// ── Persisted opt-out (namespaced storage seam) ──
// Stored as an opt-OUT flag so absent/default = context attached.
const AI_CONTEXT_OPTOUT_KEY = 'ai_context_optout';

export function isAiContextEnabled(): boolean {
  return !ns.getJSON<boolean>(AI_CONTEXT_OPTOUT_KEY, false);
}

export function setAiContextEnabled(enabled: boolean): void {
  ns.setJSON(AI_CONTEXT_OPTOUT_KEY, !enabled);
}

// ── Page names for the "where is the user" hint ──
const PAGE_NAMES: Record<string, string> = {
  '/': 'Dashboard',
  '/finance': 'Finance',
  '/registry': 'Sacramental Registry',
  '/directory': 'Parishioner Directory',
  '/calendar': 'Calendar',
  '/intentions': 'Mass Intentions',
  '/ministries': 'Ministries',
  '/ssdm': 'SSDM',
  '/reports': 'Reports',
  '/requests': 'Requests',
  '/settings': 'Settings',
};

export function pageNameFromPath(pathname: string): string {
  if (PAGE_NAMES[pathname]) return PAGE_NAMES[pathname];
  const base = '/' + (pathname.split('/').filter(Boolean)[0] || '');
  return PAGE_NAMES[base] || pathname;
}

// Soft-deleted records must not inflate the counts the assistant sees
// (same shared contract as diocesePacket's liveRecords).
function liveCount(key: string): number {
  const list = ns.getJSON<Array<{ isDeleted?: boolean }>>(key, []);
  return list.filter((r) => !r?.isDeleted).length;
}

/**
 * The context block prepended to an outgoing assistant message.
 * Defensive: any storage/identity failure degrades to an empty string,
 * which the caller treats as "send without context".
 */
export function buildAiContext(pathname: string): string {
  try {
    const identity = getParishIdentity();
    const enabledModules = getModuleRegistry().filter((m) => m.enabled).map((m) => m.name);
    const attendance = getAttendanceSummary();

    const lines = [
      '[ChurchOS context — attached automatically; the user can turn this off in the assistant panel]',
      `Parish: ${identity.name} (${identity.address.city}, ${identity.address.province})`,
      `Parish priest: ${identity.priest}`,
      `User is currently on: ${pageNameFromPath(pathname)} page`,
      `Enabled modules: ${enabledModules.join(', ')}`,
      `Registry counts (live records): baptisms ${liveCount(KEYS.baptismRecords)}, marriages ${liveCount(KEYS.marriageRecords)}, confirmations ${liveCount(KEYS.confirmationRecords)}, burials ${liveCount(KEYS.deathRecords)}`,
    ];
    if (attendance.eventsCounted > 0) {
      lines.push(`Mass attendance: ${attendance.eventsCounted} Masses counted, average headcount ${attendance.averageHeadcount}`);
    }
    lines.push('Answer with this parish context in mind. Do not repeat the context back unless asked.');
    return lines.join('\n');
  } catch {
    return ''; // no context is always a safe fallback
  }
}
