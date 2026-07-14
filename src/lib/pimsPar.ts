// ═══════════════════════════════════════════════════════════
// PIMS .PAR / .DBF native-backup reader
//
// A PIMS daily backup (MON.PAR … SUN.PAR) is a custom archive of
// Visual FoxPro tables: a sequence of `DG2` + ASCII-size + zlib blocks,
// each inflating to one file (a .DBF table, its .FPT memo sibling, or a
// .CDX index we ignore). Cracked + verified byte-for-byte against a real
// parish backup — see docs/pims-par-format.md.
//
// This module turns that native format into the exact `SampleLegacyFile`
// shape the existing Import Wizard already consumes (importEngine.ts):
// PIMS columns are renamed to the vocabulary REGISTRY_FIELD_MAP speaks,
// YYYYMMDD dates become ISO, and the packed SPONSORS memo is exploded
// into godparents / witnesses. So the whole proven map → preview →
// dedup → import pipeline runs unchanged — the parish drops in the raw
// backup instead of first prying a CSV out of the locked relic.
//
// Everything here uses web-standard APIs (DecompressionStream / Blob /
// Response / TextDecoder / DataView) so it runs in the browser and
// Electron with no extra dependency.
// ═══════════════════════════════════════════════════════════

import type { SampleLegacyFile, ImportTarget } from './importEngine';

const td = new TextDecoder('windows-1252'); // PIMS text is CP1252/ASCII

function str(b: Uint8Array, start: number, len: number): string {
  return td.decode(b.subarray(start, start + len));
}

// ── zlib inflate via the platform (no pako dependency) ──────
async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate'); // zlib-wrapped (0x78 header)
  // Copy into a fresh ArrayBuffer-backed array so the Blob input is a concrete
  // BlobPart (a subarray view is typed Uint8Array<ArrayBufferLike>).
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── Container: walk the DG2 blocks ──────────────────────────
export interface PimsFile {
  name: string;       // 8.3 name with the "-ftns-" source tag stripped
  timestamp: string;  // "YYYYMMDDHH:MM:SS" file mtime
  bytes: Uint8Array;  // the raw inner file (DBF / FPT / CDX)
}

export async function parsePar(buf: ArrayBuffer): Promise<PimsFile[]> {
  const b = new Uint8Array(buf);
  const files: PimsFile[] = [];
  let pos = 0;
  let first = true;
  while (pos + 9 <= b.length) {
    if (str(b, pos, 3) !== 'DG2') break;
    const compsize = parseInt(str(b, pos + 3, 6).trim(), 10);
    if (!compsize || pos + 9 + compsize > b.length) break;
    let dec: Uint8Array;
    try {
      dec = await inflate(b.subarray(pos + 9, pos + 9 + compsize));
    } catch {
      break;
    }
    pos += 9 + compsize;
    let ip = first ? 20 : 0; // 20-byte global header sits before the first entry
    first = false;
    const name = str(dec, ip, 56).trim().replace(/^-ftns-/, ''); ip += 56;
    const timestamp = str(dec, ip, 16); ip += 16;
    const fsize = parseInt(str(dec, ip, 12).trim(), 10); ip += 12;
    files.push({ name, timestamp, bytes: dec.subarray(ip, ip + fsize) });
  }
  return files;
}

// ── DBF table (+ FPT memo resolution) ───────────────────────
export interface DbfField { name: string; type: string; len: number; }
export interface DbfTable { fields: DbfField[]; rows: Record<string, string>[]; recCount: number; }

function readMemo(fpt: Uint8Array | undefined, blockNo: number): string {
  if (!fpt || blockNo <= 0) return '';
  const dv = new DataView(fpt.buffer, fpt.byteOffset, fpt.byteLength);
  const blockSize = dv.getUint16(6, false) || 64; // header bytes 6-7, big-endian
  const at = blockNo * blockSize;
  if (at + 8 > fpt.length) return '';
  const len = dv.getUint32(at + 4, false); // 4-byte type + 4-byte length, big-endian
  const end = Math.min(at + 8 + len, fpt.length);
  return td.decode(fpt.subarray(at + 8, end));
}

export function parseDbf(dbf: Uint8Array, fpt?: Uint8Array): DbfTable {
  const dv = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength);
  const recCount = dv.getUint32(4, true);
  const headerSize = dv.getUint16(8, true);
  const recSize = dv.getUint16(10, true);
  const fields: DbfField[] = [];
  let o = 32;
  while (dbf[o] !== 0x0d && o + 32 <= headerSize) {
    fields.push({
      name: str(dbf, o, 11).replace(/\0.*$/, '').trim(),
      type: String.fromCharCode(dbf[o + 11]),
      len: dbf[o + 16],
    });
    o += 32;
  }
  const rows: Record<string, string>[] = [];
  for (let r = 0; r < recCount; r++) {
    const start = headerSize + r * recSize;
    if (start + recSize > dbf.length) break;
    if (dbf[start] === 0x2a) continue; // soft-deleted (byte 0 = '*')
    let off = start + 1;
    const row: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === 'M') {
        const blk = new DataView(dbf.buffer, dbf.byteOffset + off, 4).getUint32(0, true);
        row[f.name] = readMemo(fpt, blk);
      } else {
        row[f.name] = str(dbf, off, f.len).trim();
      }
      off += f.len;
    }
    rows.push(row);
  }
  return { fields, rows, recCount };
}

// ── PIMS value helpers ──────────────────────────────────────

/** PIMS "YYYYMMDD" → ISO "YYYY-MM-DD"; blank/placeholder → "". */
function pimsDate(s?: string): string {
  const t = (s || '').trim();
  return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : '';
}

/** PIMS stores the register subject as "SURNAME, FIRST MIDDLE" — reorder to
 *  natural "FIRST MIDDLE SURNAME" so the engine's name splitter gets it right.
 *  Parent/witness fields are already natural order and pass through untouched. */
function reorderName(pimsName?: string): string {
  const t = (pimsName || '').trim();
  const ci = t.indexOf(',');
  if (ci < 0) return t;
  return `${t.slice(ci + 1).trim()} ${t.slice(0, ci).trim()}`.trim();
}

/** SPONSORS-style memo → the name column of each packed row (tab cols, CRLF rows). */
function packedNames(memo?: string): string[] {
  return (memo || '')
    .split(/\r\n|\r|\n/)
    .map((line) => line.split('\t')[0].trim())
    .filter(Boolean);
}

/** Register-scoped natural key from the canonical book/page/line citation. */
function regNo(prefix: string, r: Record<string, string>): string {
  const parts = [r.BOOKNO, r.PAGENO, r.LINENO].map((v) => (v || '').trim()).filter(Boolean);
  return `${prefix}-${parts.join('/') || 'NA'}`;
}

// ── Per-register PIMS → engine-column adapters ──────────────
// Emitted column names are ones REGISTRY_FIELD_MAP already recognises, so
// the wizard auto-maps them green with zero manual mapping.

interface RegisterSpec {
  table: string;              // DBF filename (without the -ftns- tag)
  label: string;              // human label for the register chooser
  module: ImportTarget;
  order: string[];            // display column order
  toRow: (r: Record<string, string>) => Record<string, string>;
}

const REGISTERS: RegisterSpec[] = [
  {
    table: 'PARBAPT.DBF', label: 'Baptisms', module: 'registry',
    order: ['REGNO', 'CHILDNAME', 'SEX', 'BIRTHDATE', 'DATEBAPT', 'FATHER', 'MOTHER', 'GODFATHER', 'GODMOTHER', 'BOOKNO', 'PAGENO', 'OFFICIANT', 'REMARKS'],
    toRow: (r) => {
      const gp = packedNames(r.SPONSORS);
      return {
        REGNO: regNo('BAP', r),
        CHILDNAME: reorderName(r.NAME), SEX: r.GENDER || '',
        BIRTHDATE: pimsDate(r.BDATE), DATEBAPT: pimsDate(r.DATE),
        FATHER: r.FATHER || '', MOTHER: r.MOTHER || '',
        GODFATHER: gp[0] || '', GODMOTHER: gp[1] || '',
        BOOKNO: r.BOOKNO || '', PAGENO: r.PAGENO || '',
        OFFICIANT: r.MINISTER || '', REMARKS: r.REMARKS || '',
      };
    },
  },
  {
    table: 'PARMARR.DBF', label: 'Marriages', module: 'registry',
    order: ['REGNO', 'GROOMNAME', 'BRIDENAME', 'DATEMARR', 'WITNESS1', 'WITNESS2', 'BOOKNO', 'PAGENO', 'OFFICIANT', 'REMARKS'],
    toRow: (r) => {
      const w = packedNames(r.SPONSORS);
      return {
        REGNO: regNo('MAR', r),
        GROOMNAME: reorderName(r.GNAME), BRIDENAME: reorderName(r.BNAME),
        DATEMARR: pimsDate(r.DATE),
        WITNESS1: w[0] || '', WITNESS2: w[1] || '',
        BOOKNO: r.BOOKNO || '', PAGENO: r.PAGENO || '',
        OFFICIANT: r.MINISTER || '', REMARKS: r.REMARKS || '',
      };
    },
  },
  {
    table: 'PARCONF.DBF', label: 'Confirmations', module: 'registry',
    order: ['REGNO', 'CONFNAME', 'BIRTHDATE', 'CONF_DATE', 'SPONSOR', 'BOOKNO', 'PAGENO', 'OFFICIANT', 'REMARKS'],
    toRow: (r) => ({
      REGNO: regNo('CON', r),
      CONFNAME: reorderName(r.NAME), BIRTHDATE: pimsDate(r.BDATE),
      CONF_DATE: pimsDate(r.DATE), SPONSOR: packedNames(r.SPONSORS)[0] || '',
      BOOKNO: r.BOOKNO || '', PAGENO: r.PAGENO || '',
      OFFICIANT: r.MINISTER || '', REMARKS: r.REMARKS || '',
    }),
  },
  {
    table: 'PARDEAD.DBF', label: 'Deaths / Burials', module: 'registry',
    order: ['REGNO', 'DECEASED', 'SEX', 'DEATHDATE', 'BURIALDATE', 'CEMETERY', 'BOOKNO', 'PAGENO', 'OFFICIANT', 'REMARKS'],
    toRow: (r) => ({
      REGNO: regNo('DTH', r),
      DECEASED: reorderName(r.NAME), SEX: r.GENDER || '',
      DEATHDATE: pimsDate(r.DDATE || r.DATE), BURIALDATE: pimsDate(r.INTDATE),
      CEMETERY: r.INTLOC || '',
      BOOKNO: r.BOOKNO || '', PAGENO: r.PAGENO || '',
      OFFICIANT: r.MINISTER || '', REMARKS: r.CAUSE || r.REMARKS || '',
    }),
  },
];

const ISSUE_NOTES = [
  'Names reordered from "SURNAME, First" to natural order — will split into First/Middle/Last',
  'Dates converted from PIMS YYYYMMDD to ISO format',
  'Sponsors unpacked from the memo field into named sponsors',
  'Soft-deleted rows skipped',
];

function tableToSample(spec: RegisterSpec, dbf: DbfTable, fileName: string): SampleLegacyFile {
  const rows = dbf.rows.map(spec.toRow);
  const columns = spec.order.map((name) => ({
    name,
    sample: rows.find((r) => r[name])?.[name] ?? '',
  }));
  return {
    name: `${fileName} · ${spec.label}`,
    type: 'dbf',
    targetModule: spec.module,
    recordCount: rows.length,
    columns,
    rows,
    issues: ISSUE_NOTES,
  };
}

// ── Public entry points used by the Import Wizard ───────────

/** Parse a full .PAR backup into one wizard-ready sample per populated register. */
export async function parseParArchiveToSamples(buf: ArrayBuffer, fileName: string): Promise<SampleLegacyFile[]> {
  const files = await parsePar(buf);
  const byName = new Map(files.map((f) => [f.name.toUpperCase(), f]));
  const out: SampleLegacyFile[] = [];
  for (const spec of REGISTERS) {
    const dbfFile = byName.get(spec.table);
    if (!dbfFile) continue;
    const fpt = byName.get(spec.table.replace(/\.DBF$/i, '.FPT'));
    const table = parseDbf(dbfFile.bytes, fpt?.bytes);
    if (table.rows.length === 0) continue; // skip empty register shells
    out.push(tableToSample(spec, table, fileName));
  }
  return out;
}

/** Parse a lone .DBF (no memo sibling available) into a single wizard sample.
 *  Detects the register from the filename; unknown tables fall back to baptism. */
export function parseDbfToSample(dbf: Uint8Array, fileName: string): SampleLegacyFile {
  const upper = fileName.toUpperCase();
  const spec = REGISTERS.find((s) => upper.includes(s.table.replace(/\.DBF$/i, ''))) ?? REGISTERS[0];
  return tableToSample(spec, parseDbf(dbf), fileName);
}
