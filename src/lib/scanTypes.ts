// ═══════════════════════════════════════════════════════════
// Paper-document scanning — the extraction CONTRACT.
//
// Phase 1 owns this file; later phases (the scan-extract edge
// function's mirror of these keys, the UI review step, and the
// commit/ingest mapping) import from here so there is ONE source
// of truth for the document types and their expected fields.
//
// The AI reads a photo of a Philippine parish's paper document and
// returns a ScannedExtraction. Every extracted value is a STRING
// (editable in the review UI, coerced to the real type only at
// ingest) — blanks are expected and fine; the human fills the rest.
// ═══════════════════════════════════════════════════════════

export type ScanDocType = 'collection' | 'expense' | 'baptism' | 'unknown';

export interface ScannedExtraction {
  docType: ScanDocType;
  confidence: number;                 // 0..1
  fields: Record<string, string>;     // extracted values as strings (editable/coerce on ingest)
  note?: string;                      // AI note on ambiguity / unreadable areas
}

// The field keys the AI is asked to fill per document type, in the
// order the review UI should render them. The edge function sends
// this map to the model so it targets the exact keys ingest expects;
// scanIngest.ts reads the same keys back out. Keep the three in sync.
export const DOC_TYPE_FIELDS: Record<ScanDocType, string[]> = {
  collection: ['date', 'massTime', 'cash', 'checks', 'digital'],
  expense: ['date', 'description', 'amount', 'category'],
  baptism: ['childName', 'dateOfBaptism', 'fatherName', 'motherName', 'godparents', 'registryNumber'],
  unknown: [],
};

// Human-friendly label per document type (for the review UI header /
// the type picker).
export const DOC_TYPE_LABELS: Record<ScanDocType, string> = {
  collection: 'Mass Collection Sheet',
  expense: 'Expense / Receipt / Voucher',
  baptism: 'Baptismal Record',
  unknown: 'Unrecognized Document',
};
