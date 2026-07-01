import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  MoreHorizontal,
  ArrowUpDown,
} from 'lucide-react';

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
  paginated?: boolean;
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
  pageSize = 10,
  actionsColumn,
  onRowClick,
  loading = false,
  emptyMessage = 'No records found',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = useMemo(() => {
    if (!searchQuery) return data;
    const q = searchQuery.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        // A render column's JSX can't be matched as text, so search its
        // underlying key value (or an explicit searchValue accessor). Previously
        // render columns were skipped entirely, making name/status/date columns
        // silently unsearchable — searches returned "0 records" for on-screen text.
        const val = col.searchValue ? col.searchValue(row) : row[col.key];
        return val != null && String(val).toLowerCase().includes(q);
      })
    );
  }, [data, searchQuery, columns]);

  const sortedData = useMemo(() => {
    if (!sortable || !sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null || bVal == null) return 0;
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortKey, sortDir, sortable]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedData = paginated
    ? sortedData.slice((safePage - 1) * pageSize, safePage * pageSize)
    : sortedData;

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
                  transition={{ duration: 0.2, delay: i * 0.03 }}
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

      {/* Pagination */}
      {paginated && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-parchment/40 dark:border-dm-border">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-warm-gray hover:bg-cream-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all dark:text-dm-text-muted dark:hover:bg-dm-surface-raised"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <span className="text-sm text-warm-gray dark:text-dm-text-muted">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-warm-gray hover:bg-cream-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all dark:text-dm-text-muted dark:hover:bg-dm-surface-raised"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
