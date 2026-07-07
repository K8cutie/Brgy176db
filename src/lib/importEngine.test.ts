import { describe, it, expect, beforeEach } from 'vitest';
import {
  convertDate,
  validateImportRow,
  mapImportRow,
  detectDuplicates,
  parseCSV,
  parseXLSX,
  normalizeSheetMatrix,
  buildImportedRecord,
  missingRequiredFields,
  type ImportMapping,
} from './importEngine';
import { getJSON } from './storageNamespaced';
import type { AuditLogEntry } from './settingsData';
import type { BaptismRecord, MarriageRecord } from './registryData';
import type { Family } from './directoryData';
import type { JournalEntry } from './financeData';

// ── Date conversion helpers ──

describe('convertDate', () => {
  it('converts DD/MM/YYYY to ISO', () => {
    expect(convertDate('15/03/2015')).toBe('2015-03-15');
  });

  it('pads single-digit day and month', () => {
    expect(convertDate('5/3/2015')).toBe('2015-03-05');
  });

  it('passes ISO dates through unchanged', () => {
    expect(convertDate('2015-03-15')).toBe('2015-03-15');
  });

  it('converts dash-separated dates as MM-DD-YYYY', () => {
    expect(convertDate('03-15-2015')).toBe('2015-03-15');
  });

  it('returns null for two-digit years and garbage', () => {
    expect(convertDate('15/03/99')).toBeNull();
    expect(convertDate('2015/03/15')).toBeNull();
    expect(convertDate('March 5 2015')).toBeNull();
    expect(convertDate('')).toBeNull();
  });
});

describe('validateImportRow date handling', () => {
  const dateMapping: ImportMapping[] = [
    { sourceField: 'DATEBAPT', targetField: 'dateOfBaptism', targetModule: 'registry', transform: 'date_fix' },
  ];

  it('warns on two-digit years', () => {
    const { errors, warnings } = validateImportRow({ DATEBAPT: '15/03/99' }, dateMapping);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('Two-digit year');
  });

  it('errors on unparseable dates', () => {
    const { errors } = validateImportRow({ DATEBAPT: 'March 5 2015' }, dateMapping);
    expect(errors.some(e => e.code === 'invalid_date')).toBe(true);
  });

  it('errors when a required field is empty', () => {
    const { errors } = validateImportRow({ DATEBAPT: '' }, dateMapping);
    expect(errors.some(e => e.code === 'required')).toBe(true);
  });
});

// ── Row mapping ──

describe('mapImportRow', () => {
  it('applies mappings and converts date_fix values to ISO', () => {
    const mappings: ImportMapping[] = [
      { sourceField: 'DATEBAPT', targetField: 'dateOfBaptism', targetModule: 'registry', transform: 'date_fix' },
      { sourceField: 'CHILDNAME', targetField: 'childFirstName', targetModule: 'registry', transform: 'none' },
    ];
    const mapped = mapImportRow({ DATEBAPT: '25/05/2015', CHILDNAME: ' MARIA CLARA ' }, mappings);
    expect(mapped).toEqual({ dateOfBaptism: '2015-05-25', childFirstName: 'MARIA CLARA' });
  });

  it('keeps the raw value when a date cannot be converted, and maps missing fields to empty string', () => {
    const mappings: ImportMapping[] = [
      { sourceField: 'DATEBAPT', targetField: 'dateOfBaptism', targetModule: 'registry', transform: 'date_fix' },
      { sourceField: 'BOOKNO', targetField: 'bookNumber', targetModule: 'registry' },
    ];
    const mapped = mapImportRow({ DATEBAPT: '15/03/99' }, mappings);
    expect(mapped.dateOfBaptism).toBe('15/03/99');
    expect(mapped.bookNumber).toBe('');
  });
});

// ── Duplicate detection ──

describe('detectDuplicates — registry', () => {
  const existingBaptism = {
    registryNumber: 'B-2015-0042',
    childFirstName: 'Maria Clara',
    childLastName: 'Santos',
    dateOfBaptism: '2015-05-25',
  };

  it('flags a row matching an existing record, case/whitespace-insensitive and split-name-agnostic', () => {
    const rows = [
      // Unsplit PIMS-style full name, DD/MM/YYYY date, noisy casing/spacing.
      { childFirstName: '  maria   CLARA  santos ', dateOfBaptism: '25/05/2015' },
    ];
    const dups = detectDuplicates(rows, [existingBaptism], 'registry');
    expect(dups).toHaveLength(1);
    expect(dups[0].rowIndex).toBe(0);
    expect(dups[0].kind).toBe('existing');
    expect(dups[0].reason).toBe('matches existing baptism #B-2015-0042');
  });

  it('does NOT flag a near-miss with a different date', () => {
    const rows = [
      { childFirstName: 'Maria Clara', childLastName: 'Santos', dateOfBaptism: '2016-05-25' },
    ];
    expect(detectDuplicates(rows, [existingBaptism], 'registry')).toHaveLength(0);
  });

  it('flags duplicates within the same file (first occurrence not flagged)', () => {
    const row = { childFirstName: 'Ana', childLastName: 'Reyes', dateOfBaptism: '2020-01-01' };
    const dups = detectDuplicates([row, { ...row }], [], 'registry');
    expect(dups).toHaveLength(1);
    expect(dups[0].rowIndex).toBe(1);
    expect(dups[0].kind).toBe('in_file');
    expect(dups[0].reason).toBe('duplicate of row 1 in this file');
  });

  it('does not collide records of different sacrament types', () => {
    const rows = [
      { groomFirstName: 'Maria Clara', groomLastName: 'Santos', dateOfMarriage: '2015-05-25' },
    ];
    expect(detectDuplicates(rows, [existingBaptism], 'registry')).toHaveLength(0);
  });

  it('does not flag rows missing key components', () => {
    const rows = [
      { childFirstName: 'Maria Clara', childLastName: 'Santos' }, // no date
      { dateOfBaptism: '2015-05-25' },                             // no name
    ];
    expect(detectDuplicates(rows, [existingBaptism], 'registry')).toHaveLength(0);
  });
});

describe('detectDuplicates — directory', () => {
  const existingFamily = { familyName: 'Dela Cruz', barangay: 'San Roque' };

  it('flags a matching familyName + barangay', () => {
    const rows = [{ familyName: 'DELA  CRUZ', addressBarangay: 'san roque' }];
    const dups = detectDuplicates(rows, [existingFamily], 'directory');
    expect(dups).toHaveLength(1);
    expect(dups[0].reason).toContain('Dela Cruz');
  });

  it('does not flag the same family name in a different barangay', () => {
    const rows = [{ familyName: 'Dela Cruz', addressBarangay: 'Dau' }];
    expect(detectDuplicates(rows, [existingFamily], 'directory')).toHaveLength(0);
  });
});

describe('detectDuplicates — finance', () => {
  const existingEntry = {
    date: '2024-01-07',
    description: 'Sunday Collection',
    reference: 'JE-100',
    totalDr: 45680,
  };

  it('flags a matching date + description + amount (comma-formatted amount)', () => {
    const rows = [{ date: '07/01/2024', description: '  SUNDAY   collection ', amount: '45,680.00' }];
    const dups = detectDuplicates(rows, [existingEntry], 'finance');
    expect(dups).toHaveLength(1);
    expect(dups[0].reason).toBe('matches existing journal entry JE-100 on 2024-01-07');
  });

  it('does NOT flag when the amount differs', () => {
    const rows = [{ date: '07/01/2024', description: 'Sunday Collection', amount: '45,681.00' }];
    expect(detectDuplicates(rows, [existingEntry], 'finance')).toHaveLength(0);
  });

  it('does NOT flag when the description is missing (incomplete key)', () => {
    const rows = [{ date: '07/01/2024', amount: '45,680.00' }];
    expect(detectDuplicates(rows, [existingEntry], 'finance')).toHaveLength(0);
  });
});

// ── Building real records (the import's final write step) ──

describe('buildImportedRecord — registry', () => {
  it('builds a BaptismRecord with split names, ISO dates and numeric book/page', () => {
    const built = buildImportedRecord({
      registryNumber: 'B-2015-0042',
      childFirstName: 'MARIA CLARA SANTOS', // unsplit PIMS full name
      gender: 'F',
      dateOfBirth: '2015-03-15',
      dateOfBaptism: '25/05/2015', // un-converted date must still land as ISO
      fatherFirstName: 'JUAN DELA CRUZ SANTOS',
      motherFirstName: 'ELENA REYES SANTOS',
      godfatherFirstName: 'PEDRO LIM',
      godmotherFirstName: 'ANA BAUTISTA',
      bookNumber: '2',
      pageNumber: '156',
      officiant: 'FR. ANTONIO REYES',
      notations: '',
    }, 'registry', 'Admin');
    expect(built?.store).toBe('baptismRecords');
    const rec = built!.record as BaptismRecord;
    expect(rec.childFirstName).toBe('MARIA');
    expect(rec.childMiddleName).toBe('CLARA');
    expect(rec.childLastName).toBe('SANTOS');
    expect(rec.gender).toBe('Female');
    expect(rec.dateOfBaptism).toBe('2015-05-25');
    expect(rec.bookNumber).toBe(2);
    expect(rec.pageNumber).toBe(156);
    expect(rec.registryNumber).toBe('B-2015-0042');
    expect(rec.status).toBe('Active');
  });

  it('builds a MarriageRecord from groom/bride mappings', () => {
    const built = buildImportedRecord({
      registryNumber: 'M-2018-0012',
      groomFirstName: 'CARLOS MENDOZA BAUTISTA',
      brideFirstName: 'ANA MARIE REYES LIM',
      dateOfMarriage: '15/06/2018',
      witness1Name: 'PEDRO SANTOS',
      bookNumber: '1',
      pageNumber: '45',
      officiant: 'FR. ANTONIO REYES',
    }, 'registry', 'Admin');
    expect(built?.store).toBe('marriageRecords');
    const rec = built!.record as MarriageRecord;
    expect(rec.groomFirstName).toBe('CARLOS');
    expect(rec.groomLastName).toBe('BAUTISTA');
    expect(rec.brideLastName).toBe('LIM');
    expect(rec.dateOfMarriage).toBe('2018-06-15');
    expect(rec.witness1Name).toBe('PEDRO SANTOS');
  });

  it('returns null when the mapped row identifies no registry record type', () => {
    expect(buildImportedRecord({ notations: 'x' }, 'registry', 'Admin')).toBeNull();
  });
});

describe('buildImportedRecord — directory', () => {
  it('builds a Family with address fields', () => {
    const built = buildImportedRecord({
      familyName: 'Dela Cruz',
      headFirstName: 'Juan Dela Cruz',
      addressBarangay: 'San Roque',
      contactNumber: '0917 123 4567',
    }, 'directory', 'Admin');
    expect(built?.store).toBe('families');
    const rec = built!.record as Family;
    expect(rec.familyName).toBe('Dela Cruz');
    expect(rec.barangay).toBe('San Roque');
    expect(rec.primaryPhone).toBe('0917 123 4567');
    expect(rec.status).toBe('Active');
  });
});

describe('buildImportedRecord — finance', () => {
  it('books a credit row as a balanced Dr Cash / Cr income entry', () => {
    const built = buildImportedRecord({
      date: '07/01/2024',
      description: 'Sunday collection 8AM',
      accountName: 'Sunday Collections',
      debit: '',
      credit: '45,680.00',
    }, 'finance', 'Admin');
    expect(built?.store).toBe('journalEntries');
    const rec = built!.record as JournalEntry;
    expect(rec.date).toBe('2024-01-07');
    expect(rec.status).toBe('Posted');
    expect(rec.totalDr).toBe(45680);
    expect(rec.totalCr).toBe(45680);
    expect(rec.lines).toEqual([
      { accountCode: '1000', accountName: 'Cash on Hand', debit: 45680, credit: 0 },
      { accountCode: '4000', accountName: 'Sunday Collections', debit: 0, credit: 45680 },
    ]);
  });

  it('books a debit row against the matched expense account with Cash as offset', () => {
    const built = buildImportedRecord({
      date: '2024-02-01',
      description: 'Meralco bill',
      accountName: 'Utilities',
      debit: '12,400.00',
      credit: '',
    }, 'finance', 'Admin');
    const rec = built!.record as JournalEntry;
    expect(rec.lines[0]).toEqual({ accountCode: '5100', accountName: 'Utilities', debit: 12400, credit: 0 });
    expect(rec.lines[1]).toEqual({ accountCode: '1000', accountName: 'Cash on Hand', debit: 0, credit: 12400 });
  });

  it('keeps unmatched account names under a derived code instead of dropping them', () => {
    const built = buildImportedRecord({
      date: '2024-02-01',
      description: 'Special fund',
      accountName: 'Youth Camp Fund',
      credit: '500.00',
    }, 'finance', 'Admin');
    const rec = built!.record as JournalEntry;
    const incomeLine = rec.lines.find((l) => l.credit > 0)!;
    expect(incomeLine.accountCode).toBe('4990');
    expect(incomeLine.accountName).toBe('Youth Camp Fund');
  });

  it('returns null for a zero-amount row', () => {
    expect(buildImportedRecord({ date: '2024-02-01', description: 'x', debit: '', credit: '' }, 'finance', 'Admin')).toBeNull();
  });
});

// ── Large-historical-entry review trail (import bypasses the finance approval
//    gate because imported rows are already-happened facts, but a large one is
//    flagged in the audit log for the finance council — same ≥₱100k threshold
//    as donors / mass-intention direct-post receipts). ──
describe('buildImportedRecord — large historical finance row flags the audit log', () => {
  const readAudit = () => getJSON<AuditLogEntry[]>('audit_log', []);

  beforeEach(() => {
    localStorage.clear();
  });

  it('appends a Flagged audit entry for a ≥₱100k imported row (kept Posted)', () => {
    const built = buildImportedRecord({
      date: '2020-06-15',
      description: 'Legacy building fund deposit',
      accountName: 'Building Fund',
      reference: 'OR-2020-5001',
      credit: '5,000,000.00',
    }, 'finance', 'Admin');

    // The entry itself is still Posted — imported books must not become Pending.
    expect((built!.record as JournalEntry).status).toBe('Posted');

    const log = readAudit();
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('Flagged');
    expect(log[0].table).toBe('Finance');
    expect(log[0].recordId).toBe(built!.record.id);
    expect(log[0].details).toContain('Large historical entry imported');
    expect(log[0].details).toContain('OR-2020-5001');
    // Peso figure of the imported amount appears in the detail.
    expect(log[0].details).toContain('5,000,000');
  });

  it('flags exactly at the ₱100,000 threshold', () => {
    buildImportedRecord({
      date: '2020-06-15', description: 'Big deposit', accountName: 'General Fund', credit: '100,000.00',
    }, 'finance', 'Admin');
    const log = readAudit();
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('Flagged');
  });

  it('does NOT flag a ₱99,999 imported row (below threshold)', () => {
    const built = buildImportedRecord({
      date: '2020-06-15', description: 'Ordinary collection', accountName: 'Sunday Collections', credit: '99,999.00',
    }, 'finance', 'Admin');
    expect((built!.record as JournalEntry).status).toBe('Posted');
    expect(readAudit()).toHaveLength(0);
  });

  it('does not flag imported registry/directory records (finance-only gate)', () => {
    buildImportedRecord({
      registryNumber: 'B-2015-0042', childFirstName: 'Maria Clara Santos',
      dateOfBirth: '2015-03-15', dateOfBaptism: '2015-05-25',
      fatherFirstName: 'Juan Santos', motherFirstName: 'Elena Santos',
      officiant: 'Fr. Reyes', bookNumber: '2', pageNumber: '156',
    }, 'registry', 'Admin');
    expect(readAudit()).toHaveLength(0);
  });
});

describe('missingRequiredFields', () => {
  it('does not block a marriage file for lacking baptism-only fields', () => {
    const mappings: ImportMapping[] = [
      { sourceField: 'REGNO', targetField: 'registryNumber', targetModule: 'registry' },
      { sourceField: 'GROOMNAME', targetField: 'groomFirstName', targetModule: 'registry' },
      { sourceField: 'BRIDENAME', targetField: 'brideFirstName', targetModule: 'registry' },
      { sourceField: 'DATEMARR', targetField: 'dateOfMarriage', targetModule: 'registry' },
      { sourceField: 'BOOKNO', targetField: 'bookNumber', targetModule: 'registry' },
      { sourceField: 'PAGENO', targetField: 'pageNumber', targetModule: 'registry' },
      { sourceField: 'OFFICIANT', targetField: 'officiant', targetModule: 'registry' },
    ];
    expect(missingRequiredFields(mappings, 'registry')).toEqual([]);
  });

  it('flags genuinely missing marriage fields', () => {
    const mappings: ImportMapping[] = [
      { sourceField: 'GROOMNAME', targetField: 'groomFirstName', targetModule: 'registry' },
    ];
    const missing = missingRequiredFields(mappings, 'registry').map((f) => f.key);
    expect(missing).toContain('brideFirstName');
    expect(missing).toContain('dateOfMarriage');
    expect(missing).not.toContain('childFirstName');
  });

  it('does not require LastName fields when the full-name FirstName field is mapped (baptism)', () => {
    const mappings: ImportMapping[] = [
      { sourceField: 'REGNO', targetField: 'registryNumber', targetModule: 'registry' },
      { sourceField: 'CHILDNAME', targetField: 'childFirstName', targetModule: 'registry' },
      { sourceField: 'BIRTHDATE', targetField: 'dateOfBirth', targetModule: 'registry' },
      { sourceField: 'DATEBAPT', targetField: 'dateOfBaptism', targetModule: 'registry' },
      { sourceField: 'FATHER', targetField: 'fatherFirstName', targetModule: 'registry' },
      { sourceField: 'MOTHER', targetField: 'motherFirstName', targetModule: 'registry' },
      { sourceField: 'OFFICIANT', targetField: 'officiant', targetModule: 'registry' },
      { sourceField: 'BOOKNO', targetField: 'bookNumber', targetModule: 'registry' },
      { sourceField: 'PAGENO', targetField: 'pageNumber', targetModule: 'registry' },
    ];
    expect(missingRequiredFields(mappings, 'registry')).toEqual([]);
  });

  it('flags unmapped required finance fields', () => {
    const mappings: ImportMapping[] = [
      { sourceField: 'DATE', targetField: 'date', targetModule: 'finance' },
    ];
    const missing = missingRequiredFields(mappings, 'finance').map((f) => f.key);
    expect(missing).toEqual(['description', 'accountName', 'debit', 'credit']);
  });
});

// ── Parsing (CSV / XLSX share normalizeSheetMatrix) ──

describe('parseCSV', () => {
  it('parses headers from row 1 and handles quotes, embedded commas and CRLF', () => {
    const text = 'NAME,REMARKS\r\n"Smith, John",OK\nJane,"say ""hi"""\n\n';
    const parsed = parseCSV(text);
    expect(parsed.columns.map(c => c.name)).toEqual(['NAME', 'REMARKS']);
    expect(parsed.rows).toEqual([
      { NAME: 'Smith, John', REMARKS: 'OK' },
      { NAME: 'Jane', REMARKS: 'say "hi"' },
    ]);
  });

  it('exposes the first non-empty value as the column sample', () => {
    const parsed = parseCSV('A,B\n,x\n1,y\n');
    expect(parsed.columns).toEqual([
      { name: 'A', sample: '1' },
      { name: 'B', sample: 'x' },
    ]);
  });
});

describe('normalizeSheetMatrix', () => {
  it('trims headers/cells, drops blank-header columns and empty rows', () => {
    const parsed = normalizeSheetMatrix([
      [' NAME ', '', 'AGE'],
      [' Maria ', 'ignored', ' 7 '],
      ['', '', ''],
    ]);
    expect(parsed.columns.map(c => c.name)).toEqual(['NAME', 'AGE']);
    expect(parsed.rows).toEqual([{ NAME: 'Maria', AGE: '7' }]);
  });
});

describe('parseXLSX', () => {
  it('parses the first sheet through the same normalization path as CSV', async () => {
    const XLSX = await import('xlsx');
    const sheet = XLSX.utils.aoa_to_sheet([
      ['CHILDNAME', 'DATEBAPT'],
      ['Maria Clara Santos', '25/05/2015'],
      ['Jose Miguel Reyes', '16/08/2015'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Baptisms');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    const parsed = await parseXLSX(buffer);
    expect(parsed.columns.map(c => c.name)).toEqual(['CHILDNAME', 'DATEBAPT']);
    expect(parsed.rows).toEqual([
      { CHILDNAME: 'Maria Clara Santos', DATEBAPT: '25/05/2015' },
      { CHILDNAME: 'Jose Miguel Reyes', DATEBAPT: '16/08/2015' },
    ]);
  });
});
