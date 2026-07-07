import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ScrollText, Plus, Printer, Download, CalendarClock,
  CheckCircle2, XCircle, HandCoins, X,
} from 'lucide-react';
import { toast } from 'sonner';
import DataTable from '@/components/DataTable';
import type { Column } from '@/components/DataTable';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import {
  addIntentionFromRequest, getIntentions, scheduleIntention,
  markIntentionOffered, cancelIntention, recordStipendForIntention,
  getUpcomingMasses, to12h,
} from '@/lib/massIntentions';
import type { MassIntention, MassIntentionStatus, UpcomingMass } from '@/lib/massIntentions';
import { formatPeso } from '@/lib/financeData';
import { getParishConfig, getPriestName } from '@/lib/parishConfig';

// ============================================
// Presentation helpers
// ============================================
const STATUS_STYLES: Record<MassIntentionStatus, { label: string; className: string }> = {
  requested: { label: 'Requested', className: 'bg-warning/15 text-[#9A7B3D]' },
  scheduled: { label: 'Scheduled', className: 'bg-[rgba(59,107,201,0.12)] text-[#3B6BC9]' },
  offered:   { label: 'Offered',   className: 'bg-success/10 text-success' },
  cancelled: { label: 'Cancelled', className: 'bg-cream-dark text-warm-gray' },
};

function fmtDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function massLabel(row: MassIntention): string {
  if (!row.massDate) return '';
  return `${fmtDate(row.massDate)}${row.massTime ? ` ${to12h(row.massTime)}` : ''}`;
}

// CSV helpers (same approach as FinancePage's local ones — not exported there).
function escapeCsv(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const lines = [headers, ...rows].map((r) => r.map(escapeCsv).join(','));
  // BOM so Excel opens UTF-8 (₱, accented names) correctly.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Register rows → export/print cells (shared by CSV and the printed book).
const REGISTER_HEADERS = ['Date Received', 'Intention', 'Requested By', 'Stipend', 'Mass Date & Time', 'Celebrant', 'Date Offered', 'Status'];

function registerRow(i: MassIntention): (string | number)[] {
  return [
    i.dateRequested,
    i.intention,
    i.requestedBy ?? '',
    i.stipend ? i.stipend : '',
    massLabel(i),
    i.celebrant ?? '',
    i.dateOffered ?? '',
    STATUS_STYLES[i.status]?.label ?? i.status,
  ];
}

// ============================================
// Schedule-a-Mass modal
// ============================================
function ScheduleModal({
  intention,
  onClose,
  onScheduled,
}: {
  intention: MassIntention;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const masses = useMemo(() => getUpcomingMasses(30), []);
  // Preselect the first Mass on the donor's preferred date, if one exists.
  const preferred = useMemo(
    () => masses.find((m) => m.date === intention.preferredDate) ?? null,
    [masses, intention.preferredDate],
  );
  const keyOf = (m: UpcomingMass) => `${m.date}T${m.time}`;
  const [selKey, setSelKey] = useState<string | null>(preferred ? keyOf(preferred) : null);
  const [manualDate, setManualDate] = useState('');
  const [manualTime, setManualTime] = useState('');
  const [celebrant, setCelebrant] = useState(preferred?.celebrant ?? getPriestName());

  const pick = (m: UpcomingMass) => {
    setSelKey(keyOf(m));
    setManualDate('');
    setManualTime('');
    setCelebrant(m.celebrant ?? getPriestName());
  };

  const handleConfirm = () => {
    const selected = selKey ? masses.find((m) => keyOf(m) === selKey) : undefined;
    const date = selected?.date ?? manualDate;
    const time = selected?.time ?? manualTime;
    if (!date || !time) {
      toast.error('Pick a Mass from the list, or enter a date and time');
      return;
    }
    const updated = scheduleIntention(intention.id, {
      date,
      time,
      celebrant: celebrant.trim() || undefined,
      calendarEventId: selected?.calendarEventId,
    });
    if (!updated) {
      toast.error('Could not schedule — check the date and try again');
      return;
    }
    toast.success(`Scheduled for the ${to12h(updated.massTime || '')} Mass on ${fmtDate(updated.massDate)}`);
    onScheduled();
    onClose();
  };

  const inputCls = 'w-full h-9 px-3 rounded-lg border border-parchment bg-cream text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text';

  return (
    <div className="fixed inset-0 z-overlay modal-overlay flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
          <div>
            <h2 className="heading-md text-charcoal dark:text-dm-text">Schedule a Mass</h2>
            <p className="text-xs text-warm-gray dark:text-dm-text-muted mt-0.5 max-w-sm truncate">
              {intention.intention}
              {intention.preferredDate ? ` — preferred ${fmtDate(intention.preferredDate)}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text dark:hover:bg-dm-surface-raised">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-4 overflow-y-auto space-y-4">
          <div>
            <span className="label text-warm-gray">Upcoming Masses (next 30 days)</span>
            <div className="mt-2 border border-parchment dark:border-dm-border rounded-lg divide-y divide-parchment/60 dark:divide-dm-border max-h-56 overflow-y-auto">
              {masses.length === 0 && (
                <p className="p-4 text-sm text-warm-gray dark:text-dm-text-muted">No upcoming Masses found — enter a date and time below.</p>
              )}
              {masses.map((m) => {
                const active = selKey === keyOf(m);
                return (
                  <button
                    key={keyOf(m)}
                    onClick={() => pick(m)}
                    className={'w-full flex items-center justify-between px-4 py-2.5 text-left text-sm transition-colors ' +
                      (active ? 'bg-[rgba(201,150,59,0.12)] text-charcoal dark:text-dm-text' : 'text-charcoal hover:bg-cream dark:text-dm-text dark:hover:bg-dm-surface-raised')}
                  >
                    <span>
                      <span className="font-medium">{fmtDate(m.date)}</span>
                      <span className="text-warm-gray dark:text-dm-text-muted"> — {to12h(m.time)} · {m.title}</span>
                    </span>
                    <span className="text-xs text-warm-gray dark:text-dm-text-muted">{m.celebrant ?? ''}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="label text-warm-gray">Or enter manually</span>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <input
                type="date"
                value={manualDate}
                onChange={(e) => { setManualDate(e.target.value); setSelKey(null); }}
                className={inputCls}
                aria-label="Mass date"
              />
              <input
                type="time"
                value={manualTime}
                onChange={(e) => { setManualTime(e.target.value); setSelKey(null); }}
                className={inputCls}
                aria-label="Mass time"
              />
            </div>
          </div>

          <div>
            <span className="label text-warm-gray">Celebrant</span>
            <input
              type="text"
              value={celebrant}
              onChange={(e) => setCelebrant(e.target.value)}
              className={inputCls + ' mt-2'}
              placeholder="e.g. Fr. Reyes"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-parchment dark:border-dm-border">
          <button onClick={onClose} className="cos-btn cos-btn-secondary text-sm">Cancel</button>
          <button onClick={handleConfirm} className="cos-btn cos-btn-primary text-sm">
            <CalendarClock className="w-4 h-4" /> Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Page
// ============================================
export default function IntentionsPage() {
  // The register lives behind the massIntentions lib (the same code path the
  // portal intake uses), so page state is a mirror refreshed after each
  // mutation rather than a second writer to the store.
  const [intentions, setIntentions] = useState<MassIntention[]>(() => getIntentions());
  const refresh = () => setIntentions(getIntentions());

  // Quick-add form
  const [intentionText, setIntentionText] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [stipend, setStipend] = useState('');
  const [preferredDate, setPreferredDate] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  // Modals
  const [schedulingFor, setSchedulingFor] = useState<MassIntention | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MassIntention | null>(null);

  // The month an entry belongs to in the book: its Mass month once scheduled,
  // else the month it was received.
  const monthOf = (i: MassIntention) => (i.massDate ?? i.dateRequested).slice(0, 7);

  const months = useMemo(
    () => Array.from(new Set(intentions.map(monthOf))).sort((a, b) => b.localeCompare(a)),
    [intentions],
  );

  const filtered = useMemo(
    () => intentions.filter((i) =>
      (!statusFilter || i.status === statusFilter) &&
      (!monthFilter || monthOf(i) === monthFilter)),
    [intentions, statusFilter, monthFilter],
  );

  const handleQuickAdd = () => {
    if (!intentionText.trim()) {
      toast.error('Enter the intention text');
      return;
    }
    const stipendNum = parseFloat(stipend);
    addIntentionFromRequest({
      intention: intentionText,
      requestedBy: requestedBy || undefined,
      preferredDate: preferredDate || undefined,
      stipend: Number.isFinite(stipendNum) ? stipendNum : undefined,
      source: 'office',
    });
    setIntentionText('');
    setRequestedBy('');
    setStipend('');
    setPreferredDate('');
    refresh();
    toast.success('Intention entered in the register');
  };

  const handleMarkOffered = (row: MassIntention) => {
    if (markIntentionOffered(row.id)) {
      refresh();
      toast.success('Marked as offered');
    }
  };

  const handleRecordStipend = (row: MassIntention) => {
    const result = recordStipendForIntention(row.id);
    refresh();
    if (result.status === 'recorded') {
      toast.success(`Stipend ${formatPeso(result.entry.totalDr)} posted to the ledger (Dr Cash / Cr Donations)`);
    } else if (result.status === 'already_recorded') {
      toast.info('This stipend has already been recorded');
    } else if (result.status === 'no_stipend') {
      toast.error('No stipend amount on this intention');
    } else {
      toast.error('Intention not found — refresh and try again');
    }
  };

  const handleCancel = () => {
    if (cancelTarget && cancelIntention(cancelTarget.id)) {
      refresh();
      toast.success('Intention cancelled');
    }
    setCancelTarget(null);
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      toast.error('No intentions to export');
      return;
    }
    downloadCsv(
      `mass-intentions-${new Date().toISOString().split('T')[0]}.csv`,
      REGISTER_HEADERS,
      filtered.map(registerRow),
    );
    toast.success(`Exported ${filtered.length} intention${filtered.length === 1 ? '' : 's'} to CSV`);
  };

  // Printable register — canonical-book table, same pattern as RegistryPage's
  // print list (new window + print CSS).
  const handlePrint = () => {
    if (filtered.length === 0) {
      toast.error('No intentions to print');
      return;
    }
    const esc = (s: string | number) => String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Unable to open print window — please allow pop-ups');
      return;
    }
    const parish = getParishConfig();
    const rows = filtered.map(registerRow);
    win.document.write(`
      <html><head><title>Mass Intention Register</title>
      <style>
        body{font-family:Georgia,serif;margin:32px;color:#3D3A36;}
        h1{font-size:20px;margin:0 0 2px;}
        h2{font-size:14px;font-weight:normal;margin:0 0 4px;color:#5B5649;}
        .meta{font-size:12px;color:#8C8374;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;font-size:12px;}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top;}
        th{background:#F2EFE8;}
        @media print{body{margin:12mm;}}
      </style></head>
      <body>
        <h1>${esc(parish.parishName)}</h1>
        <h2>Mass Intention Register (Canon 958)</h2>
        <div class="meta">${rows.length} intention${rows.length === 1 ? '' : 's'} — printed ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
        <table>
          <thead><tr>${REGISTER_HEADERS.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rows.map((r) => `<tr>${r.map((c, ci) => `<td>${ci === 3 && c !== '' ? '&#8369;' + esc(Number(c).toLocaleString('en-PH')) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  };

  const iconBtn = 'p-1.5 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed';

  const columns: Column<MassIntention>[] = [
    {
      key: 'dateRequested',
      header: 'Received',
      width: '110px',
      render: (r) => fmtDate(r.dateRequested),
    },
    {
      key: 'intention',
      header: 'Intention',
      render: (r) => (
        <span className="block max-w-[260px] truncate" title={r.intention}>{r.intention}</span>
      ),
      searchValue: (r) => r.intention,
    },
    { key: 'requestedBy', header: 'Requested By' },
    {
      key: 'stipend',
      header: 'Stipend',
      width: '110px',
      render: (r) => r.stipend
        ? (
          <span className={r.stipendRecorded ? 'text-success' : ''} title={r.stipendRecorded ? 'Posted to the ledger' : 'Not yet recorded in Finance'}>
            {formatPeso(r.stipend)}
          </span>
        )
        : <span className="text-warm-gray">—</span>,
      searchValue: (r) => r.stipend,
    },
    {
      key: 'massDate',
      header: 'Mass',
      width: '160px',
      render: (r) => massLabel(r) || <span className="text-warm-gray">—</span>,
      searchValue: (r) => massLabel(r),
    },
    { key: 'celebrant', header: 'Celebrant', width: '120px' },
    {
      key: 'dateOffered',
      header: 'Offered',
      width: '110px',
      render: (r) => r.dateOffered ? fmtDate(r.dateOffered) : <span className="text-warm-gray">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (r) => {
        const s = STATUS_STYLES[r.status] ?? STATUS_STYLES.requested;
        return <span className={'px-2 py-0.5 rounded-full text-[11px] font-semibold ' + s.className}>{s.label}</span>;
      },
      searchValue: (r) => r.status,
    },
  ];

  const selectCls = 'h-9 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold cursor-pointer dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text';
  const inputCls = 'h-9 px-3 rounded-lg border border-parchment bg-white text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] }}
      className="space-y-6"
    >
      {/* ── Page Header ─────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <ScrollText className="w-7 h-7 text-gold" />
          <h1 className="display-md text-charcoal dark:text-dm-text font-playfair">Mass Intentions</h1>
        </div>
        <p className="body-md text-warm-gray dark:text-dm-text-muted max-w-2xl">
          The parish register of Mass intentions (Canon 958): every intention received, its stipend,
          and the Mass at which it was offered.
        </p>
        <div className="mt-3 h-[3px] w-24 bg-gold rounded-full" />
      </div>

      {/* ── Quick add ───────────────────────────────── */}
      <div className="cos-card">
        <h2 className="heading-md text-charcoal dark:text-dm-text mb-4">Enter an intention</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <span className="label text-warm-gray">Intention</span>
            <input
              type="text"
              value={intentionText}
              onChange={(e) => setIntentionText(e.target.value)}
              placeholder="e.g. For the repose of the soul of…"
              className={inputCls + ' w-full mt-1.5'}
            />
          </div>
          <div className="w-44">
            <span className="label text-warm-gray">Requested by</span>
            <input
              type="text"
              value={requestedBy}
              onChange={(e) => setRequestedBy(e.target.value)}
              placeholder="Name"
              className={inputCls + ' w-full mt-1.5'}
            />
          </div>
          <div className="w-32">
            <span className="label text-warm-gray">Stipend (₱)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={stipend}
              onChange={(e) => setStipend(e.target.value)}
              placeholder="0.00"
              className={inputCls + ' w-full mt-1.5'}
            />
          </div>
          <div className="w-40">
            <span className="label text-warm-gray">Preferred date</span>
            <input
              type="date"
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className={inputCls + ' w-full mt-1.5'}
            />
          </div>
          <button onClick={handleQuickAdd} className="cos-btn cos-btn-primary text-sm h-9">
            <Plus className="w-4 h-4" /> Add to register
          </button>
        </div>
      </div>

      {/* ── Toolbar: filters + export ───────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls} aria-label="Filter by status">
            <option value="">All statuses</option>
            {(Object.keys(STATUS_STYLES) as MassIntentionStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_STYLES[s].label}</option>
            ))}
          </select>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={selectCls} aria-label="Filter by month">
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {new Date(m + '-01T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'long' })}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePrint} className="cos-btn cos-btn-secondary text-sm">
            <Printer className="w-4 h-4" /> Print register
          </button>
          <button onClick={handleExportCsv} className="cos-btn cos-btn-secondary text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* ── The register ────────────────────────────── */}
      <DataTable
        columns={columns}
        data={filtered}
        emptyMessage="No Mass intentions in the register yet"
        actionsColumn={(row) => (
          <div className="flex items-center gap-0.5">
            {(row.status === 'requested' || row.status === 'scheduled') && (
              <button
                onClick={() => setSchedulingFor(row)}
                title={row.status === 'scheduled' ? 'Reschedule' : 'Schedule a Mass'}
                className={iconBtn + ' text-[#3B6BC9] hover:bg-[rgba(59,107,201,0.12)]'}
              >
                <CalendarClock className="w-4 h-4" />
              </button>
            )}
            {(row.status === 'requested' || row.status === 'scheduled') && (
              <button
                onClick={() => handleMarkOffered(row)}
                title="Mark offered"
                className={iconBtn + ' text-success hover:bg-success/10'}
              >
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
            {!!row.stipend && (
              <button
                onClick={() => handleRecordStipend(row)}
                disabled={!!row.stipendRecorded}
                title={row.stipendRecorded ? 'Stipend already recorded' : 'Record stipend in Finance'}
                className={iconBtn + ' text-gold hover:bg-[rgba(201,150,59,0.12)]'}
              >
                <HandCoins className="w-4 h-4" />
              </button>
            )}
            {(row.status === 'requested' || row.status === 'scheduled') && (
              <button
                onClick={() => setCancelTarget(row)}
                title="Cancel intention"
                className={iconBtn + ' text-error hover:bg-error/10'}
              >
                <XCircle className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      />

      {/* ── Modals ──────────────────────────────────── */}
      {schedulingFor && (
        <ScheduleModal
          intention={schedulingFor}
          onClose={() => setSchedulingFor(null)}
          onScheduled={refresh}
        />
      )}
      <ConfirmationDialog
        isOpen={cancelTarget !== null}
        title="Cancel this intention?"
        message={cancelTarget ? `"${cancelTarget.intention}" will be marked cancelled in the register. The entry itself is kept — the register is a permanent book.` : ''}
        confirmLabel="Cancel intention"
        cancelLabel="Keep"
        onConfirm={handleCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </motion.div>
  );
}
