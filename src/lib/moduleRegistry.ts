// ═══════════════════════════════════════════════════════════
// Module Registry — Each ChurchOS feature is a swappable module
// Parishes enable/disable modules based on their needs.
// The diocese can recommend standard modules but the parish decides.
// ═══════════════════════════════════════════════════════════

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
    id: 'ministries', name: 'Ministries', description: 'Ministry rosters and assignments',
    category: 'pastoral', icon: 'Users2', route: '/ministries', version: '1.0',
    enabled: true, dioceseRecommended: true, dependencies: [], dioceseData: false,
  },
  {
    id: 'ssdm', name: 'SSDM', description: 'Social services and assistance programs',
    category: 'pastoral', icon: 'Heart', route: '/ssdm', version: '1.0',
    enabled: true, dioceseRecommended: false, dependencies: [], dioceseData: false,
  },
];

// ── Get registry ──
export function getModuleRegistry(): ChurchOSModule[] {
  // Merge with any stored overrides from parish identity
  try {
    const stored = localStorage.getItem('churchos_module_overrides');
    if (stored) {
      const overrides = JSON.parse(stored) as Record<string, { enabled?: boolean }>;
      return MODULE_REGISTRY.map(m => ({
        ...m,
        ...(overrides[m.id] || {}),
      }));
    }
  } catch { /* ignore */ }
  return MODULE_REGISTRY;
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

// ── Toggle module ──
export function toggleModule(moduleId: string): boolean {
  const overrides: Record<string, { enabled: boolean }> = {};
  try {
    const stored = localStorage.getItem('churchos_module_overrides');
    if (stored) Object.assign(overrides, JSON.parse(stored));
  } catch { /* ignore */ }

  const mod = MODULE_REGISTRY.find(m => m.id === moduleId);
  if (!mod) return false;

  // Can't disable core modules
  if (mod.category === 'core') return false;

  // Check dependencies
  const currentState = overrides[moduleId]?.enabled ?? mod.enabled;
  const newState = !currentState;

  if (newState === false) {
    // Disabling — check if other modules depend on this
    const dependents = MODULE_REGISTRY.filter(
      m => m.enabled && m.dependencies.includes(moduleId)
    );
    if (dependents.length > 0) return false;
  }

  overrides[moduleId] = { enabled: newState };
  localStorage.setItem('churchos_module_overrides', JSON.stringify(overrides));
  return newState;
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
