// ChurchOS Persistence Layer
// All CRUD operations persist to localStorage with fallback to defaults.

const LS_KEY = 'churchos_v1';

export interface AppState {
  registry: {
    baptisms: unknown[];
    marriages: unknown[];
    confirmations: unknown[];
    deaths: unknown[];
  };
  families: unknown[];
  events: unknown[];
  journal: unknown[];
  collections: unknown[];
  ministries: unknown[];
  applications: unknown[];
  beneficiaries: unknown[];
  disbursements: unknown[];
  attendance: Record<string, unknown>;
  users: unknown[];
}

function loadState(): Partial<AppState> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveState(state: Partial<AppState>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

// ── Generic getters/setters ──────────────────────────────────────

export function getPersisted<T>(key: keyof AppState, defaultData: T): T {
  const state = loadState();
  const value = state[key];
  return value !== undefined ? (value as T) : defaultData;
}

export function setPersisted<T>(key: keyof AppState, data: T) {
  const state = loadState();
  state[key] = data as never;
  saveState(state);
}

// ── Array record helpers ─────────────────────────────────────────

export function addRecord<T extends { id: string }>(key: keyof AppState, record: T, defaultData: T[] = []): T[] {
  const list = getPersisted<T[]>(key, defaultData);
  const newList = [...list, record];
  setPersisted(key, newList);
  return newList;
}

export function updateRecord<T extends { id: string }>(key: keyof AppState, id: string, updater: (item: T) => T, defaultData: T[] = []): T[] {
  const list = getPersisted<T[]>(key, defaultData);
  const newList = list.map((item) => (item as T).id === id ? updater(item as T) : item as T);
  setPersisted(key, newList);
  return newList as T[];
}

export function deleteRecord<T extends { id: string }>(key: keyof AppState, id: string, defaultData: T[] = []): T[] {
  const list = getPersisted<T[]>(key, defaultData);
  const newList = list.filter((item) => (item as T).id !== id);
  setPersisted(key, newList);
  return newList as T[];
}

// ── Specific helpers for single objects ──────────────────────────

export function persistAttendance(ministryId: string, data: unknown) {
  const state = loadState();
  if (!state.attendance) state.attendance = {};
  (state.attendance as Record<string, unknown>)[ministryId] = data;
  saveState(state);
}

export function getPersistedAttendance(ministryId: string): unknown | null {
  const state = loadState();
  return state.attendance?.[ministryId] ?? null;
}

// ── Reset / init ─────────────────────────────────────────────────

export function resetAllData() {
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem('churchos_wizard');
  localStorage.removeItem('churchos_setup_complete');
  localStorage.removeItem('churchos_user');
}

export function hasSetupBeenCompleted(): boolean {
  return localStorage.getItem('churchos_setup_complete') === 'true';
}
