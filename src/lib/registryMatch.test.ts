import { describe, it, expect, beforeEach } from 'vitest';
import { ns } from './storageNamespaced';
import { KEYS } from './storageKeys';
import { matchScannedForm, attachToRegistryRecord, loadRegistry } from './registryMatch';
import type { ScannedExtraction } from './scanTypes';
import type { RecordAttachment } from './registryData';

// jsdom localStorage backend; seed the closed match set through the namespaced
// seam exactly as the app reads it (getJSON auto-seeds sample data when a store
// is ABSENT, so we must seed explicitly to control the set).
function seed(key: string, value: unknown) {
  localStorage.setItem(ns(key), JSON.stringify(value));
}

const BAPTISMS = [
  {
    id: 'b1', registryNumber: 'BAP-1/1/1',
    childFirstName: 'Juan', childMiddleName: 'Pablo', childLastName: 'Dela Cruz',
    dateOfBaptism: '2020-02-15',
    fatherFirstName: 'Pedro', fatherLastName: 'Dela Cruz',
    motherFirstName: 'Maria', motherLastName: 'Santos',
    status: 'Active',
  },
  {
    id: 'b2', registryNumber: 'BAP-2/5/3',
    childFirstName: 'Ana', childLastName: 'Reyes',
    dateOfBaptism: '2019-06-20',
    fatherFirstName: 'Jose', fatherLastName: 'Reyes',
    motherFirstName: 'Elena', motherLastName: 'Cruz',
    status: 'Active',
  },
  {
    id: 'b3-deleted', registryNumber: 'BAP-9/9/9',
    childFirstName: 'Miguel', childLastName: 'Torres',
    dateOfBaptism: '2018-01-10',
    fatherFirstName: 'Fernando', fatherLastName: 'Torres',
    status: 'Active', isDeleted: true,
  },
];

function ex(fields: Record<string, string>): ScannedExtraction {
  return { docType: 'baptism', confidence: 1, fields };
}

beforeEach(() => {
  localStorage.clear();
  seed(KEYS.baptismRecords, BAPTISMS);
  seed(KEYS.marriageRecords, []);
  seed(KEYS.confirmationRecords, []);
  seed(KEYS.deathRecords, []);
});

describe('registry matcher', () => {
  it('non-registry docs return null', () => {
    expect(matchScannedForm({ docType: 'collection', confidence: 1, fields: {} })).toBeNull();
  });

  it('auto-matches a confident name+date+parents hit', () => {
    const m = matchScannedForm(ex({
      childName: 'Juan Pablo Dela Cruz', dateOfBaptism: '2020-02-15',
      fatherName: 'Pedro Dela Cruz', motherName: 'Maria Santos',
    }))!;
    expect(m.action).toBe('auto');
    expect(m.best?.record.id).toBe('b1');
    expect(m.store).toBe('baptismRecords');
  });

  it('registry-number agreement clamps to a confident auto-match even with partial name', () => {
    const m = matchScannedForm(ex({
      childName: 'Juan Dela Cruz', registryNumber: 'BAP-1/1/1', dateOfBaptism: '',
    }))!;
    expect(m.best?.registryHit).toBe(true);
    expect(m.best?.record.id).toBe('b1');
    expect(m.action).toBe('auto');
  });

  it('an ambiguous partial lands in the pick range (human chooses)', () => {
    const m = matchScannedForm(ex({
      childName: 'Juan Pablo Dela', dateOfBaptism: '2020-02-14', // 1 day off → same month
    }))!;
    expect(m.action).toBe('pick');
    expect(m.best?.record.id).toBe('b1');
  });

  it('a name with no plausible record routes to create', () => {
    const m = matchScannedForm(ex({
      childName: 'Zaldy Bumatay', dateOfBaptism: '1999-09-09',
    }))!;
    expect(m.action).toBe('create');
    expect(m.best).toBeNull();
  });

  it('never matches a soft-deleted record', () => {
    const m = matchScannedForm(ex({
      childName: 'Miguel Torres', dateOfBaptism: '2018-01-10',
      fatherName: 'Fernando Torres',
    }))!;
    // b3 is deleted → it must not appear as a candidate at all.
    expect(m.candidates.every((c) => c.record.id !== 'b3-deleted')).toBe(true);
  });

  it('a bare registry-number collision surfaces for review but never auto-attaches', () => {
    // Same registry string, totally different person → registryHit but no name
    // signal: it should surface (in case the name was misread) as a 'pick', not
    // silently auto-attach.
    const m = matchScannedForm(ex({
      childName: 'Someone Else Entirely', registryNumber: 'BAP-1/1/1',
    }))!;
    expect(m.action).not.toBe('auto');
    expect(m.best?.registryHit).toBe(true);
    expect(m.best?.score ?? 0).toBeLessThan(0.9);
  });
});

describe('attachToRegistryRecord', () => {
  const att: RecordAttachment = {
    id: 'att1', storagePath: 'parish/b1/x.jpg', provenance: 'scan-read',
    uploadedAt: '2026-07-14T00:00:00Z', uploadedBy: 'Test Clerk',
  };

  it('appends an attachment to the target record', () => {
    expect(attachToRegistryRecord('baptismRecords', 'b1', att)).toBe(true);
    const rec = loadRegistry('baptism').find((r) => r.id === 'b1')!;
    expect(rec.attachments?.[0]?.storagePath).toBe('parish/b1/x.jpg');
  });

  it('returns false when the record does not exist', () => {
    expect(attachToRegistryRecord('baptismRecords', 'nope', att)).toBe(false);
  });
});
