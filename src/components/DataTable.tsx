import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import {
  cellText,
  filterRows,
  paginateRows,
  pageItems,
  PAGE_SIZE_OPTIONS,
} from '@/lib/tablePaging';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  /**
   * Value used for search/sort when the visible cell comes from `render`
   * (whose JSX can't be matched as text). Defaults to `row[key]`. Provide this
   * for computed columns (e.g. a "Head of Family" derived from a members array)
   * so the column is actually searchable instead of silently ignored.
   */
  searchValue?: (row: T) => string | number | null | undefined;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  sortable?: boolean;
  filterable?: boolean;
  /** Pagination is on by default; pass false for small always-visible tables. */
  paginated?: boolean;
  /** Initial rows per page — the user can change it via the footer selector. */
  pageSize?: number;
  actionsColumn?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  sortable = true,
  filterable = true,
  paginated = true,
  pageSize = 50,
  actionsColumn,
  onRowClick,
  loading = false,
  emptyMessage = 'No records found',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(pageSize);

  // Callers pass memoized arrays, so a new `data` identity means the upstream
  // filters really changed → jump back to page 1 (adjusted during render, per
  // the React "storing information from previous renders" pattern).
  const [prevData, setPrevData] = useState(data);
  if (prevData !== data) {
    setPrevData(data);
    setCurrentPage(1);
  }

  const filteredData = useMemo(
    () => filterRows(data, columns, searchQuery),
    [data, searchQuery, columns]
  );

  const sortedData = useMemo(() => {
    if (!sortable || !sortKey) return filteredData;
    const col = columns.find((c) => c.key === sortKey);
    return [...filteredData].sort((a, b) => {
      // Prefer the raw key value (sorts ISO dates / numbers correctly); fall back
      // to the rendered text so computed columns (e.g. a composed name) sort too
      // instead of being a no-op.
      const aVal = a[sortKey] ?? (col ? cellText(col, a) : undefined);
      const bVal = b[sortKey] ?? (col ? cellText(col, b) : undefined);
      if (aVal == null || bVal == null) return 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir, sortable, columns]);

  const { pageRows, totalPages, safePage, start, end } = useMemo(
    () => paginateRows(sortedData, currentPage, rowsPerPage),
    [sortedData, currentPage, rowsPerPage]
  );
  const paginatedData = paginated ? pageRows : sortedData;

  // Offer the standard sizes plus the caller's initial size when it's custom
  // (e.g. a table pinned to 8 rows still gets a sensible selector).
  const sizeOptions = useMemo(
    () => Array.from(new Set([...PAGE_SIZE_OPTIONS, pageSize])).sort((a, b) => a - b),
    [pageSize]
  );

  const handleSort = (key: string) => {
    if (!sortable) return;
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  if (loading) {
    return (
      <div className="cos-card p-0 overflow-hidden">
        <div className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton-shimmer h-4 w-full rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="cos-card p-0 overflow-hidden">
      {/* Toolbar */}
      {filterable && (
        <div className="flex items-center justify-between px-5 py-3 border-b border-parchment/40 dark:border-dm-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-warm-gray" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="h-8 w-48 pl-9 pr-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text"
            />
          </div>
          <span className="text-xs text-warm-gray dark:text-dm-text-muted">
            {sortedData.length} record{sortedData.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={sortable && col.sortable !== false ? 'cursor-pointer select-none hover:text-charcoal' : ''}
                  style={{ width: col.width }}
                  onClick={() => handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.header}
                    {sortable && col.sortable !== false && (
                      <span className="inline-flex flex-col">
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ChevronUp className="w-3 h-3 text-gold" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-gold" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-warm-gray/50" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {actionsColumn && <th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (actionsColumn ? 1 : 0)}
                  className="text-center py-12"
                >
                  <p className="text-warm-gray dark:text-dm-text-muted">{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, i) => (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  // Cap the stagger so a 100-row page doesn't fade in for 3s.
                  transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.03 }}
                  className={onRowClick ? 'cursor-pointer' : ''}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key}>
                      {col.render ? col.render(row) : String(row[col.key] ?? '')}
                    </td>
                  ))}
                  {actionsColumn && (
                    <td onClick={(e) => e.stopPropagation()}>
                      {actionsColumn(row)}
                    </td>
                  )}
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {paginated && sortedData.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-parchment/40 dark:border-dm-border">
          <span className="text-sm text-warm-gray dark:text-dm-text-muted">
            Showing {start + 1}–{end} of {sortedData.length}
          </span>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Previous page"
              className="p-1.5 rounded-lg text-warm-gray hover:bg-cream-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all dark:text-dm-text-muted dark:hover:bg-dm-surface-raised"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {pageItems(totalPages, safePage).map((item, idx) =>
              item === '…' ? (
                <span key={`gap-${idx}`} className="px-1 text-sm text-warm-gray dark:text-dm-text-muted">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  onClick={() => setCurrentPage(item)}
                  aria-current={item === safePage ? 'page' : undefined}
                  className={`min-w-[32px] h-8 px-1.5 rounded-lg text-sm transition-all ${
                    item === safePage
                      ? 'bg-gold text-white font-semibold'
                      : 'text-warm-gray hover:bg-cream-dark dark:text-dm-text-muted dark:hover:bg-dm-surface-raised'
                  }`}
                >
                  {item}
                </button>
              )
            )}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              aria-label="Next page"
              className="p-1.5 rounded-lg text-warm-gray hover:bg-cream-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all dark:text-dm-text-muted dark:hover:bg-dm-surface-raised"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <select
            value={rowsPerPage}
            onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            aria-label="Rows per page"
            className="h-8 rounded-lg border border-parchment bg-cream px-2 text-sm text-warm-gray focus:outline-none focus:border-gold cursor-pointer dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text-muted"
          >
            {sizeOptions.map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
