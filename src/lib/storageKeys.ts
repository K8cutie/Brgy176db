// ═══════════════════════════════════════════════════════════
// Canonical Storage Keys — single source of truth
// Every reader and writer in the app MUST use these constants so
// that pages, the Dashboard, and the Diocese packet all agree on
// where each dataset lives. All keys are resolved through
// storageNamespaced (churchos_parish_{id}_{key}).
//
// NOTE: the *_records, journal_entries, budget_items and collections
// keys are the ones diocesePacket.ts already reads — do not rename
// them without updating that file too.
// ═══════════════════════════════════════════════════════════

export const KEYS = {
  // Sacramental registry
  baptismRecords: 'baptism_records',
  marriageRecords: 'marriage_records',
  confirmationRecords: 'confirmation_records',
  deathRecords: 'death_records',

  // Finance
  journalEntries: 'journal_entries',
  budgetItems: 'budget_items',
  collections: 'collections',
  accountsReceivable: 'accounts_receivable',
  feeOverrideAudit: 'fee_override_audit',

  // Directory
  families: 'families',

  // Calendar
  calendarEvents: 'calendar_events',

  // Ministries
  ministries: 'ministries',

  // SSDM (Social Services & Development Ministry)
  ssdmApplications: 'ssdm_applications',
  ssdmBeneficiaries: 'ssdm_beneficiaries',
  ssdmDisbursements: 'ssdm_disbursements',
} as const;

export type StorageKey = (typeof KEYS)[keyof typeof KEYS];
