// Fee Schedule -- Sacrament ceremony fees + certificate copy fees
// Editable only by Parish Priest and Bookkeeper

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

const FEE_SCHEDULE_KEY = 'churchos_fee_schedule';

export function getFeeSchedule(): FeeScheduleItem[] {
  try {
    const raw = localStorage.getItem(FEE_SCHEDULE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [...DEFAULT_FEE_SCHEDULE];
}

export function setFeeSchedule(schedule: FeeScheduleItem[]) {
  localStorage.setItem(FEE_SCHEDULE_KEY, JSON.stringify(schedule));
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
