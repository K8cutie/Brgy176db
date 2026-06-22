// ═══════════════════════════════════════════════════════════
// Desktop store bridge (Electron + SQLite)
//
// In the desktop build, parish data lives in a real on-disk SQLite
// file owned by the Electron main process. This module mirrors that
// data into an in-memory cache at startup so the rest of the app can
// keep reading/writing storage *synchronously* (the React code never
// changed). Writes update the cache immediately and are persisted to
// SQLite asynchronously (fire-and-forget) through the preload bridge.
//
// In a plain browser build this module is inert and storageNamespaced
// falls back to localStorage.
// ═══════════════════════════════════════════════════════════

interface WriteResult {
  ok: boolean;
  error?: string;
}

interface DesktopBridge {
  isDesktop: boolean;
  db: {
    getAll: () => Promise<Record<string, string>>;
    set: (key: string, value: string) => Promise<WriteResult>;
    delete: (key: string) => Promise<WriteResult>;
  };
}

// Called when a desktop (SQLite) write fails, so the UI can warn the user.
let onWriteError: (() => void) | null = null;
export function setDesktopWriteErrorHandler(fn: (() => void) | null) {
  onWriteError = fn;
}

function bridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { churchos?: DesktopBridge };
  return w.churchos?.isDesktop ? w.churchos : null;
}

export function isDesktop(): boolean {
  return bridge() !== null;
}

// Full namespaced key → raw JSON string value.
let cache: Record<string, string> = {};
let hydrated = false;

/** Load all rows from SQLite into the cache. Call once before render. */
export async function hydrateDesktopStore(): Promise<void> {
  const b = bridge();
  if (!b) return;
  try {
    cache = (await b.db.getAll()) || {};
  } catch {
    cache = {};
  }
  hydrated = true;
}

export function isHydrated(): boolean {
  return hydrated;
}

export function dsGet(fullKey: string): string | null {
  return Object.prototype.hasOwnProperty.call(cache, fullKey) ? cache[fullKey] : null;
}

function reportFailure() {
  if (onWriteError) onWriteError();
}

export function dsSet(fullKey: string, value: string): void {
  cache[fullKey] = value;
  const b = bridge();
  if (b) {
    b.db.set(fullKey, value).then(
      (res) => { if (!res || res.ok === false) reportFailure(); },
      () => reportFailure(),
    );
  }
}

export function dsRemove(fullKey: string): void {
  delete cache[fullKey];
  const b = bridge();
  if (b) {
    b.db.delete(fullKey).then(
      (res) => { if (!res || res.ok === false) reportFailure(); },
      () => reportFailure(),
    );
  }
}

export function dsKeys(): string[] {
  return Object.keys(cache);
}
