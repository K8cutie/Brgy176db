import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Smartphone, MessageCircle, Calendar, Check, ChevronDown, Share2, Printer, User } from 'lucide-react';
import { generatePriestIcs, generateTextSummary, downloadIcs } from '@/lib/icsGenerator';
import { getPriestName, getParishName } from '@/lib/parishConfig';
import { getActiveClergy, clergyFullName } from '@/lib/clergy';
import type { CalendarEvent } from '@/lib/calendarData';

interface PriestScheduleExportProps {
  // Live parish events from the calendar's persisted store — the generator
  // never reads them from bare localStorage keys.
  events: CalendarEvent[];
  onClose: () => void;
}

export default function PriestScheduleExport({ events, onClose }: PriestScheduleExportProps) {
  const parishName = getParishName();

  /* ── Clergy roster + selected priest ── */
  // The secretary picks WHICH priest to build a schedule for. Options come from
  // the managed clergy list; default to the one matching the configured parish
  // priest, otherwise the first active clergy member.
  const clergy = useMemo(() => getActiveClergy(), []);
  const clergyOptions = useMemo(() => clergy.map((c) => clergyFullName(c)), [clergy]);
  const [selectedPriest, setSelectedPriest] = useState<string>(() => {
    const configured = getPriestName();
    const names = clergy.map((c) => clergyFullName(c));
    if (configured && names.includes(configured)) return configured;
    return names[0] || configured;
  });

  /* ── Options ── */
  const [days, setDays] = useState(30);
  const [includeMass, setIncludeMass] = useState(true);
  const [includeSacraments, setIncludeSacraments] = useState(true);
  const [includeEvents, setIncludeEvents] = useState(true);

  /* ── Generated content ── */
  const [icsContent, setIcsContent] = useState('');
  const [textSummary, setTextSummary] = useState('');
  const [eventCount, setEventCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState('');
  const [activeTab, setActiveTab] = useState<'download' | 'text' | 'share'>('download');

  // Web Share API is only available on secure contexts (mostly mobile). On
  // desktop it's typically absent, so we disable Share and hint at Download.
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  /* ── Regenerate on option / priest change ── */
  const regenerate = useCallback(() => {
    const opts = { days, includeMass, includeSacraments, includeEvents, priestName: selectedPriest };
    const data = { events };
    const ics = generatePriestIcs(opts, data);
    const text = generateTextSummary(opts, data);
    setIcsContent(ics);
    setTextSummary(text);

    // Count events
    const count = (ics.match(/BEGIN:VEVENT/g) || []).length;
    setEventCount(count);
  }, [days, includeMass, includeSacraments, includeEvents, events, selectedPriest]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  /* ── Copy text summary ── */
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(textSummary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = textSummary;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  /* ── Handle .ics download ── */
  const handleDownload = () => {
    downloadIcs(icsContent);
  };

  /* ── Slugify a name for filenames (e.g. 'Fr. Antonio Reyes' → 'fr-antonio-reyes'). ── */
  const slugify = (s: string) =>
    (s || 'schedule')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'schedule';

  /* ── Share via the Web Share API (WhatsApp / email / etc.) ── */
  const handleShare = async () => {
    setShareError('');
    const title = `${selectedPriest} — ${parishName} schedule`;
    const text = `Schedule for ${selectedPriest} at ${parishName}`;
    const fileName = `${slugify(parishName)}-${slugify(selectedPriest)}-schedule.ics`;
    try {
      const file = new File([icsContent], fileName, { type: 'text/calendar' });
      // Prefer sharing the actual .ics file so the recipient can import it.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title, text });
        return;
      }
      // Fall back to sharing the text summary if files aren't shareable.
      await navigator.share({ title, text: textSummary });
    } catch (err) {
      // AbortError = the user dismissed the share sheet; not a real error.
      if (err instanceof Error && err.name === 'AbortError') return;
      setShareError('Sharing was not available. Use Download or Copy Text instead.');
    }
  };

  /* ── Print a clean schedule (print-only block below + window.print) ── */
  const handlePrint = () => {
    window.print();
  };

  /* ── Days options ── */
  const dayOptions = [
    { value: 7, label: 'This week' },
    { value: 14, label: 'Next 2 weeks' },
    { value: 30, label: 'This month' },
    { value: 60, label: 'Next 2 months' },
    { value: 90, label: 'Next 3 months' },
  ];

  const dateRangeLabel = dayOptions.find((o) => o.value === days)?.label ?? `Next ${days} days`;

  return (
    <>
      {/* Scoped print rules: on screen the print block is hidden and the modal
          shows; when printing, everything is hidden except the clean schedule. */}
      <style>{`
        .priest-schedule-print { display: none; }
        @media print {
          body { visibility: hidden !important; }
          .priest-schedule-modal { display: none !important; }
          .priest-schedule-print {
            display: block !important;
            visibility: visible !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 24px;
            color: #000;
            background: #fff;
            font-family: Georgia, 'Times New Roman', serif;
          }
          .priest-schedule-print * { visibility: visible !important; }
          .priest-schedule-print h1 { font-size: 22px; font-weight: 700; margin: 0 0 2px; }
          .priest-schedule-print h2 { font-size: 15px; font-weight: 600; margin: 0 0 4px; color: #333; }
          .priest-schedule-print .print-range { font-size: 12px; color: #555; margin: 0 0 16px; border-bottom: 1px solid #999; padding-bottom: 8px; }
          .priest-schedule-print .print-body { font-family: inherit; font-size: 13px; line-height: 1.6; white-space: pre-wrap; margin: 0; }
        }
      `}</style>

      {/* Print-only schedule — hidden on screen, the only thing that prints. */}
      <div className="priest-schedule-print">
        <h1>{selectedPriest}</h1>
        <h2>{parishName}</h2>
        <p className="print-range">{dateRangeLabel} · {eventCount} events</p>
        <pre className="print-body">{textSummary}</pre>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="priest-schedule-modal fixed inset-0 z-overlay modal-overlay flex items-start justify-center p-4 pt-10 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] as [number, number, number, number] }}
          className="bg-white dark:bg-dm-surface rounded-xl shadow-modal w-full max-w-[520px] overflow-hidden my-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-parchment dark:border-dm-border">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-deep-navy flex items-center justify-center">
                <Smartphone className="w-4 h-4 text-white" />
              </div>
              <div>
                <h2 className="heading-lg text-charcoal dark:text-dm-text">Sync to Phone</h2>
                <p className="body-xs text-warm-gray dark:text-dm-text-muted">
                  {selectedPriest} — {eventCount} upcoming events
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-warm-gray hover:text-charcoal hover:bg-cream-dark transition-all dark:text-dm-text-muted dark:hover:text-dm-text"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Options */}
          <div className="px-6 py-4 bg-cream-dark/40 dark:bg-dm-surface-raised/40 border-b border-parchment dark:border-dm-border">
            {/* Priest picker */}
            <div className="mb-3">
              <label className="label block text-warm-gray mb-1.5">Priest</label>
              <div className="relative">
                <User className="w-4 h-4 text-warm-gray absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  value={selectedPriest}
                  onChange={(e) => setSelectedPriest(e.target.value)}
                  className="h-9 w-full pl-8 pr-8 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
                >
                  {clergyOptions.length === 0 && <option value={selectedPriest}>{selectedPriest}</option>}
                  {clergyOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-warm-gray absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Date range */}
            <div className="mb-3">
              <label className="label block text-warm-gray mb-1.5">Date range</label>
              <div className="relative">
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="h-9 w-full px-3 pr-8 rounded-md border border-parchment bg-white text-sm text-charcoal focus:outline-none focus:border-gold dark:bg-dm-surface-raised dark:border-dm-border dark:text-dm-text appearance-none"
                >
                  {dayOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-warm-gray absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Event type toggles */}
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMass}
                  onChange={(e) => setIncludeMass(e.target.checked)}
                  className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
                />
                <span className="body-sm text-charcoal dark:text-dm-text">Mass schedule</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSacraments}
                  onChange={(e) => setIncludeSacraments(e.target.checked)}
                  className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
                />
                <span className="body-sm text-charcoal dark:text-dm-text">Sacraments</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeEvents}
                  onChange={(e) => setIncludeEvents(e.target.checked)}
                  className="w-4 h-4 rounded border-parchment text-gold focus:ring-gold"
                />
                <span className="body-sm text-charcoal dark:text-dm-text">Parish events</span>
              </label>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex border-b border-parchment dark:border-dm-border">
            {[
              { key: 'download' as const, icon: Download, label: 'Download File' },
              { key: 'text' as const, icon: MessageCircle, label: 'Copy Text' },
              { key: 'share' as const, icon: Share2, label: 'Share / Print' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 body-sm font-medium transition-colors relative ${
                  activeTab === tab.key
                    ? 'text-deep-navy dark:text-gold'
                    : 'text-warm-gray hover:text-charcoal dark:text-dm-text-muted dark:hover:text-dm-text'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.key && (
                  <motion.div
                    layoutId="exportTab"
                    className="absolute bottom-0 left-4 right-4 h-0.5 bg-gold rounded-full"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="px-6 py-5 min-h-[340px]">
            <AnimatePresence>
              {/* DOWNLOAD TAB */}
              {activeTab === 'download' && (
                <motion.div
                  key="download"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-forest-green/10 flex items-center justify-center mb-4">
                    <Calendar className="w-8 h-8 text-forest-green" />
                  </div>
                  <h3 className="heading-md text-charcoal dark:text-dm-text">Download Calendar File</h3>
                  <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-2 max-w-[360px]">
                    Downloads a <strong>.ics</strong> file for {selectedPriest} that opens in Apple Calendar, Google Calendar, Outlook, or any calendar app on your phone or computer.
                  </p>

                  <div className="mt-4 p-3 bg-cream-dark/40 dark:bg-dm-surface-raised/40 rounded-lg text-left w-full max-w-[360px]">
                    <p className="body-xs text-warm-gray dark:text-dm-text-muted font-medium mb-1">File includes:</p>
                    <ul className="body-xs text-charcoal dark:text-dm-text space-y-0.5">
                      {includeMass && <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-forest-green" /> Regular Mass schedule</li>}
                      {includeSacraments && <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-forest-green" /> Sacrament ceremonies</li>}
                      {includeEvents && <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-forest-green" /> Parish events</li>}
                      <li className="flex items-center gap-1.5"><Check className="w-3 h-3 text-forest-green" /> {eventCount} total events</li>
                    </ul>
                  </div>

                  <button
                    onClick={handleDownload}
                    className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 bg-deep-navy text-white rounded-lg hover:bg-deep-navy/90 transition-colors body-sm font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Download .ics File
                  </button>

                  <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-3">
                    After downloading, open the file to automatically import into your calendar app.
                  </p>
                </motion.div>
              )}

              {/* TEXT TAB */}
              {activeTab === 'text' && (
                <motion.div
                  key="text"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col"
                >
                  <p className="body-sm text-warm-gray dark:text-dm-text-muted mb-3 text-center">
                    Copy and paste this into WhatsApp, Messenger, or SMS to share {selectedPriest}'s schedule.
                  </p>

                  <div className="bg-cream-dark/50 dark:bg-dm-surface-raised/50 rounded-lg p-4 max-h-[240px] overflow-y-auto">
                    <pre className="body-xs text-charcoal dark:text-dm-text whitespace-pre-wrap font-mono leading-relaxed">
                      {textSummary}
                    </pre>
                  </div>

                  <button
                    onClick={handleCopyText}
                    className={`mt-4 self-center inline-flex items-center gap-2 px-5 py-2.5 rounded-lg transition-colors body-sm font-medium ${
                      copied
                        ? 'bg-forest-green text-white'
                        : 'bg-gold text-charcoal hover:bg-gold/90'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <MessageCircle className="w-4 h-4" />
                        Copy for WhatsApp
                      </>
                    )}
                  </button>
                </motion.div>
              )}

              {/* SHARE / PRINT TAB */}
              {activeTab === 'share' && (
                <motion.div
                  key="share"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="w-16 h-16 rounded-2xl bg-deep-navy/10 flex items-center justify-center mb-4">
                    <Share2 className="w-8 h-8 text-deep-navy dark:text-gold" />
                  </div>
                  <h3 className="heading-md text-charcoal dark:text-dm-text">Send or Print</h3>
                  <p className="body-sm text-warm-gray dark:text-dm-text-muted mt-2 max-w-[360px]">
                    Share {selectedPriest}'s schedule straight to WhatsApp or email, or print a clean copy for the parish office.
                  </p>

                  <div className="mt-5 flex flex-col gap-3 w-full max-w-[300px]">
                    <button
                      onClick={handleShare}
                      disabled={!canShare}
                      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg transition-colors body-sm font-medium ${
                        canShare
                          ? 'bg-deep-navy text-white hover:bg-deep-navy/90'
                          : 'bg-cream-dark/60 dark:bg-dm-surface-raised/60 text-warm-gray cursor-not-allowed'
                      }`}
                    >
                      <Share2 className="w-4 h-4" />
                      Share via WhatsApp / Email
                    </button>

                    <button
                      onClick={handlePrint}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gold text-charcoal rounded-lg hover:bg-gold/90 transition-colors body-sm font-medium"
                    >
                      <Printer className="w-4 h-4" />
                      Print Schedule
                    </button>
                  </div>

                  {!canShare && (
                    <p className="body-xs text-warm-gray dark:text-dm-text-muted mt-4 max-w-[340px]">
                      Sharing is available on phones and tablets. On a computer, use <strong>Download File</strong> to save the schedule, then attach it in WhatsApp or email.
                    </p>
                  )}
                  {shareError && (
                    <p className="body-xs text-error mt-4 max-w-[340px]">{shareError}</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer hint */}
          <div className="px-6 py-3 bg-cream-dark/30 dark:bg-dm-surface-raised/30 border-t border-parchment dark:border-dm-border">
            <p className="body-xs text-warm-gray dark:text-dm-text-muted text-center">
              This schedule is generated from {parishName} records and includes all events assigned to {selectedPriest}.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
