// ═══════════════════════════════════════════════════════════
// Module Registry — Each ChurchOS feature is a swappable module
// Parishes enable/disable modules based on their needs.
// The diocese can recommend standard modules but the parish decides.
// ═══════════════════════════════════════════════════════════

import * as nsStore from './storageNamespaced';

export interface ChurchOSModule {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'sacramental' | 'financial' | 'pastoral' | 'administrative';
  icon: string;
  route: string;
  version: string;
  enabled: boolean;
  dioceseRecommended: boolean;
  dependencies: string[]; // Other module IDs this depends on
  dioceseData?: boolean; // Whether this module contributes data to diocese sync
}

const MODULE_REGISTRY: ChurchOSModule[] = [
  // ── Core (always on) ──
  {
    id: 'dashboard', name: 'Dashboard', description: 'Overview of parish activities',
    category: 'core', icon: 'LayoutDashboard', route: '/', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: [], dioceseData: false,
  },

  // ── Sacramental ──
  {
    id: 'registry', name: 'Sacramental Registry', description: 'Baptism, marriage, confirmation, burial records',
    category: 'sacramental', icon: 'BookOpen', route: '/registry', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: [], dioceseData: true,
  },
  {
    id: 'directory', name: 'Parishioner Directory', description: 'Family-centric parishioner records',
    category: 'sacramental', icon: 'Users', route: '/directory', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: [], dioceseData: false,
  },

  // ── Financial ──
  {
    id: 'finance', name: 'Financial Management', description: 'Journal, collections, budget, analytics',
    category: 'financial', icon: 'Wallet', route: '/finance', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: [], dioceseData: true,
  },
  {
    id: 'reports', name: 'Reports', description: 'Generate parish reports and certificates',
    category: 'financial', icon: 'FileText', route: '/reports', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: ['registry', 'finance'], dioceseData: false,
  },

  // ── Pastoral ──
  {
    id: 'calendar', name: 'Calendar', description: 'Mass schedule and events',
    category: 'pastoral', icon: 'Calendar', route: '/calendar', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: [], dioceseData: true,
  },
  {
    id: 'intentions', name: 'Mass Intentions', description: 'Mass intention register (Canon 958) — offerings, celebrant, fulfillment',
    category: 'pastoral', icon: 'ScrollText', route: '/intentions', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: [], dioceseData: false,
  },
  {
    id: 'ministries', name: 'Ministries', description: 'Ministry rosters and assignments',
    category: 'pastoral', icon: 'Users2', route: '/ministries', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: [], dioceseData: false,
  },
  {
    id: 'ssdm', name: 'SSDM', description: 'Social services and assistance programs',
    category: 'pastoral', icon: 'Heart', route: '/ssdm', version: '1.0',
    enabled: true, dioceseRecommended: false, dependencies: [], dioceseData: false,
  },

  // ── Administrative ──
  {
    id: 'requests', name: 'Requests', description: 'Online parishioner requests (mass intentions, certificates, donations)',
    category: 'administrative', icon: 'Inbox', route: '/requests', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: [], dioceseData: false,
  },
];

// ── Overrides store ──
// Namespaced short key (the bare churchos_module_overrides key also migrates
// via parishIdentity's migrateToNamespacedStorage list, same as import_history).
const MODULE_OVERRIDES_KEY = 'module_overrides';
const LEGACY_OVERRIDES_KEY = 'churchos_module_overrides';

type ModuleOverrides = Record<string, { enabled?: boolean }>;

function readOverrides(): ModuleOverrides {
  const stored = nsStore.getJSON<ModuleOverrides | null>(MODULE_OVERRIDES_KEY, null);
  if (stored !== null && typeof stored === 'object') return stored;
  // One-time lazy migration from the old bare localStorage key so existing
  // parish toggles survive the move onto the namespaced seam.
  try {
    const legacy = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_OVERRIDES_KEY) : null;
    if (legacy) {
      const parsed = JSON.parse(legacy) as ModuleOverrides;
      nsStore.setJSON(MODULE_OVERRIDES_KEY, parsed);
      return parsed;
    }
  } catch { /* ignore — fall through to empty */ }
  return {};
}

function writeOverrides(overrides: ModuleOverrides): void {
  nsStore.setJSON(MODULE_OVERRIDES_KEY, overrides);
  notifyModulesChanged();
}

// ── Change subscription ──
// Lets React surfaces (Sidebar, Settings, page banners) re-render immediately
// when a module is toggled, via useSyncExternalStore(subscribeModules, getModulesSnapshot).
type ModulesListener = () => void;
const listeners = new Set<ModulesListener>();
let modulesVersion = 0;

export function subscribeModules(listener: ModulesListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getModulesSnapshot(): number {
  return modulesVersion;
}

function notifyModulesChanged(): void {
  modulesVersion++;
  listeners.forEach((fn) => fn());
}

// ── Get registry ──
export function getModuleRegistry(): ChurchOSModule[] {
  const overrides = readOverrides();
  // Only the `enabled` flag is overridable — everything else (routes, deps,
  // categories) stays code-defined so stored junk can't corrupt the registry.
  return MODULE_REGISTRY.map((m) => {
    const o = overrides[m.id];
    return typeof o?.enabled === 'boolean' && m.category !== 'core'
      ? { ...m, enabled: o.enabled }
      : { ...m };
  });
}

// ── Get modules by category ──
export function getModulesByCategory(category: ChurchOSModule['category']): ChurchOSModule[] {
  return getModuleRegistry().filter(m => m.category === category);
}

// ── Get diocese-recommended modules ──
export function getDioceseRecommended(): ChurchOSModule[] {
  return getModuleRegistry().filter(m => m.dioceseRecommended);
}

// ── Get modules that contribute diocese data ──
export function getDioceseDataModules(): ChurchOSModule[] {
  return getModuleRegistry().filter(m => m.dioceseData && m.enabled);
}

// ── Dependency lookups ──
// Enabled modules that (transitively) depend on the given module — i.e. what
// else would stop working if this were turned off.
export function getEnabledDependents(moduleId: string): ChurchOSModule[] {
  const registry = getModuleRegistry();
  const found = new Map<string, ChurchOSModule>();
  const visit = (id: string) => {
    for (const m of registry) {
      if (m.enabled && m.dependencies.includes(id) && !found.has(m.id)) {
        found.set(m.id, m);
        visit(m.id);
      }
    }
  };
  visit(moduleId);
  return [...found.values()];
}

// Disabled modules the given module (transitively) depends on — i.e. what must
// also be turned on for this module to work.
export function getDisabledDependencies(moduleId: string): ChurchOSModule[] {
  const registry = getModuleRegistry();
  const byId = new Map(registry.map((m) => [m.id, m]));
  const found = new Map<string, ChurchOSModule>();
  const visit = (id: string) => {
    const mod = byId.get(id);
    if (!mod) return;
    for (const depId of mod.dependencies) {
      const dep = byId.get(depId);
      if (dep && !dep.enabled && !found.has(dep.id)) {
        found.set(dep.id, dep);
        visit(dep.id);
      }
    }
  };
  visit(moduleId);
  return [...found.values()];
}

// ── Set module state (with dependency enforcement both ways) ──
// Enabling a module also enables its (transitive) disabled dependencies;
// disabling a module also disables its (transitive) enabled dependents.
// Returns the list of module ids whose state actually changed, or null when
// the request is not allowed (unknown module, or a core module).
export function setModuleEnabled(moduleId: string, enabled: boolean): string[] | null {
  const registry = getModuleRegistry();
  const mod = registry.find(m => m.id === moduleId);
  if (!mod) return null;
  if (mod.category === 'core') return null; // core modules are always on

  const overrides = readOverrides();
  const changed: string[] = [];
  const apply = (m: ChurchOSModule, state: boolean) => {
    if (m.enabled === state) return;
    overrides[m.id] = { enabled: state };
    changed.push(m.id);
  };

  if (enabled) {
    for (const dep of getDisabledDependencies(moduleId)) apply(dep, true);
    apply(mod, true);
  } else {
    apply(mod, false);
    for (const dependent of getEnabledDependents(moduleId)) apply(dependent, false);
  }

  if (changed.length > 0) writeOverrides(overrides);
  return changed;
}

// ── Toggle module ──
// Back-compat wrapper: returns the new state, or false when the toggle is not
// allowed (core/unknown module). Cascades per setModuleEnabled.
export function toggleModule(moduleId: string): boolean {
  const target = !isModuleEnabled(moduleId);
  const changed = setModuleEnabled(moduleId, target);
  if (changed === null) return false;
  return target;
}

// ── Check if module is enabled ──
export function isModuleEnabled(moduleId: string): boolean {
  return getModuleRegistry().find(m => m.id === moduleId)?.enabled ?? false;
}

// ── Get enabled routes ──
export function getEnabledRoutes(): Array<{ route: string; name: string; icon: string }> {
  return getModuleRegistry()
    .filter(m => m.enabled)
    .map(m => ({ route: m.route, name: m.name, icon: m.icon }));
}
