// ═══════════════════════════════════════════════════════════
// Namespaced Storage — Every parish gets its own storage space
// This enables multi-parish instances and clean separation.
//
// Backend:
//  • Desktop (Electron): a real on-disk SQLite file, accessed
//    synchronously through an in-memory cache (see desktopStore).
//  • Browser: localStorage.
// The public API below is identical for both, so the rest of the
// app never needs to know which backend is active.
// ═══════════════════════════════════════════════════════════

import { getParishId } from './parishIdentity';
import { isDesktop, dsGet, dsSet, dsRemove, dsKeys } from './desktopStore';
import { isCloud, cloudGet, cloudSet, cloudRemove, cloudKeys } from './cloudStore';

// ── Generate a namespaced key ──
export function ns(key: string): string {
  return `churchos_parish_${getParishId()}_${key}`;
}

// ── Backend primitives (full, already-namespaced key) ──
// Priority: cloud (SaaS) → desktop (SQLite) → localStorage (browser).
function backendGet(fullKey: string): string | null {
  if (isCloud()) return cloudGet(fullKey);
  return isDesktop() ? dsGet(fullKey) : localStorage.getItem(fullKey);
}

// Returns true on success, false if the write failed (e.g. quota exceeded).
function backendSet(fullKey: string, value: string): boolean {
  if (isCloud()) return cloudSet(fullKey, value);
  if (isDesktop()) {
    dsSet(fullKey, value);
    return true;
  }
  try {
    localStorage.setItem(fullKey, value);
    return true;
  } catch {
    return false;
  }
}

function backendRemove(fullKey: string): void {
  if (isCloud()) { cloudRemove(fullKey); return; }
  if (isDesktop()) dsRemove(fullKey);
  else localStorage.removeItem(fullKey);
}

function backendKeys(): string[] {
  if (isCloud()) return cloudKeys();
  if (isDesktop()) return dsKeys();
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k !== null) keys.push(k);
  }
  return keys;
}

// ── getItem with namespace ──
export function getItem(key: string): string | null {
  return backendGet(ns(key));
}

// ── setItem with namespace ──
export function setItem(key: string, value: string): void {
  backendSet(ns(key), value);
}

// ── removeItem with namespace ──
export function removeItem(key: string): void {
  backendRemove(ns(key));
}

// ── Corruption handling ──
// A value that is PRESENT but unparseable (or the wrong shape) must not be
// silently replaced by the fallback — the write-through would then persist that
// fallback over real data (a single corrupt read could blank a whole dataset).
// Instead we preserve the raw bytes to a quarantine key and warn; the app keeps
// running on the fallback, and the original is recoverable (also see auto-backup).
let onCorruption: ((key: string) => void) | null = null;
export function setCorruptionHandler(fn: ((key: string) => void) | null) { onCorruption = fn; }
const quarantined = new Set<string>();

// ── Typed JSON get/set with fail-safe fallback ──
export function getJSON<T>(key: string, fallback: T): T {
  const raw = backendGet(ns(key));
  if (raw === null) return fallback; // genuinely absent — fine to seed/persist the default
  try {
    const parsed = JSON.parse(raw) as T;
    // Shape guard: an array-typed dataset that parsed to a non-array is corrupt.
    if (Array.isArray(fallback) && !Array.isArray(parsed)) throw new Error('shape-mismatch');
    return parsed;
  } catch {
    if (!quarantined.has(key)) {
      quarantined.add(key);
      try { backendSet(ns(key + '__corrupt'), raw); } catch { /* best effort */ }
      if (onCorruption) onCorruption(key);
    }
    return fallback;
  }
}

// Returns true on success, false if the write failed (e.g. quota exceeded).
export function setJSON(key: string, value: unknown): boolean {
  try {
    return backendSet(ns(key), JSON.stringify(value));
  } catch {
    return false;
  }
}

// ── Get all (short) keys for current parish ──
export function getAllKeys(): string[] {
  const prefix = ns('');
  return backendKeys()
    .filter((k) => k.startsWith(prefix))
    .map((k) => k.slice(prefix.length));
}

// ── Get storage usage estimate ──
export function getStorageUsage(): { used: number; total: number; percent: number } {
  const prefix = ns('');
  let used = 0;
  for (const k of backendKeys()) {
    if (k.startsWith(prefix)) {
      used += (backendGet(k)?.length || 0) * 2; // UTF-16 = 2 bytes per char
    }
  }
  // Desktop SQLite is effectively unbounded; localStorage caps near 5 MB.
  const total = isDesktop() ? 2 * 1024 * 1024 * 1024 : 5 * 1024 * 1024;
  return { used, total, percent: Math.round((used / total) * 100) };
}

// ── Clear all data for current parish (DANGER) ──
export function clearParishData(): void {
  const prefix = ns('');
  for (const k of backendKeys()) {
    if (k.startsWith(prefix)) backendRemove(k);
  }
}

// ── Export all parish data as JSON ──
export function exportParishData(): Record<string, unknown> {
  const prefix = ns('');
  const data: Record<string, unknown> = {};
  for (const k of backendKeys()) {
    if (k.startsWith(prefix)) {
      const shortKey = k.slice(prefix.length);
      const raw = backendGet(k);
      try {
        data[shortKey] = JSON.parse(raw || 'null');
      } catch {
        data[shortKey] = raw;
      }
    }
  }
  return data;
}
