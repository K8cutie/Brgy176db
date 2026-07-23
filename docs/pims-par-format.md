# PIMS `.PAR` backup format — reverse-engineered spec

PIMS (Parish Information Management System) is the legacy Visual FoxPro desktop
app most Philippine parishes' records are trapped in. Its daily backups
(`MON.PAR` … `SUN.PAR`) are the migration source ChurchOS imports from.

This spec was cracked and **verified byte-for-byte against a real parish backup**
(a genuine PIMS-authored `TUE.PAR`). The reader lives in
[`src/lib/pimsPar.ts`](../src/lib/pimsPar.ts); regression coverage (synthetic
fixture, no personal data) is in `src/lib/pimsPar.test.ts`.

## TL;DR

A `.PAR` is a **custom archive of Visual FoxPro tables** — plain **zlib** per
file, each preceded by a tiny ASCII header. Everything ChurchOS needs is in the
`.DBF` (table) + `.FPT` (memo) pairs; the `.CDX` indexes are derivable and
ignored. No decryption, no proprietary lock — the data was always liberatable.

## Container

```
Archive := FileEntry*
FileEntry := "DG2" <compSize: 6 ASCII, right-justified> <zlib stream>
```

Each zlib stream inflates to:

```
[GlobalHeader — 20 bytes, FIRST entry only]   "V706Z" + counts
FileName    56 bytes ASCII, left-justified    e.g. "-ftns-PARBAPT.DBF"
Timestamp   16 bytes  "YYYYMMDDHH:MM:SS"       (file mtime)
FileSize    12 bytes ASCII, right-justified
FileBytes   <FileSize> bytes                   raw DBF / FPT / CDX
```

The `-ftns-` filename prefix is the source-folder tag; names after it are 8.3 DOS.

## DBF (`0x30` = Visual FoxPro)

- Header: record count `u32 LE` @4, header size `u16 LE` @8, record size `u16 LE` @10.
- 32-byte field descriptors from offset 32, terminated by `0x0D`: name (11, NUL-padded),
  type @11 (`C`/`N`/`D`/`M`/`L`), length @16.
- Records begin at `headerSize`. Byte 0 of each record is the delete flag:
  `*` (`0x2A`) = soft-deleted → **skip on import**.
- `D` dates are `YYYYMMDD` text (8 spaces = empty). `M` memo fields hold a
  **4-byte LE block index** into the sibling `.FPT`.
- Text is CP1252/ASCII. `NAME` is stored `"SURNAME, FIRST MIDDLE"` in one field.

## FPT (memo)

- Header: block size `u16 BE` @6 (64 in observed data).
- Memo record at `blockIndex * blockSize`: type `u32 BE`, length `u32 BE`, then `length` bytes.
- Multi-value memos (e.g. `SPONSORS`) pack rows as **tab-separated columns,
  CRLF-separated rows**: `"SALLY PINEDA\tMANILA\tCATHOLIC\r\nCARLOS VALERIO\tQC\tCATHOLIC"`.

## Tables (17) & registers imported

Each register is a `NAME.DBF` / `.FPT` / `.CDX` trio. ChurchOS's importer maps
these four registry tables into the sacramental registry via the existing Import
Wizard (see `pimsPar.ts` → `REGISTERS`):

| PIMS table | ChurchOS register | Key PIMS fields |
|---|---|---|
| `PARBAPT` | Baptisms | NAME, DATE, BDATE, FATHER, MOTHER, SPONSORS(memo), MINISTER, BOOKNO/PAGENO/LINENO |
| `PARMARR` | Marriages | GNAME, BNAME, DATE, SPONSORS(memo→witnesses), MINISTER |
| `PARCONF` | Confirmations | NAME, DATE, BDATE, SPONSORS(memo), MINISTER |
| `PARDEAD` | Deaths / Burials | NAME, DDATE, INTDATE, INTLOC(memo), MINISTER |

Other tables (`PARCOMM`, `PARCONV`, `PARBLESS`, `PARSICK`, `PARMASS`, `PARMEM`,
the `*C` certificate logs, `EVFORMS`) are present but not yet wired to a ChurchOS
module. **Note:** this backup is the *sacramental* database — the parish
**financial** ledger the diocese budget-hearing audit runs on is a separate PIMS
database/file, not this `.PAR`.

## Import notes

1. Natural key = `(register, BOOKNO, PAGENO, LINENO)` — the same citation used on
   paper certificates. The importer emits it as `REGNO` (`BAP-book/page/line`) so
   the wizard's duplicate detection is idempotent on re-import.
2. `NAME` is reordered `"SURNAME, First"` → `"First Middle Surname"` before the
   engine's name splitter runs; parent/witness fields are already natural order.
3. `YYYYMMDD` → ISO `YYYY-MM-DD`; `SPONSORS` memo exploded into named sponsors.
4. A `.PAR` is a full snapshot — take the newest file per weekday and upsert by key.
