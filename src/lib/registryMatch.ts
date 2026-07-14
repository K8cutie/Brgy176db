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
  score: number;                         // 0..1 (ranking + display)
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  registryHit: boolean;                  // exact registry-number match
  // sub-signals the (conservative) auto decision is built from
  nameScore: number;                     // 0..1 token-set name overlap
  dateExact: boolean;                    // primary date matches exactly
  parentsScore: number;                  // 0..1 (baptism/confirmation only)
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

  const extReg = normText(ext.registryNumber);
  const recReg = normText(rec.registryNumber);
  const registryHit = !!extReg && !!recReg && extReg === recReg;

  const nameScore = jaccard(tokenSet(ext[spec.personField]), tokenSet(...spec.candName(rec)));
  const dScore = dateScore(ext[spec.dateField], spec.candDate(rec));
  const dateExact = dScore >= 1;

  let parentSum = 0, parentW = 0;
  for (const p of spec.parents ?? []) {
    parentSum += jaccard(tokenSet(ext[p.ext]), tokenSet(...p.cand(rec)));
    parentW += 1;
  }
  const parentsScore = parentW ? parentSum / parentW : 0;

  // Weighted blend for RANKING/display. Registry agreement is a modest BONUS
  // (not a clamp) — it lifts a corroborated match up the list without faking a
  // 95% score on a bare, possibly OCR-misread, non-unique number.
  const wName = 0.55, wDate = 0.30, wPar = spec.parents ? 0.15 : 0;
  const denom = wName + wDate + wPar;
  let score = (wName * nameScore + wDate * dScore + wPar * parentsScore) / denom;
  if (registryHit) score = Math.min(1, score + 0.2);

  // Honest reasons — don't claim "name matches" on a half overlap.
  if (registryHit) reasons.push('registry number matches');
  if (nameScore >= 0.7) reasons.push('name matches');
  else if (nameScore >= 0.4) reasons.push('name partly matches');
  if (dateExact) reasons.push('same date');
  else if (dScore > 0) reasons.push('date close');
  if (parentsScore >= 0.5) reasons.push('parent name matches');

  const confidence: MatchCandidate['confidence'] = score >= 0.85 ? 'high' : score >= 0.55 ? 'medium' : 'low';
  return { record: rec as unknown as RegistryRecord, score, confidence, reasons, registryHit, nameScore, dateExact, parentsScore };
}

/**
 * Match a scanned extraction against the parish's existing records of that type.
 * Returns null for non-registry docs (collection/expense/unknown).
 *
 * `auto` is deliberately CONSERVATIVE. Name matching is an order-free token set
 * (so "Santos Maria Clara" and "Maria Clara Santos" look identical) and the
 * registry number is an OCR'd, non-unique string — so neither is trusted on its
 * own. A one-click attach is pre-selected ONLY when a strong name + exact date
 * are corroborated by an INDEPENDENT signal (matching parents, or an
 * unambiguous registry number) AND no near-tie runner-up exists (same-day
 * batch-baptism cohorts stay 'pick'). Everything else falls to 'pick' so a
 * human chooses — a confidently-wrong default is worse than one extra click.
 */
export function matchScannedForm(extraction: ScannedExtraction): MatchResult | null {
  const type = registryTypeOfDoc(extraction.docType);
  if (!type) return null;
  const spec = SPEC[type];
  const fields = extraction.fields ?? {};
  const records = loadRegistry(type);

  const scored = records
    .map((r) => scoreOne(spec, fields, r as unknown as Record<string, unknown>))
    .filter((c) => c.score >= 0.15) // surface weak candidates for manual pick, don't hide them
    .sort((a, b) => b.score - a.score);

  const best = scored[0] ?? null;
  const second = scored[1] ?? null;
  const candidates = scored.slice(0, 5);

  // How many LIVE records carry the exact registry number the form claims. A
  // repeated (or OCR-collided) number is ambiguous → never a corroborator.
  const extReg = normText(fields.registryNumber);
  const regCount = extReg
    ? records.filter((r) => normText((r as { registryNumber?: string }).registryNumber) === extReg).length
    : 0;

  let action: MatchResult['action'] = 'create';
  if (best) {
    const strongName = best.nameScore >= 0.85;
    const corroborated = (best.registryHit && regCount <= 1) || best.parentsScore >= 0.5;
    const noTie = !second || best.score - second.score >= 0.12;
    if (strongName && best.dateExact && corroborated && noTie) action = 'auto';
    else if (best.score >= 0.45) action = 'pick';
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
    // Skip a soft-deleted record — never file a scan onto a tombstone (the
    // matcher never offers deleted records; this closes the TOCTOU window where
    // the record is deleted between match and confirm).
    if (r.id !== recordId || (r as { isDeleted?: boolean }).isDeleted) return r;
    found = true;
    const existing = (r as { attachments?: RecordAttachment[] }).attachments ?? [];
    return { ...r, attachments: [...existing, attachment] };
  });
  if (!found) return false;
  setJSON(s.key, next);
  return true;
}

/**
 * Merge the attachments the record editor is about to save with whatever is
 * CURRENTLY in the store, so a scan attached out-of-band (from the Scan page, in
 * another session) since the editor opened is not clobbered by the editor's
 * stale snapshot. Honors removals the editor made (a seeded id no longer kept).
 * Returns undefined when empty (matches the record literal's `: undefined`).
 */
export function resolveAttachmentsForSave(
  store: RegistryStore,
  recordId: string,
  seededIds: string[],
  keptInModal: RecordAttachment[],
): RecordAttachment[] | undefined {
  const s = STORE_BY_NAME[store];
  const fresh = getJSON<RegistryRecord[]>(s.key, s.seed).find((r) => r.id === recordId);
  const freshAtt = (fresh as { attachments?: RecordAttachment[] } | undefined)?.attachments ?? [];
  const removed = new Set(seededIds.filter((id) => !keptInModal.some((a) => a.id === id)));
  const byId = new Map<string, RecordAttachment>();
  for (const a of freshAtt) if (!removed.has(a.id)) byId.set(a.id, a);
  for (const a of keptInModal) if (!removed.has(a.id)) byId.set(a.id, a);
  const merged = [...byId.values()];
  return merged.length ? merged : undefined;
}
