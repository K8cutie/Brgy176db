import { describe, it, expect } from 'vitest';
import {
  cellText,
  filterRows,
  paginateRows,
  pageItems,
  PAGE_SIZE_OPTIONS,
  type SearchableColumn,
} from './tablePaging';

interface Row {
  id: number;
  first: string;
  last: string;
  status: string;
  age: number;
  [key: string]: unknown;
}

// Fake rows are generated here only — never committed into app seed data.
function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    first: `First${i}`,
    last: `Last${i % 100}`,
    status: i % 2 === 0 ? 'Active' : 'Cancelled',
    age: i % 90,
  }));
}

const columns: SearchableColumn<Row>[] = [
  // Composed render-only column (the on-screen text has no matching row key) —
  // regression guard for the render-column search fix.
  { key: 'name', render: (r) => `${r.first} ${r.last}` },
  // JSX-like render (non-string) must fall back to row[key].
  { key: 'status', render: (r) => ({ badge: r.status }) },
  // Explicit searchValue wins.
  { key: 'age', searchValue: (r) => r.age },
];

describe('cellText', () => {
  const row = makeRows(1)[0];

  it('uses searchValue when provided', () => {
    expect(cellText({ key: 'age', searchValue: (r: Row) => r.age }, row)).toBe(0);
  });

  it('uses render output when it is a string', () => {
    expect(cellText({ key: 'name', render: (r: Row) => `${r.first} ${r.last}` }, row)).toBe('First0 Last0');
  });

  it('falls back to row[key] when render returns non-text (JSX)', () => {
    expect(cellText({ key: 'status', render: (r: Row) => ({ badge: r.status }) }, row)).toBe('Active');
  });

  it('falls back to row[key] when render throws', () => {
    expect(cellText({ key: 'first', render: () => { throw new Error('boom'); } }, row)).toBe('First0');
  });
});

describe('filterRows', () => {
  const rows = makeRows(2000);

  it('returns the same array identity for an empty query', () => {
    expect(filterRows(rows, columns, '')).toBe(rows);
  });

  it('matches text produced by render-only columns (case-insensitive)', () => {
    const hits = filterRows(rows, columns, 'first123 last23');
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe(123);
  });

  it('matches values behind JSX renders via the row key fallback', () => {
    expect(filterRows(rows, columns, 'cancelled')).toHaveLength(1000);
  });

  it('matches via searchValue', () => {
    const one = [{ id: 1, first: 'A', last: 'B', status: 'Active', age: 47 }] as Row[];
    expect(filterRows(one, [{ key: 'age', searchValue: (r) => r.age }], '47')).toHaveLength(1);
    expect(filterRows(one, [{ key: 'age', searchValue: (r) => r.age }], '48')).toHaveLength(0);
  });
});

describe('paginateRows', () => {
  const rows = makeRows(2000);

  it('keeps the render input O(page) for every page-size option at 2000 rows', () => {
    for (const size of PAGE_SIZE_OPTIONS) {
      const { pageRows, totalPages } = paginateRows(rows, 3, size);
      expect(pageRows).toHaveLength(size); // never the full 2000
      expect(totalPages).toBe(Math.ceil(2000 / size));
    }
  });

  it('filter-then-paginate: page slice stays bounded after filtering', () => {
    const filtered = filterRows(rows, columns, 'active');
    expect(filtered).toHaveLength(1000);
    const page = paginateRows(filtered, 2, 50);
    expect(page.pageRows).toHaveLength(50);
    expect(page.start).toBe(50);
    expect(page.end).toBe(100);
    expect(page.pageRows[0]).toBe(filtered[50]);
  });

  it('reports Showing X–Y bounds for a partial last page', () => {
    const { pageRows, safePage, start, end, totalPages } = paginateRows(makeRows(120), 3, 50);
    expect(totalPages).toBe(3);
    expect(safePage).toBe(3);
    expect(start).toBe(100);
    expect(end).toBe(120);
    expect(pageRows).toHaveLength(20);
  });

  it('clamps out-of-range pages instead of rendering an empty page', () => {
    expect(paginateRows(rows, 999, 50).safePage).toBe(40);
    expect(paginateRows(rows, 0, 50).safePage).toBe(1);
    expect(paginateRows(rows, -5, 50).safePage).toBe(1);
    expect(paginateRows(rows, 999, 50).pageRows).toHaveLength(50);
  });

  it('handles an empty result set', () => {
    const empty = paginateRows([], 1, 50);
    expect(empty.totalPages).toBe(1);
    expect(empty.safePage).toBe(1);
    expect(empty.pageRows).toHaveLength(0);
    expect(empty.start).toBe(0);
    expect(empty.end).toBe(0);
  });
});

describe('pageItems', () => {
  it('lists every page when there are few', () => {
    expect(pageItems(5, 3)).toEqual([1, 2, 3, 4, 5]);
    expect(pageItems(7, 1)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('windows around the current page with ellipses', () => {
    expect(pageItems(20, 10)).toEqual([1, '…', 9, 10, 11, '…', 20]);
    expect(pageItems(20, 1)).toEqual([1, 2, '…', 20]);
    expect(pageItems(20, 20)).toEqual([1, '…', 19, 20]);
  });

  it('never hides a single page behind an ellipsis', () => {
    // gap of exactly one page renders the page itself, not '…'
    expect(pageItems(20, 4)).toEqual([1, 2, 3, 4, 5, '…', 20]);
    expect(pageItems(20, 17)).toEqual([1, '…', 16, 17, 18, 19, 20]);
  });
});
