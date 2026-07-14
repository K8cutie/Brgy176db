// ═══════════════════════════════════════════════════════════
// registryMatch — link a scanned form to its existing registry record
//
// Closed-set fuzzy record linkage: a scanned form's extracted identity is
// matched against THIS parish's existing sacramental records (already imported
// from PMS or entered by hand). The set is closed by construction — every
// getJSON read resolves churchos_parish_{id}_{key}, so one parish only.
//
// The scanned form is NOT trusted as the data source when a match is found —
// it's the matching key + the evidence. So the vision model only has to read
// enough to identify the record; the clean data stays the record's own. When
// NO record matches, the scan's fields become a new record (the create branch).
//
// Reuses importEngine's normalizers (single source of truth, no drift):
// normText/normName/normDateKey.
// ═══════════════════════════════════════════════════════════

import { getJSON, setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';
import {
  baptismRecords, marriageRecords, confirmationRecords, deathRecords,
  type RegistryRecord, type RegistryStore, type RecordAttachment,
} from './registryData';
import { normText, normDateKey, type RegistryRecordType } from './importEngine';
import type { ScannedExtraction } from './scanTypes';

// ── store wiring (key + seed + store-name per type) ─────────
const STORE: Record<RegistryRecordType, { key: string; seed: RegistryRecord[]; store: RegistryStore }> = {
  baptism: { key: KEYS.baptismRecords, seed: baptismRecords as RegistryRecord[], store: 'baptismRecords' },
  marriage: { key: KEYS.marriageRecords, seed: marriageRecords as RegistryRecord[], store: 'marriageRecords' },
  confirmation: { key: KEYS.confirmationRecords, seed: confirmationRecords as RegistryRecord[], store: 'confirmationRecords' },
  death: { key: KEYS.deathRecords, seed: deathRecords as RegistryRecord[], store: 'deathRecords' },
};

/** Load one parish's live (non-deleted) records for a registry type. */
export function loadRegistry(type: RegistryRecordType): RegistryRecord[] {
  const s = STORE[type];
  return getJSON<RegistryRecord[]>(s.key, s.seed).filter((r) => !(r as { isDeleted?: boolean }).isDeleted);
}

// ── per-type field mapping: scanned extraction ↔ record fields ──
interface TypeSpec {
  personField: string;                    // extraction field holding the subject's full name
  candName: (r: Record<string, unknown>) => unknown[];
  dateField: string;                      // extraction field for the primary date
  candDate: (r: Record<string, unknown>) => unknown;
  parents?: { ext: string; cand: (r: Record<string, unknown>) => unknown[] }[];
}

const SPEC: Record<RegistryRecordType, TypeSpec> = {
  baptism: {
    personField: 'childName',
    candName: (r) => [r.childFirstName, r.childMiddleName, r.childLastName],
    dateField: 'dateOfBaptism',
    candDate: (r) => r.dateOfBaptism,
    parents: [
      { ext: 'fatherName', cand: (r) => [r.fatherFirstName, r.fatherMiddleName, r.fatherLastName] },
      { ext: 'motherName', cand: (r) => [r.motherFirstName, r.motherMiddleName, r.motherLastName] },
    ],
  },
  marriage: {
    personField: 'groomName',
    candName: (r) => [r.groomFirstName, r.groomMiddleName, r.groomLastName],
    dateField: 'dateOfMarriage',
    candDate: (r) => r.dateOfMarriage,
  },
  confirmation: {
    personField: 'confirmandName',
    candName: (r) => [r.confirmandFirstName, r.confirmandMiddleName, r.confirmandLastName],
    dateField: 'dateOfConfirmation',
    candDate: (r) => r.dateOfConfirmation,
  },
  death: {
    personField: 'deceasedName',
    candName: (r) => [r.deceasedFirstName, r.deceasedMiddleName, r.deceasedLastName],
    dateField: 'dateOfDeath',
    candDate: (r) => r.dateOfDeath,
  },
};

// ── scoring primitives ──────────────────────────────────────
function tokenSet(...parts: unknown[]): Set<string> {
  return new Set(normText(parts.map((p) => String(p ?? '')).join(' ')).split(' ').filter(Boolean));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
function dateScore(a: unknown, b: unknown): number {
  const x = normDateKey(a), y = normDateKey(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (/^\d{4}-\d{2}/.test(x) && x.slice(0, 7) === y.slice(0, 7)) return 0.6; // same year+month
  if (/^\d{4}/.test(x) && x.slice(0, 4) === y.slice(0, 4)) return 0.3;       // same year
  return 0;
}

// ── result shapes ───────────────────────────────────────────
export interface MatchCandidate {
  record: RegistryRecord;
  score: number;                         // 0..1
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  registryHit: boolean;                  // exact registry-number match
}
export interface MatchResult {
  type: RegistryRecordType;
  store: RegistryStore;
  best: MatchCandidate | null;
  candidates: MatchCandidate[];          // ranked desc (top few)
  action: 'auto' | 'pick' | 'create';
}

/** Map a scan docType to a registry type (null = not a registry doc). */
export function registryTypeOfDoc(docType: string): RegistryRecordType | null {
  return docType === 'baptism' || docType === 'marriage'
    || docType === 'confirmation' || docType === 'death'
    ? (docType as RegistryRecordType)
    : null;
}

function scoreOne(spec: TypeSpec, ext: Record<string, string>, rec: Record<string, unknown>): MatchCandidate {
  const reasons: string[] = [];

  // Exact registry-number match = near-deterministic (guard against blanks).
  const extReg = normText(ext.registryNumber);
  const recReg = normText(rec.registryNumber);
  const registryHit = !!extReg && !!recReg && extReg === recReg;
  if (registryHit) reasons.push('registry number matches');

  // Name (primary signal).
  const nameScore = jaccard(tokenSet(ext[spec.personField]), tokenSet(...spec.candName(rec)));
  if (nameScore >= 0.5) reasons.push('name matches');

  // Primary date.
  const dScore = dateScore(ext[spec.dateField], spec.candDate(rec));
  if (dScore >= 1) reasons.push('same date');
  else if (dScore > 0) reasons.push('date close');

  // Parents (extra corroboration when present).
  let parentScore = 0, parentW = 0;
  for (const p of spec.parents ?? []) {
    const s = jaccard(tokenSet(ext[p.ext]), tokenSet(...p.cand(rec)));
    parentScore += s; parentW += 1;
    if (s >= 0.5) reasons.push('parent name matches');
  }
  const parents = parentW ? parentScore / parentW : 0;

  // Weighted blend (name-heavy). Parents only weigh in when the type has them.
  const wName = 0.55, wDate = 0.30, wPar = spec.parents ? 0.15 : 0;
  const denom = wName + wDate + wPar;
  let score = (wName * nameScore + wDate * dScore + wPar * parents) / denom;

  // Registry-number agreement is strong evidence: with some name signal it
  // clamps to a confident auto-match; on its own it still SURFACES the record
  // for the human to confirm (so a garbled-name-but-right-number form isn't
  // hidden) — but a bare number collision must never auto-attach.
  if (registryHit) score = Math.max(score, nameScore >= 0.34 ? 0.95 : 0.6);

  const confidence: MatchCandidate['confidence'] = score >= 0.85 ? 'high' : score >= 0.55 ? 'medium' : 'low';
  return { record: rec as unknown as RegistryRecord, score, confidence, reasons, registryHit };
}

/**
 * Match a scanned extraction against the parish's existing records of that type.
 * Returns null for non-registry docs (collection/expense/unknown).
 */
export function matchScannedForm(extraction: ScannedExtraction): MatchResult | null {
  const type = registryTypeOfDoc(extraction.docType);
  if (!type) return null;
  const spec = SPEC[type];
  const records = loadRegistry(type);

  const scored = records
    .map((r) => scoreOne(spec, extraction.fields ?? {}, r as unknown as Record<string, unknown>))
    .filter((c) => c.score > 0.2)
    .sort((a, b) => b.score - a.score);

  const best = scored[0] ?? null;
  const candidates = scored.slice(0, 5);

  // Pure score thresholds — the registry-number boost is already baked into the
  // score (0.95 with name agreement → auto; 0.6 on its own → pick, not auto).
  let action: MatchResult['action'] = 'create';
  if (best) {
    if (best.score >= 0.85) action = 'auto';
    else if (best.score >= 0.55) action = 'pick';
  }

  return { type, store: STORE[type].store, best, candidates, action };
}

// ── attach a scanned original to a specific record ──────────
const STORE_BY_NAME: Record<RegistryStore, { key: string; seed: RegistryRecord[] }> = {
  baptismRecords: { key: KEYS.baptismRecords, seed: baptismRecords as RegistryRecord[] },
  marriageRecords: { key: KEYS.marriageRecords, seed: marriageRecords as RegistryRecord[] },
  confirmationRecords: { key: KEYS.confirmationRecords, seed: confirmationRecords as RegistryRecord[] },
  deathRecords: { key: KEYS.deathRecords, seed: deathRecords as RegistryRecord[] },
};

/**
 * Append a scanned-form attachment to an existing record by id, in place, in
 * the correct per-parish store. Returns false if no such record is found (the
 * caller should then fall back to creating a record). Writes through the same
 * getJSON/setJSON seam the Registry page reads.
 */
export function attachToRegistryRecord(
  store: RegistryStore,
  recordId: string,
  attachment: RecordAttachment,
): boolean {
  const s = STORE_BY_NAME[store];
  const list = getJSON<RegistryRecord[]>(s.key, s.seed);
  let found = false;
  const next = list.map((r) => {
    if (r.id !== recordId) return r;
    found = true;
    const existing = (r as { attachments?: RecordAttachment[] }).attachments ?? [];
    return { ...r, attachments: [...existing, attachment] };
  });
  if (!found) return false;
  setJSON(s.key, next);
  return true;
}
