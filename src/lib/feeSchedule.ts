// Fee Schedule -- Sacrament ceremony fees + certificate copy fees
// Editable only by Parish Priest and Bookkeeper

import * as nsStore from './storageNamespaced';

export interface FeeScheduleItem {
  sacramentType: 'Baptism' | 'Marriage' | 'Confirmation' | 'Death';
  ceremonyFee: number;      // Fee for performing the sacrament
  certificateFee: number;   // Fee for certificate copy / reprint
  description?: string;
}

export const DEFAULT_FEE_SCHEDULE: FeeScheduleItem[] = [
  { sacramentType: 'Baptism',      ceremonyFee: 300,  certificateFee: 100, description: 'Includes one original certificate' },
  { sacramentType: 'Marriage',     ceremonyFee: 5000, certificateFee: 100, description: 'Includes one original certificate' },
  { sacramentType: 'Confirmation', ceremonyFee: 200,  certificateFee: 100, description: 'Includes one original certificate' },
  { sacramentType: 'Death',        ceremonyFee: 2000, certificateFee: 100, description: 'Includes one original certificate' },
];

// Short key under the parish namespace (listed in parishIdentity's
// migrateToNamespacedStorage key set, mapping from the old bare key below).
const FEE_SCHEDULE_KEY = 'fee_schedule';
// The pre-namespacing bare key. Fee schedules stored here leaked across parishes
// on a shared device; read it once so an existing parish's edits survive the move.
const LEGACY_FEE_SCHEDULE_KEY = 'churchos_fee_schedule';

function deepCopyDefaults(): FeeScheduleItem[] {
  // Deep copy — callers may mutate items in place; a shallow copy would let
  // that corrupt the canonical defaults for the rest of the process.
  return DEFAULT_FEE_SCHEDULE.map((item) => ({ ...item }));
}

export function getFeeSchedule(): FeeScheduleItem[] {
  const stored = nsStore.getJSON<FeeScheduleItem[] | null>(FEE_SCHEDULE_KEY, null);
  if (stored !== null && Array.isArray(stored)) return stored;

  // One-time lazy migration from the old bare localStorage key so an existing
  // parish's edited schedule survives the move onto the namespaced seam (same
  // pattern as moduleRegistry's LEGACY_OVERRIDES_KEY).
  try {
    const legacy = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_FEE_SCHEDULE_KEY) : null;
    if (legacy) {
      const parsed = JSON.parse(legacy) as FeeScheduleItem[];
      if (Array.isArray(parsed)) {
        nsStore.setJSON(FEE_SCHEDULE_KEY, parsed);
        return parsed;
      }
    }
  } catch { /* ignore — fall through to defaults */ }

  return deepCopyDefaults();
}

export function setFeeSchedule(schedule: FeeScheduleItem[]) {
  nsStore.setJSON(FEE_SCHEDULE_KEY, schedule);
}

export function getFeeForSacrament(type: 'Baptism' | 'Marriage' | 'Confirmation' | 'Death'): FeeScheduleItem | undefined {
  return getFeeSchedule().find(f => f.sacramentType === type);
}

// Check if current user can edit fee schedule
export function canEditFeeSchedule(): boolean {
  try {
    const user = JSON.parse(localStorage.getItem('churchos_user') || '{}');
    // `role` holds the role CODE that setSession stores (e.g. 'parish_priest'); the
    // display label ('Parish Priest') lives in `roleLabel`. The old check compared the
    // code field against the LABEL, so it never matched → no one could edit. Match the
    // codes — and accept the labels defensively for any legacy session.
    const PRIVILEGED = ['parish_priest', 'bookkeeper', 'Parish Priest', 'Bookkeeper'];
    return PRIVILEGED.includes(user.role) || PRIVILEGED.includes(user.roleLabel);
  } catch { return false; }
}
