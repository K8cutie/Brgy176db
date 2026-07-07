// Pure filter/pagination helpers behind DataTable. Kept UI-free so they can be
// unit-tested against large datasets: with pagination the render input is
// always at most one page of rows, no matter how many records a parish has.

export interface SearchableColumn<T> {
  key: string;
  render?: (row: T) => unknown;
  searchValue?: (row: T) => string | number | null | undefined;
}

export const PAGE_SIZE_OPTIONS = [25, 50, 100];

// The text used to search/sort a cell: explicit searchValue, else the render
// output when it's a string/number (so composed columns like `${first} ${last}`
// are matchable), else the raw key value. JSX-returning renders (e.g. a status
// badge) fall back to row[key], which holds the value in those cases.
// `any` (not unknown): interfaces without index signatures (e.g. Family) only
// satisfy Record<string, any> — same constraint DataTable itself uses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function cellText<T extends Record<string, any>>(col: SearchableColumn<T>, row: T): unknown {
  if (col.searchValue) return col.searchValue(row);
  if (col.render) {
    try {
      const out = col.render(row);
      if (typeof out === 'string' || typeof out === 'number') return out;
    } catch {
      /* fall through to key value */
    }
  }
  return row[col.key];
}

// Search the text the user actually SEES (see cellText) — render columns must
// stay matchable; skipping them previously made name/parents/date columns
// return "0 records" for on-screen text.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function filterRows<T extends Record<string, any>>(
  data: T[],
  columns: SearchableColumn<T>[],
  query: string
): T[] {
  if (!query) return data;
  const q = query.toLowerCase();
  return data.filter((row) =>
    columns.some((col) => {
      const val = cellText(col, row);
      return val != null && String(val).toLowerCase().includes(q);
    })
  );
}

export interface PageSlice<T> {
  pageRows: T[];
  totalPages: number;
  safePage: number;
  /** 0-based index of the first row on the page. */
  start: number;
  /** 1-based index of the last row on the page (equals start + pageRows.length). */
  end: number;
}

export function paginateRows<T>(rows: T[], page: number, pageSize: number): PageSlice<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * size;
  const pageRows = rows.slice(start, start + size);
  return { pageRows, totalPages, safePage, start, end: start + pageRows.length };
}

// Compact pager model: first/last page always shown, a window around the
// current page, '…' for gaps (a gap of exactly one page is shown as the page
// itself — "1 … 3" would hide page 2 for no space gain).
export function pageItems(totalPages: number, current: number): (number | '…')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const wanted = [1, current - 1, current, current + 1, totalPages]
    .filter((p) => p >= 1 && p <= totalPages);
  const sorted = Array.from(new Set(wanted)).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev === 2) out.push(prev + 1);
    else if (prev && p - prev > 2) out.push('…');
    out.push(p);
    prev = p;
  }
  return out;
}
