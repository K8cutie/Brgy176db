// ═══════════════════════════════════════════════════════════
// Parish Identity — The Sovereign Lego Brick
// Every ChurchOS instance has ONE identity document that
// defines the parish, its modules, and its diocese connection.
// ═══════════════════════════════════════════════════════════

export interface DioceseConnection {
  status: 'disconnected' | 'pending' | 'connected';
  dioceseId: string;
  dioceseName: string;
  connectedAt?: string;
  lastSyncAt?: string;
  syncScope: Array<'financial_summary' | 'sacramental_counts' | 'parish_status' | 'collection_summary'>;
  syncHistory: SyncRecord[];
}

export interface SyncRecord {
  id: string;
  timestamp: string;
  scope: string[];
  recordsUploaded: number;
  status: 'success' | 'failed' | 'partial';
  error?: string;
}

export interface ParishModule {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
  version: string;
  route: string;
}

export interface ParishIdentity {
  parishId: string;
  name: string;
  shortName: string;
  tagline?: string;
  priest: string;
  address: {
    street: string;
    barangay: string;
    city: string;
    province: string;
    country: string;
    postalCode: string;
  };
  contact: {
    phone: string;
    email: string;
    facebook?: string;
    website?: string;
  };
  fiscalYearEnd: string; // MM-DD
  currency: string;
  timezone: string;
  modules: ParishModule[];
  dioceseConnection: DioceseConnection;
  createdAt: string;
  updatedAt: string;
}

const IDENTITY_KEY = 'churchos_parish_identity';
const PARISH_ID_KEY = 'churchos_parish_id';

// ── Generate a unique parish ID ──
function generateParishId(): string {
  const existing = localStorage.getItem(PARISH_ID_KEY);
  if (existing) return existing;
  const id = `parish_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  localStorage.setItem(PARISH_ID_KEY, id);
  return id;
}

// ── Get or create the parish identity ──
export function getParishIdentity(): ParishIdentity {
  const raw = localStorage.getItem(IDENTITY_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as ParishIdentity;
    } catch { /* fall through to create new */ }
  }
  return createDefaultIdentity();
}

// ── Create default identity ──
function createDefaultIdentity(): ParishIdentity {
  const existingId = localStorage.getItem(PARISH_ID_KEY);
  const id = existingId || generateParishId();

  // Migrate from old parishConfig if it exists
  const oldConfig = localStorage.getItem('churchos_parish_config');
  let name = 'St. Mary Magdalene Parish';
  let shortName = 'St. Mary Magdalene';
  let priest = 'Fr. Jose Reyes';
  let city = 'Manila';
  let province = 'Metro Manila';
  let fiscalYearEnd = '12-31';
  let currency = 'PHP';
  let timezone = 'Asia/Manila';

  if (oldConfig) {
    try {
      const old = JSON.parse(oldConfig);
      name = old.parishName || name;
      shortName = old.parishShortName || shortName;
      priest = old.parishPriest || priest;
      city = old.addressCity || city;
      province = old.addressProvince || province;
      fiscalYearEnd = old.fiscalYearEnd || fiscalYearEnd;
      currency = old.currency || currency;
      timezone = old.timezone || timezone;
    } catch { /* use defaults */ }
  }

  const identity: ParishIdentity = {
    parishId: id,
    name,
    shortName,
    priest,
    address: {
      street: '123 Mabini Street',
      barangay: 'Poblacion',
      city,
      province,
      country: 'Philippines',
      postalCode: '1000',
    },
    contact: {
      phone: '(02) 8123-4567',
      email: 'parish@churchos.local',
    },
    fiscalYearEnd,
    currency,
    timezone,
    modules: getDefaultModules(),
    dioceseConnection: {
      status: 'disconnected',
      dioceseId: '',
      dioceseName: '',
      syncScope: ['financial_summary', 'sacramental_counts', 'parish_status'],
      syncHistory: [],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  saveParishIdentity(identity);
  return identity;
}

// ── Save identity ──
export function saveParishIdentity(identity: ParishIdentity) {
  identity.updatedAt = new Date().toISOString();
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  localStorage.setItem(PARISH_ID_KEY, identity.parishId);
}

// ── Update specific fields ──
export function updateParishIdentity(updates: Partial<ParishIdentity>) {
  const identity = getParishIdentity();
  const updated = { ...identity, ...updates };
  saveParishIdentity(updated);
  return updated;
}

// ── Get parish ID ──
export function getParishId(): string {
  return getParishIdentity().parishId;
}

// ── Get parish display name ──
export function getParishDisplayName(): string {
  const id = getParishIdentity();
  return id.shortName || id.name;
}

// ── Get priest name ──
export function getParishPriest(): string {
  return getParishIdentity().priest;
}

// ── Diocese connection helpers ──
export function getDioceseConnection(): DioceseConnection {
  return getParishIdentity().dioceseConnection;
}

export function updateDioceseConnection(updates: Partial<DioceseConnection>) {
  const identity = getParishIdentity();
  identity.dioceseConnection = { ...identity.dioceseConnection, ...updates };
  saveParishIdentity(identity);
}

export function addSyncRecord(record: SyncRecord) {
  const identity = getParishIdentity();
  identity.dioceseConnection.syncHistory.unshift(record);
  if (identity.dioceseConnection.syncHistory.length > 50) {
    identity.dioceseConnection.syncHistory = identity.dioceseConnection.syncHistory.slice(0, 50);
  }
  identity.dioceseConnection.lastSyncAt = record.timestamp;
  saveParishIdentity(identity);
}

// ── Default modules ──
function getDefaultModules(): ParishModule[] {
  return [
    { id: 'dashboard', name: 'Dashboard', description: 'Overview of parish activities', icon: 'LayoutDashboard', enabled: true, version: '1.0', route: '/' },
    { id: 'registry', name: 'Sacramental Registry', description: 'Baptism, marriage, confirmation, burial records', icon: 'BookOpen', enabled: true, version: '1.0', route: '/registry' },
    { id: 'directory', name: 'Parishioner Directory', description: 'Family-centric parishioner records', icon: 'Users', enabled: true, version: '1.0', route: '/directory' },
    { id: 'calendar', name: 'Calendar', description: 'Mass schedule and events', icon: 'Calendar', enabled: true, version: '1.0', route: '/calendar' },
    { id: 'finance', name: 'Financial Management', description: 'Journal, collections, budget, analytics', icon: 'Wallet', enabled: true, version: '1.0', route: '/finance' },
    { id: 'ministries', name: 'Ministries', description: 'Ministry rosters and assignments', icon: 'Users2', enabled: true, version: '1.0', route: '/ministries' },
    { id: 'ssdm', name: 'SSDM', description: 'Social services and assistance programs', icon: 'Heart', enabled: true, version: '1.0', route: '/ssdm' },
    { id: 'reports', name: 'Reports', description: 'Generate parish reports and certificates', icon: 'FileText', enabled: true, version: '1.0', route: '/reports' },
  ];
}

// ── Module management ──
export function getEnabledModules(): ParishModule[] {
  return getParishIdentity().modules.filter(m => m.enabled);
}

export function isModuleEnabled(moduleId: string): boolean {
  return getParishIdentity().modules.find(m => m.id === moduleId)?.enabled ?? false;
}

export function toggleModule(moduleId: string) {
  const identity = getParishIdentity();
  const mod = identity.modules.find(m => m.id === moduleId);
  if (mod) {
    mod.enabled = !mod.enabled;
    saveParishIdentity(identity);
  }
  return getParishIdentity();
}

// ── Namespaced storage key generator ──
export function getNamespacedKey(key: string): string {
  return `churchos_parish_${getParishId()}_${key}`;
}

// ── Migrate old storage keys to namespaced ──
export function migrateToNamespacedStorage() {
  const parishId = getParishId();
  const oldKey = (k: string) => `churchos_${k}`;
  const newKey = (k: string) => `churchos_parish_${parishId}_${k}`;

  const keysToMigrate = [
    'baptism_records', 'marriage_records', 'confirmation_records', 'death_records',
    'parishioner_directory', 'calendar_events', 'mass_schedule',
    'journal_entries', 'collections', 'accounts_receivable',
    'audit_log', 'fee_override_audit', 'settings',
  ];

  for (const key of keysToMigrate) {
    const old = localStorage.getItem(oldKey(key));
    if (old && !localStorage.getItem(newKey(key))) {
      localStorage.setItem(newKey(key), old);
    }
  }

  // Mark migration complete
  localStorage.setItem(`churchos_parish_${parishId}_storage_migrated`, 'true');
}

// ── Check if migration is complete ──
export function isStorageMigrated(): boolean {
  const parishId = getParishId();
  return localStorage.getItem(`churchos_parish_${parishId}_storage_migrated`) === 'true';
}
