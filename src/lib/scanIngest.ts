// ═══════════════════════════════════════════════════════════
// Scan → Ingest — commit a validated ScannedExtraction into the
// SAME per-parish stores the Registry and Finance pages read/write.
//
// This does NOT invent a persistence path: it prepends the new record
// to the exact KEYS store via getJSON/setJSON (the storageNamespaced
// seam that maps to Supabase tables in cloud mode), seeding with the
// same sample data the pages use so committing before a page has ever
// persisted never replaces the book with a single row — identical to
// the pattern in lib/massIntentions.ts (recordStipendForIntention) and
// lib/donors.ts.
//
// Extracted values arrive as strings (the review UI may have edited
// them); we coerce numbers/dates and default sane values here.
// ═══════════════════════════════════════════════════════════

import { getJSON, setJSON } from './storageNamespaced';
import { KEYS } from './storageKeys';
import { getCurrentUserName } from './session';
import {
  collectionsData, journalEntries as journalSeed, getLeafAccounts,
  type Collection, type JournalEntry,
} from './financeData';
import { baptismRecords as baptismSeed, type BaptismRecord, type RegistryStore } from './registryData';
import type { ScannedExtraction } from './scanTypes';

// ── small, local helpers (dependency-light) ─────────────────

/** Local (not UTC) YYYY-MM-DD — toISOString() lands a day off on UTC+ zones. */
function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "₱12,500.50" | "12 500" | "" → number (0 when unparseable). */
function toNumber(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Accept an extracted date if it already looks ISO, else fall back to today. */
function toDate(s: string | undefined): string {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : todayISO();
}

/** Split a single full-name string into first / middle / last parts. */
function splitName(full: string | undefined): { first: string; middle: string; last: string } {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', middle: '', last: '' };
  if (parts.length === 1) return { first: parts[0], middle: '', last: '' };
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] };
  return { first: parts[0], last: parts[parts.length - 1], middle: parts.slice(1, -1).join(' ') };
}

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ── per-type commit ─────────────────────────────────────────

function commitCollection(f: Record<string, string>): { ok: boolean; message: string } {
  const cash = toNumber(f.cash);
  const checks = toNumber(f.checks);
  const digital = toNumber(f.digital);
  const total = cash + checks + digital;
  const rec: Collection = {
    id: genId('SC'),
    date: toDate(f.date),
    massTime: f.massTime?.trim() || '—',
    cash, checks, digital, total,
    postedBy: getCurrentUserName(),
    status: 'Posted',
  };
  const existing = getJSON<Collection[]>(KEYS.collections, collectionsData);
  setJSON(KEYS.collections, [rec, ...existing]);
  return { ok: true, message: `Recorded collection for ${rec.date} (${rec.massTime}) — total ₱${total.toLocaleString('en-PH')}` };
}

function commitExpense(f: Record<string, string>): { ok: boolean; message: string } {
  const amount = toNumber(f.amount);
  // Map the extracted category to a leaf EXPENSE account; default to Supplies.
  const expenseAccounts = getLeafAccounts().filter((a) => a.type === 'EXPENSE');
  const cat = (f.category || '').toLowerCase().trim();
  const match = cat
    ? expenseAccounts.find((a) => a.name.toLowerCase().includes(cat) || cat.includes(a.name.toLowerCase()))
    : undefined;
  const acct = match ?? expenseAccounts.find((a) => a.code === '5300') ?? expenseAccounts[0]
    ?? { code: '5300', name: 'Supplies' };
  const description = f.description?.trim() || 'Scanned expense';
  // An expense = a balanced journal entry: Dr expense account / Cr Cash on Hand.
  const rec: JournalEntry = {
    id: genId('JV-SCAN'),
    date: toDate(f.date),
    reference: description.slice(0, 60),
    description,
    lines: [
      { accountCode: acct.code, accountName: acct.name, debit: amount, credit: 0 },
      { accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: amount },
    ],
    status: 'Posted',
    postedBy: getCurrentUserName(),
    totalDr: amount,
    totalCr: amount,
  };
  const existing = getJSON<JournalEntry[]>(KEYS.journalEntries, journalSeed);
  setJSON(KEYS.journalEntries, [rec, ...existing]);
  return { ok: true, message: `Recorded expense "${description}" — ₱${amount.toLocaleString('en-PH')} to ${acct.name}` };
}

function commitBaptism(f: Record<string, string>): { ok: boolean; message: string; recordId: string; store: RegistryStore } {
  const child = splitName(f.childName);
  const father = splitName(f.fatherName);
  const mother = splitName(f.motherName);
  // "godparents" is one free string; split into godfather / godmother on & / and / ,.
  const gp = (f.godparents || '').split(/\s*(?:&|,|\band\b)\s*/i).filter(Boolean);
  const gf = splitName(gp[0]);
  const gm = splitName(gp[1]);
  const dateOfBaptism = toDate(f.dateOfBaptism);
  const rec: BaptismRecord = {
    id: genId('b'),
    registryNumber: f.registryNumber?.trim() || `SCAN-${Date.now()}`,
    // CHILD
    childLastName: child.last, childFirstName: child.first, childMiddleName: child.middle,
    dateOfBirth: '', placeOfBirthCity: '', placeOfBirthProvince: '', gender: 'Male',
    // FATHER
    fatherLastName: father.last, fatherFirstName: father.first, fatherMiddleName: father.middle,
    // MOTHER
    motherLastName: mother.last, motherFirstName: mother.first, motherMiddleName: mother.middle, motherMaidenName: '',
    // SPONSORS
    godfatherLastName: gf.last, godfatherFirstName: gf.first,
    godmotherLastName: gm.last, godmotherFirstName: gm.first,
    // ADDRESS
    addressStreet: '', addressBarangay: '', addressSitio: '', addressCity: '', addressProvince: '',
    // RECORD
    dateOfBaptism, timeOfBaptism: '', officiant: '', bookNumber: 0, pageNumber: 0, notations: '',
    status: 'Active',
    // SCHEDULING
    scheduledDate: dateOfBaptism, scheduledTime: '', scheduledOfficiant: '', scheduledLocation: '',
  };
  const existing = getJSON<BaptismRecord[]>(KEYS.baptismRecords, baptismSeed);
  setJSON(KEYS.baptismRecords, [rec, ...existing]);
  const name = [child.first, child.last].filter(Boolean).join(' ') || 'child';
  return { ok: true, message: `Recorded baptism of ${name} (registry ${rec.registryNumber})`, recordId: rec.id, store: 'baptismRecords' };
}

/**
 * Commit a validated extraction to the correct parish store. Switches on
 * docType; 'unknown' is rejected (the UI should make the human pick a type first).
 */
export async function commitScannedRecord(x: ScannedExtraction): Promise<{ ok: boolean; message: string; recordId?: string; store?: RegistryStore }> {
  switch (x.docType) {
    case 'collection': return commitCollection(x.fields);
    case 'expense': return commitExpense(x.fields);
    case 'baptism': return commitBaptism(x.fields);
    default: return { ok: false, message: 'Pick a document type first' };
  }
}
