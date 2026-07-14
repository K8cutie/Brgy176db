// @vitest-environment node
// Regression coverage for the PIMS .PAR / .DBF native reader.
//
// The binary format was cracked + verified against a REAL parish backup
// (an actual PIMS-authored TUE.PAR). This test builds a synthetic .PAR from
// scratch — real zlib blocks, a real Visual-FoxPro DBF header + records, and
// a real FPT memo — so the parse → adapt pipeline (reorder name, ISO dates,
// explode sponsors memo, skip soft-deleted rows) is guarded without committing
// anyone's personal sacramental data to the repo.
//
// Uses only web-standard APIs (Uint8Array / DataView / CompressionStream) so it
// lives in the same type universe as pimsPar.ts — no Node type dependency.

import { describe, it, expect } from 'vitest';
import { parsePar, parseDbf, parseParArchiveToSamples } from './pimsPar';

// ── byte helpers (web APIs only) ────────────────────────────
const enc = new TextEncoder();

function ascii(u8: Uint8Array, off: number, s: string): void {
  const b = enc.encode(s);
  for (let i = 0; i < b.length && off + i < u8.length; i++) u8[off + i] = b[i];
}
/** Write `s` right-justified within a `width`-byte field starting at `off`. */
function asciiRight(u8: Uint8Array, off: number, width: number, s: string): void {
  ascii(u8, off + Math.max(0, width - s.length), s);
}
function concat(arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
function filled(len: number, byte = 0x20): Uint8Array {
  return new Uint8Array(len).fill(byte);
}
async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate'); // zlib-wrapped, matches the reader
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// ── Synthetic FoxPro DBF + FPT + .PAR builders ──────────────

interface FieldDef { name: string; type: string; len: number; }

const BAPT_FIELDS: FieldDef[] = [
  { name: 'BOOKNO', type: 'N', len: 5 },
  { name: 'PAGENO', type: 'N', len: 5 },
  { name: 'LINENO', type: 'N', len: 5 },
  { name: 'NAME', type: 'C', len: 30 },
  { name: 'GENDER', type: 'C', len: 1 },
  { name: 'DATE', type: 'D', len: 8 },
  { name: 'BDATE', type: 'D', len: 8 },
  { name: 'MINISTER', type: 'C', len: 30 },
  { name: 'FATHER', type: 'C', len: 30 },
  { name: 'MOTHER', type: 'C', len: 30 },
  { name: 'SPONSORS', type: 'M', len: 4 }, // 4-byte LE block ptr into the FPT
];

interface Rec { deleted?: boolean; values: Record<string, string>; memo?: Record<string, number>; }

function buildDbf(fields: FieldDef[], records: Rec[]): Uint8Array {
  const recSize = 1 + fields.reduce((n, f) => n + f.len, 0);
  const headerSize = 32 + 32 * fields.length + 1;
  const header = new Uint8Array(headerSize);
  header[0] = 0x30; // Visual FoxPro
  const hv = new DataView(header.buffer);
  hv.setUint32(4, records.length, true);
  hv.setUint16(8, headerSize, true);
  hv.setUint16(10, recSize, true);
  fields.forEach((f, i) => {
    const o = 32 + i * 32;
    ascii(header, o, f.name);
    ascii(header, o + 11, f.type);
    header[o + 16] = f.len;
  });
  header[32 + 32 * fields.length] = 0x0d; // field-descriptor terminator

  const body = records.map((rec) => {
    const buf = filled(recSize);
    buf[0] = rec.deleted ? 0x2a : 0x20;
    const bv = new DataView(buf.buffer);
    let off = 1;
    for (const f of fields) {
      if (f.type === 'M') bv.setUint32(off, rec.memo?.[f.name] ?? 0, true);
      else ascii(buf, off, (rec.values[f.name] ?? '').slice(0, f.len));
      off += f.len;
    }
    return buf;
  });
  return concat([header, ...body, new Uint8Array([0x1a])]);
}

// FPT: 64-byte header (block size @6 BE); memo at block N (type+len BE, then text).
function buildFpt(memosByBlock: Record<number, string>): Uint8Array {
  const blockSize = 64;
  const blocks = Object.keys(memosByBlock).map(Number);
  const maxBlock = blocks.length ? Math.max(...blocks) : 0;
  const head = new Uint8Array(blockSize);
  const hv = new DataView(head.buffer);
  hv.setUint32(0, maxBlock + 1, false);
  hv.setUint16(6, blockSize, false);
  const parts: Uint8Array[] = [head];
  for (let b = 1; b <= maxBlock; b++) {
    const text = memosByBlock[b];
    if (text == null) { parts.push(new Uint8Array(blockSize)); continue; }
    const data = enc.encode(text);
    const rec = new Uint8Array(Math.ceil((8 + data.length) / blockSize) * blockSize);
    const rv = new DataView(rec.buffer);
    rv.setUint32(0, 1, false);           // type = text
    rv.setUint32(4, data.length, false); // length
    rec.set(data, 8);
    parts.push(rec);
  }
  return concat(parts);
}

async function parBlock(name: string, bytes: Uint8Array, withGlobalHeader: boolean): Promise<Uint8Array> {
  const global = withGlobalHeader ? filled(20) : new Uint8Array(0);
  if (withGlobalHeader) ascii(global, 0, 'V706Z');
  const fn = filled(56); ascii(fn, 0, '-ftns-' + name);
  const ts = filled(16); ascii(ts, 0, '2026010100:00:00');
  const sz = filled(12); asciiRight(sz, 0, 12, String(bytes.length));
  const comp = await deflate(concat([global, fn, ts, sz, bytes]));
  const dg = filled(9); ascii(dg, 0, 'DG2'); asciiRight(dg, 3, 6, String(comp.length));
  return concat([dg, comp]);
}

async function buildSyntheticPar(): Promise<ArrayBuffer> {
  const sponsorMemo = 'GODFATHER NAME\tPASIG\tCATHOLIC\r\nGODMOTHER NAME\tQC\tCATHOLIC';
  const dbf = buildDbf(BAPT_FIELDS, [
    {
      values: {
        BOOKNO: '2', PAGENO: '5', LINENO: '3',
        NAME: 'DELA CRUZ, JUAN PABLO', GENDER: 'M',
        DATE: '20200215', BDATE: '20191120',
        MINISTER: 'FR. TEST', FATHER: 'PEDRO DELA CRUZ', MOTHER: 'MARIA SANTOS',
      },
      memo: { SPONSORS: 1 },
    },
    { deleted: true, values: { NAME: 'DELETED, ROW', BOOKNO: '9', PAGENO: '9', LINENO: '9' } },
  ]);
  const fpt = buildFpt({ 1: sponsorMemo });
  const par = concat([
    await parBlock('PARBAPT.DBF', dbf, true),
    await parBlock('PARBAPT.FPT', fpt, false),
  ]);
  return new Uint8Array(par).buffer; // fresh ArrayBuffer-backed copy
}

// ── Tests ───────────────────────────────────────────────────

describe('PIMS .PAR native reader', () => {
  it('unpacks the container into its inner FoxPro files', async () => {
    const files = await parsePar(await buildSyntheticPar());
    expect(files.map((f) => f.name).sort()).toEqual(['PARBAPT.DBF', 'PARBAPT.FPT']);
  });

  it('parses DBF records and resolves FPT memos, skipping soft-deleted rows', async () => {
    const files = await parsePar(await buildSyntheticPar());
    const dbf = files.find((f) => f.name === 'PARBAPT.DBF')!;
    const fpt = files.find((f) => f.name === 'PARBAPT.FPT')!;
    const table = parseDbf(dbf.bytes, fpt.bytes);
    expect(table.rows).toHaveLength(1); // the deleted row is skipped
    expect(table.rows[0].NAME).toBe('DELA CRUZ, JUAN PABLO');
    expect(table.rows[0].SPONSORS).toContain('GODFATHER NAME');
    expect(table.rows[0].SPONSORS).toContain('GODMOTHER NAME');
  });

  it('adapts a baptism register into an engine-ready sample', async () => {
    const samples = await parseParArchiveToSamples(await buildSyntheticPar(), 'TEST.PAR');
    expect(samples).toHaveLength(1);
    const s = samples[0];
    expect(s.name).toContain('Baptisms');
    expect(s.recordCount).toBe(1);
    const row = s.rows[0];
    expect(row.CHILDNAME).toBe('JUAN PABLO DELA CRUZ'); // reordered from "SURNAME, First"
    expect(row.DATEBAPT).toBe('2020-02-15');            // YYYYMMDD → ISO
    expect(row.BIRTHDATE).toBe('2019-11-20');
    expect(row.GODFATHER).toBe('GODFATHER NAME');        // exploded from the memo
    expect(row.GODMOTHER).toBe('GODMOTHER NAME');
    expect(row.OFFICIANT).toBe('FR. TEST');
    expect(row.REGNO).toBe('BAP-2/5/3');                 // natural key from book/page/line
  });
});
