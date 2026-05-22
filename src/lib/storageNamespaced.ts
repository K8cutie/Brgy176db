// ═══════════════════════════════════════════════════════════
// Namespaced Storage — Every parish gets its own storage space
// This enables multi-parish Docker instances and clean
// separation for the Lego brick architecture.
// ═══════════════════════════════════════════════════════════

import { getParishId } from './parishIdentity';

// ── Generate a namespaced key ──
export function ns(key: string): string {
  return `churchos_parish_${getParishId()}_${key}`;
}

// ── getItem with namespace ──
export function getItem(key: string): string | null {
  return localStorage.getItem(ns(key));
}

// ── setItem with namespace ──
export function setItem(key: string, value: string): void {
  localStorage.setItem(ns(key), value);
}

// ── removeItem with namespace ──
export function removeItem(key: string): void {
  localStorage.removeItem(ns(key));
}

// ── Get all keys for current parish ──
export function getAllKeys(): string[] {
  const prefix = ns('');
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) {
      keys.push(k.slice(prefix.length));
    }
  }
  return keys;
}

// ── Get storage usage estimate ──
export function getStorageUsage(): { used: number; total: number; percent: number } {
  let used = 0;
  const prefix = ns('');
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) {
      used += (localStorage.getItem(k)?.length || 0) * 2; // UTF-16 = 2 bytes per char
    }
  }
  const total = 5 * 1024 * 1024; // 5MB typical localStorage limit
  return { used, total, percent: Math.round((used / total) * 100) };
}

// ── Clear all data for current parish (DANGER) ──
export function clearParishData(): void {
  const prefix = ns('');
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) {
      keysToRemove.push(k);
    }
  }
  for (const k of keysToRemove) {
    localStorage.removeItem(k);
  }
}

// ── Export all parish data as JSON ──
export function exportParishData(): Record<string, unknown> {
  const prefix = ns('');
  const data: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) {
      const shortKey = k.slice(prefix.length);
      try {
        data[shortKey] = JSON.parse(localStorage.getItem(k) || 'null');
      } catch {
        data[shortKey] = localStorage.getItem(k);
      }
    }
  }
  return data;
}
